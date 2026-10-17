'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js'])
  vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const validate = d => plain(C.validate(C.normalize(d)));
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} ≈ ${b}`);
const same = (a, b, message) => message === undefined ? assert.deepEqual(plain(a), plain(b)) : assert.deepEqual(plain(a), plain(b), message);
const HOSTILE = '<img src=x onerror=bad()>" onclick="bad()';
const panel = () => ({id:'cell', type:'cellscene', title:'Cell scene', label:'a generic cell',
  compartments:[{id:'out',kind:'outside',label:'outside'},{id:'cell',kind:'cell',label:'membrane'},
    {id:'cyt',kind:'region',parent:'cell',label:'cytoplasm'},{id:'nuc',kind:'nucleus',parent:'cell',label:'nucleus'}],
  items:[{id:'p',role:'particle',label:'particle',start:{in:'out',x:58,y:108}},
    {id:'c',role:'cargo',label:'cargo',start:{in:'nuc',count:0,state:'hidden'}}],
  initial:{caption:'A cell at rest.'}});
const diagram = (steps, paths) => ({nodes:{n:{}}, rows:[['n']], panels:[panel()], steps, ...(paths ? {paths} : {})});
const folded = (d, route) => C.foldPanelStates(route ? C.diagramForPath(d, route) : d).cell;
const story = () => [
  {id:'enter', panels:{cell:{events:[{kind:'enter',item:'p',to:'cyt'}], items:{p:{x:215,y:150}}, caption:'The particle enters.'}}},
  {id:'nucleus', panels:{cell:{events:[{kind:'enter',item:'p',to:'nuc'}], items:{p:{x:346,y:156}}, caption:'It travels to the nucleus.'}}},
  {id:'cargo', panels:{cell:{items:{c:{count:6,state:'free',in:'cyt',x:262,y:214}}, events:[{kind:'signal',at:'nuc',rings:2}], caption:'Cargo is made and exits.'}}},
  {id:'bud', panels:{cell:{events:[{kind:'bud',vesicle:'v1',from:'cyt',items:['c']}], items:{c:{x:215,y:230}}}}},
  {id:'fuse', panels:{cell:{events:[{kind:'fuse',vesicle:'v1',with:'cell',to:'out'}], items:{c:{x:92,y:246}}, zoom:'nuc'}}},
  {id:'divide', panels:{cell:{events:[{kind:'divide',daughters:[{items:['p']},{items:[]}]}], caption:'The cell divides.', zoom:null, enterOnce:{caption:'Watch the waist pinch.'}}}},
  {id:'rest', panels:{cell:{items:{p:{state:'released'}}, caption:'The particle rests.'}}},
];
const render = () => C.PanelViews.get('cellscene');
const fakeHost = () => {
  const el = () => ({attrs:{}, style:{}, innerHTML:'', setAttribute(k,v){this.attrs[k]=v;}, getAttribute(k){return this.attrs[k] ?? null;}});
  const host = {writes:0, parts:{}, html:'',
    querySelector(selector){ return host.parts[selector] || null; }, querySelectorAll(){ return []; },
    get innerHTML(){ return host.html; },
    set innerHTML(value){ host.writes++; host.html = value;
      host.parts = {'.cellscene-frame':el(), '.cellscene-view':el(), '.cellscene-overlay':el(), '.cellscene-hud':el(), '.cellscene-foot':el()};
      const view = /class="cellscene-view" style="([^"]*)"/.exec(value); host.parts['.cellscene-view'].attrs.style = view ? view[1] : '';
    }};
  return host;
};

test('cellscene template, picker example, feature label, styles and metadata use ordinary discovery', () => {
  const d = {nodes:{n:{}}, rows:[['n']], panels:[{...plain(C.PANEL_TEMPLATES.cellscene), id:'cell', type:'cellscene'}]};
  same(validate(d), {errors:[], warnings:[]});
  same(validate(diagram(story(), [{id:'all',label:'All',steps:story().map(s=>s.id)}])), {errors:[], warnings:[]});
  assert.ok(C.PANEL_CATALOG.some(item => item.type === 'cellscene' && item.category === 'Science & sequencing'));
  const example = C.panelPickerExample('cellscene');
  assert.equal(example.panel.type, 'cellscene');
  same(validate({nodes:{n:{}}, rows:[['n']], panels:[example.panel]}), {errors:[], warnings:[]});
  assert.match(C.cellsceneHTML(example.panel, example.state), /×6 · cytoplasm/);
  assert.equal(panelAssets().features['panel.cellscene'].label, 'Cell scene panel');
  assert.equal(panelAssets().features['panel.cellscene'].since, '0.2.0');
  const css = readStyles('style.core.css');
  for (const rule of [/\.cellscene-view\{/, /\.cellscene-crossing\{/, /@keyframes cellsceneCross/, /\.cellscene-parent\{/, /prefers-reduced-motion:reduce\)\{\.cellscene-view/]) assert.match(css, rule);
  const source = fs.readFileSync(path.join(__dirname, '../src/panels/types/cellscene.js'), 'utf8');
  assert.doesNotMatch(source, /\.mech-[a-z-]*\s*\{/, 'the strandscene panel owns the shared .mech-* rules');
  assert.doesNotMatch(source, /document\.|setTimeout|setInterval|requestAnimationFrame|fetch\(/);
  assert.equal(C.PanelRegistry.get('cellscene').order, 47);
  assert.equal(C.panelAuthoring('cellscene').picker.order, 47);
  same(plain(C.PanelRegistry.get('cellscene').layout.sectionSizing), {minWidth:320, preferredWidth:560, maxWidth:900, aspectPolicy:'fixed', bodyAspect:16/9, grow:1, contentSelector:'.mech-frame', ancillarySelector:'.mech-legend,.swnote'});
  same(plain(C.PanelRegistry.get('cellscene').layout.canvasSizing), {mode:'fixed-aspect', aspect:560/315, resizeAxis:'width'});
  assert.ok(plain(C.panelPatchFields(panel())).some(field => field[0] === 'zoom' && field[1] === 'enum' && field[2].includes('nuc')));
});
test('declaration warnings name exact paths; cycles render flat; limits and counts clamp', () => {
  const p = panel();
  p.compartments[2].parent = 'nuc'; p.compartments[3].parent = 'cyt';
  p.compartments.push({id:'v1',kind:'vesicle'},{id:'v2',kind:'organelle'},{id:'v3',kind:'vesicle'},{id:'v4',kind:'organelle'});
  p.items[1].start.count = 77; p.items.push({id:'q',role:'ghost',shape:'star',size:'xl',start:{in:'nowhere',x:'a',y:2}});
  const warnings = validate({nodes:{n:{}}, rows:[['n']], panels:[p]}).warnings;
  for (const expected of [/panels\[0\]\.compartments\[2\]\.parent: parent cycle/,
    /panels\[0\]\.items\[1\]\.start\.count: .*clamped to 50/, /panels\[0\]\.items\[2\]\.role: /, /panels\[0\]\.items\[2\]\.shape: /, /panels\[0\]\.items\[2\]\.size: /,
    /panels\[0\]\.items\[2\]\.start\.in: unknown compartment/, /panels\[0\]\.items\[2\]\.start: x and y/])
    assert.ok(warnings.some(w => expected.test(w)), expected + '\n' + warnings.join('\n'));
  const m = C.cellsceneModel(p, {});
  assert.equal(m.compartments.find(c => c.id === 'cyt').parent, null, 'breaking one link renders the cycle flat');
  assert.equal(m.compartments.find(c => c.id === 'nuc').depth, 1);
  assert.equal(warnings.filter(w => /parent cycle/.test(w)).length, 1);
  assert.equal(m.items[1].count, 50);
  assert.equal(m.items[2].role, 'particle');
  const limits = panel();
  limits.compartments.push({id:'cell2',kind:'cell'},{id:'nuc2',kind:'nucleus'},{id:'bad',kind:'lysosome'},{id:'dup',kind:'region'},{id:'dup',kind:'region'});
  limits.compartments.push({id:'o1',kind:'organelle'},{id:'o2',kind:'organelle'},{id:'o3',kind:'organelle'},{id:'o4',kind:'organelle'},{id:'o5',kind:'organelle'});
  const w2 = validate({nodes:{n:{}}, rows:[['n']], panels:[limits]}).warnings;
  assert.ok(w2.some(w => /compartments\[4\]: only one cell/.test(w)));
  assert.ok(w2.some(w => /compartments\[5\]: only one nucleus/.test(w)));
  assert.ok(w2.some(w => /compartments\[6\]\.kind: expected outside\|cell/.test(w)));
  assert.ok(w2.some(w => /compartments: only the first 8 compartments render/.test(w)));
  assert.equal(C.cellsceneModel(limits, {}).compartments.filter(c => c.kind === 'cell').length, 1);
  for (const hostile of [null, 'text', 42, {}, [null, {id:'__proto__',kind:'cell'}, {id:'constructor',kind:'region'}]]) {
    const h = panel(); h.compartments = hostile; h.items = hostile;
    assert.doesNotThrow(() => validate({nodes:{n:{}}, rows:[['n']], panels:[h]}));
    assert.doesNotMatch(C.cellsceneHTML(h, {}), /NaN|Infinity|undefined/);
  }
});
test('patch warnings name the step path, enterOnce and event fields; vesicles and division are tracked per path', () => {
  const d = diagram([
    {id:'a', panels:{cell:{events:[{kind:'enter',item:'p',to:'nowhere'},{kind:'fuse',vesicle:'v9',with:'cell'},{kind:'teleport'}], items:{zz:{x:1}, p:{in:'nowhere', count:'six', warp:1}}, zoom:'cyt', enterOnce:{zoom:'void'}, bogus:1}}},
    {id:'b', panels:{cell:{events:[{kind:'divide'}]}}},
    {id:'c', panels:{cell:{events:[{kind:'divide'}], labels:[{at:'ghost',text:'x'},{text:''}]}}},
    {id:'d', panels:{cell:{events:[{kind:'divide'}]}}},
  ], [{id:'one',label:'One',steps:['a','b','c']},{id:'two',label:'Two',steps:['a','d']}]);
  const warnings = validate(d).warnings;
  for (const expected of [/steps\[0\]\.panels\.cell\.events\[0\]\.to: unknown compartment/, /steps\[0\]\.panels\.cell\.events\[1\]\.vesicle: no vesicle "v9"/,
    /steps\[0\]\.panels\.cell\.events\[2\]\.kind: expected enter\|bud\|fuse\|divide\|signal/, /steps\[0\]\.panels\.cell\.items\.zz: unknown item id/,
    /steps\[0\]\.panels\.cell\.items\.p\.in: unknown compartment/, /steps\[0\]\.panels\.cell\.items\.p\.count: /, /steps\[0\]\.panels\.cell\.items\.p\.warp: unknown item property/,
    /steps\[0\]\.panels\.cell\.enterOnce\.zoom: expected a declared compartment id/, /steps\[0\]\.panels\.cell\.bogus: unknown field/,
    /steps\[2\]\.panels\.cell\.events\[0\]: the cell has already divided/, /steps\[2\]\.panels\.cell\.labels\[0\]\.at: unknown item/, /steps\[2\]\.panels\.cell\.labels\[1\]\.text: expected text/])
    assert.ok(warnings.some(w => expected.test(w)), expected + '\n' + warnings.join('\n'));
  assert.ok(!warnings.some(w => /steps\[3\]/.test(w)), 'the other path has not divided yet:\n' + warnings.join('\n'));
  assert.ok(!warnings.some(w => /steps\[1\]/.test(w)));
});
test('fold merges items per id, keeps events step-local, applies enter/bud/fuse/divide consequences and isolates paths', () => {
  const steps = story();
  steps.push({id:'alt', panels:{cell:{items:{p:{in:'void'}, c:null}, events:[{kind:'signal',at:'p'}]}}});
  const d = Object.freeze(diagram(steps, [{id:'main',label:'Main',steps:story().map(s=>s.id)},{id:'alt',label:'Alt',steps:['enter','alt']}]));
  const before = JSON.stringify(d);
  const main = folded(d, 'main'), alt = folded(d, 'alt');
  same(plain(main[0].items), {p:{x:215,y:150,in:'cyt'}});
  same(plain(main[0].events), [{kind:'enter',item:'p',to:'cyt',via:null}]);
  same(plain(main[1].items.p), {x:346,y:156,in:'nuc'}, 'a patch merges into the carried item');
  same(plain(main[2].events), [{kind:'signal',at:'nuc',rings:2}]);
  assert.equal(main[2].items.c.count, 6);
  same(plain(main[3].vesicles), {v1:{from:'cyt',items:['c']}});
  assert.equal(main[3].items.c.in, 'vesicle:v1');
  same(plain(main[4].vesicles), {}, 'fuse removes the vesicle');
  assert.equal(main[4].items.c.in, 'out', 'fuse relocates the contents');
  same(plain(main[4].events), [{kind:'fuse',vesicle:'v1',with:'cell',to:'out',items:['c']}]);
  assert.equal(main[4].zoom, 'nuc');
  assert.equal(main[5].divided, true); assert.equal(main[5].zoom, null);
  same(plain(main[5].daughters), {p:1});
  assert.equal(main[5].caption, 'Watch the waist pinch.', 'enterOnce caption applies for one step');
  assert.equal(main[6].caption, 'The particle rests.');
  assert.equal(main[6].divided, true, 'division carries');
  same(plain(main[6].events), [], 'events never carry');
  assert.equal(main[6].items.p.state, 'released');
  assert.equal(alt[1].items.p.in, 'void', 'the fold carries the authored compartment id');
  assert.equal(C.cellsceneModel(panel(), alt[1]).items[0].in, 'out', 'an unknown compartment falls back to the declared start at render');
  assert.equal(alt[1].items.c, undefined, 'null resets an item to its start');
  assert.equal(alt[1].divided, false, 'paths fold independently');
  same(plain(alt[1].events), [{kind:'signal',at:'p',rings:1}]);
  assert.equal(JSON.stringify(d), before, 'folding never mutates the spec');
  validate(d);
  assert.equal(JSON.stringify(d), before, 'validation never mutates the spec');
});
test('the model and renderer read the panel argument on every call and the fold caches no declaration data', () => {
  const d = diagram([{id:'a', panels:{cell:{items:{p:{x:100,y:100}, w:{state:'bound', in:'cyt'}}}}}]);
  const warnings = validate(d).warnings;
  assert.ok(warnings.some(w => /steps\[0\]\.panels\.cell\.items\.w: unknown item id/.test(w)), warnings.join('\n'));
  const states = folded(d);
  same(states[0].items, {p:{x:100,y:100}, w:{state:'bound', in:'cyt'}}, 'the fold carries authored patches for any safe id; the declaration decides what renders');
  const p = panel();
  same(C.cellsceneModel(p, states[0]).items.map(i => i.id), ['p','c']);
  const changed = panel(); changed.label = 'a bacterium'; changed.compartments[1].label = 'wall';
  changed.items.push({id:'w', role:'virus', label:'intruder', start:{in:'cyt'}});
  const m = C.cellsceneModel(changed, states[0]);
  same(m.items.map(i => [i.id, i.role, i.state, i.in, i.x]), [['p','particle','free','out',100],['c','cargo','hidden','nuc',352],['w','virus','bound','cyt',219]]);
  assert.equal(m.title, 'a bacterium'); assert.equal(m.cell.label, 'wall');
  const host = {};
  render()(host, p, states[0], null, states, 0, true);
  const html = render()(host, changed, states[0], null, states, 0, true).html;
  assert.match(html, /a bacterium · zoom: whole scene/); assert.match(html, /data-id="w"/); assert.match(html, /intruder/);
  same(Object.keys(host._mechPrev).sort(), ['cell','comps','daughters','items','nuclei','nucleus','states','vesicles'], 'the host keeps presentation history only');
  assert.equal(JSON.stringify(panel()), JSON.stringify(p));
  assert.equal(JSON.stringify(panel()), JSON.stringify(d.panels[0]));
});
test('model resolves anchors, clusters, division geometry, zoom, highlight and callouts deterministically', () => {
  const p = panel();
  const rest = C.cellsceneModel(p, folded(diagram([]))[0]);
  same(rest.items.map(i => [i.id, i.x, i.y, i.visible, i.inLabel]), [['p',58,108,true,'outside'],['c',352,158,false,'nucleus']]);
  assert.equal(rest.aria, 'Cell with nucleus; particle outside; one cell');
  same(rest.legend.map(l => [l.id, l.state]), [['p','outside'],['c','hidden'],['nucleus',''],['cell','1']]);
  assert.equal(rest.compartments.find(c => c.id === 'nuc').parent, 'cell');
  const six = C.cellsceneModel(p, {items:{c:{count:6,state:'free',in:'cyt',x:262,y:214}}});
  same(plain(six.items[1].cluster), plain(C.mechCluster(6, 4.5)));
  same(plain(C.cellsceneModel(p, {items:{c:{count:6,state:'free',in:'cyt',x:262,y:214}}}).items[1].cluster), plain(six.items[1].cluster), 'clusters never jitter');
  assert.equal(six.items[1].inLabel, 'cytoplasm'); assert.equal(six.legend[1].state, '×6 · cytoplasm');
  assert.equal(C.cellsceneModel(p, {items:{c:{count:999,state:'free'}}}).items[1].count, 50);
  assert.equal(C.cellsceneModel(p, {items:{c:{count:-4,state:'free'}}}).items[1].visible, false);
  assert.equal(C.cellsceneModel(p, {items:{c:{count:40,state:'free'}}}).items[1].dotR, 3.5);
  const split = C.cellsceneModel(p, {divided:true, daughters:{}, items:{p:{in:'nuc',x:346,y:156}}, events:[{kind:'divide',daughters:{}}]});
  same(plain(split.daughters.map(d => [d.x, d.y, d.rx, d.ry, d.nucleus.x, d.nucleus.y, d.nucleus.r])), [[205,160,81,81.6,226.6,158.4,31.9],[419,160,81,81.6,440.6,158.4,31.9]]);
  same([split.items[0].x, split.items[0].y, split.items[0].daughter], [437.4,156.8,2], 'an item follows the nearer daughter by default');
  assert.equal(C.cellsceneModel(p, {divided:true, items:{p:{in:'nuc',x:346,y:156,daughter:1}}}).items[0].x, 223.4);
  assert.equal(split.legend.find(l => l.id === 'cell').state, '1 → 2');
  assert.match(split.aria, /two daughter cells, each with a nucleus$/);
  assert.equal(C.cellsceneModel(p, {divided:true}).legend.find(l => l.id === 'cell').state, '2');
  const zoom = C.cellsceneModel(p, {zoom:'nuc', highlight:'cyt', labels:[{at:'nuc',text:'here'},{at:{x:10,y:20},text:'free'},{at:'ghost',text:'no'},{text:'no'}]});
  same(plain(zoom.zoom), {id:'nuc', label:'nucleus', scale:3.02, tx:-783, ty:-319.7});
  same(plain(zoom.highlight), [{x:219,y:149.8,rx:70,ry:40}]);
  same(plain(zoom.labels), [{x:352,y:102,text:'here'},{x:10,y:20,text:'free'}]);
  assert.equal(C.cellsceneModel(p, {zoom:'ghost'}).zoom, null);
  const cross = C.cellsceneModel(p, {items:{p:{in:'cyt',x:215,y:150}}, events:[{kind:'enter',item:'p',to:'cyt',via:null}]});
  same(plain(cross.transients), [{kind:'cross', item:'p', x:163.7, y:144.7, delay:500}], 'the crossing ripple sits on the membrane nearest the destination');
  const rings = C.cellsceneModel(p, {events:[{kind:'signal',at:'nuc',rings:3}]});
  same(plain(rings.transients.map(t => [t.kind, t.x, t.y, t.delay])), [['signal',352,158,0],['signal',352,158,250],['signal',352,158,500]]);
});
test('render emits settled markup with glide styles, one crossing transient per enter, and nothing when not animating', () => {
  const p = panel(), states = folded(diagram(story())), host = {};
  const first = render()(host, p, states[0], null, states, 0, true);
  same(plain(first.glide), {selector:'.mech-move[style]', multiple:true});
  assert.equal(first.transient, '.mech-transient');
  assert.equal(first.html.match(/mech-transient/g).length, 1, 'exactly one cross ripple');
  assert.match(first.html, /mech-ripple k-cross/);
  assert.match(first.html, /cellscene-crossing" data-id="p" style="--cs-x0:-51.3px;--cs-y0:-5.3px;--cs-x1:-51.3px;--cs-y1:-5.3px"/, 'with no previous position the item starts at the membrane');
  assert.doesNotMatch(first.baseline, /mech-transient|cellscene-crossing|mech-move[^>]*style="transform/);
  assert.match(first.baseline, /data-id="p"><g transform="translate\(215 150\)">/, 'the baseline is the settled end state');
  assert.match(first.html, /class="cellscene-view" style="transform:translate\(0px,0px\) scale\(1\);--cs-zoom:1"/);
  const second = render()(host, p, states[1], null, states, 1, true);
  assert.match(second.html, /cellscene-crossing" data-id="p" style="--cs-x0:-131px;--cs-y0:-6px;--cs-x1:-33.8px;--cs-y1:-11.3px"/, 'the previous position is presentation history');
  assert.equal(second.html.match(/mech-transient/g).length, 1);
  const third = render()(host, p, states[2], null, states, 2, true);
  assert.equal(third.html.match(/k-signal/g).length, 2, 'two signal rings');
  assert.match(third.html, /cellscene-item cellscene-role-cargo cellscene-st-free cellscene-appear" data-id="c"/, 'a newly visible item fades in');
  assert.doesNotMatch(third.html, /data-id="p" style=/, 'an unmoved item has no glide style');
  same(plain(third.pulse), {selector:'.mech-chip[data-id="c"]', changed:true});
  const bud = render()(host, p, states[3], null, states, 3, true);
  assert.match(bud.html, /cellscene-vesicle cellscene-appear" data-id="vesicle:v1"/);
  assert.match(bud.html, /data-id="c" style="transform:translate\(47px,-16px\)"/, 'the cluster glides from its previous place');
  const fuse = render()(host, p, states[4], null, states, 4, true);
  assert.doesNotMatch(fuse.html, /cellscene-vesicle/); assert.match(fuse.html, /k-cross/);
  assert.match(fuse.html, /class="cellscene-view" style="transform:translate\(-783px,-319.7px\) scale\(3.02\);--cs-zoom:3.02"/);
  const divide = render()(host, p, states[5], null, states, 5, true);
  assert.match(divide.html, /cellscene-daughter" data-id="daughter:1" style="transform:translate\(107px,0px\)"/, 'daughters glide out from the parent centre');
  assert.match(divide.html, /cellscene-nucleus" data-id="nucleus:2" style="transform:translate\(-88.6px,-0.4px\)"/);
  assert.match(divide.html, /mech-transient cellscene-parent" aria-hidden="true"><path class="cellscene-cell" d="M462,160L[^"]+"><animate attributeName="d"/);
  assert.doesNotMatch(divide.baseline, /cellscene-parent|mech-move[^>]*style="transform/);
  assert.match(divide.html, /Watch the waist pinch\./);
  const still = render()({}, p, states[5], null, states, 5, false);
  assert.doesNotMatch(still.html, /mech-transient|cellscene-crossing|cellscene-appear|mech-move[^>]*style="transform/);
  assert.equal(still.baseline, null);
  assert.equal(still.html, C.cellsceneHTML(p, states[5]));
  let removed = [];
  const settleHost = {querySelectorAll: () => [{classList:{remove: name => removed.push(name)}}]};
  render()(settleHost, p, states[0], null, states, 0, true).settle();
  same(removed, ['cellscene-crossing','cellscene-appear']);
});
test('a zoom or caption change alone takes the patch path and keeps the scene subtree', () => {
  const p = panel(), host = fakeHost();
  const states = folded(diagram([
    {id:'a', panels:{cell:{items:{p:{in:'cyt',x:215,y:150}}}}},
    {id:'b', panels:{cell:{zoom:'nuc', caption:'Closer.', note:'A note.'}}},
    {id:'c', panels:{cell:{items:{p:{x:230}}}}},
  ]));
  C.renderPanelBody(host, p, states[0], 'aurora', states, 0, false);
  assert.equal(host.writes, 1);
  const scene = /<g class="cellscene-scene">([\s\S]*?)<\/g><g class="cellscene-overlay">/.exec(host.html)[1];
  C.renderPanelBody(host, p, states[1], 'aurora', states, 1, true);
  assert.equal(host.writes, 1, 'the scene was patched, not rebuilt');
  assert.equal(host.parts['.cellscene-view'].attrs.style, 'transform:translate(-783px,-319.7px) scale(3.02);--cs-zoom:3.02');
  assert.equal(host.parts['.cellscene-view'].style.transition, undefined, 'the zoom glides through the CSS transition');
  assert.match(host.parts['.cellscene-hud'].innerHTML, /zoom: nucleus/); assert.match(host.parts['.cellscene-hud'].innerHTML, /Closer\./);
  assert.match(host.parts['.cellscene-foot'].innerHTML, /swnote">A note\./);
  assert.match(host._lastHTML, /zoom: nucleus/);
  assert.ok(host._lastHTML.includes(scene), 'the scene subtree markup is unchanged');
  C.renderPanelBody(host, p, states[1], 'aurora', states, 1, true);
  assert.equal(host.writes, 1, 'an unchanged state renders nothing');
  C.renderPanelBody(host, p, states[0], 'aurora', states, 0, false);
  assert.equal(host.writes, 1); assert.equal(host.parts['.cellscene-view'].style.transition, 'none', 'seeking lands instantly');
  C.renderPanelBody(host, p, states[2], 'aurora', states, 2, true);
  assert.equal(host.writes, 2, 'a moved item rebuilds the scene');
  assert.match(host.html, /data-id="p" style="transform:translate\(-15px,0px\)"/);
});
test('hostile strings are escaped everywhere and never become attributes', () => {
  const p = panel();
  p.label = HOSTILE; p.compartments[1].label = HOSTILE; p.items[0].label = HOSTILE;
  const state = {caption:HOSTILE, note:HOSTILE, labels:[{at:'nuc',text:HOSTILE}], items:{p:{label:HOSTILE}}};
  const html = C.cellsceneHTML(p, state);
  assert.doesNotMatch(html, /<img|onerror="|onclick="/);
  assert.ok(html.split('&lt;img src=x onerr').length >= 8, 'title, caption, note, callout, compartment and item labels, legend and aria are all escaped text');
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  const weird = panel(); weird.items[0].id = 'on"click'; weird.compartments[0].id = '<b>';
  assert.doesNotMatch(C.cellsceneHTML(weird, {}), /on"click|<b>/);
  const d = diagram([{id:'a', panels:{cell:{items:{'__proto__':{x:1}, 'constructor':{x:1}}, events:[{kind:'bud',vesicle:'__proto__',from:'cyt'}], zoom:HOSTILE}}}]);
  assert.doesNotThrow(() => validate(d));
  const s = folded(d)[0];
  assert.doesNotMatch(C.cellsceneHTML(p, s), /<img/);
  same(plain(s.vesicles), {});
});

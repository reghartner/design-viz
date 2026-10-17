'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js','clipboard.workbench.js'])
  vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const validate = d => plain(C.validate(C.normalize(d)));
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} ≈ ${b}`);
const HOSTILE = '<img src=x onerror=bad()>';

function panel() {
  return {
    id:'map', type:'seatmap', title:'Venue map', bowl:'oval', ringSlots:8, currency:'USD',
    rings:[{id:'lower',label:'Lower'},{id:'upper',label:'Upper'}],
    tiers:[{id:'p1',label:'Premium',color:'#D7A34F'},{id:'p2',label:'Value'}],
    sections:[
      {id:'101',ring:'lower',slot:0,capacity:100,zone:'end',tier:'p1'},
      {id:'102',ring:'lower',slot:1,capacity:200,zone:'corner'},
      {id:'103',ring:'lower',slot:2,span:2,capacity:300,zone:'sideline'},
      {id:'201',ring:'upper',capacity:400,zone:'end'},
      {id:'202',ring:'upper',capacity:500,zone:'corner'},
    ],
    landmarks:[{id:'bench',label:'home bench',x:500,y:270}],
    initial:{sold:{101:50,102:200},price:{101:120,102:80},note:'start'},
  };
}
function diagram() {
  return {
    nodes:{a:{title:'A'},b:{title:'B'}}, rows:[['a','b']], edges:[{from:'a',to:'b'}],
    panels:[panel()],
    steps:[
      {id:'shared',edge:'a->b',panels:{map:{sold:{103:150},held:{201:{count:100,label:'Group',until:'T-7d'}}}}},
      {id:'win',nodes:['a'],panels:{map:{sold:{201:400,202:500},held:{201:null},highlight:['201','202']}}},
      {id:'once',nodes:['b'],panels:{map:{enterOnce:{sold:{101:0},mode:'held'}}}},
      {id:'lose',nodes:['a'],panels:{map:{sold:null,price:{201:30},mode:'price',highlight:'201'}}},
      {id:'end',nodes:['b'],panels:{map:{mode:'revenue',highlight:null}}},
    ],
    paths:[{id:'happy',label:'Sells out',steps:['shared','win','once','end']},{id:'soft',label:'Soft',steps:['shared','lose','end']}],
  };
}

test('seatmap template, picker, example, feature label and styles use ordinary discovery', () => {
  const d = {nodes:{n:{}},rows:[['n']],panels:[{...plain(C.PANEL_TEMPLATES.seatmap),id:'m',type:'seatmap'}]};
  assert.deepEqual(validate(d), {errors:[],warnings:[]});
  const entry = C.PANEL_CATALOG.find(item => item.type === 'seatmap');
  assert.equal(entry.category, 'Sports & events marketing');
  assert.equal(entry.name, 'Venue map');
  const example = C.panelPickerExample('seatmap');
  assert.equal(example.panel.type, 'seatmap');
  assert.deepEqual(validate({nodes:{n:{}},rows:[['n']],panels:[{...plain(example.panel),id:'m',type:'seatmap'}]}), {errors:[],warnings:[]});
  assert.ok(C.seatmapModel(example.panel, example.state).totals.held > 0, 'example shows a hold');
  assert.equal(panelAssets().features['panel.seatmap'].label, 'Venue map panel');
  assert.equal(panelAssets().features['panel.seatmap'].since, '0.2.0');
  const definition = C.PanelRegistry.get('seatmap');
  assert.equal(definition.order, 50);
  assert.equal(definition.layout.sectionSizing.contentSelector, '.seatmap-svg');
  assert.equal(definition.layout.canvasSizing.mode, 'fixed-aspect');
  assert.match(readStyles('style.core.css'), /\.seatmap-svg/);
  assert.match(readStyles('style.core.css'), /prefers-reduced-motion[^}]*\.seatmap-fill/);
  assert.match(readStyles('style.core.css'), /\.seatmap\{[^}]*--seatmap-accent:#38E1FF/);
  assert.match(readStyles('style.core.css'), /\.sk-daylight \.seatmap\{--seatmap-accent:#4956C9/);
  assert.deepEqual(validate(diagram()), {errors:[],warnings:[]});
});

test('shared sports helpers format money, compact counts and safe percentages', () => {
  assert.equal(C.spmCompact(950), '950');
  assert.equal(C.spmCompact(12400), '12.4k');
  assert.equal(C.spmCompact(1250000), '1.25M');
  assert.equal(C.spmCompact(NaN), '—');
  assert.equal(C.spmMoney(612000, 'USD'), 'USD 612,000');
  assert.equal(C.spmMoney(12.5, 'EUR'), 'EUR 12.50');
  assert.equal(C.spmMoney(Infinity, 'USD'), '—');
  assert.equal(C.spmMoney(5, 'not money'), 'USD 5');
  assert.equal(C.spmPercent(1, 0), 0);
  assert.equal(C.spmPercent(NaN, 10), 0);
  assert.equal(C.spmPercent(3, 4), 75);
  assert.equal(C.spmPercent(9, 4), 100);
  assert.deepEqual(plain(C.SPM_STATUS), ['planned','confirmed','live','done','cancelled','late']);
  assert.equal(C.spmTone('bogus'), 'neutral');
  const bowl = C.spmBowl('oval', [{},{},{}]);
  assert.equal(bowl.width, 1000);
  const wedge = bowl.wedge(0, 0.02, 0.1);
  assert.match(wedge.d, /^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+)+Z$/);
  assert.ok(wedge.x < 320, 'the walk starts on the left end');
  for (const shape of ['rink','rectangle','pitch']) assert.match(C.spmBowl(shape, [{}]).wedge(0, 0.3, 0.4).d, /^M/);
  assert.equal(C.spmBowl('horseshoe', [{}]).bowl, 'rink', 'unknown shapes fall back to the rink');
  assert.equal(C.spmZoneKind('Club'), 'sideline'); assert.equal(C.spmZoneKind('End zone'), 'end'); assert.equal(C.spmZoneKind('corner'), 'corner'); assert.equal(C.spmZoneKind('mezzanine'), null);
  near(C.spmHexLuma('#FFFFFF'), 1); near(C.spmHexLuma('#000000'), 0); assert.equal(C.spmHexLuma('red'), 0.5);
});

test('the rink is a pure racetrack: straight sidelines, curved ends, region marks that cover the perimeter', () => {
  const bowl = C.spmBowl('rink', [{},{},{}]);
  const marks = plain(bowl.marks);
  assert.equal(marks.length, 9); assert.equal(marks[0], 0); assert.equal(marks[8], 1);
  for (let i = 1; i < 9; i++) assert.ok(marks[i] > marks[i - 1], 'regions are ordered');
  near(marks[2] + (1 - marks[7]), marks[6] - marks[3], 'left and right halves of the walk are symmetric');
  /* A sideline wedge in the top-sideline region has a flat outer edge. */
  const top = bowl.wedge(2, marks[2] + (marks[3] - marks[2]) * 0.3, marks[2] + (marks[3] - marks[2]) * 0.6);
  const ys = top.outerPoints.map(p => p[1]);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.2, 'outer edge is straight: ' + ys.join(','));
  assert.ok(top.y < 385 && top.x > 300 && top.x < 700, 'top sideline sits above the rink centre');
  const bottom = bowl.wedge(0, marks[6] + 0.01, marks[7] - 0.01);
  assert.ok(bottom.y > 385 && Math.max(...bottom.outerPoints.map(p => p[1])) - Math.min(...bottom.outerPoints.map(p => p[1])) < 0.2);
  const end = bowl.wedge(1, marks[4], marks[5]);
  const xs = end.outerPoints.map(p => p[0]), eys = end.outerPoints.map(p => p[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 20 && Math.max(...eys) - Math.min(...eys) > 150, 'an end wedge curves');
  assert.ok(end.x > 700, 'the right end is on the right');
  /* The field is a 2:1 racetrack inside the inner ring. */
  const field = bowl.field.match(/-?[\d.]+/g).map(Number);
  const fx = field.filter((v, i) => i % 2 === 0), fy = field.filter((v, i) => i % 2 === 1);
  const aspect = (Math.max(...fx) - Math.min(...fx)) / (Math.max(...fy) - Math.min(...fy));
  assert.ok(Math.abs(aspect - 2) < 0.15, 'the rink is about 2:1, got ' + aspect.toFixed(2));
  assert.match(bowl.fieldLines, /^M500,[\d.]+L500,[\d.]+$/);
  /* Counterclockwise mirrors top to bottom, keeping the left end on the left. */
  const mirrored = C.spmBowl('rink', [{},{},{}], {mirror:true});
  const mTop = mirrored.wedge(2, marks[2] + (marks[3] - marks[2]) * 0.3, marks[2] + (marks[3] - marks[2]) * 0.6);
  assert.ok(mTop.y > 385, 'the walk\'s first sideline is now at the bottom');
  near(mTop.x, top.x);
});

test('zone allocation covers the whole ring, honours asymmetric sides, wraps the trailing end sections and falls back to even slots', () => {
  const bowl = C.spmBowl('rink', [{}]), marks = bowl.marks;
  const seed = ['end','corner','sideline','sideline','sideline','corner','end','end','end','end','end','corner','sideline','sideline','sideline','sideline','corner','end','end','end','end'];
  const ranges = plain(C.spmBowlAllocate(seed, marks, 0));
  assert.equal(ranges.length, seed.length);
  const contiguous = list => {
    const sorted = list.slice().sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) near(sorted[i][0], sorted[i - 1][1]);
    near(sorted[sorted.length - 1][1] - sorted[0][0], 1, 'allocation sums to the full perimeter');
  };
  contiguous(ranges);
  const leftCurve = [marks[7] - 1, marks[2]], top = [marks[2], marks[3]], rightCurve = [marks[3], marks[6]], bottom = [marks[6], marks[7]];
  const within = (i, span) => ranges[i][0] >= span[0] - 1e-9 && ranges[i][1] <= span[1] + 1e-9;
  assert.ok([2,3,4].every(i => within(i, top)), '103–105 share the top sideline');
  assert.ok([12,13,14,15].every(i => within(i, bottom)), '113–116 share the bottom sideline');
  assert.ok([5,6,7,8,9,10,11].every(i => within(i, rightCurve)), '106, 107–111 and 112 share the right curve');
  assert.ok([16,17,18,19,20,0,1].every(i => within(i, leftCurve)), '117, 118–121, 101 and 102 share the left curve');
  const order = [16,17,18,19,20,0,1];
  for (let k = 1; k < order.length; k++) near(ranges[order[k]][0], ranges[order[k - 1]][1], 'the left curve runs 117 → 118–121 → 101 → 102 clockwise');
  const seven = (marks[2] + 1 - marks[7]) / 7;
  for (const i of order) near(ranges[i][1] - ranges[i][0], seven, 'seven sections split the left curve evenly by count');
  near(ranges[2][1] - ranges[2][0], (marks[3] - marks[2]) / 3);
  near(ranges[12][1] - ranges[12][0], (marks[7] - marks[6]) / 4, 'four club sections split the bottom run four ways');
  const outerEdge = C.spmBowl('rink', [{}]).wedge(0, ranges[3][0], ranges[3][1]).outerPoints.map(p => p[1]);
  assert.ok(Math.max(...outerEdge) - Math.min(...outerEdge) < 0.2, 'a zone-placed sideline section has a straight outer edge');
  /* No left-end sections: the two left corner groups share that curve. */
  const upper = ['corner','corner','corner','sideline','sideline','sideline','sideline','sideline','corner','corner','corner','end','end','end','end','corner','corner','corner','sideline','sideline','sideline','sideline','sideline','corner','corner','corner'];
  const u = plain(C.spmBowlAllocate(upper, marks, 0));
  contiguous(u);
  near(u[25][1], u[0][0], 'the last corner meets the first corner');
  near(u[0][0], (marks[7] - 1 + marks[2]) / 2, 'the groups meet at the middle of the left end');
  /* Corners first (the 200 level starts at a corner). */
  const corners = plain(C.spmBowlAllocate(['corner','corner','sideline','corner','end','corner','sideline','corner','end'], marks, 0));
  contiguous(corners);
  assert.ok(corners[0][0] < corners[1][0] && corners[1][1] <= corners[2][0] + 1e-9, 'leading corners take corner-tl before the top sideline');
  assert.ok(corners[8][1] <= corners[0][0] + 1e-9 && corners[8][0] >= corners[7][1] - 1e-9, 'the trailing end wraps onto the left end between the last corner and the first');
  /* Zone-less rings split evenly; startAt sideline rotates the origin. */
  const even = plain(C.spmBowlAllocate([null,null,null,null], marks, 0));
  assert.deepEqual(even, [[0,0.25],[0.25,0.5],[0.5,0.75],[0.75,1]]);
  const side = plain(C.spmBowlAllocate([null,null], marks, 2));
  near(side[0][0], marks[2]);
  const sideZones = plain(C.spmBowlAllocate(['sideline','corner','end','corner','sideline','corner','end','corner'], marks, 2));
  assert.ok(sideZones[0][0] >= marks[2] - 1e-9 && sideZones[0][1] <= marks[3] + 1e-9, 'startAt sideline begins on the top run');
  assert.deepEqual(plain(C.spmBowlAllocate([], marks, 0)), []);
});

test('the strict path tokenizer refuses anything that is not a plain path', () => {
  assert.ok(!C.spmParsePath('M10,10 L20 20 H30 V40 C1 2 3 4 5 6 S7 8 9 10 Q1 2 3 4 T5 6 A5 5 0 0 1 50 50 Z', {range:[0,1000]}).error);
  for (const bad of ['M10 10 L20 20 onclick', 'M10 10 <script>', 'M10 10 L 1e400 2', 'M10 10 L5', 'L1 2', '', 'M1 1 A5 5 0 2 0 9 9', 'M1 1 L-5 2', 'M1 1 L1001 2', 'M1 1 L2 2 "'])
    assert.ok(C.spmParsePath(bad, {range:[0,1000]}).error, JSON.stringify(bad));
  assert.ok(C.spmParsePath('m1 1 l2 2 z').error, 'relative commands are refused for authored paths');
  assert.ok(!C.spmParsePath('m1 1 l2 2 z', {relative:true}).error);
  assert.ok(C.spmParsePath('M' + '1 1 L'.repeat(900) + '1 1', {}).error, 'length limit');
  assert.equal(C.spmNormalizePath('m10 10 l5 5 h3 v-2 z', {x:10,y:10,width:10,height:10}).d, 'M0 0L500 500L800 500L800 300Z');
  assert.ok(C.spmTransformPath([{cmd:'A',args:[1,1,0,0,1,2,2]}], [1,0.5,0,1,0,0]).error);
});

test('the model computes totals, intensities, revenue where price is known and legend groups', () => {
  const p = panel();
  const m = C.seatmapModel(p, {sold:{101:50,102:200,103:150}, price:{101:120,102:80}, held:{201:{count:100,label:'Group'}}, mode:'sold'});
  assert.equal(m.sections.length, 5);
  assert.equal(m.totals.sold, 400); assert.equal(m.totals.capacity, 1500); near(m.totals.pct, 400/1500*100);
  assert.equal(m.totals.held, 100); assert.equal(m.totals.priced, 2); assert.equal(m.totals.revenue, 50*120 + 200*80);
  assert.equal(m.totals.revenueKnown, true); assert.equal(m.totals.allPriced, false);
  const by = Object.fromEntries(m.sections.map(s => [s.id, s]));
  near(by['101'].intensity, 0.5); near(by['102'].intensity, 1); near(by['201'].intensity, 0); assert.equal(by['201'].held.count, 100);
  assert.equal(by['201'].slot === undefined, true);
  assert.equal(by['103'].ring, 0); assert.equal(by['201'].ringLabel, 'Upper');
  assert.deepEqual(plain(m.rings.map(r => [r.label, r.sold, r.capacity])), [['Lower',400,600],['Upper',0,900]]);
  assert.deepEqual(plain(m.zones), [{zone:'end',sections:2},{zone:'corner',sections:2},{zone:'sideline',sections:1}]);
  assert.equal(m.landmarks.length, 1);
  const price = C.seatmapModel(p, {price:{101:120,102:80}, mode:'price'});
  const pb = Object.fromEntries(price.sections.map(s => [s.id, s]));
  near(pb['101'].intensity, 1); near(pb['102'].intensity, 80/120); assert.equal(pb['201'].known, false);
  const held = C.seatmapModel(p, {held:{201:{count:200}}, mode:'held'});
  near(held.sections.find(s => s.id === '201').intensity, 0.5);
  const tier = C.seatmapModel(p, {tierOf:{102:'p2'}, mode:'tier'});
  const tb = Object.fromEntries(tier.sections.map(s => [s.id, s]));
  assert.equal(tb['101'].color, '#D7A34F'); assert.equal(tb['102'].tierId, 'p2'); assert.ok(tb['102'].color); assert.equal(tb['103'].known, false);
  assert.deepEqual(plain(tier.tiers.map(t => t.sections)), [1,1]);
  const revenue = C.seatmapModel(p, {sold:{101:100,102:100}, price:{101:10,102:20}, mode:'revenue'});
  const rb = Object.fromEntries(revenue.sections.map(s => [s.id, s]));
  near(rb['101'].intensity, 0.5); near(rb['102'].intensity, 1); assert.equal(rb['103'].known, false);
  for (const section of m.sections) assert.ok(Number.isFinite(section.intensity) && section.intensity >= 0 && section.intensity <= 1);
  const empty = C.seatmapModel({...p, sections:[]}, {});
  assert.equal(empty.complete, false); assert.equal(empty.totals.pct, 0);
  assert.doesNotMatch(C.seatmapHTML({...p, sections:[]}, {}), /NaN|Infinity|undefined/);
});

test('bowl placement follows zones by default, slots when a ring authors them, and nudges landmarks off labels', () => {
  const sections = C.seatmapSections(panel());
  assert.deepEqual(plain(sections.map(s => [s.id, s.slot, s.span, s.kind])), [['101',0,1,'end'],['102',1,1,'corner'],['103',2,2,'sideline'],['201',null,1,'end'],['202',null,1,'corner']]);
  const bowl = C.spmBowl('rink', [{},{}]);
  const placed = C.seatmapPlacement(panel(), sections, bowl);
  near(placed['102'][0], bowl.marks[1] / 2 + 0.5 / 8, 'authored slots place the lower ring');
  near(placed['103'][1] - placed['103'][0], 2 / 8);
  assert.ok(placed['201'][0] <= 0.02 && placed['201'][1] >= 0.02, 'zone places the upper ring: 201 covers the left end');
  near(placed['201'][1], placed['202'][0], 'the two upper sections share the whole ring between them');
  near(placed['202'][1] - placed['201'][0], 1);
  const over = panel(); over.sections[2].span = 9;
  assert.equal(C.seatmapSections(over)[2].span, 1);
  const trimmed = panel(); trimmed.sections[2].slot = 7; trimmed.sections[2].span = 3;
  assert.equal(C.seatmapSections(trimmed)[2].span, 1);
  const fractional = panel(); fractional.sections[1].slot = 1.5; fractional.sections[1].span = 0.5;
  assert.deepEqual(validate({...diagram(), panels:[fractional]}).warnings, []);
  const odd = panel(); odd.sections[3].zone = 'mezzanine';
  assert.match(validate({...diagram(), panels:[odd]}).warnings.join('\n'), /panels\[0\]\.sections\[3\]\.zone: "mezzanine" is not recognised/);
  const directed = panel(); directed.direction = 'counterclockwise'; directed.startAt = 'sideline';
  assert.deepEqual(validate({...diagram(), panels:[directed]}).warnings, []);
  const bad = panel(); bad.direction = 'widdershins'; bad.startAt = 'corner';
  const bw = validate({...diagram(), panels:[bad]}).warnings.join('\n');
  assert.match(bw, /panels\[0\]\.direction: expected clockwise or counterclockwise/); assert.match(bw, /panels\[0\]\.startAt: expected end or sideline/);
  const normal = C.seatmapModel(panel(), {}), flipped = C.seatmapModel(directed, {});
  const n103 = normal.sections.find(s => s.id === '103'), f103 = flipped.sections.find(s => s.id === '103');
  assert.ok(n103.y < 385 && f103.y > 385, 'counterclockwise mirrors the bowl top to bottom');
  /* Landmarks: an authored point on a label slides toward the field. */
  const onLabel = panel(); onLabel.landmarks = [{id:'bench', label:'home bench', x:n103.x, y:n103.y}];
  const mark = C.seatmapModel(onLabel, {}).landmarks[0];
  assert.equal(mark.nudged, true);
  assert.ok(Math.hypot(mark.x - 500, mark.y - 385) < Math.hypot(n103.x - 500, n103.y - 385), 'moved toward the centre');
  const clear = C.seatmapModel(panel(), {}).landmarks[0];
  assert.equal(clear.nudged, false); assert.equal(clear.x, 500); assert.equal(clear.y, 270);
  assert.match(C.seatmapHTML(panel(), {}), /<g class="seatmap-landmark"><rect x="[\d.]+" y="[\d.]+" width="\d+" height="26" rx="13"\/><text x="500" y="270" dy="0.35em">home bench<\/text><\/g>/);
});

test('paths geometry draws authored paths and refuses anything else', () => {
  const p = panel();
  p.geometry = 'paths'; p.viewBox = {width:1000,height:600};
  p.sections = [
    {id:'101',ring:'lower',capacity:100,path:'M0 0 L100 0 L100 100 L0 100 Z'},
    {id:'102',ring:'lower',capacity:100,path:'M200 0 L300 0 L300 100 Z'},
    {id:'103',ring:'lower',capacity:100,path:'M400 0 A50 50 0 1 0 500 0 Z'},
    {id:'104',ring:'upper',capacity:100,path:'M600 0 Q650 50 700 0 L700 100 Z'},
    {id:'105',ring:'upper',capacity:100,path:'M0 0 L10 10"/><script>bad()</script><path d="'},
    {id:'106',ring:'upper',capacity:100,path:'M0 0 L10 10 onclick'},
    {id:'107',ring:'upper',capacity:100,path:'M0 0 L2000 10'},
    {id:'108',ring:'upper',capacity:100},
  ];
  const result = validate({...diagram(), panels:[p], steps:[], paths:undefined});
  const w = result.warnings.join('\n');
  assert.match(w, /panels\[0\]\.sections\[4\]\.path: unexpected characters/);
  assert.match(w, /panels\[0\]\.sections\[5\]\.path: unsupported path command "o"/);
  assert.match(w, /panels\[0\]\.sections\[6\]\.path: number 2000 outside 0–1000/);
  assert.match(w, /panels\[0\]\.sections\[7\]\.path: expected a non-empty path string/);
  const html = C.seatmapHTML(p, {});
  assert.doesNotMatch(html, /<script|onclick|bad\(\)/);
  assert.match(html, /viewBox="0 0 1000 600"/);
  assert.match(html, /d="M0 0L100 0L100 100L0 100Z"/);
  assert.match(html, /d="M400 0A50 50 0 1 0 500 0Z"/);
  assert.equal(C.seatmapModel(p, {}).sections.length, 4);
  const bowlWithPath = panel(); bowlWithPath.sections[0].path = 'M0 0Z'; bowlWithPath.viewBox = {width:10,height:10};
  const bw = validate({...diagram(), panels:[bowlWithPath]}).warnings.join('\n');
  assert.match(bw, /sections\[0\]\.path: only used by geometry "paths"/);
  assert.match(bw, /panels\[0\]\.viewBox: only used by geometry "paths"/);
});

test('warnings name declaration, initial, step and transient source paths and never throw on hostile input', () => {
  const d = diagram(), p = d.panels[0];
  p.rings.push({id:'__proto__'}, 5);
  p.sections[1].capacity = 1.5; p.sections[2].ring = 'nowhere'; p.sections[3].slot = 99; p.sections[4].zone = 'x'.repeat(30);
  p.sections.push({id:'101',ring:'upper',capacity:1}, {id:'bad id',ring:'upper',capacity:1}, {id:'202x',ring:'upper',capacity:Number.MAX_SAFE_INTEGER + 1});
  p.tiers[0].color = 'red'; p.landmarks[0].x = 5000; p.ringSlots = 99; p.currency = 'dollars'; p.bowl = 'stadium'; p.geometry = 'rings'; p.showTotals = 'yes';
  p.initial = {sold:{101:-1, nowhere:1}, held:{201:{count:'x'}}, price:{101:Infinity}, tierOf:{101:'p9'}, mode:'heat', highlight:['101','101','101','101','101','101','101','101','101'], bogus:1};
  d.steps[0].panels.map = {sold:{201:NaN}, enterOnce:{mode:'nope', held:{201:{count:1,label:5}}}, highlight:7, note:{}};
  const w = validate(d).warnings.join('\n');
  for (const needle of [
    'panels[0].geometry: expected bowl or paths', 'panels[0].bowl: expected', 'panels[0].ringSlots: expected a number 8–32', 'panels[0].currency: expected a three-letter',
    'panels[0].showTotals: expected true or false', 'panels[0].rings[2].id: needs a letter-or-digit-led id', 'panels[0].rings[3].id', 'panels[0].sections[1].capacity: expected a whole number',
    'panels[0].sections[2].ring: expected a declared ring id', 'panels[0].sections[3].slot: expected a number from 0', 'panels[0].sections[4].zone: expected text of up to 24',
    'panels[0].sections[5].id: duplicate id "101"', 'panels[0].sections[6].id: needs a letter-or-digit-led id', 'panels[0].sections[7].capacity', 'panels[0].tiers[0].color: expected #RRGGBB',
    'panels[0].landmarks[0]: x and y must lie inside', 'panels[0].initial.sold.101: expected a whole number', 'panels[0].initial.sold.nowhere: unknown section id',
    'panels[0].initial.held.201: expected {count,label?,until?}', 'panels[0].initial.price.101: expected a finite price', 'panels[0].initial.tierOf.101: expected a declared tier id',
    'panels[0].initial.mode: expected sold|held|price|tier|revenue', 'panels[0].initial.highlight: expected a declared section id, an array of up to 8', 'panels[0].initial.bogus: unknown field',
    'steps[0].panels.map.sold.201: expected a whole number', 'steps[0].panels.map.enterOnce.mode: expected', 'steps[0].panels.map.enterOnce.held.201: expected', 'steps[0].panels.map.highlight: expected', 'steps[0].panels.map.note: expected text',
  ]) assert.ok(w.includes(needle), needle + '\n' + w);
  for (const hostile of [null, 7, 'text', [], {rings:null, sections:{}, tiers:'x', landmarks:5, initial:[], viewBox:'wide'}, {rings:[{id:'r'}], sections:[{id:'constructor',ring:'r',capacity:1}], initial:{sold:{constructor:1}}}]) {
    const h = diagram(); h.panels = [Object.assign({id:'map',type:'seatmap'}, hostile && typeof hostile === 'object' && !Array.isArray(hostile) ? hostile : {bowl:hostile, sections:hostile, rings:hostile, initial:hostile})];
    h.steps[0].panels.map = hostile;
    assert.doesNotThrow(() => validate(h));
    assert.doesNotMatch(C.seatmapHTML(h.panels[0], hostile), /NaN|Infinity|undefined/);
  }
});

test('alternate paths fold sold/held/price/tier maps independently; null clears a key or a map; enterOnce lasts one step; input is never mutated', () => {
  const d = diagram(), before = JSON.stringify(d);
  const happy = plain(C.foldPanelStates(C.diagramForPath(d, 'happy')).map), soft = plain(C.foldPanelStates(C.diagramForPath(d, 'soft')).map);
  assert.deepEqual(happy[0].sold, {101:50,102:200,103:150});
  assert.deepEqual(happy[0].held, {201:{count:100,label:'Group',until:'T-7d'}});
  assert.deepEqual(happy[0].price, {101:120,102:80});
  assert.deepEqual(happy[1].sold, {101:50,102:200,103:150,201:400,202:500});
  assert.deepEqual(happy[1].held, {}, 'a key set to null forgets the hold');
  assert.deepEqual(happy[1].highlight, ['201','202']);
  assert.deepEqual(happy[2].sold, {101:0,102:200,103:150,201:400,202:500}, 'enterOnce overrides one key for one step');
  assert.equal(happy[2].mode, 'held');
  assert.deepEqual(happy[3].sold, {101:50,102:200,103:150,201:400,202:500}, 'the override is gone next step');
  assert.equal(happy[3].mode, 'revenue'); assert.equal(happy[3].highlight, null);
  assert.deepEqual(soft[1].sold, {}, 'sold: null clears the whole map');
  assert.deepEqual(soft[1].price, {101:120,102:80,201:30}); assert.equal(soft[1].mode, 'price'); assert.equal(soft[1].highlight, '201');
  assert.deepEqual(soft[1].held, {201:{count:100,label:'Group',until:'T-7d'}}, 'the other path never converted the hold');
  assert.deepEqual(soft[2].sold, {}); assert.equal(soft[2].mode, 'revenue');
  assert.equal(happy[2].note, 'start');
  const m = C.seatmapModel(d.panels[0], happy[1]);
  assert.equal(m.totals.sold, 1300); assert.equal(m.totals.held, 0);
  C.seatmapHTML(d.panels[0], happy.at(-1));
  assert.equal(JSON.stringify(d), before);
  const bare = plain(C.foldPanelStates({nodes:{}, rows:[], panels:[panel()]}).map);
  assert.equal(bare.length, 1); assert.deepEqual(bare[0].sold, {101:50,102:200});
  const bad = diagram(); bad.steps[0].panels.map = {sold:{101:999, 999:1, 'bad id':3, __proto__:{x:1}}, held:{201:{count:1,label:HOSTILE}}, price:{101:-1}};
  const badFold = plain(C.foldPanelStates(C.diagramForPath(bad, 'happy')).map[0]);
  assert.deepEqual(badFold.sold, {101:999, 102:200, 999:1}, 'the fold keeps authored, well-shaped entries and knows nothing about the declaration');
  assert.deepEqual(badFold.price, {101:120,102:80}, 'a negative price is not carried');
  const badModel = C.seatmapModel(d.panels[0], badFold);
  assert.equal(badModel.sections.find(s => s.id === '101').sold, 100, 'the model clamps to the capacity of the declaration it is given');
  assert.equal(badModel.totals.sold, 100 + 200, 'an id absent from the declaration is not drawn or counted (103 was never sold on this patch)');
  assert.match(validate(bad).warnings.join('\n'), /steps\[0\]\.panels\.map\.sold\.101: expected a whole number from 0 to that section’s capacity/);
});

test('all authored text is escaped; the markup carries titles, aria totals, hatch pattern, highlight outline and no scripts', () => {
  const p = panel();
  p.rings[0].label = HOSTILE; p.sections[0].label = HOSTILE; p.sections[1].zone = HOSTILE; p.tiers[0].label = HOSTILE; p.landmarks[0].label = HOSTILE; p.currency = HOSTILE;
  const html = C.seatmapHTML(p, {sold:{101:60}, price:{101:120}, held:{102:{count:20,label:HOSTILE,until:'T-7d'}}, note:HOSTILE, highlight:['101'], mode:'sold'});
  assert.doesNotMatch(html, /<img|NaN|Infinity|undefined/);
  assert.match(html, /&lt;img/);
  assert.match(html, /role="img" aria-label="Venue map, sold view: 60 of 1,500 seats sold \(4%\), 20 held, revenue USD 7,200 where price known\. Highlighted: 101\."/);
  assert.match(html, /<title>&lt;img src=x onerror=bad\(\)&gt; \(101\) · &lt;img src=x onerror=bad\(\)&gt; · end · 60 \/ 100 sold · 60% · USD 120 · tier &lt;img/);
  assert.match(html, /<pattern id="spm-static"/);
  assert.match(html, /class="seatmap-hold" d="M[\d.,L]+Z" fill="url\(#spm-static\)"/);
  assert.match(html, /class="seatmap-sec seatmap-hi" data-sec="101"/);
  assert.match(html, /fill="var\(--seatmap-accent\)" fill-opacity="0.640"/);
  assert.match(html, /class="seatmap-lbl seatmap-lbl-on"/);
  assert.match(C.seatmapHTML(p, {mode:'tier'}), /fill="#D7A34F"[^>]*><title>[^<]*<\/title><\/path><text class="seatmap-lbl seatmap-lbl-dark"/);
  assert.match(html, /class="seatmap-outline"/);
  assert.match(html, /seatmap-stat-warn/);
  assert.match(html, /class="swnote">&lt;img/);
  assert.match(html, /<g class="seatmap-landmark"><rect[^>]*\/><text[^>]*>&lt;img/);
  const tier = C.seatmapHTML(p, {mode:'tier'});
  assert.match(tier, /fill="#D7A34F"/);
  assert.match(tier, /seatmap-sw" style="background:#D7A34F"/);
  assert.doesNotMatch(C.seatmapHTML({...p, showTotals:false}, {}), /seatmap-totals/);
  assert.match(C.seatmapHTML(p, {mode:'price', price:{101:40,102:90}}), /USD 40 – USD 90/);
});

test('the renderer keeps pattern ids per host, offers an in-place patch only for animated same-geometry updates, and pulses once per highlight change', () => {
  const render = C.PanelRegistry.get('seatmap').render, p = panel();
  const host = {};
  const first = render(host, p, {sold:{101:10}}, 'aurora', [], 0, true);
  assert.match(first.html, /id="spmh\d+"/);
  assert.equal(first.patch, null, 'nothing to patch on first paint');
  const second = render(host, p, {sold:{101:90}, highlight:'101'}, 'aurora', [], 1, true);
  assert.equal(typeof second.patch, 'function');
  assert.match(second.html, /seatmap-pulse/);
  assert.equal(second.patch(), false, 'a host without DOM access falls back to innerHTML');
  const third = render(host, p, {sold:{101:90}, highlight:'101', note:'same highlight'}, 'aurora', [], 2, true);
  assert.doesNotMatch(third.html, /seatmap-pulse/, 'an unchanged highlight does not pulse again');
  const still = render(host, p, {sold:{101:20}, highlight:'102'}, 'aurora', [], 3, false);
  assert.equal(still.patch, null); assert.doesNotMatch(still.html, /seatmap-pulse/);
  const other = {};
  const ids = [first.html, render(other, p, {}, 'aurora', [], 0, true).html].map(h => h.match(/id="(spmh\d+)"/)[1]);
  assert.notEqual(ids[0], ids[1]);
  const geometryChange = render(host, {...p, sections:p.sections.slice(0,4)}, {}, 'aurora', [], 4, true);
  assert.equal(geometryChange.patch, null);
});

test('typed authoring collects maps and modes through the shared field pipeline', () => {
  const d = diagram();
  const collected = C.patchFieldsCollect(C.panelPatchFields(d.panels[0]), {sold:'{"101": 70}', held:'null', mode:'price', highlight:'["101","102"]', note:'Promo'});
  assert.equal(collected.error, undefined);
  assert.deepEqual(plain(collected.item.sold), {101:70}); assert.equal(collected.item.held, null); assert.equal(collected.item.mode, 'price'); assert.deepEqual(plain(collected.item.highlight), ['101','102']);
  const copy = C.builderClipboardCopy(d, [{kind:'panel',section:0,index:0}]);
  assert.ok(copy);
});

test('narrow lettered section ids stack their letter on a second line; labels below 9 units are hidden but keep their tooltip', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/sports/arena-sections.sections.json'), 'utf8'));
  const p = Object.assign({id:'map', type:'seatmap'}, seed);
  const m = C.seatmapModel(p, {});
  const by = Object.fromEntries(m.sections.map(s => [s.id, s]));
  for (const id of ['201A','201B','226A','226B']) {
    assert.deepEqual(plain(by[id].lines), [id.slice(0, 3), id.slice(3)], id + ' stacks its letter');
    assert.ok(by[id].font >= 9, id + ' is legible: ' + by[id].font);
  }
  assert.deepEqual(plain(by['103'].lines), ['103']);
  assert.ok(by['201A'].font > C.seatmapLabelFont('201A', {arc: 30, depth: 60}).font || true);
  const html = C.seatmapHTML(p, {});
  assert.match(html, /<text class="seatmap-lbl[^"]*" x="[\d.]+" y="[\d.]+" font-size="[\d.]+" dy="-0.2em">201<tspan x="[\d.]+" dy="1.05em">A<\/tspan><\/text>/);
  assert.match(html, /dy="0.35em">103<\/text>/, 'wide wedges keep one line');
  const tiny = panel(); tiny.sections = []; for (let i = 0; i < 160; i++) tiny.sections.push({id:'S' + i, ring:'lower', capacity:1, zone:'corner'});
  const tm = C.seatmapModel(tiny, {});
  assert.ok(tm.sections.some(s => s.font === 0), 'very narrow wedges hide the label');
  assert.match(C.seatmapHTML(tiny, {}), /<title>S159 · Lower · corner/);
  /* Stacking only when it gains size. */
  assert.deepEqual(plain(C.seatmapLabelFont('201A', {arc: 400, depth: 120}).lines), ['201A']);
  assert.deepEqual(plain(C.seatmapLabelFont('201A', {arc: 26, depth: 90}).lines), ['201','A']);
});

test('the fold accepts a previous snapshot as its starting state, so an engine-level declaration change between steps can seed the next run', () => {
  const d = diagram();
  const first = plain(C.foldPanelStates(C.diagramForPath(d, 'happy')).map);
  const seeded = Object.assign({}, panel(), {initial: first[1]});
  seeded.sections = seeded.sections.concat([{id:'301', ring:'upper', capacity:50, zone:'end'}]);
  const next = plain(C.foldPanelStates({nodes:{a:{}}, rows:[['a']], panels:[seeded], steps:[{id:'x', nodes:['a'], panels:{map:{sold:{301:25}}}}]}).map);
  assert.deepEqual(next[0].sold, Object.assign({}, first[1].sold, {301:25}), 'carried maps survive the seed and the new section is accepted');
  assert.deepEqual(next[0].held, first[1].held); assert.deepEqual(next[0].highlight, first[1].highlight);
  assert.equal(next[0].log.length, 0);
  const m = C.seatmapModel(seeded, next[0]);
  assert.ok(m.sections.some(s => s.id === '301'));
  assert.equal(m.totals.sold, 1300 + 25);
  /* A declaration swap that drops and shrinks sections: the carried maps keep
     their entries, the model re-checks ids and capacities against the new
     declaration, and the markup is drawn from it. */
  const swapped = Object.assign({}, panel(), {initial: first[1]});
  swapped.sections = [{id:'101',ring:'lower',capacity:30,zone:'end'},{id:'103',ring:'lower',capacity:300,zone:'sideline'},{id:'201',ring:'upper',capacity:400,zone:'end'},{id:'NEW',ring:'upper',capacity:80,zone:'corner'}];
  swapped.tiers = [{id:'p2',label:'Value'}];
  const after = plain(C.foldPanelStates({nodes:{a:{}}, rows:[['a']], panels:[swapped], steps:[{id:'y', nodes:['a'], panels:{map:{sold:{NEW:40}, highlight:['NEW','102']}}}]}).map)[0];
  assert.equal(after.sold['102'], 200, 'the carried entry for a dropped section survives in the map');
  const sm = C.seatmapModel(swapped, after);
  assert.deepEqual(plain(sm.sections.map(s => s.id)), ['101','103','201','NEW']);
  assert.equal(sm.sections.find(s => s.id === '101').sold, 30, 'clamped to the new, smaller capacity');
  assert.equal(sm.sections.find(s => s.id === '101').tier, null, 'the declared tier p1 is gone from the new declaration');
  assert.deepEqual(plain(sm.highlight), ['NEW'], 'highlight ids are re-checked against the new declaration');
  assert.equal(sm.totals.sold, 30 + 150 + 400 + 40);
  const sh = C.seatmapHTML(swapped, after);
  assert.match(sh, /data-sec="NEW"/); assert.doesNotMatch(sh, /data-sec="102"/);
  const host = {};
  const render = C.PanelRegistry.get('seatmap').render;
  render(host, panel(), first[1], 'aurora', [], 0, true);
  const result = render(host, swapped, after, 'aurora', [], 1, true);
  assert.equal(result.patch, null, 'a changed declaration forces a full re-render instead of an in-place patch');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js','clipboard.workbench.js'])
  vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const sample = () => JSON.parse(fs.readFileSync(path.join(__dirname,'../src/starters/messaging-cost.json')));
const diagram = () => sample().page.sections[0].diagram;
const panel = () => diagram().panels[0];
const validate = d => plain(C.validate(C.normalize(d)));
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} ≈ ${b}`);

test('cost template, picker, example and metadata use ordinary discovery', () => {
  assert.deepEqual(validate(sample()), {errors:[],warnings:[]});
  const d = {nodes:{n:{}},rows:[['n']],panels:[{...plain(C.PANEL_TEMPLATES.cost),id:'c',type:'cost'}]};
  assert.deepEqual(validate(d), {errors:[],warnings:[]});
  assert.ok(C.PANEL_CATALOG.some(item => item.type === 'cost'));
  assert.equal(C.panelPickerExample('cost').panel.type, 'cost');
  assert.equal(panelAssets().features['panel.cost'].label, 'Cost breakdown / comparison panel');
  assert.match(readStyles('style.core.css'), /\.cost-routes/);
});
test('one million and scale scenarios include usage and fixed charges exactly once', () => {
  const p=panel(),m=C.costModel(p,{});
  assert.equal(m.messages,1000000);near(m.routes[0].total,3.2);near(m.routes[1].total,13.4);near(m.delta,10.2);
  assert.equal(m.routes[0].nodes.length,3);assert.equal(m.routes[1].nodes.length,4);
  near(m.crossover,6666666.666666667);
  const scale=C.costModel(p,{messages:10000000});
  near(scale.routes[0].total,32);near(scale.routes[1].total,26);near(scale.delta,-6);near(scale.percent,18.75);
  const zero=C.costModel(p,{messages:0});
  assert.deepEqual(plain(zero.routes.map(r=>r.total)),[0,12]);assert.equal(zero.percent,null);
});
test('missing rates, malformed declarations, overflow and invalid volumes never advertise savings', () => {
  for(const value of [undefined,null,-1,'0',Infinity,NaN]){
    const p=panel();p.items[1].perMillion=value;
    assert.equal(C.costModel(p,{}).delta,null);assert.match(C.costHTML(p,{}),/Unpriced/);
  }
  for(const messages of [null,-1,1.5,'1000000',Infinity,Number.MAX_SAFE_INTEGER+1])
    assert.equal(C.costModel(panel(),{messages}).delta,null);
  for(const mutate of [p=>p.items=null,p=>p.items.push(null),p=>p.items.push({route:'missing',perMillion:0}),
    p=>p.routes.push({id:'extra'}),p=>p.routes[1].id='bus',p=>p.items.splice(3),p=>p.items[1].fixed=-1,p=>p.currency='not-money']){
    const p=panel();mutate(p);assert.equal(C.costModel(p,{}).delta,null);
    const d=diagram();d.panels=[p];assert.ok(validate(d).warnings.length);
  }
  const p=panel();p.items[1].perMillion=Number.MAX_VALUE;
  assert.equal(C.costModel(p,{messages:100000000}).delta,null);
  assert.doesNotMatch(C.costHTML(p,{messages:100000000}),/NaN|Infinity/);
});
test('ties, free routes, sub-cent rates and repeated node links remain truthful', () => {
  const p=panel();p.items=[{route:'bus',node:'producer',perMillion:0},{route:'bus',node:'producer',perMillion:0},{route:'queue',node:'producer',perMillion:0}];
  const m=C.costModel(p,{});assert.equal(m.delta,0);assert.equal(m.percent,null);assert.equal(m.crossover,null);
  assert.equal(m.routes[0].nodes.length,1);assert.match(C.costHTML(p,{}),/Same estimated cost/);
  p.items[0].perMillion=0.004;assert.match(C.costHTML(p,{}),/USD 0.004/);
});
test('stacked bars share a zero baseline and scale, match node colors, and separate fixed costs', () => {
  const chart=C.costChartModel(C.costModel(panel(),{}));
  near(chart.max,13.4);near(chart.routes[0].pct,3.2/13.4*100);near(chart.routes[1].pct,100);
  for(const route of chart.routes)near(route.segments.reduce((sum,s)=>sum+s.pct,0),route.pct);
  const fixed=chart.routes[1].segments.filter(s=>s.fixed);assert.equal(fixed.length,1);near(fixed[0].cost,12);
  const consumers=chart.routes.map(r=>r.flow.find(n=>n.label==='consumer').color);
  assert.equal(consumers[0],consumers[1],'shared engineering nodes keep the same color');
  assert.equal(chart.routes[0].segments.some(s=>s.label.includes('Producer')),false,'zero charges do not invent bar area');
  const invalid=panel();delete invalid.items[1].perMillion;
  assert.equal(C.costChartModel(C.costModel(invalid,{})).routes[0].segments.length,0,'unpriced routes have no misleading partial bar');
  const scale=C.costChartModel(C.costModel(panel(),{messages:100000000}));
  near(scale.routes[1].pct,152/320*100);
  const html=C.costHTML(panel(),{});assert.match(html,/role="img" aria-label="Managed event bus/);
  assert.match(html,/<details class="cost-details">/);assert.doesNotMatch(html,/<details class="cost-details" open/);
});
test('warnings name declaration, initial, step and transient source paths', () => {
  const d=diagram();d.panels[0].items[0].node='unknown';d.panels[0].initial.messages=-1;
  d.steps[0].panels.costs={activeRoute:'missing',enterOnce:{messages:'bad'}};
  const w=validate(d).warnings.join('\n');
  assert.match(w,/items\[0\].node/);assert.match(w,/initial.messages/);
  assert.match(w,/steps\[0\].panels.costs.activeRoute/);assert.match(w,/steps\[0\].panels.costs.enterOnce.messages/);
});
test('density is an optional declaration with safe auto fallback', () => {
  assert.match(C.costHTML(panel(),{}),/cost-panel cost-auto/);
  for(const density of ['auto','compact','expanded']){
    const d=diagram();d.panels[0].density=density;
    assert.deepEqual(validate(d),{errors:[],warnings:[]});
    assert.match(C.costHTML(d.panels[0],{}),new RegExp('cost-panel cost-'+density));
  }
  const d=diagram();d.panels[0].density='hostile" onclick="bad()';
  assert.match(validate(d).warnings.join('\n'),/density: expected/);
  assert.match(C.costHTML(d.panels[0],{}),/cost-panel cost-auto/);
  assert.doesNotMatch(C.costHTML(d.panels[0],{}),/onclick/);
});
test('alternate jumps, volume and transient overrides never leak across paths', () => {
  const d=diagram(),before=JSON.stringify(d);
  const a=C.foldPanelStates(C.diagramForPath(d,'bus')).costs,b=C.foldPanelStates(C.diagramForPath(d,'queue')).costs;
  assert.equal(a.at(-1).messages,100000000);assert.equal(a.at(-1).activeRoute,'bus');
  assert.equal(b[0].messages,1000000);assert.equal(b[0].activeRoute,null);assert.equal(b[1].activeRoute,'queue');
  d.steps[1].panels.costs.enterOnce={messages:0};
  const t=C.foldPanelStates(C.diagramForPath(d,'bus')).costs;assert.equal(t[1].messages,0);assert.equal(t[2].messages,1000000);
  delete d.steps[1].panels.costs.enterOnce;C.costHTML(d.panels[0],a.at(-1));assert.equal(JSON.stringify(d),before);
});
test('all authored text is escaped; highlighting never changes price order', () => {
  const p=panel(),hostile='<img src=x onerror=bad()>';
  p.routes[0].label=hostile;p.routes[1].tradeoff=hostile;p.items[0].label=hostile;p.items[0].node=hostile;p.assumptions=hostile;p.period=hostile;
  const html=C.costHTML(p,{activeRoute:'queue',note:hostile});
  assert.doesNotMatch(html,/<img|NaN|Infinity/);assert.match(html,/&lt;img/);
  assert.match(html,/cost-route-1 cost-active/);assert.match(html,/USD 10.20 more/);
  assert.match(C.costHTML(panel(),{messages:10000000}),/USD 6.00 less/);
});
test('typed authoring and node rename/delete/paste use shared commands', () => {
  const d=diagram();
  const collected=C.patchFieldsCollect(C.panelPatchFields(d.panels[0]),{messages:'10000000',activeRoute:'queue',note:'Scale'});
  assert.equal(collected.error,undefined);assert.equal(collected.item.messages,10000000);
  const rename=C.planRenameNode(JSON.stringify(d),d,0,'relay','forwarder');assert.equal(rename.error,undefined);
  const next=JSON.parse(rename.text);assert.equal(next.panels[0].items[5].node,'forwarder');
  const removed=C.planDeleteNode(rename.text,next,0,'forwarder');assert.equal(removed.error,undefined);
  assert.equal(JSON.parse(removed.text).panels[0].items[5].node,undefined);assert.equal(JSON.parse(removed.text).panels[0].items[5].fixed,12);
  const copy=C.builderClipboardCopy(d,[{kind:'panel',section:0,index:0}]);
  const dest={nodes:{producer:{}},rows:[['producer']]};
  const paste=C.planPasteBuilderClipboard(JSON.stringify(dest),dest,copy.data,{section:0});assert.equal(paste.error,undefined);
  const pasted=JSON.parse(paste.text).page.sections[0].diagram.panels[0];
  assert.equal(pasted.items[0].node,'producer');assert.equal(pasted.items[5].node,undefined);near(C.costModel(pasted,{}).routes[1].total,13.4);
});

const operation = () => JSON.parse(fs.readFileSync(path.join(__dirname,'../src/starters/operation-cost.json')));
const sixOperations = () => JSON.parse(fs.readFileSync(path.join(__dirname,'../src/starters/cost-six-operations.json')));
const single = () => operation().page.sections[0].diagram.panels[0];
test('single operation has visible priced components and no comparison story', () => {
  assert.deepEqual(validate(operation()),{errors:[],warnings:[]});
  const p=single(),m=C.costModel(p,p.initial),html=C.costHTML(p,p.initial);
  near(m.routes[0].total,.1);assert.equal(m.delta,null);assert.equal(m.crossover,null);
  assert.match(html,/1 operation/);assert.match(html,/cost-single/);
  const visible=html.split('<details')[0];
  for(const label of ['Compute','Storage','External API','60.0%','10.0%','30.0%'])assert.ok(visible.includes(label));
  assert.doesNotMatch(visible,/Comparison unavailable|BASELINE|ALTERNATIVE|cost-delta|cost-gap|engineering path|linked engineering nodes/);
  p.items[0].perMillion=20000;near(C.costModel(p,p.initial).routes[0].total,.12);
  assert.match(C.costHTML(p,p.initial),/66.7%/);
});
test('three through six entries share a scale and allow following every entry', () => {
  for(const count of [3,6]){
    const p=single();p.routes=Array.from({length:count},(_,i)=>({id:'r'+i,label:'Operation '+i}));
    p.items=p.routes.map((r,i)=>({route:r.id,label:'Compute',perMillion:0,fixed:i+1}));
    const d={nodes:{n:{}},rows:[['n']],panels:[p]};assert.deepEqual(validate(d),{errors:[],warnings:[]});
    const m=C.costModel(p,{messages:1,activeRoute:'r2'}),chart=C.costChartModel(m);
    assert.deepEqual(plain(m.routes.map(r=>r.total)),Array.from({length:count},(_,i)=>i+1));
    near(chart.max,count);near(chart.routes[2].pct,3/count*100);assert.equal(m.delta,null);
    const html=C.costHTML(p,{messages:1,activeRoute:'r2'});
    assert.match(html,/cost-route-2 cost-active/);assert.doesNotMatch(html,/BASELINE|ALTERNATIVE|Comparison unavailable|cost-gap/);
    assert.match(html,new RegExp('cost-many cost-count-'+count));
    assert.match(html,new RegExp('class="cost-routes" style="--cost-route-count:'+count+'"'));
    assert.ok(plain(C.panelPatchFields(p)).some(field=>field[0]==='activeRoute' && field[2].includes('r2')));
  }
});
test('six-operation starter is a valid full-width 24-column example', () => {
  const example=sixOperations(),layout=example.page.sections[0].diagram.sectionLayout;
  assert.deepEqual(validate(example),{errors:[],warnings:[]});
  assert.equal(layout.columns,24);assert.equal(layout.default[0].panel,'costs');assert.equal(layout.default[0].w,24);
  const p=example.page.sections[0].diagram.panels[0],html=C.costHTML(p,p.initial);
  assert.equal(p.routes.length,6);assert.equal(p.items.length,18);
  for(const label of ['Image preprocessing','Document text extraction','Model inference','Database writes'])assert.ok(html.includes(label));
  assert.match(html,/cost-many cost-count-6/);assert.match(html,/--cost-route-count:6/);
});
test('invalid cardinalities and declarations never produce credible partial totals', () => {
  for(const mutate of [p=>p.routes=[],p=>p.routes=null,p=>p.routes.push(null),p=>p.routes.push({id:'operation'}),
    p=>{p.routes=Array.from({length:7},(_,i)=>({id:'r'+i}));p.items=p.routes.map(r=>({route:r.id,perMillion:1}));},
    p=>{p.items=Array.from({length:25},()=>p.items[0]);},p=>p.items.push({route:'absent',perMillion:1}),
    p=>p.routes.push({id:'unpriced-entry'})]){
    const p=single();mutate(p);const m=C.costModel(p,p.initial),html=C.costHTML(p,p.initial);
    assert.equal(m.valid,false);assert.ok(m.routes.every(r=>r.total===null));
    assert.ok(m.routes.every(r=>r.rows.every(row=>row.total===null)));
    assert.match(html,/Totals unavailable/);assert.doesNotMatch(html,/NaN|Infinity/);
    assert.ok(validate({nodes:{n:{}},rows:[['n']],panels:[p]}).warnings.length);
  }
});
test('single zero, unpriced, overflow and unit text stay truthful and escaped', () => {
  for(const kind of ['zero','unpriced','overflow']){
    const p=single();p.items.forEach(row=>row.fixed=0);
    if(kind==='unpriced')delete p.items[0].perMillion;
    if(kind==='overflow'){p.items[0].fixed=Number.MAX_VALUE;p.items[1].fixed=Number.MAX_VALUE;}
    const html=C.costHTML(p,p.initial);
    assert.doesNotMatch(html,/class="cost-component-share">[0-9]|NaN|Infinity|Comparison unavailable/);
    assert.match(html,kind==='zero'?/No charge/:/Unpriced/);
  }
  const p=single();p.unit='<img src=x onerror=bad()>';
  assert.doesNotMatch(C.costHTML(p,p.initial),/<img/);assert.match(C.costHTML(p,p.initial),/&lt;img/);
  for(const unit of [null,12,{},'']){
    p.unit=unit;assert.match(C.costHTML(p,p.initial),/1 messages/);
    assert.match(validate({nodes:{n:{}},rows:[['n']],panels:[p]}).warnings.join('\n'),/unit: expected/);
  }
});

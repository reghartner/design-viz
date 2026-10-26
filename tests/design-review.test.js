'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const commandContext=require('./workbench-command-context.cjs');
const c={URL};vm.createContext(c);vm.runInContext(readSource('validator.js')+'\n'+readSource('engine.js'),c);
const fixture=()=>structuredClone(require('../examples/design-review/design-review.spec.json'));
const diagram=spec=>spec.page.sections[0].diagram;
const plain=v=>JSON.parse(JSON.stringify(v));
test('review annotations validate strictly while omission preserves old specs',()=>{
  const spec=fixture(),d=diagram(spec);assert.deepEqual(plain(c.validate(c.normalize(spec)).errors),[]);
  for(const [target,key,value] of [[d.nodes.router,'status','maybe'],[d.edges[0],'status',['open']],[d.nodes.button,'presentation','primary'],[d.steps[0],'verdict',{}],[d.steps[0],'ref',4],[d,'showStepIds','false']]){
    const before=target[key];target[key]=value;
    assert.ok(c.validate(c.normalize(spec)).errors.some(e=>e.includes('.'+key+':')),key);
    target[key]=before;
  }
  Object.values(d.nodes).forEach(n=>{delete n.status;delete n.presentation;});d.edges.forEach(e=>delete e.status);
  d.steps.forEach(s=>{delete s.verdict;delete s.ref;});d.paths.forEach(p=>delete p.basedOn);delete d.showStepIds;
  assert.deepEqual(plain(c.validate(c.normalize(spec)).errors),[]);assert.equal(c.pathReviewComparison(d,'proposed'),null);
});
test('comparison reads current registry bodies and aligns full ordinals with explicit empty tails',()=>{
  const d=diagram(fixture()),before=JSON.stringify(d),model=c.pathReviewComparison(d,'proposed');
  assert.deepEqual(plain(model.rows.map(r=>[r.baseIndex,r.currentIndex])),[[0,0],[1,3],[2,4],[null,5]]);
  assert.equal(model.rows[1].base,d.steps[1]);assert.equal(model.rows[1].current,d.steps[3]);
  assert.equal(JSON.stringify(d),before);
  d.steps[1].text='Base edited';assert.equal(c.pathReviewComparison(d,'proposed').rows[1].base.text,'Base edited');
  d.paths[1].steps=['press'];assert.equal(c.pathReviewComparison(d,'proposed').rows[2].current,null);
});
test('missing, self and chained cyclic comparison paths reject safely without recursion',()=>{
  for(const setup of [d=>d.paths[1].basedOn='missing',d=>d.paths[1].basedOn='proposed',d=>d.paths[0].basedOn='proposed']){
    const spec=fixture(),d=diagram(spec);setup(d);
    assert.ok(c.validate(c.normalize(spec)).errors.some(e=>e.includes('.basedOn')));
    assert.equal(c.pathReviewComparison(d,'proposed'),null);
  }
  const d=diagram(fixture());d.paths.push({id:'third',basedOn:'proposed',steps:['press']});d.paths[0].basedOn='third';
  assert.equal(c.pathReviewComparison(d,'third'),null);
});
test('baseline and statuses do not change protocol metadata or state across paths',()=>{
  const d=diagram(fixture()),before=JSON.stringify(d),today=c.diagramForPath(d,'today'),proposed=c.diagramForPath(d,'proposed');
  assert.equal(c.reviewEdgeBaseline(d,d.edges[0]),true);assert.equal(c.reviewEdgeBaseline(d,d.edges[2]),false);
  const a=c.foldPanelStates(today).home,b=c.foldPanelStates(proposed).home;
  assert.equal(c.homemapModel(d.panels[0],a[2]).devices[0].x,80);
  assert.equal(c.homemapModel(d.panels[0],b[2]).devices[0].x,190);
  assert.deepEqual(plain(c.homemapModel(d.panels[0],b[2]).signals[0].fromXY),{x:190,y:60});
  assert.equal(c.foldNodeTones(today)[2].archive,undefined);assert.equal(c.foldNodeTones(proposed)[2].archive,'warn');
  assert.equal(JSON.stringify(d),before);
  assert.equal(c.resolveSourceStep(d,'proposed','proposed-save').pathIndex,2);
  assert.equal(c.pathReviewComparison(d,'proposed').rows[2].base.id,'today-save');
});
test('proposed and open connections stand out between baseline nodes unless explicitly marked baseline',()=>{
  const d=diagram(fixture()),edge=d.edges[0];
  for(const status of ['proposed','open']){edge.status=status;assert.equal(c.reviewEdgeBaseline(d,edge),false);}
  edge.presentation='baseline';assert.equal(c.reviewEdgeBaseline(d,edge),true);
  delete edge.presentation;edge.status='decided';assert.equal(c.reviewEdgeBaseline(d,edge),true);
});
test('float titles with subtitles have physical room for two title lines and subtitle',()=>{
  const d=diagram(fixture()),p=c.layout(d).pos.router;
  assert.equal(p.float,true);assert.equal(p.h,58);assert.equal(p.w,150);
  delete d.nodes.router.sub;assert.equal(c.layout(d).pos.router.h,50);
});
test('review renderers escape references and use a separate automatic status legend',()=>{
  const d=diagram(fixture()),html=c.reviewStepHTML({verdict:'replace',text:'New event',ref:'<img src=x onerror=alert(1)>'});
  assert.match(html,/Replace/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
  const legend=c.reviewLegendHTML(d);for(const text of ['Proposed','Open','Decided','baseline'])assert.ok(legend.includes(text));
  d.nodes.router.hidden=true;assert.ok(!c.reviewLegendHTML(d).includes('Proposed'));
  d.nodes.orphan={status:'proposed'};assert.ok(!c.reviewLegendHTML(d).includes('Proposed'));
});
test('path settings can add/remove comparison, reject cycles, and retain existing metadata',()=>{
  const q=commandContext(['graph','narrative']),spec=fixture(),d=diagram(spec),source=JSON.stringify(spec,null,2);
  const plan=q.planPathStepEdit(source,spec,0,'proposed',3,'metadata',{label:'Plan',color:'#38bdf8',basedOn:'today'});
  assert.equal(plan.error,undefined);assert.equal(diagram(JSON.parse(plan.text)).paths[1].basedOn,'today');
  const invalid=q.planPathStepEdit(source,spec,0,'today',0,'metadata',{label:'Today',color:'#38bdf8',basedOn:'proposed'});
  assert.ok(invalid.error);
  const cleared=q.planPathStepEdit(source,spec,0,'proposed',3,'metadata',{label:'Plan',color:'#38bdf8',basedOn:''});
  assert.equal(cleared.error,undefined);assert.equal(diagram(JSON.parse(cleared.text)).paths[1].basedOn,undefined);
});
test('Home device positions carry independently, invalid partial pairs do not move, and reset preserves state',()=>{
  const q=commandContext(['graph','narrative']),spec=fixture(),d=diagram(spec),panel=d.panels[0];
  const states=c.foldHomemapStates(panel,[{panels:{home:{gateway:{x:150,y:20,state:'rx'}}}},{panels:{home:{gateway:'tx'}}},{panels:{home:{gateway:{x:40}}}}]);
  for(const state of states){assert.equal(state.gateway.x,150);assert.equal(state.gateway.y,20);}
  assert.equal(states[2].gateway.state,'tx');assert.equal(states[0].gateway.state,'rx');
  const source=JSON.stringify(spec,null,2),reset=q.planHomemapDeviceAttribute(source,spec,0,3,'home','gateway','position',undefined);
  assert.equal(reset.error,undefined);assert.deepEqual(diagram(JSON.parse(reset.text)).steps[3].panels.home.gateway,{state:'rx'});
  for(const patch of [{x:12},{x:12,y:Infinity},{x:321,y:40}])assert.ok(q.planStepHomemapField(source,spec,0,3,'home','gateway',patch).error);
  const warnings=[];c.homemapPatchWarnings({gateway:{x:'bad',y:'bad'}},'patch',{devices:{gateway:panel.devices[0]},subjects:{}},warnings);assert.equal(warnings.length,1);
  const outside=c.homemapModel(panel,{gateway:{x:400,y:-12}});assert.equal(outside.devices[0].x,320);assert.equal(outside.devices[0].y,0);
  assert.equal(JSON.stringify(spec,null,2),source);
});

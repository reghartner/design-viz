const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {readSource}=require('../tools/source-loader.cjs');
function harness(){
  const ctx={Map,Set,Promise};vm.createContext(ctx);
  vm.runInContext(['canon.js','validator.js','viewer/tour-progress.js','tour.config.js','workbench/onboarding.js'].map(name=>readSource(name)).join('\n'),ctx);
  return ctx;
}
const plain=v=>JSON.parse(JSON.stringify(v));
test('the shared example and every tour chapter validate against the shipped contracts',()=>{
  const c=harness(),raw=JSON.parse(fs.readFileSync('src/starters/onboarding.json','utf8'));
  const findings=c.validate(c.normalize(raw));assert.deepEqual(plain(findings),{errors:[],warnings:[]});
  const layouts=raw.page.sections[0].diagram.layouts,explore=layouts.find(layout=>layout.id==='explore');
  assert.equal(explore.name,'System flow');assert.equal(explore.presentation,'explore');
  assert.equal(raw.page.sections[0].diagram.defaultLayout,'story');
  for(const chapter of ['viewer','agent','manual'])assert.deepEqual(plain(c.tourLintConfig(c.workbenchPracticeLessons(chapter))),[]);
  assert.deepEqual(plain(c.FlowCanon.catalog(c.workbenchTourCatalog()).services.map(s=>s.title)),['Event service','Notifications','Recording service']);
});
test('practice HTML blocks external effects and rejects unknown chapters',()=>{
  const c=harness(),html=c.workbenchPracticeSource('<!doctype html><html><head><title>Workbench</title></head><body></body></html>','manual');
  assert.match(html,/<html data-flowview-practice="manual"/);
  assert.match(html,/connect-src 'none'/);assert.match(html,/frame-src 'none'/);assert.match(html,/form-action 'none'/);
  assert.throws(()=>c.workbenchPracticeSource('<html><head>', 'bad" onload="alert(1)'));
});
test('viewer dismissal and feature history reuse existing keys without marking unseen features',()=>{
  const c=harness(),store=new Map(),win={document:{cookie:''},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}};
  assert.equal(c.workbenchTourHasViewerHistory(win),false);
  c.createTourProgress(win).seen({id:'mode-step'});
  assert.equal(c.workbenchTourHasViewerHistory(win),false);
  store.set('dv_tour_v1','done');assert.equal(c.workbenchTourHasViewerHistory(win),true);
  assert.deepEqual(JSON.parse(store.get('dv_tour_features_v1')).seen,['mode-step']);
});
test('the practice transport stages review and invokes real apply only when accepted',async()=>{
  const c=harness(),practice=c.createWorkbenchPracticeAgent(),source=JSON.stringify({page:{sections:[{diagram:{nodes:{cloud:{title:'Events'}}}}]}});
  const current={source,project:1,ledger:'before'},applied=[],updates=[];
  const client=practice.connect({setLedger:v=>current.ledger=v,snapshot:()=>current,apply:(text,expected,proposal)=>{applied.push({text,expected,proposal});return {ok:true};}},v=>updates.push(v));
  client.propose();assert.equal(applied.length,0);assert.equal(practice.hasReview(),true);
  await practice.copy('example context');assert.equal(practice.copied(),'example context');
  await client.acceptReview(999);assert.equal(applied.length,0);
  const snapshot=client.reviewSnapshot();await client.acceptReview(snapshot.review.version);
  assert.equal(applied.length,1);assert.equal(applied[0].expected,current);
  assert.match(applied[0].proposal.ledger,/Internet-down/i);assert.equal(practice.hasReview(),false);
  client.propose();assert.equal(client.reviewSnapshot(),null,'moving to another lesson must not recreate an accepted proposal');
  assert.equal(updates.at(-1).review,null);
});

test('landing selects the first non-detail diagram using canonical section records',()=>{
  const c=harness();
  for(const raw of [
    {nodes:{a:{}},rows:[['a']]},
    {page:{sections:[{heading:'Intro'},{id:'child',detailOnly:true,diagram:{nodes:{a:{}},rows:[['a']]}},{id:'company',diagram:{nodes:{b:{}},rows:[['b']]}}]}},
    {blocks:[{tabs:[{label:'Intro',sections:[{heading:'Intro'}]},{label:'Story',sections:[{id:'company',diagram:{nodes:{b:{}},rows:[['b']]}}]}]}]}
  ]){
    const records=c.sectionRecords(c.normalize(raw));
    const ctl={sections:records.map(r=>({...r,hasDiagram:!!r.section.diagram,detailOnly:!!r.section.detailOnly}))};
    const selected=c.workbenchLandingSection(ctl);
    assert.equal(selected.reference,records.length===1?records[0].reference:'company');
    let activated=null;ctl.tabBlocks=[{index:1,select:(tab,focus,activate)=>activated={tab,focus,activate}}];
    c.workbenchLandingActivate(ctl,selected);
    assert.deepEqual(activated,selected.tabBlock?{tab:1,focus:false,activate:false}:null);
  }
});

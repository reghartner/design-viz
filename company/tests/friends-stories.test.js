'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {cli}=require('./theme-fixture.cjs');
const root=path.resolve(__dirname,'../..');
const entrypoint=name=>JSON.parse(cli(['--entrypoint',name], 'science,sports'));
const arcs=[
  ['season-of-seats',['schaefer-effect','schedule-drop','bobblehead-clock','group-holds'],45],
  ['sell-the-inventory',['on-sale-day','pace-and-member-floor','heritage-night-link','first-10000-vs-everyone'],45],
  ['serve-game-night',['buyer-is-not-attendee','gate-night','score-first','morning-after'],58],
  ['build-next-season',['friend-to-member','clinch-or-fade'],25],
];
test('Friends publishes the consolidated marketing document, four sports arcs and the science story',()=>{
  const runtime={console,URL};vm.runInNewContext(entrypoint('native').source,runtime);
  const registry=JSON.parse(fs.readFileSync(path.join(root,'canon.json')));
  assert.deepEqual(registry.diagrams.map(d=>path.basename(d.folder)),[...arcs.map(a=>a[0]),'nsp15-insertion-evidence','islanders-marketing']);
  for(const id of ['member-campaign','group-night','fan-event-rsvp']){
    const source=fs.readFileSync(path.join(root,'diagrams/friends',id,id+'.spec.json'),'utf8');
    assert.ok(!fs.existsSync(path.join(root,'packages/sports/diagrams',id,id+'.spec.json')),'retired image-heavy output must not duplicate the active document in the offline kit');
    const raw=JSON.parse(source),result=runtime.validate(runtime.normalize(raw));
    assert.deepEqual(Array.from(result.errors),[]);assert.deepEqual(Array.from(result.warnings),[]);
    assert.equal(raw.page.sections[0].diagram.panels.length,2);
    assert.ok(Buffer.byteLength(source)<2*1024*1024);
  }
  let panels=0,steps=0;
  for(const [id,sections,count] of arcs){
    const text=fs.readFileSync(path.join(root,`packages/sports/diagrams/${id}/${id}.spec.json`),'utf8'),raw=JSON.parse(text),page=runtime.normalize(raw);
    assert.equal(fs.readFileSync(path.join(root,`diagrams/friends/${id}/${id}.spec.json`),'utf8'),text);
    assert.deepEqual(raw.page.sections.map(s=>s.id),sections);
    assert.equal(raw.page.sections.reduce((n,s)=>n+s.diagram.steps.length,0),count);
    assert.equal(raw.page.skin,'islanders');
    const result=runtime.validate(page);assert.deepEqual(Array.from(result.errors),[]);assert.deepEqual(Array.from(result.warnings),[]);assert.deepEqual(Array.from(runtime.lintPage(page)),[]);
    const manifest=JSON.parse(fs.readFileSync(path.join(root,`packages/sports/diagrams/${id}/manifest.json`))).pages[0];
    assert.equal(manifest.title,raw.page.title);assert.equal(manifest.spec,id+'.spec.json');
    panels+=raw.page.sections.reduce((n,s)=>n+s.diagram.panels.length,0);steps+=count;
  }
  assert.equal(steps,173);assert.equal(panels,46);
});

test('marketing consolidation preserves all approved story data in three native tabs',()=>{
  const id='islanders-marketing',folder=path.join(root,'packages/sports/diagrams',id);
  const text=fs.readFileSync(path.join(folder,id+'.spec.json'),'utf8'),raw=JSON.parse(text);
  assert.ok(Buffer.byteLength(text)<4*1024*1024,'whole-file Workbench import limit');
  for(const suffix of ['spec.json','ledger.md'])assert.equal(fs.readFileSync(path.join(root,'diagrams/friends',id,id+'.'+suffix),'utf8'),fs.readFileSync(path.join(folder,id+'.'+suffix),'utf8'));
  assert.equal(raw.page.canon.id,id);
  const tabs=raw.page.blocks[0].tabs;
  assert.deepEqual(tabs.map(t=>t.label),['Member campaign','Group night','Fan event RSVP']);
  const withoutPixels=value=>JSON.parse(JSON.stringify(value,(k,v)=>k==='src'&&typeof v==='string'&&v.startsWith('data:image/')?'[embedded image]':v));
  let paths=0,steps=0,panels=0;
  for(const [index,sourceId]of ['member-campaign','group-night','fan-event-rsvp'].entries()){
    const original=JSON.parse(fs.readFileSync(path.join(root,'diagrams/friends',sourceId,sourceId+'.spec.json'),'utf8'));
    assert.deepEqual(withoutPixels(tabs[index].sections),withoutPixels(original.page.sections));
    const d=tabs[index].sections[0].diagram;paths+=d.paths.length;steps+=d.steps.length;panels+=d.panels.length;
  }
  assert.equal(paths,8);assert.equal(steps,30);assert.equal(panels,6);
  const runtime={console,URL};vm.runInNewContext(entrypoint('native').source,runtime);
  const normalized=runtime.normalize(raw),result=runtime.validate(normalized);
  assert.deepEqual(Array.from(result.errors),[]);assert.deepEqual(Array.from(result.warnings),[]);assert.deepEqual(Array.from(runtime.lintPage(normalized)),[]);
});

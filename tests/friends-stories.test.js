'use strict';
process.env.FLOWVIEW_PACKAGES=[...new Set([...(process.env.FLOWVIEW_PACKAGES || '').split(',').filter(Boolean),'sports'])].join(',');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const root=path.resolve(__dirname,'..');
const arcs=[
  ['season-of-seats',['schaefer-effect','schedule-drop','bobblehead-clock','group-holds'],45],
  ['sell-the-inventory',['on-sale-day','pace-and-member-floor','heritage-night-link','first-10000-vs-everyone'],45],
  ['serve-game-night',['buyer-is-not-attendee','gate-night','score-first','morning-after'],58],
  ['build-next-season',['friend-to-member','clinch-or-fade'],25],
];
test('Friends publishes four complete sports arcs and the science story with matching package sources',()=>{
  const runtime={console,URL};vm.runInNewContext(entrypoint('native').source,runtime);
  const registry=JSON.parse(fs.readFileSync(path.join(root,'canon.json')));
  assert.deepEqual(registry.diagrams.map(d=>path.basename(d.folder)),[...arcs.map(a=>a[0]),'copy-gate']);
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

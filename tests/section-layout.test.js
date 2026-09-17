'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx={console,URLSearchParams};
for(const file of ['validator.js','builder.workbench.js','layout.workbench.js'])
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
function diagram(){return {nodes:{a:{title:'Camera'},b:{title:'Cloud'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],
  primaryPanel:'home',panels:[{id:'home',type:'homemap'},{id:'phone',type:'phone'},{id:'q',type:'queue'}],
  steps:[{id:'one',nodes:['a'],panels:{phone:{state:'ringing'}}}],paths:[{id:'happy',steps:['one']}]};}
const board={x:0,y:0,w:8,h:12}, phone={panel:'phone',x:8,y:0,w:4,h:6};
function noOverlap(items){
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const a=items[i],b=items[j];
    assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),JSON.stringify([a,b]));
  }
}
test('omitted section layouts preserve the existing presentation; profiles fall back to default',()=>{
  const d=diagram();assert.equal(ctx.sectionLayoutItems(d,'confluence'),null);
  d.sectionLayout={default:[board,phone]};
  assert.deepEqual(plain(ctx.sectionLayoutItems(d,'confluence')),plain(ctx.sectionLayoutItems(d,'default')));
  d.sectionLayout.confluence=[{...board,w:12,h:9}];
  assert.equal(ctx.sectionLayoutItems(d,'confluence')[0].w,12);
  assert.equal(ctx.sectionLayoutItems(d,'backstage')[0].w,8);
  d.sectionLayout.backstage='bad';assert.equal(ctx.sectionLayoutItems(d,'backstage')[0].w,8);
});
test('new panels and the diagram stay visible in incomplete layouts; stale or duplicate tiles are ignored',()=>{
  const d=diagram();d.sectionLayout={default:[phone,phone,{...board,panel:'deleted'},{...board,w:13}]};
  const result=ctx.sectionLayoutItems(d,'default');
  assert.equal(result.length,4);assert.equal(result.filter(t=>t.panel==='phone').length,1);
  assert.ok(result.some(t=>!t.panel));assert.ok(result.some(t=>t.panel==='home'));noOverlap(result);
  assert.equal(d.sectionLayout.default.length,4,'renderer does not rewrite source');
});
test('host presets are deterministic, compact, non-overlapping and preserve all tiles',()=>{
  const d=diagram();
  for(const host of ['default','backstage','confluence']){
    const a=ctx.sectionLayoutPreset(d,host),b=ctx.sectionLayoutPreset(d,host);
    assert.deepEqual(plain(a),plain(b));assert.equal(a.length,5);noOverlap(a);
    const warnings=[];ctx.sectionLayoutWarnings({...d,sectionLayout:{[host]:a}},'diagram',warnings);assert.deepEqual(warnings,[]);
    assert.equal(a[0].panel,'home');assert.equal(a[0].w,host==='confluence'?12:8);
    if(host==='backstage')assert.deepEqual(plain(a.find(t=>t.panel==='phone')),{panel:'phone',x:8,y:0,w:4,h:10});
  }
});
test('drag keeps the selected location and moves colliding neighbors down without altering input',()=>{
  const items=[board,phone,{panel:'home',x:0,y:12,w:12,h:12}],before=JSON.stringify(items);
  const next=ctx.sectionLayoutGesture(items,'panel:phone',-8,0,false);
  assert.equal(next[1].x,0);assert.equal(next[1].y,0);assert.equal(next[0].y,6);assert.equal(next[2].y,18);noOverlap(next);
  assert.equal(JSON.stringify(items),before);
});
test('movement and resize clamp to the grid and minimum readable size',()=>{
  const move=ctx.sectionLayoutGesture([board],'diagram',100,-100,false)[0];assert.equal(move.x,4);assert.equal(move.y,0);
  const resize=ctx.sectionLayoutGesture([phone],'panel:phone',100,-100,true)[0];assert.equal(resize.w,4);assert.equal(resize.h,3);
  assert.equal(ctx.sectionLayoutGesture([board],'diagram',0,100,true)[0].h,40);
});
test('layout plans preserve story content and other hosts across bare, section and tabbed specs',()=>{
  for(const wrap of [d=>d,d=>({sections:[{diagram:d}]}),d=>({page:{blocks:[{tabs:[{label:'Tab',sections:[{diagram:d}]}]}]}})]){
    const d=diagram();d.sectionLayout={default:[board],confluence:[{...board,w:12}]};
    const raw=wrap(d),text=JSON.stringify(raw,null,2),plan=ctx.planSectionLayout(text,raw,0,'backstage',[board,phone]);
    assert.ok(!plan.error,plan.error);const nextRaw=JSON.parse(plan.text),next=ctx.builderDiagram(plan.text,nextRaw,0).d;
    assert.deepEqual(next.steps,d.steps);assert.deepEqual(next.paths,d.paths);assert.deepEqual(next.panels,d.panels);
    assert.deepEqual(next.sectionLayout.default,[board]);assert.deepEqual(next.sectionLayout.confluence,[{...board,w:12}]);
    assert.deepEqual(next.sectionLayout.backstage,[board,phone]);
    const reset=ctx.planSectionLayout(plan.text,nextRaw,0,'backstage',null);assert.deepEqual(JSON.parse(reset.text),raw);
  }
});
test('resetting the last layout removes the field instead of leaving unused state',()=>{
  const d=diagram();d.sectionLayout={default:[board]};const text=JSON.stringify(d),p=ctx.planSectionLayout(text,d,0,'default',null);
  assert.ok(!p.error,p.error);assert.ok(!('sectionLayout' in JSON.parse(p.text)));
});
test('invalid positions, duplicate identities and unknown profiles fail without a partial write',()=>{
  const d=diagram(),text=JSON.stringify(d);
  for(const items of [[{...board,x:-1}],[{...board,w:13}],[{...board,h:2}],[{...board,y:501}],[{...board,x:0.2}],[board,board],[{...phone,panel:'missing'}],[null]]){
    const p=ctx.planSectionLayout(text,d,0,'default',items);assert.ok(p.error,JSON.stringify(items));assert.equal(p.text,undefined);
  }
  assert.ok(ctx.planSectionLayout(text,d,0,'unknown',[board]).error);
});
test('renaming and bulk deleting a panel update every saved host arrangement',()=>{
  const d=diagram();d.sectionLayout={default:[board,phone],backstage:[phone],confluence:[phone]};
  let text=JSON.stringify(d),raw=d,p=ctx.planRenamePanel(text,raw,0,1,'mobile');assert.ok(!p.error,p.error);
  raw=JSON.parse(p.text);for(const list of Object.values(raw.sectionLayout))assert.ok(list.some(t=>t.panel==='mobile'));
  p=ctx.planBulkDelete(p.text,[{section:0,kind:'panel',index:1}]);assert.ok(!p.error,p.error);
  raw=JSON.parse(p.text);for(const list of Object.values(raw.sectionLayout))assert.ok(list.every(t=>!t.panel));
  assert.equal(raw.steps[0].panels,undefined);
});

test('optimization fills the row without supporting panels and respects any explicit centerpiece',()=>{
  for(const panels of [[],[{id:'home',type:'homemap'}],[{id:'home',type:'state'}]]){
    const d=diagram();d.panels=panels;
    for(const target of ['default','backstage','confluence']){
      const tiles=ctx.sectionLayoutPreset(d,target);assert.ok(tiles.every(t=>t.w===12));noOverlap(tiles);
      if(panels.length)assert.equal(tiles[0].panel,'home');
    }
  }
});


test('step controls have a distinct identity and survive profile round trips and collision-aware moves',()=>{
  const d=diagram();d.panels.push({id:'steps',type:'state'});
  const items=ctx.sectionLayoutPreset(d,'confluence');
  assert.equal(items.filter(t=>ctx.sectionLayoutKey(t)==='steps').length,1);
  assert.equal(items.filter(t=>ctx.sectionLayoutKey(t)==='panel:steps').length,1);
  d.sectionLayout={confluence:items};
  assert.deepEqual(plain(ctx.sectionLayoutItems(d,'confluence')),plain(items));
  const before=JSON.stringify(d),moved=ctx.sectionLayoutGesture(items,'steps',0,-12,false);
  assert.equal(moved.find(t=>t.controls==='steps').y,0);noOverlap(moved);assert.equal(JSON.stringify(d),before);
  const p=ctx.planSectionLayout(before,d,0,'backstage',moved);assert.ok(!p.error,p.error);
  assert.deepEqual(JSON.parse(p.text).sectionLayout.confluence,plain(items));
  assert.equal(JSON.parse(p.text).sectionLayout.backstage.find(t=>t.controls==='steps').y,0);
});
test('old layouts retain attached controls until explicitly detached; separation is idempotent and preserves source',()=>{
  const d=diagram();d.sectionLayout={default:[board,phone]};
  const items=ctx.sectionLayoutItems(d,'default'),before=JSON.stringify(items);
  assert.ok(!items.some(t=>t.controls));
  const detached=ctx.sectionLayoutDetachSteps(d,items),graph=detached.find(t=>ctx.sectionLayoutKey(t)==='diagram'),controls=detached.find(t=>t.controls);
  assert.equal(graph.h,8);assert.deepEqual(plain(controls),{controls:'steps',x:0,y:8,w:8,h:4});
  noOverlap(detached);assert.equal(JSON.stringify(items),before);
  assert.equal(ctx.sectionLayoutDetachSteps(d,detached),detached);
  const tiny=ctx.sectionLayoutDetachSteps(d,[{...board,h:3},{...phone,x:0,y:3,w:8}]);noOverlap(tiny);
  assert.ok(tiny.every(t=>t.h>=3));
});
test('step-free and ambient-only diagrams do not show control tiles; saved positions can be reused later',()=>{
  for(const overrides of [{steps:[]},{view:'ambient-only'}]){
    const d={...diagram(),...overrides},saved={controls:'steps',x:0,y:12,w:12,h:4};
    d.sectionLayout={default:[board,saved]};
    assert.ok(!ctx.sectionLayoutPreset(d,'default').some(t=>t.controls));
    const items=ctx.sectionLayoutItems(d,'default');assert.ok(!items.some(t=>t.controls));
    assert.equal(ctx.sectionLayoutDetachSteps(d,items),items);
    const warnings=[];ctx.sectionLayoutWarnings(d,'diagram',warnings);assert.deepEqual(warnings,[]);
    assert.ok(!ctx.planSectionLayout(JSON.stringify(d),d,0,'backstage',items).error);
  }
});
test('control tile declarations reject invalid or ambiguous identities and duplicates',()=>{
  const d=diagram(),text=JSON.stringify(d),tile={controls:'steps',x:0,y:12,w:12,h:4};
  for(const items of [[{...tile,controls:'other'}],[{...tile,controls:{toString:null}}],[{...tile,panel:'phone'}],[tile,tile]]){
    assert.ok(ctx.planSectionLayout(text,d,0,'default',items).error);
    const valid=ctx.sectionLayoutItems({...d,sectionLayout:{default:items}},'default');
    assert.ok(valid.filter(t=>t.controls).length<=1);
  }
});


test('layout names are independent of host tiles and survive one-field edits and clearing',()=>{
  const raw={page:{sections:[{diagram:diagram()}]}},d=raw.page.sections[0].diagram;
  d.sectionLayout={default:[board],confluence:[phone]};const text=JSON.stringify(raw);
  const named=ctx.planSectionLayoutName(text,raw,0,'  Front door  ');assert.ok(!named.error,named.error);
  const next=JSON.parse(named.text);assert.equal(next.page.sections[0].diagram.layoutName,'Front door');
  delete next.page.sections[0].diagram.layoutName;assert.deepEqual(next,raw);
  const cleared=ctx.planSectionLayoutName(named.text,JSON.parse(named.text),0,' ');assert.deepEqual(JSON.parse(cleared.text),raw);
  for(const bad of [null,42,'x'.repeat(41)])assert.ok(ctx.planSectionLayoutName(text,raw,0,bad).error);
  for(const bad of ['',42,'x'.repeat(41)]){
    const warnings=ctx.validate({sections:[{diagram:{...diagram(),layoutName:bad}}]}).warnings;
    assert.ok(warnings.some(w=>w.includes('layoutName')));
  }
});

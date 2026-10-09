'use strict';
const {readSource} = require('../tools/source-loader.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const commandContext = require('./workbench-command-context.cjs');
const ctx=commandContext(['graph','narrative','layout']);
const plain=x=>JSON.parse(JSON.stringify(x));
function diagram(){return {nodes:{a:{title:'Camera'},b:{title:'Cloud'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],
  primaryPanel:'home',panels:[{id:'home',type:'homemap'},{id:'phone',type:'phone'},{id:'q',type:'queue'}],
  steps:[{id:'one',nodes:['a'],panels:{phone:{state:'ringing'}}}],paths:[{id:'happy',steps:['one']}]};}
const doubled=items=>items.map(it=>({...it,x:it.x*2,w:it.w*2}));
const migrated=value=>({...Object.fromEntries(Object.entries(value).map(([key,items])=>[key,Array.isArray(items)?doubled(items):items])),columns:24});
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
  assert.equal(ctx.sectionLayoutItems(d,'confluence')[0].w,24);
  assert.equal(ctx.sectionLayoutItems(d,'backstage')[0].w,16);
  d.sectionLayout.backstage='bad';assert.equal(ctx.sectionLayoutItems(d,'backstage')[0].w,16);
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
    const warnings=[];ctx.sectionLayoutWarnings({...d,sectionLayout:{columns:24,[host]:a}},'diagram',warnings);assert.deepEqual(warnings,[]);
    assert.equal(a[0].panel,'home');assert.equal(a[0].w,host==='confluence'?24:16);
    if(host==='backstage')assert.deepEqual(plain(a.find(t=>t.panel==='phone')),{panel:'phone',x:16,y:0,w:8,h:10});
  }
});
test('drag keeps the selected location and moves colliding neighbors down without altering input',()=>{
  const items=[board,phone,{panel:'home',x:0,y:12,w:12,h:12}],before=JSON.stringify(items);
  const next=ctx.sectionLayoutGesture(items,'panel:phone',-8,0,false);
  assert.equal(next[1].x,0);assert.equal(next[1].y,0);assert.equal(next[0].y,6);assert.equal(next[2].y,18);noOverlap(next);
  assert.equal(JSON.stringify(items),before);
});
test('movement and resize clamp to the grid and minimum readable size',()=>{
  const move=ctx.sectionLayoutGesture([board],'diagram',100,-100,false)[0];assert.equal(move.x,16);assert.equal(move.y,0);
  const resize=ctx.sectionLayoutGesture([phone],'panel:phone',100,-100,true)[0];assert.equal(resize.w,16);assert.equal(resize.h,3);
  assert.equal(ctx.sectionLayoutGesture([board],'diagram',0,100,true)[0].h,40);
});
test('layout plans preserve story content and other hosts across bare, section and tabbed specs',()=>{
  for(const wrap of [d=>d,d=>({sections:[{diagram:d}]}),d=>({page:{blocks:[{tabs:[{label:'Tab',sections:[{diagram:d}]}]}]}})]){
    const d=diagram();d.sectionLayout={default:[board],confluence:[{...board,w:12}]};
    const raw=wrap(d),text=JSON.stringify(raw,null,2),plan=ctx.planSectionLayout(text,raw,0,'backstage',[board,phone]);
    assert.ok(!plan.error,plan.error);const nextRaw=JSON.parse(plan.text),next=ctx.builderDiagram(plan.text,nextRaw,0).d;
    assert.deepEqual(next.steps,d.steps);assert.deepEqual(next.paths,d.paths);assert.deepEqual(next.panels,d.panels);
    assert.deepEqual(next.sectionLayout.default,doubled([board]));assert.deepEqual(next.sectionLayout.confluence,doubled([{...board,w:12}]));
    assert.deepEqual(next.sectionLayout.backstage,[board,phone]);
    const reset=ctx.planSectionLayout(plan.text,nextRaw,0,'backstage',null);const restored=ctx.builderDiagram(reset.text,JSON.parse(reset.text),0).d;assert.deepEqual(restored.sectionLayout,migrated(d.sectionLayout));
  }
});
test('resetting the last layout removes the field instead of leaving unused state',()=>{
  const d=diagram();d.sectionLayout={default:[board]};const text=JSON.stringify(d),p=ctx.planSectionLayout(text,d,0,'default',null);
  assert.ok(!p.error,p.error);assert.ok(!('sectionLayout' in JSON.parse(p.text)));
});
test('invalid positions, duplicate identities and unknown profiles fail without a partial write',()=>{
  const d=diagram(),text=JSON.stringify(d);
  for(const items of [[{...board,x:-1}],[{...board,w:25}],[{...board,h:2}],[{...board,y:501}],[{...board,x:0.2}],[board,board],[{...phone,panel:'missing'}],[null]]){
    const p=ctx.planSectionLayout(text,d,0,'default',items);assert.ok(p.error,JSON.stringify(items));assert.equal(p.text,undefined);
  }
  assert.ok(ctx.planSectionLayout(text,d,0,'unknown',[board]).error);
});
test('renaming and bulk deleting a panel update every saved host arrangement',()=>{
  const d=diagram();d.sectionLayout={columns:24,default:doubled([board,phone]),backstage:doubled([phone]),confluence:doubled([phone])};
  let text=JSON.stringify(d),raw=d,p=ctx.planRenamePanel(text,raw,0,1,'mobile');assert.ok(!p.error,p.error);
  raw=JSON.parse(p.text);assert.equal(raw.sectionLayout.columns,24);for(const list of Object.values(raw.sectionLayout).filter(Array.isArray))assert.ok(list.some(t=>t.panel==='mobile'));
  p=ctx.planBulkDelete(p.text,[{section:0,kind:'panel',index:1}]);assert.ok(!p.error,p.error);
  raw=JSON.parse(p.text);assert.equal(raw.sectionLayout.columns,24);for(const list of Object.values(raw.sectionLayout).filter(Array.isArray))assert.ok(list.every(t=>!t.panel));
  assert.equal(raw.steps[0].panels,undefined);
});

test('optimization fills the row without supporting panels and respects any explicit centerpiece',()=>{
  for(const panels of [[],[{id:'home',type:'homemap'}],[{id:'home',type:'state'}]]){
    const d=diagram();d.panels=panels;
    for(const target of ['default','backstage','confluence']){
      const tiles=ctx.sectionLayoutPreset(d,target);assert.ok(tiles.every(t=>t.w===24));noOverlap(tiles);
      if(panels.length)assert.equal(tiles[0].panel,'home');
    }
  }
});


test('step controls have a distinct identity and survive profile round trips and collision-aware moves',()=>{
  const d=diagram();d.panels.push({id:'steps',type:'state'});
  const items=ctx.sectionLayoutPreset(d,'confluence');
  assert.equal(items.filter(t=>ctx.sectionLayoutKey(t)==='steps').length,1);
  assert.equal(items.filter(t=>ctx.sectionLayoutKey(t)==='panel:steps').length,1);
  d.sectionLayout={columns:24,confluence:items};
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
  assert.equal(graph.h,8);assert.deepEqual(plain(controls),{controls:'steps',x:0,y:8,w:16,h:4});
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

test('named views resolve independently, with per-view host fallback and an authored default',()=>{
  const d=diagram();d.layouts=[{id:'home',name:'Resident',sectionLayout:{default:[{panel:'home',x:0,y:0,w:8,h:12},{...board,hidden:true},phone]}},{id:'engineering',name:'Engineering',sectionLayout:{default:[board,phone],confluence:[{...board,w:12,h:10}]}}];
  d.defaultLayout='engineering';const before=JSON.stringify(d);
  assert.equal(ctx.sectionLayoutItems(d,'confluence')[0].w,24);
  assert.equal(ctx.sectionLayoutItems(d,'backstage')[0].w,16);
  assert.equal(ctx.sectionLayoutItems(d,'confluence','home')[0].panel,'home');
  const resident=ctx.sectionLayoutItems(d,'default','home');
  assert.equal(resident.find(t=>ctx.sectionLayoutKey(t)==='diagram').hidden,true);
  assert.equal(resident.find(t=>t.panel==='home').y,0);
  assert.equal(resident.find(t=>t.panel==='phone').y,0,'hidden diagram does not displace the phone');
  assert.equal(JSON.stringify(d),before);
  const warnings=[];ctx.sectionLayoutWarnings(d,'diagram',warnings);assert.deepEqual(warnings,[]);
  d.layouts[1].sectionLayout={confluence:[board]};assert.ok(ctx.sectionLayoutItems(d,'backstage','engineering').length);
});
test('duplicate migrates the old arrangement once and makes all host profiles independently editable',()=>{
  const d=diagram();d.layoutName='Resident';d.sectionLayout={default:[board,phone],confluence:[{...board,w:12},phone]};
  const original=JSON.stringify(d),copy=ctx.planDuplicateSectionLayout(original,d,0,'default');assert.ok(!copy.error,copy.error);
  const next=JSON.parse(copy.text),id=copy.layoutId;assert.equal(next.layouts.length,2);assert.equal(next.defaultLayout,'layout-1');assert.equal(next.sectionLayout,undefined);
  assert.deepEqual(next.layouts[0].sectionLayout,migrated(d.sectionLayout));assert.deepEqual(next.steps,d.steps);assert.deepEqual(next.paths,d.paths);
  assert.ok(!next.layouts[1].sectionLayout.default.some(t=>t.controls==='steps'),'duplicating retains the legacy diagram/control coupling');
  let p=ctx.planSectionLayout(copy.text,next,0,'backstage',[phone,board],id);assert.ok(!p.error,p.error);
  let changed=JSON.parse(p.text);assert.deepEqual(changed.layouts[0],next.layouts[0]);assert.deepEqual(changed.layouts[1].sectionLayout.confluence,next.layouts[1].sectionLayout.confluence);
  p=ctx.planSectionLayoutName(p.text,changed,0,'Engineering',id);changed=JSON.parse(p.text);assert.equal(changed.layouts[1].name,'Engineering');assert.equal(changed.layouts[0].name,'Resident');
  p=ctx.planDefaultSectionLayout(p.text,changed,0,id);changed=JSON.parse(p.text);assert.equal(changed.defaultLayout,id);
  p=ctx.planDeleteSectionLayout(p.text,changed,0,id);changed=JSON.parse(p.text);assert.equal(changed.layouts.length,1);assert.equal(changed.defaultLayout,'layout-1');
  assert.equal(JSON.stringify(d),original);
});
test('swapping Home with the diagram exchanges geometry and visibility while preserving neighbors and controls',()=>{
  const home={panel:'home',x:0,y:0,w:8,h:12},hidden={...board,y:16,hidden:true},controls={controls:'steps',x:0,y:12,w:8,h:4};
  const items=[home,phone,controls,hidden],before=JSON.stringify(items),swapped=plain(ctx.sectionLayoutSwap(items,'panel:home','diagram'));
  assert.deepEqual(swapped[0],{panel:'home',...hidden});assert.deepEqual(swapped[3],board);
  assert.deepEqual(swapped[1],phone);assert.deepEqual(swapped[2],controls);assert.equal(JSON.stringify(items),before);
  assert.deepEqual(plain(ctx.sectionLayoutSwap(swapped,'diagram','panel:home')),items);
});
test('panel renames and deletions update every named layout and host without touching other views',()=>{
  const d=diagram();d.layouts=['resident','engineer'].map(id=>({id,name:id,sectionLayout:{default:[board,phone],confluence:[phone]}}));
  const renamed=ctx.planRenamePanel(JSON.stringify(d),d,0,1,'mobile');assert.ok(!renamed.error,renamed.error);
  const next=JSON.parse(renamed.text);for(const v of next.layouts)for(const items of Object.values(v.sectionLayout))assert.ok(items.some(it=>it.panel==='mobile'));
  const removed=ctx.planDeletePanel(renamed.text,next,0,1);for(const v of JSON.parse(removed.text).layouts)for(const items of Object.values(v.sectionLayout))assert.ok(items.every(it=>!it.panel));
});
test('malformed names, IDs, defaults and hidden controls warn safely; stale edit IDs cannot target another layout',()=>{
  const base={id:'resident',name:'Resident',sectionLayout:{default:[board]}};
  for(const layouts of [[],[null],[{...base,id:{toString:null}}],[{...base,name:''}],[{...base,id:'bad id'}],[base,base],[{...base,sectionLayout:{default:[{...board,hidden:'yes'}]}}],[{...base,sectionLayout:{default:[{controls:'steps',x:0,y:0,w:12,h:4,hidden:true}]}}]]){
    const warnings=[];ctx.sectionLayoutWarnings({...diagram(),layouts},'diagram',warnings);assert.ok(warnings.length,JSON.stringify(layouts));
  }
  const d={...diagram(),layouts:[base],defaultLayout:'missing'},warnings=[];ctx.sectionLayoutWarnings(d,'diagram',warnings);assert.match(warnings.join(),/defaultLayout/);
  assert.ok(ctx.planSectionLayout(JSON.stringify(d),d,0,'default',[phone],'deleted-id').error);
  assert.ok(ctx.planSectionLayoutName(JSON.stringify(d),d,0,'New name','deleted-id').error);
});

test('visibility checklist binds each checkbox to its own tile, exposes hidden panels and names the edited layout',()=>{
  const ctx=commandContext(['layout']);
  vm.runInContext(readSource('layout.workbench.js'),ctx);
  const changes=[],d=diagram();d.panels[0].title='Home';d.panels[1].title='Home';
  const items=ctx.sectionLayoutPreset(d,'default');items.find(t=>ctx.sectionLayoutKey(t)==='diagram').hidden=true;
  function element(tag){return {tag,children:[],attrs:{},events:{},appendChild(child){this.children.push(child);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.events[k]=fn;}};}
  const before=JSON.stringify(items),group=ctx.sectionLayoutVisibilityControl({createElement:element},d,items,'Service flow',(key,visible)=>changes.push({key,visible}));
  assert.equal(group.children[0].textContent,'Visible elements · Service flow');
  const controls=group.children.filter(e=>e.tag==='label').map(label=>label.children[0]);
  assert.equal(controls.length,4);
  const input=key=>controls.find(e=>e.attrs['data-layout-visibility']===key);
  assert.equal(input('diagram').checked,false);assert.equal(input('panel:home').checked,true);
  assert.equal(input('panel:home').attrs['aria-label'],'Show Home (home) in Service flow');
  assert.equal(input('panel:phone').attrs['aria-label'],'Show Home (phone) in Service flow');
  input('panel:home').checked=false;input('panel:home').events.change();
  input('diagram').checked=true;input('diagram').events.change();
  assert.deepEqual(changes,[{key:'panel:home',visible:false},{key:'diagram',visible:true}]);
  assert.equal(input('panel:phone').checked,true);assert.equal(input('steps'),undefined);
  assert.equal(JSON.stringify(items),before,'UI changes are committed by the owning layout editor, never mutated in place');
});

test('arrangement disclosure state survives control replacement until its Arrange session ends',()=>{
  const context=commandContext(['layout']);vm.runInContext(readSource('layout.workbench.js'),context);
  const disclosure=context.createSectionArrangementDisclosureState();
  assert.equal(disclosure.collapsed(),false);
  assert.equal(disclosure.toggle(),true);assert.equal(disclosure.collapsed(),true);
  assert.equal(disclosure.collapsed(),true,'reading retained state for replacement controls does not reopen them');
  assert.equal(disclosure.toggle(),false);assert.equal(disclosure.collapsed(),false);
  disclosure.toggle();disclosure.reset();assert.equal(disclosure.collapsed(),false,'a new Arrange session starts expanded');
});

test('optimization preserves hidden elements without reserving their space or changing other views/profiles',()=>{
  for(const target of ['default','backstage','confluence']){
    const d=diagram(),items=plain(ctx.sectionLayoutPreset(d,target));
    items.forEach(t=>{if(t.panel)t.hidden=true;});
    d.layouts=[{id:'home',name:'Home',sectionLayout:{columns:24,default:plain(ctx.sectionLayoutPreset(d,'default'))}},{id:'flow',name:'Flow',sectionLayout:{columns:24,default:items,backstage:items,confluence:items}}];
    const before=JSON.stringify(d),optimized=plain(ctx.sectionLayoutOptimize(d,target,items));
    const visible=optimized.filter(t=>!t.hidden);noOverlap(visible);
    assert.deepEqual(optimized.filter(t=>t.hidden),items.filter(t=>t.hidden));
    assert.equal(visible.find(t=>ctx.sectionLayoutKey(t)==='diagram').w,24);
    assert.equal(visible.find(t=>ctx.sectionLayoutKey(t)==='diagram').y,0);
    assert.equal(visible.find(t=>t.controls).y,12);
    const plan=ctx.planSectionLayout(before,d,0,target,optimized,'flow');assert.ok(!plan.error,plan.error);
    const next=JSON.parse(plan.text);assert.deepEqual(next.layouts[0],d.layouts[0]);
    for(const profile of ['default','backstage','confluence'].filter(p=>p!==target))assert.deepEqual(next.layouts[1].sectionLayout[profile],d.layouts[1].sectionLayout[profile]);
    assert.equal(JSON.stringify(d),before);
  }
});
test('optimization of a Home-only layout leaves the diagram hidden and keeps controls below the map',()=>{
  const d=diagram(),items=plain(ctx.sectionLayoutPreset(d,'default'));
  items.forEach(t=>{if(ctx.sectionLayoutKey(t)!=='panel:home' && !t.controls)t.hidden=true;});
  const optimized=plain(ctx.sectionLayoutOptimize(d,'default',items));
  assert.deepEqual(optimized.filter(t=>t.hidden),items.filter(t=>t.hidden));
  assert.deepEqual(optimized.filter(t=>!t.hidden).map(t=>[ctx.sectionLayoutKey(t),t.w,t.y]),[['panel:home',24,0],['steps',24,12]]);
  items.forEach(t=>{if(!t.controls)t.hidden=true;});
  assert.deepEqual(plain(ctx.sectionLayoutOptimize(d,'confluence',items)).filter(t=>!t.hidden).map(t=>[ctx.sectionLayoutKey(t),t.y]),[['steps',0]]);
});

test('attached controls share geometry, survive Optimize, and fall back to detached when the host is hidden',()=>{
  const d=diagram(),original=plain(ctx.sectionLayoutPreset(d,'default'));
  const attached=plain(ctx.sectionLayoutAttach(d,original,'panel:home'));
  assert.equal(ctx.sectionLayoutDock(attached),'panel:home');
  assert.equal(attached.find(t=>t.panel==='home').h,16);
  const normalized=plain(ctx.sectionLayoutItems({...d,sectionLayout:{columns:24,default:attached}},'default'));
  assert.equal(normalized.find(t=>t.controls).attachTo,'panel:home');
  normalized.find(t=>ctx.sectionLayoutKey(t)==='diagram').hidden=true;
  const optimized=plain(ctx.sectionLayoutOptimize(d,'default',normalized));
  assert.equal(ctx.sectionLayoutDock(optimized),'panel:home');
  assert.equal(optimized.find(t=>ctx.sectionLayoutKey(t)==='diagram').hidden,true);
  noOverlap(optimized.filter(t=>!t.hidden && !t.controls));
  optimized.find(t=>t.panel==='home').hidden=true;
  const fallback=plain(ctx.sectionLayoutOptimize(d,'default',optimized));
  assert.equal(ctx.sectionLayoutDock(fallback),null);
  assert.equal(fallback.find(t=>t.controls).attachTo,'panel:home');
  noOverlap(fallback.filter(t=>!t.hidden));
  const detached=plain(ctx.sectionLayoutAttach(d,attached,''));assert.equal(ctx.sectionLayoutDock(detached),null);noOverlap(detached);
  assert.equal(original.find(t=>t.controls).attachTo,undefined);
  const flow=plain(ctx.sectionLayoutOptimize(d,'default',ctx.sectionLayoutAttach(d,original,'diagram')));
  assert.equal(flow.find(t=>ctx.sectionLayoutKey(t)==='diagram').y,0,'the coupled diagram leads a view even when Home is also visible');
});
test('named view conversion and step selection preserve story definitions, generate stable IDs, and copy filters',()=>{
  const d=diagram();delete d.paths;d.steps.push({text:'Second'},{id:'third',text:'Third'});
  const conversion=ctx.planEnsureSectionView(JSON.stringify(d),d,0);assert.ok(!conversion.error,conversion.error);
  const named=JSON.parse(conversion.text);assert.equal(named.layouts[0].name,'Home');assert.equal(named.layouts[0].sectionLayout.default.find(t=>t.controls).attachTo,'panel:home');
  const selection=ctx.planSectionViewSteps(conversion.text,named,0,'view-1',[0,2]);assert.ok(!selection.error,selection.error);
  const selected=JSON.parse(selection.text);assert.deepEqual(selected.layouts[0].steps,['one','third']);assert.ok(selected.steps[1].id);assert.deepEqual(selected.steps[0],d.steps[0]);
  const duplicate=ctx.planDuplicateSectionLayout(selection.text,selected,0,'view-1');assert.deepEqual(JSON.parse(duplicate.text).layouts[1].steps,['one','third']);
  const all=ctx.planSectionViewSteps(selection.text,selected,0,'view-1',null);assert.equal(JSON.parse(all.text).layouts[0].steps,undefined);
  assert.ok(ctx.planSectionViewSteps(selection.text,selected,0,'view-1',[]).error);
  const removed=ctx.planDeleteStep(selection.text,selected,0,0);assert.deepEqual(JSON.parse(removed.text).layouts[0].steps,['third']);
  assert.ok(ctx.planDeleteStep(removed.text,JSON.parse(removed.text),0,1).error);
});
test('named views select whole paths without copying story content and keep path and step filters reachable',()=>{
  const d=diagram();d.steps.push({id:'failed',text:'Failed'});d.paths.push({id:'failure',label:'Failure',steps:['failed']});
  d.layouts=[{id:'resident',name:'Resident',sectionLayout:{default:[board]}}];
  const text=JSON.stringify(d),selected=ctx.planSectionViewPaths(text,d,0,'resident',['happy']);assert.ok(!selected.error,selected.error);
  const next=JSON.parse(selected.text);assert.deepEqual(next.layouts[0].paths,['happy']);assert.deepEqual(next.paths,d.paths);assert.deepEqual(next.steps,d.steps);
  const stops=ctx.planSectionViewSteps(selected.text,next,0,'resident',[0]);assert.ok(!stops.error,stops.error);
  const filtered=JSON.parse(stops.text);assert.deepEqual(filtered.layouts[0].steps,['one']);
  assert.ok(ctx.planSectionViewPaths(stops.text,filtered,0,'resident',['failure']).error,'selected paths must retain a selected stop');
  const duplicate=ctx.planDuplicateSectionLayout(stops.text,filtered,0,'resident'),copy=JSON.parse(duplicate.text).layouts[1];
  assert.deepEqual(copy.paths,['happy']);assert.deepEqual(copy.steps,['one']);
  const all=ctx.planSectionViewPaths(stops.text,filtered,0,'resident',null);assert.equal(JSON.parse(all.text).layouts[0].paths,undefined);
  assert.ok(ctx.planSectionViewPaths(stops.text,filtered,0,'resident',[]).error);
  const warnings=[];ctx.sectionLayoutWarnings({...d,layouts:[{...d.layouts[0],paths:['missing']}]},'diagram',warnings);assert.ok(warnings.some(w=>w.includes('.paths:')));
});
test('attachments follow panel renames and detach on deletion across view profiles',()=>{
  const d=diagram();d.layouts=[{id:'home',name:'Home',sectionLayout:{default:plain(ctx.sectionLayoutAttach(d,ctx.sectionLayoutPreset(d,'default'),'panel:home'))}}];
  const rename=ctx.planRenamePanel(JSON.stringify(d),d,0,0,'house'),next=JSON.parse(rename.text);
  assert.equal(next.layouts[0].sectionLayout.default.find(t=>t.controls).attachTo,'panel:house');
  const remove=ctx.planDeletePanel(rename.text,next,0,0);assert.equal(JSON.parse(remove.text).layouts[0].sectionLayout.default.find(t=>t.controls).attachTo,undefined);
  const warnings=[];d.layouts[0].steps=['missing'];d.layouts[0].sectionLayout.default.find(t=>t.controls).attachTo='panel:phone';ctx.sectionLayoutWarnings(d,'diagram',warnings);
  assert.ok(warnings.some(s=>s.includes('.steps:')));assert.ok(warnings.some(s=>s.includes('.attachTo:')));
});

test('resizing attached controls preserves visualization space, packs following tiles and clamps at the combined limit',()=>{
  const d=diagram();
  for(const key of ['diagram','panel:home']){
    const original=plain(ctx.sectionLayoutAttach(d,ctx.sectionLayoutPreset(d,'default'),key)),before=JSON.stringify(original);
    const oldHost=original.find(t=>ctx.sectionLayoutKey(t)===key),oldBar=original.find(t=>t.controls);
    const resized=plain(ctx.sectionLayoutResizeControls(d,original,oldBar.h+3));
    const host=resized.find(t=>ctx.sectionLayoutKey(t)===key),bar=resized.find(t=>t.controls);
    assert.equal(bar.h,oldBar.h+3);assert.equal(host.h,oldHost.h+3);
    assert.equal(host.h-bar.h,oldHost.h-oldBar.h);assert.equal(ctx.sectionLayoutDock(resized),key);
    noOverlap(resized.filter(t=>!t.hidden && !t.controls));assert.equal(JSON.stringify(original),before);
    const max=plain(ctx.sectionLayoutResizeControls(d,resized,100));
    assert.equal(max.find(t=>ctx.sectionLayoutKey(t)===key).h,40);
    assert.equal(max.find(t=>t.controls).h,40-(oldHost.h-oldBar.h));
    const min=plain(ctx.sectionLayoutResizeControls(d,resized,-100));assert.equal(min.find(t=>t.controls).h,3);
    assert.equal(min.find(t=>ctx.sectionLayoutKey(t)===key).h-3,oldHost.h-oldBar.h);
    for(const target of ['default','backstage','confluence']){
      const optimized=plain(ctx.sectionLayoutOptimize(d,target,resized));
      assert.equal(optimized.find(t=>t.controls).h,bar.h);assert.equal(ctx.sectionLayoutDock(optimized),key);
    }
  }
});
test('legacy combined controls gain a saved height without subtracting their height twice',()=>{
  const d=diagram(),original=[board,phone];
  const resized=plain(ctx.sectionLayoutResizeControls(d,original,6));
  assert.equal(ctx.sectionLayoutControlsRows(d,original),4);assert.equal(ctx.sectionLayoutControlsRows(d,resized),6);
  assert.equal(resized.find(t=>t.controls).attachTo,'diagram');assert.equal(resized.find(t=>ctx.sectionLayoutKey(t)==='diagram').h,14);
  const named={...d,layouts:[{id:'one',name:'One',sectionLayout:{default:original}},{id:'two',name:'Two',sectionLayout:{default:original}}]};
  const p=ctx.planSectionLayout(JSON.stringify(named),named,0,'confluence',resized,'two');assert.ok(!p.error,p.error);
  const next=JSON.parse(p.text);assert.deepEqual(next.layouts[0],named.layouts[0]);assert.deepEqual(next.layouts[1].sectionLayout.default,doubled(original));
  assert.deepEqual(next.layouts[1].sectionLayout.confluence,resized);
});
test('hidden attachment fallback and detached controls retain their custom height during optimization',()=>{
  const d=diagram(),attached=plain(ctx.sectionLayoutAttach(d,ctx.sectionLayoutPreset(d,'default'),'panel:home'));
  attached.find(t=>t.controls).h=9;attached.find(t=>t.panel==='home').hidden=true;
  for(const detach of [false,true]){
    const items=plain(attached);if(detach)delete items.find(t=>t.controls).attachTo;
    const optimized=plain(ctx.sectionLayoutOptimize(d,'confluence',items));
    assert.equal(optimized.find(t=>t.controls).h,9);assert.equal(ctx.sectionLayoutDock(optimized),null);noOverlap(optimized.filter(t=>!t.hidden));
  }
});

test('document mode overrides legacy per-View presentation without mutating layouts',()=>{
  const d=diagram();d.layouts=[{id:'business',name:'Business',sectionLayout:{default:[board,phone]}},
    {id:'engineering',name:'Engineering',presentation:'explore',sectionLayout:{default:[board,phone],confluence:[{...board,w:12}]}}];
  const before=JSON.stringify(d);
  assert.deepEqual(plain(ctx.diagramLayoutViews(d)).map(v=>v.presentation),['standard','standard']);
  const effective=ctx.diagramWithPresentation(d,'explore');
  assert.deepEqual(plain(ctx.diagramLayoutViews(effective)).map(v=>v.presentation),['explore','explore']);
  assert.equal(ctx.sectionLayoutItems(effective,'confluence','engineering')[0].w,24);
  assert.equal(JSON.stringify(d),before);
});

test('presentation edits the containing tab once and preserves every section and saved View',()=>{
  const d=diagram();d.layouts=[{id:'business',name:'Business',sectionLayout:{default:[board]}},
    {id:'engineering',name:'Engineering',presentation:'standard',sectionLayout:{default:[board,phone]}}];
  const raw={page:{presentation:'standard',blocks:[{tabs:[{label:'One',sections:[{diagram:d},{text:'Prose'}]},
    {label:'Two',presentation:'standard',sections:[{diagram:diagram()}]}]},{diagram:diagram()}]}};
  const text=JSON.stringify(raw,null,3)+'\n';
  const plan=ctx.planSectionViewPresentation(text,raw,1,null,'explore');assert.ok(!plan.error,plan.error);
  const next=JSON.parse(plan.text);assert.equal(next.page.blocks[0].tabs[0].presentation,'explore');
  assert.deepEqual(next.page.blocks[0].tabs[0].sections,raw.page.blocks[0].tabs[0].sections);
  assert.deepEqual(plain(ctx.sectionRecords(ctx.normalize(next))).map(r=>r.presentation),['explore','explore','standard','standard']);
  delete next.page.blocks[0].tabs[0].presentation;assert.deepEqual(next,raw);assert.equal(JSON.stringify(raw,null,3)+'\n',text);
  for(const value of ['',null,true,{},'cinema'])assert.ok(ctx.planSectionViewPresentation(text,raw,0,null,value).error);
  assert.ok(ctx.planSectionViewPresentation(text,raw,9,null,'explore').error);
});

test('page mode owns direct sections and bare diagrams without promoting or rewriting Views',()=>{
  for(const wrap of [d=>d,d=>({sections:[{diagram:d},{diagram:diagram()}]}),d=>({page:{sections:[{diagram:d},{diagram:diagram()}]}})]){
    const d=diagram(),raw=wrap(d),text=JSON.stringify(raw);
    const plan=ctx.planSectionViewPresentation(text,raw,0,'home','explore');assert.ok(!plan.error,plan.error);
    const next=JSON.parse(plan.text),owner=next.page || next;assert.equal(owner.presentation,'explore');
    assert.ok(plain(ctx.sectionRecords(ctx.normalize(next))).every(r=>r.presentation==='explore'));
    delete owner.presentation;assert.deepEqual(next,raw);assert.equal(JSON.stringify(raw),text);
  }
});

test('explicit legacy Duplicate and Make default target the selected view and preserve its sibling',()=>{
  for(const saved of [false,true])for(const active of [saved?'layout':'home','flow']){
    const d=diagram();if(saved){d.layoutName='Resident view';d.sectionLayout={default:[board,phone],confluence:[board]};}
    const text=JSON.stringify(d),first=saved?'layout':'home';
    const duplicate=ctx.planDuplicateSectionLayout(text,d,0,active);assert.ok(!duplicate.error,duplicate.error);
    const next=JSON.parse(duplicate.text);assert.deepEqual(next.layouts.map(v=>v.id),[first,'flow',duplicate.layoutId]);assert.equal(next.defaultLayout,first);
    for(const target of Object.keys(next.layouts[2].sectionLayout).filter(key=>key!=='columns'))assert.deepEqual(next.layouts[2].sectionLayout[target],plain(ctx.sectionLayoutItems(next,target,active)));
    const chosen=ctx.planDefaultSectionLayout(text,d,0,active);assert.ok(!chosen.error,chosen.error);
    const named=JSON.parse(chosen.text);assert.deepEqual(named.layouts.map(v=>v.id),[first,'flow']);assert.equal(named.defaultLayout,active);assert.equal(chosen.layoutId,active);
    if(saved){assert.deepEqual(next.layouts[0].sectionLayout,migrated(d.sectionLayout));assert.deepEqual(named.layouts[0].sectionLayout,migrated(d.sectionLayout));}
    assert.equal(JSON.stringify(d),text);
  }
  const graph={...diagram(),panels:[]};delete graph.primaryPanel;
  const duplicate=ctx.planDuplicateSectionLayout(JSON.stringify(graph),graph,0,'flow');assert.ok(!duplicate.error,duplicate.error);
  assert.deepEqual(JSON.parse(duplicate.text).layouts.map(v=>v.id),['flow',duplicate.layoutId]);
  for(const id of ['home','layout','retired']){
    assert.ok(ctx.planDuplicateSectionLayout(JSON.stringify(graph),graph,0,id).error);
    assert.ok(ctx.planDefaultSectionLayout(JSON.stringify(graph),graph,0,id).error);
  }
});

test('duplicating a view preserves explicit presentations while older omitted settings remain omitted',()=>{
  for(const value of [undefined,'standard','explore']){
    const d=diagram(),view={id:'engineering',name:'Engineering',steps:['one'],sectionLayout:{default:[board,phone],confluence:[{...board,w:12}]}};
    if(value!==undefined)view.presentation=value;d.layouts=[view];
    const text=JSON.stringify(d),plan=ctx.planDuplicateSectionLayout(text,d,0,'engineering');assert.ok(!plan.error,plan.error);
    const next=JSON.parse(plan.text);assert.deepEqual(next.layouts[0],view);
    assert.equal(next.layouts[1].presentation,value);assert.deepEqual(next.layouts[1].steps,['one']);
    assert.equal(ctx.sectionLayoutDefinition(next,plan.layoutId).presentation,'standard');
    assert.equal(JSON.stringify(d),text);
  }
});

test('named layouts starter defaults to Standard across its saved Views',()=>{
  const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/starters/named-layouts.json'),'utf8'));
  const d=spec.page.sections[0].diagram,warnings=[];ctx.sectionLayoutWarnings(d,'diagram',warnings);assert.deepEqual(warnings,[]);
  assert.equal(ctx.sectionLayoutDefinition(d).presentation,'standard');
  assert.equal(ctx.sectionLayoutDefinition(d,'service-flow').presentation,'standard');
  assert.equal(ctx.sectionLayoutDefinition(d,'service-flow').steps,undefined);
});

test('Explore defaults validate independently and remain view-local through duplicate, rename and delete',()=>{
  const d=diagram();d.presentation='explore';d.layouts=[{id:'engineering',name:'Engineering',presentation:'explore',sectionLayout:{default:[board,phone]}}];
  const value={overlayScale:.75,panels:[{panel:'home',x:.6,y:.05,w:.3,h:.45,stacked:false}],controls:{x:.05,y:.8,w:.7,h:.12},camera:{zoom:1.25,x:.6,y:.4}};
  const text=JSON.stringify({page:{presentation:'explore',sections:[{diagram:d}]}} ,null,2),raw=JSON.parse(text);
  const plan=ctx.planSectionExploreLayout(text,raw,0,'engineering',value);assert.ok(!plan.error,plan.error);
  const next=JSON.parse(plan.text),nd=next.page.sections[0].diagram;
  assert.deepEqual(nd.layouts[0].exploreLayout,value);assert.deepEqual(nd.steps,d.steps);assert.deepEqual(nd.layouts[0].sectionLayout,d.layouts[0].sectionLayout);
  assert.deepEqual(plain(ctx.diagramLayoutViews(nd)[0].exploreLayout),value);
  const dup=ctx.planDuplicateSectionLayout(plan.text,next,0,'engineering');assert.ok(!dup.error,dup.error);
  assert.deepEqual(JSON.parse(dup.text).page.sections[0].diagram.layouts[1].exploreLayout,value);
  const rename=ctx.planRenamePanel(dup.text,JSON.parse(dup.text),0,0,'house');assert.ok(!rename.error,rename.error);
  assert.equal(JSON.parse(rename.text).page.sections[0].diagram.layouts[0].exploreLayout.panels[0].panel,'house');
  const remove=ctx.planDeletePanel(rename.text,JSON.parse(rename.text),0,0);assert.ok(!remove.error,remove.error);
  assert.deepEqual(JSON.parse(remove.text).page.sections[0].diagram.layouts.map(v=>v.exploreLayout.panels),[[],[]]);
  const reset=ctx.planSectionExploreLayout(plan.text,next,0,'engineering',null);assert.ok(!reset.error,reset.error);assert.equal(JSON.parse(reset.text).page.sections[0].diagram.layouts[0].exploreLayout,undefined);
  assert.ok(ctx.planSectionExploreLayout(text,raw,0,'missing',value).error);
  d.presentation='standard';assert.ok(ctx.planSectionExploreLayout(JSON.stringify(d),d,0,'engineering',value).error);
});
test('malformed Explore geometry warns and falls back without hiding the view or altering source',()=>{
  const d=diagram();const value={panels:[{panel:'home',x:0,y:0,w:.3,h:.4},{panel:'home',x:0,y:0,w:.3,h:.4},{panel:'missing',x:0,y:0,w:.3,h:.4},{panel:'phone',x:0,y:0,w:0,h:1}],controls:{x:0,y:0,w:1,h:2},camera:{zoom:0,x:0,y:0}};
  d.layouts=[{id:'eng',name:'Eng',presentation:'explore',sectionLayout:{default:[board]},exploreLayout:value}];
  const source=JSON.stringify(d),warnings=[];ctx.sectionLayoutWarnings(d,'diagram',warnings);
  assert.equal(warnings.length,5);assert.equal(JSON.stringify(d),source);
  const view=ctx.diagramLayoutViews(d)[0];assert.equal(view.id,'eng');assert.equal(view.exploreLayout.panels.length,1);assert.equal(view.exploreLayout.camera,undefined);assert.equal(view.exploreLayout.controls,undefined);
  assert.ok(ctx.planSectionExploreLayout(source,d,0,'eng',value).error);
  for(const invalid of [null,[],42]){const w=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,invalid,w)),{});assert.equal(w.length,1);}
});
test('Explore overlay scale accepts bounded numeric values and recovers independently of rectangles',()=>{
  const d=diagram(),controls={x:0,y:.8,w:.7,h:.1};
  for(const value of [.5,.75,1,1.25]){
    const warnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,{overlayScale:value,controls},warnings)),{overlayScale:value,controls});assert.deepEqual(warnings,[]);
  }
  for(const value of [null,'0.75',0,.49,1.26,Infinity,{},[]]){
    const warnings=[],input={overlayScale:value,controls},before=JSON.stringify(input);
    assert.deepEqual(plain(ctx.sectionExploreLayout(d,input,warnings)),{controls});assert.equal(warnings.length,1);assert.match(warnings[0],/overlayScale/);assert.equal(JSON.stringify(input),before);
  }
  assert.deepEqual(plain(ctx.sectionExploreLayout(d,{})),{});
});

test('Explore prose defaults accept independent visibility and bounded geometry without changing page content',()=>{
  const d=diagram();d.presentation='explore';d.layouts=[{id:'eng',name:'Engineering',presentation:'explore',sectionLayout:{default:[board]}}];
  for(const prose of [{hidden:true},{x:.6,y:.2,w:.3,h:.4,stacked:false,hidden:false}]){
    const value={prose,overlayScale:.75},warnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,value,warnings)),value);assert.deepEqual(warnings,[]);
    const raw={page:{presentation:'explore',sections:[{text:['**Explanation**'],bullets:[{text:'Parent',sub:['Child']}],diagram:d}]}},text=JSON.stringify(raw,null,2);
    const edit=ctx.planSectionExploreLayout(text,raw,0,'eng',value);assert.ok(!edit.error,edit.error);
    const next=JSON.parse(edit.text);assert.deepEqual(next.page.sections[0].text,raw.page.sections[0].text);assert.deepEqual(next.page.sections[0].bullets,raw.page.sections[0].bullets);
    const duplicate=ctx.planDuplicateSectionLayout(edit.text,next,0,'eng');assert.deepEqual(JSON.parse(duplicate.text).page.sections[0].diagram.layouts[1].exploreLayout,value);
  }
  assert.deepEqual(plain(ctx.sectionExploreLayout(d,{prose:{x:.2,hidden:true}})),{prose:{hidden:true}});
  for(const prose of [true,[],{x:.2},{x:0,y:0,w:0,h:.5},{hidden:'yes'},{stacked:1}]){
    const warnings=[],input={prose,controls:{x:0,y:.8,w:.8,h:.15}},before=JSON.stringify(input);
    const recovered=ctx.sectionExploreLayout(d,input,warnings);assert.ok(warnings.length);assert.deepEqual(plain(recovered.controls),input.controls);assert.equal(JSON.stringify(input),before);
    assert.ok(ctx.planSectionExploreLayout(JSON.stringify(d),d,0,'eng',input).error);
  }
});

test('Explore step captions accept view-local relative positions and reject unknown placements',()=>{
  const d=diagram(),controls={x:.05,y:.8,w:.8,h:.15};
  d.presentation='explore';d.layouts=[{id:'eng',name:'Engineering',presentation:'explore',sectionLayout:{default:[board]},exploreLayout:{controls}}];
  for(const textPosition of ['below','above','left','right']){
    const value={controls,steps:{textPosition}},warnings=[];
    assert.deepEqual(plain(ctx.sectionExploreLayout(d,value,warnings)),value);assert.deepEqual(warnings,[]);
    const text=JSON.stringify(d),plan=ctx.planSectionExploreLayout(text,d,0,'eng',value);assert.ok(!plan.error,plan.error);
    assert.deepEqual(JSON.parse(plan.text).layouts[0].exploreLayout,value);
  }
  for(const steps of [null,[],true,{textPosition:'diagonal'}]){
    const warnings=[],input={controls,steps},before=JSON.stringify(input),normalized=ctx.sectionExploreLayout(d,input,warnings);
    assert.deepEqual(plain(normalized),{controls});assert.equal(warnings.length,1);assert.match(warnings[0],/steps/);assert.equal(JSON.stringify(input),before);
    assert.ok(ctx.planSectionExploreLayout(JSON.stringify(d),d,0,'eng',input).error);
  }
});

test('Explore canvas placement validates graph rectangles separately and preserves both layouts through panel lifecycle',()=>{
  const d=diagram(),value={panelPlacement:'canvas',panels:[{panel:'home',x:.6,y:.1,w:.3,h:.4,stacked:false}],canvas:{controlsScale:.7,panels:[{panel:'home',x:-380,y:20,w:340,h:300}],prose:{x:900,y:200,w:300,h:180}}};
  const warnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,value,warnings)),value);assert.deepEqual(warnings,[]);
  d.presentation='explore';d.layouts=[{id:'eng',name:'Engineering',presentation:'explore',sectionLayout:{default:[board]},exploreLayout:value}];
  const raw={page:{presentation:'explore',sections:[{diagram:d}]}},text=JSON.stringify(raw);
  const plan=ctx.planSectionExploreLayout(text,raw,0,'eng',value);assert.ok(!plan.error,plan.error);
  const dup=ctx.planDuplicateSectionLayout(text,raw,0,'eng');assert.deepEqual(JSON.parse(dup.text).page.sections[0].diagram.layouts[1].exploreLayout,value);
  const renamed=ctx.planRenamePanel(text,raw,0,0,'house'),renamedLayout=JSON.parse(renamed.text).page.sections[0].diagram.layouts[0].exploreLayout;
  assert.equal(renamedLayout.panels[0].panel,'house');assert.equal(renamedLayout.canvas.panels[0].panel,'house');
  const removed=ctx.planDeletePanel(text,raw,0,0),removedLayout=JSON.parse(removed.text).page.sections[0].diagram.layouts[0].exploreLayout;
  assert.deepEqual(removedLayout.panels,[]);assert.deepEqual(removedLayout.canvas.panels,[]);assert.deepEqual(removedLayout.canvas.prose,value.canvas.prose);
  const malformed={...value,panelPlacement:'screen',canvas:{panels:[value.canvas.panels[0],value.canvas.panels[0],{panel:'phone',x:0,y:0,w:-1,h:10},{panel:'q',x:Infinity,y:0,w:20,h:20}],prose:{x:0,y:0,w:10,h:0}}},before=JSON.stringify(malformed),issues=[];
  const result=plain(ctx.sectionExploreLayout(d,malformed,issues));assert.equal(result.panelPlacement,undefined);assert.deepEqual(result.canvas,{panels:[value.canvas.panels[0]]});assert.deepEqual(result.panels,value.panels);assert.ok(issues.length>=5);assert.equal(JSON.stringify(malformed),before);
});

test('canvas coordinate bounds and camera normalization recover malformed entries independently',()=>{
 const d=diagram(),rect={x:-10000,y:10000,w:10000,h:1},valid={panelPlacement:'canvas',canvas:{prose:rect},camera:{zoom:.001,x:500,y:-500}};
 const warnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,valid,warnings)),valid);assert.deepEqual(warnings,[]);
 for(const field of ['x','y','w','h']){const issues=[],input={canvas:{prose:{...rect,[field]:10001}}};assert.deepEqual(plain(ctx.sectionExploreLayout(d,input,issues)),{canvas:{}});assert.match(issues[0],/graph coordinates/);}
 const oldWarnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,{camera:valid.camera},oldWarnings)),{});assert.equal(oldWarnings.length,1);
 for(const scale of [0,.49,1.26,'1',null]){const issues=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,{canvas:{controlsScale:scale,prose:rect}},issues)),{canvas:{prose:rect}});assert.match(issues[0],/controlsScale/);}
 const dormant={panelPlacement:'floating',canvas:valid.canvas,camera:valid.camera};assert.deepEqual(plain(ctx.sectionExploreLayout(d,dormant)),dormant);
});

test('per-panel Explore placements validate independently and survive chapter and panel lifecycle',()=>{
 const d=diagram(),value={panelPlacement:'canvas',panelPlacements:[{panel:'home',placement:'floating'}],panels:[{panel:'home',x:.5,y:.1,w:.3,h:.4,stacked:false}],canvas:{panels:[{panel:'home',x:-380,y:20,w:340,h:300}]}};
 const warnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,value,warnings)),value);assert.deepEqual(warnings,[]);
 d.layouts=[{id:'eng',name:'Engineering',presentation:'explore',sectionLayout:{default:[board]},exploreLayout:value}];
 const raw={page:{presentation:'explore',sections:[{diagram:d}]}},text=JSON.stringify(raw);
 const dup=ctx.planDuplicateSectionLayout(text,raw,0,'eng');assert.deepEqual(JSON.parse(dup.text).page.sections[0].diagram.layouts[1].exploreLayout,value);
 const renamed=ctx.planRenamePanel(text,raw,0,0,'house'),layout=JSON.parse(renamed.text).page.sections[0].diagram.layouts[0].exploreLayout;
 assert.deepEqual(layout.panelPlacements,[{panel:'house',placement:'floating'}]);assert.equal(layout.panels[0].panel,'house');assert.equal(layout.canvas.panels[0].panel,'house');
 const deleted=ctx.planDeletePanel(text,raw,0,0);assert.deepEqual(JSON.parse(deleted.text).page.sections[0].diagram.layouts[0].exploreLayout.panelPlacements,[]);
 const camera={zoom:.001,x:500,y:-500},mixed={panelPlacements:[{panel:'home',placement:'canvas'}],camera};assert.deepEqual(plain(ctx.sectionExploreLayout(d,mixed)),mixed);
 for(const bad of [null,{},'canvas',[null,[],{panel:'missing',placement:'canvas'},{panel:'home',placement:'screen'}],[value.panelPlacements[0],value.panelPlacements[0]]]){
  const input={...value,panelPlacements:bad},before=JSON.stringify(input),issues=[];ctx.sectionExploreLayout(d,input,issues);assert.ok(issues.length);assert.equal(JSON.stringify(input),before);assert.ok(ctx.planSectionExploreLayout(text,raw,0,'eng',input).error);
 }
 const issues=[],partial={...value,panelPlacements:[{panel:'home',placement:'screen'},value.panelPlacements[0],{panel:'unknown',placement:'canvas'}]};
 assert.deepEqual(plain(ctx.sectionExploreLayout(d,partial,issues)),value);assert.equal(issues.length,2);
});

test('step controls placement and independent graph geometry validate without changing floating defaults',()=>{
 const d=diagram(),controls={x:.05,y:.8,w:.8,h:.15},canvasControls={x:-600,y:900,w:720,h:220};
 const value={controlsPlacement:'canvas',controls,canvas:{controls:canvasControls},camera:{zoom:.001,x:500,y:-500}};
 const warnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,value,warnings)),value);assert.deepEqual(warnings,[]);
 assert.deepEqual(plain(ctx.sectionExploreLayout(d,{controls})),{controls});
 d.layouts=[{id:'eng',name:'Engineering',presentation:'explore',sectionLayout:{default:[board]},exploreLayout:value}];
 const raw={page:{presentation:'explore',sections:[{diagram:d}]}},text=JSON.stringify(raw);
 const dup=ctx.planDuplicateSectionLayout(text,raw,0,'eng');assert.deepEqual(JSON.parse(dup.text).page.sections[0].diagram.layouts[1].exploreLayout,value);
 for(const placement of ['floating','canvas']){const next={...value,controlsPlacement:placement};const plan=ctx.planSectionExploreLayout(text,raw,0,'eng',next);assert.ok(!plan.error,plan.error);assert.deepEqual(JSON.parse(plan.text).page.sections[0].diagram.layouts[0].exploreLayout,next);}
 for(const invalid of [null,[],{},'screen']){const input={controls,controlsPlacement:invalid},issues=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,input,issues)),{controls});assert.equal(issues.length,1);assert.ok(ctx.planSectionExploreLayout(text,raw,0,'eng',input).error);}
 for(const rect of [null,[],{x:0,y:0,w:0,h:10},{x:10001,y:0,w:10,h:10},{x:0,y:0,w:10,h:Infinity}]){const input={controls,canvas:{controls:rect}},issues=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,input,issues)),{controls,canvas:{}});assert.equal(issues.length,1);assert.ok(ctx.planSectionExploreLayout(text,raw,0,'eng',input).error);}
});

test('Section notes placement validates, preserves both geometries and survives duplication',()=>{
 const d=diagram(),prose={x:.1,y:.2,w:.3,h:.4},canvas={prose:{x:900,y:30,w:340,h:300}};
 for(const prosePlacement of ['floating','canvas']){
  const value={prosePlacement,prose,canvas},warnings=[];
  assert.deepEqual(plain(ctx.sectionExploreLayout(d,value,warnings)),value);assert.deepEqual(warnings,[]);
  d.presentation='explore';d.layouts=[{id:'eng',name:'Engineering',presentation:'explore',sectionLayout:{default:[board]},exploreLayout:value}];
  const raw={page:{presentation:'explore',sections:[{diagram:d}]}},text=JSON.stringify(raw);
  const plan=ctx.planSectionExploreLayout(text,raw,0,'eng',{...value,prosePlacement:prosePlacement==='canvas'?'floating':'canvas'});assert.ok(!plan.error,plan.error);
  const dup=ctx.planDuplicateSectionLayout(text,raw,0,'eng');assert.deepEqual(JSON.parse(dup.text).page.sections[0].diagram.layouts[1].exploreLayout,value);
 }
 for(const prosePlacement of [null,[],{},'screen']){const input={prosePlacement,prose},before=JSON.stringify(input),warnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,input,warnings)),{prose});assert.equal(warnings.length,1);assert.equal(JSON.stringify(input),before);}
 const camera={zoom:.001,x:500,y:-500};assert.deepEqual(plain(ctx.sectionExploreLayout(d,{prosePlacement:'canvas',camera})),{prosePlacement:'canvas',camera});
 assert.deepEqual(plain(ctx.sectionExploreLayout(d,{panelPlacement:'canvas',prose})),{panelPlacement:'canvas',prose});
});

test('legacy and explicit24 profiles project identically without mutating source, including hidden and docked tiles',()=>{
  const legacy={...diagram(),sectionLayout:{default:[board,phone,{panel:'home',x:0,y:20,w:8,h:12,hidden:true},{controls:'steps',attachTo:'diagram',x:0,y:12,w:8,h:4}],confluence:[{...board,w:12}]}};
  const before=JSON.stringify(legacy),modern={...legacy,sectionLayout:migrated(legacy.sectionLayout)};
  for(const target of ['default','backstage','confluence']){
    assert.deepEqual(plain(ctx.sectionLayoutItems(legacy,target)),plain(ctx.sectionLayoutItems(modern,target)));
    assert.deepEqual(plain(ctx.sectionLayoutItems({...legacy,sectionLayout:{...legacy.sectionLayout,columns:12}},target)),plain(ctx.sectionLayoutItems(modern,target)));
  }
  assert.equal(JSON.stringify(legacy),before);
});
test('odd spans15/9 use the whole24-column row and clamp movement and resize to its boundary',()=>{
  const d={...diagram(),panels:[{id:'phone',type:'phone'}],sectionLayout:{columns:24,default:[{...board,w:15},{...phone,x:15,w:9}]}};
  const items=plain(ctx.sectionLayoutItems(d,'default'));assert.deepEqual(items,d.sectionLayout.default);noOverlap(items);
  assert.equal(ctx.sectionLayoutGesture(items,'panel:phone',1,0,false)[1].x,15);
  assert.equal(ctx.sectionLayoutGesture(items,'panel:phone',1,0,true)[1].w,9);
  const narrower=ctx.sectionLayoutGesture(items,'diagram',-1,0,true);assert.equal(narrower[0].w,14);
  assert.equal(ctx.sectionLayoutGesture(narrower,'diagram',1,0,false)[0].x,1);
});
test('editing an inherited profile migrates siblings once, preserves dormant metadata, and keeps other named views intact',()=>{
  const profiles={default:[{...board,future:{keep:true}},{...phone,hidden:true},{controls:'steps',attachTo:'diagram',x:0,y:12,w:8,h:4}],confluence:[{...board,w:12}]};
  const d={...diagram(),layouts:[{id:'one',name:'One',sectionLayout:profiles},{id:'two',name:'Two',sectionLayout:structuredClone(profiles)}]};
  const raw={page:{title:'untouched',sections:[{diagram:d}],future:{keep:true}}},before=JSON.stringify(raw,null,2)+'\n';
  let plan=ctx.planSectionLayout(before,raw,0,'backstage',ctx.sectionLayoutItems(d,'backstage','one'),'one');assert.ok(!plan.error,plan.error);
  let next=JSON.parse(plan.text),edited=next.page.sections[0].diagram;
  assert.equal(edited.layouts[0].sectionLayout.columns,24);assert.deepEqual(edited.layouts[0].sectionLayout.default,doubled(profiles.default));
  assert.deepEqual(edited.layouts[0].sectionLayout.confluence,doubled(profiles.confluence));assert.deepEqual(edited.layouts[1],d.layouts[1]);
  assert.equal(plan.text.slice(0,plan.text.indexOf('"sectionLayout"')),before.slice(0,before.indexOf('"sectionLayout"')));
  const saved=edited.layouts[0].sectionLayout;
  plan=ctx.planSectionLayout(plan.text,next,0,'backstage',ctx.sectionLayoutItems(edited,'backstage','one'),'one');assert.ok(!plan.error,plan.error);
  next=JSON.parse(plan.text);assert.deepEqual(next.page.sections[0].diagram.layouts[0].sectionLayout,saved);
  const reset=ctx.planSectionLayout(plan.text,next,0,'backstage',null,'one');assert.ok(!reset.error,reset.error);
  const resetD=JSON.parse(reset.text).page.sections[0].diagram;assert.deepEqual(resetD.layouts[0].sectionLayout,migrated(profiles));
  assert.deepEqual(plain(ctx.sectionLayoutItems(resetD,'backstage','one')),plain(ctx.sectionLayoutItems(d,'default','one')));
  const only={...diagram(),layouts:[{id:'one',name:'One',sectionLayout:{columns:24,default:[{...board,w:24}]}}]};
  const last=ctx.planSectionLayout(JSON.stringify(only),only,0,'default',null,'one');assert.ok(!last.error,last.error);
  const lastLayout=JSON.parse(last.text).layouts[0].sectionLayout;assert.equal(lastLayout.columns,24);assert.deepEqual(lastLayout.default,plain(ctx.sectionLayoutPreset(only,'default')));
});
test('invalid grid markers and profile shapes warn and cannot silently become24-column saves',()=>{
  for(const columns of [null,0,13,48,'24',[],{}]){
    const d={...diagram(),sectionLayout:{columns,default:[board]}},before=JSON.stringify(d),warnings=[];
    ctx.sectionLayoutWarnings(d,'diagram',warnings);assert.ok(warnings.some(w=>w.includes('.columns')));
    assert.ok(ctx.planSectionLayout(before,d,0,'backstage',[{...board,w:24}]).error);assert.equal(JSON.stringify(d),before);
  }
  for(const profiles of [{columns:24,default:{}},{columns:24,default:[[0,0,24,12]]},{columns:24,default:[{...board,x:15,w:10}]},{columns:12,default:[{...board,w:13}]}]){
    const warnings=[];ctx.sectionLayoutWarnings({...diagram(),sectionLayout:profiles},'diagram',warnings);assert.ok(warnings.length);
  }
});

test('chapter diagram visibility saves all host profiles while preserving sibling chapters, geometry and story',()=>{
  const d=diagram();d.layouts=[{id:'business',name:'Business',sectionLayout:{columns:24,default:[{...board},{...phone,hidden:true}],backstage:[{...board,h:16}],confluence:[{...board,w:24}]}},{id:'technical',name:'Technical',presentation:'explore',sectionLayout:{columns:24,default:[board]}}];d.defaultLayout='business';
  const raw={page:{blocks:[{tabs:[{label:'First',sections:[{diagram:diagram()}]},{label:'Second',sections:[{diagram:d}]}]}]}},text=JSON.stringify(raw,null,2);
  const plan=ctx.planSectionDiagramVisibility(text,raw,1,'business',false);assert.ok(!plan.error,plan.error);assert.equal(plan.layoutId,'business');
  const nextRaw=JSON.parse(plan.text),next=ctx.builderDiagram(plan.text,nextRaw,1).d;
  assert.deepEqual(nextRaw.page.blocks[0].tabs[0],raw.page.blocks[0].tabs[0]);assert.deepEqual(next.layouts[1],d.layouts[1]);
  assert.deepEqual(next.steps,d.steps);assert.deepEqual(next.panels,d.panels);assert.equal(next.defaultLayout,'business');
  for(const host of ['default','backstage','confluence']){
    const tile=next.layouts[0].sectionLayout[host].find(it=>ctx.sectionLayoutKey(it)==='diagram');
    assert.deepEqual(tile,{...d.layouts[0].sectionLayout[host][0],hidden:true});
    assert.deepEqual(next.layouts[0].sectionLayout[host].filter(it=>ctx.sectionLayoutKey(it)!=='diagram'),d.layouts[0].sectionLayout[host].filter(it=>ctx.sectionLayoutKey(it)!=='diagram'));
  }
  assert.equal(next.layouts[0].sectionLayout.default.find(it=>it.panel==='phone').hidden,true);
  const restored=ctx.planSectionDiagramVisibility(plan.text,nextRaw,1,'business',true);assert.ok(!restored.error,restored.error);
  for(const host of ['default','backstage','confluence'])assert.equal(ctx.sectionLayoutItems(ctx.builderDiagram(restored.text,JSON.parse(restored.text),1).d,host,'business').find(it=>ctx.sectionLayoutKey(it)==='diagram').hidden,undefined);
  assert.ok(ctx.planSectionDiagramVisibility(text,raw,1,'missing',false).error);
  assert.ok(ctx.planSectionDiagramVisibility(text,raw,1,'business','false').error);
});
test('legacy visibility edits promote the selected automatic chapter without losing its sibling or source default',()=>{
  for(const view of ['home','flow','layout']){
    const d=diagram();if(view==='layout')d.sectionLayout={default:[board,phone]};
    const text=JSON.stringify(d),plan=ctx.planSectionDiagramVisibility(text,d,0,view,false);assert.ok(!plan.error,plan.error);
    const next=JSON.parse(plan.text);assert.equal(plan.layoutId,view);assert.equal(next.defaultLayout,view==='layout'?'layout':'home');
    assert.equal(ctx.sectionLayoutItems(next,'backstage',view).find(it=>ctx.sectionLayoutKey(it)==='diagram').hidden,true);
    assert.equal(next.layouts.length,2);assert.deepEqual(next.steps,d.steps);assert.equal(JSON.stringify(d),text);
  }
});

test('chapter visibility creates a default when only a host-specific profile exists',()=>{
  const d=diagram();d.layouts=[{id:'only-host',name:'Host',sectionLayout:{columns:24,confluence:[board]}}];
  const plan=ctx.planSectionDiagramVisibility(JSON.stringify(d),d,0,'only-host',false);assert.ok(!plan.error,plan.error);
  const next=JSON.parse(plan.text);
  for(const host of ['default','backstage','confluence'])assert.equal(ctx.sectionLayoutItems(next,host,'only-host').find(it=>ctx.sectionLayoutKey(it)==='diagram').hidden,true);
});

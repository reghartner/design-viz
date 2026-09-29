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

test('named views resolve independently, with per-view host fallback and an authored default',()=>{
  const d=diagram();d.layouts=[{id:'home',name:'Resident',sectionLayout:{default:[{panel:'home',x:0,y:0,w:8,h:12},{...board,hidden:true},phone]}},{id:'engineering',name:'Engineering',sectionLayout:{default:[board,phone],confluence:[{...board,w:12,h:10}]}}];
  d.defaultLayout='engineering';const before=JSON.stringify(d);
  assert.equal(ctx.sectionLayoutItems(d,'confluence')[0].w,12);
  assert.equal(ctx.sectionLayoutItems(d,'backstage')[0].w,8);
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
  assert.deepEqual(next.layouts[0].sectionLayout,d.sectionLayout);assert.deepEqual(next.steps,d.steps);assert.deepEqual(next.paths,d.paths);
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

test('optimization preserves hidden elements without reserving their space or changing other views/profiles',()=>{
  for(const target of ['default','backstage','confluence']){
    const d=diagram(),items=plain(ctx.sectionLayoutPreset(d,target));
    items.forEach(t=>{if(t.panel)t.hidden=true;});
    d.layouts=[{id:'home',name:'Home',sectionLayout:{default:plain(ctx.sectionLayoutPreset(d,'default'))}},{id:'flow',name:'Flow',sectionLayout:{default:items,backstage:items,confluence:items}}];
    const before=JSON.stringify(d),optimized=plain(ctx.sectionLayoutOptimize(d,target,items));
    const visible=optimized.filter(t=>!t.hidden);noOverlap(visible);
    assert.deepEqual(optimized.filter(t=>t.hidden),items.filter(t=>t.hidden));
    assert.equal(visible.find(t=>ctx.sectionLayoutKey(t)==='diagram').w,12);
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
  assert.deepEqual(optimized.filter(t=>!t.hidden).map(t=>[ctx.sectionLayoutKey(t),t.w,t.y]),[['panel:home',12,0],['steps',12,12]]);
  items.forEach(t=>{if(!t.controls)t.hidden=true;});
  assert.deepEqual(plain(ctx.sectionLayoutOptimize(d,'confluence',items)).filter(t=>!t.hidden).map(t=>[ctx.sectionLayoutKey(t),t.y]),[['steps',0]]);
});

test('attached controls share geometry, survive Optimize, and fall back to detached when the host is hidden',()=>{
  const d=diagram(),original=plain(ctx.sectionLayoutPreset(d,'default'));
  const attached=plain(ctx.sectionLayoutAttach(d,original,'panel:home'));
  assert.equal(ctx.sectionLayoutDock(attached),'panel:home');
  assert.equal(attached.find(t=>t.panel==='home').h,16);
  const normalized=plain(ctx.sectionLayoutItems({...d,sectionLayout:{default:attached}},'default'));
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
  const next=JSON.parse(p.text);assert.deepEqual(next.layouts[0],named.layouts[0]);assert.deepEqual(next.layouts[1].sectionLayout.default,original);
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

test('view presentation normalizes independently of host profiles and falls back safely without discarding the view',()=>{
  const d=diagram();d.layouts=[{id:'business',name:'Business',sectionLayout:{default:[board,phone]}},
    {id:'engineering',name:'Engineering',presentation:'explore',sectionLayout:{default:[board,phone],confluence:[{...board,w:12}]}}];
  const before=JSON.stringify(d);
  assert.deepEqual(plain(ctx.diagramLayoutViews(d)).map(v=>v.presentation),['standard','explore']);
  assert.equal(ctx.sectionLayoutDefinition(d,'engineering').presentation,'explore');
  assert.equal(ctx.sectionLayoutItems(d,'confluence','engineering')[0].w,12);
  assert.equal(ctx.sectionLayoutItems(d,'backstage','engineering')[0].w,8);
  assert.equal(JSON.stringify(d),before);
  for(const value of ['standard','explore']){
    d.layouts[0].presentation=value;const warnings=[];ctx.sectionLayoutWarnings(d,'diagram',warnings);assert.deepEqual(warnings,[]);
  }
  for(const value of [null,'cinema','Explore',true,42,[],{}]){
    d.layouts[0].presentation=value;const warnings=[];ctx.sectionLayoutWarnings(d,'diagram',warnings);
    assert.equal(warnings.filter(w=>w.includes('layouts[0].presentation')).length,1);
    assert.equal(ctx.diagramLayoutViews(d).length,2);assert.equal(ctx.sectionLayoutDefinition(d,'business').presentation,'standard');
  }
  assert.equal(ctx.sectionLayoutDefinition({...diagram(),sectionLayout:{default:[board]}}).presentation,'standard');
});

test('presentation edits patch exactly one named view without altering profiles, state, default or surrounding source',()=>{
  for(const wrap of [d=>d,d=>({sections:[{diagram:d}]}),d=>({page:{blocks:[{tabs:[{label:'Tab',sections:[{diagram:d}]}]}]}})]){
    const d=diagram();d.layouts=[{id:'business',name:'Business',sectionLayout:{default:[board]}},
      {id:'engineering',name:'Engineering',presentation:'standard',steps:['one'],sectionLayout:{default:[board,phone],confluence:[phone]}}];
    d.defaultLayout='business';const raw=wrap(d),text=JSON.stringify(raw,null,3)+'\n';
    const plan=ctx.planSectionViewPresentation(text,raw,0,'engineering','explore');assert.ok(!plan.error,plan.error);
    assert.equal(plan.text,text.replace('"presentation": "standard"','"presentation": "explore"'));
    assert.equal(ctx.sectionLayoutDefinition(ctx.builderDiagram(plan.text,JSON.parse(plan.text),0).d,'engineering').presentation,'explore');
    const restored=ctx.planSectionViewPresentation(plan.text,JSON.parse(plan.text),0,'engineering','standard');assert.equal(restored.text,text);
    const next=JSON.parse(plan.text),nextDiagram=ctx.builderDiagram(plan.text,next,0).d;delete nextDiagram.layouts[1].presentation;
    const original=JSON.parse(text);delete ctx.builderDiagram(text,original,0).d.layouts[1].presentation;assert.deepEqual(next,original);
    for(const value of ['',null,true,{},'cinema']){
      const bad=ctx.planSectionViewPresentation(text,raw,0,'engineering',value);assert.ok(bad.error);assert.equal(bad.text,undefined);
    }
    assert.ok(ctx.planSectionViewPresentation(text,raw,0,'deleted','explore').error);
  }
  const d=diagram();assert.ok(ctx.planSectionViewPresentation(JSON.stringify(d),d,0,'retired-view','explore').error);
});

test('choosing Explore preserves the automatic or saved sibling view, default and story in one plan',()=>{
  for(const saved of [false,true])for(const wrap of [d=>d,d=>({page:{title:'Untouched',sections:[{diagram:d}]}})]){
    const d=diagram();if(saved){d.layoutName='Resident view';d.sectionLayout={default:[board,phone],confluence:[{...board,w:12,h:9}]};}
    const raw=wrap(d),text=JSON.stringify(raw,null,3)+'\n',original=structuredClone(d);
    const plan=ctx.planSectionViewPresentation(text,raw,0,saved?'default':undefined,'explore');assert.ok(!plan.error,plan.error);
    const next=ctx.builderDiagram(plan.text,JSON.parse(plan.text),0).d;
    assert.deepEqual(next.layouts.map(v=>v.id),[saved?'layout':'home','flow']);
    assert.equal(next.defaultLayout,next.layouts[0].id);assert.equal(next.layouts[0].presentation,'explore');
    assert.equal(plan.layoutId,next.layouts[0].id);assert.equal(ctx.sectionLayoutDefinition(next,'flow').presentation,'standard');
    if(saved){assert.deepEqual(next.layouts[0].sectionLayout,original.sectionLayout);assert.equal(next.layouts[0].name,original.layoutName);}
    for(const key of ['nodes','rows','edges','panels','steps','paths','primaryPanel'])assert.deepEqual(next[key],original[key]);
    assert.equal(next.sectionLayout,undefined);assert.equal(next.layoutName,undefined);
    assert.equal(JSON.stringify(raw,null,3)+'\n',text,'planner does not mutate its input');
    if(raw.page)assert.equal(JSON.parse(plan.text).page.title,'Untouched');
    assert.ok(ctx.planSectionViewPresentation(text,raw,0,'removed-view','explore').error);
  }
});

test('automatic focus views promote the selected Home or Data without changing the original opening view',()=>{
  for(const explicit of [false,true])for(const active of ['home','flow']){
    const d=diagram();if(!explicit)delete d.primaryPanel;
    const text=JSON.stringify(d),plan=ctx.planSectionViewPresentation(text,d,0,active,'explore');assert.ok(!plan.error,plan.error);
    const next=JSON.parse(plan.text);assert.equal(plan.layoutId,active);assert.equal(next.defaultLayout,explicit?'home':'flow');
    assert.deepEqual(next.layouts.map(v=>[v.id,v.name,ctx.sectionLayoutDefinition(next,v.id).presentation]),[
      ['home','Home',active==='home'?'explore':'standard'],['flow','Data flow',active==='flow'?'explore':'standard']]);
    const home=next.layouts[0].sectionLayout.default,flow=next.layouts[1].sectionLayout.default;
    assert.equal(home[0].panel,'home');assert.equal(home.find(t=>ctx.sectionLayoutKey(t)==='diagram').hidden,true);
    assert.equal(ctx.sectionLayoutDock(home),'panel:home');assert.equal(ctx.sectionLayoutDock(flow),'diagram');
    assert.equal(ctx.sectionLayoutKey(flow[0]),'diagram');assert.ok(!flow[0].hidden);
    for(const items of [home,flow])noOverlap(items.filter(t=>!t.hidden && !t.controls));
    const warnings=[];ctx.sectionLayoutWarnings(next,'diagram',warnings);assert.deepEqual(warnings,[]);
    for(const key of ['nodes','rows','edges','panels','steps','paths','primaryPanel'])assert.deepEqual(next[key],d[key]);
    assert.equal(JSON.stringify(d),text);
  }
});

test('saved layout aliases preserve every authored host profile while selected Data gains its own presentation',()=>{
  const d=diagram();d.layoutName='Resident view';d.sectionLayout={default:[phone,board],backstage:[board],confluence:[{...board,w:12,h:9}]};
  for(const active of ['layout','home','default','flow']){
    const text=JSON.stringify(d),plan=ctx.planSectionViewPresentation(text,d,0,active,'explore');assert.ok(!plan.error,plan.error);
    const next=JSON.parse(plan.text),selected=active==='flow'?'flow':'layout';
    assert.equal(plan.layoutId,selected);assert.equal(next.defaultLayout,'layout');
    assert.deepEqual(next.layouts[0].sectionLayout,d.sectionLayout);assert.equal(next.layouts[0].name,'Resident view');
    assert.equal(ctx.sectionLayoutDefinition(next,selected).presentation,'explore');
    assert.equal(ctx.sectionLayoutDefinition(next,selected==='flow'?'layout':'flow').presentation,'standard');
    assert.equal(ctx.sectionLayoutDock(next.layouts[1].sectionLayout.default),'diagram');
    assert.equal(JSON.stringify(d),text);
  }
});

test('promotion preserves graph-only, step-free and non-docking focus contracts without accepting stale IDs',()=>{
  const graph={...diagram(),panels:[]};delete graph.primaryPanel;
  for(const id of [undefined,null,'default','flow']){
    const p=ctx.planSectionViewPresentation(JSON.stringify(graph),graph,0,id,'explore');assert.ok(!p.error,p.error);
    const next=JSON.parse(p.text);assert.deepEqual(next.layouts.map(v=>v.id),['flow']);assert.equal(next.defaultLayout,'flow');assert.equal(p.layoutId,'flow');
  }
  for(const id of ['home','layout','deleted'])assert.ok(ctx.planSectionViewPresentation(JSON.stringify(graph),graph,0,id,'explore').error);
  for(const overrides of [{steps:[],paths:[]},{view:'ambient-only'},{primaryPanel:'phone'}]){
    const d={...diagram(),...overrides},p=ctx.planSectionViewPresentation(JSON.stringify(d),d,0,'home','explore');assert.ok(!p.error,p.error);
    const next=JSON.parse(p.text),items=next.layouts[0].sectionLayout.default;
    assert.equal(items[0].panel,d.primaryPanel);assert.equal(items.find(t=>ctx.sectionLayoutKey(t)==='diagram').hidden,true);
    if(d.primaryPanel==='phone'){assert.ok(items.some(t=>t.controls==='steps'));assert.equal(ctx.sectionLayoutDock(items),null);}
    else assert.ok(!items.some(t=>t.controls));
    const warnings=[];ctx.sectionLayoutWarnings(next,'diagram',warnings);assert.deepEqual(warnings,[]);
  }
});

test('explicit legacy Duplicate and Make default target the selected view and preserve its sibling',()=>{
  for(const saved of [false,true])for(const active of [saved?'layout':'home','flow']){
    const d=diagram();if(saved){d.layoutName='Resident view';d.sectionLayout={default:[board,phone],confluence:[board]};}
    const text=JSON.stringify(d),first=saved?'layout':'home';
    const duplicate=ctx.planDuplicateSectionLayout(text,d,0,active);assert.ok(!duplicate.error,duplicate.error);
    const next=JSON.parse(duplicate.text);assert.deepEqual(next.layouts.map(v=>v.id),[first,'flow',duplicate.layoutId]);assert.equal(next.defaultLayout,first);
    for(const target of Object.keys(next.layouts[2].sectionLayout))assert.deepEqual(next.layouts[2].sectionLayout[target],plain(ctx.sectionLayoutItems(next,target,active)));
    const chosen=ctx.planDefaultSectionLayout(text,d,0,active);assert.ok(!chosen.error,chosen.error);
    const named=JSON.parse(chosen.text);assert.deepEqual(named.layouts.map(v=>v.id),[first,'flow']);assert.equal(named.defaultLayout,active);assert.equal(chosen.layoutId,active);
    if(saved){assert.deepEqual(next.layouts[0].sectionLayout,d.sectionLayout);assert.deepEqual(named.layouts[0].sectionLayout,d.sectionLayout);}
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
    assert.equal(ctx.sectionLayoutDefinition(next,plan.layoutId).presentation,value || 'standard');
    assert.equal(JSON.stringify(d),text);
  }
});

test('named layouts starter opens Standard and offers Explore for the same technical story',()=>{
  const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/starters/named-layouts.json'),'utf8'));
  const d=spec.page.sections[0].diagram,warnings=[];ctx.sectionLayoutWarnings(d,'diagram',warnings);assert.deepEqual(warnings,[]);
  assert.equal(ctx.sectionLayoutDefinition(d).presentation,'standard');
  assert.equal(ctx.sectionLayoutDefinition(d,'service-flow').presentation,'explore');
  assert.equal(ctx.sectionLayoutDefinition(d,'service-flow').steps,undefined);
});

test('Explore defaults validate independently and remain view-local through duplicate, rename and delete',()=>{
  const d=diagram();d.layouts=[{id:'engineering',name:'Engineering',presentation:'explore',sectionLayout:{default:[board,phone]}}];
  const value={overlayScale:.75,panels:[{panel:'home',x:.6,y:.05,w:.3,h:.45,stacked:false}],controls:{x:.05,y:.8,w:.7,h:.12},camera:{zoom:1.25,x:.6,y:.4}};
  const text=JSON.stringify({page:{sections:[{diagram:d}]}} ,null,2),raw=JSON.parse(text);
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
  d.layouts[0].presentation='standard';assert.ok(ctx.planSectionExploreLayout(JSON.stringify(d),d,0,'engineering',value).error);
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
  const d=diagram();d.layouts=[{id:'eng',name:'Engineering',presentation:'explore',sectionLayout:{default:[board]}}];
  for(const prose of [{hidden:true},{x:.6,y:.2,w:.3,h:.4,stacked:false,hidden:false}]){
    const value={prose,overlayScale:.75},warnings=[];assert.deepEqual(plain(ctx.sectionExploreLayout(d,value,warnings)),value);assert.deepEqual(warnings,[]);
    const raw={page:{sections:[{text:['**Explanation**'],bullets:[{text:'Parent',sub:['Child']}],diagram:d}]}},text=JSON.stringify(raw,null,2);
    const edit=ctx.planSectionExploreLayout(text,raw,0,'eng',value);assert.ok(!edit.error,edit.error);
    const next=JSON.parse(edit.text);assert.deepEqual(next.page.sections[0].text,raw.page.sections[0].text);assert.deepEqual(next.page.sections[0].bullets,raw.page.sections[0].bullets);
    const duplicate=ctx.planDuplicateSectionLayout(edit.text,next,0,'eng');assert.deepEqual(JSON.parse(duplicate.text).page.sections[0].diagram.layouts[1].exploreLayout,value);
  }
  for(const prose of [true,[],{x:.2},{x:0,y:0,w:0,h:.5},{hidden:'yes'},{stacked:1}]){
    const warnings=[],input={prose,controls:{x:0,y:.8,w:.8,h:.15}},before=JSON.stringify(input);
    const recovered=ctx.sectionExploreLayout(d,input,warnings);assert.ok(warnings.length);assert.deepEqual(plain(recovered.controls),input.controls);assert.equal(JSON.stringify(input),before);
    assert.ok(ctx.planSectionExploreLayout(JSON.stringify(d),d,0,'eng',input).error);
  }
});

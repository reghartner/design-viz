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

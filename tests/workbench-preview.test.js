'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const SOURCE=' {"page":{"title":"Original","sections":[{"diagram":{"nodes":{"a":{}},"rows":[["a"]]}}]}}\n';
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(){
  const c={lintPage:()=>[]},events=[],outcomes=[],controllers=[],view={textContent:'existing board'};
  vm.createContext(c);for(const name of ['validator','workbench/preview','workbench/persistence','workbench/session'])vm.runInContext(readSource(name+'.js'),c);
  let failure=null;
  c.renderWorkbenchPreview=(view,page,skin,previousPage,previousCtl,lifecycle)=>{
    if(failure==='before')throw new Error('snapshot failed');
    lifecycle.beforeReplace();previousCtl?.destroy();
    if(failure==='replace')throw new Error('panel failed');
    const ctl={dead:false,destroy(){this.dead=true;events.push('destroy');}};controllers.push(ctl);return ctl;
  };
  const preview=c.createWorkbenchPreviewController({view,skin:()=> 'pastel',findings:v=>events.push(['findings',plain(v)]),
    present:skin=>events.push(['skin',skin]),beforeReplace:request=>events.push(['before',plain(request)]),
    completed:outcome=>{outcomes.push(outcome);events.push(['after',outcome.ok,outcome.replaced]);}});
  return {c,preview,view,events,outcomes,controllers,fail:value=>{failure=value;}};
}
test('controlled attempts report one outcome and retain the current preview for parse/validation rejection',()=>{
  const h=harness(),p=h.preview,request={origin:'edit',retention:{multi:true,addMode:true}};
  assert.deepEqual(plain(p.render(SOURCE,request)),{ok:true,replaced:true,text:SOURCE,origin:'edit'});
  assert.deepEqual(h.events.filter(e=>e[0]==='before'),[['before',request]]);
  const ctl=p.controller();assert.equal(p.renderedText(),SOURCE);assert.equal(p.page().title,'Original');
  for(const [text,reason]of [['{ bad','parse'],['{"nodes":[],"rows":[]}','validation']]){
    assert.deepEqual(plain(p.render(text,{origin:'manual'})),{ok:false,replaced:false,text,reason,origin:'manual'});
    assert.equal(p.controller(),ctl);assert.equal(ctl.dead,false);assert.equal(p.renderedText(),SOURCE);
  }
  assert.equal(h.outcomes.length,3);assert.equal(h.events.filter(e=>e[0]==='before').length,1);
  p.repaint('terminal');assert.equal(ctl.dead,true);assert.equal(p.renderedText(),SOURCE);assert.equal(h.outcomes.at(-1).origin,'skin');
});
test('replacement failure invalidates retired preview identity; failure before teardown leaves the existing controller usable',()=>{
  const h=harness(),p=h.preview;p.render(SOURCE);const first=p.controller();
  h.fail('before');let outcome=p.render(SOURCE+' ');assert.equal(outcome.ok,false);assert.equal(outcome.replaced,false);
  assert.equal(outcome.reason,'render');assert.equal(p.controller(),first);assert.equal(first.dead,false);assert.equal(p.renderedText(),SOURCE);
  h.fail('replace');outcome=p.render(SOURCE+' ');assert.equal(outcome.ok,false);assert.equal(outcome.replaced,true);
  assert.equal(first.dead,true);assert.equal(p.controller(),null);assert.equal(p.page(),null);assert.equal(p.renderedText(),null);
  assert.equal(h.view.textContent,'');assert.match(h.events.filter(e=>e[0]==='findings').at(-1)[1].errors[0],/panel failed/);
  h.fail(null);assert.equal(p.render(SOURCE).ok,true);assert.ok(p.controller());assert.equal(p.renderedText(),SOURCE);
});
test('session keeps accepted exact source/history and persistence when replacement fails, and reports distinct operation policies',()=>{
  const h=harness(),p=h.preview,saves=[];let text=SOURCE;
  p.render(text);
  const session=h.c.createBuilderSession({source:{read:()=>text,write:value=>{text=value;}},
    persistence:{read:()=>({}),save:(...args)=>saves.push(args),cancel(){},destroy(){}},
    render:request=>p.render(text,request),renderedText:p.renderedText});
  h.fail('replace');let delivered;
  const edited=SOURCE+'  ';
  assert.equal(session.accept({text:edited},{retention:{multi:true},afterRender(plan,outcome){delivered=outcome;}}),true);
  assert.equal(delivered.ok,false);assert.equal(delivered.replaced,true);assert.equal(text,edited);
  assert.equal(session.snapshot().renderedText,null);assert.equal(session.canUndo(),true);assert.deepEqual(saves.at(-1),[edited,SOURCE]);
  h.fail(null);session.undo();assert.equal(text,SOURCE);assert.equal(p.renderedText(),SOURCE);session.redo();assert.equal(text,edited);
  session.importText(SOURCE);session.replaceProject(SOURCE);
  assert.deepEqual(h.events.filter(e=>e[0]==='before').map(e=>e[1].origin),['manual','edit','history','history','import','project']);
  assert.deepEqual(h.events.filter(e=>e[0]==='before')[1][1].retention,{multi:true});
});
test('preview restore failure destroys the newly created controller instead of publishing it',()=>{
  const c={};vm.createContext(c);vm.runInContext(readSource('workbench/preview.js'),c);
  c.activeTabReferences=()=>[];c.workbenchPreviewSnapshot=()=>null;c.restoreActiveTabs=()=>{throw new Error('restore failed');};
  let before=0,retired=0,nextRetired=0;
  c.renderPage=()=>({destroy(){nextRetired++;}});
  assert.throws(()=>c.renderWorkbenchPreview({}, {},'pastel',null,{destroy(){retired++;}},{beforeReplace(){before++;}}),/restore failed/);
  assert.equal(before,1);assert.equal(retired,1);assert.equal(nextRetired,1);
});
test('existing preview replacements restore scroll ancestors; project/import navigation does not inherit them',()=>{
  const h=harness(),p=h.preview,root={scrollTop:1500,scrollLeft:20},pane={scrollTop:600,scrollLeft:100,parentElement:root};
  h.view.parentElement=pane;
  p.render(SOURCE);
  const render=h.c.renderWorkbenchPreview;
  h.c.renderWorkbenchPreview=(...args)=>{
    pane.scrollTop=0;pane.scrollLeft=0;root.scrollTop=0;root.scrollLeft=0;
    return render(...args);
  };
  for(const origin of ['edit','history','manual','layout-preview']){
    p.render(SOURCE,{origin});
    assert.equal(pane.scrollTop,600);assert.equal(pane.scrollLeft,100);
    assert.equal(root.scrollTop,1500);assert.equal(root.scrollLeft,20);
  }
  p.repaint('daylight');assert.equal(pane.scrollTop,600);assert.equal(root.scrollTop,1500);
  for(const origin of ['project','import']){
    pane.scrollTop=600;root.scrollTop=1500;
    p.render(SOURCE,{origin});assert.equal(pane.scrollTop,0);assert.equal(root.scrollTop,0);
  }
  pane.scrollTop=600;root.scrollTop=1500;p.forgetDocument();
  p.render(SOURCE);assert.equal(pane.scrollTop,0);assert.equal(root.scrollTop,0);
});


test('new project and import boundaries discard previous preview identity even with matching titles and sections',()=>{
  const h=harness(),p=h.preview,render=h.c.renderWorkbenchPreview,previous=[];
  h.c.renderWorkbenchPreview=(...args)=>{previous.push(args[3]);return render(...args);};
  p.render(SOURCE);p.render(SOURCE,{origin:'edit'});assert.ok(previous.at(-1));
  for(const origin of ['project','import']){
    const old=p.controller();p.render(SOURCE,{origin});assert.equal(previous.at(-1),null);assert.equal(old.dead,true);
  }
  p.forgetDocument();p.render(SOURCE);assert.equal(previous.at(-1),null);
});

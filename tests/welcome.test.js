'use strict';
const {readSource} = require('../tools/source-loader.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={URL,URLSearchParams};vm.createContext(context);
for(const name of ['validator.js','welcome.workbench.js'])vm.runInContext(readSource(name),context);
const plain=value=>JSON.parse(JSON.stringify(value));
test('agent guidance links to the selected GitHub fork and revision, including enterprise hosts',()=>{
  const r=context.welcomeRepository('https://github.company.test/platform/flowview.git/','feature/welcome');
  assert.equal(r.repository,'https://github.company.test/platform/flowview');
  assert.equal(r.skill,'https://github.company.test/platform/flowview/blob/feature%2Fwelcome/.claude/skills/hld-to-page/SKILL.md');
  for(const url of ['javascript:alert(1)','http://github.com/team/flowview','https://user:secret@github.com/team/flowview','https://github.com/team/flowview?token=secret','https://github.com/team/flowview#secret','https://github.com/team/flowview/blob/main']){
    assert.ok(context.welcomeRepository(url,'main').error,url);
  }
  for(const ref of ['', 'main?token=secret', 'main#fragment','main\nextra'])assert.ok(context.welcomeRepository('https://github.com/team/flowview',ref).error,ref);
});
test('briefs preserve user sources and audience and route each task to the authoring skill',()=>{
  const repo=context.welcomeRepository('https://github.com/team/flowview','main');
  for(const kind of ['design','code','improve']){
    const prompt=context.welcomeAgentPrompt(kind,'   Explain recording failure   ','Engineers',repo);
    assert.ok(prompt.includes(repo.skill));assert.match(prompt,/My brief: Explain recording failure/);
    assert.match(prompt,/Audience: Engineers/);assert.match(prompt,/tools\/validate\.js/);
    assert.match(prompt,/coverage ledger/);assert.match(prompt,/cannot access the skill/);
  }
  assert.match(context.welcomeAgentPrompt('code','','Engineers',repo),/cite the implementation/);
  assert.match(context.welcomeAgentPrompt('improve','','Engineers',repo),/Preserve existing supported behavior/);
});
test('blank project is empty, valid, pastel, and independently allocated for each opening',()=>{
  const first=context.welcomeBlankSpec(),second=context.welcomeBlankSpec();
  assert.equal(first.page.skin,'pastel');
  const diagram=first.page.blocks[0].diagram;
  assert.deepEqual(plain(diagram.nodes),{});assert.deepEqual(plain(diagram.rows),[[]]);
  assert.deepEqual(plain(diagram.edges),[]);assert.deepEqual(plain(diagram.steps),[]);
  assert.deepEqual(plain(context.validate(context.normalize(first)).errors),[]);
  diagram.nodes.test={title:'Changed'};
  assert.deepEqual(plain(second.page.blocks[0].diagram.nodes),{});
});


function navigationWindow(url='https://example.test/workbench.html?layout=backstage#host',options={}){
  let entries=[{url,state:options.state ?? {hostMarker:'kept'}}],index=0;
  const listeners=new Map(),storage=options.storage || new Map();
  const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const win={
    get location(){return new URL(entries[index].url);},
    get sessionStorage(){
      if(options.storageThrows)throw new Error('Storage disabled');
      return {getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,value)};
    },
    addEventListener:(type,fn)=>listeners.set(type,fn),
    history:{
      get state(){return entries[index].state;},
      get length(){return entries.length;},
      replaceState(state,title,next){entries[index]={state:copy(state),url:next===undefined?entries[index].url:new URL(next,entries[index].url).href};},
      pushState(state,title,next){const url=next===undefined?entries[index].url:new URL(next,entries[index].url).href;entries=entries.slice(0,index+1);entries.push({state:copy(state),url});index++;},
      back(){if(index>0){index--;listeners.get('popstate')?.();}},
      forward(){if(index+1<entries.length){index++;listeners.get('popstate')?.();}}
    },
    pop(){listeners.get('popstate')?.();},storage
  };
  return win;
}

test('screen history preserves host state and URL, does not push during traversal, and keeps initial entry',()=>{
  const win=navigationWindow('https://example.test/workbench.html?host=a%20b&review=host-review#part',{
    state:JSON.parse('{"hostMarker":"kept","__proto__":{"owned":true}}')
  }),seen=[];
  const nav=context.createWelcomeNavigation(win,'home',name=>seen.push(name));
  assert.equal(win.history.length,1);
  assert.equal(nav.screen(),'home');
  for(const screen of ['new','agent','paste'])nav.go(screen);
  nav.go('paste');assert.equal(win.history.length,4);
  nav.back();assert.equal(nav.screen(),'agent');
  win.history.back();assert.equal(nav.screen(),'new');
  win.history.back();assert.equal(nav.screen(),'home');
  win.history.forward();win.history.forward();win.history.forward();
  assert.deepEqual(seen,['new','agent','paste','paste','agent','new','home','new','agent','paste']);
  assert.equal(win.history.length,4);
  nav.localProject();nav.go('editor');
  assert.equal(win.location.href,'https://example.test/workbench.html?host=a%20b&review=host-review#part');
  assert.equal(win.history.state.hostMarker,'kept');
  assert.deepEqual(win.history.state.__proto__,{owned:true});
  assert.equal(Object.hasOwn(win.history.state,'__proto__'),true);
  assert.deepEqual(Object.keys(win.history.state.flowviewWorkbenchEntry).sort(),['canon','depth','retired','screen','v','visit']);
});

test('canonical retirement follows one visit through older entries and reload without session storage',()=>{
  const win=navigationWindow('https://example.test/workbench.html?host=a%20b&canon=old&review=123&keep=%2f#exact',{storageThrows:true});
  const nav=context.createWelcomeNavigation(win,'editor',()=>{}),visit=win.history.state.flowviewWorkbenchEntry.visit;
  assert.equal(win.history.length,1);
  nav.go('home');nav.go('paste');nav.localProject();nav.go('editor');
  for(const screen of ['paste','home','editor']){
    win.history.back();assert.equal(nav.screen(),screen);
    assert.equal(win.location.href,'https://example.test/workbench.html?host=a%20b&keep=%2f#exact');
    assert.equal(win.history.state.flowviewWorkbenchEntry.retired,true);
    assert.equal(win.history.state.flowviewWorkbenchEntry.visit,visit);
  }
  const restored=context.createWelcomeNavigation(win,'home',()=>{});
  assert.equal(restored.screen(),'editor');assert.equal(restored.retired(),true);
  assert.equal(win.history.length,4);
  // An unrelated future canonical visit must not inherit a global retirement flag.
  win.history.pushState({flowviewWorkbenchEntry:{v:1,visit:'another-visit',depth:0,screen:'editor',canon:true}},'', '?canon=fresh&review=456');
  win.pop();assert.equal(restored.retired(),false);assert.equal(win.location.search,'?canon=fresh&review=456');
});

test('visit retirement is metadata-only and reload can recover an unvisited old canonical entry',()=>{
  const storage=new Map(),win=navigationWindow('https://example.test/workbench.html?canon=old&review=123',{storage});
  const nav=context.createWelcomeNavigation(win,'editor',()=>{});
  const oldState=plain(win.history.state);
  nav.go('home');nav.go('paste');nav.localProject();
  assert.deepEqual([...storage.values()],['1']);
  const oldWindow=navigationWindow('https://example.test/workbench.html?canon=old&review=123',{state:oldState,storage});
  const old=context.createWelcomeNavigation(oldWindow,'editor',()=>{});
  assert.equal(old.retired(),true);assert.equal(oldWindow.location.search,'');
  assert.equal(oldWindow.history.length,1);assert.equal(oldWindow.history.state.flowviewWorkbenchEntry.retired,true);
  const fresh=navigationWindow('https://example.test/workbench.html?canon=fresh',{storage});
  const freshNav=context.createWelcomeNavigation(fresh,'editor',()=>{});
  assert.equal(freshNav.retired(),false);assert.equal(fresh.location.search,'?canon=fresh');
});

test('missing or unsupported route metadata falls back safely without losing host state',()=>{
  const win=navigationWindow(undefined,{state:{hostMarker:'kept',flowviewWorkbenchEntry:{v:999,screen:'editor'}}});
  const nav=context.createWelcomeNavigation(win,'home',()=>{});
  assert.equal(nav.screen(),'home');assert.equal(win.history.length,1);assert.equal(win.history.state.hostMarker,'kept');
  nav.go('unknown');assert.equal(nav.screen(),'home');assert.equal(win.history.length,1);
  const array=navigationWindow(undefined,{state:['host',1]});
  context.createWelcomeNavigation(array,'home',()=>{});
  assert.deepEqual(array.history.state.flowviewPreviousState,['host',1]);
});

test('canon library navigation retains only the diagram ID across Back, Forward and reload',()=>{
  const win=navigationWindow(),seen=[],nav=context.createWelcomeNavigation(win,'home',name=>seen.push(name));
  nav.go('library');nav.go('reader','doorbell');assert.equal(nav.diagram(),'doorbell');
  win.history.back();assert.equal(nav.screen(),'library');assert.equal(nav.diagram(),undefined);
  win.history.forward();assert.equal(nav.diagram(),'doorbell');
  const restored=context.createWelcomeNavigation(win,'home',()=>{});assert.equal(restored.screen(),'reader');assert.equal(restored.diagram(),'doorbell');
  assert.equal(win.history.length,3);assert.equal(win.location.hash,'#host');
  restored.go('editor');assert.equal(restored.diagram(),undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { startConfluenceApp } from '../src/app.mjs';

const root=new URL('../../../',import.meta.url);
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const home=await readFile(new URL('src/starters/homemap-story.json',root),'utf8');
const trace=await readFile(new URL('src/starters/complex-trace.json',root),'utf8');
const names=['buildConfluenceExport','buildConfluenceConfig','confluenceSections','confluenceDisplayPage',
  'confluenceSourceUrl','CONFLUENCE_INPUT_BYTES','SKIN_NAMES','renderPage','applySkinClasses'];
const source=(await Promise.all(['canon','validator','engine','confluence'].map(n=>readFile(new URL('src/'+n+'.js',root),'utf8')))).join('\n');
const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
async function setup(t,{config={},configuring=true,submit,contextError=false,reducedMotion=true}={}){
  const dom=new JSDOM(html,{url:'https://forge.example/viewer/',runScripts:'outside-only',pretendToBeVisual:true});
  const win=dom.window;win.TextEncoder=TextEncoder;win.matchMedia=()=>({matches:reducedMotion});
  /* JSDOM has no SVG geometry. Browser QA covers actual paths and layout;
     these bridge tests only need deterministic points for placing coins. */
  win.SVGElement.prototype.getTotalLength=()=>100;
  win.SVGElement.prototype.getPointAtLength=n=>({x:n,y:0});
  win.eval(source);
  const core=Object.fromEntries(names.map(n=>[n,win[n]])), calls={submits:[],closes:0,urls:[]};
  const bridge={view:{
    getContext:async()=>{if(contextError) throw Error('offline');return {siteUrl:'https://company.atlassian.net',extension:{config,macro:{isConfiguring:configuring}}};},
    submit:async p=>{calls.submits.push(JSON.parse(JSON.stringify(p)));if(submit) await submit(p);},
    close:async()=>{calls.closes++;}
  },router:{open:async url=>calls.urls.push(url)}};
  const app=await startConfluenceApp(win.document,bridge,core);
  t.after(()=>{app.destroy();win.close();});
  const el=id=>win.document.getElementById(id);
  const paste=text=>{el('spec-input').value=text;el('spec-input').dispatchEvent(new win.Event('input'));el('validate').click();};
  return {win,el,paste,calls,core,app};
}
test('imports, previews and saves a snapshot without shipping the workbench',async t=>{
  const s=await setup(t);s.paste(home);
  assert.equal(s.el('save').disabled,false,s.el('import-status').textContent);
  assert.ok(s.el('docview').querySelector('.hmframe'));
  assert.ok(s.el('docview').textContent.includes('Happy path'));
  assert.equal(s.win.document.querySelector('#spec-editor'),null);
  s.el('save').click();await settle();
  assert.equal(s.calls.submits.length,1);
  assert.deepEqual(JSON.parse(s.calls.submits[0].config.specJson),JSON.parse(home));
  assert.deepEqual(Object.keys(s.calls.submits[0]),['config']);
});
test('invalid replacements clear the preview and prevent a stale save',async t=>{
  const s=await setup(t);s.paste(home);s.paste('{');
  assert.equal(s.el('save').disabled,true);assert.equal(s.el('docview').textContent,'');
  s.el('save').click();assert.equal(s.calls.submits.length,0);
});
test('failed submissions preserve the imported JSON and can retry',async t=>{
  let attempt=0;const s=await setup(t,{submit:async()=>{if(++attempt===1)throw Error('temporary failure');}});
  s.paste(home);s.el('save').click();await settle();
  assert.match(s.el('import-status').textContent,/Could not save/);assert.equal(s.el('spec-input').value,home);
  assert.equal(s.el('save').disabled,false);s.el('save').click();await settle();assert.equal(s.calls.submits.length,2);
});
test('cancel never submits an imported or modified spec',async t=>{
  const s=await setup(t);s.paste(home);s.el('cancel').click();await settle();
  assert.equal(s.calls.closes,1);assert.equal(s.calls.submits.length,0);
});
test('published viewer renders saved Home paths and navigation without import controls',async t=>{
  const s=await setup(t,{configuring:false,config:{specJson:home}});
  assert.equal(s.el('configuration').hidden,true);assert.equal(s.el('app-status').hidden,true);
  const button=Array.from(s.el('docview').querySelectorAll('button')).find(b=>b.getAttribute('aria-label')==='Go to step 3 on Internet down');
  assert.ok(button);button.click();
  assert.match(s.el('docview').textContent,/STEP 3\/4/);assert.equal(s.calls.submits.length,0);
});
test('published playback honors the authored opt-in; configuration previews always start paused',async t=>{
  for (const autoplay of [false,true]){
    const raw=JSON.parse(home);raw.page.sections[0].diagram.autoplay=autoplay;
    const config={specJson:JSON.stringify(raw)};
    const published=await setup(t,{configuring:false,config,reducedMotion:false});
    const status=published.el('docview').querySelector('.playback-status');
    assert.equal(status.textContent,autoplay?'Playing · 3s / step':'Paused');
    const button=published.el('docview').querySelector('.playback-button');button.click();
    assert.equal(status.textContent,autoplay?'Paused':'Playing · 3s / step');
    const preview=await setup(t,{config,reducedMotion:false});
    assert.equal(preview.el('docview').querySelector('.playback-status').textContent,'Paused');
  }
});
test('complex trace viewer renders lane routing and trace panels',async t=>{
  const s=await setup(t,{configuring:false,config:{specJson:trace}});
  assert.equal(s.el('app-status').hidden,true,s.el('app-status').textContent);
  assert.ok(s.el('docview').querySelector('.board-size'));
  assert.ok(s.el('docview').querySelector('.pwidget'));
});
test('invalid or unavailable saved content produces a visible error, not a demo',async t=>{
  const a=await setup(t,{configuring:false,config:{specJson:'{'}});
  assert.equal(a.el('app-status').hidden,false);assert.equal(a.el('docview').textContent,'');
  const b=await setup(t,{contextError:true});assert.match(b.el('app-status').textContent,/Could not connect/);
});
test('source links use Forge navigation and unsafe schemes cannot become clickable',async t=>{
  const raw=JSON.parse(home);raw.page.sections[0].source='javascript:alert(1)';
  raw.page.sections[0].diagram.nodes.camera.link='https://example.com/hld';
  const s=await setup(t,{configuring:false,config:{specJson:JSON.stringify(raw)}});
  assert.equal(s.el('docview').querySelector('a[href^="javascript:"]'),null);
  const a=s.el('docview').querySelector('a[href="https://example.com/hld"]');assert.ok(a);
  a.dispatchEvent(new s.win.MouseEvent('click',{bubbles:true,cancelable:true}));await settle();
  assert.deepEqual(s.calls.urls,['https://example.com/hld']);
});
test('file import ignores an older read that completes after pasted content',async t=>{
  const s=await setup(t);let complete;
  Object.defineProperty(s.el('spec-file'),'files',{value:[{size:home.length,text:()=>new Promise(resolve=>{complete=resolve;})}]});
  s.el('spec-file').dispatchEvent(new s.win.Event('change'));
  s.paste(trace);complete(home);await settle();
  assert.equal(s.el('spec-input').value,trace);
});
test('file import cannot preview or save the previous JSON while the replacement is reading',async t=>{
  const s=await setup(t);s.paste(home);let complete;
  Object.defineProperty(s.el('spec-file'),'files',{value:[{size:trace.length,text:()=>new Promise(resolve=>{complete=resolve;})}]});
  s.el('spec-file').dispatchEvent(new s.win.Event('change'));
  s.el('validate').click();s.el('save').click();
  assert.equal(s.el('save').disabled,true);assert.equal(s.calls.submits.length,0);
  complete(trace);await settle();assert.equal(s.el('save').disabled,false,s.el('import-status').textContent);
  s.el('save').click();await settle();assert.deepEqual(JSON.parse(s.calls.submits[0].config.specJson),JSON.parse(trace));
});
test('display overrides persist separately from the imported JSON',async t=>{
  const s=await setup(t);s.paste(home);
  s.el('section').value='1';s.el('focus').value='data';s.el('skin').value='daylight';
  s.el('focus').dispatchEvent(new s.win.Event('change'));
  s.el('save').click();await settle();const config=s.calls.submits[0].config;
  assert.equal(config.section,'1');assert.equal(config.focus,'data');assert.equal(config.skin,'daylight');
  assert.deepEqual(JSON.parse(config.specJson),JSON.parse(home));
});

test('Forge selects the Confluence composition and preserves alternate state through live view switches',async t=>{
  const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
  d.sectionLayout={default:[{x:0,y:0,w:8,h:12}],confluence:[{panel:'home',x:0,y:0,w:12,h:12},{x:0,y:12,w:12,h:12}]};
  const s=await setup(t,{configuring:false,config:{specJson:JSON.stringify(raw)}}),view=s.el('docview');
  const grid=view.querySelector('.section-layout-grid');assert.equal(grid.dataset.layoutTarget,'confluence');
  assert.equal(grid.firstChild.dataset.layoutKey,'panel:home');assert.equal(grid.firstChild.style.getPropertyValue('--tile-w'),'12');
  assert.equal(grid.querySelectorAll('.pwidget').length,d.panels.length,'unspecified panels stay visible');
  const bar=view.querySelector('.termbar'),map=view.querySelector('.pt-homemap'),board=view.querySelector('.board');
  view.querySelector('[aria-label="Go to step 3 on Internet down"]').click();
  const caption=bar.querySelector('.stepline').textContent;
  assert.equal(view.querySelectorAll('.diagram-view-choice button').length,2);
  assert.equal(view.querySelector('[data-view-focus="panel"]'),null,'the custom layout replaces Home');
  for(let i=0;i<2;i++){
    view.querySelector('[data-view-focus="flow"]').click();assert.equal(grid.hidden,true);
    view.querySelector('[data-view-layout]').click();assert.equal(grid.hidden,false);
    assert.equal(view.querySelector('.pt-homemap'),map);assert.equal(view.querySelector('.board'),board);
    assert.equal(view.querySelector('.termbar'),bar);assert.equal(bar.querySelector('.stepline').textContent,caption);
  }
  assert.equal(view.querySelectorAll('.termbar').length,1);
});

test('a diagram without panels restores its board and controls from a custom layout',async t=>{
  const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
  delete d.panels;delete d.primaryPanel;delete d.paths;d.steps=[{id:'start',nodes:['camera'],text:'Start'}];
  d.sectionLayout={default:[{x:0,y:0,w:12,h:12}]};
  const s=await setup(t,{configuring:false,config:{specJson:JSON.stringify(raw)}}),view=s.el('docview');
  const grid=view.querySelector('.section-layout-grid'),board=view.querySelector('.board'),bar=view.querySelector('.termbar');
  for(let i=0;i<2;i++){
    [...view.querySelectorAll('.diagram-view-choice button')].find(b=>b.textContent==='Data flow').click();
    assert.equal(grid.hidden,true);assert.equal(view.querySelector('.boardgrid').hidden,false);
    view.querySelector('[data-view-layout]').click();assert.equal(grid.hidden,false);
    assert.equal(grid.querySelector('.board'),board);assert.equal(grid.querySelector('.termbar'),bar);
  }
});

test('detached step controls retain one live transport across layout focus, alternates, and ambient mode',async t=>{
  for(const panels of [true,false])for(const controlsFirst of [true,false]){
    const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
    if(!panels){delete d.panels;delete d.primaryPanel;d.steps.forEach(st=>delete st.panels);}
    d.sectionLayout={confluence:[
      {x:0,y:controlsFirst?6:0,w:12,h:12},
      {controls:'steps',x:0,y:controlsFirst?0:12,w:12,h:6}
    ]};
    const s=await setup(t,{configuring:false,config:{specJson:JSON.stringify(raw)}}),view=s.el('docview');
    const grid=view.querySelector('.section-layout-grid'),bar=view.querySelector('.termbar'),board=view.querySelector('.board');
    function detached(){
      assert.equal(grid.querySelector('[data-layout-key="steps"]>.termbar'),bar);
      assert.equal(grid.querySelector('[data-layout-key="diagram"] .termbar'),null);
      assert.equal(view.querySelectorAll('.termbar').length,1);assert.equal(view.querySelector('.board'),board);
    }
    detached();view.querySelector('[aria-label="Go to step 3 on Internet down"]').click();
    const caption=bar.querySelector('.stepline').textContent;assert.match(caption,/STEP 3\/4/);
    for(let i=0;i<2;i++){
      [...view.querySelectorAll('.diagram-view-choice button')].find(b=>b.textContent==='Data flow').click();
      assert.equal(grid.hidden,true);assert.equal(bar.querySelector('.stepline').textContent,caption);
      view.querySelector('[data-view-layout]').click();detached();assert.equal(bar.querySelector('.stepline').textContent,caption);
    }
    [...view.querySelectorAll('.mtoggle button')].find(b=>b.textContent==='AMBIENT').click();assert.equal(bar.hidden,true);
    [...view.querySelectorAll('.mtoggle button')].find(b=>b.textContent==='STEP').click();assert.equal(bar.hidden,false);detached();
    bar.querySelector('[aria-label="Next step"]').click();assert.match(bar.querySelector('.stepline').textContent,/STEP 2\/4/);
  }
});


test('node reference menus support right-click, keyboard focus, Forge navigation, and disposal',async t=>{
  const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
  d.nodes.cloud.binding={entityRef:'component:default/events',catalogUrl:'https://backstage.example/catalog/default/component/events',label:'Events <safe>',api:{entityRef:'api:default/events',definitionUrl:'https://api.example/openapi',title:'Events'}};
  d.nodes.cloud.codeRefs=[{id:'events.handle',repository:'https://github.example/team/events',revision:'a'.repeat(40),path:'src/handler.js',anchor:{start:'start',end:'end'},startLine:10,endLine:15}];
  const s=await setup(t,{configuring:false,config:{specJson:JSON.stringify(raw)}}),view=s.el('docview'),node=view.querySelector('[data-dv-node="cloud"]'),trigger=node.querySelector('.nrefs-trigger');
  const rightClick=new s.win.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:70,clientY:90});node.dispatchEvent(rightClick);
  const pop=view.querySelector('.node-link-menu');assert.equal(rightClick.defaultPrevented,true);assert.equal(pop.hidden,false);
  assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(s.win.document.activeElement,pop.querySelector('a'));
  const links=[...pop.querySelectorAll('a')];assert.equal(links.length,3);assert.match(links[0].textContent,/Events <safe>/);assert.equal(pop.querySelector('safe'),null);
  assert.match(links[2].href,/blob\/a{40}\/src\/handler.js#L10-L15$/);
  links[0].dispatchEvent(new s.win.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(s.win.document.activeElement,links[1]);
  links[1].dispatchEvent(new s.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(pop.hidden,true);assert.equal(s.win.document.activeElement,trigger);
  trigger.dispatchEvent(new s.win.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(pop.hidden,false);
  const board=node.closest('.board');board.dispatchEvent(new s.win.Event('scroll'));assert.equal(pop.hidden,false,'queued scroll without new movement keeps the menu open');
  board.scrollLeft=20;board.dispatchEvent(new s.win.Event('scroll'));assert.equal(pop.hidden,true,'new board movement dismisses the menu');
  trigger.dispatchEvent(new s.win.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(pop.hidden,false);
  pop.querySelector('a').dispatchEvent(new s.win.MouseEvent('click',{bubbles:true,cancelable:true}));await settle();
  assert.deepEqual(s.calls.urls,['https://backstage.example/catalog/default/component/events']);
  s.win.document.body.dispatchEvent(new s.win.MouseEvent('pointerdown',{bubbles:true}));assert.equal(pop.hidden,true);
  trigger.dispatchEvent(new s.win.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(pop.hidden,false);
  s.app.destroy();assert.equal(pop.isConnected,false);assert.equal(trigger.getAttribute('aria-expanded'),'false');
});

test('nodes without references retain native context menus and path replacement removes open menus',async t=>{
  const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
  d.nodes.cloud.binding={entityRef:'component:default/events',catalogUrl:'https://backstage.example/events'};
  const s=await setup(t,{configuring:false,config:{specJson:JSON.stringify(raw)}}),view=s.el('docview');
  const camera=view.querySelector('[data-dv-node="camera"]'),ev=new s.win.MouseEvent('contextmenu',{bubbles:true,cancelable:true});camera.dispatchEvent(ev);assert.equal(ev.defaultPrevented,false);assert.equal(camera.querySelector('.nrefs-trigger'),null);
  view.querySelector('[data-dv-node="cloud"] .nrefs-trigger').dispatchEvent(new s.win.MouseEvent('click',{bubbles:true,cancelable:true}));
  const old=view.querySelector('.node-link-menu');assert.equal(old.hidden,false);
  view.querySelector('[aria-label="Go to step 3 on Internet down"]').click();assert.equal(old.isConnected,false);
  const next=view.querySelector('.node-link-menu');assert.notEqual(next,old);assert.equal(next.hidden,true);
  view.querySelector('[data-dv-node="cloud"] .nrefs-trigger').dispatchEvent(new s.win.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(next.hidden,false);
});


test('named layouts hide only the diagram, retain playback, and restore exact positions',async t=>{
  for(const detached of [true,false])for(const panels of [true,false]){
    const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
    if(!panels){delete d.panels;delete d.primaryPanel;d.steps.forEach(st=>delete st.panels);}
    d.layoutName='Front door <safe>';
    d.sectionLayout={confluence:[{x:0,y:0,w:12,h:12},...(detached?[{controls:'steps',x:0,y:12,w:12,h:6}]:[])]};
    const specJson=JSON.stringify(raw),s=await setup(t,{configuring:false,config:{specJson}}),view=s.el('docview');
    const choices=view.querySelector('.diagram-view-choice'),layout=choices.querySelector('[data-view-layout]'),toggle=view.querySelector('[data-layout-flow]');
    assert.equal(choices.children.length,2);assert.equal(layout.textContent,'Front door <safe>');assert.equal(layout.querySelector('safe'),null);
    const grid=view.querySelector('.section-layout-grid'),board=view.querySelector('.board'),bar=view.querySelector('.termbar');
    const positions=[...grid.children].map(el=>el.getAttribute('style'));
    view.querySelector('[aria-label="Go to step 3 on Internet down"]').click();const caption=bar.querySelector('.stepline').textContent;
    toggle.click();assert.equal(board.hidden,true);assert.equal(toggle.textContent,'Show data flow');assert.equal(toggle.getAttribute('aria-expanded'),'false');
    assert.equal(bar.hidden,false);assert.equal(bar.closest('.section-layout-tile').hidden,false);assert.equal(bar.querySelector('.stepline').textContent,caption);
    assert.equal(grid.querySelector('[data-layout-key="diagram"]').hidden,detached);
    if(detached)assert.equal(grid.querySelector('[data-layout-key="steps"]').style.getPropertyValue('--tile-y'),'1');
    choices.querySelector('button:not([data-view-layout])').click();assert.equal(board.hidden,false);assert.equal(toggle.hidden,true);
    layout.click();assert.equal(board.hidden,true);assert.equal(toggle.hidden,false);assert.equal(view.querySelector('.termbar'),bar);
    [...view.querySelectorAll('.mtoggle button')].find(b=>b.textContent==='AMBIENT').click();await settle();assert.equal(bar.hidden,true);
    if(!detached)assert.equal(grid.querySelector('[data-layout-key="diagram"]').hidden,true);
    [...view.querySelectorAll('.mtoggle button')].find(b=>b.textContent==='STEP').click();await settle();assert.equal(bar.hidden,false);assert.equal(bar.closest('.section-layout-tile').hidden,false);
    toggle.click();assert.equal(board.hidden,false);assert.deepEqual([...grid.children].map(el=>el.getAttribute('style')),positions);
    assert.equal(view.querySelector('.board'),board);assert.equal(view.querySelectorAll('.termbar').length,1);assert.equal(s.calls.submits.length,0);
    assert.equal(JSON.stringify(raw),specJson);
  }
});

test('multiple layouts replace Home with the diagram while retaining the same live alternate, controls and supporting widgets',async t=>{
  const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
  const map={panel:'home',x:0,y:0,w:8,h:12},board={x:0,y:18,w:8,h:12,hidden:true},steps={controls:'steps',x:0,y:12,w:8,h:6};
  const supporting=d.panels.filter(p=>p.id!=='home').map((p,i)=>({panel:p.id,x:8,y:i*10,w:4,h:10}));
  d.layouts=[{id:'resident',name:'Resident <safe>',sectionLayout:{default:[map,board,steps,...supporting]}},{id:'engineer',name:'Engineering',sectionLayout:{default:[{...board,y:0,hidden:false},{...map,y:18,hidden:true},steps,...supporting],confluence:[{...board,y:0,h:10,hidden:false},{...map,y:18,hidden:true},{...steps,y:10},...supporting]}}];
  d.defaultLayout='resident';const json=JSON.stringify(raw),s=await setup(t,{configuring:false,config:{specJson:json}}),view=s.el('docview');
  const grid=view.querySelector('.section-layout-grid'),boardEl=view.querySelector('.board'),mapEl=view.querySelector('.pt-homemap'),bar=view.querySelector('.termbar');
  const tile=key=>[...grid.children].find(e=>e.dataset.layoutKey===key);
  view.querySelector('[aria-label="Go to step 3 on Internet down"]').click();const caption=bar.querySelector('.stepline').textContent;
  assert.equal(tile('diagram').hidden,true);assert.equal(tile('panel:home').hidden,false);
  for(let i=0;i<3;i++){
    view.querySelector('[data-layout-id="engineer"]').click();
    assert.equal(tile('diagram').hidden,false);assert.equal(tile('diagram').style.getPropertyValue('--tile-y'),'1');assert.equal(tile('diagram').style.getPropertyValue('--tile-h'),'10');
    assert.equal(tile('panel:home').hidden,true);assert.equal(bar.querySelector('.stepline').textContent,caption);
    assert.equal(view.querySelector('.board'),boardEl);assert.equal(view.querySelector('.pt-homemap'),mapEl);assert.equal(view.querySelectorAll('.termbar').length,1);
    assert.equal(view.querySelector('[data-view-focus="flow"]'),null,'named views have no extra automatic Data flow mode');
    view.querySelector('[data-layout-id="resident"]').click();assert.equal(grid.hidden,false);assert.equal(tile('diagram').hidden,true);assert.equal(tile('panel:home').hidden,false);
  }
  assert.equal(view.querySelector('safe'),null);assert.equal(s.calls.submits.length,0);assert.equal(JSON.stringify(raw),json);
});

test('views dock one live transport to Home or diagram and filter stops without losing skipped state',async t=>{
  const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
  d.panels.push({id:'proof',type:'state',title:'Carry-forward proof',states:['Initial','Skipped update'],initial:{state:'Initial'}});
  d.steps[1].panels.proof={state:'Skipped update'};
  const common=[{panel:'home',x:0,y:0,w:8,h:18},{x:0,y:18,w:8,h:18,hidden:true},{controls:'steps',attachTo:'panel:home',x:0,y:18,w:8,h:6}];
  d.layouts=[{id:'resident',name:'Resident',steps:['quiet','notify','inside','offline','leave'],sectionLayout:{default:common}},
    {id:'engineer',name:'Engineering',sectionLayout:{default:[{panel:'home',x:0,y:18,w:8,h:18,hidden:true},{x:0,y:0,w:8,h:18},{controls:'steps',attachTo:'diagram',x:0,y:18,w:8,h:6}]}},
    {id:'hidden',name:'All hidden',sectionLayout:{default:[{panel:'home',x:0,y:0,w:8,h:18,hidden:true},{x:0,y:0,w:8,h:18,hidden:true},{controls:'steps',attachTo:'panel:home',x:0,y:0,w:8,h:6}]}}];
  const s=await setup(t,{configuring:false,config:{specJson:JSON.stringify(raw)}}),view=s.el('docview'),bar=view.querySelector('.termbar'),homeCard=view.querySelector('.pt-homemap');
  assert.equal(homeCard.querySelector('.termbar'),bar);assert.equal(view.querySelector('[data-layout-key="steps"]'),null);
  const firstBar=bar;view.querySelector('[aria-label="Go to step 2 on Happy path"]').click();
  assert.match(bar.querySelector('.stepline').textContent,/notified/);assert.equal(bar.querySelector('.stepid').textContent,'notify');
  assert.equal(view.querySelector('.coin[data-dv-step="3"] text').textContent,'2');
  assert.ok(view.querySelector('.coin[data-dv-step="1"]').classList.contains('view-step-hidden'));
  assert.match(view.querySelector('.pwidget[data-dv-panel="2"] .pbody').textContent,/Skipped update/);
  view.querySelector('[data-layout-id="engineer"]').click();
  assert.equal(view.querySelector('[data-layout-key="diagram"] .termbar'),firstBar);assert.match(bar.querySelector('.stepline').textContent,/STEP 4\/5/);
  assert.equal(homeCard.querySelector('.termbar'),null);assert.equal(homeCard.classList.contains('layout-docked-card'),false);
  view.querySelector('[aria-label="Go to step 3 on Internet down"]').click();
  view.querySelector('[data-layout-id="resident"]').click();assert.equal(homeCard.querySelector('.termbar'),firstBar);assert.match(bar.querySelector('.stepline').textContent,/STEP 2\/3/);
  assert.equal(bar.querySelector('.stepid').textContent,'offline');
  view.querySelector('[data-layout-id="hidden"]').click();assert.equal(view.querySelector('[data-layout-key="steps"]>.termbar'),firstBar);assert.equal(view.querySelector('[data-layout-key="panel:home"]').hidden,true);
  assert.equal(view.querySelectorAll('.termbar').length,1);
});

test('attached transport heights follow the active host profile and hiding the drawing ignores caption scroll height',async t=>{
  const raw=JSON.parse(home),d=raw.page.sections[0].diagram;
  d.layouts=[{id:'map',name:'Map',sectionLayout:{default:[{panel:'home',x:0,y:0,w:8,h:20},{controls:'steps',attachTo:'panel:home',x:0,y:20,w:8,h:7}]}},
    {id:'flow',name:'Flow',sectionLayout:{default:[{x:0,y:0,w:8,h:20},{controls:'steps',attachTo:'diagram',x:0,y:20,w:8,h:6}],confluence:[{x:0,y:0,w:12,h:20},{controls:'steps',attachTo:'diagram',x:0,y:20,w:12,h:8}]}},
    {id:'detached',name:'Detached',sectionLayout:{default:[{x:0,y:0,w:8,h:12},{controls:'steps',x:0,y:12,w:8,h:5}]}}];
  const s=await setup(t,{configuring:false,config:{specJson:JSON.stringify(raw)}}),view=s.el('docview'),bar=view.querySelector('.termbar');
  const host=()=>bar.closest('.section-layout-tile');
  assert.ok(host().classList.contains('layout-has-attached-controls'));assert.equal(host().style.getPropertyValue('--attached-controls-height'),'272px');
  view.querySelector('[data-layout-id="flow"]').click();assert.equal(host().style.getPropertyValue('--attached-controls-height'),'312px');
  Object.defineProperty(bar,'scrollHeight',{value:1200,configurable:true});
  view.querySelector('[data-layout-flow]').click();assert.equal(host().style.getPropertyValue('--tile-h'),'8');assert.equal(host().hidden,false);
  view.querySelector('[data-layout-id="detached"]').click();assert.equal(host().classList.contains('layout-has-attached-controls'),false);assert.equal(host().style.getPropertyValue('--attached-controls-height'),'');
  view.querySelector('[data-layout-id="map"]').click();assert.equal(host().style.getPropertyValue('--attached-controls-height'),'272px');
});

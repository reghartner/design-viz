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
const source=(await Promise.all(['validator','engine','confluence'].map(n=>readFile(new URL('src/'+n+'.js',root),'utf8')))).join('\n');
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
  return {win,el,paste,calls,core};
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

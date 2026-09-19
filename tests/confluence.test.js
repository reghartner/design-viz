'use strict';
const {readSource} = require('../tools/source-loader.cjs');

const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'), C={TextEncoder,URL};vm.createContext(C);
for(const file of ['validator.js','confluence.js']) vm.runInContext(readSource(file),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const home=()=>JSON.parse(fs.readFileSync(path.join(root,'src/starters/homemap-story.json'),'utf8'));

test('Confluence exports preserve every starter and can reopen as native specs',()=>{
  for(const file of fs.readdirSync(path.join(root,'src/starters')).filter(f=>f.endsWith('.json'))){
    const raw=JSON.parse(fs.readFileSync(path.join(root,'src/starters',file),'utf8'));
    const out=C.buildConfluenceExport(JSON.stringify(raw,null,2));
    assert.ok(!out.error,file+': '+out.error);
    assert.deepEqual(JSON.parse(out.text),raw,file);
    assert.deepEqual(plain(C.validate(C.normalize(JSON.parse(out.text))).errors),[]);
    assert.equal(out.bytes,Buffer.byteLength(out.text));
    assert.match(out.name,/\.confluence\.json$/);
    const config=C.buildConfluenceConfig(out.text,{});
    assert.equal(config.config.specJson,out.text);
  }
});
test('Confluence transport rejects invalid JSON and broken step references without producing output',()=>{
  for(const text of ['', 'null','{','[]','42','{"page":{"sections":"bad"}}']){
    const r=C.buildConfluenceExport(text); assert.ok(r.error,text);assert.equal(r.text,undefined);
  }
  const spec=home();spec.page.sections[0].diagram.paths[1].steps[2]='missing-step';
  assert.ok(C.buildConfluenceExport(JSON.stringify(spec)).error);
});
test('snapshot limits count compact UTF-8 bytes, preserve literal text and never truncate',()=>{
  const spec=home();spec.page.title='Café 🔥 </script><img src=x onerror=alert(1)>';
  const out=C.buildConfluenceExport(JSON.stringify(spec,null,8));
  assert.ok(!out.error,out.error);assert.equal(JSON.parse(out.text).page.title,spec.page.title);
  assert.equal(out.bytes,Buffer.byteLength(out.text));
  spec.page.title='🔥'.repeat(33000);
  const large=C.buildConfluenceExport(JSON.stringify(spec));
  assert.match(large.error,/128 KiB/);assert.equal(large.text,undefined);
  assert.match(C.buildConfluenceExport(' '.repeat(C.CONFLUENCE_INPUT_BYTES+1)).error,/Choose|2 MiB/);
});
test('display settings preserve the original snapshot and isolate sections inside tabs',()=>{
  const original=home(), first=original.page.sections[0], second=JSON.parse(JSON.stringify(first));
  second.heading='Second';const raw={page:{title:'Both',skin:'pastel',blocks:[{tabs:[{label:'One',sections:[first]},{label:'Two',sections:[second]}]}]}};
  const text=JSON.stringify(raw), b=C.buildConfluenceConfig(text,{section:'2',focus:'data',skin:'daylight'});
  assert.ok(!b.error,b.error);
  const display=C.confluenceDisplayPage(b.exported.page,b.config);
  assert.equal(display.blocks.length,1);assert.equal(display.blocks[0].heading,'Second');
  assert.equal(display.blocks[0].diagram.primaryPanel,undefined);assert.equal(display.skin,'daylight');
  assert.equal(b.config.specJson,text);assert.equal(JSON.stringify(raw),text);
  assert.equal(b.exported.page.blocks[0].tabs[1].sections[0].diagram.primaryPanel,'home');
  assert.equal(C.confluenceDisplayPage(display,{section:'all',focus:'home',skin:'spec'}).blocks[0].diagram.primaryPanel,'home');
  for(const values of [{section:'99'},{section:1},{focus:'unknown'},{skin:'nope'}]) assert.ok(C.buildConfluenceConfig(text,values).error);
  const homePage=home().page, d=homePage.sections[0].diagram;
  d.panels.unshift({...d.panels[0],id:'other-home'});
  assert.equal(C.confluenceDisplayPage(homePage,{section:'all',focus:'home',skin:'spec'}).sections[0].diagram.primaryPanel,'home');
});
test('source links only allow explicit web URLs or Confluence wiki-relative paths',()=>{
  const base='https://team.atlassian.net';
  assert.equal(C.confluenceSourceUrl('/wiki/spaces/X/pages/12',base),base+'/wiki/spaces/X/pages/12');
  assert.equal(C.confluenceSourceUrl('https://example.com/hld',base),'https://example.com/hld');
  for(const href of ['javascript:alert(1)','data:text/html,x','//other.example/x','docs/hld.md','#step','file:///a','/\\evil.example/x'])
    assert.equal(C.confluenceSourceUrl(href,base),null,href);
});
test('CLI and workbench use identical exports, and invalid input never overwrites a file',t=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'confluence-export-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const input=path.join(root,'src/starters/homemap-story.json'), output=path.join(tmp,'home.json');
  const cmd=path.join(root,'tools/confluence-export.js'), expected=C.buildConfluenceExport(fs.readFileSync(input,'utf8')).text;
  let r=spawnSync(process.execPath,[cmd,input],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,expected);
  r=spawnSync(process.execPath,[cmd,input,'-o',output],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(output,'utf8'),expected);
  const bad=path.join(tmp,'bad.json');fs.writeFileSync(bad,'{');
  r=spawnSync(process.execPath,[cmd,bad,'-o',output],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(fs.readFileSync(output,'utf8'),expected);
});

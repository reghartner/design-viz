import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),require=createRequire(import.meta.url),repo=fileURLToPath(new URL('../../..',import.meta.url));
let kit;
test.beforeAll(async()=>{
 kit=await fs.mkdtemp(path.join(os.tmpdir(),'flowview-native-kit-'));
 // Build and extract the actual distributed kit, not a hand-picked test copy.
 await run('python3',['-c',`import sys,json,gzip,base64,pathlib;sys.path.insert(0,'tools');from folder_agent_kit import folder_agent_kit;from build import canon_runtime;r=json.loads(folder_agent_kit('.',canon_runtime()));files=json.loads(gzip.decompress(base64.b64decode(r['gzip'])))['files'];root=pathlib.Path(sys.argv[1]);[(root.joinpath(k).parent.mkdir(parents=True,exist_ok=True),root.joinpath(k).write_text(v)) for k,v in files.items()]`,kit],{cwd:repo,maxBuffer:5e6});
 // Reuse only the exact CI-installed Playwright package; the CLI itself has no
 // fallback. Source-free runtime resolution is entirely inside this test kit.
 const pkg=require.resolve('playwright-core/package.json');expect(JSON.parse(await fs.readFile(pkg,'utf8')).version).toBe('1.63.0');
 await fs.mkdir(path.join(kit,'tools/arrange/node_modules'),{recursive:true});await fs.cp(path.dirname(pkg),path.join(kit,'tools/arrange/node_modules/playwright-core'),{recursive:true});
 expect(await fs.stat(path.join(kit,'src/source-bundles.json')).catch(()=>null)).toBeNull();
});
test.afterAll(async()=>{if(kit)await fs.rm(kit,{recursive:true,force:true});});
function draft(steps=[]){return {page:{title:'Native authoring',skin:'pastel',sections:[{heading:'Evidence',diagram:{nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[[]],floats:[{id:'a',side:'below'},{id:'b',side:'below'}],edges:[{from:'a',to:'b'}],panels:[{id:'charge',type:'battery',title:'Charge',initial:{charge:75}}],steps}}]}};}
async function cli(raw,name,args=[]){const input=path.join(kit,name+'.json'),output=path.join(kit,name+'.out.json'),bytes=JSON.stringify(raw);await fs.writeFile(input,bytes);const result=await run(process.execPath,[path.join(kit,'tools/arrange-spec.cjs'),...args,input,output],{cwd:kit,maxBuffer:5e6});expect(await fs.readFile(input,'utf8')).toBe(bytes);const saved=JSON.parse(await fs.readFile(output,'utf8'));const core=createRequire(path.join(kit,'tools/arrange-spec.cjs'))('./canon/core.cjs');expect(core.validateSpec(saved).errors).toEqual([]);return {saved,report:JSON.parse(result.stdout)};}
test('documented setup prepares a clean checkout and its first native arrangement without a prior build',async()=>{
 test.setTimeout(120000);
 const checkout=await fs.mkdtemp(path.join(os.tmpdir(),'flowview-clean-arrange-'));
 try{
  await fs.cp(kit,checkout,{recursive:true,filter:source=>!['node_modules','generated-native.html','generated-runtime.cjs'].includes(path.basename(source))});
  await fs.cp(path.join(repo,'src'),path.join(checkout,'src'),{recursive:true});
  await fs.copyFile(path.join(repo,'tools/source-loader.cjs'),path.join(checkout,'tools/source-loader.cjs'));
  await fs.copyFile(path.join(repo,'tools/arrange/build-payload.cjs'),path.join(checkout,'tools/arrange/build-payload.cjs'));
  await fs.copyFile(path.join(repo,'tools/arrange/native.js'),path.join(checkout,'tools/arrange/native.js'));
  for(const file of ['tools/arrange/generated-native.html','tools/canon/generated-runtime.cjs'])expect(await fs.stat(path.join(checkout,file)).catch(()=>null)).toBeNull();
  await run(process.execPath,['tools/arrange/setup.cjs'],{cwd:checkout,maxBuffer:5e6,timeout:90000});
  const raw=draft([{id:'start',text:'Read native setup evidence.'}]),bytes=JSON.stringify(raw);await fs.writeFile(path.join(checkout,'in.json'),bytes);
  const result=await run(process.execPath,['tools/arrange-spec.cjs','--width','800','in.json','out.json'],{cwd:checkout,maxBuffer:5e6});
  expect(await fs.readFile(path.join(checkout,'in.json'),'utf8')).toBe(bytes);const saved=JSON.parse(await fs.readFile(path.join(checkout,'out.json'),'utf8'));
  expect(saved.page.sections[0].diagram.sectionLayout.columns).toBe(24);expect(JSON.parse(result.stdout).diagrams[0].graph.every(g=>g.clipped===0&&g.minimumLabelPx>=8)).toBe(true);
 }finally{await fs.rm(checkout,{recursive:true,force:true});}
});
test('source-free native CLI handles zero-step ambient and one-step content without synthetic states',async()=>{
 for(const steps of [[],[{id:'start',text:'Read the charge.',panels:{charge:{charge:51}}}]]){
  const raw=draft(steps),input=steps.length?raw:raw.page.sections[0].diagram,{saved,report}=await cli(input,'ambient-'+steps.length),d=saved.page.sections[0].diagram,metrics=report.diagrams[0];
  expect(d.panels).toEqual(raw.page.sections[0].diagram.panels);expect(d.steps).toEqual(steps);expect(d.sectionLayout.columns).toBe(24);expect(d.sectionLayout.default.filter(t=>t.controls).length).toBe(steps.length?1:0);
  expect(d.sectionLayout.default.find(t=>t.panel==='charge').w).toBeLessThan(16);expect(metrics.stateCount).toBe(steps.length+1);expect(metrics.graph.every(g=>g.clipped===0&&g.minimumLabelPx>=8)).toBe(true);
  if(!steps.length){const old=require(path.join(kit,'tools/auto-arrange-spec.cjs')),expected=(await old.arrangeSpec(input,[0])).raw,actual=structuredClone(old.diagramRecords(saved)[0].diagram);delete actual.sectionLayout;delete actual.graphFrame;expect(actual).toEqual(expected);expect(saved.page.flowview.features).toContain('layout.graph-frame');}
 }
});
test('every path and deep caption fit, preserving semantic state, another section and sibling profile',async()=>{
 const raw=draft([{id:'start',text:'Begin.',panels:{charge:{charge:60}}},{id:'long',text:'Detailed evidence and the next action. '.repeat(24),panels:{charge:{charge:40}}},{id:'alternate',text:'Alternate outcome.',panels:{charge:{charge:20}}}]);
 raw.page.flowview={authoredWith:'0.1.0',minVersion:'0.1.0',features:['flow.failures']};
 const d=raw.page.sections[0].diagram;d.paths=[{id:'normal',name:'Normal',steps:['start','long']},{id:'other',name:'Other',steps:['start','alternate']}];d.sectionLayout={columns:24,backstage:[{x:0,y:0,w:24,h:7},{panel:'charge',x:0,y:7,w:8,h:4}]};raw.page.sections.push({heading:'Preserved prose',text:'Unrelated source'});
 const {saved,report}=await cli(raw,'deep',['--section','0','--rearrange','--profile','confluence']);const result=saved.page.sections[0].diagram;
 expect(result.steps).toEqual(d.steps);expect(result.paths).toEqual(d.paths);expect(result.panels).toEqual(d.panels);expect(result.sectionLayout.backstage).toEqual(d.sectionLayout.backstage);expect(saved.page.sections[1]).toEqual(raw.page.sections[1]);expect(report.diagrams[0].stateCount).toBe(5);expect(report.diagrams[0].controls).toHaveLength(4);expect(result.sectionLayout.confluence.find(t=>t.controls).h).toBeGreaterThan(3);expect(result.sectionLayout.default).toBeUndefined();expect(report.diagrams[0].profile).toBe('confluence');
 expect(saved.page.flowview.features).toContain('flow.failures');expect(saved.page.flowview.features).toContain('layout.graph-frame');expect(saved.page.flowview.minVersion).toBe('0.2.0');
});
test('native DeviceApp measures both real paths and default reopened graph without capture camera state',async()=>{
 const raw=JSON.parse(await fs.readFile(path.join(repo,'src/starters/device-app-sources.json'),'utf8')),d=raw.page.sections[0].diagram;
 delete d.layouts;delete d.sectionLayout;delete d.exploreLayout;d.rows=[[]];d.floats=Object.keys(d.nodes).map(id=>({id,side:'below'}));
 const {saved,report}=await cli(raw,'deviceapp',['--rearrange']);expect(saved.page.sections[0].diagram.panels).toEqual(d.panels);expect(report.diagrams[0].stateCount).toBe(11);expect(report.diagrams[0].graph.every(g=>g.count===5&&g.clipped===0&&g.minimumLabelPx>=8)).toBe(true);expect(saved.page.sections[0].diagram.sectionLayout.default.find(t=>t.panel==='camera-app').w).toBeLessThan(12);
});
test('800px mixed graph and panels reopen with durable framing and unchanged node routes',async()=>{
 const raw=draft([{id:'start',text:'Check the current charge.',panels:{charge:{charge:51}}},{id:'detail',text:'Read all the detailed evidence before proceeding. '.repeat(18)}]);
 const d=raw.page.sections[0].diagram;d.nodes.c={title:'Store'};d.floats.push({id:'c',side:'below'});d.edges.push({from:'b',to:'c',label:'Persist the current state'});
 const {saved,report}=await cli(raw,'narrow',['--width','800']);const result=saved.page.sections[0].diagram;
 expect(saved.page.flowview.features).toContain('layout.graph-frame');expect(saved.page.flowview.features).toContain('layout.grid-24');
 expect(result.graphFrame.w).toBeLessThan(1180);expect(result.steps).toEqual(d.steps);expect(result.panels).toEqual(d.panels);expect(report.diagrams[0].graph.every(g=>g.count===3&&g.clipped===0&&g.minimumLabelPx>=8)).toBe(true);
 const old=require(path.join(kit,'tools/auto-arrange-spec.cjs')),graphOnly=(await old.arrangeSpec(raw,[0])).raw.page.sections[0].diagram;expect(result.floats).toEqual(graphOnly.floats);expect(result.edges).toEqual(graphOnly.edges);
});
test('native framing includes long labels groups curves and coins; malformed and old defaults remain unchanged',async({page})=>{
 await page.setContent(await fs.readFile(path.join(kit,'tools/arrange/generated-native.html'),'utf8'));
 const raw=draft(Array.from({length:9},(_,i)=>({id:'s'+i,text:'Step '+i,edges:['a->b']}))),d=raw.page.sections[0].diagram;
 d.steps[1].failures={'a->b':'dropped'};d.steps[1].conditions=[{nodeId:'a',kind:'service-error',label:'Observed failure'}];
 d.rows=[[]];d.floats=[{id:'a',side:'below',x:120,y:150},{id:'b',side:'below',x:390,y:150}];d.nodes.a.group='services';d.groups={services:{title:'A group label that reaches beyond its compact card'}};
 d.edges=[{from:'a',to:'b',label:'An edge label with detailed semantic information',curveControls:[{t:0,dx:0,dy:-100},{t:1,dx:0,dy:-100}],delta:true}];d.graphFrame={x:0,y:0,w:1,h:1};d.sectionLayout={columns:24,default:[{x:0,y:0,w:24,h:20},{controls:'steps',x:0,y:20,w:24,h:5},{panel:'charge',x:0,y:25,w:8,h:4}]};
 const measure=async diagram=>page.evaluate(async d=>{const initial=await arrangementNative.paint({diagram:d,skin:'pastel'});for(const state of initial.states)await arrangementNative.observe(state);const svg=document.querySelector('.boardcanvas>svg'),vb=svg.viewBox.baseVal;return {vb:{x:vb.x,y:vb.y,w:vb.width,h:vb.height},content:boardContentBounds(svg)};},diagram);
 const before=JSON.stringify(d),framed=await measure(d);expect(JSON.stringify(d)).toBe(before);expect(framed.vb.x).toBeLessThanOrEqual(framed.content.x);expect(framed.vb.y).toBeLessThanOrEqual(framed.content.y);expect(framed.vb.x+framed.vb.w).toBeGreaterThanOrEqual(framed.content.x+framed.content.w);expect(framed.vb.y+framed.vb.h).toBeGreaterThanOrEqual(framed.content.y+framed.content.h);
 delete d.graphFrame;const old=await measure(d);d.graphFrame={x:'bad',y:0,w:1,h:1};expect(await measure(d)).toEqual(old);expect(old.vb.w).toBeGreaterThanOrEqual(1180);
});
test('panel-only ambient composition preserves native bounded table scrolling',async()=>{
 const raw=draft(),d=raw.page.sections[0].diagram;d.nodes={};d.floats=[];d.edges=[];
 d.panels.push({id:'records',type:'table',title:'Recorded evidence',columns:[{id:'key',label:'Record'},{id:'value',label:'Value'}],initial:{rows:Array.from({length:12},(_,i)=>({id:'row'+i,cells:{key:'Record '+i,value:'Detailed recorded value '+i}}))}});
 const {saved,report}=await cli(raw,'panel-only');expect(saved.page.sections[0].diagram.panels).toEqual(d.panels);expect(report.diagrams[0].stateCount).toBe(1);expect(report.diagrams[0].graph).toEqual([]);expect(report.diagrams[0].panels).toEqual(['charge','records']);
});
test('unfittable native narrative preserves existing output and missing runtime gives the single setup command',async()=>{
 const raw=draft([{id:'deep',text:'Evidence and explanation requiring readable text. '.repeat(500)}]);const input=path.join(kit,'fail.json'),output=path.join(kit,'fail.out.json');await fs.writeFile(input,JSON.stringify(raw));await fs.writeFile(output,'keep');
 const failed=await run(process.execPath,[path.join(kit,'tools/arrange-spec.cjs'),input,output],{cwd:kit}).catch(e=>e);expect(failed.code).not.toBe(0);expect(failed.stderr).toContain('Unsupported:');expect(await fs.readFile(output,'utf8')).toBe('keep');
 await fs.writeFile(input,JSON.stringify(draft()));
 await fs.rename(path.join(kit,'tools/arrange/node_modules'),path.join(kit,'tools/arrange/deps-away'));
 try{const missing=await run(process.execPath,[path.join(kit,'tools/arrange-spec.cjs'),input,output],{cwd:kit}).catch(e=>e);expect(missing.stderr).toContain('node tools/arrange/setup.cjs');expect(await fs.readFile(output,'utf8')).toBe('keep');}finally{await fs.rename(path.join(kit,'tools/arrange/deps-away'),path.join(kit,'tools/arrange/node_modules'));}
});

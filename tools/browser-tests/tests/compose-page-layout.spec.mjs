// Browser use is a development oracle only. The production command cannot load
// this harness and has independent tests forbidding browser/child-process use.
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),A=require('../../compose-page-layout.cjs'),corpus=require('../../panel-placement/corpus.cjs'),{payload}=require('../helpers/arrangement-page.cjs');
const C=corpus.engine(),defaults={width:1200,profile:'default',rearrange:false};
const cases=['residential-3','ingestion-3','api-2','health-2','capacity-2','overview-3','experience-3'];
for(const id of cases)test('browser-free composition native development QA: '+id,async({page},info)=>{
 const scenario=corpus.scenarios().find(s=>s.id===id);await page.setViewportSize({width:scenario.host.width,height:1000});
 await page.setContent(payload());
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.fillStyle='#edf4fb';x.fillRect(0,0,640,360);x.fillStyle='#234';x.font='24px sans-serif';x.fillText('Fictional field operations',30,55);return c.toDataURL();});
 const raw=corpus.specification(C,scenario,image),d=raw.page.sections[0].diagram;delete d.layouts;delete d.defaultLayout;d.rows=[[]];d.floats=Object.keys(d.nodes).map(id=>({id,side:'below'}));
 const before=JSON.stringify(raw),result=await A.arrange(raw,{...defaults,width:scenario.host.width}),output=result.raw.page.sections[0].diagram;
 expect(JSON.stringify(raw)).toBe(before);expect(output.panels).toEqual(d.panels);expect(output.steps).toEqual(d.steps);expect(result.diagnostics[0].measurement).toContain('estimates');
 const initial=await page.evaluate(async diagram=>arrangementNative.paint({diagram,skin:'pastel'}),output),observations=[];
 for(const state of initial.states)observations.push(await page.evaluate(s=>arrangementNative.observe(s),state));
 await fs.writeFile(info.outputPath('measurements.json'),JSON.stringify({estimates:result.diagnostics,observations},null,2));
 await page.screenshot({path:info.outputPath('composed.png'),fullPage:true});
 expect(observations.every(o=>o.panels.length===d.panels.length)).toBe(true);
 for(const o of observations){
  if(o.controls)expect(o.controls.clipped,'caption '+JSON.stringify(o.state)).toBe(0);
  if(o.graph){expect(o.graph.clipped,'graph '+JSON.stringify(o.state)).toBe(0);expect(o.graph.minimumLabelPx).toBeGreaterThanOrEqual(8);}
  for(const p of o.panels){expect(p.overflowX,p.id+' horizontal').toBeLessThanOrEqual(4);expect(p.overflowY,p.id+' body height').toBeLessThanOrEqual(4);}
 }
});
test('deep caption and path-local inherited evidence remain readable in the native renderer',async({page})=>{
 const d={nodes:{a:{title:'Client'},b:{title:'Store'}},rows:[[]],floats:[{id:'a',side:'below'},{id:'b',side:'below'}],edges:[{from:'a',to:'b'}],panels:[{id:'log',type:'log',initial:{log:[{text:'Initial evidence'}]}}],steps:[{id:'a',text:'Begin.',panels:{log:{log:[{text:'Step one'}]}}},{id:'long',text:'Confirm the evidence before continuing with the next operation. '.repeat(22),panels:{log:{log:[{text:'Detailed evidence '.repeat(15)}]}}},{id:'other',text:'Alternative.',panels:{log:{log:[{text:'Alternative outcome'}]}}}],paths:[{id:'normal',steps:['a','long']},{id:'alternative',steps:['a','other']}]};
 const result=await A.arrange(d,{...defaults,width:800});await page.setViewportSize({width:800,height:1000});await page.setContent(payload());
 const initial=await page.evaluate(diagram=>arrangementNative.paint({diagram,skin:'pastel'}),result.raw.page.sections[0].diagram);
 expect(initial.states).toHaveLength(5);
 for(const state of initial.states){const o=await page.evaluate(s=>arrangementNative.observe(s),state);if(o.controls)expect(o.controls.clipped).toBe(0);expect(o.panels[0].overflowY).toBeLessThanOrEqual(4);}
});

test('long visible URLs in a table fit in ambient and step states',async({page},info)=>{
 const value='https://example.com/'+'very-long-visible-path/'.repeat(80);
 const d={nodes:{a:{title:'Request'}},rows:[[]],floats:[{id:'a',side:'below'}],edges:[],panels:[{id:'evidence',type:'table',title:'Visible URL evidence',columns:[{id:'value',label:'Value'}],initial:{rows:[{id:'request',cells:{value}}]}}],steps:[{text:'Read the complete evidence.'}]};
 const result=await A.arrange(d,{...defaults,width:800});await page.setViewportSize({width:800,height:1000});await page.setContent(payload());
 const initial=await page.evaluate(diagram=>arrangementNative.paint({diagram,skin:'pastel'}),result.raw.page.sections[0].diagram),observations=[];
 for(const state of initial.states){
  const o=await page.evaluate(s=>arrangementNative.observe(s),state);observations.push(o);
  expect(o.panels[0].text).toContain(value);expect(o.panels[0].overflowY).toBeLessThanOrEqual(4);expect(o.panels[0].overflowX).toBeLessThanOrEqual(4);
 }
 await fs.writeFile(info.outputPath('measurements.json'),JSON.stringify({estimates:result.diagnostics,observations},null,2));
 await page.screenshot({path:info.outputPath('composed.png'),fullPage:true});
});

// Generic engineering fixture, independent of authoring benchmark artifacts.
function fitFixture(){
 const ids=Array.from({length:5},(_,i)=>'n'+i);
 return {nodes:Object.fromEntries(ids.map(id=>[id,{title:'Stage '+id}])),rows:[[]],floats:ids.map(id=>({id,side:'below'})),edges:ids.slice(1).map((id,i)=>({from:ids[i],to:id})),
  panels:[{id:'camera',type:'screen',title:'Camera evidence',initial:{mode:'live',audio:{connection:'connected',microphone:'capturing',output:'speech',playback:'playing',text:'Please leave the parcel near the entrance and confirm the delivery.',source:'Visitor at entrance',reason:'Connection verified'}}},
   {id:'phone',type:'phone',initial:{notify:{app:'Dispatch',title:'Delivery notification',text:'A detailed delivery notification that is intentionally long enough to exceed the native two line notification card.'}}},
   {id:'app',type:'deviceapp',initial:{screen:'home'}}],
  steps:Array.from({length:6},(_,i)=>({id:'s'+i,text:'Review the recorded evidence before confirming the next processing stage. '.repeat(i===5?9:2),...(i===1?{panels:{camera:{audio:{connection:'connected',microphone:'capturing',output:'speech',playback:'playing',text:'Delivery confirmed.',source:'Visitor at entrance',reason:'Connection verified; recording is retained for review. '.repeat(3)}}}}:{})})),
  paths:Array.from({length:4},(_,i)=>({id:'p'+i,label:'Outcome '+i,steps:['s0','s1','s'+(i+2)]}))};
}
for(const width of [800,1200,1440,1920])test('native fit at explicit isolated host width '+width,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.setContent(payload({isolatedHost:true}));
 const raw=fitFixture(),result=await A.arrange(raw,{...defaults,width}),d=result.raw.page.sections[0].diagram;
 expect(d.steps).toEqual(raw.steps);expect(d.paths).toEqual(raw.paths);expect(d.panels).toEqual(raw.panels);
 const initial=await page.evaluate(diagram=>arrangementNative.paint({diagram,skin:'pastel'}),d),observations=[];
 expect(initial.geometry.gridWidth).toBeCloseTo(Math.max(1000,width-80),0);
 for(const state of initial.states){
  const o=await page.evaluate(s=>arrangementNative.observe(s),state);observations.push(o);
  expect(o.graph.clipped,'graph '+JSON.stringify(state)).toBe(0);expect(o.graph.minimumLabelPx).toBeGreaterThanOrEqual(8);
  if(o.controls)expect(o.controls.clipped,'narrative '+JSON.stringify(state)).toBe(0);
  const camera=o.panels.find(p=>p.id==='camera');expect(camera.overflowY,'camera '+JSON.stringify(state)).toBeLessThanOrEqual(4);
  expect(camera.nestedOverflow).toHaveLength(0);
  const phone=o.panels.find(p=>p.id==='phone');expect(phone.nativeContent.width).toBeCloseTo(178,0);
  expect(phone.nestedOverflow.some(p=>p.class==='phonetext')).toBe(true);
 }
 const limits=result.diagnostics[0].panels.find(p=>p.id==='phone').nativeLimits;
 expect(limits.contentWidth).toBe(178);expect(limits.notificationTextLines).toBe(2);
 expect(result.diagnostics[0].panels.find(p=>p.id==='app').nativeLimits.maxContentWidth).toBe(330);
 // Check footer and prose text rectangles themselves, including clipping by
 // ancestors, not merely the outer widget's scrollHeight.
 const visible=await page.evaluate(()=>{
  function cut(e){const range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].filter(r=>r.width&&r.height).some(r=>{for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden/.test(s.overflowY)&& (r.top<b.top-2||r.bottom>b.bottom+2))return true;}return false;});}
  return [...document.querySelectorAll('.screen-audio-direction,.fva-heading,.fva-caption,.fva-reason,.step-text')].filter(e=>e.getBoundingClientRect().height).map(e=>({text:e.textContent,clipped:cut(e)}));
 });
 expect(visible.every(v=>!v.clipped),JSON.stringify(visible)).toBe(true);
 await fs.writeFile(info.outputPath('measurements.json'),JSON.stringify({estimates:result.diagnostics,observations,visible},null,2));
 await page.screenshot({path:info.outputPath('composed.png'),fullPage:true});
});

for(const width of [800,1200,1440,1920])test('width-sized graph SVG fits its tile at '+width,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.setContent(payload({isolatedHost:true}));
 // Exercise composition after graph positioning, with a tall engineering graph.
 // Width candidate rounding must not crop the lower stage of a narrow frame.
 const raw={nodes:{a:{title:'Receive'},b:{title:'Process'},c:{title:'Store'}},rows:[[]],floats:[{id:'a',x:100,y:60},{id:'b',x:100,y:300},{id:'c',x:100,y:540}],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],steps:[{text:'Inspect every processing stage.'}],panels:[]};
 const measurer=await require('../../arrange/measure.cjs').createMeasurer(width),result=await measurer.arrange({diagram:A.seed(raw,[])},'pastel'),d=result.spec.diagram;
 await measurer.close();
 const initial=await page.evaluate(diagram=>arrangementNative.paint({diagram,skin:'pastel'}),d),observations=[];
 for(const state of initial.states){const o=await page.evaluate(s=>arrangementNative.observe(s),state);observations.push(o);expect(o.graph.clipped).toBe(0);expect(o.graph.minimumLabelPx).toBeGreaterThanOrEqual(8);}
 const geometry=await page.evaluate(()=>{const svg=document.querySelector('[data-layout-key="diagram"] .boardcanvas>svg'),board=svg.closest('.board');return {svgBottom:svg.getBoundingClientRect().bottom,boardBottom:board.getBoundingClientRect().bottom};});
 expect(geometry.svgBottom).toBeLessThanOrEqual(geometry.boardBottom+2);
 await fs.writeFile(info.outputPath('measurements.json'),JSON.stringify({estimates:result.diagnostics,observations,geometry},null,2));
 await page.screenshot({path:info.outputPath('composed.png'),fullPage:true});
});

'use strict';
const crypto=require('node:crypto');
const {clone}=require('./corpus.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const diagram=spec=>spec.page.sections[0].diagram;
const layout=spec=>diagram(spec).layouts[0].sectionLayout.default;
const key=t=>t.panel?'panel:'+t.panel:t.controls?'controls:'+t.controls:'diagram';
const FULL=new Set(['cost','security','dispatch','data-contract']);
const TALL=new Set(['phone','deviceapp','appscreens']);
function height(p,density){const base={cost:20,security:20,dispatch:15,'data-contract':10,phone:10,deviceapp:15,appscreens:10,table:6,trace:10,waterfall:9,homemap:10,checks:6,log:5,tiles:6,xray:5,thermo:3,leds:3,state:3,battery:4,gauge:4,budget:5,orbit:5,signal:4,queue:4,buffer:3,image:9,replicas:8,inflight:8};return (base[p.type]||6)+(density==='dense'?2:0);}
function candidate(source,s,family){const spec=clone(source),d=diagram(spec);let y=0,items=[];
 function row(tiles,widths){let x=0,h=0;tiles.forEach((t,i)=>{const it={...t,x,y,w:widths[i]};x+=widths[i];h=Math.max(h,it.h);items.push(it);});y+=h;}
 const panels=d.panels.map(p=>({panel:p.id,h:height(p,s.density),type:p.type}));
 const graph={h:(s.graphRole==='diagram-dominant'?8:6)+s.graphShape*2};
 const visibleGraph=s.graphRole!=='hidden';
 if(family==='main-rail'&&panels.length>1&&panels.some(p=>!FULL.has(p.type))){
  // Independent rail stacking keeps short status panels beside broad evidence.
  const broad=panels.filter(p=>!TALL.has(p.type)&&!['battery','thermo','signal','gauge','leds','state','checks','queue'].includes(p.type));
  const rail=panels.filter(p=>!broad.includes(p));
  if(!rail.length){const at=broad.findIndex(p=>!FULL.has(p.type));rail.push(broad.splice(at,1)[0]);}
  if(!broad.length)broad.push(rail.shift());
  if(visibleGraph)broad.unshift(graph);
  let left=0,right=0;const w=s.host.width===800?15:16;
  for(const t of broad){items.push({...t,x:0,y:left,w});left+=t.h;}
  for(const t of rail){items.push({...t,x:w,y:right,w:24-w});right+=t.h;}
  y=Math.max(left,right);
 }else{
  if(visibleGraph){
   const compact=panels.findIndex(p=>!FULL.has(p.type));
   if(family==='graph-rail'&&compact>=0){row([graph,panels.splice(compact,1)[0]],[15,9]);}
   else row([graph],[24]);
  }
  if(family==='summary-first')panels.sort((a,b)=>(a.h-b.h));
  while(panels.length){const first=panels.shift(),next=panels[0];
   if(family==='wide-stack'&&!TALL.has(first.type)){row([first],[24]);continue;}
   if(family==='summary-first'&&panels.length>=2&&[first,next,panels[1]].every(p=>p.h<=9&&!FULL.has(p.type))){row([first,panels.shift(),panels.shift()],[8,8,8]);continue;}
   if(next){
    // Full evidence panels get 15/9 with a compact neighbor; two reports use 12/12.
    if(FULL.has(first.type)&&FULL.has(next.type)&&s.host.width===800){row([first],[24]);continue;}
    let widths=TALL.has(first.type)?[9,15]:TALL.has(next.type)?[15,9]:family==='balanced'?[12,12]:FULL.has(first.type)?[15,9]:[13,11];
    row([first,panels.shift()],widths);
   }else row([first],[TALL.has(first.type)?(family==='wide-stack'?9:11):24]);
  }
 }
 row([{controls:'steps',h:3}],[24]);if(!visibleGraph)items.push({...graph,x:0,y:0,w:24,hidden:true});
 const order=['diagram',...d.panels.map(p=>'panel:'+p.id),'controls:steps'];items.sort((a,b)=>order.indexOf(key(a))-order.indexOf(key(b)));items.forEach(t=>delete t.type);
 d.layouts[0].sectionLayout={columns:24,default:items};return spec;
}
function semantic(spec){const clean=clone(spec);for(const t of layout(clean))for(const k of ['x','y','w','h'])delete t[k];return stable(clean);}
function check(spec){const l=diagram(spec).layouts[0].sectionLayout;if(l.columns!==24)throw Error('Expected columns24');const tiles=layout(spec),seen=new Set();for(const t of tiles){if(seen.has(key(t)))throw Error('Duplicate tile');seen.add(key(t));if(!['x','y','w','h'].every(k=>Number.isInteger(t[k]))||t.x<0||t.y<0||t.w<1||t.h<3||t.x+t.w>24||t.y>500||t.h>40)throw Error('Invalid grid bounds');}
 const visible=tiles.filter(t=>!t.hidden);visible.forEach((a,i)=>visible.slice(i+1).forEach(b=>{if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)throw Error('Tile overlap');}));
 if(diagram(spec).panels.some(p=>!seen.has('panel:'+p.id)))throw Error('Missing panel tile');return true;}
function checkPair(a,b){check(a);check(b);if(semantic(a)!==semantic(b))throw Error('A/B content mismatch');if(stable(layout(a))===stable(layout(b)))throw Error('Identical candidates');return hash(semantic(a));}
function distinct(a,b){return layout(a).some((t,i)=>['x','y','w','h'].reduce((n,k)=>n+Math.abs(t[k]-layout(b)[i][k]),0)>=6);}
function pair(source,s,seed){const families=['main-rail','balanced','summary-first','graph-rail','wide-stack'];const start=parseInt(hash(seed+s.id).slice(0,8),16)%families.length;const a=candidate(source,s,families[start]);let b,method;for(let n=1;n<families.length;n++){method=families[(start+n)%families.length];b=candidate(source,s,method);if(distinct(a,b))break;}
 // A single full-width report still has a meaningful compact/tall alternative.
 if(!distinct(a,b)){b=candidate(source,s,families[start]);let tile=layout(b).find(t=>t.panel);const oldBottom=tile.y+tile.h,delta=Math.min(3,40-tile.h);tile.h+=delta;tile.w=tile.w===24?18:Math.min(24,tile.w+3);for(const t of layout(b))if(t!==tile&&t.y>=oldBottom&&!t.hidden)t.y+=delta;method='roomier-report';}
 checkPair(a,b);const flip=parseInt(hash(seed+'labels'+s.id).slice(0,2),16)%2;return {A:flip?b:a,B:flip?a:b,methods:flip?{A:method,B:families[start]}:{A:families[start],B:method}};}
module.exports={hash,stable,diagram,layout,key,semantic,check,checkPair,pair,height};

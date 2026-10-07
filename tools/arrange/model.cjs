'use strict';
const crypto=require('node:crypto');
const clone=x=>JSON.parse(JSON.stringify(x));
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const diagram=spec=>spec.diagram;
const layout=spec=>diagram(spec).sectionLayout.default;
const key=t=>t.panel?'panel:'+t.panel:t.controls?'controls:'+t.controls:'diagram';
function semantic(spec){const clean=clone(spec);for(const t of layout(clean))for(const k of ['x','y','w','h'])delete t[k];return stable(clean);}
function check(spec){
 const tiles=layout(spec),seen=new Set();
 if(diagram(spec).sectionLayout.columns!==24)throw Error('Expected columns:24');
 for(const t of tiles){if(seen.has(key(t)))throw Error('Duplicate tile');seen.add(key(t));if(!['x','y','w','h'].every(k=>Number.isInteger(t[k]))||t.x<0||t.y<0||t.w<1||t.h<3||t.x+t.w>24||t.y>500||t.h>40)throw Error('Invalid grid bounds');}
 const visible=tiles.filter(t=>!t.hidden);visible.forEach((a,i)=>visible.slice(i+1).forEach(b=>{if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)throw Error('Tile overlap');}));
 if((diagram(spec).panels||[]).some(p=>!seen.has('panel:'+p.id)))throw Error('Missing panel tile');return true;
}
module.exports={clone,stable,hash,diagram,layout,key,semantic,check};

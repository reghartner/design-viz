'use strict';
// #1185: trace highlight levels. With a span focused, the focused span's carriers are "current",
// carriers of its descendant spans "below", of its ancestor spans "above", and the rest of the
// trace "other". Marks reuse #1074's node brackets and edge outline; their colour follows each
// span's tone; node and edge ink never changes. With no span focused every carrier is "below".
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,console,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('standalone').body,C);

// The reported checkout board, plus a currency node on a sibling branch of the trace.
function board(){
 return {nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},payment:{title:'Payment service'},cart:{title:'Cart service'},shipping:{title:'Shipping service'},email:{title:'Email service'},currency:{title:'Currency service'}},
  rows:[['web','checkout','payment'],['cart','shipping','email'],['currency']],
  edges:[{from:'web',to:'checkout',label:'PlaceOrder'},{from:'checkout',to:'cart',label:'GetCart'},{from:'checkout',to:'payment',label:'Charge'},{from:'checkout',to:'shipping',label:'ShipOrder'},{from:'checkout',to:'email',label:'Send confirmation'}],
  steps:[{id:'accept',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},
   {id:'place',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}},
   {id:'cart',edge:'checkout->cart',traceMatch:{serviceName:'cart',operation:'msdemo.CartService/GetCart'}},
   {id:'charge',edge:'checkout->payment',traceMatch:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}},
   {id:'ship',edge:'checkout->shipping',traceMatch:{serviceName:'shipping',operation:'msdemo.ShippingService/ShipOrder'}},
   {id:'quote',nodes:['shipping'],traceMatch:{serviceName:'database',operation:'INSERT shipping.quotes',nodeId:'shipping'}},
   {id:'currency',nodes:['currency'],traceMatch:{serviceName:'currency',operation:'grpc.msdemo.CurrencyService/GetSupportedCurrencies',nodeId:'currency'}}]};
}
const PLACE='2275c50ef5f955a5',CHARGE='2beed983172122bf';
let recorded;
async function trace(){return structuredClone(recorded || (recorded=await (await import('./helpers/step-evidence.mjs')).recordedUrlEvidence()));}

// A small SVG surface: everything telemetryPaintTrace and the #1074 focus marks touch.
function surface(d){
 const doc={defaultView:{getComputedStyle:el=>({display:'inline',visibility:'visible',strokeWidth:el.attrs['stroke-width'] || '2'})}};
 function el(tag,attrs={}){
  const e={tagName:tag,attrs:{...attrs},children:[],parentNode:null,textContent:'',ownerDocument:doc,
   setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return k in this.attrs?this.attrs[k]:null;},removeAttribute(k){delete this.attrs[k];},
   appendChild(c){if(c.parentNode)c.remove();c.parentNode=this;this.children.push(c);return c;},
   insertBefore(c,ref){if(c.parentNode)c.remove();c.parentNode=this;const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,c);return c;},
   remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;},
   get classList(){const self=this;return {contains:c=>(self.attrs.class || '').split(/\s+/).includes(c)};},
   matches(sel){return matches(this,sel);},closest(sel){let n=this;while(n){if(n.matches && n.matches(sel))return n;n=n.parentNode;}return null;},
   querySelector(sel){return all(this).find(n=>n!==this && n.matches(sel)) || null;},querySelectorAll(sel){return all(this).filter(n=>n!==this && n.matches(sel));},
   getBBox(){return {x:0,y:0,width:120,height:40};},getTotalLength:()=>100,getPointAtLength:l=>({x:l,y:0})};
  return e;
 }
 function all(n){return [n].concat(...n.children.map(all));}
 function matches(n,sel){return sel.split(',').some(one=>{
  one=one.trim();let not=null;one=one.replace(/:not\(([^)]*)\)/,(_,q)=>{not=q;return '';});if(not && matches(n,not))return false;
  const tag=one.match(/^[a-z]+/i),cls=[...one.matchAll(/\.([\w-]+)/g)].map(m=>m[1]),att=[...one.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
  if(tag && n.tagName!==tag[0])return false;if(cls.some(c=>!n.classList.contains(c)))return false;
  return att.every(([,k,v])=>n.getAttribute(k)!==null && (v===undefined || n.getAttribute(k)===v));
 });}
 doc.createElementNS=(ns,tag)=>el(tag);
 const svg=el('svg'),edgesLayer=svg.appendChild(el('g',{class:'edges'}));
 Object.keys(d.nodes).forEach(id=>{const g=svg.appendChild(el('g',{class:'node','data-dv-node':id}));g.appendChild(el('rect',{class:'card',fill:'#fff',stroke:'#123'}));});
 d.edges.forEach((e,i)=>edgesLayer.appendChild(el('path',{class:'edge','data-dv-edge':String(i),id:'edge-'+i,d:'M0 0C40 80 60 80 100 0',stroke:'#456','stroke-width':'2','marker-end':'url(#arrow)'})));
 const node=id=>svg.querySelector('g.node[data-dv-node="'+id+'"]'),edge=i=>svg.querySelector('path.edge[data-dv-edge="'+i+'"]');
 const level=n=>n.getAttribute('data-trace-level');
 const outline=i=>svg.querySelectorAll('.dv-trace-edge-focus').find(g=>g.parentNode===edgesLayer && edgesLayer.children.indexOf(g)===edgesLayer.children.indexOf(edge(i))-1) || null;
 const brackets=id=>node(id).querySelector('.dv-trace-focus-overlay');
 const label=n=>n.matches('g.node')?n.querySelector('.dv-trace-overlay'):svg.querySelectorAll('.dv-trace-overlay').find(g=>g.getAttribute('data-trace-edge')===n.getAttribute('data-dv-edge')) || null;
 const ink=()=>JSON.stringify(svg.querySelectorAll('rect.card,path.edge').map(n=>['fill','stroke','stroke-width','class','style','marker-end'].map(k=>n.getAttribute(k))));
 return {scope:svg,node,edge,level,outline,brackets,label,ink};
}
async function paint(focusSpan,edit){
 const d=board(),e=await trace();if(edit)edit(e);
 const model=C.telemetryTraceModel(d,undefined,e),s=surface(d),before=s.ink();
 let focus=null;
 if(focusSpan){const choices=C.telemetryTraceChoices(d,undefined,e,focusSpan);assert.equal(choices.length,1,'the focused span maps to one step');focus={spanId:focusSpan,choice:choices[0]};}
 C.telemetryPaintTrace({el:s.scope,section:{diagram:d}},model,focus);
 return {...s,before};
}

test('a focused middle span marks current, below, above and other carriers',async()=>{
 const s=await paint(PLACE);
 assert.equal(s.level(s.edge(0)),'current','PlaceOrder (the focused span) is current');
 assert.equal(s.level(s.node('web')),'above','the root /cart/checkout span is an ancestor');
 for(const i of [1,2,3])assert.equal(s.level(s.edge(i)),'below','edge '+i+' maps a descendant span');
 assert.equal(s.level(s.node('shipping')),'below','INSERT shipping.quotes is a descendant');
 assert.equal(s.level(s.node('currency')),'other','GetSupportedCurrencies is on a sibling branch');
 assert.equal(s.level(s.node('checkout')),null,'no span maps the checkout node');assert.equal(s.level(s.edge(4)),null,'no span maps the email edge');
});
test('levels draw #1074 brackets and outlines, with each span tone, and no marks for other',async()=>{
 const s=await paint(PLACE,e=>{e.spans.find(x=>x.id===CHARGE).error=true;});
 for(const [n,lvl] of [[s.node('web'),'above'],[s.node('shipping'),'below']]){
  const b=s.brackets(n.getAttribute('data-dv-node'));assert.ok(b,n.getAttribute('data-dv-node')+' has brackets');
  assert.equal(b.getAttribute('data-trace-level'),lvl);assert.equal(b.getAttribute('data-trace-tone'),'observed');
 }
 assert.equal(s.brackets('currency'),null,'other: no brackets');
 for(const [i,lvl,tone] of [[0,'current','observed'],[1,'below','observed'],[2,'below','error'],[3,'below','observed']]){
  const o=s.outline(i);assert.ok(o,'edge '+i+' has an outline along its own path');
  assert.equal(o.getAttribute('data-trace-level'),lvl,'edge '+i+' outline level');assert.equal(o.getAttribute('data-trace-tone'),tone,'edge '+i+' outline tone');
  assert.equal(o.querySelector('.dv-trace-edge-outline').getAttribute('d'),s.edge(i).getAttribute('d'),'the outline follows the edge path');
 }
 assert.equal(s.ink(),s.before,'node and edge fill, stroke, width, class, style and arrows are unchanged');
});
test('time labels carry their carrier level: the focused one prominent, unrelated ones smaller',async()=>{
 const s=await paint(PLACE);
 for(const [n,lvl] of [[s.edge(0),'current'],[s.node('web'),'above'],[s.edge(2),'below'],[s.node('currency'),'other']])
  assert.equal(s.label(n).getAttribute('data-trace-level'),lvl,(n.getAttribute('data-dv-node') || 'edge '+n.getAttribute('data-dv-edge'))+' label');
});
test('with no span focused every carrier in the trace is below, with normal labels',async()=>{
 const s=await paint(null);
 for(const n of [s.node('web'),s.node('shipping'),s.node('currency'),s.edge(0),s.edge(1),s.edge(2),s.edge(3)]){
  assert.equal(s.level(n),'below');assert.equal(s.label(n).getAttribute('data-trace-level'),'below');
 }
 assert.equal(s.brackets('web').getAttribute('data-trace-level'),'below');assert.equal(s.outline(0).getAttribute('data-trace-level'),'below');
 assert.equal(s.ink(),s.before);
});

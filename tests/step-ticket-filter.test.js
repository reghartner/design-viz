/* #1103 step ticket filter. A step may name, in `ticketFilter`, the subset of
   the tickets on the nodes and edges it lights that the step shows. Test plan:
| row | rule |
|---|---|
| T1 | A step lighting a node with tickets A, B, C and filter [B]: the step rollup (coin state), caption and ticket list use only B; the node still shows A, B, C. |
| T2 | Without a filter the step uses every ticket on its lit carriers (today's behaviour). |
| T3 | A filter key that is not on a node or edge the step lights is a warning with its field path and is ignored; with no lit key left the step shows every ticket. A malformed filter (not an array, empty, an entry that is not a Jira key) is an error. Orchestrator ruling 2026-11-07: tickets churn, so a removed ticket never stops a spec from validating or resolving. |
| T4 | An imported node's merged tickets (provider + consumer nodeTracking) can be filtered; a stale key on an imported step does not stop topology resolution. |
| T5 | (browser) tools/browser-tests/tests/step-ticket-filter.spec.mjs: Workbench Inspect checklist writes the filter. |
| T6 | Workbench deletion of a node, an edge, or a ticket from a carrier (local or imported overlay) prunes that key from step filters; an emptied filter is removed (ruling 2026-11-07). |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
/* Minimal DOM, the same shape as tests/live-status.test.js uses. */
class Element {
 constructor(tag='div',attrs={}){this.tagName=tag;this.attrs={...attrs};this.children=[];this.events={};this.props={};this.hidden=false;this.isConnected=true;
  this.style={setProperty:(k,v)=>this.props[k]=v,removeProperty:k=>delete this.props[k],getPropertyValue:k=>this.props[k]||''};
  this.classList={contains:x=>(this.attrs.class||'').split(' ').includes(x),add:(...xs)=>this.attrs.class=[...new Set((this.attrs.class||'').split(' ').filter(Boolean).concat(xs))].join(' '),remove:(...xs)=>this.attrs.class=(this.attrs.class||'').split(' ').filter(x=>!xs.includes(x)).join(' '),toggle:(x,on)=>{on??=!this.classList.contains(x);this.classList[on?'add':'remove'](x);return on;}};
 }
 get className(){return this.attrs.class||'';}set className(v){this.attrs.class=v;}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 appendChild(el){if(el.parentNode)el.parentNode.children=el.parentNode.children.filter(c=>c!==el);el.parentNode=el.parentElement=this;el.ownerDocument=this.ownerDocument;this.children.push(el);return el;}
 insertBefore(el,before){if(el===before)return el;if(el.parentNode)el.parentNode.children=el.parentNode.children.filter(c=>c!==el);el.parentNode=el.parentElement=this;const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,el);return el;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.isConnected=false;}
 replaceChildren(...els){this.children=[];els.forEach(el=>this.appendChild(el));}
 cloneNode(){return new Element(this.tagName,this.attrs);}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();if(s.includes(' '))s=s.split(' ').pop();let excluded=false;s=s.replace(/:not\(([^)]+)\)/g,(_,q)=>{excluded=this.matches(q);return '';});if(excluded)return false;
  const tag=s.match(/^[a-z][a-z0-9]*/);if(tag&&tag[0]!==this.tagName)return false;
  for(const [,c] of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(c))return false;
  for(const [,k,v] of s.matchAll(/\[([\w-]+)(?:="([^"\]]*)")?\]/g))if(this.getAttribute(k)===null || v!==undefined&&this.getAttribute(k)!==v)return false;return true;});}
 querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}
 closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}contains(el){return this===el||this.children.some(c=>c.contains(el));}
 addEventListener(t,f){(this.events[t]??=new Set()).add(f);}removeEventListener(t,f){this.events[t]?.delete(f);}dispatchEvent(ev){ev.target??=this;for(const f of this.events[ev.type]||[])f(ev);}
 getBoundingClientRect(){return {left:0,top:0,right:100,bottom:50,width:100,height:50};}getBBox(){return {x:50,y:30,width:60,height:12};}
 getTotalLength(){return 100;}getPointAtLength(){return {x:50,y:30};}focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}get firstChild(){return this.children[0]||null;}
 // A failing deepEqual on two elements must print one line, never two circular trees.
 [Symbol.for('nodejs.util.inspect.custom')](){const a=this.attrs;return '<'+this.tagName+(a.class?' class="'+a.class+'"':'')+(a['data-dv-node']?' data-dv-node="'+a['data-dv-node']+'"':'')+' children='+this.children.length+'>';}
 toJSON(){return this[Symbol.for('nodejs.util.inspect.custom')]();}
}
const filterErrors=(C,raw)=>plain(C.validate(C.normalize(raw)).errors).filter(e=>/ticketFilter/.test(e));
const filterWarnings=(C,raw)=>plain(C.validate(C.normalize(raw)).warnings).filter(e=>/ticketFilter/.test(e));
function load(){const C={URL,console,AbortController,TextEncoder};vm.runInNewContext(entrypoint('native').source,C);return C;}
/* Renders every section with a Step-mode stepper on step `index` of the first and paints `map`. */
function render(raw,map,index=0,renderOptions={}){
 const frames=new Map(),timers=new Map();let serial=0;
 const doc=new Element('document');doc.hidden=false;doc.visibilityState='visible';doc.createElement=tag=>new Element(tag);doc.createElementNS=(_,tag)=>new Element(tag);doc.body=new Element('body');doc.getElementById=id=>doc.querySelector('[id="'+id+'"]');doc.documentElement=new Element('html');
 const schedule=(collection,fn,ms)=>{const id=++serial;collection.set(id,{fn,ms});return id;};
 const win=new Element('window');Object.assign(win,{document:doc,innerWidth:1440,innerHeight:900,setTimeout:(f,ms)=>schedule(timers,f,ms),clearTimeout:id=>timers.delete(id),setInterval:(f,ms)=>schedule(timers,f,ms),clearInterval:id=>timers.delete(id)});
 const C={URL,console,AbortController,TextEncoder,document:doc,window:win,requestAnimationFrame:f=>schedule(frames,f),cancelAnimationFrame:id=>frames.delete(id),setTimeout:win.setTimeout,clearTimeout:win.clearTimeout,setInterval:win.setInterval,clearInterval:win.clearInterval,
  MutationObserver:class{observe(){}disconnect(){}}};
 vm.runInNewContext(entrypoint('native').source,C);
 const page=C.normalize(raw),view=new Element();view.ownerDocument=doc;
 const sections=C.sectionRecords(page).map(r=>{const sectionEl=view.appendChild(new Element('section',{'class':'doc-sec'})),d=r.section.diagram||{},svg=sectionEl.appendChild(new Element('svg'));
  for(const id of Object.keys(d.nodes||{})){const node=svg.appendChild(new Element('g',{'class':'node','data-dv-node':id}));node.appendChild(new Element('rect',{'class':'card',width:'120',height:'55'}));}
  (d.edges||[]).forEach((e,i)=>{for(const [tag,cls] of [['path','edge'],['path','halo'],['text','lbl']])svg.appendChild(new Element(tag,{'class':cls,'data-dv-edge':String(i),x:'50',y:'30'}));});
  (d.steps||[]).forEach((st,i)=>svg.appendChild(new Element('g',{'class':'coin','data-dv-step':String(i)})));
  return {sectionEl,reference:r.reference,number:r.number};});
 const ctl={view,page,sections},rec=sections[0];
 rec.stepper={sourceIndex:()=>index,mode:()=>'step',path:()=>'default'};
 const host=rec.sectionEl.appendChild(new Element('div',{class:'termbar'})).appendChild(new Element('div',{class:'step-text'}));host.textContent='Step prose';
 ctl.liveStatus=C.createLiveStatus(ctl,page,{},renderOptions);
 const flush=()=>{for(let i=0;i<3;i++){const work=[...frames.values()];frames.clear();work.forEach(x=>x.fn());}};
 rec.sectionEl.dispatchEvent({type:'dv:stepchange'});flush();ctl.liveStatus.apply(map);flush();
 return {C,ctl,view,host,doc,flush,renderOptions,
  listed:()=>host.querySelectorAll('.dv-live-step-tickets .nbacklink').map(el=>el.textContent),
  caption:()=>(host.querySelector('.dv-live-caption')||{}).textContent||'',
  coin:i=>(view.querySelector('g.coin[data-dv-step="'+i+'"]').className.match(/dv-live-(todo|active|testing|done|blocked|missing|unchanged)\b/)||[])[1]||null,
  node:id=>(view.querySelector('g.node[data-dv-node="'+id+'"]').className.match(/dv-live-(todo|active|testing|done|blocked|missing|unchanged)\b/)||[])[1]||null};
}
const STEP='sections[0].diagram.steps[0]';
const spec=step=>({page:{tracking:{jira:{site:'https://jira.test'}},sections:[{id:'main',diagram:{
 nodes:{api:{title:'API',tickets:['ST-1','ST-2','ST-3']},db:{title:'DB',tickets:['DB-1']}},rows:[['api','db']],
 edges:[{from:'api',to:'db',label:'Write',tickets:['ED-1']}],panels:[{id:'status',type:'live-status'}],
 steps:[Object.assign({id:'build',text:'Build the API',nodes:['api']},step),{id:'write',text:'Write rows',edge:'api->db',nodes:['api'],ticketFilter:['ST-3','ED-1']}]}}]}});
const evidence={'ST-1':{state:'blocked'},'ST-2':{state:'done'},'ST-3':{state:'active'},'DB-1':{state:'todo'},'ED-1':{state:'todo'}};

test('T1 a filter [B] makes the step rollup, caption and ticket list use only B while the node keeps A, B, C',()=>{
 const raw=spec({ticketFilter:['ST-2']}),C=load(),d=C.normalize(raw).sections[0].diagram;
 assert.deepEqual(plain(C.liveStatusStepTickets(d,d.steps[0],true)),['ST-2']);
 assert.equal(C.liveStatusStep(d,d.steps[0],evidence),'done');
 assert.equal(C.liveStatusCaption(d,d.steps[0],evidence),'DONE');
 assert.deepEqual(plain(C.liveStatusStepTickets(d,d.steps[1],true)),['ED-1','ST-3'],'the filter spans the lit edge and node');
 assert.equal(C.liveStatusStep(d,d.steps[1],evidence),'active');
 assert.equal(C.liveStatusCaption(d,d.steps[1],evidence),'IN PROGRESS · 2 tickets');
 assert.equal(C.liveStatusPresentation(d.nodes.api,evidence),'blocked','the carrier keeps every ticket');
 const r=render(raw,evidence);
 assert.deepEqual(r.listed(),['ST-2']);assert.equal(r.caption(),'DONE');assert.equal(r.coin(0),'done');assert.equal(r.coin(1),'active');
 assert.equal(r.node('api'),'blocked','node paint still rolls up A, B, C');
 for(const key of ['ST-1','ST-2','ST-3'])assert.ok(r.ctl.liveStatus.refs().tickets.includes(key),key+' stays in the page refs and Tickets table');
 const second=render(raw,evidence,1);assert.deepEqual(second.listed(),['ED-1','ST-3']);assert.equal(second.caption(),'IN PROGRESS · 2 tickets');
});
test('T2 without a filter the step uses every ticket on its lit carriers',()=>{
 const raw=spec({}),C=load(),d=C.normalize(raw).sections[0].diagram;
 assert.deepEqual(plain(C.liveStatusStepTickets(d,d.steps[0],true)),['ST-1','ST-2','ST-3']);
 assert.equal(C.liveStatusStep(d,d.steps[0],evidence),'blocked');
 assert.equal(C.liveStatusCaption(d,d.steps[0],evidence),'BLOCKED · ST-1');
 const r=render(raw,evidence);
 assert.deepEqual(r.listed(),['ST-1','ST-2','ST-3']);assert.equal(r.caption(),'BLOCKED · ST-1');assert.equal(r.coin(0),'blocked');assert.equal(r.node('api'),'blocked');
 assert.deepEqual(filterErrors(C,raw),[]);
});
const unlit=(index,key)=>STEP+'.ticketFilter['+index+']: "'+key+'" is not on a node or edge this step lights — ignored';
const NONE_LIT=STEP+'.ticketFilter: no key is on a node or edge this step lights — the step shows every ticket';
test('T3 a filter key not on a lit node or edge is a warning with its field path and is ignored; malformed filters are errors',()=>{
 const C=load(),errors=raw=>filterErrors(C,raw),warnings=raw=>filterWarnings(C,raw);
 assert.deepEqual(errors(spec({ticketFilter:['ST-2']})),[]);assert.deepEqual(warnings(spec({ticketFilter:['ST-2']})),[]);
 const stale=spec({ticketFilter:['ST-2','DB-1','ED-1','ZZ-9']});
 assert.deepEqual(errors(stale),[]);assert.deepEqual(warnings(stale),[unlit(1,'DB-1'),unlit(2,'ED-1'),unlit(3,'ZZ-9')]);
 const d=C.normalize(stale).sections[0].diagram;
 assert.deepEqual(plain(C.liveStatusStepTickets(d,d.steps[0],true)),['ST-2'],'the lit keys still filter');assert.equal(C.liveStatusStep(d,d.steps[0],evidence),'done');
 const endpoint=spec({nodes:[],edge:'api->db',ticketFilter:['ED-1','ST-1']});
 assert.deepEqual(errors(endpoint),[]);assert.deepEqual(warnings(endpoint),[unlit(1,'ST-1')],'edge endpoints are not lit carriers');
 const none=spec({ticketFilter:['ZZ-9']}),nd=C.normalize(none).sections[0].diagram;
 assert.deepEqual(errors(none),[]);assert.deepEqual(warnings(none),[unlit(0,'ZZ-9'),NONE_LIT]);
 assert.deepEqual(plain(C.liveStatusStepTickets(nd,nd.steps[0],true)),['ST-1','ST-2','ST-3'],'with no lit key the filter is ignored');
 assert.equal(C.liveStatusStep(nd,nd.steps[0],evidence),'blocked');assert.equal(C.liveStatusCaption(nd,nd.steps[0],evidence),'BLOCKED · ST-1');
 const r=render(none,evidence);assert.deepEqual(r.listed(),['ST-1','ST-2','ST-3']);assert.equal(r.coin(0),'blocked');
 assert.deepEqual(errors(spec({ticketFilter:['ST-2','not a key']})),[STEP+'.ticketFilter[1]: use a Jira key like HW-123']);
 for(const value of [[],'ST-2'])assert.deepEqual(errors(spec({ticketFilter:value})),[STEP+'.ticketFilter: expected a nonempty array of Jira keys from the nodes and edges this step lights; remove it to show every ticket'],JSON.stringify(value));
});
test('T4 an imported node\'s merged provider and nodeTracking tickets can be filtered',()=>{
 const C=load(),model=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=model('provider',{nodes:{api:{title:'API',tickets:['CAN-1','CAN-2']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=filter=>model('consumer',{nodes:{},rows:[[]],panels:[{id:'status',type:'live-status'}],
  topologyImports:[{spec:'provider',export:'core',as:'imp',nodeTracking:{api:{tickets:['LOC-1']}}}],
  steps:[{id:'imported',text:'Imported API',nodes:['imp::api'],ticketFilter:filter}]});
 const resolve=source=>C.FlowTopology.resolveSource(source,{version:1,id:'consumer',specs:[provider,source]});
 const map={'CAN-1':{state:'blocked'},'CAN-2':{state:'done'},'LOC-1':{state:'done'}};
 const resolved=resolve(consumer(['CAN-2','LOC-1'])),d=C.normalize(resolved).sections[0].diagram;
 assert.deepEqual(plain(C.trackingRefs(d.nodes['imp::api']).tickets),['CAN-1','CAN-2','LOC-1'],'provider and local tickets merge');
 assert.deepEqual(plain(C.liveStatusStepTickets(d,d.steps[0],true)),['CAN-2','LOC-1']);
 assert.equal(C.liveStatusStep(d,d.steps[0],map),'done');assert.equal(C.liveStatusCaption(d,d.steps[0],map),'DONE');
 assert.equal(C.liveStatusPresentation(d.nodes['imp::api'],map),'blocked');
 assert.deepEqual(filterErrors(C,resolved),[]);
 const r=render(resolved,map);assert.deepEqual(r.listed(),['CAN-2','LOC-1']);assert.equal(r.coin(0),'done');assert.equal(r.node('imp::api'),'blocked');
 // A provider that drops a filtered ticket never stops the consumer from resolving: the key warns and is ignored.
 const partial=resolve(consumer(['LOC-1','CAN-9'])),pd=C.normalize(partial).sections[0].diagram;
 assert.deepEqual(filterErrors(C,partial),[]);assert.deepEqual(filterWarnings(C,partial),[unlit(1,'CAN-9')]);
 assert.deepEqual(plain(C.liveStatusStepTickets(pd,pd.steps[0],true)),['LOC-1']);
 const gone=resolve(consumer(['CAN-9'])),gd=C.normalize(gone).sections[0].diagram;
 assert.deepEqual(filterWarnings(C,gone),[unlit(0,'CAN-9'),NONE_LIT]);
 assert.deepEqual(plain(C.liveStatusStepTickets(gd,gd.steps[0],true)),['CAN-1','CAN-2','LOC-1']);assert.equal(C.liveStatusStep(gd,gd.steps[0],map),'blocked');
});
/* Beyond the plan (written with GREEN): removing a hop or node in the Workbench
   takes its tickets out of the filter, so the edit never leaves a stale key. */
test('Workbench hop and node removal prune the step ticket filter',()=>{
 const c={URL,TextEncoder};vm.createContext(c);
 vm.runInContext(require('../tools/source-loader.cjs').composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/narrative.js']),c);
 const steps=raw=>raw.page.sections[0].diagram.steps,apply=(raw,fn)=>{const text=JSON.stringify(raw,null,2),plan=fn(text,raw);assert.equal(plan.error,undefined,plan.error);return JSON.parse(plan.text);};
 let raw=spec({});steps(raw)[1].ticketFilter=['ST-3','ED-1'];
 raw=apply(raw,(t,r)=>c.planStepToggleHop(t,r,0,1,'api->db'));assert.deepEqual(steps(raw)[1].ticketFilter,['ST-3']);
 raw=apply(raw,(t,r)=>c.planStepToggleNode(t,r,0,1,'db'));assert.deepEqual(steps(raw)[1].ticketFilter,['ST-3'],'adding a node keeps the filter');
 raw=apply(raw,(t,r)=>c.planStepToggleNode(t,r,0,1,'api'));assert.equal(steps(raw)[1].ticketFilter,undefined,'an emptied filter is dropped');
});
test('a step ticket filter is a declared capability',()=>{
 const C=load();assert.ok(C.FlowviewCompatibility.detect(spec({ticketFilter:['ST-2']})).includes('flow.step-ticket-filter'));
 assert.ok(!C.FlowviewCompatibility.detect({page:{sections:[{diagram:{nodes:{a:{}},rows:[['a']],steps:[{nodes:['a']}]}}]}}).includes('flow.step-ticket-filter'));
});
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const inspectorNames=['canon','validator','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
 'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
 'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/inspector'];
const stepsOf=raw=>raw.page.sections[0].diagram.steps;
function clickRemove(h,label){const b=h.guide.querySelectorAll('button').find(x=>x.textContent===label);assert.ok(b,'button "'+label+'" exists');b.fire('click');h.flush();}
const base=()=>{const raw=spec({ticketFilter:['ST-2']});stepsOf(raw).push({id:'store',text:'Store',nodes:['db'],ticketFilter:['DB-1']});return raw;};
test('T6 Workbench deletion of an edge or a node prunes its tickets from step filters',()=>{
 const e=inspectorEnvironment(inspectorNames),C=e.C;
 const apply=(raw,fn)=>{const text=JSON.stringify(raw,null,2),plan=fn(text,raw);assert.equal(plan.error,undefined,plan.error);return JSON.parse(plan.text);};
 // Deleting the edge drops its ticket; the node tickets the step still lights stay.
 let raw=apply(base(),(t,r)=>C.planDeleteEdge(t,r,0,0));
 assert.deepEqual(stepsOf(raw)[1].ticketFilter,['ST-3']);assert.deepEqual(stepsOf(raw)[0].ticketFilter,['ST-2']);assert.deepEqual(stepsOf(raw)[2].ticketFilter,['DB-1']);
 // Deleting a node drops its tickets and those of the edges it took; an emptied filter is removed.
 raw=apply(base(),(t,r)=>C.planDeleteNode(t,r,0,'db'));
 assert.deepEqual(stepsOf(raw)[1].ticketFilter,['ST-3']);assert.equal(Object.hasOwn(stepsOf(raw)[2],'ticketFilter'),false);assert.deepEqual(stepsOf(raw)[0].ticketFilter,['ST-2']);
 assert.deepEqual(filterWarnings(C,raw),[]);
});
test('T6 removing a ticket from a local carrier in Inspect prunes it from step filters in the same undo step',()=>{
 const e=inspectorEnvironment(inspectorNames);
 const h=e.mount(base()),before=h.text;h.session.target={kind:'node',section:0,id:'api'};h.inspector.render();
 clickRemove(h,'Remove ticket 2');const after=JSON.parse(h.text);
 assert.deepEqual(after.page.sections[0].diagram.nodes.api.tickets,['ST-1','ST-3']);
 assert.equal(Object.hasOwn(stepsOf(after)[0],'ticketFilter'),false,'the filter emptied by the removal is removed');assert.deepEqual(stepsOf(after)[1].ticketFilter,['ST-3','ED-1']);
 assert.equal(h.session.undo(),true);assert.equal(h.text,before,'one Undo restores the ticket and the filter');
});
test('T6 removing a consumer-owned ticket from an imported node prunes it from step filters instead of being refused',()=>{
 const e=inspectorEnvironment(inspectorNames);
 const model=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=model('provider',{nodes:{api:{title:'API',tickets:['CAN-1','CAN-2']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=model('consumer',{nodes:{local:{title:'Local',tickets:['LOC-2']}},rows:[['local']],panels:[{id:'status',type:'live-status'}],
  topologyImports:[{spec:'provider',export:'core',as:'imp',nodeTracking:{api:{tickets:['LOC-1']}}}],
  steps:[{id:'imported',text:'Imported API',nodes:['imp::api','local'],ticketFilter:['CAN-2','LOC-1']}]});
 const imported=e.mount(consumer);imported.session.replaceProject(JSON.stringify(consumer,null,2),null,{topologyContext:{version:1,id:'consumer',specs:[provider,consumer]}});
 imported.session.target={kind:'node',section:0,id:'imp::api'};imported.inspector.render();
 clickRemove(imported,'Remove ticket 1');const next=JSON.parse(imported.text);
 assert.equal(Object.hasOwn(next.page.sections[0].diagram.topologyImports[0],'nodeTracking'),false,'the overlay ticket is removed');
 assert.deepEqual(stepsOf(next)[0].ticketFilter,['CAN-2']);
});

/* Cycle 1 review (orchestrator ruling): one static lit set everywhere. A lit node whose detail is a
   section of the same page adds that section's tickets (recursively); a remote detail never does. */
const DETAIL_URL='https://example.test/child.spec.json';
const domainSpec=(detail,filter,child=true)=>({page:{tracking:{jira:{site:'https://jira.test'}},sections:[
 {id:'main',diagram:{nodes:{dom:{title:'Domain',tickets:['DM-1'],detail},db:{title:'DB',tickets:['DB-1']}},rows:[['dom','db']],edges:[{from:'dom',to:'db'}],panels:[{id:'status',type:'live-status'}],
  steps:[{id:'domain',text:'Domain work',nodes:['dom'],ticketFilter:filter}]}}].concat(child?[
 {id:'child',detailOnly:true,diagram:{nodes:{a:{title:'A',tickets:['CH-1','CH-2']},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',tickets:['CE-1']}]}}]:[])}});
const domainMap={'DM-1':{state:'blocked'},'CH-1':{state:'done'},'CH-2':{state:'blocked'},'CE-1':{state:'blocked'},'DB-1':{state:'todo'}};
test('T7 a drill-down node with a same-page detail: a child ticket filter validates clean, filters the step, and the Workbench lists and prunes it',()=>{
 const raw=domainSpec({section:'child'},['CH-1']),C=load();
 assert.deepEqual(filterErrors(C,raw),[]);assert.deepEqual(filterWarnings(C,raw),[],'a child ticket of a same-page detail is lit');
 const r=render(raw,domainMap);assert.deepEqual(r.listed(),['CH-1']);assert.equal(r.caption(),'DONE');assert.equal(r.coin(0),'done');
 assert.equal(r.node('dom'),'blocked','the domain node still rolls up all of its work');
 const e=inspectorEnvironment(inspectorNames),h=e.mount(raw);h.session.target={kind:'step',section:0,index:0};h.inspector.render();
 const rows=h.guide.querySelector('fieldset.step-ticket-filter').querySelectorAll('label.frow');
 assert.deepEqual(rows.map(row=>row.children[0].textContent+'='+row.children[1].children[0].checked),['DM-1=false','CH-1=true','CH-2=false','CE-1=false'],'the checklist lists the detail section tickets');
 const before=h.text;h.session.target={kind:'node',section:1,id:'a'};h.inspector.render();clickRemove(h,'Remove ticket 1');
 assert.equal(Object.hasOwn(stepsOf(JSON.parse(h.text))[0],'ticketFilter'),false,'removing the child ticket prunes the parent step filter');
 assert.equal(h.session.undo(),true);assert.equal(h.text,before);
 const deleted=JSON.parse(e.C.planDeleteNode(before,JSON.parse(before),1,'a').text);
 assert.equal(Object.hasOwn(stepsOf(deleted)[0],'ticketFilter'),false,'deleting the child node prunes the parent step filter');
});
test('T7 a remote detail ticket is not filterable: it warns and is ignored in the viewer before and after the detail loads',async()=>{
 const raw=domainSpec({spec:DETAIL_URL,section:'remote-child'},['CH-1'],false),C=load();
 assert.deepEqual(filterWarnings(C,raw),[unlit(0,'CH-1'),NONE_LIT]);
 const remote={page:{sections:[{id:'remote-child',diagram:{nodes:{a:{title:'A',tickets:['CH-1','CH-2']},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',tickets:['CE-1']}]}}]}};
 const r=render(raw,domainMap,0,{loadDetail:()=>Promise.resolve(remote)});
 assert.deepEqual(r.listed(),['DM-1'],'before the detail loads the filter is ignored');
 await r.renderOptions.loadDetail({spec:DETAIL_URL},new AbortController().signal);r.flush();
 assert.deepEqual(r.listed(),['DM-1','CH-1','CH-2','CE-1'],'after it loads the filter is still ignored');assert.equal(r.coin(0),'blocked');
});
test('a filtered step waits only on what its shown tickets wait on',()=>{
 const C=load(),map={'ST-1':{state:'todo'},'ST-2':{state:'todo'},'ST-3':{state:'todo'}},waiting={'ST-1':{tone:'grey',on:[{key:'UP-9'}]},'ST-2':{tone:'grey',on:[{key:'UP-1'}]}};
 const filtered=C.normalize(spec({ticketFilter:['ST-2']})).sections[0].diagram,all=C.normalize(spec({})).sections[0].diagram;
 assert.equal(C.liveStatusCaption(filtered,filtered.steps[0],map,waiting),'TODO · 1 tickets · waiting on UP-1');
 assert.equal(C.liveStatusCaption(all,all.steps[0],map,waiting),'TODO · 3 tickets · waiting on UP-1, UP-9');
});
test('First blocker and its focus follow a step filter',()=>{
 const raw=spec({nodes:['api','db'],ticketFilter:['DB-1']}),blocked={'ST-1':{state:'blocked'},'ST-2':{state:'done'},'ST-3':{state:'done'},'DB-1':{state:'blocked'},'ED-1':{state:'done'}};
 const run=(raw,map)=>{const r=render(raw,map),d=r.ctl.page.sections[0].diagram,stepper=r.ctl.sections[0].stepper;let jumped=null;
  Object.assign(stepper,{path:()=>r.C.diagramPathList(d)[0].id,jumpSource:(i,p)=>{jumped=i;return true;}});
  r.ctl.liveStatus.firstBlocker();r.flush();return {jumped,focused:r.doc.activeElement && r.doc.activeElement.getAttribute('data-live-carrier')};};
 assert.deepEqual(run(raw,blocked),{jumped:0,focused:'db'},'the blocking filtered ticket is on db, not api');
 assert.deepEqual(run(spec({nodes:['api','db']}),blocked),{jumped:0,focused:'api'});
 assert.deepEqual(run(spec({ticketFilter:['ST-2']}),{...blocked,'DB-1':{state:'done'},'ED-1':{state:'blocked'}}),{jumped:1,focused:'api->db'},'a step whose blocked ticket is filtered out is not a blocker');
});
test('a blocker\'s downstream step count counts a filtered step only when a shown ticket waits',()=>{
 const raw=spec({ticketFilter:['ST-2']});raw.page.tracking.dependencies=[{ticket:'ST-1',on:'UP-1'}];stepsOf(raw).push({id:'again',text:'API again',nodes:['api']});
 const map={...evidence,'ST-1':{state:'todo'},'UP-1':{state:'blocked'}},row=raw=>plain(render(raw,map).ctl.liveStatus.snapshot().blockers).find(b=>b.key==='UP-1');
 assert.equal(row(raw).downstream,'1 downstream carriers · 1 steps');
 const unfiltered=JSON.parse(JSON.stringify(raw));stepsOf(unfiltered).forEach(st=>delete st.ticketFilter);
 assert.equal(row(unfiltered).downstream,'1 downstream carriers · 3 steps');
});
test('a step filter narrows the step proof verdict in the caption model and in board-level verdicts',()=>{
 const C=load(),raw=spec({ticketFilter:['ST-2']}),d=raw.page.sections[0].diagram;
 d.nodes.api.telemetry={kind:'service',signals:{rate:{grafana:'sum(rate(api_requests_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1}}};
 const page=C.normalize(raw),nd=page.sections[0].diagram,jira={'ST-1':{state:'active'},'ST-2':{state:'done'},'ST-3':{state:'active'}},telemetryMap={api:{signals:{rate:{value:50,unit:'req/h'}},observedAt:'2026-11-07T00:00:00Z'}};
 const model=C.telemetryStepModel(nd,0,C.diagramPathList(nd)[0].id,page,{map:telemetryMap},jira,true);assert.equal(model.verdict,'proven');
 const input=C.telemetryProofInput(fn=>Object.keys(nd.nodes).forEach(id=>fn(nd.nodes[id],id,page)),fn=>fn(nd,page),jira,telemetryMap);
 const verdicts=C.proofVerdicts(input);assert.equal(verdicts.steps.build.verdict,'proven');assert.equal(verdicts.carriers.api.verdict,'active-live-early','the carrier verdict keeps every ticket');
});
test('the Workbench checklist can drop stale keys from a step that lights no tickets',()=>{
 const raw=spec({nodes:['empty'],ticketFilter:['ZZ-1','ZZ-2']});raw.page.sections[0].diagram.nodes.empty={title:'Empty'};raw.page.sections[0].diagram.rows[0].push('empty');
 const e=inspectorEnvironment(inspectorNames),h=e.mount(raw),box=key=>{h.session.target={kind:'step',section:0,index:0};h.inspector.render();return h.guide.querySelector('fieldset.step-ticket-filter').querySelectorAll('label.frow').find(row=>row.children[0].textContent.startsWith(key)).children[1].children[0];};
 let input=box('ZZ-1');input.checked=false;input.fire('change');h.flush();assert.deepEqual(stepsOf(JSON.parse(h.text))[0].ticketFilter,['ZZ-2']);
 input=box('ZZ-2');input.checked=false;input.fire('change');h.flush();assert.equal(Object.hasOwn(stepsOf(JSON.parse(h.text))[0],'ticketFilter'),false);
});

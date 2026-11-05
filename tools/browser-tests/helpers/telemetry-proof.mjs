import {mountCues,cueSpec,nestedSpec,importedDetailSpec,CUE_JIRA} from './telemetry-cards.mjs';
const T=Date.UTC(2026,10,4,12),H=3600000,DAY=24*H;
function spec(){const raw=cueSpec(),d=raw.page.sections[0].diagram,n=nestedSpec().page.sections[0].diagram;
 Object.assign(d.nodes,n.nodes);d.edges.push(...n.edges.map(e=>({...e,tickets:['NEST-1']})));d.floats.push(...n.floats.map(f=>({...f,y:f.y+600})));
 raw.page.tracking.telemetry={window:'6h'};d.edges[0].telemetry.links={dashboard:'https://authored.test/board',query:'https://authored.test/query'};d.edges[1].telemetry.links={query:'javascript:alert(1)'};d.edges[0].label='Delivery <script>bad()</script>';
 return raw;
}
async function setup(page,server,{telemetryOnly=false,disabled='',siblings=false,details=false}={}){
 await mountCues(page,server);const raw=spec();if(disabled==='page')raw.page.tracking.telemetry.enabled=false;
 if(telemetryOnly){delete raw.page.tracking.jira;for(const s of raw.page.sections){for(const n of Object.values(s.diagram.nodes))delete n.tickets;for(const e of s.diagram.edges)delete e.tickets;}}
 if(details)raw.page.sections[0].diagram.nodes['outer::inner::a']={...raw.page.sections[0].diagram.nodes['outer::inner::a'],title:'Imported service',detail:{spec:'selected-detail',revision:'r1',section:'selected'}};
 const detail=importedDetailSpec(),dd=detail.page.sections.find(s=>s.id==='selected').diagram,nd=nestedSpec().page.sections[0].diagram;
 Object.assign(dd.nodes,JSON.parse(JSON.stringify(nd.nodes).replaceAll('outer::','detail::')));dd.edges.push(...JSON.parse(JSON.stringify(nd.edges).replaceAll('outer::','detail::')).map(e=>({...e,tickets:['NEST-1']})));dd.floats.push(...JSON.parse(JSON.stringify(nd.floats).replaceAll('outer::','detail::')).map(f=>({...f,y:f.y+500})));
 await page.evaluate(({raw,jira,T,H,DAY,telemetryOnly,disabled,siblings,detail})=>{
  window.viewer.destroy();window.calls={live:[],history:[],detail:[]};window.loadReleases=[];window.detailSpec=detail;
  const samples=bindings=>Object.fromEntries(bindings.filter(b=>b.id!=='shared::api').map(b=>{const rate=b.id==='app->push'?0:b.id==='shared::api->shared::store'?500:100;
   return [b.id,{observedAt:new Date(T).toISOString(),signals:Object.fromEntries(Object.keys(b.signals).map(name=>[name,{value:name==='errors'?(b.id==='shared::api->shared::store'?30:0):name==='lag'?10:rate,series:name==='rate'?Array.from({length:7},(_,i)=>[T-(6-i)*H,rate]):[]} ])),markers:[{at:new Date(T-H/2).toISOString(),kind:'deploy',label:'Deploy <1>'},{at:new Date(T-7*H).toISOString(),kind:'deploy'}],links:b.id==='ingest->app'?{dashboard:'https://provider.test/ignored'}:b.id==='shared::api->shared::store'?{query:'https://provider.test/fallback'}:{query:'javascript:bad()'}}];}));
  const options={provider:async bindings=>{window.calls.live.push(structuredClone(bindings));return samples(bindings);},history:async(bindings,range)=>{window.calls.history.push({bindings:structuredClone(bindings),range});return Object.fromEntries(bindings.map(b=>[b.id,{signals:Object.fromEntries(Object.keys(b.signals).map(name=>[name,{series:[[T,name==='errors'?0:name==='lag'?10:0],...(b.id==='ingest'?[[T+DAY,10]]:[]),[T+2*DAY,name==='errors'?0:50]]}])),markers:[{at:new Date(T).toISOString(),kind:'deploy'}]}]));}};
  const opts={telemetry:disabled==='host'?false:disabled==='tools'?{...options,available:false}:options,loadDetail:(ref,signal)=>{window.calls.detail.push({ref,aborted:false});const c=window.calls.detail.at(-1);signal.addEventListener('abort',()=>c.aborted=true);return new Promise(resolve=>window.loadReleases.push(()=>resolve(structuredClone(detail))));}};
  window.viewer=window.mount(document.querySelector('#host'),raw,opts);window.seed=()=>window.viewer.controller.telemetry.apply(samples(window.viewer.controller.telemetry.bindings()));
  window.jira=Object.fromEntries(Object.entries({...jira,'NEST-1':{state:'active'},'IMP-3':{state:'done'}}).map(([k,v])=>[k,{...v,updatedAt:new Date(T-H).toISOString()}]));
  if(!telemetryOnly){window.viewer.controller.liveStatus.apply(window.jira);window.viewer.controller.liveStatus.setHistory({load:()=>({days:[0,1,2].map(i=>({at:new Date(T+i*DAY).toISOString(),label:'Day '+i,short:'D'+i,states:Object.fromEntries(Object.keys(window.jira).map(k=>[k,{state:'done'}]))})),index:2})});}
  if(siblings){const h=document.createElement('div');h.id='sibling';document.body.appendChild(h);window.sibling=window.mount(h,raw,opts);}
 },{raw,jira:CUE_JIRA,T,H,DAY,telemetryOnly,disabled,siblings,detail});return page.locator('#host');
}
export {setup,spec};

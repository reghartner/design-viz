#!/usr/bin/env node
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registry,json,stateFile,atomicJSON} from '../../tools/canon/registry.mjs';
import {scan,decide,propose,digest,effectiveSpecs,SnapshotSources,reportMarkdown} from '../../tools/canon/drift.mjs';
import C from '../../tools/canon/core.cjs';
import {runDoorbellRehearsal} from '../../tools/canon/doorbell-rehearsal.mjs';
import {referencePreview,approveReference,compareTrace} from '../../tools/canon/traces.mjs';
import {buildEntityDiagramIndex,diagramsForEntity} from '../../tools/canon/entity-diagrams.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

export async function createCanonServer({registryPath=path.join(root,'examples/canon/registry.json'),statePath=path.join(root,'.local/canon/state.json')}={}){
  const initialRegistry=await registry(registryPath),catalog=C.catalog(await json(path.join(initialRegistry.root,'catalog.json'))),sources=new SnapshotSources(await json(path.join(initialRegistry.root,'repositories.json')));
  let state=await stateFile(statePath),mutations=Promise.resolve(),rehearsalJob=null;
  async function mutate(fn){const job=mutations.then(async()=>{const result=await fn();await atomicJSON(statePath,state);return result;});mutations=job.catch(()=>{});return job;}
  const server=http.createServer(async(req,res)=>{
    const origin='http://'+req.headers.host,url=new URL(req.url,origin);
    function send(status,data,type='application/json'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.isBuffer(data)?data:type==='application/json'?JSON.stringify(data,(_,value)=>typeof value==='string'?value.replace(/^http:\/\/localhost:8766(?=\/(catalog|apis|issues)\/)/,origin):value):data);}
    async function body(){let text='';for await(const chunk of req){text+=chunk;if(text.length>2_000_000)throw new Error('Request exceeds 2 MB.');}return JSON.parse(text || '{}');}
    try{
      // A freshly read registry makes added/removed diagrams visible without a
      // server restart. Approved local overlays remain the mock's authority.
      const reg=await registry(registryPath),specs=()=>effectiveSpecs(reg.specs,state);
      const find=id=>{const spec=specs().find(s=>s.page.canon.id===id);if(!spec)throw new Error('Diagram not found.');return spec;};
      if(req.method==='POST'){
        if(req.headers.origin && req.headers.origin!==origin)return send(403,{error:'Cross-origin writes are not allowed.'});
        if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(415,{error:'Use application/json.'});
        const data=await body();
        if(url.pathname==='/api/canon/doorbell-rehearsal'){
          // Fixed trusted fixture only. Request data cannot select executable code.
          if(!rehearsalJob)rehearsalJob=runDoorbellRehearsal({parentDir:path.join(path.dirname(statePath),'doorbell-rehearsals')}).then(report=>mutate(async()=>{state.rehearsal=report;return report;})).finally(()=>{rehearsalJob=null;});
          return send(200,await rehearsalJob);
        }
        if(url.pathname==='/api/canon/reference-preview')return send(200,referencePreview(find(data.id),data.trace,data.section || 0));
        if(url.pathname==='/api/canon/reference-approve')return send(200,await mutate(async()=>{
          const current=find(data.id);if(data.baseRevision!==digest(current))throw new Error('Diagram changed; preview the reference again.');
          const spec=approveReference(current,data.trace,{section:data.section || 0,reason:data.reason});
          const proposed=propose(reg.specs,state,{id:data.id,spec,baseRevision:data.baseRevision});
          state=decide(reg.specs,proposed.state,proposed.id,{disposition:'update',reason:data.reason});return {revision:digest(spec)};
        }));
        if(url.pathname==='/api/canon/compare')return send(200,await mutate(async()=>{
          const current=find(data.id),result=compareTrace(current,data.trace,{section:data.section || 0,label:data.label || 'Incident trace'});
          const id=digest([data.id,result.trace,result.spec]).slice(0,20),entry={id,diagramId:data.id,baseRevision:digest(current),createdAt:new Date().toISOString(),...result};
          state.incidents=state.incidents || {};state.incidents[id]=entry;
          const keys=Object.keys(state.incidents);for(const key of keys.slice(0,Math.max(0,keys.length-20)))delete state.incidents[key];
          return entry;
        }));
        if(url.pathname==='/api/canon/scan')return send(200,await mutate(async()=>{const result=await scan(reg.specs,sources,state);state=result.state;return {reviews:result.findings};}));
        if(url.pathname==='/api/canon/decisions')return send(200,await mutate(async()=>{state=decide(reg.specs,state,data.id,{...data,ticket:data.ticket || origin+'/issues/'+data.id});return state.reviews[data.id];}));
        if(url.pathname==='/api/canon/proposals')return send(200,await mutate(async()=>{
          const result=propose(reg.specs,state,data);state=result.state;return {id:result.id};
        }));
        return send(404,{error:'Unknown action.'});
      }
      if(req.method!=='GET')return send(405,{error:'Method not supported.'});
      if(url.pathname==='/api/canon/doorbell-rehearsal')return send(200,state.rehearsal || null);
      if(/^\/api\/canon\/fixtures\/[a-z-]+$/.test(url.pathname))return send(200,await json(path.join(root,'examples/canon/traces',url.pathname.split('/').pop()+'.json')));
      if(/^\/api\/canon\/incidents\/[a-f0-9]{20}(\/spec)?$/.test(url.pathname)){
        const entry=state.incidents?.[url.pathname.split('/')[4]];if(!entry)return send(404,{error:'Incident no longer available.'});
        return send(200,url.pathname.endsWith('/spec')?entry.spec:entry);
      }
      if(url.pathname==='/api/canon/catalog')return send(200,catalog);
      if(url.pathname==='/api/canon/entity-diagrams'){
        const index=buildEntityDiagramIndex(specs(),{publicBaseUrl:origin});
        return send(200,diagramsForEntity(index,url.searchParams.get('entityRef')));
      }
      if(url.pathname==='/api/canon/services'){
        const index=buildEntityDiagramIndex(specs(),{publicBaseUrl:origin});
        return send(200,{version:1,services:catalog.services.map(s=>({...s,diagramCount:diagramsForEntity(index,s.entityRef).diagrams.length}))});
      }
      if(url.pathname==='/api/canon/registry')return send(200,{simulated:true,diagrams:specs().map(s=>({id:s.page.canon.id,title:s.page.title,owner:s.page.canon.owner,revision:digest(s),sections:C.sections(s).map((section,index)=>({index,title:section.heading || 'Diagram '+(index+1),hasReference:!!section.diagram.referenceTrace}))})),incidents:Object.values(state.incidents || {}).map(i=>({id:i.id,diagramId:i.diagramId,traceId:i.trace.traceId,createdAt:i.createdAt})),reviews:Object.values(state.reviews),audit:state.audit});
      if(url.pathname==='/api/canon/context'){
        const spec=find(url.searchParams.get('id')),revision=digest(spec),review=state.reviews[url.searchParams.get('review')];
        if(review?.type==='drift' && !review.error){
          // Draft the accepted code revision; expected behavior still needs the reviewer.
          for(const hit of C.references(spec))if(review.impacts.some(i=>i.diagramId===spec.page.canon.id && i.referenceId===hit.reference.id)){
            hit.reference.revision=review.head;hit.reference.startLine=review.after.startLine;hit.reference.endLine=review.after.endLine;
          }
        }
        if(review?.type==='spec'){
          if(review.diagramId!==spec.page.canon.id || review.baseRevision!==revision || review.status!=='open')throw new Error('Proposal is stale; reopen the current canonical spec before editing.');
          return send(200,{simulated:true,catalog,spec:review.proposedSpec,revision});
        }
        return send(200,{simulated:true,catalog,spec,revision});
      }
      if(url.pathname.startsWith('/api/canon/specs/')){
        const spec=find(decodeURIComponent(url.pathname.slice('/api/canon/specs/'.length)));
        if(url.searchParams.has('revision') && url.searchParams.get('revision')!==digest(spec))
          return send(409,{error:'Diagram changed. Refresh the association list.'});
        return send(200,spec);
      }
      if(url.pathname==='/api/canon/report')return send(200,reportMarkdown(Object.values(state.reviews)),'text/markdown; charset=utf-8');
      let file;
      if(url.pathname==='/' || /^\/(catalog|apis|issues)\//.test(url.pathname))file=path.join(root,'apps/backstage-mock/public/index.html');
      else if(/^\/(app\.mjs|entity-view\.mjs|style\.css)$/.test(url.pathname))file=path.join(root,'apps/backstage-mock/public',url.pathname.slice(1));
      else if(/^\/(template|workbench)\/[^/]+\.html$/.test(url.pathname))file=path.join(root,url.pathname.slice(1));
      else if(/^\/backstage-preview\/(index\.html|app\.js)$/.test(url.pathname)){
        file=path.join(root,'.local/backstage-preview',url.pathname.split('/').pop());
        const policy=await readFile(path.join(root,'.local/backstage-preview/csp.txt'),'utf8');
        res.setHeader('Content-Security-Policy',policy.trim());
      }
      else if(/^\/src\/starters\/[a-z0-9-]+\.json$/.test(url.pathname))file=path.join(root,url.pathname.slice(1));
      else return send(404,{error:'Not found.'});
      const ext=path.extname(file),mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'}[ext];
      return send(200,await readFile(file),mime);
    }catch(e){send(e.code==='ENOENT'?404:400,{error:e.message});}
  });
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await createCanonServer();const port=Number(process.env.FLOWVIEW_PORT || 8766);
  server.listen(port,'0.0.0.0',()=>console.log('Simulated company repository: http://localhost:'+port+' (fictional data only)'));
}

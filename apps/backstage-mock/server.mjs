#!/usr/bin/env node
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registry,json,stateFile,atomicJSON} from '../../tools/canon/registry.mjs';
import {scan,decide,propose,digest,effectiveSpecs,SnapshotSources,reportMarkdown} from '../../tools/canon/drift.mjs';
import C from '../../tools/canon/core.cjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

export async function createCanonServer({registryPath=path.join(root,'examples/canon/registry.json'),statePath=path.join(root,'.local/canon/state.json')}={}){
  const reg=await registry(registryPath),catalog=C.catalog(await json(path.join(reg.root,'catalog.json'))),sources=new SnapshotSources(await json(path.join(reg.root,'repositories.json')));
  let state=await stateFile(statePath),mutations=Promise.resolve();
  const specs=()=>effectiveSpecs(reg.specs,state);
  const find=id=>{const spec=specs().find(s=>s.page.canon.id===id);if(!spec)throw new Error('Diagram not found.');return spec;};
  async function mutate(fn){const job=mutations.then(async()=>{const result=await fn();await atomicJSON(statePath,state);return result;});mutations=job.catch(()=>{});return job;}
  const server=http.createServer(async(req,res)=>{
    const origin='http://'+req.headers.host,url=new URL(req.url,origin);
    function send(status,data,type='application/json'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.isBuffer(data)?data:type==='application/json'?JSON.stringify(data):data);}
    async function body(){let text='';for await(const chunk of req){text+=chunk;if(text.length>2_000_000)throw new Error('Request exceeds 2 MB.');}return JSON.parse(text || '{}');}
    try{
      if(req.method==='POST'){
        if(req.headers.origin && req.headers.origin!==origin)return send(403,{error:'Cross-origin writes are not allowed.'});
        if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(415,{error:'Use application/json.'});
        const data=await body();
        if(url.pathname==='/api/canon/scan')return send(200,await mutate(async()=>{const result=await scan(reg.specs,sources,state);state=result.state;return {reviews:result.findings};}));
        if(url.pathname==='/api/canon/decisions')return send(200,await mutate(async()=>{state=decide(reg.specs,state,data.id,{...data,ticket:data.ticket || origin+'/issues/'+data.id});return state.reviews[data.id];}));
        if(url.pathname==='/api/canon/proposals')return send(200,await mutate(async()=>{
          const result=propose(reg.specs,state,data);state=result.state;return {id:result.id};
        }));
        return send(404,{error:'Unknown action.'});
      }
      if(req.method!=='GET')return send(405,{error:'Method not supported.'});
      if(url.pathname==='/api/canon/catalog')return send(200,catalog);
      if(url.pathname==='/api/canon/registry')return send(200,{simulated:true,diagrams:specs().map(s=>({id:s.page.canon.id,title:s.page.title,owner:s.page.canon.owner,revision:digest(s)})),reviews:Object.values(state.reviews),audit:state.audit});
      if(url.pathname==='/api/canon/context'){
        const spec=find(url.searchParams.get('id')),revision=digest(spec),review=state.reviews[url.searchParams.get('review')];
        if(review?.type==='drift' && !review.error){
          // Draft the accepted code revision; expected behavior still needs the reviewer.
          for(const hit of C.references(spec))if(review.impacts.some(i=>i.diagramId===spec.page.canon.id && i.referenceId===hit.reference.id)){
            hit.reference.revision=review.head;hit.reference.startLine=review.after.startLine;hit.reference.endLine=review.after.endLine;
          }
        }
        if(review?.type==='spec')return send(200,{simulated:true,catalog,spec:review.proposedSpec,revision});
        return send(200,{simulated:true,catalog,spec,revision});
      }
      if(url.pathname.startsWith('/api/canon/specs/'))return send(200,find(decodeURIComponent(url.pathname.slice('/api/canon/specs/'.length))));
      if(url.pathname==='/api/canon/report')return send(200,reportMarkdown(Object.values(state.reviews)),'text/markdown; charset=utf-8');
      let file;
      if(url.pathname==='/' || /^\/(catalog|apis|issues)\//.test(url.pathname))file=path.join(root,'apps/backstage-mock/public/index.html');
      else if(/^\/(app\.mjs|style\.css)$/.test(url.pathname))file=path.join(root,'apps/backstage-mock/public',url.pathname.slice(1));
      else if(/^\/(template|workbench)\/[^/]+\.html$/.test(url.pathname))file=path.join(root,url.pathname.slice(1));
      else if(/^\/src\/starters\/[a-z0-9-]+\.json$/.test(url.pathname))file=path.join(root,url.pathname.slice(1));
      else return send(404,{error:'Not found.'});
      const ext=path.extname(file),mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json'}[ext];
      return send(200,await readFile(file),mime);
    }catch(e){send(e.code==='ENOENT'?404:400,{error:e.message});}
  });
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await createCanonServer();const port=Number(process.env.FLOWVIEW_PORT || 8766);
  server.listen(port,'0.0.0.0',()=>console.log('Simulated company repository: http://localhost:'+port+' (fictional data only)'));
}

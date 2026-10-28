import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createService,LIMITS,HttpError} from './service.mjs';
import {memoryAdapters} from './memory.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
export async function startMock({port=0,htmlFile=path.join(repo,'workbench/flowspec.html'),viewerFile=path.join(repo,'template/flowview.html')}={}){
  const memory=memoryAdapters(),capabilities=new Map();let origin;
  for(const [sub,userId,teamId,role] of [['alice','alice','pilot','editor'],['bob','bob','pilot','editor'],['reader','reader','pilot','reader'],['other-team','other','other-team','editor']])memory.members.set(sub,{userId,teamId,role,name:sub});
  for(const [name,mode] of [['uploadURL','upload'],['downloadURL','read']])memory.objects[name]=async key=>{const token=randomUUID();capabilities.set(token,{key,mode,expires:Date.now()+300000});return origin+'/objects/'+token;};
  const service=createService(memory),faults={ack:false,delay:0};
  async function body(req,max){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw new HttpError(413,'Request too large.');parts.push(chunk);}return Buffer.concat(parts).toString();}
  function json(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
  const server=createServer(async(req,res)=>{
    try{
      if(req.headers.host!==new URL(origin).host)throw new HttpError(403,'Loopback host required.');
      if(req.headers.origin && req.headers.origin!==origin)throw new HttpError(403,'Same-origin local mock required.');
      const url=new URL(req.url,origin);
      if(url.pathname.startsWith('/api/')){
        const token=req.headers.authorization || '',sub=token.startsWith('Bearer mock:')?token.slice(12):null;
        const raw=await body(req,8192);let data;try{data=JSON.parse(raw || '{}');}catch{throw new HttpError(400,'Malformed JSON.');}
        if(faults.delay)await new Promise(resolve=>setTimeout(resolve,faults.delay));
        const result=await service.request(sub,req.method,url.pathname.slice(4),data);
        if(faults.ack && url.pathname.endsWith('/commit')){faults.ack=false;json(res,503,{error:'Commit acknowledgement unavailable. Retry the same operation.'});return;}
        json(res,200,result);return;
      }
      if(url.pathname.startsWith('/objects/')){
        const cap=capabilities.get(url.pathname.slice(9));if(!cap || cap.expires<Date.now())throw new HttpError(403,'Signed URL expired.');
        if(req.method==='PUT' && cap.mode==='upload'){
          if(memory.faults.upload)throw new HttpError(503,'Injected upload failure.');
          memory.uploads.set(cap.key,await body(req,LIMITS.envelope));res.writeHead(200);res.end();return;
        }
        if(req.method==='GET' && cap.mode==='read'){const value=memory.snapshots.get(cap.key);if(!value)throw new HttpError(404,'Snapshot missing.');json(res,200,value);return;}
        throw new HttpError(405,'Signed operation mismatch.');
      }
      if(url.pathname==='/__faults' && req.method==='POST'){
        const data=JSON.parse(await body(req,1024));for(const key of ['upload','freeze','commit'])if(key in data)memory.faults[key]=!!data[key];if('ack' in data)faults.ack=!!data.ack;if('delay' in data)faults.delay=Math.min(5000,Math.max(0,Number(data.delay)||0));json(res,200,{...memory.faults,...faults});return;
      }
      if(req.method!=='GET')throw new HttpError(405,'Method not allowed.');
      if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
      if(url.pathname==='/template/flowview.html'){res.writeHead(200,{'content-type':'text/html'});res.end(await readFile(viewerFile));return;}
      if(url.pathname==='/catalog.json' || url.pathname==='/starters.json'){json(res,200,[]);return;}
      if(!['/','/index.html','/workbench.html'].includes(url.pathname))throw new HttpError(404,'Mock static file not found.');
      const config={api:origin+'/api',mock:true,clientId:'local-mock',viewerTemplate:'/template/flowview.html'};
      const html=(await readFile(htmlFile,'utf8')).replace('<meta charset="utf-8">','<script id="flowview-cloud-config" type="application/json">'+JSON.stringify(config)+'</script><meta charset="utf-8">');
      res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);
    }catch(error){if(!res.headersSent)json(res,error.status || 500,{error:error.status?error.message:'Mock storage failed.',...(error.details || {})});else res.end();}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  return {origin,memory,service,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const mock=await startMock({port:Number(process.env.PORT || 8787)});console.log('Flowview local mock: '+mock.origin+' (memory only; no AWS calls)');
}

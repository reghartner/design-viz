import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {entities,queryEntities} from './catalog.mjs';
import {readPublicFile} from '../lib/public-files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export function createMockServer({token=process.env.MOCK_CATALOG_TOKEN}={}){
 if(!token)throw new Error('Set MOCK_CATALOG_TOKEN (fictional test credential; keep it out of commits).');
 return createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='GET')return send(405,{error:{name:'NotAllowedError',message:'Read only'}});
  if(url.pathname==='/health')return send(200,{status:'ok',fixture:true});
  if(url.pathname.startsWith('/files/')){
   let relative;
   try {relative=decodeURIComponent(url.pathname.slice(7));}
   catch {return send(400,{error:{name:'InputError',message:'Malformed URL encoding'}});}
   const contents=await readPublicFile(root,relative,['catalog-info.yaml','catalog','openapi']);
   if(contents===null)return send(404,{error:{name:'NotFoundError'}});
   res.writeHead(200,{'Content-Type':'text/yaml'});return res.end(contents);
  }
  if(req.headers.authorization!=='Bearer '+token)return send(401,{error:{name:'AuthenticationError',message:'Missing or invalid credential'},request:{method:req.method,url:req.url},response:{statusCode:401}});
  try{
   const all=await entities();
   if(url.pathname==='/api/catalog/entities/by-query')return send(200,queryEntities(all,url.searchParams));
   const match=/^\/api\/catalog\/entities\/by-name\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url.pathname);
   if(match){const [kind,namespace,name]=match.slice(1).map(decodeURIComponent);const e=all.find(e=>e.kind.toLowerCase()===kind.toLowerCase()&&e.metadata.namespace.toLowerCase()===namespace.toLowerCase()&&e.metadata.name.toLowerCase()===name.toLowerCase());return e?send(200,e):send(404,{error:{name:'NotFoundError'}});}
   return send(404,{error:{name:'NotFoundError'}});
  }catch(e){return send(400,{error:{name:'InputError',message:e.message}});}
 });
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const port=Number(process.env.PORT||7010);createMockServer().listen(port,'127.0.0.1',()=>console.log('Fictional Backstage catalog API: http://127.0.0.1:'+port));}

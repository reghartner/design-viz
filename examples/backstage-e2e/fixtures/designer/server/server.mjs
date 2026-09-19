/* Local rehearsal host. Static editor/specs contain fictional data only.
   Production must put static files behind company auth and authorize each spec. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {registry} from '../tools/canon/registry.mjs';
import {buildEntityDiagramIndex,diagramsForEntity} from '../tools/canon/entity-diagrams.mjs';
import {digest} from '../tools/canon/drift.mjs';
import {readPublicFile} from '../lib/public-files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export function createDesignerServer({token=process.env.FLOWVIEW_READ_TOKEN,publicBaseUrl=process.env.PUBLIC_BASE_URL||'http://localhost:7020'}={}){
 if(!token)throw new Error('Set FLOWVIEW_READ_TOKEN for the Backstage proxy.');
 const session=randomBytes(24).toString('hex');
 return createServer(async(req,res)=>{
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  let url;
  try {url=new URL(req.url,'http://localhost');}
  catch {return json(400,{error:'Malformed URL'});}
  if(req.method!=='GET')return json(405,{error:'Read-only rehearsal host'});
  if(url.pathname==='/health')return json(200,{status:'ok',rehearsal:true});
  if(url.pathname.startsWith('/api/canon/')){
   const browserSession=req.headers.cookie?.split(';').some(v=>v.trim()==='flowview_rehearsal='+session);
   if(req.headers.authorization!=='Bearer '+token&&!browserSession)return json(401,{error:'Authentication required'});
   try{
    const reg=await registry(path.join(root,'registry.json'));
    if(url.pathname==='/api/canon/entity-diagrams')return json(200,diagramsForEntity(buildEntityDiagramIndex(reg.specs,{publicBaseUrl}),url.searchParams.get('entityRef')));
    if(url.pathname==='/api/canon/context'){
     const spec=reg.specs.find(s=>s.page.canon.id===url.searchParams.get('id'));
     return spec?json(200,{spec,revision:digest(spec),catalog:JSON.parse(await readFile(path.join(root,'workbench/catalog.json'))),simulated:true}):json(404,{error:'Unknown diagram'});
    }
    const match=/^\/api\/canon\/specs\/([a-z0-9_.-]+)$/i.exec(url.pathname);
    if(match){const spec=reg.specs.find(s=>s.page.canon.id===match[1]);if(!spec)return json(404,{error:'Unknown diagram'});if(url.searchParams.has('revision')&&url.searchParams.get('revision')!==digest(spec))return json(409,{error:'Published revision changed. Refresh diagrams.'});return json(200,spec);}
    return json(404,{error:'Unknown route'});
   }catch(e){return json(400,{error:e.message});}
  }
  if(url.pathname==='/'){res.writeHead(302,{Location:'/workbench/flowspec.html'});return res.end();}
  let relative;
  try {relative=decodeURIComponent(url.pathname).slice(1);}
  catch {return json(400,{error:'Malformed URL encoding'});}
  try{
   const contents=await readPublicFile(root,relative,['workbench','template','src/starters','specs','docs']);
   if(contents===null)return json(404,{error:'Not found'});
   const types={'.html':'text/html','.json':'application/json','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.md':'text/plain'};
   const headers={'Content-Type':types[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
   // Developer-only session for opening the external workbench. No company identity implied.
   if(relative==='workbench/flowspec.html'||relative==='template/flowview.html')headers['Set-Cookie']='flowview_rehearsal='+session+'; HttpOnly; SameSite=Strict; Path=/';
   res.writeHead(200,headers);res.end(contents);
  }catch{return json(404,{error:'Not found'});}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const port=Number(process.env.PORT||7020);createDesignerServer().listen(port,'127.0.0.1',()=>console.log('Designer rehearsal: http://localhost:'+port));}

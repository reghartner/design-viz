import {test as base,expect} from '../helpers/test.mjs';
import {runBrowserContract} from '../helpers/company-panel-contracts.mjs';
import contracts from '../../../tests/helpers/company-panel-contracts.cjs';
import fixture from '../../../tests/helpers/company-panel-fixture.cjs';
import {createServer} from 'node:http';
import {readFile,rm} from 'node:fs/promises';
import path from 'node:path';
const actual=contracts.load();
for(const entry of actual.entries)for(const sample of entry.samples)for(const placement of entry.definition.layout?.canvasSizing?['floating','canvas']:['floating']){
 base('company panel '+entry.type+' / '+sample.name+' / '+placement+' ['+entry.source+']',async({page,server})=>{
  await runBrowserContract(page,server.origin+'/workbench.html',entry,sample,placement);
 });
}
const test=base.extend({server:[async({},use)=>{
 const root=fixture.scratch();let server;
 try{
  fixture.build(root);const loaded=contracts.load(root);
  server=createServer(async(req,res)=>{
   try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('Outside fixture root');
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.json':'application/json','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(bytes);
   }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await use({root,entries:loaded.entries,origin:'http://127.0.0.1:'+server.address().port});
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
},{scope:'worker',timeout:120000}]});
for(const [type,placement] of [['responsive','floating'],['scroll','floating'],['aspect','floating'],['aspect','canvas'],['fit','floating'],['fit','canvas']])test('panel contract positive probe: '+type+' '+placement,async({page,server})=>{
 const entry=server.entries.find(e=>e.type==='contract-'+type);
 await runBrowserContract(page,server.origin+'/workbench/flowspec.html',entry,entry.samples[0],placement);
});
for(const [type,rule] of [['frozen','responsive-content'],['clipped','reachable-overflow'],['horizontal','pointer-move-y'],['frozen-height','standard-height-tile'],['frozen-card-height','standard-height-card']])test('panel contract rejects real broken '+type+' renderer',async({page,server})=>{
 const entry=server.entries.find(e=>e.type==='contract-'+type),url=server.origin+'/workbench/flowspec.html';
 await expect(runBrowserContract(page,url,entry,entry.samples[0])).rejects.toThrow(rule);
});

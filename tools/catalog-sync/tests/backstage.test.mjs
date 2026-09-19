import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadBackstageCatalog} from '../backstage.mjs';
import {syncCatalog} from '../../canon/catalog-sync.mjs';
const component={kind:'Component',metadata:{name:'recorder',namespace:'home'},spec:{owner:'team'},relations:[{type:'providesApi',targetRef:'api:home/recordings'}]};
const api={kind:'API',metadata:{name:'recordings',namespace:'home'},spec:{type:'openapi',definition:'openapi: 3.0.3\nservers:\n  - url: https://recordings.example.test\npaths:\n  /recordings:\n    post:\n      operationId: createRecording'}};
const options={backendUrl:'https://backstage.example.test/backend',appUrl:'https://backstage.example.test',token:'test-machine-token'};
test('processed API pages seed YAML operations and generated service relations without repository reads',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'backstage-seed-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let page=0;
 const loaded=await loadBackstageCatalog({...options,fetchImpl:async(url,request)=>{
   assert.equal(url.origin,'https://backstage.example.test');assert.equal(url.pathname,'/backend/api/catalog/entities/by-query');
   assert.equal(request.headers.Authorization,'Bearer test-machine-token');assert.equal(request.redirect,'error');assert.ok(request.signal);
   page++;if(page===1)assert.deepEqual(url.searchParams.getAll('filter'),['kind=component','kind=api']);else assert.equal(url.searchParams.get('cursor'),'page-2');
   return Response.json(page===1?{items:[component],pageInfo:{nextCursor:'page-2'}}:{items:[api],pageInfo:{}});
 }});
 const output=path.join(directory,'catalog.json');await syncCatalog({...loaded,output});
 const data=JSON.parse(await readFile(output));assert.equal(page,2);
 assert.equal(data.services[0].apis[0].operations[0].operationId,'createRecording');
 assert.equal(data.services[0].apis[0].definitionUrl,'https://backstage.example.test/catalog/home/api/recordings');
 assert.equal((await syncCatalog({...loaded,output})).changed,false);
});
test('HTTP errors, repeated cursors, duplicate identities and malformed definitions refuse publication',async()=>{
 await assert.rejects(loadBackstageCatalog({...options,fetchImpl:async()=>new Response('',{status:403})}),/403/);
 await assert.rejects(loadBackstageCatalog({...options,fetchImpl:async()=>Response.json({items:[],pageInfo:{nextCursor:'same'}})}),/repeated catalog cursor/);
 for(const items of [[component,component],[{...api,spec:{...api.spec,definition:'paths: [broken'}}],[{...api,spec:{...api.spec,definition:{paths:{'/x':{$ref:'#/paths/y'}}}}}]]){
   await assert.rejects(loadBackstageCatalog({...options,fetchImpl:async()=>Response.json({items,pageInfo:{}})}),/Duplicate|Invalid|Resolve/);
 }
});

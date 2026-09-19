import test from 'node:test';import assert from 'node:assert/strict';import {createMockServer} from '../mock/server.mjs';
test('Backstage query contract: auth, OR filters, AND fields, cursor pages, definitions and relations',async t=>{
 const server=createMockServer({token:'test'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;const headers={Authorization:'Bearer test'};
 assert.equal((await fetch(base+'/api/catalog/entities/by-query')).status,401);
 let url=base+'/api/catalog/entities/by-query?filter=kind=component&filter=kind=api&limit=2',all=[],pages=0;
 do{const r=await fetch(url,{headers});assert.equal(r.status,200);const data=await r.json();assert.equal(data.totalItems,6);all.push(...data.items);pages++;url=data.pageInfo.nextCursor?base+'/api/catalog/entities/by-query?cursor='+data.pageInfo.nextCursor:null;}while(url);
 assert.equal(pages,3);assert.equal(new Set(all.map(e=>e.kind+e.metadata.name)).size,6);
 const rec=all.find(e=>e.kind==='Component'&&e.metadata.name==='recording-service');assert.ok(rec.relations.some(r=>r.targetRef==='api:home/recording-service-api'));
 const api=all.find(e=>e.kind==='API'&&e.metadata.name==='recording-service-api');assert.equal(JSON.parse(api.spec.definition).paths['/recordings'].post.operationId,'createRecording');
 const selected=await (await fetch(base+'/api/catalog/entities/by-query?filter=kind=component,metadata.name=recording-service&fields=kind,metadata.name',{headers})).json();assert.deepEqual(selected.items,[{kind:'Component',metadata:{name:'recording-service'}}]);
 assert.equal((await fetch(base+'/api/catalog/entities/by-query?cursor=bad',{headers})).status,400);
});

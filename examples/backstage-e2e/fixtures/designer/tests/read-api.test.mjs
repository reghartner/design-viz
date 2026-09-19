import test from 'node:test';import assert from 'node:assert/strict';import {createDesignerServer} from '../server/server.mjs';
test('real diagram read API gates access, resolves service/API associations, pins revision, and rejects writes',async t=>{
 const server=createDesignerServer({token:'test'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,route='/api/canon/entity-diagrams?entityRef=component:home/recording-service',headers={Authorization:'Bearer test'};
 assert.equal((await fetch(base+route)).status,401);
 const data=await (await fetch(base+route,{headers})).json();assert.equal(data.diagrams.length,1);const diagram=data.diagrams[0];
 assert.equal((await fetch(base+'/api/canon/specs/'+diagram.id+'?revision='+diagram.revision,{headers})).status,200);
 assert.equal((await fetch(base+'/api/canon/specs/'+diagram.id+'?revision=stale',{headers})).status,409);
 const api=await (await fetch(base+'/api/canon/entity-diagrams?entityRef=api:home/recording-service-api',{headers})).json();assert.equal(api.diagrams[0].id,diagram.id);
 assert.equal((await fetch(base+route,{method:'POST',headers})).status,405);
 assert.equal((await fetch(base+'/.flowview/runtime.json')).status,404);
});

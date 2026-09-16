const test=require('node:test'),assert=require('node:assert/strict');
test('Backstage adapter resolves catalog identities, API operations and declared endpoint environments',async()=>{
  const {catalogFromEntities}=await import('../tools/canon/backstage.mjs');
  const result=catalogFromEntities([{kind:'Component',metadata:{name:'recording',namespace:'home'},spec:{owner:'team',providesApis:['recording-api']}},{kind:'API',metadata:{name:'recording-api',namespace:'home'},spec:{type:'openapi',definition:JSON.stringify({openapi:'3.0.0',servers:[{url:'https://recording.example.test','x-environment':'development'}],paths:{'/recordings':{post:{operationId:'createRecording'}}}})}}],'https://backstage.example.test');
  assert.equal(result.catalog.services[0].entityRef,'component:home/recording');assert.equal(result.catalog.services[0].owner,'group:home/team');assert.equal(result.catalog.services[0].apis[0].operations[0].operationId,'createRecording');assert.equal(result.warnings.length,0);
});
test('Backstage adapter follows pagination with credentials only on the configured server',async()=>{
  const {fetchBackstageCatalog}=await import('../tools/canon/backstage.mjs');let count=0;
  const result=await fetchBackstageCatalog({backendUrl:'https://backend.example.test',appUrl:'https://backstage.example.test',token:'private',fetchImpl:async(url,opts)=>{
    assert.equal(url.origin,'https://backend.example.test');assert.equal(opts.headers.Authorization,'Bearer private');count++;if(count===2)assert.equal(url.searchParams.get('cursor'),'next');return {ok:true,json:async()=>({items:[],pageInfo:count===1?{nextCursor:'next'}:{}})};
  }});assert.equal(count,2);assert.equal(result.catalog.services.length,0);
});

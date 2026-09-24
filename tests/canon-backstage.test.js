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

test('catalog exporter qualifies and retains dependency and consumed API relationships for graph seeding',async()=>{
  const {catalogFromEntities}=await import('../tools/canon/backstage.mjs');
  const {canonicalCatalog,catalogChanges}=await import('../tools/canon/catalog-sync.mjs');
  const entities=[{kind:'Component',metadata:{name:'camera',namespace:'home'},relations:[
    {type:'dependsOn',targetRef:'component:home/recording'},
    {type:'consumesApi',targetRef:'api:home/notify'},
    {type:'ownedBy',targetRef:'group:home/team'}
  ],spec:{dependsOn:['recording','resource:default/bucket'],consumesApis:['notify','default/other']}}];
  const result=catalogFromEntities(entities,'https://backstage.example.test');
  const service=result.catalog.services[0];
  assert.deepEqual(service.dependsOn,['component:home/recording','resource:default/bucket']);
  assert.deepEqual(service.consumesApis,['api:default/other','api:home/notify']);
  assert.equal(result.warnings.length,0,'relations may point outside the approved component subset');
  const before=canonicalCatalog(result.catalog),after=structuredClone(result.catalog);
  after.services[0].dependsOn.reverse();after.services[0].consumesApis.reverse();
  assert.deepEqual(catalogChanges(before,canonicalCatalog(after)).changed,[]);
  delete after.services[0].consumesApis;assert.equal(catalogChanges(before,canonicalCatalog(after)).changed.length,1);
});

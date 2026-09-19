import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadRepositoryCatalog,localReader,githubReader,parseDocuments} from '../repositories.mjs';
import {syncCatalog} from '../../canon/catalog-sync.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const fixture=path.join(root,'examples/canon/catalog-sources');
const config=JSON.parse(await readFile(path.join(fixture,'sources.json'),'utf8'));
const local=localReader(path.join(fixture,'repositories'));
async function temporary(t){const directory=await mkdtemp(path.join(os.tmpdir(),'catalog-repos-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}

test('repository descriptors, Locations and YAML API files produce the same stable Backstage identities',async()=>{
  const result=await loadRepositoryCatalog(config,local);
  assert.equal(result.entities.length,3);assert.equal(result.files,4);
  const recording=result.entities.find(e=>e.kind==='API');
  assert.equal(recording.spec.definition.paths['/recordings'].post.operationId,'createRecording');
  assert.equal(result.entities[0].metadata.namespace,'home');
});

test('GitHub reads use one pinned commit and only the configured GitHub API, never Backstage',async()=>{
  const requests=[],sha='a'.repeat(40);
  const reader=githubReader({token:'private-source-token',apiUrl:'https://github-api.example.test/api/v3',fetchImpl:async(url,opts)=>{
    requests.push(url);assert.ok(url.startsWith('https://github-api.example.test/api/v3/'));
    assert.equal(opts.headers.Authorization,'Bearer private-source-token');assert.equal(opts.redirect,'error');
    if(url.endsWith('/commits/main'))return {ok:true,json:async()=>({sha})};
    const parsed=new URL(url);assert.equal(parsed.searchParams.get('ref'),sha);
    const filename=decodeURIComponent(parsed.pathname.split('/contents/')[1]);
    const content=await local.file(config.sources[0].repository,'local',filename);
    return {ok:true,json:async()=>({type:'file',encoding:'base64',size:Buffer.byteLength(content),content:Buffer.from(content).toString('base64')})};
  }});
  const result=await loadRepositoryCatalog(config,reader);
  assert.equal(requests.length,5);assert.equal(result.revisions[0].revision,sha);
});

test('semantic-only changes open catalog diffs; reordered descriptors and unrelated commits do not',async t=>{
  const dir=await temporary(t),output=path.join(dir,'catalog.json'),report=path.join(dir,'report.md');
  const result=await loadRepositoryCatalog(config,local);
  assert.equal((await syncCatalog({...result,output,report})).changed,true);
  const original=await readFile(output,'utf8');
  const reordered=structuredClone(result);reordered.entities.reverse();
  assert.equal((await syncCatalog({...reordered,output,report})).changed,false);
  assert.equal(await readFile(output,'utf8'),original);
  const changed=structuredClone(result);changed.entities.find(e=>e.kind==='API').spec.definition.paths['/recordings'].post.operationId='beginRecording';
  const update=await syncCatalog({...changed,output,report});
  assert.deepEqual(update.changes.changed,['component:home/recording-service']);
  assert.match(await readFile(report,'utf8'),/Changed services/);
  const removed=structuredClone(result);removed.entities=removed.entities.filter(e=>e.metadata.name!=='notification-service');
  assert.deepEqual((await syncCatalog({...removed,output,report})).changes.removed,['component:home/notification-service']);
});

test('a failed source, duplicate identity, missing API or empty result cannot replace the approved catalog',async t=>{
  const dir=await temporary(t),output=path.join(dir,'catalog.json'),result=await loadRepositoryCatalog(config,local);
  await syncCatalog({...result,output});const original=await readFile(output,'utf8');
  await assert.rejects(loadRepositoryCatalog(config,{pin:local.pin,file:async()=>{throw new Error('GitHub source read failed (403).');}}),/403/);
  await assert.rejects(syncCatalog({...result,output,entities:[]}),/empty catalog/);
  await assert.rejects(syncCatalog({...result,output,entities:result.entities.filter(e=>e.kind!=='API')}),/incomplete/);
  const duplicate=await local.file(config.sources[0].repository,'local','catalog/services.yaml');
  await assert.rejects(loadRepositoryCatalog({...config,sources:[{...config.sources[0],paths:['duplicate.yaml']}]},{pin:local.pin,file:async()=>duplicate+'\n---\n'+duplicate}),/Duplicate catalog entity/);
  assert.equal(await readFile(output,'utf8'),original);
});

test('Location and substitution targets cannot choose arbitrary network hosts or escape repositories',async()=>{
  for(const target of ['https://attacker.example/api','../../outside.yaml','https://github.com/unlisted/repo/blob/main/catalog-info.yaml']){
    const doc='kind: Location\nmetadata: {name: test}\nspec:\n  target: '+target+'\n';
    await assert.rejects(loadRepositoryCatalog(config,{pin:local.pin,file:async()=>doc}),/outside|escapes/);
  }
  const cycle='kind: Location\nmetadata: {name: test}\nspec: {target: catalog-info.yaml}\n';
  await assert.rejects(loadRepositoryCatalog(config,{pin:local.pin,file:async()=>cycle}),/cycle/);
  assert.throws(()=>parseDocuments('kind: Component\nkind: API','duplicate'),/Invalid/);
  assert.throws(()=>parseDocuments('value: !unknown command','tags'),/Invalid/);
});

test('approved cross-repository targets and structured substitutions resolve only at configured refs',async()=>{
  const sources={version:1,backstageAppUrl:config.backstageAppUrl,sources:[{repository:'company/index',ref:'main',paths:['catalog.yaml']},{repository:'company/service',ref:'release/v1',paths:['api.yaml']}]};
  const files={
    'company/index:catalog.yaml':'kind: Location\nmetadata: {name: index}\nspec: {target: https://github.com/company/service/blob/release/v1/service.yaml}',
    'company/service:service.yaml':'kind: Component\nmetadata: {name: service}\nspec:\n  $json: spec.json',
    'company/service:spec.json':JSON.stringify({owner:'team',providesApis:['api']}),
    'company/service:api.yaml':'kind: API\nmetadata: {name: api}\nspec:\n  type: openapi\n  definition:\n    $yaml: api-definition.yaml',
    'company/service:api-definition.yaml':'openapi: 3.0.3\npaths:\n  /ping:\n    get: {operationId: ping}'
  };
  const reader={pin:async(repo,ref)=>({ref,revision:'a'.repeat(40)}),file:async(repo,rev,file)=>files[repo+':'+file]};
  const result=await loadRepositoryCatalog(sources,reader);
  assert.equal(result.entities.length,2);assert.equal(result.entities[0].spec.owner,'team');
  assert.equal(result.entities[1].spec.definition.paths['/ping'].get.operationId,'ping');
  files['company/service:api-definition.yaml']='openapi: 3.0.3\npaths:\n  /ping: {$ref: "#/paths/elsewhere"}';
  await assert.rejects(loadRepositoryCatalog(sources,reader),/path\/operation/);
});

test('sync workflow runs trusted code and proposes only the bundled catalog on a stable branch',async()=>{
  const workflow=parseDocuments(await readFile(path.join(root,'.github/workflows/catalog-sync.yml'),'utf8'),'workflow')[0];
  assert.deepEqual(Object.keys(workflow.on).sort(),['repository_dispatch','schedule','workflow_dispatch']);
  assert.equal(workflow.permissions.contents,'read');assert.match(workflow.jobs.sync.if,/FLOWVIEW_CATALOG_SYNC_ENABLED/);
  const steps=workflow.jobs.sync.steps,checkout=steps.find(s=>s.uses?.startsWith('actions/checkout@'));
  assert.match(checkout.with.ref,/default_branch/);assert.equal(checkout.with['persist-credentials'],false);
  const pr=steps.find(s=>s.uses?.startsWith('peter-evans/create-pull-request@'));
  assert.equal(pr.with['add-paths'],'workbench/catalog.json');assert.equal(pr.with.branch,'flowview/catalog-sync');
  assert.match(pr.uses,/@[a-f0-9]{40}$/);assert.equal(pr.with['delete-branch'],true);
  const exported=steps.find(s=>s.name==='Export and validate catalog');
  assert.match(exported.run,/--sources/);assert.match(exported.run,/--backstage/);assert.match(exported.env.FLOWVIEW_BACKSTAGE_TOKEN,/secrets\.FLOWVIEW_BACKSTAGE_TOKEN/);
});

test('CLI rebuilds the catalog from the fake repository with no credentials or network',async t=>{
  const dir=await temporary(t),output=path.join(dir,'catalog.json'),report=path.join(dir,'report.md');
  const args=[path.join(root,'tools/canon/catalog-sync.mjs'),'--sources',path.join(fixture,'sources.json'),'--local-root',path.join(fixture,'repositories'),'--output',output,'--report',report];
  const env={...process.env};delete env.FLOWVIEW_CATALOG_SOURCE_TOKEN;delete env.GITHUB_STEP_SUMMARY;
  assert.match((await promisify(execFile)(process.execPath,args,{env})).stdout,/Catalog changed: 2/);
  assert.match((await promisify(execFile)(process.execPath,args,{env})).stdout,/Catalog unchanged/);
  const snapshot=JSON.parse(await readFile(output,'utf8')),service=snapshot.services.find(s=>s.entityRef==='component:home/recording-service');
  assert.equal(service.catalogUrl,'https://backstage.example.test/catalog/home/component/recording-service');
  assert.equal(service.apis[0].operations[0].operationId,'createRecording');
});

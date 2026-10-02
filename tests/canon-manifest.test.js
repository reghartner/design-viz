const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const library=require('../tools/canon/manifest.cjs');
const entry={folder:'diagrams/payments/checkout',owner:'group:default/checkout-team'};
const manifest={version:1,diagrams:[entry]};
function spec(){return {page:{title:'Checkout',sections:[{heading:'Request',diagram:{nodes:{service:{title:'Service',binding:{entityRef:'component:default/checkout'}}},rows:[['service']],edges:[],steps:[{id:'receive',title:'Receive request',nodes:['service']}]}}]}};}
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'canon-library-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const folder=path.join(root,entry.folder);await fs.mkdir(folder,{recursive:true});
 await fs.writeFile(path.join(root,'canon.json'),JSON.stringify(manifest));
 await fs.writeFile(path.join(folder,'checkout.spec.json'),JSON.stringify(spec()));
 return {root,file:path.join(root,'canon.json'),folder};
}
test('central membership overrides embedded flags without mutating authored specs',()=>{
 const raw=spec();raw.page.canon={id:'old',kind:'design',owner:'group:default/old'};
 const resolved=library.spec(raw,library.entries(manifest)[0]);
 assert.deepEqual(resolved.page.canon,{version:1,id:'checkout',kind:'canonical',owner:entry.owner});
 assert.equal(raw.page.canon.kind,'design');
 assert.deepEqual(library.entries({version:1,diagrams:[{...entry,folder:'diagrams/flat-diagram'}]})[0],{
   id:'flat-diagram',folder:'diagrams/flat-diagram',owner:entry.owner,
   path:'diagrams/flat-diagram/flat-diagram.spec.json',html:'diagrams/flat-diagram/flat-diagram.html',
 });
 assert.deepEqual(library.entries(manifest)[0],{
   id:'checkout',folder:'diagrams/payments/checkout',owner:entry.owner,
   path:'diagrams/payments/checkout/checkout.spec.json',html:'diagrams/payments/checkout/checkout.html',
 });
 for(const folder of ['../outside','/diagrams/a','diagrams/../outside','diagrams/','diagrams//a','diagrams/a/','diagrams/a//b','diagrams/a/.','diagrams/a/..','https://evil.test/a','diagrams/a%2fb','diagrams/a%2Fb','diagrams/a\\b'])assert.throws(()=>library.entries({version:1,diagrams:[{...entry,folder}]}));
 assert.throws(()=>library.entries({version:1,diagrams:[entry,entry]}),/Duplicate/);
 assert.throws(()=>library.entries({version:1,diagrams:[entry,{...entry,folder:'diagrams/archive/checkout'}]}),/Duplicate canon ID: checkout/);
 assert.throws(()=>library.entries({version:2,diagrams:[]}),/version 1/);
});
test('Backstage and drift load only central members; removing a folder removes its associations',async t=>{
 const {file,folder}=await fixture(t);
 const {loadCanonDiagrams}=await import('../tools/canon/library.mjs');
 const {diagramsForEntity}=await import('../tools/canon/entity-diagrams.mjs');
 const {registry}=await import('../tools/canon/registry.mjs');
 const raw=spec();raw.page.canon={version:1,id:'self-promoted',kind:'canonical',owner:entry.owner};
 await fs.writeFile(path.join(folder,'checkout.spec.json'),JSON.stringify(raw));
 const loaded=await loadCanonDiagrams(file,{publicBaseUrl:'https://flows.test/prefix'});
 const diagrams=diagramsForEntity(loaded.index,'component:default/checkout').diagrams;
 assert.equal(diagrams.length,1);assert.equal(diagrams[0].id,'checkout');assert.equal(diagrams[0].kind,'canonical');
 assert.match(diagrams[0].editUrl,/workbench/);
 assert.equal((await registry(file)).specs[0].page.canon.id,'checkout');
 const denied=await loadCanonDiagrams(file,{authorize:async()=>false});assert.deepEqual(denied.specs,[]);assert.deepEqual(denied.index.entities,{});
 await fs.writeFile(file,JSON.stringify({version:1,diagrams:[]}));
 assert.deepEqual((await loadCanonDiagrams(file)).specs,[]);
 assert.deepEqual((await registry(file)).specs,[]);
});
test('missing files, malformed manifests and symlinks out of the folder fail visibly',async t=>{
 const {file,folder,root}=await fixture(t),{canonLibrary}=await import('../tools/canon/registry.mjs');
 await fs.unlink(path.join(folder,'checkout.spec.json'));await assert.rejects(canonLibrary(file),/ENOENT/);
 await fs.writeFile(path.join(root,'outside.json'),JSON.stringify(spec()));
 await fs.symlink(path.join(root,'outside.json'),path.join(folder,'checkout.spec.json'));
 await assert.rejects(canonLibrary(file),/inside their diagram folder/);
 await fs.writeFile(file,'{broken');await assert.rejects(canonLibrary(file),SyntaxError);
});

test('the publisher snapshot and Backstage resolve identical membership and revisions',async t=>{
 const {file,folder}=await fixture(t);
 const {loadCanonDiagrams,publishLibrary}=await import('../tools/canon/library.mjs');
 const output=path.join(path.dirname(file),'workbench/diagrams.json');
 const authored=spec();authored.page.canon={version:1,id:'old-spec-id',kind:'design',owner:'group:default/old'};
 const authoredText=JSON.stringify(authored);await fs.writeFile(path.join(folder,'checkout.spec.json'),authoredText);
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,'{"version":0}');
 const snapshot=await publishLibrary({registryPath:file,output});
 const backstage=await loadCanonDiagrams(file,{diagramUrls:({id})=>({viewerUrl:'https://flows.test/?diagram='+id,editUrl:'https://flows.test/?diagram='+id})});
 const raw=JSON.parse(await fs.readFile(path.join(folder,'checkout.spec.json'),'utf8'));
 assert.equal(snapshot.version,3);assert.equal(snapshot.diagrams[0].spec,undefined);
 assert.equal(snapshot.diagrams[0].specUrl,'../diagrams/payments/checkout/checkout.spec.json');
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(path.dirname(output),snapshot.diagrams[0].specUrl),'utf8')),authored);
 assert.deepEqual(snapshot.diagrams[0].canon,{version:1,id:'checkout',kind:'canonical',owner:entry.owner});
 assert.equal(await fs.readFile(path.join(folder,'checkout.spec.json'),'utf8'),authoredText);
 assert.deepEqual({...raw,page:{...raw.page,canon:snapshot.diagrams[0].canon}},backstage.specs[0]);
 const initial=await fs.readFile(output,'utf8');
 await fs.writeFile(path.join(folder,'checkout.spec.json'),'{broken');
 await assert.rejects(publishLibrary({registryPath:file,output}));
 assert.equal(await fs.readFile(output,'utf8'),initial);
 await fs.writeFile(file,JSON.stringify({version:1,diagrams:[]}));
 const empty=await publishLibrary({registryPath:file,output});
 assert.deepEqual(empty.diagrams,[]);
 assert.deepEqual((await loadCanonDiagrams(file)).specs,[]);
});
test('central publishing refuses output inside diagrams and preserves the source manifest',async t=>{
 const {file,folder}=await fixture(t);
 const {publishLibrary}=await import('../tools/canon/library.mjs');
 const before=await fs.readFile(file,'utf8');
 await assert.rejects(publishLibrary({registryPath:file,output:file}),/overwrite the source registry/);
 for(const name of ['checkout.spec.json','new.json']){
   await assert.rejects(publishLibrary({registryPath:file,output:path.join(folder,name)}),/outside the diagram source directory/);
 }
 assert.equal(await fs.readFile(file,'utf8'),before);
});
test('nginx build-stage inputs publish without a source checkout',async t=>{
 const {root}=await fixture(t);
 await fs.cp(path.join(__dirname,'../tools/canon'),path.join(root,'tools/canon'),{recursive:true});
 const {execFileSync}=require('node:child_process');
 execFileSync(process.execPath,['tools/canon/library.mjs','--out','diagrams.json'],{cwd:root});
 const output=JSON.parse(await fs.readFile(path.join(root,'diagrams.json'),'utf8'));
 assert.equal(output.diagrams.length,1);assert.equal(output.diagrams[0].id,'checkout');
 assert.equal(output.diagrams[0].canon.owner,entry.owner);
});

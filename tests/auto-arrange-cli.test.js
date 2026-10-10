'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const cli=path.resolve(__dirname,'../tools/auto-arrange-spec.cjs');
const viewer={URL};vm.runInNewContext(entrypoint('workbench').body,viewer);

function diagram(prefix){
  return {nodes:{[prefix+'a']:{title:'A',binding:{entityRef:'component:default/a'}},[prefix+'b']:{title:'B'},[prefix+'c']:{title:'C'}},
    rows:[[]],floats:[{id:prefix+'a',side:'below'},{id:prefix+'b',side:'below'},{id:prefix+'c',side:'below'}],
    edges:[{from:prefix+'a',to:prefix+'b',label:'send',kind:'int',bend:3,labelDx:9999},{from:prefix+'b',to:prefix+'c',ret:true}],
    panels:[{id:'notes',type:'checks',title:'Keep panel',results:[]}],steps:[{id:'send',text:'Keep step',edge:prefix+'a->'+prefix+'b'}]};
}
function run(input,output,options=[]){return cp.spawnSync(process.execPath,[cli,...options,input,output],{encoding:'utf8'});}
function assertRenderableRoutes(diagram){
  const L=viewer.layout(diagram);
  diagram.edges.forEach(edge=>{
    if(edge.fromPort!=null)assert.ok(viewer.validEdgePort(edge.fromPort));
    if(edge.toPort!=null)assert.ok(viewer.validEdgePort(edge.toPort));
    if(edge.curveControls!=null)assert.ok(viewer.validCurveControls(edge.curveControls));
    const route=viewer.edgePath(edge,L);assert.ok(route.length);assert.doesNotMatch(route,/NaN|Infinity/);
  });
}

test('CLI arranges every diagram with production geometry while preserving semantic content and other sections',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-arrange-cli-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const raw={page:{title:'New story',sections:[{heading:'First',diagram:diagram('x')},{heading:'Keep prose',text:'Untouched'},
    {heading:'Second',diagram:diagram('y')}]}},input=path.join(directory,'draft.json'),output=path.join(directory,'arranged.json');
  const original=JSON.stringify(raw,null,2)+'\n';fs.writeFileSync(input,original);
  const result=run(input,output,['--section','0','--section','2']);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Arranged 2 diagrams/);
  assert.equal(fs.readFileSync(input,'utf8'),original,'input remains byte-identical');
  const arranged=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.deepEqual(arranged.page.sections[1],raw.page.sections[1]);
  for(const index of [0,2]){
    const before=raw.page.sections[index].diagram,after=arranged.page.sections[index].diagram;
    for(const key of ['nodes','groups','panels','steps'])assert.deepEqual(after[key],before[key]);
    assert.deepEqual(after.rows,[[]]);assert.equal(after.floats.length,3);
    assert.ok(after.floats.every(item=>Number.isFinite(item.x)&&Number.isFinite(item.y)));
    assert.deepEqual(after.edges.map(edge=>({from:edge.from,to:edge.to,label:edge.label,kind:edge.kind,ret:edge.ret})),
      before.edges.map(edge=>({from:edge.from,to:edge.to,label:edge.label,kind:edge.kind,ret:edge.ret})));
    assertRenderableRoutes(after);
    assert.equal(after.edges[0].bend,undefined);assert.notEqual(after.edges[0].labelDx,9999);
  }
});

test('CLI requires an explicit choice for mixed pages and leaves unselected diagrams semantically untouched',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-arrange-cli-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const raw={page:{sections:[{diagram:diagram('x')},{heading:'Keep prose'},{diagram:diagram('y')}]}},input=path.join(directory,'draft.json'),output=path.join(directory,'arranged.json');
  fs.writeFileSync(input,JSON.stringify(raw));
  const ambiguous=run(input,output);assert.notEqual(ambiguous.status,0);assert.match(ambiguous.stderr,/multiple diagrams/);assert.equal(fs.existsSync(output),false);
  const targeted=run(input,output,['--section','0']);assert.equal(targeted.status,0,targeted.stderr);
  const arranged=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.notDeepEqual(arranged.page.sections[0].diagram,raw.page.sections[0].diagram);
  assert.deepEqual(arranged.page.sections[2].diagram,raw.page.sections[2].diagram);
});

test('CLI refuses input overwrite and leaves an existing output untouched after any invalid diagram',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-arrange-cli-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const input=path.join(directory,'draft.json'),output=path.join(directory,'arranged.json');
  fs.writeFileSync(input,JSON.stringify({nodes:{a:{title:'A'}},rows:[['a']],edges:[]}));
  const same=run(input,input);assert.notEqual(same.status,0);assert.match(same.stderr,/different files/);
  const invalid={page:{sections:[{diagram:diagram('x')},{diagram:{nodes:{a:{}},rows:[['a']],edges:[{from:'a',to:'missing'}]}}]}};
  fs.writeFileSync(input,JSON.stringify(invalid));fs.writeFileSync(output,'keep existing output');
  const failed=run(input,output);assert.notEqual(failed.status,0);assert.match(failed.stderr,/invalid|missing/i);
  assert.equal(fs.readFileSync(output,'utf8'),'keep existing output');
  const nodes=Object.fromEntries(Array.from({length:81},(_,index)=>['n'+index,{title:'Node '+index}]));
  const floats=Object.keys(nodes).map(id=>({id,side:'below'}));
  fs.writeFileSync(input,JSON.stringify({nodes,rows:[[]],floats,edges:[]}));
  const unsupported=run(input,output);assert.notEqual(unsupported.status,0);assert.match(unsupported.stderr,/80 nodes/);
  assert.equal(fs.readFileSync(output,'utf8'),'keep existing output');
});

// Exercise the checkout bootstrap in isolation: production builds may already
// exist in the developer's tree, and must never mask missing/stale-source bugs.
test('fresh checkout CLI ignores stale generated code and matches the Workbench arranger',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-arrange-source-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const root=path.resolve(__dirname,'..');
  fs.cpSync(path.join(root,'src'),path.join(directory,'src'),{recursive:true});
  for(const file of ['auto-arrange-spec.cjs','source-loader.cjs','arrange/core.cjs','canon/core.cjs']){
    const target=path.join(directory,'tools',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,'tools',file),target);
  }
  const source=diagram('fresh'),input=path.join(directory,'input.json'),output=path.join(directory,'output.json');
  fs.writeFileSync(input,JSON.stringify(source));
  const Viz=require('../src/workbench/vendor/viz-3.31.0.js'),cola=require('../src/workbench/vendor/webcola-3.4.0.js'),viz=await Viz.instance();
  const arranged=viewer.autoArrangeCandidates(source,viz,cola);
  const expected=JSON.parse(JSON.stringify(viewer.autoArrangeDiagram(source,arranged)));
  let posted;
  const worker={TextDecoder,TextEncoder,setTimeout,clearTimeout,location:{href:'https://flowview.test/auto-arrange-worker.js'},postMessage(message){posted=message;}};
  worker.self=worker;vm.runInNewContext(viewer.AUTO_ARRANGE_WORKER_SOURCE,worker);
  await worker.onmessage({data:source});
  assert.equal(posted.error,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(posted.result)),JSON.parse(JSON.stringify(arranged)),'embedded worker and headless context use identical arrangement');
  for(const generated of [false,true]){
    if(generated)fs.writeFileSync(path.join(directory,'tools/canon/generated-runtime.cjs'),"throw Error('stale generated runtime must not load');\n");
    const result=cp.spawnSync(process.execPath,[path.join(directory,'tools/auto-arrange-spec.cjs'),input,output],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),expected,generated?'stale build is ignored':'fresh checkout needs no build');
  }
});

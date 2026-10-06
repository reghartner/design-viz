'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const core=require('../tools/canon/core.cjs');

const root=path.resolve(__dirname,'..');
const cli=path.join(root,'tools/export-layout.cjs');
const viewer={URL};
vm.runInNewContext(entrypoint('workbench').body,viewer);
const plain=value=>JSON.parse(JSON.stringify(value));

function richDiagram(prefix='secret-'){
  const id=name=>prefix+name;
  return {
    title:'CONFIDENTIAL diagram title',
    nodes:{
      [id('alpha')]:{title:'CONFIDENTIAL Alpha',group:id('group'),link:'https://secret.example/alpha'},
      [id('beta')]:{title:'CONFIDENTIAL Beta',group:id('group')},
      [id('gamma')]:{title:'CONFIDENTIAL Gamma'},
      [id('delta')]:{title:'CONFIDENTIAL Delta'},
      [id('automatic')]:{title:'CONFIDENTIAL Automatic'},
      [id('pinned')]:{title:'CONFIDENTIAL Pinned'}
    },
    groups:{[id('group')]:{title:'CONFIDENTIAL Group'}},
    rows:[[id('alpha'),[id('beta'),id('gamma')]],[id('delta')]],
    floats:[{id:id('automatic'),side:'above',secret:'CONFIDENTIAL float'},
      {id:id('pinned'),side:'below',noSpread:true,x:-12.5,y:333.25}],
    edges:[
      {from:id('alpha'),to:id('beta'),label:'CONFIDENTIAL forward'},
      {from:id('beta'),to:id('alpha'),label:'CONFIDENTIAL reverse'},
      {from:id('beta'),to:id('gamma')},
      {from:id('alpha'),to:id('automatic')},
      {from:id('pinned'),to:id('pinned'),fromPort:{side:'right',offset:.25},toPort:{side:'top',offset:.75},bend:19},
      {from:id('gamma'),to:id('delta'),curvePoints:[{t:.42,dx:-31.5,dy:17.25}]},
      {from:id('delta'),to:id('pinned'),curveControls:[{t:.3,dx:41.25,dy:-27.5},{t:.72,dx:-13.75,dy:33.5}]},
      {from:id('alpha'),to:id('delta'),fromPort:{side:'left',offset:.2},toPort:{side:'right',offset:.8},bend:-23},
      {from:id('alpha'),to:id('beta'),label:'CONFIDENTIAL duplicate'}
    ],
    panels:[{id:'confidential-panel',type:'checks',title:'CONFIDENTIAL panel',results:[]}],
    steps:[{id:'confidential-step',text:'CONFIDENTIAL prose',edge:id('alpha')+'->'+id('beta')}],
    metadata:{owner:'CONFIDENTIAL company',url:'https://secret.example/internal'}
  };
}

function lanesDiagram(prefix='lane-'){
  const id=name=>prefix+name;
  return {routing:'lanes',nodes:{[id('a')]:{title:'A'},[id('b')]:{title:'B'},[id('c')]:{title:'C'},[id('d')]:{title:'D'}},
    rows:[[id('a'),id('b')],[id('c'),id('d')]],edges:[
      {from:id('a'),to:id('d')},{from:id('b'),to:id('c')},{from:id('a'),to:id('c')},{from:id('d'),to:id('a')}
    ]};
}

function productionGeometry(diagram){
  const L=viewer.layout(diagram);
  const adjust=L.routing==='lanes'?viewer.laneRoutes(diagram,L):viewer.edgeAutoAdjust(diagram.edges||[],L);
  if(L.routing!=='lanes')viewer.resolveEdgeAvoidance(diagram.edges||[],L,adjust);
  viewer.expandPlacedEdgeBounds(diagram.edges||[],L,adjust);
  return {L,paths:(diagram.edges||[]).map((edge,index)=>viewer.edgePath(edge,L,adjust[index]))};
}

function assertAllowlist(output){
  assert.deepEqual(Object.keys(output),['format','diagrams']);
  assert.equal(output.format,'flowview-layout-v1');
  for(const diagram of output.diagrams){
    assert.deepEqual(Object.keys(diagram),['nodes','edges']);
    for(const node of diagram.nodes){
      assert.deepEqual(Object.keys(node),['id','x','y','width','height']);
      assert.equal(Number.isInteger(node.id),true);
      for(const key of ['x','y','width','height'])assert.equal(Number.isFinite(node[key]),true);
    }
    for(const edge of diagram.edges){
      assert.deepEqual(Object.keys(edge),['from','to','path']);
      assert.equal(Number.isInteger(edge.from)&&Number.isInteger(edge.to),true);
      assert.match(edge.path,/^M -?\d/);assert.doesNotMatch(edge.path,/NaN|Infinity/);
    }
  }
}

test('anonymous export exactly matches production bounds and routes for classic, manual, free, duplicate, reverse, and self geometry',()=>{
  const diagram=richDiagram(),before=structuredClone(diagram),expected=productionGeometry(diagram);
  const output=plain(core.exportAnonymousLayout(diagram));
  assertAllowlist(output);assert.equal(output.diagrams.length,1);
  const actual=output.diagrams[0];
  assert.deepEqual(actual.nodes,Object.keys(diagram.nodes).map((id,index)=>{
    const p=expected.L.pos[id];return {id:index+1,x:p.cx-p.w/2,y:p.cy-p.h/2,width:p.w,height:p.h};
  }));
  assert.deepEqual(actual.edges,diagram.edges.map((edge,index)=>({
    from:Object.keys(diagram.nodes).indexOf(edge.from)+1,
    to:Object.keys(diagram.nodes).indexOf(edge.to)+1,
    path:expected.paths[index]
  })));
  assert.deepEqual(diagram,before,'pure export leaves the source object untouched');
  assert.deepEqual(actual.nodes.map(node=>[node.width,node.height]),[[150,54],[170,54],[170,54],[150,54],[150,44],[150,44]]);
  assert.ok(actual.nodes.some(node=>node.x<0 || node.y<0),'awkward negative placement is preserved');
});

test('lane routes and every raw/page/tab diagram export in renderer order without prose records',()=>{
  const lane=lanesDiagram(),expected=productionGeometry(lane);
  const raw=plain(core.exportAnonymousLayout(lane));
  assert.deepEqual(raw.diagrams[0].edges.map(edge=>edge.path),expected.paths);
  assert.ok(raw.diagrams[0].edges.every(edge=>edge.path.includes(' L ')));

  const document={page:{title:'CONFIDENTIAL page',blocks:[
    {diagram:richDiagram('first-')},
    {heading:'CONFIDENTIAL prose',text:'CONFIDENTIAL body'},
    {tabs:[{label:'CONFIDENTIAL tab one',sections:[{diagram:lanesDiagram('second-')},{text:'CONFIDENTIAL'}]},
      {label:'CONFIDENTIAL tab two',sections:[{diagram:richDiagram('third-')}]}]}
  ]}};
  const output=plain(core.exportAnonymousLayout(document));
  assert.equal(output.diagrams.length,3);assertAllowlist(output);
  assert.equal(output.diagrams[0].nodes.length,6);
  assert.equal(output.diagrams[1].nodes.length,4);
  assert.equal(output.diagrams[2].nodes.length,6);
  assert.equal(core.exportAnonymousLayout({sections:[{diagram:lanesDiagram('section-')}]}).diagrams.length,1);
  assert.equal(core.exportAnonymousLayout({blocks:[{diagram:lanesDiagram('block-')}]}).diagrams.length,1);
});

test('the output is a fresh allowlist and is independent of all source strings when geometry is equal',()=>{
  const first=richDiagram('first-secret-'),second=richDiagram('other-private-');
  first.private={company:'SENTINEL-COMPANY-ALPHA',credentials:{token:'SENTINEL-TOKEN'}};
  second.private={company:'SENTINEL-COMPANY-BETA',credentials:{token:'DIFFERENT-TOKEN'}};
  const a=plain(core.exportAnonymousLayout(first)),b=plain(core.exportAnonymousLayout(second));
  assert.deepEqual(a,b);assertAllowlist(a);
  const serialized=JSON.stringify(a);
  for(const secret of ['CONFIDENTIAL','SENTINEL','secret.example','first-secret','other-private','panel','step','group'])
    assert.equal(serialized.includes(secret),false,secret);
});

test('integer-like source IDs use renderer enumeration and DOM-equivalent geometry in backend and actual CLI output',t=>{
  const source='{"nodes":{"10":{"title":"SENTINEL TEN"},"2":{"title":"SENTINEL TWO"},"z":{"title":"SENTINEL Z"}},'+
    '"rows":[["10","2","z"]],"edges":[{"from":"10","to":"2","label":"SENTINEL EDGE"}]}';
  assert.match(source,/^\{"nodes":\{"10":.*"2":.*"z":/,'raw JSON declares 10 before 2 before z');
  const expected={format:'flowview-layout-v1',diagrams:[{nodes:[
    {id:1,x:515,y:42,width:150,height:54},
    {id:2,x:35,y:42,width:150,height:54},
    {id:3,x:995,y:42,width:150,height:54}
  ],edges:[{from:2,to:1,path:'M 185 69 L 515 69'}]}]};
  const backend=plain(core.exportAnonymousLayout(JSON.parse(source)));
  assert.deepEqual(backend,expected);assert.equal(JSON.stringify(backend).includes('SENTINEL'),false);

  const dir=temp(t),input=path.join(dir,'integer-ids.spec.json'),output=path.join(dir,'anonymous.layout.json');
  fs.writeFileSync(input,source);
  const result=run([input,output]);assert.equal(result.status,0,result.stderr);
  const actual=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.deepEqual(actual,expected);assert.equal(JSON.stringify(actual).includes('SENTINEL'),false);
  assert.equal(JSON.stringify(actual).includes('"z"'),false);
});

test('malformed structures, references, coordinates, unsafe IDs, and unplaced nodes fail without disclosing values',()=>{
  assert.throws(()=>core.exportAnonymousLayout({private:'SENTINEL-BAD-SHAPE'}),/not a valid FlowSpec/);
  assert.throws(()=>core.exportAnonymousLayout({nodes:{a:{}},rows:[['a']],edges:[{from:'a',to:'SENTINEL-DANGLING'}]}),
    error=>error.message==='Input has an edge whose endpoint is not a placed node.'&&!error.message.includes('SENTINEL'));
  assert.throws(()=>core.exportAnonymousLayout({nodes:{a:{}},rows:[[]],floats:[{id:'a',x:NaN,y:2}]}),/malformed node coordinates/);
  assert.throws(()=>core.exportAnonymousLayout({nodes:{a:{},hidden:{}},rows:[['a']]}),/contains an unplaced node/);
  const unsafe=JSON.parse('{"nodes":{"__proto__":{}},"rows":[["__proto__"]]}');
  assert.throws(()=>core.exportAnonymousLayout(unsafe),/unsupported node identifier/);
  assert.throws(()=>core.exportAnonymousLayout({nodes:{a:{}},rows:[[7]]}),/malformed node placement|not a valid FlowSpec/);
});

function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-layout-export-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function run(args,cwd=root){return cp.spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});}

test('CLI writes deterministic private output atomically, preserves source bytes, and reports counts',t=>{
  const dir=temp(t),input=path.join(dir,'private.spec.json'),output=path.join(dir,'shared.layout.json');
  const source=JSON.stringify({page:{sections:[{diagram:richDiagram()},{diagram:lanesDiagram()}]}},null,2)+'\n';
  fs.writeFileSync(input,source,{mode:0o640});
  const first=run([input,output]);assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/Exported 2 diagrams, 10 nodes, and 13 edges/);
  assert.equal(fs.readFileSync(input,'utf8'),source);
  const bytes=fs.readFileSync(output,'utf8');assertAllowlist(JSON.parse(bytes));assert.equal(fs.statSync(output).mode&0o777,0o600);
  for(const secret of ['CONFIDENTIAL','secret.example','secret-alpha','secret-beta','confidential-panel','confidential-step'])
    assert.equal(bytes.includes(secret),false,secret);
  const second=run([input,output]);assert.equal(second.status,0,second.stderr);assert.equal(fs.readFileSync(output,'utf8'),bytes);
  assert.deepEqual(fs.readdirSync(dir).sort(),['private.spec.json','shared.layout.json']);
});

test('CLI help, runtime setup error, input aliases, and failed replacement are safe',t=>{
  const dir=temp(t),input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
  fs.writeFileSync(input,JSON.stringify({nodes:{a:{}},rows:[['a']]}));
  const help=run(['--help']);assert.equal(help.status,0);assert.match(help.stdout,/usage: node tools\/export-layout\.cjs/);
  for(const alias of [input,path.join(dir,'input-link.json'),path.join(dir,'input-hard.json')]){
    if(alias.endsWith('link.json'))fs.symlinkSync(input,alias);
    if(alias.endsWith('hard.json'))fs.linkSync(input,alias);
    const result=run([input,alias]);assert.notEqual(result.status,0);assert.match(result.stderr,/different files/);
  }
  fs.writeFileSync(output,'preserve this destination',{mode:0o644});
  fs.writeFileSync(input,'{"nodes":');
  const invalid=run([input,output]);assert.notEqual(invalid.status,0);assert.equal(invalid.stderr,'Input is not valid JSON.\n');
  assert.equal(fs.readFileSync(output,'utf8'),'preserve this destination');
  assert.deepEqual(fs.readdirSync(dir).filter(name=>name.includes('.layout-export-')),[]);
  fs.writeFileSync(input,'{"nodes":{"a":{}},"rows":[[]],"floats":[{"id":"a","x":1e400,"y":2}]}');
  const nonfinite=run([input,output]);assert.notEqual(nonfinite.status,0);assert.match(nonfinite.stderr,/malformed node coordinates/);
  assert.equal(fs.readFileSync(output,'utf8'),'preserve this destination');

  const isolated=path.join(dir,'isolated'),isolatedTools=path.join(isolated,'tools'),isolatedCanon=path.join(isolatedTools,'canon');
  fs.mkdirSync(isolatedCanon,{recursive:true});
  fs.copyFileSync(cli,path.join(isolatedTools,'export-layout.cjs'));
  fs.copyFileSync(path.join(root,'tools/canon/core.cjs'),path.join(isolatedCanon,'core.cjs'));
  const valid=path.join(isolated,'valid.json'),target=path.join(isolated,'target.json');
  fs.writeFileSync(valid,JSON.stringify({nodes:{a:{}},rows:[['a']]}));
  const missing=cp.spawnSync(process.execPath,[path.join(isolatedTools,'export-layout.cjs'),valid,target],{encoding:'utf8'});
  assert.notEqual(missing.status,0);assert.equal(missing.stderr,'Missing generated backend runtime; run python3 tools/build.py --runtime-only.\n');
  assert.equal(fs.existsSync(target),false);
});

test('backend assembly and built runtime expose the exporter without a source checkout',t=>{
  const backend=entrypoint('backend');
  assert.equal(backend.exports.exportAnonymousLayout,'exportAnonymousLayout');
  assert.equal(typeof core.exportAnonymousLayout,'function');
  const dir=temp(t),tools=path.join(dir,'tools'),canon=path.join(tools,'canon');
  fs.mkdirSync(canon,{recursive:true});
  fs.copyFileSync(path.join(root,'tools/canon/core.cjs'),path.join(canon,'core.cjs'));
  fs.copyFileSync(path.join(root,'tools/canon/generated-runtime.cjs'),path.join(canon,'generated-runtime.cjs'));
  const packaged=require(path.join(canon,'core.cjs'));
  assert.deepEqual(plain(packaged.exportAnonymousLayout({nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b'}]})),{
    format:'flowview-layout-v1',diagrams:[{nodes:[
      {id:1,x:35,y:42,width:150,height:54},{id:2,x:995,y:42,width:150,height:54}
    ],edges:[{from:1,to:2,path:'M 185 69 L 995 69'}]}]
  });
});

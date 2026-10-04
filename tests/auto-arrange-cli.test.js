'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const cli=path.resolve(__dirname,'../tools/auto-arrange-spec.cjs');

function diagram(prefix){
  return {nodes:{[prefix+'a']:{title:'A',binding:{entityRef:'component:default/a'}},[prefix+'b']:{title:'B'},[prefix+'c']:{title:'C'}},
    rows:[[]],floats:[{id:prefix+'a',side:'below'},{id:prefix+'b',side:'below'},{id:prefix+'c',side:'below'}],
    edges:[{from:prefix+'a',to:prefix+'b',label:'send',kind:'int',bend:3,labelDx:9999},{from:prefix+'b',to:prefix+'c',ret:true}],
    panels:[{id:'notes',type:'checks',title:'Keep panel',results:[]}],steps:[{id:'send',text:'Keep step',edge:prefix+'a->'+prefix+'b'}]};
}
function run(input,output,options=[]){return cp.spawnSync(process.execPath,[cli,...options,input,output],{encoding:'utf8'});}

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
    assert.ok(after.edges.every(edge=>edge.fromPort&&edge.toPort&&Array.isArray(edge.curveControls)));
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

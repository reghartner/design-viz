const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const context={};
vm.createContext(context);
vm.runInContext(readSource('core/paths.js'),context);
const plain=value=>JSON.parse(JSON.stringify(value));
const graph=(paths,shown)=>plain(context.pathTimelineGraph(paths,shown));
const routes=(...sequences)=>sequences.map((indices,index)=>({
  id:String.fromCharCode(97+index),label:'Route '+index,color:'#38bdf8',indices:indices.slice()
}));
const view=(paths,keep)=>paths.map(path=>({...path,indices:path.indices.filter((source,index)=>keep(source,index,path))}));
const sharedSources=model=>model.nodes.filter(node=>node.shared).map(node=>node.sourceIndex);
const blockSources=model=>model.blocks.map(block=>block.nodeIds.map(id=>model.nodes.find(node=>node.id===id).sourceIndex));

/* Round-trip each visible occurrence, including its full playback ordinal.
   Every path edge must represent exactly its next visible occurrence. */
function verify(paths,shown=paths){
  const model=graph(paths,shown),byId=new Map(model.nodes.map(node=>[node.id,node]));
  assert.equal(byId.size,model.nodes.length,'node ids are unique');
  const expectedEdges=new Map(),seenOccurrences=new Set();
  for(const shownPath of shown){
    const path=paths.find(path=>path.id===shownPath.id);
    const sequence=model.nodes.flatMap(node=>node.occurrences
      .filter(occurrence=>occurrence.pathId===path.id).map(occurrence=>({node,occurrence})))
      .sort((a,b)=>a.occurrence.visibleIndex-b.occurrence.visibleIndex);
    assert.deepEqual(sequence.map(({node})=>node.sourceIndex),shownPath.indices);
    let cursor=0;
    sequence.forEach(({node,occurrence},visibleIndex)=>{
      const index=path.indices.indexOf(node.sourceIndex,cursor);cursor=index+1;
      assert.equal(occurrence.index,index,'full path ordinal is retained');
      assert.equal(occurrence.visibleIndex,visibleIndex);
      const key=JSON.stringify([path.id,index]);
      assert.ok(!seenOccurrences.has(key),'each occurrence appears only once');seenOccurrences.add(key);
      if(visibleIndex){
        const prior=sequence[visibleIndex-1].node,key=JSON.stringify([prior.id,node.id]);
        if(!expectedEdges.has(key))expectedEdges.set(key,[]);
        expectedEdges.get(key).push(path.id);
        assert.ok(prior.column<node.column,'columns advance strictly along every path');
      }
    });
  }
  const actualEdges=new Map();
  for(const edge of model.edges){
    const key=JSON.stringify([edge.from,edge.to]);
    assert.ok(!actualEdges.has(key),'parallel path edges are collected once');
    assert.ok(byId.has(edge.from) && byId.has(edge.to));
    assert.ok(byId.get(edge.from).column<byId.get(edge.to).column,'all edges follow an acyclic rank');
    actualEdges.set(key,edge.pathIds);
  }
  assert.deepEqual(actualEdges,expectedEdges);
  for(const node of model.nodes){
    assert.equal(typeof node.id,'string');
    assert.ok(Number.isInteger(node.column) && node.column>=0);
    assert.deepEqual(node.pathIds,node.occurrences.map(occurrence=>occurrence.pathId));
    assert.equal(node.shared,node.occurrences.length>1);
    assert.equal(node.blockId!==null,node.shared);
    if(node.shared)assert.ok(model.blocks.some(block=>block.id===node.blockId && block.nodeIds.includes(node.id)));
  }
  assert.equal(model.columns,model.nodes.length?Math.max(...model.nodes.map(node=>node.column))+1:0);
  assert.equal(model.hasShared,model.nodes.some(node=>node.shared));
  for(const block of model.blocks){
    assert.ok(block.nodeIds.length>0);
    const members=block.nodeIds.map(id=>byId.get(id));
    assert.ok(members.every(node=>node.shared && node.blockId===block.id));
    for(let index=1;index<members.length;index++)assert.ok(members[index-1].column<members[index].column);
    if(block.ending){
      const last=members.at(-1).sourceIndex;
      assert.ok(block.pathIds.every(id=>paths.find(path=>path.id===id).indices.at(-1)===last));
    }
  }
  return model;
}

test('unequal incoming routes converge once with their original occurrence numbers',()=>{
  const paths=routes([0,1,5,6],[0,2,3,4,5,6]),model=verify(paths);
  assert.deepEqual(sharedSources(model),[5,6]);
  assert.deepEqual(blockSources(model),[[5,6]]);
  assert.equal(model.blocks[0].ending,true);
  const join=model.nodes.find(node=>node.sourceIndex===5);
  assert.deepEqual(join.occurrences,[{pathId:'a',index:2,visibleIndex:2},{pathId:'b',index:4,visibleIndex:4}]);
  assert.equal(join.column,4);
  assert.equal(model.nodes.filter(node=>node.sourceIndex===0).length,2,'prefix shadows remain separate');
  assert.deepEqual(model.edges.find(edge=>edge.from===join.id).pathIds,['a','b']);
});

test('routes share a middle block, split again, and rejoin for a shared ending',()=>{
  const paths=routes([0,1,4,5,6,9,10],[0,2,3,4,5,7,9,10]),model=verify(paths);
  assert.deepEqual(blockSources(model),[[4,5],[9,10]]);
  assert.deepEqual(model.blocks.map(block=>block.ending),[false,true]);
  assert.deepEqual(model.blocks.map(block=>block.pathIds),[['a','b'],['a','b']]);
});

test('membership changes split blocks across three routes',()=>{
  const paths=routes([0,1,7,8,9],[0,2,7,8,9],[0,3,8,9]),model=verify(paths);
  assert.deepEqual(blockSources(model),[[7],[8,9]]);
  assert.deepEqual(model.blocks.map(block=>block.pathIds),[['a','b'],['a','b','c']]);
  assert.deepEqual(model.blocks.map(block=>block.ending),[false,true]);
});

test('one isolated shared operation is a middle block and can split immediately',()=>{
  const model=verify(routes([0,2,3],[1,2,4]));
  assert.deepEqual(blockSources(model),[[2]]);
  assert.equal(model.blocks[0].ending,false);
});

test('a member ending earlier does not turn another route continuation into a shared ending',()=>{
  const model=verify(routes([0,1,4],[0,2,4,5]));
  assert.deepEqual(blockSources(model),[[4]]);
  assert.equal(model.blocks[0].ending,false);
});

test('prefix-only, wholly shared and single paths preserve separate rows',()=>{
  for(const paths of [routes([0,1,2],[0,1,3]),routes([0,1],[0,1]),routes([0,1,2],[0,1]),routes([0,1,2])]){
    const model=verify(paths);
    assert.equal(model.hasShared,false);
    assert.deepEqual(model.blocks,[]);
    assert.equal(model.nodes.length,paths.reduce((count,path)=>count+path.indices.length,0));
  }
});

test('an identity can join a third downstream route while two peers share its prefix',()=>{
  const model=verify(routes([0,1,2],[0,1,3],[4,1,2]));
  assert.deepEqual(blockSources(model),[[1],[2]]);
  assert.deepEqual(model.blocks.map(block=>block.pathIds),[['a','b','c'],['a','c']]);
  assert.equal(model.nodes.filter(node=>node.sourceIndex===0).length,2);
});

test('reversed shared identities stay separate while a later safe join survives',()=>{
  const model=verify(routes([0,1,2],[1,0,2]));
  assert.deepEqual(sharedSources(model),[2]);
  assert.equal(model.nodes.filter(node=>node.sourceIndex===0).length,2);
  assert.equal(model.nodes.filter(node=>node.sourceIndex===1).length,2);
  assert.deepEqual(blockSources(model),[[2]]);
  assert.equal(model.blocks[0].ending,true);
});

test('cycles introduced across three routes also preserve every conflicting occurrence',()=>{
  const model=verify(routes([0,1,3],[1,2,3],[2,0,3]));
  assert.deepEqual(sharedSources(model),[3]);
  for(const source of [0,1,2])assert.equal(model.nodes.filter(node=>node.sourceIndex===source).length,2);
});

test('view filtering cannot join blocks separated by hidden divergent operations',()=>{
  const paths=routes([0,2,4,6],[1,2,5,6]),full=verify(paths);
  const model=verify(paths,view(paths,source=>source===2 || source===6));
  assert.deepEqual(blockSources(model),[[2],[6]]);
  assert.deepEqual(model.blocks.map(block=>block.id),full.blocks.map(block=>block.id));
  assert.deepEqual(model.blocks.map(block=>block.ending),[false,true]);
  assert.equal(model.columns,2);
});

test('hiding the inputs retains authored convergence and full route ordinals',()=>{
  const paths=routes([0,1,4,5],[2,4,5]),full=verify(paths);
  const model=verify(paths,view(paths,source=>source>=4));
  assert.equal(model.hasShared,true);
  assert.deepEqual(blockSources(model),[[4,5]]);
  assert.equal(model.blocks[0].id,full.blocks[0].id);
  assert.deepEqual(model.nodes.map(node=>node.id),full.nodes.filter(node=>node.shared).map(node=>node.id));
  assert.deepEqual(model.nodes[0].occurrences,[{pathId:'a',index:2,visibleIndex:0},{pathId:'b',index:1,visibleIndex:0}]);
});

test('hiding a later authored operation never labels the visible operation as the ending',()=>{
  for(const paths of [routes([0,2,3],[1,2,4]),routes([0,2,3],[1,2,3])]){
    const model=verify(paths,view(paths,source=>source===2));
    assert.deepEqual(blockSources(model),[[2]]);
    assert.equal(model.blocks[0].ending,false);
  }
});

test('hiding steps inside a true authored block retains one block and stable identity',()=>{
  const paths=routes([0,2,3,4],[1,2,3,4]),full=verify(paths);
  const model=verify(paths,view(paths,source=>source!==2 && source!==3));
  assert.deepEqual(blockSources(model),[[4]]);
  assert.equal(model.blocks[0].id,full.blocks[0].id);
  assert.equal(model.blocks[0].ending,true);
});

test('blocks retain authored membership when a member route has no visible operations',()=>{
  const paths=routes([0,3],[1,3],[2,3,4]);
  const model=verify(paths,view(paths,(source,index,path)=>path.id!=='c'));
  assert.deepEqual(model.blocks[0].pathIds,['a','b','c']);
  assert.deepEqual(model.nodes.find(node=>node.shared).pathIds,['a','b']);
  assert.equal(model.blocks[0].ending,false,'the hidden member continues after the common operation');
});

test('empty views and inputs produce an empty bounded graph',()=>{
  assert.deepEqual(verify([]),{nodes:[],edges:[],blocks:[],hasShared:false,columns:0});
  const paths=routes([0,2],[1,2]);
  assert.deepEqual(verify(paths,view(paths,()=>false)),{nodes:[],edges:[],blocks:[],hasShared:false,columns:0});
});

test('projection is deterministic and does not mutate paths or view data',()=>{
  const paths=routes([0,1,4,5],[0,2,3,4,5]),shown=view(paths,source=>source!==1);
  function freeze(value){if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  const before=JSON.stringify({paths,shown});freeze(paths);freeze(shown);
  const first=graph(paths,shown),second=graph(paths,shown);
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify({paths,shown}),before);
  first.nodes[0].occurrences[0].index=999;
  assert.deepEqual(graph(paths,shown),second,'returned records never alias authored input or later results');
});

test('all four-operation pair orderings round-trip through acyclic projections',()=>{
  function permutations(values){return values.length?values.flatMap((value,index)=>
    permutations(values.filter((_,other)=>index!==other)).map(rest=>[value,...rest])):[[]];}
  const orders=permutations([0,1,2,3]);
  for(const first of orders)for(const second of orders){
    const paths=routes(first,second);
    verify(paths);
    verify(paths,view(paths,source=>source!==1));
  }
});

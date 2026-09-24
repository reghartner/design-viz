const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const context={};vm.createContext(context);
vm.runInContext(readSource('core/paths.js')+'\n'+readSource('viewer/path-timeline.js'),context);
const paths=(...sequences)=>sequences.map((indices,index)=>({id:String(index),indices}));
function layout(routes,shown){
  const graph=context.pathTimelineGraph(routes,shown),rows=context.pathTimelineRows(routes,graph);
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const nodes=graph.nodes.map(node=>({...node,row:node.blockId?rows.shared.get(node.blockId):rows.lanes.get(node.pathIds[0])}));
  for(const node of nodes){
    assert.ok(Number.isFinite(node.row) && node.row>=0,'bounded rows');
    for(const other of nodes){
      if(node.id!==other.id && node.column===other.column)assert.ok(Math.abs(node.row-other.row)>=1,'circles in the same column stay separated');
    }
  }
  const blocks=graph.blocks.map(block=>({...block,row:rows.shared.get(block.id),
    first:Math.min(...block.nodeIds.map(id=>nodeById.get(id).column)),
    last:Math.max(...block.nodeIds.map(id=>nodeById.get(id).column))}));
  for(const block of blocks){
    for(const path of routes){
      if(block.pathIds.includes(path.id))continue;
      const columns=nodes.filter(node=>node.pathIds.includes(path.id)).map(node=>node.column);
      if(columns.length && Math.min(...columns)<=block.last && block.first<=Math.max(...columns))
        assert.ok(Math.abs(block.row-rows.lanes.get(path.id))>=1,'shared tracks never sit on an unrelated passing route');
    }
    for(const other of blocks){
      if(block.id!==other.id && block.first<=other.last && other.first<=block.last)
        assert.ok(Math.abs(block.row-other.row)>=1,'simultaneous shared tracks stay separated');
    }
  }
  return {graph,rows,blocks};
}
test('three converging tracks use the middle route instead of adding a blank row',()=>{
  const result=layout(paths([0,1,9,10],[2,3,4,9,10],[5,6,7,8,9,10]));
  assert.deepEqual([...result.rows.lanes.values()],[0,1,2]);
  assert.deepEqual([...result.rows.shared.values()],[1]);
});
test('a middle join and later rejoin use the gap between their routes',()=>{
  const result=layout(paths([0,1,4,5,6,9],[0,2,3,4,5,7,9],[0,8]));
  assert.deepEqual([...result.rows.shared.values()],[.5,.5]);
});
test('a shared track avoids an unrelated route that continues through its columns',()=>{
  const result=layout(paths([0,1,9,10],[2,3,4,5,6],[7,8,9,10]));
  assert.equal(result.blocks[0].row,0);
});
test('interleaved disjoint groups sharing different operations cannot collide',()=>{
  const result=layout(paths([0,8,9],[1,10,11],[2,10,11],[3,8,9]));
  assert.equal(result.blocks.length,2);
  assert.notEqual(result.blocks[0].row,result.blocks[1].row);
});
test('filtering all inputs keeps the three-way join on an existing row',()=>{
  const routes=paths([0,5,6],[1,2,5,6],[3,4,5,6]);
  const result=layout(routes,routes.map(route=>({...route,indices:[5,6]})));
  assert.deepEqual([...result.rows.shared.values()],[1]);
});
test('empty paths and layouts are bounded and deterministic',()=>{
  const routes=paths([],[]),result=layout(routes);
  assert.deepEqual([...result.rows.lanes.values()],[0,1]);
  assert.equal(result.blocks.length,0);
  assert.deepEqual([...layout([]).rows.lanes.values()],[]);
});

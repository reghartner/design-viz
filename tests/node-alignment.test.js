'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['layout']);
const targets=(...ids)=>ids.map(id=>({kind:'node',section:0,id}));
const spec=()=>({nodes:{row:{},a:{},b:{},c:{}},rows:[['row']],
  floats:[{id:'a',side:'below',x:200,y:180,custom:'keep'},
    {id:'b',side:'above',x:450,y:90,dx:9,dy:4},{id:'c',side:'below',x:850,y:300}],
  edges:[{from:'row',to:'a'}],steps:[{text:'Watch',nodes:['a','b']}]});
const plain=value=>JSON.parse(JSON.stringify(value));

test('alignment uses the first selected center and only changes the floats source range',()=>{
  for(const type of ['horizontal','vertical']){
    const raw={page:{title:'Keep bytes',blocks:[{diagram:spec()}]}},text=JSON.stringify(raw,null,3)+'\n';
    const range=C.jsonLocate(text,['page','blocks',0,'diagram','floats']);
    const plan=C.planTransformFloats(text,raw,targets('b','a'),{type});assert.equal(plan.error,undefined);
    const next=JSON.parse(plan.text).page.blocks[0].diagram;
    assert.equal(next.floats[0][type==='horizontal'?'y':'x'],type==='horizontal'?90:450);
    assert.equal(next.floats[0][type==='horizontal'?'x':'y'],type==='horizontal'?200:180);
    assert.equal(next.floats[0].custom,'keep');assert.equal(next.floats[1].side,'above');
    assert.equal(next.floats[1].dx,undefined);assert.equal(next.floats[1].dy,undefined);
    assert.deepEqual(next.floats[2],raw.page.blocks[0].diagram.floats[2]);
    assert.ok(plan.text.startsWith(text.slice(0,range.start)));assert.ok(plan.text.endsWith(text.slice(range.end)));
    assert.equal(JSON.stringify(raw,null,3)+'\n',text);
  }
});

test('group move resolves automatic floats together and retains row geometry and member spacing',()=>{
  const raw=spec();raw.floats[0]={id:'a',side:'above',dx:20,dy:30};raw.floats[1]={id:'b',side:'below'};
  const L=C.layout(raw),text=JSON.stringify(raw),plan=C.planTransformFloats(text,raw,targets('a','b'),{type:'move',dx:-123.4,dy:50});
  const next=JSON.parse(plan.text),after=C.layout(next);
  for(const id of ['a','b']){
    assert.equal(after.pos[id].cx,Math.round((L.pos[id].cx-123.4)*10)/10);
    assert.equal(after.pos[id].cy,Math.round((L.pos[id].cy+50)*10)/10);
  }
  assert.deepEqual(plain(after.pos.row),plain(L.pos.row));
  assert.deepEqual({...next,floats:raw.floats},raw);
});

test('invalid selections and out of bounds member moves fail atomically; repeated alignment is a no-op',()=>{
  const raw=spec(),text=JSON.stringify(raw);
  for(const selection of [targets('a'),targets('a','a'),targets('row','a'),targets('a','missing'),
    [{kind:'node',section:0,id:'a'},{kind:'node',section:1,id:'b'}]]){
    const plan=C.planTransformFloats(text,raw,selection,{type:'horizontal'});assert.ok(plan.error);assert.equal(plan.text,undefined);
  }
  for(const change of [{type:'move',dx:100000,dy:0},{type:'move',dx:NaN,dy:2},{type:'diagonal'}])
    assert.ok(C.planTransformFloats(text,raw,targets('a','b'),change).error);
  const first=C.planTransformFloats(text,raw,targets('a','b'),{type:'horizontal'});
  assert.ok(C.planTransformFloats(first.text,JSON.parse(first.text),targets('a','b'),{type:'horizontal'}).error);
  assert.equal(JSON.stringify(raw),text);
});

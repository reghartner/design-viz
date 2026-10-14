'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v));
function diagram(){return {nodes:{a:{},b:{},obstacle:{}},rows:[[]],floats:[{id:'a',x:100,y:200},{id:'b',x:600,y:200},{id:'obstacle',x:350,y:200}],edges:[{from:'a',to:'b',curvePoints:[{t:.5,dx:0,dy:-100}]}]};}

test('smooth curves pass through every authored point and stay attached on every orientation',()=>{
  for(const [x,y] of [[600,200],[100,700],[600,700],[100,200]]){
    const d=diagram();d.floats[1].x=x;d.floats[1].y=y;
    for(const side of ['left','right','top','bottom']){
      const e=d.edges[0];e.fromPort={side,offset:.25};e.toPort={side:'left',offset:.75};
      e.curvePoints=[{t:.3,dx:-70,dy:-120},{t:.7,dx:85,dy:100}];
      const L=C.layout(d),anchors=C.edgeCurveAnchors(e,L),segments=C.edgeCurveSegments(e,L);
      assert.equal(segments.length,3);
      anchors.forEach((p,i)=>assert.deepEqual(plain(segments[i][3]),plain(p)));
      assert.deepEqual(plain(segments[0][0]),plain(C.edgePortPoint(L.pos.a,L.pos.b,e.fromPort)));
      assert.deepEqual(plain(segments.at(-1)[3]),plain(C.edgePortPoint(L.pos.b,L.pos.a,e.toPort)));
      assert.ok(!/NaN|Infinity/.test(C.edgePath(e,L)));
      // Adjacent cubic tangents agree at their shared through-point.
      for(let i=1;i<segments.length;i++){
        const p=segments[i][0],left=segments[i-1][2],right=segments[i][1];
        assert.ok(Math.abs((p.x-left.x)*(right.y-p.y)-(p.y-left.y)*(right.x-p.x))<1e-7);
      }
    }
  }
});

test('manual routing clears the three-card fixture, bypasses automatic bows, and expands canvas bounds',()=>{
  const d=diagram(),e=d.edges[0],L=C.layout(d),before=C.edgePath(e,L),adj=C.edgeAutoAdjust(d.edges,L);
  C.resolveEdgeAvoidance(d.edges,L,adj);
  assert.equal(C.edgePath(e,L,adj[0]),before);
  const p=L.pos.obstacle;
  assert.equal(C.countPathRectHits(C.samplePathD(before),[{x:p.cx-p.w/2,y:p.cy-p.h/2,w:p.w,h:p.h}]),0);
  e.curvePoints=[{t:.5,dx:-800,dy:-650},{t:.7,dx:500,dy:900}];
  C.expandPlacedEdgeBounds(d.edges,L,adj);
  for(const q of C.samplePathD(C.edgePath(e,L)))assert.ok(q.x>=L.vb.x && q.x<=L.vb.x+L.vb.w && q.y>=L.vb.y && q.y<=L.vb.y+L.vb.h);
});

test('moving both endpoints translates points and curves; one endpoint carries its share',()=>{
  const d=diagram(),e=d.edges[0],old=C.edgeCurveAnchors(e,C.layout(d))[0];
  d.floats[0].x+=80;d.floats[0].y+=60;d.floats[1].x+=80;d.floats[1].y+=60;
  assert.deepEqual(plain(C.edgeCurveAnchors(e,C.layout(d))[0]),{x:old.x+80,y:old.y+60});
  d.floats[1].x+=100;assert.equal(C.edgeCurveAnchors(e,C.layout(d))[0].x,old.x+130);
});

test('curve planners preserve wrapped source and content, reset legacy bend, and reject malformed points',()=>{
  const raw={page:{title:'Kept',blocks:[{diagram:diagram()}]}},d=raw.page.blocks[0].diagram;
  d.edges[0].bend=50;d.steps=[{edge:'a->b',text:'Keep this'}];
  const text=JSON.stringify(raw,null,2),points=[{t:.5,dx:30,dy:-90}];
  const plan=C.planEdgeCurve(text,raw,0,0,points),next=JSON.parse(plan.text);
  assert.deepEqual(next.page.blocks[0].diagram.edges[0].curvePoints,points);
  assert.equal(next.page.blocks[0].diagram.edges[0].bend,undefined);
  assert.deepEqual(next.page.blocks[0].diagram.steps,d.steps);assert.equal(JSON.stringify(raw,null,2),text);
  const reset=C.planEdgeCurve(plan.text,next,0,0,[]);
  assert.equal(JSON.parse(reset.text).page.blocks[0].diagram.edges[0].curvePoints,undefined);
  for(const value of [{},null,[null],[{t:2,dx:0,dy:0}],[{t:.5,dx:Infinity,dy:0}],Array(33).fill(points[0])])
    assert.ok(C.planEdgeCurve(text,raw,0,0,value).error);
  for(const value of ['bad',[null],[{t:.5,dx:'1',dy:0}]]){
    d.edges[0].curvePoints=value;
    assert.ok(C.validate(C.normalize(raw)).errors.some(s=>s.includes('curvePoints')));
  }
});

test('clear custom edges removes only authored routing geometry across edge, node, and diagram scopes',()=>{
  const manual={from:'a',to:'b',fromPort:{side:'right',offset:.2},toPort:{side:'left'},curvePoints:[{t:.5,dx:20,dy:-30}],
    curveControls:[{t:1/3,dx:1,dy:2},{t:2/3,dx:3,dy:4}],bend:18,fromDx:1,fromDy:2,toDx:3,toDy:4,
    kind:'https',ret:true,label:'kept',labelAt:.4,labelDx:8,labelDy:9,visibility:'dim',delta:true,future:'also kept'};
  const untouched={from:'b',to:'c',kind:'mqtt',labelDx:11},incident={from:'c',to:'a',toPort:{side:'top'},label:'incident'};
  const raw={page:{title:'Exact wrapper',blocks:[{diagram:{nodes:{a:{},b:{},c:{}},rows:[['a','b','c']],edges:[manual,untouched,incident]}}]}};
  const text=' \n'+JSON.stringify(raw,null,3)+'\n ';
  const single=C.planClearCustomEdges(text,raw,{targets:[{kind:'edge',section:0,index:0}]}),edge=JSON.parse(single.text).page.blocks[0].diagram.edges[0];
  for(const key of C.BUILDER_EDGE_ROUTING_FIELDS)assert.equal(edge[key],undefined,key);
  assert.deepEqual(plain(edge),{from:'a',to:'b',kind:'https',ret:true,label:'kept',labelAt:.4,labelDx:8,labelDy:9,visibility:'dim',delta:true,future:'also kept'});
  assert.deepEqual(JSON.parse(single.text).page.blocks[0].diagram.edges[1],untouched);assert.ok(single.text.startsWith(' \n'));assert.ok(single.text.endsWith('\n '));
  const selected=C.planClearCustomEdges(text,raw,{targets:[{kind:'node',section:0,id:'a'},{kind:'edge',section:0,index:1}]});
  const selectedEdges=JSON.parse(selected.text).page.blocks[0].diagram.edges;assert.equal(selected.count,2);
  assert.equal(selectedEdges[0].fromPort,undefined);assert.equal(selectedEdges[2].toPort,undefined);assert.deepEqual(selectedEdges[1],untouched);
  const all=C.planClearCustomEdges(text,raw,{all:true,section:0});assert.equal(all.count,2);
  assert.equal(C.planClearCustomEdges(all.text,JSON.parse(all.text),{all:true,section:0}).noop,true);
  assert.equal(JSON.stringify(raw.page.blocks[0].diagram.edges[0]),JSON.stringify(manual),'planner must not mutate input');
});

test('clear custom edges skips provider-owned edges and reports an unchanged scope as a noop',()=>{
  const raw={nodes:{a:{},b:{},'provider::x':{},'provider::y':{}},rows:[['a','b','provider::x','provider::y']],
    edges:[{from:'a',to:'b',fromPort:{side:'right'}},{from:'provider::x',to:'provider::y',curvePoints:[{t:.5,dx:20,dy:20}]}],
    topologyProvenance:{version:1,imports:[{as:'provider',spec:'p',export:'main',position:{x:0,y:0},nodes:['provider::x','provider::y'],edges:['provider::x->provider::y'],groups:[]}]}};
  const text=JSON.stringify(raw,null,2),imported=C.planClearCustomEdges(text,raw,{targets:[{kind:'edge',section:0,index:1,key:'provider::x->provider::y'}]});
  assert.equal(imported.noop,true);assert.equal(imported.text,undefined);
  const mixed=C.planClearCustomEdges(text,raw,{targets:[{kind:'edge',section:0,index:0,key:'a->b'},{kind:'edge',section:0,index:1,key:'provider::x->provider::y'}]});
  const edges=JSON.parse(mixed.text).edges;assert.equal(mixed.count,1);assert.equal(edges[0].fromPort,undefined);assert.deepEqual(edges[1],raw.edges[1]);
  const all=C.planClearCustomEdges(text,raw,{all:true,section:0});assert.equal(all.count,1);assert.deepEqual(JSON.parse(all.text).edges[1],raw.edges[1]);
});

test('manual curves take precedence over lanes and ports and advertise export compatibility',()=>{
  const d={nodes:{a:{},b:{}},rows:[['a','b']],routing:'lanes',edges:[{from:'a',to:'b',fromPort:{side:'top'},curvePoints:[{t:.5,dx:0,dy:-120}]}]};
  const L=C.layout(d),e=d.edges[0];assert.equal(C.edgePath(e,L,C.laneRoutes(d,L)[0]),C.edgeCurvePath(e,L));
  assert.ok(C.FlowviewCompatibility.detect(d).includes('layout.edge-curves'));
  const old={...C.FlowviewCompatibility.features};delete old['layout.edge-curves'];
  assert.ok(C.FlowviewCompatibility.check(C.FlowviewCompatibility.stamp(d),{version:'0.2.0',contract:'1',features:old}).missingFeatures.includes('layout.edge-curves'));
});

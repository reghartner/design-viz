'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C=vm.createContext({URL,TextEncoder});
for(const source of ['validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/layout.js','workbench/commands/clipboard.js'])vm.runInContext(readSource(source),C);
const plain=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>({nodes:{a:{title:'A'}},rows:[['a']],edges:[]});
test('add/edit/duplicate/copy/paste preserve plain text, style and ordinary node identity',()=>{
  const raw=fixture(),start=JSON.stringify(raw,null,2),add=C.planAddTextBox(start,raw,0);assert.ok(!add.error,add.error);
  const next=JSON.parse(add.text),node=next.nodes[add.id];assert.equal(node.type,'text');assert.equal(next.floats[0].id,add.id);
  const changes={text:'  <script>alert("x")</script>\nSecond line  ',textStyle:{fontFamily:'Lora',fontSize:30,color:'#125678',width:340,height:120,align:'right',bold:true,italic:true,underline:true}};
  const edit=C.planEditTextBox(add.text,next,0,add.id,changes);assert.ok(!edit.error,edit.error);
  const edited=JSON.parse(edit.text);assert.equal(edited.nodes[add.id].text,changes.text);assert.deepEqual(plain(C.validate(C.normalize(edited)).errors),[]);
  const duplicate=C.planDuplicateNode(edit.text,edited,0,add.id);assert.ok(!duplicate.error,duplicate.error);assert.deepEqual(JSON.parse(duplicate.text).nodes[duplicate.id],edited.nodes[add.id]);
  const copied=C.builderClipboardCopy(edited,[{kind:'node',section:0,id:add.id}]);assert.ok(!copied.error,copied.error);
  const paste=C.planPasteBuilderClipboard(edit.text,edited,copied.data,{section:0});assert.ok(!paste.error,paste.error);
  const pasted=JSON.parse(paste.text),diagram=C.builderDiagram(paste.text,pasted,0).d;
  assert.equal(Object.values(diagram.nodes).filter(n=>n.text===changes.text).length,2);
});
test('bounds wrap long words and preserve blank lines without truncating text',()=>{
  const n={type:'text',text:'one\n\n😀'.repeat(8),textStyle:{width:100,height:32,fontSize:20}},d=fixture();d.nodes.note=n;d.floats=[{id:'note',x:200,y:100}];
  const lines=plain(C.textBoxLines(n));assert.ok(lines.includes(''));assert.ok(lines.join('').includes('😀'));
  const p=C.layout(d).pos.note;assert.equal(p.w,100);assert.ok(p.h>32);assert.equal(p.h,lines.length*25+16);
});
test('malformed text/style is rejected and planner fails without publication',()=>{
  for(const patch of [{text:{}},{textStyle:[]},{textStyle:{width:2}},{textStyle:{fontSize:Infinity}},{textStyle:{fontFamily:'x" onload="evil'}},{textStyle:{color:'url(javascript:bad)'}},{textStyle:{align:'justify'}},{textStyle:{bold:'true'}}]){
    const d=fixture();d.nodes.a={type:'text',text:'Hi'};const source=JSON.stringify(d);
    assert.ok(C.planEditTextBox(source,d,0,'a',patch).error,JSON.stringify(patch));
  }
  assert.deepEqual(plain(C.validate(C.normalize(fixture())).errors),[]);
});
test('text budgets reject excess characters, lines and effective height and bound unvalidated layout',()=>{
  const errors=node=>{const result=[];C.validateTextBox(node,'note',result);return result;};
  const node=(text,textStyle)=>({type:'text',text,textStyle});
  assert.equal(errors(node('a'.repeat(12000),{width:2000,fontSize:8})).length,0);
  assert.match(errors(node('a'.repeat(12001),{width:2000,fontSize:8})).join(' '),/12000 characters/);
  assert.equal(errors(node('\n'.repeat(199),{fontSize:8})).length,0);
  assert.match(errors(node('\n'.repeat(200),{fontSize:8})).join(' '),/200 wrapped lines/);
  assert.equal(errors(node('\n'.repeat(38),{fontSize:160})).length,0);
  assert.match(errors(node('\n'.repeat(39),{fontSize:160})).join(' '),/height exceeds 8000/);
  const hostile=node('W'.repeat(100000),{width:48,fontSize:160}),start=performance.now();
  const wrapped=C.textBoxLayout(hostile);assert.ok(performance.now()-start<250,'bounded layout must not scan/shift the full oversized text');
  assert.ok(wrapped.lines.length<=200);assert.ok(wrapped.h<=8000);assert.equal(wrapped.lines.at(-1),'…');assert.equal(C.textBoxDisplayText(hostile).length,12000);
  const raw=fixture();raw.nodes.a=node('okay',{});const text=JSON.stringify(raw);
  const refused=C.planEditTextBox(text,raw,0,'a',{text:hostile.text,textStyle:hostile.textStyle});assert.ok(refused.error);assert.equal(refused.text,undefined);assert.equal(raw.nodes.a.text,'okay');
});
test('linear wrap preserves content and spaces across word and character boundaries',()=>{
  for(const value of ['one two three four five','WWWii MMM a  b','😀😀😀😀\n\nend','  leading and trailing  ']){
    const n={text:value,textStyle:{width:80,fontSize:24}};
    assert.equal(C.textBoxLines(n).join(''),value.replace(/\n/g,''));
  }
});
test('narrow resize measures reflow before anchoring opposite corner or locked center',()=>{
  const n={type:'text',text:'one two three four five six seven eight nine ten',textStyle:{width:280,fontSize:24}},size=C.textBoxSize(n),p={cx:600,cy:200,w:size.w,h:size.h};
  const shrunk=C.textBoxResize(n,p,80,p.h);assert.ok(shrunk.h>p.h);
  assert.equal(shrunk.cx-shrunk.w/2,p.cx-p.w/2);assert.equal(shrunk.cy-shrunk.h/2,p.cy-p.h/2);
  const locked=C.textBoxResize({...n,locked:true},p,80,p.h);assert.equal(locked.cx,p.cx);assert.equal(locked.cy,p.cy);assert.equal(locked.h,shrunk.h);
});
test('blank color edits remove explicit color without mutating caller style',()=>{
  const raw=fixture();raw.nodes.a={type:'text',text:'Theme text',textStyle:{color:'#123456',bold:true}};const text=JSON.stringify(raw);
  for(const color of ['', '  ',null]){
    const style={color,bold:true},plan=C.planEditTextBox(text,raw,0,'a',{textStyle:style});assert.ok(!plan.error,plan.error);
    assert.deepEqual(JSON.parse(plan.text).nodes.a.textStyle,{bold:true});assert.equal(style.color,color);
  }
});

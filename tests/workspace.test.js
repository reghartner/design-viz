const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/workspace.workbench.js'),'utf8'),context);
test('floating preferences migrate the selected tool, reject invalid values, and keep only supported windows',()=>{
  for(const raw of ['no json','null','[]','{"tool":"unknown"}'])assert.equal(context.workspacePrefs(raw).tool,'inspect');
  assert.equal(context.workspacePrefs('{"tool":"agent","editor":800}').tool,'agent');
  const prefs=context.workspacePrefs('{"tool":"steps","windows":{"steps":{"x":200,"y":100,"w":400,"h":500,"open":true},"evil":{"open":true},"file":null}}');
  assert.deepEqual(JSON.parse(JSON.stringify(prefs)),{tool:'steps',windows:{steps:{x:200,y:100,w:400,h:500,open:true}}});
});
test('offscreen or oversized saved panels stay reachable after a smaller viewport',()=>{
  const r=context.workspacePanelRect({x:1600,y:1000,w:700,h:900},800,600);
  assert.ok(r.x>=12);assert.ok(r.y>=72);assert.ok(r.x+r.w<=788);assert.ok(r.y+r.h<=588);
  const narrow=context.workspacePanelRect({x:-1000,y:-1000,w:-20,h:-30},375,700);
  assert.equal(narrow.x,12);assert.equal(narrow.y,72);assert.equal(narrow.w,300);assert.equal(narrow.h,240);
});
test('missing and nonfinite geometry uses usable defaults without rewriting source data',()=>{
  const original={x:Infinity,y:NaN,w:NaN,h:Infinity};
  const r=context.workspacePanelRect(original,1400,1000);
  assert.equal(r.w,380);assert.equal(r.h,640);assert.equal(r.x,84);assert.equal(r.y,84);
  assert.equal(original.x,Infinity);assert.ok(Number.isNaN(original.y));
});

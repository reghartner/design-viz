const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['vocabulary']);
const d=()=>({nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',future:7}],steps:[{id:'go',text:'Go'}]});
test('creation wraps bare diagrams and assigns vocabulary in one source plan',()=>{
 const raw=d(),text=JSON.stringify(raw),plan=C.planVocabulary(text,raw,{kind:'edge',section:0,index:0},'protocols','event-stream',{label:'Events',color:'#abcdef'},true);
 assert.equal(plan.error,undefined);const edited=JSON.parse(plan.text);
 assert.deepEqual(edited.page.protocols,{'event-stream':{label:'Events',color:'#abcdef'}});
 assert.equal(edited.page.sections[0].diagram.edges[0].kind,'event-stream');assert.equal(edited.page.sections[0].diagram.edges[0].future,7);
 assert.equal(raw.edges[0].kind,undefined);
});
test('display-name edits keep IDs, advanced palettes and unrelated definitions',()=>{
 const raw={page:{protocols:{custom:{label:'Before',color:{aurora:'#123456',daylight:'#abcdef'},future:9}},sections:[{diagram:d()}]}};
 const plan=C.planVocabulary(JSON.stringify(raw),raw,null,'protocols','custom',{label:'After'},false),out=JSON.parse(plan.text);
 assert.deepEqual(out.page.protocols.custom,{...raw.page.protocols.custom,label:'After'});
 const builtin=C.planVocabulary(plan.text,out,null,'protocols','ws',{label:'Socket'},false);
 assert.deepEqual(JSON.parse(builtin.text).page.protocols.ws.color,JSON.parse(JSON.stringify(C.BUILTIN_PROTOCOLS.ws.color)));
});
test('lane creation addresses a step in a tabbed document and preserves its story',()=>{
 const raw={blocks:[{tabs:[{label:'First',sections:[{diagram:d()}]},{label:'Second',sections:[{diagram:d()}]}]}]};
 const plan=C.planVocabulary(JSON.stringify(raw),raw,{kind:'step',section:1,index:0},'lanes','device-cloud',{label:'Device cloud',color:'#123'},true),out=JSON.parse(plan.text);
 assert.equal(out.blocks[0].tabs[1].sections[0].diagram.steps[0].lane,'device-cloud');
 assert.deepEqual(out.blocks[0].tabs[0],raw.blocks[0].tabs[0]);
});
test('invalid, reserved, duplicate and stale creations fail without mutation',()=>{
 const raw={sections:[{diagram:d()}]},text=JSON.stringify(raw),target={kind:'edge',section:0,index:0};
 for(const [id,changes,t] of [['ws',{label:'Duplicate',color:'#123'},target],['constructor',{label:'Bad',color:'#123'},target],['new',{label:'',color:'#123'},target],['new',{label:'New',color:'red'},target],['new',{label:'New',color:'#123'},{...target,index:8}]])
  assert.ok(C.planVocabulary(text,raw,t,'protocols',id,changes,true).error);
 assert.equal(JSON.stringify(raw),text);
});

test('a creation form cannot attach a definition to a reordered source item',()=>{
 const raw=d();raw.edges.push({from:'b',to:'a',label:'Return'});
 const expected=JSON.stringify(raw.edges[0]);raw.edges.reverse();const text=JSON.stringify(raw);
 const result=C.planVocabulary(text,raw,{kind:'edge',section:0,index:0},'protocols','events',{label:'Events',color:'#abc'},true,expected);
 assert.match(result.error,/selected item changed/);assert.equal(JSON.stringify(raw),text);
});

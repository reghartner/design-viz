const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {readSource}=require('../tools/source-loader.cjs');
const C=vm.createContext({});
for(const name of ['validator.js','engine.js','builder.workbench.js','compatibility.js'])vm.runInContext(readSource(name),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=()=>({page:{sections:[{diagram:{nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'first',nodes:['a']},{id:'second',edge:'a->b',color:'#ABC'},{id:'last',nodes:['b']}]}}]}});
const diagram=s=>s.page.sections[0].diagram;

test('step colors accept opaque hex only, canonicalize short hex, and leave default markers untouched',()=>{
 assert.equal(C.stepCircleColor({color:'#AbC'}),'#aabbcc');assert.equal(C.stepCircleColor({color:'#123456'}),'#123456');
 for(const color of [undefined,null,'','red','#1234','#12345','#12345678',true,{},'#fff; background:url(https://bad.test)', 'var(--acc)'])assert.equal(C.stepCircleColor({color}),null);
 const untouched={};C.applyStepCircleColor(untouched,{});assert.deepEqual(untouched,{});
 const props={},classes=[],el={classList:{add:x=>classes.push(x)},style:{setProperty:(k,v)=>props[k]=v}};
 C.applyStepCircleColor(el,{color:'#fff'});assert.deepEqual(classes,['step-colored']);assert.deepEqual(props,{'--step-color':'#ffffff','--step-ink':'#000000'});
});
test('black or white numbers meet WCAG normal-text contrast for arbitrary opaque colors',()=>{
 function luminance(c){const rgb=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
 for(let n=0;n<=0xffffff;n+=7919){const color='#'+n.toString(16).padStart(6,'0'),ink=C.stepCircleInk(color),l=luminance(color);assert.ok(['#000000','#ffffff'].includes(ink));assert.ok((ink==='#000000'?(l+.05)/.05:1.05/(l+.05))>=4.5,color);}
});
test('validation reports the exact bad color while normalized specs retain source colors and no carry-forward',()=>{
 const raw=spec(),before=JSON.stringify(raw),d=diagram(raw);
 assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});assert.equal(JSON.stringify(raw),before);
 assert.equal(C.stepCircleColor(d.steps[0]),null);assert.equal(C.stepCircleColor(d.steps[1]),'#aabbcc');assert.equal(C.stepCircleColor(d.steps[2]),null);
 d.steps[1].color='url(https://bad.test)';const out=C.validate(C.normalize(raw));assert.deepEqual(plain(out.errors),[]);assert.match(out.warnings.join('\n'),/steps\[1\]\.color: use #RGB or #RRGGBB/);
 d.steps[1].color=null;assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
});
test('shared source steps keep color across paths while copies can be independently recolored',()=>{
 const raw=spec(),d=diagram(raw);d.steps.push({id:'fail',nodes:['b'],color:'#fb923c'});
 d.paths=[{id:'happy',steps:['first','second','last']},{id:'fail',steps:['first','second','fail']}];
 const normal=C.diagramForPath(d,'happy'),failed=C.diagramForPath(d,'fail');assert.equal(C.stepCircleColor(normal.steps[1]),'#aabbcc');assert.equal(C.stepCircleColor(failed.steps[1]),'#aabbcc');assert.equal(C.stepCircleColor(failed.steps[2]),'#fb923c');
 const noPaths=spec(),plan=C.planDuplicateStep(JSON.stringify(noPaths),noPaths,0,1);assert.ok(!plan.error,plan.error);
 const duplicated=diagram(JSON.parse(plan.text));assert.equal(duplicated.steps[2].color,'#ABC');duplicated.steps[2].color='#000';assert.equal(duplicated.steps[1].color,'#ABC');
});
test('export compatibility identifies authored marker colors without requiring a new capability for old specs',()=>{
 const raw=spec();assert.ok(C.FlowviewCompatibility.detect(raw).includes('flow.step-colors'));
 const stamped=C.FlowviewCompatibility.stamp(raw),older={...C.FlowviewCompatibility.features};delete older['flow.step-colors'];
 assert.deepEqual(plain(C.FlowviewCompatibility.check(stamped,{features:older,version:C.FlowviewCompatibility.version,contract:'1'}).missingFeatures),['flow.step-colors']);
 delete diagram(raw).steps[1].color;assert.ok(!C.FlowviewCompatibility.detect(raw).includes('flow.step-colors'));
});
test('the single-flow phase example validates without alternate paths',()=>{
 const raw=JSON.parse(fs.readFileSync(__dirname+'/../examples/step-colors/step-colors.spec.json','utf8'));
 assert.equal(diagram(raw).paths,undefined);assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
});

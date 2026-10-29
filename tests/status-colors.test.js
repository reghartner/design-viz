const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
function setup(){const c=vm.createContext({});vm.runInContext(fs.readFileSync('src/viewer/status-colors.js','utf8'),c);return c.FlowStatusColors;}
test('palettes reject unknown fields, malformed colors and unsupported versions atomically',()=>{
 const c=setup();
 for(const value of [null,[],{version:2,colors:{}},{version:1,colors:[]},{version:1,colors:{'live-active':'red'}},{version:1,colors:{'comm-break':'#123456'}},{version:1,colors:{'live-active':'#123456'},extra:1},JSON.parse('{"version":1,"colors":{"__proto__":"#123456"}}')])assert.throws(()=>c.validate(value));
 assert.equal(JSON.stringify(c.validate({version:1,colors:{'live-active':'#ABCDEF'}})),'{"version":1,"colors":{"live-active":"#abcdef"}}');
});
test('scoped subscriptions load, update and clear overrides, and retire cleanly',()=>{
 const c=setup(),saved=new Map(),events=new Map(),styles=[new Map(),new Map()];
 const win={localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},CustomEvent:class{constructor(type){this.type=type;}},addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);},removeEventListener(type,fn){events.get(type).delete(fn);},dispatchEvent(e){events.get(e.type)?.forEach(fn=>fn(e));}};
 const view=index=>({ownerDocument:{defaultView:win},style:{setProperty:(k,v)=>styles[index].set(k,v),removeProperty:k=>styles[index].delete(k)}});
 let calls=0;const off1=c.connect(view(0),()=>calls++),off2=c.connect(view(1),()=>calls++);
 c.save(win,{version:1,colors:{'live-blocked':'#123456'}});assert.equal(styles[0].get('--dv-live-blocked'),'#123456');assert.equal(styles[1].get('--dv-live-blocked'),'#123456');
 off1();const before=calls;c.save(win,{version:1,colors:{}});assert.equal(calls,before+1);assert.equal(saved.size,0);assert.equal(styles[1].size,0);
 saved.set(c.key,'not json');win.dispatchEvent({type:'storage',key:c.key});assert.equal(styles[1].size,0);
 off2();assert.equal([...events.values()].reduce((n,v)=>n+v.size,0),0);
 win.localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>c.save(win,{version:1,colors:{'live-todo':'#112233'}}),/quota/);
});
test('all viewer assemblies and dedicated editor use the palette owner once',()=>{
 for(const name of ['standalone','workbench','native','forge','status-colors'])assert.equal(entrypoint(name).body.split('var FlowStatusColors=').length,2,name);
 assert.match(entrypoint('status-colors').source,/Palette imported as a preview/);
});

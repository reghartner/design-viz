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

test('version 2 appearance validates bounds, normalizes colors and rejects whole invalid palettes',()=>{
 const c=setup();
 const appearance={'live-active':{borderColor:'#ABCDEF',borderWidth:0,fillStrength:100,glowStrength:200}};
 assert.deepEqual(JSON.parse(JSON.stringify(c.validate({version:2,colors:{},appearance}))),{version:2,colors:{},appearance:{'live-active':{borderColor:'#abcdef',borderWidth:0,fillStrength:100,glowStrength:200}}});
 for(const values of [{borderColor:'red'},{borderWidth:-1},{borderWidth:8.1},{borderWidth:'2'},{fillStrength:101},{fillStrength:NaN},{glowStrength:201},{glowStrength:Infinity},{radius:4},JSON.parse('{"__proto__":1}')])assert.throws(()=>c.validate({version:2,colors:{'live-active':'#123456'},appearance:{'live-active':values}}));
 for(const appearance of [null,[],{'pr-open':{borderWidth:2}},{'comm-break':{borderColor:'#000000'}},JSON.parse('{"__proto__":{}}')])assert.throws(()=>c.validate({version:2,colors:{},appearance}));
 assert.throws(()=>c.validate({version:1,colors:{},appearance:{}}));
});
test('appearance-only saves, legacy reads and resetting remove every scoped override',()=>{
 const c=setup(),saved=new Map(),styles=new Map(),events=[];
 const win={localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},CustomEvent:class{constructor(type){this.type=type;}},dispatchEvent:e=>events.push(e)};
 const legacy='{"version":1,"colors":{"live-active":"#ABCDEF"}}';saved.set(c.key,legacy);
 assert.equal(c.read(win).colors['live-active'],'#abcdef');assert.equal(saved.get(c.key),legacy,'load never rewrites saved JSON');
 const v2={version:2,colors:{},appearance:{'live-active':{borderColor:'#123456',borderWidth:4.5,fillStrength:80,glowStrength:0}}};
 c.save(win,v2);assert.equal(JSON.parse(saved.get(c.key)).version,2);
 const view={style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}};c.apply(view,c.read(win));
 assert.deepEqual(Object.fromEntries(styles),{'--dv-live-active-border-color':'#123456','--dv-live-active-border-width':'4.5px','--dv-live-active-fill-strength':'80%','--dv-live-active-glow-strength':'0'});
 c.apply(view,{version:1,colors:{}});assert.equal(styles.size,0);
 c.save(win,{version:2,colors:{},appearance:{'live-active':{}}});assert.equal(saved.size,0);
});


test('Testing and Unchanged support appearance in v2 while legacy palettes keep every existing field',()=>{
 const c=setup(),styles=new Map(),view={style:{setProperty:(key,value)=>styles.set(key,value),removeProperty:key=>styles.delete(key)}};
 const legacy={version:1,colors:{'live-unchanged':'#010203','pr-open':'#040506','checks-passing':'#070809'}};
 assert.deepEqual(JSON.parse(JSON.stringify(c.validate(legacy))),legacy);
 const palette={version:2,colors:{...legacy.colors,'live-testing':'#ABCDEF'},appearance:{'live-testing':{borderColor:'#123456',borderWidth:3,fillStrength:45,glowStrength:80},'live-unchanged':{borderWidth:2}}};
 c.apply(view,palette);assert.equal(styles.get('--dv-live-testing'),'#abcdef');assert.equal(styles.get('--dv-live-testing-border-width'),'3px');assert.equal(styles.get('--dv-live-testing-fill-strength'),'45%');assert.equal(styles.get('--dv-live-testing-glow-strength'),'0.8');assert.equal(styles.get('--dv-live-unchanged-border-width'),'2px');
 assert.equal(c.group('live-testing'),'status');assert.equal(c.group('live-unchanged'),'status');assert.equal(c.group('pr-open'),'pr');assert.equal(c.group('checks-passing'),'checks');
 c.apply(view,legacy);assert.equal(styles.has('--dv-live-testing'),false);assert.equal(styles.has('--dv-live-testing-border-width'),false);assert.equal(styles.has('--dv-live-unchanged-border-width'),false);
 c.apply(view,{version:1,colors:{}});assert.equal(styles.size,0);
});

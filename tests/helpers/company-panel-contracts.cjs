'use strict';
// One discovery/sample owner for the Node and Chromium contracts. Always assemble
// through the checkout's own loader so fork helpers, icons and types are present.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');
const clone=value=>JSON.parse(JSON.stringify(value));
function walk(dir){return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]):[];}
function message(entry,rule,tip){return `[${entry.type} | ${entry.source}] ${rule}. Fix: ${tip}`;}
function load(root=ROOT){
 const loader=require(path.join(root,'tools/source-loader.cjs')),context={URL,TextEncoder};
 for(const key of ['document','window','fetch','setTimeout','setInterval','requestAnimationFrame'])Object.defineProperty(context,key,{get(){throw Error('Panel registration must be DOM-free and must not start timers/network: '+key);}});
 const source=loader.readSource('validator.js');
 try{vm.runInNewContext(source,context,{filename:'assembled-validator.js',timeout:10000});}
 catch(error){
  const line=Number(String(error.stack).match(/assembled-validator\.js:(\d+)/)?.[1]);
  const marker=source.split('\n').slice(0,line).join('\n').match(/\/\* ---- ([^\n]+?) ---- \*\//g)?.at(-1);
  throw new Error('Panel registration failed in '+(marker||'assembled validator')+': '+error.message+'. Fix: keep registration DOM-free, deterministic and free of timers/network; create resources in mounted.',{cause:error});
 }
 const entries=loader.sourceFiles('validator.js').filter(file=>file.startsWith('@company/panels/types/')).map(file=>{
  const type=path.basename(file,'.js'),definition=context.PanelRegistry.get(type),entry={type,source:file.replace('@company/','company/')};
  assert.ok(definition,message(entry,'registration','register the file basename with PanelRegistry.define'));
  return {...entry,definition,samples:[]};
 });
 const examples=walk(path.join(root,'company/examples')).filter(file=>file.endsWith('.spec.json')).map(file=>({file:path.relative(root,file),raw:JSON.parse(fs.readFileSync(file,'utf8'))}));
 for(const entry of entries){
  const template=entry.definition.authoring?.template;
  if(template && typeof template==='object' && !Array.isArray(template)){
  const panel={...clone(template),id:'contract-panel',type:entry.type};
  entry.samples.push({name:'authoring.template',diagram:{nodes:{anchor:{title:'Anchor'}},rows:[['anchor']],panels:[panel],steps:[{id:'ready',text:'Panel contract'}]},panelId:panel.id});
  }
  for(const example of examples){
   let index=0;
   function visit(value){
    if(!value || typeof value!=='object')return;
    if(Array.isArray(value.panels)){
     for(const panel of value.panels)if(panel.type===entry.type)entry.samples.push({name:example.file+' #'+(++index),diagram:clone(value),panelId:panel.id});
    }
    Object.values(value).forEach(visit);
   }
   visit(example.raw);
  }
  assert.ok(entry.samples.length,message(entry,'authoring sample','provide authoring.template or a matching company/examples/**/*.spec.json declaration with useful initial state'));
 }
 return {context,entries};
}
function check(entry,context){
 const check=(value,rule,tip)=>assert.ok(value,message(entry,rule,tip)),definition=entry.definition;
 check(typeof definition.render==='function','renderer','supply a render function');
 const sizing=definition.layout?.canvasSizing;
 if(sizing){
  check(['fixed-aspect','content-fit'].includes(sizing.mode),'canvasSizing.mode','choose fixed-aspect or content-fit');
  check(sizing.resizeAxis===undefined || sizing.resizeAxis==='width','canvasSizing.resizeAxis','omit resizeAxis or use width; movement still needs both axes');
  if(sizing.mode==='fixed-aspect')check(Number.isFinite(sizing.aspect)&&sizing.aspect>0,'canvasSizing.aspect','supply a positive finite width / height ratio');
  if(sizing.maxHeight!==undefined)check(Number.isFinite(sizing.maxHeight)&&sizing.maxHeight>0,'canvasSizing.maxHeight','supply a positive finite cap (the runtime clamps to its 72px canvas minimum)');
 }
 for(const sample of entry.samples){
  const diagram=clone(sample.diagram),before=JSON.stringify(diagram);
  const validate=()=>clone(context.validate(context.normalize(diagram)));
  const result=validate();assert.deepEqual(result.errors,[],message(entry,sample.name+' validates','repair the template/example declaration: '+result.errors.join('; ')));
  assert.deepEqual(validate(),result,message(entry,'deterministic validation','avoid shared mutable validation context, clocks and random values'));
  assert.equal(JSON.stringify(diagram),before,message(entry,'nonmutating validation','validate caller-owned input without assigning to it'));
  for(const steps of [diagram.steps||[],[]]){
   const input={...clone(diagram),steps:clone(steps)},snapshot=JSON.stringify(input),fold=()=>clone(context.foldPanelStates(input)[sample.panelId]);
   const states=fold();check(Array.isArray(states)&&states.length===Math.max(1,steps.length),'fold snapshot count','return one snapshot per step, or one initial snapshot for an empty story');
   assert.deepEqual(fold(),states,message(entry,'deterministic fold','compute absolute snapshots from inputs only'));
   assert.equal(JSON.stringify(input),snapshot,message(entry,'nonmutating fold','clone values before changing them'));
  }
 }
 return entry;
}
function browserSpec(entry,sample,placement='floating'){
 const diagram=clone(sample.diagram),panel=diagram.panels.find(p=>p.id===sample.panelId);
 // Keep example context/references and patches, but give the target an unlocked,
 // visible controlled allocation. The harness measures the first authored state.
 delete panel.locked;delete panel.hidden;
 const items=[{x:0,y:0,w:12,h:8},{panel:panel.id,x:12,y:0,w:12,h:14},{controls:'steps',x:0,y:14,w:24,h:4},...diagram.panels.filter(p=>p!==panel).map(p=>({panel:p.id,x:0,y:18,w:12,h:8,hidden:true}))];
 Object.assign(diagram,{view:'step',autoplay:false,defaultLayout:'standard',layouts:[
  {id:'standard',name:'Standard',presentation:'standard',sectionLayout:{columns:24,default:items}},
  {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{columns:24,default:items},exploreLayout:{panelPlacement:placement,panels:[{panel:panel.id,x:.25,y:.2,w:.4,h:.4,stacked:false}],canvas:{panels:[{panel:panel.id,x:400,y:120,w:360,h:280}]}}}
 ]});
 return {page:{title:'Company panel contract',sections:[{id:'contract',heading:'Contract',diagram}]}};
}
module.exports={ROOT,load,check,browserSpec,message,clone};

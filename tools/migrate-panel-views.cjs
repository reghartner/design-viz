#!/usr/bin/env node
'use strict';
/* Offline only: never imported by a reader, editor or runtime bundle. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {readSource}=require('./source-loader.cjs'),core=require('./canon/core.cjs');
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
function declaresTopology(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return false;
  if(own(raw,'topologyImports') || own(raw,'topologyExports'))return true;
  return core.sections(raw).some(s=>s.diagram && typeof s.diagram==='object' && (own(s.diagram,'topologyImports') || own(s.diagram,'topologyExports')));
}
// Validation sees imported topology resolved from the authored providers; the migrated spec keeps its declarations.
function resolved(document,providers){
  if(!providers.length && !declaresTopology(document))return document;
  return core.materializeTopology(JSON.parse(JSON.stringify([document,...providers])))[0];
}
function context(legacy){
  const c=vm.createContext({URL});
  for(const name of ['validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/layout.js'])vm.runInContext(readSource(name),c);
  if(legacy)vm.runInContext(fs.readFileSync(path.join(__dirname,'migrations/panel-focus-legacy.js'),'utf8'),c);
  return c;
}
function migrate(input,options={}){
  const modern=context(false),old=context(true),raw=JSON.parse(JSON.stringify(input)),providers=options.providers || [],changes=[],links=[];
  old.legacyFocusTypes=['homemap','data-contract',...(options.focusTypes || [])];
  const bare=!!(raw && raw.nodes && raw.rows),document=bare?{sections:[{diagram:raw}]}:raw;
  const page=old.normalize(document),owners=old.tabViewOwners(page);
  const initial=modern.validate(modern.normalize(resolved(document,providers)));
  const errors=initial.errors.filter(e=>!e.endsWith('.layout: name an arrangement belonging to this section'));
  if(errors.length)throw new Error('Invalid input: '+errors.join('; '));
  const snapshots=owners.map(owner=>({owner,views:old.tabViewDefinitions(owner)}));
  snapshots.forEach(s=>{s.opening=old.tabViewDefault(s.owner,s.views);});
  const used=new Set(old.sectionRecords(page).map(r=>r.section.id).filter(Boolean));
  function identity(rec){if(!rec.section.id){let id='section-'+rec.number;while(used.has(id))id+='-copy';rec.section.id=id;used.add(id);}return rec.section.id;}
  for(const {owner,views,opening} of snapshots){
    let changed=false;
    for(const rec of owner.records){
      const d=rec.section.diagram;if(!d)continue;
      const focus=old.diagramFocusPanel(d),refs=(owner.source.views || []).flatMap(v=>v.sections || []).filter(m=>m && typeof m==='object' && m.section===rec.section.id).map(m=>m.layout);
      const implicit=!Array.isArray(d.layouts) && !!focus;
      const missing=refs.filter(id=>['home','flow'].includes(id) && !(d.layouts || []).some(v=>v.id===id));
      if(implicit || missing.length){
        const copy=JSON.parse(JSON.stringify(d));delete copy.layouts;delete copy.defaultLayout;
        const result=old.builderPromoteSectionViews(copy,null);if(result.error)throw new Error(result.error);
        if(missing.includes('home') && !copy.layouts.some(v=>v.id==='home'))throw new Error('Section '+rec.number+' references Home without a legacy focus panel; author that arrangement explicitly.');
        if(Array.isArray(d.layouts)){
          for(const layout of copy.layouts)if(missing.includes(layout.id))d.layouts.push(layout);
        }else{
          d.layouts=copy.layouts;d.defaultLayout=copy.defaultLayout;
          if(d.sectionLayout)for(const view of owner.source.views || [])for(const member of view.sections || []){
            if(member && typeof member==='object' && member.section===rec.section.id && ['layout','default'].includes(member.layout)){
              links.push({owner:owner.path,view:view.id,section:rec.section.id,from:member.layout,to:'flow'});member.layout='flow';
            }
          }
          delete d.sectionLayout;delete d.layoutName;
        }
        changes.push('Section '+rec.number+': materialized '+(implicit?d.layouts.map(v=>v.id):missing).join(', ')+' arrangements');changed=true;
      }
      if(Object.prototype.hasOwnProperty.call(d,'primaryPanel')){delete d.primaryPanel;changes.push('Section '+rec.number+': removed primaryPanel');}
    }
    if(changed && views.length && !owner.source.views){
      owner.source.views=views.map(view=>({id:view.id,name:view.name.slice(0,80),presentation:view.presentation,sections:view.members.map(member=>{
        const ref={section:identity(member.record)};if(member.layout)ref.layout=member.layout;return ref;
      })}));
      owner.source.defaultView=opening.id;
      changes.push(owner.path+': authored '+views.length+' Views; opening '+opening.id);
    }
    if(changed)for(const view of views){
      links.push({owner:owner.path,kind:'view-id',from:view.id,to:view.id,layouts:view.members.map(m=>m.layout).filter(Boolean)});
      if(view.legacyLayout)links.push({owner:owner.path,section:view.members[0].record.section.id,kind:'fragment-view',from:view.legacyLayout,to:view.id});
    }
  }
  const output=bare && changes.length?document:bare?raw:document;
  const result=modern.validate(modern.normalize(resolved(output,providers)));if(result.errors.length)throw new Error('Migration refused: '+result.errors.join('; '));
  return {spec:JSON.parse(JSON.stringify(output)),report:{changed:changes.length>0,changes,links,warnings:result.warnings}};
}
function main(args){
  let file,output,check=false,focusTypes=[],providerFiles=[];
  for(let i=0;i<args.length;i++){
    if(args[i]==='--output')output=args[++i];else if(args[i]==='--check')check=true;
    else if(args[i]==='--focus-type')focusTypes.push(args[++i]);
    else if(args[i]==='--provider')providerFiles.push(args[++i]);
    else if(args[i].startsWith('-') || file)throw new Error('Usage: node tools/migrate-panel-views.cjs INPUT.json (--check | --output NEW.json) [--focus-type TYPE] [--provider PROVIDER.json ...]');else file=args[i];
  }
  if(!file || check===!!output || focusTypes.some(t=>!t) || providerFiles.some(f=>!f))throw new Error('Provide INPUT.json and exactly one of --check or --output NEW.json.');
  for(const f of [file,...providerFiles])if(fs.statSync(f).size>16*1024*1024)throw new Error(f+' exceeds the 16 MiB migration limit.');
  const providers=providerFiles.map(f=>JSON.parse(fs.readFileSync(f,'utf8')));
  const result=migrate(JSON.parse(fs.readFileSync(file,'utf8')),{focusTypes,providers});
  // Exclusive creation rejects existing files, symlinks and the source path.
  if(output)fs.writeFileSync(output,JSON.stringify(result.spec,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result.report,null,2));
}
module.exports={migrate};
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}

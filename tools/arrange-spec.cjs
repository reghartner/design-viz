#!/usr/bin/env node
'use strict';
// One transactional authoring operation: production graph arrangement followed
// by native measured panel/control composition. No source writes until all pass.
const fs=require('node:fs');
const graph=require('./auto-arrange-spec.cjs');
const core=require('./canon/core.cjs');
const {clone,stable}=require('./arrange/model.cjs');
const HELP='Usage: node tools/arrange-spec.cjs [--section INDEX ... | --all] [--width 800..1920] [--profile default|backstage|confluence] [--rearrange] input.json output.json\n'+
 'Arranges nodes, panels and step controls; existing geometry requires --rearrange.\n'+
 'Input is preserved. Output refreshes system-owned compatibility metadata; bare diagrams become a page wrapper with the same diagram content. Failures write nothing.\n'+
 'One-time setup: node tools/arrange/setup.cjs\nSee docs/auto-arrange.md for supported inputs and measurement limits.\n';
function parseArgs(args){
 const rest=[],options={width:1200,profile:'default',rearrange:false};
 for(let i=0;i<args.length;i++){
  const a=args[i];if(a==='--rearrange'){options.rearrange=true;continue;}
  if(['--width','--profile'].includes(a)){const value=args[++i];if(value==null)throw Error(a+' requires a value');options[a.slice(2)]=a==='--width'?Number(value):value;continue;}rest.push(a);
 }
 try{Object.assign(options,graph.parseArgs(rest));}catch(e){throw Error(e.message.replace('auto-arrange-spec.cjs','arrange-spec.cjs'));}
 if(!Number.isInteger(options.width)||options.width<800||options.width>1920)throw Error('--width must be an integer from 800 to 1920 pixels');
 if(!['default','backstage','confluence'].includes(options.profile))throw Error('--profile must be default, backstage, or confluence');
 return options;
}
function select(raw,sections){
 const all=graph.diagramRecords(raw);if(!all.length)throw Error('Input contains no diagrams');
 if(sections==='all')return all;
 if(sections?.length)return sections.map(i=>{const r=all.find(r=>r.section===i);if(!r)throw Error('Section '+i+' does not contain a diagram');return r;});
 if(all.length!==1)throw Error('Multiple diagrams: pass --section INDEX for each new diagram, or --all only when all are new');return all;
}
function preflight(d,options){
 if(d.layouts?.length||d.exploreLayout||d.presentation==='explore')throw Error('Unsupported: named views or Explore on the selected diagram; preserve it and arrange a new Standard diagram instead');
 // Match the geometry replaced by autoArrangeDiagram, including explicit zero,
 // false or empty markers. New floats only need id/side; edge semantics remain
 // allowed without opting into destruction of authored routing or label nudges.
 const owns=(value,keys)=>value&&keys.some(key=>Object.prototype.hasOwnProperty.call(value,key));
 const authoredGeometry=owns(d,['graphFrame','sectionLayout','routing'])||(d.rows||[]).some(r=>r.length)||
  (d.floats||[]).some(f=>owns(f,['x','y','dx','dy','noSpread']))||
  (d.edges||[]).some(e=>owns(e,['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy','labelAt']));
 if(!options.rearrange&&authoredGeometry)throw Error('Selected diagram already has geometry; preserve existing edits, or pass --rearrange for an explicitly requested rearrangement');
 const section=d.sectionLayout;
 if(section&&(typeof section!=='object'||Array.isArray(section)||section.columns!=null&&![12,24].includes(section.columns)))throw Error('Unsupported: malformed sectionLayout or columns marker; expected an object with columns 12 or 24');
 if(section&&['default','backstage','confluence'].some(k=>section[k]!=null&&!Array.isArray(section[k])))throw Error('Unsupported: arrangement profiles must be arrays');
 if(section&&section.columns!==24&&['default','backstage','confluence'].some(k=>k!==options.profile&&section[k]))throw Error('Unsupported: legacy 12-column sibling profiles; migrate them in Workbench before explicit rearrangement');
 const tiles=section?.[options.profile]||section?.default||[];
 if(tiles.some(t=>t.controls&&t.attachTo))throw Error('Unsupported: explicitly attached controls; preserve this diagram or detach them in Workbench before rearranging');
 if((d.steps||[]).length>100||(d.paths||[]).length>20||(d.panels||[]).length>24)throw Error('Unsupported: native measurement limit is 100 steps, 20 paths, and 24 panels per diagram');
 return tiles;
}
function seed(d,originalTiles){
 const byKey=new Map(originalTiles.map(t=>[t.panel?'panel:'+t.panel:t.controls?'steps':'diagram',t]));
 let y=0;
 const tile=(kind,key)=>{const previous=byKey.get(key);if(previous?.hidden)return clone(previous);const t={...previous,...kind,x:0,y,w:24,h:8};delete t.attachTo;y+=8;return t;};
 const tiles=[tile({},'diagram'),...(d.panels||[]).map(p=>tile({panel:p.id},'panel:'+p.id)),tile({controls:'steps'},'steps')];
 if(!Object.keys(d.nodes||{}).length)tiles[0].hidden=true;
 return {...clone(d),panels:clone(d.panels||[]),sectionLayout:{columns:24,default:tiles}};
}
async function arrange(raw,options){
 const verdict=core.validateSpec(raw);if(verdict.errors.length)throw Error('Invalid input: '+verdict.errors.join('\n'));
 const metadataIssues=core.compatibility.metadataWarnings(raw);if(metadataIssues.length)throw Error('Invalid compatibility metadata: '+metadataIssues.join('; '));
 const original=clone(raw),selected=select(original,options.sections);
 for(const r of selected){try{preflight(r.diagram,options);}catch(e){throw Error(r.path+': '+e.message);}}
 const graphIds=selected.filter(r=>Object.keys(r.diagram.nodes||{}).length).map(r=>r.section);
 const output=graphIds.length?(await graph.arrangeSpec(original,graphIds)).raw:clone(original);
 const {createMeasurer}=require('./arrange/measure.cjs'),measurer=await createMeasurer(options.width),diagnostics=[];
 try{
  const originals=new Map(selected.map(r=>[r.section,r.diagram]));
  for(const record of select(output,options.sections)){
   try{
    const before=originals.get(record.section),layoutBefore=before.sectionLayout;
    const skin=(raw.page||raw).skin||'pastel';
    const work={diagram:seed(record.diagram,preflight(before,options))};
    const result=await measurer.arrange(work,skin);
    if(result.spec.diagram.graphFrame!==undefined)record.diagram.graphFrame=clone(result.spec.diagram.graphFrame);
    record.diagram.sectionLayout={...clone(layoutBefore||{}),columns:24,[options.profile]:result.spec.diagram.sectionLayout.default};
    // Measurement works on a separate diagram; arbitrary semantic fields,
    // unselected profiles and panel/step declaration order cannot be rewritten.
    const expected=clone(record.diagram);delete expected.sectionLayout;
    const measured=clone(result.spec.diagram);delete measured.sectionLayout;
    if(before.panels===undefined)delete measured.panels;
    if(stable(expected)!==stable(measured))throw Error('Native arrangement changed diagram semantics');
    diagnostics.push({section:record.section,profile:options.profile,width:options.width,...result.diagnostics});
   }catch(e){throw Error(record.path+': '+e.message);}
  }
 }finally{await measurer.close();}
 const stamped=core.compatibility.stamp(output),final=core.validateSpec(stamped);if(final.errors.length)throw Error('Arranged spec invalid: '+final.errors.join('\n'));
 return {raw:stamped,diagnostics};
}
async function main(args){if(args.length===1&&args[0]==='--help'){process.stdout.write(HELP);return;}const options=parseArgs(args),files=graph.distinctPaths(options.input,options.output),raw=JSON.parse(fs.readFileSync(files.source,'utf8'));const result=await arrange(raw,options);graph.atomicWrite(files.target,JSON.stringify(result.raw,null,2)+'\n');process.stdout.write(JSON.stringify({output:files.target,diagrams:result.diagnostics},null,2)+'\n');}
module.exports={parseArgs,select,preflight,seed,arrange};
if(require.main===module)main(process.argv.slice(2)).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});

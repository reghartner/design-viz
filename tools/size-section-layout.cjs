#!/usr/bin/env node
'use strict';
// Authoring helper: size each diagram section's step controls and diagram from
// their own content (src/core/container-size.js) and print a sectionLayout.
// Sections with panels, named views or Explore are reported, never rewritten:
// use compose-page-layout.cjs or Workbench for those.
const fs=require('node:fs');
const core=require('./arrange/core.cjs');
const {diagramRecords,atomicWrite,distinctPaths}=require('./auto-arrange-spec.cjs');
const S=core.containerSize;
const HELP='Usage: node tools/size-section-layout.cjs [--width 800..1920] [--write output.json] input.json\n'+
 'Sizes step controls and the diagram of every diagram section from their content and prints a sectionLayout for each.\n'+
 'Side by side when the step controls\' minimum width plus the diagram\'s readable width (10px labels) fit in 24 columns:\n'+
 '  step controls on the left get the columns the diagram does not need at its natural width (12px labels), from their minimum up to 14 of 24;\n'+
 '  diagram on the right gets the rest, never below its readable width. One shared height.\n'+
 'Otherwise the section is reported and keeps its compose-page-layout.cjs layout.\n'+ '--write saves a copy of the input with those sectionLayouts applied; the input is never modified. Sizes are estimates.\n';

const CONTROLS_MAX_COLUMNS=14;

function parseArgs(args){
 const options={width:1200,write:null,input:null};
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--help'||a==='-h'){options.help=true;continue;}
  if(a==='--width'||a==='--write'){const value=args[++i];if(value==null)throw Error(a+' requires a value');options[a.slice(2)]=a==='--width'?Number(value):value;continue;}
  if(options.input)throw Error('Only one input file');options.input=a;
 }
 if(!options.help&&!options.input)throw Error('Missing input.json');
 if(!Number.isInteger(options.width)||options.width<800||options.width>1920)throw Error('--width must be an integer from 800 to 1920 pixels');
 return options;
}
function controlsFor(d,widthPx){const s=S.stepControls(d,widthPx);return {rows:s.rows,unsupported:s.unsupported,maxLines:s.maxLines,maxPathSteps:s.maxPathSteps,pathCount:s.pathCount};}
function sizeSection(d,grid){
 const px=w=>w*grid.pitch-8,skip=reason=>({skipped:reason});
 if((d.panels||[]).length)return skip('has panels; run compose-page-layout.cjs (it sizes step controls and the diagram with the same math)');
 if(d.layouts?.length||d.exploreLayout||d.presentation==='explore')return skip('has named views or Explore; size it in Workbench');
 if(!Object.keys(d.nodes||{}).length)return skip('has no nodes');
 if(!(d.steps||[]).length)return skip('has no steps');
 const bounds=S.diagramBounds(d),cols=px=>Math.ceil((px+8)/grid.pitch),notes=[];
 const sized=S.diagram(d,px(24),grid.scale,bounds),controlsMin=cols(S.stepControlsMinWidth(d)),readable=cols(sized.readableWidth),natural=cols(sized.naturalWidth);
 const widths={controlsMinimum:controlsMin,diagramReadable:readable,diagramNatural:natural};
 // Longer stories or wide diagrams keep the composer's layout (step controls
 // above the diagram, sized with the same math).
 if(controlsMin+readable>24)return {skipped:'step controls need '+controlsMin+' columns and the readable diagram '+readable+' (more than 24); keep the compose-page-layout.cjs layout',widths,notes};
 // Step controls get what the diagram does not need at its natural size, at
 // least their minimum and at most CONTROLS_MAX_COLUMNS, so a small diagram
 // still keeps 40% or more of the section; the diagram never drops below readable.
 const cw=Math.min(24-readable,Math.max(controlsMin,Math.min(CONTROLS_MAX_COLUMNS,24-natural))),dw=24-cw,controls=controlsFor(d,px(cw)),diagram=S.diagram(d,px(dw),grid.scale,bounds);
 const h=Math.min(40,Math.max(controls.rows,diagram.rows));
 if(Math.max(controls.rows,diagram.rows)>40)notes.push('content needs more than 40 rows; the taller container scrolls');
 return {arrangement:'side-by-side',reason:'step controls need '+controlsMin+' columns and the readable diagram '+readable+' (natural '+natural+')',widths,
  controls:{w:cw,rows:controls.rows,maxCaptionLines:controls.maxLines},diagram:{w:dw,rows:diagram.rows,labelPx:+diagram.labelPx.toFixed(1)},notes,
  sectionLayout:{columns:24,default:[{controls:'steps',x:0,y:0,w:cw,h},{x:cw,y:0,w:dw,h}]}};
}
function sizeSpec(raw,width){
 const verdict=core.validateSpec(raw);if(verdict.errors.length)throw Error('Invalid input:\n'+verdict.errors.map(m=>'- '+m).join('\n'));
 const grid=S.grid(width),output=JSON.parse(JSON.stringify(raw));
 const results=diagramRecords(output).map(r=>{let result;try{result=sizeSection(r.diagram,grid);}catch(e){result={skipped:'could not size this diagram on its own ('+e.message+'); size it in Workbench'};}if(result.sectionLayout)r.diagram.sectionLayout=result.sectionLayout;return {section:r.section,path:r.path,...result};});
 if(!results.length)throw Error('Input contains no diagrams');
 return {results,output};
}
function main(argv){
 const options=parseArgs(argv);if(options.help){process.stdout.write(HELP);return;}
 if(options.write)distinctPaths(options.input,options.write);
 const {results,output}=sizeSpec(JSON.parse(fs.readFileSync(options.input,'utf8')),options.width);
 if(options.write){const verdict=core.validateSpec(output);if(verdict.errors.length)throw Error('Sized output is invalid:\n'+verdict.errors.join('\n'));atomicWrite(options.write,JSON.stringify(output,null,2)+'\n');}
 process.stdout.write(JSON.stringify({width:options.width,written:options.write||null,sections:results},null,2)+'\n');
}
module.exports={sizeSection,sizeSpec,parseArgs};
if(require.main===module){try{main(process.argv.slice(2));}catch(e){process.stderr.write(e.message+'\n'+HELP);process.exitCode=1;}}

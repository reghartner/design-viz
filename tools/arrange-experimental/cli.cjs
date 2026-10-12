#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {arrangeSpec}=require('./index.cjs');
// Resolve existing symlinks and compare inode identity as well as path spelling.
// For a new destination, its existing parent still has to resolve: this catches
// two not-yet-created files addressed through different directory symlinks.
function fileTarget(value, depth=0) {
  if (!value) throw new Error('File paths must not be empty');
  if (depth>40) throw new Error('Too many symbolic links in file path');
  const absolute=path.resolve(value);
  try {
    const real=fs.realpathSync.native(absolute);
    return {path:real,stat:fs.statSync(real,{bigint:true})};
  } catch (error) {
    if (error.code!=='ENOENT') throw error;
  }
  let entry;
  try { entry=fs.lstatSync(absolute); }
  catch (error) { if (error.code!=='ENOENT') throw error; }
  // A dangling leaf symlink can alias another destination that is also new.
  if (entry?.isSymbolicLink()) {
    return fileTarget(path.resolve(path.dirname(absolute),fs.readlinkSync(absolute)),depth+1);
  }
  return {path:path.join(fs.realpathSync.native(path.dirname(absolute)),path.basename(absolute)),stat:null};
}
function distinctTargets(input,output,report) {
  const entries=[['input',input],['output',output]];
  if (report!==undefined) entries.push(['report',report]);
  const targets=entries.map(([role,value])=>({role,...fileTarget(value)}));
  for (let i=0;i<targets.length;i++) for (let j=0;j<i;j++) {
    const a=targets[i],b=targets[j];
    const sameFile=a.stat&&b.stat&&a.stat.dev===b.stat.dev&&a.stat.ino===b.stat.ino;
    // An absent file has no inode to compare. Conservatively reject spelling
    // variants that can collapse on case-insensitive/normalizing filesystems.
    const spellingAlias=(!a.stat||!b.stat)&&path.dirname(a.path)===path.dirname(b.path)&&
      path.basename(a.path).normalize('NFC').toLowerCase()===path.basename(b.path).normalize('NFC').toLowerCase();
    if (a.path===b.path||sameFile||spellingAlias) throw new Error(`File path collision: ${a.role} and ${b.role} must be distinct files`);
  }
  return targets.map(target=>target.path);
}
function main(args){
  if(args.includes('--help')||!args.length){process.stdout.write('Usage: node tools/arrange-experimental/cli.cjs INPUT.json OUTPUT.json [--report REPORT.json] [--seed N] [--restarts N] [--iterations N]\n');return;}
  const [input,output,...flags]=args;if(!input||!output||input.startsWith('--')||output.startsWith('--'))throw new Error('Expected input and output paths');
  let report;const options={};
  for(let i=0;i<flags.length;i+=2){const flag=flags[i],value=flags[i+1];if(value===undefined)throw new Error(`Missing value for ${flag}`);if(flag==='--report')report=value;else if(['--seed','--restarts','--iterations'].includes(flag))options[flag.slice(2)]=Number(value);else throw new Error(`Unknown flag: ${flag}`);}
  const [inputPath,outputPath,reportPath]=distinctTargets(input,output,report);
  const result=arrangeSpec(JSON.parse(fs.readFileSync(inputPath,'utf8')),options);
  fs.writeFileSync(outputPath,JSON.stringify(result.spec,null,2)+'\n');
  if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(result.reports,null,2)+'\n');
  process.stderr.write(JSON.stringify(result.reports)+'\n');
}
if(require.main===module){try{main(process.argv.slice(2));}catch(error){process.stderr.write(`arrange-experimental: ${error.message}\n`);process.exitCode=1;}}
module.exports={main};

#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {arrangeSpec}=require('./index.cjs');
const [inputDirectory,outputDirectory]=process.argv.slice(2);
if(!inputDirectory||!outputDirectory){console.error('Usage: node tools/arrange-experimental/benchmark.cjs INPUT_DIRECTORY OUTPUT_DIRECTORY');process.exit(1);}
fs.mkdirSync(outputDirectory,{recursive:true});
const reports=[];
for(const file of fs.readdirSync(inputDirectory).filter(f=>f.endsWith('.spec.json')).sort()){
  const result=arrangeSpec(JSON.parse(fs.readFileSync(path.join(inputDirectory,file),'utf8')));
  fs.writeFileSync(path.join(outputDirectory,file),JSON.stringify(result.spec,null,2)+'\n');
  reports.push({file,reports:result.reports});console.log(JSON.stringify(reports[reports.length-1]));
}
fs.writeFileSync(path.join(outputDirectory,'benchmark.json'),JSON.stringify({nodeVersion:process.version,platform:process.platform,arch:process.arch,reports},null,2)+'\n');

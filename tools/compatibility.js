#!/usr/bin/env node
'use strict';
// Stamp agent-authored specs without modifying the input file; redirect stdout
// to a DIFFERENT output file. Checks report structured compatibility details.
const fs=require('node:fs');
const C=require('./canon/core.cjs').compatibility;
const args=process.argv.slice(2),stamp=args[0]==='--stamp';
if(args.length!==(stamp?2:1)){
  console.error('usage: node tools/compatibility.js [--stamp] input.spec.json');process.exitCode=2;
}else{
  try{
    const raw=JSON.parse(fs.readFileSync(args[stamp?1:0],'utf8'));
    if(stamp && C.metadataWarnings(raw).length)throw new Error(C.metadataWarnings(raw).join('\n'));
    const result=stamp?C.stamp(raw):C.check(raw);
    console.log(JSON.stringify(result,null,2));
    if(!stamp && result.messages.length)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}

#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const core=require('./arrange/core.cjs');
function check(raw,expectations){return core.viewerRouting().visibilityEvidence(raw,expectations);}
module.exports={check};
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length!==2 || args.includes('--help')){
    process.stderr.write('Usage: node tools/visibility-check.cjs SPEC.json EXPECTATIONS.json\nSee docs/visibility-evidence.md. Checks eligibility, not rendered pixels.\n');process.exitCode=args.includes('--help')?0:2;
  }else try{
    const report=check(JSON.parse(fs.readFileSync(args[0],'utf8')),JSON.parse(fs.readFileSync(args[1],'utf8')));
    process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exitCode=report.ok?0:1;
  }catch(error){process.stderr.write('visibility-check: '+error.message+'\n');process.exitCode=2;}
}

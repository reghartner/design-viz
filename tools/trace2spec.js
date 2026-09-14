#!/usr/bin/env node
'use strict';
/* Same pure converter as the workbench; stdout is spec JSON, diagnostics
   go to stderr so an agent can pipe directly into the normal build loop. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const args = process.argv.slice(2), opts = {};
const usage = 'Usage: node tools/trace2spec.js events.json [-o out.spec.json] [--trace-id ID] [--source-url URL] [--title TITLE] [--fields mapping.json] [--root-span ID | --service NAME] [--preview]';
if (!args.length || args.includes('--help')){
  console.log(usage); process.exit(args.length ? 0 : 2);
}
try {
  const input = args.shift();
  let output, preview=false;
  while (args.length){
    const key = args.shift();
    if (key==='--preview'){ preview=true; continue; }
    const value = args.shift();
    if (!value || !['-o','--trace-id','--source-url','--title','--fields','--root-span','--service'].includes(key)) throw new Error(usage);
    if (key === '-o') output = value;
    if (key === '--trace-id') opts.traceId = value;
    if (key === '--source-url') opts.sourceUrl = value;
    if (key === '--title') opts.title = value;
    if (key === '--fields') opts.fields = JSON.parse(fs.readFileSync(value, 'utf8'));
    if (key === '--root-span') opts.rootSpanId=value;
    if (key === '--service') opts.service=value;
  }
  const sandbox = {URL};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/trace-import.js'), 'utf8'), sandbox);
  const text=fs.readFileSync(input,'utf8');
  if (preview){
    if (output) throw new Error('--preview writes a summary to stdout; omit -o so an existing spec cannot be overwritten with preview data.');
    const p=sandbox.tracePreview(text,opts);
    process.stdout.write(JSON.stringify({source:p.sourceStats,selection:p.stats,focus:p.focus,canBuild:p.canBuild,blocked:p.blocked,warnings:p.warnings},null,2)+'\n');
    process.exit(0);
  }
  const result = sandbox.traceToSpec(text, opts);
  const spec = JSON.stringify(result.spec, null, 2) + '\n';
  if (output) fs.writeFileSync(output, spec); else process.stdout.write(spec);
  result.warnings.forEach(w => console.error('warn: ' + w));
  console.error('TRACE IMPORT OK: ' + result.stats.spans + ' spans, ' + result.stats.services + ' services, ' + result.stats.elapsedMs + ' ms');
} catch (ex){ console.error('TRACE IMPORT ERROR: ' + ex.message); process.exitCode = 1; }

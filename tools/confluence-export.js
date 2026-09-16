#!/usr/bin/env node
'use strict';
/* Same manual JSON handoff as the workbench buttons. No network or credentials. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const args = process.argv.slice(2);
if (!(args.length === 1 || (args.length === 3 && args[1] === '-o'))){
  console.error('Usage: node tools/confluence-export.js spec.json [-o diagram.confluence.json]'); process.exit(2);
}
try {
  const core = {TextEncoder,URL}; vm.createContext(core);
  for (const file of ['canon.js','validator.js','confluence.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),core);
  const result = core.buildConfluenceExport(fs.readFileSync(args[0],'utf8'));
  if (result.error) throw new Error(result.error);
  if (args[2]) fs.writeFileSync(args[2],result.text);
  else process.stdout.write(result.text);
} catch (ex){ console.error('Confluence export: '+ex.message); process.exitCode=1; }

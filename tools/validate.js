#!/usr/bin/env node
'use strict';
/* validate.js — flowspec validator + lint CLI.

   Usage: node tools/validate.js [--quiet] <spec.json> [<spec.json> ...]

   Prints errors, warnings, and lint findings with field paths, one per line,
   prefixed by the file name. Exit 1 when any file has errors (or fails to
   parse), 0 otherwise. --quiet prints only errors and the per-file summary.

   This closes the authoring loop for spec-emitting agents: emit JSON, run
   this, fix what it names — no browser involved. It loads the same
   src/validator.js + src/engine.js the pages ship with, so CLI results and
   in-page results cannot drift. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadCore(){
  const code =
    fs.readFileSync(path.join(ROOT, 'src', 'validator.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8') + '\n' +
    ';__exports = {normalize, validate, lintPage};';
  const sandbox = {console};
  vm.runInNewContext(code, sandbox);
  return sandbox.__exports;
}

function main(argv){
  const args = argv.slice(2);
  const quiet = args.includes('--quiet');
  const files = args.filter(a => a !== '--quiet');
  if (!files.length){
    console.error('usage: node tools/validate.js [--quiet] <spec.json> [<spec.json> ...]');
    return 2;
  }
  const C = loadCore();
  let anyErrors = false;

  for (const file of files){
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (ex){
      console.log(file + ': ERROR JSON parse: ' + ex.message);
      console.log(file + ': 1 errors, 0 warnings');
      anyErrors = true;
      continue;
    }
    const page = C.normalize(raw);
    const v = C.validate(page);
    const lint = v.errors.length ? [] : C.lintPage(page);
    for (const e of v.errors) console.log(file + ': ERROR ' + e);
    if (!quiet){
      for (const w of v.warnings) console.log(file + ': warn  ' + w);
      for (const w of lint) console.log(file + ': lint  ' + w);
    }
    console.log(file + ': ' + v.errors.length + ' errors, ' +
                (v.warnings.length + lint.length) + ' warnings');
    if (v.errors.length) anyErrors = true;
  }
  return anyErrors ? 1 : 0;
}

process.exit(main(process.argv));

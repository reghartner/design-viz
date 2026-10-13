#!/usr/bin/env node
'use strict';
const core = require('./canon/core.cjs');
/* validate.js — flowspec validator + lint CLI.

   Usage: node tools/validate.js [--quiet] <spec.json> [<spec.json> ...]

   Prints errors, warnings, and lint findings with field paths, one per line,
   prefixed by the file name. Exit 1 when any file has errors (or fails to
   parse), 0 otherwise. --quiet prints only errors and the per-file summary.

   This closes the authoring loop for spec-emitting agents: emit JSON, run
   this, fix what it names — no browser involved. It loads the same
   validator bundle (including pure geometry) the pages ship with, so CLI
   results and in-page results cannot drift. No DOM renderer is loaded. */

const fs = require('fs');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function hasTopologyDeclarations(raw){
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (own(raw, 'topologyImports') || own(raw, 'topologyExports')) return true;
  return core.sections(raw).some(section => {
    const diagram = section.diagram;
    return diagram && typeof diagram === 'object' &&
      (own(diagram, 'topologyImports') || own(diagram, 'topologyExports'));
  });
}

function topologyDiagnosticFile(entries, error){
  const message = error && error.message ? error.message : String(error);
  const matched = entries.find(entry => {
    const canon = entry.raw && entry.raw.page && entry.raw.page.canon;
    return canon && typeof canon.id === 'string' && message.startsWith('Topology ' + canon.id);
  });
  return (matched || entries.find(entry => hasTopologyDeclarations(entry.raw)) || entries[0]).file;
}

function main(argv){
  const args = argv.slice(2);
  const quiet = args.includes('--quiet');
  const files = args.filter(a => a !== '--quiet');
  if (!files.length){
    console.error('usage: node tools/validate.js [--quiet] <spec.json> [<spec.json> ...]');
    return 2;
  }
  const C = core.viewerRouting();
  let anyErrors = false;
  const entries = [];

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
    entries.push({file, raw});
  }

  let resolved = entries.map(entry => entry.raw);
  if (entries.some(entry => hasTopologyDeclarations(entry.raw))){
    try {
      resolved = core.materializeTopology(resolved);
    } catch (error){
      const file = topologyDiagnosticFile(entries, error);
      const message = error && error.message ? error.message : String(error);
      console.log(file + ': ERROR ' + message);
      console.log(file + ': 1 errors, 0 warnings');
      return 1;
    }
  }

  entries.forEach((entry, index) => {
    const file = entry.file, raw = resolved[index];
    const page = C.normalize(raw);
    const v = core.validateSpec(raw);
    for (const message of core.compatibility.check(raw).messages)
      if (!quiet) console.log(file + ': compatibility: ' + message);
    const lint = v.errors.length ? [] : C.lintPage(page);
    for (const e of v.errors) console.log(file + ': ERROR ' + e);
    if (!quiet){
      for (const w of v.warnings) console.log(file + ': warn  ' + w);
      for (const w of lint) console.log(file + ': lint  ' + w);
    }
    console.log(file + ': ' + v.errors.length + ' errors, ' +
                (v.warnings.length + lint.length) + ' warnings');
    if (v.errors.length) anyErrors = true;
  });
  return anyErrors ? 1 : 0;
}

process.exit(main(process.argv));

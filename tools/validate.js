#!/usr/bin/env node
'use strict';
const core = require('./canon/core.cjs');
/* validate.js — flowspec validator + lint CLI.

   Usage: node tools/validate.js [--quiet] [--resolve-imports <folder-or-registry>] <spec.json> [<spec.json> ...]

   Prints errors, warnings, and lint findings with field paths, one per line,
   prefixed by the file name. Exit 1 when any file has errors (or fails to
   parse), 0 otherwise. --quiet prints only errors and the per-file summary.

   This closes the authoring loop for spec-emitting agents: emit JSON, run
   this, fix what it names — no browser involved. It loads the same
   validator bundle (including pure geometry) the pages ship with, so CLI
   results and in-page results cannot drift. No DOM renderer is loaded.

   In a connected folder the bundled copy (<.flowview-agent>/authoring/tools/
   validate.js) resolves imports against the Workbench's provider copy,
   providers.json, two folders above this file, as of the state.json revision it
   prints (#878). Positional files win over copied providers; --resolve-imports
   turns the copy off. Any other location keeps the files-passed-together rule. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

// A provider missing from the files passed together: name both ways to load it.
// --resolve-imports keeps its own message, which names the registry it searched.
const MISSING_PROVIDER = /^Topology .+: missing spec ./;
const MISSING_PROVIDER_REMEDY = '. To load providers, pass --resolve-imports <repository folder or registry>, ' +
  'or in a connected folder run folder-agent.py refresh-sources --source-repo <repository>.';
// Connected-folder copy mode (#878).
const COPY_REMEDY = '. The Workbench provider copy (providers.json) does not hold it; run ' +
  'folder-agent.py refresh-sources --source-repo <repository>, then validate again.';
// refresh-sources loads only the current draft's closure, so the copy cannot hold
// a provider that only the candidate imports (the Workbench acquires it at review).
const NEW_IMPORT_REMEDY = id => '. ' + id + ' is new in this candidate: the current draft does not import it, ' +
  'so the Workbench provider copy cannot hold it yet. The Workbench loads it when it reviews your proposal; ' +
  'to check it now, pass --resolve-imports <repository folder or registry>.';
const OUT_OF_DATE = 'The Workbench provider copy (providers.json) is out of date: it is not the copy ' +
  'the current state.json names. Retry once the Workbench has finished updating, or reconnect.';
const NOT_CONNECTED = 'The Workbench is not connected to this folder: editor.json is disconnected or ' +
  'names another session. Reconnect the Workbench, then retry.';
const HEARTBEAT_PAUSED = 'The Workbench heartbeat is temporarily paused. Bring the existing Workbench tab ' +
  'to the front and retry; do not reconnect just for a stale heartbeat.';
const MISSING_COPY = 'The Workbench provider copy (providers.json) that state.json names is missing, so it is ' +
  'out of date. Retry once the Workbench has finished updating, or reconnect.';
const OVERSIZE = 'The Workbench provider set is too large to copy into this folder. Validate it with ' +
  '--resolve-imports <repository folder or registry> instead.';
const HEARTBEAT_MAX_AGE_MS = 15000; // tools/folder-agent.py HEARTBEAT_MAX_AGE_MS

// The session folder of a bundled kit: <session>/authoring/tools/validate.js.
function bundledSession(){
  const tools = __dirname, authoring = path.dirname(tools);
  return path.basename(tools) === 'tools' && path.basename(authoring) === 'authoring' ? path.dirname(authoring) : null;
}
function readJson(file){
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error){ return undefined; }
}
// The copy is used only while it is whole, named by state.json and the connection
// is live (the folder helper's connected_editor() and heartbeat_fresh() rule).
// Copy mode starts in a connected folder (state.json exists) when providers.json
// exists or state.json names one; otherwise the plain rule applies.
function providerCopy(session){
  if (!session || !fs.existsSync(path.join(session, 'state.json'))) return null;
  const present = fs.existsSync(path.join(session, 'providers.json')), state = readJson(path.join(session, 'state.json'));
  if (!present && !(isObject(state) && typeof state.providersSha256 === 'string')) return null;
  const copy = present ? readJson(path.join(session, 'providers.json')) : undefined;
  const editor = readJson(path.join(session, 'editor.json'));
  if (!isObject(state) || typeof state.sessionId !== 'string' || typeof state.connectionId !== 'string') return {error: OUT_OF_DATE};
  if (!isObject(editor) || editor.connected !== true || editor.sessionId !== state.sessionId ||
      editor.connectionId !== state.connectionId) return {error: NOT_CONNECTED};
  const age = Date.now() - editor.at;
  if (typeof editor.at !== 'number' || !Number.isFinite(editor.at) || !(age >= 0 && age <= HEARTBEAT_MAX_AGE_MS)) return {error: HEARTBEAT_PAUSED};
  if (!present) return {error: MISSING_COPY};
  if (!isObject(copy) || copy.version !== 1 || typeof copy.providersSha256 !== 'string' ||
      state.providersSha256 !== copy.providersSha256) return {error: OUT_OF_DATE};
  if (copy.oversize === true) return {error: OVERSIZE};
  // Hash the stored payloadText bytes as-is, then parse; never re-serialize.
  if (typeof copy.payloadText !== 'string' ||
      crypto.createHash('sha256').update(copy.payloadText, 'utf8').digest('hex') !== copy.providersSha256) return {error: OUT_OF_DATE};
  let payload;
  try { payload = JSON.parse(copy.payloadText); } catch (error){ return {error: OUT_OF_DATE}; }
  if (!isObject(payload) || !Array.isArray(payload.specs)) return {error: OUT_OF_DATE};
  return {payload, revision: state.revision, draft: state.source};
}

// Provider IDs the current draft (state.json source) imports, followed through the
// copied specs; null when the draft cannot be read.
function draftClosure(source, specs){
  let raw;
  try { raw = typeof source === 'string' ? JSON.parse(source) : null; } catch (error){ return null; }
  const draft = identified(raw, 'workbench-draft');
  if (!draft) return null;
  const byId = new Map(specs.map(spec => [canonId(spec), spec])), seen = new Set(), pending = [draft.spec];
  try {
    while (pending.length){
      for (const id of core.topologyDependencies(pending.pop())){
        if (seen.has(id)) continue;
        seen.add(id);
        if (byId.has(id)) pending.push(byId.get(id));
      }
    }
  } catch (error){ return null; }
  return seen;
}
// In copy mode a missing provider the current draft already imports means the copy
// is stale or incomplete (refresh-sources); one only the candidate imports is new.
function copyRemedy(copy, message){
  const missing = /: missing spec (.+)$/.exec(message), closure = missing && draftClosure(copy.draft, copy.payload.specs);
  return missing && closure && !closure.has(missing[1]) ? NEW_IMPORT_REMEDY(missing[1]) : COPY_REMEDY;
}

function canonId(raw){
  const canon = isObject(raw) && isObject(raw.page) ? raw.page.canon : null;
  return isObject(canon) && typeof canon.id === 'string' && canon.id ? canon.id : null;
}
// Specs in a canon.json repository carry no page.canon. Validation gives such a
// spec a temporary identity (the copy's consumerId, else workbench-draft as the
// Workbench and local-imports.mjs do) and removes it from the resolved result.
function identified(raw, id){
  if (!isObject(raw)) return null;
  const canon = {version: 1, id, kind: 'design', owner: 'group:default/workbench-draft'};
  const authored = page => { const value = Object.assign({}, page); if (own(page, 'canon')) delete value.canon; return value; };
  const restore = (page, original) => { const value = Object.assign({}, page); if (own(original, 'canon')) value.canon = original.canon; else delete value.canon; return value; };
  if (isObject(raw.page))
    return {spec: Object.assign({}, raw, {page: Object.assign(authored(raw.page), {canon})}), restore: spec => Object.assign({}, spec, {page: restore(spec.page, raw.page)})};
  if (['nodes', 'rows', 'topologyImports', 'topologyExports'].some(key => own(raw, key)))
    return {spec: {page: {sections: [{diagram: raw}], canon}}, restore: spec => spec.page.sections[0].diagram};
  return {spec: {page: Object.assign(authored(raw), {canon})}, restore: spec => restore(spec.page, raw)};
}

function hasTopologyDeclarations(raw){
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (own(raw, 'topologyImports') || own(raw, 'topologyExports') || own(raw, 'stepExports')) return true;
  return core.sections(raw).some(section => {
    const diagram = section.diagram;
    return diagram && typeof diagram === 'object' &&
      (own(diagram, 'topologyImports') || own(diagram, 'topologyExports') || own(diagram, 'stepExports'));
  });
}

function topologyDiagnosticFile(entries, error){
  const message = error && error.message ? error.message : String(error);
  const matched = entries.find(entry => typeof entry.id === 'string' &&
    (message.startsWith('Topology ' + entry.id + ' ') || message.startsWith('Topology ' + entry.id + ':')));
  return (matched || entries.find(entry => hasTopologyDeclarations(entry.raw)) || entries[0]).file;
}

async function main(argv){
  const args = argv.slice(2);
  const quiet = args.includes('--quiet');
  const files = [];let resolveImports=null;
  for(let index=0;index<args.length;index++){
    if(args[index]==='--quiet')continue;
    if(args[index]==='--resolve-imports'){
      resolveImports=args[++index];
      if(!resolveImports || resolveImports.startsWith('--')){console.error('--resolve-imports requires a repository folder or registry JSON');return 2;}
    }else if(args[index].startsWith('--')){console.error('Unknown option: '+args[index]);return 2;}
    else files.push(args[index]);
  }
  if (!files.length){
    console.error('usage: node tools/validate.js [--quiet] [--resolve-imports <folder-or-registry>] <spec.json> [<spec.json> ...]');
    return 2;
  }
  const C = core.viewerRouting();
  let anyErrors = false;
  const entries = [];

  for (const file of files){
    let raw;
    try {
      raw = resolveImports ? (await (await import('./canon/local-imports.mjs')).resolveLocalImports(file,resolveImports)).resolved : JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (ex){
      console.log(file + (resolveImports ? ': ERROR ' : ': ERROR JSON parse: ') + ex.message);
      console.log(file + ': 1 errors, 0 warnings');
      anyErrors = true;
      continue;
    }
    entries.push({file, raw});
  }

  let resolved = entries.map(entry => entry.raw);
  const topology = entries.filter(entry => hasTopologyDeclarations(entry.raw));
  if (!resolveImports && topology.length){
    const copy = providerCopy(bundledSession());
    if (copy && copy.error){
      for (const entry of topology){
        console.log(entry.file + ': ERROR ' + copy.error);
        console.log(entry.file + ': 1 errors, 0 warnings');
      }
      return 1;
    }
    if (copy) console.log('Workbench providers: state.json revision ' + copy.revision +
      ' (providers.json). Propose with --revision ' + copy.revision + '.');
    // Positional files win; the copy supplies only identities they do not.
    const used = new Set(entries.map(entry => canonId(entry.raw)).filter(Boolean));
    const supplied = copy ? copy.payload.specs.filter(spec => canonId(spec) && !used.has(canonId(spec))) : [];
    supplied.forEach(spec => used.add(canonId(spec)));
    let preferred = copy && typeof copy.payload.consumerId === 'string' && copy.payload.consumerId ? copy.payload.consumerId : null, suffix = 2;
    const nextId = () => {
      let id = preferred && !used.has(preferred) ? preferred : 'workbench-draft';
      preferred = null;
      while (used.has(id)) id = 'workbench-draft-' + suffix++;
      used.add(id);
      return id;
    };
    const batch = entries.map(entry => {
      entry.id = canonId(entry.raw);
      if (entry.id) return entry.raw;
      const identity = identified(entry.raw, entry.id = nextId());
      entry.restore = identity && identity.restore;
      return identity ? identity.spec : entry.raw;
    });
    try {
      resolved = core.materializeTopology(batch.concat(supplied)).slice(0, entries.length)
        .map((spec, index) => entries[index].restore ? entries[index].restore(spec) : spec);
    } catch (error){
      const file = topologyDiagnosticFile(entries, error);
      const message = error && error.message ? error.message : String(error);
      console.log(file + ': ERROR ' + message + (MISSING_PROVIDER.test(message) ? (copy ? copyRemedy(copy, message) : MISSING_PROVIDER_REMEDY) : ''));
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

main(process.argv).then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.message);process.exitCode=1;});

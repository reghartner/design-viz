#!/usr/bin/env node
'use strict';
/* Print the text view of a Flowview spec (#1322): the same model and renderers
   the reader's Text window uses (src/core/text-view.js), loaded from src/ with
   the reader's own canon, topology and tracking sources. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const loader = require('./source-loader.cjs');

const USAGE = 'usage: node tools/spec-text.js <spec.json> [--format flat|steps|elements] [--queries names|full] [--path <id>] [--resolve-imports <folder-or-registry> | --no-resolve-imports] [--strict-imports]';
const HELP = USAGE + `

Prints a read-only text view of a spec to stdout.
  --format flat      one fact per line, sorted and stable (default); suits git diff textconv
  --format steps     markdown, one block per step of the selected path in each diagram
  --format elements  markdown, an index table and one sheet per node and edge
  --queries names    steps format: signal names, sources and units only (default)
  --queries full     steps format: every query field as well
  --path <id>        steps format: the path to show (each diagram falls back to its first path)
  --resolve-imports <folder-or-registry>
                     resolve topologyImports from this registry only: a folder holding
                     canon.json or registry.json, or the registry file itself; a
                     failure to resolve is an error
  --no-resolve-imports
                     do not resolve imports; list them (with their consumer overlays)
  --strict-imports   fail when imports cannot be resolved instead of listing them

Imports: a spec with topologyImports is resolved the way the reader resolves it
(FlowTopology.resolveSource over the provider closure that tools/canon/local-imports.mjs
reads from a registry). Without --resolve-imports the first registry that resolves
the spec wins, looked up beside the spec, then in the working directory, then at the
git root (registry.json, then canon.json in each). When none resolves it, the spec is
printed unresolved: each import is a 'section <ref> import <as> <spec> <export>
unresolved' line plus its overlay fields, a note goes to stderr, and the exit status
stays 0 (use --strict-imports to fail instead). Providers outside a local registry
(Canon, Workbench provider copies) are not fetched. A spec with only topologyExports
needs no registry. Registry resolution uses the backend runtime built by
python3 tools/build.py.
\${variables} in queries are printed as written; no environment is applied.

As a git diff textconv (git runs it from the repository root and hands it the old
version as a temporary file, so a registry beside the spec is not found for that side;
--no-resolve-imports gives both sides the same unresolved form):
  git config diff.flowview.textconv "node tools/spec-text.js --no-resolve-imports"
  echo '*.spec.json diff=flowview' >> .git/info/attributes
Without the flag both sides resolve only when a registry in the repository root
covers the spec's providers.

Exit status: 0 printed; 1 unreadable, invalid or (with --strict-imports or
--resolve-imports) unresolvable spec; 2 usage error.`;

function fail(message, code = 1){ const error = new Error(message); error.exitCode = code; throw error; }

function parseArgs(argv){
  const options = {format: 'flat', queries: 'names', pathId: null, registry: null, noResolve: false, strict: false, file: null, help: false};
  const value = (flag, index) => {
    const next = argv[index + 1];
    if (next == null || next.startsWith('--')) fail(flag + ' needs a value\n' + USAGE, 2);
    return next;
  };
  for (let i = 0; i < argv.length; i++){
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--format'){ options.format = value(arg, i++); if (!['flat', 'steps', 'elements'].includes(options.format)) fail('--format must be flat, steps or elements (got ' + options.format + ')', 2); }
    else if (arg === '--queries'){ options.queries = value(arg, i++); if (!['names', 'full'].includes(options.queries)) fail('--queries must be names or full (got ' + options.queries + ')', 2); }
    else if (arg === '--path') options.pathId = value(arg, i++);
    else if (arg === '--resolve-imports') options.registry = value(arg, i++);
    else if (arg === '--no-resolve-imports') options.noResolve = true;
    else if (arg === '--strict-imports') options.strict = true;
    else if (arg.startsWith('--')) fail('unknown option ' + arg + '\n' + USAGE, 2);
    else if (options.file) fail('one spec file at a time\n' + USAGE, 2);
    else options.file = arg;
  }
  if (options.registry && options.noResolve) fail('--resolve-imports and --no-resolve-imports exclude each other\n' + USAGE, 2);
  if (!options.help && !options.file) fail(USAGE, 2);
  return options;
}

function runtime(){
  const C = {URL, TextEncoder};
  vm.createContext(C);
  vm.runInContext(loader.composeSources(['canon.js', 'validator.js', 'core/text-view.js']), C);
  return C;
}

function registryAt(dir){
  return ['registry.json', 'canon.json'].map(name => path.join(dir, name)).find(candidate => fs.existsSync(candidate)) || null;
}
function gitRoot(){
  const out = spawnSync('git', ['rev-parse', '--show-toplevel'], {cwd: process.cwd(), encoding: 'utf8'});
  return out.status === 0 && out.stdout.trim() ? out.stdout.trim() : null;
}
// Beside the spec, then the working directory, then the git root; each once.
function registryCandidates(file){
  const dirs = [path.dirname(path.resolve(file)), process.cwd()], root = gitRoot();
  if (root) dirs.push(root);
  const seen = new Set();
  return dirs.map(registryAt).filter(candidate => candidate && !seen.has(path.resolve(candidate)) && seen.add(path.resolve(candidate)));
}

// A folder names the registry.json or canon.json it holds (the help's promise);
// local-imports itself would read canon.json only.
function explicitRegistry(location){
  let stat;
  try { stat = fs.statSync(location); } catch (error){ fail('--resolve-imports ' + location + ': ' + error.message); }
  if (!stat.isDirectory()) return location;
  return registryAt(location) || fail('--resolve-imports ' + location + ': the folder holds no registry.json or canon.json');
}

async function resolve(C, file, raw, options){
  let providers;
  try { providers = C.FlowTopology.dependencies(raw); } catch (error){ fail(file + ': ' + error.message); }
  if (!providers.length){
    try { return C.FlowTopology.resolveSource(raw, null); } catch (error){ fail(file + ': ' + error.message); }
  }
  if (options.noResolve) return raw;
  const candidates = options.registry ? [explicitRegistry(options.registry)] : registryCandidates(file), reasons = [];
  for (const location of candidates){
    let context;
    try { context = await (await import('./canon/local-imports.mjs')).resolveLocalImports(file, location); }
    catch (error){
      if (error && error.code === 'MODULE_NOT_FOUND' && String(error.message).includes('generated-runtime.cjs'))
        reasons.push('the backend runtime is missing; run python3 tools/build.py first');
      else reasons.push(location + ': ' + (error && error.message || error));
      continue;
    }
    // The reader's path: resolveSource over the authored spec and its provider snapshot.
    const snapshot = {version: context.version, id: context.id, specs: context.specs};
    if (context.ephemeral) snapshot.ephemeral = true;
    try { return C.FlowTopology.resolveSource(raw, snapshot); } catch (error){ reasons.push(location + ': ' + error.message); }
  }
  const why = reasons.length ? reasons.join('; ') : 'no registry.json or canon.json beside the spec, in the working directory or at the git root';
  const message = file + ': imports topology from ' + providers.join(', ') + ' but it cannot be resolved (' + why + ').';
  if (options.strict || options.registry) fail(message + ' Pass --resolve-imports <folder-or-registry>' + (options.registry ? ' naming a registry that holds them.' : ', or drop --strict-imports to list the imports unresolved.'));
  process.stderr.write('spec-text: note: ' + message + ' Printing it with its imports unresolved; pass --resolve-imports <folder-or-registry>, or --strict-imports to fail.\n');
  return raw;
}

async function main(argv){
  const options = parseArgs(argv);
  if (options.help){ process.stdout.write(HELP + '\n'); return 0; }
  const file = options.file;
  let text, raw;
  try { text = fs.readFileSync(file, 'utf8'); } catch (error){ fail(file + ': cannot read: ' + error.message); }
  try { raw = JSON.parse(text); } catch (error){ fail(file + ': not valid JSON: ' + error.message); }
  const C = runtime();
  const page = C.normalize(await resolve(C, file, raw, options));
  if (!page || typeof page !== 'object' || Array.isArray(page)) fail(file + ': not a Flowview spec (expected {page}, a page with sections or blocks, or a bare diagram)');
  let out;
  try {
    const model = C.textViewModel(page);
    out = options.format === 'steps' ? C.textViewSteps(model, {queries: options.queries, pathId: options.pathId})
      : options.format === 'elements' ? C.textViewElements(model) : C.textViewFlat(model);
  } catch (error){ fail(file + ': cannot render this spec: ' + (error && error.message || error)); }
  process.stdout.write(out);
  return 0;
}

if (require.main === module){
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    process.stderr.write('spec-text: ' + (error && error.message || error) + '\n');
    process.exitCode = error && error.exitCode || 1;
  });
}
module.exports = {main};

#!/usr/bin/env node
'use strict';
/* Print the text view of a Flowview spec (#1322): the same model and renderers
   the reader's Text window uses (src/core/text-view.js), loaded from src/ with
   the reader's own canon, topology and tracking sources. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const loader = require('./source-loader.cjs');

const USAGE = 'usage: node tools/spec-text.js <spec.json> [--format flat|steps|elements] [--queries names|full] [--path <id>] [--resolve-imports <folder-or-registry>]';
const HELP = USAGE + `

Prints a read-only text view of a spec to stdout.
  --format flat      one fact per line, sorted and stable (default); suits git diff textconv
  --format steps     markdown, one block per step of the selected path in each diagram
  --format elements  markdown, an index table and one sheet per node and edge
  --queries names    steps format: signal names, sources and units only (default)
  --queries full     steps format: every query field as well
  --path <id>        steps format: the path to show (each diagram falls back to its first path)
  --resolve-imports <folder-or-registry>
                     resolve topologyImports from this registry: a folder holding
                     canon.json or registry.json, or the registry file itself

Imports: a spec with topologyImports is resolved the way the reader resolves it
(FlowTopology.resolveSource over the provider closure that tools/canon/local-imports.mjs
reads from the registry). Without --resolve-imports the registry is looked up beside
the spec (registry.json, then canon.json); with none there, the command fails and
says which providers it needs. Providers outside a local registry (Canon, Workbench
provider copies) are not fetched. A spec with only topologyExports needs no registry.
Registry resolution uses the backend runtime built by python3 tools/build.py.
\${variables} in queries are printed as written; no environment is applied.

As a git diff textconv:
  git config diff.flowview.textconv "node tools/spec-text.js"
  echo '*.spec.json diff=flowview' >> .git/info/attributes

Exit status: 0 printed; 1 unreadable, invalid or unresolvable spec; 2 usage error.`;

function fail(message, code = 1){ const error = new Error(message); error.exitCode = code; throw error; }

function parseArgs(argv){
  const options = {format: 'flat', queries: 'names', pathId: null, registry: null, file: null, help: false};
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
    else if (arg.startsWith('--')) fail('unknown option ' + arg + '\n' + USAGE, 2);
    else if (options.file) fail('one spec file at a time\n' + USAGE, 2);
    else options.file = arg;
  }
  if (!options.help && !options.file) fail(USAGE, 2);
  return options;
}

function runtime(){
  const C = {URL, TextEncoder};
  vm.createContext(C);
  vm.runInContext(loader.composeSources(['canon.js', 'validator.js', 'core/text-view.js']), C);
  return C;
}

function registryFor(file, given){
  if (given) return given;
  const dir = path.dirname(path.resolve(file));
  return ['registry.json', 'canon.json'].map(name => path.join(dir, name)).find(candidate => fs.existsSync(candidate)) || null;
}

async function resolve(C, file, raw, registry){
  let providers;
  try { providers = C.FlowTopology.dependencies(raw); } catch (error){ fail(file + ': ' + error.message); }
  if (!providers.length){
    try { return C.FlowTopology.resolveSource(raw, null); } catch (error){ fail(file + ': ' + error.message); }
  }
  const location = registryFor(file, registry);
  if (!location) fail(file + ': imports topology from ' + providers.join(', ') + '; no registry.json or canon.json beside it. Pass --resolve-imports <folder-or-registry>.');
  let context;
  try { context = await (await import('./canon/local-imports.mjs')).resolveLocalImports(file, location); }
  catch (error){
    if (error && error.code === 'MODULE_NOT_FOUND' && String(error.message).includes('generated-runtime.cjs'))
      fail('the backend runtime is missing; run python3 tools/build.py first');
    fail(file + ': cannot resolve imports from ' + location + ': ' + (error && error.message || error));
  }
  // The reader's path: resolveSource over the authored spec and its provider snapshot.
  const snapshot = {version: context.version, id: context.id, specs: context.specs};
  if (context.ephemeral) snapshot.ephemeral = true;
  try { return C.FlowTopology.resolveSource(raw, snapshot); } catch (error){ fail(file + ': ' + error.message); }
}

async function main(argv){
  const options = parseArgs(argv);
  if (options.help){ process.stdout.write(HELP + '\n'); return 0; }
  const file = options.file;
  let text, raw;
  try { text = fs.readFileSync(file, 'utf8'); } catch (error){ fail(file + ': cannot read: ' + error.message); }
  try { raw = JSON.parse(text); } catch (error){ fail(file + ': not valid JSON: ' + error.message); }
  const C = runtime();
  const page = C.normalize(await resolve(C, file, raw, options.registry));
  if (!page) fail(file + ': not a Flowview spec (expected {page}, a page with sections or blocks, or a bare diagram)');
  const model = C.textViewModel(page);
  const out = options.format === 'steps' ? C.textViewSteps(model, {queries: options.queries, pathId: options.pathId})
    : options.format === 'elements' ? C.textViewElements(model) : C.textViewFlat(model);
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

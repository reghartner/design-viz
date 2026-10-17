#!/usr/bin/env node
'use strict';
/* Behaviour fingerprint for every starter and example, used to prove that
   specs without per-step `declare` overrides fold, validate and render
   exactly as before the feature.

   Usage:
     node tests/fixtures/build_declare_baseline.cjs --root <checkout> [--specs <checkout>] [--out <file>]

   --root   checkout whose src/ supplies the runtime (validator + engine).
   --specs  checkout whose starters/examples are fingerprinted (default: --root).
   --out    write JSON here; otherwise print it.

   The committed baseline (tests/fixtures/declare-noop-baseline.json) was
   produced with --root pointing at origin/main before the feature and
   --specs pointing at the same checkout. tests/panel-declare.test.js
   recomputes the fingerprint with this branch's runtime over the same specs
   and requires equality, so the comparison is against main's behaviour, not
   against itself. Specs that use `declare` are excluded on both sides. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SPEC_RE = /\.spec(?:\.v\d+)?\.json$/;

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' || a === '--specs' || a === '--out') out[a.slice(2)] = argv[++i];
  }
  if (!out.root) throw new Error('--root <checkout> is required');
  out.specs = out.specs || out.root;
  return out;
}
function runtime(root) {
  const {readSource} = require(path.join(root, 'tools/source-loader.cjs'));
  const C = {URL, TextEncoder, console: {log() {}, warn() {}, error() {}}};
  vm.createContext(C);
  for (const file of ['compatibility.js', 'canon.js', 'validator.js', 'engine.js'])
    vm.runInContext(readSource(file, path.join(root, 'src')), C, {filename: file});
  return C;
}
function specFiles(root) {
  const out = [];
  const starters = path.join(root, 'src/starters');
  for (const name of fs.readdirSync(starters)) if (name.endsWith('.json')) out.push('src/starters/' + name);
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(full);
      else if (SPEC_RE.test(entry.name)) out.push(path.relative(root, full));
    }
  };
  walk(path.join(root, 'examples'));
  return out.sort();
}
function diagramsOf(raw) {
  const page = raw && raw.page ? raw.page : raw, out = [];
  const blocks = page && (page.blocks || page.sections);
  if (Array.isArray(blocks)) blocks.forEach(block => {
    if (!block) return;
    if (block.diagram) out.push(block.diagram);
    (block.tabs || []).forEach(tab => (tab && tab.sections || []).forEach(section => { if (section && section.diagram) out.push(section.diagram); }));
  });
  if (!out.length && raw && raw.nodes) out.push(raw);
  return out;
}
function usesDeclare(raw) {
  return JSON.stringify(raw).indexOf('"declare"') >= 0;
}
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 16);
function stable(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (ex) { return 'unserialisable'; }
}
function fakeHost() {
  return {querySelector() { return null; }, querySelectorAll() { return []; }, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html || ''; }};
}
function renderAll(C, d, folded) {
  const out = {};
  (d.panels || []).forEach(panel => {
    if (!panel || !panel.id) return;
    const states = folded[panel.id] || [];
    const host = fakeHost(), frames = [];
    states.forEach((state, i) => {
      try { C.renderPanelBody(host, panel, state, 'aurora', states, i, false); frames.push(host.html || ''); }
      catch (ex) { frames.push('throw:' + (ex && ex.message)); }
    });
    out[panel.id] = hash(frames.join('\u0000'));
  });
  return out;
}
function fingerprint(runtimeRoot, specsRoot) {
  const C = runtime(runtimeRoot), result = {};
  for (const rel of specFiles(specsRoot)) {
    let text, raw;
    try { text = fs.readFileSync(path.join(specsRoot, rel), 'utf8'); raw = JSON.parse(text); } catch (ex) { continue; }
    if (usesDeclare(raw)) continue;
    /* The spec's own hash lets the test skip specs edited after the baseline. */
    const entry = {spec: hash(text)};
    try { entry.validate = hash(stable(C.validate(C.normalize(raw)))); } catch (ex) { entry.validate = 'throw:' + ex.message; }
    diagramsOf(raw).forEach((d, di) => {
      let routes;
      try { routes = C.diagramPathList(d); } catch (ex) { entry['d' + di] = 'throw:' + ex.message; return; }
      routes.forEach(route => {
        const key = 'd' + di + ':' + route.id;
        try {
          const sub = C.diagramForPath(d, route.id), folded = C.foldPanelStates(sub);
          entry[key] = {fold: hash(stable(folded)), render: renderAll(C, sub, folded)};
        } catch (ex) { entry[key] = 'throw:' + ex.message; }
      });
    });
    result[rel] = entry;
  }
  return result;
}
module.exports = {fingerprint, specFiles, SPEC_RE};
if (require.main === module) {
  const a = args(process.argv.slice(2));
  const json = JSON.stringify(fingerprint(path.resolve(a.root), path.resolve(a.specs)), null, 1) + '\n';
  if (a.out) fs.writeFileSync(a.out, json); else process.stdout.write(json);
}

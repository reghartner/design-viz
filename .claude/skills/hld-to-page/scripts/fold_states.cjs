#!/usr/bin/env node
'use strict';
/* fold_states.cjs: fold every path of a Flowview spec with the real engine.

   Usage: node fold_states.cjs <spec.json> [--viz <VIZ checkout>]

   Loads the prebuilt static backend (the same pure core
   tools/validate.js and the pages use), normalizes the spec the way the
   builder does, finds every diagram section, and resolves each declared path
   to its step list (a diagram without `paths` is one path of all steps). For
   every step it prints the step id, caption, lit edge keys, failures, nodes,
   the folded node tones (`tones`: an absolute snapshot that includes tones
   carried from earlier steps), this step's own tone patch (`tonePatch`: only
   the nodes this step sets or clears), the raw panel patch, and the folded
   state of every panel, i.e. what the viewer shows at that step.

   With the diagram's `storyTime`, each step also carries its resolved story
   time (`time`, `previous`: epoch milliseconds of floating local time;
   `timeLabel`: e.g. "Fri, Sep 25 · 6:50 AM"; `timeRejected`), and the diagram
   carries `storyTime` (start, end, clock, date) and each battery panel's
   resolved drain/charge rates with where each came from (panel, diagram or
   built-in placeholder).

   VIZ defaults to the directory four levels above this script
   (<VIZ>/.claude/skills/hld-to-page/scripts/). Output is JSON on stdout. */

const fs = require('fs');
const path = require('path');

function main(argv) {
  let viz = path.resolve(__dirname, '..', '..', '..', '..'), spec = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--viz') viz = path.resolve(argv[++i] || '');
    else if (argv[i] === '-h' || argv[i] === '--help') { spec = null; break; }
    else spec = argv[i];
  }
  if (!spec) {
    process.stderr.write('usage: node fold_states.cjs <spec.json> [--viz <VIZ checkout>]\n');
    return 2;
  }
  const runtimePath = path.join(viz, 'tools', 'canon', 'core.cjs');
  if (!fs.existsSync(runtimePath)) {
    process.stderr.write('fold_states: missing tools/canon/core.cjs at ' + viz + '; pass --viz <path>\n');
    return 2;
  }
  const core = require(runtimePath);
  const C = core.viewerRouting();

  let raw;
  try { raw = JSON.parse(fs.readFileSync(spec, 'utf8')); }
  catch (ex) { process.stderr.write('fold_states: cannot read ' + spec + ': ' + ex.message + '\n'); return 2; }
  const page = C.normalize(raw);
  if (!page) { process.stderr.write('fold_states: ' + spec + ' is not a Flowview spec\n'); return 2; }
  const v = core.validateSpec(raw);
  const plain = value => JSON.parse(JSON.stringify(value === undefined ? null : value));

  const diagrams = [];
  C.sectionRecords(page).forEach(record => {
    const sec = record.section, d = sec && sec.diagram;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return;
    const initialFold = C.foldPanelStates(Object.assign({}, d, {steps: []}));
    const initial = {};
    (d.panels || []).forEach(p => {
      if (p && p.id) initial[p.id] = plain((initialFold[p.id] || [])[0] || {});
    });
    const config = C.storyTimeConfig(d);
    const batteryRates = {};
    if (config) (d.panels || []).forEach(p => {
      if (p && p.id && p.type === 'battery')
        batteryRates[p.id] = Object.assign(plain(C.storyBatteryConstants(p, d)),
          {sources: plain(C.storyBatteryConstantSources(p, d))});
    });
    const paths = C.diagramPathList(d).map(p => {
      const dp = C.diagramForPath(d, p.id);
      const folded = C.foldPanelStates(dp), tones = C.foldNodeTones(dp);
      const story = config ? C.storyTimeSequence(dp, config) : null;
      const timeOf = i => !story ? {} : {time: story.times[i], previous: story.previous[i],
        timeLabel: C.storyTimeLabel(story.times[i], config), timeRejected: story.rejected[i]};
      return {
        id: p.id, label: p.label,
        declared: Array.isArray(d.paths) && d.paths.some(x => x && x.id === p.id),
        steps: dp.steps.map((st, i) => {
          const state = {};
          Object.keys(folded).forEach(pid => { state[pid] = plain(folded[pid][i]); });
          return {
            id: typeof st.id === 'string' && st.id ? st.id : 'step' + (dp._sourceIndices[i] + 1),
            caption: typeof st.text === 'string' ? st.text : '',
            edges: plain(C.stepKeys(st)), failures: plain(C.stepFailures(st)),
            nodes: plain(C.stepNodes(st)), tones: plain(tones[i] || {}),
            tonePatch: plain(C.stepTonePatch(st) || {}),
            patch: plain(C.stepPanelPatch(st) || {}), codeRefs: plain(st.codeRefs || []),
            state, ...timeOf(i)
          };
        })
      };
    });
    diagrams.push({name: sec.heading || sec.id || record.reference || ('section ' + record.number),
      section: record.path, diagram: plain(d), initial, paths,
      storyTime: config ? plain(config) : null, batteryRates});
  });
  process.stdout.write(JSON.stringify({spec, viz,
    validation: {errors: plain(v.errors), warnings: plain(v.warnings)}, diagrams}) + '\n');
  return 0;
}

// exitCode, not process.exit(): a large stdout to a pipe must drain first.
process.exitCode = main(process.argv.slice(2));

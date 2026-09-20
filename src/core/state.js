/* Pure path-local state folding. Uses stepTonePatch(), TONE_SET and the
   registered PanelRegistry/foldCommonPanelStates dispatch at call time. */

/* ---------------- node-tone folding ----------------
   Like panel patches, node tones are sparse authoring deltas folded into
   absolute per-step snapshots. Unknown ids/tokens are ignored here (the
   validator warns); `base` and null delete the carried tone. */
function foldNodeTones(d){
  d = d || {};
  var nodes = d.nodes || {};
  var steps = Array.isArray(d.steps) ? d.steps : [];
  var carried = {}, states = [];
  steps.forEach(function(st){
    var patch = stepTonePatch(st);
    if (patch) Object.keys(patch).forEach(function(id){
      if (!Object.prototype.hasOwnProperty.call(nodes, id)) return;
      var tone = patch[id];
      if (tone === null || tone === 'base'){
        delete carried[id];
      } else if (TONE_SET.indexOf(tone) >= 0 && tone !== 'base'){
        carried[id] = tone;
      }
    });
    var snap = {};
    Object.keys(carried).forEach(function(id){ snap[id] = carried[id]; });
    states.push(snap);
  });
  if (!steps.length) states.push({});
  return states;
}

/* ---------------- panel-state folding ----------------
   Authors emit sparse per-step patches; we fold them into COMPLETE state per
   step at load time, so any step jump renders from absolute state, never
   deltas. Rules:
   - state N = shallow merge of state N-1 and step N's patch for that panel;
   - a "log" patch key APPENDS (cumulative array of lines);
   - an "enterOnce" sub-object applies only at its own step (not carried). */

function foldPanelStates(d){
  var panels = d.panels || [];
  var steps = d.steps || [];
  var out = {};
  panels.forEach(function(panel){
    if (!panel || !panel.id) return;
    var descriptor = PanelRegistry.get(panel.type);
    var fold = descriptor && descriptor.fold || foldCommonPanelStates;
    out[panel.id] = fold(panel, steps);
  });
  return out;
}

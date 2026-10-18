/* Sequence-free RNA-copying teaching cartoon. Positions, extent and counts are
   independent authored symbols, never a simulation or a prediction. Shared
   polymerase artwork/palette comes from mech.js and strandscene's mech CSS. */
var RNACOPY_STATUSES = ['ready', 'copying', 'paused', 'interrupted', 'complete'];
var RNACOPY_FIELDS = ['status', 'position', 'progress', 'copies', 'caption', 'note'];
var RNACOPY_DEFAULTS = {status:'ready', position:0.25, progress:0, copies:0, caption:'', note:''};

/* Validation and folding use the same acceptance rules. Invalid values leave
   the carried field alone; null clears prose only. All retained values are
   primitives, so common-fold snapshots cannot share mutable state. */
function rnacopyClean(raw, path, warnings, allowOnce) {
  var out = {};
  function warn(at, message) { if (warnings) warnings.push(at + ': ' + message); }
  if (raw === undefined) return out;
  if (!panelObject(raw)) { warn(path, 'expected a state object — ignored'); return out; }
  Object.keys(raw).forEach(function (key) {
    var value = raw[key], at = path + '.' + key;
    if (key === 'enterOnce' && allowOnce) {
      out.enterOnce = rnacopyClean(value, at, warnings, false);
    } else if (key === 'status') {
      if (RNACOPY_STATUSES.indexOf(value) >= 0) out.status = value;
      else warn(at, 'expected ' + RNACOPY_STATUSES.join('|') + ' — ignored');
    } else if (key === 'position' || key === 'progress') {
      if (isFiniteNum(value) && value >= 0 && value <= 1) out[key] = value;
      else warn(at, 'expected an authored fraction from 0 to 1 — ignored');
    } else if (key === 'copies') {
      if (isFiniteNum(value) && Number.isInteger(value) && value >= 0 && value <= 12) out.copies = value;
      else warn(at, 'expected an authored whole number from 0 to 12 — ignored');
    } else if (key === 'caption' || key === 'note') {
      if (value === null || typeof value === 'string') out[key] = value;
      else warn(at, 'expected text or null — ignored');
    } else warn(at, 'unknown field — ignored');
  });
  return out;
}
function rnacopyFold(panel, steps) {
  return foldSanitizedPanelStates(panel, steps, function (raw, allowOnce) {
    return rnacopyClean(raw, 'state', null, allowOnce);
  });
}
function rnacopyModel(panel, state) {
  panel = panelObject(panel) ? panel : {};
  var clean = rnacopyClean(state, 'state', null, false);
  var model = Object.assign({}, RNACOPY_DEFAULTS, clean);
  model.label = typeof panel.label === 'string' ? panel.label : 'RNA copying';
  model.x = mechNum(112 + 336 * model.position);
  model.y = 148;
  /* A short branch peels off below the input. Extent controls only this path;
     polymerase position, status and copy count never infer one another. */
  var length = 28 + 0.78 * (model.x - 52) * model.progress;
  model.copyEnd = {x:mechNum(model.x - length), y:mechNum(170 + 52 * model.progress)};
  model.copyPath = model.progress > 0 ? 'M' + model.x + ',148 C' + mechNum(model.x - 15) + ',191 ' +
    mechNum(model.x - length * 0.5) + ',' + mechNum(model.copyEnd.y + 23) + ' ' + model.copyEnd.x + ',' + model.copyEnd.y : '';
  model.aria = model.label + '. Polymerase ' + model.status + '; authored position ' +
    Math.round(model.position * 100) + ' percent; authored copy extent ' + Math.round(model.progress * 100) +
    ' percent; authored copies ' + model.copies + '. Sequence-free conceptual illustration.';
  return model;
}
function rnacopyHTML(panel, state) {
  var m = rnacopyModel(panel, state), status = m.status.charAt(0).toUpperCase() + m.status.slice(1);
  var glyph = m.status === 'paused' ? '<path d="M-5,-7V7M5,-7V7"/>' :
    m.status === 'interrupted' ? '<path d="M-6,-6L6,6M6,-6L-6,6"/>' :
    m.status === 'complete' ? '<path d="M-7,0L-2,5L8,-6"/>' :
    m.status === 'copying' ? '<path d="M-7,0H7M2,-5L7,0L2,5"/>' : '<circle r="5"/>';
  var h = '<div class="rnacopy rnacopy-st-' + m.status + '">' +
    '<svg class="mech-frame rnacopy-frame" viewBox="0 0 560 315" role="img" aria-label="' + esc(m.aria) + '">' +
    '<title>' + esc(m.aria) + '</title><g aria-hidden="true">' +
    '<text class="rnacopy-kicker" x="24" y="29">CONCEPTUAL CLOSE-UP</text>' +
    '<text class="rnacopy-heading" x="24" y="54">RNA copying</text>' +
    '<rect class="rnacopy-status-bg" x="382" y="20" width="154" height="34" rx="17"/>' +
    '<g class="rnacopy-status-icon" transform="translate(402,37)">' + glyph + '</g>' +
    '<text class="rnacopy-status-text" x="420" y="42">' + status + '</text>' +
    '<path class="rnacopy-guide" d="M24,254H536"/>' +
    '<path class="rnacopy-input-shadow" d="M38,148 C70,124 88,148 112,148 H448 C478,148 490,172 522,148"/>' +
    '<path class="rnacopy-input" d="M38,148 C70,124 88,148 112,148 H448 C478,148 490,172 522,148"/>';
  if (m.copyPath) h += '<path class="rnacopy-copy-shadow" d="' + m.copyPath + '"/>' +
    '<path class="rnacopy-copy" d="' + m.copyPath + '"/><circle class="rnacopy-copy-tip" cx="' + m.copyEnd.x + '" cy="' + m.copyEnd.y + '" r="4"/>';
  h += '<g class="rnacopy-polymerase" transform="translate(' + m.x + ',' + m.y + ')">' +
    '<circle class="rnacopy-halo" r="37"/>' +
    mechActorMarkup({role:'polymerase', shape:'clamp', size:'l', label:''}) +
    '<path class="rnacopy-leader" d="M0,-30V-47"/>' +
    '<text class="rnacopy-enzyme-label" y="-54" text-anchor="middle">Polymerase</text></g>' +
    '<text class="rnacopy-metric" x="24" y="277">' + m.copies + (m.copies === 1 ? ' copy' : ' copies') + ' · authored</text>' +
    '<text class="rnacopy-small" x="24" y="297">Symbolic state · no sequence or timescale</text>' +
    '<text class="rnacopy-metric rnacopy-extent" x="536" y="277" text-anchor="end">' + Math.round(m.progress * 100) + '% extent</text>' +
    '<text class="rnacopy-small" x="536" y="297" text-anchor="end">author-selected</text></g></svg>';
  h += '<div class="rnacopy-details">' + (m.label ? '<div class="rnacopy-label">' + esc(m.label) + '</div>' : '') +
    '<ul class="rnacopy-legend" aria-label="Ribbon legend"><li><i class="rnacopy-input-key" aria-hidden="true"></i>Input ribbon</li>' +
    '<li><i class="rnacopy-copy-key" aria-hidden="true"></i>Emerging copy</li></ul>' +
    (m.caption ? '<p class="rnacopy-caption">' + esc(m.caption) + '</p>' : '') +
    (m.note ? '<p class="rnacopy-note">' + esc(m.note) + '</p>' : '') + '</div></div>';
  return h;
}
PanelRegistry.define('rnacopy', {
  label:'RNA copying', since:'0.2.0', order:50,
  validateDeclaration:function (panel, path, warnings) {
    if (panel.label !== undefined && typeof panel.label !== 'string') warnings.push(path + '.label: expected text — using RNA copying');
    rnacopyClean(panel.initial, path + '.initial', warnings, false);
  },
  validatePatch:function (patch, path, panel, warnings) { rnacopyClean(patch, path, warnings, true); },
  fold:rnacopyFold,
  render:function (host, panel, state) { return {html:rnacopyHTML(panel, state)}; },
  layout:{
    canvasSizing:{mode:'fixed-aspect', aspect:560/315, resizeAxis:'width'},
    sectionSizing:{minWidth:320, preferredWidth:560, maxWidth:900, aspectPolicy:'fixed', bodyAspect:16/9, grow:1, contentSelector:'.rnacopy-frame', ancillarySelector:'.rnacopy-details'},
    height:9, fallbackHeight:9,
  },
  styles:String.raw`
.rnacopy{min-width:0;--rc-input:#8FADC9;--rc-copy:#67DFC5;--rc-status:#BCA6FF}
.rnacopy-frame{overflow:hidden}
.rnacopy-kicker{font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.12em;fill:var(--mk-mute)}
.rnacopy-heading{font:600 19px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink)}
.rnacopy-status-bg{fill:color-mix(in srgb,var(--rc-status) 12%,var(--mk-tagbg));stroke:var(--rc-status);stroke-width:1}
.rnacopy-status-icon{fill:none;stroke:var(--rc-status);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.rnacopy-status-text{font:600 13px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink)}
.rnacopy-st-paused{--rc-status:#F4CB79}.rnacopy-st-interrupted{--rc-status:#FF9696}.rnacopy-st-complete{--rc-status:#67DFC5}
.rnacopy-guide{fill:none;stroke:var(--mk-rung);stroke-width:1}
.rnacopy-input,.rnacopy-input-shadow,.rnacopy-copy,.rnacopy-copy-shadow{fill:none;stroke-linecap:round;stroke-linejoin:round}
.rnacopy-input-shadow{stroke:color-mix(in srgb,var(--rc-input) 15%,transparent);stroke-width:17}
.rnacopy-input{stroke:var(--rc-input);stroke-width:6}
.rnacopy-copy-shadow{stroke:color-mix(in srgb,var(--rc-copy) 15%,transparent);stroke-width:16}
.rnacopy-copy{stroke:var(--rc-copy);stroke-width:5;stroke-dasharray:9 4}
.rnacopy-copy-tip{fill:var(--rc-copy)}
.rnacopy-halo{fill:color-mix(in srgb,#B99CFF 9%,var(--mk-tagbg));stroke:color-mix(in srgb,#B99CFF 35%,transparent);stroke-width:1}
.rnacopy-st-interrupted .rnacopy-halo,.rnacopy-st-paused .rnacopy-halo{stroke:var(--rc-status);stroke-dasharray:4 4}
.rnacopy-leader{fill:none;stroke:var(--mk-mute);stroke-width:1}
.rnacopy-enzyme-label{font:500 12px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink)}
.rnacopy-metric{font:600 13px 'IBM Plex Mono',monospace;fill:var(--mk-ink)}
.rnacopy-small{font:10px 'IBM Plex Sans',sans-serif;fill:var(--mk-mute)}
.rnacopy-details{color:var(--dtext);font:12px/1.5 'IBM Plex Sans',sans-serif;overflow-wrap:anywhere}
.rnacopy-label{font-weight:600;margin-top:8px}
.rnacopy-legend{display:flex;flex-wrap:wrap;gap:4px 18px;list-style:none;margin:5px 0 0;padding:0}
.rnacopy-legend li{display:inline-flex;gap:7px;align-items:center}
.rnacopy-legend i{display:inline-block;width:20px;height:0;border-top:3px solid var(--rc-input)}
.rnacopy-legend .rnacopy-copy-key{border-top:3px dashed var(--rc-copy)}
.rnacopy-caption,.rnacopy-note{margin:6px 0 0}.rnacopy-note{color:var(--dfaint)}
.sk-daylight .rnacopy,body.sk-editorial .rnacopy,body.sk-pastel .rnacopy{--rc-input:#486581;--rc-copy:#137763;--rc-status:#6D48B3}
.sk-daylight .rnacopy-st-paused,body.sk-editorial .rnacopy-st-paused,body.sk-pastel .rnacopy-st-paused{--rc-status:#8B5A0D}
.sk-daylight .rnacopy-st-interrupted,body.sk-editorial .rnacopy-st-interrupted,body.sk-pastel .rnacopy-st-interrupted{--rc-status:#AF3838}
.sk-daylight .rnacopy-st-complete,body.sk-editorial .rnacopy-st-complete,body.sk-pastel .rnacopy-st-complete{--rc-status:#137763}
body.sk-pastel .rnacopy-frame{background:#F4F6FA;--mk-ink:#0B1220;--mk-mute:#5E6B82;--mk-rung:#B8C2D4;--mk-tagbg:#FFFFFF}
@media (prefers-reduced-motion:reduce){.rnacopy *{animation:none;transition:none}}
@media print{.rnacopy{break-inside:avoid;--rc-input:#486581;--rc-copy:#137763;--rc-status:#49346F}.rnacopy-frame{background:#fff;--mk-ink:#111;--mk-mute:#444;--mk-rung:#ccc;--mk-tagbg:#fff;print-color-adjust:exact}.rnacopy .mech-actor path{filter:none}.rnacopy-details,.rnacopy-note{color:#111}.rnacopy *{animation:none;transition:none}}
`,
  authoring:{
    initialFields:true, transientFields:RNACOPY_FIELDS.slice(),
    template:{title:'RNA copying', label:'A conceptual copying step', initial:{status:'ready', position:0.25, progress:0, copies:0}},
    setupFields:[['label','text'],['initial','json']],
    patchFields:[['status','enum',RNACOPY_STATUSES],['position','num'],['progress','num'],['copies','num'],['caption','text'],['note','text']],
    fieldMeta:{
      label:{label:'Scene label'},
      status:{label:'Polymerase state', help:'An authored state; paused and interrupted retain the current composition.'},
      position:{label:'Polymerase position', help:'Fraction 0–1 across the input ribbon. Independent of extent and state.'},
      progress:{label:'Copy extent', help:'Authored fraction 0–1 controlling the emerging ribbon. A symbolic illustration, with no timescale.'},
      copies:{label:'Authored copies', help:'Whole number 0–12. Does not increase automatically or predict output.'},
      caption:{label:'Caption', nullLabel:'No caption'}, note:{label:'Explanation', nullLabel:'No explanation'},
    },
    picker:{order:50, name:'RNA copying', category:'Science & sequencing', tagline:'A sequence-free copying close-up', description:'An input ribbon, polymerase and emerging copy. Author matched baseline, paused or hypothetical interruption states; all positions and counts are symbolic.'},
    example:function (sample) {
      sample.state = {status:'copying', position:0.62, progress:0.65, copies:1, caption:'The emerging copy follows the authored extent.'};
      sample.panel.initial = Object.assign({}, sample.state);
      return sample;
    },
  },
});

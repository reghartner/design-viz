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
  model.x = mechNum(124 + 196 * model.position);
  model.y = 200;
  /* This branch is the complementary intermediate, never new +RNA directly
     copied from incoming +RNA. Extent, position, status and tray count remain
     independent authored symbols. The lower lane explains the full pathway. */
  var length = 44 + 0.65 * (model.x - 100) * model.progress;
  model.copyEnd = {x:mechNum(model.x - length), y:mechNum(244 + 19 * model.progress)};
  model.copyPath = model.progress > 0 ? 'M' + model.x + ',200 C' + mechNum(model.x - 6) + ',243 ' +
    mechNum(model.x - length * 0.5) + ',' + mechNum(model.copyEnd.y + 16) + ' ' + model.copyEnd.x + ',' + model.copyEnd.y : '';
  model.aria = model.label + '. Polymerase ' + model.status + '; authored position ' +
    Math.round(model.position * 100) + ' percent; authored intermediate extent ' + Math.round(model.progress * 100) +
    ' percent; ' + model.copies + ' completed +RNA copies in a separate symbolic tray. ' +
    'Incoming +RNA is copied through a complementary intermediate before new +RNA. ' +
    (model.status === 'interrupted' && model.progress > 0 ? 'The stopped intermediate remains visible. ' : '') +
    'Sequence-free conceptual illustration; independent authored states, no timescale.';
  return model;
}
function rnacopyHTML(panel, state) {
  var m = rnacopyModel(panel, state), status = m.status.charAt(0).toUpperCase() + m.status.slice(1);
  var glyph = m.status === 'paused' ? '<path d="M-5,-7V7M5,-7V7"/>' :
    m.status === 'interrupted' ? '<rect x="-6" y="-6" width="12" height="12" rx="1"/>' :
    m.status === 'complete' ? '<path d="M-7,0L-2,5L8,-6"/>' :
    m.status === 'copying' ? '<path d="M-7,0H7M2,-5L7,0L2,5"/>' : '<circle r="5"/>';
  var held = m.status === 'interrupted' ? 'Stopped' : m.status === 'paused' ? 'Held' : m.status === 'complete' ? 'Complete' : m.status === 'copying' ? 'Emerging' : 'Ready';
  var detail = m.progress === 0 ? 'no intermediate drawn' :
    (m.status === 'interrupted' || m.status === 'paused') ? 'intermediate retained' : 'authored intermediate';
  var h = '<div class="rnacopy rnacopy-st-' + m.status + '">' +
    '<svg class="mech-frame rnacopy-frame" viewBox="0 0 640 420" role="img" aria-label="' + esc(m.aria) + '">' +
    '<title>' + esc(m.aria) + '</title><g aria-hidden="true">' +
    '<text class="rnacopy-kicker" x="24" y="28">REPLICATION / CONCEPTUAL ATLAS</text>' +
    '<text class="rnacopy-heading" x="24" y="62">RNA copying</text>' +
    '<rect class="rnacopy-status-bg" x="438" y="29" width="178" height="40" rx="10"/>' +
    '<g class="rnacopy-status-icon" transform="translate(458,49)">' + glyph + '</g>' +
    '<text class="rnacopy-status-text" x="476" y="55">' + status + '</text>' +
    '<rect class="rnacopy-site-bg" x="24" y="94" width="370" height="236" rx="14"/>' +
    '<text class="rnacopy-section" x="44" y="119">01 / POLYMERASE SITE</text>' +
    '<text class="rnacopy-ribbon-label" x="44" y="151">Incoming +RNA</text>' +
    '<path class="rnacopy-leader" d="M52,161V182"/>' +
    '<path class="rnacopy-input-shadow" d="M46,200 C64,181 83,200 104,200 H330 C349,200 356,219 374,200"/>' +
    '<path class="rnacopy-input" d="M46,200 C64,181 83,200 104,200 H330 C349,200 356,219 374,200"/>';
  if (m.copyPath) h += '<path class="rnacopy-copy-shadow" d="' + m.copyPath + '"/>' +
    '<path class="rnacopy-copy" d="' + m.copyPath + '"/><circle class="rnacopy-copy-tip" cx="' + m.copyEnd.x + '" cy="' + m.copyEnd.y + '" r="5"/>';
  h += '<g class="rnacopy-polymerase" transform="translate(' + m.x + ',' + m.y + ')">' +
    '<circle class="rnacopy-halo" r="43"/><g transform="scale(1.35)">' +
    mechActorMarkup({role:'polymerase', shape:'clamp', size:'l', label:''}) + '</g>' +
    '<circle class="rnacopy-site-core" r="13"/>' +
    '<g class="rnacopy-status-icon rnacopy-site-icon">' + glyph + '</g></g>' +
    '<text class="rnacopy-ribbon-label rnacopy-intermediate-label" x="44" y="290">Complementary intermediate</text>' +
    '<text class="rnacopy-state-note" x="44" y="313">' + held + ' · ' + detail + '</text>' +
    '<g class="rnacopy-tray"><rect class="rnacopy-tray-bg" x="414" y="94" width="202" height="236" rx="14"/>' +
    '<text class="rnacopy-section" x="434" y="119">02 / COPY TRAY</text>' +
    '<text class="rnacopy-count" x="434" y="172">' + m.copies + '</text>' +
    '<text class="rnacopy-tray-label" x="492" y="151">completed</text>' +
    '<text class="rnacopy-tray-label" x="492" y="173">+RNA</text>';
  /* One physically separate ribbon per authored copy, including every count
     through 12. These tokens never represent products of the current site. */
  for (var i = 0; i < m.copies; i++) {
    var tx = 435 + (i % 3) * 55, ty = 204 + Math.floor(i / 3) * 25;
    h += '<g class="rnacopy-completed-copy" transform="translate(' + tx + ',' + ty + ')">' +
      '<rect class="rnacopy-token-bg" x="-2" y="-10" width="48" height="21" rx="5"/>' +
      '<path class="rnacopy-output" d="M4,1 C10,-9 14,10 21,0 S32,-6 38,1"/></g>';
  }
  if (m.copies === 0) h += '<text class="rnacopy-empty" x="434" y="223">No copies shown</text>';
  h += '<text class="rnacopy-small" x="434" y="313">Separate symbolic count</text></g>' +
    '<g class="rnacopy-pathway"><text class="rnacopy-section" x="24" y="356">CONCEPTUAL PATHWAY</text>' +
    '<text class="rnacopy-path-label" x="24" y="387">Incoming +RNA</text>' +
    '<path class="rnacopy-flow-arrow" d="M173,382H204M198,376L204,382L198,388"/>' +
    '<text class="rnacopy-path-label" x="226" y="380">Complementary</text>' +
    '<text class="rnacopy-path-label" x="226" y="400">intermediate</text>' +
    '<path class="rnacopy-flow-arrow" d="M402,382H433M427,376L433,382L427,388"/>' +
    '<text class="rnacopy-path-label" x="457" y="387">New +RNA</text></g></g></svg>';
  h += '<div class="rnacopy-details">' + (m.label ? '<div class="rnacopy-label">' + esc(m.label) + '</div>' : '') +
    '<ul class="rnacopy-legend" aria-label="Ribbon legend"><li><i class="rnacopy-input-key" aria-hidden="true"></i>Incoming RNA</li>' +
    '<li><i class="rnacopy-copy-key" aria-hidden="true"></i>Complementary intermediate</li>' +
    '<li><i class="rnacopy-output-key" aria-hidden="true"></i>Completed +RNA</li></ul>' +
    '<p class="rnacopy-authored">' + Math.round(m.progress * 100) + '% extent · ' + m.copies + (m.copies === 1 ? ' copy' : ' copies') + ' · authored independently. No sequence or timescale.</p>' +
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
    canvasSizing:{mode:'fixed-aspect', aspect:640/420, resizeAxis:'width'},
    sectionSizing:{minWidth:320, preferredWidth:640, maxWidth:900, aspectPolicy:'fixed', bodyAspect:640/420, grow:1, contentSelector:'.rnacopy-frame', ancillarySelector:'.rnacopy-details'},
    height:9, fallbackHeight:9,
  },
  styles:String.raw`
.rnacopy{min-width:0;--rc-input:#9EBFDF;--rc-copy:#F4C67A;--rc-output:#72DCC2;--rc-status:#C4ACFF}
.rnacopy-frame{overflow:hidden;border:1px solid var(--mk-rung);box-sizing:border-box}
.rnacopy-kicker,.rnacopy-section{font:600 12px 'IBM Plex Mono',monospace;letter-spacing:.06em;fill:var(--mk-mute)}
.rnacopy-heading{font:600 29px 'IBM Plex Sans',sans-serif;letter-spacing:-.02em;fill:var(--mk-ink)}
.rnacopy-status-bg{fill:color-mix(in srgb,var(--rc-status) 12%,var(--mk-tagbg));stroke:var(--rc-status);stroke-width:1.5}
.rnacopy-status-icon{fill:none;stroke:var(--rc-status);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.rnacopy-status-text{font:600 19px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink)}
.rnacopy-st-paused{--rc-status:#F4CB79}.rnacopy-st-interrupted{--rc-status:#FF9696}.rnacopy-st-complete{--rc-status:#72DCC2}
.rnacopy-site-bg,.rnacopy-tray-bg{fill:var(--mk-tagbg);stroke:var(--mk-rung);stroke-width:1}
.rnacopy-tray-bg{fill:color-mix(in srgb,var(--rc-output) 4%,var(--mk-tagbg))}
.rnacopy-input,.rnacopy-input-shadow,.rnacopy-copy,.rnacopy-copy-shadow,.rnacopy-output{fill:none;stroke-linecap:round;stroke-linejoin:round}
.rnacopy-input-shadow{stroke:color-mix(in srgb,var(--rc-input) 12%,transparent);stroke-width:19}
.rnacopy-input{stroke:var(--rc-input);stroke-width:6}
.rnacopy-copy-shadow{stroke:color-mix(in srgb,var(--rc-copy) 12%,transparent);stroke-width:16}
.rnacopy-copy{stroke:var(--rc-copy);stroke-width:5;stroke-dasharray:9 5}
.rnacopy-copy-tip{fill:var(--rc-copy)}
.rnacopy-halo{fill:color-mix(in srgb,var(--rc-status) 9%,var(--mk-tagbg));stroke:color-mix(in srgb,var(--rc-status) 45%,transparent);stroke-width:1.5}
.rnacopy-st-interrupted .rnacopy-halo,.rnacopy-st-paused .rnacopy-halo{stroke:var(--rc-status);stroke-dasharray:5 5}
.rnacopy-site-core{fill:var(--mk-tagbg)}
.rnacopy-polymerase .mech-actor path{fill:color-mix(in srgb,var(--rc-status) 22%,var(--mk-tagbg));stroke:var(--rc-status);filter:none}
.rnacopy-leader{fill:none;stroke:var(--rc-input);stroke-width:1.5}
.rnacopy-ribbon-label{font:600 17px 'IBM Plex Sans',sans-serif;fill:var(--rc-input)}
.rnacopy-intermediate-label{fill:var(--rc-copy)}
.rnacopy-state-note{font:500 14px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink)}
.rnacopy-count{font:600 42px 'IBM Plex Sans',sans-serif;fill:var(--rc-output)}
.rnacopy-tray-label{font:500 17px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink)}
.rnacopy-output{stroke:var(--rc-output);stroke-width:3}
.rnacopy-token-bg{fill:color-mix(in srgb,var(--rc-output) 6%,var(--mk-tagbg));stroke:color-mix(in srgb,var(--rc-output) 30%,var(--mk-rung));stroke-width:1}
.rnacopy-empty,.rnacopy-small{font:14px 'IBM Plex Sans',sans-serif;fill:var(--mk-mute)}
.rnacopy-path-label{font:600 17px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink)}
.rnacopy-flow-arrow{fill:none;stroke:var(--mk-mute);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.rnacopy-details{color:var(--dtext);font:13px/1.5 'IBM Plex Sans',sans-serif;overflow-wrap:anywhere}
.rnacopy-label{font-weight:600;margin-top:9px}
.rnacopy-legend{display:flex;flex-wrap:wrap;gap:4px 18px;list-style:none;margin:5px 0 0;padding:0}
.rnacopy-legend li{display:inline-flex;gap:7px;align-items:center}
.rnacopy-legend i{display:inline-block;width:20px;height:0;border-top:3px solid var(--rc-input)}
.rnacopy-legend .rnacopy-copy-key{border-top:3px dashed var(--rc-copy)}
.rnacopy-legend .rnacopy-output-key{border-top:3px solid var(--rc-output)}
.rnacopy-caption,.rnacopy-note,.rnacopy-authored{margin:6px 0 0}.rnacopy-note,.rnacopy-authored{color:var(--dfaint)}
.sk-daylight .rnacopy,body.sk-editorial .rnacopy,body.sk-pastel .rnacopy{--rc-input:#365F89;--rc-copy:#95600B;--rc-output:#137763;--rc-status:#6D48B3}
.sk-daylight .rnacopy-st-paused,body.sk-editorial .rnacopy-st-paused,body.sk-pastel .rnacopy-st-paused{--rc-status:#8B5A0D}
.sk-daylight .rnacopy-st-interrupted,body.sk-editorial .rnacopy-st-interrupted,body.sk-pastel .rnacopy-st-interrupted{--rc-status:#AF3838}
.sk-daylight .rnacopy-st-complete,body.sk-editorial .rnacopy-st-complete,body.sk-pastel .rnacopy-st-complete{--rc-status:#137763}
body.sk-pastel .rnacopy-frame{background:#F4F6FA;--mk-ink:#0B1220;--mk-mute:#5E6B82;--mk-rung:#B8C2D4;--mk-tagbg:#FFFFFF}
@media (prefers-reduced-motion:reduce){.rnacopy *{animation:none;transition:none}}
@media print{.rnacopy{break-inside:avoid;--rc-input:#365F89;--rc-copy:#95600B;--rc-output:#137763;--rc-status:#49346F}.rnacopy-frame{background:#fff;--mk-ink:#111;--mk-mute:#444;--mk-rung:#ccc;--mk-tagbg:#fff;print-color-adjust:exact}.rnacopy .mech-actor path{filter:none}.rnacopy-details,.rnacopy-note,.rnacopy-authored{color:#111}.rnacopy *{animation:none;transition:none}}
`,
  authoring:{
    initialFields:true, transientFields:RNACOPY_FIELDS.slice(),
    template:{title:'RNA copying', label:'A conceptual copying step', initial:{status:'ready', position:0.25, progress:0, copies:0}},
    setupFields:[['label','text'],['initial','json']],
    patchFields:[['status','enum',RNACOPY_STATUSES],['position','num'],['progress','num'],['copies','num'],['caption','text'],['note','text']],
    fieldMeta:{
      label:{label:'Scene label'},
      status:{label:'Polymerase state', help:'An authored state; paused and interrupted retain the current composition.'},
      position:{label:'Polymerase position', help:'Fraction 0–1 across the incoming RNA ribbon. Independent of extent and state.'},
      progress:{label:'Copy extent', help:'Authored fraction 0–1 controlling the complementary intermediate ribbon. A symbolic illustration, with no timescale.'},
      copies:{label:'Authored copies', help:'Whole number 0–12 in a separate completed +RNA tray. Independent of the active intermediate; does not increase automatically or predict output.'},
      caption:{label:'Caption', nullLabel:'No caption'}, note:{label:'Explanation', nullLabel:'No explanation'},
    },
    picker:{order:50, name:'RNA copying', category:'Science & sequencing', tagline:'A sequence-free copying close-up', description:'Incoming +RNA, polymerase, a complementary intermediate and a separate completed-copy tray. Author matched baseline, paused or hypothetical interruption states; all positions and counts are symbolic.'},
    example:function (sample) {
      sample.state = {status:'copying', position:0.62, progress:0.65, copies:1, caption:'The complementary intermediate follows the authored extent; completed +RNA is counted separately.'};
      sample.panel.initial = Object.assign({}, sample.state);
      return sample;
    },
  },
});

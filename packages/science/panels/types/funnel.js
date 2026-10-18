/* Stage counts: ordered stages of a filtering pipeline with the number of
   items that remain at each one. Every count is authored; nothing is read
   from data files. Shared alphabet/tone helpers live in ../bio.js, and the
   `.bio-tone-*` colour classes are owned by the sequence panel's styles. */
var FUNNEL_MAX_STAGES = 12;
/* Stage ids become keys of the authored `counts` object, so they must be
   plain identifier-like strings (no leading underscore keeps `__proto__` out). */
function funnelSafeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id);
}
function funnelStages(panel) {
  return panelCollectionItems(panel, 'stages', FUNNEL_MAX_STAGES).filter(function (stage) {
    return funnelSafeId(stage.id);
  }).map(function (stage) {
    return {
      id: stage.id,
      label: typeof stage.label === 'string' && stage.label.trim() ? stage.label : stage.id,
      tone: BIO_TONES.indexOf(stage.tone) >= 0 ? stage.tone : null,
    };
  });
}
function funnelUnit(panel) {
  return typeof panel.unit === 'string' && panel.unit.trim() ? panel.unit.trim() : 'items';
}
function funnelStageIds(panel) {
  return funnelStages(panel).map(function (stage) { return stage.id; });
}
function funnelDeclarationWarnings(panel, path, warnings) {
  var seen = Object.create(null), valid = 0;
  if (!Array.isArray(panel.stages) || panel.stages.length < 2 || panel.stages.length > FUNNEL_MAX_STAGES)
    warnings.push(path + '.stages: declare 2–' + FUNNEL_MAX_STAGES + ' stages [{id,label,tone?}] in pipeline order');
  (Array.isArray(panel.stages) ? panel.stages : []).forEach(function (stage, i) {
    var at = path + '.stages[' + i + ']';
    if (i >= FUNNEL_MAX_STAGES) return;
    if (!panelObject(stage) || typeof stage.id !== 'string' || !stage.id) {
      warnings.push(at + '.id: needs a non-empty string — stage skipped');
      return;
    }
    if (!funnelSafeId(stage.id)) {
      warnings.push(at + '.id: use letters, digits, "-" or "_" starting with a letter or digit — stage skipped');
      return;
    }
    if (seen[stage.id]) {
      warnings.push(at + '.id: duplicate id "' + stage.id + '" — later stage skipped');
      return;
    }
    seen[stage.id] = true;
    valid++;
    if (stage.label !== undefined && typeof stage.label !== 'string')
      warnings.push(at + '.label: expected text — using the id');
    if (stage.tone !== undefined && BIO_TONES.indexOf(stage.tone) < 0)
      warnings.push(at + '.tone: expected ' + BIO_TONES.join('|') + ' — using the default bar colour');
  });
  if (Array.isArray(panel.stages) && panel.stages.length >= 2 && valid < 2)
    warnings.push(path + '.stages: fewer than 2 usable stages — the panel renders empty');
  if (panel.unit !== undefined && (typeof panel.unit !== 'string' || !panel.unit.trim()))
    warnings.push(path + '.unit: expected a non-empty item noun such as "reads" — using items');
  funnelPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function funnelCountWarnings(counts, path, ids, warnings) {
  if (counts === null) return;
  if (!panelObject(counts)) {
    warnings.push(path + ': expected an object keyed by stage id (or null to clear every count) — ignored');
    return;
  }
  Object.keys(counts).forEach(function (id) {
    var at = path + '.' + id, value = counts[id];
    if (ids.indexOf(id) < 0) warnings.push(at + ': unknown stage id — ignored');
    else if (value !== null && !bioCount(value))
      warnings.push(at + ': expected a non-negative whole number or null — ignored');
  });
}
function funnelPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, panel, warnings) {
    var ids = funnelStageIds(panel);
    Object.keys(state).forEach(function (key) {
      var value = state[key], at = path + '.' + key;
      if (key === 'enterOnce') return;
      if (key === 'counts') funnelCountWarnings(value, at, ids, warnings);
      else if (key === 'active') {
        if (value !== null && (typeof value !== 'string' || ids.indexOf(value) < 0))
          warnings.push(at + ': expected a declared stage id or null — ignored');
      } else if (key === 'note') {
        if (value !== null && typeof value !== 'string') warnings.push(at + ': expected text or null — ignored');
      } else warnings.push(at + ': unknown field — ignored');
    });
  });
}
/* Pure sparse merge. `patch === null` clears everything; a key set to null
   clears that stage; unknown or invalid entries are skipped. Never mutates. */
function funnelMergeCounts(base, patch, ids) {
  var out = {};
  if (patch === null) return out;
  Object.keys(panelObject(base) ? base : {}).forEach(function (id) { out[id] = base[id]; });
  if (!panelObject(patch)) return out;
  ids.forEach(function (id) {
    if (!panelOwn(patch, id)) return;
    var value = patch[id];
    if (value === null) delete out[id];
    else if (bioCount(value)) out[id] = value;
  });
  return out;
}
function funnelCleanState(raw, ids, allowOnce) {
  var out = {};
  if (!panelObject(raw)) return out;
  if (panelOwn(raw, 'active') && (raw.active === null || (typeof raw.active === 'string' && ids.indexOf(raw.active) >= 0)))
    out.active = raw.active;
  if (panelOwn(raw, 'note') && (raw.note === null || typeof raw.note === 'string')) out.note = raw.note;
  if (allowOnce && panelObject(raw.enterOnce)) out.enterOnce = funnelCleanState(raw.enterOnce, ids, false);
  return out;
}
function funnelFold(panel, steps) {
  var ids = funnelStageIds(panel);
  var states = foldSanitizedPanelStates(panel, steps, function (raw, once) { return funnelCleanState(raw, ids, once); });
  var carried = funnelMergeCounts({}, panelObject(panel.initial) && panelOwn(panel.initial, 'counts') ? panel.initial.counts : undefined, ids);
  steps.forEach(function (step, i) {
    var source = stepPanelPatch(step), patch = source && panelOwn(source, panel.id) ? source[panel.id] : null;
    if (!panelObject(patch)) patch = {};
    if (panelOwn(patch, 'counts')) carried = funnelMergeCounts(carried, patch.counts, ids);
    var once = panelObject(patch.enterOnce) && panelOwn(patch.enterOnce, 'counts') ? patch.enterOnce : null;
    states[i].counts = once ? funnelMergeCounts(carried, once.counts, ids) : carried;
  });
  if (!steps.length) states[0].counts = carried;
  return states;
}
function funnelFormat(value) {
  return bioCount(value) ? value.toLocaleString('en-US') : '—';
}
function funnelPct(value) {
  return isFiniteNum(value) ? value.toFixed(1) + '%' : '';
}
/* Rows carry retained share (of the first known count), the change versus
   the previous known stage, and a `grew` flag instead of a negative drop. */
function funnelModel(panel, state) {
  state = panelObject(state) ? state : {};
  var stages = funnelStages(panel), counts = panelObject(state.counts) ? state.counts : {};
  var active = typeof state.active === 'string' ? state.active : null;
  var first = null, prev = null, max = 0, last = null;
  var rows = stages.map(function (stage) {
    var raw = panelOwn(counts, stage.id) ? counts[stage.id] : null;
    var count = bioCount(raw) ? raw : null, known = count !== null;
    var row = {
      id: stage.id, label: stage.label, tone: stage.tone, count: count, known: known, active: stage.id === active,
      pct: null, dropped: null, droppedPct: null, gained: null, gainedPct: null, grew: false, barPct: 0,
    };
    if (known) {
      if (first === null) first = count;
      row.pct = first > 0 ? count / first * 100 : (count === 0 ? 100 : null);
      if (prev !== null) {
        if (count > prev) {
          row.grew = true;
          row.gained = count - prev;
          row.gainedPct = prev > 0 ? row.gained / prev * 100 : null;
        } else {
          row.dropped = prev - count;
          row.droppedPct = prev > 0 ? row.dropped / prev * 100 : (row.dropped === 0 ? 0 : null);
        }
      }
      prev = count;
      last = count;
      max = Math.max(max, count);
    }
    return row;
  });
  rows.forEach(function (row) {
    if (row.known) row.barPct = max > 0 ? row.count / max * 100 : 0;
    if (!isFiniteNum(row.barPct)) row.barPct = 0;
    if (!isFiniteNum(row.pct)) row.pct = null;
    if (!isFiniteNum(row.droppedPct)) row.droppedPct = null;
    if (!isFiniteNum(row.gainedPct)) row.gainedPct = null;
  });
  var retained = first !== null && last !== null ? (first > 0 ? last / first * 100 : (last === 0 ? 100 : null)) : null;
  return {
    rows: rows, unit: funnelUnit(panel), total: first, remaining: last,
    retainedPct: isFiniteNum(retained) ? retained : null, active: active, known: rows.filter(function (row) { return row.known; }).length,
  };
}
function funnelHTML(panel, state, model) {
  model = model || funnelModel(panel, state);
  var unit = esc(model.unit);
  var h = '<div class="funnel" role="list" aria-label="' + esc('Stage counts in ' + model.unit) + '">';
  if (!model.rows.length) h += '<p class="funnel-empty">Declare 2–' + FUNNEL_MAX_STAGES + ' stages to show counts.</p>';
  model.rows.forEach(function (row, i) {
    if (i > 0 && row.known) {
      if (row.grew)
        h += '<div class="funnel-delta funnel-grew" aria-hidden="true"><b>+' + funnelFormat(row.gained) + '</b>' +
          (row.gainedPct !== null ? '<span>(+' + funnelPct(row.gainedPct) + ')</span>' : '') + '<i>grew</i></div>';
      else if (row.dropped !== null)
        h += '<div class="funnel-delta" aria-hidden="true"><b>−' + funnelFormat(row.dropped) + '</b>' +
          (row.droppedPct !== null ? '<span>(−' + funnelPct(row.droppedPct) + ')</span>' : '') + '</div>';
    }
    var text = row.label + ': ' + (row.known ? funnelFormat(row.count) + ' ' + model.unit +
      (row.pct !== null ? ', ' + funnelPct(row.pct) + ' retained' : '') +
      (row.grew ? ', grew by ' + funnelFormat(row.gained) : row.dropped !== null ? ', dropped ' + funnelFormat(row.dropped) : '') :
      'count not yet known') + (row.active ? '. Computing' : '');
    h += '<div class="funnel-row' + (row.active ? ' funnel-active' : '') + (row.known ? '' : ' funnel-unknown') + (row.grew ? ' funnel-row-grew' : '') +
      '" role="listitem" aria-label="' + esc(text) + '">' +
      '<span class="funnel-label" title="' + esc(row.label) + '">' + esc(row.label) + '</span>' +
      '<span class="funnel-track">' + (row.known ? '<span class="funnel-bar' + (row.tone ? ' bio-tone-' + row.tone : '') +
        '" style="width:' + row.barPct.toFixed(3) + '%"></span>' : '') + '</span>' +
      '<span class="funnel-count">' + (row.known ? funnelFormat(row.count) : '—') + '</span>' +
      '<span class="funnel-pct">' + (row.pct !== null ? funnelPct(row.pct) : (row.known ? '' : '—')) + '</span>' +
      (row.active ? '<span class="funnel-live">computing</span>' : '') + '</div>';
  });
  if (model.rows.length)
    h += '<div class="funnel-foot"><span>' + (model.total !== null ? funnelFormat(model.total) + ' ' + unit + ' in' : 'No counts yet') + '</span><span>' +
      (model.remaining !== null && model.known > 1 ? funnelFormat(model.remaining) + ' remain' + (model.retainedPct !== null ? ' · ' + funnelPct(model.retainedPct) : '') : '') + '</span></div>';
  return softwarePanelShell(h + '</div>', state || {});
}
PanelRegistry.define('funnel', {
  label: 'Stage counts', since: '0.2.0', order: 44,
  validateDeclaration: funnelDeclarationWarnings, validatePatch: funnelPatchWarnings, fold: funnelFold,
  render: function (host, panel, state) {
    /* Bars whose count became known since the previous render grow in. The
       previous known set is presentation history only, never folded state. */
    var model = funnelModel(panel, state), known = model.rows.map(function (row) { return row.known; });
    var before = host._funnelKnown || null;
    var entrants = before ? known.map(function (on, i) { return on && !before[i]; }) : null;
    host._funnelKnown = known;
    return { html: funnelHTML(panel, state, model), enterBars: { rows: '.funnel-row', bar: '.funnel-bar', entrants: entrants } };
  },
  presentation: { ambientInitial: true },
  layout: { sectionSizing: { minWidth: 240, preferredWidth: 360, maxWidth: 600, aspectPolicy: 'content', grow: 1 } },
  styles: String.raw`
.funnel{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--dtext);min-width:0}
.funnel-empty{margin:0;color:var(--dfaint)}
.funnel-row{position:relative;display:grid;grid-template-columns:minmax(64px,30%) minmax(0,1fr) auto 46px;align-items:center;gap:8px;padding:3px 5px;border-radius:6px;border:1px solid transparent}
.funnel-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dink)}
.funnel-track{display:block;height:12px;border-radius:6px;background:color-mix(in srgb,var(--dtext) 10%,transparent);overflow:hidden}
.funnel-bar{display:block;height:100%;border-radius:6px;background:var(--dink);transition:width .5s ease}
.funnel-bar.dv-bar-enter{transform-origin:left center;animation:dvbarenter .5s cubic-bezier(.4,0,.2,1)}
.funnel-count{font:600 11px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;color:var(--dink)}
.funnel-pct{font:500 10px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;text-align:right;color:var(--dfaint)}
.funnel-unknown .funnel-count,.funnel-unknown .funnel-label{color:var(--dfaint)}
.funnel-active{border-color:color-mix(in srgb,var(--dink) 45%,transparent);background:color-mix(in srgb,var(--dink) 7%,transparent)}
.funnel-active .funnel-track{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--dink) 24%,transparent) 0 6px,transparent 6px 12px);background-size:17px 12px;animation:funnel-stripe .9s linear infinite}
.funnel-live{position:absolute;right:52px;top:-7px;padding:0 5px;border-radius:7px;font:600 8px/13px 'IBM Plex Mono',monospace;letter-spacing:.6px;text-transform:uppercase;color:var(--dink);background:color-mix(in srgb,var(--dink) 14%,transparent)}
@keyframes funnel-stripe{from{background-position:0 0}to{background-position:17px 0}}
.funnel-delta{display:flex;justify-content:flex-end;align-items:baseline;gap:5px;padding:0 51px 0 0;font:500 10px/1.2 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--dfaint)}
.funnel-delta b{font-weight:600;color:#cf5f6a}.funnel-delta i{font-style:normal;font-size:9px;letter-spacing:.5px;text-transform:uppercase}
.funnel-grew b{color:#3f9a7a}.funnel-grew i{color:#3f9a7a}
.funnel-foot{display:flex;justify-content:space-between;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid color-mix(in srgb,var(--dtext) 14%,transparent);font-size:10px;color:var(--dfaint)}
@media (prefers-reduced-motion:reduce){.funnel-active .funnel-track{animation:none}.funnel-bar{transition:none}.funnel-bar.dv-bar-enter{animation:none}}
@media print{.funnel-track,.funnel-bar{-webkit-print-color-adjust:exact;print-color-adjust:exact}.funnel-active .funnel-track{animation:none}}
`,
  authoring: {
    initialFields: true,
    template: {
      title: 'Read filtering', unit: 'reads',
      stages: [{ id: 'raw', label: 'Raw reads' }, { id: 'qc', label: 'Passed quality filter' }, { id: 'aligned', label: 'Aligned' }],
      initial: { counts: { raw: 1200000 } },
    },
    setupFields: [
      ['unit', 'text'],
      ['stages', 'rows', { max: FUNNEL_MAX_STAGES, cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'tone', kind: 'enum', options: BIO_TONES }] }],
      ['initial', 'json'],
    ],
    patchFields: [['counts', 'json', { nullable: true }], ['active', 'text'], ['note', 'text']],
    expandPatchFields: function (panel) {
      return [['counts', 'json', { nullable: true }], ['active', 'enum', funnelStageIds(panel)], ['note', 'text']];
    },
    fieldMeta: {
      unit: { label: 'Item noun', help: 'What is being counted, e.g. reads, cells, variants. Default items.' },
      stages: { label: 'Stages', help: 'Declare 2–12 stages in pipeline order with unique ids. Optional tone colours that stage’s bar.' },
      counts: { label: 'Counts by stage', help: 'An object keyed by stage id, e.g. {"qc": 980000}. Keys merge into the carried counts; a key set to null forgets that stage; null clears every count.', nullLabel: 'Clear every count' },
      active: { label: 'Stage being computed', help: 'Shows an animated stripe on this stage while the story explains it.', nullLabel: 'No stage active' },
      note: { label: 'Explanation' },
    },
    picker: {
      order: 44, name: 'Stage counts', category: 'Science & sequencing', tagline: 'How many survive each stage',
      description: 'Show the items that remain after each filtering stage of a pipeline, with the drop between stages, so readers see where data is lost.',
    },
    example: function (sample) {
      var panel = sample.panel, state = sample.state;
      panel.unit = 'reads';
      panel.stages = [
        { id: 'raw', label: 'Raw reads' }, { id: 'qc', label: 'Passed quality filter' },
        { id: 'trimmed', label: 'Adapter trimmed' }, { id: 'aligned', label: 'Aligned', tone: 'accent' },
        { id: 'dedup', label: 'Deduplicated', tone: 'good' },
      ];
      state.counts = { raw: 1200000, qc: 1136400, trimmed: 1131900, aligned: 1048600 };
      state.active = 'dedup';
      state.note = 'Illustrative counts. Deduplication is still running.';
      panel.initial = builderClone(state);
      return sample;
    },
  },
});

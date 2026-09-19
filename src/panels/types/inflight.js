/* inflight validation and pure state helpers. */
var INFLIGHT_STATES = ['ok', 'retry', 'failed'];
/* Validate + simulate one inflight patch in the same deterministic order as
   the fold: start, then end, then mark. `open` is lane-id -> true and is
   intentionally carried across steps so impossible histories warn where
   they occur. */
function inflightPatchWarnings(patch, path, info, warnings) {
  var lanes = info.lanes,
    open = info.open;
  function known(lane, p) {
    if (typeof lane !== 'string' || !lanes[lane]) {
      warnings.push(p + ': unknown inflight lane id "' + lane + '" — operation ignored');
      return false;
    }
    return true;
  }
  if (patch.start != null && !Array.isArray(patch.start)) {
    warnings.push(path + '.start: must be an array of {lane, label?} — ignored');
  } else
    (patch.start || []).forEach(function (op, i) {
      var p = path + '.start[' + i + ']';
      if (!op || typeof op !== 'object' || Array.isArray(op)) {
        warnings.push(p + ': expected {lane, label?} — start ignored');
        return;
      }
      if (!known(op.lane, p + '.lane')) return;
      if (open[op.lane])
        warnings.push(
          p + ': lane "' + op.lane + '" is already open — current bar closes and restarts here'
        );
      open[op.lane] = true;
    });
  if (patch.end != null && !Array.isArray(patch.end)) {
    warnings.push(path + '.end: must be an array of lane ids — ignored');
  } else
    (patch.end || []).forEach(function (lane, i) {
      var p = path + '.end[' + i + ']';
      if (!known(lane, p)) return;
      if (!open[lane]) warnings.push(p + ': lane "' + lane + '" has no open bar — end ignored');
      else delete open[lane];
    });
  if (patch.mark != null && !Array.isArray(patch.mark)) {
    warnings.push(path + '.mark: must be an array of {lane, state} — ignored');
  } else
    (patch.mark || []).forEach(function (op, i) {
      var p = path + '.mark[' + i + ']';
      if (!op || typeof op !== 'object' || Array.isArray(op)) {
        warnings.push(p + ': expected {lane, state} — mark ignored');
        return;
      }
      known(op.lane, p + '.lane');
      if (op.state != null && INFLIGHT_STATES.indexOf(op.state) < 0)
        warnings.push(
          p +
            '.state: unknown inflight state "' +
            op.state +
            '" — using "ok" (valid: ' +
            INFLIGHT_STATES.join(' ') +
            ')'
        );
    });
}

/* ---------------- normalize + validate ---------------- */
function foldInflightStates(panel, steps) {
  panel = panel || {};
  steps = Array.isArray(steps) ? steps : [];
  var lanes = {};
  (Array.isArray(panel.lanes) ? panel.lanes : []).slice(0, 8).forEach(function (l) {
    if (l && l.id && !lanes[l.id]) lanes[l.id] = true;
  });
  var bars = [],
    open = {},
    states = [];
  function cloneBars() {
    return bars.map(function (b) {
      return { lane: b.lane, label: b.label, start: b.start, end: b.end, state: b.state };
    });
  }
  steps.forEach(function (st, stepIdx) {
    var all = stepPanelPatch(st) || {};
    var patch = all[panel.id];
    patch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    (Array.isArray(patch.start) ? patch.start : []).forEach(function (op) {
      if (!op || typeof op !== 'object' || !lanes[op.lane]) return;
      if (open[op.lane] != null) bars[open[op.lane]].end = stepIdx;
      var bar = {
        lane: op.lane,
        label: op.label != null ? String(op.label) : '',
        start: stepIdx,
        end: null,
        state: 'ok',
      };
      bars.push(bar);
      open[op.lane] = bars.length - 1;
    });
    (Array.isArray(patch.end) ? patch.end : []).forEach(function (lane) {
      if (!lanes[lane] || open[lane] == null) return;
      bars[open[lane]].end = stepIdx;
      delete open[lane];
    });
    (Array.isArray(patch.mark) ? patch.mark : []).forEach(function (op) {
      if (!op || typeof op !== 'object' || !lanes[op.lane] || open[op.lane] == null) return;
      bars[open[op.lane]].state = INFLIGHT_STATES.indexOf(op.state) >= 0 ? op.state : 'ok';
    });
    states.push({ bars: cloneBars(), currentStep: stepIdx, stepCount: steps.length });
  });
  if (!steps.length) states.push({ bars: [], currentStep: 0, stepCount: 0 });
  return states;
}

PanelRegistry.extend('inflight', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    var laneMap = {};
    var context = { decl: p, lanes: laneMap, open: {} };
    if (!(Array.isArray(p.lanes) && p.lanes.length)) {
      warnings.push(PP + '.lanes: inflight needs 1–8 lanes [{id, label}] — panel renders empty');
    } else {
      if (p.lanes.length > 8)
        warnings.push(PP + '.lanes: more than 8 lanes — extra lanes are not rendered');
      p.lanes.slice(0, 8).forEach(function (l, li) {
        var LP = PP + '.lanes[' + li + ']';
        if (!l || typeof l !== 'object' || Array.isArray(l) || !l.id) {
          warnings.push(LP + ': needs {id, label?} — lane skipped');
        } else if (laneMap[l.id]) {
          warnings.push(LP + '.id: duplicate inflight lane id "' + l.id + '" — later lane skipped');
        } else {
          laneMap[l.id] = true;
        }
      });
    }
    return context;
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    inflightPatchWarnings(patch, path, context, warnings);
  },
  fold: foldInflightStates,
});

/* inflight panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function inflightModel(panel, state, stepCount, currentStep) {
  panel = panel || {};
  state = state || {};
  var seen = {};
  var lanes = (Array.isArray(panel.lanes) ? panel.lanes : [])
    .slice(0, 8)
    .map(function (l) {
      if (!l || !l.id || seen[l.id]) return null;
      seen[l.id] = true;
      return {
        id: String(l.id),
        label: l.label != null ? String(l.label) : String(l.id),
        bars: [],
      };
    })
    .filter(Boolean);
  var byId = {};
  lanes.forEach(function (l) {
    byId[l.id] = l;
  });
  var n =
    typeof stepCount === 'number' && isFinite(stepCount)
      ? Math.max(0, Math.round(stepCount))
      : typeof state.stepCount === 'number'
      ? Math.max(0, Math.round(state.stepCount))
      : 0;
  var cur =
    typeof currentStep === 'number' && isFinite(currentStep)
      ? Math.round(currentStep)
      : typeof state.currentStep === 'number'
      ? Math.round(state.currentStep)
      : 0;
  if (n) cur = clamp(cur, 0, n - 1);
  else cur = 0;
  (Array.isArray(state.bars) ? state.bars : []).forEach(function (b) {
    if (!b || !byId[b.lane] || !validRevealIndex(b.start)) return;
    var end = validRevealIndex(b.end) ? b.end : null;
    var st = INFLIGHT_STATES.indexOf(b.state) >= 0 ? b.state : 'ok';
    byId[b.lane].bars.push({
      lane: b.lane,
      label: b.label != null ? String(b.label) : '',
      start: b.start,
      end: end,
      state: st,
      open: end == null,
    });
  });
  return { lanes: lanes, stepCount: n, currentStep: cur };
}

function inflightPanelHTML(panel, state, stepCount, currentStep) {
  var m = inflightModel(panel, state, stepCount, currentStep);
  if (!m.lanes.length) return '<div class="ifempty">no lanes</div>';
  var n = Math.max(1, m.stepCount);
  var h =
    '<div class="ifbox"><div class="ifaxis"><span class="ifaxislabel">step</span><span class="ifticks">';
  for (var i = 0; i < m.stepCount; i++) {
    h +=
      '<span class="iftick' +
      (i === m.currentStep ? ' cur' : '') +
      '" style="left:' +
      (((i + 0.5) / n) * 100).toFixed(3) +
      '%">' +
      i +
      '</span>';
  }
  h += '</span></div>';
  m.lanes.forEach(function (lane) {
    h +=
      '<div class="ifrow"><span class="iflabel" title="' +
      esc(lane.label) +
      '">' +
      esc(lane.label) +
      '</span><span class="iftrack">';
    if (m.stepCount)
      h +=
        '<i class="ifnow" style="left:' +
        ((m.currentStep / n) * 100).toFixed(3) +
        '%;width:' +
        (100 / n).toFixed(3) +
        '%"></i>';
    for (var gi = 1; gi < n; gi++)
      h += '<i class="ifgrid" style="left:' + ((gi / n) * 100).toFixed(3) + '%"></i>';
    lane.bars.forEach(function (bar) {
      var last = bar.open ? m.currentStep : bar.end;
      last = Math.max(bar.start, Math.min(n - 1, last));
      var left = (bar.start / n) * 100;
      var width = ((last - bar.start + 1) / n) * 100;
      h +=
        '<b class="ifbar s-' +
        bar.state +
        (bar.open ? ' open' : '') +
        '" style="left:' +
        left.toFixed(3) +
        '%;width:' +
        width.toFixed(3) +
        '%" title="' +
        esc(bar.label || lane.label) +
        ' · steps ' +
        bar.start +
        (bar.open ? '+' : '–' + bar.end) +
        '">' +
        esc(bar.label) +
        '</b>';
    });
    h += '</span></div>';
  });
  return h + '</div>';
}

/* Stable presentation keys and target widths for inflight bars. These frames
   are never folded back into state; they only let a rebuilt bar begin at its
   previous painted width during an adjacent transition. */
function inflightBarFrames(model) {
  var frames = [],
    seen = {},
    n = Math.max(1, model.stepCount);
  model.lanes.forEach(function (lane) {
    lane.bars.forEach(function (bar) {
      var base = lane.id + '\n' + bar.start + '\n' + bar.label;
      var ordinal = seen[base] || 0;
      seen[base] = ordinal + 1;
      var last = bar.open ? model.currentStep : bar.end;
      last = Math.max(bar.start, Math.min(n - 1, last));
      frames.push({
        key: base + '\n' + ordinal,
        width: ((last - bar.start + 1) / n) * 100,
      });
    });
  });
  return frames;
}

/* phone widget: a generic handset lock screen backed by the absolute unread
   stack produced by foldPhoneStates. The model keeps the full count for the
   computed badge while exposing only the three cards that can fit. */

PanelViews.register('inflight', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var inflightFramesNow, inflightFramesPrev;
  var ifmNow = inflightModel(
    panel,
    state,
    Array.isArray(states) ? states.length : state.stepCount,
    stepIdx
  );
  inflightFramesNow = inflightBarFrames(ifmNow);
  inflightFramesPrev = host._ifFrames || null;
  host._ifFrames = {};
  inflightFramesNow.forEach(function (frame) {
    host._ifFrames[frame.key] = frame.width;
  });
  h += inflightPanelHTML(
    panel,
    state,
    Array.isArray(states) ? states.length : state.stepCount,
    stepIdx
  );
  return {
    html: h,
    bars: {
      selector: '.ifbar',
      frames: inflightFramesNow,
      previous: inflightFramesPrev,
    },
  };
});

PanelRegistry.extend('inflight', {
  order: 19,
  label: 'In-flight activity',
  since: '0.1.0',
});

PanelRegistry.extend('inflight', {
  styles: [
    {
      order: 345,
      css: String.raw`.ifbox{font:500 9.5px 'IBM Plex Mono',monospace;}
.ifaxis,.ifrow{display:grid;grid-template-columns:72px minmax(0,1fr);gap:7px;align-items:center;}
.ifaxis{margin-bottom:3px;}
.ifaxislabel{text-transform:uppercase;letter-spacing:.08em;font-size:8.5px;opacity:.65;}
.ifticks{height:17px;position:relative;display:block;}
.iftick{position:absolute;top:0;transform:translateX(-50%);width:16px;height:16px;line-height:16px;
  text-align:center;border-radius:5px;opacity:.6;}
.iftick.cur{opacity:1;font-weight:700;}
.ifrow{min-height:25px;}
.iflabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.iftrack{position:relative;display:block;height:20px;border-radius:6px;overflow:hidden;}
.ifgrid,.ifnow{position:absolute;top:0;bottom:0;display:block;pointer-events:none;}`,
    },
    {
      order: 357,
      css: String.raw`.ifnow{z-index:0;}
.ifbar{position:absolute;z-index:1;top:3px;height:14px;line-height:14px;box-sizing:border-box;
  min-width:5px;padding:0 4px;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:8px;font-weight:700;color:#08120C;
  transition:width .55s cubic-bezier(.4,0,.2,1), opacity .3s ease;}
.ifbar.s-ok{background:#4ADE80;}
.ifbar.s-retry{background:#FFB454;color:#2C1800;}
.ifbar.s-failed{background:#F87171;color:#2C0808;}
.ifbar.open{border-right:3px dotted rgba(0,0,0,.55);border-top-right-radius:1px;border-bottom-right-radius:1px;}
.ifempty{font:500 10.5px 'IBM Plex Mono',monospace;opacity:.65;}
.sk-aurora .ifaxis,.sk-aurora .iflabel{color:#93A7C9;}
.sk-aurora .iftick.cur{background:#0C2230;color:#8AE8FF;}
.sk-aurora .iftrack{background:#101A2C;border:1px solid #1D2A40;}`,
    },
    {
      order: 368,
      css: String.raw`.sk-aurora .ifnow{background:rgba(56,225,255,.08);}
.sk-daylight .ifaxis,.sk-daylight .iflabel{color:#6B6F7A;}
.sk-daylight .iftick.cur{background:#EEF0FB;color:#4956C9;}
.sk-daylight .iftrack{background:#F4F2EC;border:1px solid #E0DCD1;}`,
    },
    { order: 373, css: String.raw`.sk-daylight .ifnow{background:rgba(73,86,201,.08);}` },
  ],
});

/* inflight authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('inflight', {
  authoring: {
    template: { title: 'In flight', lanes: [{ id: 'op', label: 'operation' }] },
    setupFields: [
      ['lanes', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }] }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['start', 'jsonArr'],
      ['end', 'jsonArr'],
      ['mark', 'jsonArr'],
    ],
    picker: {
      order: 6,
      name: 'In-flight work',
      category: 'Software & data',
      tagline: 'Concurrent operations',
      description:
        'Put overlapping operations on the same step axis so concurrency is easy to follow.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'bars')
        return history(['start', 'end', 'mark'], false, 'Computed start/end/mark history');
      return {
        kind: 'engine',
        label: key === 'currentStep' ? 'Engine · current step' : 'Engine · total steps',
        inputs: [],
      };
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.lanes = [
        { id: 'request', label: 'Request' },
        { id: 'query', label: 'Database' },
        { id: 'event', label: 'Event' },
      ];
      state = {
        bars: [
          { lane: 'request', start: 0, end: 5, label: 'handle request' },
          { lane: 'query', start: 1, end: 3, label: 'query' },
          { lane: 'event', start: 3, label: 'publish' },
        ],
      };
      states = [{}, {}, {}, {}, {}, {}];
      step = 5;

      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});

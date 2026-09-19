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
      h +=
        '<i class="ifgrid" style="left:' +
        ((gi / n) * 100).toFixed(3) +
        '%"></i>';
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

PanelViews.register(
  'inflight',
  function (host, panel, state, skin, states, stepIdx, animate) {
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
  }
);

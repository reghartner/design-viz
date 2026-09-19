/* trace validation and pure state helpers. */
/* Never calculate an apparently precise trace breakdown from malformed or
   cyclic data. Partial, structurally sound traces remain inspectable. */
function tracePanelData(p) {
  var spans = Array.isArray(p.spans) ? p.spans : [],
    errors = [],
    notices = [],
    byId = new Map();
  if (!spans.length || spans.length > 200)
    return { spans: [], errors: ['spans: expected 1–200 spans; timing unavailable'], notices: [] };
  spans.forEach(function (s, i) {
    var at = 'spans[' + i + ']';
    if (!s || typeof s !== 'object') {
      errors.push(at + ': expected a span object');
      return;
    }
    ['id', 'service', 'name'].forEach(function (k) {
      if (typeof s[k] !== 'string' || !s[k].trim())
        errors.push(at + '.' + k + ': expected a non-empty string');
    });
    if (byId.has(s.id)) errors.push(at + '.id: duplicate span id');
    byId.set(s.id, s);
    if (s.parentId != null && typeof s.parentId !== 'string')
      errors.push(at + '.parentId: expected a string or null');
    if (!isFiniteNum(s.ms) || s.ms < 0)
      errors.push(at + '.ms: expected a finite non-negative duration');
    if (!isFiniteNum(s.startMs) || s.startMs < 0 || !isFiniteNum(s.startMs + s.ms))
      errors.push(at + '.startMs: expected a finite non-negative offset and end');
  });
  if (errors.length) return { spans: [], errors: errors, notices: [] };
  var missing = 0,
    skew = 0;
  spans.forEach(function (s) {
    var seen = new Set([s.id]),
      parent = s.parentId;
    while (parent && byId.has(parent)) {
      if (seen.has(parent)) {
        errors.push('spans: parent cycle at ' + s.id);
        break;
      }
      seen.add(parent);
      parent = byId.get(parent).parentId;
    }
    var p = byId.get(s.parentId);
    if (s.parentId && !p) missing++;
    if (p && (s.startMs < p.startMs || s.startMs + s.ms > p.startMs + p.ms + 0.001)) skew++;
  });
  if (missing) notices.push(missing + ' span(s) have missing parents; coverage is partial.');
  if (skew)
    notices.push(
      skew +
        ' child span(s) extend beyond their parent; coverage clips these intervals, while timing rows retain the original offsets.'
    );
  return { spans: errors.length ? [] : spans.slice(), errors: errors, notices: notices };
}
function tracePanelPatchWarnings(state, path, p, warnings) {
  if (state == null) return;
  if (!panelObject(state)) {
    warnings.push(path + ': expected a state object');
    return;
  }
  if (
    state.selected != null &&
    !(
      Array.isArray(p.spans) &&
      p.spans.some(function (s) {
        return s && s.id === state.selected;
      })
    )
  )
    warnings.push(path + '.selected: no matching span; timing unavailable');
  if (state.enterOnce != null) {
    if (!panelObject(state.enterOnce)) warnings.push(path + '.enterOnce: expected an object');
    else {
      var once = Object.assign({}, state.enterOnce);
      delete once.enterOnce;
      tracePanelPatchWarnings(once, path + '.enterOnce', p, warnings);
    }
  }
}

PanelRegistry.extend('trace', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    var traceData = tracePanelData(p);
    traceData.errors.concat(traceData.notices).forEach(function (message) {
      warnings.push(PP + '.' + message);
    });
    tracePanelPatchWarnings(p.initial, PP + '.initial', p, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    tracePanelPatchWarnings(patch, path, panel, warnings);
  },
});

/* trace panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function traceIntervalUnion(intervals) {
  var sorted = intervals
      .filter(function (v) {
        return v[1] > v[0];
      })
      .map(function (v) {
        return v.slice();
      })
      .sort(function (a, b) {
        return a[0] - b[0] || a[1] - b[1];
      }),
    out = [];
  sorted.forEach(function (v) {
    var last = out[out.length - 1];
    if (last && v[0] <= last[1]) last[1] = Math.max(last[1], v[1]);
    else out.push(v);
  });
  return out;
}
function traceTimingModel(panel, state) {
  var data = tracePanelData(panel);
  if (data.errors.length) return { errors: data.errors, notices: data.notices };
  var spans = data.spans.sort(function (a, b) {
    return a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  var byId = new Map(),
    children = new Map();
  spans.forEach(function (s) {
    byId.set(s.id, s);
  });
  spans.forEach(function (s) {
    if (!children.has(s.parentId)) children.set(s.parentId, []);
    children.get(s.parentId).push(s);
  });
  var selected = state && state.selected != null ? byId.get(state.selected) : spans[0];
  if (!selected) return { errors: ['Selected span is unavailable.'], notices: data.notices };
  function duration(intervals) {
    return intervals.reduce(function (sum, v) {
      return sum + (v[1] - v[0]);
    }, 0);
  }
  function stats(s) {
    var childSpans = children.get(s.id) || [];
    var covered = traceIntervalUnion(
      childSpans.map(function (c) {
        return [Math.max(s.startMs, c.startMs), Math.min(s.startMs + s.ms, c.startMs + c.ms)];
      })
    );
    var childMs = Math.min(s.ms, duration(covered));
    return {
      span: s,
      covered: covered,
      childMs: childMs,
      uncoveredMs: Math.max(0, s.ms - childMs),
      children: childSpans,
    };
  }
  var serviceSpans = spans.filter(function (s) {
    return s.service === selected.service;
  });
  var serviceIntervals = traceIntervalUnion(
    serviceSpans.map(function (s) {
      return [s.startMs, s.startMs + s.ms];
    })
  );
  var serviceStart = Math.min.apply(
    null,
    serviceSpans.map(function (s) {
      return s.startMs;
    })
  );
  var serviceEnd = Math.max.apply(
    null,
    serviceSpans.map(function (s) {
      return s.startMs + s.ms;
    })
  );
  var rows = [];
  function visit(s, depth) {
    if (s.service === selected.service) {
      var row = stats(s);
      row.depth = depth;
      rows.push(row);
    }
    (children.get(s.id) || []).forEach(function (c) {
      visit(c, depth + 1);
    });
  }
  spans
    .filter(function (s) {
      return !s.parentId || !byId.has(s.parentId);
    })
    .forEach(function (s) {
      visit(s, 0);
    });
  return {
    errors: [],
    notices: data.notices,
    selected: stats(selected),
    rows: rows,
    service: selected.service,
    serviceStart: serviceStart,
    serviceEnd: serviceEnd,
    serviceCoverageMs: duration(serviceIntervals),
  };
}
function tracePanelHTML(panel, state, states) {
  var m = traceTimingModel(panel, state);
  function ms(n) {
    return String(Math.round(n * 1000) / 1000) + ' ms';
  }
  if (m.errors.length)
    return (
      '<div class="tr-time"><b>Timing unavailable</b><p>' + esc(m.errors.join(' · ')) + '</p></div>'
    );
  var s = m.selected,
    duration = s.span.ms,
    h = '<div class="tr-time">';
  var serviceSteps = new Map(),
    spanServices = new Map();
  panel.spans.forEach(function (span) {
    spanServices.set(span.id, span.service);
  });
  (states || []).forEach(function (st, i) {
    var service = st && spanServices.get(st.selected);
    if (service && !serviceSteps.has(service)) serviceSteps.set(service, i);
  });
  if (serviceSteps.size > 1) {
    h +=
      '<label class="tr-picker">Inspect service<select data-dv-trace-service aria-label="Inspect service">';
    serviceSteps.forEach(function (i, service) {
      h +=
        '<option value="' +
        i +
        '"' +
        (service === m.service ? ' selected' : '') +
        '>' +
        esc(service) +
        '</option>';
    });
    h += '</select></label>';
  }
  h +=
    '<div class="tr-service">' +
    esc(m.service) +
    '</div><p class="tr-coverage">Service span coverage (union): <b>' +
    ms(m.serviceCoverageMs) +
    '</b> · ' +
    m.rows.length +
    ' observed span(s)</p>';
  h +=
    '<div class="tr-selected"><b>' +
    esc(s.span.name) +
    '</b><code>' +
    esc(s.span.id) +
    '</code><small>Parent: ' +
    esc(s.span.parentId || 'none') +
    '</small></div>';
  h +=
    '<dl class="tr-metrics"><div><dt>Inclusive</dt><dd>' +
    ms(duration) +
    '</dd></div><div><dt>Child-covered</dt><dd>' +
    ms(s.childMs) +
    '</dd></div><div><dt>Uncovered</dt><dd>' +
    ms(s.uncoveredMs) +
    '</dd></div></dl>';
  h +=
    '<div class="tr-interval' +
    (duration === 0 ? ' tr-zero' : '') +
    '" role="img" aria-label="' +
    esc(
      'Selected span: ' +
        ms(duration) +
        ' inclusive, ' +
        ms(s.childMs) +
        ' child-covered, ' +
        ms(s.uncoveredMs) +
        ' uncovered'
    ) +
    '">';
  s.covered.forEach(function (v) {
    h +=
      '<span class="tr-covered" style="left:' +
      (((v[0] - s.span.startMs) / duration) * 100).toFixed(4) +
      '%;width:' +
      (((v[1] - v[0]) / duration) * 100).toFixed(4) +
      '%"></span>';
  });
  h +=
    '</div><p class="tr-key">' +
    (duration === 0
      ? 'Zero-duration span; no wall-time interval.'
      : '<span>Blue: child-covered</span> · <span>Hatched: uncovered</span>') +
    '</p>';
  h +=
    '<p class="tr-explain">Direct-child intervals count once where they overlap and are clipped to this span. Uncovered wall time can include local work, waiting, and missing instrumentation; it is not CPU time.</p>';
  m.notices.forEach(function (n) {
    h += '<p class="tr-notice">' + esc(n) + '</p>';
  });
  h +=
    '<div class="tr-ophead">Service operations · inclusive / uncovered</div><div class="tr-operations">';
  m.rows.forEach(function (r) {
    var step = (states || []).findIndex(function (st) {
      return st && st.selected === r.span.id;
    });
    var extent = m.serviceEnd - m.serviceStart,
      selected = r.span.id === s.span.id;
    var description =
      r.span.name +
      ' · ' +
      r.span.id +
      ' · parent ' +
      (r.span.parentId || 'none') +
      ' · +' +
      ms(r.span.startMs) +
      ' · ' +
      ms(r.span.ms) +
      ' inclusive / ' +
      ms(r.uncoveredMs) +
      ' uncovered' +
      (r.span.error === true ? ' · recorded error' : '');
    h +=
      '<' +
      (step >= 0 ? 'button type="button" data-dv-trace-step="' + step + '"' : 'div') +
      ' class="tr-op' +
      (selected ? ' tr-current' : '') +
      '" title="' +
      esc(description) +
      '"' +
      (step >= 0 ? ' aria-label="Inspect ' + esc(description) + '"' : '') +
      '>';
    h +=
      '<span class="tr-opname">' +
      (r.depth ? '↳ ' : '') +
      esc(r.span.name) +
      (r.span.error === true ? ' · ERROR' : '') +
      '</span><span class="tr-opvalues">' +
      ms(r.span.ms) +
      ' / ' +
      ms(r.uncoveredMs) +
      '</span>';
    h +=
      '<span class="tr-optrack"><span style="left:' +
      (extent ? ((r.span.startMs - m.serviceStart) / extent) * 100 : 0).toFixed(4) +
      '%;width:' +
      (extent ? (r.span.ms / extent) * 100 : 0).toFixed(4) +
      '%"></span></span>';
    h += '</' + (step >= 0 ? 'button' : 'div') + '>';
  });
  h +=
    '</div><p class="tr-explain">Rows share the service’s +' +
    ms(m.serviceStart) +
    ' to +' +
    ms(m.serviceEnd) +
    ' scale. Nested spans overlap; row durations must not be added. The parent ID remains in each row’s tooltip.</p>';
  if (s.children.length) {
    h +=
      '<details class="tr-children"><summary>' +
      s.children.length +
      ' direct child span(s)</summary><ul>';
    s.children.forEach(function (c) {
      h +=
        '<li>' +
        esc(c.service + ' · ' + c.name) +
        ' · ' +
        ms(c.ms) +
        (c.service === m.service ? ' · same service' : ' · other service') +
        '</li>';
    });
    h += '</ul></details>';
  }
  return h + '</div>';
}

PanelViews.register(
  'trace',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    h = tracePanelHTML(panel, state, states);
    return { html: h };
  },
  { historyRequiresSteps: true }
);

PanelRegistry.extend('trace', {
  order: 26,
  label: 'Trace',
  since: '0.1.0',
});

PanelRegistry.extend('trace', {
  styles: [
    {
      order: 2241,
      css: String.raw`.tr-time{color:var(--dtext);font:12px/1.5 'IBM Plex Sans',sans-serif;overflow-wrap:anywhere;}
.tr-service{font-weight:700;font-size:15px;}
.tr-picker{display:grid;gap:4px;margin-bottom:10px;font-weight:600;}
.tr-picker select{width:100%;min-width:0;padding:6px;border:1px solid currentColor;border-radius:5px;background:transparent;color:inherit;font:inherit;}
.tr-picker option{color:#182334;background:#F8FAFC;}
.tr-coverage,.tr-explain,.tr-key{font-size:11px;line-height:1.45;margin:7px 0;}
.tr-selected{display:grid;gap:3px;padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 25%,transparent);}
.tr-selected code{font-size:10px;}
.tr-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:5px 0 9px;}
.tr-metrics dt{font-size:10px;}
.tr-metrics dd{margin:0;font-weight:700;font-size:14px;}
.tr-interval{height:20px;position:relative;border:1px solid currentColor;border-radius:4px;overflow:hidden;
  background:repeating-linear-gradient(135deg,transparent 0 4px,color-mix(in srgb,currentColor 30%,transparent) 4px 6px);}
.tr-covered{position:absolute;top:0;bottom:0;background:#287DC1;}
.tr-zero{background:none;}
.tr-notice{border-left:3px solid currentColor;padding-left:6px;font-size:11px;}
.tr-ophead{margin-top:12px;font-weight:600;font-size:11px;}
.tr-operations{max-height:300px;overflow:auto;}
.tr-op{display:grid;width:100%;grid-template-columns:minmax(0,1fr);gap:2px;text-align:left;padding:7px;margin:4px 0;
  color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:5px;font:inherit;}
button.tr-op{cursor:pointer;}
.tr-current{border:2px solid currentColor;padding:6px;}
.tr-opname{font-weight:600;}
.tr-opvalues{font:10px 'IBM Plex Mono',monospace;}
.tr-optrack{height:7px;position:relative;background:color-mix(in srgb,currentColor 12%,transparent);}
.tr-optrack>span{position:absolute;top:0;bottom:0;background:currentColor;}
.tr-op:focus-visible,.tr-picker select:focus-visible{outline:2px solid currentColor;outline-offset:2px;}
.tr-children{font-size:11px;margin-top:8px;}
.tr-children summary{cursor:pointer;font-weight:600;}
.tr-children ul{padding-left:18px;}
@media print{.tr-operations{max-height:none;overflow:visible;}}
@media print{.tr-picker{display:none;}}
@media print{.tr-covered{background:#AAA;print-color-adjust:exact;}}`,
    },
  ],
});

/* trace authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('trace', {
  authoring: {
    template: {
      title: 'Inside the service',
      spans: [
        { id: 'request', service: 'api', name: 'handle request', startMs: 0, ms: 100 },
        {
          id: 'parse',
          parentId: 'request',
          service: 'api',
          name: 'parse input',
          startMs: 5,
          ms: 20,
        },
        {
          id: 'query',
          parentId: 'request',
          service: 'database',
          name: 'query',
          startMs: 30,
          ms: 50,
        },
      ],
      initial: { selected: 'request' },
    },
    setupFields: [
      ['spans', 'json'],
      ['initial', 'json'],
    ],
    patchFields: [['selected', 'text']],
    picker: {
      order: 3,
      name: 'Service trace',
      category: 'Software & data',
      tagline: 'Inside a request',
      description: 'Break a request into nested spans to show where services spend their time.',
    },
  },
});

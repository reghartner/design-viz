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
  var selected =
    state && state.selected != null ? byId.get(state.selected) : spans[0];
  if (!selected)
    return { errors: ['Selected span is unavailable.'], notices: data.notices };
  function duration(intervals) {
    return intervals.reduce(function (sum, v) {
      return sum + (v[1] - v[0]);
    }, 0);
  }
  function stats(s) {
    var childSpans = children.get(s.id) || [];
    var covered = traceIntervalUnion(
      childSpans.map(function (c) {
        return [
          Math.max(s.startMs, c.startMs),
          Math.min(s.startMs + s.ms, c.startMs + c.ms),
        ];
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
      '<div class="tr-time"><b>Timing unavailable</b><p>' +
      esc(m.errors.join(' · ')) +
      '</p></div>'
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
      (step >= 0
        ? 'button type="button" data-dv-trace-step="' + step + '"'
        : 'div') +
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
      (extent ? ((r.span.startMs - m.serviceStart) / extent) * 100 : 0).toFixed(
        4
      ) +
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

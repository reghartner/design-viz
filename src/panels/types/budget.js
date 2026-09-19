/* Budget metrics share collection rules and own their numeric constraints. */
function budgetPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, panel, warnings) {
    panelKeyedStateWarnings(state, path, panel, warnings, 'values', function (value, at, warnings) {
      if (value !== null && (!isFiniteNum(value) || value < 0))
        warnings.push(at + ': expected a finite non-negative number or null — rendered as NO DATA');
    });
  });
}
PanelRegistry.extend('budget', {
  itemCollection: { key: 'metrics', max: 6 },
  validateDeclaration: function (panel, path, warnings) {
    panelCollectionWarnings(panel, path, warnings, 'metrics', 6, function (item, at, warnings) {
      if (!isFiniteNum(item.max) || item.max <= 0)
        warnings.push(at + '.max: needs a finite positive upper limit — rendered as NO LIMIT');
      if (item.warn != null && (!isFiniteNum(item.warn) || item.warn < 0 || item.warn > item.max))
        warnings.push(at + '.warn: expected a number from 0 to max — warning threshold ignored');
    });
    budgetPatchWarnings(panel.initial, path + '.initial', panel, warnings);
  },
  validatePatch: budgetPatchWarnings,
});

/* budget panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function budgetModel(panel, state) {
  state = state || {};
  return softwarePanelItems(panel).map(function (metric) {
    var raw = panelOwn(state.values, metric.id) ? state.values[metric.id] : null;
    var value = isFiniteNum(raw) && raw >= 0 ? raw : null;
    var max = isFiniteNum(metric.max) && metric.max > 0 ? metric.max : null;
    var warn =
      max !== null && isFiniteNum(metric.warn) && metric.warn >= 0 && metric.warn <= max
        ? metric.warn
        : null;
    var status =
      value === null
        ? 'unknown'
        : max === null
        ? 'unbounded'
        : value > max
        ? 'over'
        : value === max
        ? 'limit'
        : warn !== null && value >= warn
        ? 'warn'
        : 'ok';
    return {
      id: metric.id,
      label: metric.label || metric.id,
      unit: metric.unit || '',
      value: value,
      max: max,
      warn: warn,
      status: status,
      pct: value !== null && max !== null ? Math.min(value / max, 1) * 100 : 0,
      remaining: value !== null && max !== null ? max - value : null,
    };
  });
}

PanelViews.register('budget', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var metrics = budgetModel(panel, state);
  var labels = {
    unknown: 'NO DATA',
    unbounded: 'NO LIMIT',
    over: 'OVER LIMIT',
    limit: 'AT LIMIT',
    warn: 'NEAR LIMIT',
    ok: 'WITHIN LIMIT',
  };
  metrics.forEach(function (metric) {
    var tone =
      metric.status === 'over'
        ? 'fail'
        : ['warn', 'limit'].indexOf(metric.status) >= 0
        ? 'warn'
        : metric.status === 'ok'
        ? 'pass'
        : 'pending';
    h +=
      '<div class="swmetric"><div class="swcheckhead"><span>' +
      esc(metric.label) +
      '</span>' +
      '<span class="swbadge sw-' +
      tone +
      '">' +
      labels[metric.status] +
      '</span></div>' +
      '<div class="swmeasure"><strong>' +
      (metric.value === null ? '—' : esc(String(metric.value))) +
      '</strong>' +
      ' / ' +
      (metric.max === null ? '—' : esc(String(metric.max))) +
      ' ' +
      esc(metric.unit) +
      '</div>';
    if (metric.value !== null && metric.max !== null) {
      h +=
        '<div class="swtrack" role="img" aria-label="' +
        esc(
          metric.label +
            ': ' +
            metric.value +
            ' of ' +
            metric.max +
            ' ' +
            metric.unit +
            ', ' +
            labels[metric.status]
        ) +
        '">' +
        '<div class="swfill sw-' +
        tone +
        '" style="width:' +
        metric.pct.toFixed(2) +
        '%"></div>';
      if (metric.warn !== null)
        h +=
          '<span class="swthreshold" style="left:' +
          ((metric.warn / metric.max) * 100).toFixed(2) +
          '%" title="Warning at ' +
          esc(String(metric.warn)) +
          '"></span>';
      h +=
        '</div><div class="swdetail">' +
        esc(String(Number(Math.abs(metric.remaining).toPrecision(6)))) +
        ' ' +
        esc(metric.unit) +
        (metric.remaining < 0 ? ' over budget' : ' remaining') +
        '</div>';
    }
    h += '</div>';
  });
  if (!metrics.length) h += '<div class="swempty">No budgets declared</div>';
  h = softwarePanelShell(h, state);
  return { html: h };
});

PanelRegistry.extend('budget', {
  order: 25,
  label: 'Budget',
  since: '0.1.0',
});

PanelRegistry.extend('budget', {
  styles: [
    {
      order: 291,
      css: String.raw`.swmeasure{font:11px/1.6 'IBM Plex Mono',monospace; margin:4px 0 6px;}
.swmeasure strong{font-size:19px; color:var(--dink);}
.swtrack{height:7px; border-radius:4px; position:relative; background:color-mix(in srgb,var(--dtext) 12%,transparent);}
.swfill{height:100%; border-radius:4px; background:currentColor;}
.swthreshold{position:absolute; top:-3px; height:13px; border-left:1px dashed var(--dink);}`,
    },
  ],
});

/* budget authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('budget', {
  authoring: {
    template: {
      title: 'Resource budgets',
      metrics: [{ id: 'latency', label: 'Latency', unit: 'ms', max: 300, warn: 240 }],
      initial: {
        values: { latency: null },
        note: 'Example limit — replace with the design’s target.',
      },
    },
    setupFields: [
      [
        'metrics',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'unit' },
            { k: 'max', kind: 'num', req: true },
            { k: 'warn', kind: 'num' },
          ],
          max: 6,
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['values', 'json'],
      ['note', 'text'],
    ],
    picker: {
      order: 2,
      name: 'Resource budget',
      category: 'Software & data',
      tagline: 'Targets and thresholds',
      description:
        'Compare latency, capacity, or cost against an explicit limit and warning threshold.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.values = { latency: 186 };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});

/* budget panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function budgetModel(panel, state) {
  state = state || {};
  return softwarePanelItems(panel).map(function (metric) {
    var raw = panelOwn(state.values, metric.id)
      ? state.values[metric.id]
      : null;
    var value = isFiniteNum(raw) && raw >= 0 ? raw : null;
    var max = isFiniteNum(metric.max) && metric.max > 0 ? metric.max : null;
    var warn =
      max !== null &&
      isFiniteNum(metric.warn) &&
      metric.warn >= 0 &&
      metric.warn <= max
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

PanelViews.register(
  'budget',
  function (host, panel, state, skin, states, stepIdx, animate) {
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
  }
);

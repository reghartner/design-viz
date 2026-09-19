/* checks panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function checksModel(panel, state) {
  state = state || {};
  return softwarePanelItems(panel).map(function (check) {
    var result =
      panelOwn(state.results, check.id) && panelObject(state.results[check.id])
        ? state.results[check.id]
        : {};
    return {
      id: check.id,
      label: check.label || check.id,
      status:
        CHECK_STATUSES.indexOf(result.status) >= 0 ? result.status : 'pending',
      detail: result.detail == null ? '' : String(result.detail),
    };
  });
}

PanelViews.register(
  'checks',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var checks = checksModel(panel, state),
      passed = checks.filter(function (c) {
        return c.status === 'pass';
      }).length;
    h +=
      '<div class="swsummary">' +
      passed +
      ' / ' +
      checks.length +
      ' passed <span>Authored outcomes</span></div><ul class="swchecks">';
    checks.forEach(function (check) {
      h +=
        '<li><div class="swcheckhead"><span>' +
        esc(check.label) +
        '</span>' +
        '<span class="swbadge sw-' +
        check.status +
        '">' +
        check.status +
        '</span></div>' +
        (check.detail
          ? '<div class="swdetail">' + esc(check.detail) + '</div>'
          : '') +
        '</li>';
    });
    h += '</ul>';
    if (!checks.length) h += '<div class="swempty">No checks declared</div>';
    h = softwarePanelShell(h, state);
    return { html: h };
  }
);

/* Check results are authored status snapshots. */
var CHECK_STATUSES = ['pending', 'pass', 'fail', 'warn', 'skip'];
function checksPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, panel, warnings) {
    panelKeyedStateWarnings(
      state,
      path,
      panel,
      warnings,
      'results',
      function (value, at, warnings) {
        if (
          !panelObject(value) ||
          (value.status != null && CHECK_STATUSES.indexOf(value.status) < 0)
        )
          warnings.push(
            at + ': expected {status: pending|pass|fail|warn|skip, detail?} — using pending'
          );
      }
    );
  });
}
PanelRegistry.extend('checks', {
  itemCollection: { key: 'checks', max: 12 },
  validateDeclaration: function (panel, path, warnings) {
    panelCollectionWarnings(panel, path, warnings, 'checks', 12);
    checksPatchWarnings(panel.initial, path + '.initial', panel, warnings);
  },
  validatePatch: checksPatchWarnings,
});

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
      status: CHECK_STATUSES.indexOf(result.status) >= 0 ? result.status : 'pending',
      detail: result.detail == null ? '' : String(result.detail),
    };
  });
}

PanelViews.register('checks', function (host, panel, state, skin, states, stepIdx, animate) {
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
      (check.detail ? '<div class="swdetail">' + esc(check.detail) + '</div>' : '') +
      '</li>';
  });
  h += '</ul>';
  if (!checks.length) h += '<div class="swempty">No checks declared</div>';
  h = softwarePanelShell(h, state);
  return { html: h };
});

PanelRegistry.extend('checks', {
  order: 24,
  label: 'Checks',
  since: '0.1.0',
});

PanelRegistry.extend('checks', {
  styles: [
    {
      order: 282,
      css: String.raw`.swsummary,.swcheckhead{display:flex; align-items:baseline; justify-content:space-between; gap:8px;}
.swsummary{color:var(--dink); font-weight:600; margin-bottom:8px;}
.swsummary span{font-size:10px; color:var(--dfaint); font-weight:400;}
.swchecks{list-style:none; margin:0; padding:0; max-height:300px; overflow:auto;}`,
    },
    {
      order: 288,
      css: String.raw`.swcheckhead>span:first-child{color:var(--dink); font-weight:600;}`,
    },
  ],
});

/* checks authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('checks', {
  authoring: {
    template: {
      title: 'Decision checks',
      checks: [
        { id: 'auth', label: 'Authorized' },
        { id: 'unique', label: 'Idempotency key is new' },
      ],
      initial: { results: { auth: { status: 'pending' }, unique: { status: 'pending' } } },
    },
    setupFields: [
      ['checks', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }], max: 12 }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['results', 'json'],
      ['note', 'text'],
    ],
    picker: {
      order: 1,
      name: 'Decision checks',
      category: 'Software & data',
      tagline: 'Make a decision visible',
      description:
        'Explain authorization, validation, or release gates with a result for each check.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.results = { auth: { status: 'pass' }, unique: { status: 'pass' } };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});

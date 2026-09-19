/* deviceapp panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function deviceAppModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var str = function (v, fallback) {
    return typeof v === 'string' ? v : fallback || '';
  };
  var palette = [
    '#5865d8',
    '#168878',
    '#bd6716',
    '#a354b5',
    '#287fbe',
    '#b95164',
  ];
  var sources = deviceAppItems(panel, 'sources').map(function (s, i) {
    return {
      id: s.id,
      label: str(s.label, s.id),
      letter: String.fromCharCode(65 + i),
      color:
        typeof s.color === 'string' &&
        /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.color)
          ? s.color
          : palette[i],
      node: str(s.node),
      endpoint: str(s.endpoint),
      detail: str(s.detail),
    };
  });
  var fields = deviceAppItems(panel, 'fields').map(function (f) {
    var v = panelObject(state[f.id]) ? state[f.id] : {},
      battery = f.kind === 'battery';
    var source = sources.find(function (s) {
      return s.id === (v.source == null ? f.source : v.source);
    });
    var valid =
      v.value != null &&
      (typeof v.value === 'string' ||
        isFiniteNum(v.value) ||
        typeof v.value === 'boolean');
    if (battery) valid = isFiniteNum(v.value) && v.value >= 0 && v.value <= 100;
    return {
      id: f.id,
      label: str(f.label, f.id),
      source: source || null,
      battery: battery,
      icon: ICON_SET.indexOf(f.icon) >= 0 ? f.icon : null,
      value: valid ? String(v.value) + (battery ? '%' : str(f.unit)) : '—',
      pct: battery && valid ? v.value : 0,
      status: DEVICEAPP_STATUSES.indexOf(v.status) >= 0 ? v.status : 'unknown',
      detail: str(v.detail),
      updated:
        Array.isArray(state._updated) && state._updated.indexOf(f.id) >= 0,
    };
  });
  return {
    device: str(panel.device, 'Camera'),
    subtitle: str(panel.subtitle, 'Device health'),
    clock: str(state.clock, '9:41'),
    note: str(state.note),
    sources: sources,
    fields: fields,
  };
}
function deviceAppPanelHTML(panel, state, fresh) {
  var m = deviceAppModel(panel, state),
    labels = {
      unknown: 'No data',
      loading: 'Loading',
      ready: 'Current',
      stale: 'Cached',
      error: 'Unavailable',
    };
  function badge(s) {
    return (
      '<span class="da-badge" aria-hidden="true">' +
      (s ? s.letter : '?') +
      '</span>'
    );
  }
  function props(s) {
    return (
      ' data-da-source="' +
      esc(s ? s.id : '') +
      '" style="--da-color:' +
      (s ? s.color : '#78808d') +
      '"'
    );
  }
  var h =
    '<div class="deviceapp"><div class="da-phone"><div class="da-statusbar"><span>' +
    esc(m.clock) +
    '</span><span aria-hidden="true">▂▄▆ · ▰</span></div>' +
    '<div class="da-heading"><span class="da-eyebrow">CAMERA DETAILS</span><h3>' +
    esc(m.device) +
    '</h3><span>' +
    esc(m.subtitle) +
    '</span></div><div class="da-fields">';
  m.fields.forEach(function (f) {
    h +=
      '<button type="button" class="da-field da-' +
      f.status +
      (f.updated ? ' da-updated' : '') +
      (fresh && f.updated ? ' fresh' : '') +
      '" data-da-field="' +
      esc(f.id) +
      '"' +
      props(f.source) +
      ' aria-pressed="false" aria-label="' +
      esc(
        f.label +
          ': ' +
          f.value +
          '. ' +
          labels[f.status] +
          '. Source: ' +
          (f.source ? f.source.label : 'Unmapped')
      ) +
      '">' +
      '<span class="da-field-top"><span>' +
      esc(f.label) +
      '</span>' +
      badge(f.source) +
      '</span>' +
      '<span class="da-value">' +
      (f.icon
        ? '<svg class="da-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' +
          f.icon +
          '"/></svg>'
        : '') +
      esc(f.value) +
      '</span>' +
      (f.battery
        ? '<span class="da-meter" aria-hidden="true"><i style="width:' +
          f.pct +
          '%"></i></span>'
        : '') +
      '<span class="da-meta"><span class="da-state">' +
      labels[f.status] +
      '</span>' +
      (f.updated ? '<span class="da-update-label">Updated</span>' : '') +
      '</span>' +
      (f.detail ? '<span class="da-detail">' + esc(f.detail) + '</span>' : '') +
      '</button>';
  });
  h +=
    '</div><div class="da-home" aria-hidden="true"></div></div><div class="da-provenance"><div class="da-eyebrow">WHERE THE DATA COMES FROM</div>' +
    '<h3>One screen. Multiple sources.</h3><p class="da-help">Select a field or source to trace its data' +
    (m.sources.some(function (s) {
      return s.node;
    })
      ? ' and highlight its service in the diagram'
      : '') +
    '.</p><div class="da-sources">';
  m.sources.forEach(function (s) {
    var fields = m.fields.filter(function (f) {
      return f.source && f.source.id === s.id;
    });
    h +=
      '<button type="button" class="da-source"' +
      props(s) +
      ' aria-pressed="false"><span class="da-source-title">' +
      badge(s) +
      '<strong>' +
      esc(s.label) +
      '</strong></span>' +
      (s.endpoint ? '<code>' + esc(s.endpoint) + '</code>' : '') +
      (s.detail ? '<span class="da-detail">' + esc(s.detail) + '</span>' : '') +
      '<span class="da-source-fields">' +
      esc(
        fields.length
          ? fields
              .map(function (f) {
                return f.label + ' · ' + labels[f.status];
              })
              .join(' / ')
          : 'No fields in this step'
      ) +
      '</span></button>';
  });
  return (
    h +
    '</div>' +
    (m.note ? '<p class="da-note">' + esc(m.note) + '</p>' : '') +
    '</div></div>'
  );
}
function bindDeviceAppSources(host, panel, state) {
  if (typeof host.querySelectorAll !== 'function') return;
  if (host._daClear) host._daClear();
  var nodes = [],
    m = deviceAppModel(panel, state);
  var buttons = Array.from(host.querySelectorAll('[data-da-source]'));
  function clearNodes() {
    nodes.forEach(function (n) {
      if (n._daOwners) {
        n._daOwners.delete(host);
        if (!n._daOwners.size) n.classList.remove('da-node-focus');
      }
    });
    nodes = [];
  }
  host._daClear = clearNodes;
  function select(id) {
    clearNodes();
    host._daSource = id;
    buttons.forEach(function (b) {
      var on = !!id && b.getAttribute('data-da-source') === id;
      b.setAttribute('aria-pressed', String(on));
    });
    var source = m.sources.find(function (s) {
      return s.id === id;
    });
    var section = host.closest && host.closest('.doc-sec');
    if (section && source && source.node)
      Array.from(section.querySelectorAll('[data-dv-node]')).forEach(function (
        n
      ) {
        if (n.getAttribute('data-dv-node') !== source.node) return;
        if (!n._daOwners) n._daOwners = new Set();
        n._daOwners.add(host);
        n.classList.add('da-node-focus');
        nodes.push(n);
      });
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-da-source');
      select(host._daSource === id ? null : id);
    });
  });
  select(host._daSource);
}

/* queue widget: mailbox — a message enqueued, held, dequeued. Pure model +
   markup builder so node tests cover them without a DOM. Directional context:
   `from` shows during enqueue (arrival side), `to` during dequeue (departure
   side), `reason` while held (the waiting-on line). Carried like any patch
   field; only the state-relevant one renders. Non-strings are ignored (the
   validator warns). */

PanelViews.register(
  'deviceapp',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var hBaseline = null;
    var daFresh =
      animate &&
      validRevealIndex(host._daStep) &&
      validRevealIndex(stepIdx) &&
      stepIdx === host._daStep + 1;
    host._daStep = validRevealIndex(stepIdx) ? stepIdx : null;
    h += deviceAppPanelHTML(panel, state, daFresh);
    hBaseline = daFresh ? deviceAppPanelHTML(panel, state, false) : null;
    return {
      html: h,
      baseline: hBaseline,
      mounted: function () {
        bindDeviceAppSources(host, panel, state);
      },
    };
  }
);

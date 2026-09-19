/* replicas panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function replicaModel(panel, state) {
  state = panelObject(state) ? state : {};
  var ref = replicaCursor(state.reference),
    unit = replicaSeries(panel.unit) || 'positions';
  var rows = replicaPanelItems(panel).map(function (r) {
    var s =
      panelOwn(state.replicas, r.id) && panelObject(state.replicas[r.id])
        ? state.replicas[r.id]
        : {};
    var cur = replicaCursor(s),
      delta =
        ref && cur && ref.series === cur.series
          ? cur.position - ref.position
          : null;
    return {
      id: r.id,
      label: typeof r.label === 'string' ? r.label : r.id,
      position: replicaPosition(s.position),
      series: replicaSeries(s.series),
      role: typeof s.role === 'string' ? s.role : '',
      observedAt: typeof s.observedAt === 'string' ? s.observedAt : '',
      status: REPLICA_STATUSES.indexOf(s.status) >= 0 ? s.status : 'unknown',
      lagMs: isFiniteNum(s.lagMs) && s.lagMs >= 0 ? s.lagMs : null,
      delta: delta,
      comparison:
        delta !== null
          ? delta === 0
            ? 'equal'
            : delta < 0
            ? 'behind'
            : 'ahead'
          : !cur
          ? 'unknown'
          : !ref
          ? 'no-reference'
          : 'different-series',
    };
  });
  var comparable = rows.filter(function (r) {
    return r.delta !== null;
  });
  var positions = comparable.map(function (r) {
    return r.position;
  });
  if (ref) positions.push(ref.position);
  var min = positions.length ? Math.min.apply(null, positions) : null;
  var max = positions.length ? Math.max.apply(null, positions) : null;
  function pct(value) {
    return min === max ? 50 : ((value - min) / (max - min)) * 100;
  }
  rows.forEach(function (r) {
    r.pct = r.delta !== null ? pct(r.position) : null;
  });
  return {
    reference: ref,
    rows: rows,
    comparable: comparable.length,
    min: min,
    max: max,
    referencePct: ref ? pct(ref.position) : null,
    unit: unit,
    note: typeof state.note === 'string' ? state.note : '',
  };
}
function replicaPanelHTML(panel, state) {
  var m = replicaModel(panel, state),
    ref = m.reference;
  var h =
    '<div class="replicas-view"><div class="rep-reference"><b>' +
    (ref
      ? 'Reference ' + esc(String(ref.position)) + ' ' + esc(m.unit)
      : 'Reference unavailable') +
    '</b>' +
    (ref
      ? '<div>Sequence: ' + esc(ref.series) + '</div>'
      : '<div>A position and sequence identity are required.</div>') +
    '</div>';
  if (ref)
    h +=
      '<div class="rep-scale">Position window: ' +
      esc(String(m.min)) +
      ' – ' +
      esc(String(m.max)) +
      ' ' +
      esc(m.unit) +
      ' · dashed marker = reference</div>';
  h +=
    '<div class="rep-list" tabindex="0" role="region" aria-label="Replica observations">';
  m.rows.forEach(function (r) {
    var comparison =
      r.comparison === 'equal'
        ? 'At reference'
        : r.delta !== null
        ? Math.abs(r.delta) + ' ' + m.unit + ' ' + r.comparison
        : r.comparison === 'different-series'
        ? 'Different sequence · not compared'
        : r.comparison === 'no-reference'
        ? 'No reference · not compared'
        : 'Position or sequence unknown';
    h +=
      '<div class="rep-row"><div class="rep-head"><b>' +
      esc(r.label) +
      '</b><span class="rep-status">' +
      esc(r.status) +
      '</span></div>' +
      (r.role ? '<div class="rep-role">' + esc(r.role) + '</div>' : '') +
      '<div class="rep-value">Position ' +
      (r.position === null ? 'unknown' : esc(String(r.position))) +
      '</div>' +
      '<div class="rep-series">Sequence: ' +
      (r.series === null ? 'unknown' : esc(r.series)) +
      '</div>' +
      '<div class="rep-track" aria-hidden="true">' +
      (ref
        ? '<i class="rep-reference-mark" style="left:' +
          m.referencePct +
          '%"></i>'
        : '') +
      (r.pct !== null
        ? '<i class="rep-position-mark" style="left:' + r.pct + '%"></i>'
        : '') +
      '</div>' +
      '<div class="rep-comparison">' +
      esc(comparison) +
      '</div><div class="rep-lag">Reported lag: ' +
      (r.lagMs === null ? 'unknown' : esc(String(r.lagMs)) + ' ms') +
      '</div><div class="rep-observed">Observed: ' +
      (r.observedAt ? esc(r.observedAt) : 'time unknown') +
      '</div></div>';
  });
  if (!m.rows.length) h += '<div class="swempty">No replicas declared</div>';
  h +=
    '</div><p class="rep-note">' +
    m.comparable +
    ' / ' +
    m.rows.length +
    ' positions comparable. Position equality does not prove availability, commit, or read safety. Lag is supplied separately; it is not a catch-up estimate.</p>';
  if (m.note) h += '<p class="rep-note">' + esc(m.note) + '</p>';
  return h + '</div>';
}

PanelViews.register(
  'replicas',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    h = replicaPanelHTML(panel, state);
    return { html: h };
  }
);

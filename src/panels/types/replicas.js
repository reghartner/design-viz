/* replicas validation and pure state helpers. */
var REPLICA_STATUSES = ['online', 'offline', 'unknown'];
function replicaPosition(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}
function replicaSeries(v) {
  return typeof v === 'string' && v.trim() ? v : null;
}
function replicaCursor(v) {
  return panelObject(v) && replicaSeries(v.series) !== null && replicaPosition(v.position) !== null
    ? { series: v.series, position: v.position }
    : null;
}
function replicaPanelItems(p) {
  var seen = Object.create(null);
  return (Array.isArray(p.replicas) ? p.replicas : []).slice(0, 8).filter(function (r) {
    if (!panelObject(r) || typeof r.id !== 'string' || !r.id.trim() || seen[r.id]) return false;
    seen[r.id] = true;
    return true;
  });
}
function replicaPatchWarnings(state, path, p, warnings) {
  if (state == null) return;
  if (!panelObject(state)) {
    warnings.push(path + ': expected a state object');
    return;
  }
  function cursor(v, at) {
    if (v == null) return;
    if (!panelObject(v)) {
      warnings.push(at + ': expected an object or null — position unknown');
      return;
    }
    if (v.position != null && replicaPosition(v.position) === null)
      warnings.push(
        at + '.position: expected a non-negative safe integer or null — position unknown'
      );
    if (v.series != null && replicaSeries(v.series) === null)
      warnings.push(
        at + '.series: expected a non-empty sequence identity or null — comparison unavailable'
      );
  }
  cursor(state.reference, path + '.reference');
  if (state.replicas != null) {
    if (!panelObject(state.replicas))
      warnings.push(path + '.replicas: expected a snapshot keyed by replica id');
    else {
      var ids = replicaPanelItems(p).map(function (r) {
        return r.id;
      });
      Object.keys(state.replicas).forEach(function (id) {
        var at = path + '.replicas.' + id,
          r = state.replicas[id];
        if (ids.indexOf(id) < 0) {
          warnings.push(at + ': unknown replica — ignored');
          return;
        }
        cursor(r, at);
        if (!panelObject(r)) return;
        if (r.status != null && REPLICA_STATUSES.indexOf(r.status) < 0)
          warnings.push(at + '.status: expected online|offline|unknown — using unknown');
        if (r.lagMs != null && (!isFiniteNum(r.lagMs) || r.lagMs < 0))
          warnings.push(
            at + '.lagMs: expected finite non-negative milliseconds or null — reported lag unknown'
          );
        ['role', 'observedAt'].forEach(function (k) {
          if (r[k] != null && typeof r[k] !== 'string')
            warnings.push(at + '.' + k + ': expected a string or null — ignored');
        });
      });
    }
  }
  if (state.note != null && typeof state.note !== 'string')
    warnings.push(path + '.note: expected a string or null — ignored');
  if (state.enterOnce != null) {
    if (!panelObject(state.enterOnce)) warnings.push(path + '.enterOnce: expected an object');
    else {
      var once = Object.assign({}, state.enterOnce);
      delete once.enterOnce;
      replicaPatchWarnings(once, path + '.enterOnce', p, warnings);
    }
  }
}
function replicaPanelWarnings(p, path, warnings) {
  if (!Array.isArray(p.replicas) || !p.replicas.length)
    warnings.push(path + '.replicas: declare 1–8 replicas with unique string ids');
  else {
    if (p.replicas.length > 8) warnings.push(path + '.replicas: only the first 8 entries render');
    var seen = Object.create(null);
    p.replicas.forEach(function (r, i) {
      var at = path + '.replicas[' + i + ']';
      if (!panelObject(r) || typeof r.id !== 'string' || !r.id.trim()) {
        warnings.push(at + '.id: expected a non-empty string — skipped');
        return;
      }
      if (seen[r.id]) warnings.push(at + '.id: duplicate replica id — later entry skipped');
      seen[r.id] = true;
      if (r.label != null && typeof r.label !== 'string')
        warnings.push(at + '.label: expected a string — using id');
    });
  }
  if (p.unit != null && (typeof p.unit !== 'string' || !p.unit.trim()))
    warnings.push(path + '.unit: expected a non-empty string — using positions');
  replicaPatchWarnings(p.initial, path + '.initial', p, warnings);
}

PanelRegistry.extend('replicas', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    replicaPanelWarnings(p, PP, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    replicaPatchWarnings(patch, path, panel, warnings);
  },
});

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
      delta = ref && cur && ref.series === cur.series ? cur.position - ref.position : null;
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
    (ref ? 'Reference ' + esc(String(ref.position)) + ' ' + esc(m.unit) : 'Reference unavailable') +
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
  h += '<div class="rep-list" tabindex="0" role="region" aria-label="Replica observations">';
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
      (ref ? '<i class="rep-reference-mark" style="left:' + m.referencePct + '%"></i>' : '') +
      (r.pct !== null ? '<i class="rep-position-mark" style="left:' + r.pct + '%"></i>' : '') +
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

PanelViews.register('replicas', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  h = replicaPanelHTML(panel, state);
  return { html: h };
});

PanelRegistry.extend('replicas', {
  order: 27,
  label: 'Replicas',
  since: '0.1.0',
});

PanelRegistry.extend('replicas', {
  styles: [
    {
      order: 239,
      css: String.raw`.replicas-view{color:var(--dtext);font:11px/1.5 'IBM Plex Mono',monospace;overflow-wrap:anywhere;}
.rep-reference{padding:8px;border:1px solid currentColor;border-radius:6px;margin-bottom:8px;}
.rep-reference b,.rep-head b{color:var(--dink);}
.rep-scale,.rep-note,.rep-observed,.rep-series{font-size:10px;color:var(--dfaint);}
.rep-list{max-height:480px;overflow:auto;}
.rep-list:focus-visible{outline:2px solid var(--dink);outline-offset:-2px;}
.rep-row{padding:10px 2px;border-bottom:1px solid color-mix(in srgb,var(--dtext) 22%,transparent);}
.rep-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
.rep-status{font-size:9px;text-transform:uppercase;border:1px solid currentColor;border-radius:4px;padding:1px 4px;}
.rep-role{font-size:10px;}
.rep-value{margin-top:5px;font-weight:600;}
.rep-track{position:relative;height:18px;margin:4px 6px;background:linear-gradient(transparent 8px,currentColor 8px,currentColor 9px,transparent 9px);}
.rep-reference-mark{position:absolute;top:0;height:18px;border-left:2px dashed currentColor;opacity:.55;}
.rep-position-mark{position:absolute;top:4px;width:9px;height:9px;border-radius:50%;background:var(--dink);transform:translateX(-50%);}
.rep-comparison{font-weight:600;}
.rep-note{margin:9px 0 0;}
@media print{
  .panelcol .pwidget.pt-replicas{display:block !important;break-inside:avoid;}
}
@media print{
  .panelcol:has(.pt-replicas){display:flex !important;}
}
@media print{
  .rep-list{max-height:none;overflow:visible;}
}
@media print{
  .replicas-view{color:#222;--dink:#111;--dfaint:#555;}
}`,
    },
  ],
});

/* replicas authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('replicas', {
  authoring: {
    template: {
      title: 'Replica positions',
      unit: 'records',
      replicas: [
        { id: 'primary', label: 'Primary' },
        { id: 'follower', label: 'Follower' },
      ],
      initial: {
        reference: { series: 'example/log-a', position: 104 },
        replicas: {
          primary: {
            series: 'example/log-a',
            position: 104,
            role: 'primary',
            status: 'online',
            lagMs: 0,
            observedAt: 'example t=0',
          },
          follower: {
            series: 'example/log-a',
            position: 101,
            role: 'follower',
            status: 'online',
            lagMs: null,
            observedAt: 'example t=0',
          },
        },
        note: 'Fictional positions. Replace with evidence; report lag independently.',
      },
    },
    setupFields: [
      ['unit', 'text'],
      ['replicas', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }], max: 8 }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['reference', 'json'],
      ['replicas', 'json'],
      ['note', 'text'],
    ],
    picker: {
      order: 4,
      name: 'Replica positions',
      category: 'Software & data',
      tagline: 'Who has caught up?',
      description:
        'Compare primary and follower positions, roles, and independently reported replication lag.',
    },
  },
});

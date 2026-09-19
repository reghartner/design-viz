/* waterfall validation and pure state helpers. */

PanelRegistry.extend('waterfall', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.spans) && p.spans.length))
      warnings.push(PP + '.spans: waterfall needs spans:[{id, label, ms}] — panel renders empty');
    if (Array.isArray(p.spans))
      p.spans.forEach(function (span, si) {
        if (!span || !isFiniteNum(span.ms) || span.ms < 0)
          warnings.push(PP + '.spans[' + si + '].ms: expected a finite non-negative duration');
        if (span && span.startMs != null && (!isFiniteNum(span.startMs) || span.startMs < 0))
          warnings.push(
            PP +
              '.spans[' +
              si +
              '].startMs: expected a finite non-negative offset — using the previous span end'
          );
      });
  },
});

/* waterfall panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function waterfallModel(spans, state) {
  spans = Array.isArray(spans) ? spans : [];
  state = state || {};
  var total = 0,
    cursor = 0;
  var timed = spans.some(function (s) {
    return s && isFiniteNum(s.startMs) && s.startMs >= 0;
  });
  var measured = spans.map(function (s) {
    var ms = s && isFiniteNum(s.ms) && s.ms > 0 ? s.ms : 0;
    var start = s && isFiniteNum(s.startMs) && s.startMs >= 0 ? s.startMs : cursor;
    cursor = start + ms;
    total = Math.max(total, cursor);
    return { ms: ms, start: start };
  });
  var reveal =
    typeof state.reveal === 'number' ? clamp(state.reveal, 0, spans.length) : spans.length;
  var shown = 0,
    rows = [];
  spans.forEach(function (s, i) {
    var ms = measured[i].ms,
      off = measured[i].start;
    var revealed = i < reveal;
    if (revealed) shown = Math.max(shown, off + ms);
    rows.push({
      id: s && s.id,
      label: (s && (s.label || s.id)) || '',
      ms: ms,
      startMs: off,
      error: !!(s && s.error === true),
      offsetPct: total ? (off / total) * 100 : 0,
      widthPct: total ? (ms / total) * 100 : 0,
      revealed: revealed,
      highlight: !!(s && state.highlight === s.id),
    });
  });
  return {
    rows: rows,
    totalMs: total,
    shownMs: shown,
    timed: timed,
    totalLabel: state.total != null ? String(state.total) : shown + ' ms',
  };
}

PanelViews.register('waterfall', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var waterfallEntrants;
  var wm = waterfallModel(panel.spans, state);
  var wfPrev = host._wfRevealed || null;
  var wfNow = wm.rows.map(function (r) {
    return r.revealed;
  });
  waterfallEntrants = wfPrev
    ? wfNow.map(function (on, i) {
        return on && !wfPrev[i];
      })
    : null;
  host._wfRevealed = wfNow;
  h += '<div class="wfall' + (wm.timed ? ' wf-timed' : '') + '">';
  wm.rows.forEach(function (r) {
    h +=
      '<div class="wfrow' +
      (r.revealed ? ' on' : '') +
      (r.highlight ? ' hl' : '') +
      (r.error ? ' wf-error' : '') +
      '" title="' +
      esc(
        r.label +
          ' · start +' +
          r.startMs +
          ' ms · duration ' +
          r.ms +
          ' ms' +
          (r.error ? ' · recorded error' : '')
      ) +
      '">' +
      '<span class="wflabel">' +
      esc(r.label) +
      '</span>' +
      '<span class="wftrack"><span class="wfbar" style="margin-left:' +
      r.offsetPct.toFixed(2) +
      '%;width:' +
      Math.max(r.widthPct, wm.timed ? 0 : 1.2).toFixed(2) +
      '%"></span></span>' +
      '<span class="wfms">' +
      (r.revealed ? (r.error ? '! ' : '') + esc(String(r.ms)) + ' ms' : '&#8212;') +
      '</span></div>';
  });
  h +=
    '<div class="wftotal">' +
    (wm.timed ? 'elapsed extent ' : 'total ') +
    '<b>' +
    esc(wm.totalLabel) +
    '</b></div></div>';
  return {
    html: h,
    enterBars: { rows: '.wfrow', bar: '.wfbar', entrants: waterfallEntrants },
  };
});

PanelRegistry.extend('waterfall', {
  order: 6,
  label: 'Waterfall',
  since: '0.1.0',
});

PanelRegistry.extend('waterfall', {
  styles: [
    {
      order: 259,
      css: String.raw`.wf-timed{max-height:350px; overflow:auto;}
.wf-timed .wflabel{overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.wfrow.wf-error .wfbar{background:#DD5A65;}
.wfrow.wf-error .wfms{font-weight:700; text-decoration:underline dotted;}`,
    },
    { order: 559, css: String.raw`.wfall{display:flex; flex-direction:column; gap:5px;}` },
    {
      order: 587,
      css: String.raw`.wfrow{display:flex; align-items:center; gap:8px; opacity:.3; transition:opacity .3s ease;}
.wfrow.on{opacity:1;}
.wflabel{font:500 10.5px 'IBM Plex Mono',monospace; width:128px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.sk-aurora .wflabel{color:#93A7C9;}
.sk-daylight .wflabel{color:#6B6F7A;}
.wftrack{flex:1; height:10px; border-radius:5px; display:block; overflow:hidden;}
.sk-aurora .wftrack{background:#101A2C;}
.sk-daylight .wftrack{background:#F4F2EC;}
.wfbar{display:block; height:100%; border-radius:5px; background:#38E1FF;}
.wfbar.dv-bar-enter{transform-origin:left center; animation:dvbarenter .5s cubic-bezier(.4,0,.2,1);}`,
    },
    {
      order: 598,
      css: String.raw`.sk-daylight .wfbar{background:#4956C9;}
.wfrow.hl .wfbar{background:#FFB454; box-shadow:0 0 8px rgba(255,180,84,.7);}
.sk-daylight .wfrow.hl .wfbar{background:#B45309; box-shadow:none;}
.wfms{font:600 10px 'IBM Plex Mono',monospace; width:52px; text-align:right;}
.sk-aurora .wfms{color:#93A7C9;}
.sk-daylight .wfms{color:#6B6F7A;}
.wftotal{font:500 10.5px 'IBM Plex Mono',monospace; margin-top:4px; text-align:right;}
.sk-aurora .wftotal{color:#5E7396;}
.sk-aurora .wftotal b{color:#8AE8FF;}
.sk-daylight .wftotal{color:#8A8474;}
.sk-daylight .wftotal b{color:#4956C9;}`,
    },
    {
      order: 1364,
      css: String.raw`body.sk-editorial .sk-aurora .wfbar,
body.sk-editorial .sk-daylight .wfbar{border-radius:1px; background:var(--ed-accent);}
body.sk-editorial .sk-aurora .wfrow.hl .wfbar,
body.sk-editorial .sk-daylight .wfrow.hl .wfbar{background:var(--ed-warn); box-shadow:none;}`,
    },
    {
      order: 1586,
      css: String.raw`@media screen {

  body.sk-terminal .wfrow{gap:7px;}
}
@media screen {
  body.sk-terminal .wflabel,
  body.sk-terminal .wfms,
  body.sk-terminal .wftotal,
  body.sk-terminal .sk-aurora .wflabel,
  body.sk-terminal .sk-aurora .wfms,
  body.sk-terminal .sk-aurora .wftotal{color:var(--tm-muted); font-size:9px;}
}
@media screen {
  body.sk-terminal .wflabel{letter-spacing:.04em; text-transform:uppercase;}
}
@media screen {
  body.sk-terminal .wfbar{background:var(--tm-good); border-radius:0;}
}
@media screen {
  body.sk-terminal .wfrow.hl .wfbar{background:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .sk-aurora .wftotal b{color:var(--tm-good);}
}`,
    },
    {
      order: 1795,
      css: String.raw`@media screen {

  body.sk-pastel .wfall { gap:7px; }
}
@media screen {
  body.sk-pastel .wfrow { gap:9px; }
}
@media screen {
  body.sk-pastel .wflabel,
  body.sk-pastel .wfms,
  body.sk-pastel .wftotal,
  body.sk-pastel .sk-aurora .wflabel,
  body.sk-pastel .sk-daylight .wflabel,
  body.sk-pastel .sk-aurora .wfms,
  body.sk-pastel .sk-daylight .wfms,
  body.sk-pastel .sk-aurora .wftotal,
  body.sk-pastel .sk-daylight .wftotal { color:#657287; }
}
@media screen {
  body.sk-pastel .wftrack { height:9px; border-radius:999px; }
}
@media screen {
  body.sk-pastel .wfbar,
  body.sk-pastel .sk-daylight .wfbar { background:#7584D4; border-radius:999px; }
}
@media screen {
  body.sk-pastel .wfrow.hl .wfbar,
  body.sk-pastel .sk-daylight .wfrow.hl .wfbar { background:#D19A4D; box-shadow:0 0 0 3px rgba(209,154,77,.12); }
}
@media screen {
  body.sk-pastel .sk-aurora .wftotal b,
  body.sk-pastel .sk-daylight .wftotal b { color:#5263B9; }
}`,
    },
    {
      order: 1941,
      css: String.raw`@media screen {
  @media (max-width:640px) {
    body.sk-pastel .wflabel { width:96px; }
  }
}`,
    },
    {
      order: 2031,
      css: String.raw`@media screen {

  body.sk-blueprint .wfall{gap:4px;}
}
@media screen {
  body.sk-blueprint .wfrow{gap:6px;}
}
@media screen {
  body.sk-blueprint .docview .wflabel,body.sk-blueprint .docview .wfms{color:#CBE3EF;}
}
@media screen {
  body.sk-blueprint .wflabel{width:116px;font-size:10px;}
}
@media screen {
  body.sk-blueprint .docview .wftrack{height:8px;border:1px solid #2F7898;border-radius:0;background:#031F43;}
}
@media screen {
  body.sk-blueprint .wfbar{border-radius:0;background:#58E7FF;}
}
@media screen {
  body.sk-blueprint .wfrow.hl .wfbar{background:#FFD166;box-shadow:0 0 6px rgba(255,209,102,.65);}
}
@media screen {
  body.sk-blueprint .docview .wftotal{color:#95BED4;}
}
@media screen {
  body.sk-blueprint .docview .wftotal b{color:#FFFFFF;}
}`,
    },
  ],
});

/* waterfall authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('waterfall', {
  authoring: {
    template: {
      title: 'Latency budget',
      spans: [
        { id: 'net', label: 'network', ms: 40 },
        { id: 'work', label: 'processing', ms: 120 },
      ],
    },
    setupFields: [
      [
        'spans',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'ms', kind: 'num', req: true },
            { k: 'startMs', kind: 'num' },
          ],
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['reveal', 'num'],
      ['highlight', 'text'],
      ['total', 'text'],
    ],
    picker: {
      order: 10,
      name: 'Latency waterfall',
      category: 'State & timing',
      tagline: 'See where time goes',
      description: 'Compare operation durations or timed spans to explain the cost of a request.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.spans = [
        { id: 'net', label: 'network', ms: 40 },
        { id: 'auth', label: 'authorize', ms: 25 },
        { id: 'work', label: 'processing', ms: 120 },
      ];
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});

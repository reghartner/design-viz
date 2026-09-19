/* orbit validation and pure state helpers. */

PanelRegistry.extend('orbit', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.states) && p.states.length))
      warnings.push(PP + '.states: orbit needs states:[...] — panel renders empty');
  },
});

/* orbit panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function orbitPositions(n, cx, cy, r) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/* zones/layers patches replace the whole array (fold is a shallow merge);
   the model joins the declared geometry with the latest state array. */

PanelViews.register('orbit', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var pulseSelector, pulseChanged;
  var ostates = Array.isArray(panel.states) ? panel.states : [];
  var ocur = state.state != null ? String(state.state) : null;
  pulseSelector = '.odot.cur';
  pulseChanged = Object.prototype.hasOwnProperty.call(host, '_orbitCur') && host._orbitCur !== ocur;
  host._orbitCur = ocur;
  var ocolors = panel.colors || {};
  var opos = orbitPositions(ostates.length, 110, 78, 54);
  h +=
    '<svg class="orbit" viewBox="0 0 220 156" role="img" aria-label="' +
    esc(panel.title || 'state machine') +
    '">';
  h += '<circle class="oring" cx="110" cy="78" r="54"/>';
  ostates.forEach(function (sname, i) {
    var p = opos[i];
    var isCur = String(sname) === ocur;
    var col = isHex(ocolors[sname]) ? ocolors[sname] : null;
    var anchor = p.x < 100 ? 'end' : p.x > 120 ? 'start' : 'middle';
    var lx = p.x + (anchor === 'end' ? -11 : anchor === 'start' ? 11 : 0);
    var ly = anchor === 'middle' ? (p.y < 78 ? p.y - 10 : p.y + 16) : p.y + 3.5;
    h +=
      '<circle class="odot' +
      (isCur ? ' cur' : '') +
      '" cx="' +
      p.x.toFixed(1) +
      '" cy="' +
      p.y.toFixed(1) +
      '" r="' +
      (isCur ? 7 : 4.5) +
      '"' +
      (isCur && col ? ' style="fill:' + col + '"' : '') +
      '/>';
    h +=
      '<text class="olbl' +
      (isCur ? ' cur' : '') +
      '" x="' +
      lx.toFixed(1) +
      '" y="' +
      ly.toFixed(1) +
      '" text-anchor="' +
      anchor +
      '">' +
      esc(String(sname)) +
      '</text>';
  });
  h +=
    '<text class="ocur" x="110" y="75" text-anchor="middle"' +
    (ocur && isHex(ocolors[ocur]) ? ' style="fill:' + ocolors[ocur] + '"' : '') +
    '>' +
    esc(ocur || '—') +
    '</text>';
  if (state.via)
    h +=
      '<text class="ovia" x="110" y="91" text-anchor="middle">via ' +
      esc(String(state.via)) +
      '</text>';
  h += '</svg>';
  return {
    html: h,
    pulse: { selector: pulseSelector, changed: pulseChanged },
  };
});

PanelRegistry.extend('orbit', {
  order: 7,
  label: 'Orbit',
  since: '0.1.0',
});

PanelRegistry.extend('orbit', {
  styles: [
    {
      order: 335,
      css: String.raw`.odot.dv-chip-pulse{transform-box:fill-box; transform-origin:center; animation:dvchippulse .58s ease-out;}`,
    },
    {
      order: 610,
      css: String.raw`.orbit{display:block; width:100%; max-width:280px; margin:0 auto; height:auto;}
.oring{fill:none; stroke-dasharray:3 5; stroke-width:1.4;}
.sk-aurora .oring{stroke:#25364F;}
.sk-daylight .oring{stroke:#D8D3C6;}
.odot{transition:r .25s ease;}
.sk-aurora .odot{fill:#333D49;}
.sk-daylight .odot{fill:#C9C4B8;}
.odot.cur{animation:opulse 1.6s ease-in-out infinite alternate;}
.sk-aurora .odot.cur{fill:#38E1FF; filter:drop-shadow(0 0 6px rgba(56,225,255,.7));}
.sk-daylight .odot.cur{fill:#4956C9; filter:none;}
@keyframes opulse{to{opacity:.55;}}
.olbl{font:600 9px 'IBM Plex Mono',monospace;}
.sk-aurora .olbl{fill:#55627A;}
.sk-aurora .olbl.cur{fill:#B9E2F2;}
.sk-daylight .olbl{fill:#9A958A;}
.sk-daylight .olbl.cur{fill:#23272E;}
.ocur{font:700 13px 'IBM Plex Mono',monospace;}
.sk-aurora .ocur{fill:#EAF2FF;}
.sk-daylight .ocur{fill:#23272E;}
.ovia{font:500 8.5px 'IBM Plex Mono',monospace;}
.sk-aurora .ovia{fill:#5E7396;}
.sk-daylight .ovia{fill:#8A8474;}`,
    },
    {
      order: 1203,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .odot.cur{animation:none !important;}
}`,
    },
    {
      order: 1368,
      css: String.raw`body.sk-editorial .sk-aurora .oring,
body.sk-editorial .sk-daylight .oring{stroke:#C5BBAA;}
body.sk-editorial .sk-aurora .odot,
body.sk-editorial .sk-daylight .odot{fill:#B4AC9F;}
body.sk-editorial .sk-aurora .odot.cur,
body.sk-editorial .sk-daylight .odot.cur{fill:var(--ed-accent); filter:none;}
body.sk-editorial .sk-aurora .olbl,
body.sk-editorial .sk-daylight .olbl{fill:var(--ed-muted);}
body.sk-editorial .sk-aurora .olbl.cur,
body.sk-editorial .sk-daylight .olbl.cur{fill:var(--ed-ink);}`,
    },
    {
      order: 1592,
      css: String.raw`@media screen {

  body.sk-terminal .sk-aurora .oring{stroke:var(--tm-line);}
}
@media screen {
  body.sk-terminal .sk-aurora .odot{fill:var(--tm-line);}
}
@media screen {
  body.sk-terminal .sk-aurora .odot.cur{fill:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .olbl{fill:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .olbl.cur,
  body.sk-terminal .sk-aurora .ocur{fill:var(--tm-ink);}
}
@media screen {
  body.sk-terminal .sk-aurora .ovia{fill:var(--tm-muted);}
}`,
    },
    {
      order: 1802,
      css: String.raw`@media screen {

  body.sk-pastel .oring,
  body.sk-pastel .sk-aurora .oring,
  body.sk-pastel .sk-daylight .oring { stroke:#D6DEEA; stroke-dasharray:2 5; }
}
@media screen {
  body.sk-pastel .sk-aurora .odot,
  body.sk-pastel .sk-daylight .odot { fill:#CBD3DE; }
}
@media screen {
  body.sk-pastel .sk-aurora .odot.cur,
  body.sk-pastel .sk-daylight .odot.cur { fill:#7584D4; filter:drop-shadow(0 0 4px rgba(82,99,185,.28)); }
}
@media screen {
  body.sk-pastel .sk-aurora .olbl,
  body.sk-pastel .sk-daylight .olbl { fill:#7B879A; }
}
@media screen {
  body.sk-pastel .sk-aurora .olbl.cur,
  body.sk-pastel .sk-daylight .olbl.cur,
  body.sk-pastel .sk-aurora .ocur,
  body.sk-pastel .sk-daylight .ocur { fill:#2D3B54; }
}
@media screen {
  body.sk-pastel .sk-aurora .ovia,
  body.sk-pastel .sk-daylight .ovia { fill:#8590A2; }
}`,
    },
    {
      order: 2040,
      css: String.raw`@media screen {

  body.sk-blueprint .docview .oring{stroke:#69BBD1;stroke-width:1.2;stroke-dasharray:2 4;}
}
@media screen {
  body.sk-blueprint .docview .odot{fill:#4E7998;}
}
@media screen {
  body.sk-blueprint .docview .odot.cur{fill:#58E7FF;}
}
@media screen {
  body.sk-blueprint .docview .olbl{fill:#9FC9DD;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:10px;letter-spacing:.025em;}
}
@media screen {
  body.sk-blueprint .docview .olbl.cur,body.sk-blueprint .docview .ocur{fill:#FFFFFF;}
}
@media screen {
  body.sk-blueprint .docview .ocur{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:14px;}
}
@media screen {
  body.sk-blueprint .docview .ovia{fill:#91BCD2;}
}`,
    },
  ],
});

/* orbit authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('orbit', {
  authoring: {
    template: {
      title: 'Lifecycle',
      states: ['IDLE', 'ACTIVE', 'DONE'],
      initial: { state: 'IDLE' },
    },
    setupFields: [
      ['states', 'csv'],
      ['colors', 'map'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['state', 'text'],
      ['via', 'text'],
    ],
    picker: {
      order: 9,
      name: 'Lifecycle orbit',
      category: 'State & timing',
      tagline: 'A cycle of states',
      description:
        'Place lifecycle states around a ring and emphasize the active state and transition.',
    },
    expandPatchFields: function (decl) {
      var states = Array.isArray(decl.states) ? decl.states.map(String) : [];
      var stateField = states.length ? ['state', 'enum', states] : ['state', 'text'];
      return [stateField, ['via', 'text']];
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { state: 'ACTIVE', via: 'request received' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});

/* zoneframe validation and pure state helpers. */

PanelRegistry.extend('zoneframe', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.zones) && p.zones.length))
      warnings.push(PP + '.zones: zoneframe needs zones:[{id, points}] — panel renders empty');
    else
      p.zones.forEach(function (z, zi) {
        if (!z || !z.id || !Array.isArray(z.points) || z.points.length < 3)
          warnings.push(
            PP +
              '.zones[' +
              zi +
              ']: needs {id, points:[[x,y]…]} with 3+ points in the 320×180 frame'
          );
      });
  },
});

/* zoneframe panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function zoneModel(declared, stateZones) {
  var ZKINDS = ['armed', 'ignored', 'masked'];
  var st = {};
  (Array.isArray(stateZones) ? stateZones : []).forEach(function (z) {
    if (z && z.id) st[z.id] = z.state;
  });
  return (Array.isArray(declared) ? declared : []).map(function (z) {
    z = z || {};
    var s = st[z.id] != null ? st[z.id] : z.state || 'armed';
    if (ZKINDS.indexOf(s) < 0) s = 'armed';
    var zpts = (Array.isArray(z.points) ? z.points : []).filter(function (p) {
      return (
        Array.isArray(p) &&
        typeof p[0] === 'number' &&
        isFinite(p[0]) &&
        typeof p[1] === 'number' &&
        isFinite(p[1])
      );
    });
    return { id: z.id, label: z.label || z.id || '', state: s, points: zpts };
  });
}

PanelViews.register('zoneframe', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var zm = zoneModel(panel.zones, state.zones);
  /* pattern id is per-HOST, not per-render: a fresh id every render would
       make otherwise-identical markup unequal and defeat the unchanged-skip */
  var hid = host._zfId || (host._zfId = 'zfh' + ++ZF_SEQ);
  h +=
    '<div class="zfbox"><svg class="zframe" viewBox="0 0 320 180" role="img" aria-label="' +
    esc(panel.title || 'camera zones') +
    '">';
  h +=
    '<defs><pattern id="' +
    hid +
    '" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="8" stroke="#94A3B8" stroke-width="2" opacity=".5"/></pattern></defs>';
  h +=
    '<rect width="320" height="180" fill="#0A0F14"/><rect y="150" width="320" height="30" fill="#131A21"/>';
  h +=
    '<rect x="118" y="28" width="84" height="124" rx="3" fill="#10161D" stroke="#26313C" stroke-width="2"/>';
  zm.forEach(function (z) {
    var pts = z.points
      .map(function (p) {
        return p[0] + ',' + p[1];
      })
      .join(' ');
    h +=
      '<polygon class="zone ' +
      z.state +
      '" points="' +
      pts +
      '"' +
      (z.state === 'masked' ? ' fill="url(#' + hid + ')"' : '') +
      '/>';
    if (z.points.length)
      h +=
        '<text class="zlbl" x="' +
        (z.points[0][0] + 5) +
        '" y="' +
        (z.points[0][1] + 13) +
        '">' +
        esc(z.label) +
        '</text>';
  });
  if (state.subject && typeof state.subject.x === 'number' && typeof state.subject.y === 'number')
    h +=
      '<circle class="zsubject" cx="' + state.subject.x + '" cy="' + state.subject.y + '" r="6"/>';
  var ZVERDICTS = {
    alert: 'ALERT SENT',
    suppress: 'IGNORED — OUTSIDE ARMED ZONES',
    'never-captured': 'MASKED — PIXELS NEVER CAPTURED',
  };
  if (ZVERDICTS[state.verdict]) {
    h +=
      '<rect class="zverbg ' +
      state.verdict +
      '" x="0" y="0" width="320" height="22"/>' +
      '<text class="zvertext" x="8" y="15">' +
      ZVERDICTS[state.verdict] +
      '</text>';
  }
  h += '</svg></div>';
  return { html: h };
});

PanelRegistry.extend('zoneframe', {
  order: 8,
  label: 'Zone frame',
  since: '0.1.0',
});

PanelRegistry.extend('zoneframe', {
  styles: [
    {
      order: 633,
      css: String.raw`.zfbox{border-radius:8px; overflow:hidden;}
.zframe{display:block; width:100%; height:auto;}
.zone{stroke-width:2;}
.zone.armed{stroke:#4ADE80; fill:rgba(74,222,128,.10);}
.zone.ignored{stroke:#94A3B8; stroke-dasharray:5 5; fill:none; opacity:.7;}
.zone.masked{stroke:#64748B;}
.zlbl{font:600 9px 'IBM Plex Mono',monospace; fill:#7E93B8;}
.zsubject{fill:#FFB454; filter:drop-shadow(0 0 5px rgba(255,180,84,.85));}
.zverbg{opacity:.92;}
.zverbg.alert{fill:#B91C1C;}
.zverbg.suppress{fill:#334155;}
.zverbg.never-captured{fill:#0F172A; stroke:#64748B; stroke-width:1;}
.zvertext{font:700 10px 'IBM Plex Mono',monospace; fill:#F8FAFC; letter-spacing:.06em;}`,
    },
    {
      order: 1374,
      css: String.raw`body.sk-editorial .zframe > rect:nth-of-type(1){fill:#F0E9DD;}
body.sk-editorial .zframe > rect:nth-of-type(2){fill:#E4DACB;}
body.sk-editorial .zframe > rect:nth-of-type(3){fill:#F8F3EA; stroke:#BBAF9E;}
body.sk-editorial .zone.armed{stroke:var(--ed-good); fill:rgba(36,115,78,.11);}
body.sk-editorial .zone.ignored{stroke:#777D78;}
body.sk-editorial .zone.masked{stroke:#696E69;}
body.sk-editorial .zlbl{fill:#414A47;}
body.sk-editorial .zsubject{fill:var(--ed-warn); filter:none;}
body.sk-editorial .zverbg.suppress{fill:#56635F;}
body.sk-editorial .zverbg.never-captured{fill:var(--ed-ink); stroke:#6E7773;}`,
    },
    {
      order: 1598,
      css: String.raw`@media screen {

  body.sk-terminal .zone.armed{stroke:var(--tm-good); fill:rgba(94,235,154,.09);}
}
@media screen {
  body.sk-terminal .zone.ignored,
  body.sk-terminal .zone.masked{stroke:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .zlbl{fill:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .zsubject{fill:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .zverbg.alert{fill:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .zverbg.suppress{fill:var(--tm-line);}
}
@media screen {
  body.sk-terminal .zverbg.never-captured{fill:var(--tm-ground); stroke:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .zvertext{fill:var(--tm-ink);}
}`,
    },
    {
      order: 1808,
      css: String.raw`@media screen {

  body.sk-pastel .zone.armed { stroke:#71BE91; fill:rgba(113,190,145,.14); }
}
@media screen {
  body.sk-pastel .zone.ignored { stroke:#A8B5C7; }
}
@media screen {
  body.sk-pastel .zone.masked { stroke:#8595AA; }
}
@media screen {
  body.sk-pastel .zlbl { fill:#A6B6CA; }
}
@media screen {
  body.sk-pastel .zsubject { fill:#F0BE78; filter:drop-shadow(0 0 4px rgba(240,190,120,.55)); }
}
@media screen {
  body.sk-pastel .zverbg.alert { fill:#C85462; }
}
@media screen {
  body.sk-pastel .zverbg.suppress { fill:#53667E; }
}
@media screen {
  body.sk-pastel .zverbg.never-captured { fill:#1C2A3E; stroke:#71839A; }
}`,
    },
    {
      order: 2047,
      css: String.raw`@media screen {

  body.sk-blueprint .zone.armed{stroke:#47F590;fill:rgba(71,245,144,.12);}
}
@media screen {
  body.sk-blueprint .zone.ignored{stroke:#A6C5D7;}
}
@media screen {
  body.sk-blueprint .zone.masked{stroke:#7898AE;}
}`,
    },
    {
      order: 2051,
      css: String.raw`@media screen {
  body.sk-blueprint .zlbl{fill:#C1DFEC;}
}`,
    },
    {
      order: 2053,
      css: String.raw`@media screen {
  body.sk-blueprint .zverbg.alert{fill:#C52D3A;}
}`,
    },
    {
      order: 2055,
      css: String.raw`@media screen {
  body.sk-blueprint .zverbg.never-captured{fill:#052956;stroke:#86BDD2;}
}`,
    },
  ],
});

/* zoneframe authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('zoneframe', {
  authoring: {
    template: {
      title: 'Zones',
      zones: [
        {
          id: 'porch',
          points: [
            [20, 40],
            [150, 40],
            [150, 160],
            [20, 160],
          ],
        },
      ],
    },
    setupFields: [
      ['zones', 'jsonArr'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['zones', 'jsonArr'],
      ['subject', 'json'],
      ['verdict', 'enum', ['alert', 'suppress', 'never-captured']],
    ],
    picker: {
      order: 16,
      name: 'Detection zones',
      category: 'Places & sensing',
      tagline: 'Where an event counts',
      description: 'Explain armed, ignored, or masked regions inside a camera frame.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { zones: { porch: 'armed' }, subject: { x: 86, y: 110 }, verdict: 'alert' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});

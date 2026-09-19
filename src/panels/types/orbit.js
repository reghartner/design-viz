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

PanelViews.register(
  'orbit',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var pulseSelector, pulseChanged;
    var ostates = Array.isArray(panel.states) ? panel.states : [];
    var ocur = state.state != null ? String(state.state) : null;
    pulseSelector = '.odot.cur';
    pulseChanged =
      Object.prototype.hasOwnProperty.call(host, '_orbitCur') &&
      host._orbitCur !== ocur;
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
      var ly =
        anchor === 'middle' ? (p.y < 78 ? p.y - 10 : p.y + 16) : p.y + 3.5;
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
      (ocur && isHex(ocolors[ocur])
        ? ' style="fill:' + ocolors[ocur] + '"'
        : '') +
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
  }
);

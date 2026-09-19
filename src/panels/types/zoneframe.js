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

PanelViews.register(
  'zoneframe',
  function (host, panel, state, skin, states, stepIdx, animate) {
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
    if (
      state.subject &&
      typeof state.subject.x === 'number' &&
      typeof state.subject.y === 'number'
    )
      h +=
        '<circle class="zsubject" cx="' +
        state.subject.x +
        '" cy="' +
        state.subject.y +
        '" r="6"/>';
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
  }
);

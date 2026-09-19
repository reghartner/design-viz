/* pir panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function pirModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var sensor =
    panel.sensor &&
    typeof panel.sensor.x === 'number' &&
    typeof panel.sensor.y === 'number'
      ? { x: panel.sensor.x, y: panel.sensor.y }
      : { x: 298, y: 78 };
  var cone = panel.cone || {};
  var facing = typeof cone.facing === 'number' ? cone.facing : 180;
  var spread =
    typeof cone.spread === 'number' ? clamp(cone.spread, 4, 340) : 66;
  var range =
    typeof cone.range === 'number' && cone.range > 0 ? cone.range : 250;
  var f = (facing * Math.PI) / 180;
  var half = ((spread / 2) * Math.PI) / 180;
  var N = 16,
    pts = [[sensor.x, sensor.y]];
  for (var i = 0; i <= N; i++) {
    var a = f - half + 2 * half * (i / N);
    pts.push([sensor.x + range * Math.cos(a), sensor.y + range * Math.sin(a)]);
  }
  var subj =
    state.subject &&
    typeof state.subject.x === 'number' &&
    typeof state.subject.y === 'number'
      ? { x: state.subject.x, y: state.subject.y }
      : null;
  var tripped = false;
  if (subj) {
    var dx = subj.x - sensor.x,
      dy = subj.y - sensor.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) {
      tripped = true;
    } else if (dist <= range) {
      var diff = Math.abs(
        Math.atan2(
          Math.sin(Math.atan2(dy, dx) - f),
          Math.cos(Math.atan2(dy, dx) - f)
        )
      );
      if (diff <= half) tripped = true;
    }
  }
  if (state.tripped === true) tripped = true;
  if (state.tripped === false) tripped = false;
  return {
    sensor: sensor,
    cone: { facing: facing, spread: spread, range: range },
    conePoints: pts,
    subject: subj,
    tripped: tripped,
    path: (function () {
      var pp = (Array.isArray(panel.path) ? panel.path : []).filter(function (
        p
      ) {
        return (
          Array.isArray(p) &&
          typeof p[0] === 'number' &&
          isFinite(p[0]) &&
          typeof p[1] === 'number' &&
          isFinite(p[1])
        );
      });
      return pp.length >= 2 ? pp : null;
    })(),
    banner: state.banner != null ? String(state.banner) : '',
    status: state.status != null ? String(state.status) : null,
  };
}

/* thermo widget: a device temperature readout against warning / critical
   shutdown thresholds. Pure model (node-testable, no DOM). The engine COMPUTES
   the zone (ok / warn / crit) from the value and the declared thresholds
   rather than trusting the author to assert it; `state.label` overrides only
   the zone-chip caption. A missing value renders as a dash (zone 'na').
   Reversed warn/crit are swapped (the validator warns). */

PanelViews.register(
  'pir',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var hBaseline = null;
    var pm = pirModel(panel, state);
    var trip = pm.tripped ? 'tripped' : 'clear';
    /* one-shot cues (cone flash, subject ripple, status blink) fire only on a
       clear→tripped transition, not on every re-render while tripped and not
       on a first render that starts tripped (host._pirTrip === false means
       the PREVIOUS render was explicitly clear; undefined means no previous
       render). The previous render's tripped/subject live on the host. */
    var pirFresh = animate && pm.tripped && host._pirTrip === false;
    var pirPrev = host._pirPrev || null;
    var pirMoved =
      animate &&
      pirPrev &&
      pm.subject &&
      (pirPrev.x !== pm.subject.x || pirPrev.y !== pm.subject.y);
    host._pirTrip = pm.tripped;
    host._pirPrev = pm.subject ? { x: pm.subject.x, y: pm.subject.y } : null;
    /* the widget markup is built twice: once WITH the one-shot transients
       (fresh classes, ghost, trail, ripple, glide offset) for the DOM, and
       once WITHOUT them as the comparison baseline (hBaseline) — the step
       AFTER a trip or a move produces exactly the steady form, so it matches
       the baseline and skips the rebuild instead of restarting the ambient
       sweep/ping animations. */
    var buildPir = function (transient) {
      var s =
        '<div class="pirbox"><svg class="pirframe" viewBox="0 0 320 180" role="img" aria-label="' +
        esc(panel.title || 'IR sensor line of sight') +
        '">';
      s +=
        '<rect width="320" height="180" class="pirbg"/><rect y="150" width="320" height="30" class="pirground"/>';
      if (pm.path)
        s +=
          '<path class="pirpath" d="M' +
          pm.path
            .map(function (p) {
              return p[0] + ' ' + p[1];
            })
            .join(' L') +
          '"/>';
      s +=
        '<polygon class="pircone ' +
        trip +
        (transient && pirFresh ? ' fresh' : '') +
        '" points="' +
        cpts +
        '"/>';
      /* scanning beam sweeping the cone + detection pings from the sensor —
         ambient life while the step is parked; suppressed under reduced motion */
      if (!RM) {
        var fr = (pm.cone.facing * Math.PI) / 180;
        var swx = pm.sensor.x + (pm.cone.range - 4) * Math.cos(fr);
        var swy = pm.sensor.y + (pm.cone.range - 4) * Math.sin(fr);
        s +=
          '<g class="pirsweep ' +
          trip +
          '" style="transform-origin:' +
          pm.sensor.x +
          'px ' +
          pm.sensor.y +
          'px;--sw:' +
          Math.max(0, pm.cone.spread / 2 - 3).toFixed(1) +
          'deg">' +
          '<line x1="' +
          pm.sensor.x +
          '" y1="' +
          pm.sensor.y +
          '" x2="' +
          swx.toFixed(1) +
          '" y2="' +
          swy.toFixed(1) +
          '"/></g>';
        s +=
          '<circle class="pirping" cx="' +
          pm.sensor.x +
          '" cy="' +
          pm.sensor.y +
          '" r="5"/>' +
          '<circle class="pirping p2" cx="' +
          pm.sensor.x +
          '" cy="' +
          pm.sensor.y +
          '" r="5"/>';
      }
      s +=
        '<circle class="pirsensor" cx="' +
        pm.sensor.x +
        '" cy="' +
        pm.sensor.y +
        '" r="5"/>';
      s +=
        '<text class="pirsensorlbl" x="' +
        (pm.sensor.x - 9) +
        '" y="' +
        (pm.sensor.y - 8) +
        '" text-anchor="end">IR</text>';
      if (pm.subject) {
        /* between steps the subject glides from its previous position: it is
           rendered offset back to the old spot via an inline transform, which
           the post-render hook releases on the next frame (CSS transition).
           A fading ghost + dashed trail mark where it came from. */
        if (transient && pirMoved) {
          s +=
            '<line class="pirtrail" x1="' +
            pirPrev.x +
            '" y1="' +
            pirPrev.y +
            '" x2="' +
            pm.subject.x +
            '" y2="' +
            pm.subject.y +
            '"/>';
          s +=
            '<circle class="pirghost" cx="' +
            pirPrev.x +
            '" cy="' +
            pirPrev.y +
            '" r="6"/>';
        }
        s +=
          '<circle class="pirsubject ' +
          trip +
          '" cx="' +
          pm.subject.x +
          '" cy="' +
          pm.subject.y +
          '" r="6"' +
          (transient && pirMoved
            ? ' style="transform:translate(' +
              (pirPrev.x - pm.subject.x) +
              'px,' +
              (pirPrev.y - pm.subject.y) +
              'px)"'
            : '') +
          '/>';
        if (transient && !RM && pirFresh)
          s +=
            '<circle class="pirripple" cx="' +
            pm.subject.x +
            '" cy="' +
            pm.subject.y +
            '" r="6"/>';
      }
      var pstat =
        pm.status != null
          ? pm.status
          : pm.subject
          ? pm.tripped
            ? 'IR TRIPPED'
            : 'IR CLEAR'
          : '';
      if (pstat) {
        s +=
          '<rect class="pirstatusbg ' +
          trip +
          (transient && pirFresh ? ' fresh' : '') +
          '" x="0" y="0" width="132" height="20"/>' +
          '<text class="pirstatustext" x="8" y="14">' +
          esc(pstat) +
          '</text>';
      }
      if (pm.banner) {
        s +=
          '<rect class="pirbannerbg" x="0" y="150" width="320" height="30"/>' +
          '<text class="pirbannertext" x="160" y="169" text-anchor="middle">' +
          esc(pm.banner) +
          '</text>';
      }
      return s + '</svg></div>';
    };
    var cpts = pm.conePoints
      .map(function (p) {
        return p[0].toFixed(1) + ',' + p[1].toFixed(1);
      })
      .join(' ');
    var pirTransients = pirFresh || pirMoved;
    h += buildPir(true);
    hBaseline = pirTransients ? buildPir(false) : null;
    return {
      html: h,
      baseline: hBaseline,
      transient: '.pirghost,.pirtrail,.pirripple',
      glide: { selector: '.pirsubject', multiple: false },
    };
  }
);

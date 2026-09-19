/* timeline panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function timelineLabelRows(events) {
  /* deterministic label collision layout: labels go on row 0, overflow
     to row 1, and drop to hover-title-only (labelRow null) when both
     rows are occupied at that x. Widths are estimated from the 8.5px
     mono glyphs; x positions mirror the renderer's clamp. */
  var charW = 5.1;
  var ends = [-Infinity, -Infinity];
  events.forEach(function (e) {
    if (!e.label) {
      e.labelRow = null;
      return;
    }
    /* the estimate and the drawing must agree: long labels TRUNCATE to
       what the estimate measures (the hover title keeps the full text) */
    e.labelText =
      e.label.length > 22 ? e.label.slice(0, 21) + '\u2026' : e.label;
    var x = Math.min(Math.max(6 + (e.pct / 100) * 308, 16), 304);
    var half = (e.labelText.length * charW) / 2;
    var xs = x - half,
      xe = x + half;
    if (xs >= ends[0] + 4) {
      e.labelRow = 0;
      ends[0] = xe;
    } else if (xs >= ends[1] + 4) {
      e.labelRow = 1;
      ends[1] = xe;
    } else e.labelRow = null;
  });
  return events;
}
/* cadence lanes: several periodic processes on ONE wall-clock axis,
   each lane rendered in a density REGIME chosen by its beat count over
   the span — individual dots, a true-spacing tick comb, a solid band,
   or an empty row with a "next in …" promise. The regime is the
   orders-of-magnitude contrast. Pure model. */
var TL_DOT_MAX = 32; /* beats drawable as individual dots on the track */
var TL_COMB_MAX = 120; /* beats drawable as a legible tick comb */
function timelineLanesModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var span = parseClock(panel.span);
  if (span == null || span <= 0) span = 3600;
  if (span > TIMELINE_MAX_SPAN) span = TIMELINE_MAX_SPAN;
  var units = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  var unit = units[units.length - 1];
  for (var i = 0; i < units.length; i++) {
    if (span / units[i] <= 8) {
      unit = units[i];
      break;
    }
  }
  var ticks = [];
  for (var ts = 0; ts <= span + 1e-6 && ticks.length <= 12; ts += unit)
    ticks.push({ s: ts, pct: (ts / span) * 100, label: formatClock(ts) });
  var nowS = parseClock(state.now);
  var now = null;
  if (nowS != null) {
    var nc = Math.min(Math.max(nowS, 0), span);
    now = { s: nc, pct: (nc / span) * 100, label: formatClock(nc) };
  }
  function normList(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (e) {
      if (!e) return;
      var at = parseClock(e.at);
      if (at == null) return;
      var s = Math.min(Math.max(at, 0), span);
      out.push({
        s: s,
        pct: (s / span) * 100,
        lane: e.lane != null ? String(e.lane) : null,
        label: e.label != null ? String(e.label) : '',
        kind: ['ok', 'alert', 'info'].indexOf(e.kind) >= 0 ? e.kind : 'info',
      });
    });
    return out;
  }
  var allEvents = normList(panel.events).concat(normList(state.events));
  var misses = normList(state.miss);
  var seen = Object.create(null);
  var lanes = [];
  (Array.isArray(panel.lanes) ? panel.lanes : []).forEach(function (l) {
    if (lanes.length >= 4) return;
    if (!l || typeof l !== 'object' || l.id == null) return;
    var id = String(l.id);
    if (seen[id]) return;
    var every = parseClock(l.every);
    if (every == null || every <= 0) return;
    seen[id] = true;
    var count = Math.floor((span + 1e-6) / every);
    var regime =
      count < 1
        ? 'sparse'
        : count <= TL_DOT_MAX
        ? 'dots'
        : count <= TL_COMB_MAX
        ? 'comb'
        : 'band';
    var beats = [];
    if (regime === 'dots') {
      for (var b = every; b <= span + 1e-6; b += every)
        beats.push({
          s: b,
          pct: (b / span) * 100,
          past: !!(now && b <= now.s + 1e-6),
        });
    }
    var badge;
    if (regime === 'sparse') {
      if (now) {
        var nextAt = (Math.floor((now.s + 1e-6) / every) + 1) * every;
        badge = 'next in ' + formatClock(nextAt - now.s) + ' \u25b8';
      } else badge = 'every ' + formatClock(every);
    } else badge = count + '\u00d7';
    lanes.push({
      id: id,
      label: l.label != null ? String(l.label) : id,
      every: every,
      everyLabel: formatClock(every),
      regime: regime,
      count: count,
      beats: beats,
      spacingPct: (every / span) * 100,
      badge: badge,
      misses: misses.filter(function (m) {
        return m.lane === id;
      }),
      events: allEvents.filter(function (e) {
        return e.lane === id;
      }),
    });
  });
  return {
    span: span,
    spanLabel: formatClock(span),
    ticks: ticks,
    now: now,
    lanes: lanes,
    axisEvents: allEvents.filter(function (e) {
      return e.lane == null || !seen[e.lane];
    }),
  };
}

function timelineModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var span = parseClock(panel.span);
  if (span == null || span <= 0) span = 3600;
  if (span > TIMELINE_MAX_SPAN) span = TIMELINE_MAX_SPAN; /* validator warns */
  /* tick unit: coarsest table entry giving at most 8 intervals; the top
     entry (1d) covers the clamped 7d maximum within the bound */
  var units = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  var unit = units[units.length - 1];
  for (var i = 0; i < units.length; i++) {
    if (span / units[i] <= 8) {
      unit = units[i];
      break;
    }
  }
  var ticks = [];
  for (var ts = 0; ts <= span + 1e-6 && ticks.length <= 12; ts += unit)
    ticks.push({ s: ts, pct: (ts / span) * 100, label: formatClock(ts) });
  var every = panel.cadence ? parseClock(panel.cadence.every) : null;
  var beats = [],
    beatsOmitted = 0;
  if (every != null && every > 0) {
    var beatCount = Math.floor((span + 1e-6) / every);
    if (beatCount > TIMELINE_MAX_BEATS) {
      /* sub-pixel soup — draw none, report the count instead of
         silently truncating the cadence */
      beatsOmitted = beatCount;
    } else {
      for (var b = every; b <= span + 1e-6; b += every)
        beats.push({ s: b, pct: (b / span) * 100 });
    }
  }
  function norm(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (e) {
      if (!e) return;
      var at = parseClock(e.at);
      if (at == null) return;
      var s = Math.min(Math.max(at, 0), span);
      out.push({
        s: s,
        pct: (s / span) * 100,
        label: e.label != null ? String(e.label) : '',
        kind: ['ok', 'alert', 'info'].indexOf(e.kind) >= 0 ? e.kind : 'info',
      });
    });
    return out;
  }
  var events = norm(panel.events).concat(norm(state.events));
  events.sort(function (a, b) {
    return a.s - b.s;
  });
  timelineLabelRows(events);
  var nowS = parseClock(state.now);
  var now = null;
  if (nowS != null) {
    var c = Math.min(Math.max(nowS, 0), span);
    now = { s: c, pct: (c / span) * 100, label: formatClock(c) };
  }
  /* detail window: the cadence interval containing `now`, magnified so
     events BETWEEN two long-running beats spread out legibly. Derived —
     no spec field. Absent without a cadence or a cursor. */
  var detail = null;
  if (every != null && every > 0 && now) {
    var k = Math.floor((now.s + 1e-6) / every);
    var dStart = k * every;
    if (dStart >= span) dStart = Math.max(span - every, 0);
    var dEnd = Math.min(dStart + every, span);
    if (dEnd > dStart) {
      var dLen = dEnd - dStart;
      var dEvents = [];
      events.forEach(function (e) {
        if (e.s >= dStart - 1e-6 && e.s <= dEnd + 1e-6)
          dEvents.push({
            s: e.s,
            pct: ((e.s - dStart) / dLen) * 100,
            label: e.label,
            kind: e.kind,
          });
      });
      timelineLabelRows(dEvents);
      var dUnits = [
        1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200,
      ];
      var dUnit = dUnits[dUnits.length - 1];
      for (var di = 0; di < dUnits.length; di++) {
        if (dLen / dUnits[di] <= 6) {
          dUnit = dUnits[di];
          break;
        }
      }
      var dTicks = [];
      for (
        var dts = Math.ceil((dStart + 1e-6) / dUnit) * dUnit;
        dts < dEnd - 1e-6 && dTicks.length <= 8;
        dts += dUnit
      )
        dTicks.push({ s: dts, pct: ((dts - dStart) / dLen) * 100 });
      detail = {
        start: dStart,
        end: dEnd,
        startLabel: formatClock(dStart),
        endLabel: formatClock(dEnd),
        startPct: (dStart / span) * 100,
        endPct: (dEnd / span) * 100,
        ticks: dTicks,
        events: dEvents,
        nowPct: Math.min(Math.max(((now.s - dStart) / dLen) * 100, 0), 100),
        startPast: now.s >= dStart - 1e-6,
        endPast: now.s >= dEnd - 1e-6,
      };
    }
  }
  return {
    span: span,
    spanLabel: formatClock(span),
    unit: unit,
    ticks: ticks,
    beats: beats,
    beatsOmitted: beatsOmitted,
    every: every,
    events: events,
    now: now,
    detail: detail,
    cadenceLabel:
      panel.cadence && panel.cadence.label != null
        ? String(panel.cadence.label)
        : '',
  };
}

PanelViews.register(
  'timeline',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    if (Array.isArray(panel.lanes) && panel.lanes.length) {
      var lnm = timelineLanesModel(panel, state);
      var LX0 = 70,
        LX1 = 252,
        LW = LX1 - LX0; /* track range; labels left, badges right */
      function lx(pct) {
        return (LX0 + (pct / 100) * LW).toFixed(1);
      }
      var rowsTop = 22,
        rowH = 18;
      var rowsBottom = rowsTop + lnm.lanes.length * rowH;
      var tlH = rowsBottom + 14;
      h +=
        '<svg class="tlsvg" viewBox="0 0 320 ' +
        tlH +
        '" role="img" aria-label="cadence lanes">';
      /* shared axis strip on top */
      h +=
        '<line class="tlaxis" x1="' +
        LX0 +
        '" y1="12" x2="' +
        LX1 +
        '" y2="12"/>';
      lnm.ticks.forEach(function (tk) {
        h +=
          '<line class="tltickline" x1="' +
          lx(tk.pct) +
          '" y1="8" x2="' +
          lx(tk.pct) +
          '" y2="16"/>';
      });
      lnm.axisEvents.forEach(function (ev) {
        h +=
          '<circle class="tlev tl-' +
          ev.kind +
          '" cx="' +
          lx(ev.pct) +
          '" cy="12" r="2.6"><title>' +
          esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) +
          '</title></circle>';
      });
      /* lane rows */
      lnm.lanes.forEach(function (ln, li) {
        var cy = rowsTop + li * rowH + 9;
        var labText =
          ln.label.length > 13 ? ln.label.slice(0, 12) + '\u2026' : ln.label;
        h +=
          '<text class="tllane" x="2" y="' +
          (cy + 3) +
          '">' +
          esc(labText) +
          '<title>' +
          esc(ln.label + ' — every ' + ln.everyLabel) +
          '</title></text>';
        h +=
          '<line class="tlrowline" x1="' +
          LX0 +
          '" y1="' +
          cy +
          '" x2="' +
          LX1 +
          '" y2="' +
          cy +
          '"/>';
        var splitX = lnm.now ? parseFloat(lx(lnm.now.pct)) : LX0;
        if (ln.regime === 'dots') {
          ln.beats.forEach(function (bt) {
            h +=
              '<circle class="tlbeat' +
              (bt.past ? ' past' : '') +
              '" cx="' +
              lx(bt.pct) +
              '" cy="' +
              cy +
              '" r="2.6"/>';
          });
        } else if (ln.regime === 'comb') {
          var spacing = (ln.spacingPct / 100) * LW;
          var pid = 'tlp' + ++ZF_SEQ;
          h +=
            '<defs><pattern id="' +
            pid +
            '" x="' +
            LX0 +
            '" width="' +
            spacing.toFixed(3) +
            '" height="' +
            rowH +
            '" patternUnits="userSpaceOnUse">' +
            '<line class="tlcombline" x1="' +
            spacing.toFixed(3) +
            '" y1="3" x2="' +
            spacing.toFixed(3) +
            '" y2="15"/></pattern></defs>';
          if (splitX > LX0)
            h +=
              '<rect class="tlpast" x="' +
              LX0 +
              '" y="' +
              (cy - 9) +
              '" width="' +
              (splitX - LX0).toFixed(1) +
              '" height="' +
              rowH +
              '" fill="url(#' +
              pid +
              ')"/>';
          if (splitX < LX1)
            h +=
              '<rect class="tlfuture" x="' +
              splitX.toFixed(1) +
              '" y="' +
              (cy - 9) +
              '" width="' +
              (LX1 - splitX).toFixed(1) +
              '" height="' +
              rowH +
              '" fill="url(#' +
              pid +
              ')"/>';
        } else if (ln.regime === 'band') {
          if (splitX > LX0)
            h +=
              '<rect class="tlbandfill tlpast" x="' +
              LX0 +
              '" y="' +
              (cy - 4) +
              '" width="' +
              (splitX - LX0).toFixed(1) +
              '" height="8" rx="2"/>';
          if (splitX < LX1)
            h +=
              '<rect class="tlbandfill tlfuture" x="' +
              splitX.toFixed(1) +
              '" y="' +
              (cy - 4) +
              '" width="' +
              (LX1 - splitX).toFixed(1) +
              '" height="8" rx="2"/>';
        }
        /* sparse: the badge carries the promise; nothing on the track */
        ln.misses.forEach(function (m) {
          if (ln.regime === 'dots') {
            h +=
              '<circle class="tlmissring" cx="' +
              lx(m.pct) +
              '" cy="' +
              cy +
              '" r="4"><title>' +
              esc('missed — expected ' + formatClock(m.s)) +
              '</title></circle>';
          } else {
            h +=
              '<line class="tlmiss" x1="' +
              lx(m.pct) +
              '" y1="' +
              (cy - 8) +
              '" x2="' +
              lx(m.pct) +
              '" y2="' +
              (cy + 8) +
              '"><title>' +
              esc('missed — expected ' + formatClock(m.s)) +
              '</title></line>';
          }
        });
        ln.events.forEach(function (ev) {
          h +=
            '<circle class="tlev tl-' +
            ev.kind +
            '" cx="' +
            lx(ev.pct) +
            '" cy="' +
            cy +
            '" r="3"><title>' +
            esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) +
            '</title></circle>';
        });
        h +=
          '<text class="tlbadge" x="318" y="' +
          (cy + 3) +
          '" text-anchor="end">' +
          esc(ln.badge) +
          '</text>';
      });
      /* the now cursor runs through the axis and every row */
      if (lnm.now) {
        var lnx = lx(lnm.now.pct);
        h +=
          '<line class="tlnow" x1="' +
          lnx +
          '" y1="6" x2="' +
          lnx +
          '" y2="' +
          rowsBottom +
          '"/>' +
          '<circle class="tlnowhead" cx="' +
          lnx +
          '" cy="6" r="3"/>';
      }
      /* tick labels under the rows */
      lnm.ticks.forEach(function (tk) {
        h +=
          '<text class="tltick" x="' +
          lx(tk.pct) +
          '" y="' +
          (rowsBottom + 10) +
          '" text-anchor="middle">' +
          esc(tk.label) +
          '</text>';
      });
      h += '</svg>';
      var lmeta = [];
      if (lnm.now) lmeta.push('now ' + lnm.now.label);
      lmeta.push('span ' + lnm.spanLabel);
      h += '<div class="tlmeta">' + esc(lmeta.join(' \u00b7 ')) + '</div>';
    } else {
      var tlm = timelineModel(panel, state);
      function tlx(pct) {
        return (6 + (pct / 100) * 308).toFixed(1);
      }
      if (tlm.detail) {
        /* overview strip on top, the CURRENT cadence interval magnified
         below — events between two long-running beats spread out there */
        var dm = tlm.detail;
        h +=
          '<svg class="tlsvg" viewBox="0 0 320 100" role="img" aria-label="timeline">';
        /* overview strip */
        if (tlm.now)
          h +=
            '<rect class="tlelapsed" x="6" y="9" width="' +
            ((tlm.now.pct / 100) * 308).toFixed(1) +
            '" height="6" rx="2"/>';
        h +=
          '<rect class="tlband" x="' +
          tlx(dm.startPct) +
          '" y="3" width="' +
          (((dm.endPct - dm.startPct) / 100) * 308).toFixed(1) +
          '" height="18"/>';
        h += '<line class="tlaxis" x1="6" y1="12" x2="314" y2="12"/>';
        tlm.ticks.forEach(function (tk) {
          h +=
            '<line class="tltickline" x1="' +
            tlx(tk.pct) +
            '" y1="9" x2="' +
            tlx(tk.pct) +
            '" y2="15"/>';
        });
        tlm.beats.forEach(function (bt) {
          var past = tlm.now && bt.s <= tlm.now.s + 1e-6;
          h +=
            '<circle class="tlbeat' +
            (past ? ' past' : '') +
            '" cx="' +
            tlx(bt.pct) +
            '" cy="12" r="2.2"/>';
        });
        tlm.events.forEach(function (ev) {
          h +=
            '<circle class="tlev tl-' +
            ev.kind +
            '" cx="' +
            tlx(ev.pct) +
            '" cy="12" r="1.7"/>';
        });
        if (tlm.now) {
          var onx = tlx(tlm.now.pct);
          h +=
            '<line class="tlnow" x1="' +
            onx +
            '" y1="4" x2="' +
            onx +
            '" y2="20"/>';
        }
        /* zoom connectors from the band to the detail axis */
        h +=
          '<line class="tlzoom" x1="' +
          tlx(dm.startPct) +
          '" y1="21" x2="6" y2="46"/>' +
          '<line class="tlzoom" x1="' +
          tlx(dm.endPct) +
          '" y1="21" x2="314" y2="46"/>';
        /* detail: one interval, beat to beat */
        h += '<line class="tlaxis" x1="6" y1="68" x2="314" y2="68"/>';
        dm.ticks.forEach(function (tk) {
          h +=
            '<line class="tltickline" x1="' +
            tlx(tk.pct) +
            '" y1="64" x2="' +
            tlx(tk.pct) +
            '" y2="72"/>';
        });
        h +=
          '<circle class="tlbeat' +
          (dm.startPast ? ' past' : '') +
          '" cx="6" cy="68" r="4.2"/>' +
          '<circle class="tlbeat' +
          (dm.endPast ? ' past' : '') +
          '" cx="314" cy="68" r="4.2"/>' +
          '<text class="tltick" x="6" y="84" text-anchor="start">' +
          esc(dm.startLabel) +
          '</text>' +
          '<text class="tltick" x="314" y="84" text-anchor="end">' +
          esc(dm.endLabel) +
          '</text>';
        dm.events.forEach(function (ev) {
          var x = tlx(ev.pct);
          h +=
            '<circle class="tlev tl-' +
            ev.kind +
            '" cx="' +
            x +
            '" cy="54" r="4"><title>' +
            esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) +
            '</title></circle>';
          if (ev.label && ev.labelRow != null)
            h +=
              '<text class="tlevlab" x="' +
              Math.min(Math.max(parseFloat(x), 16), 304) +
              '" y="' +
              (ev.labelRow === 0 ? 43 : 32) +
              '" text-anchor="middle">' +
              esc(ev.labelText || ev.label) +
              '</text>';
        });
        var dnx = tlx(dm.nowPct);
        h +=
          '<line class="tlnow" x1="' +
          dnx +
          '" y1="47" x2="' +
          dnx +
          '" y2="74"/>' +
          '<circle class="tlnowhead" cx="' +
          dnx +
          '" cy="47" r="3"/>';
        h += '</svg>';
      } else {
        h +=
          '<svg class="tlsvg" viewBox="0 0 320 64" role="img" aria-label="timeline">';
        if (tlm.now)
          h +=
            '<rect class="tlelapsed" x="6" y="36" width="' +
            ((tlm.now.pct / 100) * 308).toFixed(1) +
            '" height="8" rx="2"/>';
        h += '<line class="tlaxis" x1="6" y1="40" x2="314" y2="40"/>';
        tlm.ticks.forEach(function (tk) {
          var x = tlx(tk.pct);
          h +=
            '<line class="tltickline" x1="' +
            x +
            '" y1="36" x2="' +
            x +
            '" y2="44"/>' +
            '<text class="tltick" x="' +
            x +
            '" y="56" text-anchor="middle">' +
            esc(tk.label) +
            '</text>';
        });
        tlm.beats.forEach(function (bt) {
          var past = tlm.now && bt.s <= tlm.now.s + 1e-6;
          h +=
            '<circle class="tlbeat' +
            (past ? ' past' : '') +
            '" cx="' +
            tlx(bt.pct) +
            '" cy="40" r="2.6"/>';
        });
        tlm.events.forEach(function (ev) {
          var x = tlx(ev.pct);
          h +=
            '<circle class="tlev tl-' +
            ev.kind +
            '" cx="' +
            x +
            '" cy="26" r="4"><title>' +
            esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) +
            '</title></circle>';
          if (ev.label && ev.labelRow != null)
            h +=
              '<text class="tlevlab" x="' +
              Math.min(Math.max(parseFloat(x), 16), 304) +
              '" y="' +
              (ev.labelRow === 0 ? 15 : 6) +
              '" text-anchor="middle">' +
              esc(ev.labelText || ev.label) +
              '</text>';
        });
        if (tlm.now) {
          var nx = tlx(tlm.now.pct);
          h +=
            '<line class="tlnow" x1="' +
            nx +
            '" y1="18" x2="' +
            nx +
            '" y2="46"/>' +
            '<circle class="tlnowhead" cx="' +
            nx +
            '" cy="18" r="3"/>';
        }
        h += '</svg>';
      }
      var tlmeta = [];
      if (tlm.every != null && tlm.every > 0) {
        var cad =
          (tlm.cadenceLabel || 'beat') + ' every ' + formatClock(tlm.every);
        if (tlm.beatsOmitted)
          cad += ' (' + tlm.beatsOmitted + ' beats — too dense to draw)';
        tlmeta.push(cad);
      }
      if (tlm.detail)
        tlmeta.push(
          'window ' + tlm.detail.startLabel + '\u2013' + tlm.detail.endLabel
        );
      if (tlm.now) tlmeta.push('now ' + tlm.now.label);
      tlmeta.push('span ' + tlm.spanLabel);
      h += '<div class="tlmeta">' + esc(tlmeta.join(' · ')) + '</div>';
    }
    return { html: h };
  }
);

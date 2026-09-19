/* homemap panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var HOMEMAP_DISPLAY_HEIGHT = 216;
var HOMEMAP_Y_SCALE = HOMEMAP_DISPLAY_HEIGHT / 180;
function homemapPointFromDisplay(point) {
  return {
    x: Math.round(clamp(point.x, 0, 320)),
    y: Math.round(clamp(point.y / HOMEMAP_Y_SCALE, 0, 180)),
  };
}
function homemapModel(panel, state) {
  panel = panel || {};
  state = state || {};
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  var box = panel.outline || {};
  var w = fin(box.w) != null ? clamp(box.w, 20, 320) : 300;
  var h = fin(box.h) != null ? clamp(box.h, 20, 180) : 160;
  var ox = fin(box.x) != null ? clamp(box.x, 0, 320 - w) : (320 - w) / 2;
  var oy = fin(box.y) != null ? clamp(box.y, 0, 180 - h) : (180 - h) / 2;
  var byId = Object.create(null),
    seen = Object.create(null),
    devices = [];
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function (d) {
    if (!d || typeof d.id !== 'string' || seen[d.id]) return;
    seen[d.id] = true;
    if (!homemapDeviceValid(d)) return;
    var vocab = HOMEMAP_STATES[d.kind];
    var x = clamp(d.x, 0, 320),
      y = clamp(d.y, 0, 180);
    var floorDoor = d.kind === 'entry' && d.display === 'door';
    var devicePatch = Object.prototype.hasOwnProperty.call(state, d.id)
      ? state[d.id]
      : undefined;
    var operating = panelObject(devicePatch) ? devicePatch.state : devicePatch;
    var facing =
      fin(d.facing) != null
        ? d.facing
        : floorDoor
        ? 0
        : (Math.atan2(90 - y, 160 - x) * 180) / Math.PI;
    var item = {
      id: d.id,
      kind: d.kind,
      label: String(d.label != null ? d.label : d.id),
      x: x,
      y: y,
      state: vocab.indexOf(operating) >= 0 ? operating : vocab[0],
      thermal:
        panelObject(devicePatch) &&
        HOMEMAP_THERMAL.indexOf(devicePatch.thermal) >= 0
          ? devicePatch.thermal
          : 'normal',
      icon: ICON_SET.indexOf(d.icon) >= 0 ? d.icon : 'gear',
      facing: ((facing % 360) + 360) % 360,
      spread: fin(d.spread) != null ? clamp(d.spread, 10, 180) : 80,
      range: fin(d.range) != null ? clamp(d.range, 20, 160) : 70,
    };
    if (floorDoor) {
      item.display = 'door';
      item.doorWidth =
        fin(d.doorWidth) != null ? clamp(d.doorWidth, 8, 48) : 24;
      item.doorSwing =
        fin(d.doorSwing) != null &&
        Math.abs(d.doorSwing) >= 15 &&
        Math.abs(d.doorSwing) <= 135
          ? d.doorSwing
          : 90;
    }
    byId[d.id] = item;
    devices.push(item);
  });
  var subjects = homemapSubjects(panel).map(function (sub) {
    var value = Object.prototype.hasOwnProperty.call(state, sub.id)
      ? state[sub.id]
      : undefined;
    var position = homemapSubjectPosition(value) ? value : sub;
    return {
      id: sub.id,
      label: String(sub.label != null ? sub.label : sub.id),
      icon:
        sub.icon === undefined
          ? null
          : ICON_SET.indexOf(sub.icon) >= 0
          ? sub.icon
          : 'gear',
      x: clamp(position.x, 0, 320),
      y: clamp(position.y, 0, 180),
      hidden: value === null,
    };
  });
  var signals = [];
  (Array.isArray(state.signals) ? state.signals : []).forEach(function (sig) {
    if (
      !sig ||
      Array.isArray(sig) ||
      typeof sig.from !== 'string' ||
      typeof sig.to !== 'string'
    )
      return;
    var from = byId[sig.from],
      to = byId[sig.to];
    if (from && to)
      signals.push({
        from: sig.from,
        to: sig.to,
        fromXY: { x: from.x, y: from.y },
        toXY: { x: to.x, y: to.y },
      });
  });
  return {
    outline: { x: ox, y: oy, w: w, h: h },
    devices: devices,
    subjects: subjects,
    signals: signals,
  };
}

/* Room lighting is a view of the authored scene, not a simulated sensor or
   containment rule. The highest visible device state wins, then occupancy. */
function homemapRoomModel(panel, model) {
  return homemapRooms(panel).map(function (room) {
    function inside(item) {
      var house = model.outline;
      if (
        room.kind === 'outdoor' &&
        item.x > house.x &&
        item.x < house.x + house.w &&
        item.y > house.y &&
        item.y < house.y + house.h
      )
        return false;
      return (
        item.x >= room.x &&
        item.y >= room.y &&
        (item.x < room.x + room.w ||
          (item.x === 320 && room.x + room.w === 320)) &&
        (item.y < room.y + room.h ||
          (item.y === 180 && room.y + room.h === 180))
      );
    }
    var devices = model.devices.filter(inside);
    var occupied = model.subjects.some(function (s) {
      return !s.hidden && inside(s);
    });
    var tone = devices.some(function (d) {
      return d.state === 'alert' || d.state === 'detect';
    })
      ? 'alert'
      : devices.some(function (d) {
          return d.state === 'warn';
        })
      ? 'warn'
      : occupied
      ? 'occupied'
      : 'quiet';
    return { room: room, tone: tone };
  });
}

function homemapThermalHTML(d, scaleY, clearing) {
  var thermal = clearing || d.thermal;
  if (!thermal || thermal === 'normal') return '';
  var cold = thermal === 'cold' || thermal === 'freezing';
  var s =
    '<g class="hmthermal thermal-' +
    thermal +
    (clearing ? ' thermal-clearing' : '') +
    '" data-home-thermal="' +
    esc(d.id) +
    '" data-thermal="' +
    esc(d.thermal) +
    '" transform="translate(' +
    d.x +
    ' ' +
    d.y * scaleY +
    ')">' +
    '<title>' +
    esc(
      d.label + ': ' + (clearing ? 'temperature returning to normal' : thermal)
    ) +
    '</title>' +
    '<circle class="thermal-halo" r="20"/><circle class="thermal-rim" r="12"/>';
  if (cold) {
    for (var i = 0; i < 6; i++)
      s +=
        '<path class="thermal-frost" transform="rotate(' +
        i * 60 +
        ')" d="M0 -11 V-19 M-3 -16 L0 -13 L3 -16"/>';
    s +=
      '<g class="thermal-badge" transform="translate(17 -17)"><circle r="7"/><path d="M0 -4 V4 M-3.5 -2 L3.5 2 M-3.5 2 L3.5 -2"/></g>';
  } else {
    [-8, 0, 8].forEach(function (x, i) {
      s +=
        '<path class="thermal-wave" style="animation-delay:-' +
        i * 0.65 +
        's" d="M' +
        x +
        ' -13 C' +
        (x - 5) +
        ' -18 ' +
        (x + 5) +
        ' -21 ' +
        x +
        ' -27"/>';
    });
    s +=
      '<g class="thermal-badge" transform="translate(17 -17)"><circle r="7"/><use href="#i-thermo" x="-5" y="-5" width="10" height="10"/></g>';
  }
  return s + '</g>';
}
function homemapDoorHTML(d, transition, outline, clearing) {
  var w = d.doorWidth,
    angle = (d.doorSwing * Math.PI) / 180;
  var endX = (w * Math.cos(angle)).toFixed(3),
    endY = (w * Math.sin(angle)).toFixed(3);
  var body =
    '<g class="hmdev hm-entry hm-' +
    esc(d.state) +
    ' hm-floor-door" data-device="' +
    esc(d.id) +
    '">' +
    '<title>' +
    esc(d.label) +
    ': ' +
    esc(d.state) +
    '</title>' +
    homemapThermalHTML(d, HOMEMAP_Y_SCALE, clearing) +
    '<g transform="translate(' +
    d.x +
    ' ' +
    d.y * HOMEMAP_Y_SCALE +
    ') scale(1 ' +
    HOMEMAP_Y_SCALE +
    ') rotate(' +
    d.facing +
    ')">' +
    '<path class="hm-door-threshold" d="M-1 0 H' +
    (w + 1) +
    '"/>' +
    '<path class="hm-door-hit" d="M0 0 H' +
    w +
    ' M' +
    w +
    ' 0 A' +
    w +
    ' ' +
    w +
    ' 0 0 ' +
    (d.doorSwing > 0 ? 1 : 0) +
    ' ' +
    endX +
    ' ' +
    endY +
    '"/>' +
    '<path class="hm-door-arc" d="M' +
    w +
    ' 0 A' +
    w +
    ' ' +
    w +
    ' 0 0 ' +
    (d.doorSwing > 0 ? 1 : 0) +
    ' ' +
    endX +
    ' ' +
    endY +
    '"/>' +
    '<g class="hm-floor-leaf' +
    (transition ? ' hm-floor-' + transition : '') +
    '" style="--hm-door-angle:' +
    d.doorSwing +
    'deg">' +
    '<path d="M0 0 H' +
    w +
    '"/><circle class="hm-door-handle" cx="' +
    (w - 4) +
    '" cy="-2" r="1"/></g>' +
    '<path class="hm-door-jamb" d="M0 -3 V3 M' +
    w +
    ' -3 V3"/><circle class="hm-door-hinge" r="1.8"/></g>';
  var labelX = d.x,
    labelY =
      d.y > 139 ? d.y * HOMEMAP_Y_SCALE - 14 : d.y * HOMEMAP_Y_SCALE + 16;
  var direction = (d.facing * Math.PI) / 180;
  if (outline && Math.abs(Math.cos(direction)) > 0.7) {
    labelX += (w * Math.cos(direction)) / 2;
    labelY =
      (d.y + (w * Math.sin(direction)) / 2) * HOMEMAP_Y_SCALE +
      (d.y < outline.y + outline.h / 2 ? -14 : 14);
  }
  return (
    body +
    '<text class="hmlbl" x="' +
    clamp(labelX, 28, 292) +
    '" y="' +
    clamp(labelY, 10, HOMEMAP_DISPLAY_HEIGHT - 5) +
    '" text-anchor="middle">' +
    esc(d.label) +
    '</text></g>'
  );
}

PanelViews.register(
  'homemap',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var hBaseline = null;
    var hm = homemapModel(panel, state);
    var hmThermalPrev = host._hmThermal || Object.create(null),
      hmThermalNow = Object.create(null),
      hmClearing = Object.create(null);
    var hmPrev = host._hmStates || Object.create(null),
      hmNow = Object.create(null);
    var hmFresh = Object.create(null),
      hmHasFresh = false,
      hmDoors = Object.create(null);
    hm.devices.forEach(function (d) {
      hmThermalNow[d.id] = d.thermal;
      if (
        animate &&
        d.thermal === 'normal' &&
        hmThermalPrev[d.id] &&
        hmThermalPrev[d.id] !== 'normal'
      ) {
        hmClearing[d.id] = hmThermalPrev[d.id];
        hmHasFresh = true;
      }
      hmNow[d.id] = d.state;
      if (
        animate &&
        d.kind === 'entry' &&
        hmPrev[d.id] !== undefined &&
        (d.state === 'open') !== (hmPrev[d.id] === 'open')
      ) {
        hmDoors[d.id] = d.state === 'open' ? 'opening' : 'closing';
        hmHasFresh = true;
      }
      if (
        animate &&
        hmPrev[d.id] !== undefined &&
        hmPrev[d.id] !== d.state &&
        ((d.kind === 'camera' && d.state === 'detect') ||
          (d.kind === 'entry' && d.state === 'alert') ||
          (d.kind === 'hub' && d.state === 'rx') ||
          (d.kind === 'sensor' && ['warn', 'alert'].indexOf(d.state) >= 0))
      ) {
        hmFresh[d.id] = true;
        hmHasFresh = true;
      }
    });
    host._hmStates = hmNow;
    host._hmThermal = hmThermalNow;
    var hmSubjPrev = host._hmSubjPrev || Object.create(null),
      hmSubjNow = Object.create(null);
    var hmMoved = Object.create(null),
      hmHasMoved = false;
    hm.subjects.forEach(function (sub) {
      if (sub.hidden) return;
      var prev = hmSubjPrev[sub.id];
      hmSubjNow[sub.id] = { x: sub.x, y: sub.y };
      if (animate && prev && (prev.x !== sub.x || prev.y !== sub.y)) {
        hmMoved[sub.id] = true;
        hmHasMoved = true;
      }
    });
    /* Hidden/removed subjects lose their previous position before reappearing. */
    host._hmSubjPrev = hmSubjNow;
    var hmSignals =
      animate && typeof stepIdx === 'number' && stepIdx >= 0 ? hm.signals : [];
    var buildHomemap = function (transient) {
      var o = hm.outline;
      var sy = HOMEMAP_Y_SCALE;
      var s =
        '<svg class="hmframe" viewBox="0 0 320 ' +
        HOMEMAP_DISPLAY_HEIGHT +
        '" role="img" aria-label="' +
        esc(panel.title || 'Home device map') +
        '">';
      var spaces = homemapRoomModel(panel, hm);
      function drawSpace(space) {
        var room = space.room,
          outdoor = room.kind === 'outdoor';
        s +=
          '<g class="hmspace hm-room-' +
          space.tone +
          (outdoor ? ' hm-outdoor' : '') +
          '" data-home-room="' +
          panel.rooms.indexOf(room) +
          '">';
        s +=
          '<rect class="hmroom" x="' +
          room.x +
          '" y="' +
          room.y * sy +
          '" width="' +
          room.w +
          '" height="' +
          room.h * sy +
          '" rx="2"/>';
        if (!outdoor)
          s +=
            '<path class="hmroomwall" d="M' +
            (room.x + 2) +
            ' ' +
            ((room.y + room.h) * sy - 2) +
            ' V' +
            (room.y * sy + 2) +
            ' H' +
            (room.x + room.w - 2) +
            '"/>';
        s +=
          '<text class="hmroomlabel" x="' +
          (room.x + 6) +
          '" y="' +
          (room.y * sy + 10) +
          '">' +
          esc(room.label || '') +
          '</text></g>';
      }
      spaces
        .filter(function (space) {
          return space.room.kind === 'outdoor';
        })
        .forEach(drawSpace);
      s +=
        '<rect class="hmfoundation" x="' +
        o.x +
        '" y="' +
        (o.y * sy + 2) +
        '" width="' +
        o.w +
        '" height="' +
        o.h * sy +
        '" rx="9"/>';
      s +=
        '<rect class="hmoutline" x="' +
        o.x +
        '" y="' +
        o.y * sy +
        '" width="' +
        o.w +
        '" height="' +
        o.h * sy +
        '" rx="9"/>';
      spaces
        .filter(function (space) {
          return space.room.kind !== 'outdoor';
        })
        .forEach(drawSpace);
      if (transient && hmHasMoved)
        hm.subjects.forEach(function (sub) {
          if (!hmMoved[sub.id]) return;
          var prev = hmSubjPrev[sub.id];
          s +=
            '<path class="hmtrail" d="M' +
            prev.x +
            ' ' +
            prev.y * sy +
            ' L' +
            sub.x +
            ' ' +
            sub.y * sy +
            '"/>';
        });
      /* Direction remains readable while paused and under reduced motion.
         Animated step paints add traveling packets over the route. */
      if (typeof stepIdx === 'number' && stepIdx >= 0)
        hm.signals.forEach(function (sig) {
          var fromY = sig.fromXY.y * sy,
            toY = sig.toXY.y * sy;
          var dx = sig.toXY.x - sig.fromXY.x,
            dy = toY - fromY;
          var length = Math.sqrt(dx * dx + dy * dy);
          if (length < 24) return;
          var ux = dx / length,
            uy = dy / length;
          var x = sig.toXY.x - ux * 13,
            y = toY - uy * 13;
          s +=
            '<g class="hmlink"><title>' +
            esc(sig.from + ' → ' + sig.to) +
            '</title>' +
            '<path class="hmlinkglow" d="M' +
            (sig.fromXY.x + ux * 12) +
            ' ' +
            (fromY + uy * 12) +
            ' L' +
            x +
            ' ' +
            y +
            '"/>' +
            '<path class="hmlinkroute" d="M' +
            (sig.fromXY.x + ux * 12) +
            ' ' +
            (fromY + uy * 12) +
            ' L' +
            x +
            ' ' +
            y +
            '"/>' +
            '<path class="hmlinktip" d="M' +
            (x - ux * 5 - uy * 3) +
            ' ' +
            (y - uy * 5 + ux * 3) +
            ' L' +
            x +
            ' ' +
            y +
            ' L' +
            (x - ux * 5 + uy * 3) +
            ' ' +
            (y - uy * 5 - ux * 3) +
            '"/></g>';
        });
      /* Wedges below all markers, so one camera cannot obscure another. */
      hm.devices.forEach(function (d) {
        if (
          d.kind !== 'camera' ||
          ['scan', 'detect', 'rec'].indexOf(d.state) < 0
        )
          return;
        var a1 = ((d.facing - d.spread / 2) * Math.PI) / 180;
        var a2 = ((d.facing + d.spread / 2) * Math.PI) / 180;
        var mid = (d.facing * Math.PI) / 180;
        s +=
          '<g class="hmdev hm-camera hm-' +
          esc(d.state) +
          '" transform="scale(1 ' +
          sy +
          ')">';
        s +=
          '<path class="hmwedge" d="M' +
          d.x +
          ' ' +
          d.y +
          ' L' +
          (d.x + d.range * Math.cos(a1)).toFixed(1) +
          ' ' +
          (d.y + d.range * Math.sin(a1)).toFixed(1) +
          ' A' +
          d.range +
          ' ' +
          d.range +
          ' 0 0 1 ' +
          (d.x + d.range * Math.cos(a2)).toFixed(1) +
          ' ' +
          (d.y + d.range * Math.sin(a2)).toFixed(1) +
          ' Z"/>';
        if (!RM)
          s +=
            '<g class="hmsweep" style="transform-origin:' +
            d.x +
            'px ' +
            d.y +
            'px;--sw:' +
            (d.spread / 2 - 2) +
            'deg"><line x1="' +
            d.x +
            '" y1="' +
            d.y +
            '" x2="' +
            (d.x + (d.range - 3) * Math.cos(mid)).toFixed(1) +
            '" y2="' +
            (d.y + (d.range - 3) * Math.sin(mid)).toFixed(1) +
            '"/></g>';
        s += '</g>';
      });
      hm.devices.forEach(function (d) {
        if (d.display === 'door') {
          s += homemapDoorHTML(
            d,
            transient ? hmDoors[d.id] : null,
            hm.outline,
            transient ? hmClearing[d.id] : null
          );
          return;
        }
        s +=
          '<g class="hmdev hm-' +
          esc(d.kind) +
          ' hm-' +
          esc(d.state) +
          '" data-device="' +
          esc(d.id) +
          '" transform="translate(0 ' +
          (d.y * (sy - 1)).toFixed(3) +
          ')">' +
          '<title>' +
          esc(d.label) +
          ': ' +
          esc(d.state) +
          (d.thermal !== 'normal' ? ' · ' + d.thermal : '') +
          '</title>';
        s += homemapThermalHTML(d, 1, transient ? hmClearing[d.id] : null);
        s +=
          '<circle class="hmdevice-aura" cx="' +
          d.x +
          '" cy="' +
          d.y +
          '" r="13"/>';
        if (transient && hmFresh[d.id])
          s +=
            '<circle class="' +
            (d.kind === 'hub' ? 'hmglow' : 'hmripple') +
            '" cx="' +
            d.x +
            '" cy="' +
            d.y +
            '" r="6"/>';
        s +=
          '<circle class="hmmarker" cx="' +
          d.x +
          '" cy="' +
          d.y +
          '" r="8.5"/>';
        if (d.kind === 'hub')
          s +=
            '<circle class="hmhubring" cx="' +
            d.x +
            '" cy="' +
            d.y +
            '" r="10"/>';
        /* tx: steady looping broadcast waves — part of the baseline, so an
           unchanged step repaint leaves the animation running */
        if (d.kind === 'hub' && d.state === 'tx')
          s +=
            '<circle class="hmtxring" cx="' +
            d.x +
            '" cy="' +
            d.y +
            '" r="8"/>' +
            '<circle class="hmtxring hmtxring2" cx="' +
            d.x +
            '" cy="' +
            d.y +
            '" r="8"/>';
        /* rec: the classic blinking recording light beside the camera dot —
           steady markup, so the blink survives unchanged step repaints */
        if (d.kind === 'camera' && d.state === 'rec')
          s +=
            '<circle class="hmrecdot" cx="' +
            (d.x + 7) +
            '" cy="' +
            (d.y - 7) +
            '" r="2.5"/>';
        if (d.kind === 'entry') {
          s +=
            '<path class="hmentry" d="M' +
            (d.x - 3.5) +
            ' ' +
            (d.y + 5) +
            ' v-10 h7 v10"/>';
          s +=
            '<path class="hmdoorleaf' +
            (transient && hmDoors[d.id] ? ' hmdoor-' + hmDoors[d.id] : '') +
            '" style="transform-origin:' +
            (d.x - 3.5) +
            'px ' +
            (d.y + 5) +
            'px" d="M' +
            (d.x - 3.5) +
            ' ' +
            (d.y + 5) +
            ' h7"/>';
        } else {
          var deviceIcon =
            d.kind === 'camera'
              ? 'camera'
              : d.kind === 'hub'
              ? 'router'
              : d.icon;
          s +=
            '<use class="hmicon hmdeviceglyph" href="#i-' +
            esc(deviceIcon) +
            '" x="' +
            (d.x - 6) +
            '" y="' +
            (d.y - 6) +
            '" width="12" height="12"/>';
        }
        var labelY = d.y > 139 ? d.y - 25 : d.y + 20;
        var labelX = clamp(d.x, 28, 292);
        s +=
          '<text class="hmlbl" x="' +
          labelX +
          '" y="' +
          labelY +
          '" text-anchor="middle">' +
          esc(d.label) +
          '</text></g>';
      });
      hm.subjects.forEach(function (sub) {
        if (sub.hidden) return;
        var prev = hmSubjPrev[sub.id];
        s +=
          '<g transform="translate(0 ' +
          (sub.y * (sy - 1)).toFixed(3) +
          ')"><g class="hmsubject" data-subject="' +
          esc(sub.id) +
          '"' +
          (transient && hmMoved[sub.id]
            ? ' style="transform:translate(' +
              (prev.x - sub.x) +
              'px,' +
              (prev.y - sub.y) * sy +
              'px)"'
            : '') +
          '><title>' +
          esc(sub.label) +
          '</title>';
        s +=
          '<ellipse class="hmactor-shadow" cx="' +
          sub.x +
          '" cy="' +
          (sub.y + 9) +
          '" rx="7" ry="2.2"/>';
        s +=
          '<circle class="hmsubjectdot" cx="' +
          sub.x +
          '" cy="' +
          sub.y +
          '" r="7"/>';
        if (sub.icon)
          s +=
            '<use class="hmactor-icon" href="#i-' +
            esc(sub.icon) +
            '" x="' +
            (sub.x - 5) +
            '" y="' +
            (sub.y - 5) +
            '" width="10" height="10"/>';
        else
          s +=
            '<circle class="hmactor-icon" cx="' +
            sub.x +
            '" cy="' +
            (sub.y - 2.2) +
            '" r="1.8"/>' +
            '<path class="hmactor-icon" d="M' +
            (sub.x - 3.4) +
            ' ' +
            (sub.y + 4) +
            ' v-1 a3.4 3.4 0 0 1 6.8 0 v1 Z"/>';
        if (panel.showSubjectLabels === true)
          s +=
            '<text class="hmlbl hmactor-label" x="' +
            clamp(sub.x, 24, 296) +
            '" y="' +
            (sub.y > 146 ? sub.y - 12 : sub.y + 19) +
            '" text-anchor="middle">' +
            esc(sub.label) +
            '</text>';
        s += '</g></g>';
      });
      if (!hm.devices.length)
        s +=
          '<text class="hmlbl" x="160" y="' +
          (HOMEMAP_DISPLAY_HEIGHT / 2 + 4) +
          '" text-anchor="middle">No devices configured</text>';
      if (transient)
        hmSignals.forEach(function (sig, i) {
          s +=
            '<circle class="hmsig" r="3" style="--hx1:' +
            sig.fromXY.x +
            'px;--hy1:' +
            sig.fromXY.y * sy +
            'px;--hx2:' +
            sig.toXY.x +
            'px;--hy2:' +
            sig.toXY.y * sy +
            'px;animation-delay:' +
            i * 0.25 +
            's"/>';
        });
      return s + '</svg>';
    };
    h += buildHomemap(true);
    hBaseline =
      hmHasFresh || hmHasMoved || hmSignals.length ? buildHomemap(false) : null;
    return {
      html: h,
      baseline: hBaseline,
      transient: '.hmripple,.hmglow,.hmsig,.hmtrail',
      glide: { selector: '.hmsubject[style]', multiple: true },
      settle: function () {
        if (typeof host.querySelectorAll !== 'function') return;
        var leaves = host.querySelectorAll('.hmdoor-opening,.hmdoor-closing');
        for (var i = 0; i < leaves.length; i++) {
          leaves[i].classList.remove('hmdoor-opening');
          leaves[i].classList.remove('hmdoor-closing');
        }
      },
    };
  },
  { ambientInitial: true }
);

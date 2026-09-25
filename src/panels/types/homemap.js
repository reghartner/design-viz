/* homemap validation and pure state helpers. */
var HOMEMAP_STATES = {
  camera: ['scan', 'sleep', 'detect', 'rec', 'off'],
  entry: ['closed', 'open', 'alert'],
  sensor: ['ok', 'warn', 'alert', 'off'],
  hub: ['idle', 'rx', 'tx', 'alert'],
};
var HOMEMAP_THERMAL = ['normal', 'warm', 'hot', 'cold', 'freezing'];
var HOMEMAP_SPOTLIGHT = ['off', 'on', 'flash'];
function homemapIconValid(value) { return value === null || ICON_SET.indexOf(value) >= 0; }
function homemapAudioValid(value) {
  var warnings = [];
  return FlowAudio.clean(value, 'audio', warnings) !== undefined && !warnings.length;
}
function homemapSubjectPatchValid(value) {
  if (value === null) return true;
  if (!panelObject(value)) return false;
  var position = Object.prototype.hasOwnProperty.call(value, 'x') || Object.prototype.hasOwnProperty.call(value, 'y');
  return (!position || homemapSubjectPosition(value)) &&
    (position || Object.prototype.hasOwnProperty.call(value, 'audio') || Object.prototype.hasOwnProperty.call(value, 'icon')) &&
    (!Object.prototype.hasOwnProperty.call(value, 'icon') || homemapIconValid(value.icon)) &&
    (!Object.prototype.hasOwnProperty.call(value, 'audio') || homemapAudioValid(value.audio));
}
function homemapDevicePatchValid(kind, value) {
  if (typeof value === 'string') return HOMEMAP_STATES[kind].indexOf(value) >= 0;
  return (
    panelObject(value) &&
    Object.keys(value).every(function (k) {
      return k === 'state'
        ? HOMEMAP_STATES[kind].indexOf(value[k]) >= 0
        : k === 'thermal' ? HOMEMAP_THERMAL.indexOf(value[k]) >= 0
        : k === 'spotlight' ? HOMEMAP_SPOTLIGHT.indexOf(value[k]) >= 0
        : k === 'icon' ? homemapIconValid(value[k])
        : k === 'audio' && homemapAudioValid(value[k]);
    })
  );
}
function homemapDeviceValid(d) {
  return (
    d &&
    typeof d.id === 'string' &&
    d.id !== '' &&
    d.id !== 'signals' &&
    typeof d.kind === 'string' &&
    Object.prototype.hasOwnProperty.call(HOMEMAP_STATES, d.kind) &&
    isFiniteNum(d.x) &&
    isFiniteNum(d.y)
  );
}
function homemapSubjectPosition(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && isFiniteNum(v.x) && isFiniteNum(v.y);
}
/* Shared declaration filtering keeps model, fold and warnings in agreement. */
function homemapSubjects(panel, path, warnings) {
  var devices = Object.create(null),
    seen = Object.create(null),
    subjects = [];
  function warn(message) {
    if (warnings) warnings.push(path + message);
  }
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function (d) {
    if (d && typeof d.id === 'string') devices[d.id] = true;
  });
  if (panel.subjects !== undefined && !Array.isArray(panel.subjects))
    warn('.subjects: expected an array — ignored');
  (Array.isArray(panel.subjects) ? panel.subjects : []).forEach(function (sub, i) {
    var sp = '.subjects[' + i + ']',
      valid = true;
    if (!sub || typeof sub.id !== 'string' || !sub.id) {
      warn(sp + '.id: needs a nonempty string — subject ignored');
      return;
    }
    if (seen[sub.id]) {
      warn(sp + '.id: duplicate subject id "' + sub.id + '" — duplicate ignored');
      valid = false;
    }
    seen[sub.id] = true;
    if (devices[sub.id]) {
      warn(sp + '.id: collides with a device id — subject ignored');
      valid = false;
    }
    if (sub.id === 'signals') {
      warn(sp + '.id: "signals" is reserved — subject ignored');
      valid = false;
    }
    ['x', 'y'].forEach(function (k) {
      if (!isFiniteNum(sub[k])) {
        warn(sp + '.' + k + ': must be finite — subject ignored');
        valid = false;
      }
    });
    if (sub.icon !== undefined && ICON_SET.indexOf(sub.icon) < 0)
      warn(sp + '.icon: unknown icon "' + sub.icon + '" — using "gear"');
    if (valid) subjects.push(sub);
  });
  return subjects;
}
function homemapPatchWarnings(obj, path, declaration, warnings) {
  var devices = declaration.devices,
    subjects = declaration.subjects;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  Object.keys(obj).forEach(function (k) {
    if (k === 'signals') {
      if (!Array.isArray(obj.signals)) {
        warnings.push(path + '.signals: expected an array of {from, to} — ignored');
        return;
      }
      obj.signals.forEach(function (sig, i) {
        if (
          !sig ||
          typeof sig !== 'object' ||
          Array.isArray(sig) ||
          typeof sig.from !== 'string' ||
          typeof sig.to !== 'string' ||
          !devices[sig.from] ||
          !devices[sig.to]
        )
          warnings.push(
            path +
              '.signals[' +
              i +
              ']: needs from/to referencing declared device ids — entry ignored'
          );
      });
    } else if (subjects[k]) {
      var subPatch = obj[k];
      if (subPatch !== null && (!panelObject(subPatch) ||
          ((!homemapSubjectPosition(subPatch)) &&
           (subPatch.x !== undefined || subPatch.y !== undefined || (!Object.prototype.hasOwnProperty.call(subPatch, 'audio') && !Object.prototype.hasOwnProperty.call(subPatch, 'icon'))))))
        warnings.push(
          path + '.' + k + ': expected an object with finite x/y or null; audio-only and icon-only objects also supported — invalid subject position ignored'
        );
      if (panelObject(subPatch) && Object.prototype.hasOwnProperty.call(subPatch, 'audio'))
        FlowAudio.clean(subPatch.audio, path + '.' + k + '.audio', warnings);
      if (panelObject(subPatch) && Object.prototype.hasOwnProperty.call(subPatch, 'icon') && !homemapIconValid(subPatch.icon))
        warnings.push(path + '.' + k + '.icon: expected a known icon or null — ignored');
    } else if (!devices[k]) {
      warnings.push(path + '.' + k + ': undeclared device or subject id — patch ignored');
    } else {
      var vocab = HOMEMAP_STATES[devices[k].kind];
      if (panelObject(obj[k])) {
        Object.keys(obj[k]).forEach(function (field) {
          if (field === 'audio') {
            FlowAudio.clean(obj[k].audio, path + '.' + k + '.audio', warnings);
            return;
          }
          if (field === 'icon') {
            if (!homemapIconValid(obj[k].icon)) warnings.push(path + '.' + k + '.icon: expected a known icon or null — ignored');
            return;
          }
          var allowed = field === 'state' ? vocab : field === 'thermal' ? HOMEMAP_THERMAL : field === 'spotlight' ? HOMEMAP_SPOTLIGHT : null;
          if (!allowed || allowed.indexOf(obj[k][field]) < 0)
            warnings.push(
              path +
                '.' +
                k +
                '.' +
                field +
                ': invalid device attribute — ignored' +
                (allowed ? ' (valid: ' + allowed.join(' ') + ')' : ' (use state, thermal, spotlight, or audio)')
            );
        });
      } else if (vocab.indexOf(obj[k]) < 0)
        warnings.push(
          path +
            '.' +
            k +
            ': unknown ' +
            devices[k].kind +
            ' state "' +
            obj[k] +
            '" — using "' +
            vocab[0] +
            '" (valid: ' +
            vocab.join(' ') +
            ')'
        );
    }
  });
}
function homemapRooms(panel, path, warnings) {
  var rooms = panel.rooms;
  if (rooms == null) return [];
  if (!Array.isArray(rooms)) {
    if (warnings)
      warnings.push(path + '.rooms: expected an array of {label, x, y, w, h} — ignored');
    return [];
  }
  return rooms.filter(function (r, i) {
    var valid =
      r &&
      ['x', 'y', 'w', 'h'].every(function (k) {
        return isFiniteNum(r[k]);
      }) &&
      r.x >= 0 &&
      r.y >= 0 &&
      r.w > 0 &&
      r.h > 0 &&
      r.x + r.w <= 320 &&
      r.y + r.h <= 180;
    if (!valid && warnings)
      warnings.push(
        path + '.rooms[' + i + ']: use a positive rectangle inside the 320×180 map — ignored'
      );
    if (valid && r.kind !== undefined && ['room', 'outdoor'].indexOf(r.kind) < 0 && warnings)
      warnings.push(path + '.rooms[' + i + '].kind: use room or outdoor — using room');
    return valid;
  });
}

function homemapDeclarationWarnings(panel, path, warnings) {
  homemapRooms(panel, path, warnings);
  ['x', 'y'].forEach(function (k) {
    if (panel.outline && panel.outline[k] !== undefined && !isFiniteNum(panel.outline[k]))
      warnings.push(path + '.outline.' + k + ': must be finite — centering this axis');
  });
  if (panel.showSubjectLabels !== undefined && typeof panel.showSubjectLabels !== 'boolean')
    warnings.push(path + '.showSubjectLabels: expected a boolean — subject labels stay hidden');
  var devices = Object.create(null),
    seen = Object.create(null);
  if (!(Array.isArray(panel.devices) && panel.devices.length))
    warnings.push(path + '.devices: homemap needs a devices array — rendering a placeholder');
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function (d, i) {
    var dp = path + '.devices[' + i + ']';
    if (!d || typeof d.id !== 'string' || !d.id) {
      warnings.push(dp + '.id: needs a nonempty string — device ignored');
      return;
    }
    if (d.id === 'signals') warnings.push(dp + '.id: "signals" is reserved — device ignored');
    if (seen[d.id])
      warnings.push(dp + '.id: duplicate device id "' + d.id + '" — duplicate ignored');
    var duplicate = !!seen[d.id];
    seen[d.id] = true;
    if (typeof d.kind !== 'string' || !Object.prototype.hasOwnProperty.call(HOMEMAP_STATES, d.kind))
      warnings.push(
        dp +
          '.kind: unknown kind "' +
          d.kind +
          '" — device ignored (valid: camera entry sensor hub)'
      );
    ['x', 'y'].forEach(function (k) {
      if (!isFiniteNum(d[k])) warnings.push(dp + '.' + k + ': must be finite — device ignored');
    });
    if (d.kind === 'camera')
      ['facing', 'spread', 'range'].forEach(function (k) {
        if (d[k] !== undefined && !isFiniteNum(d[k]))
          warnings.push(dp + '.' + k + ': must be finite — default used');
      });
    if (
      d.display !== undefined &&
      (['marker', 'door'].indexOf(d.display) < 0 || (d.display === 'door' && d.kind !== 'entry'))
    )
      warnings.push(dp + '.display: use marker, or door for an entry device — using marker');
    if (d.kind === 'entry' && d.display === 'door') {
      ['facing', 'doorWidth'].forEach(function (k) {
        if (d[k] !== undefined && !isFiniteNum(d[k]))
          warnings.push(dp + '.' + k + ': must be finite — default used');
      });
      if (
        d.doorSwing !== undefined &&
        (!isFiniteNum(d.doorSwing) || Math.abs(d.doorSwing) < 15 || Math.abs(d.doorSwing) > 135)
      )
        warnings.push(dp + '.doorSwing: use an angle from -135 to -15 or 15 to 135 — using 90');
    }
    if (['sensor', 'camera', 'hub'].indexOf(d.kind) >= 0 && d.icon !== undefined && ICON_SET.indexOf(d.icon) < 0)
      warnings.push(dp + '.icon: unknown icon "' + d.icon + '" — using "gear"');
    if (!duplicate && homemapDeviceValid(d)) devices[d.id] = d;
  });
  var subjects = Object.create(null);
  homemapSubjects(panel, path, warnings).forEach(function (sub) {
    subjects[sub.id] = sub;
  });
  var declaration = { devices: devices, subjects: subjects };
  homemapPatchWarnings(panel.initial, path + '.initial', declaration, warnings);
  return declaration;
}

/* radar per-step patch checks shared by initial and step patches */
/* Carry device states and subject positions; signals belong only to their authored step. */
function foldHomemapStates(panel, steps) {
  var carried = Object.create(null),
    states = [],
    subjects = Object.create(null),
    devices = Object.create(null);
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function (d) {
    if (homemapDeviceValid(d) && !devices[d.id]) devices[d.id] = d;
  });
  homemapSubjects(panel).forEach(function (sub) {
    subjects[sub.id] = sub;
  });
  function apply(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
    Object.keys(patch).forEach(function (k) {
      if (k === 'signals') return;
      if (subjects[k]) {
        var subPatch = patch[k];
        if (subPatch === null) {
          carried[k] = null;
          return;
        }
        if (!panelObject(subPatch)) return;
        var position = homemapSubjectPosition(subPatch);
        var audio = Object.prototype.hasOwnProperty.call(subPatch, 'audio') ? FlowAudio.clean(subPatch.audio) : undefined;
        var hasIcon = Object.prototype.hasOwnProperty.call(subPatch, 'icon') && homemapIconValid(subPatch.icon);
        if (!position && audio === undefined && !hasIcon) return;
        var subjectNext = Object.assign({}, panelObject(carried[k]) ? carried[k] : {});
        if (position) {
          subjectNext.x = subPatch.x;
          subjectNext.y = subPatch.y;
          delete subjectNext._homemapHidden;
        } else if (carried[k] === null) subjectNext._homemapHidden = true;
        if (audio !== undefined) subjectNext.audio = audio;
        if (hasIcon) subjectNext.icon = subPatch.icon;
        carried[k] = subjectNext;
        return;
      }
      if (devices[k] && (panelObject(patch[k]) || panelObject(carried[k]))) {
        var before = panelObject(carried[k])
          ? carried[k]
          : typeof carried[k] === 'string'
          ? { state: carried[k] }
          : {};
        var update = panelObject(patch[k]) ? patch[k] : { state: patch[k] };
        var next = Object.assign({}, before);
        ['state', 'thermal', 'spotlight'].forEach(function (field) {
          var allowed = field === 'state' ? HOMEMAP_STATES[devices[k].kind] : field === 'thermal' ? HOMEMAP_THERMAL : HOMEMAP_SPOTLIGHT;
          if (allowed.indexOf(update[field]) >= 0) next[field] = update[field];
        });
        if (Object.prototype.hasOwnProperty.call(update, 'audio')) {
          var audio = FlowAudio.clean(update.audio);
          if (audio !== undefined) next.audio = audio;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'icon') && homemapIconValid(update.icon)) next.icon = update.icon;
        /* Legacy scalar values still select the operating state; an invalid
           scalar gets the documented default in homemapModel. */
        if (!panelObject(patch[k])) next.state = patch[k];
        carried[k] = next;
      } else carried[k] = patch[k];
    });
  }
  function snapshot(signals) {
    var snap = Object.create(null);
    Object.keys(carried).forEach(function (k) {
      snap[k] = carried[k];
    });
    snap.signals = Array.isArray(signals) ? signals.slice() : [];
    return snap;
  }
  apply(panel.initial);
  steps.forEach(function (st) {
    var patch = (stepPanelPatch(st) || {})[panel.id];
    apply(patch);
    states.push(snapshot(patch && patch.signals));
  });
  if (!steps.length) states.push(snapshot(null));
  return states;
}

PanelRegistry.extend('homemap', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    return homemapDeclarationWarnings(p, PP, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    homemapPatchWarnings(patch, path, context, warnings);
  },
  fold: foldHomemapStates,
});

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
    var devicePatch = Object.prototype.hasOwnProperty.call(state, d.id) ? state[d.id] : undefined;
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
        panelObject(devicePatch) && HOMEMAP_THERMAL.indexOf(devicePatch.thermal) >= 0
          ? devicePatch.thermal
          : 'normal',
      spotlight: panelObject(devicePatch) && HOMEMAP_SPOTLIGHT.indexOf(devicePatch.spotlight) >= 0 ? devicePatch.spotlight : 'off',
      audio: panelObject(devicePatch) ? FlowAudio.clean(devicePatch.audio) : undefined,
      icon: panelObject(devicePatch) && ICON_SET.indexOf(devicePatch.icon) >= 0 ? devicePatch.icon :
        ICON_SET.indexOf(d.icon) >= 0 ? d.icon : d.icon === undefined && d.kind === 'camera' ? 'camera' : d.icon === undefined && d.kind === 'hub' ? 'router' : 'gear',
      facing: ((facing % 360) + 360) % 360,
      spread: fin(d.spread) != null ? clamp(d.spread, 10, 180) : 80,
      range: fin(d.range) != null ? clamp(d.range, 20, 160) : 70,
    };
    if (floorDoor) {
      item.display = 'door';
      item.doorWidth = fin(d.doorWidth) != null ? clamp(d.doorWidth, 8, 48) : 24;
      item.doorSwing =
        fin(d.doorSwing) != null && Math.abs(d.doorSwing) >= 15 && Math.abs(d.doorSwing) <= 135
          ? d.doorSwing
          : 90;
    }
    byId[d.id] = item;
    devices.push(item);
  });
  var subjects = homemapSubjects(panel).map(function (sub) {
    var value = Object.prototype.hasOwnProperty.call(state, sub.id) ? state[sub.id] : undefined;
    var position = homemapSubjectPosition(value) ? value : sub;
    return {
      id: sub.id,
      label: String(sub.label != null ? sub.label : sub.id),
      icon: panelObject(value) && ICON_SET.indexOf(value.icon) >= 0 ? value.icon :
        sub.icon === undefined ? null : ICON_SET.indexOf(sub.icon) >= 0 ? sub.icon : 'gear',
      x: clamp(position.x, 0, 320),
      y: clamp(position.y, 0, 180),
      hidden: value === null || !!(value && value._homemapHidden),
      audio: panelObject(value) ? FlowAudio.clean(value.audio) : undefined,
    };
  });
  var signals = [];
  (Array.isArray(state.signals) ? state.signals : []).forEach(function (sig) {
    if (!sig || Array.isArray(sig) || typeof sig.from !== 'string' || typeof sig.to !== 'string')
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
        (item.x < room.x + room.w || (item.x === 320 && room.x + room.w === 320)) &&
        (item.y < room.y + room.h || (item.y === 180 && room.y + room.h === 180))
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

/* Effects stay attached to their source; captions below the map carry the full
   authored text without covering the floor plan or changing drag targets. */
function homemapAudioHTML(item, scaleY) {
  var effect = FlowAudio.effect(item.audio);
  if (!effect) return '';
  return '<g class="hmaudio-source" data-home-audio="' + esc(item.id) +
    '" transform="translate(' + item.x + ' ' + item.y * scaleY + ')">' +
    '<title>' + esc(item.label + ' audio') + '</title>' +
    (item.x > 270 ? '<g transform="scale(-1 1)">' + effect + '</g>' : effect) + '</g>';
}
function homemapSpotlightHTML(d, scaleY) {
  if (d.spotlight === 'off') return '';
  var angle = d.spread * Math.PI / 360,
    length = Math.min(d.range, 95),
    edgeX = (length * Math.cos(angle)).toFixed(2),
    edgeY = (length * Math.sin(angle)).toFixed(2);
  return '<g class="hmspotlight hmspotlight-' + d.spotlight + '" data-home-spotlight="' + esc(d.id) +
    '" transform="translate(' + d.x + ' ' + d.y * scaleY + ') scale(1 ' + scaleY + ') rotate(' + d.facing + ')">' +
    '<title>' + esc(d.label + ': spotlight ' + d.spotlight) + '</title>' +
    '<path class="hmspotlight-beam" d="M0 0 L' + edgeX + ' ' + (-edgeY) + ' A' + length + ' ' + length + ' 0 0 1 ' + edgeX + ' ' + edgeY + ' Z"/>' +
    '<path class="hmspotlight-core" d="M0 0 L' + (length * .85).toFixed(2) + ' ' + (-edgeY * .32).toFixed(2) + ' L' + (length * .85).toFixed(2) + ' ' + (edgeY * .32).toFixed(2) + ' Z"/>' +
    '<circle class="hmspotlight-lamp" r="11"/></g>';
}
function homemapAudioCaptions(model) {
  var rows = model.devices.concat(model.subjects.filter(function (s) { return !s.hidden; }))
    .map(function (item) { return FlowAudio.render(item.audio, { label: item.label }); }).filter(Boolean);
  return rows.length ? '<div class="hmaudio-captions" aria-label="Home audio activity">' + rows.join('') + '</div>' : '';
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
    esc(d.label + ': ' + (clearing ? 'temperature returning to normal' : thermal)) +
    '</title>' +
    '<circle class="thermal-halo" r="20"/><circle class="thermal-rim" r="12"/>';
  if (cold) {
    for (var i = 0; i < 6; i++)
      s +=
        '<path class="thermal-frost" transform="rotate(' +
        i * 60 +
        ')" d="M0 -11 V-19 M-3 -16 L0 -13 L3 -16"/>';
    s +=
      '<g class="thermal-badge" transform="translate(17 -17)"><circle r="7"/><g transform="translate(-5 -5) scale(.416667)">' + FlowIcons.glyph('snowflake') + '</g></g>';
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
      '<g class="thermal-badge" transform="translate(17 -17)"><circle r="7"/><g transform="translate(-5 -5) scale(.416667)">' + FlowIcons.glyph(thermal === 'hot' ? 'hot' : 'temperature',{tone:thermal === 'hot' ? 'alert' : 'warn'}) + '</g></g>';
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
    homemapAudioHTML(d, HOMEMAP_Y_SCALE) +
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
    labelY = d.y > 139 ? d.y * HOMEMAP_Y_SCALE - 14 : d.y * HOMEMAP_Y_SCALE + 16;
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
    var hmSignals = animate && typeof stepIdx === 'number' && stepIdx >= 0 ? hm.signals : [];
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
        if (d.kind !== 'camera' || ['scan', 'detect', 'rec'].indexOf(d.state) < 0) return;
        var a1 = ((d.facing - d.spread / 2) * Math.PI) / 180;
        var a2 = ((d.facing + d.spread / 2) * Math.PI) / 180;
        var mid = (d.facing * Math.PI) / 180;
        s += '<g class="hmdev hm-camera hm-' + esc(d.state) + '" transform="scale(1 ' + sy + ')">';
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
      hm.devices.forEach(function (d) { s += homemapSpotlightHTML(d, sy); });
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
        s += homemapAudioHTML(d, 1);
        s += '<circle class="hmdevice-aura" cx="' + d.x + '" cy="' + d.y + '" r="13"/>';
        if (transient && hmFresh[d.id])
          s +=
            '<circle class="' +
            (d.kind === 'hub' ? 'hmglow' : 'hmripple') +
            '" cx="' +
            d.x +
            '" cy="' +
            d.y +
            '" r="6"/>';
        s += '<circle class="hmmarker" cx="' + d.x + '" cy="' + d.y + '" r="8.5"/>';
        if (d.kind === 'hub')
          s += '<circle class="hmhubring" cx="' + d.x + '" cy="' + d.y + '" r="10"/>';
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
          s += '<circle class="hmrecdot" cx="' + (d.x + 7) + '" cy="' + (d.y - 7) + '" r="2.5"/>';
        if (d.kind === 'entry') {
          s += '<path class="hmentry" d="M' + (d.x - 3.5) + ' ' + (d.y + 5) + ' v-10 h7 v10"/>';
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
          s +=
            '<g class="hmicon hmdeviceglyph" transform="translate(' +
            (d.x - 6) +
            ' ' +
            (d.y - 6) +
            ') scale(.5)">' + FlowIcons.glyph(d.icon) + '</g>';
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
        s += homemapAudioHTML(sub, 1);
        s +=
          '<ellipse class="hmactor-shadow" cx="' +
          sub.x +
          '" cy="' +
          (sub.y + 9) +
          '" rx="7" ry="2.2"/>';
        s += '<circle class="hmsubjectdot" cx="' + sub.x + '" cy="' + sub.y + '" r="7"/>';
        if (sub.icon)
          s +=
            '<g class="hmactor-icon" transform="translate(' +
            (sub.x - 5) +
            ' ' +
            (sub.y - 5) +
            ') scale(.416667)">' + FlowIcons.glyph(sub.icon) + '</g>';
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
      return s + '</svg>' + homemapAudioCaptions(hm);
    };
    h += buildHomemap(true);
    hBaseline = hmHasFresh || hmHasMoved || hmSignals.length ? buildHomemap(false) : null;
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

PanelRegistry.extend('homemap', {
  order: 16,
  label: 'Home map',
  since: '0.1.0',
  layout: {
    focusByDefault: true,
    fallbackHeight: 12,
    focusLabel: 'Home',
    attachControls: true,
    large: true,
    supporting: false,
  },
});

PanelRegistry.extend('homemap', {
  styles: [
    {
      order: 63,
      css: String.raw`.docview .section-layout-tile>.pt-homemap{display:flex;flex-direction:column;}
.section-layout-tile>.pt-homemap>.ptitle{flex:none;}
.section-layout-tile>.pt-homemap>.pbody{flex:1;min-height:0;}
.section-layout-tile>.pt-homemap>.pbody:has(>.hmaudio-captions){display:flex;flex-direction:column;}
.section-layout-tile>.pt-homemap>.pbody:has(>.hmaudio-captions)>.hmframe{flex:1;min-height:80px;}
.hmaudio-captions{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:5px;padding:7px 2px 0;flex:none;}
.hmaudio-source{pointer-events:none;}
.hmspotlight{pointer-events:none;color:#E6AE32;}
.hmspotlight-beam{fill:currentColor;fill-opacity:.2;stroke:currentColor;stroke-opacity:.5;stroke-width:.7;}
.hmspotlight-core{fill:currentColor;fill-opacity:.12;}
.hmspotlight-lamp{fill:currentColor;fill-opacity:.12;stroke:currentColor;stroke-width:1;stroke-dasharray:2 3;}
.hmspotlight-flash{animation:hmspotlightpulse 2.8s ease-in-out infinite;}
@keyframes hmspotlightpulse{0%,100%{opacity:.35;}45%,65%{opacity:1;}}
@media(prefers-reduced-motion:reduce){.hmspotlight-flash{animation:none;opacity:1;}}
@media print{.hmspotlight-flash{animation:none;opacity:1;}.hmspotlight-beam{fill-opacity:.2;stroke-opacity:.8;}}`,
    },
    { order: 73, css: String.raw`.section-layout-tile .hmframe{height:100%;max-height:100%;}` },
    {
      order: 76,
      css: String.raw`@container diagram-section (max-width:640px){
  .section-layout-tile:has(>.pt-homemap){height:auto;}
}
@container diagram-section (max-width:640px){
  .section-layout-tile .hmframe{height:auto;}
}`,
    },
    {
      order: 854,
      css: String.raw`.hmframe{display:block; width:100%; height:auto; border-radius:8px; overflow:hidden;
  --hm-bg:#0A0F14; --hm-line:#3B4A63; --hm-neutral:#94A3B8; --hm-accent:#38E1FF;
  --hm-ok:#43D98B; --hm-warn:#FFB454; --hm-alert:#FF6B5E; --hm-label:#93A7C9;
  background:var(--hm-bg);}
.sk-daylight .hmframe{--hm-bg:#F4F2EC; --hm-line:#C9CDE9; --hm-neutral:#6B6F7A;
  --hm-accent:#4956C9; --hm-ok:#278A52; --hm-warn:#B7791F; --hm-alert:#C93D35; --hm-label:#4F5964;}
body.sk-editorial .hmframe{--hm-bg:var(--ed-sheet); --hm-line:var(--ed-rule-strong); --hm-neutral:var(--ed-muted);
  --hm-accent:var(--ed-accent); --hm-ok:var(--ed-good); --hm-warn:var(--ed-warn); --hm-alert:var(--ed-bad); --hm-label:var(--ed-text);}
body.sk-terminal .hmframe{--hm-bg:var(--tm-ground); --hm-line:var(--tm-line); --hm-neutral:var(--tm-muted);
  --hm-accent:var(--tm-good); --hm-ok:var(--tm-good); --hm-warn:#FFD166; --hm-alert:var(--tm-alert); --hm-label:var(--tm-text);}
body.sk-pastel .hmframe{--hm-bg:#F5F7FB; --hm-line:#9BA6B5; --hm-neutral:#7D899C;
  --hm-accent:#6E7DD2; --hm-ok:#347A55; --hm-warn:#946B20; --hm-alert:#B54646; --hm-label:#526077;}
body.sk-blueprint .hmframe{--hm-bg:#031B3A; --hm-line:#94BCD5; --hm-neutral:#94BCD5;
  --hm-accent:#58E7FF; --hm-ok:#7BF5B4; --hm-warn:#FFD58A; --hm-alert:#FFB4B4; --hm-label:#D5E9F7;}
.hmframe{--hm-surface:color-mix(in srgb,var(--hm-bg) 94%,white);
  background:radial-gradient(ellipse at 30% 10%,color-mix(in srgb,var(--hm-accent) 8%,transparent),transparent 65%),var(--hm-bg);}
body.sk-pastel .hmframe,.sk-daylight .hmframe{--hm-surface:#FFFFFF;}
.hmfoundation{fill:var(--hm-line);opacity:.16;}
.hmoutline{fill:var(--hm-surface);stroke:color-mix(in srgb,var(--hm-line) 55%,var(--hm-surface));stroke-width:1.3;}
.hmdevice-aura{fill:currentColor;opacity:.08;transform-box:fill-box;transform-origin:center;}
.hm-scan .hmdevice-aura,.hm-rx .hmdevice-aura{animation:hmbreathe 3.5s ease-in-out infinite;}
.hm-detect .hmdevice-aura,.hm-alert .hmdevice-aura,.hm-warn .hmdevice-aura{animation:hmbreathe 2.2s ease-in-out infinite;}
@keyframes hmbreathe{0%,100%{opacity:.07;transform:scale(.92);}50%{opacity:.2;transform:scale(1.2);}}
.hmdev{color:var(--hm-neutral);}
.hmdev.hm-ok{color:var(--hm-ok);}
.hmdev.hm-scan,.hmdev.hm-open,.hmdev.hm-rx,.hmdev.hm-tx,.hmdev.hm-rec{color:var(--hm-accent);}
.hmdev.hm-warn{color:var(--hm-warn);}
.hmdev.hm-detect,.hmdev.hm-alert{color:var(--hm-alert);}
.hmdev.hm-sleep .hmmarker{opacity:.45;}
.hmdev.hm-off .hmmarker,.hmdev.hm-off .hmicon{opacity:.2;}
.hmmarker{fill:var(--hm-surface);stroke:currentColor;stroke-width:1.2;filter:drop-shadow(0 1px 1px color-mix(in srgb,var(--hm-line) 25%,transparent));}
.hm-off .hmdevice-aura,.hm-sleep .hmdevice-aura{display:none;}
.hm-sleep .hmdeviceglyph{opacity:.45;}
.hmsubject{color:var(--hm-accent); transition:transform .7s cubic-bezier(.4,0,.2,1);}
.hmsubjectdot{fill:currentColor;stroke:var(--hm-surface);stroke-width:1.2;}
.hmactor-icon{fill:var(--hm-surface);color:var(--hm-surface);stroke:none;pointer-events:none;}
.hmactor-shadow{fill:var(--hm-label);opacity:.12;}
.hmtrail{fill:none;stroke:var(--hm-accent);stroke-width:1.4;stroke-dasharray:2 3;stroke-linecap:round;pointer-events:none;animation:hmtrailfade 1.2s ease-out both;}
@keyframes hmtrailfade{0%,20%{opacity:.6;}100%{opacity:0;}}
.hmhubring,.hmentry{fill:none; stroke:currentColor; stroke-width:1.1;}`,
    },
    {
      order: 886,
      css: String.raw`.hmtxring{fill:none; stroke:currentColor; stroke-width:1.4; animation:hmtxwave 1.4s ease-out infinite;}
.hmtxring.hmtxring2{animation-delay:.7s;}
@keyframes hmtxwave{from{r:8; opacity:.9;} to{r:24; opacity:0;}}`,
    },
    {
      order: 890,
      css: String.raw`.hmrecdot{fill:var(--hm-alert); animation:hmrecblink 1.1s steps(1) infinite;}
@keyframes hmrecblink{0%{opacity:1;} 55%{opacity:.15;} 100%{opacity:1;}}
.hmentry{stroke-linejoin:round;}
.hmdoorleaf{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;transform-box:view-box;}
.hm-open .hmdoorleaf{transform:rotate(-65deg);}
.hmdoor-opening{animation:hmdooropen .6s cubic-bezier(.2,.7,.2,1) both;}
.hmdoor-closing{animation:hmdoorclose .6s cubic-bezier(.2,.7,.2,1) both;}
@keyframes hmdooropen{from{transform:rotate(0);}to{transform:rotate(-65deg);}}
@keyframes hmdoorclose{from{transform:rotate(-65deg);}to{transform:rotate(0);}}
.hmicon{fill:none; stroke:currentColor; stroke-width:1.5;}
.hmlbl{font:600 6.8px 'IBM Plex Sans',system-ui,sans-serif;fill:var(--hm-label);
  paint-order:stroke;stroke:var(--hm-surface);stroke-width:2;stroke-linejoin:round;}
.hmwedge{fill:currentColor;fill-opacity:.1;stroke:currentColor;stroke-opacity:.22;stroke-width:.7;}
.hmsweep{transform-box:view-box; animation:sensorSweep 3.2s ease-in-out infinite alternate;}
.hmsweep line{stroke:currentColor; stroke-width:1.2; opacity:.55; stroke-linecap:round;}
.hmripple,.hmglow{fill:none; stroke:currentColor; stroke-width:2; animation:sensorRipple 1s ease-out both;}
.hmglow{stroke-width:5;}
.hmsig{fill:var(--hm-surface);stroke:var(--hm-accent);stroke-width:1.2;filter:drop-shadow(0 0 2px var(--hm-accent)); visibility:hidden; transform-box:view-box;
  animation:hmsignal 1.6s linear infinite;}`,
    },
    {
      order: 908,
      css: String.raw`@keyframes hmsignal{
  0%{visibility:visible; opacity:1; transform:translate(var(--hx1),var(--hy1));}
  44%{visibility:visible; opacity:1;}
  45%{visibility:hidden; opacity:0; transform:translate(var(--hx2),var(--hy2));}
  100%{visibility:hidden; opacity:0; transform:translate(var(--hx2),var(--hy2));}
}`,
    },
    {
      order: 1218,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .hmsweep,.hmripple,.hmglow,.hmsig,.hmtxring{animation:none !important; display:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .hmrecdot{animation:none !important;}
}`,
    },
    {
      order: 2338,
      css: String.raw`@media screen{
  .panel-first>.primary-panel:has(>.pt-homemap){width:100%;max-width:var(--home-max-width);justify-self:center;}
}
@media screen{
  body .docview .boardgrid.panel-first:has(>.primary-panel>.pt-homemap)>.panelcol:not([hidden]){
    display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));align-items:start;margin-top:0;
  }
}
@media screen and (min-width:981px){
  @container diagram-section (min-width:1001px){
    body .docview .boardgrid.haspanels.panel-first:has(>.primary-panel>.pt-homemap):has(>.panelcol:not([hidden])){
      grid-template-columns:minmax(0,var(--home-max-width)) minmax(280px,1fr);
    }
  }
}`,
    },
    {
      order: 2344,
      css: String.raw`.primary-panel .hmframe{max-height:var(--home-max-height,70vh);}`,
    },
    {
      order: 2351,
      css: String.raw`.hmspace{--hm-room-color:var(--hm-line);}
.hm-room-occupied{--hm-room-color:var(--hm-accent);}
.hm-room-alert{--hm-room-color:var(--hm-alert);}
.hm-room-warn{--hm-room-color:var(--hm-warn);}
.hmroom{fill:color-mix(in srgb,var(--hm-room-color) 7%,var(--hm-surface));stroke:color-mix(in srgb,var(--hm-line) 45%,var(--hm-surface));stroke-width:.9;}
.hmroomwall{fill:none;stroke:var(--hm-surface);stroke-width:1.2;opacity:.7;}
.hmroomlabel{font:600 5.4px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.45px;fill:var(--hm-label);opacity:.85;}
.hm-room-occupied .hmroom,.hm-room-alert .hmroom,.hm-room-warn .hmroom{fill:color-mix(in srgb,var(--hm-room-color) 13%,var(--hm-surface));}
.hm-outdoor .hmroom{fill:color-mix(in srgb,var(--hm-ok) 12%,var(--hm-bg));stroke:color-mix(in srgb,var(--hm-ok) 35%,var(--hm-bg));stroke-dasharray:3 2;}
.hm-outdoor.hm-room-occupied .hmroom,.hm-outdoor.hm-room-alert .hmroom,.hm-outdoor.hm-room-warn .hmroom{fill:color-mix(in srgb,var(--hm-room-color) 17%,color-mix(in srgb,var(--hm-ok) 10%,var(--hm-bg)));}
.hm-outdoor .hmroomlabel{fill:var(--hm-ok);font-weight:700;letter-spacing:.7px;}
.hm-door-threshold{fill:none;stroke:var(--hm-surface);stroke-width:7;}
.hm-door-hit{fill:none;stroke:transparent;stroke-width:12;pointer-events:stroke;}
.hm-door-arc{fill:none;stroke:currentColor;stroke-width:.7;stroke-dasharray:2 2;opacity:.5;pointer-events:none;}
.hm-door-jamb{fill:none;stroke:var(--hm-line);stroke-width:2.4;}
.hm-door-hinge,.hm-door-handle{fill:currentColor;}
.hm-floor-leaf{transform-box:view-box;transform-origin:0 0;}
.hm-floor-leaf>path{fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;}
.hm-open .hm-floor-leaf{transform:rotate(var(--hm-door-angle));}
.hm-floor-opening{animation:hmflooropen .65s cubic-bezier(.2,.7,.2,1) both;}
.hm-floor-closing{animation:hmfloorclose .65s cubic-bezier(.2,.7,.2,1) both;}
@keyframes hmflooropen{from{transform:rotate(0);}to{transform:rotate(var(--hm-door-angle));}}
@keyframes hmfloorclose{from{transform:rotate(var(--hm-door-angle));}to{transform:rotate(0);}}
.hmlink{fill:none;stroke:var(--hm-accent);stroke-width:1;stroke-dasharray:3 3;opacity:.7;}
.hmlinktip{stroke-dasharray:none;stroke-linecap:round;stroke-linejoin:round;}
.hmlinkglow{stroke-width:4;stroke-dasharray:none;opacity:.13;}
.hmlinkroute{animation:hmrouteflow 1.8s linear infinite;}
@keyframes hmrouteflow{to{stroke-dashoffset:-18;}}
@media(prefers-reduced-motion:reduce){
  .hmframe *{animation:none !important;transition:none !important;}
}
@media(prefers-reduced-motion:reduce){
  .hmtrail{display:none;}
}
@media print{
  .hmframe *{animation:none !important;transition:none !important;filter:none !important;}
}
@media print{
  .hmsubject{transform:none !important;}
}
@media print{
  .hmtrail,.hmsig{display:none !important;}
}`,
    },
    {
      order: 2388,
      css: String.raw`@media print{
  .primary-panel .hmframe{max-height:none;}
}`,
    },
    {
      order: 2414,
      css: String.raw`.hmframe{--hm-cold:#6BCFFF;--hm-freezing:#81AEFF;}
.sk-daylight .hmframe,body.sk-pastel .hmframe,body.sk-editorial .hmframe{--hm-cold:#1579A4;--hm-freezing:#385DB5;}
.hmthermal{pointer-events:none;color:var(--hm-warn);}`,
    },
    {
      order: 2457,
      css: String.raw`@media print{
  .hmthermal,.hmthermal *{animation:none !important;}
}`,
    },
  ],
});

PanelRegistry.extend('homemap', {
  editorStyles: [
    {
      order: 476,
      css: String.raw`.home-elements,.home-element{min-width:0;border:1px solid var(--line);border-radius:7px;}
.home-elements>summary,.home-element>summary{cursor:pointer;padding:9px 10px;font:600 12px/1.5 'IBM Plex Sans',sans-serif;overflow-wrap:anywhere;}
.home-elements>summary:focus-visible,.home-element>summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}
.home-elements>.rowsedit{padding:0 8px 8px;gap:6px;}
.home-element>.rowcard{border:0;padding:6px 10px 10px;}
.home-element-kind{font-weight:400;color:var(--sub);margin-left:8px;font-size:11px;}
.home-icon-cell{grid-column:1 / -1;gap:5px;}
.home-icon-choice{display:flex;align-items:center;gap:8px;min-width:0;}
.home-icon-choice[hidden]{display:none;}
.home-icon-preview{flex:none;width:32px;height:32px;color:var(--ink);}
.home-icon-preview svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;}
.rowline.rowcard .home-icon-choice .fctl{flex:1;min-width:0;width:0;}
.home-icon-note{font:12px/1.5 'IBM Plex Sans',sans-serif;color:var(--sub);}`,
    },
    {
      order: 571,
      css: String.raw`.docview .home-layout-title{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
.docview .home-layout-button{font:600 11px 'IBM Plex Sans',sans-serif;text-transform:none;letter-spacing:normal;min-height:30px;margin-left:auto;}`,
    },
    { order: 576, css: String.raw`@media print{.home-layout-button{display:none !important;}}` },
    {
      order: 622,
      css: String.raw`.home-edit{min-width:0;margin:12px 0;padding:10px;border:1px solid var(--line);border-radius:9px;container-type:inline-size;}
.home-edit legend{font-size:12px;font-weight:700;color:var(--ink);}
.home-edit .frow{margin:7px 0;}
.home-note{font-size:11px;line-height:1.5;color:var(--sub);margin:7px 0;}
.home-edit-map{border-radius:8px;overflow:hidden;margin-bottom:10px;max-width:600px;}
.home-edit-fields{min-width:0;}
@container (min-width:700px){
  .home-edit-body{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,1fr);gap:16px;align-items:start;}
}
@container (min-width:700px){
  .home-edit-map{position:sticky;top:0;margin-bottom:0;}
}
.home-edit-map:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.home-edit-map [data-device],.home-edit-map [data-subject],.home-edit-map [data-home-room]{cursor:grab;touch-action:none;}
.home-edit-map .hmroom{pointer-events:stroke;}
.home-edit-map.moving,.home-edit-map.moving *{cursor:grabbing;}
.home-edit-map.placing,.home-edit-map.placing *{cursor:crosshair;touch-action:none;}
.home-edit-map .hmframe *{animation:none !important;}
.home-layout-map .hmoutline{cursor:grab;pointer-events:stroke;touch-action:none;}
.home-layout-map .home-resize-handle{fill:var(--hm-surface);stroke:var(--hm-accent);stroke-width:1;cursor:nwse-resize;touch-action:none;}
.home-outline-grip{fill:var(--hm-surface);stroke:var(--hm-accent);stroke-width:.7;cursor:grab;touch-action:none;}
.home-outline-grip-label{font:600 4.5px system-ui,sans-serif;fill:var(--hm-accent);pointer-events:none;}
.home-start-hidden{opacity:.4;}
.home-xy{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.home-xy .frow{display:flex;align-items:center;gap:8px;}
.home-xy .fctl{min-width:0;width:100%;}
.home-subject{padding:8px 0;border-top:1px solid var(--line);}
.home-subject .bbtn[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);}
.home-signal{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;margin:6px 0;}`,
    },
  ],
});

/* homemap authoring contract; merged into this panel definition by the bundle. */
/* Layout selection must remain available even when a diagram has a stepper. */
function builderHomemapClickTarget(element, getStepper, currentTarget) {
  var card = element.closest && element.closest('.pt-homemap[data-dv-panel]');
  var section = card && card.closest('.doc-sec[data-dv-section]');
  if (!section) return null;
  var explicitLayout = element.closest('[data-home-layout]');
  if (
    !explicitLayout &&
    element.closest('a, button, summary, [role="button"], input, select, textarea')
  )
    return null;
  var ordinal = Number(section.getAttribute('data-dv-section')),
    index = Number(card.getAttribute('data-dv-panel'));
  if (!Number.isInteger(ordinal) || !Number.isInteger(index)) return null;
  var player = getStepper(ordinal);
  var editingLayout =
    currentTarget &&
    currentTarget.kind === 'panel' &&
    currentTarget.section === ordinal &&
    currentTarget.index === index;
  var marker = element.closest('[data-device], [data-subject], [data-home-room]');
  if (!explicitLayout && !editingLayout && marker && player && player.mode() === 'step')
    return { section: ordinal, kind: 'step', index: player.sourceIndex() };
  return { section: ordinal, kind: 'panel', index: index, el: card };
}

/* Read both snapshots through the engine, following the selected branch.
   Removing one authored key restores its inherited value, never a copied
   snapshot that would freeze unrelated devices or people. */
function builderHomemapStep(d, stepIndex, panelId, pathId) {
  var panel = (d.panels || []).find(function (p) {
    return p && p.id === panelId && p.type === 'homemap';
  });
  var route =
    diagramPathList(d).find(function (p) {
      return p.id === pathId && p.indices.indexOf(stepIndex) >= 0;
    }) ||
    diagramPathList(d).find(function (p) {
      return p.indices.indexOf(stepIndex) >= 0;
    });
  if (!panel || !route) return { error: 'Select a homemap and a step in this path.' };
  var localIndex = route.indices.indexOf(stepIndex),
    active = diagramForPath(d, route.id);
  var states = foldHomemapStates(panel, active.steps),
    state = states[localIndex];
  var initial = Object.assign(Object.create(null), panel.initial || {}, { signals: [] });
  var patch = (stepPanelPatch(d.steps[stepIndex]) || {})[panelId] || {};
  return {
    panel: panel,
    patch: patch,
    state: state,
    position: localIndex,
    model: homemapModel(panel, state),
    before: homemapModel(panel, localIndex ? states[localIndex - 1] : initial),
  };
}

/* Shared geometry edits never write step patches or move room occupants. */
function planHomemapLayoutPosition(text, raw, sectionIdx, panelId, kind, key, point) {
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  var panels = got.d.panels || [],
    pi = panels.findIndex(function (p) {
      return p && p.id === panelId && p.type === 'homemap';
    });
  if (pi < 0) return { error: 'Homemap not found — reselect and try again.' };
  var panel = panels[pi],
    index = -1,
    item,
    list;
  var panelPath = got.path.concat(['panels', pi]);
  if (kind === 'outline') {
    if (!homemapSubjectPosition(point)) return { error: 'Choose a finite house position.' };
    item = Object.assign({}, panel.outline, homemapModel(panel).outline, point);
    if (
      !homemapSubjectPosition(item) ||
      !isFiniteNum(item.w) ||
      !isFiniteNum(item.h) ||
      item.w < 20 ||
      item.h < 20 ||
      item.x < 0 ||
      item.y < 0 ||
      item.x + item.w > 320 ||
      item.y + item.h > 180
    )
      return { error: 'Keep the house inside the frame, at least 20×20.' };
    return planSetField(text, raw, panelPath, 'outline', JSON.stringify(item));
  }
  if (kind === 'device') {
    list = 'devices';
    if (
      homemapModel(panel).devices.some(function (d) {
        return d.id === key;
      })
    )
      index = panel.devices.findIndex(function (d) {
        return d && d.id === key;
      });
  } else if (kind === 'room') {
    list = 'rooms';
    if (
      Number.isInteger(key) &&
      Array.isArray(panel.rooms) &&
      homemapRooms(panel).indexOf(panel.rooms[key]) >= 0
    )
      index = key;
  } else if (kind === 'subject') {
    list = 'subjects';
    if (
      homemapSubjects(panel).some(function (s) {
        return s.id === key;
      })
    )
      index = panel.subjects.findIndex(function (s) {
        return s && s.id === key;
      });
  }
  if (index < 0) return { error: 'Choose an existing device, room, or subject.' };
  item = panel[list][index];
  var resize = kind === 'room' && point && (point.w !== undefined || point.h !== undefined);
  var w = resize ? point.w : item.w,
    h = resize ? point.h : item.h;
  if (resize && (!isFiniteNum(w) || !isFiniteNum(h) || w <= 0 || h <= 0))
    return { error: 'Rooms need a positive width and height.' };
  var maxX = 320 - (kind === 'room' ? w : 0),
    maxY = 180 - (kind === 'room' ? h : 0);
  if (
    !homemapSubjectPosition(point) ||
    point.x < 0 ||
    point.y < 0 ||
    point.x > maxX ||
    point.y > maxY
  )
    return { error: 'Keep the whole item inside the 320×180 map.' };
  var fields = [
    ['x', JSON.stringify(point.x)],
    ['y', JSON.stringify(point.y)],
  ];
  if (resize) fields.push(['w', JSON.stringify(w)], ['h', JSON.stringify(h)]);
  var plan = planSetFields(text, raw, panelPath.concat([list, index]), fields);
  if (
    !plan.error &&
    kind === 'subject' &&
    panel.initial &&
    homemapSubjectPosition(panel.initial[key])
  )
    return planSetFields(
      plan.text,
      JSON.parse(plan.text),
      panelPath.concat(['initial', key]),
      fields
    );
  return plan;
}

function builderHomemapLayoutDrag(item, start, at, resize, minimum) {
  var dx = at.x - start.x,
    dy = at.y - start.y;
  if (resize)
    return {
      x: item.x,
      y: item.y,
      w: clamp(Math.round(item.w + dx), minimum || 1, 320 - item.x),
      h: clamp(Math.round(item.h + dy), minimum || 1, 180 - item.y),
    };
  return {
    x: clamp(Math.round(item.x + dx), 0, 320 - (item.w || 0)),
    y: clamp(Math.round(item.y + dy), 0, 180 - (item.h || 0)),
  };
}

function builderHomemapLayoutScene(panel) {
  var state = Object.assign(Object.create(null), panel.initial || {}),
    hidden = [];
  var model = homemapModel(panel, state);
  model.subjects.forEach(function (s) {
    if (s.hidden) hidden.push(s.id);
    state[s.id] = Object.assign({}, panelObject(state[s.id]) ? state[s.id] : {}, { x: s.x, y: s.y }); /* hidden subjects still have draggable starting positions */
    delete state[s.id]._homemapHidden;
  });
  return { state: state, model: homemapModel(panel, state), hidden: hidden };
}

/* Change one device attribute or subject audio/icon without capturing inherited siblings. */
function planHomemapDeviceAttribute(
  text,
  raw,
  sectionIdx,
  stepIdx,
  panelId,
  key,
  attribute,
  value
) {
  if (['state', 'thermal', 'spotlight', 'audio', 'icon'].indexOf(attribute) < 0) return { error: 'Unknown device attribute.' };
  var got =
    stepIdx === null
      ? builderDiagram(text, raw, sectionIdx)
      : builderStepAt(raw, sectionIdx, stepIdx);
  if (!got || got.error) return got || { error: 'Step not found.' };
  var pi = (got.d.panels || []).findIndex(function (p) {
    return p && p.type === 'homemap' && p.id === panelId;
  });
  if (pi < 0) return { error: 'Homemap not found.' };
  var panel = got.d.panels[pi],
    device = (panel.devices || []).find(function (d) {
      return homemapDeviceValid(d) && d.id === key;
    });
  var subject = homemapSubjects(panel).find(function (sub) { return sub.id === key; });
  if (!device && !(subject && ['audio','icon'].indexOf(attribute) >= 0)) return { error: 'Device or subject not found.' };
  var allowed = attribute === 'state' ? HOMEMAP_STATES[device.kind] : attribute === 'thermal' ? HOMEMAP_THERMAL : HOMEMAP_SPOTLIGHT;
  if (value !== undefined && (attribute === 'audio' ? !homemapAudioValid(value) : attribute === 'icon' ? !homemapIconValid(value) : allowed.indexOf(value) < 0))
    return { error: 'Choose a valid ' + attribute + '.' };
  var patch = stepIdx === null ? panel.initial : (stepPanelPatch(got.st) || {})[panelId];
  var current = patch && patch[key];
  if (subject && current === null && attribute === 'icon')
    return {error:'This subject is hidden at this step. Show it before setting its icon.'};
  var next = panelObject(current)
    ? Object.assign({}, current)
    : typeof current === 'string'
    ? { state: current }
    : {};
  if (value === undefined) delete next[attribute];
  else next[attribute] = attribute === 'audio' ? FlowAudio.clean(value) : value;
  var result = Object.keys(next).length ? next : undefined;
  if (stepIdx !== null)
    return planStepHomemapField(text, raw, sectionIdx, stepIdx, panelId, key, result);
  return builderRewrite(text, raw, got.path.concat(['panels', pi]), function (p) {
    var initial = Object.assign(Object.create(null), p.initial || {});
    if (result === undefined) delete initial[key];
    else initial[key] = result;
    if (Object.keys(initial).length) p.initial = initial;
    else delete p.initial;
  });
}
function planStepHomemapField(text, raw, sectionIdx, stepIdx, panelId, key, value) {
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return { error: 'Step not found — reselect and try again.' };
  var p = (got.d.panels || []).find(function (p) {
    return p && p.id === panelId && p.type === 'homemap';
  });
  if (!p) return { error: 'Homemap not found — reselect and try again.' };
  var model = homemapModel(p),
    device = model.devices.find(function (d) {
      return d.id === key;
    });
  var subject = model.subjects.find(function (s) {
    return s.id === key;
  });
  if (!device && !subject && key !== 'signals') return { error: 'Unknown homemap field.' };
  if (value !== undefined) {
    if (device && !homemapDevicePatchValid(device.kind, value))
      return { error: 'Choose a valid device state, temperature, spotlight, icon, or audio snapshot.' };
    if (
      subject &&
      value !== null &&
      (!homemapSubjectPatchValid(value) ||
        (homemapSubjectPosition(value) && (value.x < 0 || value.x > 320 || value.y < 0 || value.y > 180)))
    )
      return { error: 'Use a position within the map: x 0–320, y 0–180.' };
    if (
      key === 'signals' &&
      (!Array.isArray(value) ||
        value.some(function (s) {
          return (
            !s ||
            !model.devices.some(function (d) {
              return d.id === s.from;
            }) ||
            !model.devices.some(function (d) {
              return d.id === s.to;
            })
          );
        }))
    )
      return { error: 'Each signal needs two existing devices.' };
  }
  return builderRewrite(text, raw, got.path, function (st) {
    var containerKey =
      st.panels && typeof st.panels === 'object' && !Array.isArray(st.panels)
        ? 'panels'
        : st.patch && typeof st.patch === 'object' && !Array.isArray(st.patch)
        ? 'patch'
        : 'panels';
    var panels = Object.assign(Object.create(null), st[containerKey] || {});
    var patch = Object.assign(Object.create(null), panels[panelId] || {});
    if (value === undefined) delete patch[key];
    else patch[key] = value;
    if (Object.keys(patch).length) panels[panelId] = patch;
    else delete panels[panelId];
    if (Object.keys(panels).length) st[containerKey] = panels;
    else delete st[containerKey];
  });
}

PanelRegistry.extend('homemap', {
  authoring: {
    template: {
      title: 'Home',
      outline: { w: 300, h: 164 },
      devices: [
        {
          id: 'cam1',
          kind: 'camera',
          label: 'Porch cam',
          x: 46,
          y: 40,
          facing: 35,
          spread: 80,
          range: 70,
        },
        {
          id: 'cam2',
          kind: 'camera',
          label: 'Yard cam',
          x: 274,
          y: 40,
          facing: 145,
          spread: 80,
          range: 70,
        },
        { id: 'door', kind: 'entry', label: 'Front door', x: 160, y: 158 },
        { id: 'attic', kind: 'sensor', label: 'Attic temp', icon: 'thermo', x: 46, y: 132 },
        { id: 'hub', kind: 'hub', label: 'Hub', x: 160, y: 92 },
      ],
      subjects: [{ id: 'walker', label: 'Visitor', x: 20, y: 150 }],
      initial: { cam1: 'scan', cam2: 'sleep', door: 'closed', attic: 'ok', hub: 'idle' },
    },
    setupFields: [
      [
        'outline',
        'objf',
        {
          cols: [
            { k: 'w', kind: 'num', label: 'Width' },
            { k: 'h', kind: 'num', label: 'Height' },
            { k: 'x', kind: 'num', label: 'Left (auto)' },
            { k: 'y', kind: 'num', label: 'Top (auto)' },
          ],
          hint: 'Floor plan: width 20–320, height 20–180. Blank left/top centers the house. Rooms and devices keep their coordinates. Press Enter or leave a field to save.',
        },
      ],
      [
        'rooms',
        'rows',
        {
          cols: [
            { k: 'label' },
            { k: 'kind', kind: 'enum', options: ['room', 'outdoor'] },
            { k: 'x', kind: 'num', req: true },
            { k: 'y', kind: 'num', req: true },
            { k: 'w', kind: 'num', req: true },
            { k: 'h', kind: 'num', req: true },
          ],
        },
      ],
      [
        'devices',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'kind', kind: 'enum', options: ['camera', 'entry', 'sensor', 'hub'] },
            { k: 'display', kind: 'enum', options: ['marker', 'door'] },
            { k: 'label' },
            { k: 'x', kind: 'num', req: true },
            { k: 'y', kind: 'num', req: true },
            { k: 'facing', kind: 'num' },
            { k: 'spread', kind: 'num' },
            { k: 'range', kind: 'num' },
            { k: 'icon', kind: 'icon' },
            { k: 'doorWidth', kind: 'num' },
            { k: 'doorSwing', kind: 'num' },
          ],
          max: 12,
        },
      ],
      [
        'subjects',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'x', kind: 'num', req: true },
            { k: 'y', kind: 'num', req: true },
            { k: 'icon', kind: 'icon' },
          ],
          max: 6,
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [['signals', 'jsonArr']],
    picker: {
      order: 14,
      name: 'Home map',
      category: 'Places & sensing',
      tagline: 'Put the story in a place',
      description:
        'Arrange rooms, devices, doors, and people on a shared map, then change their states step by step.',
    },
    expandPatchFields: function (decl) {
      var vocab = {
        camera: ['sleep', 'scan', 'detect', 'rec', 'off'],
        entry: ['closed', 'open', 'alert'],
        sensor: ['ok', 'warn', 'alert', 'off'],
        hub: ['idle', 'rx', 'tx', 'alert'],
      };
      var seen = Object.create(null);
      var fields = (Array.isArray(decl.devices) ? decl.devices : [])
        .filter(function (d) {
          if (!d || typeof d.id !== 'string' || !d.id || seen[d.id]) return false;
          seen[d.id] = true;
          return (
            d.id !== 'signals' &&
            typeof d.kind === 'string' &&
            Object.prototype.hasOwnProperty.call(vocab, d.kind) &&
            typeof d.x === 'number' &&
            isFinite(d.x) &&
            typeof d.y === 'number' &&
            isFinite(d.y)
          );
        })
        .map(function (d) {
          return [d.id, 'jsonAny'];
        });
      (Array.isArray(decl.subjects) ? decl.subjects : []).forEach(function (sub) {
        if (!sub || typeof sub.id !== 'string' || !sub.id || seen[sub.id]) return;
        seen[sub.id] = true;
        if (
          sub.id === 'signals' ||
          typeof sub.x !== 'number' ||
          !isFinite(sub.x) ||
          typeof sub.y !== 'number' ||
          !isFinite(sub.y)
        )
          return;
        fields.push([sub.id, 'json', { nullable: true }]);
      });
      return fields.concat([['signals', 'jsonArr']]);
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'signals') {
        var signalPatch = context.currentPatch;
        return own(signalPatch, key)
          ? {
              kind: 'transient',
              label: 'This step only',
              inputs: [input(context.stepIndex, key, false)],
            }
          : { kind: 'engine', label: 'No signals at this step', inputs: [] };
      }
      var subject = homemapSubjects(p).some(function (s) {
        return s.id === key;
      });
      if (subject && panelObject(snapshot[key]) && (Object.prototype.hasOwnProperty.call(snapshot[key], 'audio') || Object.prototype.hasOwnProperty.call(snapshot[key], 'icon')))
        return history([key], true, 'Subject position, icon, and audio history');
      if (!subject && panelObject(snapshot[key]))
        return history([key], true, 'Device state, spotlight, temperature, icon, and audio history');
      return assignment(
        key,
        subject
          ? function (v) {
              return v === null || homemapSubjectPosition(v);
            }
          : null,
        false
      );
    },
    editor: function (context) {
      var homeElementFolds = Object.create(null);
      function listen(target,type,fn,options){
        if(context.listen)return context.listen(target,type,fn,options);
        target.addEventListener(type,fn,options);
      }
      function homemapIconControl(item, local, commit, initial) {
        var authored = panelObject(local) && Object.prototype.hasOwnProperty.call(local, 'icon');
        var input = context.controls.select(['__default__'].concat(ICON_SET),
          authored ? local.icon === null ? '__default__' : local.icon : '', function (value) {
            return commit(value == null ? undefined : value === '__default__' ? null : value);
          }, true);
        input.options[0].textContent = initial ? 'Use layout icon' : 'Inherit previous icon';
        input.options[1].textContent = 'Restore layout icon';
        input.setAttribute('aria-label', item.label + (initial ? ' initial' : '') + ' icon');
        input.setAttribute('data-icon-default-label', initial ? 'Use layout icon' : 'Inherit previous icon');
        return context.controls.row(item.label + ' · icon', context.controls.iconPicker(input));
      }
      function homemapAudioControl(item, local, commit, initial) {
        var box = document.createElement('details');
        box.className = 'home-audio-controls rawjson';
        var summary = document.createElement('summary');
        summary.textContent = item.label + ' · audio';
        box.appendChild(summary);
        var current = FlowAudio.clean(item.audio) || {},
          authored = panelObject(local) && Object.prototype.hasOwnProperty.call(local, 'audio');
        var mode = document.createElement('select');
        mode.className = 'fctl';
        mode.setAttribute('aria-label', item.label + (initial ? ' initial' : '') + ' audio snapshot');
        [['inherit', initial ? 'Default · no audio' : 'Inherit previous audio'], ['author', 'Set audio snapshot'], ['clear', 'Clear audio']].forEach(function (pair) {
          var option = document.createElement('option');
          option.value = pair[0]; option.textContent = pair[1]; mode.appendChild(option);
        });
        mode.value = authored ? local.audio === null ? 'clear' : 'author' : 'inherit';
        listen(mode, 'change', function () {
          commit(mode.value === 'inherit' ? undefined : mode.value === 'clear' ? null : current);
        });
        box.appendChild(context.controls.row('Audio', mode));
        FlowAudio.fields.forEach(function (field) {
          var key = field[0], input;
          function save(value) {
            var next = Object.assign({}, current);
            if (value == null || value === '') delete next[key];
            else next[key] = value;
            return commit(next);
          }
          if (field[1] === 'enum') {
            input = document.createElement('select');
            input.className = 'fctl';
            var blank = document.createElement('option');
            blank.value = ''; blank.textContent = 'Default · ' + FlowAudio.model(current)[key];
            input.appendChild(blank);
            field[2].forEach(function (value) {
              var option = document.createElement('option');
              option.value = value; option.textContent = value; input.appendChild(option);
            });
            input.value = current[key] || '';
            listen(input, 'change', function () { save(input.value); });
          } else input = context.controls.text(current[key], save);
          input.setAttribute('aria-label', item.label + (initial ? ' initial' : '') + ' audio ' + key);
          box.appendChild(context.controls.row(key.charAt(0).toUpperCase() + key.slice(1), input));
        });
        var hint = document.createElement('p');
        hint.className = 'home-note';
        hint.textContent = 'Audio replaces the previous snapshot. Connection, microphone, output, and detection are independent. Smoke alarm heard means a sound, not smoke detection.';
        box.appendChild(hint);
        return box;
      }
      function homemapLayoutControl(panel, target) {
        var box = document.createElement('fieldset');
        box.className = 'home-edit';
        var legend = document.createElement('legend');
        legend.textContent = 'Shared layout · drag to arrange';
        box.appendChild(legend);
        var hint = document.createElement('p');
        hint.className = 'home-note';
        hint.textContent =
          'Drag rooms, devices, doors, or people. Drag the House grip to move the outline; drag square corners to resize it or a room. Faded people start hidden. Changes apply across all paths; step overrides stay intact. Escape cancels.';
        box.appendChild(hint);
        var copyTools = document.createElement('div');
        copyTools.className = 'story-actions';
        var picked = null,
          pickLabel = document.createElement('span');
        pickLabel.className = 'home-note';
        pickLabel.textContent = 'Select an element to copy or duplicate.';
        copyTools.appendChild(pickLabel);
        var copyItem = context.controls.action('Copy element', function () {
          if (picked && context.clipboard()) context.clipboard().copy([picked]);
        });
        var duplicateItem = context.controls.action('Duplicate element', function () {
          if (picked && context.clipboard()) context.clipboard().duplicate([picked]);
        });
        copyItem.disabled = duplicateItem.disabled = true;
        copyTools.appendChild(copyItem);
        copyTools.appendChild(duplicateItem);
        box.appendChild(copyTools);
        var map = document.createElement('div');
        map.className = 'home-edit-map home-layout-map sk-daylight';
        map.tabIndex = 0;
        map.setAttribute('aria-label', 'Shared home layout placement map');
        box.appendChild(map);
        var scene = builderHomemapLayoutScene(panel),
          indexedText = context.source(),
          moving = null;
        function mark(svg, kind, key, x, y, resize) {
          var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('class', resize ? 'home-resize-handle' : 'home-outline-grip');
          rect.setAttribute('x', x - (resize ? 3 : 12));
          rect.setAttribute('y', y * HOMEMAP_Y_SCALE - (resize ? 3 : 5));
          rect.setAttribute('width', resize ? 6 : 24);
          rect.setAttribute('height', resize ? 6 : 10);
          rect.setAttribute('rx', '1');
          rect.setAttribute(kind === 'outline' ? 'data-home-outline' : 'data-home-room', key);
          if (resize) rect.setAttribute('data-home-resize', '');
          var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent =
            (resize ? 'Resize ' : 'Move ') +
            (kind === 'outline' ? 'house outline' : panel.rooms[key].label || 'room');
          rect.appendChild(title);
          svg.appendChild(rect);
          if (!resize) {
            var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('class', 'home-outline-grip-label');
            label.setAttribute('x', x);
            label.setAttribute('y', y * HOMEMAP_Y_SCALE + 1.7);
            label.setAttribute('text-anchor', 'middle');
            label.textContent = '↔ House';
            svg.appendChild(label);
          }
        }
        function paint(move) {
          var preview = panel,
            state = scene.state;
          if (move) {
            preview = Object.assign({}, panel);
            if (move.kind === 'outline')
              preview.outline = Object.assign({}, scene.model.outline, move.point);
            else {
              var list =
                move.kind === 'device' ? 'devices' : move.kind === 'room' ? 'rooms' : 'subjects';
              preview[list] = panel[list].map(function (item, i) {
                return i === move.index ? Object.assign({}, item, move.point) : item;
              });
              if (move.kind === 'subject') {
                state = Object.assign(Object.create(null), state);
                state[move.key] = Object.assign({}, panelObject(state[move.key]) ? state[move.key] : {}, move.point);
              }
            }
          }
          /* Decorations are editor-only and change as the outline/rooms move. */
          map._lastHTML = null;
          renderPanelBody(map, preview, state, 'daylight', [], -1, false);
          var svg = map.querySelector('svg.hmframe');
          if (!svg) return;
          var outline = homemapModel(preview).outline;
          svg.querySelector('.hmoutline').setAttribute('data-home-outline', '');
          homemapRooms(preview).forEach(function (r) {
            mark(svg, 'room', preview.rooms.indexOf(r), r.x + r.w, r.y + r.h, true);
          });
          mark(svg, 'outline', '', outline.x + outline.w, outline.y + outline.h, true);
          mark(svg, 'outline', '', outline.x + outline.w / 2, Math.max(5, outline.y - 5), false);
          Array.prototype.forEach.call(svg.querySelectorAll('[data-subject]'), function (el) {
            if (scene.hidden.indexOf(el.getAttribute('data-subject')) >= 0)
              el.classList.add('home-start-hidden');
          });
        }
        function eventPoint(ev) {
          var svg = map.querySelector('svg'),
            matrix = svg && svg.getScreenCTM();
          if (!matrix) return null;
          var point = svg.createSVGPoint();
          point.x = ev.clientX;
          point.y = ev.clientY;
          return homemapPointFromDisplay(point.matrixTransform(matrix.inverse()));
        }
        function cancel() {
          if (!moving) return;
          var id = moving.pointer;
          moving = null;
          map.classList.remove('moving');
          paint(null);
          if (map.hasPointerCapture(id)) map.releasePointerCapture(id);
        }
        if(context.onFormRetire)context.onFormRetire(function(){cancel();cancelPanelMotion(map);});
        listen(map,'pointerdown', function (ev) {
          if (ev.button !== 0) return;
          var el = ev.target.closest(
            '[data-device],[data-subject],[data-home-room],[data-home-outline]'
          );
          if (!el) return;
          var kind, key, item, index;
          if (el.hasAttribute('data-home-outline')) {
            kind = 'outline';
            key = '';
            item = scene.model.outline;
          } else if (el.hasAttribute('data-home-room')) {
            kind = 'room';
            key = index = Number(el.getAttribute('data-home-room'));
            item = panel.rooms[index];
          } else {
            kind = el.hasAttribute('data-device') ? 'device' : 'subject';
            key = el.getAttribute('data-' + kind);
            var list = kind === 'device' ? 'devices' : 'subjects';
            item = scene.model[list].find(function (d) {
              return d.id === key;
            });
            index = panel[list].findIndex(function (d) {
              return d && d.id === key;
            });
          }
          var start = eventPoint(ev);
          if (!item || !start) return;
          if (kind !== 'outline') {
            picked = {
              kind: 'home',
              section: target.section,
              index: target.index,
              field: kind === 'device' ? 'devices' : kind === 'room' ? 'rooms' : 'subjects',
              item: index,
            };
            context.selectClipboard(picked);
            pickLabel.textContent = item.label || item.id || 'Room';
            copyItem.disabled = duplicateItem.disabled = false;
          } else {
            picked = null;
            if(context.clearClipboard)context.clearClipboard();
            copyItem.disabled = duplicateItem.disabled = true;
            pickLabel.textContent = 'House outline';
          }
          ev.preventDefault();
          map.focus({ preventScroll: true });
          map.setPointerCapture(ev.pointerId);
          moving = {
            kind: kind,
            key: key,
            item: item,
            index: index,
            start: start,
            pointer: ev.pointerId,
            resize: el.hasAttribute('data-home-resize'),
            changed: false,
          };
          map.classList.add('moving');
        });
        listen(map,'pointermove', function (ev) {
          if (!moving || ev.pointerId !== moving.pointer) return;
          var at = eventPoint(ev);
          if (!at) return;
          moving.point = builderHomemapLayoutDrag(
            moving.item,
            moving.start,
            at,
            moving.resize,
            moving.kind === 'outline' ? 20 : 1
          );
          moving.changed = Object.keys(moving.point).some(function (k) {
            return moving.point[k] !== moving.item[k];
          });
          paint(moving);
        });
        listen(map,'pointerup', function (ev) {
          if (!moving || ev.pointerId !== moving.pointer) return;
          var done = moving;
          cancel();
          if (!done.changed) return;
          if (context.source() !== indexedText) {
            context.error('The source changed. Reselect this home before moving its layout.');
            return;
          }
          if (context.editingBlocked()) {
            context.error('Finish ADD TO STEP before editing the layout.');
            return;
          }
          context.transact(
            function (raw) {
              return planHomemapLayoutPosition(
                context.source(),
                raw,
                target.section,
                panel.id,
                done.kind,
                done.key,
                done.point
              );
            },
            {
              after: function () {
                context.inspect();
              },
            }
          );
        });
        listen(map,'pointercancel', cancel);
        listen(map,'lostpointercapture', cancel);
        listen(map,'keydown', function (ev) {
          if (ev.key === 'Escape' && moving) {
            ev.preventDefault();
            ev.stopPropagation();
            cancel();
          }
        });
        paint(null);
        return box;
      }
      function homemapStepControl(diagram, panel, target) {
        var box = document.createElement('fieldset');
        box.className = 'home-edit';
        var title = document.createElement('legend');
        title.textContent = (panel.title || panel.id) + ' · at this step';
        box.appendChild(title);
        box.appendChild(
          context.controls.action('Edit shared home layout', function () {
            context.select(
              { section: target.section, kind: 'panel', index: diagram.panels.indexOf(panel) },
              false
            );
            context.rehighlight();
          })
        );
        var sp = context.stepper(target.section);
        var snapshot = builderHomemapStep(
          diagram,
          target.index,
          panel.id,
          target.pathId || (sp && sp.path())
        );
        if (snapshot.error) {
          box.textContent = snapshot.error;
          return box;
        }
        var indexedText = context.source(),
          own = function (k) {
            return Object.prototype.hasOwnProperty.call(snapshot.patch, k);
          };
        function commit(key, value, layoutKind, attribute) {
          if (context.source() !== indexedText) {
            context.error('The source changed. Reselect this step before editing its map.');
            return false;
          }
          if (context.editingBlocked()) {
            context.error('Finish ADD TO STEP before editing the map.');
            return false;
          }
          return context.transact(
            function (raw) {
              if (layoutKind)
                return planHomemapLayoutPosition(
                  context.source(),
                  raw,
                  target.section,
                  panel.id,
                  layoutKind,
                  key,
                  value
                );
              if (attribute)
                return planHomemapDeviceAttribute(
                  context.source(),
                  raw,
                  target.section,
                  target.index,
                  panel.id,
                  key,
                  attribute,
                  value
                );
              if (homemapSubjectPosition(value) && panelObject(snapshot.patch[key])) {
                value = Object.assign({}, value);
                ['audio','icon'].forEach(function(field) {
                  if (Object.prototype.hasOwnProperty.call(snapshot.patch[key], field) && !Object.prototype.hasOwnProperty.call(value, field))
                    value[field] = snapshot.patch[key][field];
                });
              }
              return planStepHomemapField(
                context.source(),
                raw,
                target.section,
                target.index,
                panel.id,
                key,
                value
              );
            },
            {
              after: function () {
                context.inspect();
              },
            }
          );
        }
        function note(text, parent) {
          var el = document.createElement('p');
          el.className = 'home-note';
          el.textContent = text;
          (parent || box).appendChild(el);
          return el;
        }
        function button(label, action) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'bbtn';
          b.textContent = label;
          listen(b,'click', action);
          return b;
        }
        function choice(pairs, value, label, action) {
          var select = document.createElement('select');
          select.className = 'fctl';
          select.setAttribute('aria-label', label);
          pairs.forEach(function (pair) {
            var o = document.createElement('option');
            o.value = pair[0];
            o.textContent = pair[1];
            select.appendChild(o);
          });
          select.value = value;
          listen(select,'change', function () {
            action(select.value);
          });
          return select;
        }
        note(
          'Operating state, temperature, spotlight, icon, and audio carry independently. Inherit removes only that attribute at this step. Subject positions carry; signals last for this step only.'
        );
        var body = document.createElement('div');
        body.className = 'home-edit-body';
        box.appendChild(body);
        var map = document.createElement('div');
        map.className = 'home-edit-map sk-daylight';
        map.tabIndex = 0;
        map.setAttribute('aria-label', 'Home step placement map');
        body.appendChild(map);
        renderPanelBody(map, panel, snapshot.state, 'daylight', [], snapshot.position, false);
        var fields = document.createElement('div');
        fields.className = 'home-edit-fields';
        body.appendChild(fields);
        var deviceControls = Object.create(null),
          subjectControls = Object.create(null);
        snapshot.model.devices.forEach(function (d, i) {
          var before = snapshot.before.devices[i];
          var pairs = [['', 'Inherit · ' + before.state]].concat(
            HOMEMAP_STATES[d.kind].map(function (v) {
              return [v, v];
            })
          );
          var ownPatch = snapshot.patch[d.id];
          var hasState =
            own(d.id) &&
            (!panelObject(ownPatch) || Object.prototype.hasOwnProperty.call(ownPatch, 'state'));
          var ctl = choice(pairs, hasState ? d.state : '', d.label + ' state', function (v) {
            commit(d.id, v === '' ? undefined : v, null, 'state');
          });
          deviceControls[d.id] = ctl;
          fields.appendChild(context.controls.row(d.label, ctl));
          var thermalPairs = [['', 'Inherit · ' + before.thermal]].concat(
            HOMEMAP_THERMAL.map(function (v) {
              return [v, v];
            })
          );
          fields.appendChild(
            context.controls.row(
              'Temperature',
              choice(
                thermalPairs,
                panelObject(ownPatch) && Object.prototype.hasOwnProperty.call(ownPatch, 'thermal')
                  ? d.thermal
                  : '',
                d.label + ' temperature',
                function (v) {
                  commit(d.id, v === '' ? undefined : v, null, 'thermal');
                }
              )
            )
          );
          fields.appendChild(context.controls.row('Spotlight', choice(
            [['', 'Inherit · ' + before.spotlight]].concat(HOMEMAP_SPOTLIGHT.map(function (v) { return [v, v]; })),
            panelObject(ownPatch) && Object.prototype.hasOwnProperty.call(ownPatch, 'spotlight') ? d.spotlight : '',
            d.label + ' spotlight', function (v) { commit(d.id, v === '' ? undefined : v, null, 'spotlight'); }
          )));
          if (d.kind !== 'entry') fields.appendChild(homemapIconControl(d, ownPatch,
            function (v) { return commit(d.id, v, null, 'icon'); }, false));
          fields.appendChild(homemapAudioControl(d, ownPatch, function (v) { return commit(d.id, v, null, 'audio'); }, false));
        });
        var armedSubject = null;
        var placementHint =
          'Drag devices or room borders/labels to change the layout for all steps. Rooms move independently of their contents. Click a device to edit its state.';
        var placementNote = note(placementHint, fields);
        snapshot.model.subjects.forEach(function (sub, i) {
          var group = document.createElement('div');
          group.className = 'home-subject';
          fields.appendChild(group);
          var before = snapshot.before.subjects[i];
          var visibility = choice(
            [
              ['inherit', 'Inherit · ' + (before.hidden ? 'hidden' : before.x + ', ' + before.y)],
              ['show', 'Show at this position'],
              ['hide', 'Hidden'],
            ],
            own(sub.id) && (snapshot.patch[sub.id] === null || homemapSubjectPosition(snapshot.patch[sub.id])) ? (sub.hidden ? 'hide' : 'show') : 'inherit',
            sub.label + ' visibility',
            function (v) {
              var inherited = {};
              if (panelObject(snapshot.patch[sub.id])) ['audio','icon'].forEach(function(field) {
                if (Object.prototype.hasOwnProperty.call(snapshot.patch[sub.id], field)) inherited[field] = snapshot.patch[sub.id][field];
              });
              commit(
                sub.id,
                v === 'inherit' ? (Object.keys(inherited).length ? inherited : undefined) : v === 'hide' ? null : { x: sub.x, y: sub.y }
              );
            }
          );
          group.appendChild(context.controls.row(sub.label, visibility));
          var xy = document.createElement('div');
          xy.className = 'home-xy';
          group.appendChild(xy);
          ['x', 'y'].forEach(function (k) {
            var input = context.controls.number(sub[k], function (v) {
              if (v == null) {
                context.error('Enter a coordinate, or choose Inherit.');
                return false;
              }
              var pos = { x: sub.x, y: sub.y };
              pos[k] = v;
              return commit(sub.id, pos);
            });
            input.setAttribute('aria-label', sub.label + ' ' + k);
            xy.appendChild(context.controls.row(k, input));
          });
          var place = button('Place ' + sub.label, function () {
            armedSubject = armedSubject === sub.id ? null : sub.id;
            Object.keys(subjectControls).forEach(function (id) {
              subjectControls[id].setAttribute(
                'aria-pressed',
                id === armedSubject ? 'true' : 'false'
              );
            });
            map.classList.toggle('placing', armedSubject !== null);
            placementNote.textContent =
              armedSubject === null
                ? 'Placement cancelled.'
                : 'Tap the map to place ' + sub.label + '. Escape cancels.';
          });
          place.setAttribute('aria-pressed', 'false');
          subjectControls[sub.id] = place;
          group.appendChild(place);
          group.appendChild(homemapIconControl(sub, snapshot.patch[sub.id],
            function (v) { return commit(sub.id, v, null, 'icon'); }, false));
          group.appendChild(homemapAudioControl(sub, snapshot.patch[sub.id], function (v) { return commit(sub.id, v, null, 'audio'); }, false));
        });
        if (snapshot.model.subjects.length)
          placementNote.textContent =
            'Drag a person, or choose Place and tap this map, to move them at this step. ' +
            placementHint;
        function eventPoint(ev) {
          var svg = map.querySelector('svg'),
            matrix = svg && svg.getScreenCTM();
          if (!matrix) return null;
          var p = svg.createSVGPoint();
          p.x = ev.clientX;
          p.y = ev.clientY;
          p = p.matrixTransform(matrix.inverse());
          return homemapPointFromDisplay(p);
        }
        var moving = null,
          swallowClick = false;
        function previewMove(move) {
          var previewPanel = panel,
            state = snapshot.state;
          if (move && move.kind === 'subject') {
            state = Object.assign(Object.create(null), state);
            state[move.key] = Object.assign({}, panelObject(state[move.key]) ? state[move.key] : {}, move.point);
          } else if (move) {
            previewPanel = Object.assign({}, panel);
            var list = move.kind === 'device' ? 'devices' : 'rooms';
            previewPanel[list] = panel[list].map(function (item, i) {
              return i === move.index ? Object.assign({}, item, move.point) : item;
            });
          }
          renderPanelBody(map, previewPanel, state, 'daylight', [], snapshot.position, false);
        }
        function cancelMove() {
          if (!moving) return;
          var pointer = moving.pointer;
          moving = null;
          map.classList.remove('moving');
          previewMove(null);
          if (map.hasPointerCapture(pointer)) map.releasePointerCapture(pointer);
        }
        if(context.onFormRetire)context.onFormRetire(function(){cancelMove();armedSubject=null;map.classList.remove('placing');cancelPanelMotion(map);});
        listen(map,'pointerdown', function (ev) {
          if (ev.button !== 0 || armedSubject !== null) return;
          var el = ev.target.closest('[data-subject], [data-device], [data-home-room]');
          if (!el) return;
          var kind, key, item, index;
          if (el.hasAttribute('data-subject')) {
            kind = 'subject';
            key = el.getAttribute('data-subject');
            item = snapshot.model.subjects.find(function (s) {
              return s.id === key;
            });
          } else if (el.hasAttribute('data-device')) {
            kind = 'device';
            key = el.getAttribute('data-device');
            item = snapshot.model.devices.find(function (d) {
              return d.id === key;
            });
            index = panel.devices.findIndex(function (d) {
              return d && d.id === key;
            });
          } else {
            kind = 'room';
            key = index = Number(el.getAttribute('data-home-room'));
            item = panel.rooms[index];
          }
          var at = eventPoint(ev);
          if (!item || !at) return;
          ev.preventDefault();
          map.focus({ preventScroll: true });
          map.setPointerCapture(ev.pointerId);
          moving = {
            kind: kind,
            key: key,
            index: index,
            item: item,
            start: at,
            point: { x: item.x, y: item.y },
            pointer: ev.pointerId,
            changed: false,
          };
          map.classList.add('moving');
        });
        listen(map,'pointermove', function (ev) {
          if (!moving || ev.pointerId !== moving.pointer) return;
          var at = eventPoint(ev);
          if (!at) return;
          var maxX = 320 - (moving.kind === 'room' ? moving.item.w : 0),
            maxY = 180 - (moving.kind === 'room' ? moving.item.h : 0);
          moving.point = {
            x: Math.max(0, Math.min(maxX, Math.round(moving.item.x + at.x - moving.start.x))),
            y: Math.max(0, Math.min(maxY, Math.round(moving.item.y + at.y - moving.start.y))),
          };
          moving.changed = moving.point.x !== moving.item.x || moving.point.y !== moving.item.y;
          previewMove(moving);
        });
        listen(map,'pointerup', function (ev) {
          if (!moving || ev.pointerId !== moving.pointer) return;
          var done = moving;
          cancelMove();
          if (done.changed) {
            swallowClick = true;
            commit(done.key, done.point, done.kind === 'subject' ? null : done.kind);
          }
        });
        listen(map,'pointercancel', cancelMove);
        listen(map,'lostpointercapture', cancelMove);
        listen(box,'keydown', function (ev) {
          if (ev.key !== 'Escape') return;
          if (moving || armedSubject !== null) {
            ev.preventDefault();
            ev.stopPropagation();
            cancelMove();
            armedSubject = null;
            map.classList.remove('placing');
            Object.keys(subjectControls).forEach(function (id) {
              subjectControls[id].setAttribute('aria-pressed', 'false');
            });
            placementNote.textContent = 'Placement cancelled.';
          }
        });
        listen(map,'click', function (ev) {
          if (swallowClick) {
            swallowClick = false;
            return;
          }
          if (armedSubject !== null) {
            var at = eventPoint(ev);
            if (at) commit(armedSubject, at);
            return;
          }
          var device = ev.target.closest('[data-device]'),
            subject = ev.target.closest('[data-subject]');
          if (device && deviceControls[device.getAttribute('data-device')])
            deviceControls[device.getAttribute('data-device')].focus();
          else if (subject && subjectControls[subject.getAttribute('data-subject')])
            subjectControls[subject.getAttribute('data-subject')].click();
        });
        note('Signals · this step only', fields);
        snapshot.model.signals.forEach(function (sig, i) {
          var row = document.createElement('div');
          row.className = 'home-signal';
          var label = document.createElement('span');
          label.textContent =
            snapshot.model.devices.find(function (d) {
              return d.id === sig.from;
            }).label +
            ' → ' +
            snapshot.model.devices.find(function (d) {
              return d.id === sig.to;
            }).label;
          row.appendChild(label);
          row.appendChild(
            button('Remove', function () {
              var signals = snapshot.model.signals
                .filter(function (_, n) {
                  return n !== i;
                })
                .map(function (s) {
                  return { from: s.from, to: s.to };
                });
              commit('signals', signals.length ? signals : undefined);
            })
          );
          fields.appendChild(row);
        });
        if (snapshot.model.devices.length > 1) {
          var endpoints = snapshot.model.devices.map(function (d) {
            return [d.id, d.label];
          });
          var from = choice(endpoints, endpoints[0][0], 'Signal from', function () {});
          var to = choice(endpoints, endpoints[1][0], 'Signal to', function () {});
          fields.appendChild(context.controls.row('Signal from', from));
          fields.appendChild(context.controls.row('Signal to', to));
          fields.appendChild(
            button('Add signal', function () {
              if (from.value === to.value) {
                context.error('Choose two different devices for a signal.');
                return;
              }
              var signals = snapshot.model.signals.map(function (s) {
                return { from: s.from, to: s.to };
              });
              if (
                !signals.some(function (s) {
                  return s.from === from.value && s.to === to.value;
                })
              )
                signals.push({ from: from.value, to: to.value });
              commit('signals', signals);
            })
          );
        }
        return box;
      }

      function homemapElementsControl(key, cur, shape) {
        var identity = JSON.stringify([context.target().section, context.target().index, key]);
        var state =
          homeElementFolds[identity] || (homeElementFolds[identity] = { open: false, items: [] });
        var group = document.createElement('details');
        group.className = 'home-elements';
        group.open = state.open;
        var summary = document.createElement('summary');
        summary.textContent =
          key[0].toUpperCase() + key.slice(1) + ' (' + (Array.isArray(cur) ? cur.length : 0) + ')';
        group.appendChild(summary);
        group.appendChild(context.controls.rows(key, cur, shape, homeRowOptions(key, state)));
        listen(group,'toggle', function () {
          if (group.isConnected) state.open = group.open;
        });
        return group;
      }

      function homeRowOptions(key, folds) {
        return {
          committed: function (refs) {
            folds.items = refs.map(function (ref) {
              return ref.fold.open;
            });
          },
          cell: function (info) {
            var col = info.column,
              input = info.input,
              cell = info.cell,
              ref = info.ref,
              base = info.base;
            if (col.kind !== 'icon') return false;

            cell.classList.add('home-icon-cell');
            var choice = document.createElement('span');
            choice.className = 'home-icon-choice';
            var note = document.createElement('span');
            note.className = 'home-icon-note';
            input.setAttribute(
              'aria-label',
              ((base && (base.label || base.id)) || key.slice(0, -1)) + ' icon'
            );
            input.options[0].textContent =
              key === 'subjects' ? 'Default (person)' : 'Default (gear)';
            choice.appendChild(context.controls.iconPicker(input));
            cell.appendChild(choice);
            cell.appendChild(note);
            ref.syncIcon = function () {
              var subject = key === 'subjects',
                deviceKind = ref.inputs.kind && ref.inputs.kind.value;
              var editable = subject || ['sensor', 'camera', 'hub'].indexOf(deviceKind) >= 0;
              input.disabled = !editable;
              choice.hidden = !editable;
              var fallback = subject ? 'person' : deviceKind === 'camera' ? 'camera' : deviceKind === 'hub' ? 'router' : 'gear';
              input.options[0].textContent = 'Default (' + fallback + ')';
              note.textContent = editable
                ? subject
                  ? 'Moving actor: person by default; choose an icon for a car or another subject.'
                  : deviceKind === 'sensor'
                    ? 'Sensor also serves as a generic device marker. Choose cloud for a cloud service.'
                    : 'Choose a symbol without changing this device’s behavior.'
                : (deviceKind === 'entry'
                    ? 'Entry devices use the entry marker or door drawing.'
                    : 'Choose a device kind first.') + ' For a custom icon, choose kind sensor.';
            };
            listen(input,'change', ref.syncIcon);

            return true;
          },
          actions: function (info) {
            var line = info.line,
              acts = info.actions,
              base = info.base,
              ref = info.ref;
            if (ref.syncIcon) {
              ref.syncIcon();
              if (ref.inputs.kind) listen(ref.inputs.kind,'change', ref.syncIcon);
            }
            if (base && context.clipboard()) {
              var homeTarget = {
                kind: 'home',
                section: context.target().section,
                index: context.target().index,
                field: key,
                item: info.index,
              };
              function rowClipboard(action) {
                var parsed = context.parse(),
                  path = parsed.error
                    ? null
                    : builderTargetPath(parsed.raw, {
                        kind: 'panel',
                        section: homeTarget.section,
                        index: homeTarget.index,
                      });
                var live = path && specValueAt(parsed.raw, path.concat([key, homeTarget.item]));
                if (JSON.stringify(live) !== JSON.stringify(base)) {
                  context.error('The element changed. Reselect it before copying.');
                  return;
                }
                context.selectClipboard(homeTarget);
                context.clipboard()[action]([homeTarget]);
              }
              acts.appendChild(
                info.button('Copy', 'Copy this Home element', function () {
                  rowClipboard('copy');
                })
              );
              acts.appendChild(
                info.button('Duplicate', 'Duplicate this Home element', function () {
                  rowClipboard('duplicate');
                })
              );
              listen(line,'focusin', function () {
                context.selectClipboard(homeTarget);
              });

              ref.clipboardTarget = homeTarget;
            }
          },
          wrapRow: function (info) {
            var line = info.line,
              ref = info.ref,
              base = info.base,
              index = info.index;
            var fold = document.createElement('details');
            fold.className = 'home-element';
            fold.open = !base || folds.items[index] === true;
            ref.fold = fold;
            var summary = document.createElement('summary');
            var name = document.createElement('span');
            name.className = 'home-element-name';
            var singular = key.slice(0, -1);
            name.textContent = base
              ? base.label ||
                base.id ||
                singular[0].toUpperCase() + singular.slice(1) + ' ' + (index + 1)
              : 'New ' + singular;
            var kind = document.createElement('span');
            kind.className = 'home-element-kind';
            kind.textContent =
              ' · ' +
              (base
                ? key === 'rooms'
                  ? base.kind || 'room'
                  : key === 'devices'
                  ? base.display === 'door'
                    ? 'door'
                    : base.kind || 'device'
                  : 'subject'
                : 'unsaved');
            summary.appendChild(name);
            summary.appendChild(kind);
            fold.appendChild(summary);
            fold.appendChild(line);
            if (ref.clipboardTarget)
              listen(summary,'click', function () {
                context.selectClipboard(ref.clipboardTarget);
              });
            listen(fold,'toggle', function () {
              if (fold.isConnected) folds.items[info.refs.indexOf(ref)] = fold.open;
            });
            return fold;
          },
        };
      }

      return {
        busy: function (view, guide) {
          return !!(
            view.querySelector('.home-edit-map.moving') ||
            (guide && guide.querySelector('.home-edit-map.moving'))
          );
        },
        stepControl: homemapStepControl,
        setupField: function (field, panel) {
          if (field[1] === 'rows')
            return homemapElementsControl(field[0], panel[field[0]], field[2] || { cols: [] });
        },
        setupRows: function (val, diagram, t, rows) {
          var layoutNote = document.createElement('p');
          layoutNote.className = 'home-note';
          layoutNote.textContent =
            'Shared home layout · all steps and paths. Set outline w/h for the floor plan size; edit rooms, devices, and starting subject positions below. Coordinates use a 320 × 180 frame.';
          rows.unshift(layoutNote);
          rows.push(
            context.controls.row(
              'Show subject labels',
              context.controls.select(
                ['Hidden (default)', 'Shown'],
                val.showSubjectLabels === true ? 'Shown' : 'Hidden (default)',
                function (v) {
                  return context.commit('showSubjectLabels', v === 'Shown' ? 'true' : null);
                }
              )
            )
          );
          var editStep = document.createElement('button');
          editStep.type = 'button';
          editStep.className = 'bbtn';
          editStep.textContent = 'Edit home at current step';
          var sp = context.stepper(t.section);
          editStep.disabled = !sp;
          listen(editStep,'click', function () {
            var current = context.stepper(t.section);
            if (!current) return;
            context.select(
              { section: t.section, kind: 'step', index: current.sourceIndex() },
              false
            );
          });
          rows.push(editStep);
          rows.push(homemapLayoutControl(val, t));
          var conditions = document.createElement('details');
          conditions.className = 'rawjson';
          var conditionsTitle = document.createElement('summary');
          conditionsTitle.textContent = 'Starting device and subject conditions';
          conditions.appendChild(conditionsTitle);
          homemapModel(val, val.initial).devices.forEach(function (device) {
            ['state', 'thermal', 'spotlight'].forEach(function (attribute) {
              var options = attribute === 'state' ? HOMEMAP_STATES[device.kind] : attribute === 'thermal' ? HOMEMAP_THERMAL : HOMEMAP_SPOTLIGHT;
              var input = context.controls.select(options, device[attribute], function (v) {
                return context.transact(
                  function (raw) {
                    return planHomemapDeviceAttribute(
                      context.source(),
                      raw,
                      t.section,
                      null,
                      val.id,
                      device.id,
                      attribute,
                      v
                    );
                  },
                  {
                    after: function () {
                      context.inspect();
                    },
                  }
                );
              });
              input.setAttribute('aria-label', device.label + ' initial ' + attribute);
              conditions.appendChild(
                context.controls.row(
                  device.label + ' · ' + (attribute === 'thermal' ? 'temperature' : attribute),
                  input
                )
              );
            });
          });
          var initialModel = homemapModel(val, val.initial);
          initialModel.devices.concat(initialModel.subjects).forEach(function (item) {
            if (item.kind !== 'entry') conditions.appendChild(homemapIconControl(item, (val.initial || {})[item.id], function (value) {
              return context.transact(function (raw) {
                return planHomemapDeviceAttribute(context.source(), raw, t.section, null, val.id, item.id, 'icon', value);
              }, { after: function () { context.inspect(); } });
            }, true));
            conditions.appendChild(homemapAudioControl(item, (val.initial || {})[item.id], function (value) {
              return context.transact(function (raw) {
                return planHomemapDeviceAttribute(context.source(), raw, t.section, null, val.id, item.id, 'audio', value);
              }, { after: function () { context.inspect(); } });
            }, true));
          });
          rows.push(conditions);
        },
        clickTarget: function (element) {
          var homeTarget = builderHomemapClickTarget(element, context.stepper, context.target());
          if (homeTarget) {
            if (homeTarget.kind === 'panel') {
              var marker = element.closest('[data-device],[data-subject],[data-home-room]');
              if (marker)
                homeTarget.homeElement = marker.hasAttribute('data-device')
                  ? { field: 'devices', id: marker.getAttribute('data-device') }
                  : marker.hasAttribute('data-subject')
                  ? { field: 'subjects', id: marker.getAttribute('data-subject') }
                  : { field: 'rooms', item: Number(marker.getAttribute('data-home-room')) };
            }
            return homeTarget;
          }
          return null;
        },
        selected: function (target, raw) {
          if (!target.homeElement) return;
          var parsed = { raw: raw };
          var panelPath = builderTargetPath(parsed.raw, context.target()),
            home = panelPath && specValueAt(parsed.raw, panelPath),
            pick = target.homeElement;
          var item =
            pick.field === 'rooms'
              ? pick.item
              : home &&
                (home[pick.field] || []).findIndex(function (x) {
                  return x.id === pick.id;
                });
          if (home && item >= 0)
            context.selectClipboard({
              kind: 'home',
              section: target.section,
              index: target.index,
              field: pick.field,
              item: item,
            });
        },
        revealElement: function (t) {
          var identity = JSON.stringify([t.section, t.index, t.field]);
          var folds =
            homeElementFolds[identity] || (homeElementFolds[identity] = { open: true, items: [] });
          folds.open = true;
          folds.items[t.item] = true;
        },
        decoratePreview: function (card) {
          if (card.querySelector('[data-home-layout]')) return;
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'bbtn home-layout-button';
          button.textContent = 'Edit layout';
          button.setAttribute('data-home-layout', '');
          button.setAttribute('aria-label', 'Edit home layout');
          button.title = 'Edit shared size, rooms, devices, and starting positions';
          var title = card.querySelector('.ptitle');
          if (!title) {
            title = document.createElement('div');
            title.className = 'ptitle';
            card.insertBefore(title, card.firstChild);
          }
          title.classList.add('home-layout-title');
          title.appendChild(button);
        },
      };
    },
  },
});

/* Pure panel utilities shared by declarations, folds and render models. */
function panelObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function panelOwn(obj, key) {
  return panelObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}
var BUFFER_STATES = ['empty', 'buffered', 'protected', 'uploading', 'uploaded', 'dropped'];
function bufferSegCount(decl) {
  return decl && typeof decl.segments === 'number' && isFinite(decl.segments)
    ? Math.round(Math.max(2, Math.min(48, decl.segments)))
    : 12;
}
function bufferPaint(n, baseCells, marks) {
  var cells = [];
  for (var i = 0; i < n; i++) {
    var t = Array.isArray(baseCells) ? baseCells[i] : undefined;
    cells.push(BUFFER_STATES.indexOf(t) >= 0 ? t : 'empty');
  }
  (Array.isArray(marks) ? marks : []).forEach(function (op) {
    if (!Array.isArray(op) || op.length < 3) return;
    var a = op[0],
      b = op[1],
      tok = op[2];
    if (typeof a !== 'number' || !isFinite(a) || typeof b !== 'number' || !isFinite(b)) return;
    if (BUFFER_STATES.indexOf(tok) < 0) return;
    a = Math.max(0, Math.round(a));
    b = Math.min(n - 1, Math.round(b));
    for (var mi = a; mi <= b; mi++) cells[mi] = tok;
  });
  return cells;
}

/* Collection shape belongs to the descriptor; ID filtering is shared. */
function softwarePanelItems(p) {
  var descriptor = PanelRegistry.get(p.type);
  var collection = descriptor && descriptor.itemCollection;
  if (!collection) return [];
  return panelCollectionItems(p, collection.key, collection.max);
}
function panelCollectionItems(p, key, max) {
  var seen = Object.create(null);
  return (Array.isArray(p[key]) ? p[key] : []).slice(0, max).filter(function (item) {
    if (!panelObject(item) || typeof item.id !== 'string' || !item.id || seen[item.id])
      return false;
    seen[item.id] = true;
    return true;
  });
}
function panelCollectionWarnings(p, path, warnings, key, max, validateItem) {
  var seen = Object.create(null);
  if (!Array.isArray(p[key]) || !p[key].length)
    warnings.push(path + '.' + key + ': needs 1–' + max + ' entries with unique string ids');
  else {
    if (p[key].length > max)
      warnings.push(path + '.' + key + ': only the first ' + max + ' entries render');
    p[key].forEach(function (item, i) {
      var at = path + '.' + key + '[' + i + ']';
      if (!panelObject(item) || typeof item.id !== 'string' || !item.id) {
        warnings.push(at + '.id: needs a non-empty string — entry skipped');
        return;
      }
      if (seen[item.id])
        warnings.push(at + '.id: duplicate id "' + item.id + '" — later entry skipped');
      seen[item.id] = true;
      if (validateItem) validateItem(item, at, warnings);
    });
  }
}
/* Sparse snapshots carry shallow fields, append histories and isolate one-step
   overrides. Range paints retain the original generic compatibility behavior. */
function foldCommonPanelStates(panel, steps, options) {
  options = options || {};
  var carried = {},
    accumulated = {},
    states = [];
  Object.keys(panel.initial || {}).forEach(function (key) {
    carried[key] = panel.initial[key];
  });
  var logAcc = [];
  if (Array.isArray(carried.log)) {
    logAcc = carried.log.slice();
    delete carried.log;
  }
  (options.append || []).forEach(function (key) {
    accumulated[key] = Array.isArray(carried[key]) ? carried[key].slice() : [];
    delete carried[key];
  });
  function snapshot(once) {
    var snap = {};
    Object.keys(carried).forEach(function (key) {
      snap[key] = carried[key];
    });
    if (once)
      Object.keys(once).forEach(function (key) {
        snap[key] = once[key];
      });
    Object.keys(accumulated).forEach(function (key) {
      snap[key] = accumulated[key].slice();
    });
    snap.log = logAcc.slice();
    return snap;
  }
  steps.forEach(function (step) {
    var patch = (stepPanelPatch(step) || {})[panel.id] || {},
      once = null;
    /* Replacing cells resets earlier range paints; this patch's marks then
       apply on top of that replacement. */
    if (patch.cells !== undefined) carried.mark = [];
    Object.keys(patch).forEach(function (key) {
      if (key === 'enterOnce') {
        once = patch[key];
        return;
      }
      if (key === 'log') {
        logAcc = logAcc.concat(Array.isArray(patch.log) ? patch.log : [patch.log]);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(accumulated, key)) {
        accumulated[key] = accumulated[key].concat(
          Array.isArray(patch[key]) ? patch[key] : [patch[key]]
        );
        return;
      }
      if (options.accept && Object.prototype.hasOwnProperty.call(options.accept, key)) {
        if (options.accept[key](patch[key])) carried[key] = patch[key];
        return;
      }
      if (key === 'mark') {
        var ops = Array.isArray(patch.mark) ? patch.mark : [];
        carried.mark = (Array.isArray(carried.mark) ? carried.mark : []).concat(ops);
        if (carried.mark.length > 64) {
          carried.cells = bufferPaint(bufferSegCount(panel), carried.cells, carried.mark);
          carried.mark = [];
        }
        return;
      }
      carried[key] = patch[key];
    });
    states.push(snapshot(once));
  });
  if (!steps.length) states.push(snapshot(null));
  return states;
}

/* Snapshot validation and enter-once traversal share one set of object rules. */
function softwarePanelPatchWarnings(state, path, panel, warnings, validateState) {
  if (state == null) return;
  if (!panelObject(state)) {
    warnings.push(path + ': expected a state object — ignored');
    return;
  }
  validateState(state, path, panel, warnings);
  if (panelObject(state.enterOnce)) {
    var once = Object.assign({}, state.enterOnce);
    delete once.enterOnce;
    softwarePanelPatchWarnings(once, path + '.enterOnce', panel, warnings, validateState);
  }
}
function panelKeyedStateWarnings(state, path, panel, warnings, key, validateValue) {
  if (state[key] == null) return;
  var ids = softwarePanelItems(panel).map(function (item) {
    return item.id;
  });
  if (!panelObject(state[key]))
    warnings.push(path + '.' + key + ': expected an object keyed by declared id');
  else
    Object.keys(state[key]).forEach(function (id) {
      var at = path + '.' + key + '.' + id,
        value = state[key][id];
      if (ids.indexOf(id) < 0) {
        warnings.push(at + ': unknown declared id — ignored');
        return;
      }
      validateValue(value, at, warnings);
    });
}

/* Shared panel presentation lifecycle. Panel modules describe their output and
   motion; none owns another panel's state, DOM or animation implementation. */
var PanelViews = {
  register: function (type, render, options) {
    if (typeof render !== 'function') throw new Error('Invalid panel renderer: ' + type);
    if (PanelRegistry.get(type) && PanelRegistry.get(type).render)
      throw new Error('Duplicate panel renderer: ' + type);
    render.options = options || {};
    PanelRegistry.extend(type, { render: render });
  },
  get: function (type) {
    var definition = PanelRegistry.get(type),
      render = definition && definition.render;
    if (render && !render.options) render.options = definition.presentation || {};
    return render;
  },
  types: function () {
    return PanelRegistry.types().filter(function (type) {
      return !!PanelViews.get(type);
    });
  },
};
var ZF_SEQ = 0; // Shared unique SVG IDs across every panel instance.
function panelDecimalPlaces(value) {
  var text = String(value),
    dot = text.indexOf('.');
  return dot < 0 ? 0 : Math.min(3, text.length - dot - 1);
}
function softwarePanelShell(content, state) {
  return (
    '<div class="swpanel">' +
    content +
    (state.note ? '<div class="swnote">' + esc(String(state.note)) + '</div>' : '') +
    '</div>'
  );
}
// Kept as a compatibility helper for callers of the software panel models.
function softwarePanelHTML(panel, state) {
  var render = PanelViews.get(panel.type);
  return render ? render({}, panel, state || {}).html : softwarePanelShell('', state || {});
}
function panelGlideElements(host, glide) {
  if (!glide) return [];
  if (glide.multiple)
    return typeof host.querySelectorAll === 'function' ? host.querySelectorAll(glide.selector) : [];
  var el = host.querySelector(glide.selector);
  return el ? [el] : [];
}
function cancelPanelMotion(host) {
  if (host._thTween && typeof cancelAnimationFrame === 'function')
    cancelAnimationFrame(host._thTween);
  host._thTween = null;
  if (host._pulseTimer) {
    clearTimeout(host._pulseTimer);
    host._pulseTimer = null;
  }
  host._ifEpoch = (host._ifEpoch || 0) + 1;
}
function settlePanelPresentation(host, result) {
  cancelPanelMotion(host);
  if (typeof host.querySelectorAll === 'function') {
    var emphasized = host.querySelectorAll('.dv-chip-pulse,.dv-bar-enter');
    for (var i = 0; i < emphasized.length; i++) {
      emphasized[i].classList.remove('dv-chip-pulse');
      emphasized[i].classList.remove('dv-bar-enter');
    }
    var fresh = host.querySelectorAll('.fresh');
    for (var f = 0; f < fresh.length; f++) fresh[f].classList.remove('fresh');
    if (result.transient) {
      var temporary = host.querySelectorAll(result.transient);
      for (var j = temporary.length - 1; j >= 0; j--)
        if (temporary[j].parentNode) temporary[j].parentNode.removeChild(temporary[j]);
    }
  }
  var level = result.level;
  if (level) {
    var fill = host.querySelector(level.fill),
      value = host.querySelector(level.readout);
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = level.pct.toFixed(1) + '%';
    }
    var settled = level.settled !== undefined ? level.settled : level.value;
    if (value && value.firstChild && settled != null) value.firstChild.nodeValue = String(settled);
  }
  var subjects = panelGlideElements(host, result.glide);
  for (var k = 0; k < subjects.length; k++) {
    subjects[k].style.transition = 'none';
    subjects[k].style.transform = 'translate(0,0)';
  }
  if (result.bars && typeof host.querySelectorAll === 'function') {
    var bars = host.querySelectorAll(result.bars.selector);
    result.bars.frames.forEach(function (frame, i) {
      if (!bars[i]) return;
      bars[i].style.transition = 'none';
      bars[i].style.width = frame.width.toFixed(3) + '%';
      bars[i].style.opacity = '1';
    });
  }
  if (result.settle) result.settle();
}
function tweenPanelLevel(host, level, animate) {
  var pctNow = level.pct,
    valNow = level.value,
    prev = host._thPrev;
  host._thPrev = { pct: pctNow, value: valNow };
  if (!animate || !prev || valNow == null) return;
  var fill = host.querySelector(level.fill);
  if (fill && typeof prev.pct === 'number' && Math.abs(prev.pct - pctNow) > 0.05) {
    var epoch = host._ifEpoch;
    fill.style.transition = 'none';
    fill.style.width = prev.pct.toFixed(1) + '%';
    void fill.getBoundingClientRect();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (host._ifEpoch !== epoch) return;
        fill.style.transition = '';
        fill.style.width = pctNow.toFixed(1) + '%';
      });
    });
  }
  var value = host.querySelector(level.readout);
  if (value && typeof prev.value === 'number' && prev.value !== valNow && value.firstChild) {
    var mul = Math.pow(10, level.decimals),
      from = prev.value,
      t0 = Date.now(),
      node = value.firstChild;
    var tick = function () {
      var k = Math.min(1, (Date.now() - t0) / 500);
      k = 1 - (1 - k) * (1 - k);
      node.nodeValue = String(Math.round((from + (valNow - from) * k) * mul) / mul);
      if (k < 1) host._thTween = requestAnimationFrame(tick);
      else host._thTween = null;
    };
    host._thTween = requestAnimationFrame(tick);
  }
}
function tweenPanelBars(host, bars, animate) {
  if (
    !animate ||
    !bars.previous ||
    typeof host.querySelectorAll !== 'function' ||
    typeof requestAnimationFrame !== 'function'
  )
    return;
  var elements = host.querySelectorAll(bars.selector),
    tweens = [];
  bars.frames.forEach(function (frame, i) {
    var el = elements[i];
    if (!el) return;
    var width = bars.previous[frame.key],
      fresh = typeof width !== 'number';
    if (fresh) width = 0;
    if (!fresh && Math.abs(width - frame.width) < 0.001) return;
    el.style.transition = 'none';
    el.style.width = width.toFixed(3) + '%';
    if (fresh) el.style.opacity = '0';
    tweens.push({ el: el, width: frame.width, fresh: fresh });
  });
  if (!tweens.length) return;
  var epoch = host._ifEpoch;
  void tweens[0].el.getBoundingClientRect();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      if (host._ifEpoch !== epoch) return;
      tweens.forEach(function (tween) {
        tween.el.style.transition = '';
        tween.el.style.width = tween.width.toFixed(3) + '%';
        if (tween.fresh) tween.el.style.opacity = '1';
      });
    });
  });
}
/* Input is an absolute folded snapshot. Previous DOM values are presentation
   history only; they never participate in state folding or alternate paths. */
function renderPanelBody(host, panel, state, skin, states, stepIdx, animatePresentation) {
  var render = PanelViews.get(panel.type),
    animate = animatePresentation !== false && !RM;
  var result = render
    ? render(host, panel, state || {}, skin, states, stepIdx, animate)
    : {
        html: '<div class="punknown">unknown panel type: ' + esc(String(panel.type)) + '</div>',
      };
  if (!animate) settlePanelPresentation(host, result);
  if (host._lastHTML === result.html) return;
  if (animate) cancelPanelMotion(host);
  var patched = result.patch && result.patch();
  host._lastHTML = result.baseline != null ? result.baseline : result.html;
  if (!patched) host.innerHTML = result.html;
  if (result.mounted) result.mounted();
  if (animate && result.glide) {
    var subjects = panelGlideElements(host, result.glide),
      glideEpoch = host._ifEpoch;
    if (subjects.length) {
      for (var i = 0; i < subjects.length; i++) void subjects[i].getBoundingClientRect();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (host._ifEpoch !== glideEpoch) return;
          for (var j = 0; j < subjects.length; j++) subjects[j].style.transform = 'translate(0,0)';
        });
      });
    }
  }
  if (result.level) tweenPanelLevel(host, result.level, animate);
  if (animate && result.pulse && result.pulse.changed) {
    var pulse = host.querySelector(result.pulse.selector);
    if (pulse && pulse.classList) {
      pulse.classList.add('dv-chip-pulse');
      host._pulseTimer = setTimeout(function () {
        pulse.classList.remove('dv-chip-pulse');
        host._pulseTimer = null;
      }, 620);
    }
  }
  if (
    animate &&
    result.enterBars &&
    result.enterBars.entrants &&
    typeof host.querySelectorAll === 'function'
  ) {
    var rows = host.querySelectorAll(result.enterBars.rows);
    result.enterBars.entrants.forEach(function (enters, i) {
      if (!enters || !rows[i]) return;
      var bar = rows[i].querySelector(result.enterBars.bar);
      if (bar) bar.classList.add('dv-bar-enter');
    });
  }
  if (result.bars) tweenPanelBars(host, result.bars, animate);
}

/* log panels are the only widgets that GROW as steps append lines, so they
   always render at the BOTTOM of the panel column — nothing below them can
   be pushed around. Relative order within each group is preserved. */
function panelOrder(panels) {
  var fixed = [],
    growing = [];
  (panels || []).forEach(function (p) {
    var view = p && PanelViews.get(p.type);
    (view && view.options.growing ? growing : fixed).push(p);
  });
  return fixed.concat(growing);
}

function buildPanels(asideEl, d, skin, primaryHost, primaryId) {
  var folded = foldPanelStates(d);
  var traceNavigation = (d.steps || []).length && d.view !== 'ambient-only';
  var hosts = {};
  panelOrder(d.panels).forEach(function (p) {
    if (!p || !p.id) return;
    var card = document.createElement('div');
    card.className = 'pwidget pt-' + (PANEL_TYPES.indexOf(p.type) >= 0 ? p.type : 'unknown');
    /* spec index, not render order — log panels are reordered to the end */
    card.setAttribute('data-dv-panel', String((d.panels || []).indexOf(p)));
    if (p.title) {
      var t = document.createElement('div');
      t.className = 'ptitle';
      t.textContent = p.title;
      card.appendChild(t);
    }
    var body = document.createElement('div');
    body.className = 'pbody';
    card.appendChild(body);
    (primaryHost && p.id === (primaryId || d.primaryPanel) ? primaryHost : asideEl).appendChild(
      card
    );
    hosts[p.id] = { panel: p, body: body };
    /* Homemap ambient state precedes step zero; other widgets keep their
       established first-folded-step preview. */
    var view = PanelViews.get(p.type),
      options = view ? view.options : {};
    var home = options.ambientInitial;
    renderPanelBody(
      body,
      p,
      home ? p.initial : (folded[p.id] || [])[0],
      skin,
      options.historyRequiresSteps && !traceNavigation ? [] : folded[p.id] || [],
      home ? -1 : 0,
      false
    );
  });
  return {
    destroy: function () {
      Object.keys(hosts).forEach(function (id) {
        cancelPanelMotion(hosts[id].body);
      });
    },
    setDiagram: function (next) {
      folded = foldPanelStates(next);
      traceNavigation = (next.steps || []).length && next.view !== 'ambient-only';
    },
    setStep: function (i, animate, ambient) {
      Object.keys(hosts).forEach(function (pid) {
        var states = folded[pid] || [];
        var si = Math.min(i, states.length - 1);
        var panel = hosts[pid].panel;
        var view = PanelViews.get(panel.type),
          options = view ? view.options : {};
        var homeAmbient = ambient && options.ambientInitial;
        renderPanelBody(
          hosts[pid].body,
          panel,
          homeAmbient ? panel.initial : states[si],
          skin,
          options.historyRequiresSteps && !traceNavigation ? [] : states,
          homeAmbient ? -1 : si,
          animate
        );
      });
    },
  };
}

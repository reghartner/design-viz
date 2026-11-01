/* Side-by-side compare view (#848). Shared by the agent-update preview and the
   local Git Compare tool: no Workbench dependency.

   mountCompareView(host, {before, after, entries, skin, mode, ids, onSelect})
     mode          'focused' (default) or 'full'; Focused shows step and panel changes as each
                   side's step controls plus only the panels that differ (other changes show the
                   full panes); Full shows both full renders
     before/after  normalized pages to render (already topology-resolved), or null
     entries       compareDocuments() output (src/core/compare.js)
     ids           optional element ids for the pane scroll/view nodes
     onSelect      optional callback(entry, index, result) after each selection
     onRenderError optional callback({side, message}) when a pane cannot be rendered
   returns {select(i), next(), previous(), selected(), setMode(m), mode(), setSkin(name), destroy()}

   Selecting a change frames BOTH panes on it (one-way: the selection drives the
   panes; manual pan/zoom in one pane never moves the other). */
var COMPARE_KIND_LABEL = {document:'Document', section:'Section', node:'Node', edge:'Connection', panel:'Panel', step:'Step',
  path:'Path', layout:'Layout', view:'View', tab:'Tab', import:'Import', ledger:'Coverage ledger'};
/* Render and canvas owners created by compare views whose own destroy() has not
   run yet; reported by FlowviewCompare.liveOwners(). */
var compareViewLiveOwners = 0;
/* Rendered width a selected node is zoomed up to (never past 100%). */
var COMPARE_LEGIBLE_NODE_PX = 120;
/* The Before pane's other sections render this long after the first paint, in idle time. */
var COMPARE_BEFORE_DELAY_MS = 250, COMPARE_BEFORE_IDLE_MS = 1000;
function compareViewTrack(owner){
  if (!owner || typeof owner.destroy !== 'function') return owner;
  var destroy = owner.destroy, done = false;
  compareViewLiveOwners++;
  owner.destroy = function(){ if (!done){ done = true; compareViewLiveOwners--; } return destroy.apply(this, arguments); };
  return owner;
}
var COMPARE_KIND_ATTR = {node:'data-dv-node', edge:'data-dv-edge', panel:'data-dv-panel', step:'data-step-source'};
function compareViewAt(page, path){
  if (!page || path == null) return undefined;
  path = String(path).replace(/^resolved:/, '');
  if (path === '') return page;
  var v = page, re = /(?:^|\.)([A-Za-z_$][\w$]*)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/g, m;
  while ((m = re.exec(path)) && v != null) v = v[m[1] != null ? m[1] : m[2] != null ? Number(m[2]) : JSON.parse(m[3])];
  return v;
}
function compareViewLastIndex(path){ var m = /\[(\d+)\]$/.exec(path || ''); return m ? Number(m[1]) : null; }
function compareEntryName(entry, record){
  var k = entry.kind, key = entry.key ? (entry.key.after != null ? entry.key.after : entry.key.before) : null;
  if (k === 'document' || k === 'ledger') return '';
  if (k === 'node') return record && record.title ? String(record.title) : String(key);
  if (k === 'edge') return record && record.from != null ? String(record.from) + ' → ' + String(record.to) : String(key);
  if (k === 'step') return record && typeof record.id === 'string' && record.id ? record.id : 'step ' + (Number(key) + 1);
  if (k === 'section') return record && (record.heading || record.id) ? String(record.heading || record.id) : 'Section';
  if (k === 'import') return record && record.as != null ? String(record.as) : String(key);
  if (k === 'tab') return record && record.label ? String(record.label) : 'Tab ' + (Number(key) + 1);
  if (record && (record.name || record.label || record.title)) return String(record.name || record.label || record.title);
  return key == null ? '' : String(key);
}
/* "Status · Kind name · fields" with fields relative to the entry's record. */
function compareEntryLabel(entry, pages){
  var status = entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
  var record = entry.afterPath != null ? compareViewAt(pages.after, entry.afterPath) : compareViewAt(pages.before, entry.beforePath);
  if (entry.cause === 'provider'){
    var key = entry.key ? (entry.key.after != null ? entry.key.after : entry.key.before) : '';
    record = null;
    var name = 'Imported ' + (entry.kind === 'edge' ? 'connection ' : 'node ') + key;
    return [status, name, compareEntryFields(entry)].filter(Boolean).join(' · ');
  }
  var title = (COMPARE_KIND_LABEL[entry.kind] || entry.kind) + (compareEntryName(entry, record) ? ' ' + compareEntryName(entry, record) : '');
  return [status, title, compareEntryFields(entry)].filter(Boolean).join(' · ');
}
function compareEntryFields(entry){
  if (entry.kind === 'ledger') return '';
  var base = entry.afterPath != null ? entry.afterPath : entry.beforePath, out = [];
  (entry.fields || []).forEach(function(f){
    var p = f.afterPath != null ? f.afterPath : f.beforePath;
    if (p == null) return;
    var rel = p.replace(/^resolved:/, '');
    if (entry.cause !== 'provider' && base && rel.indexOf(base) === 0) rel = rel.slice(base.length).replace(/^\./, '');
    else if (entry.cause === 'provider') rel = rel.replace(/^.*?\.(nodes|edges)(\[[^\]]*\]|\.[A-Za-z_$][\w$]*)\.?/, '');
    if (rel && out.indexOf(rel) < 0) out.push(rel);
  });
  return out.join(', ');
}
/* Rail groups: one per section (keyed by side + section index, so two sections
   with the same heading stay separate), named by the section heading; entries
   stay in the engine's document order. */
/* A copy of a plain document holding only section `index`, or null when the
   document has tabs, page-level Views or a single section (those render in
   full at once). */
function comparePartialPage(page, index){
  if (!page || page.views) return null;
  var key = Array.isArray(page.blocks) ? 'blocks' : Array.isArray(page.sections) ? 'sections' : null, list = key && page[key];
  if (!list || list.length < 2 || !(index >= 0 && index < list.length)) return null;
  if (list.some(function(block){ return block && Array.isArray(block.tabs); })) return null;
  var copy = Object.assign({}, page); copy[key] = [list[index]]; return copy;
}
/* Section index on `side` for an entry, also when the engine recorded only the other side (an
   added or removed object): another entry that pairs the same section on both sides wins (an
   id-less section whose heading changed has a new reference), else a section with the same
   reference. Returns -1 when this side has no such section. */
function compareSectionOnSide(entries, pages, entry, side){
  var sec = entry.section || {}, other = side === 'before' ? 'after' : 'before';
  if (sec[side] != null) return sec[side];
  if (sec[other] == null) return -1;
  for (var i = 0; i < (entries || []).length; i++){
    var s = entries[i].section || {};
    if (s[other] === sec[other] && s[side] != null) return s[side];
  }
  var from = pages[other] ? sectionRecords(pages[other])[sec[other]] : null;
  return from && pages[side] ? sectionRecords(pages[side]).findIndex(function(r){ return r.reference === from.reference; }) : -1;
}
function compareEntryGroup(entry, pages, entries){
  var sec = entry.section || {};
  if (sec.after == null && sec.before == null){ var name = entry.kind === 'tab' || entry.kind === 'view' ? 'Tabs' : 'Document'; return {key:name, name:name}; }
  /* One group per paired section: key on the After section when the section exists there (a
     removed object's section is found through its pairing), else on the Before section. */
  var after = compareSectionOnSide(entries || [entry], pages, entry, 'after'), side = after >= 0 ? 'after' : 'before', index = after >= 0 ? after : sec.before;
  var rec = sectionRecords(pages[side])[index], s = rec && rec.section || {};
  return {key:side + ':' + index, name:String(s.heading || s.id || 'Section ' + (index + 1))};
}
function compareRailGroups(entries, pages){
  var groups = [], last = null;
  (entries || []).forEach(function(entry, index){
    var g = compareEntryGroup(entry, pages, entries);
    if (!last || last.key !== g.key){ last = {key:g.key, name:g.name, items:[]}; groups.push(last); }
    last.items.push(index);
  });
  return groups;
}
/* ---------- Focused mode text helpers (#848 PR 2) ---------- */
function compareChipValue(v){ return typeof v === 'string' ? v : String(v); }
function compareChipEntries(n){ return n + (n === 1 ? ' entry' : ' entries'); }
/* One label per changed top-level state field: after-state keys first, then removed keys. */
function compareValueChips(before, after){
  var a = comparePlain(before) ? before : {}, b = comparePlain(after) ? after : {}, out = [];
  var keys = Object.keys(b).concat(Object.keys(a).filter(function(k){ return !Object.prototype.hasOwnProperty.call(b, k); }));
  keys.forEach(function(k){
    var hasA = Object.prototype.hasOwnProperty.call(a, k), hasB = Object.prototype.hasOwnProperty.call(b, k), va = a[k], vb = b[k];
    if (hasA && hasB && compareSame(va, vb)) return;
    var objA = va !== null && typeof va === 'object', objB = vb !== null && typeof vb === 'object';
    if (Array.isArray(va) && Array.isArray(vb)){
      var d = vb.length - va.length;
      out.push(k + (d > 0 ? ' +' + compareChipEntries(d) : d < 0 ? ' −' + compareChipEntries(-d) : ' changed'));
    }
    else if (!hasA && !objB) out.push(k + ' → ' + compareChipValue(vb));
    else if (!hasB && !objA) out.push(k + ' ' + compareChipValue(va) + ' → (none)');
    else if (hasA && hasB && !objA && !objB) out.push(k + ' ' + compareChipValue(va) + ' → ' + compareChipValue(vb));
    else out.push(k + ' changed');
  });
  return out;
}
/* Word-level diff (longest common subsequence of whitespace-separated words) as runs. */
/* Largest middle stretch (words x words) compared word by word; longer changed stretches
   show as one removed run and one added run so a long caption cannot stall the preview. */
var COMPARE_WORD_DIFF_CELLS = 250000;
function compareWordDiff(before, after){
  var a = String(before || '').split(/\s+/).filter(Boolean), b = String(after || '').split(/\s+/).filter(Boolean);
  var runs = [];
  function push(op, word){ var last = runs[runs.length - 1]; if (last && last.op === op) last.text += ' ' + word; else runs.push({op:op, text:word}); }
  /* Common prefix and suffix first; only the changed middle is compared word by word. */
  var start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]){ endA--; endB--; }
  var i, j;
  for (i = 0; i < start; i++) push('same', a[i]);
  var ma = a.slice(start, endA), mb = b.slice(start, endB), n = ma.length, m = mb.length;
  if ((n + 1) * (m + 1) > COMPARE_WORD_DIFF_CELLS){
    ma.forEach(function(w){ push('del', w); }); mb.forEach(function(w){ push('ins', w); });
  } else {
    var L = [];
    for (i = 0; i <= n; i++) L.push(new Int32Array(m + 1));
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = ma[i] === mb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    i = 0; j = 0;
    while (i < n || j < m){
      if (i < n && j < m && ma[i] === mb[j]){ push('same', ma[i]); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] > L[i + 1][j])){ push('ins', mb[j]); j++; }
      else if (i < n){ push('del', ma[i]); i++; }
    }
  }
  for (i = endA; i < a.length; i++) push('same', a[i]);
  /* Within a changed stretch, list removed words before added words. */
  for (var k = 0; k + 1 < runs.length; k++) if (runs[k].op === 'ins' && runs[k + 1].op === 'del'){ var t = runs[k]; runs[k] = runs[k + 1]; runs[k + 1] = t; }
  return runs;
}
/* Step fields the Focused view shows (caption, panel state and visibility, story time); other step
   fields (the highlighted node or edge, tone) show only in the full diagram. */
var COMPARE_FOCUS_STEP_FIELD = /^(text|panels|patch|panelVisibility|time)(\.|\[|$)/;
function compareStepFieldNames(entry){
  var out = [];
  (entry.fields || []).forEach(function(f){
    /* Each field path is relative to the step record on its own side (a moved step has different
       Before and After paths). */
    var after = f.afterPath != null, base = after ? entry.afterPath : entry.beforePath;
    var p = String(after ? f.afterPath : f.beforePath || '').replace(/^resolved:/, ''), b = String(base || '').replace(/^resolved:/, '');
    var rel = b && p.indexOf(b) === 0 ? p.slice(b.length).replace(/^\./, '') : p;
    if (rel && out.indexOf(rel) < 0) out.push(rel);
  });
  return out;
}
function compareStepText(step){ return step && typeof step.text === 'string' ? step.text : ''; }
function compareCarriedText(title, from, to){
  return from === to ? title + ' differs at step ' + from + ' only' : title + ' differs from step ' + from + ' through step ' + to;
}
function mountCompareView(host, opts){
  opts = opts || {};
  var doc = host.ownerDocument || document, entries = opts.entries || [], pages = {before:opts.before || null, after:opts.after || null};
  var ids = opts.ids || {}, panes = {}, selected = -1, destroyed = false, skin = opts.skin, lastAfterView = null, renderErrors = [];
  var mode = opts.mode === 'full' ? 'full' : 'focused', focusCtx = null, displayOnlyCache = new Map(), ambientOnly = false;
  function el(tag, cls, text){ var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  host.replaceChildren();
  var root = el('div', 'compare-view'), rail = el('nav', 'compare-rail'), columns = el('div', 'compare-columns');
  var main = el('div', 'compare-main'), bar = el('div', 'compare-mode'), stage = el('div', 'compare-stage'), focus = el('section', 'compare-focus');
  var modeButtons = {focused:el('button', 'compare-mode-button', 'Focused'), full:el('button', 'compare-mode-button', 'Full diagram')};
  var modeNote = el('p', 'compare-mode-note', 'This change shows in the full diagram.');
  rail.setAttribute('aria-label', 'Changes');
  bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Compare mode');
  ['focused', 'full'].forEach(function(m){ var b = modeButtons[m]; b.type = 'button'; b.addEventListener('click', function(){ setMode(m); }); bar.appendChild(b); });
  bar.appendChild(modeNote); focus.setAttribute('aria-label', 'Focused comparison'); focus.hidden = true;
  stage.appendChild(columns); stage.appendChild(focus); main.appendChild(bar); main.appendChild(stage);
  root.appendChild(rail); root.appendChild(main); host.appendChild(root);
  /* Rail: groups in first-appearance order (entries are in document order). */
  var groups = compareRailGroups(entries, pages);
  var buttons = [];
  groups.forEach(function(g){
    var box = el('section', 'compare-rail-group'), list = el('ol', 'compare-rail-list');
    box.appendChild(el('h3', 'compare-rail-heading', g.name));
    g.items.forEach(function(index){
      var li = el('li'), b = el('button', 'compare-rail-item', compareEntryLabel(entries[index], pages));
      b.type = 'button'; b.setAttribute('data-change-index', String(index)); b.setAttribute('data-change-status', entries[index].status);
      b.addEventListener('click', function(){ select(index); });
      buttons[index] = b; li.appendChild(b); list.appendChild(li);
    });
    box.appendChild(list); rail.appendChild(box);
  });
  if (!entries.length) rail.appendChild(el('p', 'compare-rail-empty', 'No changes.'));
  /* Both panes draw mostly the same edges: share path measurements while mounting. */
  var geometry = new Map();
  withPathGeometryCache(geometry, function(){ ['before', 'after'].forEach(function(side){
    var pane = el('section', 'compare-pane'), head = el('header', 'compare-pane-head'), scroll = el('div', 'compare-pane-scroll'), view = el('div', 'compare-pane-view');
    pane.setAttribute('data-side', side);
    head.appendChild(el('h2', 'compare-pane-title', side === 'before' ? 'Before · current document' : 'After · agent proposal'));
    if (opts.titles && opts.titles[side]) head.querySelector('.compare-pane-title').textContent = opts.titles[side];
    if (ids[side]){ if (ids[side].scroll) scroll.id = ids[side].scroll; if (ids[side].view) view.id = ids[side].view; }
    scroll.tabIndex = 0; scroll.appendChild(view); pane.appendChild(head); pane.appendChild(scroll); columns.appendChild(pane);
    panes[side] = {pane:pane, scroll:scroll, view:view, ctl:null, canvas:null, page:pages[side]};
    if (!pages[side]){ view.appendChild(el('p', 'compare-pane-empty', side === 'before' ? 'Not in the current document.' : 'Not in the proposal.')); return; }
    var p = panes[side], first = side === 'before' && entries.length ? (entries[0].section || {}).before : null, partial = first != null ? comparePartialPage(pages.before, first) : null;
    if (partial){ p.partial = first; renderPane(p, partial); } else renderPane(p, pages[side]);
  }); });
  decorate();
  /* The Before pane opens with only the first change's section; the rest of
     the document replaces it right after the first paint (or at once when a
     change in another section is selected). */
  var win = doc.defaultView, completion = 0, completionIdle = 0;
  if (panes.before.partial != null){
    /* After the first paint, wait briefly, then use the browser's next idle time (at most 1 s later). */
    if (win && win.requestAnimationFrame) completion = win.requestAnimationFrame(function(){
      completion = win.setTimeout(function(){
        completion = 0;
        if (win.requestIdleCallback) completionIdle = win.requestIdleCallback(completeBefore, {timeout:COMPARE_BEFORE_IDLE_MS});
        else completeBefore();
      }, COMPARE_BEFORE_DELAY_MS);
    });
    else completeBefore();
  }
  function renderPane(p, page){
    try{
      p.ctl = compareViewTrack(renderPage(p.view, page, typeof skin === 'function' ? skin(page) : skin || page.skin, null, {autoplay:false}));
      if (typeof initViewerExploreCanvas === 'function') p.canvas = compareViewTrack(initViewerExploreCanvas(p.ctl, p.view, {container:p.scroll, initialContentsOpen:false,
        presentation:{panelsHiddenWhenGraphVisible:false, overlayScale:.5}, forceFit:true, refitOnResize:false, fitInsets:{left:24, right:24, top:20, bottom:24}}));
    }catch(ex){
      p.view.textContent = 'Could not render this side: ' + ex.message;
      var failure = {side:p.pane.getAttribute('data-side'), message:String(ex && ex.message || ex)};
      renderErrors.push(failure);
      if (typeof opts.onRenderError === 'function') opts.onRenderError(failure);
    }
  }
  function completeBefore(){
    var p = panes.before;
    cancelCompletion();
    if (destroyed || p.partial == null) return;
    try{ if (p.canvas) p.canvas.destroy(); }catch(ex){}
    try{ if (p.ctl) p.ctl.destroy(); }catch(ex){}
    p.canvas = p.ctl = null; p.partial = null; p.view.replaceChildren();
    withPathGeometryCache(geometry || new Map(), function(){ renderPane(p, pages.before); });
    geometry = null;
    decorate();
    if (selected >= 0) navigate('before', entries[selected], lastAfterView);
    /* Then the Focused step and path (a panel change or a step clicked before completion). */
    if (selected >= 0) syncPaneSteps();
    if (selected >= 0 && ambientOnly) ambientPanes(entries[selected]);
  }
  function cancelCompletion(){
    if (win){
      if (completion){ if (win.cancelAnimationFrame) win.cancelAnimationFrame(completion); if (win.clearTimeout) win.clearTimeout(completion); }
      if (completionIdle && win.cancelIdleCallback) win.cancelIdleCallback(completionIdle);
    }
    completion = completionIdle = 0;
  }
  /* Rendered record of a section index on one pane (a partial pane holds one section). */
  function recordFor(p, index){
    if (!p.ctl) return null;
    if (p.partial != null) return index === p.partial ? (p.ctl.sections || [])[0] || null : null;
    return (p.ctl.sections || []).find(function(r){ return r.number === index + 1; }) || null;
  }
  function decorate(){
    ['before', 'after'].forEach(function(side){
      var p = panes[side]; if (!p.ctl) return;
      Array.prototype.forEach.call(p.view.querySelectorAll('[data-agent-change]'), function(n){ n.removeAttribute('data-agent-change'); });
      entries.forEach(function(entry){
        var t = target(entry, side); if (!t || !t.attr) return;
        var rec = recordFor(p, t.section);
        if (!rec || !rec.sectionEl) return;
        Array.prototype.forEach.call(rec.sectionEl.querySelectorAll('[' + t.attr + ']'), function(n){
          if (n.getAttribute(t.attr) === String(t.key)) n.setAttribute('data-agent-change', entry.status);
        });
      });
    });
  }
  /* Rendered target of an entry on one side, or null when that side lacks it. */
  function target(entry, side){
    var path = side === 'before' ? entry.beforePath : entry.afterPath, sec = entry.section || {};
    /* Added or removed object: this side lacks it, so show its section here. The engine
       records only the side that holds the object; match the section by reference. */
    if (path == null){
      var index = compareSectionOnSide(entries, pages, entry, side);
      return index >= 0 ? {section:index, kind:'section', attr:null, key:null} : null;
    }
    if (sec[side] == null) return null;
    var t = {section:sec[side], kind:entry.kind, attr:COMPARE_KIND_ATTR[entry.kind], key:null};
    if (entry.cause === 'provider'){ t.attr = entry.kind === 'edge' ? 'data-dv-edge' : 'data-dv-node'; t.key = entry.key ? entry.key[side] : null; return t; }
    if (entry.kind === 'node') t.key = entry.key ? entry.key[side] : null;
    else if (entry.kind === 'step') t.key = entry.step ? entry.step[side] : compareViewLastIndex(path);
    else if (entry.kind === 'edge' || entry.kind === 'panel') t.key = compareViewLastIndex(path);
    else if (entry.kind === 'path' || entry.kind === 'layout' || entry.kind === 'view'){ var rec = compareViewAt(pages[side], path); t.id = rec && rec.id; }
    return t;
  }
  /* Center a changed object; in Explore, first zoom a changed node up to a
     legible size (narrow panes fit whole sections small). Runs now and again
     after the viewer's own deferred fit, unless the selection has moved on. */
  function frame(ctl, object, t){
    var token = selected;
    function apply(){
      if (destroyed || token !== selected || !object.isConnected) return;
      /* The Explore viewport that holds the object (a section's shown View can be another record). */
      var vp = null;
      (ctl.sections || []).forEach(function(r){ if (r.viewport && r.viewport.canvasZoom && r.sectionEl && r.sectionEl.contains(object) && r.viewport.isExplore()) vp = r.viewport; });
      if (t.attr === 'data-dv-node' && vp){
        var width = object.getBoundingClientRect().width, zoom = vp.canvasZoom();
        if (width > 0 && width < COMPARE_LEGIBLE_NODE_PX - 1 && zoom > 0) vp.canvasZoom(Math.min(1, zoom * COMPARE_LEGIBLE_NODE_PX / width));
      }
      if (object.scrollIntoView) object.scrollIntoView({block:'center', inline:'center'});
    }
    apply();
    var win = doc.defaultView;
    if (win && win.requestAnimationFrame) win.requestAnimationFrame(function(){ win.requestAnimationFrame(apply); });
  }
  function navigate(side, entry, viewId){
    var p = panes[side], t = target(entry, side);
    if (p.partial != null && (!t || t.section !== p.partial)) completeBefore();
    if (!p.ctl || !t) return {side:side, shown:false};
    var rec = recordFor(p, t.section), visible = true;
    if (!rec) return {side:side, shown:false};
    if (rec.tabBlock && p.ctl.tabBlocks && p.ctl.tabBlocks[rec.tabBlock - 1]) p.ctl.tabBlocks[rec.tabBlock - 1].select(rec.tab, false);
    if (p.ctl.details) p.ctl.details.close(true);
    if (t.kind === 'view' && p.ctl.views){ var owner = p.ctl.views.owner(rec); visible = !!(t.id && p.ctl.views.select(rec, t.id, undefined, true)); if (visible && owner && owner.selected) rec = owner.selected; }
    else if (p.ctl.views){
      /* One-way sync: open the View the After pane shows, when this side has it. */
      /* View ids can differ between documents (legacy section Views carry the section's place), so fall back to the layout. */
      visible = !!(viewId && (viewId.id && p.ctl.views.ensure(rec, viewId.id, true) || viewId.layout && p.ctl.views.ensure(rec, viewId.layout, true))) || p.ctl.views.ensure(rec, undefined, true);
    }
    if (!visible) return {side:side, shown:false, reason:'view'};
    if (t.kind === 'layout' && t.id && rec.presentation){ if (!(p.ctl.views && p.ctl.views.ensure(rec, t.id, true))) rec.presentation.setView(t.id); }
    if (t.kind === 'step' && rec.stepper && t.key != null) visible = rec.stepper.jumpSource(Number(t.key)) && visible;
    if (t.kind === 'path' && rec.stepper && t.id){
      var d = compareViewAt(pages[side], (entry[side + 'Path'] || '').replace(/\.paths\[\d+\]$/, '')), route = d && diagramPathList(d).find(function(x){ return x.id === t.id; });
      visible = !!(route && rec.stepper.jumpSource(route.indices[0], route.id)) && visible;
    }
    p.ctl.activeTarget = {kind:'diagram', section:rec.number}; if (p.ctl.onChange) p.ctl.onChange();
    var object = null, bestArea = 0;
    /* The largest rendered match: the board copy, not a thumbnail or overview copy. */
    if (t.attr && t.key != null) Array.prototype.forEach.call(rec.sectionEl.querySelectorAll('[' + t.attr + ']'), function(n){
      if (n.getAttribute(t.attr) !== String(t.key) || !n.getClientRects().length) return;
      var r = n.getBoundingClientRect(), area = r.width * r.height;
      if (!object || area > bestArea){ object = n; bestArea = area; }
    });
    if (object) frame(p.ctl, object, t);
    else if (rec.sectionEl && rec.sectionEl.scrollIntoView && (!rec.viewport || !rec.viewport.isExplore())) rec.sectionEl.scrollIntoView({block:'start'});
    var shownView = p.ctl.views && p.ctl.views.current ? p.ctl.views.current(rec) : null;
    var shownLayout = shownView && (shownView.legacyLayout || shownView.members && shownView.members[0] && shownView.members[0].layout);
    return {side:side, shown:true, object:!!object, visible:visible, view:shownView ? {id:shownView.id, layout:shownLayout || null} : null};
  }
  /* ---------- Focused mode (#848 PR 2) ----------
     Step and panel changes show each side's step controls at the change's step, a caption word
     diff, and only the panels whose folded state differs there. Other changes show the full
     panes (node and edge cropping is PR 3). The panes stay rendered and navigated underneath,
     so switching to Full diagram is immediate. */
  function sideSkin(side){
    var name = typeof skin === 'function' ? skin(pages[side]) : skin || pages[side] && pages[side].skin;
    return SKIN_NAMES.indexOf(name) >= 0 ? name : DEFAULT_SKIN;
  }
  function focusSide(entry, side, pathId, src){
    var index = compareSectionOnSide(entries, pages, entry, side), rec = index >= 0 && pages[side] ? sectionRecords(pages[side])[index] : null;
    var d = rec && rec.section && rec.section.diagram;
    if (!d) return null;
    /* A side without steps (the first step added, the only step removed) has no step controls. */
    var steps = Array.isArray(d.steps) ? d.steps : [], paths = steps.length ? diagramPathList(d) : [];
    /* The change's path; for an edited step, a path that contains that step (a caption edit on an
       alternate path has no reader effect to name the path). */
    var path = paths.find(function(x){ return x.id === pathId && (src == null || x.indices.indexOf(src) >= 0); }) ||
      (src != null ? paths.find(function(x){ return x.indices.indexOf(src) >= 0; }) : null) ||
      paths.find(function(x){ return x.id === pathId; }) || paths[0];
    var fold = path ? compareFoldsFor(d, path.id) : null;
    return {side:side, section:index, d:d, steps:steps, pathId:path ? path.id : null, fold:fold, indices:fold ? fold.indices : [], pos:-1, skin:sideSkin(side)};
  }
  /* force: {before, after, pathBefore, pathAfter} opens the given source steps on paths that hold
     them (a step click whose paired step is on another path). */
  function buildFocus(entry, force){
    if (entry.kind !== 'step' && entry.kind !== 'panel') return null;
    /* A modified step whose edits are all diagram-only (highlighted node or edge) shows in the full diagram. */
    var stepFields = entry.kind === 'step' && entry.status === 'modified' ? compareStepFieldNames(entry) : [];
    if (stepFields.length && !stepFields.some(function(f){ return COMPARE_FOCUS_STEP_FIELD.test(f); })) return null;
    /* A panel change that affects no numbered step (only the Ambient view before step 1) shows in
       the full diagram, which keeps its Ambient state. */
    if (entry.kind === 'panel' && entry.status === 'modified' && !force){
      var numeric = function(v){ return typeof v === 'number'; };
      var stepped = (entry.effects || []).some(function(e){ return (e.changes || []).some(function(c){ return numeric(c.afterStep) || numeric(c.beforeStep); }); }) ||
        (entry.scopeAfter || []).some(numeric) || (entry.scopeBefore || []).some(numeric);
      if (!stepped){ ambientOnly = true; return null; }
    }
    /* The path of the first effect that changes a numbered step (an earlier path may differ only in Ambient). */
    var isNum = function(v){ return typeof v === 'number'; };
    var effect = (entry.effects || []).find(function(e){ return (e.changes || []).some(function(c){ return isNum(c.afterStep) || isNum(c.beforeStep); }); }) || (entry.effects || [])[0],
        pathId = effect ? effect.pathId : null;
    /* The step to open: the edited step; for a panel settings change, the first step where the
       panel is visible (the engine's scope), so it does not open where the panel is hidden. */
    var firstStep = function(list){ return (list || []).find(function(v){ return typeof v === 'number'; }); };
    var st = entry.kind === 'step' && entry.step ? entry.step :
      entry.effect === 'declaration' ? (firstStep(entry.scopeAfter) != null ? {before:null, after:firstStep(entry.scopeAfter)} : {before:firstStep(entry.scopeBefore), after:null}) : {};
    /* A settings change: pair the steps first (pairing does not depend on the path) and open on
       the first visible step of its scope that has a pair, so the path chosen below holds a step
       that exists on both sides. */
    if (force) st = {before:force.before, after:force.after};
    if (entry.effect === 'declaration' && !force){
      var section = function(side){ var i = compareSectionOnSide(entries, pages, entry, side), r = i >= 0 && pages[side] ? sectionRecords(pages[side])[i] : null; return r && r.section && r.section.diagram; };
      var dA = section('before'), dB = section('after');
      if (dA && dB){
        var b2a = new Map();
        comparePairs(Array.isArray(dA.steps) ? dA.steps : [], Array.isArray(dB.steps) ? dB.steps : [], [COMPARE_CAPTION_KEY], true).pairs.forEach(function(p){ b2a.set(p[1], p[0]); });
        var vB = (entry.scopeAfter || []).find(function(v){ return typeof v === 'number' && b2a.has(v); });
        if (vB != null) st = {before:b2a.get(vB), after:vB};
      }
    }
    /* The side that holds the step picks the path; the other side follows it. */
    var A, B;
    if (force){ A = focusSide(entry, 'before', force.pathBefore, st.before); B = focusSide(entry, 'after', force.pathAfter, st.after); }
    else if (st.after == null && st.before != null){ A = focusSide(entry, 'before', pathId, st.before); B = focusSide(entry, 'after', A && A.pathId || pathId, st.after); }
    else { B = focusSide(entry, 'after', pathId, st.after); A = focusSide(entry, 'before', B && B.pathId || pathId, st.before); }
    if (!A || !B || !A.indices.length && !B.indices.length) return null;
    var aToB = new Map(), bToA = new Map();
    comparePairs(A.steps, B.steps, [COMPARE_CAPTION_KEY], true).pairs.forEach(function(p){ aToB.set(p[0], p[1]); bToA.set(p[1], p[0]); });
    var ctx = {entry:entry, before:A, after:B, aToB:aToB, bToA:bToA,
      diagramOnly:stepFields.filter(function(f){ return !COMPARE_FOCUS_STEP_FIELD.test(f); })};
    var panelIds = [];
    [B, A].forEach(function(S){ (S.d.panels || []).forEach(function(p){ if (p && p.id && panelIds.indexOf(p.id) < 0) panelIds.push(p.id); }); });
    var nodeIds = Array.from(new Set(Object.keys(A.d.nodes || {}).concat(Object.keys(B.d.nodes || {}))));
    ctx.panelIds = panelIds;
    /* Per-panel declaration difference and per-node tone arrays, computed once. */
    var tonesA = {}, tonesB = {};
    if (A.fold && B.fold) nodeIds.forEach(function(id){ tonesA[id] = A.fold.tone(id); tonesB[id] = B.fold.tone(id); });
    var posA = new Map(); A.indices.forEach(function(src, j){ posA.set(src, j); });
    ctx.posA = posA; ctx.posB = new Map(); B.indices.forEach(function(src, k){ ctx.posB.set(src, k); });
    /* A changed panel setting is display-only when applying it alone to the Before section leaves
       the panel's folded state unchanged (a title, a unit); it then differs at every step where the
       panel is visible. Settings the type's fold reads (a battery's drain rate) show through the
       folded state, which is compared per step. */
    ctx.declDiffers = {};
    panelIds.forEach(function(id){
      var pa = A.fold && A.fold.panels[id], pb = B.fold && B.fold.panels[id];
      ctx.declDiffers[id] = false;
      if (!pa || !pb) return;
      var keys = Object.keys(pa).concat(Object.keys(pb)).filter(function(k, i, all){
        return all.indexOf(k) === i && k !== 'initial' && k !== 'visible' && !compareSame(pa[k], pb[k]);
      });
      if (!keys.length) return;
      /* Computed once per section pair, path and panel while the view is mounted; each trial folds
         only this panel (a panel's fold reads its own declaration and the diagram, not other panels). */
      var cacheKey = JSON.stringify([A.section, B.section, A.pathId, id]);
      if (displayOnlyCache.has(cacheKey)){ ctx.declDiffers[id] = displayOnlyCache.get(cacheKey); return; }
      var own = (A.d.panels || []).find(function(p){ return p && p.id === id; }) || pa;
      var foldOne = function(decl){ return compareFoldsFor(Object.assign({}, A.d, {panels:[decl]}), A.pathId).state(id) || []; };
      var base = foldOne(own);
      var result = keys.some(function(k){
        var q = Object.assign({}, own);
        if (Object.prototype.hasOwnProperty.call(pb, k)) q[k] = pb[k]; else delete q[k];
        var trial = foldOne(q);
        return trial.length === base.length && base.every(function(v, i){ return v === trial[i] || compareSame(v, trial[i]); });
      });
      displayOnlyCache.set(cacheKey, result);
      ctx.declDiffers[id] = result;
    });
    /* Panels that differ at each After position (null = the step has no pair in Before). */
    ctx.diffAt = B.indices.map(function(src, k){
      var srcA = bToA.has(src) ? bToA.get(src) : null, j = srcA == null || !posA.has(srcA) ? -1 : posA.get(srcA);
      if (j < 0) return null;
      var out = panelIds.filter(function(id){ return panelDiffers(ctx, id, j, k); });
      out.tone = nodeIds.some(function(id){ var x = tonesA[id][j], y = tonesB[id][k]; return x !== y && !compareSame(x, y); });
      return out;
    });
    /* Starting step: the edited step, else the first step the change affects, else the first step. */
    var srcA = null, srcB = null;
    if (st.before != null || st.after != null){ srcA = st.before == null ? null : st.before; srcB = st.after == null ? null : st.after; }
    else {
      /* The first affected step present on both sides, else the first affected step on either side. */
      var changes = [];
      (entry.effects || []).forEach(function(e){ if (e.pathId === B.pathId || e.pathId === A.pathId) changes.push.apply(changes, e.changes || []); });
      var both = changes.find(function(c){ return typeof c.afterStep === 'number' && typeof c.beforeStep === 'number'; }),
          one = changes.find(function(c){ return typeof c.afterStep === 'number' || typeof c.beforeStep === 'number'; }), pick = both || one;
      if (pick){ if (typeof pick.afterStep === 'number') srcB = pick.afterStep; else srcA = pick.beforeStep; }
    }
    /* A settings change opens on the first step of its scope that exists on both sides. */
    if (entry.effect === 'declaration' && !force){
      var pairedB = (entry.scopeAfter || []).find(function(v){ return typeof v === 'number' && ctx.posB.has(v) && bToA.has(v) && posA.has(bToA.get(v)); }),
          pairedA = (entry.scopeBefore || []).find(function(v){ return typeof v === 'number' && posA.has(v) && aToB.has(v) && ctx.posB.has(aToB.get(v)); });
      if (pairedB != null){ srcB = pairedB; srcA = null; }
      else if (pairedA != null){ srcA = pairedA; srcB = null; }
    }
    if (srcA == null && srcB == null) srcB = B.indices[0];
    if (srcA == null && srcB != null && bToA.has(srcB) && entry.kind !== 'step') srcA = bToA.get(srcB);
    if (srcB == null && srcA != null && aToB.has(srcA) && entry.kind !== 'step') srcB = aToB.get(srcA);
    A.pos = srcA == null ? -1 : A.indices.indexOf(srcA); B.pos = srcB == null ? -1 : B.indices.indexOf(srcB);
    if (A.pos < 0 && B.pos < 0){ if (B.indices.length) B.pos = 0; else A.pos = 0; }
    return ctx;
  }
  function panelCell(S, id, pos){
    if (!S.fold || pos < 0) return {missing:'step'};
    var p = S.fold.panels[id];
    if (!p) return {missing:'panel'};
    var states = S.fold.state(id) || [], visibility = S.fold.visibility(id) || [];
    return {panel:p, state:states[pos], states:states, pos:pos, visible:visibility[pos] !== false};
  }
  function panelDiffers(ctx, id, posA, posB){
    var a = panelCell(ctx.before, id, posA), b = panelCell(ctx.after, id, posB);
    if (!a.panel || !b.panel) return !!a.panel !== !!b.panel;
    /* `initial` and `visible` reach the reader through the folded state and visibility compared
       above; other declaration fields (title, unit, ...) show at every step. */
    /* A settings difference shows only where the panel is visible (the engine's scope for it). */
    return a.visible !== b.visible || ctx.declDiffers[id] && (a.visible || b.visible) || a.state !== b.state && !compareSame(a.state, b.state);
  }
  /* Move both sides to position `pos` of `side`'s path; the other side follows the step pairing. */
  function focusStep(side, pos){
    var ctx = focusCtx; if (!ctx || destroyed) return;
    var S = ctx[side], O = ctx[side === 'before' ? 'after' : 'before'], map = side === 'before' ? ctx.aToB : ctx.bToA;
    var src = S.indices[pos], other = map.has(src) ? map.get(src) : null;
    if (other != null && O.indices.indexOf(other) < 0){
      /* The paired step is on another path of the other side: rebuild both sides on paths that hold
         the pair (this side keeps its path). */
      var f = side === 'before' ? {before:src, after:other, pathBefore:S.pathId, pathAfter:O.pathId} : {before:other, after:src, pathBefore:O.pathId, pathAfter:S.pathId};
      var next = null;
      try{ next = buildFocus(ctx.entry, f); }catch(ex){ next = null; }
      if (next){ focusCtx = next; syncPaneSteps(); renderFocus(); return; }
    }
    S.pos = pos; O.pos = other == null ? -1 : O.indices.indexOf(other);
    syncPaneSteps();
    renderFocus();
  }
  /* Keep the full panes under the Focused view on the Focused step and path, so switching to
     Full diagram shows the same step (a side without the step keeps its pane where it is). */
  /* A panel change seen only in Ambient mode: put both full panes in Ambient mode on its section. */
  function ambientPanes(entry){
    ['before', 'after'].forEach(function(side){
      var p = panes[side], index = compareSectionOnSide(entries, pages, entry, side);
      if (!p || index < 0) return;
      if (p.partial != null && p.partial !== index) completeBefore();
      if (!p.ctl) return;
      var rec = recordFor(p, index);
      if (rec && rec.stepper && rec.stepper.enterAmbient) try{ rec.stepper.enterAmbient(); }catch(ex){}
    });
  }
  function syncPaneSteps(){
    var ctx = focusCtx; if (!ctx || destroyed) return;
    ['before', 'after'].forEach(function(side){
      var S = ctx[side], p = panes[side];
      if (!S || S.pos < 0 || !p) return;
      if (p.partial != null && p.partial !== S.section) completeBefore();
      if (!p.ctl) return;
      var rec = recordFor(p, S.section);
      if (rec && rec.stepper && rec.stepper.jumpSource) try{ rec.stepper.jumpSource(S.indices[S.pos], S.pathId); }catch(ex){}
    });
  }
  function stepMarks(ctx, S){
    var edited = new Set();
    entries.forEach(function(e){
      if (e.kind !== 'step' || !e.step || e.step[S.side] == null) return;
      if (compareSectionOnSide(entries, pages, e, S.side) === S.section) edited.add(e.step[S.side]);
    });
    return S.indices.map(function(src, k){
      if (edited.has(src)) return 'edited';
      var kb = S.side === 'after' ? k : ctx.aToB.has(src) && ctx.posB.has(ctx.aToB.get(src)) ? ctx.posB.get(ctx.aToB.get(src)) : -1;
      var d = kb >= 0 ? ctx.diffAt[kb] : null;
      return d && (d.length || d.tone) ? 'carried' : '';
    });
  }
  function cleanFocus(){
    Array.prototype.forEach.call(focus.querySelectorAll('.pbody'), function(body){ try{ if (typeof cancelPanelMotion === 'function') cancelPanelMotion(body); }catch(ex){} });
    focus.replaceChildren();
  }
  function addSkin(node, name){ if (typeof skinClasses === 'function') skinClasses(name).forEach(function(c){ node.classList.add(c); }); }
  function renderFocus(){
    cleanFocus();
    var ctx = focusCtx; if (!ctx) return;
    var head = el('div', 'compare-focus-head');
    ['before', 'after'].forEach(function(side){
      var S = ctx[side], box = el('div', 'compare-focus-side'), strip = el('div', 'compare-focus-steps'), marks = stepMarks(ctx, S);
      box.setAttribute('data-side', side); addSkin(box, S.skin);
      box.appendChild(el('h3', 'compare-focus-title', side === 'before' ? 'Before · current document' : 'After · agent proposal'));
      strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', (side === 'before' ? 'Before' : 'After') + ' steps');
      S.indices.forEach(function(src, k){
        var b = el('button', 'compare-focus-step', String(k + 1));
        b.type = 'button';
        if (k === S.pos) b.setAttribute('aria-current', 'true');
        if (marks[k]) b.setAttribute('data-step-mark', marks[k]);
        b.addEventListener('click', function(){ focusStep(side, k); });
        strip.appendChild(b);
      });
      box.appendChild(strip);
      if (S.pos < 0) box.appendChild(el('p', 'compare-focus-missing', side === 'before' ? 'Step not in the current document' : 'Step not in the proposal'));
      else box.appendChild(el('p', 'compare-focus-caption', compareStepText(S.fold.d.steps[S.pos])));
      if (!S.indices.length) strip.hidden = true;
      head.appendChild(box);
    });
    focus.appendChild(head);
    if (ctx.diagramOnly && ctx.diagramOnly.length)
      focus.appendChild(el('p', 'compare-focus-other', 'Also changed in the diagram: ' + ctx.diagramOnly.join(', ') + '. Use Full diagram to see it.'));
    var A = ctx.before, B = ctx.after;
    if (A.pos >= 0 && B.pos >= 0){
      var ta = compareStepText(A.fold.d.steps[A.pos]), tb = compareStepText(B.fold.d.steps[B.pos]);
      if (ta !== tb){
        var diff = el('p', 'compare-word-diff');
        compareWordDiff(ta, tb).forEach(function(run, i){
          if (i) diff.appendChild(doc.createTextNode(' '));
          diff.appendChild(run.op === 'same' ? doc.createTextNode(run.text) : el(run.op, null, run.text));
        });
        focus.appendChild(diff);
      }
    }
    if (A.pos < 0 || B.pos < 0){
      focus.appendChild(el('p', 'compare-focus-empty', 'No panel comparison: this step is only in ' + (A.pos < 0 ? 'the proposal.' : 'the current document.')));
      return;
    }
    var changed = ctx.diffAt[B.pos] || [];
    if (!changed.length){ focus.appendChild(el('p', 'compare-focus-empty', 'No panel differences at step ' + (B.pos + 1) + '.')); return; }
    changed.forEach(function(id){
      var row = el('div', 'compare-focus-row'), a = panelCell(A, id, A.pos), b = panelCell(B, id, B.pos), mid = el('div', 'compare-focus-change');
      row.setAttribute('data-panel-id', id);
      row.appendChild(focusCell(A, a, 'before'));
      var chips = !a.panel ? ['panel added'] : !b.panel ? ['panel removed'] :
        a.visible !== b.visible ? [(a.visible ? 'shown' : 'hidden') + ' → ' + (b.visible ? 'shown' : 'hidden')].concat(compareValueChips(a.state, b.state)) :
        compareValueChips(a.state, b.state);
      if (!chips.length) chips = ['panel settings changed'];
      var list = el('ul', 'compare-focus-chips');
      chips.forEach(function(text){ var li = el('li'); li.appendChild(el('span', 'compare-focus-chip', text)); list.appendChild(li); });
      mid.appendChild(list);
      /* The run of After steps around this one where the panel differs. */
      var from = B.pos, to = B.pos;
      while (from > 0 && ctx.diffAt[from - 1] && ctx.diffAt[from - 1].indexOf(id) >= 0) from--;
      while (to + 1 < ctx.diffAt.length && ctx.diffAt[to + 1] && ctx.diffAt[to + 1].indexOf(id) >= 0) to++;
      var decl = b.panel || a.panel;
      mid.appendChild(el('p', 'compare-focus-note', compareCarriedText(String(decl.title || decl.id), from + 1, to + 1)));
      row.appendChild(mid);
      row.appendChild(focusCell(B, b, 'after'));
      focus.appendChild(row);
    });
  }
  function focusCell(S, c, side){
    var cell = el('div', 'compare-focus-cell');
    cell.setAttribute('data-side', side); addSkin(cell, S.skin);
    if (!c.panel){ cell.appendChild(el('p', 'compare-focus-missing', side === 'before' ? 'Not in the current document' : 'Not in the proposal')); return cell; }
    if (!c.visible){ cell.appendChild(el('p', 'compare-focus-missing', 'Hidden at this step')); return cell; }
    var p = c.panel, card = el('div', 'pwidget pt-' + (PANEL_TYPES.indexOf(p.type) >= 0 ? p.type : 'unknown'));
    if (p.title) card.appendChild(el('div', 'ptitle', String(p.title)));
    var body = el('div', 'pbody'); card.appendChild(body); cell.appendChild(card);
    try{
      var decl = typeof FlowBrand !== 'undefined' ? Object.assign({}, p, {brand:FlowBrand.effective(S.d.brand, p.brand)}) : p;
      renderPanelBody(body, decl, c.state, S.skin, c.states, c.pos, false);
    }catch(ex){ body.textContent = 'Could not render this panel: ' + ex.message; }
    return cell;
  }
  function applyMode(){
    var entry = entries[selected], focused = mode === 'focused' && !!focusCtx;
    focus.hidden = !focused;
    columns.style.visibility = focused ? 'hidden' : '';
    modeNote.hidden = !(mode === 'focused' && entry && !focusCtx);
    modeButtons.focused.setAttribute('aria-pressed', String(mode === 'focused'));
    modeButtons.full.setAttribute('aria-pressed', String(mode === 'full'));
  }
  function setMode(m){
    if (destroyed || (m !== 'focused' && m !== 'full')) return mode;
    mode = m; applyMode(); return mode;
  }
  function select(index, initial){
    if (destroyed || !entries.length) return null;
    selected = ((index % entries.length) + entries.length) % entries.length;
    buttons.forEach(function(b, i){ if (b) b.setAttribute('aria-current', String(i === selected)); });
    if (buttons[selected] && buttons[selected].scrollIntoView) buttons[selected].scrollIntoView({block:'nearest'});
    var entry = entries[selected], after = navigate('after', entry), before = navigate('before', entry, lastAfterView = after.view);
    var result = {before:before, after:after, label:compareEntryLabel(entry, pages), initial:!!initial};
    decorate();
    ambientOnly = false;
    try{ focusCtx = buildFocus(entry); }catch(ex){ focusCtx = null; }
    syncPaneSteps();
    if (ambientOnly) ambientPanes(entry);
    renderFocus(); applyMode();
    result.focused = mode === 'focused' && !!focusCtx;
    if (opts.onSelect) opts.onSelect(entry, selected, result);
    return result;
  }
  function onKey(event){
    if (destroyed || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    var t = event.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t && t.isContentEditable) return;
    if (event.key === 'j' || event.key === 'J'){ event.preventDefault(); select(selected + 1); }
    else if (event.key === 'k' || event.key === 'K'){ event.preventDefault(); select(selected - 1); }
  }
  doc.addEventListener('keydown', onKey);
  applyMode();
  if (entries.length) withPathGeometryCache(geometry || new Map(), function(){ select(0, true); });
  if (panes.before.partial == null) geometry = null;
  return {
    select:select,
    next:function(){ return select(selected + 1); },
    previous:function(){ return select(selected - 1); },
    selected:function(){ return selected; },
    count:function(){ return entries.length; },
    setMode:setMode,
    mode:function(){ return mode; },
    label:function(i){ return entries[i] ? compareEntryLabel(entries[i], pages) : ''; },
    views:function(){ return {before:panes.before.view, after:panes.after.view}; },
    /* Sides that could not be rendered: [{side, message}]. */
    errors:function(){ return renderErrors.slice(); },
    /* Render anything still pending (the rest of the Before document) now; returns errors(). */
    finish:function(){ completeBefore(); return renderErrors.slice(); },
    setSkin:function(name){
      skin = name; var ok = false;
      ['before', 'after'].forEach(function(side){ if (panes[side].ctl && typeof applySkinClasses === 'function') ok = applySkinClasses(doc.body, panes[side].view, name) || ok; });
      /* The Focused view draws its panels with the side's skin: redraw them with the new one. */
      if (focusCtx && !destroyed){ focusCtx.before.skin = sideSkin('before'); focusCtx.after.skin = sideSkin('after'); renderFocus(); }
      return ok;
    },
    destroy:function(){
      if (destroyed) return; destroyed = true;
      cancelCompletion();
      cleanFocus();
      doc.removeEventListener('keydown', onKey);
      ['before', 'after'].forEach(function(side){
        var p = panes[side]; if (!p) return;
        try{ if (p.canvas) p.canvas.destroy(); }catch(ex){}
        try{ if (p.ctl) p.ctl.destroy(); }catch(ex){}
      });
      host.replaceChildren();
    }
  };
}

/* Public page entry point: the viewer and Workbench bundles keep their
   functions private, so pages that host a compare view (the local Git Compare
   tool, #849) reach it here. */
if (typeof window !== 'undefined') window.FlowviewCompare = {
  version:1,
  normalize:function(raw){ return normalize(raw); },
  compare:function(before, after){ return compareDocuments(before, after); },
  mount:function(host, opts){ return mountCompareView(host, opts); },
  resolve:typeof FlowTopology !== 'undefined' ? function(raw, context){ return FlowTopology.resolveSource(raw, context); } : null,
  liveOwners:function(){ return compareViewLiveOwners; }
};

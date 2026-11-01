/* Side-by-side compare view (#848). Shared by the agent-update preview and the
   local Git Compare tool: no Workbench dependency.

   mountCompareView(host, {before, after, entries, skin, mode, ids, onSelect})
     before/after  normalized pages to render (already topology-resolved), or null
     entries       compareDocuments() output (src/core/compare.js)
     ids           optional element ids for the pane scroll/view nodes
     onSelect      optional callback(entry, index, result) after each selection
     onRenderError optional callback({side, message}) when a pane cannot be rendered
   returns {select(i), next(), previous(), selected(), setSkin(name), destroy()}

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
function compareEntryGroup(entry, pages){
  var sec = entry.section || {}, side = sec.after != null ? 'after' : sec.before != null ? 'before' : null;
  if (side == null){ var name = entry.kind === 'tab' || entry.kind === 'view' ? 'Tabs' : 'Document'; return {key:name, name:name}; }
  var rec = sectionRecords(pages[side])[sec[side]], s = rec && rec.section || {};
  return {key:side + ':' + sec[side], name:String(s.heading || s.id || 'Section ' + (sec[side] + 1))};
}
function compareRailGroups(entries, pages){
  var groups = [], last = null;
  (entries || []).forEach(function(entry, index){
    var g = compareEntryGroup(entry, pages);
    if (!last || last.key !== g.key){ last = {key:g.key, name:g.name, items:[]}; groups.push(last); }
    last.items.push(index);
  });
  return groups;
}
function mountCompareView(host, opts){
  opts = opts || {};
  var doc = host.ownerDocument || document, entries = opts.entries || [], pages = {before:opts.before || null, after:opts.after || null};
  var ids = opts.ids || {}, panes = {}, selected = -1, destroyed = false, skin = opts.skin, lastAfterView = null, renderErrors = [];
  function el(tag, cls, text){ var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  host.replaceChildren();
  var root = el('div', 'compare-view'), rail = el('nav', 'compare-rail'), columns = el('div', 'compare-columns');
  rail.setAttribute('aria-label', 'Changes');
  root.appendChild(rail); root.appendChild(columns); host.appendChild(root);
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
      var index = sec[side];
      if (index == null){
        var other = side === 'before' ? 'after' : 'before', from = pages[other] && sec[other] != null ? sectionRecords(pages[other])[sec[other]] : null;
        index = from && pages[side] ? sectionRecords(pages[side]).findIndex(function(r){ return r.reference === from.reference; }) : -1;
      }
      return index != null && index >= 0 ? {section:index, kind:'section', attr:null, key:null} : null;
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
  function select(index, initial){
    if (destroyed || !entries.length) return null;
    selected = ((index % entries.length) + entries.length) % entries.length;
    buttons.forEach(function(b, i){ if (b) b.setAttribute('aria-current', String(i === selected)); });
    if (buttons[selected] && buttons[selected].scrollIntoView) buttons[selected].scrollIntoView({block:'nearest'});
    var entry = entries[selected], after = navigate('after', entry), before = navigate('before', entry, lastAfterView = after.view);
    var result = {before:before, after:after, label:compareEntryLabel(entry, pages), initial:!!initial};
    decorate();
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
  if (entries.length) withPathGeometryCache(geometry || new Map(), function(){ select(0, true); });
  if (panes.before.partial == null) geometry = null;
  return {
    select:select,
    next:function(){ return select(selected + 1); },
    previous:function(){ return select(selected - 1); },
    selected:function(){ return selected; },
    count:function(){ return entries.length; },
    label:function(i){ return entries[i] ? compareEntryLabel(entries[i], pages) : ''; },
    views:function(){ return {before:panes.before.view, after:panes.after.view}; },
    /* Sides that could not be rendered: [{side, message}]. */
    errors:function(){ return renderErrors.slice(); },
    setSkin:function(name){ skin = name; var ok = false; ['before', 'after'].forEach(function(side){ if (panes[side].ctl && typeof applySkinClasses === 'function') ok = applySkinClasses(doc.body, panes[side].view, name) || ok; }); return ok; },
    destroy:function(){
      if (destroyed) return; destroyed = true;
      cancelCompletion();
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

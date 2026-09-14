/* Preview position and layout never enter the spec or undo history. */
function workbenchPreviewSections(page){
  var sections = [];
  if (!page) return sections;
  function add(sec, tab){
    var d = sec.diagram || {};
    sections.push({diagram:d, key:JSON.stringify([tab, sec.heading || '',
      Object.keys(d.nodes || {}).sort(), VIEW_SET.indexOf(d.view) >= 0 ? d.view : 'ambient'])});
  }
  blocksOf(page).forEach(function(block){
    if (block.type === 'section') add(block.sec, null);
    else block.tabs.forEach(function(tab){ tab.sections.forEach(function(sec){ add(sec, tab.label); }); });
  });
  return sections;
}
function workbenchPreviewSnapshot(page, ctl){
  var sections = workbenchPreviewSections(page), saved = [];
  ((ctl && ctl.sections) || []).forEach(function(rec){
    var section = sections[rec.number - 1], stepper = rec.stepper;
    if (!section || !stepper || sections.filter(function(s){ return s.key === section.key; }).length !== 1) return;
    var steps = section.diagram.steps || [], step = steps[stepper.current().n];
    var id = step && typeof step.id === 'string' && step.id ? step.id : null;
    var signature = JSON.stringify(step);
    /* No positional fallback: repeated identities must not restore a different beat. */
    if (stepper.mode() === 'step' && (id
      ? steps.filter(function(s){ return s && s.id === id; }).length !== 1
      : steps.filter(function(s){ return JSON.stringify(s) === signature; }).length !== 1)) return;
    saved.push({key:section.key, mode:stepper.mode(), id:id, signature:signature});
  });
  return {title:page && page.title || '', sections:saved};
}
function restoreWorkbenchPreview(page, ctl, saved){
  if (!saved || (page.title || '') !== saved.title) return;
  var sections = workbenchPreviewSections(page);
  ctl.sections.forEach(function(rec){
    var section = sections[rec.number - 1], stepper = rec.stepper;
    if (!section || !stepper || sections.filter(function(s){ return s.key === section.key; }).length !== 1) return;
    var matches = saved.sections.filter(function(s){ return s.key === section.key; });
    if (matches.length !== 1) return;
    var prior = matches[0];
    if (prior.mode === 'ambient'){
      if (stepper.mode() !== 'ambient') stepper.enterAmbient();
      return;
    }
    var indices = [];
    (section.diagram.steps || []).forEach(function(step, i){
      if (prior.id ? step && step.id === prior.id : JSON.stringify(step) === prior.signature) indices.push(i);
    });
    if (indices.length !== 1) return;
    if (stepper.mode() !== 'step') stepper.enterStep(false);
    if (stepper.current().n !== indices[0]) stepper.jump(indices[0]);
  });
}
function renderWorkbenchPreview(view, page, skin, previousPage, previousCtl){
  var tabs = activeTabReferences(previousCtl);
  var saved = workbenchPreviewSnapshot(previousPage, previousCtl);
  if (previousCtl) previousCtl.destroy();
  var ctl = renderPage(view, page, skin, null, {autoplay:false});
  restoreActiveTabs(ctl, tabs);
  restoreWorkbenchPreview(page, ctl, saved);
  return ctl;
}

function workspacePrefs(raw){
  var prefs = {editor:440, inspector:40}, value;
  try { value = JSON.parse(raw); } catch (ex){ return prefs; }
  if (!value || typeof value !== 'object') return prefs;
  if (typeof value.editor === 'number' && Number.isFinite(value.editor)) prefs.editor = Math.max(340, Math.min(900, value.editor));
  if (typeof value.inspector === 'number' && Number.isFinite(value.inspector)) prefs.inspector = Math.max(20, Math.min(80, value.inspector));
  return prefs;
}
function workspaceEditorBounds(contentWidth){
  return {min:340, max:Math.max(340, Math.min(900, Math.floor(contentWidth - 560 - 24)))};
}
function initWorkbenchWorkspace(){
  var wrap = document.querySelector('.workwrap');
  var cols = document.getElementById('workspace-columns');
  var rows = document.getElementById('workspace-rows');
  var inspect = document.getElementById('sec-inspect');
  var source = document.getElementById('sec-source');
  var focus = document.getElementById('workspace-focus');
  var reset = document.getElementById('workspace-reset');
  var toolbar = document.querySelector('.workspace-tools');
  if (!wrap || !cols || !rows || !inspect || !source || !focus || !reset || !toolbar) return;
  var key = 'dv-workbench-layout-v1', raw = null;
  try { raw = localStorage.getItem(key); } catch (ex){}
  var prefs = workspacePrefs(raw), drag = null, pageScroll = 0;
  function persist(){
    try { localStorage.setItem(key, JSON.stringify(prefs)); } catch (ex){}
  }
  function bounds(){
    var style = getComputedStyle(wrap);
    return workspaceEditorBounds(wrap.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0));
  }
  function effectiveWidth(){
    var b = bounds(); return Math.max(b.min, Math.min(b.max, prefs.editor));
  }
  function paint(){
    var b = bounds(), width = effectiveWidth();
    wrap.style.setProperty('--workspace-editor', width + 'px');
    wrap.style.setProperty('--workspace-inspector-share', prefs.inspector);
    wrap.style.setProperty('--workspace-source-share', 100 - prefs.inspector);
    document.body.style.setProperty('--workspace-toolbar', toolbar.getBoundingClientRect().height + 'px');
    cols.setAttribute('aria-valuemin', b.min);
    cols.setAttribute('aria-valuemax', b.max);
    cols.setAttribute('aria-valuenow', Math.round(width));
    cols.setAttribute('aria-valuetext', Math.round(width) + ' pixels of editor width');
    rows.setAttribute('aria-valuemin', 20);
    rows.setAttribute('aria-valuemax', 80);
    rows.setAttribute('aria-valuenow', Math.round(prefs.inspector));
    rows.setAttribute('aria-valuetext', Math.round(prefs.inspector) + '% inspector / ' + Math.round(100 - prefs.inspector) + '% JSON; minimum pane heights apply');
  }
  function assign(axis, value){
    var b = axis === 'editor' ? bounds() : {min:20, max:80};
    prefs[axis] = Math.max(b.min, Math.min(b.max, Math.round(value)));
    paint();
  }
  function finish(cancel){
    if (!drag) return;
    var done = drag; drag = null;
    if (cancel) prefs[done.axis] = done.before;
    document.body.classList.remove('workspace-dragging');
    document.body.style.cursor = done.cursor;
    if (done.handle.hasPointerCapture(done.id)) done.handle.releasePointerCapture(done.id);
    paint();
    if (!cancel) persist();
  }
  function wire(handle, axis){
    handle.addEventListener('pointerdown', function(ev){
      if (ev.button !== 0 || !ev.isPrimary || drag) return;
      ev.preventDefault();
      handle.focus({preventScroll:true});
      var a = inspect.getBoundingClientRect(), s = source.getBoundingClientRect();
      drag = {axis:axis, handle:handle, id:ev.pointerId, before:prefs[axis],
        start:axis === 'editor' ? ev.clientX : ev.clientY,
        value:axis === 'editor' ? effectiveWidth() : prefs.inspector,
        height:Math.max(1, a.height + s.height), cursor:document.body.style.cursor};
      handle.setPointerCapture(ev.pointerId);
      document.body.classList.add('workspace-dragging');
      document.body.style.cursor = axis === 'editor' ? 'col-resize' : 'row-resize';
    });
    handle.addEventListener('pointermove', function(ev){
      if (!drag || drag.handle !== handle || drag.id !== ev.pointerId) return;
      assign(axis, axis === 'editor' ? drag.value + drag.start - ev.clientX : drag.value + (ev.clientY - drag.start) * 100 / drag.height);
    });
    handle.addEventListener('pointerup', function(ev){ if (drag && drag.handle === handle && drag.id === ev.pointerId) finish(false); });
    handle.addEventListener('pointercancel', function(ev){ if (drag && drag.handle === handle && drag.id === ev.pointerId) finish(true); });
    handle.addEventListener('lostpointercapture', function(){ if (drag && drag.handle === handle) finish(true); });
    handle.addEventListener('keydown', function(ev){
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      var value = axis === 'editor' ? effectiveWidth() : prefs.inspector;
      var amount = axis === 'editor' ? (ev.shiftKey ? 50 : 20) : (ev.shiftKey ? 10 : 5);
      if (ev.key === 'Home') value = axis === 'editor' ? bounds().min : 20;
      else if (ev.key === 'End') value = axis === 'editor' ? bounds().max : 80;
      else if (axis === 'editor' && ev.key === 'ArrowLeft') value += amount;
      else if (axis === 'editor' && ev.key === 'ArrowRight') value -= amount;
      else if (axis === 'inspector' && ev.key === 'ArrowDown') value += amount;
      else if (axis === 'inspector' && ev.key === 'ArrowUp') value -= amount;
      else return;
      ev.preventDefault(); ev.stopPropagation();
      assign(axis, value); persist();
    });
    handle.addEventListener('dblclick', function(){ assign(axis, axis === 'editor' ? 440 : 40); persist(); });
  }
  wire(cols, 'editor'); wire(rows, 'inspector');
  reset.addEventListener('click', function(){ finish(true); prefs = workspacePrefs(null); paint(); persist(); });
  focus.addEventListener('click', function(){
    finish(true);
    var on = !document.body.classList.contains('workspace-focus');
    if (on) pageScroll = window.scrollY;
    document.body.classList.toggle('workspace-focus', on);
    focus.setAttribute('aria-pressed', String(on));
    focus.textContent = on ? 'Exit focus' : 'Focus workspace';
    paint(); window.scrollTo(0, on ? 0 : pageScroll);
  });
  window.addEventListener('resize', function(){ finish(true); paint(); });
  window.addEventListener('blur', function(){ finish(true); });
  if (typeof ResizeObserver !== 'undefined'){
    var observer = new ResizeObserver(paint);
    observer.observe(wrap); observer.observe(toolbar);
  }
  paint();
}

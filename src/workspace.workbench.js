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
    if (!section || sections.filter(function(s){ return s.key === section.key; }).length !== 1) return;
    var prior = {key:section.key};
    if (rec.boardSize) prior.sizeMode = rec.boardSize.mode();
    if (rec.flowDisclosure){ prior.flowOpen = rec.flowDisclosure.open; prior.primaryPanel = section.diagram.primaryPanel; }
    if (rec.presentation){ prior.focusMode = rec.presentation.mode(); prior.focusPanel = rec.presentation.panelId; }
    saved.push(prior);
    if (!stepper) return;
    if (stepper.path) prior.path = stepper.path();
    var steps = diagramForPath(section.diagram, prior.path).steps || [], step = steps[stepper.current().n];
    var id = step && typeof step.id === 'string' && step.id ? step.id : null;
    var signature = JSON.stringify(step);
    /* No positional fallback: repeated identities must not restore a different beat. */
    if (stepper.mode() === 'step' && (id
      ? steps.filter(function(s){ return s && s.id === id; }).length !== 1
      : steps.filter(function(s){ return JSON.stringify(s) === signature; }).length !== 1)) return;
    prior.mode = stepper.mode(); prior.id = id; prior.signature = signature;
  });
  return {title:page && page.title || '', sections:saved};
}
function restoreWorkbenchPreview(page, ctl, saved){
  if (!saved || (page.title || '') !== saved.title) return;
  var sections = workbenchPreviewSections(page);
  ctl.sections.forEach(function(rec){
    var section = sections[rec.number - 1], stepper = rec.stepper;
    if (!section || sections.filter(function(s){ return s.key === section.key; }).length !== 1) return;
    var matches = saved.sections.filter(function(s){ return s.key === section.key; });
    if (matches.length !== 1) return;
    var prior = matches[0];
    if (rec.boardSize) rec.boardSize.setMode(prior.sizeMode);
    if (rec.flowDisclosure && typeof prior.flowOpen === 'boolean' && prior.primaryPanel === section.diagram.primaryPanel)
      rec.flowDisclosure.open = prior.flowOpen;
    if (rec.presentation && prior.focusPanel === rec.presentation.panelId && prior.primaryPanel === section.diagram.primaryPanel)
      rec.presentation.setMode(prior.focusMode);
    if (!stepper || !prior.mode) return;
    if (prior.path && stepper.selectPath && !stepper.selectPath(prior.path)) return;
    if (prior.mode === 'ambient'){
      if (stepper.mode() !== 'ambient') stepper.enterAmbient();
      return;
    }
    var indices = [];
    (diagramForPath(section.diagram, prior.path).steps || []).forEach(function(step, i){
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

/* Workspace preferences belong to the browser, never the authored spec. */
function workspacePrefs(raw){
  var prefs = {editor:440, tool:'inspect'}, value;
  try { value = JSON.parse(raw); } catch (ex){ return prefs; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefs;
  if (typeof value.editor === 'number' && Number.isFinite(value.editor)) prefs.editor = Math.max(320, Math.min(1100, value.editor));
  if (['inspect','steps','json'].indexOf(value.tool) >= 0) prefs.tool = value.tool;
  return prefs;
}
function workspaceEditorBounds(contentWidth){
  return {min:320, max:Math.max(320, Math.min(1100, Math.floor(contentWidth - 300 - 24)))};
}
function initWorkbenchWorkspace(){
  var wrap = document.querySelector('.workwrap');
  var cols = document.getElementById('workspace-columns');
  var editor = document.getElementById('spec-editor');
  var focus = document.getElementById('workspace-focus');
  var expand = document.getElementById('workspace-expand');
  var reset = document.getElementById('workspace-reset');
  var toolbar = document.querySelector('.workspace-tools');
  var src = document.getElementById('src');
  var guide = document.getElementById('guide');
  if (!wrap || !cols || !editor || !focus || !expand || !reset || !toolbar || !src) return null;
  var names = ['inspect','steps','json'], tabs = {}, panes = {}, scrolls = {};
  names.forEach(function(name){
    tabs[name] = document.getElementById('editor-tab-' + name);
    panes[name] = document.getElementById('editor-' + name);
  });
  if (names.some(function(name){ return !tabs[name] || !panes[name]; })) return null;
  var key = 'dv-workbench-layout-v2', raw = null;
  try { raw = localStorage.getItem(key) || localStorage.getItem('dv-workbench-layout-v1'); } catch (ex){}
  var prefs = workspacePrefs(raw), drag = null, pageScroll = 0, expanded = false, priorFocus = false;
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
    document.body.style.setProperty('--workspace-toolbar', toolbar.getBoundingClientRect().height + 'px');
    cols.setAttribute('aria-valuemin', b.min);
    cols.setAttribute('aria-valuemax', b.max);
    cols.setAttribute('aria-valuenow', Math.round(width));
    cols.setAttribute('aria-valuetext', Math.round(width) + ' pixels of editor width');
    document.body.classList.toggle('editor-expanded', expanded);
    expand.setAttribute('aria-pressed', String(expanded));
    expand.textContent = expanded ? '↙ Return to split' : '⤢ Expand editor';
  }
  /* Show/hide existing panes; do not rebuild a form, source textarea, or
     preview. Keep both editor scroll positions and native text selection. */
  function showTool(name, options){
    if (names.indexOf(name) < 0) return false;
    options = options || {};
    var changed = prefs.tool !== name;
    if (changed){
      scrolls[prefs.tool] = {pane:panes[prefs.tool].scrollTop, source:src.scrollTop,
        inspector:guide ? guide.scrollTop : 0, form:guide && guide.firstChild};
      prefs.tool = name;
    }
    editor.open = true;
    names.forEach(function(n){
      var active = n === name;
      tabs[n].setAttribute('aria-selected', String(active));
      tabs[n].tabIndex = active ? 0 : -1;
      panes[n].hidden = !active;
    });
    var section = document.getElementById(name === 'json' ? 'sec-source' : 'sec-' + name);
    if (section) section.open = true;
    if (changed && scrolls[name]){
      panes[name].scrollTop = scrolls[name].pane;
      if (name === 'json') src.scrollTop = scrolls[name].source;
      if (name === 'inspect' && guide)
        guide.scrollTop = guide.firstChild === scrolls[name].form ? scrolls[name].inspector : 0;
    }
    if (options.closeUtilities){
      ['sec-insert','sec-outline'].forEach(function(id){ var el = document.getElementById(id); if (el) el.open = false; });
    }
    if (options.focus) tabs[name].focus({preventScroll:true});
    if (changed) persist();
    return true;
  }
  names.forEach(function(name, index){
    tabs[name].addEventListener('click', function(){ showTool(name, {closeUtilities:true}); });
    tabs[name].addEventListener('keydown', function(ev){
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      var next;
      if (ev.key === 'ArrowRight') next = (index + 1) % names.length;
      else if (ev.key === 'ArrowLeft') next = (index + names.length - 1) % names.length;
      else if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = names.length - 1;
      else return;
      ev.preventDefault(); ev.stopPropagation();
      showTool(names[next], {focus:true, closeUtilities:true});
    });
  });
  function assign(value){
    var b = bounds(); prefs.editor = Math.max(b.min, Math.min(b.max, Math.round(value))); paint();
  }
  function finish(cancel){
    if (!drag) return;
    var done = drag; drag = null;
    if (cancel) prefs.editor = done.before;
    document.body.classList.remove('workspace-dragging');
    document.body.style.cursor = done.cursor;
    if (cols.hasPointerCapture(done.id)) cols.releasePointerCapture(done.id);
    paint();
    if (!cancel) persist();
  }
  cols.addEventListener('pointerdown', function(ev){
    if (expanded || ev.button !== 0 || !ev.isPrimary || drag) return;
    ev.preventDefault(); cols.focus({preventScroll:true});
    drag = {id:ev.pointerId, before:prefs.editor, start:ev.clientX,
      value:effectiveWidth(), cursor:document.body.style.cursor};
    cols.setPointerCapture(ev.pointerId);
    document.body.classList.add('workspace-dragging'); document.body.style.cursor = 'col-resize';
  });
  cols.addEventListener('pointermove', function(ev){
    if (drag && drag.id === ev.pointerId) assign(drag.value + drag.start - ev.clientX);
  });
  cols.addEventListener('pointerup', function(ev){ if (drag && drag.id === ev.pointerId) finish(false); });
  cols.addEventListener('pointercancel', function(ev){ if (drag && drag.id === ev.pointerId) finish(true); });
  cols.addEventListener('lostpointercapture', function(){ if (drag) finish(true); });
  cols.addEventListener('keydown', function(ev){
    if (expanded || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var value = effectiveWidth(), amount = ev.shiftKey ? 50 : 20;
    if (ev.key === 'Home') value = bounds().min;
    else if (ev.key === 'End') value = bounds().max;
    else if (ev.key === 'ArrowLeft') value += amount;
    else if (ev.key === 'ArrowRight') value -= amount;
    else return;
    ev.preventDefault(); ev.stopPropagation(); assign(value); persist();
  });
  cols.addEventListener('dblclick', function(){
    var style = getComputedStyle(wrap);
    assign((wrap.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0) - 24) / 2);
    persist();
  });
  function setFocus(on){
    var was = document.body.classList.contains('workspace-focus');
    if (on === was) return;
    if (on) pageScroll = window.scrollY;
    document.body.classList.toggle('workspace-focus', on);
    focus.setAttribute('aria-pressed', String(on)); focus.textContent = on ? 'Exit focus' : 'Focus workspace';
    paint(); window.scrollTo(0, on ? 0 : pageScroll);
  }
  function setExpanded(on){
    finish(true);
    if (expanded === on) return;
    if (on) priorFocus = document.body.classList.contains('workspace-focus');
    expanded = on; editor.open = true;
    setFocus(on ? true : priorFocus); paint();
  }
  expand.addEventListener('click', function(ev){
    ev.preventDefault(); ev.stopPropagation(); /* button inside the editor summary */
    setExpanded(!expanded);
  });
  focus.addEventListener('click', function(){
    finish(true);
    if (expanded){ setExpanded(false); setFocus(false); }
    else setFocus(!document.body.classList.contains('workspace-focus'));
  });
  reset.addEventListener('click', function(){
    finish(true); setExpanded(false); prefs.editor = 440; paint(); persist();
  });
  window.addEventListener('resize', function(){ finish(true); paint(); });
  window.addEventListener('blur', function(){ finish(true); });
  if (typeof ResizeObserver !== 'undefined'){
    var observer = new ResizeObserver(paint); observer.observe(wrap); observer.observe(toolbar);
  }
  showTool(prefs.tool); paint();
  return {showTool:showTool, tool:function(){return prefs.tool;},
    setExpanded:setExpanded, expanded:function(){return expanded;}};
}

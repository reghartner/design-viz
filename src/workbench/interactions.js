/* Owns authored selection and temporary board gestures for one builder. Source
   publication remains a session transaction; renderer lifetime belongs to boot. */
function createBuilderInteractions(opts){
  var life=createWorkbenchLifetime(),document=opts.document,window=opts.window,view=opts.view,src=opts.src,session=opts.session;
  var guide=opts.guide,targetLabel=opts.targetLabel,buildRow=targetLabel?targetLabel.closest('.buildrow'):null,addModeExit=opts.addModeExit;
  var inspector=opts.inspector;
  function parseEditor(){return session.snapshot();}
  function applyPlan(plan,options,snapshot){return opts.apply(plan,options,snapshot);}
  function selectRange(range,force){return opts.selectRange(range,force);}
  function renderInspector(){return inspector.render();}
  function renderMultiInspector(){return inspector.renderMulti(multiSel);}
  function retireInspector(){return inspector.retire();}
  function inspectorMessage(message,keepTool){return inspector.message(message,keepTool);}
  function formError(message){return inspector.error(message);}
  function commitCascade(plan,options){return inspector.transact(plan,options);}
  function panelEditorForCard(card){return inspector.panelForCard(card);}
  function panelEditorForTarget(target){return inspector.panelForTarget(target);}
  function inDetailPreview(el){return !!(el && el.closest && el.closest('[data-dv-detail-preview]'));}
  var selectedEl=null,clipboardHomeTarget=null;
  function setSelected(el){
    if (selectedEl) selectedEl.classList.remove('dv-sel');
    selectedEl = el || null;
    if (selectedEl) selectedEl.classList.add('dv-sel');
  }

  function updateTargetLabel(raw){
    opts.refreshInsertion();
    if (!targetLabel) return;
    if (addToStep){ addToStepStatus(); return; } /* armed mode owns the label */
    var desc = builderInsertTargetText(raw || {}, session.insertSection);
    targetLabel.textContent = (desc || 'into section ' + (session.insertSection + 1)) +
      ' — click a section to retarget';
    markInsertTarget();
  }
  function markInsertTarget(){
    /* frame the section inserts land in, on the board */
    var prev = view.querySelectorAll('.doc-sec.dv-inserttarget');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('dv-inserttarget');
    var el = view.querySelector('.doc-sec[data-dv-section="' + session.insertSection + '"]');
    if (el) el.classList.add('dv-inserttarget');
  }


  /* ---- board highlight by stable identity, re-applied after renders ---- */
  function cssQuote(s){
    /* node ids come from the spec and may hold quotes/backslashes */
    if (window.CSS && CSS.escape) return CSS.escape(String(s));
    return String(s).replace(/[^A-Za-z0-9_-]/g, '\\$&');
  }
  function findTargetEl(t){
    if (!t) return null;
    if (t.kind === 'tab') return document.getElementById('tab-' + t.block + '-' + t.tab);
    var secEl = view.querySelector('.doc-sec[data-dv-section="' + t.section + '"]');
    if (!secEl) return null;
    if (t.kind === 'section') return secEl;
    if (t.kind === 'step'){
      /* prefer the numbered coin; steps sharing a first hop (or
         edgeless steps) have no coin — fall back to their chip */
      var coin = secEl.querySelector('[data-dv-step="' + t.index + '"]');
      if (coin) return coin;
      var chipsBox = secEl.querySelector('.schips');
      var sp = stepperFor(t.section), pathId = t.pathId || (sp && sp.path && sp.path());
      return chipsBox && ((pathId && chipsBox.querySelector('[data-step-path="' + cssQuote(pathId) + '"][data-step-source="' + t.index + '"]')) ||
        chipsBox.querySelector('[data-step-source="' + t.index + '"]'));
    }
    var sel = t.kind === 'node' ? '[data-dv-node="' + cssQuote(t.id) + '"]' :
              t.kind === 'group' ? '.grp[data-dv-group="' + cssQuote(t.id) + '"]' :
              t.kind === 'edge' ? 'path.edge[data-dv-edge="' + t.index + '"]' :
              t.kind === 'step' ? '[data-dv-step="' + t.index + '"]' :
              t.kind === 'bullet' ? '[data-dv-bullet="' + t.index + '"]' :
              t.kind === 'para' ? '[data-dv-para="' + t.index + '"]' :
              t.kind === 'crow' ? '[data-dv-crow="' + t.index + '"]' :
                                  '[data-dv-panel="' + t.index + '"]';
    try { return secEl.querySelector(sel); } catch (ex){ return null; }
  }
  function rehighlight(){ setSelected(findTargetEl(session.target)); }

  /* ---- board markers for the selected step's members ---- */
  function clearStepMarkers(){
    Array.prototype.forEach.call(view.querySelectorAll('.dv-instep'), function(el){
      el.classList.remove('dv-instep');
    });
  }
  function stepperFor(sectionOrdinal){
    var ctl = opts.ctl ? opts.ctl() : null;
    if (!ctl || !ctl.sections) return null;
    var rec = null;
    ctl.sections.forEach(function(s){ if (!rec && s.number === sectionOrdinal + 1) rec = s; });
    return rec ? rec.stepper : null;
  }
  function pausePreview(){
    var ctl = opts.ctl ? opts.ctl() : null;
    ((ctl && ctl.sections) || []).forEach(function(rec){
      if (rec.stepper && rec.stepper.pause) rec.stepper.pause();
    });
  }
  life.listen(src,'focusin', pausePreview);
  life.listen(src,'input', pausePreview);
  if (guide) life.listen(guide,'focusin', pausePreview);
  function syncBoardToSelectedStep(){
    /* selecting a step means SEEING that step: put the board in step
       view at that index — and keep it there across the builder's own
       re-renders, which otherwise reopen the diagram's default
       (usually ambient) view */
    var t = session.target;
    if (!t || t.kind !== 'step') return;
    var stepper = stepperFor(t.section);
    if (!stepper) return;
    if (stepper.pause) stepper.pause();
    if (stepper.mode() !== 'step') stepper.enterStep(false);
    if (stepper.jumpSource) stepper.jumpSource(t.index,t.pathId);
    else if (stepper.current().n !== t.index) stepper.jump(t.index);
  }
  function applyStepMarkers(){
    clearStepMarkers();
    var t = session.target;
    if (!t || t.kind !== 'step') return;
    var parsed = parseEditor();
    if (parsed.error) return;
    var got = builderStepAt(parsed.raw, t.section, t.index);
    var secEl = view.querySelector('.doc-sec[data-dv-section="' + t.section + '"]');
    if (!got || !secEl) return;
    var keyToIdx = Object.create(null);
    (got.d.edges || []).forEach(function(e, i){
      var k = builderEdgeKey(e);
      if (!(k in keyToIdx)) keyToIdx[k] = i;
    });
    builderStepHops(got.st).forEach(function(k){
      if (!(k in keyToIdx)) return;
      /* mark the edge AND its halo twin — the halo carries the glow in
         every skin (terminal strips CSS filters, so a filter-based glow
         cannot be the marker) */
      var el = secEl.querySelector('path.edge[data-dv-edge="' + keyToIdx[k] + '"]');
      if (el) el.classList.add('dv-instep');
      var halo = secEl.querySelector('path.halo[data-dv-edge="' + keyToIdx[k] + '"]');
      if (halo) halo.classList.add('dv-instep');
    });
    (Array.isArray(got.st.nodes) ? got.st.nodes : []).forEach(function(id){
      var el = secEl.querySelector('[data-dv-node="' + cssQuote(id) + '"]');
      if (el) el.classList.add('dv-instep');
    });
    Object.keys(got.st.panels || {}).forEach(function(pid){
      var idx = -1;
      (got.d.panels || []).forEach(function(pn, i){ if (idx < 0 && pn && pn.id === pid) idx = i; });
      if (idx < 0) return;
      var el = secEl.querySelector('[data-dv-panel="' + idx + '"]');
      if (el) el.classList.add('dv-instep');
    });
  }


  function clipboardSelection(){
    if (multiSel.length > 1) return multiSel;
    if (clipboardHomeTarget && clipboardHomeTarget.text === session.text() && session.target &&
        session.target.kind === 'panel' && clipboardHomeTarget.target.section === session.target.section && clipboardHomeTarget.target.index === session.target.index)
      return [clipboardHomeTarget.target];
    return session.target ? [session.target] : [];
  }
  function homeClipboardSelect(target){clipboardHomeTarget={text:session.text(),target:target};}
  function clipboardDestination(targets){
    var selected=targets && targets[0] || clipboardSelection()[0];
    return {section:selected ? selected.section : session.insertSection,index:selected && ['panel','home'].indexOf(selected.kind)>=0 ? selected.index : undefined};
  }

  function deletePlanFor(t, raw){
    return builderDeletePlan(session.text(), raw, t);
  }

  function deleteCurrent(){
    var t = session.target;
    if (!t) return;
    if (t.kind === 'group' && addToStep){
      formError('finish ADD TO STEP first (DONE or Esc) — delete is paused while the mode is armed');
      return;
    }
    commitCascade(function(raw){ return deletePlanFor(t, raw); },
      {after: function(){
        session.target = null; setSelected(null);
        if (t.kind === 'section') session.insertSection = 0;
        inspectorMessage(t.kind + ' deleted — undo restores it');
      }});
  }

  /* ================= multi-select (shift/ctrl/cmd-click) ================= */
  var multiSel = [];
  function multiIdent(t){
    return t.section + '|' + t.kind + '|' + (t.kind === 'node' ? t.id : t.index);
  }
  function clearMultiSelect(){
    multiSel.forEach(function(t){ if (t.el && t.el.classList) t.el.classList.remove('dv-sel'); });
    multiSel = [];
  }
  function dropMultiUI(){
    if (guide) guide.hidden = true;
    retireInspector();
  }
  /* after a re-render the selected elements are new DOM: re-resolve each
     identity, drop the ones that no longer exist, re-ring the rest */
  function reapplyMultiSel(){
    if (!multiSel.length) return;
    multiSel = multiSel.filter(function(t){
      var el = findTargetEl(t);
      if (!el) return false;
      t.el = el;
      el.classList.add('dv-sel');
      return true;
    });
    if (!multiSel.length) dropMultiUI();
    else renderMultiInspector();
  }
  function toggleMultiSelect(target){
    if (BUILDER_MULTI_KINDS.indexOf(target.kind) < 0){
      inspectorMessage('multi-select supports nodes, edges, steps, panels, bullets, and contract rows');
      return;
    }
    if (multiSel.length && multiSel[0].kind !== target.kind){
      inspectorMessage('multi-select holds ' + multiSel[0].kind + 's — Esc clears it, then start over');
      return;
    }
    /* a mismatched modifier-click against an existing SINGLE selection is
       refused the same way — it must leave that selection standing, never
       silently replace it */
    if (!multiSel.length && session.target && session.target.kind !== target.kind){
      inspectorMessage('multi-select works within one kind — the current selection is a ' +
        session.target.kind + '; plain-click to switch');
      return;
    }
    /* a shift-click after a plain click grows the pair naturally: seed the
       set with the current single selection when the kinds match. The
       single-selection ring is dropped FIRST — the seed then re-rings the
       same element as a multi member. */
    var prev = session.target;
    session.target = null;
    setSelected(null);
    if (!multiSel.length && prev && prev.kind === target.kind &&
        multiIdent(prev) !== multiIdent(target)){
      var seedEl = findTargetEl(prev);
      if (seedEl){
        multiSel.push({section: prev.section, kind: prev.kind,
                       id: prev.id, index: prev.index, el: seedEl});
        seedEl.classList.add('dv-sel');
      }
    }
    var key = multiIdent(target), existing = -1;
    multiSel.forEach(function(t, i){ if (multiIdent(t) === key) existing = i; });
    if (existing >= 0){
      var gone = multiSel.splice(existing, 1)[0];
      if (gone.el && gone.el.classList) gone.el.classList.remove('dv-sel');
    } else {
      multiSel.push({section: target.section, kind: target.kind,
                     id: target.id, index: target.index, el: target.el});
      if (target.el && target.el.classList) target.el.classList.add('dv-sel');
    }
    if (!multiSel.length){ dropMultiUI(); return; }
    if (multiSel.length === 1){
      /* one left: collapse back to an ordinary single selection */
      var only = multiSel[0];
      clearMultiSelect();
      selectTarget({section: only.section, kind: only.kind, id: only.id,
                    index: only.index, el: only.el}, false);
      return;
    }
    if (opts.workspace) opts.workspace.showTool('inspect', {closeUtilities:true});
    renderMultiInspector();
  }
  function bulkDeleteSelected(){
    var n = multiSel.length, kind = multiSel[0].kind;
    var plan = planBulkDelete(session.text(), multiSel);
    if (applyPlan(plan)){
      clearMultiSelect();
      inspectorMessage(n + ' ' + kind + (n > 1 ? 's' : '') + ' deleted — undo restores them');
    }
  }

  /* ================= selection ================= */

  function targetFromEvent(ev){
    if(inDetailPreview(ev.target))return null;
    /* Map editing follows the same manual transport/path selection as the
       preview. Play/Pause are excluded so selecting an inspector cannot
       immediately stop a user-started animation. */
    if (!addToStep && !connect){
      var card=ev.target.closest && ev.target.closest('[data-dv-panel]');
      var editor=panelEditorForCard(card), custom=editor.clickTarget && editor.clickTarget(ev.target);
      if(custom) return custom;
    }
    var transport = ev.target.closest && ev.target.closest('.tbtn');
    if (transport && /^(Previous|Next) step$/.test(transport.getAttribute('aria-label') || '') &&
        session.target && session.target.kind === 'step'){
      var activeSection = transport.closest('.doc-sec');
      if (activeSection){
        var ordinal = Number(activeSection.getAttribute('data-dv-section')), player = stepperFor(ordinal);
        if (player) return {section:ordinal, kind:'step', index:player.sourceIndex()};
      }
    }
    /* tab buttons both switch the panel (engine) and select the tab
       here; the copy chip beside a tab is NOT a .tabbtn and still falls
       through to the interactive skip below */
    var tabBtn = ev.target.closest && ev.target.closest('.tabbtn');
    if (tabBtn){
      var m = /^tab-(\d+)-(\d+)$/.exec(tabBtn.id || '');
      if (m) return {kind: 'tab', block: parseInt(m[1], 10), tab: parseInt(m[2], 10), el: tabBtn};
      return null;
    }
    /* step chips in the click-through bar both jump playback (engine)
       and select its shared source entry here, independently of its row */
    var chip = ev.target.closest && ev.target.closest('.schip');
    if (chip){
      var chipSec = chip.closest('.doc-sec');
      if (!chipSec || !chipSec.hasAttribute('data-dv-section')) return null;
      var chipIdx = Number(chip.getAttribute('data-step-source'));
      if (chipIdx < 0) return null;
      return {section: parseInt(chipSec.getAttribute('data-dv-section'), 10),
              kind: 'step', index: chipIdx, el: chip};
    }
    if (ev.target.closest('a, button, summary, [role="button"], input, select, textarea')) return null;
    /* the caption line selects the CURRENT step (links and the copy
       chip inside it were already skipped above) */
    var line = ev.target.closest && ev.target.closest('.stepline');
    if (line){
      var lineSec = line.closest('.doc-sec');
      var chipsBox = lineSec && lineSec.querySelector('.schips');
      if (!lineSec || !chipsBox || !lineSec.hasAttribute('data-dv-section')) return null;
      var cur = -1, currentChip = null;
      Array.prototype.forEach.call(chipsBox.querySelectorAll('.schip'), function(c){
        if (cur < 0 && c.getAttribute('aria-current') === 'true'){
          cur = Number(c.getAttribute('data-step-source')); currentChip = c;
        }
      });
      if (cur < 0) return null;
      return {section: parseInt(lineSec.getAttribute('data-dv-section'), 10),
              kind: 'step', index: cur, el: currentChip};
    }
    var secEl = ev.target.closest('.doc-sec');
    if (!secEl || !secEl.hasAttribute('data-dv-section')) return null;
    var gi = parseInt(secEl.getAttribute('data-dv-section'), 10);
    if (isNaN(gi)) return null;
    var el = ev.target.closest('[data-dv-node], [data-dv-edge], [data-dv-step], [data-dv-panel], [data-dv-bullet], [data-dv-para], [data-dv-crow]');
    if (el && secEl.contains(el)){
      if (el.hasAttribute('data-dv-node'))
        return {section: gi, kind: 'node', id: el.getAttribute('data-dv-node'), el: el};
      if (el.hasAttribute('data-dv-step'))
        return {section: gi, kind: 'step', index: parseInt(el.getAttribute('data-dv-step'), 10), el: el};
      if (el.hasAttribute('data-dv-panel'))
        return {section: gi, kind: 'panel', index: parseInt(el.getAttribute('data-dv-panel'), 10), el: el};
      if (el.hasAttribute('data-dv-bullet'))
        return {section: gi, kind: 'bullet', index: parseInt(el.getAttribute('data-dv-bullet'), 10), el: el};
      if (el.hasAttribute('data-dv-para'))
        return {section: gi, kind: 'para', index: parseInt(el.getAttribute('data-dv-para'), 10), el: el};
      if (el.hasAttribute('data-dv-crow'))
        return {section: gi, kind: 'crow', index: parseInt(el.getAttribute('data-dv-crow'), 10), el: el};
      /* halo and label clicks resolve to the same edge — highlight the
         visible edge path (the halo has no selected style of its own) */
      var edgeIdx = parseInt(el.getAttribute('data-dv-edge'), 10);
      var edgeEl = secEl.querySelector('path.edge[data-dv-edge="' + edgeIdx + '"]') || el;
      return {section: gi, kind: 'edge', index: edgeIdx, el: edgeEl};
    }
    var groupEl = ev.target.closest('g.grp[data-dv-group]');
    if (groupEl && secEl.contains(groupEl))
      return {section: gi, kind: 'group', id: groupEl.getAttribute('data-dv-group'), el: groupEl};
    return {section: gi, kind: 'section', el: secEl};
  }

  function selectTarget(target, focusEditor, keepTool){
    clipboardHomeTarget=null;
    pausePreview();
    if (opts.workspace && !keepTool) opts.workspace.showTool('inspect', {closeUtilities:true});
    if (target.kind === 'group') clearMultiSelect(); /* this action establishes a single selection */
    setSelected(target.el);
    session.target = {section: target.section, kind: target.kind,
                     id: target.id, index: target.index,
                     block: target.block, tab: target.tab};
    if (target.kind !== 'tab') session.insertSection = target.section;
    var parsed = parseEditor();
    if (!parsed.error) updateTargetLabel(parsed.raw);
    syncBoardToSelectedStep();
    if (session.target.kind === 'step'){
      var sp = stepperFor(session.target.section);
      if (sp && sp.path) session.target.pathId = sp.path();
    }
    renderInspector();
    applyStepMarkers();
    opts.syncStory();
    if(!parsed.error){
      var editor=panelEditorForTarget(target);
      if(editor.selected) editor.selected(target,parsed.raw);
    }
    if (focusEditor === false) return;
    var path = parsed.error ? null : builderTargetPath(parsed.raw, session.target);
    var loc = path ? jsonLocate(session.text(), path) : null;
    if (loc) selectRange(loc);
  }


  life.listen(view,'dv:pathrender',applyRowGrabs);
  life.listen(view,'click',function(ev){
    if(inDetailPreview(ev.target))return;
    if(!ev.target.closest('[data-view-layout]') || !session.target || session.target.kind!=='step')return;
    var section=ev.target.closest('.doc-sec'),index=section && Number(section.getAttribute('data-dv-section'));
    var player=section && stepperFor(index);
    if(player && session.target.section===index){session.target={kind:'step',section:index,index:player.sourceIndex(),pathId:player.path()};renderInspector();applyStepMarkers();}
  });
  life.listen(view,'dv:pathchange',function(ev){
    if(inDetailPreview(ev.target))return;
    var followStep = session.target && session.target.kind === 'step';
    session.target=null;clearMultiSelect();if(guide) guide.hidden=true;
    if(addToStep) cancelAddToStep(null);if(connect) cancelConnect(null);
    applyRowGrabs();clearStepMarkers();opts.syncStory();
    var section = ev.target.closest('.doc-sec');
    if (followStep && section){
      var ordinal = Number(section.getAttribute('data-dv-section')), player = stepperFor(ordinal);
      if (player) selectTarget({section:ordinal, kind:'step', index:player.sourceIndex()}, false);
    }
  });

  /* ---- ADD TO STEP mode: board clicks toggle step membership ---- */
  var addToStep = null; /* {section, step} while active */
  function addToStepStatus(){
    if (targetLabel && addToStep)
      targetLabel.textContent = 'ADD TO STEP ' + (addToStep.step + 1) +
        ': click edges, nodes, panels to toggle';
    if (buildRow) buildRow.classList.toggle('dv-addmode', !!addToStep);
    if (addModeExit) addModeExit.hidden = !addToStep;
  }
  function clearAddModeChrome(){
    if (buildRow) buildRow.classList.remove('dv-addmode');
    if (addModeExit) addModeExit.hidden = true;
  }
  var ADD_MODE_BLOCKED = '.mbtn, .tbtn, .schip, .path-chip, .tabbtn, .skbtn, #go, ' +
    '#undo-builder, #redo-builder, #file-open, #file-save, #file-export, #spec-diff, #diffbox .diffline, #draftbar .bbtn, ' +
    '#add-node, #add-edge, #add-step, #add-panel, #add-section, #add-tabs, #palette .pbtn, ' +
    '#import-mermaid, #import-mermaid-convert, #import-trace, #trace-convert, .outline-item, .patchedit .fctl, .groupctl';
  function addModeBlocker(ev){
    /* while ADD TO STEP is armed, controls that would change the shown
       step, re-render from outside the mode, or leave the page state
       behind the mode's back are paused — capture phase, so the
       engine's own listeners never fire */
    if (!addToStep || inDetailPreview(ev.target)) return;
    var el = ev.target.closest && ev.target.closest(ADD_MODE_BLOCKED);
    if (!el) return;
    ev.stopPropagation();
    ev.preventDefault();
    formError('finish ADD TO STEP first (DONE or Esc) — this control is paused while the mode is armed');
    addToStepStatus();
  }
  life.listen(document,'click', addModeBlocker, true);
  life.listen(document,'keydown', function(ev){
    if (opts.isActive && !opts.isActive()) return;
    if(document.querySelector('#object-clipboard[open], #panel-picker[open]'))return;
    /* the tab bar switches tabs on Arrow/Home/End — pause that too
       while the mode is armed (capture phase beats the engine's
       tab-bar listener) */
    if (!addToStep) return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(ev.key) < 0) return;
    if (!(ev.target.closest && ev.target.closest('.tabbtn'))) return;
    ev.stopPropagation();
    ev.preventDefault();
    formError('finish ADD TO STEP first (DONE or Esc) — tab switching is paused while the mode is armed');
    addToStepStatus();
  }, true);
  function cancelAddToStep(message){
    if (!addToStep) return;
    addToStep = null;
    clearAddModeChrome();
    var parsed = parseEditor();
    updateTargetLabel(parsed.error ? null : parsed.raw);
    if (message) inspectorMessage(message);
    else renderInspector(); /* refresh the button label */
  }
  if (addModeExit) life.listen(addModeExit,'click', function(){ cancelAddToStep(null); });
  function handleAddToStepClick(target){
    /* hints go through the inline error slot so the step form stays on
       screen — inspectorMessage would replace the whole panel */
    if (!target || ['edge', 'node', 'panel'].indexOf(target.kind) < 0){
      formError('add to step: click an edge, node, or panel (Esc or DONE ends)');
      addToStepStatus();
      return;
    }
    if (target.section !== addToStep.section){
      formError('that element is in a different section — still adding to step ' + (addToStep.step + 1));
      addToStepStatus();
      return;
    }
    var parsed = parseEditor();
    if (parsed.error){ cancelAddToStep(parsed.error); return; }
    var mode = addToStep;
    var plan = null;
    if (target.kind === 'node'){
      plan = planStepToggleNode(session.text(), parsed.raw, mode.section, mode.step, target.id);
    } else if (target.kind === 'edge'){
      var rec = specSectionPaths(parsed.raw)[mode.section];
      var edges = rec ? (specValueAt(parsed.raw, rec.diagram) || {}).edges : null;
      var e = Array.isArray(edges) ? edges[target.index] : null;
      if (!e){ formError('edge not found — the render and the editor may be out of sync'); return; }
      plan = planStepToggleHop(session.text(), parsed.raw, mode.section, mode.step, builderEdgeKey(e));
    } else {
      var rec2 = specSectionPaths(parsed.raw)[mode.section];
      var panels = rec2 ? (specValueAt(parsed.raw, rec2.diagram) || {}).panels : null;
      var pn = Array.isArray(panels) ? panels[target.index] : null;
      if (!pn || !pn.id){ formError('panel not found — the render and the editor may be out of sync'); return; }
      plan = planStepTogglePanel(session.text(), parsed.raw, mode.section, mode.step, pn.id);
    }
    var ok = applyPlan(plan, {after: function(){ renderInspector(); }});
    if (!ok) return;
    addToStepStatus(); /* applyPlan resets the target label */
  }

  /* ---- connect mode: draw an edge by clicking its two nodes ---- */
  var connect = null; /* null | {stage:1} | {stage:2, section, fromId} */
  function connectStatus(text){
    if (targetLabel) targetLabel.textContent = text;
  }
  function cancelConnect(message){
    connect = null;
    var parsed = parseEditor();
    updateTargetLabel(parsed.error ? null : parsed.raw);
    if (message) inspectorMessage(message);
  }
  function startConnect(){
    if (addToStep) cancelAddToStep(null);
    if (connect){ cancelConnect('connect cancelled'); return; }
    var parsed = parseEditor();
    if (parsed.error){ inspectorMessage(parsed.error + ' — fix it before inserting'); return; }
    if (!specSectionPaths(parsed.raw).length){ inspectorMessage('no sections found in the editor text'); return; }
    connect = {stage: 1};
    connectStatus('connect: click the SOURCE node (Esc cancels)');
  }
  function handleConnectClick(target){
    if (!target || target.kind !== 'node'){
      cancelConnect('connect cancelled — that was not a node');
      return;
    }
    if (connect.stage === 1){
      connect = {stage: 2, section: target.section, fromId: target.id};
      setSelected(target.el);
      connectStatus('connect: ' + target.id + ' → click the TARGET node');
      return;
    }
    if (target.section !== connect.section){
      cancelConnect('connect cancelled — the two nodes are in different sections');
      return;
    }
    var fromId = connect.fromId;
    session.insertSection = target.section;
    var parsed = parseEditor();
    if (parsed.error){ cancelConnect(parsed.error); return; }
    var plan = planAddEdgeBetween(session.text(), parsed.raw, target.section, fromId, target.id);
    if (plan.error){ cancelConnect(plan.error); return; }
    if(!session.accept(plan,{snapshot:parsed,beforePublish:clearMultiSelect}))return;
    cancelConnect(null);
    var el = findTargetEl({section: target.section, kind: 'edge', index: plan.index});
    selectTarget({section: target.section, kind: 'edge', index: plan.index, el: el}, false);
    selectRange(plan);
  }

  /* ---- drag an edge label to set its labelDx/labelDy nudges;
          drag a node onto another to swap, or into a row/slot gap ---- */
  var drag = null, nodeDrag = null, groupDrag = null, suppressClick = false;
  /* one cancellation path for the node drag: Escape, and every controlled
     replacement (which detaches the dragged elements), both land here */
  function cancelNodeDrag(){
    if (!nodeDrag) return;
    var nd = nodeDrag;
    nodeDrag = null;
    if (nd.el && nd.el.classList) nd.el.classList.remove('dv-dragsrc');
    if (nd.target && nd.target.classList) nd.target.classList.remove('dv-droptgt');
    dropNodeDragGhosts(nd);
    if (nd.line && nd.line.parentNode) nd.line.parentNode.removeChild(nd.line);
  }
  function cancelGroupDrag(){
    if (!groupDrag) return;
    var gd = groupDrag;
    groupDrag = null;
    for (var i = 0; i < gd.memberEls.length; i++)
      gd.memberEls[i].classList.remove('dv-dragsrc');
    gd.el.classList.remove('dv-grabbing');
    if (gd.line && gd.line.parentNode) gd.line.parentNode.removeChild(gd.line);
  }
  function nodeTranslateXY(el){
    var m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(el.getAttribute('transform') || '');
    return m ? {x: parseFloat(m[1]), y: parseFloat(m[2])} : null;
  }
  function nodeGhostClone(el){
    /* a see-through copy riding the same SVG coordinate space; ids are
       stripped so the document never holds duplicates */
    var c = el.cloneNode(true);
    c.removeAttribute('id');
    c.removeAttribute('data-dv-node');
    c.setAttribute('aria-hidden', 'true'); /* pure visual feedback */
    var withId = c.querySelectorAll('[id]');
    for (var i = 0; i < withId.length; i++) withId[i].removeAttribute('id');
    /* pointer-events:none stops the mouse, not the keyboard — strip
       focusable descendants (node links, backref chips) too */
    var focusable = c.querySelectorAll('[tabindex], a[href]');
    for (var j = 0; j < focusable.length; j++){
      focusable[j].removeAttribute('tabindex');
      focusable[j].removeAttribute('href');
    }
    c.classList.remove('dv-sel', 'dv-instep', 'dv-dragsrc', 'dv-droptgt');
    c.classList.add('dv-ghost');
    return c;
  }
  function dropNodeDragGhosts(nd){
    if (nd.ghost && nd.ghost.parentNode) nd.ghost.parentNode.removeChild(nd.ghost);
    if (nd.ghostBack && nd.ghostBack.parentNode) nd.ghostBack.parentNode.removeChild(nd.ghostBack);
    nd.ghost = null; nd.ghostBack = null;
  }
  function svgPointAt(svg, inv, clientX, clientY){
    var pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(inv);
  }
  function updateNodeDragGhost(ev){
    var nd = nodeDrag;
    if (!nd || !nd.moved) return;
    var svg = nd.el.ownerSVGElement;
    if (!svg || !svg.getScreenCTM) return;
    if (!nd.srcXY) nd.srcXY = nodeTranslateXY(nd.el);
    if (!nd.srcXY) return; /* unexpected markup: the drag still works, minus the ghost */
    if (!nd.ghost){
      nd.ghost = nodeGhostClone(nd.el);
      nd.el.parentNode.appendChild(nd.ghost);
    }
    /* the back ghost is a copy of ONE specific target — a target change
       throws it away so the preview never shows a stale card */
    if (nd.ghostBack && nd.ghostBackFor !== nd.target){
      if (nd.ghostBack.parentNode) nd.ghostBack.parentNode.removeChild(nd.ghostBack);
      nd.ghostBack = null;
    }
    if (nd.target){
      var tgtXY = nodeTranslateXY(nd.target);
      if (tgtXY){
        /* landing preview: the dragged card snaps into the target's slot,
           and a fainter copy of the target sits in the vacated slot — the
           swap exactly as it will land on release */
        nd.ghost.setAttribute('transform', 'translate(' + tgtXY.x + ' ' + tgtXY.y + ')');
        if (!nd.ghostBack){
          nd.ghostBack = nodeGhostClone(nd.target);
          nd.ghostBack.classList.add('dv-ghostback');
          nd.ghostBackFor = nd.target;
          nd.el.parentNode.appendChild(nd.ghostBack);
        }
        nd.ghostBack.setAttribute('transform', 'translate(' + nd.srcXY.x + ' ' + nd.srcXY.y + ')');
        return;
      }
    }
    var ctm = svg.getScreenCTM();
    if (!ctm) return;
    var inv;
    try { inv = ctm.inverse(); } catch (ex){ return; }
    var here = svgPointAt(svg, inv, ev.clientX, ev.clientY);
    var start = svgPointAt(svg, inv, nd.x0, nd.y0);
    if (!isFinite(here.x) || !isFinite(here.y) || !isFinite(start.x) || !isFinite(start.y)) return;
    nd.ghost.setAttribute('transform', 'translate(' + (nd.srcXY.x + (here.x - start.x)) +
                          ' ' + (nd.srcXY.y + (here.y - start.y)) + ')');
  }
  /* ---- drag a row grab-handle to move a whole layout row ---- */
  var rowDrag = null;
  /* rows snapshot per section at handle-injection time — handle indices
     and board geometry belong to the LAST RENDER, while the textarea can
     drift without one; a drag against drifted rows would move the wrong
     row, so it is refused instead (see updateRowDrag / mouseup) */
  var rowGrabRows = {};
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function cancelRowDrag(){
    if (!rowDrag) return;
    var rd = rowDrag;
    rowDrag = null;
    for (var i = 0; i < (rd.memberEls || []).length; i++)
      rd.memberEls[i].classList.remove('dv-dragsrc');
    if (rd.line && rd.line.parentNode) rd.line.parentNode.removeChild(rd.line);
    if (rd.grabEl && rd.grabEl.classList) rd.grabEl.classList.remove('dv-grabbing');
  }
  function sectionRowBoxes(secEl, rows){
    /* per layout row: the union box (svg coords) of its drawn member
       nodes, or null when none of them are drawn */
    var boxes = [];
    for (var i = 0; i < rows.length; i++){
      var ids = builderFlatRowIds([rows[i]]);
      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, seen = 0;
      for (var j = 0; j < ids.length; j++){
        var el = secEl.querySelector('g.node[data-dv-node="' + cssQuote(ids[j]) + '"]');
        if (!el) continue;
        var xy = nodeTranslateXY(el);
        var card = el.querySelector('.card');
        if (!xy || !card) continue;
        var w = parseFloat(card.getAttribute('width') || card.getAttribute('data-node-width')) || 0;
        var h = parseFloat(card.getAttribute('height') || card.getAttribute('data-node-height')) || 0;
        if (x1 > xy.x) x1 = xy.x;
        if (y1 > xy.y) y1 = xy.y;
        if (x2 < xy.x + w) x2 = xy.x + w;
        if (y2 < xy.y + h) y2 = xy.y + h;
        seen++;
      }
      boxes.push(seen ? {x1: x1, y1: y1, x2: x2, y2: y2} : null);
    }
    return boxes;
  }
  function sectionRowsFor(gi){
    var parsed = parseEditor();
    if (parsed.error) return null;
    var rec = specSectionPaths(parsed.raw)[gi];
    if (!rec) return null;
    var d = specValueAt(parsed.raw, rec.diagram);
    return (d && Array.isArray(d.rows)) ? d.rows : null;
  }
  function applyPanelEditorControls(){
    Array.prototype.forEach.call(view.querySelectorAll('[data-dv-panel]'),function(card){
      if(inDetailPreview(card))return;
      var editor=panelEditorForCard(card);
      if(editor.decoratePreview) editor.decoratePreview(card);
    });
  }
  function applyRowGrabs(){
    opts.refreshLayout();
    applyPanelEditorControls();
    /* inject one grab handle per layout row, left of the row band —
       workbench-only chrome (this file never runs on published pages).
       Handles are skipped when any row has no drawn nodes: without a
       box for every row there is no reliable drop geometry. */
    rowGrabRows = {};
    var secList = view.querySelectorAll('.doc-sec[data-dv-section]');
    for (var s = 0; s < secList.length; s++){
      var secEl = secList[s];
      if(inDetailPreview(secEl))continue;
      var old = secEl.querySelectorAll('g.dv-rowgrab');
      for (var o = 0; o < old.length; o++) old[o].parentNode.removeChild(old[o]);
      var anyNode = secEl.querySelector('g.node[data-dv-node]');
      if (!anyNode) continue;
      var secGi = parseInt(secEl.getAttribute('data-dv-section'), 10);
      var rows = sectionRowsFor(secGi);
      if (!rows) continue;
      rowGrabRows[secGi] = JSON.stringify(rows); /* also guard single-row group drags */
      if (rows.length < 2) continue;
      var boxes = sectionRowBoxes(secEl, rows);
      var complete = true;
      for (var b = 0; b < boxes.length; b++) if (!boxes[b]) complete = false;
      if (!complete) continue;
      var svg = anyNode.ownerSVGElement;
      for (var r = 0; r < boxes.length; r++){
        var box = boxes[r];
        var g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'dv-rowgrab');
        g.setAttribute('data-dv-row', String(r));
        var hx = Math.max(2, box.x1 - 30), hy = (box.y1 + box.y2) / 2 - 11;
        g.setAttribute('transform', 'translate(' + hx + ' ' + hy + ')');
        var bg = document.createElementNS(SVG_NS, 'rect');
        bg.setAttribute('class', 'dv-rowgrabbg');
        bg.setAttribute('width', '18'); bg.setAttribute('height', '22');
        bg.setAttribute('rx', '5');
        g.appendChild(bg);
        for (var dy = 0; dy < 3; dy++) for (var dx = 0; dx < 2; dx++){
          var dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('class', 'dv-rowgrabdot');
          dot.setAttribute('cx', String(6.5 + dx * 5));
          dot.setAttribute('cy', String(6 + dy * 5));
          dot.setAttribute('r', '1.4');
          g.appendChild(dot);
        }
        var tip = document.createElementNS(SVG_NS, 'title');
        tip.textContent = 'drag to move this row';
        g.appendChild(tip);
        svg.appendChild(g);
      }
    }
  }
  function updateRowDrag(ev){
    var rd = rowDrag;
    if (!rd || !rd.moved) return;
    if (!rd.boxes){
      var rows = sectionRowsFor(rd.gi);
      if (!rows || !rows[rd.row]){ cancelRowDrag(); return; }
      if (JSON.stringify(rows) !== rowGrabRows[rd.gi]){
        cancelRowDrag();
        inspectorMessage('the JSON rows changed since the last render — click Render, then drag');
        return;
      }
      var boxes = sectionRowBoxes(rd.secEl, rows);
      for (var b = 0; b < boxes.length; b++) if (!boxes[b]){ cancelRowDrag(); return; }
      rd.boxes = boxes;
      rd.memberEls = [];
      var ids = builderFlatRowIds([rows[rd.row]]);
      for (var i = 0; i < ids.length; i++){
        var el = rd.secEl.querySelector('g.node[data-dv-node="' + cssQuote(ids[i]) + '"]');
        if (el){ el.classList.add('dv-dragsrc'); rd.memberEls.push(el); }
      }
      if (rd.grabEl) rd.grabEl.classList.add('dv-grabbing');
    }
    var ctm = rd.svg.getScreenCTM();
    if (!ctm) return;
    var inv;
    try { inv = ctm.inverse(); } catch (ex){ return; }
    var pt = svgPointAt(rd.svg, inv, ev.clientX, ev.clientY);
    if (!isFinite(pt.y)) return;
    /* insertion gaps: above row 0, between each adjacent pair, below the
       last — pick the one nearest the cursor */
    var boxes2 = rd.boxes, gapYs = [boxes2[0].y1 - 8];
    for (var k = 1; k < boxes2.length; k++)
      gapYs.push((boxes2[k - 1].y2 + boxes2[k].y1) / 2);
    gapYs.push(boxes2[boxes2.length - 1].y2 + 8);
    var gap = 0;
    for (var gI = 1; gI < gapYs.length; gI++)
      if (Math.abs(pt.y - gapYs[gI]) < Math.abs(pt.y - gapYs[gap])) gap = gI;
    if (gap === rd.row || gap === rd.row + 1){
      /* landing here changes nothing — show no line */
      rd.gap = null;
      if (rd.line) rd.line.setAttribute('visibility', 'hidden');
      return;
    }
    rd.gap = gap;
    var lx1 = Infinity, lx2 = -Infinity;
    for (var m = 0; m < boxes2.length; m++){
      if (lx1 > boxes2[m].x1) lx1 = boxes2[m].x1;
      if (lx2 < boxes2[m].x2) lx2 = boxes2[m].x2;
    }
    if (!rd.line){
      rd.line = document.createElementNS(SVG_NS, 'line');
      rd.line.setAttribute('class', 'dv-rowline');
      rd.svg.appendChild(rd.line);
    }
    rd.line.setAttribute('visibility', 'visible');
    rd.line.setAttribute('x1', String(lx1));
    rd.line.setAttribute('x2', String(lx2));
    rd.line.setAttribute('y1', String(gapYs[gap]));
    rd.line.setAttribute('y2', String(gapYs[gap]));
  }
  function updateGroupDrag(ev){
    var gd = groupDrag;
    if (!gd || !gd.moved) return;
    gd.pick = null;
    if (gd.line) gd.line.setAttribute('visibility', 'hidden');
    if (!gd.rows){
      var parsed = parseEditor();
      if (parsed.error){ cancelGroupDrag(); inspectorMessage(parsed.error); return; }
      var got = builderDiagram(session.text(), parsed.raw, gd.gi);
      if (got.error){ cancelGroupDrag(); inspectorMessage(got.error); return; }
      if (JSON.stringify(got.d.rows) !== gd.rowsJSON || gd.rowsJSON !== gd.renderRowsJSON){
        cancelGroupDrag();
        inspectorMessage('the JSON rows changed since the last render — click Render, then drag');
        return;
      }
      gd.rows = got.d.rows;
      gd.raw = parsed.raw;
      gd.text = session.text();
      gd.members = Object.create(null);
      Object.keys(got.d.nodes || {}).forEach(function(id){
        if (got.d.nodes[id] && got.d.nodes[id].group === gd.key){
          gd.members[id] = true;
          var el = gd.secEl.querySelector('g.node[data-dv-node="' + cssQuote(id) + '"]');
          if (el){ el.classList.add('dv-dragsrc'); gd.memberEls.push(el); }
        }
      });
      gd.el.classList.add('dv-grabbing');
    }
    updateGapDrag(gd, ev, function(pick){
      return planMoveGroup(gd.text, gd.raw, gd.gi, gd.key, pick);
    }, cancelGroupDrag);
  }
  function updateNodeGapDrag(ev){
    var nd = nodeDrag;
    nd.pick = null;
    if (nd.line) nd.line.setAttribute('visibility', 'hidden');
    if (nd.target) return;
    var parsed = parseEditor();
    if (parsed.error){ cancelNodeDrag(); inspectorMessage(parsed.error); return; }
    var got = builderDiagram(session.text(), parsed.raw, nd.gi);
    if (got.error){ cancelNodeDrag(); inspectorMessage(got.error); return; }
    if (JSON.stringify(got.d.rows) !== nd.rowsJSON || nd.rowsJSON !== nd.renderRowsJSON){
      cancelNodeDrag();
      inspectorMessage('the JSON rows changed since the last render — click Render, then drag');
      return;
    }
    nd.rows = got.d.rows;
    if (!nd.svg || !nd.svg.getScreenCTM) return;
    updateGapDrag(nd, ev, function(pick){
      return planMoveNode(session.text(), parsed.raw, nd.gi, nd.id, pick);
    }, cancelNodeDrag);
  }
  function updateGapDrag(gd, ev, planFor, cancel){
    var boxes = sectionRowBoxes(gd.secEl, gd.rows);
    if (!boxes.length){ cancel(); return; }
    for (var b = 0; b < boxes.length; b++) if (!boxes[b]){ cancel(); return; }
    var ctm = gd.svg.getScreenCTM();
    if (!ctm) return;
    var inv;
    try { inv = ctm.inverse(); } catch (ex){ return; }
    var pt = svgPointAt(gd.svg, inv, ev.clientX, ev.clientY);
    if (!isFinite(pt.x) || !isFinite(pt.y)) return;
    var row = -1;
    for (var r = 0; r < boxes.length; r++){
      if (pt.y >= boxes[r].y1 - 6 && pt.y <= boxes[r].y2 + 6){ row = r; break; }
    }
    var pick, x1, x2, y1, y2;
    if (row >= 0){
      /* Treat each slot as a little row to union every card in a stack. */
      var slots = gd.rows[row];
      var slotBoxes = sectionRowBoxes(gd.secEl, slots.map(function(slot){ return [slot]; }));
      for (var s = 0; s < slotBoxes.length; s++) if (!slotBoxes[s]){ cancel(); return; }
      var gapXs = builderSlotGapXs(slotBoxes, row % 2 === 1);
      var slot = 0;
      for (var j = 1; j < gapXs.length; j++)
        if (Math.abs(pt.x - gapXs[j]) < Math.abs(pt.x - gapXs[slot])) slot = j;
      pick = {row: row, slot: slot};
      x1 = x2 = gapXs[slot]; y1 = boxes[row].y1 - 6; y2 = boxes[row].y2 + 6;
    } else {
      var gapYs = [boxes[0].y1 - 8];
      for (var k = 1; k < boxes.length; k++) gapYs.push((boxes[k - 1].y2 + boxes[k].y1) / 2);
      gapYs.push(boxes[boxes.length - 1].y2 + 8);
      var gap = 0;
      for (var g = 1; g < gapYs.length; g++)
        if (Math.abs(pt.y - gapYs[g]) < Math.abs(pt.y - gapYs[gap])) gap = g;
      pick = {gap: gap};
      x1 = Infinity; x2 = -Infinity;
      boxes.forEach(function(box){ x1 = Math.min(x1, box.x1); x2 = Math.max(x2, box.x2); });
      y1 = y2 = gapYs[gap];
    }
    /* The planner is also the no-op oracle, including whole-row removals
       and non-contiguous groups. Only a real destination gets a line. */
    if (planFor(pick).error) return;
    gd.pick = pick;
    if (!gd.line){
      gd.line = document.createElementNS(SVG_NS, 'line');
      gd.svg.appendChild(gd.line);
    }
    gd.line.setAttribute('class', row >= 0 ? 'dv-slotline' : 'dv-rowline');
    gd.line.setAttribute('visibility', 'visible');
    gd.line.setAttribute('x1', String(x1)); gd.line.setAttribute('x2', String(x2));
    gd.line.setAttribute('y1', String(y1)); gd.line.setAttribute('y2', String(y2));
  }
  life.listen(view,'mousedown', function(ev){
    if(inDetailPreview(ev.target))return;
    if (ev.button !== 0 || connect) return;
    if (!ev.target.closest) return;
    if (targetFromEvent(ev)) pausePreview();
    var grabEl = ev.target.closest('g.dv-rowgrab');
    if (grabEl && !addToStep){
      var grabSec = grabEl.closest('.doc-sec');
      var grabNode = grabSec && grabSec.querySelector('g.node[data-dv-node]');
      if (grabSec && grabSec.hasAttribute('data-dv-section') && grabNode){
        rowDrag = {secEl: grabSec, svg: grabNode.ownerSVGElement, grabEl: grabEl,
                   gi: parseInt(grabSec.getAttribute('data-dv-section'), 10),
                   row: parseInt(grabEl.getAttribute('data-dv-row'), 10),
                   x0: ev.clientX, y0: ev.clientY,
                   moved: false, gap: null, boxes: null, line: null, memberEls: []};
        ev.preventDefault(); /* no text selection while dragging */
      }
      return;
    }
    var nodeEl = ev.target.closest('g.node[data-dv-node]');
    if (nodeEl && !addToStep && !ev.target.closest('.nbackref, .nlink, a, button')){
      var ndSec = nodeEl.closest('.doc-sec');
      if (ndSec && ndSec.hasAttribute('data-dv-section')){
        var ndGi = parseInt(ndSec.getAttribute('data-dv-section'), 10);
        nodeDrag = {el: nodeEl, secEl: ndSec, svg: nodeEl.ownerSVGElement, id: nodeEl.getAttribute('data-dv-node'),
                    gi: ndGi, rowsJSON: JSON.stringify(sectionRowsFor(ndGi)), renderRowsJSON: rowGrabRows[ndGi],
                    x0: ev.clientX, y0: ev.clientY, moved: false, target: null, pick: null, line: null};
        ev.preventDefault(); /* no text selection while dragging */
      }
      return;
    }
    var groupEl = ev.target.closest('g.grp[data-dv-group]');
    if (groupEl && !nodeEl && !addToStep){
      var gdSec = groupEl.closest('.doc-sec');
      var gdSvg = groupEl.ownerSVGElement;
      if (gdSec && gdSec.hasAttribute('data-dv-section') && gdSvg && gdSvg.getScreenCTM){
        var gdGi = parseInt(gdSec.getAttribute('data-dv-section'), 10);
        groupDrag = {el: groupEl, secEl: gdSec, svg: gdSvg, gi: gdGi,
                     key: groupEl.getAttribute('data-dv-group'),
                     rowsJSON: JSON.stringify(sectionRowsFor(gdGi)), renderRowsJSON: rowGrabRows[gdGi],
                     x0: ev.clientX, y0: ev.clientY, moved: false, pick: null, line: null, memberEls: []};
        ev.preventDefault();
      }
      return;
    }
    var lbl = ev.target.closest('text.lbl[data-dv-edge]');
    if (!lbl) return;
    var svg = lbl.ownerSVGElement;
    if (!svg || !svg.getScreenCTM) return;
    var ctm = svg.getScreenCTM();
    if (!ctm) return;
    var inv, start;
    try {
      inv = ctm.inverse();
      start = svgPointAt(svg, inv, ev.clientX, ev.clientY);
    } catch (ex){ return; } /* non-invertible CTM: no drag, plain click still works */
    if (!isFinite(start.x) || !isFinite(start.y)) return;
    drag = {lbl: lbl, svg: svg, inv: inv, x0: start.x, y0: start.y, dx: 0, dy: 0, moved: false};
    ev.preventDefault(); /* no text selection while dragging */
  });
  life.listen(window,'mousemove', function(ev){
    if (rowDrag){
      var rdx = ev.clientX - rowDrag.x0, rdy = ev.clientY - rowDrag.y0;
      if (rdx * rdx + rdy * rdy > 25) rowDrag.moved = true; /* > 5px straight-line */
      if (rowDrag.moved) updateRowDrag(ev);
      return;
    }
    if (nodeDrag){
      var ddx = ev.clientX - nodeDrag.x0, ddy = ev.clientY - nodeDrag.y0;
      if (ddx * ddx + ddy * ddy > 25) nodeDrag.moved = true; /* > 5px straight-line */
      if (!nodeDrag.moved) return;
      nodeDrag.el.classList.add('dv-dragsrc');
      var over = document.elementFromPoint(ev.clientX, ev.clientY);
      var tgt = over && over.closest ? over.closest('g.node[data-dv-node]') : null;
      if (tgt && (tgt === nodeDrag.el || !nodeDrag.secEl.contains(tgt))) tgt = null;
      if (nodeDrag.target && nodeDrag.target !== tgt) nodeDrag.target.classList.remove('dv-droptgt');
      if (tgt) tgt.classList.add('dv-droptgt');
      nodeDrag.target = tgt;
      updateNodeDragGhost(ev);
      updateNodeGapDrag(ev);
      return;
    }
    if (groupDrag){
      var gdx = ev.clientX - groupDrag.x0, gdy = ev.clientY - groupDrag.y0;
      if (gdx * gdx + gdy * gdy > 25) groupDrag.moved = true;
      if (groupDrag.moved) updateGroupDrag(ev);
      return;
    }
    if (!drag) return;
    var pt = svgPointAt(drag.svg, drag.inv, ev.clientX, ev.clientY);
    drag.dx = pt.x - drag.x0;
    drag.dy = pt.y - drag.y0;
    if (drag.dx * drag.dx + drag.dy * drag.dy > 9) drag.moved = true; /* > 3 viewBox units, straight-line */
    if (drag.moved) drag.lbl.setAttribute('transform', 'translate(' + drag.dx + ' ' + drag.dy + ')');
  });
  life.listen(window,'mouseup', function(){
    if (rowDrag){
      var rd = rowDrag;
      var rdGap = rd.gap, rdMoved = rd.moved;
      cancelRowDrag(); /* classes + line off before any re-render */
      if (!rdMoved) return;
      suppressClick = true;
      life.delay(function(){ suppressClick = false; }, 0);
      if (rdGap == null) return; /* released on a no-move gap */
      var to = rdGap <= rd.row ? rdGap : rdGap - 1;
      if (to === rd.row) return;
      var rdParsed = parseEditor();
      if (rdParsed.error){ inspectorMessage(rdParsed.error); return; }
      var rdRec = specSectionPaths(rdParsed.raw)[rd.gi];
      var rdD = rdRec ? specValueAt(rdParsed.raw, rdRec.diagram) : null;
      if (!rdD || JSON.stringify(rdD.rows) !== rowGrabRows[rd.gi]){
        inspectorMessage('the JSON rows changed since the last render — click Render, then drag');
        return;
      }
      var rdPlan = planMoveRow(session.text(), rdParsed.raw, rd.gi, rd.row, to);
      if (rdPlan.error){ inspectorMessage(rdPlan.error); return; }
      if(!session.accept(rdPlan,{snapshot:rdParsed,beforePublish:clearMultiSelect}))return;
      rehighlight();
      return;
    }
    if (nodeDrag){
      var nd = nodeDrag;
      cancelNodeDrag();
      if (!nd.moved) return; /* a plain click: selection proceeds normally */
      suppressClick = true;
      life.delay(function(){ suppressClick = false; }, 0);
      if (!nd.target && !nd.pick) return; /* released without a destination */
      var ndParsed = parseEditor();
      if (ndParsed.error){ inspectorMessage(ndParsed.error); return; }
      var ndPlan;
      if (nd.target){
        ndPlan = planSwapNodes(session.text(), ndParsed.raw, nd.gi, nd.id,
                                 nd.target.getAttribute('data-dv-node'));
      } else {
        var ndGot = builderDiagram(session.text(), ndParsed.raw, nd.gi);
        if (ndGot.error){ inspectorMessage(ndGot.error); return; }
        if (JSON.stringify(ndGot.d.rows) !== nd.rowsJSON || nd.rowsJSON !== nd.renderRowsJSON){
          inspectorMessage('the JSON rows changed since the last render — click Render, then drag');
          return;
        }
        ndPlan = planMoveNode(session.text(), ndParsed.raw, nd.gi, nd.id, nd.pick);
        if (ndPlan.error === 'already there') return;
      }
      if (ndPlan.error){ inspectorMessage(ndPlan.error); return; }
      if(!session.accept(ndPlan,{snapshot:ndParsed,beforePublish:clearMultiSelect}))return;
      session.target = {section: nd.gi, kind: 'node', id: nd.id};
      session.insertSection = nd.gi;
      rehighlight();
      renderInspector();
      return;
    }
    if (groupDrag){
      var gd = groupDrag;
      cancelGroupDrag();
      if (!gd.moved) return;
      suppressClick = true;
      life.delay(function(){ suppressClick = false; }, 0);
      var gdParsed = parseEditor();
      if (gdParsed.error){ inspectorMessage(gdParsed.error); return; }
      var gdRec = specSectionPaths(gdParsed.raw)[gd.gi];
      var gdD = gdRec ? specValueAt(gdParsed.raw, gdRec.diagram) : null;
      if (!gdD || JSON.stringify(gdD.rows) !== gd.rowsJSON){
        inspectorMessage('the JSON rows changed since the last render — click Render, then drag');
        return;
      }
      if (!gd.pick) return;
      var gdPlan = planMoveGroup(session.text(), gdParsed.raw, gd.gi, gd.key, gd.pick);
      if (gdPlan.error){
        if (gdPlan.error !== 'already there') inspectorMessage(gdPlan.error);
        return;
      }
      if(!session.accept(gdPlan,{snapshot:gdParsed,beforePublish:clearMultiSelect}))return;
      session.target = {section: gd.gi, kind: 'group', id: gd.key};
      session.insertSection = gd.gi;
      rehighlight();
      renderInspector();
      return;
    }
    if (!drag) return;
    var d = drag;
    drag = null;
    if (!d.moved){ d.lbl.removeAttribute('transform'); return; }
    suppressClick = true; /* the click after a real drag is not a selection */
    /* that click fires (if at all) before timeouts run — self-clear so a
       drag released off-target cannot swallow the NEXT genuine click */
    life.delay(function(){ suppressClick = false; }, 0);
    d.lbl.removeAttribute('transform');
    var secEl = d.lbl.closest('.doc-sec');
    var gi = secEl ? parseInt(secEl.getAttribute('data-dv-section'), 10) : NaN;
    var idx = parseInt(d.lbl.getAttribute('data-dv-edge'), 10);
    if (isNaN(gi) || isNaN(idx)) return;
    var parsed = parseEditor();
    if (parsed.error){ inspectorMessage(parsed.error); return; }
    var target = {section: gi, kind: 'edge', index: idx};
    var path = builderTargetPath(parsed.raw, target);
    var e = path ? specValueAt(parsed.raw, path) : null;
    if (!e){ inspectorMessage('edge not found in the editor text — the render and the editor may be out of sync'); return; }
    var newDx = Math.round((typeof e.labelDx === 'number' ? e.labelDx : 0) + d.dx);
    var newDy = Math.round((typeof e.labelDy === 'number' ? e.labelDy : 0) + d.dy);
    if (!isFinite(newDx) || !isFinite(newDy)) return; /* never write NaN into the spec */
    var plan = planSetFields(session.text(), parsed.raw, path, [
      ['labelDx', newDx === 0 ? null : String(newDx)],
      ['labelDy', newDy === 0 ? null : String(newDy)]
    ]);
    if (plan.error){ inspectorMessage(plan.error); return; }
    if(!session.accept(plan,{snapshot:parsed,beforePublish:clearMultiSelect}))return;
    session.target = target;
    session.insertSection = gi;
    rehighlight();
    renderInspector();
  });

  life.listen(view,'click', function(ev){
    if(inDetailPreview(ev.target))return;
    if (suppressClick){ suppressClick = false; return; }
    var target = targetFromEvent(ev);
    if (target) pausePreview();
    if (addToStep){
      handleAddToStepClick(target);
      return;
    }
    if (connect){
      handleConnectClick(target);
      return;
    }
    if (!target) return;
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey){
      toggleMultiSelect(target);
      return;
    }
    if (multiSel.length) clearMultiSelect(); /* a plain click is single-select again */
    selectTarget(target);
  });


  /* ---- keyboard: Esc clears/cancels, Delete removes the selection ---- */
  life.listen(document,'keydown', function(ev){
    if(inDetailPreview(ev.target) || inDetailPreview(document.activeElement))return;
    if (opts.isActive && !opts.isActive()) return;
    if(document.querySelector('#object-clipboard[open], #panel-picker[open]'))return;
    if (ev.key === 'Escape'){
      if(ev.defaultPrevented)return; /* an owned importer consumed Escape */
      if (rowDrag){ cancelRowDrag(); return; }
      if (nodeDrag){ cancelNodeDrag(); return; }
      if (groupDrag){ cancelGroupDrag(); return; }
      if(opts.dismissOverlay())return;
      if (addToStep){ cancelAddToStep('add-to-step ended'); return; }
      if (connect){ cancelConnect('connect cancelled'); return; }
      if (multiSel.length){ clearMultiSelect(); dropMultiUI(); return; }
      if (session.target){
        session.target = null;
        setSelected(null);
        if (guide) guide.hidden = true;
        retireInspector();
      }
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace'){
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' ||
                 ae.tagName === 'BUTTON' || ae.isContentEditable)) return;
      if (multiSel.length){
        ev.preventDefault();
        if (addToStep){
          formError('finish ADD TO STEP first (DONE or Esc) — delete is paused while the mode is armed');
          return;
        }
        bulkDeleteSelected();
        return;
      }
      if (!session.target) return;
      ev.preventDefault();
      if (addToStep){
        formError('finish ADD TO STEP first (DONE or Esc) — delete is paused while the mode is armed');
        return;
      }
      deleteCurrent();
    }
  });


  function cancelGestures(){
    cancelNodeDrag();cancelGroupDrag();cancelRowDrag();
    if(drag){drag.lbl.removeAttribute('transform');drag=null;}
  }
  function beforeReplace(request){
    var retention=request && request.retention || {};
    cancelGestures();
    if(!retention.multi && multiSel.length){clearMultiSelect();dropMultiUI();}
    if(connect)cancelConnect('connect cancelled — the page re-rendered');
    if(addToStep && !retention.addMode)cancelAddToStep('add-to-step ended — the page re-rendered');
    setSelected(null);
  }
  function retire(){
    cancelGestures();addToStep=null;connect=null;clipboardHomeTarget=null;suppressClick=false;
    clearAddModeChrome();clearMultiSelect();clearStepMarkers();setSelected(null);rowGrabRows={};
  }
  return {
    setSelected:life.guard(setSelected),
    updateTargetLabel:life.guard(updateTargetLabel),
    markInsertTarget:life.guard(markInsertTarget),
    findTargetEl:life.guard(findTargetEl),
    rehighlight:life.guard(rehighlight),
    clearStepMarkers:life.guard(clearStepMarkers),
    stepperFor:life.guard(stepperFor),
    pausePreview:life.guard(pausePreview),
    syncBoardToSelectedStep:life.guard(syncBoardToSelectedStep),
    applyStepMarkers:life.guard(applyStepMarkers),
    clipboardSelection:life.guard(clipboardSelection),
    homeClipboardSelect:life.guard(homeClipboardSelect),
    clipboardDestination:life.guard(clipboardDestination),
    deleteCurrent:life.guard(deleteCurrent),
    clearMultiSelect:life.guard(clearMultiSelect),
    reapplyMultiSel:life.guard(reapplyMultiSel),
    bulkDeleteSelected:life.guard(bulkDeleteSelected),
    selectTarget:life.guard(selectTarget),
    cancelAddToStep:life.guard(cancelAddToStep),
    cancelConnect:life.guard(cancelConnect),
    startConnect:life.guard(startConnect),
    applyRowGrabs:life.guard(applyRowGrabs),
    clearHome:life.guard(function(){clipboardHomeTarget=null;}),
    adding:function(){return life.alive()?addToStep:null;},connecting:function(){return life.alive()?connect:null;},
    selection:function(){return life.alive()?multiSel:[];},
    busy:function(){return life.alive() && !!(addToStep || connect || drag || rowDrag || nodeDrag || groupDrag);},
    toggleAdding:life.guard(function(t){if(addToStep){cancelAddToStep(null);return;}if(connect)cancelConnect(null);addToStep={section:t.section,step:t.index};addToStepStatus();renderInspector();}),
    beforeReplace:life.guard(beforeReplace),retire:life.guard(retire),
    destroy:function(){if(!life.alive())return;life.destroy();retire();
      Array.prototype.forEach.call(view.querySelectorAll('.dv-rowgrab,.home-layout-button'),function(el){el.remove();});
      Array.prototype.forEach.call(view.querySelectorAll('.dv-inserttarget'),function(el){el.classList.remove('dv-inserttarget');});
    }
  };
}

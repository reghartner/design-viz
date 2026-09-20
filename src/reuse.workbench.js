/* Native dialog keeps background selection and builder shortcuts out of a reuse edit. */
function initWorkbenchStepReuse(opts){
  var life=createWorkbenchLifetime(),rowsLife=createWorkbenchLifetime(),surface=null;
  life.own(function(){rowsLife.destroy();});
  function clearPreview(){if(surface)cancelPanelMotion(surface);surface=null;}
  var dialog = document.getElementById('step-reuse');
  if (!dialog) return null;
  function el(id){ return document.getElementById('reuse-' + id); }
  var source = el('source'), mode = el('mode'), placement = el('placement'), list = el('list');
  var search = el('search'), feedback = el('feedback'), apply = el('apply'), preview = el('preview');
  var beat = el('beat'), panel = el('panel'), panelHost = el('panel-body'), state = el('state');
  var snapshot = null, selected = new Set(), plan = null, model = null, lastIndex = null;
  var page = 0, pageSize = 100, filtered = [], rows = [], opener = null;
  function isCurrent(){
    var ctx = opts.context();
    return snapshot && ctx && ctx.text === snapshot.text && ctx.section === snapshot.section &&
      ctx.pathId === snapshot.pathId && ctx.index === snapshot.index;
  }
  function invalidate(){
    plan = null; model = null; apply.disabled = true; preview.hidden = true;
    feedback.textContent = 'The source or selection changed. Close this picker, Render, and open it again.';
  }
  function currentSource(){ return snapshot.diagram.paths.find(function(p){ return p.id === source.value; }); }
  function selectedIds(){ return currentSource().steps.filter(function(id){ return selected.has(id); }); }
  function option(select, value, label){ var o = document.createElement('option'); o.value = String(value); o.textContent = label; select.appendChild(o); }
  function paintPanel(){
    if (!isCurrent()){ invalidate(); return; }
    if (!model) return;
    var i = Number(beat.value), decl = (model.diagram.panels || []).find(function(p){ return p.id === panel.value; });
    clearPreview();panelHost.textContent = ''; state.textContent = '';
    if (!decl){ panelHost.textContent = 'This diagram has no panels. Review the destination steps above.'; return; }
    var snapshots = model.states[decl.id] || [], value = snapshots[i] || {};
    /* Renderers cache markup on their host. A fresh surface also prevents
       a previous panel type from contributing its presentation state. */
    surface = document.createElement('div'); panelHost.appendChild(surface);
    renderPanelBody(surface, decl, value, 'daylight', snapshots, i, false);
    state.textContent = JSON.stringify(value, null, 2);
  }
  function updatePreview(){
    if (!isCurrent()){ invalidate(); return; }
    plan = planReuseSteps(snapshot.text, snapshot.raw, snapshot.section, snapshot.pathId, snapshot.index,
      {sourcePath:source.value, stepIds:selectedIds(), mode:mode.value, placement:placement.value});
    el('selection').textContent = selected.size + ' selected';
    el('mode-note').textContent = mode.value === 'copy' ? 'Copies can be edited independently. Other paths keep their original steps.' :
      'Shared steps have one body. Editing a shared step changes every path that uses it.';
    apply.disabled = !!plan.error; preview.hidden = !!plan.error;
    feedback.textContent = plan.error || '';
    if (plan.error){ model = null; return; }
    model = builderReusePreview(JSON.parse(plan.text), snapshot.section, snapshot.pathId);
    if (model.error){ feedback.textContent = model.error; apply.disabled = true; preview.hidden = true; return; }
    beat.innerHTML = '';
    model.diagram.steps.forEach(function(s, i){
      option(beat, i, (i + 1) + ' · ' + (s.text || s.id) + (plan.insertedIds.indexOf(s.id) >= 0 ? ' · ' + (mode.value === 'copy' ? 'copy' : 'shared') : ''));
    });
    beat.value = String(plan.position);
    var priorPanel = panel.value;
    panel.innerHTML = '';
    (model.diagram.panels || []).forEach(function(p){ option(panel, p.id, p.title || p.id); });
    var preferred = (model.diagram.panels || []).find(function(p){ return p.id === priorPanel; }) ||
      (model.diagram.panels || []).find(function(p){ return p.id === model.diagram.primaryPanel; }) || (model.diagram.panels || [])[0];
    panel.value = preferred ? preferred.id : ''; panel.disabled = !preferred;
    el('result').textContent = snapshot.label + ' · ' + model.diagram.steps.length + ' steps after this change';
    apply.textContent = (mode.value === 'copy' ? 'Copy ' : 'Share ') + selected.size + (selected.size === 1 ? ' step' : ' steps');
    paintPanel();
  }
  function paintRows(){
    rowsLife.destroy();rowsLife=createWorkbenchLifetime();
    list.innerHTML = ''; rows = [];
    var sourcePath = currentSource(), terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var byId = new Map(); snapshot.diagram.steps.forEach(function(s){ if (s && s.id) byId.set(s.id, s); });
    filtered = sourcePath.steps.map(function(id, i){ return {id:id, index:i, step:byId.get(id)}; }).filter(function(row){
      var text = [row.index + 1, row.id, row.step.text || ''].join(' ').toLowerCase();
      return terms.every(function(term){ return text.indexOf(term) >= 0; });
    });
    page = Math.max(0, Math.min(page, Math.ceil(filtered.length / pageSize) - 1));
    filtered.slice(page * pageSize, (page + 1) * pageSize).forEach(function(row){
      var item = document.createElement('div'); item.className = 'reuse-step';
      var label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(row.id);
      check.setAttribute('aria-label', 'Reuse step ' + (row.index + 1) + ': ' + (row.step.text || row.id));
      rowsLife.listen(check,'click', function(ev){
        if (!isCurrent()){ invalidate(); return; }
        var anchor = filtered.findIndex(function(r){ return r.index === lastIndex; });
        var at = filtered.findIndex(function(r){ return r.index === row.index; });
        if (ev.shiftKey && anchor >= 0){
          filtered.slice(Math.min(anchor, at), Math.max(anchor, at) + 1).forEach(function(r){ check.checked ? selected.add(r.id) : selected.delete(r.id); });
        } else { check.checked ? selected.add(row.id) : selected.delete(row.id); }
        lastIndex = row.index;
        rows.forEach(function(r){ r.check.checked = selected.has(r.id); }); updatePreview();
      });
      var caption = document.createElement('span'); caption.textContent = (row.index + 1) + '. ' + (row.step.text || 'Untitled step');
      var meta = document.createElement('small'); meta.textContent = row.id + (snapshot.destination.steps.indexOf(row.id) >= 0 ? ' · already in destination' : '');
      caption.appendChild(meta); label.appendChild(check); label.appendChild(caption); item.appendChild(label);
      var rest = document.createElement('button'); rest.type = 'button'; rest.className = 'bbtn'; rest.textContent = 'Continue from here';
      rest.setAttribute('aria-label', 'Continue from source step ' + (row.index + 1));
      rowsLife.listen(rest,'click', function(){
        if (!isCurrent()){ invalidate(); return; }
        selected = new Set(sourcePath.steps.slice(row.index)); placement.value = 'rest'; lastIndex = row.index;
        paintRows(); updatePreview();
      });
      item.appendChild(rest); list.appendChild(item); rows.push({id:row.id, check:check});
    });
    el('page').textContent = filtered.length ? (page * pageSize + 1) + '–' + Math.min((page + 1) * pageSize, filtered.length) + ' of ' + filtered.length : 'No matching steps';
    el('previous').disabled = page === 0; el('next').disabled = (page + 1) * pageSize >= filtered.length;
    el('paging').hidden = filtered.length <= pageSize;
  }
  function close(focus){ clearPreview();rowsLife.destroy();rowsLife=createWorkbenchLifetime();dialog.close(); snapshot = null; plan = null; model = null; panelHost.textContent = ''; if (focus!==false && opener) opener.focus({preventScroll:true});opener=null; }
  function open(){
    var ctx = opts.context();
    if (!ctx) return;
    snapshot = ctx; selected = new Set(); lastIndex = null; page = 0; search.value = ''; mode.value = 'copy'; placement.value = 'after'; apply.textContent = 'Copy steps';
    opener = document.activeElement;
    source.innerHTML = '';
    diagramPathList(snapshot.diagram).forEach(function(p){ option(source, p.id, p.label); });
    source.value = (snapshot.diagram.paths.find(function(p){ return p.id !== snapshot.pathId; }) || snapshot.destination).id;
    el('destination').textContent = 'Into ' + snapshot.label + ' · selected step ' + (snapshot.position + 1) + ': ' + (snapshot.diagram.steps[snapshot.index].text || snapshot.diagram.steps[snapshot.index].id);
    paintRows(); updatePreview(); if (opts.pause) opts.pause(); dialog.showModal(); source.focus();
  }
  life.listen(source,'change', function(){ if (!isCurrent()){ invalidate(); return; } selected.clear(); lastIndex = null; page = 0; search.value = ''; paintRows(); updatePreview(); });
  life.listen(search,'input', function(){ if (!isCurrent()){ invalidate(); return; } page = 0; paintRows(); });
  life.listen(el('clear'),'click', function(){ if (!isCurrent()){ invalidate(); return; } selected.clear(); lastIndex = null; paintRows(); updatePreview(); });
  life.listen(mode,'change', updatePreview); life.listen(placement,'change', updatePreview);
  life.listen(beat,'change', paintPanel); life.listen(panel,'change', paintPanel);
  ['previous','next'].forEach(function(name){ life.listen(el(name),'click', function(){ if (!isCurrent()){ invalidate(); return; } page += name === 'next' ? 1 : -1; paintRows(); }); });
  life.listen(el('cancel'),'click', close);
  life.listen(dialog,'cancel', function(ev){ ev.preventDefault(); close(); });
  life.listen(dialog,'keydown', function(ev){ ev.stopPropagation(); });
  life.listen(dialog,'click', function(ev){ ev.stopPropagation(); });
  life.listen(opts.src,'input', function(){ if (dialog.open) invalidate(); });
  life.listen(apply,'click', function(){
    if (!isCurrent()){ invalidate(); return; }
    if (!plan || plan.error || apply.disabled) return;
    var pending = plan, section = snapshot.section; close(); opts.apply(pending, section);
  });
  return {open:life.guard(open), refresh:life.guard(function(){ if (dialog.open && !isCurrent()) invalidate(); }),
    destroy:function(){if(!life.alive())return;life.destroy();close(false);rowsLife.destroy();list.innerHTML='';}};
}

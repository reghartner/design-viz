/* Reuse changes path references and authored patches, never folded snapshots. */
function builderPathOccurrence(text, raw, section, pathId, index){
  var got = builderDiagram(text, raw, section);
  if (got.error) return got;
  var errors = [];
  validatePaths(got.d, 'diagram', errors);
  if (errors.length) return {error:errors.join('\n')};
  if (!Array.isArray(got.d.paths)) return {error:'Create an alternate path first.'};
  var path = got.d.paths.find(function(p){ return p.id === pathId; });
  if (!path) return {error:'Path no longer exists. Select it again.'};
  var step = Number.isInteger(index) && got.d.steps[index];
  var position = step ? path.steps.indexOf(step.id) : -1;
  if (position < 0) return {error:'Select a step in the destination path first.'};
  return {diagram:got.d, path:got.path, route:path, position:position, step:step};
}
function builderReuseResult(text, raw, context, pathId, mutate){
  var result = {}, plan = builderRewrite(text, raw, context.path, function(d){
    var route = d.paths.find(function(p){ return p.id === pathId; });
    var error = mutate(d, route, result);
    if (error) return {error:error};
    var errors = []; validatePaths(d, 'diagram', errors);
    if (errors.length) return {error:errors.join('\n')};
  });
  if (plan.error) return plan;
  plan.kind = 'step'; plan.pathId = pathId; plan.index = result.index;
  plan.position = result.position; plan.insertedIds = result.insertedIds || [];
  var range = jsonLocate(plan.text, context.path.concat(['steps', plan.index]));
  if (range){ plan.start = range.start; plan.end = range.end; }
  return plan;
}
function planReuseSteps(text, raw, section, pathId, index, options){
  var ctx = builderPathOccurrence(text, raw, section, pathId, index);
  if (ctx.error) return ctx;
  options = options || {};
  var source = ctx.diagram.paths.find(function(p){ return p.id === options.sourcePath; });
  if (!source) return {error:'Choose an existing source path.'};
  if (['copy','share'].indexOf(options.mode) < 0) return {error:'Choose independent copies or shared steps.'};
  if (['after','replace','rest'].indexOf(options.placement) < 0) return {error:'Choose where to place the steps.'};
  var ids = options.stepIds;
  if (!Array.isArray(ids) || !ids.length) return {error:'Choose at least one source step.'};
  if (new Set(ids).size !== ids.length || ids.some(function(id){ return source.steps.indexOf(id) < 0; }))
    return {error:'Choose each step once from the source path.'};
  /* Always preserve source order, even when checkboxes were selected backwards. */
  ids = source.steps.filter(function(id){ return ids.indexOf(id) >= 0; });
  return builderReuseResult(text, raw, ctx, pathId, function(d, route, result){
    var position = ctx.position + (options.placement === 'replace' ? 0 : 1);
    var remove = options.placement === 'replace' ? 1 : options.placement === 'rest' ? route.steps.length - position : 0;
    var remaining = route.steps.slice(0, position).concat(route.steps.slice(position + remove));
    if (options.mode === 'share'){
      var collisions = ids.filter(function(id){ return remaining.indexOf(id) >= 0; });
      if (collisions.length) return 'Already used in this path: ' + collisions.join(', ') + '. Choose Copy and customize, or replace those occurrences.';
    }
    var registry = new Map(), taken = Object.create(null);
    d.steps.forEach(function(s){ if (s && s.id){ registry.set(s.id, s); taken[s.id] = true; } });
    var inserted = ids.map(function(id){
      if (options.mode === 'share') return id;
      var copy = builderClone(registry.get(id));
      copy.id = builderUniqueKey(taken, id + '-copy'); taken[copy.id] = true;
      d.steps.push(copy); return copy.id;
    });
    var next = route.steps.slice(0, position).concat(inserted, route.steps.slice(position + remove));
    if (JSON.stringify(next) === JSON.stringify(route.steps)) return 'These shared steps are already in that position.';
    route.steps = next;
    result.index = d.steps.findIndex(function(s){ return s.id === inserted[0]; });
    result.position = position; result.insertedIds = inserted;
  });
}
function planPathOccurrenceEdit(text, raw, section, pathId, index, action){
  var ctx = builderPathOccurrence(text, raw, section, pathId, index);
  if (ctx.error) return ctx;
  return builderReuseResult(text, raw, ctx, pathId, function(d, route, result){
    if (action === 'independent'){
      var sharing = d.paths.filter(function(p){ return p.steps.indexOf(ctx.step.id) >= 0; });
      if (sharing.length < 2) return 'This step is already independent of the other paths.';
      var taken = Object.create(null); d.steps.forEach(function(s){ if (s && s.id) taken[s.id] = true; });
      var copy = builderClone(d.steps[index]); copy.id = builderUniqueKey(taken, copy.id + '-copy');
      result.index = d.steps.length; d.steps.push(copy); route.steps[ctx.position] = copy.id;
      result.position = ctx.position;
    } else if (action === 'remove'){
      if (route.steps.length === 1) return 'Keep at least one step in this path. Add a step or remove the alternate instead.';
      route.steps.splice(ctx.position, 1);
      result.position = Math.min(ctx.position, route.steps.length - 1);
      result.index = d.steps.findIndex(function(s){ return s.id === route.steps[result.position]; });
    } else return 'Unknown step occurrence action.';
  });
}
function builderReusePreview(raw, section, pathId){
  var rec = specSectionPaths(raw)[section], d = rec && specValueAt(raw, rec.diagram);
  if (!d || !Array.isArray(d.paths) || !d.paths.some(function(p){ return p.id === pathId; }))
    return {error:'Destination path no longer exists.'};
  var diagram = diagramForPath(d, pathId), states;
  try { states = foldPanelStates(diagram); }
  catch (ex){ return {error:'Unable to preview panel state. Fix the diagram validation errors first.'}; }
  return {diagram:diagram, states:states};
}

/* Native dialog keeps background selection and builder shortcuts out of a reuse edit. */
function initWorkbenchStepReuse(opts){
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
    panelHost.textContent = ''; state.textContent = '';
    if (!decl){ panelHost.textContent = 'This diagram has no panels. Review the destination steps above.'; return; }
    var snapshots = model.states[decl.id] || [], value = snapshots[i] || {};
    /* Renderers cache markup on their host. A fresh surface also prevents
       a previous panel type from contributing its presentation state. */
    var surface = document.createElement('div'); panelHost.appendChild(surface);
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
      check.addEventListener('click', function(ev){
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
      rest.addEventListener('click', function(){
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
  function close(){ dialog.close(); snapshot = null; plan = null; model = null; panelHost.textContent = ''; if (opener) opener.focus({preventScroll:true}); }
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
  source.addEventListener('change', function(){ if (!isCurrent()){ invalidate(); return; } selected.clear(); lastIndex = null; page = 0; search.value = ''; paintRows(); updatePreview(); });
  search.addEventListener('input', function(){ if (!isCurrent()){ invalidate(); return; } page = 0; paintRows(); });
  el('clear').addEventListener('click', function(){ if (!isCurrent()){ invalidate(); return; } selected.clear(); lastIndex = null; paintRows(); updatePreview(); });
  mode.addEventListener('change', updatePreview); placement.addEventListener('change', updatePreview);
  beat.addEventListener('change', paintPanel); panel.addEventListener('change', paintPanel);
  ['previous','next'].forEach(function(name){ el(name).addEventListener('click', function(){ if (!isCurrent()){ invalidate(); return; } page += name === 'next' ? 1 : -1; paintRows(); }); });
  el('cancel').addEventListener('click', close);
  dialog.addEventListener('cancel', function(ev){ ev.preventDefault(); close(); });
  dialog.addEventListener('keydown', function(ev){ ev.stopPropagation(); });
  dialog.addEventListener('click', function(ev){ ev.stopPropagation(); });
  opts.src.addEventListener('input', function(){ if (dialog.open) invalidate(); });
  apply.addEventListener('click', function(){
    if (!isCurrent()){ invalidate(); return; }
    if (!plan || plan.error || apply.disabled) return;
    var pending = plan, section = snapshot.section; close(); opts.apply(pending, section);
  });
  return {open:open, refresh:function(){ if (dialog.open && !isCurrent()) invalidate(); }};
}

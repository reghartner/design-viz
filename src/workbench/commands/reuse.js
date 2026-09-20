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
  return builderNarrativeResult(text, raw, context.path, function(d, result){
    var route = d.paths.find(function(p){ return p.id === pathId; });
    var selection = {}, error = mutate(d, route, selection);
    if (error) return {error:error};
    result.pathId = pathId; result.index = selection.index;
    result.position = selection.position; result.insertedIds = selection.insertedIds || [];
  });
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
      (d.layouts || []).forEach(function(v){if(Array.isArray(v.steps) && v.steps.indexOf(ctx.step.id)>=0)v.steps.push(copy.id);});
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

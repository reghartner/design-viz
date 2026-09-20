/* Pure shared-step deletion, used by common bulk dispatch. Remaining
   narrative planners still live in builder.workbench.js until the next slice. */

function planDeleteStep(text, raw, sectionIdx, stepIdx){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (!Array.isArray(got.d.steps) || !got.d.steps[stepIdx])
    return {error: 'step not found — reselect and try again'};
  var id=got.d.steps[stepIdx].id;
  if((got.d.layouts || []).some(function(v){return Array.isArray(v.steps) && v.steps.length===1 && v.steps[0]===id;}))return {error:'This is the only selected step in a view. Choose another step in that view first.'};
  if (got.d.paths){
    if (got.d.paths.some(function(p){return p.steps.length === 1 && p.steps[0] === id;}))
      return {error:'This is the only step in a path. Remove that path or add another step first.'};
  }
  return builderRewrite(text, raw, got.path, function(d){
    d.steps.splice(stepIdx,1);
    (d.paths || []).forEach(function(p){p.steps=p.steps.filter(function(ref){return ref!==id;});});
    (d.layouts || []).forEach(function(v){if(Array.isArray(v.steps))v.steps=v.steps.filter(function(ref){return ref!==id;});});
  });
}

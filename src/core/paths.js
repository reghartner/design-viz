/* Pure step/path projection. Uses shared isHex() and navigation stepIndexOf()
   at call time; indices always refer to the authored source step registry. */

function stepKeys(st){
  if (!st) return [];
  if (Array.isArray(st.edges)) return st.edges;
  if (st.edge) return [st.edge];
  return [];
}
var COMM_FAILURE_MODES = ['dropped','blocked'];
function stepFailures(st){
  var raw = st && st.failures, out = Object.create(null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.keys(raw).forEach(function(key){
    if (COMM_FAILURE_MODES.indexOf(raw[key]) >= 0) out[key] = raw[key];
  });
  return out;
}
function stepDeliveredKeys(st){
  var failures = stepFailures(st);
  return stepKeys(st).filter(function(key){return !Object.prototype.hasOwnProperty.call(failures,key);});
}
function stepNodes(st){
  return (st && Array.isArray(st.nodes)) ? st.nodes : [];
}
function stepPanelPatch(st){
  if (!st) return null;
  if (st.panels && typeof st.panels === 'object' && !Array.isArray(st.panels)) return st.panels;
  if (st.patch && typeof st.patch === 'object' && !Array.isArray(st.patch)) return st.patch;
  return null;
}
function stepTonePatch(st){
  if (!st || !st.tone || typeof st.tone !== 'object' || Array.isArray(st.tone)) return null;
  return st.tone;
}

/* Paths reference a shared step registry. Folding always receives just the
   selected sequence, so another outcome cannot leak state into this one. */
function diagramPathList(d){
  var steps = Array.isArray(d.steps) ? d.steps : [], byId = new Map();
  steps.forEach(function(s,i){ if (s && typeof s.id === 'string') byId.set(s.id,i); });
  var colors = ['#38bdf8','#fb923c','#c084fc','#f472b6','#4ade80'];
  var paths = Array.isArray(d.paths) ? d.paths.filter(function(p){
    return p && typeof p.id === 'string' && p.id && Array.isArray(p.steps) && p.steps.length &&
      p.steps.every(function(id){ return byId.has(id); });
  }).map(function(p,i){
    return {id:p.id, label:p.label || (i ? p.id : 'Happy path'), color:isHex(p.color) ? p.color : colors[i % colors.length],
      indices:p.steps.map(function(id){ return byId.get(id); })};
  }) : [];
  return paths.length ? paths : [{id:'happy',label:'Happy path',color:colors[0],indices:steps.map(function(s,i){return i;})}];
}
function diagramForPath(d, id){
  var paths = diagramPathList(d), path = paths.find(function(p){ return p.id === id; }) || paths[0];
  return Object.assign({}, d, {steps:path.indices.map(function(i){ return d.steps[i]; }),
    _sourceIndices:path.indices, _pathId:path.id});
}
/* Exact host navigation uses the complete path, never a named view's visible
   stops. Missing paths return null; missing steps retain the path with -1
   indices so hosts can keep their existing distinct, recoverable errors. */
function resolveSourceStep(d, pathId, stepRef){
  var path = diagramPathList(d).find(function(p){return p.id === pathId;});
  if (!path) return null;
  var ids = path.indices.map(function(index){return d.steps[index].id;});
  var index = stepIndexOf(ids, stepRef);
  return {path:path, pathIndex:index, sourceIndex:index < 0 ? -1 : path.indices[index]};
}
/* Color a branch starting at its first differing step; every common-prefix
   beat stays shared. A wholly shared path has start > end. Compare earlier
   declarations so nested alternatives keep stable rows too. */
function pathStepRows(paths){
  return paths.map(function(path,i){
    var shared = 0;
    paths.slice(0,i).forEach(function(prior){
      var n = 0;
      while (n < path.indices.length && n < prior.indices.length && path.indices[n] === prior.indices[n]) n++;
      shared = Math.max(shared,n);
    });
    return {path:path, start:i ? shared : 0, end:path.indices.length - 1};
  });
}

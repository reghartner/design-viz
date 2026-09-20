/* Pure authored steps, paths, communications and panel patches. Source step
   indices and path occurrences remain distinct from filtered viewer stops. */

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

/* ---------------- insert planners ----------------
   Each takes the CURRENT editor text plus its parsed form and returns
   {text, start, end, ...} on success or {error} with a plain sentence. */

function planAddStep(text, raw, sectionIdx, pathId){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (got.d.paths) return planPathStepEdit(text,raw,sectionIdx,pathId,-1,'add');
  var edges = Array.isArray(got.d.edges) ? got.d.edges : [];
  /* prefer an edge no step uses as its FIRST hop, so the new numbered coin
     gets its own midpoint (two steps sharing a first hop stack coins) */
  var used = {};
  (got.d.steps || []).forEach(function(st){
    var k = st && (st.edge || (Array.isArray(st.edges) && st.edges[0]));
    if (typeof k === 'string') used[k] = true;
  });
  var pick = null;
  for (var i = 0; i < edges.length; i++){
    var e = edges[i] || {};
    var k = e.from + '->' + e.to;
    if (!used[k]){ pick = k; break; }
  }
  if (!pick && edges.length) pick = (edges[0] || {}).from + '->' + (edges[0] || {}).to;
  var item = JSON.stringify(Object.assign(pick ? {edge:pick} : {}, {text:'Describe what happens in this step'}));
  var r = jsonInsertListItemOrCreate(text, got.path, 'steps', item);
  if (!r) return {error: 'could not edit steps in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'step',
          index: (got.d.steps || []).length};
}
function builderViewStepsError(d){
  var view=(d.layouts || []).find(function(v){return Array.isArray(v.steps) && !sectionViewStepsReachable(d,v.steps);});
  return view?{error:'Choose another step in view "'+view.name+'" before removing its last reachable step or path.'}:null;
}
/* Finalize a cloned diagram edit once. The mutator returns its existing error
   shape and writes explicit selection metadata: index is a raw registry slot,
   pathId is a route identity, and optional position is a route occurrence.
   These are never indices in a filtered viewer. Failure publishes no text. */
function builderNarrativeResult(text, raw, path, mutate){
  var result = {}, plan = builderRewrite(text, raw, path, function(d){
    var error = mutate(d, result);
    if (error) return error;
    var errors = []; validatePaths(d, 'diagram', errors);
    if (errors.length) return {error:errors.join('\n')};
    return builderViewStepsError(d);
  });
  if (plan.error) return plan;
  Object.assign(plan, {kind:'step'}, result);
  var range = jsonLocate(plan.text, path.concat(['steps', result.index]));
  if (range){ plan.start = range.start; plan.end = range.end; }
  return plan;
}
function planMoveStep(text, raw, sectionIdx, stepIdx, delta, pathId){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (got.d.paths) return planPathStepEdit(text,raw,sectionIdx,pathId,stepIdx,delta < 0 ? 'earlier' : 'later');
  var steps = got.d.steps;
  var to = stepIdx + delta;
  if (!Array.isArray(steps) || !steps[stepIdx]) return {error: 'step not found'};
  if (to < 0 || to >= steps.length) return {error: 'already at that end'};
  var r = builderRewrite(text, raw, got.path.concat(['steps']), function(copy){
    var item = copy.splice(stepIdx, 1)[0];
    copy.splice(to, 0, item);
  });
  if (r.error) return r;
  r.index = to;
  return r;
}

function planDuplicateStep(text, raw, sectionIdx, stepIdx, pathId){
  var got = builderDiagram(text, raw, sectionIdx);
  if (got.error) return got;
  if (got.d.paths) return planPathStepEdit(text,raw,sectionIdx,pathId,stepIdx,'duplicate');
  var steps = got.d.steps;
  if (!Number.isInteger(stepIdx) || !Array.isArray(steps) || !steps[stepIdx]) return {error:'step not found'};
  var clone = builderClone(steps[stepIdx]);
  if (typeof clone.id === 'string' && clone.id){
    var taken = Object.create(null);
    steps.forEach(function(step){ if (step && typeof step.id === 'string') taken[step.id] = true; });
    clone.id = builderUniqueKey(taken, clone.id + '-copy');
  }
  var r = jsonInsertArrayItemAfter(text, got.path.concat(['steps']), stepIdx, JSON.stringify(clone, null, 2));
  if (!r) return {error:'could not edit steps in the editor text'};
  return {text:r.text, start:r.start, end:r.end, kind:'step', index:stepIdx + 1};
}

/* Path edits change references; shared step bodies remain in one registry. */
function planPathStepEdit(text,raw,section,pathId,index,action,metadata){
  var got = builderDiagram(text,raw,section);
  if (got.error) return got;
  var resultIndex=index, resultPath=pathId;
  return builderNarrativeResult(text,raw,got.path,function(d,result){
    var steps=d.steps || [], taken=Object.create(null);
    steps.forEach(function(s){if(s && s.id) taken[s.id]=true;});
    function newId(stem){var id=builderUniqueKey(taken,stem);taken[id]=true;return id;}
    if (!d.paths){
      if (action !== 'fork') return {error:'No alternate paths yet.'};
      if (!steps.length || !steps[index]) return {error:'Select a step to branch from first.'};
      steps.forEach(function(s){if(!s.id) s.id=newId('step-');});
      d.paths=[{id:'happy',label:'Happy path',color:'#38bdf8',steps:steps.map(function(s){return s.id;})}];
    }
    var p=d.paths.find(function(p){return p.id === pathId;}) || (!pathId ? d.paths[0] : null);
    if(!p) return {error:'Path no longer exists. Select it again.'};
    var at=steps[index] ? p.steps.indexOf(steps[index].id) : -1;
    if (['fork','duplicate','earlier','later'].indexOf(action)>=0 && at<0) return {error:'Select a step in this path first.'};
    resultPath=p.id;
    if(action === 'fork'){
      var pathIds=Object.create(null);d.paths.forEach(function(p){pathIds[p.id]=true;});
      var id=builderUniqueKey(pathIds,'alternate-');
      var step={id:newId('outcome-'),text:'Describe what happens on this alternate path',nodes:Object.keys(d.nodes || {}).slice(0,1)};
      resultIndex=steps.length;steps.push(step);resultPath=id;
      d.paths.push({id:id,label:d.paths.length===1?'Dropped signal':'Alternate path '+d.paths.length,
        color:['#fb923c','#c084fc','#f472b6','#4ade80'][(d.paths.length-1)%4],steps:p.steps.slice(0,at+1).concat(step.id)});
    } else if(action === 'add' || action === 'duplicate'){
      var step=action==='duplicate'?builderClone(steps[index]):{text:'Describe what happens in this step',nodes:Object.keys(d.nodes || {}).slice(0,1)};
      step.id=newId(action==='duplicate'?step.id+'-copy':'step-');resultIndex=steps.length;steps.push(step);
      p.steps.splice(action==='duplicate'?at+1:p.steps.length,0,step.id);
    } else if(action === 'earlier' || action === 'later'){
      var to=at+(action==='earlier'?-1:1);
      if(to<0 || to>=p.steps.length) return {error:'Already at that end of this path.'};
      p.steps.splice(to,0,p.steps.splice(at,1)[0]);
    } else if(action === 'metadata'){
      if(!metadata || typeof metadata.label!=='string' || !metadata.label.trim() || !isHex(metadata.color))
        return {error:'Give the path a label and a hex color.'};
      p.label=metadata.label.trim();p.color=metadata.color;
      if(at<0) resultIndex=steps.findIndex(function(s){return s.id===p.steps[0];});
    } else if(action === 'remove'){
      if(d.paths.length<2 || d.paths[0]===p) return {error:'Keep the primary path; remove an alternate instead.'};
      d.paths=d.paths.filter(function(other){return other!==p;});resultPath=d.paths[0].id;
      resultIndex=steps.findIndex(function(s){return s.id===d.paths[0].steps[0];});
    } else return {error:'Unknown path edit.'};
    result.index=resultIndex;result.pathId=resultPath;
  });
}

/* ---------------- step contract editing ----------------
   A step's membership: hops (edge / edges), lit nodes (nodes), and
   panel patches (panels). Toggles normalize the hop shape: zero hops
   removes the key (edgeless steps are legal), one hop stores
   edge: "a->b", two or more store edges: [...]. */

function builderStepHops(st){
  /* tolerate the malformed both-keys shape: merge edge and edges so a
     later toggle's rebuild cannot silently drop listed hops */
  if (!st) return [];
  var out = [];
  if (typeof st.edge === 'string') out.push(st.edge);
  if (Array.isArray(st.edges)) st.edges.forEach(function(k){
    if (typeof k === 'string' && out.indexOf(k) < 0) out.push(k);
  });
  Object.keys(stepFailures(st)).forEach(function(key){if (out.indexOf(key) < 0) out.push(key);});
  return out;
}

function builderStepAt(raw, sectionIdx, stepIdx){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return null;
  var d = specValueAt(raw, rec.diagram);
  if (!d || !Array.isArray(d.steps) || !d.steps[stepIdx]) return null;
  return {rec: rec, d: d, st: d.steps[stepIdx],
          path: rec.diagram.concat(['steps', stepIdx])};
}

function planStepToggleHop(text, raw, sectionIdx, stepIdx, key){
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  var hops = builderStepHops(got.st);
  var has = hops.indexOf(key) >= 0;
  if (!has){
    var known = (got.d.edges || []).some(function(e){ return e && builderEdgeKey(e) === key; });
    if (!known) return {error: 'no edge "' + key + '" in this diagram'};
  }
  var next = has ? hops.filter(function(k){ return k !== key; }) : hops.concat([key]);
  var r = builderRewrite(text, raw, got.path, function(st){
    var failures = stepFailures(st);
    if (has) delete failures[key];
    if (has && Array.isArray(st.packets)) st.packets = st.packets.filter(function(pk){return pk.edge !== key;});
    var delivered = next.filter(function(k){return !Object.prototype.hasOwnProperty.call(failures,k);});
    delete st.edge; delete st.edges;
    if (delivered.length === 1) st.edge = delivered[0];
    else if (delivered.length > 1) st.edges = delivered;
    if (Object.keys(failures).length) st.failures = failures; else delete st.failures;
  });
  if (r.error) return r;
  r.added = !has;
  return r;
}

function planStepCommunication(text,raw,sectionIdx,stepIdx,key,outcome){
  var got = builderStepAt(raw,sectionIdx,stepIdx);
  if (!got) return {error:'Select a step first.'};
  if (['delivered','dropped','blocked'].indexOf(outcome) < 0) return {error:'Choose delivered, dropped or blocked.'};
  if (!(got.d.edges || []).some(function(e){return e && builderEdgeKey(e) === key;})) return {error:'Choose an existing edge.'};
  return builderRewrite(text,raw,got.path,function(st){
    var failures = stepFailures(st), delivered = builderStepHops(st).filter(function(k){
      return k !== key && !Object.prototype.hasOwnProperty.call(failures,k);
    });
    if (outcome === 'delivered'){ delete failures[key]; delivered.push(key); }
    else failures[key] = outcome;
    delete st.edge; delete st.edges;
    if (delivered.length === 1) st.edge = delivered[0]; else if (delivered.length > 1) st.edges = delivered;
    if (Object.keys(failures).length) st.failures = failures; else delete st.failures;
  });
}

var STEP_TONE_TOKENS = ['alert', 'warn', 'ok', 'dim', 'base'];
function planStepTone(text, raw, sectionIdx, stepIdx, nodeId, tokenOrNull){
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  if (!(got.d.nodes && Object.prototype.hasOwnProperty.call(got.d.nodes, nodeId)))
    return {error: 'no node "' + nodeId + '" in this diagram'};
  if (tokenOrNull != null && STEP_TONE_TOKENS.indexOf(tokenOrNull) < 0)
    return {error: 'tone must be one of ' + STEP_TONE_TOKENS.join(', ')};
  return builderRewrite(text, raw, got.path, function(st){
    var tone = Object.create(null);
    /* tolerant read (not stepTonePatch: that helper lives in the validator
       bundle, and this file is unit-tested standalone) */
    var cur = (st.tone && typeof st.tone === 'object' && !Array.isArray(st.tone)) ? st.tone : {};
    Object.keys(cur).forEach(function(k){ tone[k] = cur[k]; });
    if (tokenOrNull == null) delete tone[nodeId];
    else tone[nodeId] = tokenOrNull;
    /* keep the null-prototype object: assigning "__proto__" into a plain
       {} would hit the inherited setter and silently drop the entry.
       JSON.stringify serializes own properties of a null-proto object. */
    if (Object.keys(tone).length) st.tone = tone; else delete st.tone;
  });
}

function planStepToggleNode(text, raw, sectionIdx, stepIdx, nodeId){
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  var list = Array.isArray(got.st.nodes) ? got.st.nodes : [];
  var has = list.indexOf(nodeId) >= 0;
  if (!has && !(got.d.nodes && Object.prototype.hasOwnProperty.call(got.d.nodes, nodeId)))
    return {error: 'no node "' + nodeId + '" in this diagram'};
  var r = builderRewrite(text, raw, got.path, function(st){
    var next = (Array.isArray(st.nodes) ? st.nodes : []).filter(function(n){ return n !== nodeId; });
    if (!has) next.push(nodeId);
    if (next.length) st.nodes = next; else delete st.nodes;
  });
  if (r.error) return r;
  r.added = !has;
  return r;
}

function planStepTogglePanel(text, raw, sectionIdx, stepIdx, panelId){
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  var has = !!(got.st.panels && Object.prototype.hasOwnProperty.call(got.st.panels, panelId));
  if (!has && !(got.d.panels || []).some(function(p){ return p && p.id === panelId; }))
    return {error: 'no panel "' + panelId + '" in this diagram'};
  var r = builderRewrite(text, raw, got.path, function(st){
    if (has){
      delete st.panels[panelId];
      if (!Object.keys(st.panels).length) delete st.panels;
    } else {
      if (!st.panels) st.panels = {};
      st.panels[panelId] = {};
    }
  });
  if (r.error) return r;
  r.added = !has;
  return r;
}

function planStepSetPanelPatch(text, raw, sectionIdx, stepIdx, panelId, patchText){
  /* replace one panel patch with operator-supplied JSON (an object) */
  var got = builderStepAt(raw, sectionIdx, stepIdx);
  if (!got) return {error: 'step not found — reselect and try again'};
  var patch;
  try { patch = JSON.parse(patchText); }
  catch (ex){ return {error: 'the patch is not valid JSON (' + ex.message + ')'}; }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    return {error: 'a panel patch is a JSON object'};
  if (!(got.st.panels && Object.prototype.hasOwnProperty.call(got.st.panels, panelId)))
    return {error: 'panel "' + panelId + '" is not in this step'};
  return builderRewrite(text, raw, got.path.concat(['panels', panelId]), function(copy, _unused){
    /* builderRewrite mutates a copy in place; replace all fields */
    Object.keys(copy).forEach(function(k){ delete copy[k]; });
    Object.keys(patch).forEach(function(k){ copy[k] = patch[k]; });
  });
}

/* Detail definitions remain ordinary sections. These pure helpers are shared by
   authoring, portable validation and all viewers; resolving never performs I/O. */
var DETAIL_MAX_DEPTH = 12;
function detailSection(page, reference){
  var records=sectionRecords(page);
  return records.find(function(r){return r.reference===reference;}) || records.find(function(r){return r.aliases && r.aliases.indexOf(reference)>=0;}) || records[oneBasedIndex(reference,records.length)] || null;
}
function detailTarget(page, detail){
  return specObject(detail) && !detail.spec && detail.section ? detailSection(page, detail.section) : null;
}
function detailURL(value){
  if (typeof value !== 'string') return null;
  try { var u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch (_) { return null; }
}
function detailStepTarget(detail, stepper){
  var id = stepper && stepper.current().id;
  var mapped = id && detail.stepMap && Object.prototype.hasOwnProperty.call(detail.stepMap,id) ? detail.stepMap[id] : null;
  return Object.assign({}, {path:detail.path,step:detail.step}, specObject(mapped) ? mapped : {});
}
function validateDetails(page, errors, warnings){
  var records = sectionRecords(page), seen = Object.create(null);
  records.forEach(function(r){
    (r.aliases || []).forEach(function(alias){if(records.some(function(other){return other!==r && other.reference===alias;}))errors.push(r.path+'.id: section ID conflicts with a legacy heading reference '+alias);});
    var s=r.section, at=r.path;
    if(s.id != null && (typeof s.id !== 'string' || !/^[a-zA-Z][\w.-]*$/.test(s.id))) errors.push(at+'.id: use a stable identifier beginning with a letter');
    if(seen[r.reference]) errors.push(at+'.id: duplicate or ambiguous section reference '+r.reference);
    seen[r.reference]=true;
    if(s.detailOnly != null && typeof s.detailOnly !== 'boolean') errors.push(at+'.detailOnly: expected a boolean');
    Object.keys(s.diagram && s.diagram.nodes || {}).forEach(function(id){
      var detail=s.diagram.nodes[id].detail, where=at+'.diagram.nodes.'+id+'.detail';
      if(detail == null)return;
      if(!specObject(detail)){errors.push(where+': expected an object');return;}
      if(detail.mode != null && ['focus','expand','link'].indexOf(detail.mode)<0) errors.push(where+'.mode: expected focus or link');
      if(detail.mode==='expand')warnings.push(where+'.mode: inline expansion was removed; opens as a focused drilldown. Use focus for new diagrams.');
      ['section','spec','revision','path','step'].forEach(function(k){if(detail[k]!=null && (typeof detail[k]!=='string' || !detail[k].trim()))errors.push(where+'.'+k+': expected a nonempty string');});
      if(detail.url != null && !detailURL(detail.url))errors.push(where+'.url: expected an HTTP(S) URL without credentials');
      if(!detail.section && !detail.spec && !detail.url)errors.push(where+': choose a detail section, approved spec or URL');
      if((detail.spec || !detail.section) && detail.mode && detail.mode!=='link')errors.push(where+'.mode: external details use link');
      if(detail.section && !detail.spec && detail.mode==='link')warnings.push(where+'.mode: local links open as focused drilldowns; use focus for local sections.');
      var target=detailTarget(page,detail), child=target && target.section.diagram;
      if(detail.section && !detail.spec && !child)errors.push(where+'.section: missing detail diagram '+detail.section);
      function checkTarget(t,label){
        if(!specObject(t)){errors.push(label+': expected {step, path?}');return;}
        if(child){
          var path=t.path || detail.path || diagramPathList(child)[0].id;
          var resolved=resolveSourceStep(child,path,t.step);
          if(!resolved || (t.step!=null && resolved.sourceIndex<0))errors.push(label+': unknown child step or path');
        }
      }
      if(child && (detail.path || detail.step))checkTarget(detail,where);
      if(detail.stepMap!=null){
        if(!specObject(detail.stepMap))errors.push(where+'.stepMap: expected a map of parent step IDs to child targets');
        else Object.keys(detail.stepMap).forEach(function(key){
          if(!(s.diagram.steps || []).some(function(st){return st.id===key;}))errors.push(where+'.stepMap.'+key+': unknown parent step ID');
          checkTarget(detail.stepMap[key],where+'.stepMap.'+key);
        });
      }
      if(detail.ports!=null){
        if(!specObject(detail.ports))errors.push(where+'.ports: expected {in, out}');
        else ['in','out'].forEach(function(k){
          var port=detail.ports[k];if(port==null)return;
          if(!child || !Object.prototype.hasOwnProperty.call(child.nodes || {},port))errors.push(where+'.ports.'+k+': unknown child node');
          else if(!(Array.isArray(child.rows)?child.rows:[]).some(function(row){return Array.isArray(row) && row.some(function(slot){return (Array.isArray(slot)?slot:[slot]).indexOf(port)>=0;});}) && !(Array.isArray(child.floats)?child.floats:[]).some(function(f){return f && f.id===port;}))
            errors.push(where+'.ports.'+k+': child node must be placed in rows or floats');
        });
      }
    });
  });
}

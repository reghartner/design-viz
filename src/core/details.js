/* Detail definitions remain ordinary sections. These pure helpers are shared by
   authoring, portable validation and all viewers; resolving never performs I/O. */
var DETAIL_GEOMETRY_OWNER = {};
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
      if(detail.mode != null && ['focus','expand','link'].indexOf(detail.mode)<0) errors.push(where+'.mode: expected focus, expand or link');
      ['section','spec','revision','path','step'].forEach(function(k){if(detail[k]!=null && (typeof detail[k]!=='string' || !detail[k].trim()))errors.push(where+'.'+k+': expected a nonempty string');});
      if(detail.url != null && !detailURL(detail.url))errors.push(where+'.url: expected an HTTP(S) URL without credentials');
      if(!detail.section && !detail.spec && !detail.url)errors.push(where+': choose a detail section, approved spec or URL');
      if((detail.spec || !detail.section) && detail.mode && detail.mode!=='link')errors.push(where+'.mode: external details use link');
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
        else ['in','out'].forEach(function(k){if(detail.ports[k]!=null && (!child || !Object.prototype.hasOwnProperty.call(child.nodes,detail.ports[k])))errors.push(where+'.ports.'+k+': unknown child node');});
      }
      if(detail.mode==='expand' && child){
        ['in','out'].forEach(function(k){
          if((s.diagram.edges || []).some(function(e){return e[k==='in'?'to':'from']===id;}) && !(detail.ports && detail.ports[k]))
            errors.push(where+'.ports.'+k+': required to reconnect domain edges when expanding');
        });
      }
    });
  });
}

/* Expanded topology is a disposable projection. Authored IDs and step registry
   never change. Child layouts keep their geometry inside wider compound slots. */
function expandDetailDiagram(page, source, expanded){
  if(!expanded || !expanded.length)return source;
  var d=Object.assign({},source), nodes=Object.assign(Object.create(null),source.nodes), groups=Object.assign(Object.create(null),source.groups || {});
  var domains=Object.create(null), internalEdges=[], pos=Object.create(null), groupBoxes=Object.create(null), rows=[], y=60, widest=1180;
  function unique(prefix, map){var key=prefix;while(Object.prototype.hasOwnProperty.call(map,key))key+='_';return key;}
  expanded.forEach(function(id){
    var n=source.nodes[id], detail=n && n.detail, target=detailTarget(page,detail);
    if(!target || !target.section.diagram)return;
    var child=target.section.diagram, ports=detail.ports || {};
    if((source.edges || []).some(function(e){return e.to===id && !ports.in || e.from===id && !ports.out;}))throw new Error('Define input and output boundary nodes before expanding '+(n.title || id)+'.');
    var keys=Object.create(null), group=unique('__detail_'+id,groups), childLayout=layout(child);
    Object.keys(child.nodes).forEach(function(k){keys[k]=unique('__detail_'+id+'_'+k,nodes);nodes[keys[k]]=Object.assign({},child.nodes[k],{group:group});});
    groups[group]={title:n.title || id,icon:n.icon || 'gear'};
    domains[id]={keys:keys,child:child,layout:childLayout,group:group,ports:ports};
    delete nodes[id];
    (child.edges || []).forEach(function(e){internalEdges.push(Object.assign({},e,{from:keys[e.from],to:keys[e.to]}));});
  });
  function endpoint(id,direction){return domains[id] ? domains[id].keys[domains[id].ports[direction]] : id;}
  function edgeKey(key){var pair=String(key).split('->');return pair.length===2?endpoint(pair[0],'out')+'->'+endpoint(pair[1],'in'):key;}
  function nodeKeys(id){return domains[id]?Object.values(domains[id].keys):[id];}
  function projectStep(step){
    var s=Object.assign({},step);
    if(s.edge)s.edge=edgeKey(s.edge);if(s.edges)s.edges=s.edges.map(edgeKey);
    if(s.nodes)s.nodes=s.nodes.flatMap(nodeKeys);
    if(s.tone){s.tone=Object.create(null);Object.keys(step.tone).forEach(function(k){nodeKeys(k).forEach(function(id){s.tone[id]=step.tone[k];});});}
    if(s.failures){s.failures=Object.create(null);Object.keys(step.failures).forEach(function(k){s.failures[edgeKey(k)]=step.failures[k];});}
    if(s.packets)s.packets=s.packets.map(function(p){return Object.assign({},p,{edge:edgeKey(p.edge)});});
    if(s.conditions)s.conditions=s.conditions.flatMap(function(c){return c.nodeId?nodeKeys(c.nodeId).map(function(id){return Object.assign({},c,{nodeId:id});}):[c];});
    return s;
  }
  var sourceRows=(source.rows || []).map(function(row){return row.map(function(slot){return Array.isArray(slot)?slot:[slot];});});
  (source.floats || []).forEach(function(f){if(f.side==='above')sourceRows.unshift([[f.id]]);else sourceRows.push([[f.id]]);});
  sourceRows.forEach(function(slots,ri){
    var measures=slots.map(function(ids){var h=0,w=190;ids.forEach(function(id){var item=domains[id];w=Math.max(w,item?item.layout.vb.w+48:190);h+=(item?item.layout.vb.h+56:70)+32;});return {w:w,h:h,ids:ids};});
    var width=measures.reduce(function(n,m){return n+m.w+90;},0)+40, height=Math.max.apply(null,measures.map(function(m){return m.h;}));
    widest=Math.max(widest,width);var x=40, rowIds=[];
    measures.forEach(function(m,fi){var localY=y+(height-m.h)/2;
      m.ids.forEach(function(id){var item=domains[id];
        if(item){var vb=item.layout.vb, dx=x+24-vb.x,dy=localY+38-vb.y;
          Object.keys(item.layout.pos).forEach(function(k){var p=item.layout.pos[k],key=item.keys[k];pos[key]=Object.assign({},p,{cx:p.cx+dx,cy:p.cy+dy,row:ri,flow:fi,stack:true});rowIds.push(key);});
          groupBoxes[item.group]={x:x,y:localY,w:m.w,h:vb.h+56,nestLevel:0};localY+=vb.h+88;
        }else if(nodes[id]){pos[id]={cx:x+m.w/2,cy:localY+35,w:170,h:CARD_H,row:ri,flow:fi,stack:false};rowIds.push(id);localY+=102;}
      });x+=m.w+90;
    });
    rows.push({top:y,center:y+height/2,height:height,slots:rowIds,k:rowIds.length});y+=height+120;
  });
  // Retain authored domain boundaries around their remaining visible members.
  Object.keys(source.groups || {}).forEach(function(g){var members=Object.keys(source.nodes).filter(function(k){return source.nodes[k].group===g;}).flatMap(nodeKeys).map(function(k){return pos[k];}).filter(Boolean);if(!members.length)return;
    var left=Math.min.apply(null,members.map(function(p){return p.cx-p.w/2;}))-20,top=Math.min.apply(null,members.map(function(p){return p.cy-p.h/2;}))-40;
    groupBoxes[g]={x:left,y:top,w:Math.max.apply(null,members.map(function(p){return p.cx+p.w/2;}))-left+20,h:Math.max.apply(null,members.map(function(p){return p.cy+p.h/2;}))-top+20,nestLevel:0};
  });
  d.nodes=nodes;d.groups=groups;d.rows=rows.map(function(r){return r.slots;});d.floats=[];delete d.routing;
  d.edges=(source.edges || []).map(function(e){return Object.assign({},e,{from:endpoint(e.from,'out'),to:endpoint(e.to,'in')});}).concat(internalEdges);
  d.steps=(source.steps || []).map(projectStep);
  d._detailGeometry={owner:DETAIL_GEOMETRY_OWNER,layout:{pos:pos,rows:rows,groups:groupBoxes,H:y,vb:{x:0,y:0,w:widest,h:y}}};
  return d;
}

/* Independent extraction is a graph edit, not a timeline split. The parent
   keeps its story and panel ownership; the destination starts without steps. */
function extractionClearRoute(edge, windows){
  ['bend','labelDx','labelDy','labelAt','fromDx','fromDy','toDx','toDy'].forEach(function(key){delete edge[key];});
  if(windows){delete edge.revealAt;delete edge.hideAt;}
  return edge;
}
function extractionRows(rows, project){
  return rows.map(function(row){return row.map(function(slot){
    var values=(Array.isArray(slot)?slot:[slot]).flatMap(project);
    if(Array.isArray(slot) && values.length===slot.length && values.every(function(id,i){return id===slot[i];}))return values;
    return values.length===1?values[0]:values;
  }).filter(function(slot){return !Array.isArray(slot) || slot.length;});}).filter(function(row){return row.length;});
}
function extractionSetMap(object,key,value){
  if(Object.keys(value).length)object[key]=value;else delete object[key];
}

/* Give an exported destination its own dependency closure. Local references
   are section identities, never positions in a different document's list. */
function extractionChildSpec(raw, section, report){
  var sourcePage=raw.page || raw, page={title:section.heading,sections:[builderClone(section)]};
  delete page.sections[0].detailOnly;
  ['skin','protocols','lanes'].forEach(function(key){if(sourcePage[key]!=null)page[key]=builderClone(sourcePage[key]);});
  var records=builderDetailRecords(raw),ids=new Map(),taken=Object.create(null),queue=[page.sections[0]];
  // Reserve original and new heading aliases before allocating any copied ID;
  // a later dependency may have the heading "Dependency1" even without that ID.
  builderDetailRecords({page:page}).concat(records).forEach(function(record){
    taken[record.reference]=true;(record.aliases || []).forEach(function(alias){taken[alias]=true;});
  });
  function copyTarget(detail){
    var index=builderDetailIndex(records,detail);
    if(index<0)return;
    var target=records[index],id=ids.get(index);
    if(!id){
      id=builderUniqueKey(taken,'dependency');taken[id]=true;ids.set(index,id);
      var copy=builderClone(specValueAt(raw,target.path));copy.id=id;copy.detailOnly=true;
      page.sections.push(copy);queue.push(copy);
      report.notes.push('Destination includes its referenced detail: '+(copy.heading || target.reference)+'.');
    }
    detail.section=id;
  }
  for(var i=0;i<queue.length;i++){
    Object.values(queue[i].diagram && queue[i].diagram.nodes || {}).forEach(function(node){
      if(node.detail && !node.detail.spec && node.detail.section)copyTarget(node.detail);
    });
  }
  return {page:page};
}

function planExtractIndependentDiagram(text,raw,sectionIdx,ids,options){
  options=options || {};
  try{
    var before=validate(normalize(raw));
    if(before.errors.length)return {error:'Fix the source validation errors before extracting: '+before.errors.join('\n')};
    // Preserve support for the bare-diagram authoring shorthand. Undo still
    // restores the exact caller text because only the returned plan is applied.
    if(raw && !raw.page && !raw.blocks && !raw.sections && raw.nodes && raw.rows){
      var wrapped={page:{sections:[{heading:'Overview',diagram:builderClone(raw)}]}};
      return planExtractIndependentDiagram(JSON.stringify(wrapped,null,2),wrapped,sectionIdx,ids,options);
    }
    var got=builderDiagram(text,raw,sectionIdx);
    if(got.error)return got;
    var d=builderClone(got.d),selected=new Set(Array.isArray(ids)?ids:[]);
    if(!Array.isArray(ids) || selected.size<2 || ids.some(function(id){return typeof id!=='string' || !Object.prototype.hasOwnProperty.call(d.nodes || {},id);}))
      return {error:'Choose at least two existing nodes in one section.'};
    ids=Array.from(selected);
    var mode=options.mode || 'local';
    if(mode!=='local' && mode!=='external')return {error:'Choose Local zoom or Separate document.'};
    var title=typeof options.title==='string' && options.title.trim() || 'New domain';
    var report={movedNodes:ids.length,internalEdges:0,affectedSteps:[],boundaryEdges:[],references:[],notes:[]};
    var page=raw.page || raw,base=raw.page?['page']:[],records=builderDetailRecords(raw);
    var taken=Object.assign(Object.create(null),d.nodes),domainId=builderUniqueKey(taken,'domain');taken[domainId]=true;
    var sectionTaken=Object.create(null);records.forEach(function(r){sectionTaken[r.reference]=true;(r.aliases || []).forEach(function(a){sectionTaken[a]=true;});});
    var sectionId=domainId+'-detail';if(sectionTaken[sectionId])sectionId=builderUniqueKey(sectionTaken,sectionId+'-');
    var handoff;
    if(mode==='external'){
      handoff=builderClone(options.handoff || {});
      var errors=[];validateHandoff(handoff,null,'Destination',errors);
      if(errors.length)return {error:errors.join('\n')};
      if(handoff.section){
        if(!/^[a-zA-Z][\w.-]*$/.test(handoff.section))return {error:'The destination section ID must begin with a letter and use letters, digits, _, . or -.'};
        sectionId=handoff.section;
      }else if(handoff.spec)handoff.section=sectionId;
    }
    var originalNodes=d.nodes,child={nodes:Object.create(null),rows:[],edges:[],steps:[],autoplay:false};
    ids.forEach(function(id){
      child.nodes[id]=builderClone(originalNodes[id]);
      if(child.nodes[id].detail && child.nodes[id].detail.stepMap){
        delete child.nodes[id].detail.stepMap;
        report.references.push('Removed inherited parent-step mapping from '+id+'; its nested detail keeps its own entry point.');
      }
    });
    child.rows=extractionRows(d.rows,function(id){return selected.has(id)?[id]:[];});
    var placedChild=new Set(builderFlatRowIds(child.rows)),extra=ids.filter(function(id){return !placedChild.has(id);});
    for(var offset=0;offset<extra.length;offset+=4)child.rows.push(extra.slice(offset,offset+4));
    if(extra.length)report.notes.push('Selected floats or unplaced nodes become ordinary rows in the destination.');
    var groups=Object.create(null);
    function copyGroup(id){if(!id || groups[id] || !d.groups || !Object.prototype.hasOwnProperty.call(d.groups,id))return;groups[id]=builderClone(d.groups[id]);copyGroup(groups[id].parent);}
    ids.forEach(function(id){copyGroup(child.nodes[id].group);});if(Object.keys(groups).length)child.groups=groups;

    var laneRows=d.routing==='lanes' && !(d.floats || []).length && d.rows.every(function(row){return row.length<=5 && !row.some(Array.isArray);});
    var allEdges=d.edges || [],internal=new Set(),collapse=new Map(),ports=new Map(),edgeMap=new Map(),bridges=new Map();
    var edgeSeen=new Set();
    for(var ei=0;ei<allEdges.length;ei++){
      var edge=allEdges[ei],key=builderEdgeKey(edge),from=selected.has(edge.from),to=selected.has(edge.to);
      if(edgeSeen.has(key))return {error:'The source has duplicate edge '+key+'. Give these connections distinct endpoints before extracting.'};
      edgeSeen.add(key);
      if(from && to){internal.add(key);edgeMap.set(key,null);child.edges.push(extractionClearRoute(builderClone(edge),true));}
      else if(from || to){
        var collapsed=(from?domainId:edge.from)+'->'+(to?domainId:edge.to);
        var group=collapse.get(collapsed) || [];group.push(edge);collapse.set(collapsed,group);
      }else edgeMap.set(key,key);
    }
    report.internalEdges=child.edges.length;
    collapse.forEach(function(edges){
      if(edges.length<2)return;
      edges.forEach(function(edge){
        var id=selected.has(edge.from)?edge.from:edge.to;
        if(!ports.has(id)){var port=builderUniqueKey(taken,'boundary');taken[port]=true;ports.set(id,port);}
      });
    });
    if(ports.size)report.notes.push('Added '+ports.size+' boundary interface nodes so parallel connections keep distinct edges, protocols and failure states.');
    var nextNodes=Object.create(null);
    Object.keys(d.nodes).forEach(function(id){if(!selected.has(id))nextNodes[id]=d.nodes[id];});
    var domain={title:title,icon:'package',tint:'cmd'};
    if(mode==='local')domain.detail={section:sectionId,mode:'focus'};else domain.handoff=handoff;
    var commonGroup=originalNodes[ids[0]].group;
    if(commonGroup && ids.every(function(id){return originalNodes[id].group===commonGroup;}))domain.group=commonGroup;
    nextNodes[domainId]=domain;
    ports.forEach(function(port,id){
      var original=originalNodes[id];
      nextNodes[port]={title:original.title || id,sub:'Domain boundary',icon:original.icon || 'package',tint:original.tint || 'cmd'};
      if(original.group)nextNodes[port].group=original.group;
    });
    d.nodes=nextNodes;
    var placedDomain=false;
    d.rows=extractionRows(d.rows,function(id){
      if(!selected.has(id))return [id];
      var list=[];if(!placedDomain){list.push(domainId);placedDomain=true;}if(ports.has(id))list.push(ports.get(id));return list;
    });
    if(laneRows){
      var reflowed=false;
      d.rows=d.rows.flatMap(function(row){
        var flat=row.flat(),rows=[];if(row.some(Array.isArray) || flat.length>5)reflowed=true;
        for(var offset=0;offset<flat.length;offset+=5)rows.push(flat.slice(offset,offset+5));
        return rows;
      });
      if(reflowed)report.notes.push('Boundary interfaces use unstacked rows of at most five cards, preserving lane routing.');
    }
    if(d.floats){
      d.floats=d.floats.flatMap(function(f){
        if(!selected.has(f.id))return [f];
        var list=[];if(!placedDomain){list.push(Object.assign({},f,{id:domainId}));placedDomain=true;}
        if(ports.has(f.id))list.push({id:ports.get(f.id),side:f.side});return list;
      });
      if(!d.floats.length)delete d.floats;
    }
    if(!placedDomain)d.rows.push([domainId]);
    // Selections may include a defined but unplaced endpoint through commands.
    var placedParent=new Set(builderFlatRowIds(d.rows).concat((d.floats || []).map(function(f){return f.id;})));
    ports.forEach(function(port){if(!placedParent.has(port))d.rows.push([port]);});
    d.edges=allEdges.filter(function(edge){return !internal.has(builderEdgeKey(edge));}).map(function(edge){
      var beforeKey=builderEdgeKey(edge),from=selected.has(edge.from),to=selected.has(edge.to);
      if(!from && !to)return edge;
      var id=from?edge.from:edge.to,port=ports.get(id),next=builderClone(edge);
      next[from?'from':'to']=port || domainId;
      extractionClearRoute(next,false);edgeMap.set(beforeKey,builderEdgeKey(next));
      report.boundaryEdges.push(beforeKey+' → '+builderEdgeKey(next)+(port?' (via '+domainId+')':''));
      if(port){
        var bridge={from:from?domainId:port,to:from?port:domainId,kind:'int',label:'boundary'};
        bridges.set(builderEdgeKey(bridge),bridge);
      }
      return next;
    });
    bridges.forEach(function(edge){d.edges.push(edge);});

    var nodeMap=Object.create(null);ids.forEach(function(id){nodeMap[id]=domainId;});
    (d.panels || []).forEach(function(panel){
      var previous=JSON.stringify(panel);panelRemapReferences(panel,'nodes',nodeMap);
      if(previous!==JSON.stringify(panel))report.references.push('Panel '+panel.id+': extracted-node references now point to '+title+'. Panel state stays in the overview.');
    });
    var toneCount=0,packetCount=0;
    (d.steps || []).forEach(function(step,index){
      var affected=false,keys=stepKeys(step),nextKeys=[];
      keys.forEach(function(key){if(internal.has(key) || (edgeMap.has(key) && edgeMap.get(key)!==key))affected=true;var next=edgeMap.has(key)?edgeMap.get(key):key;if(next && nextKeys.indexOf(next)<0)nextKeys.push(next);});
      if(affected){delete step.edge;delete step.edges;if(nextKeys.length===1)step.edge=nextKeys[0];else if(nextKeys.length)step.edges=nextKeys;}
      var failures=Object.create(null);
      Object.keys(step.failures || {}).forEach(function(key){
        if(internal.has(key)){
          affected=true;
          (step.conditions || (step.conditions=[])).push({kind:'delivery-failed',nodeId:domainId,label:'Inside '+title+': '+key+' '+step.failures[key]});
        }else{var next=edgeMap.has(key)?edgeMap.get(key):key;failures[next]=step.failures[key];if(next!==key)affected=true;}
      });
      if(step.failures)extractionSetMap(step,'failures',failures);
      if(step.nodes)step.nodes=Array.from(new Set(step.nodes.map(function(id){if(selected.has(id)){affected=true;return domainId;}return id;})));
      if(step.tone){
        var tone=Object.create(null);Object.keys(step.tone).forEach(function(id){if(selected.has(id)){affected=true;toneCount++;}else tone[id]=step.tone[id];});
        extractionSetMap(step,'tone',tone);
      }
      if(step.packets){
        step.packets=step.packets.filter(function(packet){if(internal.has(packet.edge)){affected=true;packetCount++;return false;}return true;}).map(function(packet){
          var next=edgeMap.get(packet.edge);if(next && next!==packet.edge){packet.edge=next;affected=true;}return packet;
        });if(!step.packets.length)delete step.packets;
      }
      (step.conditions || []).forEach(function(condition){if(selected.has(condition.nodeId)){condition.nodeId=domainId;affected=true;}});
      if(step.traceMatch && selected.has(step.traceMatch.nodeId)){step.traceMatch.nodeId=domainId;affected=true;report.references.push('Trace match in '+(step.id || 'step '+(index+1))+': node now points to '+title+'; matching criteria stay unchanged.');}
      if(affected){
        var nodes=step.nodes || (step.nodes=[]);if(nodes.indexOf(domainId)<0)nodes.push(domainId);
        report.affectedSteps.push(step.id || 'Step '+(index+1));
      }
    });
    if(toneCount)report.notes.push('Removed '+toneCount+' per-node tone changes for extracted internals; the replacement highlights involvement without inventing an aggregate state.');
    if(packetCount)report.notes.push('Removed '+packetCount+' internal packet animations from the overview. Boundary packet animations remain.');
    report.notes.push('Parent steps, alternate paths, captions, code references, panel state and layout profiles remain in the overview.');
    report.notes.push('The destination starts with no steps or alternates. Author its own timeline; opening it does not inherit parent playback or state.');
    if(child.edges.length)report.notes.push('Internal connections use fresh automatic routing with no inherited reveal/hide step windows.');

    var section={id:sectionId,heading:title,detailOnly:true,accent:'cyan',diagram:child};
    var childSpec=extractionChildSpec(raw,section,report);
    var rewritten=jsonReplaceValue(text,got.path,JSON.stringify(d,null,2));
    if(!rewritten)return {error:'Could not rewrite the overview.'};
    var result=rewritten;
    if(mode==='local'){
      result=jsonInsertMember(result.text,base.concat([page.blocks?'blocks':'sections']),null,JSON.stringify(section,null,2));
      if(!result)return {error:'Could not add the independent detail section.'};
    }
    var cascaded=builderEditDetails(result.text,JSON.parse(result.text),function(detail,owner,target){
      if(target!==sectionIdx || !detail.ports)return;
      Object.keys(detail.ports).forEach(function(key){if(selected.has(detail.ports[key])){report.references.push('Detail boundary '+key+': '+detail.ports[key]+' → '+domainId+'.');detail.ports[key]=domainId;}});
    });
    if(cascaded.error)return cascaded;
    result.text=cascaded.text;
    var findings=validate(normalize(JSON.parse(result.text))),childFindings=validate(normalize(childSpec));
    if(findings.errors.length || childFindings.errors.length)return {error:'Extraction could not preserve valid references: '+findings.errors.concat(childFindings.errors).join('\n')};
    var range=jsonLocate(result.text,got.path.concat(['nodes',domainId]));
    return {text:result.text,start:range.start,end:range.end,kind:'node',id:domainId,section:sectionIdx,
      detailSection:mode==='local'?records.length:undefined,sectionId:sectionId,childSpec:childSpec,report:report};
  }catch(error){return {error:'Could not extract this selection: '+error.message};}
}

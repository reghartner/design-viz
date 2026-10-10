/* Tabs own shared sections; Views contain ordered references, never content
   copies. A page's direct sections form an implicit tab for older documents. */
function tabViewOwners(page){
  var records=sectionRecords(page), direct={source:page,path:'page',tabBlock:null,tab:null,records:[]}, owners=[direct], ordinal=0;
  blocksOf(page).forEach(function(block,bi){
    if(block.type!=='tabs')return;
    ordinal++;var source=(page.blocks || page.sections)[bi];
    block.tabs.forEach(function(tab,ti){owners.push({source:source.tabs[ti],path:tab.path,tabBlock:ordinal,tab:ti,records:[]});});
  });
  records.forEach(function(rec){owners.find(function(o){return o.tabBlock===rec.tabBlock && o.tab===rec.tab;}).records.push(rec);});
  var domains=new Set();records.forEach(function(rec){Object.values(rec.section.diagram && rec.section.diagram.nodes || {}).forEach(function(node){var target=detailTarget(page,node.detail);if(target)domains.add(target.section);});});
  owners.forEach(function(owner){owner.records.forEach(function(rec){rec.domainOnly=!!rec.section.detailOnly || domains.has(rec.section);});});
  return owners.filter(function(owner){return owner.records.length || owner.source.views!==undefined;});
}
function tabViewMemberReference(member){return typeof member==='string'?member:member && member.section;}
function tabViewDefinitions(owner){
  var eligible=owner.records.filter(function(rec){return !rec.domainOnly;});
  if(Array.isArray(owner.source.views))return owner.source.views.map(function(view){
    return {id:view.id,name:view.name,presentation:view.presentation,members:view.sections.map(function(member){
      return {record:eligible.find(function(rec){return rec.section.id===tabViewMemberReference(member);}),layout:typeof member==='object'?member.layout:undefined};
    }).filter(function(member){return member.record;})};
  });
  // Legacy layouts remain authored and independently addressable. A layout can
  // never turn a neighbouring section into a member of its Explore canvas.
  var views=[],standard=[],diagramCount=eligible.filter(function(rec){return !!rec.section.diagram;}).length;
  eligible.forEach(function(rec){var d=rec.section.diagram,definitions=d?diagramLayoutViews(d):[],initial=d && sectionLayoutDefinition(d);
    if(!initial || initial.presentation!=='explore')standard.push({record:rec,layout:initial?initial.legacy?'layout':initial.id:undefined});
    if(d && !Array.isArray(d.layouts)){var focus=diagramFocusPanel(d);if(focus && !definitions.length)definitions.push({id:'home',name:panelCapability(focus.type,'focusLabel',focus.title || 'Panel'),presentation:'standard'});if(focus || definitions.length)definitions.push({id:'flow',name:'Data flow',presentation:'standard'});}
    definitions.forEach(function(def){views.push({id:'section-'+rec.number+'-'+def.id,name:(diagramCount>1?(rec.section.heading || rec.reference)+' · ':'')+def.name,presentation:def.presentation,legacy:true,legacyLayout:def.legacy?'layout':def.id,members:[{record:rec,layout:def.legacy?'layout':def.id}]});});
  });
  if(standard.length && (eligible.length>1 || !views.length)){
    views.forEach(function(view){if(view.name==='Standard'){var rec=view.members[0].record;view.name=(rec.section.heading || rec.reference)+' · '+view.name;}});
    views.unshift({id:'standard',name:'Standard',presentation:'standard',legacy:true,members:standard});
  }
  return views;
}
function tabViewDefault(owner,views){
  if(owner.source.views)return views.find(function(view){return view.id===owner.source.defaultView;}) || views[0];
  // Introductory prose does not replace a legacy diagram's authored opening mode.
  // Explicit Views above retain their own member order, including prose first.
  var eligible=owner.records.filter(function(rec){return !rec.domainOnly;});
  var first=eligible.find(function(rec){return !!rec.section.diagram;}) || eligible[0],def=first && first.section.diagram && sectionLayoutDefinition(first.section.diagram);
  var single=eligible.length===1;
  var diagram=first && first.section.diagram,focus=diagram && diagramFocusPanel(diagram);
  var id=def ? def.legacy?'layout':def.id : focus && diagram.primaryPanel===focus.id ? 'home' : 'flow';
  return def && def.presentation==='explore' || single ? views.find(function(view){return view.members.length===1 && view.members[0].record===first && view.legacyLayout===id;}) || views[0]:views[0];
}
function validateTabViews(page,errors){
  tabViewOwners(page).forEach(function(owner){
    var source=owner.source,at=owner.path;
    if(source.defaultView!==undefined && (typeof source.defaultView!=='string' || !Array.isArray(source.views) || !source.views.some(function(v){return specObject(v) && v.id===source.defaultView;})))errors.push(at+'.defaultView: must name an existing View');
    if(source.views===undefined)return;
    if(!Array.isArray(source.views) || !source.views.length){errors.push(at+'.views: expected a nonempty array');return;}
    var seen=new Set();source.views.forEach(function(view,i){var where=at+'.views['+i+']';
      if(!specObject(view)){errors.push(where+': expected an object');return;}
      if(typeof view.id!=='string' || !/^[a-zA-Z][\w-]{0,63}$/.test(view.id) || seen.has(view.id))errors.push(where+'.id: use a unique stable ID beginning with a letter');seen.add(view.id);
      if(typeof view.name!=='string' || !view.name.trim() || view.name.trim().length>80)errors.push(where+'.name: use a nonempty name of at most 80 characters');
      if(['standard','explore'].indexOf(view.presentation)<0)errors.push(where+'.presentation: use standard or explore');
      if(!Array.isArray(view.sections) || !view.sections.length){errors.push(where+'.sections: expected a nonempty ordered list of section references');return;}
      var members=new Set();view.sections.forEach(function(member,j){var loc=where+'.sections['+j+']',ref=tabViewMemberReference(member),record=owner.records.find(function(rec){return rec.section.id===ref;});
        if((typeof member!=='string' && !specObject(member)) || typeof ref!=='string' || !record || members.has(ref)){errors.push(loc+': use a unique section ID belonging to this Tab');return;}members.add(ref);
        if(record.domainOnly)errors.push(loc+': detail domains are available through drilldown only');
        if(specObject(member) && member.layout!==undefined){var d=record.section.diagram,layouts=d && diagramLayoutViews(d);if(typeof member.layout!=='string' || !layouts || !layouts.some(function(layout){return layout.id===member.layout || layout.legacy && member.layout==='layout';}) && !(['flow','home'].indexOf(member.layout)>=0 && (member.layout==='flow' || diagramFocusPanel(d))))errors.push(loc+'.layout: name an arrangement belonging to this section');}
      });
    });
  });
}

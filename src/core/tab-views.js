/* Tabs own sections; sections own Views and shared content. A page's direct
   sections form an implicit owner. Legacy membership is adapted below. */
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
function legacyTabViewDefinitions(owner){
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
    if(!initial || initial.presentation!=='explore')standard.push({record:rec,layout:initial && !initial.legacy?initial.id:undefined});
    definitions.forEach(function(def){views.push({id:'section-'+rec.number+'-'+def.id,name:(diagramCount>1?(rec.section.heading || rec.reference)+' · ':'')+def.name,presentation:def.presentation,legacy:true,legacyLayout:def.legacy?'layout':def.id,members:[{record:rec,layout:def.legacy?'layout':def.id}]});});
  });
  if(standard.length && (eligible.length>1 || !views.length)){
    views.forEach(function(view){if(view.name==='Standard'){var rec=view.members[0].record;view.name=(rec.section.heading || rec.reference)+' · '+view.name;}});
    views.unshift({id:'standard',name:'Standard',presentation:'standard',legacy:true,members:standard});
  }
  return views;
}
function legacyTabViewDefault(owner,views){
  if(owner.source.views)return views.find(function(view){return view.id===owner.source.defaultView;}) || views[0];
  // Introductory prose does not replace a legacy diagram's authored opening mode.
  // Explicit Views above retain their own member order, including prose first.
  var eligible=owner.records.filter(function(rec){return !rec.domainOnly;});
  var first=eligible.find(function(rec){return !!rec.section.diagram;}) || eligible[0],def=first && first.section.diagram && sectionLayoutDefinition(first.section.diagram);
  var single=eligible.length===1;
  var id=def && !def.legacy ? def.id : 'flow';
  return def && def.presentation==='explore' || single ? views.find(function(view){return view.members.length===1 && view.members[0].record===first && view.legacyLayout===id;}) || views[0]:views[0];
}
function validateLegacyTabViews(page,errors){
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
        if(specObject(member) && member.layout!==undefined){var d=record.section.diagram,layouts=d && diagramLayoutViews(d);if(typeof member.layout!=='string' || !layouts || !(!layouts.length && ['layout','default'].indexOf(member.layout)>=0 && sectionLayoutDefinition(d)) && !layouts.some(function(layout){return layout.id===member.layout || layout.legacy && member.layout==='layout';}))errors.push(loc+'.layout: name an arrangement belonging to this section');}
      });
    });
  });
}

/* A runtime View always renders exactly one section. The legacy adapter retains
   owner -> authored View -> member order, without changing the source object. */
function sectionViewKey(record,id){return record.number+':'+id;}
function tabViewDefinitions(owner){
  var canonical=owner.records.some(function(r){return Array.isArray(r.section.views);});
  var definitions=[];
  if(!canonical){
    legacyTabViewDefinitions(owner).forEach(function(view){view.members.forEach(function(member){
      definitions.push(Object.assign({},view,{key:sectionViewKey(member.record,view.id),members:[member]}));
    });});
    return definitions;
  }
  owner.records.filter(function(r){return !r.domainOnly;}).forEach(function(record){
    var section=record.section,views=section.views;
    if(!Array.isArray(views)){
      var isolated=Object.assign({},owner,{source:{},records:[record]});
      legacyTabViewDefinitions(isolated).forEach(function(v){definitions.push(Object.assign({},v,{key:sectionViewKey(record,v.id)}));});
      return;
    }
    views.forEach(function(view){definitions.push({id:view.id,key:sectionViewKey(record,view.id),name:view.name,presentation:view.presentation,members:[{record:record,layout:view.layout}]});});
  });
  return definitions;
}
function sectionViewDefault(owner,record,views){
  views=views || tabViewDefinitions(owner);
  var local=views.filter(function(v){return v.members[0].record===record;});
  return local.find(function(v){return v.id===record.section.defaultView;}) || local[0];
}
function tabViewDefault(owner,views){
  var opening=owner.source.opening;
  if(opening)return views.find(function(v){return v.id===opening.view && v.members[0].record.reference===opening.section;}) || views[0];
  if(owner.records.some(function(r){return Array.isArray(r.section.views);})){
    var first=owner.records.find(function(r){return !r.domainOnly;});return first && sectionViewDefault(owner,first,views);
  }
  var legacy=legacyTabViewDefault(owner,legacyTabViewDefinitions(owner));
  return legacy && views.find(function(v){return v.id===legacy.id && v.members[0].record===legacy.members[0].record;}) || views[0];
}
function validateTabViews(page,errors){
  validateLegacyTabViews(page,errors);
  tabViewOwners(page).forEach(function(owner){
    var canonical=owner.records.some(function(r){return r.section.views!==undefined;});
    if(canonical && owner.source.views!==undefined)errors.push(owner.path+': section Views and legacy Tab Views cannot be combined');
    owner.records.forEach(function(rec){
      var section=rec.section,at=rec.path,views=section.views;
      if(views===undefined){if(section.defaultView!==undefined)errors.push(at+'.defaultView: requires section Views');return;}
      if(!Array.isArray(views) || !views.length){errors.push(at+'.views: expected a nonempty array');return;}
      var seen=new Set();views.forEach(function(view,i){var where=at+'.views['+i+']';
        if(!specObject(view)){errors.push(where+': expected an object');return;}
        if(typeof view.id!=='string' || !/^[a-zA-Z][\w-]{0,63}$/.test(view.id) || seen.has(view.id))errors.push(where+'.id: use a unique stable ID within this section');seen.add(view.id);
        if(typeof view.name!=='string' || !view.name.trim() || view.name.trim().length>80)errors.push(where+'.name: use a nonempty name of at most 80 characters');
        if(['standard','explore'].indexOf(view.presentation)<0)errors.push(where+'.presentation: use standard or explore');
        if(view.sections!==undefined)errors.push(where+'.sections: a View renders only its owning section');
        if(view.layout!==undefined){var d=section.diagram,layouts=d && diagramLayoutViews(d);if(typeof view.layout!=='string' || !d || !layouts.some(function(v){return v.id===view.layout;}) && !(layouts.length===0 && ['layout','default'].indexOf(view.layout)>=0 && sectionLayoutDefinition(d)))errors.push(where+'.layout: name an arrangement belonging to this section');}
      });
      if(section.defaultView!==undefined && !views.some(function(v){return v && v.id===section.defaultView;}))errors.push(at+'.defaultView: must name an existing section View');
    });
    if(owner.source.opening!==undefined){var opening=owner.source.opening,rec=specObject(opening) && owner.records.find(function(r){return !r.domainOnly && r.reference===opening.section;});
      if(!rec || !Array.isArray(rec.section.views) || !rec.section.views.some(function(v){return v && v.id===opening.view;}))errors.push(owner.path+'.opening: use an existing section and View pair');
    }
  });
}
/* Explicit conversion only. Callers validate before invoking, including resolved
   imported topology where applicable. No input objects are mutated. */
function migrateSectionViews(input,ownerPath){
  var spec=JSON.parse(JSON.stringify(input)),bare=spec.nodes && spec.rows;
  if(bare)spec={sections:[{diagram:spec}]};
  var page=normalize(spec),owners=tabViewOwners(page),used=new Set(sectionRecords(page).map(function(r){return r.section.id;}).filter(Boolean)),changes=[],links=[];
  owners.forEach(function(owner){
    if(ownerPath!==undefined && owner.path!==ownerPath)return;
    if(owner.records.every(function(r){return r.domainOnly || Array.isArray(r.section.views);}) && !owner.source.views)return;
    var definitions=tabViewDefinitions(owner),opening=tabViewDefault(owner,definitions);
    owner.records.filter(function(r){return !r.domainOnly;}).forEach(function(rec){
      if(!rec.section.id){var id='section-'+rec.number;while(used.has(id))id+='-copy';used.add(id);rec.section.id=id;}
      if(Array.isArray(rec.section.views))return;
      var local=definitions.filter(function(v){return v.members[0].record===rec;});
      rec.section.views=local.map(function(v){var view={id:v.id,name:v.name.slice(0,80),presentation:v.presentation};if(v.members[0].layout)view.layout=v.members[0].layout;links.push({section:rec.section.id,from:v.id,to:view.id,legacyLayout:v.legacyLayout || null});return view;});
      if(!rec.section.views.length)throw new Error(rec.path+': section is omitted from all legacy Views. Include it in a legacy View before converting; use detailOnly only if it is a drilldown domain.');
      rec.section.defaultView=opening && opening.members[0].record===rec?opening.id:rec.section.views[0].id;
    });
    if(opening)owner.source.opening={section:opening.members[0].record.section.id,view:opening.id};
    delete owner.source.views;delete owner.source.defaultView;
    changes.push(owner.path+': Views moved to sections; page order is section order then local View order');
  });
  return {spec:spec,report:{changed:changes.length>0,changes:changes,links:links}};
}

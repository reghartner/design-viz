/* Offline migration only: pre-removal focus geometry and View selection.
   Never included in a runtime source bundle. */
function sectionLayoutPreset(d, target, excludedKeys){
  var excluded=Array.isArray(excludedKeys)?excludedKeys:[];
  var tiles=sectionLayoutTiles(d).filter(function(t){return excluded.indexOf(t.key)<0;}), narrow=target==='confluence', items=[];
  var main=d.primaryPanel && tiles.find(function(t){return t.panel===d.primaryPanel;});
  var ordered=main ? [main].concat(tiles.filter(function(t){return t!==main;})) : tiles;
  var controls=tiles.find(function(t){return t.key==='steps';});
  if(controls){ordered=ordered.filter(function(t){return t!==controls;});ordered.splice(1,0,controls);}
  var supporting=tiles.some(function(t){return t!==main && t.key!=='diagram' && t.key!=='steps' && panelCapability(t.type,'supporting',true);});
  ordered.forEach(function(t){
    var panelLarge=panelCapability(t.type,'large',false), large=t.key==='diagram'||t.key==='steps'||panelLarge||t===main;
    var w=large?(narrow||!supporting?24:16):(narrow?12:8);
    var h=t.key==='steps'?((d.paths || []).length>1?6:4):panelLarge?panelCapability(t.type,'height',12):large?12:panelCapability(t.type,'height',6);
    var xs=large?[0]:narrow?[0,12]:[16], candidates=xs.map(function(x){
      var it={x:x,y:0,w:w,h:h}, hits;
      while((hits=items.filter(function(p){return it.x<p.x+p.w&&it.x+it.w>p.x&&it.y<p.y+p.h&&it.y+it.h>p.y;})).length)
        it.y=Math.max.apply(null,hits.map(function(p){return p.y+p.h;}));
      return it;
    });
    candidates.sort(function(a,b){return a.y-b.y||a.x-b.x;});
    var item=candidates[0];if(t.panel!=null)item.panel=t.panel;if(t.controls)item.controls=t.controls;items.push(item);
  });
  return items;
}
/* Explore defaults are viewport fractions; camera center is in SVG coordinates.
   Recover malformed optional entries independently without modifying source. */
function diagramFocusPanel(d){
  var panels = Array.isArray(d.panels) ? d.panels : [];
  return panels.find(function(p){return p && typeof p.id === 'string' && p.id && p.id === d.primaryPanel;}) ||
    panels.find(function(p){return p && typeof p.id === 'string' && p.id && legacyFocusTypes.indexOf(p.type)>=0;}) || null;
}
/* Reader filters normalize once for playback and authoring audits. Hidden stops
   still participate in state folding; this describes reachability only. */
function builderPromoteSectionViews(d,layoutId){
  var source=sectionLayoutDefinition(d),panels=Array.isArray(d.panels)?d.panels:[];
  var focus=panels.find(function(p){return p && typeof p.id==='string' && p.id && p.id===d.primaryPanel;}) ||
    panels.find(function(p){return p && typeof p.id==='string' && p.id && legacyFocusTypes.indexOf(p.type)>=0;});
  var first=focus?'home':null,defaultId=focus && d.primaryPanel===focus.id?'home':'flow';
  var selected=layoutId==null || layoutId==='default'?defaultId:source && layoutId==='layout'?'flow':layoutId;
  if(selected!=='flow' && selected!==first)return {error:'Reselect the view before editing it.'};
  var views=[],targets=['default'];
  if(focus){
    var homeDiagram=Object.assign({},d,{primaryPanel:focus.id}),preset=sectionLayoutPreset(homeDiagram,'default');
    var hidden=Object.assign({},preset.find(function(it){return sectionLayoutKey(it)==='diagram';}),{hidden:true});
    var controls=preset.find(function(it){return it.controls==='steps';}),items;
    if(controls){
      if(panelCapability(focus.type,'attachControls',false))controls.attachTo='panel:'+focus.id;
      items=sectionLayoutOptimize(homeDiagram,'default',[hidden,controls]);
    }else items=sectionLayoutPreset(homeDiagram,'default',['diagram']).concat([hidden]);
    var label=legacyFocusLabel(focus);
    views.push({id:'home',name:String(label).trim().slice(0,40) || 'Home',sectionLayout:{columns:24,default:items}});
  }
  var flowDiagram=Object.assign({},d,{primaryPanel:undefined}),profiles={columns:24};
  targets.forEach(function(target){profiles[target]=sectionLayoutOptimize(flowDiagram,target,null);});
  if(source)profiles=builderSectionLayout24(source.sectionLayout);
  views.push({id:'flow',name:focus?'Data flow':'Standard',sectionLayout:profiles});
  d.layouts=views;d.defaultLayout=defaultId;delete d.sectionLayout;delete d.layoutName;
  return {layoutId:selected};
}
function sectionLayoutOptimize(d,target,items){
  var hidden=(items || []).filter(function(it){return it.hidden===true && it.controls==null;});
  var previous=(items || []).find(function(it){return it.controls==='steps';});
  var attachment=previous?previous.attachTo:items?'diagram':d.primaryPanel && (d.panels || []).some(function(p){return p.id===d.primaryPanel && panelCapability(p.type,'attachControls',false);})?'panel:'+d.primaryPanel:'diagram';
  var excluded=hidden.map(sectionLayoutKey),dock=attachment && excluded.indexOf(attachment)<0 && sectionLayoutTiles(d).some(function(t){return t.key==='steps';});
  if(dock)excluded.push('steps');
  var presetDiagram=attachment?Object.assign({},d,{primaryPanel:attachment==='diagram'?undefined:attachment.slice(6)}):d;
  var next=sectionLayoutPreset(presetDiagram,target,excluded);
  if(dock){
    var host=next.find(function(it){return sectionLayoutKey(it)===attachment;});
    if(host){
      var height=sectionLayoutControlsRows(d,items);
      next.push({controls:'steps',attachTo:attachment,x:host.x,y:host.y+host.h,w:host.w,h:height});
      host.h=Math.min(40,host.h+height);
    }
  }else{
    var stepTile=next.find(function(it){return it.controls==='steps';});
    if(stepTile){if(attachment)stepTile.attachTo=attachment;if(previous)stepTile.h=previous.h;}
  }
  return sectionLayoutPack(next.concat(hidden.map(function(it){return Object.assign({},it);})));
}
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
    if(!initial || initial.presentation!=='explore')standard.push({record:rec,layout:initial && !initial.legacy?initial.id:undefined});
    if(d && !Array.isArray(d.layouts)){var focus=diagramFocusPanel(d);if(focus && !definitions.length)definitions.push({id:'home',name:legacyFocusLabel(focus),presentation:'standard'});if(focus || definitions.length)definitions.push({id:'flow',name:'Data flow',presentation:'standard'});}
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
  var id=def && !def.legacy ? def.id : focus && diagram.primaryPanel===focus.id ? 'home' : 'flow';
  return def && def.presentation==='explore' || single ? views.find(function(view){return view.members.length===1 && view.members[0].record===first && view.legacyLayout===id;}) || views[0]:views[0];
}

function legacyFocusLabel(panel){return panel.type==='homemap'?'Home':panel.type==='data-contract'?'Contract':panel.title || 'Panel';}

/* Pure section/view layout. Uses diagramPathList() and panelCapability() at
   call time, after panel definitions have registered; no DOM measurements. */

/* Section composition uses a bounded twelve-column grid. Missing/new panels
   are appended; collisions push later tiles down instead of hiding content. */
function sectionLayoutKey(item){
  if(item && item.panel!=null)return typeof item.panel==='string'?'panel:'+item.panel:'invalid-panel';
  return item && item.controls!=null ? (item.controls==='steps'?'steps':'invalid-controls') : 'diagram';
}
function sectionLayoutTiles(d){
  var tiles=[{key:'diagram',title:'Data flow'}].concat((Array.isArray(d.panels) ? d.panels : []).filter(function(p){return p && typeof p.id === 'string';}).map(function(p){
    return {key:'panel:' + p.id,panel:p.id,type:p.type,title:p.title || p.id};
  }));
  if(Array.isArray(d.steps) && d.steps.length && d.view!=='ambient-only')tiles.push({key:'steps',controls:'steps',title:'Step controls'});
  return tiles;
}
function sectionLayoutPack(items, priority){
  var dock=sectionLayoutDock(items);
  var placed = [], order = items.map(function(it){return Object.assign({},it);});
  if (priority) order.sort(function(a,b){return (sectionLayoutKey(a) === priority ? -1 : 0) - (sectionLayoutKey(b) === priority ? -1 : 0);});
  order.forEach(function(it){
    function overlaps(p){return it.x < p.x+p.w && it.x+it.w > p.x && it.y < p.y+p.h && it.y+it.h > p.y;}
    var hits;
    while (!it.hidden && !(dock && it.controls==='steps') && (hits = placed.filter(function(p){return !p.hidden && !(dock && p.controls==='steps') && overlaps(p);})).length) it.y = Math.max.apply(null,hits.map(function(p){return p.y+p.h;}));
    placed.push(it);
  });
  return items.map(function(it){return placed.find(function(p){return sectionLayoutKey(p) === sectionLayoutKey(it);});});
}
/* A docked transport shares its host's geometry. Its saved standalone position
   is retained for detaching, or used as a fallback if that host is hidden. */
function sectionLayoutDock(items){
  var steps=items.find(function(it){return it.controls==='steps';});
  return steps && typeof steps.attachTo==='string' && items.some(function(it){return sectionLayoutKey(it)===steps.attachTo && !it.hidden && !it.controls;}) ? steps.attachTo : null;
}
function sectionLayoutControlsRows(d,items){
  var steps=(items || []).find(function(it){return it.controls==='steps';});
  return steps?steps.h:(d.paths || []).length>1?6:4;
}
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
    var w=large?(narrow||!supporting?12:8):(narrow?6:4);
    var h=t.key==='steps'?((d.paths || []).length>1?6:4):panelLarge?panelCapability(t.type,'height',12):large?12:panelCapability(t.type,'height',6);
    var xs=large?[0]:narrow?[0,6]:[8], candidates=xs.map(function(x){
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
function sectionExploreLayout(d,value,warnings,path){
  var out={},used=Object.create(null);path=path || 'exploreLayout';
  function warn(at,message){if(warnings)warnings.push(at+': '+message);}
  function object(v){return v && typeof v==='object' && !Array.isArray(v);}
  function rect(v,at){
    if(!object(v) || !['x','y','w','h'].every(function(k){return Number.isFinite(v[k]) && v[k]>=0 && v[k]<=1;}) || v.w===0 || v.h===0){warn(at,'use x/y/w/h viewport fractions from 0 to 1, with positive width and height');return null;}
    return {x:v.x,y:v.y,w:v.w,h:v.h};
  }
  if(value===undefined)return out;
  if(!object(value)){warn(path,'expected an object');return out;}
  if(value.overlayScale!==undefined){
    if(!Number.isFinite(value.overlayScale) || value.overlayScale<.5 || value.overlayScale>1.25)warn(path+'.overlayScale','use a scale from 0.5 to 1.25 for panels and step controls');
    else out.overlayScale=value.overlayScale;
  }
  if(value.panels!==undefined){
    if(!Array.isArray(value.panels))warn(path+'.panels','expected an array');
    else out.panels=value.panels.reduce(function(list,v,i){
      var at=path+'.panels['+i+']',r=rect(v,at);
      if(!v || typeof v.panel!=='string' || !(d.panels || []).some(function(p){return p.id===v.panel;}) || used[v.panel]){warn(at+'.panel','use a unique existing panel ID');return list;}
      used[v.panel]=true;
      if(v.stacked!==undefined && typeof v.stacked!=='boolean'){warn(at+'.stacked','expected a boolean');return list;}
      if(r)list.push(Object.assign({panel:v.panel},r,{stacked:v.stacked===true}));return list;
    },[]);
  }
  if(value.prose!==undefined){
    var prose=value.prose,at=path+'.prose';
    if(!object(prose))warn(at,'expected an object with optional x/y/w/h, stacked and hidden');
    else{
      var geometry=['x','y','w','h'].some(function(k){return prose[k]!==undefined;}),notes=geometry?rect(prose,at):{};
      ['stacked','hidden'].forEach(function(k){
        if(prose[k]!==undefined && typeof prose[k]!=='boolean')warn(at+'.'+k,'expected a boolean');
        else if(notes && prose[k]!==undefined)notes[k]=prose[k];
      });
      if(notes)out.prose=notes;
    }
  }
  if(value.controls!==undefined){var controls=rect(value.controls,path+'.controls');if(controls)out.controls=controls;}
  if(value.camera!==undefined){
    var c=value.camera;
    if(!object(c) || !Number.isFinite(c.zoom) || c.zoom<.15 || c.zoom>4 || !['x','y'].every(function(k){return Number.isFinite(c[k]) && Math.abs(c[k])<=100;}))warn(path+'.camera','use zoom 0.15–4 and finite x/y SVG center coordinates between -100 and 100');
    else out.camera={zoom:c.zoom,x:c.x,y:c.y};
  }
  return out;
}
function diagramLayoutViews(d){
  var used=Object.create(null), views=[];
  (Array.isArray(d.layouts)?d.layouts:[]).forEach(function(v){
    if(!v || typeof v.id!=='string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v.id) || used[v.id] ||
      typeof v.name!=='string' || !v.name.trim() || v.name.trim().length>40 ||
      !v.sectionLayout || typeof v.sectionLayout!=='object' || Array.isArray(v.sectionLayout) ||
      !['default','backstage','confluence'].some(function(k){return Array.isArray(v.sectionLayout[k]);}))return;
    used[v.id]=true;views.push({id:v.id,name:v.name.trim(),presentation:v.presentation==='explore'?'explore':'standard',exploreLayout:sectionExploreLayout(d,v.exploreLayout),sectionLayout:v.sectionLayout,steps:Array.isArray(v.steps)?v.steps:undefined});
  });
  if(views.length)return views;
  return d.sectionLayout && typeof d.sectionLayout==='object' && !Array.isArray(d.sectionLayout) ?
    [{id:'default',name:typeof d.layoutName==='string' && d.layoutName.trim()?d.layoutName.trim():'Layout',presentation:'standard',sectionLayout:d.sectionLayout,legacy:true}] : [];
}
function sectionLayoutDefinition(d, id){
  var views=diagramLayoutViews(d);
  return views.find(function(v){return v.id===id;}) || views.find(function(v){return v.id===d.defaultLayout;}) || views[0];
}
function sectionViewStepsReachable(d,ids){
  return diagramPathList(d).some(function(p){return p.indices.some(function(i){return ids.indexOf(d.steps[i].id)>=0;});});
}
function sectionLayoutItems(d, target, id){
  var definition=sectionLayoutDefinition(d,id), layouts = definition && definition.sectionLayout, tiles = sectionLayoutTiles(d), saved = layouts && (Array.isArray(layouts[target]) ? layouts[target] : layouts.default);
  if (!Array.isArray(saved)) return definition && !definition.legacy ? sectionLayoutPreset(d,target) : null;
  var items = [], used = Object.create(null);
  saved.forEach(function(it){
    if (!it || typeof it !== 'object') return;
    if(it.controls!=null && (it.controls!=='steps'||it.panel!=null))return;
    var key = sectionLayoutKey(it);
    if (used[key] || !tiles.some(function(t){return t.key === key;})) return;
    if (!['x','y','w','h'].every(function(k){return Number.isInteger(it[k]);}) || it.x<0 || it.y<0 || it.w<1 || it.h<3 || it.x+it.w>12 || it.y>500 || it.h>40) return;
    var copy = {x:it.x,y:it.y,w:it.w,h:it.h};
    if (it.panel != null) copy.panel=it.panel;
    if (it.controls==='steps'){
      copy.controls='steps';
      if(it.attachTo==='diagram' || tiles.some(function(t){return t.key===it.attachTo && panelCapability(t.type,'attachControls',false);}))copy.attachTo=it.attachTo;
    }
    if(it.hidden===true && it.controls==null)copy.hidden=true;
    used[key]=true;items.push(copy);
  });
  var y = items.reduce(function(n,it){return it.hidden?n:Math.max(n,it.y+it.h);},0);
  tiles.forEach(function(t){
    if (used[t.key] || t.key==='steps') return; /* Old layouts keep controls attached. */
    var item={x:0,y:y,w:12,h:t.key==='diagram'?12:panelCapability(t.type,'fallbackHeight',6)};
    if(t.panel != null)item.panel=t.panel;
    items.push(item);y+=item.h;
  });
  return sectionLayoutPack(items);
}

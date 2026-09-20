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
function diagramLayoutViews(d){
  var used=Object.create(null), views=[];
  (Array.isArray(d.layouts)?d.layouts:[]).forEach(function(v){
    if(!v || typeof v.id!=='string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v.id) || used[v.id] ||
      typeof v.name!=='string' || !v.name.trim() || v.name.trim().length>40 ||
      !v.sectionLayout || typeof v.sectionLayout!=='object' || Array.isArray(v.sectionLayout) ||
      !['default','backstage','confluence'].some(function(k){return Array.isArray(v.sectionLayout[k]);}))return;
    used[v.id]=true;views.push({id:v.id,name:v.name.trim(),sectionLayout:v.sectionLayout,steps:Array.isArray(v.steps)?v.steps:undefined});
  });
  if(views.length)return views;
  return d.sectionLayout && typeof d.sectionLayout==='object' && !Array.isArray(d.sectionLayout) ?
    [{id:'default',name:typeof d.layoutName==='string' && d.layoutName.trim()?d.layoutName.trim():'Layout',sectionLayout:d.sectionLayout,legacy:true}] : [];
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

/* Object clipboard. The envelope travels as plain text; only explicitly
   copied declarations are pasted. Initial state travels with a Home element,
   while timeline patches remain owned by their original diagram. */
var BUILDER_CLIPBOARD_FORMAT = 'flowview-clipboard';
var BUILDER_CLIPBOARD_LIMIT = 2 * 1024 * 1024;
function builderClipboardObject(v){ return v && typeof v === 'object' && !Array.isArray(v); }
function builderClipboardParse(text){
  try {
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > BUILDER_CLIPBOARD_LIMIT) throw new Error('Clipboard content exceeds 2 MiB.');
    var data = JSON.parse(text);
    if (!data || data.format !== BUILDER_CLIPBOARD_FORMAT || data.version !== 1)
      throw new Error('Paste an object copied with Flowview Copy. For a whole spec, use Open or the JSON editor.');
    if (['home','panels','nodes','section'].indexOf(data.kind) < 0) throw new Error('Unsupported clipboard object.');
    if (!builderClipboardObject(data.value)) throw new Error('Invalid clipboard object.');
    if (data.protocols !== undefined && !builderClipboardObject(data.protocols)) throw new Error('Invalid clipboard protocols.');
    if (data.lanes !== undefined && !builderClipboardObject(data.lanes)) throw new Error('Invalid clipboard lanes.');
    return {data:data};
  } catch (ex){ return {error:ex.message}; }
}
function builderClipboardCopy(raw, targets){
  try {
    if (!targets || !targets.length) throw new Error('Select a node, panel, section, or Home layout element to copy.');
    var t = targets[0], rec = specSectionPaths(raw)[t.section];
    if (!rec || targets.some(function(x){return x.section !== t.section || x.kind !== t.kind;}))
      throw new Error('Copy objects of one type from one diagram at a time.');
    var d = specValueAt(raw,rec.diagram), value, kind, protocols = Object.create(null);
    if (t.kind === 'home'){
      var panel = d && (d.panels || [])[t.index];
      if (!panel || panel.type !== 'homemap' || ['rooms','devices','subjects'].indexOf(t.field) < 0)
        throw new Error('Select a Home layout element.');
      var item = (panel[t.field] || [])[t.item];
      if (!builderClipboardObject(item)) throw new Error('Save the Home element before copying it.');
      kind = 'home'; value = {field:t.field,item:item};
      if (t.field !== 'rooms' && panel.initial && Object.prototype.hasOwnProperty.call(panel.initial,item.id))
        value.initial = panel.initial[item.id];
    } else if (t.kind === 'panel'){
      kind = 'panels'; value = {panels:targets.map(function(x){
        var p = d && (d.panels || [])[x.index]; if (!p) throw new Error('Panel no longer exists.'); return p;
      })};
    } else if (t.kind === 'node'){
      kind = 'nodes'; var nodes = Object.create(null), groups = Object.create(null);
      targets.forEach(function(x){
        if (!d || !d.nodes || !Object.prototype.hasOwnProperty.call(d.nodes,x.id)) throw new Error('Node no longer exists.');
        nodes[x.id] = d.nodes[x.id];
        var group = d.nodes[x.id].group;
        while (group && !Object.prototype.hasOwnProperty.call(groups,group)){
          groups[group] = (d.groups || {})[group] || {};
          group = groups[group].parent;
        }
      });
      function includes(id){return Object.prototype.hasOwnProperty.call(nodes,id);}
      var rows=(d.rows || []).map(function(row){return row.map(function(slot){return Array.isArray(slot) ? slot.filter(includes) : includes(slot) ? slot : null;}).filter(function(slot){return slot && (!Array.isArray(slot) || slot.length);});}).filter(function(row){return row.length;});
      value = {nodes:nodes,groups:groups,rows:rows,floats:(d.floats || []).filter(function(f){return includes(f.id);}),edges:(d.edges || []).filter(function(e){return includes(e.from) && includes(e.to);})};
    } else if (t.kind === 'section' && targets.length === 1){
      kind = 'section'; value = rec.section.length ? specValueAt(raw,rec.section) : {heading:'Copied diagram',diagram:d};
    } else throw new Error('Copy supports nodes, panels, sections, and Home layout elements. Use Reuse steps for timeline steps.');
    var edges = kind === 'nodes' ? value.edges : kind === 'section' && value.diagram ? value.diagram.edges || [] : [];
    var page = normalize(raw), defs = resolveProtocols(page), lanes=Object.create(null), laneDefs=resolveLanes(page);
    edges.forEach(function(e){var key=e.kind || 'int';if (defs[key]) protocols[key] = defs[key];});
    if(kind === 'section' && value.diagram)(value.diagram.steps || []).forEach(function(step){if(laneDefs[step.lane])lanes[step.lane]=laneDefs[step.lane];});
    return {data:builderClone({format:BUILDER_CLIPBOARD_FORMAT,version:1,kind:kind,value:value,protocols:protocols,lanes:lanes})};
  } catch (ex){ return {error:ex.message}; }
}
function builderClipboardLabel(data){
  if (data.kind === 'home') return (data.value.item.label || data.value.item.id || 'Room') + ' · Home ' + data.value.field.slice(0,-1);
  if (data.kind === 'panels') return data.value.panels.length + ' panel(s) · layout and initial state';
  if (data.kind === 'nodes') return Object.keys(data.value.nodes).length + ' node(s) with their internal connections';
  return (data.value.heading || 'Section') + ' · complete section and timelines';
}
function builderClipboardFresh(taken, stem){
  var root = (typeof stem === 'string' && stem ? stem : 'item') + '-copy', id = root, n = 2;
  while (Object.prototype.hasOwnProperty.call(taken,id)) id = root + '-' + n++;
  taken[id] = true; return id;
}
function builderClipboardOffset(item, room){
  var out = builderClone(item);
  function shift(v,max,delta){return Math.max(0,Math.min(max,v + (v + delta <= max ? delta : -delta)));}
  if (isFiniteNum(out.x) && isFiniteNum(out.y)){
    out.x = shift(out.x,room ? 320 - out.w : 320,12);
    out.y = shift(out.y,room ? 180 - out.h : 180,8);
  }
  return out;
}
function planPasteBuilderClipboard(text,raw,data,destination){
  try {
    var checked = builderClipboardParse(JSON.stringify(data)); if (checked.error) return checked;
    data = checked.data;
    var next = builderClone(raw);
    // A page wrapper gives copied protocol/lane definitions a real home even
    // when the destination started as the supported bare-diagram shorthand.
    if(next && !next.page && !next.sections && !next.blocks && next.nodes && next.rows)next={page:{title:'',sections:[{diagram:next}]}};
    var rec = specSectionPaths(next)[destination.section];
    if (!rec) throw new Error('Select a destination section first.');
    var d = specValueAt(next,rec.diagram), value = data.value, target;
    // Preserve effective protocol meanings, including overridden built-ins.
    var page = next.page || next, defs = resolveProtocols(page), protocolMap = Object.create(null);
    var protocolTaken = Object.assign(Object.create(null),defs);
    Object.keys(data.protocols || {}).forEach(function(key){
      var definition = data.protocols[key], mapped = key;
      if (Object.prototype.hasOwnProperty.call(defs,key) && JSON.stringify(defs[key]) !== JSON.stringify(definition)) mapped = builderClipboardFresh(protocolTaken,key);
      protocolMap[key] = mapped;
      if (!Object.prototype.hasOwnProperty.call(defs,mapped) || mapped !== key){
        page.protocols = Object.assign(Object.create(null),page.protocols || {}); page.protocols[mapped] = definition;
      }
    });
    function mapEdges(edges){return (edges || []).map(function(e){var c=builderClone(e);if(protocolMap[c.kind || 'int'])c.kind=protocolMap[c.kind || 'int'];return c;});}
    if (data.kind === 'section'){
      if (!rec.section.length) throw new Error('Wrap a bare diagram in a page before pasting another section.');
      var section = builderClone(value); section.heading = (section.heading || 'Section') + ' (copy)';
      if(section.diagram && section.diagram.edges)section.diagram.edges=mapEdges(section.diagram.edges);
      var laneMap=Object.create(null),laneDefs=resolveLanes(page),laneTaken=Object.assign(Object.create(null),laneDefs);
      Object.keys(data.lanes || {}).forEach(function(key){
        var mapped=key;
        if(Object.prototype.hasOwnProperty.call(laneDefs,key) && JSON.stringify(laneDefs[key])!==JSON.stringify(data.lanes[key]))mapped=builderClipboardFresh(laneTaken,key);
        laneMap[key]=mapped;page.lanes=Object.assign(Object.create(null),page.lanes || {});page.lanes[mapped]=data.lanes[key];
      });
      if(section.diagram)(section.diagram.steps || []).forEach(function(step){if(laneMap[step.lane])step.lane=laneMap[step.lane];});
      var list = specValueAt(next,rec.section.slice(0,-1));
      list.splice(rec.section[rec.section.length-1]+1,0,section);
      target = {kind:'section',section:destination.section+1};
    } else {
      if (!builderClipboardObject(d) || !builderClipboardObject(d.nodes) || !Array.isArray(d.rows)) throw new Error('Select a destination with a diagram.');
      if (data.kind === 'panels'){
        if (!Array.isArray(value.panels) || !value.panels.length || value.panels.some(function(p){return !builderClipboardObject(p) || PANEL_TYPES.indexOf(p.type)<0;})) throw new Error('Invalid clipboard panels.');
        var panels = d.panels || (d.panels=[]), taken = Object.create(null);
        panels.forEach(function(p){taken[p.id]=true;});
        value.panels.forEach(function(p){var copy=builderClone(p);copy.id=builderClipboardFresh(taken,p.id || p.type);
          panelRemapReferences(copy,'nodes',null,function(ref){return Object.prototype.hasOwnProperty.call(d.nodes,ref);});
          panels.push(copy);});
        target = {kind:'panel',section:destination.section,index:panels.length-value.panels.length};
      } else if (data.kind === 'home'){
        var home = (d.panels || [])[destination.index];
        if (!home || home.type !== 'homemap') throw new Error('Select the destination Home panel, then paste the element.');
        var field = value.field, item = value.item;
        if (['rooms','devices','subjects'].indexOf(field)<0 || !builderClipboardObject(item) || !isFiniteNum(item.x) || !isFiniteNum(item.y)) throw new Error('Invalid Home clipboard element.');
        if (field === 'rooms' && (!isFiniteNum(item.w) || !isFiniteNum(item.h) || !homemapRooms({rooms:[item]}).length)) throw new Error('Invalid room geometry.');
        if (field === 'devices' && !homemapDeviceValid(item)) throw new Error('Invalid Home device.');
        if (field === 'subjects' && (typeof item.id !== 'string' || !item.id)) throw new Error('Invalid Home subject.');
        var items = home[field] || (home[field]=[]), ids = Object.create(null); ids.signals=true;
        if ((field === 'devices' && items.length >= 12) || (field === 'subjects' && items.length >= 6)) throw new Error('This Home map has reached its '+field+' limit.');
        ['devices','subjects','rooms'].forEach(function(key){(home[key] || []).forEach(function(x){if(x.id)ids[x.id]=true;});});
        var copy = builderClipboardOffset(item,field === 'rooms');
        if (field !== 'rooms' || item.id) copy.id=builderClipboardFresh(ids,item.id);
        if (copy.label) copy.label += ' (copy)';
        items.push(copy);
        if (field !== 'rooms' && Object.prototype.hasOwnProperty.call(value,'initial')){
          home.initial = Object.assign(Object.create(null),home.initial || {});
          home.initial[copy.id] = field === 'subjects' && homemapSubjectPosition(value.initial) ? builderClipboardOffset(value.initial,false) : builderClone(value.initial);
        }
        target={kind:'home',section:destination.section,index:destination.index,field:field,item:items.length-1};
      } else {
        if (!builderClipboardObject(value.nodes) || !Object.keys(value.nodes).length || !Array.isArray(value.edges) || !builderClipboardObject(value.groups)) throw new Error('Invalid node clipboard.');
        var ids=Object.create(null), groupIds=Object.create(null), used=Object.assign(Object.create(null),d.nodes), usedGroups=Object.assign(Object.create(null),d.groups || {});
        Object.keys(value.groups).forEach(function(id){groupIds[id]=builderClipboardFresh(usedGroups,id);});
        Object.keys(value.groups).forEach(function(id){
          var group=builderClone(value.groups[id]); if(group.parent)group.parent=groupIds[group.parent];
          if(!d.groups)d.groups=Object.create(null);d.groups[groupIds[id]]=group;
        });
        Object.keys(value.nodes).forEach(function(id){
          if(!builderClipboardObject(value.nodes[id]))throw new Error('Invalid clipboard node.');
          var copy=builderClone(value.nodes[id]);ids[id]=builderClipboardFresh(used,id);
          if(copy.group)copy.group=groupIds[copy.group];d.nodes[ids[id]]=copy;
        });
        var placed=Object.create(null);
        function nodeRef(id){if(!Object.prototype.hasOwnProperty.call(ids,id))throw new Error('Clipboard placement has an unknown node.');placed[id]=true;return ids[id];}
        (value.rows || []).forEach(function(row){d.rows.push(row.map(function(slot){return Array.isArray(slot) ? slot.map(nodeRef) : nodeRef(slot);}));});
        (value.floats || []).forEach(function(f){var floating=builderClone(f);floating.id=nodeRef(f.id);if(!d.floats)d.floats=[];d.floats.push(floating);});
        var unplaced=Object.keys(ids).filter(function(id){return !placed[id];});
        while(unplaced.length)d.rows.push(unplaced.splice(0,5).map(nodeRef));
        var edges=mapEdges(value.edges).map(function(e){if(!ids[e.from] || !ids[e.to])throw new Error('Clipboard connection has a missing endpoint.');e.from=ids[e.from];e.to=ids[e.to];return e;});
        d.edges=(d.edges || []).concat(edges);
        target={kind:'node',section:destination.section,id:ids[Object.keys(ids)[0]]};
      }
    }
    var errors = validate(normalize(next)).errors;
    if(errors.length)throw new Error('Paste was not applied: '+errors[0]);
    return {text:JSON.stringify(next,null,2),target:target};
  } catch(ex){return {error:ex.message};}
}

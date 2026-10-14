/* Local draw.io import. XML/stream APIs are used only by the decoding boundary;
   the cell-record converter below is pure and independently testable. */
var DRAWIO_DECODE_LIMIT=8*1024*1024;
function drawioError(message){throw Error('draw.io: '+message);}
function drawioWarning(todos,message){if(todos.indexOf(message)<0)todos.push(message);}
function drawioNumber(value,fallback){
  if(value===undefined || value===null)return fallback;
  if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value)) || !Number.isFinite(Number(value)) || Math.abs(Number(value))>100000)
    drawioError('geometry must use finite coordinates within ±100000');
  return Number(value);
}
function drawioStyle(text){
  var style=Object.create(null);
  String(text || '').split(';').filter(Boolean).forEach(function(part){var i=part.indexOf('=');if(i<0){if(style._name)drawioError('multiple named styles are unsupported');style._name=part;}else style[part.slice(0,i)]=part.slice(i+1);});
  return style;
}
function drawioConvertPages(pages,todos){
  todos=todos || [];drawioWarning(todos,'draw.io shapes, sizes, styling, label formatting and connection routing use native Flowview rendering; node centers are retained.');
  var totals={cells:0,nodes:0,edges:0,groups:0};
  if(!pages.length || pages.length>20)drawioError('choose 1–20 pages');
  var sections=pages.map(function(page,pageIndex){
    var cells=Object.create(null),children=Object.create(null),nodes=Object.create(null),groups=Object.create(null),floats=[],edges=[],ids=Object.create(null),groupIds=Object.create(null),pairs=Object.create(null);
    function fail(message){drawioError('page '+(pageIndex+1)+' ('+page.name+'): '+message);}
    page.cells.forEach(function(cell){
      if(++totals.cells>1000)fail('limited to 1000 cells across all pages');
      if(typeof cell.id!=='string' || !cell.id || cell.id.length>200 || /[\x00-\x1f]/.test(cell.id))fail('every cell needs an ID of 1–200 characters');
      if(Object.prototype.hasOwnProperty.call(cells,cell.id))fail('duplicate cell ID '+cell.id);
      if(cell.visible==='0' || cell.collapsed==='1')fail('hidden or collapsed cells/layers are unsupported: '+cell.id);
      ['vertex','edge','visible','collapsed'].forEach(function(key){if(cell[key]!==undefined && cell[key]!=='0' && cell[key]!=='1')fail('invalid '+key+' flag on '+cell.id);});
      if(cell.vertex==='1' && cell.edge==='1')fail('cell cannot be both vertex and edge: '+cell.id);
      cell=Object.assign({},cell,{style:drawioStyle(cell.style)});cells[cell.id]=cell;children[cell.id]=[];
      if(cell.label.length>1000)fail('labels are limited to 1000 characters');
    });
    var rootIds=Object.keys(cells).filter(function(id){return !cells[id].parent;});
    if(rootIds.length!==1)fail('expected exactly one root cell');var rootId=rootIds[0],root=cells[rootId];
    if(root.vertex==='1' || root.edge==='1' || root.geometry)fail('invalid root cell');
    Object.keys(cells).forEach(function(id){
      var cell=cells[id],seen=Object.create(null),cursor=id,depth=0;
      while(cursor){if(!Object.prototype.hasOwnProperty.call(cells,cursor))fail('unknown parent '+cursor);if(seen[cursor])fail('parent cycle at '+cursor);seen[cursor]=true;if(++depth>32)fail('parent depth exceeds 32');cursor=cells[cursor].parent;}
      if(cell.parent)children[cell.parent].push(id);
    });
    var layers=children[rootId];if(!layers.length)fail('missing layer');
    function group(cell){if(++totals.groups>64)fail('limited to 64 groups across all pages');groupIds[cell.id]='drawio-group-'+totals.groups;groups[groupIds[cell.id]]={title:cell.label || 'Group'};}
    Object.keys(cells).forEach(function(id){
      var cell=cells[id],s=cell.style;
      if(s.opacity!==undefined){
        if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s.opacity) || !Number.isFinite(Number(s.opacity)) || Number(s.opacity)<0 || Number(s.opacity)>100)fail('opacity must be a number from 0 to 100: '+id);
        if(Number(s.opacity)===0)fail('fully transparent cells are unsupported: '+id);
      }
      if(s.image || s.shape && /^(?:image|stencil\(|mxgraph\.)/.test(s.shape) || s._name==='image')fail('images, custom stencils and libraries are unsupported: '+id);
      if(s.sourcePort || s.targetPort)fail('port endpoints are unsupported: '+id);
      if(s.rotation && Number(s.rotation)!==0 || s.flipH==='1' || s.flipV==='1')fail('rotated or flipped geometry is unsupported: '+id);
      if(id===rootId)return;
      if(cell.parent===rootId){
        if(cell.vertex==='1' || cell.edge==='1' || cell.geometry)fail('invalid layer '+id);
        if(layers.length>1 || cell.label)group(cell);return;
      }
      if(cell.vertex!=='1' && cell.edge!=='1')fail('non-layer cell has no vertex/edge type: '+id);
      var parent=cells[cell.parent];if(parent.edge==='1')fail('child edge-label cells are unsupported; use the edge value: '+id);
      if(cell.vertex==='1'){
        if(!cell.geometry || cell.geometry.relative==='1')fail('relative vertices/ports or missing vertex geometry are unsupported: '+id);
        var shape=s.shape || s._name || 'rectangle';
        if(['rectangle','ellipse','rhombus','triangle','hexagon','parallelogram','trapezoid','cylinder','cylinder3','process','document','terminator','text','group','swimlane'].indexOf(shape)<0)fail('unsupported shape '+shape+' on '+id);
        if(children[id].length || shape==='group' || shape==='swimlane'){
          if(shape!=='group' && shape!=='swimlane')fail('complex containers are unsupported: '+id);
          if(!children[id].length)fail('empty groups are unsupported: '+id);group(cell);
        }else{
          if(++totals.nodes>500)fail('limited to 500 nodes across all pages');ids[id]='drawio-node-'+totals.nodes;
          nodes[ids[id]]={title:cell.label || id};
          if(shape==='text')drawioWarning(todos,'Text-only shapes become native cards with their labels preserved.');
        }
      }else if(s.shape && s.shape!=='connector' || s._name)fail('custom edge shapes/styles are unsupported: '+id);
    });
    var origins=Object.create(null);
    function origin(id){
      if(origins[id])return origins[id];var cell=cells[id];
      if(id===rootId || cell.parent===rootId)return origins[id]={x:0,y:0,locked:cell.style.locked==='1'};
      var parent=origin(cell.parent),g=cell.geometry;
      if(cell.vertex==='1'){
        var w=drawioNumber(g.width,0),h=drawioNumber(g.height,0);if(w<=0 || h<=0)fail('vertex width and height must be positive: '+id);
        var x=parent.x+drawioNumber(g.x,0),y=parent.y+drawioNumber(g.y,0);
        if(Math.abs(x)>100000 || Math.abs(y)>100000 || Math.abs(x+w/2)>100000 || Math.abs(y+h/2)>100000)fail('accumulated parent geometry exceeds coordinate limits: '+id);
        return origins[id]={x:x,y:y,w:w,h:h,locked:parent.locked || cell.style.locked==='1'};
      }
      return parent;
    }
    Object.keys(cells).forEach(function(id){
      var cell=cells[id];if(id===rootId || cell.parent===rootId)return;
      if(!groupIds[cell.parent] && cells[cell.parent].parent!==rootId)fail('unsupported parent container '+cell.parent);
      if(cell.vertex==='1'){
        var position=origin(id);
        if(groupIds[id]){if(groupIds[cell.parent])groups[groupIds[id]].parent=groupIds[cell.parent];}
        else{
          if(groupIds[cell.parent])nodes[ids[id]].group=groupIds[cell.parent];
          var f={id:ids[id],side:'below',x:position.x+position.w/2,y:position.y+position.h/2,noSpread:true};if(position.locked)f.locked=true;floats.push(f);
        }
      }else if(cell.edge==='1'){
        if(!ids[cell.source] || !ids[cell.target])fail('edge '+id+' needs two node terminals; dangling, group and edge endpoints are unsupported');
        var s=cell.style,start=s.startArrow===undefined?'none':s.startArrow,end=s.endArrow===undefined?'classic':s.endArrow;
        function arrow(value){return ['classic','classicThin','block','blockThin','open','openThin'].indexOf(value)>=0;}
        if(start!=='none' && !arrow(start) || end!=='none' && !arrow(end))fail('unsupported semantic arrow marker on '+id);
        if((start!=='none')===(end!=='none'))fail('edge '+id+' must have exactly one directed arrow; undirected/bidirectional edges are unsupported');
        var from=ids[start==='none'?cell.source:cell.target],to=ids[start==='none'?cell.target:cell.source],pair=from+'->'+to;
        if(pairs[pair])fail('parallel connections cannot be represented: '+id);pairs[pair]=true;
        if(++totals.edges>1000)fail('limited to 1000 edges across all pages');edges.push({from:from,to:to,kind:'drawio',label:cell.label});
      }
    });
    if(!Object.keys(nodes).length)fail('page contains no supported nodes');
    return {heading:page.name || 'Page '+(pageIndex+1),diagram:{view:'ambient',nodes:nodes,groups:groups,rows:[[]],floats:floats,edges:edges,steps:[]}};
  });
  return {page:{title:pages.length===1?pages[0].name:'Imported draw.io',protocols:{drawio:{label:'Connection',color:'#64748b'}},sections:sections},todos:todos};
}

function drawioParseXml(text){
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))drawioError('DOCTYPE and ENTITY declarations are not allowed');
  if(/<\?(?!xml(?:\s|\?>))/i.test(text))drawioError('XML processing instructions are unsupported');
  if(typeof DOMParser==='undefined')drawioError('XML parsing is unavailable in this browser');
  var doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror') || !doc.documentElement)drawioError('malformed XML');
  var queue=[{node:doc.documentElement,depth:0}],count=0;
  while(queue.length){var item=queue.pop();if(++count>6000 || item.depth>64)drawioError('XML exceeds 6000 elements or 64 nesting levels');
    if(item.node.namespaceURI || item.node.tagName.indexOf(':')>=0)drawioError('XML namespaces are unsupported');
    Array.from(item.node.attributes).forEach(function(a){if(/^on/i.test(a.name) || /^(?:src|href|xlink:href)$/i.test(a.name))drawioError('active or resource attributes are unsupported');});
    Array.from(item.node.children).forEach(function(child){queue.push({node:child,depth:item.depth+1});});
  }
  return doc.documentElement;
}
function drawioLabel(value,html,todos){
  value=String(value || '');if(value.length>16000)drawioError('label markup exceeds 16000 characters');
  if(!html){if(value.length>1000)drawioError('labels are limited to 1000 characters');return value;}
  // XML parsing is inert: unlike text/html, it cannot create resource-loading
  // HTML elements. Only formatting tags are visited, never mounted or executed.
  var root=drawioParseXml('<label>'+value.replace(/&nbsp;/g,'&#160;').replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi,'&amp;').replace(/<br\s*\/?\s*>/gi,'<br/>')+'</label>');
  function visit(node,depth){
    if(depth>16)drawioError('label nesting exceeds 16');
    if(node.nodeType===3 || node.nodeType===4)return node.nodeValue;
    if(node.nodeType!==1)return '';
    if(['label','b','strong','i','em','u','s','span','font','div','p','br'].indexOf(node.tagName)<0)drawioError('HTML label links, active content and resource tags are unsupported: '+node.tagName);
    Array.from(node.attributes).forEach(function(a){if(['style','color','face','size'].indexOf(a.name)<0)drawioError('unsupported HTML label attribute '+a.name);});
    if(node.tagName==='br')return '\n';var text=Array.from(node.childNodes).map(function(n){return visit(n,depth+1);}).join('');
    return ['div','p'].indexOf(node.tagName)>=0?text+'\n':text;
  }
  var result=visit(root,0).trim();if(result.length>1000)drawioError('labels are limited to 1000 characters');
  if(value!==result)drawioWarning(todos,'HTML label formatting is converted to plain text.');return result;
}
function drawioModelRecords(model,name,todos){
  function childrenOnly(node,allowed){Array.from(node.children).forEach(function(child){if(allowed.indexOf(child.tagName)<0)drawioError('unsupported XML element '+child.tagName);});
    Array.from(node.childNodes).forEach(function(child){if((child.nodeType===3 || child.nodeType===4) && child.nodeValue.trim())drawioError('unexpected XML text in '+node.tagName);});}
  function attrs(node){var out=Object.create(null);Array.from(node.attributes).forEach(function(a){out[a.name]=a.value;});return out;}
  if(model.tagName!=='mxGraphModel')drawioError('expected mxGraphModel');
  if(model.hasAttribute('backgroundImage') || model.getAttribute('math')==='1' || model.hasAttribute('style'))drawioError('background images, math and custom stylesheets are unsupported');
  if(model.hasAttribute('extFonts'))drawioWarning(todos,'External fonts are omitted; native fonts are used.');
  childrenOnly(model,['root']);if(model.children.length!==1)drawioError('expected one model root');
  var root=model.children[0];childrenOnly(root,['mxCell','UserObject','object']);
  if(root.children.length>1000)drawioError('limited to 1000 cells across all pages');
  return {name:name,cells:Array.from(root.children).map(function(entry){
    var wrapper=entry.tagName==='mxCell'?null:entry,cell=entry,metadata=null;
    if(wrapper){childrenOnly(wrapper,['mxCell']);if(wrapper.children.length!==1)drawioError('user objects require exactly one mxCell');cell=wrapper.children[0];metadata=attrs(wrapper);
      if(metadata.placeholders==='1' || metadata.placeholder || metadata.animation)drawioError('dynamic placeholders/animations are unsupported');
      if(Object.keys(metadata).some(function(k){return k!=='id' && k!=='label';}))drawioWarning(todos,'User-object metadata, notes and links are omitted; explicit labels are retained.');
    }
    var rec=attrs(cell);if(metadata){if(rec.id && rec.id!==metadata.id)drawioError('conflicting wrapper/cell IDs');rec.id=metadata.id;}
    if(rec.placeholders==='1' || rec.placeholder || rec.animation)drawioError('dynamic placeholders/animations are unsupported');
    if(rec.link)drawioWarning(todos,'Cell links are omitted and never followed.');
    var style=drawioStyle(rec.style);rec.label=drawioLabel(metadata && metadata.label!==undefined?metadata.label:rec.value,style.html==='1',todos);
    childrenOnly(cell,['mxGeometry']);if(cell.children.length>1)drawioError('multiple cell geometries');
    if(cell.children.length){var geometry=cell.children[0];rec.geometry=attrs(geometry);
      if(rec.geometry.as!=='geometry')drawioError('mxGeometry requires as="geometry"');
      if(rec.geometry.relative!==undefined && rec.geometry.relative!=='0' && rec.geometry.relative!=='1')drawioError('invalid relative geometry flag');
      ['x','y','width','height'].forEach(function(k){drawioNumber(rec.geometry[k],0);});
      childrenOnly(geometry,rec.edge==='1'?['mxPoint','Array']:[]);
      Array.from(geometry.children).forEach(function(child){
        if(child.tagName==='Array'){if(child.getAttribute('as')!=='points')drawioError('unsupported geometry array');childrenOnly(child,['mxPoint']);}
        var points=child.tagName==='Array'?Array.from(child.children):[child];
        points.forEach(function(point){childrenOnly(point,[]);drawioNumber(point.getAttribute('x'),0);drawioNumber(point.getAttribute('y'),0);
          if(point.hasAttribute('as') && ['offset','sourcePoint','targetPoint'].indexOf(point.getAttribute('as'))<0)drawioError('unsupported geometry point');});
      });
    }
    return rec;
  })};
}
async function drawioToSpec(text,options){
  options=options || {};var limit=options.maxBytes || 4*1024*1024;
  if(typeof text!=='string' || importUtf8Bytes(text)>limit)drawioError('input exceeds '+(limit/1024/1024)+' MiB');
  if(importLooksBinary(text))drawioError('binary files and embedded image/PDF carriers are unsupported');
  var used=0,cellCount=0,todos=[],pages=[],seen=Object.create(null);
  function current(){if(options.signal && options.signal.aborted || options.isCurrent && !options.isCurrent())drawioError('import cancelled because its source or destination changed');}
  function consume(n){used+=n;if(used>DRAWIO_DECODE_LIMIT)drawioError('decoded pages exceed the aggregate 8 MiB limit');}
  function addPage(model,name){var page=drawioModelRecords(model,name,todos);cellCount+=page.cells.length;if(cellCount>1000)drawioError('limited to 1000 cells across all pages');pages.push(page);}
  async function inflate(value){
    if(typeof DecompressionStream==='undefined')drawioError('this browser cannot decode compressed draw.io; export uncompressed XML');
    value=value.trim();if(!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))drawioError('invalid compressed Base64 page');
    var binary=atob(value),bytes=Uint8Array.from(binary,function(ch){return ch.charCodeAt(0);}),stream;
    try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch(ex){drawioError('raw-DEFLATE decoding is unavailable; export uncompressed XML');}
    var reader=stream.getReader(),chunks=[],decoder=new TextDecoder('utf-8',{fatal:true});
    function abort(){reader.cancel().catch(function(){});}
    if(options.signal)options.signal.addEventListener('abort',abort,{once:true});
    try{
      while(true){current();var chunk=await reader.read();current();if(chunk.done)break;consume(chunk.value.byteLength);chunks.push(decoder.decode(chunk.value,{stream:true}));}
      chunks.push(decoder.decode());return decodeURIComponent(chunks.join(''));
    }catch(ex){await reader.cancel().catch(function(){});if(/^draw.io:/.test(ex.message))throw ex;drawioError('corrupt compressed page or URI encoding');}
    finally{if(options.signal)options.signal.removeEventListener('abort',abort);reader.releaseLock();}
  }
  current();var root=drawioParseXml(text);
  if(root.tagName==='mxGraphModel'){consume(importUtf8Bytes(text));addPage(root,'Imported draw.io');}
  else if(root.tagName==='mxfile'){
    if(Array.from(root.childNodes).some(function(n){return (n.nodeType===3 || n.nodeType===4) && n.nodeValue.trim();}))drawioError('unexpected text outside diagram pages');
    var diagrams=Array.from(root.children);if(!diagrams.length || diagrams.length>20)drawioError('choose 1–20 pages');
    for(var i=0;i<diagrams.length;i++){
      current();var page=diagrams[i];if(page.tagName!=='diagram')drawioError('mxfile may contain only diagram pages');
      var id=page.getAttribute('id');if(id && seen[id])drawioError('duplicate page ID '+id);if(id)seen[id]=true;
      var name=page.getAttribute('name') || 'Page '+(i+1),model;
      if(name.length>200)drawioError('page names are limited to 200 characters');
      if(page.children.length){if(page.children.length!==1 || page.children[0].tagName!=='mxGraphModel')drawioError('expected one mxGraphModel per page');
        if(Array.from(page.childNodes).some(function(n){return (n.nodeType===3 || n.nodeType===4) && n.nodeValue.trim();}))drawioError('mixed compressed and XML content in one page');
        model=page.children[0];consume(importUtf8Bytes(new XMLSerializer().serializeToString(model)));
      }else model=drawioParseXml(await inflate(page.textContent));
      current();addPage(model,name);
    }
  }else drawioError('expected mxfile or mxGraphModel; embedded image/PDF carriers and libraries are unsupported');
  current();return drawioConvertPages(pages,todos);
}

/* Pure import/export preparation. Browser resources and publication live in io.js. */

/* ---------------- bounded Mermaid flowcharts ---------------- */

/* Deliberately a parser for a documented subset, never a Mermaid evaluator.
   Keep this pure leaf self-contained: CLI/VM callers load io-model alone. */
function mermaidFlowchartToSpec(source){
  var nodes=Object.create(null),groups=Object.create(null),order=[],edges=[],pairs=Object.create(null),stack=[],todos=['Mermaid layout and arrow appearance use native Flowview rendering.'];
  var statements=[],buffer='',quote=false,brackets=[],line=1,start=1,direction;
  function fail(message){throw Error('line '+line+': '+message);}
  function warning(message){if(todos.indexOf(message)<0)todos.push(message);}
  function label(value){
    value=value.trim();
    if(value[0]==='"'){if(value[value.length-1]!=='"')fail('unclosed quoted label');value=value.slice(1,-1);}
    if(!value || /[<>`"\r\n]/.test(value))fail('use nonempty plain-text labels; HTML and Markdown labels are unsupported');
    if(/#(?:\d+|[A-Za-z]+);/.test(value))fail('Mermaid entity escapes are unsupported; paste the literal character in a quoted label');
    if(value.length>500)fail('labels are limited to 500 characters');
    return value;
  }
  function emit(){if(buffer.trim()){if(statements.length>=2000)fail('flowcharts are limited to 2000 statements');statements.push({text:buffer.trim(),line:start});}buffer='';start=line;}
  // Split statements without splitting quoted labels, shape delimiters or pipe labels.
  var pipe=false;
  for(var at=0;at<source.length;at++){
    var ch=source[at];
    if(!quote && source.slice(at,at+2)==='%%'){
      if(source[at+2]==='{')fail('Mermaid directives are unsupported');
      while(at<source.length && source[at]!=='\n')at++;
      ch='\n';
    }
    if(ch==='"')quote=!quote;
    if(!quote){
      if(ch==='|' && !brackets.length)pipe=!pipe;
      if(!pipe){
        if('[({'.indexOf(ch)>=0)brackets.push(ch);
        if('])}'.indexOf(ch)>=0){if(brackets.pop()!==({']':'[',')':'(','}':'{'})[ch])fail('mismatched node delimiter');}
      }
    }
    if(ch==='\n' || ch==='\r' || ch===';' && !quote && !brackets.length && !pipe){
      if(quote || brackets.length || pipe)fail('unclosed label or node delimiter; multiline labels are unsupported');
      emit();if(ch==='\n')line++;start=line;
    }else buffer+=ch;
  }
  if(quote || brackets.length || pipe)fail('unclosed label or node delimiter');emit();
  var header=statements.shift(),match=header && /^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)$/.exec(header.text);
  if(header)line=header.line;
  if(!match)fail('expected flowchart/graph followed by TD, TB, BT, LR, or RL');direction=match[1];
  var idPattern=/^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/;
  var delimiters=[['(((',')))'],['([','])'],['[[',']]'],['[(',')]'],['((', '))'],['{'+'{','}'+'}'],['[/','/]'],['[\\','\\]'],['[/','\\]'],['[\\','/]'],['[',']'],['(',')'],['{','}']];
  function node(input){
    var idMatch=idPattern.exec(input);if(!idMatch)fail('expected a node ID (letters, digits, underscores and single hyphens)');
    var id=idMatch[0],rest=input.slice(id.length).trimStart(),title=null;
    if(id==='end' || id==='subgraph' || id==='direction')fail('reserved node ID '+id);
    if(Object.prototype.hasOwnProperty.call(groups,id))fail('subgraph endpoints and node/subgraph ID collisions are unsupported: '+id);
    var candidates=delimiters.filter(function(d){return rest.indexOf(d[0])===0;});
    if(candidates.length)candidates=candidates.filter(function(d){return d[0].length===candidates[0][0].length;});
    var shape=candidates[0];
    if(shape){
      var pos=shape[0].length,end=-1,inQuote=false;
      for(;pos<rest.length;pos++){
        if(rest[pos]==='"')inQuote=!inQuote;
        var closing=!inQuote && candidates.find(function(d){return rest.slice(pos,pos+d[1].length)===d[1];});
        if(closing){shape=closing;end=pos;break;}
      }
      if(end<0)fail('unclosed node shape for '+id);
      title=label(rest.slice(shape[0].length,end));rest=rest.slice(end+shape[1].length).trimStart();
      if(shape[0]!=='[')warning('Mermaid node shapes are normalized to native cards.');
    }
    if(rest.indexOf(':::')===0){var cls=/^:::[A-Za-z_][\w-]*/.exec(rest);if(!cls)fail('invalid node class');rest=rest.slice(cls[0].length).trimStart();warning('Mermaid styles and classes are not imported.');}
    if(!Object.prototype.hasOwnProperty.call(nodes,id)){
      if(order.length>=200)fail('flowcharts are limited to 200 nodes');
      nodes[id]={title:title || id};order.push(id);
    }else if(title!==null)nodes[id].title=title;
    if(stack.length){
      var group=stack[stack.length-1];
      if(nodes[id].group && nodes[id].group!==group)fail('node '+id+' belongs to multiple subgraphs; move its references outside the subgraph blocks');
      nodes[id].group=group;
    }
    return {id:id,rest:rest};
  }
  function endpoints(input){
    var ids=[],parsed=node(input);ids.push(parsed.id);
    while(parsed.rest[0]==='&'){parsed=node(parsed.rest.slice(1).trimStart());ids.push(parsed.id);}
    return {ids:ids,rest:parsed.rest};
  }
  function outsideQuote(input,token,start){
    var quoted=false;for(var i=start;i<input.length;i++){if(input[i]==='"')quoted=!quoted;if(!quoted && input.slice(i,i+token.length)===token)return i;}return -1;
  }
  statements.forEach(function(statement){
    line=statement.line;var input=statement.text;
    if(/^subgraph\b/.test(input)){
      var declaration=input.slice(8).trim(),m=idPattern.exec(declaration);
      if(!m)fail('subgraph requires an explicit simple ID');
      var id=m[0],tail=declaration.slice(id.length).trim(),title=id;
      if(tail){if(tail[0]!=='[' || tail[tail.length-1]!==']')fail('use subgraph ID [plain-text title]');title=label(tail.slice(1,-1));}
      if(Object.prototype.hasOwnProperty.call(nodes,id) || Object.prototype.hasOwnProperty.call(groups,id))fail('duplicate or colliding subgraph ID '+id);
      if(Object.keys(groups).length>=32 || stack.length>=16)fail('flowcharts are limited to 32 subgraphs and 16 nesting levels');
      groups[id]={title:title};if(stack.length)groups[id].parent=stack[stack.length-1];stack.push(id);return;
    }
    if(input==='end'){if(!stack.length)fail('end without a subgraph');stack.pop();return;}
    if(/^(?:classDef|class|style|linkStyle)\s+\S+\s+\S/.test(input)){
      warning('Mermaid styles and classes are not imported.');return;
    }
    if(/^(?:click|direction|accTitle|accDescr|classDef|class|style|linkStyle)\b/.test(input))fail('unsupported flowchart statement '+JSON.stringify(input));
    var left=endpoints(input);
    while(left.rest){
      var rest=left.rest,edgeLabel='';
      if(rest.indexOf('-->')===0){
        rest=rest.slice(3).trimStart();
        if(rest[0]==='|'){
          var close=outsideQuote(rest,'|',1);if(close<0)fail('unclosed edge label');edgeLabel=label(rest.slice(1,close));rest=rest.slice(close+1).trimStart();
        }
      }else if(/^--\s+/.test(rest)){
        var ending=outsideQuote(rest,'-->',2);if(ending<0)fail('only solid directed --> links are supported');edgeLabel=label(rest.slice(2,ending));rest=rest.slice(ending+3).trimStart();
      }else fail('unsupported flowchart syntax '+JSON.stringify(rest)+'; use solid directed --> links');
      var right=endpoints(rest);
      left.ids.forEach(function(from){right.ids.forEach(function(to){
        var key=from+'->'+to;if(pairs[key])fail('parallel connections '+key+' cannot be represented; use distinct intermediate nodes');
        if(edges.length>=500)fail('flowcharts are limited to 500 connections');pairs[key]=true;
        edges.push({from:from,to:to,kind:'mermaid',label:edgeLabel});
      });});left=right;
    }
  });
  if(stack.length)fail('unclosed subgraph '+stack[stack.length-1]);if(!order.length)fail('no flowchart nodes found');
  // Condense cycles, then rank the acyclic component graph. Each original node
  // and connection survives; cycle members share a rank with separate slots.
  var adjacency=Object.create(null),index=Object.create(null),low=Object.create(null),active=Object.create(null),component=Object.create(null),pending=[],serial=0,components=[];
  order.forEach(function(id){adjacency[id]=[];});edges.forEach(function(e){adjacency[e.from].push(e.to);});
  function visit(id){
    index[id]=low[id]=serial++;pending.push(id);active[id]=true;
    adjacency[id].forEach(function(next){if(index[next]===undefined){visit(next);low[id]=Math.min(low[id],low[next]);}else if(active[next])low[id]=Math.min(low[id],index[next]);});
    if(low[id]===index[id]){var members=[],next;do{next=pending.pop();active[next]=false;component[next]=components.length;members.push(next);}while(next!==id);components.push(members);}
  }
  order.forEach(function(id){if(index[id]===undefined)visit(id);});
  var rank=components.map(function(){return 0;}),incoming=components.map(function(){return 0;}),outgoing=components.map(function(){return [];});
  edges.forEach(function(e){var a=component[e.from],b=component[e.to];if(a!==b && outgoing[a].indexOf(b)<0){outgoing[a].push(b);incoming[b]++;}});
  var queue=[];incoming.forEach(function(n,i){if(!n)queue.push(i);});
  for(var qi=0;qi<queue.length;qi++)outgoing[queue[qi]].forEach(function(next){rank[next]=Math.max(rank[next],rank[queue[qi]]+1);if(--incoming[next]===0)queue.push(next);});
  var max=Math.max.apply(null,rank),slots=Object.create(null),horizontal=direction==='LR' || direction==='RL',reverse=direction==='RL' || direction==='BT';
  var floats=order.map(function(id){var layer=rank[component[id]],slot=slots[layer] || 0;slots[layer]=slot+1;var primary=reverse?max-layer:layer;
    return {id:id,side:'below',x:160+(horizontal?primary:slot)*300,y:130+(horizontal?slot:primary)*180,noSpread:true};});
  return {page:{title:'Converted flowchart',protocols:{mermaid:{label:'Connection',color:'#64748b'}},sections:[{heading:'Converted flowchart',diagram:{view:'ambient',nodes:nodes,groups:groups,rows:[[]],floats:floats,edges:edges,steps:[]}}]},todos:todos};
}

/* ---------------- Mermaid sequence skeleton ---------------- */

function mermaidToSpec(text, options){
  if (typeof text !== 'string') throw new Error('line 1: expected mermaid text');
  if(importUtf8Bytes(text)>4*1024*1024)throw new Error('Mermaid input exceeds 4 MiB.');
  /* Match the CLI: the first mermaid fence wins. Sequence conversion stays compatible. */
  var fence = /^```mermaid\s*$([\s\S]*?)^```\s*$/m.exec(text);
  var source=(fence ? fence[1] : text).trim();
  if(/^(?:(?:%%[^\n]*\n)\s*)*(?:flowchart|graph)\b/.test(source))return mermaidFlowchartToSpec(source);
  var lines = (fence ? fence[1] : text).split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)
    .map(function(ln){ return ln.trim(); }).filter(function(ln){ return ln; });
  if (!lines.length || lines[0] !== 'sequenceDiagram')
    throw new Error('line 1: not a sequenceDiagram (first line is ' +
      JSON.stringify(lines[0] || '<empty>') + '); supported Mermaid headers: sequenceDiagram, flowchart, graph');
  var order = [], titles = Object.create(null), originals=Object.create(null), messages = [], todos = [];
  var depth = 0, skipped = 0, header = null, blockLine = 0, n = 1;
  function ensure(pid, title){
    var id = pid.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!id) throw new Error('line ' + n + ': participant id ' + JSON.stringify(pid) + ' slugs to nothing');
    if(options && options.strictIds && Object.prototype.hasOwnProperty.call(originals,id) && originals[id]!==pid)
      throw new Error('line '+n+': participant IDs '+JSON.stringify(originals[id])+' and '+JSON.stringify(pid)+' map to the same node; rename one before merging');
    originals[id]=pid;
    if (!Object.prototype.hasOwnProperty.call(titles, id)){
      order.push(id);
      titles[id] = title || pid;
    } else if (title) titles[id] = title;
    return id;
  }
  for (var i = 1; i < lines.length; i++){
    var ln = lines[i];
    n = i + 1; /* CLI line numbers count nonblank lines. */
    if (ln === 'autonumber') continue;
    if (/^Note\b/i.test(ln)){
      todos.push('note not converted: ' + ln);
      continue;
    }
    var b = /^(alt|opt|loop|par)\b\s*(.*)$/.exec(ln);
    if (b){
      if (!depth){ header = (b[1] + ' ' + b[2]).trim(); skipped = 0; blockLine = n; }
      depth++;
      continue;
    }
    if (ln === 'else' || ln.indexOf('else ') === 0){
      if (!depth) throw new Error('line ' + n + ": 'else' outside a block");
      continue;
    }
    if (ln === 'end'){
      if (!depth) throw new Error('line ' + n + ": 'end' without an open block");
      depth--;
      if (!depth) todos.push(header + ' block not converted (' + skipped + ' message(s) inside) — add by hand');
      continue;
    }
    var p = /^participant\s+(\S+?)(?:\s+as\s+(.+?))?\s*$/.exec(ln);
    if (p){
      if (!depth) ensure(p[1], p[2]);
      continue;
    }
    var m = /^(\S+?)\s*(-->>|->>)\s*(\S+?)\s*:\s*(.+?)\s*$/.exec(ln);
    if (m){
      if (depth){ skipped++; continue; }
      messages.push({from: ensure(m[1]), to: ensure(m[3]), ret: m[2] === '-->>', text: m[4]});
      continue;
    }
    throw new Error('line ' + n + ': unsupported syntax ' + JSON.stringify(ln) +
      ' — supported: participant, ->> / -->> messages, autonumber, alt/opt/loop/par blocks, Note');
  }
  if (depth) throw new Error('line ' + blockLine + ': unclosed alt/opt/loop/par block');
  if (!messages.length) throw new Error('line ' + n + ': no messages found outside alt/opt/loop/par blocks');
  var edges = [], pairs = Object.create(null), steps = [];
  messages.forEach(function(m){
    var key = m.from + '->' + m.to;
    if (!pairs[key]){
      var kind = /https?|POST|GET/i.test(m.text) ? 'https' :
        /publish|subscribe|mqtt|qos/i.test(m.text) ? 'mqtt' : 'int';
      var edge = {from: m.from, to: m.to, kind: kind, label: m.text};
      if (m.ret) edge.ret = true;
      pairs[key] = true;
      edges.push(edge);
    }
    steps.push({edge: key, text: m.text});
  });
  var half = Math.floor((order.length + 1) / 2), rows = [order.slice(0, half)], nodes = {};
  if (order.length > half) rows.push(order.slice(half));
  order.forEach(function(id){ nodes[id] = {title: titles[id], sub: '', icon: 'gear', tint: 'cmd'}; });
  var title = 'Converted sequence';
  return {page: {title: title, sections: [{heading: title,
    text: ['Skeleton generated by mermaid2spec.py — enrich titles, subs, icons, tints, protocols, and prose before use.'],
    diagram: {view: 'ambient', nodes: nodes, rows: rows, edges: edges, steps: steps}
  }]}, todos: todos};
}

/* ---------------- staged local file import ---------------- */

/* Folder-backed authoring uses the same 4 MiB source ceiling. Keep the browser
   entry point bounded before and after decoding so a misleading File.size does
   not create a second, larger source path. */
var FLOWVIEW_IMPORT_MAX_BYTES = 4 * 1024 * 1024;

function importUtf8Bytes(text){
  if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

function importLooksBinary(text){
  if(text.indexOf('\0')>=0 || text.indexOf('\ufffd')>=0)return true;
  var sample=text.slice(0,8192),controls=0;
  for(var i=0;i<sample.length;i++){
    var code=sample.charCodeAt(i);
    if(code<32 && code!==9 && code!==10 && code!==12 && code!==13)controls++;
  }
  return !!sample.length && controls>Math.max(2,Math.floor(sample.length/100));
}

function importValidate(raw){
  var findings=validate(normalize(raw));
  if(findings.errors.length)throw Error(findings.errors.join('\n'));
}

function flowviewImportSummary(raw){
  var page=raw && (raw.page || raw),title=page && typeof page.title==='string' && page.title.trim() || 'Untitled diagram';
  var sections=[];
  if(page){
    if(Array.isArray(page.sections))sections=page.sections;
    else if(Array.isArray(page.blocks))sections=page.blocks;
    else if(page.diagram || page.nodes || page.rows)sections=[page];
  }
  return {title:title,sections:sections.length,
    text:title+' · '+sections.length+' section'+(sections.length===1?'':'s')};
}

function mermaidImportSummary(spec){
  var diagram=spec.page.sections[0].diagram,participants=Object.keys(diagram.nodes).length,messages=diagram.steps.length,todos=spec.todos.length;
  if(spec.page.title==='Converted flowchart'){
    var groups=Object.keys(diagram.groups).length,connections=diagram.edges.length;
    return {title:spec.page.title,nodes:participants,groups:groups,connections:connections,todos:todos,
      text:participants+' node'+(participants===1?'':'s')+' · '+groups+' group'+(groups===1?'':'s')+' · '+connections+' connection'+(connections===1?'':'s')};
  }
  return {title:spec.page.title,participants:participants,messages:messages,todos:todos,
    text:participants+' participant'+(participants===1?'':'s')+' · '+messages+' message'+(messages===1?'':'s')+
      (todos?' · '+todos+' Mermaid todo'+(todos===1?'':'s'):'')};
}

/* Classification deliberately combines bounded metadata with parsed content.
   Extensions select useful error language; they never make invalid bytes valid
   or prevent a correctly formed supported format from being recognized. */
function prepareFlowviewFileImport(meta,text,check){
  meta=meta || {};var name=typeof meta.name==='string' && meta.name.trim()?meta.name.trim():'untitled file';
  if(typeof meta.size==='number' && (meta.size<0 || meta.size>FLOWVIEW_IMPORT_MAX_BYTES))
    throw Error('Use a file no larger than 4 MiB.');
  if(typeof text!=='string')throw Error('The file could not be read as text.');
  if(importUtf8Bytes(text)>FLOWVIEW_IMPORT_MAX_BYTES)throw Error('Use a file no larger than 4 MiB.');
  if(importLooksBinary(text))throw Error('Binary files are not supported. Choose Flowview JSON, Mermaid, or Markdown with a Mermaid diagram.');
  var source=text.replace(/^\ufeff/,''),trimmed=source.trim();
  if(!trimmed)throw Error('The file is empty.');
  var raw,jsonError=null,mermaidError=null;
  if(/^[\[{]/.test(trimmed) || /\.json$/i.test(name)){
    try{raw=JSON.parse(source);}
    catch(ex){jsonError=ex;}
    if(raw!==undefined){
      (check || importValidate)(raw);
      return {name:name,kind:'flowview',type:'Flowview JSON',text:source,raw:raw,summary:flowviewImportSummary(raw),todos:[]};
    }
  }
  if(/(^|\n)\s*(?:sequenceDiagram|flowchart|graph)\b/.test(trimmed) || /^```mermaid\s*$/m.test(source) || /\.(mmd|mermaid|md|markdown)$/i.test(name)){
    try{
      var converted=mermaidToSpec(source);(check || importValidate)(converted);
      var type=converted.page.title==='Converted flowchart'?'flowchart':'sequence';
      return {name:name,kind:'mermaid',type:(/\.(md|markdown)$/i.test(name)?'Markdown Mermaid ':'Mermaid ')+type,
        text:JSON.stringify(converted,null,2),raw:converted,summary:mermaidImportSummary(converted),todos:converted.todos.slice()};
    }catch(ex){mermaidError=ex;}
  }
  if(jsonError)throw Error('Invalid Flowview JSON: '+jsonError.message);
  if(mermaidError)throw Error('Invalid Mermaid diagram: '+mermaidError.message);
  throw Error('Unsupported file. Choose Flowview .spec.json/.json, Mermaid .mmd/.mermaid, or Markdown containing a Mermaid diagram.');
}

/* Existing JSON/Mermaid callers retain their synchronous contract. XML decoding
   is selected only by the browser adapter, whose owner supplies cancellation. */
function drawioImportRecognized(text){
  if(typeof text!=='string')return false;var offset=0,end;
  while(offset<text.length){
    if(/\s/.test(text[offset])){offset++;continue;}
    if(text.slice(offset,offset+4)==='<!--'){end=text.indexOf('-->',offset+4);if(end<0)return false;offset=end+3;continue;}
    if(text.slice(offset,offset+5)==='<?xml'){end=text.indexOf('?>',offset+5);if(end<0)return false;offset=end+2;continue;}break;
  }
  return /^<(?:mxfile|mxGraphModel|!DOCTYPE|!ENTITY)\b/i.test(text.slice(offset,offset+32));
}
async function prepareFlowviewFileImportAsync(meta,text,check,options){
  if(!drawioImportRecognized(text) && !/\.(?:drawio|xml)$/i.test(meta && meta.name || ''))return prepareFlowviewFileImport(meta,text,check);
  if(meta && typeof meta.size==='number' && (meta.size<0 || meta.size>FLOWVIEW_IMPORT_MAX_BYTES))throw Error('Use a file no larger than 4 MiB.');
  var converted=await drawioToSpec(text,Object.assign({},options,{maxBytes:FLOWVIEW_IMPORT_MAX_BYTES}));
  (check || importValidate)(converted);
  return {name:meta && meta.name || 'draw.io XML',kind:'drawio',type:'draw.io XML',text:JSON.stringify(converted,null,2),raw:converted,summary:flowviewImportSummary(converted),todos:converted.todos.slice()};
}

/* ---------------- durability: filenames ---------------- */

function specFileName(raw){
  /* download name for the save button: page-title slug + .spec.json */
  var page = raw && raw.page ? raw.page : raw;
  var title = page && typeof page.title === 'string' ? page.title : '';
  var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (slug || 'flowspec') + '.spec.json';
}

/* ---------------- export: spec -> published page ----------------
   Client-side mirror of tools/inject.py: swap the template's one
   line-anchored flowspec JSON block for the editor text and retitle
   the page. Tag literals are concatenated so this file survives being
   inlined into a <script> block by the build. */

var FLOWSPEC_OPEN = '<scr' + 'ipt type="application/json" id="flowspec">';

var FLOWSPEC_CLOSE = '</scr' + 'ipt>';

function exportTemplateOpeners(templateText){
  /* line-anchored flowspec block openers (optional CR before the line
     end so CRLF templates count too) */
  var openRe = new RegExp('^' + FLOWSPEC_OPEN.replace(/[/\\^$.*+?()[\]{}|]/g, '\\$&') + '\\r?$', 'gm');
  return (templateText.match(openRe) || []).length;
}

function prepareExportSnapshot(specText, resolve){
  // Preserve the authored download; only the HTML copy is resolved/stripped.
  // Run synchronously at the click so source and frozen providers cannot drift
  // while the directory picker or template request is pending.
  if (/<\/script/i.test(specText))
    return {error: 'the spec contains a literal "</scr' + 'ipt" — escape it as "<\\/scr' + 'ipt" first'};
  try {
    var source=JSON.parse(specText), resolved=resolve(source);
    var snapshot=JSON.parse(JSON.stringify(resolved)), changed=JSON.stringify(snapshot)!==JSON.stringify(source);
    var diagrams=FlowCanon.sections(snapshot).map(function(section){return section.diagram;});
    if(snapshot && snapshot.nodes && snapshot.rows && !snapshot.page && !snapshot.blocks && !snapshot.sections)diagrams.push(snapshot);
    var page=normalize(snapshot);
    if(snapshot && snapshot.nodes && snapshot.rows && FLOWVIEW_SITE_BASE_URL){snapshot={page:page};changed=true;}
    if(page && FLOWVIEW_SITE_BASE_URL && !(page.documentLinks || {}).siteBaseUrl){page.documentLinks=Object.assign({},page.documentLinks,{siteBaseUrl:FLOWVIEW_SITE_BASE_URL});changed=true;}
    diagrams.forEach(function(diagram){
      if(diagram.topologyProvenance){diagram.sourceDiagrams=((diagram.sourceDiagrams || []).concat(diagram.topologyProvenance.imports.map(function(item){return Object.assign(diagramLinkReference(item.destination || {spec:item.spec}),{nodes:item.nodes});})));changed=true;}
      ['topologyImports','topologyExports','topologyProvenance'].forEach(function(key){
        if(Object.prototype.hasOwnProperty.call(diagram,key)){delete diagram[key];changed=true;}
      });
    });
    // Provider values can contain HTML closing tags even when the consumer's
    // source is safe. Escaping every '<' keeps the snapshot inert JSON.
    return {text:changed?JSON.stringify(snapshot,null,2).replace(/</g,'\\u003c'):specText};
  } catch(ex){
    return {error:'could not prepare the HTML snapshot: '+ex.message};
  }
}

function buildExportHtml(templateText, specText){
  /* the close-tag scan is case-insensitive — HTML tag names are, so
     "</SCRIPT" would break out of the JSON block just as surely */
  if (/<\/script/i.test(specText))
    return {error: 'the spec contains a literal "</scr' + 'ipt" — escape it as "<\\/scr' + 'ipt" first'};
  var spec;
  try { spec = JSON.parse(specText); }
  catch (ex){ return {error: 'not valid JSON (' + ex.message + ')'}; }
  var openRe = new RegExp('^' + FLOWSPEC_OPEN.replace(/[/\\^$.*+?()[\]{}|]/g, '\\$&') + '\\r?$', 'gm');
  var opens = templateText.match(openRe) || [];
  if (opens.length !== 1)
    return {error: 'the page template must hold exactly one flowspec block — found ' + opens.length};
  var start = templateText.search(openRe);
  var bodyFrom = start + FLOWSPEC_OPEN.length;
  var end = templateText.indexOf('\n' + FLOWSPEC_CLOSE, bodyFrom);
  if (end < 0) return {error: 'the page template’s flowspec block never closes'};
  var out = templateText.slice(0, bodyFrom) + '\n' + specText.trim() +
            templateText.slice(end);
  var page = spec && spec.page ? spec.page : spec;
  var title = page && typeof page.title === 'string' ? page.title : '';
  if (title){
    var safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out = out.replace(/<title>[\s\S]*?<\/title>/, '<title>' + safe + '</title>');
  }
  return {html: out};
}

/* Exactly these four portable files are exported; live connection and recovery
   files are neither copied nor removed. Preserve even an empty existing ledger. */
var FLOWVIEW_PROJECT_README = '# Flowview project\n\n'+
  '- `*.spec.json`: editable diagram source.\n'+
  '- `*.html`: rendered viewing snapshot; regenerate it from the source when the project changes.\n'+
  '- `*.ledger.md`: coverage and evidence notes that accompany the diagram.\n\n'+
  'Future manual or agent editing requires the JSON and Markdown ledger together. Keep their matching base names. To resume in Flowview, select this diagram folder from the Agent workspace; the spec and ledger are discovered together.\n\n'+
  'Commit diagram updates with all three project artifacts: JSON, HTML and ledger, so source, rendered output and evidence stay aligned. README.md is a fourth support file and may be committed too.\n\n'+
  'Connection metadata is created when needed. The hidden .flowview-agent directory, session identity, requests, transcripts, leases and recovery journal are not portable project artifacts and are not part of the three-artifact commit requirement.\n';
var FLOWVIEW_UNVERIFIED_LEDGER = '# Coverage ledger — unverified\n\n'+
  'No coverage ledger has been authored for this document yet. This file is an unverified placeholder, not evidence of coverage or validation.\n\n'+
  'Before relying on this diagram, record its sources, evidence, assumptions, coverage gaps and open questions here.\n';
function buildProjectExportFiles(base,source,html,ledger){
  return [{name:base+'.spec.json',text:source},{name:base+'.html',text:html},
    {name:base+'.ledger.md',text:typeof ledger==='string'?ledger:FLOWVIEW_UNVERIFIED_LEDGER},
    {name:'README.md',text:FLOWVIEW_PROJECT_README}];
}

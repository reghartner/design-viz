/* Workbench composition, outline/diff and interaction/preview coordination.
   Session, inspector, commands and I/O owners are assembled before this file. */
function panelAuthoringCatalog(){
  return PanelRegistry.types().filter(function(type){return !!panelAuthoring(type).picker;}).map(function(type){
    return Object.assign({type:type},panelAuthoring(type).picker);
  }).sort(function(a,b){return (a.order || 0)-(b.order || 0) || a.type.localeCompare(b.type);});
}

function starterCountLine(spec){
  var nodes = 0, steps = 0, panels = 0;
  specSectionPaths(spec).forEach(function(rec){
    var d = specValueAt(spec, rec.diagram);
    if (!d) return;
    nodes += Object.keys(d.nodes || {}).length;
    steps += (d.steps || []).length;
    panels += (d.panels || []).length;
  });
  return nodes + (nodes === 1 ? ' node · ' : ' nodes · ') +
    steps + (steps === 1 ? ' step · ' : ' steps · ') + panels + (panels === 1 ? ' panel' : ' panels');
}
/* Search the source tree, including nodes omitted from layout and hidden
   tabs. Keep raw paths and rendered section ordinals together. */
function builderOutline(raw, query){
  var entries = [], terms = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  specSectionPaths(raw).forEach(function(rec, section){
    var sec = specValueAt(raw, rec.section) || {}, d = specValueAt(raw, rec.diagram) || {};
    var ti = rec.section.indexOf('tabs');
    var tab = ti >= 0 ? {block: rec.section[ti - 1], tab: rec.section[ti + 1]} : null;
    var parent = ti >= 0 ? specValueAt(raw, rec.section.slice(0, ti + 2)) : null;
    var context = (parent && parent.label ? parent.label + ' / ' : '') + (sec.heading || 'Section ' + (section + 1));
    function add(kind, label, extra){
      var target = Object.assign({section: section, kind: kind}, extra || {});
      var path = builderTargetPath(raw, target);
      var haystack = (kind + ' ' + label + ' ' + context + ' ' + builderPathString(path)).toLowerCase();
      if (terms.every(function(term){ return haystack.indexOf(term) >= 0; }))
        entries.push({label: label, context: context, target: target, path: path, tab: tab});
    }
    add('section', sec.heading || 'Section ' + (section + 1));
    function bulletEntries(items,ancestry){
      (Array.isArray(items)?items:[]).forEach(function(item,i){
        var address=ancestry.concat([i]),label=typeof item==='string'?item:item && item.text;
        if(item==null)return;
        add('bullet',address.map(function(n){return n+1;}).join('.')+' · '+(label || 'Untitled point'),{index:address[0],bulletPath:address});
        if(item && Array.isArray(item.sub))bulletEntries(item.sub,address);
      });
    }
    bulletEntries(sec.bullets,[]);
    sectionContracts(sec).forEach(function(rec){
      add('contract',rec.value.title || 'On the wire',{card:rec.key});
    });
    Object.keys(d.nodes || {}).forEach(function(id){ add('node', ((d.nodes[id] || {}).title || id) + ' · ' + id, {id: id}); });
    Object.keys(d.groups || {}).forEach(function(id){ add('group', ((d.groups[id] || {}).title || id) + ' · ' + id, {id: id}); });
    (Array.isArray(d.edges) ? d.edges : []).forEach(function(e, index){
      if (e) add('edge', e.from + ' → ' + e.to + (e.label ? ' · ' + e.label : ''), {index: index});
    });
    (Array.isArray(d.panels) ? d.panels : []).forEach(function(p, index){
      if (p) add('panel', (p.title || p.id) + ' · ' + p.type + ' · ' + p.id, {index: index});
    });
    (Array.isArray(d.steps) ? d.steps : []).forEach(function(s, index){
      if (s) add('step', (index + 1) + '. ' + (s.text || s.id || 'Untitled step'), {index: index});
    });
  });
  return entries;
}
function builderInsertTargetText(raw, sectionIdx){
  /* the descriptive part of the insert-target label: "section N · heading",
     prefixed with the tab name when the target section lives inside a tabs
     block. A blank/whitespace tab label falls back to "tab N". Returns null
     when the section ordinal has no section. */
  var rec = specSectionPaths(raw || {})[sectionIdx];
  if (!rec) return null;
  var sec = specValueAt(raw, rec.section);
  var name = sec && typeof sec.heading === 'string' && sec.heading ? ' · ' + sec.heading : '';
  var tabName = '';
  var path = rec.section;
  var ti = path.indexOf('tabs');
  if (ti >= 0 && typeof path[ti + 1] === 'number'){
    var tabsArr = specValueAt(raw, path.slice(0, ti + 1));
    var tab = Array.isArray(tabsArr) ? tabsArr[path[ti + 1]] : null;
    var raw2 = tab && typeof tab.label === 'string' ? tab.label.trim() : '';
    var label = raw2 || ('tab ' + (path[ti + 1] + 1));
    tabName = 'tab “' + label + '” › ';
  }
  return 'into ' + tabName + 'section ' + (sectionIdx + 1) + name;
}

/* ---------------- hosted starter manifest ----------------
   A hosted workbench can ship a starters.json BESIDE the page and grow
   it over time without rebuilding: a top-level array (or
   {"starters": [...]}) of {name, spec} entries, desc optional. Invalid
   entries are skipped and counted so one typo never hides the rest. */

function parseStarterManifest(text){
  var data;
  try { data = JSON.parse(text); }
  catch (ex){ return {error: 'starters.json is not valid JSON (' + ex.message + ')'}; }
  var list = Array.isArray(data) ? data :
             (data && Array.isArray(data.starters) ? data.starters : null);
  if (!list) return {error: 'starters.json must be an array of {name, spec} entries (or {"starters": [...]})'};
  var entries = [], skipped = 0;
  list.forEach(function(e){
    var ok = e && typeof e.name === 'string' && e.name.trim() &&
             e.spec && typeof e.spec === 'object' && !Array.isArray(e.spec);
    if (ok) entries.push({name: e.name.trim(),
                          desc: typeof e.desc === 'string' ? e.desc : 'from starters.json',
                          spec: e.spec});
    else skipped++;
  });
  return {entries: entries, skipped: skipped};
}

/* ---------------- clickable validation findings ----------------
   Validator and lint messages open with a field path relative to the
   normalized PAGE object ("blocks[0].tabs[1].sections[0].diagram.
   edges[3].kind: ..."). These helpers turn that prefix back into a
   character range of the RAW editor text so a click on the message
   selects the offending JSON — falling back to the nearest existing
   parent when the exact leaf is not in the text. */

function parseValidationPath(message){
  /* leading "ERROR " / "warn " labels are tolerated; returns the path
     segment array or null when the message carries no field path */
  var input = (message || '').replace(/^(?:ERROR\s+|warn\s+)/, '');
  if (/^\(whole document\)\s*:/.test(input)) return [];
  var out = [], i = 0;
  while (i < input.length){
    var m;
    if (input[i] === '"'){
      var end = jsonSkipString(input, i);
      try { out.push(JSON.parse(input.slice(i, end))); } catch (ex){ return null; }
      i = end;
    } else {
      m = /^[A-Za-z0-9_$-]+/.exec(input.slice(i));
      if (!m || (!out.length && !/^[A-Za-z_]/.test(m[0]))) return null;
      out.push(m[0]); i += m[0].length;
    }
    while ((m = /^\[(\d+)\]/.exec(input.slice(i)))){
      out.push(parseInt(m[1], 10)); i += m[0].length;
    }
    if (/^\s*:/.test(input.slice(i))) return out;
    if (input[i] !== '.') return null;
    i++;
  }
  return null;
}
function findingLocation(text, raw, message, rawPath){
  /* character range for a validation message. The validator addresses
     the normalized PAGE object; a leading "page" token names that same
     object. Remaining tokens are resolved GREEDILY against the parsed
     raw JSON — at each object level the longest dot-join of remaining
     string tokens that names a real member wins, so author ids that
     contain dots still resolve. Unresolvable tails retreat to the
     nearest existing parent (exact: false). rawPath supplies an explicit
     editor path for diff findings, using the same locator and fallback. */
  var tokens = rawPath || parseValidationPath(message);
  if (!tokens) return null;
  if (!rawPath && tokens[0] === 'page') tokens = tokens.slice(1);
  var base, node;
  if (rawPath){ base = []; node = raw; }
  else if (raw && raw.page){ base = ['page']; node = raw.page; }
  else if (raw && (raw.blocks || raw.sections)){ base = []; node = raw; }
  else if (raw && raw.nodes && raw.rows){
    /* normalize() wrapped the bare diagram as sections[0].diagram */
    if (tokens.length >= 2 && tokens[0] === 'sections' && tokens[1] === 0){
      tokens = tokens.slice(2);
      if (tokens[0] === 'diagram') tokens = tokens.slice(1);
    } else if (tokens.length){
      return null; /* the message names page furniture a bare diagram lacks */
    }
    base = []; node = raw;
  } else return null;
  var path = base.slice();
  var i = 0;
  while (i < tokens.length && node != null && typeof node === 'object'){
    if (Array.isArray(node)){
      if (typeof tokens[i] !== 'number') break;
      path.push(tokens[i]);
      node = node[tokens[i]];
      i++;
    } else {
      var key = null, j;
      for (j = rawPath ? i + 1 : tokens.length; j > i; j--){
        var joined = tokens.slice(i, j).map(String).join('.');
        if (Object.prototype.hasOwnProperty.call(node, joined)){ key = joined; break; }
      }
      if (key == null) break;
      path.push(key);
      node = node[key];
      i = j;
    }
  }
  var exact = i === tokens.length;
  var loc = jsonLocate(text, path);
  while (!loc && path.length){ path.pop(); loc = jsonLocate(text, path); exact = false; }
  if (!loc) loc = jsonLocate(text, []);
  if (!loc) return null;
  return {start: loc.start, end: loc.end, exact: exact};
}

/* ---------------- draft vs baseline ---------------- */

function diffSpecs(oldObj, newObj){
  var findings = [], ranks = new Map(), ends = new Map(), ordinal = 0;
  function object(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function list(v){ return Array.isArray(v) ? v : []; }
  function index(v, path){
    ranks.set(JSON.stringify(path), ordinal++);
    if (v && typeof v === 'object') Object.keys(v).forEach(function(k){
      index(v[k], path.concat([Array.isArray(v) ? Number(k) : k]));
    });
    ends.set(JSON.stringify(path), ordinal);
  }
  index(newObj, []);
  function existing(path){
    path = path.slice();
    while (path.length && !ranks.has(JSON.stringify(path))) path.pop();
    return path;
  }
  function add(path, kind, text, order){
    var target = existing(path), key = JSON.stringify(target);
    findings.push({path: builderPathString(target), kind: kind, text: text,
      order: order == null ? (kind === 'removed' ? ends.get(key) - 0.5 : ranks.get(key)) : order,
      seq: findings.length});
  }
  function fields(a, b, keys, path, label){
    a = object(a); b = object(b);
    keys.forEach(function(k){
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        add(path.concat([k]), 'changed', label + ' ' + k + ' changed');
    });
  }
  /* compare EVERY key present on either side (minus the identity keys the
     pairing used) — a whitelist here silently hides material edits like a
     node link, a panel initial, or a contract row's hot flag */
  function allFields(a, b, path, label, except){
    a = object(a); b = object(b);
    var seen = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function(k){
      if (seen[k] || (except && except.indexOf(k) >= 0)) return;
      seen[k] = true;
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        add(path.concat([k]), 'changed', label + ' ' + k + ' changed');
    });
  }
  /* Match full identity first; optional similarity disambiguates repeated
     headings. A unique endpoint residual allows an edge kind edit. */
  function pairs(a, b, same, score){
    var matches = new Map(), used = new Set(), candidates = [];
    a.forEach(function(x, i){ b.forEach(function(y, j){
      if (same(x, y)) candidates.push({i: i, j: j, score: score ? score(x, y) : 0});
    }); });
    candidates.sort(function(x, y){
      return y.score - x.score || Math.abs(x.i - x.j) - Math.abs(y.i - y.j) || x.i - y.i || x.j - y.j;
    });
    candidates.forEach(function(c){
      if (!used.has(c.i) && !matches.has(c.j)){ used.add(c.i); matches.set(c.j, c.i); }
    });
    return {matches: matches, used: used};
  }
  function compareList(a, b, path, key, label, except, endpoints){
    a = list(a); b = list(b);
    var match = pairs(a, b, function(x, y){
      return key(object(x)) === key(object(y)) && (!endpoints || endpoints(x) === endpoints(y));
    });
    if (endpoints) a.forEach(function(x, i){
      if (match.used.has(i)) return;
      var oldLeft = a.filter(function(v, k){ return !match.used.has(k) && endpoints(v) === endpoints(x); });
      var newLeft = b.map(function(v, j){ return j; }).filter(function(j){
        return !match.matches.has(j) && endpoints(b[j]) === endpoints(x);
      });
      if (oldLeft.length === 1 && newLeft.length === 1){ match.used.add(i); match.matches.set(newLeft[0], i); }
    });
    b.forEach(function(v, j){
      var itemPath = path.concat([j]), name = label + ' ' + key(object(v));
      if (!match.matches.has(j)) add(itemPath, 'added', name + ' added');
      else allFields(a[match.matches.get(j)], v, itemPath, name, except);
    });
    a.forEach(function(v, i){
      if (!match.used.has(i)) add(path, 'removed', label + ' ' + key(object(v)) + ' removed');
    });
  }
  function page(raw){ return object(object(raw).page || raw); }
  function sections(raw){
    var p = page(raw), base = object(raw).page ? ['page'] : [];
    var key = Array.isArray(p.blocks) ? 'blocks' : 'sections', result = [], tabs = [];
    if (p.nodes && p.rows) return {refs: [{value: {diagram: p}, path: [], diagram: []}], tabs: [], base: base};
    list(p[key]).forEach(function(b, i){
      var path = base.concat([key, i]);
      if (Array.isArray(object(b).tabs)) b.tabs.forEach(function(t, j){
        var tabPath = path.concat(['tabs', j]);
        tabs.push({value: object(t), path: tabPath});
        list(object(t).sections).forEach(function(sec, k){
          var sp = tabPath.concat(['sections', k]);
          result.push({value: object(sec), path: sp, diagram: sp.concat(['diagram'])});
        });
      });
      else result.push({value: object(b), path: path, diagram: path.concat(['diagram'])});
    });
    return {refs: result, tabs: tabs, base: base.concat([key])};
  }
  function heading(ref){ return typeof ref.value.heading === 'string' ? ref.value.heading : ''; }
  function similarity(a, b){
    var an = Object.keys(object(object(a.value.diagram).nodes));
    var bn = object(object(b.value.diagram).nodes);
    var af = list(object(a.value.contract).fields), bf = list(object(b.value.contract).fields);
    var shared = an.filter(function(k){ return Object.prototype.hasOwnProperty.call(bn, k); }).length;
    af.forEach(function(f){ if (bf.some(function(g){ return object(f).k === object(g).k; })) shared++; });
    return shared + (object(a.value.contract).title === object(b.value.contract).title ? 0.25 : 0);
  }
  var old = sections(oldObj), next = sections(newObj);
  var tabs = pairs(old.tabs, next.tabs, function(a, b){ return a.value.label === b.value.label; });
  function container(path){
    var target = null, key = JSON.stringify(path);
    tabs.matches.forEach(function(oi, ni){
      var ot = old.tabs[oi], nt = next.tabs[ni];
      if (JSON.stringify(ot.path.concat(['sections'])) === key) target = nt.path.concat(['sections']);
      if (!target && JSON.stringify(ot.path.slice(0, -1)) === key) target = nt.path.slice(0, -1);
    });
    if (!target){
      target = next.base.concat(path.slice(old.base.length));
      if (!Array.isArray(specValueAt(newObj, target))) target = next.base;
    }
    return existing(target);
  }
  fields(page(oldObj), page(newObj), ['title', 'skin'], object(newObj).page ? ['page'] : [], 'page');
  var match = pairs(old.refs, next.refs, function(a, b){ return heading(a) === heading(b); }, similarity);
  next.refs.forEach(function(ref, j){
    var label = heading(ref) || 'section ' + (j + 1), path = ref.path;
    if (!match.matches.has(j)){ add(path, 'added', 'section ' + label + ' added'); return; }
    var prev = old.refs[match.matches.get(j)];
    var a = object(prev.value.diagram), b = object(ref.value.diagram), dp = ref.diagram;
    var an = object(a.nodes), bn = object(b.nodes);
    Object.keys(bn).forEach(function(id){
      var np = dp.concat(['nodes', id]);
      if (!Object.prototype.hasOwnProperty.call(an, id)) add(np, 'added', label + ': node ' + id + ' added');
      else allFields(an[id], bn[id], np, label + ': node ' + id);
    });
    Object.keys(an).forEach(function(id){
      if (!Object.prototype.hasOwnProperty.call(bn, id)) add(dp.concat(['nodes']), 'removed', label + ': node ' + id + ' removed');
    });
    function endpoints(e){ e = object(e); return JSON.stringify([e.from, e.to]); }
    compareList(a.edges, b.edges, dp.concat(['edges']), function(e){
      return e.from + '->' + e.to + (e.kind ? '(' + e.kind + ')' : '');
    }, label + ': edge', ['from', 'to'], endpoints);
    var as = list(a.steps), bs = list(b.steps);
    if (as.length !== bs.length) add(dp.concat(['steps']), 'changed', label + ': step count changed (' + as.length + ' → ' + bs.length + ')');
    bs.forEach(function(step, i){
      if (i < as.length) allFields(as[i], step, dp.concat(['steps', i]), label + ': step ' + (i + 1));
    });
    compareList(a.panels, b.panels, dp.concat(['panels']), function(p){ return p.id; }, label + ': panel', ['id']);
    compareList(prev.value.contracts,ref.value.contracts,path.concat(['contracts']),function(c){return c.id || c.title || 'Contract';},label+': contract block',['id']);
    compareList(object(prev.value.contract).fields, object(ref.value.contract).fields,
      path.concat(['contract', 'fields']), function(f){ return f.k; }, label + ': contract field', ['k']);
  });
  old.refs.forEach(function(ref, i){
    if (match.used.has(i)) return;
    var parent = ref.path.slice(0, -1), target = container(parent), order;
    /* Place a removed section before its next surviving old neighbour. */
    for (var k = i + 1; k < old.refs.length; k++){
      if (JSON.stringify(old.refs[k].path.slice(0, -1)) !== JSON.stringify(parent)) continue;
      var found = -1;
      match.matches.forEach(function(oi, ni){ if (oi === k) found = ni; });
      if (found >= 0){
        if (JSON.stringify(next.refs[found].path.slice(0, -1)) !== JSON.stringify(target)) continue;
        order = ranks.get(JSON.stringify(next.refs[found].path)) - 0.5;
        break;
      }
    }
    add(target, 'removed', 'section ' + (heading(ref) || 'section ' + (i + 1)) + ' removed', order);
  });
  next.tabs.forEach(function(t, i){
    if (!tabs.matches.has(i)) add(t.path.concat(['label']), 'added', 'tab ' + t.value.label + ' added');
  });
  old.tabs.forEach(function(t, i){
    if (!tabs.used.has(i)) add(container(t.path.slice(0, -1)), 'removed', 'tab ' + t.value.label + ' removed');
  });
  findings.sort(function(a, b){ return a.order - b.order || a.seq - b.seq; });
  return findings.map(function(f){ return {path: f.path, kind: f.kind, text: f.text}; });
}

function diffSpecTexts(baselineText, currentText){
  var oldObj, newObj;
  try { oldObj = JSON.parse(baselineText); }
  catch (ex){ return {error: 'baseline JSON is unparseable'}; }
  try { newObj = JSON.parse(currentText); }
  catch (ex){ return {error: 'current JSON is unparseable'}; }
  return {findings: diffSpecs(oldObj, newObj)};
}

/* parse the persisted open/closed state of the editor sections (insert /
   JSON source). Anything unreadable falls back to open — a corrupt store
   never hides controls. The inspector section is content-driven (it opens
   whenever something is selected) and is deliberately not persisted. */
function builderSectionPrefs(rawText){
  var prefs = {insert: true, source: true};
  if (typeof rawText !== 'string' || !rawText) return prefs;
  var v = null;
  try { v = JSON.parse(rawText); } catch (ex){ return prefs; }
  if (v && typeof v === 'object'){
    if (typeof v.insert === 'boolean') prefs.insert = v.insert;
    if (typeof v.source === 'boolean') prefs.source = v.source;
  }
  return prefs;
}

/* assigned by initWorkbenchBuilder; boot's message list calls it when a
   finding is clicked (boot renders messages before the builder starts,
   so the indirection is checked at click time) */
var BUILDER_JUMP_TO_FINDING = null;

/* ---------------- DOM wiring (workbench only) ---------------- */

function initWorkbenchBuilder(opts){
  var life=createWorkbenchLifetime(),outlineLife=createWorkbenchLifetime(),diffLife=createWorkbenchLifetime();
  life.own(function(){outlineLife.destroy();});life.own(function(){diffLife.destroy();});
  var view = opts.view, src = opts.src;
  function render(request){ hideDiff(); return opts.render(request || {origin:'navigation'}); }
  var guide = document.getElementById('guide');
  var diffbox = document.getElementById('diffbox');
  var diffBtn = document.getElementById('spec-diff');
  var targetLabel = document.getElementById('btarget');
  var addModeExit = document.getElementById('addmode-exit');
  var undoBtn = document.getElementById('undo-builder');
  var secInsert = document.getElementById('sec-insert');
  var secInspect = document.getElementById('sec-inspect');
  var secSource = document.getElementById('sec-source');

  /* ---- collapsible editor sections: restore + persist open state ---- */
  var SECS_KEY = 'dv-workbench-secs';
  function persistSections(){
    try {
      localStorage.setItem(SECS_KEY, JSON.stringify({
        insert: !secInsert || secInsert.open,
        source: !secSource || secSource.open
      }));
    } catch (ex){ /* storage unavailable: state just resets per load */ }
  }
  (function restoreSections(){
    var stored = null;
    try { stored = localStorage.getItem(SECS_KEY); } catch (ex){}
    var prefs = builderSectionPrefs(stored);
    if (secInsert) secInsert.open = opts.workspace && !stored ? false : prefs.insert;
    if (secSource && !opts.workspace) secSource.open = prefs.source;
  })();
  if (secInsert) life.listen(secInsert,'toggle', persistSections);
  if (secSource) life.listen(secSource,'toggle', persistSections);
  function sourceVisible(){
    return (!secSource || secSource.open) &&
      (!opts.workspace || opts.workspace.tool() === 'json');
  }
  function openSource(){
    if (opts.workspace) opts.workspace.showTool('json', {closeUtilities:true});
    if (secSource && !secSource.open) secSource.open = true; /* toggle listener persists */
  }
  /* Inspector content can refresh while a different workspace stays active. */
  function revealInspector(){
    if (!secInspect) return;
    secInspect.hidden = false;
    if (!secInspect.open) secInspect.open = true;
  }
  function retireInspector(){inspector.retire();}
  var interactions=null;

  var session=createBuilderSession({
    source:{read:function(){return src.value;},write:function(text){src.value=text;}},
    persistence:createBuilderPersistence({storage:function(){return localStorage;},
      schedule:function(fn,ms){return life.delay(fn,ms);},
      cancel:function(timer){life.cancelDelay(timer);},now:function(){return Date.now();}}),
    deferInitialSave:opts.deferInitialSave,render:render,renderedText:opts.renderedText,
    historyChanged:function(undo,redo){
      if(undoBtn)undoBtn.disabled=!undo;
      if(redoBtn)redoBtn.disabled=!redo;
    },
    afterHistory:function(message){
      sourceOrigin=null;refreshProvenance();
      setSelected(null);clearMultiSelect();clearStepMarkers();inspectorMessage(message);
    },
    artifacts:function(){return typeof agentLedger==='string'?{ledger:agentLedger}:null;},
    restoreArtifacts:function(entry){agentLedger=entry && typeof entry.ledger==='string'?entry.ledger:null;agentLedgerProject=session.snapshot().project;},
    invalidateProject:function(policy){retireProjectUI();if(!policy || !policy.preserveHistory){agentLedger=null;agentLedgerEpoch++;}agentLedgerProject=session.snapshot().project;}
  });
  if(opts.workspace && opts.workspace.setHistory){
    opts.workspace.setHistory(life.guard(session.rememberView));
    life.own(function(){opts.workspace.setHistory(null);});
  }
  var inspector=createBuilderInspector({
    document:document,guide:guide,session:session,apply:applyPlan,catalog:opts.catalog,
    download:function(name,text,mime){return io && io.download(name,text,mime);},
    schedule:function(fn,ms){return life.delay(fn,ms);},cancel:function(timer){life.cancelDelay(timer);},
    surface:{reveal:revealInspector,hideDiff:hideDiff,
      show:function(keepTool){if(opts.workspace && !keepTool)opts.workspace.showTool('inspect');},
      retire:function(){if(secInspect)secInspect.hidden=true;}},
    selection:{select:selectTarget,clear:clearMultiSelect,range:selectRange,rehighlight:rehighlight,
      current:function(){return interactions?interactions.selection():[];},
      remove:deleteCurrent,removeMany:bulkDeleteSelected},
    preview:{stepper:stepperFor,targetElement:findTargetEl,detail:function(target,parentId){
      var parsed=session.snapshot();if(parsed.error)return {error:parsed.error};
      if(opts.renderedText && opts.renderedText()!==parsed.text)return {error:'Render the latest valid source before previewing this mapping.'};
      var rec=specSectionPaths(parsed.raw)[target.section],d=rec && specValueAt(parsed.raw,rec.diagram);
      var index=d && (d.steps || []).findIndex(function(s){return s.id===parentId;}),sp=stepperFor(target.section);
      if(!sp || index<0 || !sp.jumpSource(index))return {error:'The parent event is not on an available story path.'};
      var node=findTargetEl(target),trigger=node && node.querySelector('[data-dv-detail]');
      if(!trigger)return {error:'The detail node is not visible in this view.'};
      trigger.dispatchEvent(new MouseEvent('click',{bubbles:true}));return {};
    }},
    clipboard:{current:function(){return objectClipboard;},selectHome:homeClipboardSelect,
      clearHome:function(){if(interactions)interactions.clearHome();}},
    modes:{adding:function(){return interactions.adding();},connecting:function(){return interactions.connecting();},
      connectFrom:function(t){interactions.startConnect(t.section,t.id);},
      editPathStep:function(action){if(stepList)stepList.editPathStep(action);},
      toggleAdding:function(t){interactions.toggleAdding(t);}}
  });

  interactions=createBuilderInteractions({document:document,window:window,view:view,src:src,session:session,
    inspector:inspector,guide:guide,targetLabel:targetLabel,addModeExit:addModeExit,
    apply:applyPlan,selectRange:selectRange,ctl:opts.ctl,workspace:opts.workspace,isActive:opts.isActive,renderedText:opts.renderedText,
    refreshInsertion:function(){if(opts.workspace && opts.workspace.canvas)opts.workspace.canvas.select(session.insertSection);if(panelPicker)panelPicker.refresh();if(addMenu)addMenu.refresh();},
    syncStory:function(){if(stepList)stepList.sync();},refreshLayout:function(){if(sectionLayoutEditor)sectionLayoutEditor.refresh();},
    dismissOverlay:function(){
      if(diffbox && !diffbox.hidden){hideDiff();diffBtn.focus();return true;}
      return false;
    }
  });
  function setSelected(){if(interactions)return interactions.setSelected.apply(null,arguments); }
  function updateTargetLabel(){if(interactions)return interactions.updateTargetLabel.apply(null,arguments); }
  function markInsertTarget(){if(interactions)return interactions.markInsertTarget.apply(null,arguments); }
  function findTargetEl(){if(interactions)return interactions.findTargetEl.apply(null,arguments); }
  function rehighlight(){if(interactions)return interactions.rehighlight.apply(null,arguments); }
  function clearStepMarkers(){if(interactions)return interactions.clearStepMarkers.apply(null,arguments); }
  function stepperFor(){if(interactions)return interactions.stepperFor.apply(null,arguments); }
  function pausePreview(){if(interactions)return interactions.pausePreview.apply(null,arguments); }
  function syncBoardToSelectedStep(){if(interactions)return interactions.syncBoardToSelectedStep.apply(null,arguments); }
  function applyStepMarkers(){if(interactions)return interactions.applyStepMarkers.apply(null,arguments); }
  function clipboardSelection(){if(interactions)return interactions.clipboardSelection.apply(null,arguments); }
  function homeClipboardSelect(){if(interactions)return interactions.homeClipboardSelect.apply(null,arguments); }
  function clipboardDestination(){if(interactions)return interactions.clipboardDestination.apply(null,arguments); }
  function deleteCurrent(){if(interactions)return interactions.deleteCurrent.apply(null,arguments); }
  function clearMultiSelect(){if(interactions)return interactions.clearMultiSelect.apply(null,arguments); }
  function reapplyMultiSel(){if(interactions)return interactions.reapplyMultiSel.apply(null,arguments); }
  function bulkDeleteSelected(){if(interactions)return interactions.bulkDeleteSelected.apply(null,arguments); }
  function selectTarget(){if(interactions)return interactions.selectTarget.apply(null,arguments); }
  function cancelAddToStep(){if(interactions)return interactions.cancelAddToStep.apply(null,arguments); }
  function cancelConnect(){if(interactions)return interactions.cancelConnect.apply(null,arguments); }
  function startConnect(){if(interactions)return interactions.startConnect.apply(null,arguments); }
  function applyRowGrabs(){if(interactions)return interactions.applyRowGrabs.apply(null,arguments); }
  function renderInspector(){return inspector.render();}
  function refreshFormSoon(){return inspector.refresh();}
  function inspectorMessage(text,keepTool){return inspector.message(text,keepTool);}
  function formError(text){return inspector.error(text);}
  function commitCascade(planFor,opt){return inspector.transact(planFor,opt);}
  function panelEditorForTarget(target){return inspector.panelForTarget(target);}
  function parseEditor(){return session.snapshot();}
  function openDocumentSettings(){
    if(interactions.busy()){inspectorMessage('Finish the current canvas action before opening document settings.');return;}
    clearMultiSelect();selectTarget({kind:'document'},false);
  }
  ['document-settings','outline-document-settings'].forEach(function(id){
    var button=document.getElementById(id);if(button)life.listen(button,'click',openDocumentSettings);
  });
  function scrollTextareaTo(start){
    /* newline counting under-measures because long JSON lines soft-wrap
       in the textarea; mirror the text up to the selection in an
       offscreen block with the textarea's metrics and measure real
       pixels */
    var cs = getComputedStyle(src);
    var mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.left = '-9999px';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.boxSizing = 'border-box';
    mirror.style.width = src.clientWidth + 'px'; /* content+padding, no scrollbar */
    mirror.style.font = cs.font;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.tabSize = cs.tabSize;
    mirror.style.padding = cs.padding;
    mirror.style.border = '0';
    /* a marker span's offsetTop is the selection line's TOP edge in the
       textarea's scroll space (offsetHeight would add the marker line's
       own height and the bottom padding) */
    mirror.appendChild(document.createTextNode(session.text().slice(0, start)));
    var marker = document.createElement('span');
    marker.textContent = '​';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    var y = marker.offsetTop;
    mirror.remove();
    src.scrollTop = Math.max(0, y - src.clientHeight * 0.35);
  }
  function selectRange(loc, forceSource){
    /* selection highlights only matter while the JSON source is showing.
       A collapsed source section stays collapsed for ordinary selections
       (that is the point of collapsing it); only an explicit ask to see
       the JSON — a validation-finding click — reopens it. */
    if (!sourceVisible()){
      if (!forceSource) return;
      openSource();
    }
    try { src.focus({preventScroll: true}); } catch (ex){ src.focus(); }
    src.setSelectionRange(loc.start, loc.end);
    scrollTextareaTo(loc.start);
  }
  /* Session owns history and persistence; controls retain DOM/focus policy. */
  var redoBtn = document.getElementById('redo-builder');
  function agentHistory(action){
    var tool=opts.workspace && opts.workspace.tool(),result=action();
    if(tool)opts.workspace.showTool(tool);return result;
  }
  function doUndo(){return session.historyType()==='view'?session.undo():agentHistory(function(){return session.undo();});}
  function doRedo(){return session.historyType(true)==='view'?session.redo():agentHistory(function(){return session.redo();});}
  if (undoBtn) life.listen(undoBtn,'click', doUndo);
  if (redoBtn) life.listen(redoBtn,'click', doRedo);
  life.listen(src,'input', function(){
    session.noteInput();
    inspector.sourceChanged();
    hideDiff();
  });
  (function offerDraft(){
    var bar = document.getElementById('draftbar');
    var draft = session.draft(); /* captured once — later autosaves cannot swap it */
    if (!bar || !draft || draft.text === session.text()) return;
    bar.innerHTML = '';
    var label = document.createElement('span');
    label.textContent = 'unsaved draft from ' + new Date(draft.at || 0).toLocaleString() + ' —';
    var restore = document.createElement('button');
    restore.type = 'button'; restore.className = 'bbtn'; restore.textContent = 'restore';
    life.listen(restore,'click', function(){
      restoreDraft();
    });
    var discard = document.createElement('button');
    discard.type = 'button'; discard.className = 'bbtn'; discard.textContent = 'discard';
    life.listen(discard,'click', function(){
      session.discardDraft();
      bar.hidden = true;
    });
    bar.appendChild(label); bar.appendChild(restore); bar.appendChild(discard);
    bar.hidden = false;
  })();
  session.saveInitial();

  function closeInsertMenu(){if(addMenu)addMenu.close(false);}
  var io=createBuilderIO({
    document:document,sourceElement:src,session:session,browser:createBuilderBrowserIO(document,window),
    replaceProject:replaceProject,message:inspectorMessage,saved:hideDiff,closeInsertMenu:closeInsertMenu,
    isActive:opts.isActive,canUndoImport:function(){return !interactions.adding();},
    beforeImport:function(kind){
      setSelected(null);session.target=null;session.insertSection=0;
      if(interactions.connecting())cancelConnect(null);
      if(kind==='mermaid')closeInsertMenu();else clearMultiSelect();
      clearStepMarkers();if(guide)guide.hidden=true;
      if(kind==='trace')retireInspector();
    },
    afterImport:updateTargetLabel
  });

  /* ---- structural diff; reuse the finding jump and source locator ---- */
  function hideDiff(){
    if (diffbox) diffbox.hidden = true;
    if (diffBtn) diffBtn.setAttribute('aria-expanded', 'false');
  }
  if (diffBtn && diffbox) life.listen(diffBtn,'click', function(){
    if (interactions.adding()) return;
    if (!diffbox.hidden){ hideDiff(); return; }
    closeInsertMenu();
    if (guide) guide.hidden = true;
    diffLife.destroy();diffLife=createWorkbenchLifetime();
    diffbox.innerHTML = '';
    var result = diffSpecTexts(session.baseline(), session.text());
    if (result.error || !result.findings.length){
      var line = document.createElement('div');
      line.textContent = result.error || 'no changes';
      diffbox.appendChild(line);
    } else result.findings.forEach(function(f){
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'bbtn diffline';
      button.textContent = f.text;
      button.title = f.path;
      button.setAttribute('data-kind', f.kind);
      diffLife.listen(button,'click', function(){
        BUILDER_JUMP_TO_FINDING(f.text, parseValidationPath(f.path + ':'));
      });
      diffbox.appendChild(button);
    });
    diffbox.hidden = false;
    diffBtn.setAttribute('aria-expanded', 'true');
  });
  var renderBtn = document.getElementById('go');
  if (renderBtn) life.listen(renderBtn,'click', hideDiff);

  /* apply a plan produced by a pure planner; keeps form focus (no textarea
     focus steal), re-renders, re-applies the board highlight */
  function applyPlan(plan, opt, snapshot){
    if (!plan || plan.error){ formError(plan ? plan.error : 'edit failed'); return false; }
    formError('');
    return session.accept(plan,{
      snapshot:snapshot,
      retention:{multi:true,addMode:!!interactions.adding(),exploreLayout:opt && opt.exploreLayout},
      afterRender:function(){
        if (opt && opt.after) opt.after(plan);
        rehighlight();syncBoardToSelectedStep();applyStepMarkers();
        var parsed = parseEditor();
        if (!parsed.error) updateTargetLabel(parsed.raw);
        if (stepList) stepList.sync();
        if (plan.start != null) scrollTextareaTo(plan.start);
      }
    });
  }
  function applyClipboardPlan(plan){
    return applyPlan(plan,{after:function(){
      clearMultiSelect();interactions.clearHome();
      var t=plan.target;
      if(t.kind === 'home'){
        var editor=panelEditorForTarget(t);if(editor.revealElement)editor.revealElement(t);
        selectTarget({kind:'panel',section:t.section,index:t.index},false);homeClipboardSelect(t);
      } else selectTarget(t,false);
    }});
  }
  var objectClipboard = typeof initBuilderClipboard === 'function' ? initBuilderClipboard(document,{
    isActive:opts.isActive,
    text:function(){return session.text();},selection:clipboardSelection,destination:clipboardDestination,
    blocked:function(){return !!(interactions.busy() || inspector.busy(view));},
    destinationLabel:function(dest){
      var parsed=parseEditor(),panel;
      if(!parsed.error){var got=builderDiagram(session.text(),parsed.raw,dest.section);if(!got.error)panel=(got.d.panels || [])[dest.index];}
      return 'Destination: section '+(dest.section+1)+(panel ? ' · '+(panel.title || panel.id) : '')+'. Select a Home panel first to paste a room, device, or subject.';
    },apply:applyClipboardPlan,
    duplicate:function(targets){
      if(targets.length !== 1 || ['node','section','step'].indexOf(targets[0].kind)<0)return null;
      var t=targets[0];return commitCascade(function(raw){
        var plan=t.kind === 'node' ? planDuplicateNode(session.text(),raw,t.section,t.id) :
          t.kind === 'section' ? planDuplicateSection(session.text(),raw,t.section) : planDuplicateStep(session.text(),raw,t.section,t.index,stepperFor(t.section) && stepperFor(t.section).path());
        return plan;
      },{after:function(plan){clearMultiSelect();selectTarget({kind:t.kind,section:t.kind === 'section' ? plan.index : t.section,id:plan.id,index:plan.index},false);}});
    }
  }) : null;

  /* ---- searchable document outline ---- */
  var outline = document.getElementById('sec-outline');
  var outlineSearch = document.getElementById('outline-search');
  var outlineResults = document.getElementById('outline-results');
  var outlineStatus = document.getElementById('outline-status');
  var outlineInspect=document.getElementById('outline-inspect');
  if(outlineInspect)life.listen(outlineInspect,'click',function(){if(opts.workspace)opts.workspace.showTool('inspect',{focus:true});});
  function refreshOutline(){
    outlineLife.destroy();outlineLife=createWorkbenchLifetime();
    if (!outlineResults) return;
    outlineResults.innerHTML = '';
    var indexedText = session.text();
    var entries;
    try { entries = builderOutline(JSON.parse(session.text()), outlineSearch.value); }
    catch (ex){ outlineStatus.textContent = 'Fix the JSON source to browse its outline.'; return; }
    outlineStatus.textContent = entries.length ? Math.min(entries.length, 200) + ' of ' + entries.length + ' items' : 'No matching items';
    entries.slice(0, 200).forEach(function(entry){
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'outline-item';
      var title = document.createElement('span'); title.textContent = entry.target.kind + ' · ' + entry.label;
      var sub = document.createElement('small'); sub.textContent = entry.context;
      button.appendChild(title); button.appendChild(sub);
      button.title = builderPathString(entry.path);
      outlineLife.listen(button,'click', function(){
        if (interactions.adding()) return;
        if (session.text() !== indexedText){
          refreshOutline();
          outlineStatus.textContent = 'Source changed; outline refreshed. Select the item again.';
          return;
        }
        /* Never map fresh JSON onto stale rendered section ordinals. */
        if (opts.renderedText && opts.renderedText() !== session.text()){
          render();
          if (opts.renderedText() !== session.text()){ inspectorMessage('Fix validation errors before navigating the preview.'); return; }
        }
        if (interactions.connecting()) cancelConnect(null);
        clearMultiSelect();
        if (entry.tab){
          var tabButton = document.getElementById('tab-' + entry.tab.block + '-' + entry.tab.tab);
          if (tabButton) tabButton.click();
        }
        var el = findTargetEl(entry.target);
        selectTarget(Object.assign({}, entry.target, {el: el}), false, true);
        var loc = jsonLocate(session.text(), entry.path);
        if (loc && sourceVisible()){
          src.setSelectionRange(loc.start, loc.end);
          scrollTextareaTo(loc.start);
        }
        if (el) el.scrollIntoView({block: 'nearest', behavior: 'auto'});
      });
      outlineResults.appendChild(button);
    });
  }
  if (outlineSearch){
    life.listen(outlineSearch,'input', refreshOutline);
    life.listen(outlineSearch,'keydown', function(ev){
      if ((ev.key === 'ArrowDown' || ev.key === 'Enter') && outlineResults.firstChild){
        ev.preventDefault(); outlineResults.firstChild.focus();
      }
    });
    var outlineTimer;
    life.listen(src,'input', function(){ life.cancelDelay(outlineTimer); outlineTimer = life.delay(refreshOutline, 200); });
    life.listen(document,'keydown', function(ev){
      if (opts.isActive && !opts.isActive()) return;
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.key.toLowerCase() !== 'k' || interactions.adding()) return;
      ev.preventDefault();
      if(opts.workspace)opts.workspace.showTool('outline');
      outline.open = true; outlineSearch.focus(); outlineSearch.select();
    });
    refreshOutline();
  }

  /* The step list shares this builder's selection, render and undo pipeline. */
  var stepList = typeof initWorkbenchStepList === 'function' ? initWorkbenchStepList({
    view:view, src:src, renderedText:opts.renderedText,
    configure:function(plan, section){
      /* A previous inspector selection must not pull settings back to another section. */
      if (session.target && session.target.section !== section){
        session.target=null; setSelected(null); clearMultiSelect(); if (guide) guide.hidden=true;
      }
      return applyPlan(plan);
    },
    pause:pausePreview,
    inspect:function(){ if (opts.workspace) opts.workspace.showTool('inspect', {focus:true}); },
    selection:function(){ return session.target; },
    locked:function(){ return !!interactions.adding() || !!interactions.connecting(); },
    path:function(section){var sp=stepperFor(section);return sp && sp.path();},
    selectPath:function(section,id){
      session.target=null; clearMultiSelect(); if(guide) guide.hidden=true;
      var parsed=parseEditor(),story=!parsed.error && builderStorySections(parsed.raw).find(function(entry){return entry.section===section;});
      var route=story && diagramPathList(story.diagram).find(function(path){return path.id===id;});
      var sp=stepperFor(section);
      if(sp && route && route.indices.length)sp.jumpSource(route.indices[0],id);
      applyRowGrabs(); clearStepMarkers();
    },
    navigate:function(entry){
      clearMultiSelect();
      if (entry.tab){
        var tabButton = document.getElementById('tab-' + entry.tab.block + '-' + entry.tab.tab);
        if (tabButton) tabButton.click();
      }
      if(entry.pathId){var sp=stepperFor(entry.target.section);if(sp) sp.jumpSource(entry.index,entry.pathId);}
      var el = findTargetEl(entry.target);
      selectTarget(Object.assign({}, entry.target, {el:el}), false, true);
      var loc = jsonLocate(session.text(), entry.path);
      if (loc && sourceVisible()){
        src.setSelectionRange(loc.start, loc.end); scrollTextareaTo(loc.start);
      }
      if (el) el.scrollIntoView({block:'nearest', behavior:'auto'});
    },
    apply:function(plan, section){
      clearMultiSelect();
      return applyPlan(plan, {after:function(){
        var story = builderStorySections(JSON.parse(session.text())).find(function(entry){ return entry.section === section; });
        if (story && story.tab){
          var tabButton = document.getElementById('tab-' + story.tab.block + '-' + story.tab.tab);
          if (tabButton) tabButton.click();
        }
        session.target = {kind:'step', section:section, index:plan.index};
        if(plan.pathId){session.target.pathId=plan.pathId;var sp=stepperFor(section);if(sp) sp.jumpSource(plan.index,plan.pathId);}
        session.insertSection = section;
        renderInspector();
      }});
    }
  }) : null;

  life.listen(view,'workbench-view-section',function(ev){
    var parsed=session.snapshot();if(parsed.error || !specSectionPaths(parsed.raw)[ev.detail])return;
    session.insertSection=ev.detail;updateTargetLabel(parsed.raw);if(addMenu)addMenu.refresh();
  });
  var sectionLayoutEditor=typeof initSectionLayoutEditor === 'function' ? initSectionLayoutEditor({
    view:view,src:src,ctl:opts.ctl,render:function(){return render({origin:'layout-preview'});},renderedText:opts.renderedText,pause:pausePreview,
    locked:function(){return !!interactions.adding() || !!interactions.connecting();},
    commit:function(section,target,items,id){
      return commitCascade(function(raw){return planSectionLayout(session.text(),raw,section,target,items,id);});
    },
    rename:function(section,name,id){
      return commitCascade(function(raw){return planSectionLayoutName(session.text(),raw,section,name,id);});
    },
    setExploreLayout:function(section,id,value){
      return commitCascade(function(raw){return planSectionExploreLayout(session.text(),raw,section,id,value);},{exploreLayout:{section:section,id:id}});
    },
    setPresentation:function(section,id,value){
      var nextId,ok=commitCascade(function(raw){var plan=planSectionViewPresentation(session.text(),raw,section,id,value);nextId=plan.layoutId;return plan;});return ok?nextId:null;
    },
    ensureView:function(section,target){return commitCascade(function(raw){return planEnsureSectionView(session.text(),raw,section,target);});},
    steps:function(section,id,indices){
      var prior=session.target;session.target=null;
      var ok=commitCascade(function(raw){return planSectionViewSteps(session.text(),raw,section,id,indices);});
      if(!ok)session.target=prior;else{clearMultiSelect();clearStepMarkers();if(guide)guide.hidden=true;}
      return ok;
    },
    duplicate:function(section,id){
      var nextId,ok=commitCascade(function(raw){var plan=planDuplicateSectionLayout(session.text(),raw,section,id);nextId=plan.layoutId;return plan;});return ok?nextId:null;
    },
    remove:function(section,id){return commitCascade(function(raw){return planDeleteSectionLayout(session.text(),raw,section,id);});},
    makeDefault:function(section,id){var nextId,ok=commitCascade(function(raw){var plan=planDefaultSectionLayout(session.text(),raw,section,id);nextId=plan.layoutId || id;return plan;});return ok?nextId:null;}

  }) : null;
  /* Controlled preview replacement is explicit; rejected source leaves the board intact. */
  function beforePreviewReplace(request){
    if(panelPicker)panelPicker.invalidate();
    if(addMenu)addMenu.invalidate();
    if(catalogPicker)catalogPicker.invalidate();
    interactions.beforeReplace(request);
    if(sectionLayoutEditor && sectionLayoutEditor.beforeReplace)sectionLayoutEditor.beforeReplace();
    hideDiff();
  }
  function previewRendered(outcome){
    hideDiff();
    if(outcome.ok && outcome.retained==='explore')return;
    if(addMenu)addMenu.refresh();
    if(outlineSearch)refreshOutline();
    if(!outcome.ok){
      if(outcome.replaced){clearMultiSelect();clearStepMarkers();if(interactions.adding())cancelAddToStep(null);}
      if(stepList)stepList.refresh();
      return;
    }
    rehighlight();syncBoardToSelectedStep();applyStepMarkers();reapplyMultiSel();
    applyRowGrabs();markInsertTarget();
    if(stepList)stepList.refresh();
  }

  /* ================= insert buttons ================= */

  function confirmAddition(run,pageStructure){if(addMenu)return addMenu.confirm(run,pageStructure);run();}

  function runInsert(kind, planFn){
    var parsed = parseEditor();
    if (parsed.error){ inspectorMessage(parsed.error + ' — fix it before inserting'); return; }
    if (kind !== 'section' && !specSectionPaths(parsed.raw).length){
      inspectorMessage('no sections found in the editor text'); return;
    }
    var plan = kind === 'section' ? planAddSection(session.text(), parsed.raw)
                                  : planFn(session.text(), parsed.raw, session.insertSection, kind === 'step' && stepperFor(session.insertSection) ? stepperFor(session.insertSection).path() : undefined);
    if (plan.error){ inspectorMessage(plan.error); return; }
    if(!session.accept(plan,{snapshot:parsed,beforePublish:clearMultiSelect}))return;
    if (plan.kind === 'section') session.insertSection = plan.index;
    var identity = {section: plan.kind === 'section' ? plan.index : session.insertSection,
                    kind: plan.kind, id: plan.id, index: plan.index, card:plan.card};
    var el = findTargetEl(identity);
    selectTarget({section: identity.section, kind: identity.kind, id: identity.id,
                  index: identity.index, card:identity.card, el: el}, false);
    selectRange(plan);
  }
  var addButtons = {
    'add-step': ['step', planAddStep],
    'add-section': ['section', planAddSection],
    'add-contract': ['contract',planAddContract]
  };
  Object.keys(addButtons).forEach(function(id){
    var btn = document.getElementById(id);
    if (btn) life.listen(btn,'click', function(){
      confirmAddition(function(){runInsert(addButtons[id][0], addButtons[id][1]);},id==='add-section' || id==='add-contract');
    });
  });
  /* + edge draws by clicking source then target (Esc cancels) */
  var edgeBtn = document.getElementById('add-edge');
  if (edgeBtn) life.listen(edgeBtn,'click', function(){confirmAddition(function(){startConnect(session.insertSection);});});
  /* + tabs appends a whole tabs container and lands on its first tab —
     tab targets address by block/tab, so runInsert's section identity
     does not fit */
  var tabsBtn = document.getElementById('add-tabs');
  if (tabsBtn) life.listen(tabsBtn,'click', function(){
    confirmAddition(function(){
    var parsed = parseEditor();
    if (parsed.error){ inspectorMessage(parsed.error + ' — fix it before inserting'); return; }
    var plan = planAddTabs(session.text(), parsed.raw);
    if (plan.error){ inspectorMessage(plan.error); return; }
    if(!session.accept(plan,{snapshot:parsed,beforePublish:clearMultiSelect}))return;
    session.insertSection = plan.index; /* inserts now land in the first new tab's section */
    var el = findTargetEl({kind: 'tab', block: plan.block, tab: 0});
    selectTarget({kind: 'tab', block: plan.block, tab: 0, el: el}, false);
    selectRange(plan);
    },true);
  });

  /* Text fields keep native Undo; canvas/tools use this project's action history. */
  life.listen(document,'keydown', function(ev){
    if (ev.defaultPrevented || opts.isActive && !opts.isActive()) return;
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    var key=ev.key.toLowerCase(),redo=key==='z' && ev.shiftKey || key==='y' && !ev.shiftKey;
    if (key!=='z' && !redo || interactions.adding()) return;
    var ae = document.activeElement;
    if(ae && ae.closest('dialog[open]'))return;
    if(ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable))return;
    ev.preventDefault();
    if(redo)doRedo();else doUndo();
  });

  /* Node presets and the panel library share the persistent Add entry point. */
  var panelPicker = typeof initPanelPicker === 'function' ? initPanelPicker({
    src:src, pause:pausePreview, error:inspectorMessage,
    context:function(){
      if (interactions.adding() || interactions.connecting()) return {error:'Finish ' + (interactions.adding() ? 'ADD TO STEP' : 'connecting nodes') + ' first (Done or Esc).'};
      var parsed = parseEditor();
      if (parsed.error) return {error:parsed.error + ' — fix it before inserting'};
      var findings = validate(normalize(parsed.raw));
      if (findings.errors.length) return {error:'Fix the diagram’s validation errors before adding a panel.'};
      var rec = specSectionPaths(parsed.raw)[session.insertSection];
      if (!rec || !specValueAt(parsed.raw,rec.diagram)) return {error:'Choose a section with a diagram before adding a panel.'};
      return {text:session.text(),section:session.insertSection,label:builderInsertTargetText(parsed.raw,session.insertSection).replace(/^into /,'')};
    },
    insert:function(type){runInsert('panel',function(text,raw,si){return planAddPanel(text,raw,si,type);});}
  }) : null;
  var panelBtn = document.getElementById('add-panel');
  if (panelBtn) life.listen(panelBtn,'click',function(){confirmAddition(function(){if(panelPicker)panelPicker.open();});});
  function additionContext(){
      var parsed=parseEditor(),locked=!!interactions.adding() || !!interactions.connecting();
      var error=locked ? 'Finish adding to the step or connecting nodes first (Done or Esc).' : parsed.error;
      if(!error){var findings=validate(normalize(parsed.raw));if(findings.errors.length)error='Fix the diagram’s validation errors before adding.';}
      var sections=parsed.error ? [] : specSectionPaths(parsed.raw).map(function(rec,index){
        return {section:index,label:builderInsertTargetText(parsed.raw,index).replace(/^into /,'')};
      });
      var rec=parsed.error ? null : specSectionPaths(parsed.raw)[session.insertSection];
      return {text:session.text(),raw:parsed.raw,section:session.insertSection,sections:sections,
        label:rec ? builderInsertTargetText(parsed.raw,session.insertSection).replace(/^into /,'') : '',
        diagram:rec && specValueAt(parsed.raw,rec.diagram),error:error,locked:locked};
  }
  var catalogPicker=initCatalogGraphPicker({document:document,src:src,pause:pausePreview,error:inspectorMessage,
    catalog:opts.catalog,importCatalog:opts.importCatalog,context:additionContext,
    create:function(raw){return loadText(JSON.stringify(raw,null,2));},
    insert:function(catalog,refs,connect){
      var parsed=parseEditor();if(parsed.error)return false;
      var plan=planCatalogGraph(session.text(),parsed.raw,session.insertSection,catalog,refs,connect);
      return applyPlan(plan,{after:function(){clearMultiSelect();selectTarget({kind:'section',section:session.insertSection},false);}},parsed);
    }
  });
  var catalogBtn=document.getElementById('add-catalog');
  if(catalogBtn)life.listen(catalogBtn,'click',function(){confirmAddition(function(){if(catalogPicker)catalogPicker.open();});});
  var addMenu=initDiagramAddMenu({document:document,src:src,pause:pausePreview,context:additionContext,
    addNode:function(preset){runInsert('node',function(text,raw,si){return planAddNode(text,raw,si,preset);});},
    chooseSection:function(index){
      var parsed=parseEditor();if(parsed.error || interactions.adding() || interactions.connecting())return;
      var rec=specSectionPaths(parsed.raw)[index];if(!rec)return;
      var tool=opts.workspace && opts.workspace.tool(),ti=rec.section.indexOf('tabs');
      if(ti>=0){var tab=document.getElementById('tab-'+rec.section[ti-1]+'-'+rec.section[ti+1]);if(tab)tab.click();}
      clearMultiSelect();selectTarget({kind:'section',section:index,el:findTargetEl({kind:'section',section:index})},false,true);
      if(tool)opts.workspace.showTool(tool);
    }
  });

  var jumpToFinding = life.guard(function(message, rawPath){
    var parsed = parseEditor();
    if (parsed.error) return;
    var loc = findingLocation(session.text(), parsed.raw, message, rawPath);
    if (!loc) return;
    selectRange(loc, true);
    if (!loc.exact) inspectorMessage('the exact field is not in the editor text — selected its nearest parent', true);
  });
  BUILDER_JUMP_TO_FINDING=jumpToFinding;

  var initial = parseEditor();
  updateTargetLabel(initial.error ? null : initial.raw);
  applyRowGrabs(); /* the boot render happened before this wiring ran */
  function prepareWelcome(){if(agentMessage)agentMessage.close(false);if(session.isProjectOpen())session.save();session.invalidateProject({preserveHistory:true});}
  function retireProjectUI(){
    io.retireProject();if(agentMessage)agentMessage.close(false);
    if (objectClipboard && objectClipboard.cancelPending) objectClipboard.cancelPending();
    pausePreview();
    interactions.retire();
    if(catalogPicker)catalogPicker.close(false);
    if(addMenu)addMenu.close(false); if (panelPicker) panelPicker.close(); hideDiff(); clearMultiSelect(); clearStepMarkers();
    setSelected(null); retireInspector();
  }
  function projectHooks(){return {
    beforeRender:opts.beforeProjectLoad,
    afterRender:function(){
      var parsed=parseEditor();updateTargetLabel(parsed.error?null:parsed.raw);
      if(guide)guide.hidden=true;
      var bar=document.getElementById('draftbar');if(bar)bar.hidden=true;
    },
    afterSave:function(){if(stepList)stepList.sync();}
  };}
  function replaceProject(text, baseline){var ok=session.replaceProject(text,baseline,projectHooks());if(ok){sourceOrigin=null;refreshProvenance();}return ok;}
  function loadText(text){
    if(!life.alive())return false;
    var raw;
    try { raw = JSON.parse(text); }
    catch (ex){ throw new Error('JSON parse: ' + ex.message); }
    var findings = validate(normalize(raw));
    if (findings.errors.length) throw new Error(findings.errors.join('\n'));
    return replaceProject(text);
  }
  function restoreDraft(){
    var restored=session.restoreDraft(projectHooks());
    if(!restored)return false;
    sourceOrigin=null;refreshProvenance();
    if(restored.missingBaseline)inspectorMessage('original baseline unavailable — diff starts from the recovered draft');
    return true;
  }
  life.own(function(){if(BUILDER_JUMP_TO_FINDING===jumpToFinding)BUILDER_JUMP_TO_FINDING=null;});
  life.own(function(){session.destroy();});
  life.own(function(){inspector.destroy();});
  life.own(function(){io.destroy();});
  life.own(function(){if(objectClipboard)objectClipboard.destroy();});
  life.own(function(){if(stepList)stepList.destroy();});
  life.own(function(){if(sectionLayoutEditor)sectionLayoutEditor.destroy();});
  life.own(function(){if(panelPicker)panelPicker.destroy();});
  life.own(function(){if(addMenu)addMenu.destroy();});
  life.own(function(){if(catalogPicker)catalogPicker.destroy();});
  life.own(function(){interactions.destroy();});
  life.own(function(){hideDiff();if(guide)guide.hidden=true;});
  var agentChanges=new Map(),sourceOrigin=null;
  var changeDialog=document.createElement('dialog');changeDialog.className='workspace-change-dialog';
  document.body.appendChild(changeDialog);life.own(function(){changeDialog.remove();});
  function showAgentChanges(receipt){
    changeDialog.replaceChildren();
    var heading=document.createElement('h2');heading.textContent=receipt.summary || 'Agent change';changeDialog.appendChild(heading);
    var entry=agentChanges.get(receipt.id),lines=entry?diffSpecTexts(entry.before,entry.after):null;
    var messages=lines && !lines.error?lines.findings.map(function(f){return f.text;}):
      [receipt.message || 'This receipt is from an earlier session. Exact before/after source is not retained in this browser.'];
    if(receipt.description && receipt.description.changedSections)messages.push('Sections: '+receipt.description.changedSections.join(', '));
    messages.slice(0,100).forEach(function(message){var p=document.createElement('p');p.textContent=message;changeDialog.appendChild(p);});
    var close=document.createElement('button');close.type='button';close.className='bbtn';close.textContent='Close';close.onclick=function(){changeDialog.close();};changeDialog.appendChild(close);changeDialog.showModal();
    return {ok:true};
  }
  function provenance(){
    var snap=session.snapshot(),page=snap.raw && (snap.raw.page || snap.raw),canon=page && page.canon;
    return {publication:'local-draft',title:sourceOrigin && sourceOrigin.title || canon && canon.id || null,
      source:sourceOrigin,canon:canon || null,changes:agentChat && agentChat.recoveryInfo?agentChat.recoveryInfo().changes || []:[]};
  }
  function refreshProvenance(){
    var value=provenance(),el=document.getElementById('workspace-provenance');
    if(el){el.textContent='Local draft'+(value.title?' · '+value.title:'');el.title='Local draft'+(value.title?' based on '+value.title:'')+'. Save downloads JSON; Prepare review packages a handoff. Neither publishes to your company.';}
  }
  var agentLedger=null,agentLedgerProject=null,agentLedgerEpoch=0;
  var agentOptions={document:document,
    setLedger:function(text,persist){agentLedger=text || '';agentLedgerProject=session.snapshot().project;if(persist && session.isProjectOpen())session.save();},
    snapshot:function(){
      var snap=session.snapshot(),open=session.isProjectOpen() && (!opts.isActive || opts.isActive());
      var previewCurrent=snap.renderedText===snap.text;
      var ctl=opts.ctl && opts.ctl();
      return {project:snap.project,open:!!open,source:open?snap.text:'',ledger:agentLedgerProject===snap.project?agentLedger:null,parseError:open?snap.error || null:null,
        previewCurrent:previewCurrent,selection:open && previewCurrent?clipboardSelection().map(function(target){
          var clean={};['kind','section','id','index','block','tab','card','pathId','field','item'].forEach(function(key){
            if(typeof target[key]==='string' || typeof target[key]==='number')clean[key]=target[key];
          });if(Array.isArray(target.bulletPath))clean.bulletPath=target.bulletPath.slice();
          var path=builderTargetPath(snap.raw,target),value=path?specValueAt(snap.raw,path):null;
          var label=typeof value==='string'?value:value && (value.title || value.heading || value.text || value.label || value.id);
          clean.label=String(label || target.id || (target.kind+' '+(typeof target.index==='number'?target.index+1:target.section+1))).slice(0,180);
          clean.sectionLabel=(builderInsertTargetText(snap.raw,target.section) || '').replace(/^into /,'');return clean;
        }):[],
        views:open && previewCurrent?((ctl && ctl.sections) || []).map(function(rec){
          var result={section:rec.number-1,view:rec.presentation && rec.presentation.viewId?rec.presentation.viewId():null,
            mode:rec.stepper && rec.stepper.mode?rec.stepper.mode():null,
            path:rec.stepper && rec.stepper.path?rec.stepper.path():null,
            sourceStep:rec.stepper && rec.stepper.sourceIndex?rec.stepper.sourceIndex():null};
          var record=specSectionPaths(snap.raw)[rec.number-1],diagram=record?specValueAt(snap.raw,record.diagram):null;
          if(diagram){
            var layout=(diagram.layouts || []).find(function(item){return item.id===result.view;}),route=(diagram.paths || []).find(function(item){return item.id===result.path;});
            if(layout)result.viewLabel=layout.name || layout.id;if(route)result.pathLabel=route.label || route.id;
          }
          return result;
        }):[]};
    },
    busy:function(){
      var active=document.activeElement;
      return interactions.busy() || inspector.busy(view) || !!document.querySelector('dialog[open]') ||
        !!(active && !(active.closest && active.closest('#editor-agent')) && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)));
    },
    validate:function(text){var findings=validate(normalize(JSON.parse(text)));return findings.errors.join('\n');},
    apply:function(text,expected,proposal){
      var snapshot=session.snapshot();
      if(snapshot.text!==expected.source || snapshot.project!==expected.project)return {ok:false,error:'Document changed.'};
      var raw;try{raw=JSON.parse(text);}catch(ex){return {ok:false,error:'Proposal is not valid JSON: '+ex.message};}
      var findings=validate(normalize(raw));
      if(findings.errors.length)return {ok:false,error:findings.errors.join('\n')};
      var ledgerEpoch=agentLedgerEpoch,outcome,paired=proposal && typeof proposal.ledger==='string',history;
      if(paired){
        history={kind:'source',capture:function(){return {source:session.text(),ledger:agentLedger || ''};},before:{source:snapshot.text,ledger:agentLedgerProject===snapshot.project?agentLedger:''},after:{source:text,ledger:proposal.ledger},restore:function(value){
          if(agentLedgerEpoch!==ledgerEpoch)return 'expired';
          agentOptions.setLedger(value.ledger);clearMultiSelect();session.target=null;clearStepMarkers();inspector.retire();
          var restored=session.restoreHistoryText(value.source);rehighlight();if(stepList)stepList.sync();if(storyBrief)storyBrief.refresh();return restored;
        }};
      }
      var accepted=session.accept({text:text},{snapshot:snapshot,history:history,beforePublish:function(){
        if(paired)agentOptions.setLedger(proposal.ledger);
        clearMultiSelect();session.target=null;clearStepMarkers();inspector.retire();if(guide)guide.hidden=true;
      },afterRender:function(plan,result){
        outcome=result;
        rehighlight();if(stepList)stepList.sync();
      }});
      if(accepted && proposal && proposal.id){
        agentChanges.set(proposal.id,{before:snapshot.text,after:text,project:snapshot.project,historyVersion:session.historyVersion()});
        while(agentChanges.size>12)agentChanges.delete(agentChanges.keys().next().value);
      }
      if(accepted && storyBrief)storyBrief.refresh();refreshProvenance();
      return {ok:accepted,rendered:!!(outcome && outcome.ok)};
    },
    openEmptyFolder:function(expected){
      var current=agentOptions.snapshot();if(current.project!==expected.project || current.source!==expected.source)return {ok:false,error:'Your draft changed while opening the folder.'};
      session.preserveDraft();session.resetHistory();agentLedgerEpoch++;return {ok:true,project:current.project};
    },
    restoreSavedStory:function(source,expected){
      var current=agentOptions.snapshot();
      if(expected && (current.project!==expected.project || current.source!==expected.source))return {ok:false,error:'Your draft changed while opening the folder. Choose the diagram folder again.'};
      var ok=loadText(source);return {ok:ok,project:session.snapshot().project};
    },
    showChanges:showAgentChanges,
    undoChange:function(receipt){
      var change=agentChanges.get(receipt.id),snapshot=session.snapshot();
      if(!change || change.project!==snapshot.project || change.after!==snapshot.text || change.historyVersion!==session.historyVersion() || !session.canUndo())return {ok:false,error:'Later edits or a reload prevent safe Undo of this receipt. Use history or compare the changes first.'};
      var ok=agentHistory(function(){return session.undo();});if(ok)agentChanges.delete(receipt.id);return {ok:ok};
    }
  };
  var agentSession=typeof initWorkbenchAgentSession==='function'?initWorkbenchAgentSession(agentOptions):null;
  agentOptions.show=function(){if(opts.workspace)opts.workspace.showTool('agent');};
  agentOptions.hide=function(){if(opts.workspace && opts.workspace.isOpen('agent'))opts.workspace.hideTool('agent');};
  agentOptions.message=function(){if(agentMessage)agentMessage.open();};
  agentOptions.newProject=function(mode){document.dispatchEvent(new CustomEvent('dv:agentnew',{detail:{workflow:mode}}));};
  var agentChat=typeof initWorkbenchAgentChat==='function'?initWorkbenchAgentChat(agentOptions):null;
  var handoffRequests=new Set();life.own(function(){handoffRequests.forEach(function(request){request.abort();});});
  async function handoffHtml(source){
    var findings=validate(normalize(JSON.parse(source)));if(findings.errors.length)throw Error('Repair the story before preparing a viewable handoff: '+findings.errors.join('\n'));
    var request=new AbortController();handoffRequests.add(request);
    try{
      var paths=['../template/flowview.html','template/flowview.html','flowview.html'];
      for(var i=0;i<paths.length;i++){
        if(!life.alive())throw Error('Workbench closed.');
        try{
          var response=await fetch(paths[i],{cache:'no-store',signal:request.signal});if(!response.ok)continue;
          var template=await response.text();if(exportTemplateOpeners(template)!==1)continue;
          var built=buildExportHtml(template,source.replace(/</g,'\\u003c'));if(built.error)throw Error(built.error);return built.html;
        }catch(error){if(request.signal.aborted)throw error;}
      }
      throw Error('The viewer template is unavailable. Open the hosted workbench, or serve it alongside template/flowview.html, then prepare review again.');
    }finally{handoffRequests.delete(request);}
  }
  var storyBrief=typeof initWorkbenchStoryBrief==='function'?initWorkbenchStoryBrief({document:document,snapshot:agentOptions.snapshot,
    readLedger:async function(){var live=agentChat?await agentChat.readLedger():null,snap=agentOptions.snapshot();return live || (snap.ledger?{text:snap.ledger,sourceMatches:null,verified:false}:null);},provenance:provenance,renderHtml:handoffHtml,
    addEvidence:function(evidence,expected){
      var snapshot=agentOptions.snapshot();if(snapshot.source!==expected.source || snapshot.project!==expected.project)return {ok:false,error:'The story changed. Choose its current story moment again.'};
      var raw;try{raw=JSON.parse(snapshot.source);}catch(error){return {ok:false,error:'Repair the JSON first.'};}
      if(raw.storyBrief!=null && (!raw.storyBrief || typeof raw.storyBrief!=='object' || Array.isArray(raw.storyBrief)))return {ok:false,error:'Repair storyBrief in JSON first.'};
      var brief=raw.storyBrief || {},entries=brief.evidence || [];
      if(!Array.isArray(entries) || entries.length>=500)return {ok:false,error:'Evidence must be a list of fewer than 500 references.'};
      if(!evidence || typeof evidence.reference!=='string' || evidence.reference.length>4000 || typeof evidence.note!=='string' || evidence.note.length>8000 || !['supports','conflicts','unverified'].includes(evidence.relationship))return {ok:false,error:'Enter a bounded reference, note, and relationship.'};
      if(!evidence.reference.trim() || !evidence.note.trim() || !storyBriefTargets(raw).some(function(target){return JSON.stringify(target.value)===JSON.stringify(evidence.storyTarget);}))return {ok:false,error:'Choose a current story moment and enter a reference and note.'};
      entries.push(JSON.parse(JSON.stringify(evidence)));brief.evidence=entries;raw.storyBrief=brief;
      return agentOptions.apply(JSON.stringify(raw,null,2),snapshot);
    }}):null;
  if(storyBrief){life.own(storyBrief.destroy);life.listen(document,'workbench-tool-visibility',function(event){if(event.detail.name==='brief' && event.detail.open)storyBrief.refresh();});}
  life.listen(document.getElementById('workspace-prepare-review'),'click',function(){if(opts.workspace)opts.workspace.showTool('brief');if(storyBrief)storyBrief.refresh();});
  refreshProvenance();
  if(agentSession)life.own(function(){agentSession.destroy();});
  if(agentChat)life.own(function(){agentChat.destroy();});
  function navigateWorkspace(target){
    var parsed=session.snapshot();if(parsed.error)return;
    var rec=applyWorkspaceTarget(opts.ctl(),normalize(parsed.raw),target);if(!rec)return;
    session.insertSection=rec.number-1;updateTargetLabel(parsed.raw);
    if(opts.workspace && opts.workspace.canvas)opts.workspace.canvas.select(session.insertSection);
    if(stepList)stepList.sync();
  }
  life.listen(view,'detail-edit-section',function(event){navigateWorkspace({d:event.detail.reference});});
  var agentMessage=typeof initWorkbenchAgentMessage==='function'?initWorkbenchAgentMessage({document:document,pause:pausePreview,
    connection:function(){return agentChat?agentChat.messageConnection():{connected:false};},
    connect:function(){var project=session.snapshot().project;if(agentChat)agentChat.openMessageSetup(function(){if(agentMessage && session.snapshot().project===project)agentMessage.open(true);});},
    send:function(text,context){return agentChat.sendMessage(text,context);},
    cancel:function(){return agentChat.cancelMessage();},
    snapshot:function(){
      var snap=session.snapshot();
      return Object.assign({},snap,agentOptions.snapshot());
    }
  }):null;
  if(agentMessage)life.own(function(){agentMessage.destroy();});
  function destroy(){life.destroy();}
  return {
    loadSpec:function(raw,origin){var ok=life.alive() && loadText(JSON.stringify(raw,null,2));if(ok){sourceOrigin=origin || null;refreshProvenance();}return ok;},
    startAgent:function(mode,options){if(agentChat)agentChat.openSetup(mode || 'external',options);},
    preserveDraft:life.guard(session.preserveDraft),
    earlierDrafts:session.earlierDrafts,
    restoreEarlierDraft:life.guard(function(entry){var ok=session.restoreEarlierDraft(entry,projectHooks());if(ok){sourceOrigin=null;refreshProvenance();}return ok;}),
    navigate:navigateWorkspace,
    destroy:destroy,
    refreshCatalog:function(){inspector.refreshCatalog();if(catalogPicker)catalogPicker.refresh();},
    openCatalog:life.guard(function(options){if(catalogPicker)catalogPicker.open(options);}),
    loadText:loadText, restoreDraft:life.guard(restoreDraft), prepareWelcome:life.guard(prepareWelcome),
    beforePreviewReplace:life.guard(beforePreviewReplace),previewRendered:life.guard(previewRendered),
    isProjectOpen:session.isProjectOpen,
    draft:session.draft,
    draftInfo:function(){
      var initialDraft=session.draft();
      if (!initialDraft) return null;
      var title = 'Unfinished diagram';
      try { var raw = JSON.parse(initialDraft.text); title = (raw.page || raw).title || 'Untitled diagram'; } catch (ex){}
      return {title:title, savedAt:initialDraft.at};
    }
  };
}

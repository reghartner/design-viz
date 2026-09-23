/* validator.js — shared constants, validation rules and advisory lint.
   Browser-pure fragment: build.py wraps it (with engine.js + a boot file) in one
   IIFE. Contains no DOM access, so tests load it under Node via vm. */

var ICON_SET = ['terminal','cloud','shield','gear','db','antenna','thermo','pump','router','package','key','server','chip','phone','house','camera','doorbell','lock','bulb','car','speaker'];
var TINT_SET = ['cmd','auth','data','mqtt','dev'];
/* Per-step node state is semantic narrative state, never an authored color.
   `base` is the explicit clearing token; null clears too. */
var TONE_SET = ['alert','warn','ok','dim','base'];
var VIEW_SET = ['ambient','step','ambient-only'];

var SKIN_NAMES = ['aurora','daylight','editorial','terminal','pastel','blueprint'];
var DEFAULT_SKIN = 'pastel';
var SKINS = {
  aurora:   {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  daylight: {bg:'#FBFAF6', grid:'',        halos:false, glow:false, retNeutral:'#6B6F7A'},
  /* The four showcase skins are CSS overlays authored on the Aurora palette. */
  editorial:{bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  terminal: {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  pastel:   {bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'},
  blueprint:{bg:'#0B1220', grid:'#16233C', halos:true,  glow:true,  retNeutral:'#93A7C9'}
};
/* ONE kind->style table: edges, packets, arrowheads, and the legend all read it. */
var BUILTIN_PROTOCOLS = {
  https:  {label:'HTTPS',        color:{aurora:'#38E1FF', daylight:'#4956C9'}},
  int:    {label:'service call', color:{aurora:'#A78BFA', daylight:'#7C5CC4'}},
  mqtt:   {label:'MQTT',         color:{aurora:'#F471B5', daylight:'#C2417E'}},
  sqs:    {label:'SQS',          color:{aurora:'#FFB454', daylight:'#B45309'}},
  rmq:    {label:'RabbitMQ',     color:{aurora:'#FF8A65', daylight:'#C0392B'}},
  pulsar: {label:'Pulsar',       color:{aurora:'#2DD4BF', daylight:'#0F766E'}},
  tls:    {label:'TLS',          color:{aurora:'#FACC15', daylight:'#A16207'}},
  ws:     {label:'WebSocket',    color:{aurora:'#60A5FA', daylight:'#2563EB'}}
};
var ACCENTS = {green:'#4ADE80', blue:'#38BDF8', violet:'#A78BFA', amber:'#FFB454',
               pink:'#F471B5', cyan:'#38E1FF', red:'#F87171', slate:'#94A3B8'};
var ACCENT_CYCLE = ['green','blue','violet','amber'];
var DASH_MAIN = '9 7', DASH_RET = '4 6';
var LANE_FALLBACK = '#94A3B8';
var CONTRACT_VERSION = '1';

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
/* finite-only numeric check: a JSON overflow literal (1e400) parses to
   Infinity, which is typeof 'number' but poisons percentage math into NaN */
function isFiniteNum(v){ return typeof v === 'number' && isFinite(v); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isHex(s){ return typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s); }
function resolveProtocols(page){
  var out = {};
  Object.keys(BUILTIN_PROTOCOLS).forEach(function(k){ out[k] = BUILTIN_PROTOCOLS[k]; });
  var extra = page.protocols || {};
  Object.keys(extra).forEach(function(k){
    var p = extra[k] || {};
    out[k] = {label: p.label || k, color: p.color || '#9AA4B2'};
  });
  return out;
}
function kindColor(protos, kind, skin){
  var p = protos[kind] || protos['int'];
  var c = p.color;
  if (typeof c === 'string') return c;
  return c[skin] || c.aurora || '#9AA4B2';
}
function resolveLanes(page){
  var out = {};
  var raw = page.lanes || {};
  Object.keys(raw).forEach(function(k){
    var l = raw[k] || {};
    out[k] = {label: l.label || k, color: isHex(l.color) ? l.color : LANE_FALLBACK};
  });
  return out;
}

/* Fragment-level reveal fields are shared by section bullet objects,
   contract-card rows, and diagram edges. Indices are zero-based. Invalid
   values are ignored by the renderer, but every bad authoring shape gets a
   precise warning here. */
function revealFieldWarnings(obj, path, stepCount, warnings){
  if (!obj || typeof obj !== 'object') return;
  var valid = {};
  ['revealAt', 'hideAt'].forEach(function(k){
    if (!Object.prototype.hasOwnProperty.call(obj, k)) return;
    if (!stepCount)
      warnings.push(path + '.' + k + ': reveal fields require diagram.steps in this section — ambient rendering stays visible');
    if (!(typeof obj[k] === 'number' && isFinite(obj[k]) &&
          Math.floor(obj[k]) === obj[k] && obj[k] >= 0)){
      warnings.push(path + '.' + k + ': must be a non-negative integer step index — ignored');
    } else {
      valid[k] = true;
    }
  });
  if (valid.revealAt && stepCount && obj.revealAt >= stepCount)
    warnings.push(path + '.revealAt: step index ' + obj.revealAt +
      ' is beyond the diagram step count (' + stepCount + ') — fragment never reveals');
  if (valid.revealAt && valid.hideAt && obj.hideAt <= obj.revealAt)
    warnings.push(path + '.hideAt: must be greater than revealAt (' + obj.revealAt + ') — fragment has no visible step');
}

function bulletRevealWarnings(items, path, stepCount, warnings){
  if (!Array.isArray(items)) return;
  items.forEach(function(item, i){
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    revealFieldWarnings(item, path + '[' + i + ']', stepCount, warnings);
    bulletRevealWarnings(item.sub, path + '[' + i + '].sub', stepCount, warnings);
  });
}

function validatePaths(d, path, errors){
  if (d.paths == null) return;
  if (!Array.isArray(d.paths) || !d.paths.length){ errors.push(path + '.paths: expected a nonempty array of paths'); return; }
  var ids = new Map(), pathIds = new Set();
  (Array.isArray(d.steps) ? d.steps : []).forEach(function(s){
    if (s && typeof s.id === 'string' && s.id) ids.set(s.id,(ids.get(s.id) || 0) + 1);
  });
  d.paths.forEach(function(p,i){
    var at = path + '.paths[' + i + ']';
    if (!p || typeof p !== 'object' || Array.isArray(p)){ errors.push(at + ': expected a path object'); return; }
    if (typeof p.id !== 'string' || !p.id.trim() || pathIds.has(p.id)) errors.push(at + '.id: required unique nonempty string');
    pathIds.add(p.id);
    if (p.label != null && (typeof p.label !== 'string' || !p.label.trim())) errors.push(at + '.label: expected a nonempty string');
    if (p.color != null && !isHex(p.color)) errors.push(at + '.color: expected a hex color');
    if (!Array.isArray(p.steps) || !p.steps.length){ errors.push(at + '.steps: expected one or more step IDs'); return; }
    var seen = new Set();
    p.steps.forEach(function(id,j){
      if (typeof id !== 'string' || ids.get(id) !== 1) errors.push(at + '.steps[' + j + ']: must reference a unique existing step ID');
      if (seen.has(id)) errors.push(at + '.steps[' + j + ']: repeated step ID; create a distinct step for a repeated operation');
      seen.add(id);
    });
  });
}

function sectionLayoutProfileWarnings(d, v, path, warnings){
  if(v == null)return;
  if(typeof v!=='object'||Array.isArray(v)){warnings.push(path+'.sectionLayout: expected default/backstage/confluence grid layouts');return;}
  Object.keys(v).forEach(function(target){
    if(['default','backstage','confluence'].indexOf(target)<0){warnings.push(path+'.sectionLayout: unknown target '+target);return;}
    var list=v[target],used=Object.create(null),tiles=sectionLayoutTiles(d);
    if(!Array.isArray(list)){warnings.push(path+'.sectionLayout.'+target+': expected an array of tiles');return;}
    list.forEach(function(it,i){
      var p=path+'.sectionLayout.'+target+'['+i+']',key=sectionLayoutKey(it);
      if(!it||typeof it!=='object'||Array.isArray(it)||!['x','y','w','h'].every(function(k){return Number.isInteger(it[k]);})||it.x<0||it.y<0||it.w<1||it.h<3||it.x+it.w>12||it.y>500||it.h>40)
        warnings.push(p+': use integer x/y/w/h; 12 columns, y 0–500, h 3–40');
      if(it && it.hidden!=null && (typeof it.hidden!=='boolean' || it.controls!=null))warnings.push(p+': hidden must be a boolean on a diagram or panel tile; step controls stay available');
      if(it && it.controls!=null && (it.controls!=='steps'||it.panel!=null))warnings.push(p+': controls must be "steps", without a panel ID');
      if(it && it.attachTo!=null && (it.controls!=='steps' || !(it.attachTo==='diagram' || tiles.some(function(t){return t.key===it.attachTo && panelCapability(t.type,'attachControls',false);}))))warnings.push(p+'.attachTo: attach step controls to "diagram" or "panel:<homemap ID>"');
      if(used[key]||(key!=='steps'&&!tiles.some(function(t){return t.key===key;})))warnings.push(p+': duplicate or unknown diagram/panel tile');
      used[key]=true;
    });
  });
}
function sectionLayoutWarnings(d, path, warnings){
  sectionLayoutProfileWarnings(d,d.sectionLayout,path,warnings);
  if(d.layouts!=null){
    if(!Array.isArray(d.layouts)||!d.layouts.length)warnings.push(path+'.layouts: expected a nonempty array of named layouts');
    else{
      var used=Object.create(null);
      d.layouts.forEach(function(v,i){
        var p=path+'.layouts['+i+']';
        if(!v || typeof v!=='object' || Array.isArray(v)){warnings.push(p+': expected a named layout');return;}
        if(typeof v.id!=='string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v.id) || used[v.id])warnings.push(p+'.id: use a unique ID starting with a letter, followed by letters, digits, _ or - (up to 64 characters)');
        if(typeof v.id==='string')used[v.id]=true;
        if(typeof v.name!=='string' || !v.name.trim() || v.name.trim().length>40)warnings.push(p+'.name: use a nonempty name of up to 40 characters');
        if(!v.sectionLayout || !['default','backstage','confluence'].some(function(k){return Array.isArray(v.sectionLayout[k]);}))warnings.push(p+'.sectionLayout: declare at least one host profile');
        sectionLayoutProfileWarnings(d,v.sectionLayout,p,warnings);
        if(v.steps!=null){
          var ids=(d.steps || []).map(function(st){return st && st.id;});
          if(!Array.isArray(v.steps) || !v.steps.length || v.steps.some(function(id,i){return typeof id!=='string' || ids.filter(function(s){return s===id;}).length!==1 || v.steps.indexOf(id)!==i;}))warnings.push(p+'.steps: use a nonempty list of unique existing step IDs; omit for all steps');
          else if(!sectionViewStepsReachable(d,v.steps))warnings.push(p+'.steps: select at least one step used by a story path');
        }
      });
    }
  }
  if(d.defaultLayout!=null && !(Array.isArray(d.layouts) && diagramLayoutViews(d).some(function(v){return !v.legacy && v.id===d.defaultLayout;})))
    warnings.push(path+'.defaultLayout: name an existing layout ID');
}
/* Establish only the containers used by dependent traversal. Never repair or
   replace authored values: the editor must retain the exact failing source.
   Optional null diagram fields still mean absent; panel-specific shapes and
   recoverable presentation fields keep their existing warning semantics. */
function specStructureErrors(page){
  var errors = [];
  function object(value, path){
    if (specObject(value)) return true;
    errors.push(path + ': must be an object');
    return false;
  }
  function list(value, path, visit){
    if (!Array.isArray(value)){ errors.push(path + ': must be an array'); return; }
    value.forEach(function(item, i){
      var at = path + '[' + i + ']';
      if (object(item, at) && visit) visit(item, at);
    });
  }
  function section(sec, path){
    if (sec.diagram == null) return;
    var d = sec.diagram, at = path + '.diagram';
    if (!object(d, at)) return;
    if (d.nodes != null && object(d.nodes, at + '.nodes'))
      Object.keys(d.nodes).forEach(function(id){ object(d.nodes[id], at + '.nodes.' + id); });
    ['edges', 'floats', 'panels', 'steps'].forEach(function(key){
      if (d[key] != null) list(d[key], at + '.' + key);
    });
  }
  ['blocks', 'sections'].forEach(function(key){
    if (!Object.prototype.hasOwnProperty.call(page, key)) return;
    list(page[key], 'page.' + key, function(block, path){
      // Finding paths within the page retain the existing editor convention.
      path = path.slice(5);
      if (Object.prototype.hasOwnProperty.call(block, 'tabs')){
        list(block.tabs, path + '.tabs', function(tab, at){
          if (Object.prototype.hasOwnProperty.call(tab, 'sections'))
            list(tab.sections, at + '.sections', section);
        });
      } else section(block, path);
    });
  });
  return errors;
}

function validateSection(sec, P, protos, lanes, errors, warnings){
  if (!sec || typeof sec !== 'object'){ errors.push(P + ': must be an object'); return; }
  var sectionStepCount = sec.diagram && Array.isArray(sec.diagram.steps) ? sec.diagram.steps.length : 0;
  bulletRevealWarnings(sec.bullets, P + '.bullets', sectionStepCount, warnings);
  if (sec.accent && !ACCENTS[sec.accent] && !isHex(sec.accent))
    warnings.push(P + '.accent: unknown accent "' + sec.accent + '" — using the default cycle (valid: ' + Object.keys(ACCENTS).join(' ') + ', or "#RRGGBB")');
  if (sec.source && typeof sec.source !== 'string')
    warnings.push(P + '.source: must be a URL string — source chip skipped');
  if (Object.prototype.hasOwnProperty.call(sec, 'collapsed') && typeof sec.collapsed !== 'boolean')
    warnings.push(P + '.collapsed: must be a boolean — using the expanded default');
  if (sec.contract != null){
    var CP = P + '.contract';
    if (typeof sec.contract !== 'object' || Array.isArray(sec.contract)){
      warnings.push(CP + ': must be an object {title?, source?, fields:[...], note?} — card skipped');
    } else {
      var ct = sec.contract;
      if (ct.source && typeof ct.source !== 'string')
        warnings.push(CP + '.source: must be a URL string — source chip skipped');
      if (!Array.isArray(ct.fields) || !ct.fields.length){
        warnings.push(CP + '.fields: required — array of {k, v?, g?, hot?, link?, delta?, revealAt?, hideAt?}; card renders without rows');
      } else ct.fields.forEach(function(f, fi){
        if (!f || typeof f !== 'object'){
          warnings.push(CP + '.fields[' + fi + ']: must be an object with a "k" — row skipped');
          return;
        }
        if (!f.k) warnings.push(CP + '.fields[' + fi + '].k: required — row skipped');
        if (f.link && typeof f.link !== 'string')
          warnings.push(CP + '.fields[' + fi + '].link: must be a URL string — link ignored');
        if (f.delta != null && ['added','removed','changed'].indexOf(f.delta) < 0)
          warnings.push(CP + '.fields[' + fi + '].delta: unknown token "' + f.delta +
            '" — badge omitted (valid: added removed changed)');
        revealFieldWarnings(f, CP + '.fields[' + fi + ']', sectionStepCount, warnings);
      });
    }
  }
  if (!sec.diagram && !sec.text && !sec.bullets && !sec.heading && !sec.contract)
    warnings.push(P + ': empty section — add heading, text, bullets, contract, or diagram');
  var d = sec.diagram;
  if (!d) return;
  var DP = P + '.diagram';
  validatePaths(d, DP, errors);
  sectionLayoutWarnings(d, DP, warnings);
  if(d.layoutName != null && (typeof d.layoutName!=='string' || !d.layoutName.trim() || d.layoutName.trim().length>40))
    warnings.push(DP+'.layoutName: use a nonempty layout name of up to 40 characters');
  if (d.primaryPanel != null && (typeof d.primaryPanel !== 'string' ||
      !(Array.isArray(d.panels) && d.panels.some(function(p){ return p && p.id === d.primaryPanel; }))))
    warnings.push(DP + '.primaryPanel: must name an existing panel — using the standard flow layout');
  if (d.view && VIEW_SET.indexOf(d.view) < 0)
    warnings.push(DP + '.view: unknown view "' + d.view + '" — using "ambient" (valid: ' + VIEW_SET.join(', ') + ')');
  if (Object.prototype.hasOwnProperty.call(d, 'autoplay') && typeof d.autoplay !== 'boolean')
    warnings.push(DP + '.autoplay: must be true or false — opening paused');
  if (!d.nodes || typeof d.nodes !== 'object'){ errors.push(DP + '.nodes: required — map of node id to {title, sub, icon, tint}'); return; }
  if (!Array.isArray(d.rows) || d.rows.length === 0){ errors.push(DP + '.rows: required — array of rows, each an array of node ids (nested array = stack)'); return; }
  if (d.routing != null && d.routing !== 'lanes' && d.routing !== 'curves')
    warnings.push(DP + '.routing: expected "lanes" or "curves" — using curves');
  if (d.routing === 'lanes'){
    if ((d.floats || []).length || d.rows.some(function(row){ return !Array.isArray(row) || !row.length || row.length>5 || row.some(Array.isArray); }) ||
        (d.edges || []).some(function(e){ return e.from === e.to; }))
      warnings.push(DP + '.routing: lanes requires 1–5 unstacked cards per row, no floats or self-loops — using curves');
    else if ((d.edges || []).some(function(e){ return e.bend; }))
      warnings.push(DP + '.routing: lanes computes its own routes; authored edge bends are ignored');
  }

  var placed = {};
  d.rows.forEach(function(slots, r){
    if (!Array.isArray(slots)){ errors.push(DP + '.rows[' + r + ']: must be an array of slots'); return; }
    slots.forEach(function(s){
      (Array.isArray(s) ? s : [s]).forEach(function(id){
        if (!d.nodes[id]) errors.push(DP + '.rows[' + r + ']: unknown node id "' + id + '" — define it in nodes or remove it');
        else placed[id] = true;
      });
    });
  });
  (d.floats || []).forEach(function(f, fi){
    if (!f || !d.nodes[f.id]) errors.push(DP + '.floats[' + fi + ']: unknown node id "' + (f && f.id) + '"');
    else placed[f.id] = true;
    if (f && f.side && f.side !== 'above' && f.side !== 'below')
      warnings.push(DP + '.floats[' + fi + '].side: unknown side "' + f.side + '" — using "above" (valid: above, below)');
  });
  var groups = (d.groups && typeof d.groups === 'object') ? d.groups : {};
  sanitizedGroupParents(groups, function(key, reason){
    warnings.push(DP + '.groups.' + key + '.parent: ' + reason);
  });
  Object.keys(groups).forEach(function(key){
    var meta = groups[key];
    if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'icon')) return;
    if (typeof meta.icon !== 'string')
      warnings.push(DP + '.groups.' + key + '.icon: must be a string — icon ignored');
    else if (ICON_SET.indexOf(meta.icon) < 0)
      warnings.push(DP + '.groups.' + key + '.icon: unknown icon "' + meta.icon + '" — using "gear" (valid: ' + ICON_SET.join(' ') + ')');
  });
  Object.keys(d.nodes).forEach(function(id){
    if (!placed[id]) warnings.push(DP + '.nodes.' + id + ': defined but not placed in rows or floats — it will not be drawn');
    var n = d.nodes[id] || {};
    if (Object.prototype.hasOwnProperty.call(n, 'delta') && typeof n.delta !== 'boolean')
      warnings.push(DP + '.nodes.' + id + '.delta: must be true or false — ignored');
    if (n.icon && ICON_SET.indexOf(n.icon) < 0) warnings.push(DP + '.nodes.' + id + '.icon: unknown icon "' + n.icon + '" — using "gear" (valid: ' + ICON_SET.join(' ') + ')');
    if (n.tint && TINT_SET.indexOf(n.tint) < 0) warnings.push(DP + '.nodes.' + id + '.tint: unknown tint "' + n.tint + '" — using "cmd" (valid: ' + TINT_SET.join(' ') + ')');
    if (n.link && typeof n.link !== 'string') warnings.push(DP + '.nodes.' + id + '.link: must be a URL string — link ignored');
    if (n.group && !groups[n.group]) warnings.push(DP + '.nodes.' + id + '.group: group "' + n.group + '" not declared in diagram.groups — drawing an untitled boundary');
  });
  var edgeKeys = {};
  (d.edges || []).forEach(function(e, ei){
    var EP = DP + '.edges[' + ei + ']';
    if (e && Object.prototype.hasOwnProperty.call(e, 'delta') && typeof e.delta !== 'boolean')
      warnings.push(EP + '.delta: must be true or false — ignored');
    if (!e || !placed[e.from]) errors.push(EP + '.from: "' + (e && e.from) + '" is not a placed node');
    if (!e || !placed[e.to]) errors.push(EP + '.to: "' + (e && e.to) + '" is not a placed node');
    if (e && e.kind && !protos[e.kind]) warnings.push(EP + '.kind: unknown kind "' + e.kind + '" — using "int"; declare it in page.protocols to style it');
    revealFieldWarnings(e, EP, sectionStepCount, warnings);
    if (e){
      var ek = e.from + '->' + e.to;
      if (edgeKeys[ek])
        warnings.push(EP + ': duplicate edge "' + ek + '" — the engine keys edges by from->to, so the second declaration overrides the first\'s animation and coin anchors; merge them into one edge or make one a return (swap from/to with ret:true)');
      edgeKeys[ek] = true;
    }
  });
  var panelIds = {};
  var panelDeclById = {};
  var panelContexts = Object.create(null);
  (d.panels || []).forEach(function(p, pi){
    var PP = DP + '.panels[' + pi + ']';
    if (!p || typeof p !== 'object'){ errors.push(PP + ': must be an object {id, type, ...}'); return; }
    if (!p.id){ errors.push(PP + '.id: required'); return; }
    if (panelIds[p.id]) errors.push(PP + '.id: duplicate panel id "' + p.id + '"');
    panelIds[p.id] = true;
    panelDeclById[p.id] = p;
    var descriptor = PanelRegistry.get(p.type);
    if (!descriptor)
      warnings.push(PP + '.type: unknown panel type "' + p.type + '" — rendering a placeholder (valid: ' + PanelRegistry.types().join(' ') + ')');
    if (descriptor && descriptor.validateDeclaration)
      panelContexts[p.id] = descriptor.validateDeclaration(p, PP, warnings, errors, d);
  });
  var stepIds = {};
  (d.steps || []).forEach(function(st, ti){
    if (st && Object.prototype.hasOwnProperty.call(st, 'delta') && typeof st.delta !== 'boolean')
      warnings.push(DP + '.steps[' + ti + '].delta: must be true or false — ignored');
    var keys = stepKeys(st);
    var failures = stepFailures(st);
    if (st && st.failures != null){
      var FP = DP + '.steps[' + ti + '].failures';
      if (typeof st.failures !== 'object' || Array.isArray(st.failures)) errors.push(FP + ': expected an object mapping edge keys to dropped or blocked');
      else Object.keys(st.failures).forEach(function(key){
        if (!Object.prototype.hasOwnProperty.call(edgeKeys,key)) errors.push(FP + ': unknown edge \"' + key + '\" (format from->to)');
        if (COMM_FAILURE_MODES.indexOf(st.failures[key]) < 0) errors.push(FP + '.' + key + ': expected dropped or blocked');
      });
    }
    var nds = stepNodes(st);
    var patch = stepPanelPatch(st);
    var tonePatch = stepTonePatch(st);
    var hasToneField = !!(st && Object.prototype.hasOwnProperty.call(st, 'tone'));
    if (st && st.id != null){
      if (typeof st.id !== 'string')
        warnings.push(DP + '.steps[' + ti + '].id: must be a string — ignored');
      else if (stepIds[st.id])
        warnings.push(DP + '.steps[' + ti + '].id: duplicate step id "' + st.id + '" — deep links resolve to the first');
      else stepIds[st.id] = true;
    }
    if (!keys.length && !Object.keys(failures).length && !nds.length && !patch && !tonePatch)
      warnings.push(DP + '.steps[' + ti + ']: no edge/edges, nodes, or panels, or tone — give it something to show');
    keys.forEach(function(k){
      if (!edgeKeys[k]) warnings.push(DP + '.steps[' + ti + ']: "' + k + '" matches no edge (format "from->to") — skipped');
    });
    nds.forEach(function(id){
      if (!placed[id]) warnings.push(DP + '.steps[' + ti + '].nodes: "' + id + '" is not a placed node — skipped');
    });
    if (hasToneField && !tonePatch){
      warnings.push(DP + '.steps[' + ti + '].tone: must be an object mapping node ids to tone tokens — ignored (valid: ' +
        TONE_SET.join(' ') + '; null also clears)');
    } else if (tonePatch){
      Object.keys(tonePatch).forEach(function(id){
        var tone = tonePatch[id];
        if (!d.nodes[id]){
          warnings.push(DP + '.steps[' + ti + '].tone: unknown node id "' + id + '" — tone ignored');
        } else if (tone !== null && TONE_SET.indexOf(tone) < 0){
          warnings.push(DP + '.steps[' + ti + '].tone.' + id + ': unknown tone token "' +
            String(tone) + '" — ignored (valid: ' + TONE_SET.join(' ') + '; null also clears)');
        }
      });
    }
    if (patch) Object.keys(patch).forEach(function(pid){
      if (!panelIds[pid]){
        warnings.push(DP + '.steps[' + ti + '].panels: "' + pid + '" is not a declared panel id — patch ignored');
      } else if (patch[pid] == null || typeof patch[pid] !== 'object' || Array.isArray(patch[pid])){
        // a patch must be an object of widget fields — a bare array/scalar is
        // silently ignored by the engine (classic slip: log lines given as
        // panels.<id>: [...] instead of panels.<id>: {"log": [...]})
        warnings.push(DP + '.steps[' + ti + '].panels.' + pid + ': patch must be an object of widget fields — ' +
          (Array.isArray(patch[pid]) ? 'got an array (log lines go in {"log": [...]})' : 'got ' + typeof patch[pid]) +
          '; the engine ignores this patch');
      } else {
        var panel = panelDeclById[pid], descriptor = PanelRegistry.get(panel.type);
        if (descriptor && descriptor.validatePatch)
          descriptor.validatePatch(patch[pid], DP + '.steps[' + ti + '].panels.' + pid, panel, warnings, panelContexts[pid]);
      }
    });
    if (st && st.lane && !lanes[st.lane])
      warnings.push(DP + '.steps[' + ti + '].lane: lane "' + st.lane + '" not declared in page.lanes — neutral pill');
    if (st && st.link && typeof st.link !== 'string') warnings.push(DP + '.steps[' + ti + '].link: must be a URL string — link ignored');
    if (st && Array.isArray(st.packets)) st.packets.forEach(function(pk, ki){
      if (!pk || !edgeKeys[pk.edge]) warnings.push(DP + '.steps[' + ti + '].packets[' + ki + ']: "' + (pk && pk.edge) + '" matches no edge — skipped');
    });
  });
}

function validate(page){
  var errors = [], warnings = [];
  if (!specObject(page)){ errors.push('top level: expected {page:{blocks:[...]}} (or sections), or a bare diagram with nodes+rows'); return {errors:errors, warnings:warnings}; }
  errors = specStructureErrors(page);
  if (errors.length) return {errors:errors, warnings:warnings};
  if (typeof FlowviewCompatibility !== 'undefined') warnings = warnings.concat(FlowviewCompatibility.metadataWarnings(page));
  if (typeof FlowCanon !== 'undefined') errors = errors.concat(FlowCanon.validate(page));
  var blocks = blocksOf(page);
  if (!blocks.length){
    errors.push('page.blocks: required — provide at least one section or tabs block');
    return {errors:errors, warnings:warnings};
  }
  if (page.skin && SKIN_NAMES.indexOf(page.skin) < 0)
    warnings.push('page.skin: unknown skin "' + page.skin + '" — using "' + DEFAULT_SKIN + '" (valid: ' + SKIN_NAMES.join(', ') + ')');
  if (Object.prototype.hasOwnProperty.call(page, 'generatedFrom')){
    var gf = page.generatedFrom;
    if (!gf || typeof gf !== 'object' || Array.isArray(gf)){
      warnings.push('page.generatedFrom: must be an object {url, label?, version?, at?} — provenance line skipped');
    } else {
      ['url', 'label', 'version', 'at'].forEach(function(k){
        if (Object.prototype.hasOwnProperty.call(gf, k) && typeof gf[k] !== 'string')
          warnings.push('page.generatedFrom.' + k + ': must be a string — ' +
            (k === 'url' ? 'provenance line skipped' : 'value ignored'));
      });
      if (!Object.prototype.hasOwnProperty.call(gf, 'url')){
        warnings.push('page.generatedFrom.url: required — provenance line skipped');
      } else if (typeof gf.url === 'string' && !/^https?:\/\//i.test(gf.url)){
        warnings.push('page.generatedFrom.url: only http(s) URLs become links — label rendered as text');
      }
    }
  }
  if (page.contract != null){
    var major = String(page.contract).split('.')[0];
    if (major !== CONTRACT_VERSION)
      warnings.push('page.contract: spec declares contract "' + page.contract +
        '" — this engine implements contract ' + CONTRACT_VERSION +
        '; rendering proceeds but re-check the spec against the current authoring contract');
  }
  validateDetails(page, errors, warnings);
  var protos = resolveProtocols(page);
  var lanes = resolveLanes(page);
  blocks.forEach(function(b){
    if (b.type === 'section'){
      validateSection(b.sec, b.path, protos, lanes, errors, warnings);
    } else {
      if (!b.tabs.length) warnings.push(b.path + '.tabs: empty tabs block');
      b.tabs.forEach(function(t){
        if (!t.sections.length) warnings.push(t.path + '.sections: tab has no sections');
        t.sections.forEach(function(sec, k){
          validateSection(sec, t.path + '.sections[' + k + ']', protos, lanes, errors, warnings);
        });
      });
    }
  });
  return {errors:errors, warnings:warnings};
}

/* ---------------- lint (advisory warnings, never errors) ----------------
   Layout-aware heuristics for spec authors who cannot see the render — an
   authoring agent gets these from tools/validate.js before any browser is
   involved. Uses layout()/isWrap() from core/geometry.js (same logical bundle).
   Defensive: a diagram that fails basic validation is skipped, never thrown
   on. */
var LINT_CHAR_PX = 6.35;      /* mono label width estimate, px per char */
var LINT_CORRIDOR_MAX = 4;    /* cross-row edges per row gap before warning */

function lintDiagram(d, DP, usedKinds, warnings){
  if (!d || !d.nodes || typeof d.nodes !== 'object' ||
      !Array.isArray(d.rows) || !d.rows.length) return;
  (d.edges || []).forEach(function(e){
    if (e && e.kind) usedKinds[e.kind] = true;
  });
  var L;
  try { L = layout(d); } catch (ex){ return; }

  var corridor = {};
  (d.edges || []).forEach(function(e, ei){
    if (!e) return;
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b) return;
    if (a.row >= 0 && b.row >= 0 && a.row !== b.row){
      var g = Math.min(a.row, b.row);
      corridor[g] = (corridor[g] || 0) + 1;
    }
    if (e.label){
      var chord = Math.sqrt(Math.pow(b.cx - a.cx, 2) + Math.pow(b.cy - a.cy, 2));
      var usable;
      if (isWrap(e, L)) usable = chord * 2.2;
      else if (a.row === b.row && a.row >= 0) usable = Math.max(30, chord - (a.w + b.w) / 2);
      else usable = chord * 1.25;
      var labelPx = String(e.label).length * LINT_CHAR_PX;
      if (labelPx > usable){
        var shown = String(e.label).length > 28 ? String(e.label).slice(0, 25) + '…' : String(e.label);
        warnings.push(DP + '.edges[' + ei + '].label: "' + shown + '" (~' + Math.round(labelPx) +
          'px) is longer than its edge can carry (~' + Math.round(usable) +
          'px) — shorten it, or the auto-layout will push it far off the line');
      }
    }
  });
  Object.keys(corridor).forEach(function(g){
    if (corridor[g] > LINT_CORRIDOR_MAX)
      warnings.push(DP + ': ' + corridor[g] + ' edges cross the corridor between rows ' +
        (Number(g) + 1) + ' and ' + (Number(g) + 2) +
        ' — expect crowding; consider fewer return edges or a second section');
  });

  var reportedPairs = new Set();
  diagramPathList(d).forEach(function(path){
    var firstEdgeAt = new Map();
    path.indices.forEach(function(ti){
      var k = stepDeliveredKeys(d.steps[ti])[0];
      if (!k) return;
      if (firstEdgeAt.has(k)){
        var earlier=firstEdgeAt.get(k), pair=earlier+':'+ti;
        if(!reportedPairs.has(pair))warnings.push(DP + '.steps[' + ti + ']: shares first edge "' + k + '" with steps[' +
          earlier + '] — both step coins land on the same midpoint; reorder the edges list of one step');
        reportedPairs.add(pair);
      }else firstEdgeAt.set(k,ti);
    });
  });
}

function lintPage(page){
  var warnings = [];
  if (!page) return warnings;
  var usedKinds = {};
  blocksOf(page).forEach(function(b){
    if (b.type === 'section'){
      if (b.sec && b.sec.diagram) lintDiagram(b.sec.diagram, b.path + '.diagram', usedKinds, warnings);
    } else {
      b.tabs.forEach(function(t){
        t.sections.forEach(function(sec, k){
          if (sec && sec.diagram) lintDiagram(sec.diagram, t.path + '.sections[' + k + '].diagram', usedKinds, warnings);
        });
      });
    }
  });
  Object.keys(page.protocols || {}).forEach(function(k){
    if (!usedKinds[k])
      warnings.push('page.protocols.' + k + ': declared but no edge uses kind "' + k + '" — remove it or use it');
  });
  return warnings;
}

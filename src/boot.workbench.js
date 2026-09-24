/* Workbench contract reference and editor/welcome wiring. */

var CONTRACT = [
  'You are generating a Flowspec page: one JSON document that renders as a',
  'technical-documentation page of animated data-flow diagrams and guided',
  'click-throughs. Emit ONLY JSON matching this shape — no HTML, no coordinates,',
  'no pixel values, no styling.',
  'Save/Export adds page.flowview with authoredWith, minVersion, and feature IDs.',
  'For agent output, stamp with tools/compatibility.js --stamp before publishing.',
  'Preserve declared requirements; the authoring version alone is not a minimum.',
  '',
  '{',
  '  "page": {',
  '    "title": "<page title>",',
  '    "skin": "pastel",                      // pastel (default)|aurora|daylight|editorial|terminal|blueprint',
  '    "protocols": {                         // optional: add new edge kinds',
  '      "<kind>": {"label": "<legend label>", "color": "#RRGGBB"}',
  '    },',
  '    "lanes": {                             // optional: step lane pills',
  '      "<LANE>": {"color": "#RRGGBB", "label": "<pill text>"}',
  '    },',
  '    "blocks": [                            // ordered page content',
  '      { <section> },                       // a plain section, or:',
  '      { "tabs": [ {"label": "<tab name>", "sections": [ <section>, ... ]} ] }',
  '    ]',
  '  }',
  '}',
  '',
  'A <section> is one accent-colored bounding box:',
  '{',
  '  "heading": "<section heading>",',
  '  "accent": "green",                 // green|blue|violet|amber|pink|cyan|red|slate or "#RRGGBB"',
  '  "source": "<permalink URL>",       // optional: "source" chip beside the heading',
  '  "text": ["<paragraph>", ...],      // optional prose above the diagram',
  '  "bullets": ["<point>", {"text":"<point>", "sub":[], "revealAt":1, "hideAt":3}],',
  '                                      // optional nested bullets + zero-based step reveals',
  '  "contract": {                      // optional "on the wire" message-contract card',
  '    "title": "<card title>", "source": "<permalink URL>",',
  '    "fields": [{"k":"<field>", "v":"<sample value>", "g":"<gloss>",',
  '                "hot": true, "delta":"added|removed|changed",',
  '                "revealAt":1, "hideAt":3,',
  '                "link": "<permalink URL>"}],    // per-field source arrow',
  '    "note": "<footer note>"',
  '  },',
  '  "diagram": {',
  '    "view": "ambient",               // "ambient" (toggle to step) | "step" (opens as',
  '                                     // click-through) | "ambient-only" (no toggle)',
  '    "autoplay": false,               // optional; true = advance every 3s on step entry',
  '    "nodes":  {"<id>": {"title":"<name>", "sub":"<one-line detail>",',
  '                        "icon":"<icon>", "tint":"<tint>",',
  '                        "group":"<groupId>",          // optional: containment boundary',
  '                        "link":"<permalink URL>"}},   // optional: clickable arrow on the card',
  '    "groups": {"<groupId>": {"title":"<boundary title>", "icon":"<icon>"}}, // optional icon; dashed box around members',
  '    "rows":   [["<id>", "<id>", ...],           // row 1, left-to-right',
  '               ["<id>", ["<id>","<id>"], ...]], // row 2, left-to-right; nested array = stack',
  '    "routing":"curves",                     // optional "lanes": reserved tracks; 1–5 flat cards/row, no floats/self-loops',
  '    "floats": [{"id":"<id>", "side":"above"}],  // branch nodes (auth, signing)',
  '    "edges":  [{"from":"<id>", "to":"<id>", "kind":"https|int|mqtt",',
  '                "ret":false, "label":"<short label>", "revealAt":1, "hideAt":3}],',
  '    "panels": [                              // optional synchronized inspector panels',
  '      {"id":"copies", "type":"replicas", "replicas":[{"id":"remote","label":"Remote"}]}',
  '                                     // patch reference:{series,position} and replicas:{remote:{series,position,status,lagMs}}; same-sequence comparisons only',
  '      {"id":"inside", "type":"trace", "spans":[{"id":"request","service":"api","name":"handle","startMs":0,"ms":100}]}',
  '                                     // patch {"selected":"request"}; inclusive / union of direct children / uncovered wall time (not CPU)',
  '      {"id":"data", "type":"table", "columns":[{"id":"key","label":"Field"},{"id":"value","label":"Value"}]}',
  '                                     // patch {"rows":[{"id":"r","cells":{"key":"status","value":"ready"},"status":"changed"}]}',
  '      {"id":"gate", "type":"checks", "checks":[{"id":"auth","label":"Authorized"}]}',
  '                                     // patch {"results":{"auth":{"status":"pass","detail":"scope present"}}}; authored outcomes only',
  '      {"id":"limits", "type":"budget", "metrics":[{"id":"ram","label":"Memory","unit":"KiB","max":64,"warn":48}]}',
  '                                     // patch {"values":{"ram":52}}; missing/null = NO DATA; rows/results/values replace wholesale',
  '      {"id":"trace", "type":"waterfall", "spans":[{"id":"a","label":"request","ms":100,"startMs":0}]}',
  '                                     // startMs preserves concurrent offsets; total is elapsed extent, not summed nested time',
  '      {"id":"<pid>", "type":"state", "title":"...", "states":["OFF","BOOT"], "initial":{"state":"OFF"}},',
  '      {"id":"<pid>", "type":"leds",  "title":"...", "leds":[{"id":"radio","label":"RADIO"}], "initial":{"radio":"on"}},',
  '      {"id":"<pid>", "type":"gauge", "title":"...", "unit":"mA", "max":400, "initial":{"value":2}},',
  '      {"id":"<pid>", "type":"log",   "title":"...", "tags":{"NET":"#38E1FF"}},',
  '      {"id":"<pid>", "type":"screen","title":"...", "scene":"person-at-door-night", "initial":{"mode":"off"}},',
  '      {"id":"<pid>", "type":"queue", "title":"...", "initial":{"state":"empty"}},  // mailbox: patch',
  '                                     // {"state":"enqueue|held|dequeue|empty", "label":"<msg>",',
  '                                     //  "from":"<arrival ctx>", "to":"<departure ctx>", "reason":"<waiting-on line>"}',
  '      {"id":"<pid>", "type":"inflight", "title":"...",',
  '       "lanes":[{"id":"a","label":"plan upload"}]} // patch {"start":[{"lane":"a","label":"seq 4182"}],',
  '                                     //        "end":["a"], "mark":[{"lane":"a","state":"ok|retry|failed"}]}',
  '      {"id":"<pid>", "type":"timeline", "title":"...", "span":"6h",',
  '       "cadence":{"every":"30m","label":"heartbeat"}, "initial":{"now":"0m"}}',
  '                                     // wall-clock axis; steps patch {"now":"2h"} and',
  '                                     // {"events":[{"at":"1h30m","label":"...","kind":"ok|alert|info"}]} (append)',
  '      {"id":"<pid>", "type":"phone", "title":"...", "initial":{"clock":"9:41"}}',
  '                                     // patch {"notify":{"app":"Homestead","title":"...","text":"..."}}',
  '                                     // or {"notify":[...]} (accumulates newest first); {"clear":true} dismisses all',
  '      {"id":"app", "type":"deviceapp", "device":"Front door doorbell",',
  '       "fields":[{"id":"battery","label":"Battery","kind":"battery"}],',
  '       "initial":{"battery":{"value":68,"status":"ready"}}}',
  '                                     // patch {"battery":{"status":"stale"}} keeps the last value;',
  '                                     // patch {"notify":{"app":"Homestead","title":"Doorbell pressed"}}; {"clear":true} dismisses notifications only',
  '                                     // sources and per-field source mappings are optional; showSources:false hides their map and badges',
  '                                     // status: unknown/loading/ready/stale/error; source override allowed',
  '    ],',
  '    "steps":  [{"edge":"<from>-><to>", "text":"<caption>", "lane":"<LANE>",',
  '                "link":"<permalink URL>",',
  '                "nodes":["<id>"],            // light nodes directly (edgeless steps allowed)',
  '                "panels":{"<pid>": {"state":"BOOT", "mode":"live", "value":320,',
  '                                    "log":[{"tag":"DEV","text":"<line>"}]}}},',
  '               {"edges":["<a>-><b>", "<a>-><c>"], "text":"<caption>"}]',
  '  }',
  '}',
  '',
  'Rules:',
  '- Section text, bullets, step captions and contract notes/glosses support',
  '  `inline code` and triple-backtick fenced code blocks. Code stays literal.',
  '  Use actual newlines in text fields, \\n in JSON. Keep node/panel labels plain.',
  '- ONE diagram spec always yields BOTH flavors: the ambient animated view and',
  '  the guided step click-through. steps drives the numbered coins, the ambient',
  '  packet schedule, and the click-through playback (lit hops + caption from',
  '  text). You never author them separately.',
  '- Every rows array is visual LEFT-TO-RIGHT order. The engine computes',
  '  positions from that order. Each row retains its horizontal order when',
  '  other rows are added, moved, or removed.',
  '- Put a long sequence on two rows (3-5 slots per row). A nested array inside',
  '  a row is a stack: one column of fan-out targets. Two nodes with the same',
  '  "group" get a dashed containment boundary (a device with two chips) — put',
  '  group members in one stack column; an edge between stack members draws as',
  '  a vertical interconnect.',
  '- A branch service (auth, signing) goes in floats, not rows.',
  '- kind is the PROTOCOL of the hop. "ret": true marks a response/ack — drawn',
  '  as a fine dash in the protocol color. New protocols: declare in page.protocols.',
  '- Carry source permalinks from the design doc: section.source, nodes.<id>.link,',
  '  steps[n].link. Every rendered element should trace back to its source; all',
  '  three are optional and cost nothing visually when absent.',
  '- steps number the hops in narrative order; use edges:[...] when hops happen',
  '  together (a fan-out, a round trip) — their packets fire in order, staggered.',
  '  A step may be EDGELESS: give it nodes:[...] and/or panels patches instead',
  '  (a device booting, a state change with no message).',
  '- Optional steps[n].failures maps existing edge keys to "dropped" or "blocked".',
  '  Example: failures:{"broker->device":"dropped"}. Dropped means an attempted',
  '  send never arrived; blocked means not sent. A static break remains when',
  '  motion is reduced. Failed hops focus the sender and suppress delivery',
  '  packets; other successful hops still work. Effects apply only to this step.',
  '  Use only for established non-delivery, not a received request with an error.',
  '- Optional step.color: #RGB or #RRGGBB colors that step circle/coin only.',
  '  Repeat on adjacent steps for phases; omit for default colors. Never carries.',
  '- Optional diagram.paths: [{id, label, color, steps:[step IDs]}]. First path is',
  '  the default; steps becomes a shared registry. Reuse IDs for the shared prefix,',
  '  then reference different outcome steps. Path chips sit left of aligned step',
  '  rows beneath playback controls. Shared steps before the fork appear as',
  '  clickable 35%-opacity shadows; columns after the path ends stay blank.',
  '  The colored branch begins at the first differing step, after all shared steps.',
  '  Each path has its own playback ending and folded panel state.',
  '  Example: happy=[accept,auth,queue,deliver,ack], drop=[accept,auth,queue,lost].',
  '  Path IDs must be unique; each path needs existing, non-repeated step IDs.',
  '- Optional diagram.sectionLayout declares default/backstage/confluence tile arrays.',
  '- Optional diagram.layouts: [{id,name,sectionLayout,steps?}] provides named views.',
  '  Optional steps:[IDs] filters playback stops, while skipped states still apply.',
  '  Views share the same step definitions, paths and panels; defaultLayout picks',
  '  the opening ID. Tile hidden:true hides only that view’s diagram or panel.',
  '  Each tile uses integer x/y/w/h on 12 columns, h 3–40; panel names a panel ID;',
  '  controls:"steps" identifies playback controls; attachTo:"diagram" or',
  '  attachTo:"panel:<homemap ID>" couples them to that tile; omit for detached.',
  '  Optimize preserves hidden tiles and coupling. Omit both',
  '  panel and controls for the diagram. Arrange section authors layouts; Preview',
  '  and Optimize layout select the host profile. See docs/section-layouts.md.',
  '- Optional diagram.primaryPanel names a declared panel to make it the large',
  '  centerpiece, with playback beneath it and Data flow collapsed below.',
  '  Use this for a homemap-led story. No schema version flag is needed.',
  '  Home / Data flow switches the live page focus without changing the selected',
  '  path or step. Existing sidebar homemaps get this switch too; primaryPanel',
  '  sets the default opening layout, not a restriction on reader navigation.',
  '- homemap panels declare devices:[{id,kind,label,x,y}], subjects:[{id,label,x,y}],',
  '  optional rooms:[{label,x,y,w,h}], and initial state in a 320x180 map frame.',
  '  A room with kind:"outdoor" draws grounds beneath the house; indoor objects',
  '  do not tint the grounds. outline:{w,h,x,y} sizes/positions the house only;',
  '  omitted x/y center each axis. Rooms/devices keep their own coordinates.',
  '  For a wall door use an entry device with display:"door". x/y is the hinge,',
  '  facing the closed leaf direction (clockwise degrees from +x, default 0),',
  '  doorWidth its length (8–48, default 24), doorSwing its opening angle',
  '  (signed 15–135 degrees, default +90 clockwise). Patch its ID open/closed/',
  '  alert; alert stays closed. Doors do not simulate collision or occlusion.',
  '  Device states use visual cues instead of chips. Subject labels are hidden',
  '  by default; set showSubjectLabels:true on the panel to display them.',
  '  Device kinds: camera, entry, sensor, hub. Patch device IDs with states and',
  '  subject IDs with {x,y} or null to hide. Both carry along the selected path.',
  '  Device values may also be {state:"off",thermal:"hot"}. State and thermal',
  '  carry independently; thermal is normal|warm|hot|cold|freezing. A state',
  '  string changes operation without clearing thermal. Use thermal:normal',
  '  to clear heat/frost. The step inspector has separate inherited controls.',
  '  signals:[{from,to}] between device IDs lasts only for that step. The workbench',
  '  supports inherited state selectors, visitor placement, and signal controls.',
  '  Drag devices or room borders/labels in the step placement map to edit their',
  '  shared layout across all paths. Subject moves still patch the selected step.',
  '  Edit layout also has a shared drag map without selecting a step: move rooms,',
  '  devices, doors, and starting subjects; the House grip moves the outline and',
  '  square corners resize the house/rooms. Step overrides remain unchanged.',
  '- panels declare synchronized inspector widgets beside the board; steps carry',
  '  SPARSE panel patches (only what changed). The engine folds patches into',
  '  complete per-step state, so jumping to any step is always consistent. A',
  '  "log" patch key APPENDS lines; an "enterOnce" sub-object applies only at',
  '  its own step. Screen modes: off | boot | active | live | rec | save | unavailable; scenes:',
  '  person-at-door-night | person-through-door | doorbell-run-away | doorbell-runners |',
  '  package-drop | kitchen-fire | static-noise.',
  '  Screen scenePlayback:waiting holds a quiet scene independently of mode:rec.',
  '  Patch scenePlayback:playing later to start the event while recording carries.',
  '  Omission defaults to playing; waiting/playing carry across steps and paths.',
  '  Screen mode:unavailable hides the scene and shows plain-text reason.',
  '  Thermo supports lowWarn/lowCrit (at-or-below) plus warn/crit (at-or-above).',
  '  Leave a safe interval. Temperature does not automatically change camera',
  '  mode, charging, or Home thermal state; author each from the design.',
  '- steps[n].lane tags the acting layer (declare colors in page.lanes; the pill',
  '  shows on the caption line).',
  '- Use tabs to group related diagrams and click-throughs into one experience;',
  '  a diagram repeated in another tab with view:"step" gives readers a guided',
  '  version at zero extra authoring cost.',
  '- icons: terminal cloud shield gear db antenna thermo pump router package key server chip phone house camera doorbell lock bulb car',
  '- tints: cmd auth data mqtt dev',
  '- Edge labels: protocol verbs and topics (POST /x, PUBLISH a/b/c) read best.'
].join('\n');

/* ---------------- wire up ---------------- */
var view = document.getElementById('docview');
var src = document.getElementById('src');
var msgs = document.getElementById('msgs');
var activeSkin = null; /* null = follow spec */
var workbenchPreview=createWorkbenchPreviewController({view:view,skin:currentSkin,findings:showMsgs,
  present:function(skin){setSkinButtons(skin);applySkinClasses(document.body,view,skin);},
  beforeReplace:function(request){if(workbenchBuilder)workbenchBuilder.beforePreviewReplace(request);},
  completed:function(outcome){if(workbenchBuilder)workbenchBuilder.previewRendered(outcome);}
});

/* one button per skin, generated from SKIN_NAMES so a new skin appears
   here without touching the skeleton */
var skinBtns = {};
(function(){
  var holder = document.getElementById('skinbtns');
  SKIN_NAMES.forEach(function(name){
    var b = document.createElement('button');
    b.className = 'skbtn';
    b.id = 'sk-' + name;
    b.setAttribute('aria-pressed', name === DEFAULT_SKIN ? 'true' : 'false');
    b.textContent = name.toUpperCase() + (name === DEFAULT_SKIN ? ' (default)' : '');
    b.addEventListener('click', function(){
      activeSkin = name; setSkinButtons(name);
      workbenchPreview.repaint(name);
    });
    holder.appendChild(b);
    skinBtns[name] = b;
  });
})();

document.getElementById('contract').textContent = CONTRACT;
document.getElementById('copy-contract').addEventListener('click', function(){
  var b = this;
  try {
    navigator.clipboard.writeText(CONTRACT).then(function(){
      b.textContent = 'Copied'; setTimeout(function(){ b.textContent = 'Copy'; }, 1500);
    }, function(){ b.textContent = 'Select manually'; });
  } catch (e){ b.textContent = 'Select manually'; }
});

function readCookieText(){
  try { return document.cookie || ''; }
  catch (ex) { return ''; } /* sandboxed pages may deny cookie reads */
}
function currentSkin(page){
  if (activeSkin) return activeSkin;
  /* same precedence as the viewer (boot.flowview.js): a valid dv_skin
     cookie set by the hosting site beats the spec default, until a skin
     button (or the host channel below) picks one explicitly */
  return resolveSkin(readCookieText(), page && page.skin);
}
function setSkinButtons(skin){
  SKIN_NAMES.forEach(function(name){
    if (skinBtns[name]) skinBtns[name].setAttribute('aria-pressed', name === skin ? 'true' : 'false');
  });
}
/* Host skin channel — same contract as the viewer (boot.flowview.js): an
   embedding shell posts {type:'dv_skin', skin:<name>} when its navbar theme
   picker changes, or calls window.dvSetSkin(name) directly. No origin
   restriction on purpose — the page is a static file served from arbitrary
   hosts, so the legitimate origin is unknowable at build time; the payload
   is whitelist-validated and the only immediate effect is a skin class
   swap. Unlike the skin buttons this never rebuilds the preview — a rebuild
   would discard an armed ADD TO STEP / connect mode and any form focus —
   the choice is remembered in activeSkin so every later render uses it. */
window.dvSkins = SKIN_NAMES.slice();
window.dvSetSkin = function(name){
  if (SKIN_NAMES.indexOf(name) < 0) return false;
  activeSkin = name;
  setSkinButtons(name);
  return applySkinClasses(document.body, view, name);
};
window.addEventListener('message', function(e){
  if (e.data && e.data.type === 'dv_skin' &&
      typeof window.dvSetSkin === 'function' &&
      SKIN_NAMES.indexOf(e.data.skin) >= 0){
    window.dvSetSkin(e.data.skin);
  }
});
function showMsgs(v){
  msgs.innerHTML = '';
  function add(cls, label, m){
    var li = document.createElement('li');
    li.className = cls;
    li.textContent = label + m;
    /* clicking a finding selects the offending JSON in the editor
       (BUILDER_JUMP_TO_FINDING is assigned once the builder starts) */
    li.addEventListener('click', function(){
      if (BUILDER_JUMP_TO_FINDING) BUILDER_JUMP_TO_FINDING(m);
    });
    msgs.appendChild(li);
  }
  v.errors.forEach(function(m){ add('e', 'ERROR ', m); });
  v.warnings.forEach(function(m){ add('w', 'warn ', m); });
}

function go(fromText,request){
  return workbenchPreview.render(src.value,request || {origin:'manual'});
}

document.getElementById('go').addEventListener('click', function(){ go(true); });

src.value = JSON.stringify(welcomeBlankSpec(), null, 2);
setSkinButtons(currentSkin(null));
applySkinClasses(document.body, view, currentSkin(null));

/* builder: click any rendered node/edge/label/coin/panel/section to jump to
   its definition in the editor; INSERT buttons splice ready-made snippets */
var workspace = initWorkbenchWorkspace();
var canonContext, loadingCanon=false;
var workbenchBuilder=initWorkbenchBuilder({view: view, src: src, render: function(request){return go(true,request);}, workspace:workspace,
  catalog:function(){return canonContext && canonContext.catalog;},
  deferInitialSave:true,
  isActive:function(){return !document.getElementById('workbench-workspace').hidden;},
  beforeProjectLoad:function(){
    workbenchPreview.forgetDocument();
    if(!loadingCanon){
      if(welcome && welcome.localProjectOpened)welcome.localProjectOpened();
      if(canonContext && canonContext.detach)canonContext.detach();
    }
  },
  renderedText:workbenchPreview.renderedText,
  ctl:workbenchPreview.controller});
var welcome=initWorkbenchWelcome({src:src,builder:workbenchBuilder,templates:WORKBENCH_TEMPLATES,
  workspace:workspace,skipWelcome:new URLSearchParams(location.search).has('canon')});
canonContext=initCanonWorkbench({src:src,catalogChanged:function(){workbenchBuilder.refreshCatalog();},loadSpec:function(raw){
  loadingCanon=true;
  try{var result=workbenchBuilder.loadSpec(raw);welcome.canonicalLoaded();return result;}
  finally{loadingCanon=false;}
}});

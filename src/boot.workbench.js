/* boot.workbench.js — demo spec, contract text, and editor wiring for the
   workbench page. Browser-only fragment, concatenated last by tools/build.py. */

var CMD_DIAGRAM = {
  nodes: {
    console:  {title:"Ops Console", sub:"operator UI", icon:"terminal", tint:"cmd"},
    api:      {title:"Nimbus API", sub:"api gateway", icon:"cloud", tint:"cmd"},
    sentinel: {title:"Sentinel Auth", sub:"tokens", icon:"shield", tint:"auth"},
    dispatch: {title:"Dispatch", sub:"command svc", icon:"gear", tint:"cmd", link:"https://example.com/hld/cumulus#dispatch"},
    registry: {title:"Registry", sub:"device shadows", icon:"db", tint:"data"},
    broker:   {title:"Relay Broker", sub:"MQTT · TLS :8883", icon:"antenna", tint:"mqtt", link:"https://example.com/hld/cumulus#relay-broker"},
    d1:       {title:"Thermostat T-100", sub:"cmd/site-4/hvac-2", icon:"thermo", tint:"dev"},
    d2:       {title:"Pump P-7", sub:"cmd/site-4/pump-7", icon:"pump", tint:"dev"},
    d3:       {title:"Edge Gateway", sub:"cmd/site-4/#", icon:"router", tint:"dev"}
  },
  rows: [
    ["console", "api", "dispatch", "registry"],
    ["broker", ["d1", "d2", "d3"]]
  ],
  floats: [ {id:"sentinel", side:"above"} ],
  edges: [
    {from:"console", to:"api", kind:"https", label:"POST /commands"},
    {from:"api", to:"sentinel", kind:"int", label:"verify JWT", labelDx:-40},
    {from:"sentinel", to:"dispatch", kind:"int", ret:true, label:"scope ok", labelDx:34},
    {from:"api", to:"dispatch", kind:"int", label:"authorized"},
    {from:"dispatch", to:"registry", kind:"int", label:"shadow write"},
    {from:"registry", to:"broker", kind:"mqtt", label:"PUBLISH cmd/site-4/pump-7"},
    {from:"broker", to:"d1", kind:"mqtt"},
    {from:"broker", to:"d2", kind:"mqtt", label:"SUBSCRIBE cmd/site-4/#", labelDy:-4},
    {from:"broker", to:"d3", kind:"mqtt"},
    {from:"d2", to:"broker", kind:"mqtt", ret:true, label:"PUBACK · QoS 1", bend:30, labelDy:24},
    {from:"broker", to:"dispatch", kind:"mqtt", ret:true, label:"ack/site-4/pump-7", labelDx:60}
  ],
  panels: [
    {id:"mbx", type:"queue", title:"Relay — pump-7 queue", initial:{state:"empty"}}
  ],
  steps: [
    {edge:"console->api", text:"Operator sends the command over HTTPS", lane:"NET"},
    {edges:["api->sentinel", "sentinel->dispatch"], text:"Token verified with Sentinel; scope approved", lane:"NET"},
    {edge:"api->dispatch", text:"Authorized command handed to Dispatch", lane:"NET"},
    {edge:"dispatch->registry", text:"Desired state written to the device shadow", lane:"NET"},
    {edge:"registry->broker", text:"Published to the broker; QoS 1 queues it for the pump", lane:"NET", link:"https://example.com/hld/cumulus#qos-policy",
     panels:{mbx:{state:"enqueue", label:"cmd pump-7 v41", from:"Registry · MQTT"}}},
    {edges:["broker->d1", "broker->d2", "broker->d3"], text:"Fan-out to every subscriber on cmd/site-4/#", lane:"DEV",
     panels:{mbx:{state:"dequeue", to:"→ Pump P-7"}}},
    {edges:["d2->broker", "broker->dispatch"], text:"Pump P-7 acknowledges; ack topic returns to Dispatch", lane:"DEV",
     panels:{mbx:{state:"empty"}}}
  ]
};

var OTA_DIAGRAM = {
  nodes: {
    portal:   {title:"Release Portal", sub:"ops UI", icon:"terminal", tint:"cmd"},
    builder:  {title:"Build Pipeline", sub:"CI runner", icon:"gear", tint:"cmd"},
    signer:   {title:"Signing Service", sub:"HSM-backed", icon:"key", tint:"auth"},
    store:    {title:"Artifact Store", sub:"fw images", icon:"db", tint:"data"},
    campaign: {title:"Campaign Svc", sub:"staged rollout", icon:"server", tint:"cmd"},
    broker:   {title:"Relay Broker", sub:"MQTT · ota topics", icon:"antenna", tint:"mqtt"},
    gw:       {title:"Edge Gateway", sub:"ota/site-4/gw", icon:"router", tint:"dev"},
    sensor:   {title:"Sensor Node S-12", sub:"ota/site-4/s12", icon:"chip", tint:"dev"}
  },
  rows: [
    ["portal", "builder", "store", "campaign"],
    ["broker", ["gw", "sensor"]]
  ],
  floats: [ {id:"signer", side:"above"} ],
  edges: [
    {from:"portal", to:"builder", kind:"https", label:"release v2.4.1"},
    {from:"builder", to:"signer", kind:"int", label:"sign image", labelDx:-40},
    {from:"signer", to:"store", kind:"int", label:"signed fw", labelDx:34},
    {from:"builder", to:"store", kind:"int", label:"upload"},
    {from:"store", to:"campaign", kind:"int", label:"manifest"},
    {from:"campaign", to:"broker", kind:"mqtt", label:"PUBLISH ota/site-4/notify"},
    {from:"broker", to:"gw", kind:"mqtt", label:"SUBSCRIBE ota/site-4/#", labelDy:-4},
    {from:"broker", to:"sensor", kind:"mqtt"},
    {from:"gw", to:"broker", kind:"mqtt", ret:true, label:"status: applied", bend:30, labelDy:24},
    {from:"broker", to:"campaign", kind:"mqtt", ret:true, label:"status/ota/site-4", labelDx:60}
  ],
  steps: [
    {edge:"portal->builder", text:"Release cut from the portal", lane:"NET"},
    {edge:"builder->signer", text:"Image sent for HSM signing", lane:"NET"},
    {edges:["signer->store", "builder->store"], text:"Signed image lands in the artifact store", lane:"NET"},
    {edge:"store->campaign", text:"Campaign staged from the manifest", lane:"NET"},
    {edge:"campaign->broker", text:"Devices notified over MQTT", lane:"NET"},
    {edges:["broker->gw", "broker->sensor"], text:"Fan-out to the rollout ring", lane:"DEV"},
    {edges:["gw->broker", "broker->campaign"], text:"Install status returns to the campaign", lane:"DEV"}
  ]
};

var CMD_STEP = JSON.parse(JSON.stringify(CMD_DIAGRAM));
CMD_STEP.view = "step";

var DEMO = {
  page: {
    title: "Cumulus IoT — device messaging",
    skin: "aurora",
    lanes: {
      NET: {color: "#38E1FF"},
      DEV: {color: "#4ADE80"}
    },
    blocks: [
      {
        tabs: [
          {
            label: "Command flow",
            sections: [{
              heading: "Command delivery",
              accent: "green",
              source: "https://example.com/hld/cumulus#command-delivery",
              text: ["An operator command leaves the console over HTTPS, is authorized and written as desired state, then rides MQTT to every subscribed device. The acknowledgment returns over the same broker."],
              bullets: [
                "Sentinel Auth is a branch — the command never passes through it",
                "The Registry write lands before the publish, so a device that misses the message can reconcile later",
                "QoS 1: the broker retries until Pump P-7 sends PUBACK"
              ],
              contract: {
                title: "On the wire: command publish (MQTT)",
                source: "https://example.com/hld/cumulus#command-envelope",
                fields: [
                  {k:"topic", v:"cmd/site-4/pump-7", g:"per-device command topic"},
                  {k:"version", v:"41", g:"shadow document version — the device rejects stale writes", hot:true,
                   link:"https://example.com/hld/cumulus#shadow-versioning"},
                  {k:"desired.flow", v:"12.5", g:"target flow rate, L/min"},
                  {k:"ttl", v:"30s", g:"broker message-expiry"}
                ],
                note: "The ack on ack/site-4/pump-7 echoes the same version so Dispatch can match request to report."
              },
              diagram: CMD_DIAGRAM
            }]
          },
          {
            label: "OTA rollout",
            sections: [{
              heading: "Firmware OTA rollout",
              accent: "blue",
              text: ["A release is cut, signed, and stored; the campaign service notifies devices over MQTT and collects install status on the return topics."],
              bullets: [
                "Images are signed before storage — devices verify the signature offline",
                "Rollout is staged: the campaign service controls the notify fan-out"
              ],
              diagram: OTA_DIAGRAM
            }]
          },
          {
            label: "Guided walkthrough",
            sections: [{
              heading: "Command delivery, step by step",
              accent: "violet",
              text: ["The exact same diagram spec as the first tab — the only difference is view: \"step\", which opens it as a click-through. One config, both flavors."],
              diagram: CMD_STEP
            }]
          }
        ]
      }
    ]
  }
};

var CONTRACT = [
  'You are generating a Flowspec page: one JSON document that renders as a',
  'technical-documentation page of animated data-flow diagrams and guided',
  'click-throughs. Emit ONLY JSON matching this shape — no HTML, no coordinates,',
  'no pixel values, no styling.',
  '',
  '{',
  '  "page": {',
  '    "title": "<page title>",',
  '    "skin": "aurora",                      // aurora|daylight|editorial|terminal|pastel|blueprint',
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
  '    "nodes":  {"<id>": {"title":"<name>", "sub":"<one-line detail>",',
  '                        "icon":"<icon>", "tint":"<tint>",',
  '                        "group":"<groupId>",          // optional: containment boundary',
  '                        "link":"<permalink URL>"}},   // optional: clickable arrow on the card',
  '    "groups": {"<groupId>": {"title":"<boundary title>"}},  // draw a dashed box around members',
  '    "rows":   [["<id>", "<id>", ...],           // row 1, left-to-right',
  '               ["<id>", ["<id>","<id>"], ...]], // row 2, right-to-left; nested array = stack',
  '    "floats": [{"id":"<id>", "side":"above"}],  // branch nodes (auth, signing)',
  '    "edges":  [{"from":"<id>", "to":"<id>", "kind":"https|int|mqtt",',
  '                "ret":false, "label":"<short label>", "revealAt":1, "hideAt":3}],',
  '    "panels": [                              // optional synchronized inspector panels',
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
  '      {"id":"<pid>", "type":"phone", "title":"...", "initial":{"clock":"9:41"}}',
  '                                     // patch {"notify":{"app":"Homestead","title":"...","text":"..."}}',
  '                                     // or {"notify":[...]} (accumulates newest first); {"clear":true} dismisses all',
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
  '- ONE diagram spec always yields BOTH flavors: the ambient animated view and',
  '  the guided step click-through. steps drives the numbered coins, the ambient',
  '  packet schedule, and the click-through playback (lit hops + caption from',
  '  text). You never author them separately.',
  '- rows are FLOW ORDER. The engine computes all positions. Even rows read',
  '  left-to-right, odd rows right-to-left (a serpentine); the wrap between the',
  '  last slot of one row and the first slot of the next is drawn automatically.',
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
  '- panels declare synchronized inspector widgets beside the board; steps carry',
  '  SPARSE panel patches (only what changed). The engine folds patches into',
  '  complete per-step state, so jumping to any step is always consistent. A',
  '  "log" patch key APPENDS lines; an "enterOnce" sub-object applies only at',
  '  its own step. Screen modes: off | boot | live | rec | save; scenes:',
  '  person-at-door-night | package-drop | static-noise.',
  '- steps[n].lane tags the acting layer (declare colors in page.lanes; the pill',
  '  shows on the caption line).',
  '- Use tabs to group related diagrams and click-throughs into one experience;',
  '  a diagram repeated in another tab with view:"step" gives readers a guided',
  '  version at zero extra authoring cost.',
  '- icons: terminal cloud shield gear db antenna thermo pump router package key server chip phone',
  '- tints: cmd auth data mqtt dev',
  '- Edge labels: protocol verbs and topics (POST /x, PUBLISH a/b/c) read best.'
].join('\n');

/* ---------------- wire up ---------------- */
var view = document.getElementById('docview');
var src = document.getElementById('src');
var msgs = document.getElementById('msgs');
var activeSkin = null; /* null = follow spec */
var lastPage = null;
var lastCtl = null;  /* renderPage controller of the current render, for tab restore */

/* one button per skin, generated from SKIN_NAMES so a new skin appears
   here without touching the skeleton */
var skinBtns = {};
(function(){
  var holder = document.getElementById('skinbtns');
  SKIN_NAMES.forEach(function(name){
    var b = document.createElement('button');
    b.className = 'skbtn';
    b.id = 'sk-' + name;
    b.setAttribute('aria-pressed', name === 'aurora' ? 'true' : 'false');
    b.textContent = name.toUpperCase() + (name === 'aurora' ? ' (default)' : '');
    b.addEventListener('click', function(){
      activeSkin = name; setSkinButtons(name);
      if (lastPage){
        var openTabs = activeTabSlugs(lastCtl);
        lastCtl = renderPage(view, lastPage, name);
        restoreActiveTabs(lastCtl, openTabs);
        applySkinClasses(document.body, view, name);
      }
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

function currentSkin(page){
  if (activeSkin) return activeSkin;
  return SKINS[page && page.skin] ? page.skin : 'aurora';
}
function setSkinButtons(skin){
  SKIN_NAMES.forEach(function(name){
    if (skinBtns[name]) skinBtns[name].setAttribute('aria-pressed', name === skin ? 'true' : 'false');
  });
}
function showMsgs(v){
  msgs.innerHTML = '';
  v.errors.forEach(function(m){
    var li = document.createElement('li'); li.className = 'e'; li.textContent = 'ERROR ' + m; msgs.appendChild(li);
  });
  v.warnings.forEach(function(m){
    var li = document.createElement('li'); li.className = 'w'; li.textContent = 'warn ' + m; msgs.appendChild(li);
  });
}

function go(fromText){
  var raw;
  msgs.innerHTML = '';
  try {
    raw = fromText ? JSON.parse(src.value) : DEMO;
  } catch (ex){
    showMsgs({errors:['JSON parse: ' + ex.message], warnings:[]});
    return;
  }
  var page = normalize(raw);
  var v = validate(page);
  var lint = v.errors.length ? [] : lintPage(page);
  showMsgs({errors: v.errors, warnings: v.warnings.concat(lint)});
  if (v.errors.length) return;
  lastPage = page;
  var skin = currentSkin(page);
  setSkinButtons(skin);
  var openTabs = activeTabSlugs(lastCtl);
  lastCtl = renderPage(view, page, skin);
  restoreActiveTabs(lastCtl, openTabs);
  applySkinClasses(document.body, view, skin);
}

document.getElementById('go').addEventListener('click', function(){ go(true); });

src.value = JSON.stringify(DEMO, null, 2);
go(false);

/* Emergency dispatch visualizes authored handoffs; it never contacts responders. */
(function () {
  var statuses = ['unknown', 'idle', 'requested', 'assigned', 'enroute', 'onscene', 'resolved', 'cancelled', 'blocked'];
  var priorities = ['routine', 'urgent', 'critical'];
  var unitStatuses = ['unknown', 'available', 'assigned', 'enroute', 'onscene', 'released', 'unavailable'];
  var kinds = ['police', 'fire', 'medical', 'security'];
  var fields = {status:statuses, priority:priorities, incident:'text', location:'text', dispatcher:'text', detail:'text', note:'text'};
  var unitFields = {status:unitStatuses, eta:'text', detail:'text'};
  var labels = {unknown:'Dispatch status unknown',idle:'Standing by',requested:'Dispatch requested',assigned:'Responders assigned',
    enroute:'Responders en route',onscene:'Responders on scene',resolved:'Response resolved',cancelled:'Dispatch cancelled',blocked:'Dispatch blocked'};
  var unitLabels = {unknown:'Status unknown',available:'Available',assigned:'Assigned',enroute:'En route',onscene:'On scene',released:'Released',unavailable:'Unavailable'};
  function items(panel) { return panelOperationalItems(panel, 'responders', 8, fields); }
  function clean(panel, raw, path, warnings, once) {
    return panelOperationalSnapshot(raw, fields, items(panel), unitFields, path, warnings, once);
  }
  function text(value) { return typeof value === 'string' ? value : ''; }
  function icon(kind) {
    var paths = {
      police:'<path d="m12 3 8 4v6c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m12 7 1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L7 10.5l3.5-.5Z"/>',
      fire:'<path d="M12 2c1 6 7 7 7 13a7 7 0 0 1-14 0c0-3 2-6 4-8 0 4 2 4 3 4 2-2 1-6 0-9Z"/><path d="M12 13c0 3 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5Z"/>',
      medical:'<path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z"/>',
      security:'<path d="m12 3 8 4v6c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m8 12 3 3 5-6"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[kinds.indexOf(kind) >= 0 ? kind : 'security'] + '</svg>';
  }
  function render(host, panel, raw) {
    var state = clean(panel, raw, '', null, false), status = state.status || 'unknown';
    var unitList = items(panel), priority = state.priority || '', active = 0;
    var rows = unitList.map(function (unit) {
      var value = panelObject(state[unit.id]) ? state[unit.id] : {}, s = value.status || 'unknown';
      if (['assigned','enroute','onscene'].indexOf(s) >= 0) active++;
      return '<li class="dispatch-unit dispatch-unit-' + s + '" data-responder-id="' + esc(unit.id) + '">' +
        '<div class="dispatch-unit-top"><span class="dispatch-unit-icon">' + icon(unit.kind) + '</span><div class="dispatch-unit-title"><strong>' + esc(text(unit.label) || unit.id) + '</strong><span>' + esc(text(unit.callsign) || (kinds.indexOf(unit.kind) >= 0 ? unit.kind : 'Responder')) + '</span></div>' +
        '<span class="dispatch-unit-status">' + unitLabels[s] + '</span></div>' +
        '<div class="dispatch-unit-bottom"><span class="dispatch-route" aria-hidden="true"><i></i><span></span><i></i></span>' +
        '<span class="dispatch-eta">' + (value.eta ? '<small>ETA</small> ' + esc(value.eta) : s === 'onscene' ? 'Arrival confirmed' : s === 'enroute' ? 'ETA not provided' : s === 'assigned' ? 'Awaiting departure' : s === 'available' ? 'Ready for assignment' : s === 'released' ? 'Unit released' : s === 'unavailable' ? 'Cannot accept assignment' : 'Awaiting unit update') + '</span></div>' +
        (value.detail ? '<p class="dispatch-unit-detail">' + esc(value.detail) + '</p>' : '') + '</li>';
    }).join('');
    var rail = [{id:'requested',label:'Request'},{id:'assigned',label:'Assign'},{id:'enroute',label:'En route'},{id:'onscene',label:'On scene'}].map(function (stage) {
      var current = status === stage.id;
      return '<li class="dispatch-stage' + (current ? ' is-current' : '') + '"' + (current ? ' aria-current="step"' : '') + '><span class="dispatch-stage-dot" aria-hidden="true"></span><span>' + stage.label + '</span></li>';
    }).join('');
    var h = '<div class="dispatch dispatch-' + status + '"><div class="dispatch-hero"><div class="dispatch-topline"><span>' + esc(text(panel.agency) || 'Emergency response') + '</span><span class="dispatch-priority dispatch-priority-' + (priority || 'unknown') + '">' + (priority ? priority + ' priority' : 'Priority not set') + '</span></div>' +
      '<div class="dispatch-status">' + labels[status] + '</div><div class="dispatch-dispatcher"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 11V8a6 6 0 0 1 12 0v3M4 10H2v5h4v-5Zm12 0h2v5h-4v-5ZM16 15v2h-6"/></svg>' + esc(state.dispatcher || 'No dispatcher assigned') + '</div></div>' +
      '<div class="dispatch-incident"><span class="dispatch-case-label">Incident</span><strong>' + esc(state.incident || 'No incident recorded') + '</strong><div class="dispatch-location"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M16 8c0 5-6 10-6 10S4 13 4 8a6 6 0 0 1 12 0Z"/><circle cx="10" cy="8" r="2"/></svg>' + esc(state.location || 'Location not specified') + '</div></div>' +
      '<ol class="dispatch-progress" aria-label="Current dispatch stage">' + rail + '</ol>' +
      (['blocked','cancelled','resolved','unknown','idle'].indexOf(status) >= 0 ? '<div class="dispatch-stage-note">' + ({blocked:'Handoff not accepted',cancelled:'Request cancelled',resolved:'Response closed',unknown:'No dispatch status recorded',idle:'No dispatch requested'})[status] + '</div>' : '') +
      '<div class="dispatch-brief">' + esc(state.detail || (status === 'blocked' ? 'Response has not been confirmed.' : 'Updates appear when authored in a step.')) + '</div>' +
      '<div class="dispatch-roster-head"><span>Response team</span><span>' + active + ' active / ' + unitList.length + '</span></div>' +
      '<ul class="dispatch-roster" aria-label="Responders">' + rows + '</ul>' + (!unitList.length ? '<div class="swempty">No responders configured</div>' : '') + '</div>';
    return {html:softwarePanelShell(h, state), pulse:{selector:'.dispatch-status',changed:['requested','onscene','blocked'].indexOf(status) >= 0}};
  }
  PanelRegistry.define('dispatch', {
    label:'Emergency dispatch', since:'0.1.0', render:render,
    presentation:{growing:true, ambientInitial:true},
    layout:{height:14, fallbackHeight:14, supporting:true, attachControls:true},
    validateDeclaration:function (panel, path, warnings) {
      if (panel.agency != null && typeof panel.agency !== 'string') warnings.push(path + '.agency: expected text — ignored');
      panelCollectionWarnings(panel, path, warnings, 'responders', 8, function (unit, at) {
        if (!items({responders:[unit]}).length) warnings.push(at + '.id: use a unique letter-led ID; state fields and prototype names are reserved — ignored');
        ['label','callsign'].forEach(function (key) { if (unit[key] != null && typeof unit[key] !== 'string') warnings.push(at + '.' + key + ': expected text — ignored'); });
        if (unit.kind != null && kinds.indexOf(unit.kind) < 0) warnings.push(at + '.kind: expected ' + kinds.join('|') + ' — using security');
      });
      clean(panel, panel.initial, path + '.initial', warnings, false);
    },
    validatePatch:function (patch, path, panel, warnings) { clean(panel, patch, path, warnings, true); },
    fold:function (panel, steps) { return foldSanitizedPanelStates(panel, steps, function (raw, once) { return clean(panel, raw, '', null, once); }); },
    authoring:{
      template:{title:'Emergency dispatch',agency:'City response center',responders:[
        {id:'patrol',label:'Patrol unit',kind:'police',callsign:'Unit 24'},
        {id:'backup',label:'Security response',kind:'security',callsign:'Unit 08'}],
        initial:{status:'idle',priority:'routine',patrol:{status:'available'},backup:{status:'available'}}},
      setupFields:[['agency','text'],['responders','rows',{cols:[{k:'id',req:true},{k:'label'},{k:'kind',kind:'enum',options:kinds},{k:'callsign'}],max:8}],['initial','json']],
      patchFields:[['status','enum',statuses],['priority','enum',priorities],['incident','text'],['location','text'],['dispatcher','text'],['detail','text'],['note','text']],
      expandPatchFields:function (panel) {
        return PanelRegistry.get('dispatch').authoring.patchFields.concat(items(panel).map(function (unit) {
          return [unit.id,'objf',[['status','enum',unitStatuses],['eta','text'],['detail','text']]];
        }));
      },
      origin:function (panel, key, snapshot, context) {
        return panelSanitizedOrigin(key, context, function (raw) { return clean(panel, raw, '', null, false); });
      },
      picker:{order:27,name:'Emergency dispatch',category:'Devices & interfaces',tagline:'Make the response visible',
        description:'Track a request, assigned responders, ETA and arrival—or show a blocked handoff. Dispatch states and unit updates are explicitly authored.'},
      example:function (sample) {
        sample.state = {status:'enroute',priority:'urgent',incident:'Verified entry · Oak House',location:'14 Oak Lane · front entrance',dispatcher:'Jordan · dispatch desk',detail:'Patrol accepted the request. Security remains available as backup.',
          patrol:{status:'enroute',eta:'4 min',detail:'Approaching from the north'},backup:{status:'available'}};
        sample.panel.initial = JSON.parse(JSON.stringify(sample.state));
        return sample;
      }
    },
    styles:String.raw`
.dispatch{--dispatch-accent:#6576b3;--dispatch-good:#368068;--dispatch-warn:#b87924;--dispatch-bad:#bd5265;color:var(--dtext);min-width:0;container-type:inline-size;}
.dispatch-blocked{--dispatch-accent:var(--dispatch-bad);}.dispatch-onscene,.dispatch-resolved{--dispatch-accent:var(--dispatch-good);}.dispatch-unknown,.dispatch-cancelled{--dispatch-accent:var(--dfaint);}
.dispatch-hero{padding:14px;border:1px solid color-mix(in srgb,var(--dispatch-accent) 25%,transparent);border-radius:15px;background:linear-gradient(125deg,color-mix(in srgb,var(--dispatch-accent) 13%,transparent),color-mix(in srgb,var(--dispatch-accent) 3%,transparent));}
.dispatch-topline{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:10px;}.dispatch-topline>span:first-child{font:600 10px/1.5 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.05em;color:var(--dfaint);}.dispatch-priority{font:600 9px/1.5 'IBM Plex Mono',monospace;text-transform:uppercase;padding:3px 7px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dtext) 15%,transparent);}.dispatch-priority-urgent{color:var(--dispatch-warn);background:color-mix(in srgb,var(--dispatch-warn) 10%,transparent);border-color:color-mix(in srgb,var(--dispatch-warn) 25%,transparent);}.dispatch-priority-critical{color:var(--dispatch-bad);background:color-mix(in srgb,var(--dispatch-bad) 10%,transparent);border-color:color-mix(in srgb,var(--dispatch-bad) 25%,transparent);}
.dispatch-status{font:600 22px/1.2 'IBM Plex Sans',sans-serif;color:var(--dink);margin-bottom:9px;overflow-wrap:anywhere;border-radius:5px;}.dispatch-dispatcher{display:flex;align-items:center;gap:6px;font-size:11px;}.dispatch-dispatcher svg{width:17px;height:17px;flex:none;color:var(--dispatch-accent);}
.dispatch-incident{padding:13px 2px 12px;display:grid;gap:4px;}.dispatch-case-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--dfaint);font-weight:600;}.dispatch-incident strong{font-size:13px;line-height:1.4;color:var(--dink);font-weight:600;}.dispatch-location{display:flex;align-items:flex-start;gap:4px;font-size:11px;}.dispatch-location svg{width:14px;height:16px;flex:none;}
.dispatch-progress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));list-style:none;margin:5px 0 0;padding:0;}.dispatch-stage{display:flex;align-items:center;flex-direction:column;gap:6px;position:relative;text-align:center;color:var(--dfaint);font-size:10px;line-height:1.3;min-width:0;}.dispatch-stage:before{position:absolute;content:'';height:1px;background:color-mix(in srgb,var(--dtext) 20%,transparent);top:7px;width:100%;left:50%;}.dispatch-stage:last-child:before{display:none;}.dispatch-stage-dot{width:13px;height:13px;border:1.5px solid color-mix(in srgb,var(--dtext) 30%,transparent);border-radius:50%;position:relative;z-index:1;background:var(--panel-bg,#f1f4fb);box-sizing:border-box;}.dispatch-stage.is-current{color:var(--dispatch-accent);font-weight:700;}.dispatch-stage.is-current .dispatch-stage-dot{border-color:var(--dispatch-accent);background:var(--dispatch-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--dispatch-accent) 12%,transparent);}
.dispatch-stage-note{text-align:center;color:var(--dispatch-accent);font:600 10px/1.5 'IBM Plex Mono',monospace;margin-top:9px;}.dispatch-brief{font-size:11px;line-height:1.5;margin:12px 0;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--dispatch-accent) 5%,transparent);border-left:2px solid color-mix(in srgb,var(--dispatch-accent) 55%,transparent);}
.dispatch-roster-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;margin:13px 0 8px;}.dispatch-roster-head>span:first-child{text-transform:uppercase;font-weight:600;letter-spacing:.05em;}.dispatch-roster-head>span+span{color:var(--dfaint);font-family:'IBM Plex Mono',monospace;}.dispatch-roster{list-style:none;margin:0;padding:0;display:grid;gap:9px;}
.dispatch-unit{border:1px solid color-mix(in srgb,var(--dtext) 15%,transparent);border-radius:12px;padding:11px 12px;min-width:0;}.dispatch-unit-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}.dispatch-unit-icon{display:grid;place-items:center;flex:none;width:30px;height:34px;border-radius:8px;background:color-mix(in srgb,var(--dispatch-accent) 8%,transparent);color:var(--dispatch-accent);}.dispatch-unit-icon svg{width:22px;height:22px;}.dispatch-unit-title{display:grid;gap:2px;flex:1;min-width:70px;}.dispatch-unit-title strong{font-size:12px;line-height:1.35;font-weight:600;color:var(--dink);}.dispatch-unit-title>span{font:10px/1.4 'IBM Plex Mono',monospace;color:var(--dfaint);}.dispatch-unit-status{font-size:10px;color:var(--dfaint);padding:2px 6px;border-radius:999px;background:color-mix(in srgb,var(--dtext) 6%,transparent);}.dispatch-unit-enroute .dispatch-unit-status,.dispatch-unit-assigned .dispatch-unit-status{color:var(--dispatch-accent);}.dispatch-unit-onscene .dispatch-unit-status{color:var(--dispatch-good);}.dispatch-unit-unavailable .dispatch-unit-status{color:var(--dispatch-bad);}
.dispatch-unit-bottom{display:flex;align-items:center;gap:10px;margin-top:10px;}.dispatch-route{display:flex;align-items:center;gap:3px;width:52px;flex:none;color:var(--dfaint);opacity:.45;}.dispatch-route i{width:5px;height:5px;border:1.5px solid currentColor;border-radius:50%;flex:none;}.dispatch-route>span{flex:1;height:2px;background:repeating-linear-gradient(90deg,currentColor 0 3px,transparent 3px 6px);background-size:6px 2px;}.dispatch-unit-enroute .dispatch-route{opacity:1;color:var(--dispatch-accent);}.dispatch-unit-enroute .dispatch-route>span{animation:dispatch-travel 1.1s linear infinite;}.dispatch-unit-onscene .dispatch-route{color:var(--dispatch-good);opacity:1;}.dispatch-unit-onscene .dispatch-route i:last-child{background:currentColor;}.dispatch-eta{font-size:10px;line-height:1.4;}.dispatch-eta small{font-size:9px;color:var(--dfaint);margin-right:2px;}.dispatch-unit-enroute .dispatch-eta{font-weight:600;color:var(--dink);}.dispatch-unit-detail{font-size:10.5px;line-height:1.45;margin:6px 0 0;}
@keyframes dispatch-travel{to{background-position:6px 0;}}
@container(max-width:260px){.dispatch-hero{padding:11px;}.dispatch-status{font-size:18px;}.dispatch-unit{padding:10px;}.dispatch-unit-status{margin-left:auto;}.dispatch-stage{font-size:9px;}.dispatch-unit-title{min-width:65px;}.dispatch-unit-top{gap:6px;}}
.sk-aurora .dispatch,.sk-terminal .dispatch,.sk-blueprint .dispatch{--dispatch-accent:#a6b6fa;--dispatch-good:#76c7a4;--dispatch-warn:#e2b571;--dispatch-bad:#ef91a6;--panel-bg:#15253a;}.sk-aurora .dispatch-blocked,.sk-terminal .dispatch-blocked,.sk-blueprint .dispatch-blocked{--dispatch-accent:var(--dispatch-bad);}.sk-aurora .dispatch-onscene,.sk-terminal .dispatch-onscene,.sk-blueprint .dispatch-onscene,.sk-aurora .dispatch-resolved,.sk-terminal .dispatch-resolved,.sk-blueprint .dispatch-resolved{--dispatch-accent:var(--dispatch-good);}
.sk-terminal .dispatch-hero,.sk-terminal .dispatch-unit,.sk-terminal .dispatch-brief,.sk-blueprint .dispatch-hero,.sk-blueprint .dispatch-unit,.sk-blueprint .dispatch-brief{border-radius:3px;}
@media(prefers-reduced-motion:reduce){.dispatch *{animation:none!important;transition:none!important;}}
@media print{.dispatch{--dispatch-accent:#333!important;--dispatch-good:#333!important;--dispatch-warn:#333!important;--dispatch-bad:#333!important;--panel-bg:#fff;color:#222;}.dispatch *{animation:none!important;transition:none!important;box-shadow:none!important;}.dispatch-hero,.dispatch-unit,.dispatch-brief{background:#fff;border:1px solid #999;}.dispatch-unit{break-inside:avoid;}}
`
  });
})();

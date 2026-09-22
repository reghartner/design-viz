/* Security monitoring is an authored assessment, never an automatic alarm rule. */
(function () {
  var statuses = ['unknown', 'disarmed', 'armed', 'alarm', 'reviewing', 'verified', 'cleared', 'offline'];
  var assessments = ['unverified', 'reviewing', 'verified', 'false-alarm'];
  var health = ['unknown', 'online', 'degraded', 'offline'];
  var alarms = ['unknown', 'clear', 'triggered', 'acknowledged'];
  var kinds = ['door', 'motion', 'camera', 'smoke', 'water', 'lock', 'sensor'];
  var fields = {status:statuses, operator:'text', incident:'text', assessment:assessments, detail:'text', note:'text'};
  var sensorFields = {health:health, alarm:alarms, detail:'text'};
  var labels = {unknown:'Status unknown', disarmed:'Disarmed', armed:'Monitoring', alarm:'Alarm received',
    reviewing:'Operator reviewing', verified:'Incident verified', cleared:'All clear', offline:'Monitoring offline'};
  var assessmentLabels = {unverified:'Unverified', reviewing:'Under review', verified:'Verified', 'false-alarm':'False alarm'};
  function items(panel) { return panelOperationalItems(panel, 'sensors', 12, fields); }
  function clean(panel, raw, path, warnings, once) {
    return panelOperationalSnapshot(raw, fields, items(panel), sensorFields, path, warnings, once);
  }
  function text(value) { return typeof value === 'string' ? value : ''; }
  function icon(kind) {
    var paths = {
      door:'<path d="M6 20V4h11v16M4 20h16M13 12h.01"/>',
      motion:'<circle cx="14" cy="5" r="2"/><path d="m9 11 4-4 4 4h3M13 8l-3 7-5 4m5-4 5 2 1 4M3 7l2-2m-2 7h3"/>',
      camera:'<rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 6l1-2h6l1 2"/>',
      smoke:'<path d="M5 17h14M7 20h10M7 13c-5-4 5-5 1-10m4 10c-5-4 5-5 1-10m4 10c-5-4 5-5 1-10"/>',
      water:'<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
      lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
      sensor:'<circle cx="12" cy="12" r="3"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[kinds.indexOf(kind) >= 0 ? kind : 'sensor'] + '</svg>';
  }
  function render(host, panel, raw) {
    var state = clean(panel, raw, '', null, false), status = state.status || 'unknown';
    var sensorList = items(panel), online = 0, triggered = 0;
    var rows = sensorList.map(function (sensor) {
      var value = panelObject(state[sensor.id]) ? state[sensor.id] : {};
      var h = value.health || 'unknown', alarm = value.alarm || 'unknown';
      if (h === 'online') online++;
      if (alarm === 'triggered') triggered++;
      return '<li class="secmon-sensor secmon-alarm-' + alarm + '" data-sensor-id="' + esc(sensor.id) + '"><span class="secmon-sensor-icon">' + icon(sensor.kind) +
        '</span><div class="secmon-sensor-body"><div class="secmon-sensor-head"><strong>' + esc(text(sensor.label) || sensor.id) +
        '</strong><span class="secmon-alarm-label">' + (alarm === 'unknown' ? 'Not assessed' : alarm === 'triggered' ? 'Alarm' : alarm === 'acknowledged' ? 'Acknowledged' : 'Clear') + '</span></div>' +
        '<div class="secmon-sensor-meta"><span class="secmon-health secmon-health-' + h + '"><i aria-hidden="true"></i>' + h + '</span>' +
        (text(sensor.zone) ? '<span>' + esc(sensor.zone) + '</span>' : '') + '</div>' +
        (value.detail ? '<div class="secmon-sensor-detail">' + esc(value.detail) + '</div>' : '') + '</div></li>';
    }).join('');
    var h = '<div class="secmon secmon-' + status + '"><div class="secmon-hero">' +
      '<div class="secmon-emblem"><svg viewBox="0 0 56 56" fill="none" aria-hidden="true"><path class="secmon-shield" d="M28 5 46 12v14c0 12-18 24-18 24S10 38 10 26V12Z" stroke="currentColor" stroke-width="1.8"/>' +
      (status === 'alarm' || status === 'verified' ? '<path d="M28 17v13m0 6h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' :
        status === 'offline' || status === 'unknown' ? '<path d="m21 22 14 14m0-14L21 36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' :
        '<path d="m20 28 6 6 12-13" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>') + '</svg></div>' +
      '<div class="secmon-headline"><div class="secmon-eyebrow">' + esc(text(panel.site) || 'Security monitoring') + '</div><div class="secmon-status">' + labels[status] + '</div>' +
      '<div class="secmon-operator"><span class="secmon-operator-dot" aria-hidden="true"></span>' + esc(state.operator || 'No operator assigned') + '</div></div></div>' +
      '<div class="secmon-metrics"><div><strong>' + online + '<small> / ' + sensorList.length + '</small></strong><span>Sensors online</span></div>' +
      '<div><strong>' + triggered + '</strong><span>Active alarms</span></div></div>' +
      '<div class="secmon-assessment"><div class="secmon-assessment-top"><span>Incident assessment</span><span class="secmon-assessment-badge secmon-assessment-' + (state.assessment || 'unverified') + '">' + assessmentLabels[state.assessment || 'unverified'] + '</span></div>' +
      '<strong>' + esc(state.incident || 'No incident recorded') + '</strong><p>' + esc(state.detail || 'Awaiting an authored assessment.') + '</p></div>' +
      '<ul class="secmon-sensors" aria-label="Monitored sensors">' + rows + '</ul>' +
      (!sensorList.length ? '<div class="swempty">No sensors configured</div>' : '') + '</div>';
    return {html:softwarePanelShell(h, state), pulse:{selector:'.secmon-emblem', changed:status === 'alarm' || status === 'verified'}};
  }
  PanelRegistry.define('security', {
    label:'Security monitoring', since:'0.1.0', render:render,
    presentation:{growing:true, ambientInitial:true},
    layout:{height:14, fallbackHeight:14, supporting:true, attachControls:true},
    validateDeclaration:function (panel, path, warnings) {
      ['site'].forEach(function (key) { if (panel[key] != null && typeof panel[key] !== 'string') warnings.push(path + '.' + key + ': expected text — ignored'); });
      panelCollectionWarnings(panel, path, warnings, 'sensors', 12, function (sensor, at) {
        if (!items({sensors:[sensor]}).length) warnings.push(at + '.id: use a unique letter-led ID; state fields and prototype names are reserved — ignored');
        ['label','zone'].forEach(function (key) { if (sensor[key] != null && typeof sensor[key] !== 'string') warnings.push(at + '.' + key + ': expected text — ignored'); });
        if (sensor.kind != null && kinds.indexOf(sensor.kind) < 0) warnings.push(at + '.kind: expected ' + kinds.join('|') + ' — using sensor');
      });
      clean(panel, panel.initial, path + '.initial', warnings, false);
    },
    validatePatch:function (patch, path, panel, warnings) { clean(panel, patch, path, warnings, true); },
    fold:function (panel, steps) { return foldSanitizedPanelStates(panel, steps, function (raw, once) { return clean(panel, raw, '', null, once); }); },
    authoring:{
      template:{title:'Security monitoring', site:'Oak House', sensors:[
        {id:'frontDoor',label:'Front door',kind:'door',zone:'Entrance'},
        {id:'doorbell',label:'Doorbell camera',kind:'camera',zone:'Porch'},
        {id:'hall',label:'Hall motion',kind:'motion',zone:'Hallway'}],
        initial:{status:'armed',operator:'Monitoring team',assessment:'unverified',
          frontDoor:{health:'online',alarm:'clear'},doorbell:{health:'online',alarm:'clear'},hall:{health:'online',alarm:'clear'}}},
      setupFields:[['site','text'],['sensors','rows',{cols:[{k:'id',req:true},{k:'label'},{k:'kind',kind:'enum',options:kinds},{k:'zone'}],max:12}],['initial','json']],
      patchFields:[['status','enum',statuses],['operator','text'],['incident','text'],['assessment','enum',assessments],['detail','text'],['note','text']],
      expandPatchFields:function (panel) {
        return PanelRegistry.get('security').authoring.patchFields.concat(items(panel).map(function (sensor) {
          return [sensor.id,'objf',[['health','enum',health],['alarm','enum',alarms],['detail','text']]];
        }));
      },
      origin:function (panel, key, snapshot, context) {
        return panelSanitizedOrigin(key, context, function (raw) { return clean(panel, raw, '', null, false); });
      },
      picker:{order:26,name:'Security monitoring',category:'Devices & interfaces',tagline:'From sensor signal to verified incident',
        description:'A monitoring console with sensor health, explicit alarms and an operator assessment. Pair with Emergency dispatch for the response.'},
      example:function (sample) {
        sample.state = {status:'reviewing',operator:'Alex · monitoring specialist',incident:'Front door opened while armed',assessment:'reviewing',detail:'Reviewing doorbell footage before escalation.',
          frontDoor:{health:'online',alarm:'triggered',detail:'Contact opened · entry zone'},doorbell:{health:'online',alarm:'clear',detail:'Evidence available'},hall:{health:'online',alarm:'clear'}};
        sample.panel.initial = JSON.parse(JSON.stringify(sample.state));
        return sample;
      }
    },
    styles:String.raw`
.secmon{--secmon-accent:#5578a5;--secmon-warn:#bc702a;--secmon-good:#358469;--secmon-bad:#bb5161;color:var(--dtext);min-width:0;container-type:inline-size;}
.secmon-alarm,.secmon-verified{--secmon-accent:var(--secmon-bad);}.secmon-reviewing{--secmon-accent:var(--secmon-warn);}.secmon-armed,.secmon-cleared{--secmon-accent:var(--secmon-good);}
.secmon-hero{display:flex;align-items:center;gap:13px;padding:14px;border-radius:15px;background:linear-gradient(125deg,color-mix(in srgb,var(--secmon-accent) 13%,transparent),color-mix(in srgb,var(--secmon-accent) 3%,transparent));border:1px solid color-mix(in srgb,var(--secmon-accent) 25%,transparent);}
.secmon-emblem{flex:none;display:grid;place-items:center;width:62px;height:66px;color:var(--secmon-accent);border-radius:18px;background:color-mix(in srgb,var(--secmon-accent) 8%,transparent);}.secmon-emblem svg{width:48px;height:48px;}.secmon-shield{fill:color-mix(in srgb,var(--secmon-accent) 8%,transparent);}
.secmon-headline{min-width:0;}.secmon-eyebrow{color:var(--dfaint);font:600 10px/1.5 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;}.secmon-status{color:var(--dink);font:600 20px/1.2 'IBM Plex Sans',sans-serif;margin:4px 0 7px;overflow-wrap:anywhere;}
.secmon-operator{font-size:11px;display:flex;align-items:center;gap:5px;}.secmon-operator-dot{width:5px;height:5px;border-radius:50%;background:var(--secmon-accent);flex:none;}
.secmon-metrics{display:grid;grid-template-columns:1fr 1fr;margin:12px 0;border:1px solid color-mix(in srgb,var(--dtext) 13%,transparent);border-radius:12px;}.secmon-metrics>div{padding:10px 14px;display:flex;align-items:center;gap:9px;}.secmon-metrics>div+div{border-left:1px solid color-mix(in srgb,var(--dtext) 13%,transparent);}.secmon-metrics strong{color:var(--dink);font:600 22px/1.1 'IBM Plex Sans',sans-serif;white-space:nowrap;}.secmon-metrics small{color:var(--dfaint);font-size:12px;font-weight:400;}.secmon-metrics span{font-size:10px;line-height:1.35;}
.secmon-assessment{padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--dtext) 4%,transparent);border-left:3px solid var(--secmon-accent);}.secmon-assessment-top{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:10px;}.secmon-assessment-top>span:first-child{font-weight:600;letter-spacing:.04em;text-transform:uppercase;}.secmon-assessment-badge{padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--dtext) 7%,transparent);border:1px solid color-mix(in srgb,var(--dtext) 15%,transparent);}.secmon-assessment-verified{color:var(--secmon-bad);}.secmon-assessment-false-alarm{color:var(--secmon-good);}.secmon-assessment strong{color:var(--dink);font-weight:600;line-height:1.45;}.secmon-assessment p{font-size:11px;margin:4px 0 0;line-height:1.5;}
.secmon-sensors{list-style:none;padding:0;margin:10px 0 0;}.secmon-sensor{display:flex;align-items:flex-start;gap:10px;padding:11px 2px;border-bottom:1px solid color-mix(in srgb,var(--dtext) 12%,transparent);}.secmon-sensor:last-child{border-bottom:0;}.secmon-sensor-icon{display:grid;place-items:center;flex:none;width:31px;height:34px;color:var(--dfaint);background:color-mix(in srgb,var(--dtext) 5%,transparent);border-radius:9px;}.secmon-sensor-icon svg{width:21px;height:21px;}.secmon-sensor-body{min-width:0;flex:1;}.secmon-sensor-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;}.secmon-sensor-head strong{color:var(--dink);font-size:12px;font-weight:600;}.secmon-alarm-label{font:500 10px/1.5 'IBM Plex Mono',monospace;color:var(--dfaint);}.secmon-alarm-triggered .secmon-alarm-label,.secmon-alarm-triggered .secmon-sensor-icon{color:var(--secmon-bad);}.secmon-alarm-triggered .secmon-sensor-icon{background:color-mix(in srgb,var(--secmon-bad) 10%,transparent);animation:secmon-attention 2.4s ease-in-out infinite;}.secmon-alarm-acknowledged .secmon-alarm-label{color:var(--secmon-warn);}
.secmon-sensor-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--dfaint);margin-top:2px;}.secmon-health{display:inline-flex;align-items:center;gap:4px;}.secmon-health i{display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor;}.secmon-health-online{color:var(--secmon-good);}.secmon-health-degraded{color:var(--secmon-warn);}.secmon-health-offline{color:var(--secmon-bad);}.secmon-sensor-detail{font-size:10.5px;margin-top:3px;line-height:1.45;}
@keyframes secmon-attention{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--secmon-bad) 8%,transparent);}}
@container(max-width:260px){.secmon-hero{gap:9px;padding:10px;}.secmon-emblem{width:43px;height:52px;}.secmon-emblem svg{width:37px;height:37px;}.secmon-status{font-size:17px;}.secmon-metrics>div{padding:9px;gap:5px;flex-wrap:wrap;}.secmon-metrics strong{font-size:19px;}.secmon-assessment{padding:10px;}}
.sk-aurora .secmon,.sk-terminal .secmon,.sk-blueprint .secmon{--secmon-good:#75c4a2;--secmon-warn:#e2b56e;--secmon-bad:#ec91a1;}
.sk-terminal .secmon-hero,.sk-terminal .secmon-assessment,.sk-terminal .secmon-metrics,.sk-blueprint .secmon-hero,.sk-blueprint .secmon-assessment,.sk-blueprint .secmon-metrics{border-radius:3px;}
@media(prefers-reduced-motion:reduce){.secmon *{animation:none!important;transition:none!important;}}
@media print{.secmon{--secmon-accent:#333!important;--secmon-good:#333!important;--secmon-warn:#333!important;--secmon-bad:#333!important;color:#222;}.secmon *{animation:none!important;transition:none!important;box-shadow:none!important;}.secmon-hero,.secmon-assessment{background:#fff;border:1px solid #999;}.secmon-sensor{break-inside:avoid;}}
`
  });
})();

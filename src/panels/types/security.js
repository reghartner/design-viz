/* Security monitoring is an authored assessment, never an automatic alarm rule. */
(function () {
  var statuses = ['unknown', 'disarmed', 'armed', 'alarm', 'reviewing', 'verified', 'cleared', 'offline'];
  var assessments = ['unverified', 'reviewing', 'verified', 'false-alarm'];
  var health = ['unknown', 'online', 'degraded', 'offline'];
  var alarms = ['unknown', 'clear', 'triggered', 'acknowledged'];
  var kinds = ['door', 'motion', 'camera', 'smoke', 'water', 'lock', 'sensor'];
  var videoStates = ['closed', 'opening', 'reviewing', 'unavailable'];
  var fields = {video:videoStates, scene:SCENE_NAMES, scenePlayback:['waiting','playing'], videoReason:'text', spotlight:SCREEN_SPOTLIGHTS, audio:'text', status:statuses, operator:'text', incident:'text', assessment:assessments, detail:'text', note:'text'};
  var sensorFields = {health:health, alarm:alarms, detail:'text'};
  var labels = {unknown:'Status unknown', disarmed:'Disarmed', armed:'Monitoring', alarm:'Alarm received',
    reviewing:'Operator reviewing', verified:'Incident verified', cleared:'All clear', offline:'Monitoring offline'};
  var assessmentLabels = {unverified:'Unverified', reviewing:'Under review', verified:'Verified', 'false-alarm':'False alarm'};
  function items(panel) { return panelOperationalItems(panel, 'sensors', 12, fields); }
  function clean(panel, raw, path, warnings, once) {
    if (!panelObject(raw)) return panelOperationalSnapshot(raw, fields, items(panel), sensorFields, path, warnings, once);
    var base = Object.assign({}, raw);
    delete base.audio; delete base.enterOnce;
    var out = panelOperationalSnapshot(base, fields, items(panel), sensorFields, path, warnings, false);
    if (panelOwn(raw, 'audio')) {
      var audio = FlowAudio.clean(raw.audio, path + '.audio', warnings);
      if (audio !== undefined) out.audio = audio;
    }
    if (once && panelOwn(raw, 'enterOnce')) {
      if (panelObject(raw.enterOnce)) out.enterOnce = clean(panel, raw.enterOnce, path + '.enterOnce', warnings, false);
      else if (warnings) warnings.push(path + '.enterOnce: expected a state object — ignored');
    } else if (panelOwn(raw, 'enterOnce') && warnings) warnings.push(path + '.enterOnce: unknown field or declared item ID — ignored');
    return out;
  }
  function text(value) { return typeof value === 'string' ? value : ''; }
  function icon(kind, alarm) {
    return FlowIcons.render(kinds.indexOf(kind) >= 0 ? kind : 'sensor',
      {tone:alarm === 'triggered' ? 'alert' : alarm === 'acknowledged' ? 'warn' : undefined});
  }
  /* The same camera renderer/stock clip library serves this large monitor and
     Camera Screen panels. Video review is an explicit fact, independent of the
     assessment: opening a feed never verifies an incident. */
  function videoModel(panel, state) {
    var video = state.video || 'closed', scene = state.scene || panel.scene;
    if (SCENE_NAMES.indexOf(scene) < 0) scene = 'static-noise';
    var modes = {closed:'off', opening:'boot', reviewing:'active', unavailable:'unavailable'};
    return {video:video, panel:{scene:scene}, state:{mode:modes[video], scenePlayback:state.scenePlayback,
      spotlight:state.spotlight, reason:state.videoReason || 'The operator cannot reach this camera.'}};
  }
  function audioClass(audio) {
    var model = FlowAudio.model(audio);
    return (FlowAudio.isCapturing(audio) ? ' secmon-audio-speaking' : '') +
      (FlowAudio.isEmitting(audio) ? ' secmon-audio-listening' : '') +
      (model.microphone === 'muted' ? ' secmon-audio-muted' : '') +
      (model.microphone === 'unavailable' ? ' secmon-audio-mic-unavailable' : '') +
      (model.microphone === 'unavailable' || model.playback === 'failed' || model.connection === 'interrupted' ? ' secmon-audio-failed' : '');
  }
  function operatorAudio(audio) {
    var strip = FlowAudio.render(audio, {label:'Operator headset'});
    if (!strip) return '';
    var speaking = FlowAudio.isCapturing(audio), hearing = FlowAudio.isEmitting(audio);
    var model = FlowAudio.model(audio), action = speaking && hearing ? 'Speaking and hearing remote audio' :
      speaking ? 'Operator speaking to camera' : hearing ? 'Operator hearing remote audio' :
      model.microphone === 'muted' ? 'Operator microphone muted' :
      model.microphone === 'unavailable' ? 'Operator microphone unavailable' :
      model.connection === 'interrupted' || model.playback === 'failed' ? 'Headset audio interrupted' :
      model.microphone === 'listening' ? 'Operator microphone ready' : 'Operator audio';
    return '<div class="secmon-audio"><div class="secmon-audio-action"><span class="secmon-audio-dot" aria-hidden="true"></span>' + action + '</div>' + strip + '</div>';
  }
  function operatorArtwork() {
    return '<svg class="secmon-operator-figure" viewBox="0 0 170 214" aria-hidden="true">' +
      '<ellipse cx="85" cy="205" rx="75" ry="7" fill="#091827" opacity=".28"/>' +
      /* Chair behind the operator, then face and headset in profile. */
      '<path d="M38 130Q31 108 46 97H76Q91 104 90 133L96 173H43Z" fill="#263D5B" stroke="#547492" stroke-width="3"/>' +
      '<path d="M68 170V199M38 204L68 197L104 204" fill="none" stroke="#213951" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M68 120Q89 127 95 162L102 192H80L69 165L49 159Z" fill="#344467"/>' +
      '<path d="M81 190H104Q118 196 110 202H81Z" fill="#14273C"/>' +
      '<path d="M51 170L53 192H36L30 162Z" fill="#405578"/>' +
      '<path d="M34 190H55V202H24Q17 196 34 190" fill="#152B41"/>' +
      '<path d="M51 90Q35 94 32 115L30 160Q51 174 82 158L82 112Q73 92 64 90" fill="#60ADBD"/>' +
      '<path d="M51 91L67 100L64 111L46 95Z" fill="#B0D7DB"/>' +
      '<path d="M56 76V95Q64 101 73 94L70 73" fill="#BC896F"/>' +
      '<path d="M43 49Q45 26 68 30Q86 33 84 49L88 61L84 66V78Q80 90 68 86L51 77Z" fill="#E5B797"/>' +
      '<path d="M42 63Q32 58 37 41Q44 17 67 24Q82 20 89 39L83 50L73 41Q62 51 49 49L48 68Z" fill="#26364B"/>' +
      '<circle cx="77" cy="58" r="2" fill="#26364B"/><ellipse class="secmon-mouth" cx="81" cy="75" rx="3" ry="1" fill="#8E5B51"/>' +
      '<path d="M40 57V43Q43 21 63 24Q84 25 85 45" fill="none" stroke="#9EDDEC" stroke-width="5"/>' +
      '<rect class="secmon-headset-ear" x="38" y="49" width="12" height="25" rx="6" fill="#243C55" stroke="#ACDDE7" stroke-width="3"/>' +
      '<path d="M47 68Q59 81 80 80" fill="none" stroke="#ABDCE5" stroke-width="3" stroke-linecap="round"/>' +
      '<rect x="77" y="76" width="9" height="6" rx="3" fill="#D8F6EE"/>' +
      '<circle class="secmon-mic-led" cx="82" cy="79" r="2" fill="#536F82"/>' +
      '<g class="secmon-speech-waves" fill="none" stroke="#B6FFE7" stroke-width="2.6" stroke-linecap="round"><path d="M96 68Q103 76 96 84"/><path d="M105 62Q116 76 105 90"/><path d="M115 56Q130 76 115 96"/></g>' +
      '<g class="secmon-listen-waves" fill="none" stroke="#9CDBFF" stroke-width="2.6" stroke-linecap="round"><path d="M30 48Q22 61 30 73"/><path d="M21 41Q9 61 21 81"/></g>' +
      '<path class="secmon-mic-slash" d="M73 71L91 87" stroke="#FFB8AA" stroke-width="3" stroke-linecap="round"/>' +
      '<g class="secmon-control-arm"><path d="M67 106L83 137L122 129" fill="none" stroke="#3F91A5" stroke-width="16" stroke-linecap="round"/>' +
      '<path d="M117 130L133 129" stroke="#E5B797" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M132 123L137 127L148 128" fill="none" stroke="#E5B797" stroke-width="4" stroke-linecap="round"/></g>' +
      '</svg>';
  }
  function stageHTML(panel, state, model) {
    return '<div class="secmon-stage secmon-review-' + model.video + audioClass(state.audio) + '">' +
      '<div class="secmon-stage-top"><span class="secmon-desk-brand">' + (FlowBrand.render(panel.brand) || 'Monitoring desk') + '</span><span class="secmon-room-signal"><i></i>SIMULATED VIDEO</span></div>' +
      '<div class="secmon-workstation"><div class="secmon-room-grid" aria-hidden="true"></div>' +
      '<div class="secmon-monitor"><div class="secmon-monitor-title"><i aria-hidden="true"></i><span class="secmon-feed-label">' + esc(text(panel.videoLabel) || 'Incident camera') + '</span></div>' +
      '<div class="secmon-video" role="img" aria-label="' + esc(videoDescription(model)) + '">' + screenFramePresentation({}, model.panel, model.state).html + '</div>' +
      '<div class="secmon-monitor-footer" aria-hidden="true"><span></span><i></i><i></i><i></i></div><div class="secmon-monitor-stand" aria-hidden="true"></div></div>' +
      '<div class="secmon-desk" aria-hidden="true"><span></span></div>' + operatorArtwork() +
      '<div class="secmon-desk-mouse" aria-hidden="true"></div></div>' +
      '<div class="secmon-review-caption"><span class="secmon-review-indicator" aria-hidden="true"></span><strong>' + reviewLabel(model.video) + '</strong><span class="secmon-review-clip">' + esc(clipLabel(model)) + '</span></div>' +
      '<div class="secmon-audio-slot">' + operatorAudio(state.audio) + '</div></div>';
  }
  function reviewLabel(video) {
    return {closed:'Ready for review', opening:'Opening camera…', reviewing:'Reviewing footage', unavailable:'Video connection lost'}[video];
  }
  function clipLabel(model) {
    if (model.video === 'closed') return 'No video open';
    if (model.video === 'opening') return 'Connecting to incident clip';
    if (model.video === 'unavailable') return 'Assessment needs another source';
    return SCENE_LABELS[model.panel.scene] || SCENE_LABELS['static-noise'];
  }
  function videoDescription(model) {
    return reviewLabel(model.video) + '. ' + clipLabel(model) + '. Simulated camera clip.';
  }
  function render(host, panel, raw) {
    var state = clean(panel, raw, '', null, false), status = state.status || 'unknown';
    var sensorList = items(panel), online = 0, triggered = 0;
    var rows = sensorList.map(function (sensor) {
      var value = panelObject(state[sensor.id]) ? state[sensor.id] : {};
      var h = value.health || 'unknown', alarm = value.alarm || 'unknown';
      if (h === 'online') online++;
      if (alarm === 'triggered') triggered++;
      return '<li class="secmon-sensor secmon-alarm-' + alarm + '" data-sensor-id="' + esc(sensor.id) + '"><span class="secmon-sensor-icon">' + icon(sensor.kind, alarm) +
        '</span><div class="secmon-sensor-body"><div class="secmon-sensor-head"><strong>' + esc(text(sensor.label) || sensor.id) +
        '</strong><span class="secmon-alarm-label">' + (alarm === 'unknown' ? 'Not assessed' : alarm === 'triggered' ? 'Alarm' : alarm === 'acknowledged' ? 'Acknowledged' : 'Clear') + '</span></div>' +
        '<div class="secmon-sensor-meta"><span class="secmon-health secmon-health-' + h + '"><i aria-hidden="true"></i>' + h + '</span>' +
        (text(sensor.zone) ? '<span>' + esc(sensor.zone) + '</span>' : '') + '</div>' +
        (value.detail ? '<div class="secmon-sensor-detail">' + esc(value.detail) + '</div>' : '') + '</div></li>';
    }).join('');
    var hero = '<div class="secmon-hero">' +
      '<div class="secmon-emblem">' + FlowIcons.render(
        status === 'alarm' || status === 'verified' ? 'triggered' : status === 'disarmed' ? 'disarmed' :
          status === 'offline' ? 'cloud-off' : status === 'reviewing' || status === 'unknown' ? 'monitor' : 'armed',
        {tone:status === 'alarm' || status === 'verified' ? 'alert' : status === 'reviewing' ? 'warn' :
          status === 'offline' || status === 'unknown' || status === 'disarmed' ? 'muted' : 'ok'}) + '</div>' +
      '<div class="secmon-headline"><div class="secmon-eyebrow">' + esc(text(panel.site) || 'Security monitoring') + '</div><div class="secmon-status">' + labels[status] + '</div>' +
      '<div class="secmon-operator"><span class="secmon-operator-dot" aria-hidden="true"></span>' + esc(state.operator || 'No operator assigned') + '</div></div></div>';
    var facts = '<div class="secmon-metrics"><div><strong>' + online + '<small> / ' + sensorList.length + '</small></strong><span>Sensors online</span></div>' +
      '<div><strong>' + triggered + '</strong><span>Active alarms</span></div></div>' +
      '<div class="secmon-assessment"><div class="secmon-assessment-top"><span>Incident assessment</span><span class="secmon-assessment-badge secmon-assessment-' + (state.assessment || 'unverified') + '">' + assessmentLabels[state.assessment || 'unverified'] + '</span></div>' +
      '<strong>' + esc(state.incident || 'No incident recorded') + '</strong><p>' + esc(state.detail || 'Awaiting an authored assessment.') + '</p></div>' +
      '<details class="secmon-sensor-details"><summary>Sensor detail <span>' + sensorList.length + ' sources · ' + triggered + ' alarms</span></summary>' +
      '<ul class="secmon-sensors" aria-label="Monitored sensors">' + rows + '</ul>' +
      (!sensorList.length ? '<div class="swempty">No sensors configured</div>' : '') + '</details>';
    var model = videoModel(panel, state), note = state.note ? '<div class="swnote">' + esc(state.note) + '</div>' : '', audio = operatorAudio(state.audio);
    var h = '<div class="secmon secmon-' + status + '"><div class="secmon-hero-slot">' + hero + '</div>' + stageHTML(panel, state, model) +
      '<div class="secmon-facts">' + facts + '</div><div class="secmon-note">' + note + '</div></div>';
    function updateFrame(videoHost) {
      /* Nest the shared Screen presentation, without starting another lifecycle
         or timer. Only modes/overlays change while the clip remains the same. */
      var frame = screenFramePresentation(videoHost, model.panel, model.state);
      if (videoHost._lastHTML !== frame.html) {
        if (!frame.patch()) videoHost.innerHTML = frame.html;
        videoHost._lastHTML = frame.html;
      }
      videoHost.setAttribute('aria-label', videoDescription(model));
    }
    return {html:softwarePanelShell(h, {}),
      patch:function () {
        var root = host.querySelector('.secmon'), stage = host.querySelector('.secmon-stage'), videoHost = host.querySelector('.secmon-video');
        if (!root || !stage || !videoHost || host._secmonHero == null) return false;
        root.className = 'secmon secmon-' + status;
        stage.className = 'secmon-stage secmon-review-' + model.video + audioClass(state.audio);
        host.querySelector('.secmon-desk-brand').innerHTML = FlowBrand.render(panel.brand) || 'Monitoring desk';
        if (host._secmonAudio !== audio) host.querySelector('.secmon-audio-slot').innerHTML = audio;
        if (host._secmonHero !== hero) host.querySelector('.secmon-hero-slot').innerHTML = hero;
        if (host._secmonFacts !== facts) {
          var details = host.querySelector('.secmon-sensor-details'), wasOpen = details && details.open;
          host.querySelector('.secmon-facts').innerHTML = facts;
          host.querySelector('.secmon-sensor-details').open = !!wasOpen;
        }
        if (host._secmonNote !== note) host.querySelector('.secmon-note').innerHTML = note;
        host.querySelector('.secmon-feed-label').textContent = text(panel.videoLabel) || 'Incident camera';
        host.querySelector('.secmon-review-caption strong').textContent = reviewLabel(model.video);
        host.querySelector('.secmon-review-clip').textContent = clipLabel(model);
        updateFrame(videoHost);
        return true;
      },
      mounted:function () {
        host._secmonHero = hero; host._secmonFacts = facts; host._secmonNote = note; host._secmonAudio = audio;
        var videoHost = host.querySelector('.secmon-video');
        if (videoHost && videoHost._lastHTML == null) {
          var frame = screenFramePresentation(videoHost, model.panel, model.state);
          frame.patch(); videoHost._lastHTML = frame.html;
        }
      },
      pulse:{selector:'.secmon-emblem', changed:status === 'alarm' || status === 'verified'}};
  }
  PanelRegistry.define('security', {
    label:'Security monitoring', since:'0.1.0', render:render,
    presentation:{growing:true, ambientInitial:true},
    layout:{height:14, fallbackHeight:14, supporting:true, attachControls:true},
    validateDeclaration:function (panel, path, warnings) {
      ['site','videoLabel'].forEach(function (key) { if (panel[key] != null && typeof panel[key] !== 'string') warnings.push(path + '.' + key + ': expected text — ignored'); });
      if (panel.scene != null && SCENE_NAMES.indexOf(panel.scene) < 0) warnings.push(path + '.scene: unknown camera clip — using static-noise');
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
      branding:true,
      template:{title:'Security monitoring', site:'Oak House', scene:'person-through-door', videoLabel:'Front door · incident camera', sensors:[
        {id:'frontDoor',label:'Front door',kind:'door',zone:'Entrance'},
        {id:'doorbell',label:'Doorbell camera',kind:'camera',zone:'Porch'},
        {id:'hall',label:'Hall motion',kind:'motion',zone:'Hallway'}],
        initial:{status:'armed',operator:'Monitoring team',assessment:'unverified',video:'closed',scenePlayback:'waiting',
          frontDoor:{health:'online',alarm:'clear'},doorbell:{health:'online',alarm:'clear'},hall:{health:'online',alarm:'clear'}}},
      setupFields:[['site','text'],['scene','scene'],['videoLabel','text'],['sensors','rows',{cols:[{k:'id',req:true},{k:'label'},{k:'kind',kind:'enum',options:kinds},{k:'zone'}],max:12}],['initial','json']],
      patchFields:[['video','enum',videoStates],['scene','enum',SCENE_NAMES],['scenePlayback','enum',['waiting','playing']],['videoReason','text'],['audio','objf',FlowAudio.fields],['spotlight','enum',SCREEN_SPOTLIGHTS],['status','enum',statuses],['operator','text'],['incident','text'],['assessment','enum',assessments],['detail','text'],['note','text']],
      expandPatchFields:function (panel) {
        return PanelRegistry.get('security').authoring.patchFields.concat(items(panel).map(function (sensor) {
          return [sensor.id,'objf',[['health','enum',health],['alarm','enum',alarms],['detail','text']]];
        }));
      },
      origin:function (panel, key, snapshot, context) {
        return panelSanitizedOrigin(key, context, function (raw) { return clean(panel, raw, '', null, false); });
      },
      picker:{order:26,name:'Security monitoring',category:'Devices & interfaces',tagline:'From sensor signal to verified incident',
        description:'An operator reviews animated camera clips, speaks into a headset and hears remote audio. Author video, audio, spotlight, assessment and sensor facts independently.'},
      example:function (sample) {
        sample.state = {video:'reviewing',scenePlayback:'playing',status:'reviewing',operator:'Alex · monitoring specialist',incident:'Front door opened while armed',assessment:'reviewing',detail:'Reviewing doorbell footage before escalation.',
          frontDoor:{health:'online',alarm:'triggered',detail:'Contact opened · entry zone'},doorbell:{health:'online',alarm:'clear',detail:'Evidence available'},hall:{health:'online',alarm:'clear'}};
        sample.panel.initial = JSON.parse(JSON.stringify(sample.state));
        return sample;
      }
    },
    styles:String.raw`
.secmon{--secmon-accent:#5578a5;--secmon-warn:#bc702a;--secmon-good:#358469;--secmon-bad:#bb5161;color:var(--dtext);min-width:0;container-type:inline-size;}
/* A compact control room: the camera is the main canvas; the operator and desk
   establish who is acting on it. Scene artwork/animation remains Screen-owned. */
.secmon-stage{margin:10px 0 0;border-radius:17px;background:linear-gradient(135deg,#1B3149,#263C58 58%,#1D3048);color:#D9E8F1;overflow:hidden;border:1px solid #3A536A;box-shadow:inset 0 1px 0 #5F778344;}
.secmon-stage-top{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 14px 0;font:600 9px/1.4 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.09em;color:#9EB8CC;}
.secmon-room-signal{font-size:7px;letter-spacing:.04em;white-space:nowrap;display:flex;gap:5px;align-items:center;}.secmon-room-signal i{width:4px;height:4px;border-radius:50%;background:#76BBC5;}
.secmon-workstation{position:relative;aspect-ratio:1.55;isolation:isolate;overflow:hidden;margin:0 8px;}
.secmon-room-grid{position:absolute;inset:5% 0 22%;opacity:.21;background:linear-gradient(90deg,transparent 49.5%,#91C3D4 50%,transparent 50.5%) 0 0/42px 100%,linear-gradient(transparent 49%,#91C3D4 50%,transparent 51%) 0 0/100% 36px;}
.secmon-monitor{position:absolute;left:26%;top:8%;width:70%;border:4px solid #11253C;border-radius:9px;background:#11253C;box-shadow:0 5px 22px #08152077;box-sizing:border-box;}
.secmon-monitor-title{display:flex;align-items:center;gap:5px;padding:4px 4px 7px;color:#C2D8E5;font:500 8px/1.3 'IBM Plex Sans',sans-serif;min-width:0;}.secmon-feed-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.secmon-monitor-title>i{width:4px;height:4px;flex:none;border-radius:50%;background:#7FC5B2;}
.secmon-video{min-width:0;}.secmon-video .screenbox{border-radius:4px;}.secmon-video .screenbox .activechip{font-size:7px;left:6px;top:6px;}.secmon-video .offlabel{font:600 10px 'IBM Plex Mono',monospace;color:#94AEBB;letter-spacing:.12em;}
.secmon-video .screen-unavailable{padding:8px;gap:4px;}.secmon-video .screen-unavailable svg{width:28px;height:22px;}.secmon-video .screen-unavailable strong{font-size:11px;}.secmon-video .screen-unavailable span{font-size:9px;line-height:1.25;}
.secmon-monitor-footer{display:flex;justify-content:flex-end;gap:3px;align-items:center;height:12px;padding:0 5px;}.secmon-monitor-footer>span{height:2px;width:19px;margin-right:auto;background:#536C83;border-radius:2px;}.secmon-monitor-footer>i{height:3px;width:3px;border-radius:50%;background:#465D75;}.secmon-monitor-footer>i:last-child{background:#79C7B6;}
.secmon-monitor-stand{position:absolute;z-index:-1;top:100%;left:43%;height:16%;width:17%;background:linear-gradient(90deg,#34516B,#678BA0,#34516B);clip-path:polygon(30% 0,70% 0,75% 77%,100% 84%,100% 100%,0 100%,0 84%,25% 77%);}
.secmon-desk{position:absolute;z-index:1;left:4%;right:1%;height:7px;bottom:19%;border-radius:3px;background:#8CA2B4;box-shadow:0 4px 0 #173047;}.secmon-desk:before,.secmon-desk:after{content:'';position:absolute;top:7px;width:5px;height:39px;background:#456078;}.secmon-desk:before{left:12%;}.secmon-desk:after{right:12%;}.secmon-desk>span{position:absolute;width:21%;height:5px;bottom:7px;left:53%;border:1px solid #7490A5;transform:skewX(-22deg);background:repeating-linear-gradient(90deg,#435D77 0 6px,#7893A8 6px 7px);border-radius:2px;}
.secmon-operator-figure{position:absolute;z-index:2;left:1%;bottom:0;width:37%;height:91%;overflow:visible;}.secmon-desk-mouse{position:absolute;z-index:1;width:3.5%;height:5px;left:33%;bottom:calc(19% + 7px);background:#C2D7DF;border-radius:80% 80% 20% 20%;}
.secmon-speech-waves,.secmon-listen-waves,.secmon-mic-slash{display:none;}.secmon-mouth{transform-origin:81px 75px;}
.secmon-audio-speaking .secmon-speech-waves,.secmon-audio-listening .secmon-listen-waves{display:block;}.secmon-audio-speaking .secmon-mouth{animation:secmon-speaking .34s ease-in-out infinite alternate;}.secmon-audio-speaking .secmon-mic-led{fill:#9FFFD6;filter:drop-shadow(0 0 3px #9FFFD6);}
.secmon-speech-waves path,.secmon-listen-waves path{animation:secmon-audio-wave 1.4s ease-in-out infinite;}.secmon-speech-waves path:nth-child(2),.secmon-listen-waves path:nth-child(2){animation-delay:.2s;}.secmon-speech-waves path:nth-child(3){animation-delay:.4s;}
.secmon-audio-muted .secmon-mic-slash,.secmon-audio-mic-unavailable .secmon-mic-slash{display:block;}.secmon-audio-muted .secmon-mic-led,.secmon-audio-mic-unavailable .secmon-mic-led{fill:#FFB8AA;}.secmon-audio-failed .secmon-headset-ear{stroke:#FFB8AA;}
.secmon-audio-slot:empty{display:none;}.secmon-audio{padding:10px 12px 12px;border-top:1px solid #7593A633;background:#0D213855;--dink:#E5F4FA;--dtext:#BED4E1;--dfaint:#A5C0CF;}
.secmon-audio-action{display:flex;align-items:center;gap:6px;margin-bottom:7px;color:#D2EAF3;font:600 10px/1.4 'IBM Plex Sans',sans-serif;}.secmon-audio-dot{width:5px;height:5px;border-radius:50%;background:#9CB8CA;}.secmon-audio-speaking .secmon-audio-dot{background:#9FFFD6;}.secmon-audio-listening .secmon-audio-action{color:#B9E4FF;}.secmon-audio-failed .secmon-audio-dot{background:#FFB8AA;}
.secmon-video .screen-light-label{font-size:6px;right:4px;bottom:4px;padding:2px 4px;}
@keyframes secmon-speaking{to{transform:scaleY(3);}}
@keyframes secmon-audio-wave{0%,100%{opacity:.35;}45%{opacity:1;}}
.secmon-review-caption{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:9px 13px 11px;background:#0D213888;border-top:1px solid #69859A22;}.secmon-review-caption strong{font:600 10px 'IBM Plex Sans',sans-serif;}.secmon-review-clip{font:400 9px 'IBM Plex Sans',sans-serif;color:#9EBBCC;margin-left:auto;}.secmon-review-indicator{width:5px;height:5px;flex:none;border-radius:50%;background:#8197AB;}
.secmon-review-opening .secmon-review-indicator{background:#EAC481;animation:secmon-connect 1.6s ease-in-out infinite;}.secmon-review-reviewing .secmon-review-indicator{background:#8CDBBC;}.secmon-review-unavailable .secmon-review-indicator{background:#F2A3A5;}.secmon-review-unavailable .secmon-monitor-title>i{background:#F2A3A5;}.secmon-review-closed .secmon-monitor-title>i{background:#738997;}
.secmon-control-arm{transform-origin:67px 106px;}.secmon-review-opening .secmon-control-arm{animation:secmon-console-reach .95s ease-out both;}.secmon-review-reviewing .secmon-monitor{box-shadow:0 5px 22px #08152077,0 0 30px #7DCAD615;}
@keyframes secmon-console-reach{0%{transform:rotate(-8deg);}60%{transform:rotate(4deg);}100%{transform:rotate(0);}}
@keyframes secmon-connect{50%{opacity:.3;}}
.secmon-sensor-details{margin-top:9px;border-top:1px solid color-mix(in srgb,var(--dtext) 13%,transparent);}.secmon-sensor-details summary{cursor:pointer;padding:10px 2px 2px;font-size:10px;font-weight:600;color:var(--dtext);}.secmon-sensor-details summary:focus-visible{outline:2px solid var(--secmon-accent);outline-offset:3px;}.secmon-sensor-details summary>span{margin-left:8px;font-weight:400;color:var(--dfaint);}
.secmon-alarm,.secmon-verified{--secmon-accent:var(--secmon-bad);}.secmon-reviewing{--secmon-accent:var(--secmon-warn);}.secmon-armed,.secmon-cleared{--secmon-accent:var(--secmon-good);}
.secmon-hero{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:15px;background:linear-gradient(125deg,color-mix(in srgb,var(--secmon-accent) 13%,transparent),color-mix(in srgb,var(--secmon-accent) 3%,transparent));border:1px solid color-mix(in srgb,var(--secmon-accent) 25%,transparent);}
.secmon-emblem{flex:none;display:grid;place-items:center;width:42px;height:45px;color:var(--secmon-accent);border-radius:18px;background:color-mix(in srgb,var(--secmon-accent) 8%,transparent);}.secmon-emblem svg{width:35px;height:35px;}.secmon-shield{fill:color-mix(in srgb,var(--secmon-accent) 8%,transparent);}
.secmon-headline{min-width:0;}.secmon-eyebrow{color:var(--dfaint);font:600 10px/1.5 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;}.secmon-status{color:var(--dink);font:600 18px/1.2 'IBM Plex Sans',sans-serif;margin:2px 0 4px;overflow-wrap:anywhere;}
.secmon-operator{font-size:11px;display:flex;align-items:center;gap:5px;}.secmon-operator-dot{width:5px;height:5px;border-radius:50%;background:var(--secmon-accent);flex:none;}
.secmon-metrics{display:grid;grid-template-columns:1fr 1fr;margin:9px 0;border:1px solid color-mix(in srgb,var(--dtext) 13%,transparent);border-radius:12px;}.secmon-metrics>div{padding:7px 12px;display:flex;align-items:center;gap:9px;}.secmon-metrics>div+div{border-left:1px solid color-mix(in srgb,var(--dtext) 13%,transparent);}.secmon-metrics strong{color:var(--dink);font:600 18px/1.1 'IBM Plex Sans',sans-serif;white-space:nowrap;}.secmon-metrics small{color:var(--dfaint);font-size:12px;font-weight:400;}.secmon-metrics span{font-size:10px;line-height:1.35;}
.secmon-assessment{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--dtext) 4%,transparent);border-left:3px solid var(--secmon-accent);}.secmon-assessment-top{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:10px;}.secmon-assessment-top>span:first-child{font-weight:600;letter-spacing:.04em;text-transform:uppercase;}.secmon-assessment-badge{padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--dtext) 7%,transparent);border:1px solid color-mix(in srgb,var(--dtext) 15%,transparent);}.secmon-assessment-verified{color:var(--secmon-bad);}.secmon-assessment-false-alarm{color:var(--secmon-good);}.secmon-assessment strong{color:var(--dink);font-weight:600;line-height:1.45;}.secmon-assessment p{font-size:11px;margin:4px 0 0;line-height:1.5;}
.secmon-sensors{list-style:none;padding:0;margin:10px 0 0;}.secmon-sensor{display:flex;align-items:flex-start;gap:10px;padding:11px 2px;border-bottom:1px solid color-mix(in srgb,var(--dtext) 12%,transparent);}.secmon-sensor:last-child{border-bottom:0;}.secmon-sensor-icon{display:grid;place-items:center;flex:none;width:31px;height:34px;color:var(--dfaint);background:color-mix(in srgb,var(--dtext) 5%,transparent);border-radius:9px;}.secmon-sensor-icon svg{width:21px;height:21px;}.secmon-sensor-body{min-width:0;flex:1;}.secmon-sensor-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;}.secmon-sensor-head strong{color:var(--dink);font-size:12px;font-weight:600;}.secmon-alarm-label{font:500 10px/1.5 'IBM Plex Mono',monospace;color:var(--dfaint);}.secmon-alarm-triggered .secmon-alarm-label,.secmon-alarm-triggered .secmon-sensor-icon{color:var(--secmon-bad);}.secmon-alarm-triggered .secmon-sensor-icon{background:color-mix(in srgb,var(--secmon-bad) 10%,transparent);animation:secmon-attention 2.4s ease-in-out infinite;}.secmon-alarm-acknowledged .secmon-alarm-label{color:var(--secmon-warn);}
.secmon-sensor-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--dfaint);margin-top:2px;}.secmon-health{display:inline-flex;align-items:center;gap:4px;}.secmon-health i{display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor;}.secmon-health-online{color:var(--secmon-good);}.secmon-health-degraded{color:var(--secmon-warn);}.secmon-health-offline{color:var(--secmon-bad);}.secmon-sensor-detail{font-size:10.5px;margin-top:3px;line-height:1.45;}
@keyframes secmon-attention{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--secmon-bad) 8%,transparent);}}
@container(max-width:260px){.secmon-stage-top{font-size:7px;padding:9px 9px 0;}.secmon-room-signal{font-size:6px;}.secmon-monitor{border-width:3px;}.secmon-monitor-title{padding:2px 3px 4px;font-size:7px;}.secmon-review-caption{padding:7px 9px;}.secmon-review-clip{width:100%;margin-left:11px;}.secmon-video .screen-unavailable span{display:none;}.secmon-video .screen-unavailable strong{font-size:9px;}.secmon-video .screen-unavailable svg{height:17px;}.secmon-monitor-footer{height:8px;}.secmon-hero{gap:9px;padding:10px;}.secmon-emblem{width:43px;height:52px;}.secmon-emblem svg{width:37px;height:37px;}.secmon-status{font-size:17px;}.secmon-metrics>div{padding:9px;gap:5px;flex-wrap:wrap;}.secmon-metrics strong{font-size:19px;}.secmon-assessment{padding:10px;}}
.sk-aurora .secmon,.sk-terminal .secmon,.sk-blueprint .secmon{--secmon-good:#75c4a2;--secmon-warn:#e2b56e;--secmon-bad:#ec91a1;}
.sk-terminal .secmon-hero,.sk-terminal .secmon-assessment,.sk-terminal .secmon-metrics,.sk-blueprint .secmon-hero,.sk-blueprint .secmon-assessment,.sk-blueprint .secmon-metrics{border-radius:3px;}
@media(prefers-reduced-motion:reduce){.secmon *{animation:none!important;transition:none!important;}}
@media print{.secmon{--secmon-accent:#333!important;--secmon-good:#333!important;--secmon-warn:#333!important;--secmon-bad:#333!important;color:#222;}.secmon *{animation:none!important;transition:none!important;box-shadow:none!important;}.secmon-hero,.secmon-assessment{background:#fff;border:1px solid #999;}.secmon-stage{print-color-adjust:exact;break-inside:avoid;}.secmon-sensor{break-inside:avoid;}}
`
  });
})();

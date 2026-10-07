/* A silent, authored doorbell chime. Playback is independent of other panels. */
(function () {
  var playback = ['stopped', 'playing'];
  function clean(raw, path, warnings, once) {
    var out = Object.create(null);
    function warn(key, message) { if (warnings) warnings.push(path + key + ': ' + message + ' — ignored'); }
    if (raw == null) return out;
    if (!panelObject(raw)) { warn('', 'expected a state object'); return out; }
    Object.keys(raw).forEach(function (key) {
      var value = raw[key];
      if (key === 'playback') {
        if (playback.indexOf(value) >= 0) out.playback = value;
        else warn('.playback', 'expected stopped|playing');
      } else if (key === 'text') {
        if (value === null || typeof value === 'string') out.text = value;
        else warn('.text', 'expected text or null');
      } else if (key === 'enterOnce' && once) {
        if (panelObject(value)) out.enterOnce = clean(value, path + '.enterOnce', warnings, false);
        else warn('.enterOnce', 'expected a state object');
      } else warn('.' + key, 'unknown chime field');
    });
    return out;
  }
  PanelRegistry.define('chime', {
    label: 'Doorbell chime',
    since: '0.2.0',
    validateDeclaration: function (panel, path, warnings) { clean(panel.initial, path + '.initial', warnings, false); },
    validatePatch: function (patch, path, panel, warnings) { clean(patch, path, warnings, true); },
    fold: function (panel, steps) {
      return foldSanitizedPanelStates(panel, steps, function (raw, once) { return clean(raw, '', null, once); });
    },
    render: function (host, panel, state, skin, states, stepIndex, animate) {
      var playing = state.playback === 'playing';
      var text = typeof state.text === 'string' ? state.text : playing ? 'Someone is at the door.' : 'Waiting for the next ring.';
      var html = '<div class="chime-panel' + (playing ? ' chime-playing' : '') + (playing && animate ? ' chime-motion' : '') + '" data-playback="' + (playing ? 'playing' : 'stopped') + '">';
      html += '<div class="chime-device" aria-hidden="true">' + FlowIcons.render('chime', {className:'chime-icon',tone:playing ? 'ok' : 'muted'}) +
        '<span class="chime-bars"><i></i><i></i><i></i><i></i><i></i></span></div>';
      html += '<div class="chime-copy"><div class="chime-status" role="status"><span class="chime-dot" aria-hidden="true"></span>' + (playing ? 'Playing' : 'Not playing') + '</div>';
      if (text) html += '<p class="chime-text">' + esc(text) + '</p>';
      return {html:html + '</div></div>'};
    },
    presentation: {ambientInitial:true},
    layout: {height:7, fallbackHeight:7, supporting:true, attachControls:true,
      canvasSizing:{mode:'content-fit',resizeAxis:'width'},
      sectionSizing:{minWidth:220,preferredWidth:300,maxWidth:480,aspectPolicy:'content',grow:1}},
    authoring: {
      template:{title:'Doorbell chime',initial:{playback:'stopped'}},
      initialFields:true,
      transientFields:['playback','text'],
      setupFields:[['initial','json']],
      patchFields:[['playback','enum',playback],['text','text']],
      fieldMeta:{
        playback:{label:'Playback',help:'Show the chime playing or stopped. This visualization is silent.'},
        text:{label:'Message',help:'Text beside the chime. An empty string hides the message.',nullLabel:'Use the default message'}
      },
      origin:function (panel, key, snapshot, context) { return panelSanitizedOrigin(key, context, function (raw) { return clean(raw, '', null, false); }); },
      picker:{order:13,name:'Doorbell chime',category:'Devices & interfaces',tagline:'A ring you can see',
        description:'Show a doorbell chime playing or waiting, with a message that follows the story. A silent visual indicator.'},
      example:function (sample) {
        sample.state.playback='playing';
        sample.state.text='Someone is at the front door.';
        sample.panel.initial={playback:'playing',text:sample.state.text};
        return sample;
      }
    },
    styles:String.raw`
.chime-panel{display:flex;align-items:center;gap:16px;min-width:0;padding:8px 0;color:var(--dtext);overflow-wrap:anywhere}
.chime-device{display:flex;flex:0 0 62px;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px 4px;border:1px solid color-mix(in srgb,var(--dtext) 22%,transparent);border-radius:16px;background:color-mix(in srgb,var(--dtext) 5%,transparent)}
.chime-icon{width:38px;height:38px}
.chime-copy{min-width:0;flex:1}
.chime-status{display:flex;align-items:center;gap:7px;font:650 15px/1.4 'IBM Plex Sans',sans-serif;color:var(--dink)}
.chime-dot{flex:none;width:7px;height:7px;border-radius:50%;border:1.5px solid currentColor;opacity:.65}
.chime-playing .chime-dot{background:currentColor;opacity:1}
.chime-playing .chime-device{border-color:color-mix(in srgb,var(--dink) 36%,transparent);background:color-mix(in srgb,var(--dink) 8%,transparent)}
.chime-text{margin:5px 0 0;font:400 12px/1.5 'IBM Plex Sans',sans-serif;white-space:pre-wrap}
.chime-bars{height:16px;display:flex;align-items:center;gap:3px;color:var(--dink)}
.chime-bars i{width:3px;height:3px;border-radius:3px;background:currentColor;opacity:.4}
.chime-playing .chime-bars i{height:9px;opacity:.85}
.chime-playing .chime-bars i:nth-child(2n){height:16px}
.chime-playing .chime-bars i:nth-child(3n){height:12px}
.chime-motion .chime-bars i{animation:chime-sound .65s ease-in-out 4 alternate;transform-origin:center}
.chime-motion .chime-bars i:nth-child(2n){animation-delay:.12s}
@keyframes chime-sound{from{transform:scaleY(.4)}to{transform:scaleY(1)}}
@media(prefers-reduced-motion:reduce){.chime-motion .chime-bars i{animation:none}}
@media print{.chime-motion .chime-bars i{animation:none}.chime-panel{break-inside:avoid}}
`
  });
})();

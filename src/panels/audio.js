/* Shared, silent audio storytelling. Each panel owns an endpoint; these facts
   never open a microphone, play media, infer an alarm, or contact a service. */
var FlowAudio = (function () {
  var choices = {
    connection: ['idle', 'connecting', 'connected', 'interrupted', 'ended'],
    microphone: ['idle', 'listening', 'capturing', 'muted', 'unavailable'],
    output: ['silent', 'speech', 'recorded', 'chime', 'siren'],
    playback: ['playing', 'queued', 'suppressed', 'failed', 'stopped'],
    detection: ['none', 'sound', 'smoke-alarm', 'co-alarm', 'glass-break'],
  };
  var textFields = ['text', 'source', 'reason'];
  var fields = Object.keys(choices).map(function (key) { return [key, 'enum', choices[key]]; })
    .concat(textFields.map(function (key) { return [key, 'text']; }));
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c];
    });
  }
  function clean(raw, path, warnings) {
    if (raw === undefined || raw === null) return raw;
    function warn(message) { if (warnings) warnings.push((path || 'audio') + message); }
    if (!panelObject(raw)) { warn(': expected an audio object or null — ignored'); return undefined; }
    var result = Object.create(null), keys = Object.keys(raw);
    keys.forEach(function (key) {
      var value = raw[key];
      if (own(choices, key)) {
        if (choices[key].indexOf(value) >= 0) result[key] = value;
        else warn('.' + key + ': expected ' + choices[key].join('|') + ' — ignored');
      } else if (textFields.indexOf(key) >= 0) {
        if (typeof value === 'string') result[key] = value;
        else warn('.' + key + ': expected text — ignored');
      } else warn('.' + key + ': not an audio field — ignored');
    });
    return !keys.length || Object.keys(result).length ? result : undefined;
  }
  function model(raw) {
    var value = clean(raw) || {};
    return {
      connection: value.connection || 'idle', microphone: value.microphone || 'idle',
      output: value.output || 'silent',
      playback: value.playback || (value.output && value.output !== 'silent' ? 'playing' : 'stopped'),
      detection: value.detection || 'none', text: value.text || '', source: value.source || '', reason: value.reason || '',
    };
  }
  function isEmitting(raw) { var a = model(raw); return a.output !== 'silent' && a.playback === 'playing'; }
  function isCapturing(raw) { return model(raw).microphone === 'capturing'; }
  function icon(kind) {
    var paths = {
      microphone: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M9 21h6"/>',
      speaker: '<path d="M3 9h4l5-4v14l-5-4H3ZM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
      recorded: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
      chime: '<path d="M6 16h12l-2-3V9a4 4 0 0 0-8 0v4ZM10 20h4M12 3v2"/>',
      siren: '<path d="M5 19h14v3H5ZM7 19v-7a5 5 0 0 1 10 0v7M12 1v3M2 6l3 2m17-2-3 2M1 13h3m16 0h3"/>',
      detection: '<path d="M9 19c0-4 7-4 7-10a5 5 0 0 0-10 0m4 1a2 2 0 0 1 4 0c0 3-5 3-5 6M8 21h3M3 5 1 3m19 4 3-1"/>',
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[own(paths, kind) ? kind : 'speaker'] + '</svg>';
  }
  var outputs = {silent:'Silent', speech:'Live speech', recorded:'Recorded message', chime:'Chime', siren:'Siren'};
  var microphones = {idle:'Mic idle', listening:'Listening', capturing:'Capturing sound', muted:'Mic muted', unavailable:'Mic unavailable'};
  var detections = {none:'', sound:'Sound detected', 'smoke-alarm':'Smoke alarm heard', 'co-alarm':'CO alarm heard', 'glass-break':'Glass-break sound detected'};
  function effect(raw) {
    var a = model(raw), emitting = isEmitting(a), capturing = isCapturing(a), h = '';
    if (emitting) {
      if (a.output === 'chime') h = '<g class="fva-note"><path d="M21-12v17m0-17 10-3V2"/><ellipse cx="17" cy="6" rx="4" ry="3"/><ellipse cx="27" cy="3" rx="4" ry="3"/></g>';
      else if (a.output === 'siren') h = '<path class="fva-outwave" d="m18-12 6 4-4 8 6 8-8 5"/><path class="fva-outwave" d="m29-19 8 6-5 13 6 12-9 8"/>';
      else h = '<path class="fva-outwave" d="M18-8q7 8 0 16"/><path class="fva-outwave" d="M25-14q12 14 0 28"/><path class="fva-outwave" d="M32-20q17 20 0 40"/>';
      h = '<g class="fva-emission fva-sound-' + a.output + '" data-sound="' + a.output + '">' + h + '</g>';
    }
    if (capturing) h += '<g class="fva-capture"><path d="m-34-9 9 9-9 9m12-16 7 7-7 7"/></g>';
    if (a.detection !== 'none') h += '<g class="fva-detection"><circle cx="0" cy="-28" r="7"/><path d="M0-32v5m0 3h.01"/></g>';
    return h ? '<g class="fva-effects" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + h + '</g>' : '';
  }
  function render(raw, options) {
    var cleanValue = clean(raw);
    if (!cleanValue || !Object.keys(cleanValue).length) return '';
    var a = model(cleanValue), emitting = isEmitting(a), capturing = isCapturing(a);
    var playback = a.output === 'silent' ? 'Silent' : outputs[a.output] + (a.playback === 'playing' ? '' : ' · ' + a.playback);
    var kind = ['recorded','chime','siren'].indexOf(a.output) >= 0 ? a.output : 'speaker';
    var h = '<div class="fva-audio' + (emitting ? ' fva-is-emitting' : '') + (capturing ? ' fva-is-capturing' : '') + '" data-output="' + a.output + '" data-playback="' + a.playback + '" data-microphone="' + a.microphone + '">';
    h += '<div class="fva-heading"><span>' + escape(options && options.label || 'Audio') + '</span><span class="fva-connection fva-connection-' + a.connection + '">' + escape(a.connection) + '</span></div>';
    h += '<div class="fva-channels"><span class="fva-output">' + icon(kind) + '<span>' + playback + '</span><span class="fva-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></span>';
    h += '<span class="fva-microphone">' + icon('microphone') + '<span>' + microphones[a.microphone] + '</span></span></div>';
    if (a.text) h += '<div class="fva-caption">' + (a.source ? '<strong>' + escape(a.source) + '</strong>' : '') + '<span>' + escape(a.text) + '</span></div>';
    else if (a.source) h += '<div class="fva-source">' + escape(a.source) + '</div>';
    if (a.detection !== 'none') h += '<div class="fva-detection-label">' + icon('detection') + '<span>' + detections[a.detection] + '</span></div>';
    if (a.reason) h += '<div class="fva-reason">' + escape(a.reason) + '</div>';
    return h + '</div>';
  }
  return {clean:clean, model:model, fields:fields, choices:choices, render:render, effect:effect,
    isEmitting:isEmitting, isCapturing:isCapturing, icon:icon};
})();

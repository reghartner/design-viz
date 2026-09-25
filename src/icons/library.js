/* Shared 24px panel icons. Geometry is code-owned; authored values only select
   known IDs, palettes, and escaped labels. Inline glyphs work offline and in a
   ShadowRoot without a document-level sprite or CSS dependency. */
var FlowIcons = (function () {
  var palettes = {
    neutral: {primary:'#65788F', accent:'#9BACBF', wash:'#E7EDF4'},
    blue:    {primary:'#4B75B1', accent:'#81AFE9', wash:'#E1ECFB'},
    teal:    {primary:'#318585', accent:'#78C1B6', wash:'#DDF2ED'},
    green:   {primary:'#388463', accent:'#82C49B', wash:'#E0F2E6'},
    amber:   {primary:'#A67525', accent:'#EDBB63', wash:'#FFF0D4'},
    red:     {primary:'#BE586B', accent:'#EF98A2', wash:'#FBE3E8'},
    violet:  {primary:'#8063B1', accent:'#B7A0E2', wash:'#EEE7FA'},
  };
  var toneAliases = {ok:'green', warn:'amber', alert:'red', cold:'blue', muted:'neutral'};
  var registry = Object.create(null), artwork = Object.create(null), ids = [];
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c];
    });
  }
  // $wash is a soft body fill, $accent the colored detail, $primary the outline.
  function path(d, fill) { return '<path d="' + d + '"' + (fill ? ' fill="$' + fill + '"' : '') + '/>'; }
  function rect(x, y, w, h, r, fill) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '"' + (fill ? ' fill="$' + fill + '"' : '') + '/>'; }
  function circle(x, y, r, fill) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + (fill ? ' fill="$' + fill + '"' : '') + '/>'; }
  function detail(svg) { return '<g stroke="$accent">' + svg + '</g>'; }
  function solid(svg) { return '<g stroke="none">' + svg + '</g>'; }
  function add(id, label, category, tone, svg, legacy) {
    var palette = palettes[tone];
    ids.push(id);
    registry[id] = Object.freeze({id:id, label:label, category:category, tone:tone,
      primary:palette.primary, accent:palette.accent, legacy:!!legacy});
    artwork[id] = svg;
  }
  var shield = path('M12 3 19.5 6v5.3c0 4.4-3 7.5-7.5 9.7-4.5-2.2-7.5-5.3-7.5-9.7V6Z', 'wash');
  var cloud = path('M6.5 18h10.7a3.8 3.8 0 0 0 .3-7.6 5.6 5.6 0 0 0-10.8-1.6A4.6 4.6 0 0 0 6.5 18Z', 'wash');
  var speaker = path('M3 9h4l5-4v14l-5-4H3Z', 'wash') + detail(path('M16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13'));
  var bell = path('M6 16.5h12l-2-3V9a4 4 0 0 0-8 0v4.5Z', 'wash') + path('M10 20h4M12 3v2');
  var siren = rect(5, 18, 14, 3, 1, 'accent') + path('M7 18v-6a5 5 0 0 1 10 0v6Z', 'wash') + detail(path('M12 10v4')) + path('M12 2v2M3 6l2 1.5M21 6l-2 1.5M2 13h2M20 13h2');
  function thermometer(level) {
    return path('M9.5 14.1V5.5a2.5 2.5 0 0 1 5 0v8.6a4 4 0 1 1-5 0Z', 'wash') +
      detail(path('M12 ' + level + 'V17')) + solid(circle(12, 17, 1.8, 'accent')) + path('M18 6h2M18 10h2');
  }
  function battery(contents) {
    return rect(2.5, 6.5, 17, 11, 2.5, 'wash') + path('M22 10v4') + contents;
  }
  // The existing sprite IDs stay valid. These inline versions add panel color;
  // symbols({newOnly:true}) deliberately leaves the original sprite untouched.
  add('terminal', 'Terminal', 'Software', 'neutral', rect(3, 4.5, 18, 15, 2.5, 'wash') + path('m7 9 3 3-3 3M13 15h4'), true);
  add('cloud', 'Cloud', 'Connectivity', 'blue', cloud + detail(path('M8 14h8')), true);
  add('shield', 'Shield', 'Security', 'green', shield + path('m8.5 11.5 2.5 2.5 4.5-5'), true);
  add('gear', 'Settings', 'Software', 'neutral', path('m9 3-.6 2.3-2 .9-2.2-.6L2.7 8.2l1.6 1.7-.2 2.3L2.5 14l1.6 2.7 2.2-.5 1.9 1.3.7 2.5h3.2l.7-2.5 2-1.1 2.4.5 1.5-2.7-1.6-1.9v-2.2l1.6-1.9-1.6-2.7-2.4.6-1.9-1L12.2 3Z', 'wash') + circle(10.8, 11.5, 3, 'accent'), true);
  add('db', 'Database', 'Software', 'violet', path('M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6', 'wash') + '<ellipse cx="12" cy="6" rx="7" ry="3" fill="$accent"/>' + path('M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3'), true);
  add('antenna', 'Antenna', 'Connectivity', 'teal', circle(12, 10, 2, 'accent') + path('M12 12v9M9 21h6') + detail(path('M8.5 6.5a5 5 0 0 0 0 7M15.5 6.5a5 5 0 0 1 0 7M5.7 3.7a9 9 0 0 0 0 12.6M18.3 3.7a9 9 0 0 1 0 12.6')), true);
  add('thermo', 'Thermometer', 'Temperature', 'teal', thermometer(10), true);
  add('pump', 'Pump', 'Home', 'teal', circle(12, 12, 8, 'wash') + path('m10 8 6 4-6 4Z', 'accent'), true);
  add('router', 'Router', 'Connectivity', 'blue', rect(3, 13, 18, 7, 2.5, 'wash') + path('M7 13 5.5 6M17 13l1.5-7') + solid(circle(7, 16.5, 1, 'accent') + circle(11, 16.5, 1, 'primary')) + path('M16 16.5h2'), true);
  add('package', 'Package', 'Home', 'amber', path('m4 7.5 8-4 8 4V17l-8 4-8-4Z', 'wash') + path('m4 7.5 8 4 8-4M12 11.5V21') + detail(path('m8 5.5 8 4V13')), true);
  add('key', 'Key', 'Security', 'amber', circle(7.5, 16.5, 4, 'wash') + path('m10.5 13.5 9-9M16 8l3 3M18.5 5.5l2 2') + solid(circle(6.5, 17.5, .7, 'accent')), true);
  add('server', 'Server', 'Software', 'blue', rect(4, 4, 16, 6.5, 2, 'wash') + rect(4, 13.5, 16, 6.5, 2, 'wash') + solid(circle(8, 7.25, 1, 'accent') + circle(8, 16.75, 1, 'accent')) + path('M12 7.25h4M12 16.75h4'), true);
  add('chip', 'Processor', 'Software', 'violet', rect(6.5, 6.5, 11, 11, 2.5, 'wash') + rect(9.5, 9.5, 5, 5, 1, 'accent') + path('M9 3v3.5M15 3v3.5M9 17.5V21M15 17.5V21M3 9h3.5M3 15h3.5M17.5 9H21M17.5 15H21'), true);
  add('phone', 'Phone', 'Home', 'violet', rect(6.5, 2.5, 11, 19, 3, 'wash') + path('M10 5h4M10.5 18.5h3') + solid(rect(9, 8, 6, 6.5, 1.5, 'accent')), true);
  add('house', 'Home', 'Home', 'teal', path('M5 9v11h14V9', 'wash') + path('m2.5 10 9.5-7.5 9.5 7.5') + path('M9.5 20v-6h5v6Z', 'accent'), true);
  add('camera', 'Camera', 'Video', 'blue', rect(3, 5.5, 18, 12.5, 3, 'wash') + circle(12, 11.75, 3.5, 'accent') + solid(circle(12, 11.75, 1.25, 'primary') + circle(18, 8.5, .7, 'primary')) + path('M12 18v3M8 21h8'), true);
  add('doorbell', 'Doorbell', 'Home', 'violet', rect(7, 2.5, 10, 19, 3.5, 'wash') + circle(12, 15.5, 2.5, 'accent') + path('M10.5 7h3'), true);
  add('lock', 'Lock', 'Security', 'teal', rect(5, 10, 14, 11, 3, 'wash') + path('M8 10V7a4 4 0 0 1 8 0v3') + solid(circle(12, 14.5, 1.1, 'accent')) + path('M12 15v2.5'), true);
  add('bulb', 'Light', 'Home', 'amber', path('M9 17v-1.5C9 13.5 6 12.5 6 9a6 6 0 0 1 12 0c0 3.5-3 4.5-3 6.5V17Z', 'wash') + detail(path('m9.5 9 2.5 2 2.5-2M12 11v6')) + path('M9 20h6M10.5 22h3'), true);
  add('car', 'Car', 'Home', 'blue', path('M4 17H2.5v-5l3-1L8 6h7l4 5 2.5 2v4H20M8 17h8', 'wash') + path('M5.5 11H19M12 6v5') + circle(6, 17, 2, 'accent') + circle(18, 17, 2, 'accent'), true);
  add('speaker', 'Speaker', 'Audio', 'violet', speaker, true);

  add('battery', 'Battery', 'Power', 'teal', battery(solid(rect(5, 9, 4, 6, 1, 'accent') + rect(10.5, 9, 4, 6, 1, 'accent'))));
  add('battery-full', 'Battery full', 'Power', 'green', battery(solid(rect(5, 9, 3, 6, .8, 'accent') + rect(9.5, 9, 3, 6, .8, 'accent') + rect(14, 9, 3, 6, .8, 'accent'))));
  add('battery-low', 'Battery low', 'Power', 'red', battery(solid(rect(5, 9, 3, 6, .8, 'accent')) + path('M14 9.5v2.5M14 14.5h.01')));
  add('battery-charging', 'Battery charging', 'Power', 'green', battery(path('m12.5 4-6 9h4L9.5 20l6.5-10h-4Z', 'accent')));
  add('plug', 'Power connected', 'Power', 'teal', path('M8 3v5M16 3v5M12 17v4') + path('M6 8h12v3a6 6 0 0 1-12 0Z', 'wash') + detail(path('M9 11h6')));
  add('solar', 'Solar power', 'Power', 'amber', circle(17, 6, 2.5, 'accent') + path('M17 1.5v1M21.5 6h1M20.2 2.8l.7-.7M13.8 2.8l-.7-.7') + path('M4 11h13l3 9H2Z', 'wash') + path('M3.5 15.5h15M8.5 11l-1 9M12.5 11l1 9'));
  add('temperature', 'Temperature', 'Temperature', 'teal', thermometer(10));
  add('hot', 'High temperature', 'Temperature', 'red', thermometer(6) + detail(path('M4 9V4m-2 2 2-2 2 2')));
  add('cold', 'Low temperature', 'Temperature', 'blue', thermometer(13) + detail(path('M4 3v6M1.5 4.5l5 3M1.5 7.5l5-3')));
  add('snowflake', 'Cold conditions', 'Temperature', 'blue', path('M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7') + detail(path('m9 4 3 3 3-3M9 20l3-3 3 3M3.5 10.5l4.1-1.1-1.1-4.1M17.5 18.7l-1.1-4.1 4.1-1.1M3.5 13.5l4.1 1.1-1.1 4.1M17.5 5.3l-1.1 4.1 4.1 1.1')));
  add('alarm', 'Alarm', 'Security', 'red', siren);
  add('armed', 'Armed', 'Security', 'green', shield + path('m8.5 11.5 2.5 2.5 4.5-5'));
  add('disarmed', 'Disarmed', 'Security', 'neutral', shield + path('M8.5 11.5h7'));
  add('triggered', 'Alarm triggered', 'Security', 'red', shield + path('M12 7v5') + solid(circle(12, 15.5, 1, 'primary')));
  add('wifi', 'Wi-Fi', 'Connectivity', 'teal', detail(path('M2.5 8a14 14 0 0 1 19 0M6 11.5a9 9 0 0 1 12 0')) + path('M9 15a4.5 4.5 0 0 1 6 0') + solid(circle(12, 18.5, 1.5, 'primary')));
  add('wifi-off', 'Wi-Fi unavailable', 'Connectivity', 'neutral', path('M8.5 4.8A14 14 0 0 1 21.5 8M12 9.3a9 9 0 0 1 6 2.2M2.5 8l1-.8M6 11.5l1.2-.8M9 15a4.5 4.5 0 0 1 5.4-.4') + solid(circle(12, 18.5, 1.5, 'primary')) + detail(path('m3 3 18 18')));
  add('cloud-off', 'Cloud unavailable', 'Connectivity', 'neutral', cloud + detail(path('m3 3 18 18')));
  add('signal', 'Mobile signal', 'Connectivity', 'teal', solid(rect(3, 15, 3, 6, 1, 'accent') + rect(8, 11, 3, 10, 1, 'accent') + rect(13, 7, 3, 14, 1, 'accent') + rect(18, 3, 3, 18, 1, 'primary')));
  add('microphone', 'Microphone', 'Audio', 'violet', rect(9, 3, 6, 12, 3, 'wash') + detail(path('M12 6v4')) + path('M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6'));
  add('microphone-muted', 'Microphone muted', 'Audio', 'neutral', path('M9 5.5a3 3 0 0 1 6 .5v5M9 10v2a3 3 0 0 0 4.5 2.6M6 11v1a6 6 0 0 0 10.2 4.3M18 11v1M12 18v3M9 21h6') + detail(path('m3 3 18 18')));
  add('recorded', 'Recorded message', 'Audio', 'violet', circle(12, 12, 9, 'wash') + path('m10 8 6 4-6 4Z', 'accent'));
  add('chime', 'Chime', 'Audio', 'amber', bell + detail(path('M4 7 2.5 5.5M20 7l1.5-1.5')));
  add('siren', 'Siren', 'Audio', 'red', siren);
  add('detection', 'Sound detected', 'Audio', 'amber', path('M7 9a5 5 0 0 1 10 0c0 5-6 5-6 9a3 3 0 0 1-6 0') + path('M10 9a2 2 0 0 1 4 0c0 2.5-3 2.5-3 5') + detail(path('M20 5a8 8 0 0 1 0 8M3 7v4')));
  add('headset', 'Operator headset', 'Audio', 'blue', path('M4 13v-2a8 8 0 0 1 16 0v2M20 16v1a4 4 0 0 1-4 4h-3') + rect(3, 10, 4, 8, 2, 'wash') + rect(17, 10, 4, 8, 2, 'wash') + solid(rect(10, 19.5, 4, 2.5, 1, 'accent')));
  add('door', 'Door sensor', 'Security', 'amber', path('M5 21V3h14v18Z', 'wash') + path('m8 21 8-2V5L8 3Z', 'accent') + path('M12.5 12h.01M3 21h18'));
  add('motion', 'Motion sensor', 'Security', 'violet', circle(14, 4.5, 2, 'wash') + path('m8 11 5-4 4 4h3M13 8l-3 7-5 5m5-5 5 2 1 4') + detail(path('M3 7l2-2M2 12h3')));
  add('smoke', 'Smoke sensor', 'Security', 'neutral', rect(4, 15.5, 16, 4.5, 2, 'wash') + path('M9 18h6') + detail(path('M7 12c-4-3 4-4 0-8M12 12c-4-3 4-4 0-8M17 12c-4-3 4-4 0-8')));
  add('water', 'Water sensor', 'Security', 'blue', path('M12 2.5S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12.5-7-12.5Z', 'wash') + detail(path('M8.5 15a3.5 3.5 0 0 0 3.5 3.5')));
  add('sensor', 'Sensor', 'Security', 'teal', circle(12, 12, 3, 'wash') + detail(path('M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8')) + path('M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14'));
  add('police', 'Police', 'Dispatch', 'blue', shield + path('m12 7 1.4 2.8 3.1.4-2.3 2.2.6 3.1-2.8-1.4-2.8 1.4.6-3.1-2.3-2.2 3.1-.4Z', 'accent'));
  add('fire', 'Fire response', 'Dispatch', 'amber', path('M12 2c1 5 7 7 7 13a7 7 0 0 1-14 0c0-3 2-6 4-8 0 3 2 4 3 4 2-2 1-6 0-9Z', 'wash') + path('M12 13c0 3 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5Z', 'accent'));
  add('medical', 'Medical response', 'Dispatch', 'red', path('M8.5 3h7v5.5H21v7h-5.5V21h-7v-5.5H3v-7h5.5Z', 'wash') + detail(path('M12 8v8M8 12h8')));
  add('security', 'Security response', 'Dispatch', 'amber', shield + path('m8.5 11.5 2.5 2.5 4.5-5'));
  add('monitor', 'Video monitor', 'Video', 'blue', rect(2.5, 3.5, 19, 14, 2.5, 'wash') + path('M12 17.5V21M8 21h8') + path('m10 7 5 3.5-5 3.5Z', 'accent'));
  add('camera-off', 'Camera unavailable', 'Video', 'neutral', rect(3, 5.5, 18, 12.5, 3, 'wash') + circle(12, 11.75, 3.5, 'accent') + path('M12 18v3M8 21h8') + detail(path('m3 3 18 18')));
  add('person', 'Person', 'Home', 'violet', circle(12, 6, 3, 'wash') + path('M5 21v-2a7 7 0 0 1 14 0v2Z', 'wash') + detail(path('M8.5 20v-2M15.5 20v-2')));

  function has(id) { return typeof id === 'string' && own(registry, id); }
  function resolve(id, fallback) { return has(id) ? id : has(fallback) ? fallback : 'gear'; }
  function toneName(value, fallback) {
    if (typeof value !== 'string') return fallback;
    if (own(toneAliases, value)) return toneAliases[value];
    return own(palettes, value) ? value : fallback;
  }
  function glyph(id, options) {
    id = resolve(id); options = options || {};
    var tone = toneName(options.tone, registry[id].tone), palette = palettes[tone];
    function paint(role) {
      return options.monochrome ? 'currentColor' : 'var(--fv-icon-' + role + ',' + palette[role] + ')';
    }
    // Monochrome preserves silhouette and interior marks without solid bodies.
    var svg = artwork[id].replace(/\$(primary|accent|wash)/g, function (_, role) {
      return options.monochrome && role === 'wash' ? 'none' : paint(role);
    });
    return '<g class="fv-icon-glyph" data-icon="' + id + '" data-icon-tone="' + tone + '" fill="none" stroke="' + paint('primary') + '" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + svg + '</g>';
  }
  function render(id, options) {
    id = resolve(id); options = options || {};
    var label = typeof options.label === 'string' && options.label ? options.label : null;
    var className = typeof options.className === 'string' && options.className ? ' ' + escape(options.className) : '';
    return '<svg class="fv-icon' + (options.monochrome ? ' fv-icon--mono' : '') + className + '" data-icon="' + id + '" viewBox="0 0 24 24" width="24" height="24" focusable="false" ' +
      (label ? 'role="img" aria-label="' + escape(label) + '"' : 'aria-hidden="true"') + '>' + glyph(id, options) + '</svg>';
  }
  function symbols(options) {
    var newOnly = !options || options.newOnly !== false;
    return ids.filter(function (id) { return !newOnly || !registry[id].legacy; }).map(function (id) {
      return '<symbol id="i-' + id + '" viewBox="0 0 24 24">' + glyph(id) + '</symbol>';
    }).join('');
  }
  Object.keys(palettes).forEach(function (key) { Object.freeze(palettes[key]); });
  return Object.freeze({ids:Object.freeze(ids), registry:Object.freeze(registry),
    has:has, resolve:resolve, render:render, glyph:glyph, symbols:symbols});
})();

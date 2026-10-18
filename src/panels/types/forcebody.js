/* Force body: authored snapshots, SI components (+x right, +y up). No time
   integration. Mass belongs to a declared trial; compare trials in two panels. */
var FORCEBODY_LIMIT = 1000000;
function forcebodyNumber(n) { return isFiniteNum(n) && Math.abs(n) <= FORCEBODY_LIMIT; }
function forcebodyMass(n) { return isFiniteNum(n) && n >= 0.000001 && n <= FORCEBODY_LIMIT; }
function forcebodyFormat(n) {
  if (n === 0) return '0';
  return Math.abs(n) < 0.001 || Math.abs(n) >= 100000 ? n.toExponential(2) : String(Number(n.toPrecision(4)));
}
function forcebodyVector(value) {
  return panelObject(value) && forcebodyNumber(value.x) && forcebodyNumber(value.y);
}
function forcebodySnapshot(raw, path, warnings, allowOnce) {
  var out = Object.create(null);
  function warn(at, message) { if (warnings) warnings.push(at + ': ' + message); }
  if (raw == null) return out;
  if (!panelObject(raw)) { warn(path, 'expected a state object — ignored'); return out; }
  Object.keys(raw).forEach(function (key) {
    var v = raw[key], at = path + '.' + key;
    if (key === 'enterOnce' && allowOnce) {
      if (!panelObject(v)) warn(at, 'expected a state object — ignored');
      else out.enterOnce = forcebodySnapshot(v, at, warnings, false);
    } else if (key === 'forces') {
      if (v === null) { out.forces = []; return; }
      if (!Array.isArray(v) || v.length > 4) { warn(at, 'expected a complete list of 0–4 force vectors — ignored'); return; }
      var good = true;
      v.forEach(function (f, i) {
        if (!forcebodyVector(f)) { warn(at + '[' + i + ']', 'expected {x,y} finite force components in N, each within ±1000000 — list ignored'); good = false; }
        if (panelObject(f) && f.label !== undefined && typeof f.label !== 'string') { warn(at + '[' + i + '].label', 'expected text — list ignored'); good = false; }
      });
      if (good) out.forces = v.map(function (f, i) { return {x:f.x, y:f.y, label:typeof f.label === 'string' ? f.label : 'Force ' + (i + 1)}; });
    } else if (key === 'velocity') {
      if (v === null) out.velocity = null;
      else if (forcebodyVector(v)) out.velocity = {x:v.x, y:v.y};
      else warn(at, 'expected {x,y} authored velocity components in m/s, each within ±1000000, or null — ignored');
    } else if (key === 'caption' || key === 'note') {
      if (typeof v === 'string' || v === null) out[key] = v;
      else warn(at, 'expected text or null — ignored');
    } else if (key === 'mass') warn(at, 'mass is a declaration in kg; use a separate panel for another trial — ignored');
    else warn(at, 'unknown field — ignored');
  });
  return out;
}
function forcebodyFold(panel, steps) {
  return foldSanitizedPanelStates(panel, steps, function (raw, once) { return forcebodySnapshot(raw, 'state', null, once); });
}
function forcebodyModel(panel, state) {
  panel = panelObject(panel) ? panel : {};
  var s = forcebodySnapshot(state, 'state', null, false), forces = s.forces || [], mass = forcebodyMass(panel.mass) ? panel.mass : null;
  var x = 0, y = 0;
  forces.forEach(function (f) { x += f.x; y += f.y; });
  var net = {x:x, y:y, magnitude:Math.hypot(x, y)};
  var acceleration = mass === null ? null : {x:x / mass, y:y / mass, magnitude:net.magnitude / mass};
  var velocity = s.velocity || null, speed = velocity ? Math.hypot(velocity.x, velocity.y) : null;
  var dot = velocity ? x * velocity.x + y * velocity.y : null;
  var relation = !velocity ? 'Velocity not specified' : speed === 0 ? 'At rest in this snapshot' : net.magnitude === 0 ? 'Moving · no acceleration' : Math.abs(dot) <= net.magnitude * speed * 1e-12 ? 'Turning · no instantaneous speed change' : dot < 0 ? 'Moving · slowing now' : 'Moving · speeding up now';
  return {mass:mass, forces:forces, net:net, acceleration:acceleration, velocity:velocity, speed:speed, relation:relation,
    scale:Math.max(1, net.magnitude, ...forces.map(function (f) { return Math.hypot(f.x, f.y); })),
    label:typeof panel.label === 'string' ? panel.label : 'Puck', trial:typeof panel.trial === 'string' ? panel.trial : 'Force snapshot',
    caption:s.caption || '', note:s.note || ''};
}
function forcebodyPair(v, unit) { return '(' + forcebodyFormat(v.x) + ', ' + forcebodyFormat(v.y) + ') ' + unit; }
/* Polygon arrowheads avoid document-wide SVG ids, including cloned previews. */
function forcebodyArrow(x, y, dx, dy, cls, label, offset) {
  var length = Math.hypot(dx, dy);
  if (!length) return '';
  var ux = dx / length, uy = dy / length, gap = offset || 0;
  x -= uy * gap; y += ux * gap;
  var ex = x + dx, ey = y + dy, head = Math.min(9, length * 0.5);
  var points = ex + ',' + ey + ' ' + (ex - ux * head - uy * head * .5) + ',' + (ey - uy * head + ux * head * .5) + ' ' + (ex - ux * head + uy * head * .5) + ',' + (ey - uy * head - ux * head * .5);
  return '<g class="' + cls + '"><line x1="' + x + '" y1="' + y + '" x2="' + ex + '" y2="' + ey + '"/><polygon points="' + points + '"/>' +
    (label ? '<text x="' + (ex + (Math.abs(ux) > .7 ? ux * 16 : 16)) + '" y="' + (ey + 4) + '" text-anchor="middle">' + esc(label) + '</text>' : '') + '</g>';
}
function forcebodySigned(n) { return (n > 0 ? '+' : '') + forcebodyFormat(n); }
function forcebodyDirection(v) {
  if (!v) return 'Not specified';
  if (!v.x && !v.y) return 'Zero vector';
  return [v.x > 0 ? 'Right' : v.x < 0 ? 'Left' : '', v.y > 0 ? 'up' : v.y < 0 ? 'down' : ''].filter(Boolean).join(' + ');
}
function forcebodyMotionRow(kind, name, v, unit, provenance) {
  var magnitude = v ? Math.hypot(v.x, v.y) : 0;
  var value = v ? '(' + forcebodySigned(v.x) + ', ' + forcebodySigned(v.y) + ') ' + unit : 'Not specified';
  return '<div class="forcebody-motion-row forcebody-' + kind + '-row"><div class="forcebody-motion-name"><b>' + name + '</b><small>' + provenance + '</small></div>' +
    '<div class="forcebody-motion-value"><strong>' + esc(value) + '</strong><span>' + forcebodyDirection(v) + '</span></div>' +
    '<svg class="forcebody-direction" viewBox="0 0 120 100" aria-hidden="true"><path class="forcebody-direction-axis" d="M8 50H112M60 8V92"/><circle class="forcebody-direction-origin" cx="60" cy="50" r="3"/>' +
    (!v ? '<text class="forcebody-direction-unknown" x="60" y="57" text-anchor="middle">—</text>' :
      magnitude ? forcebodyArrow(60, 50, v.x / magnitude * 40, -v.y / magnitude * 40, 'forcebody-' + kind, '', 0) :
        '<circle class="forcebody-direction-zero" cx="60" cy="50" r="10"/>') + '</svg></div>';
}
function forcebodyHTML(panel, state) {
  var m = forcebodyModel(panel, state), fmt = forcebodyFormat;
  // The minimum force domain is fixed across ordinary classroom trials. Larger
  // values expand it explicitly; velocity direction never implies integration.
  var forceScale = Math.max(5, m.scale), forceUnit = 76 / forceScale;
  var description = m.label + '. ' + m.relation + '. Net force ' + forcebodyPair(m.net, 'N') + '. ' +
    (m.acceleration ? 'Acceleration ' + forcebodyPair(m.acceleration, 'm/s²') + '.' : 'Declare a valid mass to calculate acceleration.') +
    (m.velocity ? ' Authored velocity ' + forcebodyPair(m.velocity, 'm/s') + '.' : '');
  var h = '<div class="forcebody"><div class="forcebody-heading"><span><i></i>' + esc(m.trial) + '</span><strong>' + (m.mass === null ? 'Mass required' : fmt(m.mass) + ' <small>kg</small>') + '</strong></div>' +
    '<div class="forcebody-caption">' + esc(m.caption || m.label) + '</div><svg class="forcebody-scene" viewBox="0 0 640 260" role="img" aria-label="' + esc(description) + '">' +
    '<title>' + esc(description) + '</title><rect class="forcebody-surface" x="1" y="1" width="638" height="258" rx="16"/>' +
    '<path class="forcebody-grid" d="M30 82H610M30 136H610M30 190H610M77 66V210M131 66V210M185 66V210M239 66V210M293 66V210M377 66V210M431 66V210M485 66V210M539 66V210M593 66V210"/>' +
    '<text class="forcebody-kicker" x="24" y="32">01 / APPLIED FORCES</text><text class="forcebody-kicker" x="365" y="32">02 / NET FORCE</text>' +
    '<path class="forcebody-divider" d="M336 58V218"/><text class="forcebody-axis" x="24" y="55">+x →  ·  +y ↑</text>' +
    '<circle class="forcebody-puck-halo" cx="185" cy="136" r="58"/><circle class="forcebody-puck" cx="185" cy="136" r="39"/><circle class="forcebody-puck-ring" cx="185" cy="136" r="30"/><text class="forcebody-puck-text" x="185" y="144" text-anchor="middle">m</text>';
  m.forces.forEach(function (f, i) { h += forcebodyArrow(185, 136, f.x * forceUnit, -f.y * forceUnit, 'forcebody-force forcebody-f' + i, 'F' + (i + 1), (i - (m.forces.length - 1) / 2) * 12); });
  h += '<circle class="forcebody-origin" cx="485" cy="136" r="5"/>' + forcebodyArrow(485, 136, m.net.x * forceUnit, -m.net.y * forceUnit, 'forcebody-net', '', 0);
  if (m.net.magnitude === 0) h += '<circle class="forcebody-zero" cx="485" cy="136" r="29"/><text class="forcebody-balanced" x="485" y="188" text-anchor="middle">Balanced</text>';
  h += '<text class="forcebody-body-label" x="185" y="234" text-anchor="middle">' + esc(m.label.length > 26 ? m.label.slice(0, 25) + '…' : m.label) + '</text>' +
    '<text class="forcebody-net-label" x="485" y="234" text-anchor="middle">ΣF = ' + fmt(m.net.magnitude) + ' N</text>' +
    '<text class="forcebody-axis" x="485" y="252" text-anchor="middle">' + esc(forcebodyPair(m.net, 'N')) + '</text></svg>';
  h += '<div class="forcebody-forces">';
  m.forces.forEach(function (f, i) { h += '<div><b>F' + (i + 1) + '</b><span>' + esc(f.label) + '</span><code>' + esc(forcebodyPair(f, 'N')) + '</code></div>'; });
  if (!m.forces.length) h += '<div><span>No applied forces · ΣF = 0 N</span></div>';
  h += '</div><div class="forcebody-equation"><div class="forcebody-equation-title"><span>03 / ACCELERATION</span><b>a = ΣF / m</b></div><div class="forcebody-calculation"><div><strong>' + fmt(m.net.magnitude) + '<small> N</small></strong><span>net force · magnitude</span></div><i>÷</i><div><strong>' + (m.mass === null ? '—' : fmt(m.mass)) + '<small> kg</small></strong><span>fixed mass</span></div><i>=</i><div class="forcebody-answer"><strong>' + (m.acceleration ? fmt(m.acceleration.magnitude) : '—') + '<small> m/s²</small></strong><span>acceleration · magnitude</span></div></div>';
  if (m.acceleration) {
    var extent = Math.min(100, m.acceleration.magnitude / 4 * 100);
    h += '<div class="forcebody-meter" role="img" aria-label="Acceleration magnitude ' + fmt(m.acceleration.magnitude) + ' m/s² on a fixed zero to four scale' + (m.acceleration.magnitude > 4 ? ', exceeds scale' : '') + '"><div class="forcebody-meter-track"><span style="width:' + extent + '%"></span></div><div class="forcebody-meter-labels"><span>0</span><span>1</span><span>2</span><span>3</span><span>4 m/s²</span></div></div><div class="forcebody-scale-note">Fixed comparison scale' + (m.acceleration.magnitude > 4 ? ' · value exceeds 4 m/s²; bar capped' : ' · same scale in every trial') + '</div>';
  } else h += '<div class="forcebody-scale-note">Declare a positive finite mass to calculate acceleration.</div>';
  h += '</div><div class="forcebody-motion"><div class="forcebody-motion-heading"><b>Motion at this instant</b><span>Direction arrows</span></div>' +
    forcebodyMotionRow('velocity', 'Velocity v', m.velocity, 'm/s', 'Authored snapshot') +
    forcebodyMotionRow('acceleration', 'Acceleration a', m.acceleration, 'm/s²', 'Calculated from forces') +
    '<div class="forcebody-relation">' + esc(m.relation) + '</div></div><div class="forcebody-key">Components: (x, y). Force arrows share one scale (full length: ' + fmt(forceScale) + ' N). Motion arrows: direction only. No trajectory prediction.</div>';
  if (m.note) h += '<div class="forcebody-note">' + esc(m.note) + '</div>';
  return h + '</div>';
}
PanelRegistry.define('forcebody', {
  label:'Force body', since:'0.2.0', order:48,
  validateDeclaration:function (panel, path, warnings) {
    if (!forcebodyMass(panel.mass)) warnings.push(path + '.mass: expected mass in kg from 0.000001 to 1000000');
    ['label', 'trial'].forEach(function (key) { if (panel[key] !== undefined && typeof panel[key] !== 'string') warnings.push(path + '.' + key + ': expected text'); });
    forcebodySnapshot(panel.initial, path + '.initial', warnings, false);
  },
  validatePatch:function (patch, path, panel, warnings) { forcebodySnapshot(patch, path, warnings, true); },
  fold:forcebodyFold,
  render:function (host, panel, state) { return {html:forcebodyHTML(panel, state)}; },
  layout:{sectionSizing:{minWidth:360, preferredWidth:600, maxWidth:900, aspectPolicy:'content', grow:1}},
  styles:String.raw`
.forcebody{--fb-bg:#f5f7fa;--fb-force:#286aaf;--fb-net:#ae4727;--fb-motion:#6851aa;--fb-rule:color-mix(in srgb,currentColor 15%,transparent);color:var(--dtext,#263449);font:14px/1.45 'IBM Plex Sans',sans-serif;min-width:0}
.sk-aurora .forcebody,.sk-terminal .forcebody,.sk-blueprint .forcebody{--fb-bg:#162136;--fb-force:#83bcff;--fb-net:#ffc381;--fb-motion:#c6b6ff}
.forcebody-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}.forcebody-heading>span{display:flex;align-items:center;gap:9px;overflow-wrap:anywhere}.forcebody-heading i{width:7px;height:7px;flex-shrink:0;border-radius:50%;background:var(--fb-force)}.forcebody-heading strong{padding:3px 9px;border:1px solid var(--fb-rule);border-radius:6px;font:600 20px 'IBM Plex Mono',monospace;letter-spacing:-.04em;white-space:nowrap}.forcebody-heading small{font-size:13px;font-weight:400}
.forcebody-caption{font-weight:600;font-size:22px;letter-spacing:-.035em;line-height:1.2;margin:8px 0 10px;overflow-wrap:anywhere}.forcebody-scene{display:block;width:100%;height:auto;overflow:visible}
.forcebody-surface{fill:color-mix(in srgb,var(--fb-force) 4%,transparent);stroke:var(--fb-rule)}.forcebody-grid{fill:none;stroke:currentColor;opacity:.055;stroke-width:1}.forcebody-divider{stroke:currentColor;opacity:.16;fill:none}
.forcebody-kicker{font:600 14px 'IBM Plex Sans',sans-serif;letter-spacing:1px;fill:currentColor}.forcebody-axis{font:13px 'IBM Plex Sans',sans-serif;fill:currentColor;opacity:.75}.forcebody-body-label{font:600 17px 'IBM Plex Sans',sans-serif;fill:currentColor}
.forcebody-puck-halo{fill:none;stroke:var(--fb-force);stroke-width:1;opacity:.18}.forcebody-puck{fill:color-mix(in srgb,var(--fb-force) 15%,var(--fb-bg));stroke:var(--fb-force);stroke-width:2}.forcebody-puck-ring{fill:none;stroke:var(--fb-force);opacity:.3}.forcebody-puck-text{font:italic 600 26px Georgia,serif;fill:var(--fb-force)}
.forcebody-force{fill:var(--fb-force);stroke:var(--fb-force);stroke-width:3.5}.forcebody-force text{font:700 15px 'IBM Plex Sans',sans-serif;paint-order:stroke;stroke:var(--fb-bg);stroke-width:4px;stroke-linejoin:round}.forcebody-net{stroke:var(--fb-net);fill:var(--fb-net);stroke-width:5}.forcebody-net-label{fill:var(--fb-net);font:600 19px 'IBM Plex Mono',monospace}.forcebody-origin{fill:var(--fb-net)}.forcebody-zero{fill:none;stroke:var(--fb-net);stroke-width:2;stroke-dasharray:4 5}.forcebody-balanced{font:600 15px 'IBM Plex Sans',sans-serif;fill:var(--fb-net)}
.forcebody-forces{margin:5px 0 10px}.forcebody-forces>div{display:flex;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid var(--fb-rule)}.forcebody-forces b{color:var(--fb-force);font:600 12px 'IBM Plex Mono',monospace}.forcebody-forces span{flex:1;overflow-wrap:anywhere}.forcebody-forces code{font:12px 'IBM Plex Mono',monospace;text-align:right}
.forcebody-equation{background:color-mix(in srgb,var(--fb-net) 6%,transparent);border:1px solid color-mix(in srgb,var(--fb-net) 23%,transparent);padding:8px 13px;border-radius:10px}.forcebody-equation-title{display:flex;justify-content:space-between;align-items:center;gap:12px}.forcebody-equation-title>span{font-size:11px;letter-spacing:.1em;font-weight:600}.forcebody-equation-title>b{font:italic 20px Georgia,serif;color:var(--fb-net)}.forcebody-calculation{display:grid;grid-template-columns:1fr auto .8fr auto 1.3fr;align-items:center;gap:10px;margin:8px 0}.forcebody-calculation>div{min-width:0}.forcebody-calculation strong{display:block;font:600 23px 'IBM Plex Mono',monospace;letter-spacing:-.04em;overflow-wrap:anywhere}.forcebody-calculation small{font-size:12px;font-weight:400;letter-spacing:0}.forcebody-calculation span{font-size:11px;opacity:.8}.forcebody-calculation i{font:22px Georgia,serif;opacity:.5}.forcebody-answer strong{color:var(--fb-net)}
.forcebody-meter{margin-top:6px}.forcebody-meter-track{height:8px;position:relative;border-radius:2px;background:color-mix(in srgb,var(--fb-net) 12%,transparent);background-image:linear-gradient(to right,transparent calc(100% - 1px),var(--fb-rule) 1px);background-size:25% 100%;overflow:hidden}.forcebody-meter-track>span{display:block;height:100%;background:var(--fb-net);border-radius:2px}.forcebody-meter-labels{display:grid;grid-template-columns:repeat(4,1fr);position:relative;font:10px 'IBM Plex Mono',monospace;margin-top:5px}.forcebody-meter-labels>span:not(:first-child){transform:translateX(-50%);width:max-content}.forcebody-meter-labels>span:last-child{position:absolute;right:0;transform:none}.forcebody-scale-note{font-size:11px;margin-top:7px;opacity:.78}
.forcebody-motion{margin-top:9px;border-top:2px solid var(--fb-rule)}.forcebody-motion-heading{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0 2px;gap:10px}.forcebody-motion-heading>b{font-size:16px;letter-spacing:-.02em}.forcebody-motion-heading>span{font-size:10px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}.forcebody-motion-row{display:grid;grid-template-columns:minmax(95px,1fr) minmax(0,1.65fr) 76px;align-items:center;gap:10px;min-height:58px;border-bottom:1px solid var(--fb-rule)}.forcebody-motion-name b{display:block;font-size:14px}.forcebody-motion-name small{display:block;font-size:10px;opacity:.75;margin-top:3px}.forcebody-motion-value strong{display:block;font:600 14px 'IBM Plex Mono',monospace;overflow-wrap:anywhere;letter-spacing:-.03em}.forcebody-motion-value span{display:block;font-size:12px;margin-top:4px}.forcebody-velocity-row .forcebody-motion-value{color:var(--fb-motion)}.forcebody-acceleration-row .forcebody-motion-value{color:var(--fb-net)}.forcebody-direction{width:68px;height:56px}.forcebody-direction-axis{stroke:currentColor;opacity:.16;stroke-width:1;fill:none}.forcebody-direction-origin{fill:currentColor;opacity:.4}.forcebody-direction-zero{fill:none;stroke:currentColor;stroke-width:2}.forcebody-velocity{stroke:var(--fb-motion);fill:var(--fb-motion);stroke-width:4;stroke-dasharray:6 4}.forcebody-velocity polygon{stroke-dasharray:none}.forcebody-acceleration{stroke:var(--fb-net);fill:var(--fb-net);stroke-width:4}
.forcebody-direction-unknown{fill:currentColor;opacity:.55;font:600 25px 'IBM Plex Mono',monospace}
.forcebody-relation{font-size:16px;font-weight:600;letter-spacing:-.015em;margin-top:9px}.forcebody-key{font-size:10px;line-height:1.5;opacity:.75;margin-top:5px}.forcebody-note{margin-top:8px;padding:6px 11px;border-left:2px solid var(--fb-force);background:color-mix(in srgb,var(--fb-force) 5%,transparent);font-size:13px;line-height:1.45;overflow-wrap:anywhere}
@media(prefers-reduced-motion:reduce){.forcebody *{animation:none!important;transition:none!important}}
@media print{.forcebody{--fb-bg:#fff;--fb-force:#174d84;--fb-net:#893617;--fb-motion:#514080;color:#18232e;break-inside:avoid;print-color-adjust:exact}.forcebody-surface{fill:#fff;stroke:#bcc4cc}.forcebody-puck{fill:#e2eaf3}.forcebody-force text{stroke:#fff}}
`,
  authoring:{
    initialFields:true, transientFields:['forces','velocity','caption','note'],
    template:{title:'Force body', label:'Puck', trial:'Trial A', mass:2, initial:{forces:[{label:'Push', x:4, y:0}], velocity:{x:2, y:0}, caption:'A push changes the motion'}},
    setupFields:[['label','text'],['trial','text'],['mass','num'],['initial','json']],
    patchFields:[['forces','jsonArr'],['velocity','json'],['caption','text'],['note','text']],
    fieldMeta:{
      mass:{label:'Mass (kg)',help:'Fixed for this body: 0.000001–1000000 kg. Use another panel with a separate trial label to compare a different mass.'},
      trial:{label:'Trial label'},label:{label:'Body label'},
      forces:{label:'Force vectors (N)',help:'Complete list of up to four {label, x, y}. +x is right; +y is up. The list replaces the previous forces.',nullLabel:'No forces'},
      velocity:{label:'Authored velocity (m/s)',help:'{x,y}: +x right, +y up. Draws a schematic dashed direction arrow. Never calculated from forces or time.',nullLabel:'Velocity unspecified'},
      caption:{label:'Caption',nullLabel:'No caption'},note:{label:'Explanation',nullLabel:'No explanation'}
    },
    picker:{order:48,name:'Force body',category:'Science & sequencing',tagline:'Force changes velocity',description:'A puck with up to four force vectors, net force and a = ΣF/m. Authored velocity distinguishes ongoing motion from acceleration; compare mass in separate trials.'},
    example:function (sample) {
      sample.state.forces = [{label:'Opposing push',x:-4,y:0}]; sample.state.velocity = {x:2,y:0}; sample.state.caption = 'Moving right, accelerating left';
      sample.state.note = 'An opposing force slows a moving puck. It does not make its velocity reverse instantly.';
      sample.panel.initial = builderClone(sample.state); return sample;
    }
  }
});

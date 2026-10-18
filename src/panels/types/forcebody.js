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
    (label ? '<text x="' + (ex + ux * 15) + '" y="' + (ey + uy * 15 + 4) + '" text-anchor="middle">' + esc(label) + '</text>' : '') + '</g>';
}
function forcebodyHTML(panel, state) {
  var m = forcebodyModel(panel, state), fmt = forcebodyFormat;
  var description = m.label + '. ' + m.relation + '. Net force ' + forcebodyPair(m.net, 'N') + '. ' +
    (m.acceleration ? 'Acceleration ' + forcebodyPair(m.acceleration, 'm/s²') + '.' : 'Declare a valid mass to calculate acceleration.') +
    (m.velocity ? ' Authored velocity ' + forcebodyPair(m.velocity, 'm/s') + '.' : '');
  var h = '<div class="forcebody"><div class="forcebody-heading"><span>' + esc(m.trial) + '</span><strong>' + (m.mass === null ? 'Mass required' : fmt(m.mass) + ' kg') + '</strong></div>' +
    '<div class="forcebody-caption">' + esc(m.caption || m.label) + '</div><svg class="forcebody-scene" viewBox="0 0 640 340" role="img" aria-label="' + esc(description) + '">' +
    '<title>' + esc(description) + '</title><rect class="forcebody-surface" x="1" y="1" width="638" height="338" rx="18"/>' +
    '<path class="forcebody-grid" d="M40 70H600M40 120H600M40 170H600M40 220H600M40 270H600M90 50V290M140 50V290M190 50V290M240 50V290M290 50V290M340 50V290M390 50V290M440 50V290M490 50V290M540 50V290"/>' +
    '<text class="forcebody-kicker" x="26" y="30">APPLIED FORCES · N</text><text class="forcebody-kicker" x="444" y="30">RESULTANT</text>' +
    '<path class="forcebody-divider" d="M406 52V244"/><text class="forcebody-axis" x="26" y="55">+x → · +y ↑</text>';
  if (m.speed > 0) {
    var vx = m.velocity.x / m.speed, vy = -m.velocity.y / m.speed;
    [1, 2, 3].forEach(function (i) { h += '<circle class="forcebody-trail" cx="' + (240 - vx * (32 + i * 22)) + '" cy="' + (160 - vy * (32 + i * 22)) + '" r="' + (23 - i * 4) + '" opacity="' + (.38 - i * .08) + '"/>'; });
  }
  h += '<circle class="forcebody-puck-shadow" cx="240" cy="168" r="31"/><circle class="forcebody-puck" cx="240" cy="160" r="30"/><circle class="forcebody-puck-ring" cx="240" cy="160" r="22"/><text class="forcebody-puck-text" x="240" y="165" text-anchor="middle">m</text>';
  m.forces.forEach(function (f, i) { h += forcebodyArrow(240, 160, f.x / m.scale * 105, -f.y / m.scale * 105, 'forcebody-force forcebody-f' + i, 'F' + (i + 1), (i - (m.forces.length - 1) / 2) * 10); });
  h += '<circle class="forcebody-origin" cx="514" cy="160" r="4"/>' + forcebodyArrow(514, 160, m.net.x / m.scale * 105, -m.net.y / m.scale * 105, 'forcebody-net', '', 0) +
    '<text class="forcebody-net-label" x="514" y="240" text-anchor="middle">ΣF = ' + fmt(m.net.magnitude) + ' N</text><text class="forcebody-axis" x="514" y="258" text-anchor="middle">' + esc(forcebodyPair(m.net, 'N')) + '</text>';
  if (m.net.magnitude === 0) h += '<circle class="forcebody-zero" cx="514" cy="160" r="23"/><text class="forcebody-axis" x="514" y="202" text-anchor="middle">Balanced</text>';
  h += '<path class="forcebody-divider" d="M26 270H614"/>';
  if (m.speed > 0) h += forcebodyArrow(60, 305, m.velocity.x / m.speed * 28, -m.velocity.y / m.speed * 28, 'forcebody-velocity', '', 0);
  h += '<text class="forcebody-velocity-text" x="106" y="301">v · ' + esc(m.velocity ? forcebodyPair(m.velocity, 'm/s') : 'not specified') + '</text><text class="forcebody-axis" x="106" y="322">Authored velocity · dashed arrow / trail</text></svg>';
  h += '<div class="forcebody-forces">';
  m.forces.forEach(function (f, i) { h += '<div><b>F' + (i + 1) + '</b><span>' + esc(f.label) + '</span><code>' + esc(forcebodyPair(f, 'N')) + '</code></div>'; });
  if (!m.forces.length) h += '<div><span>No applied forces · ΣF = 0 N</span></div>';
  h += '</div><div class="forcebody-equation"><span>a = ΣF / m</span><strong>' + (m.acceleration ? esc(forcebodyPair(m.acceleration, 'm/s²')) : 'Declare mass in kg') + '</strong><small>' +
    (m.acceleration ? '|a| = ' + fmt(m.acceleration.magnitude) + ' m/s²' : 'Use a positive finite mass') + '</small></div><div class="forcebody-relation">' + esc(m.relation) + '</div>' +
    '<div class="forcebody-key">Force arrows share one scale. Velocity is schematic. Authored snapshots; no trajectory prediction.</div>';
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
.forcebody{--fb-bg:#f5f7fa;--fb-force:#286aaf;--fb-net:#b34827;--fb-motion:#6851aa;color:var(--dtext,#263449);font:13px 'IBM Plex Sans',sans-serif;min-width:0}
.sk-aurora .forcebody,.sk-terminal .forcebody,.sk-blueprint .forcebody{--fb-bg:#162136;--fb-force:#83bcff;--fb-net:#ffc381;--fb-motion:#c6b6ff}
.forcebody-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11px;letter-spacing:.09em;text-transform:uppercase}.forcebody-heading strong{font:600 16px 'IBM Plex Mono',monospace;letter-spacing:0}
.forcebody-caption{font-weight:600;font-size:17px;margin:10px 0 14px;overflow-wrap:anywhere}.forcebody-scene{display:block;width:100%;height:auto;overflow:visible}
.forcebody-surface{fill:color-mix(in srgb,var(--dtext,#263449) 3%,transparent);stroke:color-mix(in srgb,var(--dtext,#263449) 14%,transparent)}
.forcebody-grid{fill:none;stroke:currentColor;opacity:.06;stroke-width:1}.forcebody-divider{stroke:currentColor;opacity:.18;fill:none}
.forcebody-kicker{font:600 11px 'IBM Plex Sans',sans-serif;letter-spacing:1.5px;fill:currentColor}.forcebody-axis{font:11px 'IBM Plex Sans',sans-serif;fill:currentColor;opacity:.78}
.forcebody-puck-shadow{fill:currentColor;opacity:.1}.forcebody-puck{fill:color-mix(in srgb,var(--fb-force) 18%,var(--fb-bg));stroke:var(--fb-force);stroke-width:2}.forcebody-puck-ring{fill:none;stroke:var(--fb-force);opacity:.3}.forcebody-puck-text{font:italic 600 18px Georgia,serif;fill:var(--fb-force)}
.forcebody-trail{fill:none;stroke:var(--fb-motion);stroke-width:2;stroke-dasharray:4 4}.forcebody-force{fill:var(--fb-force);stroke:var(--fb-force);stroke-width:2.5}.forcebody-force text{stroke:none;font:700 12px 'IBM Plex Sans',sans-serif;paint-order:stroke;stroke:var(--fb-bg);stroke-width:3px;stroke-linejoin:round}
.forcebody-net{stroke:var(--fb-net);fill:var(--fb-net);stroke-width:4}.forcebody-net-label{fill:var(--fb-net);font:600 14px 'IBM Plex Mono',monospace}.forcebody-origin{fill:var(--fb-net)}.forcebody-zero{fill:none;stroke:var(--fb-net);stroke-width:2;stroke-dasharray:3 4}
.forcebody-velocity{stroke:var(--fb-motion);fill:var(--fb-motion);stroke-width:2;stroke-dasharray:5 4}.forcebody-velocity polygon{stroke-dasharray:none}.forcebody-velocity-text{fill:var(--fb-motion);font:600 13px 'IBM Plex Mono',monospace}
.forcebody-forces{margin:10px 0}.forcebody-forces>div{display:flex;align-items:baseline;gap:10px;padding:6px 2px;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent)}.forcebody-forces b{font-size:11px}.forcebody-forces span{flex:1;overflow-wrap:anywhere}.forcebody-forces code{font-size:11px;text-align:right}
.forcebody-equation{display:grid;grid-template-columns:auto 1fr;gap:5px 16px;background:color-mix(in srgb,var(--fb-net) 9%,transparent);border-left:3px solid var(--fb-net);padding:13px 15px;border-radius:0 8px 8px 0}.forcebody-equation span{grid-row:span 2;font:italic 18px Georgia,serif;align-self:center}.forcebody-equation strong{font:600 13px 'IBM Plex Mono',monospace}.forcebody-equation small{font-size:11px}
.forcebody-relation{margin-top:12px;font-weight:600}.forcebody-key{font-size:11px;line-height:1.5;opacity:.78;margin-top:5px}.forcebody-note{margin-top:12px;line-height:1.5;overflow-wrap:anywhere}
@media(prefers-reduced-motion:reduce){.forcebody *{animation:none!important;transition:none!important}}
@media print{.forcebody{--fb-force:#174d84;--fb-net:#893617;--fb-motion:#514080;color:#18232e;break-inside:avoid}.forcebody-scene{print-color-adjust:exact}.forcebody-surface{fill:#fff;stroke:#bcc4cc}.forcebody-puck{fill:#e2eaf3}.forcebody-force text{stroke:#fff}}
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
      velocity:{label:'Authored velocity (m/s)',help:'{x,y}: +x right, +y up. Draws a schematic dashed direction arrow and trail. Never calculated from forces or time.',nullLabel:'Velocity unspecified'},
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

/* Ideal, in-phase point sources. Distances share the authored unit; I0 is
   the intensity of one source with constant amplitude at the screen. */
function wavefieldDistance(value) {
  return isFiniteNum(value) && value >= 0.000001 && value <= 1000000;
}
function wavefieldConfig(panel) {
  panel = panelObject(panel) ? panel : {};
  var valid = ['wavelength', 'separation', 'screenDistance'].every(function (key) { return wavefieldDistance(panel[key]); });
  var d = valid ? panel.separation : 4, L = valid ? panel.screenDistance : 10;
  return {valid: valid, wavelength: valid ? panel.wavelength : 1, separation: d, screenDistance: L,
    screenHeight: wavefieldDistance(panel.screenHeight) ? panel.screenHeight : Math.max(2 * d, L),
    unit: typeof panel.unit === 'string' ? panel.unit : 'cm'};
}
function wavefieldSnapshot(raw, panel, path, warnings, allowOnce) {
  var out = {}, cfg = wavefieldConfig(panel);
  function warn(key, message) { if (warnings) warnings.push(path + key + ': ' + message); }
  if (raw == null) return out;
  if (!panelObject(raw)) { warn('', 'expected a state object — ignored'); return out; }
  Object.keys(raw).forEach(function (key) {
    var value = raw[key];
    if (key === 'wavelength' && wavefieldDistance(value)) out.wavelength = value;
    else if (key === 'sources' && (value === 'one' || value === 'two')) out.sources = value;
    else if (key === 'probe' && isFiniteNum(value) && Math.abs(value) <= cfg.screenHeight / 2) out.probe = value;
    else if (key === 'note' && typeof value === 'string') out.note = value;
    else if (key === 'enterOnce' && allowOnce && panelObject(value)) out.enterOnce = wavefieldSnapshot(value, panel, path + '.enterOnce', warnings, false);
    else warn('.' + key, key === 'wavelength' ? 'expected a positive finite distance 0.000001–1000000 — ignored' : key === 'sources' ? 'expected one|two — ignored' : key === 'probe' ? 'expected a finite screen coordinate within ±' + cfg.screenHeight / 2 + ' — ignored' : key === 'note' ? 'expected text — ignored' : key === 'enterOnce' ? 'expected a one-step state object — ignored' : 'unknown field — ignored');
  });
  return out;
}
function wavefieldSample(config, sources, y) {
  var d = config.separation, L = config.screenDistance;
  var r1 = Math.hypot(L, y - d / 2), r2 = Math.hypot(L, y + d / 2);
  /* Rationalized subtraction preserves the small path difference at large L. */
  var delta = 2 * y * d / (r1 + r2);
  var intensity = sources === 'one' ? 1 : 4 * Math.pow(Math.cos(Math.PI * ((delta / config.wavelength) % 1)), 2);
  return {y: y, r1: r1, r2: sources === 'one' ? null : r2, delta: sources === 'one' ? null : delta,
    intensity: intensity, normalized: intensity / 4};
}
function wavefieldModel(panel, state) {
  var cfg = wavefieldConfig(panel), clean = wavefieldSnapshot(state, panel, '', null, false);
  if (clean.wavelength !== undefined) cfg.wavelength = clean.wavelength;
  var sources = clean.sources || 'two', probe = clean.probe === undefined ? 0 : clean.probe;
  var points = [], half = cfg.screenHeight / 2;
  for (var i = 0; i <= 512; i++) points.push(wavefieldSample(cfg, sources, -half + i * cfg.screenHeight / 512));
  /* Include exact extrema as well as uniform samples so narrow fringes do not
     disappear between graph samples. Bound output for hostile declarations. */
  var limit = Math.abs(wavefieldSample(cfg, 'two', half).delta), count = Math.floor(2 * limit / cfg.wavelength);
  if (sources === 'two' && count <= 128) for (var n = -count; n <= count; n++) {
    var delta = n * cfg.wavelength / 2;
    var y = delta / 2 * Math.sqrt(1 + 4 * cfg.screenDistance * cfg.screenDistance / (cfg.separation * cfg.separation - delta * delta));
    if (isFiniteNum(y) && Math.abs(y) <= half) points.push(wavefieldSample(cfg, sources, y));
  }
  points.sort(function (a, b) { return a.y - b.y; });
  var scale = Math.min(360 / cfg.screenDistance, 224 / Math.max(cfg.screenHeight, cfg.separation * 1.35));
  var rings = [], maxR = Math.hypot(cfg.screenDistance, (cfg.screenHeight + cfg.separation) / 2);
  var ringStride = Math.max(1, Math.ceil(maxR / cfg.wavelength / 36));
  for (var r = 1; r <= 36 && r * ringStride * cfg.wavelength <= maxR; r++) rings.push(r * ringStride * cfg.wavelength * scale);
  return {valid: cfg.valid, config: cfg, trial: clean.wavelength !== undefined, sources: sources, probe: wavefieldSample(cfg, sources, probe),
    points: points, scale: scale, rings: rings, ringStride: ringStride, undersampled: sources === 'two' && count > 128,
    note: clean.note || '', classification: sources === 'one' ? 'One-source baseline' : wavefieldSample(cfg, sources, probe).intensity > 3.999 ? 'Bright maximum' : wavefieldSample(cfg, sources, probe).intensity < 0.001 ? 'Dark minimum' : 'Intermediate intensity'};
}
function wavefieldFormat(value) {
  return Math.abs(value) !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 100000) ? value.toExponential(2) : String(Number(value.toFixed(3)));
}
/* Suppress only numerical darkness residuals in the teaching readout; keep
   model/graph intensities untouched and retain meaningful small intensities. */
function wavefieldIntensityFormat(value) {
  return Math.abs(value) < 1e-12 ? '0' : wavefieldFormat(value);
}
function wavefieldHTML(panel, state) {
  var m = wavefieldModel(panel, state), c = m.config, p = m.probe, f = wavefieldFormat;
  var h = '<div class="wavefield-panel">';
  if (!m.valid) return h + '<p>Declare positive wavelength, separation and screenDistance (0.000001–1000000 in one unit).</p></div>';
  var sx = 65, cy = 163, screen = sx + c.screenDistance * m.scale;
  var y = function (v) { return cy - v * m.scale; }, num = function (v) { return v.toFixed(3); };
  var top = y(c.screenHeight / 2), bottom = y(-c.screenHeight / 2), graphX = 490, graphW = 115;
  var summary = (m.sources === 'two' ? 'Two in-phase sources' : 'One source, S2 off') + ', probe y = ' + f(p.y) + ' ' + c.unit + ', I/I₀ = ' + wavefieldIntensityFormat(p.intensity) + ', ' + m.classification;
  h += '<div class="wavefield-head"><strong>' + esc(m.sources === 'two' ? 'Coherent sources' : 'Single source') + '</strong><span>' + esc(m.classification) + '</span></div>';
  h += '<div class="wavefield-parameters">' + esc((m.trial ? 'Wavelength trial · ' : '') + 'λ = ' + f(c.wavelength) + ' ' + c.unit + ' · d = ' + f(c.separation) + ' ' + c.unit + ' · L = ' + f(c.screenDistance) + ' ' + c.unit) + '</div>';
  h += '<svg class="wavefield-svg" viewBox="0 0 650 325" role="img" aria-label="' + esc(summary) + '"><title>' + esc(summary) + '</title><desc>Solid circles and path identify source S1. Dashed circles and path identify source S2. The graph at right shares the screen coordinate and shows intensity relative to one source.</desc>';
  h += '<rect class="wavefield-bg" x="8" y="30" width="445" height="266" rx="12"/>';
  h += '<svg x="10" y="32" width="441" height="262" viewBox="10 32 441 262" overflow="hidden" aria-hidden="true">';
  [1, 2].forEach(function (source) {
    if (source === 2 && m.sources === 'one') return;
    var sy = y((source === 1 ? 1 : -1) * c.separation / 2);
    m.rings.forEach(function (radius) { h += '<circle class="wavefield-wave wavefield-s' + source + '" cx="' + sx + '" cy="' + num(sy) + '" r="' + num(radius) + '"/>'; });
  });
  h += '</svg><line class="wavefield-axis" x1="' + sx + '" y1="' + cy + '" x2="' + num(screen) + '" y2="' + cy + '"/>';
  h += '<line class="wavefield-screen" x1="' + num(screen) + '" y1="' + num(top) + '" x2="' + num(screen) + '" y2="' + num(bottom) + '"/>';
  [1, 2].forEach(function (source) {
    var sy = y((source === 1 ? 1 : -1) * c.separation / 2), off = source === 2 && m.sources === 'one';
    if (!off) h += '<line class="wavefield-path wavefield-s' + source + '" x1="' + sx + '" y1="' + num(sy) + '" x2="' + num(screen) + '" y2="' + num(y(p.y)) + '"/>';
    h += '<circle class="wavefield-source wavefield-s' + source + (off ? ' wavefield-off' : '') + '" cx="' + sx + '" cy="' + num(sy) + '" r="6"/><text class="wavefield-label" x="18" y="' + num(sy - 10) + '">S' + source + (off ? ' off' : '') + '</text>';
  });
  h += '<circle class="wavefield-probe" cx="' + num(screen) + '" cy="' + num(y(p.y)) + '" r="5"/><text class="wavefield-label" x="' + num(screen - 8) + '" y="' + num(y(p.y) - 10) + '" text-anchor="end">P</text>';
  h += '<text class="wavefield-label" x="' + num(screen) + '" y="20" text-anchor="middle">Screen</text><text class="wavefield-label" x="548" y="20" text-anchor="middle">Intensity I/I₀</text>';
  [0, 1, 2, 4].forEach(function (v) { var x = graphX + v / 4 * graphW; h += '<line class="wavefield-grid" x1="' + x + '" y1="' + num(top) + '" x2="' + x + '" y2="' + num(bottom) + '"/><text class="wavefield-tick" x="' + x + '" y="' + num(bottom + 18) + '" text-anchor="middle">' + v + '</text>'; });
  var points = m.points.map(function (point) { return num(graphX + point.normalized * graphW) + ',' + num(y(point.y)); }).join(' ');
  h += '<polyline class="wavefield-curve" points="' + points + '"/><line class="wavefield-guide" x1="' + num(screen + 8) + '" y1="' + num(y(p.y)) + '" x2="' + (graphX + graphW) + '" y2="' + num(y(p.y)) + '"/><circle class="wavefield-probe" cx="' + num(graphX + p.normalized * graphW) + '" cy="' + num(y(p.y)) + '" r="4"/>';
  [c.screenHeight / 2, 0, -c.screenHeight / 2].forEach(function (v) { h += '<text class="wavefield-tick" x="642" y="' + num(y(v) + 4) + '" text-anchor="end">' + esc(f(v)) + '</text>'; });
  h += '<text class="wavefield-tick" x="642" y="' + num(bottom + 34) + '" text-anchor="end">' + esc('y (' + c.unit + ')') + '</text></svg>';
  h += '<div class="wavefield-readouts"><span>r₁ <b>' + esc(f(p.r1) + ' ' + c.unit) + '</b></span><span>r₂ <b>' + (p.r2 === null ? 'off' : esc(f(p.r2) + ' ' + c.unit)) + '</b></span><span>Δr = r₂ − r₁ <b>' + (p.delta === null ? '—' : esc(f(p.delta / c.wavelength) + ' λ')) + '</b></span><span>I/I₀ <b>' + wavefieldIntensityFormat(p.intensity) + '</b></span></div>';
  h += '<p class="wavefield-equation">' + esc('Probe y = ' + f(p.y) + ' ' + c.unit + ' · ' + (m.sources === 'two' ? 'I/I₀ = 4 cos²(π Δr/λ)' : 'I/I₀ = 1 across the screen')) + '</p>';
  h += '<p class="wavefield-assumptions">Ideal in-phase point sources; equal amplitudes at the screen. Omits diffraction envelope and geometric spreading. I₀ is one-source intensity.</p>';
  if (m.ringStride > 1) h += '<p class="wavefield-assumptions">Wavefronts shown every ' + m.ringStride + ' wavelengths.</p>';
  if (m.undersampled) h += '<p class="wavefield-assumptions">Dense fringes: graph is sampled; probe calculation remains exact. Increase wavelength to inspect individual fringes.</p>';
  if (m.note) h += '<p class="wavefield-note">' + esc(m.note) + '</p>';
  return h + '</div>';
}
PanelRegistry.define('wavefield', {
  label: 'Wave interference', since: '0.2.0', order: 51,
  validateDeclaration: function (panel, path, warnings) {
    ['wavelength', 'separation', 'screenDistance'].forEach(function (key) { if (!wavefieldDistance(panel[key])) warnings.push(path + '.' + key + ': expected a positive finite distance 0.000001–1000000'); });
    if (panel.screenHeight !== undefined && !wavefieldDistance(panel.screenHeight)) warnings.push(path + '.screenHeight: expected a positive finite distance 0.000001–1000000 — using default');
    if (panel.unit !== undefined && typeof panel.unit !== 'string') warnings.push(path + '.unit: expected text — using cm');
    wavefieldSnapshot(panel.initial, panel, path + '.initial', warnings, false);
  },
  validatePatch: function (patch, path, panel, warnings) { wavefieldSnapshot(patch, panel, path, warnings, true); },
  fold: function (panel, steps) { return foldSanitizedPanelStates(panel, steps, function (raw, once) { return wavefieldSnapshot(raw, panel, '', null, once); }); },
  render: function (host, panel, state) { return {html: wavefieldHTML(panel, state)}; },
  presentation: {ambientInitial: true},
  layout: {sectionSizing: {minWidth: 480, preferredWidth: 700, maxWidth: 1100, aspectPolicy: 'content', grow: 1}},
  styles: String.raw`
.wavefield-panel{color:var(--dtext);font:12px/1.45 'IBM Plex Sans',sans-serif;--wf-a:#36bfd0;--wf-b:#e7a55b;min-width:0}
.sk-daylight .wavefield-panel,.sk-editorial .wavefield-panel{--wf-a:#086b7b;--wf-b:#9b541d}
.wavefield-head{display:flex;justify-content:space-between;gap:12px;color:var(--dink);font-size:14px}
.wavefield-head span{font-size:11px;border:1px solid currentColor;border-radius:20px;padding:2px 9px}
.wavefield-parameters,.wavefield-assumptions{color:var(--dfaint);font-size:11px;margin:7px 0}
.wavefield-svg{width:100%;height:auto;display:block;overflow:visible}
.wavefield-bg{fill:color-mix(in srgb,var(--dtext) 5%,transparent)}
.wavefield-s1{stroke:var(--wf-a)}.wavefield-s2{stroke:var(--wf-b);stroke-dasharray:5 4}
.wavefield-wave{fill:none;stroke-width:1;opacity:.24}
.wavefield-path{stroke-width:2;fill:none}.wavefield-source{fill:var(--dink);stroke-width:2}
.wavefield-off{fill:none;opacity:.45}.wavefield-probe{fill:var(--dink);stroke:var(--dtext);stroke-width:1}
.wavefield-axis,.wavefield-grid{stroke:var(--dtext);opacity:.15;stroke-width:1}
.wavefield-screen{stroke:var(--dink);stroke-width:3}.wavefield-guide{stroke:var(--dtext);stroke-width:1;stroke-dasharray:2 4;opacity:.6}
.wavefield-label{fill:var(--dink);font:600 12px 'IBM Plex Sans',sans-serif}.wavefield-tick{fill:var(--dtext);font:10px 'IBM Plex Mono',monospace}
.wavefield-curve{fill:none;stroke:var(--dink);stroke-width:1.8;stroke-linejoin:round}
.wavefield-readouts{display:flex;flex-wrap:wrap;gap:8px 24px;border-top:1px solid color-mix(in srgb,var(--dtext) 20%,transparent);padding-top:10px}
.wavefield-readouts span{display:flex;flex-direction:column;font-size:10px}.wavefield-readouts b{color:var(--dink);font:600 14px 'IBM Plex Mono',monospace}
.wavefield-equation{font:11px 'IBM Plex Mono',monospace;color:var(--dink)}.wavefield-note{border-left:3px solid var(--wf-a);padding-left:10px}
@media (prefers-reduced-motion:reduce){.wavefield-panel *{animation:none!important;transition:none!important}}
@media print{.wavefield-panel{--wf-a:#086b7b;--wf-b:#9b541d;color:#222;--dtext:#333;--dink:#111;--dfaint:#444;break-inside:avoid}.wavefield-svg{-webkit-print-color-adjust:exact;print-color-adjust:exact}.wavefield-wave{opacity:.4}}
`,
  authoring: {
    initialFields: true, transientFields: ['sources', 'probe', 'wavelength', 'note'],
    template: {title: 'Wave interference', wavelength: 1, separation: 4, screenDistance: 10, screenHeight: 12, unit: 'cm', initial: {sources: 'two', probe: 0}},
    setupFields: [['wavelength', 'num'], ['separation', 'num'], ['screenDistance', 'num'], ['screenHeight', 'num'], ['unit', 'text']],
    patchFields: [['sources', 'enum', ['one', 'two']], ['probe', 'num'], ['wavelength', 'num'], ['note', 'text']],
    fieldMeta: {wavelength: {label: 'Wavelength λ', help: 'Use the same distance unit for all geometry. A step value starts a new wavelength trial; all paths and intensities are recalculated.'}, separation: {label: 'Source separation d'}, screenDistance: {label: 'Screen distance L'}, screenHeight: {label: 'Screen height', help: 'Defaults to max(2 × separation, screenDistance).'}, unit: {label: 'Distance unit'}, sources: {label: 'Active sources', help: 'Two equal, in-phase sources, or S1 alone.'}, probe: {label: 'Probe y', help: 'Signed screen coordinate; zero is the centre, positive is upward. Must lie within half the screen height.'}, note: {label: 'Teaching note'}},
    picker: {order: 51, name: 'Wave interference', category: 'Science & sequencing', tagline: 'From path difference to bright and dark fringes', description: 'Two coherent point sources, exact paths and a probe on a shared intensity graph. Assumes equal amplitudes; omits diffraction envelope and geometric spreading. Deterministic authored snapshots.'},
    example: function (sample) { sample.state = {sources: 'two', probe: 1.3, note: 'Move the probe: a half-wavelength path difference makes a dark fringe.'}; sample.panel.initial = JSON.parse(JSON.stringify(sample.state)); return sample; }
  }
});

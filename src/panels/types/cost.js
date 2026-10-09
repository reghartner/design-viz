/* Authored linear cost estimates. No provider prices or billing rules are inferred. */
function costNumber(value) {
  return isFiniteNum(value) && value >= 0;
}
function costMessages(value) {
  return costNumber(value) && Number.isSafeInteger(value);
}
function costDeclarationWarnings(panel, path, warnings, errors, diagram) {
  var routes = panelCollectionItems(panel, 'routes', 6);
  if (panel.density !== undefined && ['auto','compact','expanded'].indexOf(panel.density) < 0)
    warnings.push(path + '.density: expected auto, compact or expanded; using auto');
  panelCollectionWarnings(panel, path, warnings, 'routes', 6);
  if (!Array.isArray(panel.routes) || !routes.length || panel.routes.length > 6 || routes.length !== panel.routes.length)
    warnings.push(path + '.routes: declare 1–6 entries with unique string ids; totals unavailable otherwise');
  if (panel.unit !== undefined && (typeof panel.unit !== 'string' || !panel.unit.trim()))
    warnings.push(path + '.unit: expected a non-empty workload label; using messages');
  if (panel.currency !== undefined && (typeof panel.currency !== 'string' || !/^[A-Z]{3}$/.test(panel.currency)))
    warnings.push(path + '.currency: expected a three-letter currency code; totals unavailable');
  if (!Array.isArray(panel.items) || !panel.items.length || panel.items.length > 24)
    warnings.push(path + '.items: expected 1–24 cost lines; totals unavailable');
  (Array.isArray(panel.items) ? panel.items : []).forEach(function (item, i) {
    var at = path + '.items[' + i + ']';
    if (!panelObject(item)) { warnings.push(at + ': expected a cost line; totals unavailable'); return; }
    if (!routes.some(function (route) { return route.id === item.route; }))
      warnings.push(at + '.route: unknown route; totals unavailable');
    if (!costNumber(item.perMillion))
      warnings.push(at + '.perMillion: expected a finite non-negative rate; route is unpriced');
    if (item.fixed !== undefined && !costNumber(item.fixed))
      warnings.push(at + '.fixed: expected a finite non-negative cost for the authored period; route is unpriced');
    if (item.node !== undefined && (typeof item.node !== 'string' || (diagram && !panelOwn(diagram.nodes, item.node))))
      warnings.push(at + '.node: expected an existing engineering node id');
  });
  routes.forEach(function (route) {
    if (!Array.isArray(panel.items) || !panel.items.some(function (item) { return panelObject(item) && item.route === route.id; }))
      warnings.push(path + '.items: route "' + route.id + '" needs at least one cost line');
  });
  costPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function costPatchWarnings(state, path, panel, warnings) {
  if (state == null) return;
  if (!panelObject(state)) { warnings.push(path + ': expected a state object'); return; }
  if (panelOwn(state, 'messages') && !costMessages(state.messages))
    warnings.push(path + '.messages: expected a non-negative safe integer; totals unavailable');
  if (panelOwn(state, 'activeRoute') && state.activeRoute !== null && state.activeRoute !== '' &&
      !panelCollectionItems(panel, 'routes', 6).some(function (route) { return route.id === state.activeRoute; }))
    warnings.push(path + '.activeRoute: unknown route; no route highlighted');
  if (panelOwn(state, 'enterOnce')) costPatchWarnings(state.enterOnce, path + '.enterOnce', panel, warnings);
}
function costModel(panel, state) {
  state = panelObject(state) ? state : {};
  var messages = panelOwn(state, 'messages') ? state.messages : 1000000;
  if (!costMessages(messages)) messages = null;
  var declarations = panelCollectionItems(panel, 'routes', 6);
  var items = Array.isArray(panel.items) ? panel.items : [];
  var valid = Array.isArray(panel.routes) && panel.routes.length >= 1 && panel.routes.length <= 6 && declarations.length === panel.routes.length &&
    items.length > 0 && items.length <= 24 && items.every(function (item) {
      return panelObject(item) && declarations.some(function (route) { return route.id === item.route; });
    }) && declarations.every(function (route) {
      return items.some(function (item) { return panelObject(item) && item.route === route.id; });
    }) && (panel.currency === undefined || (typeof panel.currency === 'string' && /^[A-Z]{3}$/.test(panel.currency)));
  var routes = declarations.map(function (route) {
    var lines = items.slice(0, 24).filter(function (item) { return panelObject(item) && item.route === route.id; });
    var rate = 0, fixed = 0, known = valid && lines.length > 0 && messages !== null;
    var nodes = [];
    var rows = lines.map(function (item) {
      var priced = costNumber(item.perMillion) && (item.fixed === undefined || costNumber(item.fixed));
      if (typeof item.node === 'string' && item.node && nodes.indexOf(item.node) < 0) nodes.push(item.node);
      if (priced) { rate += item.perMillion; fixed += item.fixed === undefined ? 0 : item.fixed; }
      else known = false;
      var total = valid && priced && messages !== null ? item.perMillion * (messages / 1000000) + (item.fixed || 0) : null;
      if (!costNumber(total)) { total = null; known = false; }
      return {label: item.label || item.node || 'Cost line', node: item.node, rate: priced ? item.perMillion : null,
        fixed: priced ? (item.fixed || 0) : null, total: total};
    });
    var variable = rate * (messages / 1000000), total = variable + fixed;
    if (!costNumber(total) || !costNumber(rate) || !costNumber(fixed)) known = false;
    return {id: route.id, label: route.label || route.id, tradeoff: route.tradeoff || '', active: state.activeRoute === route.id,
      rows: rows, nodes: nodes, rate: known ? rate : null, fixed: known ? fixed : null,
      variable: known ? variable : null, total: known ? total : null};
  });
  var comparable = routes.length === 2 && routes.every(function (route) { return route.total !== null; });
  var delta = comparable ? routes[1].total - routes[0].total : null;
  // Treat floating-point round-off at a crossover as a tie.
  if (delta !== null && Math.abs(delta) <= Number.EPSILON * Math.max(1, routes[0].total, routes[1].total) * 8) delta = 0;
  var crossover = null;
  if (comparable && routes[0].rate !== routes[1].rate) {
    var crossing = (routes[1].fixed - routes[0].fixed) / (routes[0].rate - routes[1].rate) * 1000000;
    if (costNumber(crossing) && crossing > 0 && crossing <= Number.MAX_SAFE_INTEGER) crossover = crossing;
  }
  return {messages: messages, valid: valid, unit: typeof panel.unit === 'string' && panel.unit.trim() ? panel.unit : 'messages', currency: panel.currency || 'USD', routes: routes, delta: delta,
    percent: comparable && routes[0].total > 0 ? Math.abs(delta) / routes[0].total * 100 : null, crossover: crossover};
}
function costAmount(value, currency) {
  if (value === null) return 'Unpriced';
  return currency + ' ' + value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2});
}
function costCount(value) {
  return value.toLocaleString('en-US', {maximumFractionDigits: 0});
}
function costChartModel(model) {
  var colors = ['#7d9bc6', '#8b7fd5', '#55a896', '#d7a34f', '#d67e82', '#839c60'];
  var keys = [];
  var max = Math.max.apply(null, [0].concat(model.routes.map(function (route) { return route.total || 0; })));
  return {max: max, routes: model.routes.map(function (route) {
    var flow = [], seen = [];
    var segments = [];
    route.rows.forEach(function (row) {
      var key = row.node || row.label, colorIndex = keys.indexOf(key);
      if (colorIndex < 0) {
        colorIndex = keys.length; keys.push(key);
      }
      var color = colors[colorIndex % colors.length];
      if (seen.indexOf(key) < 0) { seen.push(key); flow.push({label: key, color: color}); }
      if (route.total === null || row.total === null || !max) return;
      var usage = row.rate * (model.messages / 1000000);
      if (usage > 0) segments.push({label: row.label, cost: usage, fixed: false, color: color, pct: usage / max * 100});
      if (row.fixed > 0) segments.push({label: row.label, cost: row.fixed, fixed: true, color: color, pct: row.fixed / max * 100});
    });
    return {route: route, flow: flow, segments: segments, pct: max && route.total !== null ? route.total / max * 100 : 0};
  })};
}
function costHTML(panel, state) {
  var model = costModel(panel, state), chart = costChartModel(model);
  var money = function (value) { return esc(costAmount(value, model.currency)); };
  var comparison = model.routes.length === 2 && Array.isArray(panel.routes) && panel.routes.length === 2;
  var density = ['compact','expanded'].indexOf(panel.density) >= 0 ? panel.density : 'auto';
  var routeCount = model.routes.length;
  var h = '<div class="cost-panel cost-' + density + (comparison ? ' cost-comparison' : ' cost-breakdown') + (routeCount === 1 ? ' cost-single' : '') +
    (routeCount >= 3 ? ' cost-many' : '') + ' cost-count-' + routeCount + '"><div class="cost-basis"><span>AUTHORED COST ESTIMATE</span><strong>' +
    (model.messages === null ? 'Unknown volume' : costCount(model.messages) + ' ' + esc(model.unit)) +
    '</strong><span>' + esc(panel.period || 'per month') + '</span></div>';
  if (!model.valid) h += '<p class="cost-invalid">Totals unavailable. Declare 1–6 unique entries and 1–24 cost lines, with at least one line per entry and a valid currency.</p>';
  h += '<div class="cost-chart-caption"><span>COST BREAKDOWN</span><span>' + (routeCount > 1 ? 'Same scale · ' : '') +
    'stacked by component</span></div><div class="cost-routes" style="--cost-route-count:' + Math.max(1, routeCount) + '">';
  chart.routes.forEach(function (entry, index) {
    var route = entry.route;
    var gap = model.delta !== null && model.delta !== 0 && ((model.delta > 0 && index === 0) || (model.delta < 0 && index === 1));
    h += '<section class="cost-route cost-route-' + index + (route.active ? ' cost-active' : '') + '" aria-label="' +
      esc((comparison ? (index ? 'Alternative: ' : 'Baseline: ') : 'Operation: ') + route.label + (route.active ? '. Following' : '')) + '">' +
      '<div class="cost-route-heading"><span class="cost-tag">' + (comparison ? (index ? 'B · ALTERNATIVE' : 'A · BASELINE') : 'OPERATION') +
      '</span>' + (route.active ? '<span class="cost-following">Following</span>' : '') + '</div>' +
      '<h4>' + esc(route.label) + '</h4><div class="cost-total">' + money(route.total) + '</div>';
    h += '<div class="cost-plot" role="img" aria-label="' + esc(route.label + ': ' + costAmount(route.total, model.currency) +
      '. ' + entry.segments.map(function (segment) { return segment.label + (segment.fixed ? ' fixed: ' : ' usage: ') + costAmount(segment.cost, model.currency); }).join('; ')) + '">';
    if (gap && chart.max) {
      var gapPct = Math.abs(model.delta) / chart.max * 100;
      h += '<div class="cost-gap" style="--cost-gap-pct:' + gapPct.toFixed(6) + '%">' +
        (gapPct > 18 ? '<span>' + money(Math.abs(model.delta)) + '<small>difference</small></span>' : '') + '</div>';
    }
    h += '<div class="cost-stack" style="--cost-pct:' + entry.pct.toFixed(6) + '%">';
    entry.segments.forEach(function (segment) {
      var share = route.total > 0 ? segment.cost / route.total * 100 : 0;
      h += '<div class="cost-segment' + (segment.fixed ? ' cost-fixed' : '') + '" style="--cost-share:' + share.toFixed(6) +
        '%;--cost-color:' + segment.color + '" title="' + esc(segment.label + (segment.fixed ? ' · fixed ' : ' · usage ') + costAmount(segment.cost, model.currency)) + '">' +
        (segment.pct > 13 ? '<span>' + money(segment.cost) + (segment.fixed ? '<small>fixed</small>' : '') + '</span>' : '') + '</div>';
    });
    h += '</div>' + (route.total === null ? '<span class="cost-no-bar">Rate needed</span>' : route.total === 0 ? '<span class="cost-no-bar">No charge</span>' : '') + '</div>';
    if (!comparison) {
      h += '<ol class="cost-components" aria-label="' + esc(route.label + ' cost components') + '">';
      route.rows.forEach(function (row) {
        var color = entry.flow.find(function (component) { return component.label === (row.node || row.label); }).color;
        h += '<li><span class="cost-node-dot" style="--cost-color:' + color + '" aria-hidden="true"></span><span class="cost-component-label">' + esc(row.label) + '</span><b>' + money(row.total) + '</b><span class="cost-component-share">' +
          (route.total > 0 && row.total !== null ? (row.total / route.total * 100).toFixed(1) + '%' : '—') + '</span></li>';
      });
      h += '</ol>';
    }
    if (comparison) h += '<div class="cost-nodes">' + route.nodes.length + ' linked engineering nodes</div><ol class="cost-flow" aria-label="' + esc(route.label + ' engineering path') + '">';
    if (comparison) entry.flow.forEach(function (node) {
      h += '<li style="--cost-color:' + node.color + '"><span class="cost-node-dot" aria-hidden="true"></span><span title="' + esc(node.label) + '">' + esc(node.label) + '</span></li>';
    });
    h += (comparison ? '</ol>' : '') + '</section>';
  });
  h += '</div><div class="cost-chart-key"><span class="cost-key-solid" aria-hidden="true"></span> Usage <span class="cost-key-fixed" aria-hidden="true"></span> Fixed charge</div>';
  if (comparison) {
    h += '<div class="cost-delta"><span class="cost-delta-icon" aria-hidden="true">' + (model.delta === null ? '?' : model.delta === 0 ? '=' : model.delta < 0 ? '↘' : '↗') +
      '</span><div><span class="cost-tag">ALTERNATIVE VS BASELINE</span><strong>';
    if (model.delta === null) h += 'Comparison unavailable';
    else if (model.delta === 0) h += 'Same estimated cost';
    else h += money(Math.abs(model.delta)) + (model.delta < 0 ? ' less' : ' more') +
      (model.percent !== null && Number.isFinite(model.percent) ? ' <small>(' + model.percent.toFixed(1) + '%)</small>' : '');
    h += '</strong>' + (model.crossover !== null ? '<span>Break-even ≈ ' + costCount(model.crossover) + ' ' + esc(model.unit) + ' ' + esc(panel.period || 'per month') + '</span>' : '') + '</div></div>';
  }
  h += '<details class="cost-details"><summary>Rates, assumptions &amp; tradeoffs</summary><div class="cost-detail-routes">';
  model.routes.forEach(function (route) {
    h += '<section><h4>' + esc(route.label) + '</h4><ol class="cost-lines">';
    route.rows.forEach(function (row) {
      h += '<li><div class="cost-line-title"><span>' + esc(row.label) + '</span><b>' + money(row.total) + '</b></div>' +
        '<div class="cost-line-rate">' + (row.rate === null ? 'Rate needed' : money(row.rate) + ' / 1M ' + esc(model.unit) + (row.fixed ? ' + ' + money(row.fixed) + ' fixed' : '')) + '</div></li>';
    });
    h += '</ol>' + (route.tradeoff ? '<p class="cost-tradeoff">' + esc(route.tradeoff) + '</p>' : '') + '</section>';
  });
  h += '</div><div class="cost-assumptions"><b>Basis &amp; exclusions</b><p>' + esc(panel.assumptions || 'Authored estimates. Confirm rates, billing units and exclusions before using for a decision.') + '</p></div>';
  if (state && state.note) h += '<p class="cost-note">' + esc(state.note) + '</p>';
  return h + '</details></div>';
}
/* One compact rule set serves an authored choice and responsive small panels. */
function costCompactStyles(scope) {
  return String.raw`
.C .cost-basis{flex-direction:row;align-items:baseline;flex-wrap:wrap;gap:3px 6px;margin-bottom:8px}
.C .cost-basis>span:first-child{display:none}.C .cost-basis strong{font-size:16px}.C .cost-basis>span:last-child{font-size:10px}
.C .cost-basis::after{content:'· estimate';font-size:9px;color:var(--dfaint)}
.C .cost-chart-caption,.C .cost-nodes{display:none}
.C .cost-route-heading{position:absolute;width:1px;height:1px;min-height:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.C .cost-routes{grid-template-columns:minmax(0,1fr);gap:5px}
.C.cost-many .cost-routes{grid-template-columns:repeat(var(--cost-route-count),minmax(0,1fr))}
.C .cost-route{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto 22px auto;grid-row:auto;gap:4px 8px;padding:6px 4px;border-radius:5px}
.C .cost-route h4{grid-column:1;grid-row:1;min-height:0;font-size:11px;margin:0;align-self:center}
.C.cost-comparison .cost-route-0 h4::before{content:'A · ';color:var(--dfaint)}.C.cost-comparison .cost-route-1 h4::before{content:'B · ';color:var(--dfaint)}
.C .cost-total{grid-column:2;grid-row:1;font-size:14px;margin:0;align-self:center}
.C .cost-plot{grid-column:1/-1;grid-row:2;height:22px;border:0;border-radius:4px;background:repeating-linear-gradient(to right,transparent 0 calc(25% - 1px),color-mix(in srgb,var(--dtext) 10%,transparent) calc(25% - 1px) 25%)}
.C .cost-stack{height:100%;width:var(--cost-pct);left:0;bottom:0;flex-direction:row;border-radius:4px;box-shadow:none}
.C .cost-segment{height:100%;width:var(--cost-share)}.C .cost-segment>span,.C .cost-gap>span{display:none}
.C .cost-gap{height:100%;width:var(--cost-gap-pct);left:auto;right:0;top:0;border:1px dashed color-mix(in srgb,var(--dtext) 35%,transparent);border-left:0;border-radius:0 4px 4px 0}
.C .cost-no-bar{bottom:3px;font-size:10px}
.C .cost-components{grid-column:1/-1;grid-row:3}.C .cost-components li{font-size:10px;padding:3px 0}
.C.cost-many .cost-route{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto 22px auto;gap:2px;padding:7px 5px}
.C.cost-many .cost-route h4{grid-column:1;grid-row:1;min-height:30px;align-self:start}
.C.cost-many .cost-total{grid-column:1;grid-row:2;font-size:13px;white-space:normal}
.C.cost-many .cost-plot{grid-column:1;grid-row:3}.C.cost-many .cost-components{grid-column:1;grid-row:4}
.C .cost-flow{grid-column:1/-1;grid-row:3;gap:3px 5px;flex-wrap:nowrap;overflow:hidden}
.C .cost-flow li{gap:3px;font-size:9px;flex-shrink:1}.C .cost-flow li:not(:last-child)::after{margin-left:2px}.C .cost-node-dot{width:7px;height:7px;border-radius:2px}
.C .cost-chart-key{font-size:9px;margin:6px 0 0;gap:4px}.C .cost-key-solid,.C .cost-key-fixed{width:8px;height:8px}
.C .cost-delta{gap:7px;padding:7px 9px;margin-top:7px;border-radius:6px}.C .cost-delta-icon{font-size:21px}.C .cost-delta .cost-tag{display:none}.C .cost-delta strong{font-size:15px}.C .cost-delta small{font-size:11px}.C .cost-delta>div{gap:1px}.C .cost-delta>div>span:last-child:not(.cost-tag){font-size:9px}
.C .cost-details{margin-top:7px;padding-top:6px}.C .cost-details summary{font-size:10px}.C .cost-detail-routes{grid-template-columns:1fr}
`.replace(/\.C\b/g, scope);
}
PanelRegistry.define('cost', {
  label: 'Cost breakdown / comparison', since: '0.1.0', order: 26,
  validateDeclaration: costDeclarationWarnings, validatePatch: costPatchWarnings,
  render: function (host, panel, state) { return {html: costHTML(panel, state)}; },
  references: {nodes: ['items.*.node']},
  presentation: {ambientInitial: true},
  layout: {
    sectionSizing: { minWidth: 420, preferredWidth: 570, maxWidth: 1000, aspectPolicy: 'content', grow: 1 },large: true, height: 17, fallbackHeight: 17},
  styles: String.raw`
.docview .section-layout-tile>.pt-cost{scrollbar-gutter:stable;scrollbar-width:thin}
.cost-panel{font-size:12px;line-height:1.5;color:var(--dtext);min-width:0;container-type:inline-size;overflow-wrap:anywhere}
.cost-basis{display:flex;flex-direction:column;gap:3px;margin-bottom:20px}
.cost-basis>span:first-child,.cost-tag,.cost-chart-caption{font-size:9px;font-weight:700;letter-spacing:1px;color:var(--dfaint)}
.cost-basis strong{font-size:25px;line-height:1.2;color:var(--dink)}
.cost-basis>span:last-child{font-size:11px;color:var(--dfaint)}
.cost-chart-caption{display:flex;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid color-mix(in srgb,var(--dtext) 18%,transparent)}
.cost-chart-caption>span:last-child{font-weight:400;letter-spacing:0;text-align:right}
.cost-routes{display:grid;grid-template-columns:repeat(var(--cost-route-count),minmax(0,1fr));column-gap:20px;row-gap:0}
.cost-route{display:grid;grid-template-rows:subgrid;grid-row:span 6;position:relative;min-width:0;padding:14px 10px 10px;border-radius:8px;border:1px solid transparent}
.cost-single .cost-routes,.cost-single .cost-detail-routes{grid-template-columns:minmax(0,1fr)}
.cost-breakdown .cost-route{grid-row:span 5}
.cost-components{list-style:none;padding:0;margin:12px 0 0;align-self:start}
.cost-components li{display:grid;grid-template-columns:11px minmax(0,1fr) auto 42px;align-items:center;gap:7px;padding:6px 0;border-top:1px solid color-mix(in srgb,var(--dtext) 12%,transparent);font-size:11px}
.cost-components b{font-variant-numeric:tabular-nums;font-weight:600}.cost-component-share{text-align:right;color:var(--dfaint)}
.cost-many .cost-routes{column-gap:8px}
.cost-many .cost-route{padding:10px 7px 8px}
.cost-many .cost-route-heading{min-height:15px}.cost-many .cost-tag{font-size:8px;letter-spacing:.7px}
.cost-many .cost-route h4{font-size:12px;line-height:1.25;min-height:45px;margin:3px 0 4px}
.cost-many .cost-total{font-size:17px;margin-bottom:9px;white-space:normal}
.cost-many .cost-plot{height:145px}.cost-many .cost-stack{left:12%;width:76%}
.cost-many .cost-segment>span{display:none}
.cost-many .cost-components{margin-top:8px}
.cost-many .cost-components li{grid-template-columns:8px minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:start;gap:1px 5px;padding:5px 0;font-size:10px}
.cost-many .cost-components .cost-node-dot{grid-column:1;grid-row:1/3;width:8px;height:8px;margin-top:3px}
.cost-many .cost-component-label{grid-column:2/4;grid-row:1;line-height:1.25}
.cost-many .cost-components b{grid-column:2;grid-row:2}
.cost-many .cost-component-share{grid-column:3;grid-row:2;min-width:34px}
.cost-active{border-color:color-mix(in srgb,var(--dtext) 32%,transparent);background:color-mix(in srgb,var(--dtext) 3%,transparent)}
.cost-route-heading{display:flex;justify-content:space-between;flex-wrap:wrap;gap:5px;min-height:19px}
.cost-following{font-size:9px;color:var(--dink);font-weight:600}
.cost-route h4{font-size:14px;line-height:1.3;min-height:36px;margin:4px 0 5px;color:var(--dink)}
.cost-total{font:600 24px/1.3 'IBM Plex Mono',monospace;color:var(--dink);font-variant-numeric:tabular-nums;margin-bottom:15px}
.cost-plot{height:230px;position:relative;border-bottom:2px solid color-mix(in srgb,var(--dtext) 28%,transparent);background:repeating-linear-gradient(to top,transparent 0 calc(25% - 1px),color-mix(in srgb,var(--dtext) 9%,transparent) calc(25% - 1px) 25%)}
.cost-stack{height:var(--cost-pct);position:absolute;bottom:0;left:18%;width:64%;display:flex;flex-direction:column-reverse;overflow:hidden;border-radius:7px 7px 0 0;box-shadow:0 3px 14px #1720330d}
.cost-segment{height:var(--cost-share);flex:none;position:relative;background:var(--cost-color);min-height:0;display:flex;align-items:center;justify-content:center;color:#10222c;font:600 15px/1.25 'IBM Plex Mono',monospace;text-align:center;overflow:hidden}
.cost-segment small{display:block;font:500 10px/1.5 'IBM Plex Sans',sans-serif}
.cost-fixed{background:repeating-linear-gradient(135deg,transparent 0 5px,#fff4 5px 8px),var(--cost-color)}
.cost-gap{height:var(--cost-gap-pct);position:absolute;top:0;left:18%;width:64%;box-sizing:border-box;border:1px dashed color-mix(in srgb,var(--dtext) 40%,transparent);border-bottom:0;border-radius:7px 7px 0 0;display:flex;align-items:center;justify-content:center;color:var(--dfaint);text-align:center;font-size:14px}
.cost-gap small{display:block;font-size:10px;margin-top:3px}
.cost-no-bar{position:absolute;bottom:12px;left:0;right:0;text-align:center;color:var(--dfaint)}
.cost-nodes{font-size:10px;color:var(--dfaint);margin:12px 0 9px}
.cost-flow{list-style:none;display:flex;flex-wrap:wrap;align-items:center;gap:7px 12px;padding:0;margin:0}
.cost-flow li{display:flex;align-items:center;gap:5px;min-width:0;max-width:100%;font-size:11px;color:var(--dink)}
.cost-flow li:not(:last-child)::after{content:'→';color:var(--dfaint);margin-left:5px}
.cost-flow li>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cost-node-dot{flex:none;width:11px;height:11px;border-radius:3px;background:var(--cost-color)}
.cost-chart-key{display:flex;align-items:center;justify-content:center;gap:6px;font-size:10px;color:var(--dfaint);margin:12px 0 4px}
.cost-key-solid,.cost-key-fixed{width:12px;height:12px;border-radius:2px;background:#9ba3b2}.cost-key-fixed{margin-left:10px;background:repeating-linear-gradient(135deg,#9ba3b2 0 3px,#dce1e9 3px 5px)}
.cost-delta{display:flex;align-items:center;gap:15px;border-radius:10px;background:color-mix(in srgb,var(--dtext) 7%,transparent);padding:13px 15px;margin-top:16px;color:var(--dink)}
.cost-delta-icon{font:400 43px/1 sans-serif;color:var(--dfaint)}.cost-delta>div{display:flex;flex-direction:column;gap:4px;min-width:0}.cost-delta strong{font-size:23px}.cost-delta small{font-size:13px;font-weight:500}.cost-delta>div>span:last-child:not(.cost-tag){font-size:10px}
.cost-details{margin-top:13px;border-top:1px solid color-mix(in srgb,var(--dtext) 16%,transparent);padding-top:10px}.cost-details summary{cursor:pointer;color:var(--dtext);font-size:11px}.cost-details summary:focus-visible{outline:2px solid var(--dink);outline-offset:3px}
.cost-detail-routes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.cost-detail-routes h4{font-size:12px;color:var(--dink);margin:14px 0 5px}
.cost-lines{list-style:none;padding:0;margin:0}.cost-lines li{padding:7px 0;border-top:1px solid color-mix(in srgb,var(--dtext) 12%,transparent)}
.cost-line-title{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--dink)}.cost-line-title b{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.cost-line-rate{font-size:9px;color:var(--dfaint);margin-top:2px}
.cost-tradeoff{font-size:10px;margin:9px 0 0}.cost-assumptions{margin-top:13px;font-size:10px;color:var(--dfaint)}.cost-assumptions b{color:var(--dtext)}.cost-assumptions p{margin:3px 0 0}.cost-note{font-size:11px;margin:10px 0 0}
@container(max-width:420px){.cost-routes{column-gap:8px}.cost-route{padding:12px 3px 8px}.cost-route h4{font-size:12px}.cost-total{font-size:18px}.cost-stack,.cost-gap{left:10%;width:80%}.cost-segment{font-size:11px}.cost-gap{font-size:11px}.cost-delta{gap:8px;padding:12px}.cost-delta strong{font-size:19px}.cost-delta-icon{font-size:32px}.cost-detail-routes{grid-template-columns:1fr}}
@media print{.docview .section-layout-tile>.pt-cost{scrollbar-gutter:auto;scrollbar-width:auto}.pt-cost{background:#fff!important;--dink:#172033;--dtext:#334155;--dfaint:#526175}.pt-cost .ptitle{color:#334155!important}.cost-routes,.cost-delta{break-inside:avoid}.cost-panel{container-type:normal}.cost-segment,.cost-node-dot{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
` + costCompactStyles('.cost-compact') +
    '/* The thin stable gutter preserves the original 520px outer breakpoint. */@container(max-width:510px){' + costCompactStyles('.cost-auto') + '}' +
    '@container(max-width:760px){.cost-panel.cost-many .cost-routes{grid-template-columns:repeat(2,minmax(0,1fr))}}',
  authoring: {
    initialFields: true,
    template: {
      title: 'Operation cost breakdown', currency: 'USD', unit: 'operation', period: 'per operation',
      assumptions: 'Illustrative estimates, not vendor quotes. Fixed amounts are allocated to one operation. Excludes tax and engineering labor.',
      routes: [{id:'operation',label:'Process one document'}],
      items: [{route:'operation',label:'Compute',perMillion:0,fixed:0.06},
        {route:'operation',label:'Storage',perMillion:0,fixed:0.01},
        {route:'operation',label:'External API',perMillion:0,fixed:0.03}],
      initial: {messages:1}
    },
    setupFields: [['density','text'],['currency','text'],['unit','text'],['period','text'],['assumptions','text'],
      ['routes','rows',{wide:true,max:6,cols:[{k:'id',req:true},{k:'label'},{k:'tradeoff'}]}],
      ['items','rows',{wide:true,max:24,cols:[{k:'route',req:true},{k:'node'},{k:'label'},
        {k:'perMillion',label:'Cost per 1M units',kind:'num',req:true},{k:'fixed',label:'Fixed cost per period',kind:'num'}]}],['initial','json']],
    patchFields: [['messages','num'],['activeRoute','text'],['note','text']],
    expandPatchFields: function (panel) {
      return [['messages','num'],['activeRoute','enum',panelCollectionItems(panel,'routes',6).map(function (route) { return route.id; })],['note','text']];
    },
    fieldMeta: {
      density:{label:'Display density',help:'Auto uses compact horizontal bars in panels up to 520 px wide. Compact keeps the small layout at any width; Expanded keeps the tall chart. Three to six entries share one row in wide panels and wrap to two columns below 760 px.'},
      currency:{label:'Currency',help:'One three-letter code for all entries; default USD. No currency conversion.'},
      unit:{label:'Workload unit',help:'Display label for the volume and per-million rates; defaults to messages. Use operation with volume 1 for a single-operation breakdown.'},
      period:{label:'Cost period',help:'Use the same period for workload volume and every fixed charge, e.g. per month.'},
      assumptions:{label:'Basis & exclusions',help:'Describe workload units, included operations, region, rate date and excluded charges. Label fictional rates.'},
      routes:{label:'Operations / routes',help:'Declare 1–6 entries with unique ids. One shows a breakdown; exactly two compare baseline first and alternative second. Three to six use equal-width cards on one row in wide panels. Remove an entry’s cost lines when removing it.'},
      items:{label:'Components & cost lines',help:'List each entry’s components. Route is its id; node optionally links an existing diagram node. Rate is the aggregate cost per million workload units, including all billable operations; explicit zero is free / excluded. Fixed cost defaults to zero.'},
      messages:{label:'Workload volume',help:'Non-negative whole number for the authored period; default 1,000,000. Applies to every entry. For one operation use 1 and enter component amounts as fixed costs.'},
      activeRoute:{label:'Following route',help:'Highlight the route being explained by this step. Does not change any estimate.',nullLabel:'No route highlighted'},
      note:{label:'Explanation'}
    },
    editor: function (context) {
      return {setupField: function (field, panel) {
        if (field[0] !== 'density') return;
        var select = context.document.createElement('select');
        select.className = 'fctl'; select.setAttribute('aria-label', 'Display density');
        [['auto','Auto · fit panel'],['compact','Compact · horizontal bars'],['expanded','Expanded · vertical bars']].forEach(function (pair) {
          var option = context.document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; select.appendChild(option);
        });
        select.value = ['compact','expanded'].indexOf(panel.density) >= 0 ? panel.density : 'auto';
        context.listen(select, 'change', function () { context.commit('density', JSON.stringify(select.value)); });
        return context.controls.row('Display density', select);
      }};
    },
    picker:{order:3,name:'Cost breakdown / comparison',category:'Software & data',tagline:'One operation or several routes.',
      description:'Break down one operation into visible component costs, or show up to six entries on a shared scale. Exactly two entries also show savings and break-even volume.'}
  }
});

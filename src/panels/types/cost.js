/* Authored linear cost estimates. No provider prices or billing rules are inferred. */
function costNumber(value) {
  return isFiniteNum(value) && value >= 0;
}
function costMessages(value) {
  return costNumber(value) && Number.isSafeInteger(value);
}
function costDeclarationWarnings(panel, path, warnings, errors, diagram) {
  var routes = panelCollectionItems(panel, 'routes', 2);
  panelCollectionWarnings(panel, path, warnings, 'routes', 2);
  if (routes.length !== 2 || !Array.isArray(panel.routes) || panel.routes.length !== 2)
    warnings.push(path + '.routes: declare exactly two routes; comparison unavailable otherwise');
  if (panel.currency !== undefined && (typeof panel.currency !== 'string' || !/^[A-Z]{3}$/.test(panel.currency)))
    warnings.push(path + '.currency: expected a three-letter currency code; comparison unavailable');
  if (!Array.isArray(panel.items) || !panel.items.length || panel.items.length > 24)
    warnings.push(path + '.items: expected 1–24 cost lines; comparison unavailable');
  (Array.isArray(panel.items) ? panel.items : []).forEach(function (item, i) {
    var at = path + '.items[' + i + ']';
    if (!panelObject(item)) { warnings.push(at + ': expected a cost line; comparison unavailable'); return; }
    if (!routes.some(function (route) { return route.id === item.route; }))
      warnings.push(at + '.route: unknown route; comparison unavailable');
    if (!costNumber(item.perMillion))
      warnings.push(at + '.perMillion: expected a finite non-negative rate; route is unpriced');
    if (item.fixed !== undefined && !costNumber(item.fixed))
      warnings.push(at + '.fixed: expected a finite non-negative cost for the comparison period; route is unpriced');
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
      !panelCollectionItems(panel, 'routes', 2).some(function (route) { return route.id === state.activeRoute; }))
    warnings.push(path + '.activeRoute: unknown route; no route highlighted');
  if (panelOwn(state, 'enterOnce')) costPatchWarnings(state.enterOnce, path + '.enterOnce', panel, warnings);
}
function costModel(panel, state) {
  state = panelObject(state) ? state : {};
  var messages = panelOwn(state, 'messages') ? state.messages : 1000000;
  if (!costMessages(messages)) messages = null;
  var declarations = panelCollectionItems(panel, 'routes', 2);
  var items = Array.isArray(panel.items) ? panel.items : [];
  var valid = Array.isArray(panel.routes) && panel.routes.length === 2 && declarations.length === 2 &&
    items.length > 0 && items.length <= 24 && items.every(function (item) {
      return panelObject(item) && declarations.some(function (route) { return route.id === item.route; });
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
      var total = priced && messages !== null ? item.perMillion * (messages / 1000000) + (item.fixed || 0) : null;
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
  return {messages: messages, currency: panel.currency || 'USD', routes: routes, delta: delta,
    percent: comparable && routes[0].total > 0 ? Math.abs(delta) / routes[0].total * 100 : null, crossover: crossover};
}
function costAmount(value, currency) {
  if (value === null) return 'Unpriced';
  return currency + ' ' + value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2});
}
function costCount(value) {
  return value.toLocaleString('en-US', {maximumFractionDigits: 0});
}
function costHTML(panel, state) {
  var model = costModel(panel, state), money = function (value) { return esc(costAmount(value, model.currency)); };
  var h = '<div class="cost-panel"><div class="cost-basis"><span>ONE-WAY DELIVERY · ESTIMATE</span><strong>' +
    (model.messages === null ? 'Unknown volume' : costCount(model.messages) + ' messages') +
    '</strong><span>' + esc(panel.period || 'per month') + ' · same workload, two routes</span></div>';
  h += '<div class="cost-routes">';
  var max = Math.max.apply(null, model.routes.map(function (route) { return route.total || 0; }));
  model.routes.forEach(function (route, index) {
    h += '<section class="cost-route cost-route-' + index + (route.active ? ' cost-active' : '') + '">' +
      '<div class="cost-route-heading"><span class="cost-tag">' + (index ? 'B · ALTERNATIVE' : 'A · BASELINE') +
      '</span>' + (route.active ? '<span class="cost-following">Following</span>' : '') + '</div>' +
      '<h4>' + esc(route.label) + '</h4><div class="cost-total">' + money(route.total) + '</div>' +
      '<div class="cost-track" aria-hidden="true"><div style="width:' + (max && route.total !== null ? (route.total / max * 100).toFixed(2) : 0) + '%"></div></div>';
    h += '<div class="cost-subtotal">' + (route.total === null ? 'Complete every rate to compare' : money(route.variable) + ' usage + ' + money(route.fixed) + ' fixed') + '</div>';
    h += '<div class="cost-nodes">' + route.nodes.length + ' linked engineering nodes</div><ol class="cost-lines">';
    route.rows.forEach(function (row) {
      h += '<li><div class="cost-line-title"><span>' + esc(row.label) + '</span><b>' + money(row.total) + '</b></div>' +
        '<div class="cost-line-rate">' + (row.rate === null ? 'Rate needed' : money(row.rate) + ' / 1M' + (row.fixed ? ' + ' + money(row.fixed) + ' fixed' : '')) +
        (row.node ? ' · ' + esc(row.node) : '') + '</div></li>';
    });
    h += '</ol>' + (route.tradeoff ? '<p class="cost-tradeoff">' + esc(route.tradeoff) + '</p>' : '') + '</section>';
  });
  h += '</div><div class="cost-delta"><span>ALTERNATIVE VS BASELINE</span><strong>';
  if (model.delta === null) h += 'Comparison unavailable';
  else if (model.delta === 0) h += 'Same estimated cost';
  else h += money(Math.abs(model.delta)) + (model.delta < 0 ? ' less' : ' more') +
    (model.percent !== null && Number.isFinite(model.percent) ? ' <small>(' + model.percent.toFixed(1) + '%)</small>' : '');
  h += '</strong>' + (model.crossover !== null ? '<span>Break-even ≈ ' + costCount(model.crossover) + ' messages ' + esc(panel.period || 'per month') + '</span>' : '') + '</div>';
  h += '<div class="cost-assumptions"><b>Basis &amp; exclusions</b><p>' + esc(panel.assumptions || 'Authored estimates. Confirm rates, billing units and exclusions before using for a decision.') + '</p></div>';
  if (state && state.note) h += '<p class="cost-note">' + esc(state.note) + '</p>';
  return h + '</div>';
}
PanelRegistry.define('cost', {
  label: 'Messaging cost', since: '0.1.0', order: 26,
  validateDeclaration: costDeclarationWarnings, validatePatch: costPatchWarnings,
  render: function (host, panel, state) { return {html: costHTML(panel, state)}; },
  references: {nodes: ['items.*.node']},
  presentation: {ambientInitial: true},
  layout: {large: true, height: 17, fallbackHeight: 17},
  styles: String.raw`
.cost-panel{font-size:12px;line-height:1.5;color:var(--dtext);min-width:0;container-type:inline-size;overflow-wrap:anywhere}
.cost-basis{display:flex;flex-direction:column;gap:3px;margin-bottom:14px}
.cost-basis>span:first-child,.cost-tag,.cost-delta>span:first-child{font-size:9px;font-weight:700;letter-spacing:1.2px;color:var(--dfaint)}
.cost-basis strong{font-size:23px;line-height:1.2;color:var(--dink)}
.cost-basis>span:last-child{font-size:11px;color:var(--dfaint)}
.cost-routes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.cost-route{--cost-accent:#7371cf;border:1px solid color-mix(in srgb,var(--dtext) 22%,transparent);border-top:3px solid var(--cost-accent);border-radius:10px;padding:13px;min-width:0;background:color-mix(in srgb,var(--cost-accent) 4%,transparent)}
.cost-route-1{--cost-accent:#439780}
.cost-active{outline:2px solid var(--cost-accent);outline-offset:2px}
.cost-route-heading{display:flex;justify-content:space-between;flex-wrap:wrap;gap:5px;min-height:19px}
.cost-following{font-size:9px;color:var(--dink);font-weight:600}
.cost-route h4{font-size:14px;line-height:1.3;margin:5px 0 10px;color:var(--dink)}
.cost-total{font:600 22px/1.3 'IBM Plex Mono',monospace;color:var(--dink);font-variant-numeric:tabular-nums}
.cost-track{height:5px;border-radius:4px;background:color-mix(in srgb,var(--dtext) 10%,transparent);margin:10px 0 6px;overflow:hidden}
.cost-track>div{height:100%;background:var(--cost-accent);border-radius:4px}
.cost-subtotal{font-size:10px;color:var(--dfaint);min-height:30px}
.cost-nodes{font-size:10px;font-weight:600;color:var(--dink);margin:10px 0 5px}
.cost-lines{list-style:none;padding:0;margin:0}
.cost-lines li{padding:7px 0;border-top:1px solid color-mix(in srgb,var(--dtext) 12%,transparent)}
.cost-line-title{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--dink)}
.cost-line-title b{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.cost-line-rate{font-size:9px;color:var(--dfaint);margin-top:2px}
.cost-tradeoff{font-size:10px;border-top:1px solid color-mix(in srgb,var(--dtext) 18%,transparent);padding-top:9px;margin:9px 0 0}
.cost-delta{display:flex;flex-direction:column;gap:4px;border-radius:10px;background:color-mix(in srgb,var(--dtext) 7%,transparent);padding:13px 15px;margin-top:14px;color:var(--dink)}
.cost-delta strong{font-size:21px}.cost-delta small{font-size:13px;font-weight:500}.cost-delta>span:last-child{font-size:10px}
.cost-assumptions{margin-top:13px;font-size:10px;color:var(--dfaint)}.cost-assumptions b{color:var(--dtext)}.cost-assumptions p{margin:3px 0 0}.cost-note{font-size:11px;margin:10px 0 0}
@container(max-width:420px){.cost-routes{grid-template-columns:1fr}.cost-subtotal{min-height:0}}
@media print{.pt-cost{background:#fff!important;--dink:#172033;--dtext:#334155;--dfaint:#526175}.pt-cost .ptitle{color:#334155!important}.cost-route,.cost-delta{break-inside:avoid}.cost-panel{container-type:normal}.cost-routes{grid-template-columns:repeat(2,minmax(0,1fr))}}
`,
  authoring: {
    initialFields: true,
    template: {
      title: 'Messaging cost comparison', currency: 'USD', period: 'per month',
      assumptions: 'Illustrative rates, not vendor quotes. One-way messages, one consumer, one billing unit per operation; no retries. Rates include the operations named in each line. Excludes egress, storage, free tiers, tax and engineering labor. Fixed relay cost covers the same month.',
      routes: [{id:'bus',label:'Managed event bus',tradeoff:'Managed routing; fewer components to operate.'},
        {id:'queue',label:'Queue + relay',tradeoff:'Lower usage rate; operate a relay and its retry / dead-letter handling.'}],
      items: [{route:'bus',label:'Producer',perMillion:0},{route:'bus',label:'Publish + delivery',perMillion:2.8},
        {route:'bus',label:'Consumer',perMillion:0.4},{route:'queue',label:'Producer',perMillion:0},
        {route:'queue',label:'Queue operations',perMillion:0.8},{route:'queue',label:'Relay',perMillion:0.2,fixed:12},
        {route:'queue',label:'Consumer',perMillion:0.4}],
      initial: {messages:1000000}
    },
    setupFields: [['currency','text'],['period','text'],['assumptions','text'],
      ['routes','rows',{wide:true,max:2,cols:[{k:'id',req:true},{k:'label'},{k:'tradeoff'}]}],
      ['items','rows',{wide:true,max:24,cols:[{k:'route',req:true},{k:'node'},{k:'label'},
        {k:'perMillion',label:'Cost per 1M messages',kind:'num',req:true},{k:'fixed',label:'Fixed cost per period',kind:'num'}]}],['initial','json']],
    patchFields: [['messages','num'],['activeRoute','text'],['note','text']],
    expandPatchFields: function (panel) {
      return [['messages','num'],['activeRoute','enum',panelCollectionItems(panel,'routes',2).map(function (route) { return route.id; })],['note','text']];
    },
    fieldMeta: {
      currency:{label:'Currency',help:'One three-letter code for both routes; default USD. No currency conversion.'},
      period:{label:'Comparison period',help:'Use the same period for message volume and every fixed charge, e.g. per month.'},
      assumptions:{label:'Basis & exclusions',help:'Describe payload size, operations per message, retries, region, rate date and excluded charges. Label fictional rates.'},
      routes:{label:'Routes',help:'Exactly two: baseline first, alternative second.'},
      items:{label:'Engineering nodes & cost lines',help:'List each route’s components in delivery order. Route is its id; node optionally links an existing diagram node. Rate is the aggregate cost per million delivered messages, including all billable operations; explicit zero is free / excluded. Fixed cost defaults to zero.'},
      messages:{label:'One-way messages',help:'Volume for the comparison period; default 1,000,000. Applies to both routes.'},
      activeRoute:{label:'Following route',help:'Highlight the route being explained by this step. Does not change either estimate.',nullLabel:'No route highlighted'},
      note:{label:'Explanation'}
    },
    picker:{order:3,name:'Messaging cost comparison',category:'Software & data',tagline:'Two routes. One workload.',
      description:'Compare per-million usage and fixed costs, linked engineering nodes and the volume where an alternative becomes cheaper.'}
  }
});

'use strict';
/* #1404 part 2, desktop Workbench Status board settings → Metrics: the "End-to-end metrics applied"
   checkbox writes page `tracking.endToEndMetrics`.
| row | rule | broken implementation it rejects |
|---|---|---|
| W1 | The checkbox is in the Metrics section, unchecked while the flag is absent; checking writes `tracking.endToEndMetrics: true` keeping the rest of tracking; one Undo restores the exact text; unchecking removes the key | no control; a control in another section; a value written as a string; two Undo steps; `false` left behind |
| W2 | An authored non-boolean shows unchecked, and its validator warning sits once in the Metrics section next to the checkbox (aria-invalid, aria-describedby), not in Jira | a warning routed to Jira by the `tracking.*` rule; a truthy string read as checked; a warning shown twice or not linked to the box |
| W3 | With Allow metrics off, or with no telemetry block and no metrics binding, a note by the box says it has no effect until metrics are on; with metrics available there is no such note | a setting that looks active while metrics cannot run |
Desktop only. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/trace-connections-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const BOARD={kind:'board'},LABEL='End-to-end metrics applied';
function board(extra){
  const d={nodes:{api:{title:'API',tickets:['DOOR-101'],telemetry:{kind:'service',signals:{rate:{grafana:'sum(rate(x[5m]))',unit:'req/h'}},proof:{rate:{min:1}}}},db:{title:'Store'}},
    rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}],panels:[{id:'status',type:'live-status',title:'Epic status'}]};
  return {page:{title:'Board',tracking:{jira:{site:'https://acme.atlassian.net'},telemetry:{window:'24h'},...extra},sections:[{heading:'Flow',diagram:d}]}};
}
function harness(spec){
  const e=inspectorEnvironment(names),h=e.mount(spec);
  const ui={h,
    render(){h.session.target=BOARD;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    section(id){return h.guide.querySelectorAll('details.board-section').find(s=>s.getAttribute('data-board-section')===id);},
    control(){const el=h.guide.querySelector('[aria-label="'+LABEL+'"]');assert.ok(el,'checkbox "'+LABEL+'" exists');return el;},
    check(on){const el=ui.control();el.checked=on;el.fire('change');h.flush();return ui;},
    words(box){const out=[];(function walk(n){if(n.textContent)out.push(n.textContent);n.children.forEach(walk);})(box);return out.join(' ');}};
  return ui.render();
}

test('W1 End-to-end metrics applied writes tracking.endToEndMetrics true as one Undo step; unchecking removes it',()=>{
  const ui=harness(board()),before=ui.text,box=ui.control();
  assert.equal(box.type,'checkbox');assert.equal(box.checked,false,'unchecked while the flag is absent');
  assert.ok(box.closest('details.board-section')===ui.section('metrics'),'the checkbox is in the Metrics section');
  assert.ok(box.title.length>0,'the checkbox has a tooltip');
  ui.check(true);
  assert.equal(ui.raw.page.tracking.endToEndMetrics,true);
  assert.deepEqual(ui.raw.page.tracking.jira,{site:'https://acme.atlassian.net'},'the rest of tracking is kept');
  assert.deepEqual(ui.raw.page.tracking.telemetry,{window:'24h'});
  ui.render();assert.equal(ui.control().checked,true,'re-render shows it checked');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo restores the exact text');assert.equal(ui.h.session.canUndo(),false,'one Undo step');
  ui.render();ui.check(true);ui.render();ui.check(false);
  assert.equal(Object.prototype.hasOwnProperty.call(ui.raw.page.tracking,'endToEndMetrics'),false,'unchecking removes the key');
});

test('W2 an authored non-boolean reads unchecked and its warning sits in Metrics, not Jira',()=>{
  const ui=harness(board({endToEndMetrics:'yes'})),box=ui.control();
  assert.equal(box.checked,false,'a string is not the flag');
  assert.match(ui.words(ui.section('metrics')),/must be true or false/i);
  assert.doesNotMatch(ui.words(ui.section('jira')),/endToEndMetrics|must be true or false/);
  assert.equal(box.getAttribute('aria-invalid'),'true','the checkbox is marked invalid');
  const ids=(box.getAttribute('aria-describedby') || '').split(' ').filter(Boolean),warning=ids.map(id=>ui.h.guide.querySelector('#'+id)).find(el=>el && /must be true or false/i.test(el.textContent));
  assert.ok(warning,'aria-describedby names the warning next to the checkbox');
  assert.ok(ids.some(id=>ui.h.guide.querySelector('#'+id) && /Proof reads/.test(ui.h.guide.querySelector('#'+id).textContent)),'and the explanation note');
  const shown=ui.section('metrics').querySelectorAll('p,li').filter(el=>/must be true or false/i.test(el.textContent));
  assert.equal(shown.length,1,'the warning is shown once, next to the checkbox, not again in the section list');
  ui.check(true);assert.equal(ui.raw.page.tracking.endToEndMetrics,true,'checking repairs it to the boolean');
});

test('W3 the box says it has no effect while metrics are off or the board has no metrics',()=>{
  const idle=ui=>{const box=ui.control(),ids=(box.getAttribute('aria-describedby') || '').split(' ');return ids.map(id=>ui.h.guide.querySelector('#'+id)).filter(Boolean).map(el=>el.textContent).find(t=>/No effect until metrics are on/.test(t)) || null;};
  assert.equal(idle(harness(board())),null,'metrics allowed with a telemetry block: no note');
  assert.match(idle(harness(board({telemetry:{enabled:false}}))),/Allow metrics is off/);
  const bare=board();delete bare.page.tracking.telemetry;
  assert.equal(idle(harness(bare)),null,'a metrics binding without a telemetry block still runs metrics: no note');
  delete bare.page.sections[0].diagram.nodes.api.telemetry;
  assert.match(idle(harness(bare)),/no node or connection on this board has metrics/);
});

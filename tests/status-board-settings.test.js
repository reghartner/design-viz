'use strict';
/* #1236 desktop Workbench Status board settings: one Inspector area for the board-level
   Jira, Metrics, Traces, Environments and Log searches settings, plus Make this a status board.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| S1 | Target {kind:'board'} shows five collapsible sections in order: Jira, Metrics, Traces, Environments, Log searches. The moved Jira/GitHub/Metrics controls keep their labels and sit in their section. Editing Jira site writes `tracking.jira.site`; one Undo restores the exact text. | live-status board with tracking.jira and a Live status panel | `details.board-section` ids and summary titles; Jira site / GitHub scope in the jira section; Allow metrics in the metrics section; New environment id in the environments section; Undo text equality and no second undo entry | sections missing or out of order; controls left in Document settings; an edit that takes two Undo steps |
| S2 | Each section lists the validator warnings for its own JSON paths. | tracking.staleDays 0, a bad Jira site, a bad metrics window, a bad environment id, a bad lookup | `Jira warnings` holds the staleDays and site warnings; `Metrics settings warnings` holds only the window warning; `Environments warnings` and `Log searches warnings` hold theirs; the Jira summary counts its warnings | one shared list; warnings missing; the Metrics list repeating environment or lookup warnings |
| S3 | Make this a status board on a bare diagram wraps it in a page, adds an empty tracking block and a Live status panel as one Undo step; the diagram is otherwise unchanged. | bare {nodes,rows,edges} diagram | page.tracking deepEqual {}; diagram deepEqual original plus panels [live-status]; one Undo restores the exact bare text; the button is gone after the change | several Undo steps; a lost or rewritten diagram; a panel without tracking |
| S4 | Make this a status board adds only what is missing, and is not offered on a complete board. | page without tracking; page with tracking but no panel; full board | only the missing part is added; no button on the full board | duplicate panels; overwriting authored tracking |
| S5 | Traces and Log searches say "No settings yet". | live-status board | the two sections contain the text | empty or missing sections |
| S6 | Document settings no longer holds the Tracking controls; it keeps one link that opens Status board settings. The Live status panel's Inspect form links there too. | live-status board | no Jira site / metrics-settings under {kind:'document'}; "Open Status board settings" in Document settings and in the panel form selects {kind:'board'} | Tracking still duplicated in Document settings; no way back to the board area |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
const BOARD={kind:'board'},SECTIONS=['jira','metrics','traces','environments','lookups'],TITLES=['Jira','Metrics','Traces','Environments','Log searches'];
const diagram=()=>({nodes:{api:{title:'API',tickets:['DOOR-101']},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}]});
function board(tracking){
  const d=diagram();d.panels=[{id:'status',type:'live-status',title:'Epic status'}];
  return {page:{title:'Board',tracking:tracking || {jira:{site:'https://acme.atlassian.net',epic:'DOOR-100'}},sections:[{heading:'Flow',diagram:d}]}};
}
function harness(spec,target){
  const e=inspectorEnvironment(names),h=e.mount(spec);
  const ui={e,h,
    select(t){h.session.target=t;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    sections(){return h.guide.querySelectorAll('details.board-section');},
    section(id){const box=ui.sections().find(s=>s.getAttribute('data-board-section')===id);assert.ok(box,'section '+id+' exists');return box;},
    title(box){return box.querySelector('summary').textContent;},
    row(label,scope){const row=(scope || h.guide).querySelectorAll('.frow').find(r=>r.querySelector('.flab')?.textContent===label);return row?row.children[1]:null;},
    control(label,scope){const el=ui.row(label,scope);assert.ok(el,'control "'+label+'" exists');return el;},
    set(label,value){const el=ui.control(label);el.value=value;el.fire('change');h.flush();return ui;},
    button(label,scope){return (scope || h.guide).querySelectorAll('button').find(b=>b.textContent===label) || null;},
    click(label){const b=ui.button(label);assert.ok(b,'button "'+label+'" exists');b.fire('click');h.flush();return ui;},
    warnings(label){const list=h.guide.querySelector('[aria-label="'+label+'"]');return list?list.children.map(li=>li.textContent):[];},
    text_(box){const out=[];(function walk(n){if(n.textContent)out.push(n.textContent);n.children.forEach(walk);})(box);return out.join(' ');}};
  if(target)ui.select(target);
  return ui;
}

test('S1 Status board settings shows Jira, Metrics, Traces, Environments and Log searches; Jira site writes tracking.jira.site with one Undo',()=>{
  const ui=harness(board(),BOARD);
  assert.deepEqual(ui.sections().map(s=>s.getAttribute('data-board-section')),SECTIONS,'five sections in order');
  assert.deepEqual(ui.sections().map(s=>ui.title(s).split(' · ')[0]),TITLES);
  for(const [label,id] of [['Jira site','jira'],['Parent','jira'],['Exclude story','jira'],['GitHub scope','jira'],['Allow metrics','metrics'],['Grafana Prometheus UID','metrics'],['Metrics window','metrics'],['New environment id','environments']])
    assert.equal(ui.control(label).closest('details.board-section'),ui.section(id),label+' is in the '+id+' section');
  assert.equal(ui.section('metrics').querySelectorAll('fieldset.metrics-settings').length,1,'the Metrics page form moved into the Metrics section');
  const before=ui.text;ui.set('Jira site','https://door.atlassian.net');
  assert.equal(ui.raw.page.tracking.jira.site,'https://door.atlassian.net/');
  assert.equal(ui.raw.page.tracking.jira.epic,'DOOR-100','the rest of tracking.jira is kept');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo restores the exact text');assert.equal(ui.h.session.canUndo(),false,'the edit was one Undo step');
});

test('S2 each section lists the validator warnings for its own paths',()=>{
  const spec=board({staleDays:0,jira:{site:'not a url'},telemetry:{window:'forever',environments:{'9bad':{}},lookups:{order:{label:'Order',query:'{app="api"} |= "$value"',colour:'red'}}}});
  const ui=harness(spec,BOARD),all=plain(ui.e.C.validate(ui.e.C.normalize(spec)).warnings);
  const jira=ui.warnings('Jira warnings');
  assert.ok(jira.some(w=>w.startsWith('tracking.staleDays:')),'staleDays warning in the Jira section');
  assert.ok(jira.some(w=>w.startsWith('tracking.jira.site:')),'Jira site warning in the Jira section');
  assert.equal(ui.section('jira').querySelector('[aria-label="Jira warnings"]')?.closest('details.board-section'),ui.section('jira'));
  assert.match(ui.title(ui.section('jira')),/ · 2 warnings$/,'the Jira summary counts its warnings');
  assert.equal(ui.section('jira').open,true,'a section with warnings starts open');
  const metrics=ui.warnings('Metrics settings warnings');
  assert.ok(metrics.length>=1 && metrics.every(w=>w.startsWith('tracking.telemetry.window')),'Metrics lists only its own warnings: '+metrics.join(' | '));
  const environments=ui.warnings('Environments warnings'),lookups=ui.warnings('Log searches warnings');
  assert.ok(environments.length>=1 && environments.every(w=>w.startsWith('tracking.telemetry.environment')),'Environments warnings: '+environments.join(' | '));
  assert.ok(lookups.length>=1 && lookups.every(w=>w.startsWith('tracking.telemetry.lookups')),'Log searches warnings: '+lookups.join(' | '));
  const shown=[...jira,...metrics,...environments,...lookups,...ui.warnings('Traces warnings'),...ui.warnings('Status board warnings')];
  assert.deepEqual(shown.slice().sort(),all.filter(w=>w.startsWith('tracking')).sort(),'every tracking warning is shown exactly once');
});

test('S3 Make this a status board on a bare diagram adds a page wrapper, tracking and a Live status panel as one Undo step',()=>{
  const bare=diagram(),ui=harness(bare,BOARD),before=ui.text;
  assert.equal(ui.sections().length,0,'a bare diagram shows no sections before it is a status board');
  ui.click('Make this a status board');
  const raw=ui.raw;
  assert.deepEqual(raw.page.tracking,{},'an empty tracking block');
  assert.equal(raw.page.sections.length,1);
  const d=raw.page.sections[0].diagram,panels=d.panels;delete d.panels;
  assert.deepEqual(d,bare,'the diagram is otherwise unchanged');
  assert.deepEqual(panels.map(p=>p.type),['live-status']);
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo restores the bare diagram');assert.equal(ui.h.session.canUndo(),false);
  assert.equal(ui.h.session.redo(),true);ui.select(BOARD);
  assert.equal(ui.button('Make this a status board'),null,'the action is gone once the board is complete');
  assert.deepEqual(ui.sections().map(s=>s.getAttribute('data-board-section')),SECTIONS);
});

test('S4 Make this a status board adds only what is missing and is not offered on a complete board',()=>{
  const noTracking=board();delete noTracking.page.tracking;
  let ui=harness(noTracking,BOARD);ui.click('Make this a status board');
  assert.deepEqual(ui.raw.page.tracking,{});assert.equal(ui.raw.page.sections[0].diagram.panels.length,1,'the existing panel is kept, none added');
  const noPanel=board();delete noPanel.page.sections[0].diagram.panels;
  ui=harness(noPanel,BOARD);ui.click('Make this a status board');
  assert.deepEqual(ui.raw.page.tracking,noPanel.page.tracking,'authored tracking is kept');
  assert.deepEqual(ui.raw.page.sections[0].diagram.panels.map(p=>p.type),['live-status']);
  ui=harness(board(),BOARD);assert.equal(ui.button('Make this a status board'),null,'a complete board offers no action');
});

test('S5 Traces and Log searches say No settings yet',()=>{
  const ui=harness(board(),BOARD);
  for(const id of ['traces','lookups'])assert.match(ui.text_(ui.section(id)),/No settings yet/,id);
});

test('S6 Document settings keeps one link to Status board settings; the Live status panel form links there too',()=>{
  const ui=harness(board(),{kind:'document'});
  assert.equal(ui.row('Jira site'),null,'Jira site left Document settings');
  assert.equal(ui.h.guide.querySelectorAll('fieldset.metrics-settings').length,0,'the Metrics page form left Document settings');
  ui.click('Open Status board settings');
  assert.deepEqual(plain(ui.h.selected),BOARD,'the link selects Status board settings');
  ui.select({kind:'panel',section:0,index:0});
  ui.click('Open Status board settings');
  assert.deepEqual(plain(ui.h.selected),BOARD,'the Live status panel links to Status board settings');
});

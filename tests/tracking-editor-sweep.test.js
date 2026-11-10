'use strict';
/* #1254 Workbench Tracking editor sweep (desktop). One row per ticket item.
| row | item | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|---|
| T7a | 7 | Add/Remove ticket keeps hand-written entries the form does not list (invalid or duplicated); the form names them. | node tickets ['HW-1','hw-2','HW-1'] | after Add HW-3 the list is ['HW-1','hw-2','HW-1','HW-3']; Remove ticket 1 leaves ['hw-2','HW-3']; a note lists hw-2 | rebuilding the array from parsed refs |
| T7b | 7 | A non-list `tickets` value is refused with a message pointing at the JSON. | node tickets 'HW-1' | source unchanged; error names the JSON | silently replacing the string |
| T8 | 8 | A Jira or GitHub edit writes only those keys, pretty-printed; the rest of `tracking` keeps its text. | page tracking with a multi-line telemetry template | the original telemetry text block is still in the source | rewriting the whole tracking block on one line |
| T9a | 9 | Add then remove Parent on a page without tracking or a Live status panel leaves no `tracking` and no new validator warning. | page, no tracking, no panel | no tracking key; warnings equal the start | `tracking:{jira:{}}` leftovers |
| T9b | 9 | Untick then re-tick Allow metrics leaves no `tracking` on the same page. | same | no tracking key; warnings equal the start | `tracking:{telemetry:{enabled:true}}` |
| T9c | 9 | With a Live status panel, an emptied tracking block stays `{}` (the board marker). | board with tracking {} and a panel | tracking deepEqual {} after add+remove Parent | deleting the board's tracking block |
| T16 | 16 | A refused Tracking edit shows its message next to the field (role=alert) and marks the field aria-invalid. | node; Add ticket "hw-1"; Parent "bad" | the field's row holds the alert text; aria-invalid true; a later good edit clears it | message only in the top error box |
| T18 | 18 | Buttons keep focus across the refresh; Remove ticket N moves focus to the next control; Add environment / Add signal move focus into the new row and open its fold. | node with two tickets; board with telemetry; edge with one signal | focused element after each action | focus dropping to the body; a closed new fold |
| T24 | 24 | The in-app guide names Missing work, Exists when tickets are complete, Exclude story, GitHub scope and Tickets on this step. | src/workbench/human-guide.html | each phrase present | missing guide text |
| T25 | 25 | Adding a ticket, PR or Parent that is already attached says so next to the field and clears it, with no history entry. | node with HW-1 and a PR; board with Parent DOOR-100 | status note text; empty field; no Undo entry | silent no-op keeping the typed text |
| T27 | 27 | In a document that imports nodes, an Inspector edit that makes the combined document invalid is refused inside the form. | consumer importing a provider; edge endpoint set to an unknown imported node | error "This edit was not applied: …"; form and source unchanged | replacing the Inspector or losing the form |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
const NODE={kind:'node',section:0,id:'api'},EDGE={kind:'edge',section:0,index:0},BOARD={kind:'board'};
function page({tracking,panel=true,api={}}={}){
  const d={nodes:{api:{title:'API',...api},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}]};
  if(panel)d.panels=[{id:'status',type:'live-status'}];
  const p={title:'Board',sections:[{heading:'Flow',diagram:d}]};if(tracking!==undefined)p.tracking=tracking;
  return {page:p};
}
function harness(spec,target){
  const e=inspectorEnvironment(names),h=e.mount(spec);
  const ui={e,h,
    select(t){h.session.target=t;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    row(label){return h.guide.querySelectorAll('.frow').find(r=>r.querySelector('.flab')?.textContent===label) || null;},
    control(label){const row=ui.row(label);assert.ok(row,'control "'+label+'" exists');return row.children[1];},
    set(label,value){const el=ui.control(label);el.focus();el.value=value;el.fire('change');h.flush();return ui;},
    enter(label,value){const el=ui.control(label);el.focus();el.value=value;el.fire('keydown',{key:'Enter'});h.flush();return el;},
    button(label){return h.guide.querySelectorAll('button').find(b=>b.textContent===label) || null;},
    click(label){const b=ui.button(label);assert.ok(b,'button "'+label+'" exists');b.focus();b.fire('click');h.flush();return ui;},
    error(){const slot=h.guide.querySelector('.ierr');return slot?slot.textContent:'';},
    warnings(raw){return plain(e.C.validate(e.C.normalize(raw || ui.raw)).warnings);},
    message(control,role){const row=control.closest('.frow') || control.parentNode;const found=row.querySelectorAll('[role="'+role+'"]')[0];return found?found.textContent:'';},
    get focused(){return e.doc.activeElement;},
    text_(box){const out=[];(function walk(n){if(n.textContent)out.push(n.textContent);n.children.forEach(walk);})(box);return out.join(' ');}};
  if(target)ui.select(target);
  return ui;
}
const tickets=ui=>ui.raw.page.sections[0].diagram.nodes.api.tickets;

test('T7a Add and Remove ticket keep hand-written entries the form does not list, and the form names them',()=>{
  const ui=harness(page({api:{tickets:['HW-1','hw-2','HW-1']}}),NODE);
  ui.enter('Add ticket','HW-3');
  assert.deepEqual(tickets(ui),['HW-1','hw-2','HW-1','HW-3'],'adding keeps the typo and the duplicate');
  ui.select(NODE);assert.match(ui.text_(ui.h.guide),/hw-2/,'the unrecognised entry is named in the form');
  ui.select(NODE);ui.click('Remove ticket 1');
  assert.deepEqual(tickets(ui),['hw-2','HW-3'],'removing HW-1 removes its copies and keeps the typo');
});

test('T7b a tickets value that is not a list is refused with a message pointing at the JSON',()=>{
  const ui=harness(page({api:{tickets:'HW-1'}}),NODE),before=ui.text;
  ui.enter('Add ticket','HW-3');
  assert.equal(ui.text,before,'the source is unchanged');
  assert.match(ui.error(),/JSON/);
});

test('T8 a Jira site edit leaves the rest of the tracking block text as written',()=>{
  const telemetry={templates:{queue:{kind:'queue',params:['topic'],signals:{lag:{grafana:'max(lag{topic="$topic"})',unit:'msgs'}}}}};
  const ui=harness(page({tracking:{jira:{epic:'DOOR-100'},telemetry}}),BOARD);
  const block=JSON.stringify({telemetry},null,2).split('\n').slice(1,-1).map(line=>line.replace(/^ {2}/,''));
  const before=ui.text,lines=before.split('\n').length;
  ui.set('Jira site','https://acme.atlassian.net');
  assert.equal(ui.raw.page.tracking.jira.site,'https://acme.atlassian.net/');
  assert.ok(ui.text.split('\n').length>lines,'the edit adds a line instead of collapsing the block: '+ui.text.split('\n').length+' vs '+lines);
  for(const line of block.filter(l=>l.includes('"lag"') || l.includes('"unit"')))assert.ok(ui.text.includes(line.trim()),'kept: '+line.trim());
  assert.deepEqual(ui.raw.page.tracking.telemetry,telemetry);
});

test('T9a add then remove Parent on a page without tracking or panel leaves no tracking and no new warning',()=>{
  const spec=page({panel:false}),ui=harness(spec,BOARD),start=ui.warnings();
  ui.enter('Parent','DOOR-1');assert.deepEqual(ui.raw.page.tracking.jira.epic,['DOOR-1']);
  ui.select(BOARD);ui.click('Remove parent 1');
  assert.equal(Object.hasOwn(ui.raw.page,'tracking'),false,'no leftover tracking block');
  assert.deepEqual(ui.warnings(),start,'no new validator warning');
});

test('T9b untick then re-tick Allow metrics leaves no tracking on a page without a panel',()=>{
  const ui=harness(page({panel:false}),BOARD),start=ui.warnings();
  const toggle=()=>ui.control('Allow metrics').querySelector('input');
  const set=value=>{toggle().checked=value;toggle().fire('change');ui.h.flush();ui.select(BOARD);};
  set(false);assert.equal(ui.raw.page.tracking.telemetry.enabled,false);
  set(true);
  assert.equal(Object.hasOwn(ui.raw.page,'tracking'),false,'enabled:true is the default and is not written');
  assert.deepEqual(ui.warnings(),start);
});

test('T9c with a Live status panel an emptied tracking block stays as the board marker',()=>{
  const ui=harness(page({tracking:{}}),BOARD);
  ui.enter('Parent','DOOR-1');ui.select(BOARD);ui.click('Remove parent 1');
  assert.deepEqual(ui.raw.page.tracking,{},'no empty jira block; the board keeps tracking {}');
});

test('T16 a refused Tracking edit is shown next to its field and marks it invalid',()=>{
  const ui=harness(page(),NODE),before=ui.text;
  const input=ui.enter('Add ticket','hw-1');
  assert.equal(ui.text,before);
  assert.match(ui.message(input,'alert'),/Jira key/,'the message sits in the field row');
  assert.equal(input.getAttribute('aria-invalid'),'true');
  const ok=ui.enter('Add ticket','HW-1');void ok;
  ui.select(NODE);const fresh=ui.control('Add ticket');assert.equal(fresh.getAttribute('aria-invalid'),null);assert.equal(ui.message(fresh,'alert'),'');
  ui.select(BOARD);const parent=ui.enter('Parent','bad');
  assert.match(ui.message(parent,'alert'),/Jira key/);assert.equal(parent.getAttribute('aria-invalid'),'true');
  parent.value='DOOR-2';parent.fire('keydown',{key:'Enter'});ui.h.flush();
});

test('T18 focus stays in the form after Remove and Add buttons and lands on the new row',()=>{
  let ui=harness(page({api:{tickets:['HW-1','HW-2']}}),NODE);
  ui.click('Remove ticket 2');
  assert.equal(ui.focused,ui.control('Add ticket'),'removing the last row moves focus to the next control');
  ui=harness(page({api:{tickets:['HW-1','HW-2']}}),NODE);
  ui.click('Remove ticket 1');
  assert.equal(ui.focused,ui.button('Remove ticket 1'),'the next row takes the removed row\'s place and its focus');
  ui=harness(page({tracking:{telemetry:{grafana:{prometheus:'prom'}}}}),BOARD);
  ui.control('New environment id').value='qa';ui.click('Add environment');
  assert.equal(ui.focused,ui.control('qa Grafana Prometheus UID'),'focus moves into the new environment');
  const edge=page();edge.page.sections[0].diagram.edges[0].telemetry={kind:'call',signals:{rate:{grafana:'up',unit:'req/s'}}};
  ui=harness(edge,EDGE);
  ui.control('New signal name').value='errors';ui.control('New signal query').value='errors_total';ui.click('Add signal');
  const name=ui.control('errors name');
  assert.equal(ui.focused,name,'focus moves into the new signal');
  assert.equal(name.closest('details').open,true,'the new signal\'s section is open');
});

test('T24 the in-app guide names every Tracking control',()=>{
  const guide=fs.readFileSync(path.join(repo,'src/workbench/human-guide.html'),'utf8');
  for(const phrase of ['Missing work','Exists when tickets are complete','Exclude story','GitHub scope','Tickets on this step'])assert.ok(guide.includes(phrase),phrase);
});

test('T25 adding something already attached says so next to the field, clears it and adds no history',()=>{
  const ui=harness(page({api:{tickets:['HW-1'],prs:['https://github.com/acme/api/pull/1']}}),NODE),before=ui.text;
  const input=ui.enter('Add ticket','HW-1');
  assert.equal(ui.text,before);assert.equal(ui.h.session.canUndo(),false);
  assert.match(ui.message(input,'status'),/HW-1 is already attached/);assert.equal(input.value,'','the field is cleared');
  const pr=ui.enter('Add PR','https://github.com/acme/api/pull/1');
  assert.match(ui.message(pr,'status'),/already attached/);assert.equal(pr.value,'');
  const board=harness(page({tracking:{jira:{epic:'DOOR-100'}}}),BOARD),parent=board.enter('Parent','DOOR-100');
  assert.match(board.message(parent,'status'),/DOOR-100 is already a parent/);assert.equal(parent.value,'');
});

test('T27 in a document that imports nodes a refused Inspector edit stays in the form',()=>{
  const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],edges:[{from:'local',to:'canon::api',label:'call'}],topologyImports:[{spec:'provider',export:'core',as:'canon'}]});
  const ui=harness(consumer);
  ui.h.session.replaceProject(JSON.stringify(consumer,null,2),null,{topologyContext:{version:1,id:'consumer',specs:[provider,consumer]}});
  ui.select(EDGE);const before=ui.text,to=ui.control('to');
  to.value='canon::missing';to.fire('change');ui.h.flush();
  assert.equal(ui.text,before,'the source is unchanged');
  assert.match(ui.error(),/^This edit was not applied: /);
  assert.equal(ui.control('to'),to,'the form stays');
});

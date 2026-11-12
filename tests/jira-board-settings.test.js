'use strict';
/* #1237 desktop Workbench Status board settings → Jira: dependencies, "waits on" link names and no-activity days.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| J1 | New dependency (ticket, waits on, reason) + Add dependency writes `tracking.dependencies[0]` {ticket,on,reason}; keys are upper-cased; one Undo removes it. | live-status board without dependencies | source value after Add; exact text after Undo; one history step | no control; an Add that takes two Undo steps; a lower-case key the parser ignores |
| J2 | Add link name writes `tracking.jira.dependencyLinks` with the defaults kept plus the new name; Use default link names removes the key; each is one Undo step. | board without dependencyLinks | defaults listed while unset; source list after Add; key absent after Use defaults; Undo restores | a list that silently drops the defaults; clearing that leaves an empty array |
| J3 | No activity after (days) writes `tracking.staleDays`; empty removes it; an invalid value is written and its validator warning sits next to the field. | board without staleDays | placeholder 7; staleDays 3; staleDays 0 + aria-invalid + note text; key removed on empty | no control; a warning only in the section list |
| J4 | Existing dependency rows edit, reorder and remove in place, each one Undo step; bad keys, self-dependencies and duplicate pairs are refused; an authored invalid entry is kept and warned at its row. | board with three authored dependencies, the last invalid | source after each edit; refused edits leave the text; row warning text + aria-invalid | edits that rewrite or drop authored entries; silent junk writes |
| J5 | The Jira header counts dependencies; the old "edit in JSON for now" note is gone. | board with two dependencies | summary text | stale pointer to JSON |
| J6 | A non-object `tracking.jira` stays as written when a No activity or dependency edit is saved. | tracking.jira "acme" | source keeps the string | an edit that deletes authored junk |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const BOARD={kind:'board'};
function board(tracking){
  const d={nodes:{api:{title:'API',tickets:['DOOR-101']},db:{title:'Store',tickets:['DOOR-102']}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}]};
  d.panels=[{id:'status',type:'live-status',title:'Epic status'}];
  return {page:{title:'Board',tracking:tracking || {jira:{site:'https://acme.atlassian.net'}},sections:[{heading:'Flow',diagram:d}]}};
}
function harness(spec){
  const e=inspectorEnvironment(names),h=e.mount(spec);
  const ui={e,h,
    render(){h.session.target=BOARD;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    jira(){return h.guide.querySelectorAll('details.board-section').find(s=>s.getAttribute('data-board-section')==='jira');},
    named(label){return h.guide.querySelector('[aria-label="'+label+'"]');},
    field(label){const el=ui.named(label);assert.ok(el,'control "'+label+'" exists');return el;},
    type(label,value){const el=ui.field(label);el.value=value;el.fire('input');el.fire('change');h.flush();return ui;},
    draft(label,value){const el=ui.field(label);el.value=value;el.fire('input');return ui;},
    button(label){return h.guide.querySelectorAll('button').find(b=>b.textContent===label || b.getAttribute('aria-label')===label) || null;},
    click(label){const b=ui.button(label);assert.ok(b,'button "'+label+'" exists');assert.equal(b.disabled,false,label+' is enabled');b.fire('click');h.flush();return ui;},
    text_(box){const out=[];(function walk(n){if(n.textContent)out.push(n.textContent);n.children.forEach(walk);})(box);return out.join(' ');},
    described(control){return (control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean).map(id=>h.guide.querySelector('#'+id)?.textContent || '').join(' ');}};
  return ui.render();
}
function oneUndo(ui,before){
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo restores the exact text');assert.equal(ui.h.session.canUndo(),false,'the edit was one Undo step');
}

test('J1 Add dependency writes tracking.dependencies[0] {ticket,on,reason}; one Undo removes it',()=>{
  const ui=harness(board()),before=ui.text;
  assert.ok(ui.field('New dependency ticket').closest('details.board-section')===ui.jira(),'the dependency editor is in the Jira section');
  ui.draft('New dependency ticket','door-101').draft('New dependency waits on',' DOOR-102 ').draft('New dependency reason','Firmware first');
  ui.click('Add dependency');
  assert.deepEqual(ui.raw.page.tracking.dependencies,[{ticket:'DOOR-101',on:'DOOR-102',reason:'Firmware first'}]);
  assert.equal(ui.raw.page.tracking.jira.site,'https://acme.atlassian.net','the rest of tracking is kept');
  assert.equal(ui.field('Dependency 1 ticket').value,'DOOR-101','the new row is listed');
  assert.equal(ui.field('New dependency ticket').value,'','the New dependency fields are cleared');
  oneUndo(ui,before);
  ui.render();
  ui.draft('New dependency ticket','DOOR-101').draft('New dependency waits on','DOOR-101');ui.click('Add dependency');
  assert.equal(ui.text,before,'a ticket cannot wait on itself');
  ui.draft('New dependency waits on','not a key');ui.click('Add dependency');
  assert.equal(ui.text,before,'a value that is not a Jira key is refused');
  ui.draft('New dependency waits on','DOOR-102');ui.field('New dependency reason').value='';ui.field('New dependency waits on').fire('keydown',{key:'Enter'});ui.h.flush();
  assert.deepEqual(ui.raw.page.tracking.dependencies,[{ticket:'DOOR-101',on:'DOOR-102'}],'Enter in a New dependency field adds; an empty reason is left out');
});

test('J2 Add link name keeps the defaults and adds the name; Use default link names removes the key',()=>{
  const ui=harness(board()),before=ui.text;
  const shown=ui.h.guide.querySelectorAll('.board-link-name').map(row=>row.querySelector('span').textContent);
  assert.deepEqual(shown,['is blocked by (default)','depends on (default)'],'the defaults are listed while unset');
  ui.type('Add link name','Is Gated By');
  assert.deepEqual(ui.raw.page.tracking.jira.dependencyLinks,['is blocked by','depends on','is gated by']);
  oneUndo(ui,before);
  ui.render().type('Add link name','is gated by');
  ui.render().click('Remove link name 1');
  assert.deepEqual(ui.raw.page.tracking.jira.dependencyLinks,['depends on','is gated by'],'Remove link name drops one');
  ui.render().type('Add link name','DEPENDS ON');
  assert.deepEqual(ui.raw.page.tracking.jira.dependencyLinks,['depends on','is gated by'],'a name already listed is not added twice');
  ui.render().click('Use default link names');
  assert.equal(Object.hasOwn(ui.raw.page.tracking.jira,'dependencyLinks'),false,'clearing returns to the defaults: the key is removed');
  assert.equal(ui.raw.page.tracking.jira.site,'https://acme.atlassian.net');
  assert.equal(ui.button('Use default link names'),null,'no Use defaults button while the defaults apply');
  assert.equal(ui.h.session.undo(),true);assert.deepEqual(ui.raw.page.tracking.jira.dependencyLinks,['depends on','is gated by'],'one Undo brings the list back');
  const junk=harness(board({jira:{site:'https://acme.atlassian.net',dependencyLinks:['is blocked by','']}}));
  const note=junk.h.guide.querySelector('fieldset.board-link-names').querySelector('.board-field-warning');
  assert.equal(note?.textContent,'Use a non-empty link description — entry ignored.','an authored bad name is warned in the link names group');
});

test('J3 No activity after (days) writes tracking.staleDays; an invalid value shows the validator warning next to the field',()=>{
  const ui=harness(board()),before=ui.text;
  assert.equal(ui.field('No activity after (days)').placeholder,'7','the default shows as the placeholder');
  ui.type('No activity after (days)','3');
  assert.equal(ui.raw.page.tracking.staleDays,3);
  oneUndo(ui,before);
  ui.render().type('No activity after (days)','0');
  assert.equal(ui.raw.page.tracking.staleDays,0,'the value is written; the validator decides');
  ui.render();
  const field=ui.field('No activity after (days)');
  assert.equal(field.getAttribute('aria-invalid'),'true');
  assert.match(ui.described(field),/Must be a positive number — using 7 days/,'the validator warning sits next to the field');
  assert.equal(harness(board({staleDays:0})).jira().open,true,'on a new selection the warning opens the Jira section');
  ui.type('No activity after (days)','');
  assert.equal(Object.hasOwn(ui.raw.page.tracking,'staleDays'),false,'empty removes the key');
});

test('J4 existing dependency rows edit, move and remove in place; bad edits are refused; an authored invalid entry is warned at its row',()=>{
  const deps=[{ticket:'DOOR-101',on:'DOOR-102'},{ticket:'DOOR-102',on:'DOOR-103',reason:'Schema'},{ticket:'door-9',on:'DOOR-9'}];
  const ui=harness(board({jira:{site:'https://acme.atlassian.net'},dependencies:deps}));
  const bad=ui.field('Dependency 3 ticket');
  assert.equal(bad.getAttribute('aria-invalid'),'true','the invalid authored row is marked');
  assert.match(ui.described(bad),/Use \{"ticket": "UX-89"/,'its validator warning sits at the row');
  let before=ui.text;
  ui.type('Dependency 1 waits on','door-104');
  assert.deepEqual(ui.raw.page.tracking.dependencies[0],{ticket:'DOOR-101',on:'DOOR-104'});
  assert.deepEqual(ui.raw.page.tracking.dependencies[2],deps[2],'the invalid authored entry is kept as written');
  oneUndo(ui,before);
  ui.render();before=ui.text;
  ui.type('Dependency 1 waits on','DOOR-101');assert.equal(ui.text,before,'self-dependency refused');
  ui.render().type('Dependency 1 waits on','DOOR-103');ui.render();
  ui.type('Dependency 2 ticket','DOOR-101');assert.equal(ui.raw.page.tracking.dependencies[1].ticket,'DOOR-102','a duplicate pair is refused');
  ui.render();before=ui.text;
  ui.type('Dependency 2 reason','');
  assert.deepEqual(ui.raw.page.tracking.dependencies[1],{ticket:'DOOR-102',on:'DOOR-103'},'an empty reason removes it');
  ui.render().click('Move up dependency 2');
  assert.deepEqual(ui.raw.page.tracking.dependencies.map(d=>d.ticket),['DOOR-102','DOOR-101','door-9']);
  assert.equal(ui.button('Move up dependency 1').disabled,true,'the first row cannot move up');
  ui.click('Remove dependency 3');
  assert.deepEqual(ui.raw.page.tracking.dependencies.map(d=>d.ticket),['DOOR-102','DOOR-101']);
  ui.render().click('Remove dependency 1');ui.render().click('Remove dependency 1');
  assert.equal(Object.hasOwn(ui.raw.page.tracking,'dependencies'),false,'removing the last row removes the key');
  ui.h.session.undo();assert.equal(ui.raw.page.tracking.dependencies.length,1,'each Remove is one Undo step');
});

test('J5 the Jira header counts dependencies; no "edit in JSON for now" note',()=>{
  const ui=harness(board({jira:{site:'https://acme.atlassian.net'},dependencies:[{ticket:'DOOR-101',on:'DOOR-102'},{ticket:'DOOR-102',on:'DOOR-103'}]}));
  assert.equal(ui.jira().querySelector('summary').textContent,'Jira · acme.atlassian.net · 2 dependencies');
  assert.doesNotMatch(ui.text_(ui.jira()),/edit in JSON for now/);
});

test('J6 a tracking.jira the form cannot read stays as written when a dependency or No activity edit is saved',()=>{
  const ui=harness(board({jira:'acme',staleDays:5}));
  ui.type('No activity after (days)','3');
  assert.equal(ui.raw.page.tracking.staleDays,3);assert.equal(ui.raw.page.tracking.jira,'acme','tracking.jira is kept');
  ui.render().draft('New dependency ticket','DOOR-101').draft('New dependency waits on','DOOR-102');ui.click('Add dependency');
  assert.deepEqual(ui.raw.page.tracking.dependencies,[{ticket:'DOOR-101',on:'DOOR-102'}]);assert.equal(ui.raw.page.tracking.jira,'acme','tracking.jira is still kept');
});

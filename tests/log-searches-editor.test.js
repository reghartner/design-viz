'use strict';
/* #1233 part 2 (ticket item 3): desktop Workbench "Log searches" editor in Status board settings.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| L1 | New log search (label + query) adds tracking.telemetry.lookups.<id>; a blank id is made from the label; one Undo removes it | status board without lookups | source shape; undo restores the exact text; canUndo false | several history steps; id required |
| L2 | Each field of a search (label, query, suggested values, Loki datasource, trace and span ID fields) writes its key; each edit is one Undo step | one search | source after each edit; one undo per edit | values written as text; fields dropped |
| L3 | Validator warnings sit next to their field: values without a $value slot marks the Query field | values on a query with no slot | aria-invalid + aria-describedby on the Query control; the note says why; not repeated in the general list | warnings only in one list at the bottom |
| L4 | Move up / Move down reorder searches (authored order is the Trace view's order); the ends are disabled | two searches | key order; disabled first up / last down | reorder rewrites fields |
| L5 | Remove log search deletes one; removing the last keeps lookups {} (the typed box); the Offer checkbox adds or drops the block and cannot drop it while searches exist | one search | source after each; checkbox disabled with a reason | removing the last drops the typed box silently |
| L6 | New log search drafts survive a re-render of the same selection; Enter in the label adds; the drafts clear after Add | board | input values after a re-render; after Enter | drafts lost on a repaint |
| L7 | The section header names the count; one fold per search keyed by its id; a pick-list, typed or fixed search says which it is | two searches | header text; fold titles; kind notes | |
| L8 | Command errors: bad id, duplicate id, missing label or query; an unknown search | telemetryEditPage | error texts | silent no-ops |
| L9 (#1415) | "Only lines with a trace ID starts checked" writes requireTraceId false when cleared and removes the key when checked, one Undo step each; a non-boolean value is marked at the checkbox | one search | source; undo; aria-invalid + note | a string "false"; the key kept as true; a bad value dropping the search |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/trace-connections-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
const BOARD={kind:'board'};
const QUERY='{env="$env"} |= "order placed" | order_id="$value"';
function board(telemetry){
  const d={nodes:{api:{title:'API'},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}],panels:[{id:'status',type:'live-status',title:'Status'}]};
  const tracking={jira:{site:'https://acme.atlassian.net'}};if(telemetry)tracking.telemetry=telemetry;
  return {page:{title:'Board',tracking,sections:[{heading:'Flow',diagram:d}]}};
}
function harness(spec){
  const e=inspectorEnvironment(names),h=e.mount(spec);h.session.target=BOARD;h.inspector.render();
  // A commit's form refresh can schedule a second refresh; run timers until none is left.
  const settle=()=>{for(let i=0;i<10 && h.timers.size;i++)h.flush();};
  const ui={e,h,
    // Undo and redo can clear the selection; the test reselects Status board settings like a reader would.
    render(){h.session.target=BOARD;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},get lookups(){const t=JSON.parse(h.text).page.tracking.telemetry;return t && t.lookups;},
    section(){return h.guide.querySelectorAll('details.board-section').find(s=>s.getAttribute('data-board-section')==='lookups');},
    row(label){const row=ui.section().querySelectorAll('.frow').find(r=>r.querySelector('.flab')?.textContent===label);return row?row.children[1]:null;},
    control(label){const el=ui.row(label);assert.ok(el,'control "'+label+'" exists');return el.matches && el.matches('input,select,textarea')?el:(el.querySelector('input,select,textarea') || el);},
    type(label,value){const el=ui.control(label);el.value=value;el.fire('input');return ui;},
    set(label,value){const el=ui.control(label);el.value=value;el.fire('change');settle();return ui;},
    button(label){return ui.section().querySelectorAll('button').find(b=>b.textContent===label) || null;},
    click(label){const b=ui.button(label);assert.ok(b,'button "'+label+'" exists');b.fire('click');settle();return ui;},
    folds(){return ui.section().querySelectorAll('details.log-search').map(f=>f.querySelector('summary').textContent);},
    fold(id){return ui.section().querySelectorAll('details.log-search').find(f=>f.getAttribute('data-log-search')===id);},
    get active(){return e.doc.activeElement;},settle,
    undoSteps(){let n=0;while(h.session.canUndo()){h.session.undo();n++;}return n;}};
  return ui;
}

test('L1 New log search adds tracking.telemetry.lookups.<id> from label and query, with an id made from the label, as one Undo step',()=>{
  const ui=harness(board()),before=ui.text;
  assert.ok(!/No settings yet/.test(ui.section().querySelector('summary').textContent),'the section is no longer a placeholder');
  ui.type('New log search label','Order ID').type('New log search query',QUERY);
  const preview=ui.section().querySelector('p.log-search-id-preview');assert.equal(preview.textContent,'Will be saved as tracking.telemetry.lookups.order-id (from the label).','review c1: the id that will be made is shown');
  assert.equal(preview.getAttribute('aria-live'),null,'review c2: not announced on every keystroke');
  ui.type('New log search id','9bad');assert.equal(preview.textContent,'"9bad" cannot be an id: start with a letter and use letters, digits, - and _.','review c2: a refused id is marked');
  assert.equal(ui.control('New log search id').getAttribute('aria-invalid'),'true');ui.type('New log search id','');assert.equal(ui.control('New log search id').getAttribute('aria-invalid'),null);
  assert.equal(ui.control('New log search id').getAttribute('aria-describedby'),preview.id);
  ui.click('Add log search');
  assert.deepEqual(plain(ui.lookups),{'order-id':{label:'Order ID',query:QUERY}});
  assert.equal(ui.fold('order-id').open,true,'review c1: the new search opens');
  assert.deepEqual(ui.folds(),['Log search order-id · Order ID'],'one fold for the new search');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo removes it');assert.equal(ui.h.session.canUndo(),false);
  // An explicit id is used as typed; a second search with the same label gets its own id.
  ui.h.session.redo();ui.render();
  ui.type('New log search id','device').type('New log search label','Device').type('New log search query','{app="cams"} | device="$value"').click('Add log search');
  ui.type('New log search label','Order ID').type('New log search query',QUERY).click('Add log search');
  assert.deepEqual(Object.keys(ui.lookups),['order-id','device','order-id-2'],'authored order; a taken id gets a suffix');
});

test('L2 every field of a search writes its key, one Undo step each',()=>{
  const ui=harness(board({lookups:{order:{label:'Order',query:QUERY}}})),start=ui.text;
  ui.set('order label','Order number').set('order query','{env="$env"} | order="$value"').set('order suggested values','A-1\n\n A-2 \n')
    .set('order Loki datasource UID','loki-${env}').set('order trace ID field','tid').set('order span ID field','sid');
  assert.deepEqual(plain(ui.lookups.order),{label:'Order number',query:'{env="$env"} | order="$value"',values:['A-1','A-2'],datasource:'loki-${env}',fields:{traceId:'tid',spanId:'sid'}});
  ui.set('order trace ID field','').set('order span ID field','').set('order suggested values','').set('order Loki datasource UID','');
  assert.deepEqual(plain(ui.lookups.order),{label:'Order number',query:'{env="$env"} | order="$value"'},'clearing a field removes its key');
  assert.equal(ui.undoSteps(),10,'ten edits, ten Undo steps');assert.equal(ui.text,start);
  ui.render();ui.set('order label','');assert.equal(ui.lookups.order.label,'Order','a required label is not cleared');
});

test('L3 a validator warning sits next to its field: suggested values without a $value slot marks the Query field',()=>{
  const ui=harness(board({lookups:{fixed:{label:'Recent errors',query:'{app="api"} |= "error"',values:['a']}}}));
  const query=ui.control('fixed query');assert.equal(query.getAttribute('aria-invalid'),'true');
  const id=query.getAttribute('aria-describedby'),note=ui.section().querySelectorAll('p').find(p=>p.id===id);
  assert.ok(note,'the query names its note');assert.equal(note.textContent,'Has suggested values but no $value slot. The Trace view drops this search until it is fixed.','review c1: worded for the editor');
  assert.equal(note.parentNode,query.closest('.frow').parentNode,'the note is in the same fold');
  assert.ok(ui.section().querySelectorAll('details.log-search')[0].open,'a search with a warning starts open');
  const general=ui.section().querySelector('[aria-label="Log searches warnings"]');
  assert.ok(!general || !general.children.some(li=>/no \$value slot/.test(li.textContent)),'not repeated in the general list');
  // Review c1: a value listed twice is flagged at the suggested values field.
  const dup=harness(board({lookups:{camera:{label:'Camera',query:QUERY,values:['arch','wren','arch']}}})),values=dup.control('camera suggested values');
  assert.equal(values.getAttribute('aria-invalid'),'true');
  assert.equal(dup.section().querySelectorAll('p').find(p=>p.id===values.getAttribute('aria-describedby'))?.textContent,'Suggested value "arch" is listed more than once.');
});

test('L4 Move up and Move down reorder searches; the ends are disabled',()=>{
  const ui=harness(board({lookups:{a:{label:'A',query:QUERY},b:{label:'B',query:QUERY},c:{label:'C',query:QUERY}}}));
  const up=ui.button('Move log search a up'),down=ui.button('Move log search c down');assert.ok(up && down,'Move buttons exist');
  assert.equal(up.disabled,true);assert.equal(down.disabled,true);
  // Review c1: focus stays on the Move button that was pressed while it can still be used, else the other one.
  const press=label=>{const b=ui.button(label);b.focus();b.fire('click');ui.settle();};
  press('Move log search a down');assert.deepEqual(Object.keys(ui.lookups),['b','a','c']);assert.equal(ui.active,ui.button('Move log search a down'),'focus on a\'s Move down, still enabled');
  press('Move log search a down');assert.deepEqual(Object.keys(ui.lookups),['b','c','a']);assert.equal(ui.active,ui.button('Move log search a up'),'a is last: focus moves to its Move up');
  assert.deepEqual(plain(ui.lookups.a),{label:'A',query:QUERY},'fields are kept');
  // After Remove, focus goes to the next search's header, or to New log search after the last one.
  press('Remove log search b');assert.equal(ui.active,ui.fold('c').querySelector('summary'),'the next search');
  press('Remove log search a');assert.equal(ui.active,ui.section().querySelector('details.log-search-add').querySelector('summary'),'New log search');
  assert.equal(ui.undoSteps(),4);
});

test('L5 Remove keeps lookups {} for the typed box; the Offer checkbox adds or drops the block and cannot drop it while searches exist',()=>{
  const ui=harness(board({lookups:{a:{label:'A',query:QUERY}}}));
  const offer=ui.control('Offer log searches in the Trace view');assert.equal(offer.checked,true);assert.equal(offer.disabled,true,'searches exist: it cannot be turned off');
  assert.ok(offer.title.includes('Remove the log searches first'));
  const why=ui.section().querySelectorAll('p').find(p=>p.id===offer.getAttribute('aria-describedby'));assert.equal(why?.textContent,'Remove the searches below to turn this off.','review c1: a visible reason');
  ui.click('Remove log search a');assert.deepEqual(plain(ui.lookups),{},'the typed LogQL box stays');
  ui.render();const off=ui.control('Offer log searches in the Trace view');assert.equal(off.disabled,false);
  off.checked=false;off.fire('change');ui.h.flush();assert.equal(ui.lookups,undefined,'unchecked: no log search block');
  ui.render();const on=ui.control('Offer log searches in the Trace view');on.checked=true;on.fire('change');ui.h.flush();assert.deepEqual(plain(ui.lookups),{});
  assert.equal(ui.undoSteps(),3);
});

test('L6 New log search drafts survive a re-render; Enter in the label adds; drafts clear after Add',()=>{
  const ui=harness(board());
  ui.type('New log search label','Order ID').type('New log search query',QUERY);ui.render();
  assert.equal(ui.control('New log search label').value,'Order ID','the label draft survives a re-render');assert.equal(ui.control('New log search query').value,QUERY);
  // Review c1: with the label focused, as a reader has it, Enter adds and the form refreshes on its own.
  const typed=ui.control('New log search label');typed.focus();typed.fire('keydown',{key:'Enter'});ui.settle();
  assert.deepEqual(Object.keys(ui.lookups),['order-id'],'Enter adds');
  assert.deepEqual(ui.folds(),['Log search order-id · Order ID'],'the new fold is shown without a manual render');assert.equal(ui.fold('order-id').open,true);
  assert.equal(ui.section().querySelector('summary').textContent,'Log searches · 1 search');
  assert.equal(ui.control('New log search label').value,'','drafts clear after Add');assert.equal(ui.control('New log search query').value,'');
  assert.equal(ui.active,ui.control('order-id label'),'focus moves to the new search\'s label');
  // A refused add keeps the drafts.
  ui.type('New log search id','9bad').type('New log search label','Bad').type('New log search query',QUERY).click('Add log search');ui.render();
  assert.equal(ui.control('New log search id').value,'9bad');assert.deepEqual(Object.keys(ui.lookups),['order-id']);
});

test('L7 the header counts searches; one fold per search; each says whether it is a pick list, typed or fixed',()=>{
  const ui=harness(board({lookups:{camera:{label:'Camera model',query:'{app="cams"} | model="$value"',values:['arch','wren']},device:{label:'Device',query:'{app="cams"} | device="$value"'},errors:{label:'Recent errors',query:'{app="cams"} |= "error"'}}}));
  assert.equal(ui.section().querySelector('summary').textContent,'Log searches · 3 searches');
  assert.deepEqual(ui.folds(),['Log search camera · Camera model','Log search device · Device','Log search errors · Recent errors']);
  const kinds=ui.section().querySelectorAll('p.log-search-kind').map(p=>p.textContent);
  assert.match(kinds[0],/^Pick list:/);assert.match(kinds[1],/^Typed search:/);assert.match(kinds[2],/^Fixed search:/);
  assert.equal(harness(board()).section().querySelector('summary').textContent,'Log searches · Not set');
  assert.equal(harness(board({lookups:{}})).section().querySelector('summary').textContent,'Log searches · Typed query only');
});

test('L8 command errors name the problem',()=>{
  const {C}=inspectorEnvironment(names),edit=(t,e)=>plain(C.telemetryEditPage(t,e));
  assert.match(edit({},{op:'addLookup',name:'9bad',label:'X',query:QUERY}).error,/start with a letter/);
  assert.match(edit({lookups:{a:{label:'A',query:QUERY}}},{op:'addLookup',name:'a',label:'X',query:QUERY}).error,/already exists/);
  assert.match(edit({},{op:'addLookup',name:'x',label:' ',query:QUERY}).error,/label/i);
  assert.match(edit({},{op:'addLookup',name:'x',label:'X',query:''}).error,/query/i);
  assert.match(edit({},{op:'lookup',name:'nope',field:'label',value:'X'}).error,/not found/i);
  assert.match(edit({lookups:{a:{label:'A',query:QUERY}}},{op:'lookup',name:'a',field:'colour',value:'X'}).error,/Unknown/);
  assert.deepEqual(edit({},{op:'addLookup',name:'constructor',label:'C',query:QUERY}).value,{lookups:{constructor:{label:'C',query:QUERY}}},'an Object.prototype name is an ordinary id');
  assert.match(edit(true,{op:'addLookup',name:'x',label:'X',query:QUERY}).error,/not an object/,'review c1: a non-object telemetry block is refused');
  assert.equal(C.telemetryLookupId('Número de pedido',{}),'numero-de-pedido');assert.equal(C.telemetryLookupId('Straße',{}),'strasse');
  assert.equal(C.telemetryLookupId('注文',{}),'search-1');assert.equal(C.telemetryLookupId('注文',{'search-1':{}}),'search-2');
  assert.ok(C.telemetryLookupId('a'.repeat(100),{}).length<=40);assert.ok(!/-$/.test(C.telemetryLookupId('x'.repeat(39)+' y',{})));
  assert.equal(C.telemetryLookupId('Order ID',{}),'order-id');assert.equal(C.telemetryLookupId('Order ID',{'order-id':{}}),'order-id-2');assert.equal(C.telemetryLookupId('42 things',{}),'search-42-things');
});

test('L9 #1415 the "Only lines with a trace ID starts checked" checkbox writes requireTraceId false, or removes it when checked',()=>{
  const ui=harness(board({lookups:{order:{label:'Order',query:QUERY}}})),start=ui.text,label='order Only lines with a trace ID starts checked';
  const box=ui.control(label);assert.equal(box.type,'checkbox');assert.equal(box.checked,true,'checked by default, as in the Trace view');
  assert.match(ui.row(label).closest('.frow').getAttribute('title') || box.title || '',/requireTraceId/,'the tooltip says what it writes');
  box.checked=false;box.fire('change');ui.settle();assert.strictEqual(ui.lookups.order.requireTraceId,false);
  ui.render();assert.equal(ui.control(label).checked,false,'the repaint shows it unchecked');
  const again=ui.control(label);again.checked=true;again.fire('change');ui.settle();
  assert.deepEqual(plain(ui.lookups.order),{label:'Order',query:QUERY},'checked is the default: the key is removed');
  assert.equal(ui.undoSteps(),2,'one Undo step per change');assert.equal(ui.text,start);
  // An authored non-boolean is marked at the checkbox with the validator's reason; the search keeps working with the default.
  const bad=harness(board({lookups:{order:{label:'Order',query:QUERY,requireTraceId:'no'}}})),mark=bad.control(label);
  assert.equal(mark.getAttribute('aria-invalid'),'true');
  assert.equal(bad.section().querySelectorAll('p').find(p=>p.id===mark.getAttribute('aria-describedby'))?.textContent,'Must be true or false — the default true is used.','#1415: the search is kept, so no "drops this search"');
  assert.equal(mark.checked,true,'the checkbox shows the default it falls back to');
});

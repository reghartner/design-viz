'use strict';
/* #1240 desktop Workbench: metrics variables as rows, environment rename, signal role and window.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| V1 | Status board settings → Metrics: New shared variable name + value + Add shared variable writes `tracking.telemetry.variables.<name>`; an environment's New variable row writes `tracking.telemetry.environments.<id>.variables.<name>`; each is one Undo step. | board with environments qa and stg | source values; exact text after Undo; one history step | a JSON textarea only; a write to the wrong scope |
| V2 | Variable rows rename (order kept), change the value and remove (the key goes when empty); names the validator refuses (reserved env/account, a leading digit) and empty values are refused with no write; an authored bad entry is kept and its validator warning sits at its row. | shared {a:'1', b:'2', '9x':'3'} | keys order after rename; refusals leave the text; row note + aria-invalid | a rename that moves the key to the end; junk written; warnings only in the list |
| V3 | Environments: renaming stg to staging while it is the default renames the profile in place and updates `environment`; one Undo restores the exact text; an existing id or an invalid id is refused. | environment stg default, profiles qa and stg | key order, environment value, Undo text | the default left pointing at the old id; a profile moved to the end |
| V4 | A carrier signal's role select writes `role:"error"` and Normal removes it; its window text writes a duration and refuses junk; a template signal's window is written under the template; a CloudWatch signal's window is disabled; an authored bad window shows its validator warning at the field. | connection with a grafana signal; page template with a loki signal; cloudwatch signal | source values; refusals; disabled; note text | no controls; role lost on another field edit; template edits written to carriers |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/trace-connections-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const BOARD={kind:'board'},EDGE={kind:'edge',section:0,index:0};
function board(telemetry,edgeTelemetry){
  const edge={from:'api',to:'db',label:'write'};if(edgeTelemetry)edge.telemetry=edgeTelemetry;
  return {page:{title:'Board',tracking:{jira:{site:'https://acme.atlassian.net'},telemetry},sections:[{heading:'Flow',
    diagram:{nodes:{api:{title:'API'},db:{title:'Store'}},rows:[['api','db']],edges:[edge],panels:[{id:'status',type:'live-status',title:'Epic status'}]}}]}};
}
function harness(spec,target){
  const e=inspectorEnvironment(names),h=e.mount(spec);
  const ui={e,h,
    select(t){ui.target=t;h.session.target=t;h.inspector.render();return ui;},
    // Undo can move the selection; render() reselects the target under test.
    render(){return ui.select(ui.target);},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    get t(){return JSON.parse(h.text).page.tracking.telemetry;},
    field(label){const el=h.guide.querySelector('[aria-label="'+label+'"]');assert.ok(el,'control "'+label+'" exists');return el;},
    set(label,value){const el=ui.field(label);el.value=value;el.fire('input');el.fire('change');h.flush();return ui;},
    draft(label,value){const el=ui.field(label);el.value=value;el.fire('input');return ui;},
    button(label){return h.guide.querySelectorAll('button').find(b=>b.textContent===label) || null;},
    click(label){const b=ui.button(label);assert.ok(b,'button "'+label+'" exists');b.fire('click');h.flush();return ui;},
    described(control){return (control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean).map(id=>h.guide.querySelector('#'+id)?.textContent || '').join(' ');}};
  return ui.select(target);
}
function oneUndo(ui,before){
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo restores the exact text');assert.equal(ui.h.session.canUndo(),false,'the edit was one Undo step');
}

test('V1 Add shared variable writes tracking.telemetry.variables; an environment row writes under that environment; one Undo each',()=>{
  const ui=harness(board({grafana:{prometheus:'prom'},environment:'stg',environments:{qa:{},stg:{}}}),BOARD),before=ui.text;
  ui.draft('New shared variable name','team').draft('New shared variable value','core').click('Add shared variable');
  assert.deepEqual(ui.t.variables,{team:'core'});
  assert.equal(ui.field('Shared variable 1 name').value,'team');assert.equal(ui.field('Shared variable 1 value').value,'core');
  oneUndo(ui,before);
  ui.render().draft('New stg environment variable name','team').draft('New stg environment variable value','edge');
  ui.field('New stg environment variable value').fire('keydown',{key:'Enter'});ui.h.flush();
  assert.deepEqual(ui.t.environments,{qa:{},stg:{variables:{team:'edge'}}},'Enter adds; the row writes under stg only');
  assert.equal(Object.hasOwn(ui.t,'variables'),false,'no shared variables written');
  oneUndo(ui,before);
  const named=harness(board({environments:{shared:{}}}),BOARD);
  named.draft('New shared environment variable name','team').draft('New shared environment variable value','x').click('Add shared environment variable');
  assert.deepEqual(named.t,{environments:{shared:{variables:{team:'x'}}}},'an environment named "shared" has its own labels and writes under it');
  assert.equal(named.field('New shared variable name').value,'','the shared rows keep their own draft');
});

test('V2 variable rows rename in place, edit, remove; refused names and values write nothing; an authored bad entry is warned at its row',()=>{
  const ui=harness(board({variables:{a:'1',b:'2','9x':'3'}}),BOARD);
  const bad=ui.field('Shared variable 3 name');
  assert.equal(bad.getAttribute('aria-invalid'),'true');assert.match(ui.described(bad),/Use a non-reserved name and non-empty string/);
  let before=ui.text;
  ui.set('Shared variable 1 name','alpha');
  assert.deepEqual(Object.keys(ui.t.variables),['alpha','b','9x'],'rename keeps the order and the authored bad entry');
  oneUndo(ui,before);ui.render();before=ui.text;
  for(const name of ['env','account','9z','b'])ui.render().set('Shared variable 1 name',name);
  assert.equal(ui.text,before,'reserved, invalid and existing names are refused');
  ui.render().draft('New shared variable name','env').draft('New shared variable value','x').click('Add shared variable');
  assert.equal(ui.text,before,'a reserved name cannot be added');
  ui.render().draft('New shared variable name','c').draft('New shared variable value','  ').click('Add shared variable');
  assert.equal(ui.text,before,'an empty value cannot be added');
  ui.render().set('Shared variable 2 value','two');assert.equal(ui.t.variables.b,'two');
  ui.render().click('Remove shared variable a');ui.render().click('Remove shared variable b');ui.render().click('Remove shared variable 9x');
  assert.equal(ui.t==null || !Object.hasOwn(ui.t,'variables'),true,'removing the last variable removes the key (here the then-empty telemetry block too)');
});

test('V3 rename stg to staging while it is the default renames in place and updates environment; one Undo restores',()=>{
  const ui=harness(board({environment:'stg',environments:{qa:{grafana:{prometheus:'qa-prom'}},stg:{grafana:{prometheus:'stg-prom'},variables:{team:'core'}}}}),BOARD),before=ui.text;
  ui.set('stg environment id','staging');
  assert.deepEqual(Object.keys(ui.t.environments),['qa','staging'],'the profile keeps its place');
  assert.deepEqual(ui.t.environments.staging,{grafana:{prometheus:'stg-prom'},variables:{team:'core'}},'and its settings');
  assert.equal(ui.t.environment,'staging','the default follows the new id');
  oneUndo(ui,before);
  ui.render().set('stg environment id','qa');assert.equal(ui.text,before,'an existing id is refused');
  ui.render().set('stg environment id','9bad');assert.equal(ui.text,before,'an invalid id is refused');
  ui.render().set('qa environment id','test');
  assert.equal(ui.t.environment,'stg','renaming a profile that is not the default leaves environment alone');
});

test('V4 signal role and window on carriers and templates',()=>{
  const tpl={queue:{kind:'queue',signals:{lag:{loki:'sum(count_over_time({app="x"}[5m]))',unit:'msgs'}}}};
  const edgeBinding={kind:'call',signals:{rate:{grafana:'sum(rate(x[5m]))',unit:'req/h',label:'Rate'},cw:{cloudwatch:{namespace:'AWS/SQS',metric:'NumberOfMessagesSent',dimensions:{QueueName:'q'},statistic:'Sum',region:'us-east-1'}},bad:{grafana:'up',window:'forever'}}};
  const ui=harness(board({templates:tpl},edgeBinding),EDGE),before=ui.text;
  const edge=()=>ui.raw.page.sections[0].diagram.edges[0].telemetry.signals;
  ui.set('rate role','error');
  assert.deepEqual(edge().rate,{grafana:'sum(rate(x[5m]))',unit:'req/h',label:'Rate',role:'error'});
  oneUndo(ui,before);ui.render();
  ui.set('rate role','error');ui.render().set('rate unit','req/min');assert.equal(edge().rate.role,'error','another field edit keeps the role');
  ui.render().set('rate role','');assert.equal(Object.hasOwn(edge().rate,'role'),false,'Normal removes the role');
  ui.render().set('rate window','7d');assert.equal(edge().rate.window,'7d');
  const kept=ui.text;ui.render().set('rate window','forever');assert.equal(ui.text,kept,'a value that is not a duration is refused');
  ui.render().set('rate window','');assert.equal(Object.hasOwn(edge().rate,'window'),false,'empty uses the page window');
  assert.equal(ui.field('cw window').disabled,true,'CloudWatch signals always cover the page window');
  assert.ok(ui.h.guide.querySelectorAll('.metrics-window-note').some(p=>p.textContent==='Window: CloudWatch signals always cover the page window.'),'a visible note says why');
  const badWindow=ui.field('bad window');assert.equal(badWindow.getAttribute('aria-invalid'),'true');
  assert.match(ui.described(badWindow),/Use a duration such as "1h", "7d" or "now-7d" — ignored/,'the validator warning sits at the field');
  ui.select(BOARD).set('queue lag window','1h');
  assert.equal(ui.t.templates.queue.signals.lag.window,'1h','a template signal window is written under the template');
  ui.render().set('queue lag role','error');assert.equal(ui.t.templates.queue.signals.lag.role,'error');
});

'use strict';
/* #1357 (epic #1344 PR 4): telemetry variables scoped to an import (topologyImports[i].variables)
   or to one node or connection (telemetry.variables). Order, nearest the signal first: carrier,
   import, environment profile, board, company defaults (D6). Across nesting levels the value
   nearest the provider is kept and an outer different value is ignored with a warning (D7).
   Scoped values are literal and may never escape or widen the query they are filled into.
| row | rule |
|---|---|
| V1 | Precedence for a local and an imported carrier: carrier over import over profile over board; scoped values are the same in every environment. |
| V2 | Set once across nesting: a value the middle diagram set is kept; the outer import's or overlay's different value is ignored with a warning at the outer path; the same value warns nothing. |
| V3 | The same canon imported twice reads two values, one per import; carriers of another import are untouched. |
| V4 | A scoped value is filled in only where it cannot escape or widen: inside a string it has no quote of that kind, no \ and no control character; in a regex matcher no regex metacharacter; outside a string only a plain token. Otherwise the signal is not shown, with the reason. |
| V5 | Fragments filled from a scoped value pass the fragment checks after filling; Grafana SQL ${name} placeholders are the route for SQL; structured sources take the value literally. |
| V6 | Validator, on pages with a live-status panel only: a ${name} no scope sets, per environment profile, warns at the signal naming the environments and where to set it. |
| V7 | The reason for an unset variable names the import, the node or connection and the environment. |
| V8 | Shape warnings for bad scoped variables (reserved, bad name, empty, not a string), at their path; compatibility declares flow.telemetry-scoped-variables. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.createContext(C);
vm.runInContext(loader.composeSources(['canon.js','validator.js','compatibility.js']),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
const diagramOf=s=>s.page.sections[0].diagram;
const PANEL=[{id:'status',type:'live-status'}];
const LOKI='sum(count_over_time({app="dcf", code="${code}"}[5m]))';
const provider=(signal={loki:LOKI})=>spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',signals:{sent:signal}}}},rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}});
const consumer=(imports,extra={},page={})=>spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],panels:PANEL,topologyImports:imports,...extra},page);
// The signal as sent in environment env (null: the board's default).
// A resolver that refuses the document returns its message, so each row fails on what it returns.
const resolve=(doc,specs)=>{try{return specs?C.FlowTopology.resolveSource(doc,{version:1,id:doc.page.canon.id,specs}):doc;}catch(ex){return {refused:ex.message};}};
function sent(doc,specs,id,env=null,name='sent'){
  const page=resolve(doc,specs);if(page.refused)return {error:page.refused,query:page.refused};
  const binding=C.carrierTelemetry(diagramOf(page).nodes[id],C.trackingTelemetry(page.page).templates,undefined,C.telemetryEnvironmentConfig(page.page,env));
  return plain(binding.signals[name]);
}
const findings=(doc,specs)=>{const page=resolve(doc,specs);if(page.refused)return [page.refused];const r=C.validate(C.normalize(page));return plain(r.warnings).filter(w=>/variable|\$\{/.test(w));};

test('V1 precedence: carrier, then import, then profile, then board',()=>{
  const board={tracking:{telemetry:{variables:{code:'BOARD'},environment:'prd',environments:{prd:{variables:{code:'PRD'}},qa:{}}}}};
  const p=provider();
  const run=(imp,env)=>{const c=consumer([{spec:'provider',export:'core',as:'fc',...imp}],{},board);return sent(c,[p,c],'fc::dcf',env).query;};
  assert.equal(run({},'qa'),LOKI.replace('${code}','BOARD'),'the board value');
  assert.equal(run({},'prd'),LOKI.replace('${code}','PRD'),'the profile over the board');
  assert.equal(run({variables:{code:'IMPORT'}},'prd'),LOKI.replace('${code}','IMPORT'),'the import over the profile');
  assert.equal(run({variables:{code:'IMPORT'},nodeTracking:{dcf:{telemetry:{extends:true,variables:{code:'CARRIER'}}}}},'prd'),LOKI.replace('${code}','CARRIER'),'the carrier over the import');
  assert.equal(run({variables:{code:'IMPORT'}},'qa'),LOKI.replace('${code}','IMPORT'),'the same in every environment');
  const local=spec('local',{nodes:{a:{title:'A',telemetry:{kind:'service',variables:{code:'MINE'},signals:{sent:{loki:LOKI}}}}},rows:[['a']],panels:PANEL},board);
  assert.equal(sent(local,null,'a','prd').query,LOKI.replace('${code}','MINE'),'a local carrier\'s own value');
});

test('V2 set once: the value nearest the provider is kept; a different outer value warns',()=>{
  const p=provider();
  const middle=spec('middle',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'inner',variables:{code:'MIDDLE'}}],topologyExports:{nested:{nodes:['inner::dcf'],edges:[]}}});
  const outer=(imp)=>consumer([{spec:'middle',export:'nested',as:'outer',...imp}]);
  let c=outer({variables:{code:'BOARD'}});
  assert.equal(sent(c,[p,middle,c],'outer::inner::dcf').query,LOKI.replace('${code}','MIDDLE'));
  assert.deepEqual(findings(c,[p,middle,c]),['sections[0].diagram.topologyImports[0].variables.code: ${code} is already set to "MIDDLE" nearer the provider; this value is ignored']);
  c=outer({nodeTracking:{'inner::dcf':{telemetry:{extends:true,variables:{code:'OVERLAY'}}}}});
  assert.equal(sent(c,[p,middle,c],'outer::inner::dcf').query,LOKI.replace('${code}','MIDDLE'));
  assert.deepEqual(findings(c,[p,middle,c]),['sections[0].diagram.topologyImports[0].nodeTracking.inner::dcf.telemetry.variables.code: ${code} is already set to "MIDDLE" nearer the provider; this value is ignored']);
  c=outer({variables:{code:'MIDDLE'}});
  assert.deepEqual(findings(c,[p,middle,c]),[],'the same value warns nothing');
  const own=spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',variables:{code:'PROVIDER'},signals:{sent:{loki:LOKI}}}}},rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}});
  c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:'BOARD'}}]);
  assert.equal(sent(c,[own,c],'fc::dcf').query,LOKI.replace('${code}','PROVIDER'),'the provider carrier\'s own value');
  const repl=consumer([{spec:'provider',export:'core',as:'fc',nodeTracking:{dcf:{telemetry:{kind:'service',variables:{code:'BOARD'},signals:{sent:{loki:LOKI}}}}}}]);
  assert.equal(sent(repl,[own,repl],'fc::dcf').query,LOKI.replace('${code}','PROVIDER'),'a replacing binding keeps the provider\'s value too');
  const board=spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',signals:{sent:{loki:LOKI}}}}},rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}},{tracking:{telemetry:{variables:{code:'PROVIDER_BOARD'}}}});
  c=consumer([{spec:'provider',export:'core',as:'fc'}]);
  assert.match(sent(c,[board,c],'fc::dcf',null).error || '',/Set telemetry variable \$\{code\}/,'a provider page\'s board-level variables do not travel');
});

test('V3 the same canon imported twice reads one value per import',()=>{
  const p=provider();
  const c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:'FULL_CHARGE'}},{spec:'provider',export:'core',as:'et',position:{x:40,y:400},variables:{code:'EARLY'}},{spec:'provider',export:'core',as:'none',position:{x:40,y:700}}]);
  assert.equal(sent(c,[p,c],'fc::dcf').query,LOKI.replace('${code}','FULL_CHARGE'));
  assert.equal(sent(c,[p,c],'et::dcf').query,LOKI.replace('${code}','EARLY'));
  assert.equal(sent(c,[p,c],'none::dcf').error,'Set telemetry variable ${code} for this import, this node or connection, or the active environment.');
});

test('V4 a scoped value can never escape or widen the query it is filled into',()=>{
  const run=(signal,value)=>{const p=provider(signal);const c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:value}}]);return sent(c,[p,c],'fc::dcf');};
  const not=(why)=>'Variable ${code} from this import or carrier cannot be filled in safely here ('+why+'), so the signal is not shown.';
  assert.equal(run({loki:LOKI},'FULL_CHARGE').error,undefined);
  for(const v of ['x"} or vector(1) #','a\\"b','line\nbreak'])assert.equal(run({loki:LOKI},v).error,not('it would end the string it is filled into'),JSON.stringify(v));
  const regex={loki:'sum(count_over_time({app="dcf", code=~"${code}"}[5m]))'};
  for(const v of ['.*','A|B','A.+'])assert.equal(run(regex,v).error,not('it is filled into a regex and holds regex characters'),v);
  assert.equal(run(regex,'FULL_CHARGE').query,'sum(count_over_time({app="dcf", code=~"FULL_CHARGE"}[5m]))');
  const bare={grafana:'sum(rate(x_total{job="dcf"}[${window}]))'};
  const runBare=v=>{const p=provider(bare);const c=consumer([{spec:'provider',export:'core',as:'fc',variables:{window:v}}]);return sent(c,[p,c],'fc::dcf');};
  assert.equal(runBare('5m').query,'sum(rate(x_total{job="dcf"}[5m]))');
  assert.equal(runBare('5m] or vector(1) [5m').error,'Variable ${window} from this import or carrier cannot be filled in safely here (outside a string it may hold only letters, digits and . _ : - @), so the signal is not shown.');
  const logs={cloudwatchLogs:{logGroups:['g'],query:'filter code = "${code}" and @message like /${code}/ | stats count() as n',region:'us-east-1',valueField:'n'}};
  assert.equal(run(logs,'FULL').query.query,'filter code = "FULL" and @message like /FULL/ | stats count() as n');
  assert.equal(run(logs,'a/b').error,not('it is filled into a regex and holds regex characters'));
  const board=spec('consumer',{nodes:{a:{title:'A',telemetry:{kind:'service',signals:{sent:{loki:LOKI}}}}},rows:[['a']],panels:PANEL},{tracking:{telemetry:{variables:{code:'x"} or vector(1) #'}}}});
  assert.equal(sent(board,null,'a').query,LOKI.replace('${code}','x"} or vector(1) #'),'board-wide variables keep today\'s meaning');
});

test('V5 fragments, SQL placeholders and structured sources',()=>{
  const p=provider({loki:'sum(count_over_time({app="dcf"}[5m]))',needsNarrow:['code']});
  const run=value=>{const c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:value},nodeTracking:{dcf:{telemetry:{extends:true,signals:{sent:{narrow:{loki:'| code="${code}"'}}}}}}}]);return sent(c,[p,c],'fc::dcf');};
  assert.equal(run('FULL').query,'sum(count_over_time({app="dcf"} | code="FULL" [5m]))');
  assert.equal(run('x" | drop code').error,'After its variables were filled in, a LogQL narrowing of this signal is not valid (its quotes are unbalanced), so it is not shown.');
  const sql=provider({sql:"SELECT count(*) FROM events WHERE code = '${code}'"});
  let c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:'FULL'}}]);
  assert.equal(sent(c,[sql,c],'fc::dcf').query,"SELECT count(*) FROM events WHERE code = 'FULL'",'the SQL route');
  c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:"x' OR '1'='1"}}]);
  assert.equal(sent(c,[sql,c],'fc::dcf').error,'Variable ${code} from this import or carrier cannot be filled in safely here (it would end the string it is filled into), so the signal is not shown.');
  const hc=provider({honeycomb:{calculations:[{op:'COUNT'}],filters:[{column:'code',op:'=',value:'${code}'}]}});
  c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:'a"b'}}]);
  assert.deepEqual(sent(c,[hc,c],'fc::dcf').query.filters,[{column:'code',op:'=',value:'a"b'}],'a structured value is literal');
});

test('V6 validator: an unset ${name} warns per environment, only where signals are shown',()=>{
  const board=(envs)=>({tracking:{telemetry:{environment:'prd',environments:envs}}});
  const p=provider();
  let c=consumer([{spec:'provider',export:'core',as:'fc'}],{},board({prd:{variables:{code:'P'}},qa:{},dev:{}}));
  assert.deepEqual(findings(c,[p,c]),['sections[0].diagram.nodes.fc::dcf.telemetry.signals.sent: ${code} is not set for import fc, this node, or the board\'s variables in environments qa, dev, so the signal is not shown there. Set it in the variables of import fc, on the node, or in tracking.telemetry.variables.']);
  c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:'X'}}],{},board({prd:{},qa:{}}));
  assert.deepEqual(findings(c,[p,c]),[],'set for the import');
  const noPanel=consumer([{spec:'provider',export:'core',as:'fc'}],{panels:[]},board({prd:{},qa:{}}));
  assert.deepEqual(findings(noPanel,[p,noPanel]),[],'a canon page without a panel still builds');
  const local=spec('local',{nodes:{a:{title:'A',telemetry:{kind:'service',signals:{sent:{loki:LOKI}}}}},rows:[['a']],panels:PANEL});
  assert.deepEqual(findings(local,null),['sections[0].diagram.nodes.a.telemetry.signals.sent: ${code} is not set on this node or in the board\'s variables, so the signal is not shown. Set it on the node or in tracking.telemetry.variables.']);
  assert.deepEqual(findings(provider(),null),[],'the provider page itself has no panel');
});

test('V7 the reason for an unset variable names every scope',()=>{
  const local=spec('local',{nodes:{a:{title:'A',telemetry:{kind:'service',signals:{sent:{loki:LOKI}}}}},rows:[['a']],panels:PANEL});
  assert.equal(sent(local,null,'a').error,'Set telemetry variable ${code} for this import, this node or connection, or the active environment.');
  const acct=spec('local',{nodes:{a:{title:'A',telemetry:{kind:'service',signals:{sent:{grafana:'x{account="${account}"}'}}}}},rows:[['a']],panels:PANEL});
  assert.match(sent(acct,null,'a').error,/or tracking\.telemetry\.grafana\.accountId\.$/);
});

test('V8 shape warnings and compatibility',()=>{
  const c=consumer([{spec:'provider',export:'core',as:'fc',variables:{env:'x',ok:'y','bad name':'z',empty:'',num:3}}],{nodes:{local:{title:'Local',telemetry:{kind:'service',variables:{account:'1'},signals:{s:{grafana:'up'}}}}}});
  const w=plain(C.validate(C.normalize(c)).warnings).filter(m=>/variables/.test(m));
  for(const name of ['env','bad name','empty','num'])assert.ok(w.includes('sections[0].diagram.topologyImports[0].variables.'+name+': use a non-reserved name and non-empty string — ignored'),name+'\n'+w.join('\n'));
  assert.ok(w.includes('sections[0].diagram.nodes.local.telemetry.variables.account: use a non-reserved name and non-empty string — ignored'),w.join('\n'));
  assert.ok(!w.some(m=>/variables\.ok/.test(m)));
  const bad=consumer([{spec:'provider',export:'core',as:'fc',variables:'x'}]);
  assert.ok(plain(C.validate(C.normalize(bad)).warnings).includes('sections[0].diagram.topologyImports[0].variables: must be an object of named strings — ignored'));
  const features=doc=>plain(C.FlowviewCompatibility.detect(doc));
  assert.ok(features(consumer([{spec:'provider',export:'core',as:'fc',variables:{code:'x'}}])).includes('flow.telemetry-scoped-variables'));
  assert.ok(features(spec('l',{nodes:{a:{telemetry:{kind:'service',variables:{code:'x'},signals:{s:{grafana:'up'}}}}},rows:[['a']]})).includes('flow.telemetry-scoped-variables'));
  assert.ok(!features(consumer([{spec:'provider',export:'core',as:'fc'}])).includes('flow.telemetry-scoped-variables'));
});

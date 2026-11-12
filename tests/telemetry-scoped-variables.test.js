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
| V9 | (#1359 review c1 minor 1) The scan skips provider comments (SQL -- and block comments, PromQL, LogQL and Logs Insights #): an apostrophe in a comment never makes a bare placeholder look in-string; a placeholder inside a comment fails closed. |
| V10 | (minor 2) A value in a SQL LIKE or ILIKE pattern string may hold no % or _. |
| V11 | (minor 3) label_replace string arguments and LogQL regexp and pattern strings take the regex rule. |
| V12 | (minor 4) TraceQL strings are "…" and `…` only: a ' does not open a string, so a placeholder after it takes the bare-token rule. |
| V13 | (#1359 review c2 minor 1, VARTEST-1359, c4) SQL the scan cannot read in step (a backslash before a quote, a # , a nested or unclosed block comment, dollar quoting) takes only a plain token (letters, digits, _ . @ -, no --) wherever the placeholder sits, and a number where it is a comparison operand; anything else is refused, naming the form; standard doubled quotes still read. |
| V14 | (minor 2) A string anywhere in a SQL LIKE, ILIKE or SIMILAR TO operand (joined by || or inside CONCAT) takes the LIKE rule; a string after ~, ~*, !~, !~*, REGEXP or RLIKE takes the regex rule. |
| V15 | (#1359 review c3) A % is refused at every SQL string placement (not only in a detected LIKE operand), so an operand the scan misreads cannot take one; _ stays refused in detected patterns only. Postgres ~~, ~~*, !~~ and !~~* are pattern operators. |
| V16 | (VARTEST-1359) SQL bare refuses --; LogQL label_replace string arguments take the regex rule (a matcher inside the selector braces does not, in PromQL or LogQL); LogQL |> and !> pattern line filters refuse < and >; line_format and label_format templates refuse { and }; SQL SIMILAR TO refuses its pattern characters; a bare value inside a PromQL or LogQL [range] may not hold :; a Logs Insights parse glob refuses *. |
| V17 | (#1359 review c4) A bare placeholder that is a comparison operand (after or before = <> != < > <= >= == =~ !~, inside IN ( … ), in BETWEEN … AND …) takes only a number or a duration, so a field name can never compare a field with itself; TraceQL status and kind comparisons also take their enum keywords; other bare positions keep the plain-token rule; unreadable SQL takes _ too. |
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
  const not=(why)=>'Variable ${code} from this import or carrier cannot be filled in safely here ('+why+'), so the signal is not shown. Use another value, or copy the provider\'s query and edit it.';
  const allowed='a telemetry variable may hold only letters, digits and _ . @ : - (and spaces inside a string)';
  assert.equal(run({loki:LOKI},'FULL_CHARGE').error,undefined);
  for(const v of ['x"} or vector(1) #','a\\"b','line\nbreak'])assert.equal(run({loki:LOKI},v).error,not(allowed),JSON.stringify(v));
  const regex={loki:'sum(count_over_time({app="dcf", code=~"${code}"}[5m]))'};
  for(const v of ['.*','A|B','A.+'])assert.equal(run(regex,v).error,not(allowed),v);
  for(const v of ['A.B','svc.name'])assert.equal(run(regex,v).error,not('it is filled into a regex and holds regex characters'),v);
  assert.equal(run(regex,'FULL_CHARGE').query,'sum(count_over_time({app="dcf", code=~"FULL_CHARGE"}[5m]))');
  const bare={grafana:'sum(rate(x_total{job="dcf"}[${window}]))'};
  const runBare=v=>{const p=provider(bare);const c=consumer([{spec:'provider',export:'core',as:'fc',variables:{window:v}}]);return sent(c,[p,c],'fc::dcf');};
  assert.equal(runBare('5m').query,'sum(rate(x_total{job="dcf"}[5m]))');
  assert.equal(runBare('5m] or vector(1) [5m').error,'Variable ${window} from this import or carrier cannot be filled in safely here ('+allowed+'), so the signal is not shown. Use another value, or copy the provider\'s query and edit it.');
  const logs={cloudwatchLogs:{logGroups:['g'],query:'filter code = "${code}" and @message like /${code}/ | stats count() as n',region:'us-east-1',valueField:'n'}};
  assert.equal(run(logs,'FULL').query.query,'filter code = "FULL" and @message like /FULL/ | stats count() as n');
  assert.equal(run(logs,'a/b').error,not(allowed));
  assert.equal(run(logs,'a.b').error,not('it is filled into a regex and holds regex characters'));
  const board=spec('consumer',{nodes:{a:{title:'A',telemetry:{kind:'service',signals:{sent:{loki:LOKI}}}}},rows:[['a']],panels:PANEL},{tracking:{telemetry:{variables:{code:'x"} or vector(1) #'}}}});
  assert.equal(sent(board,null,'a').query,LOKI.replace('${code}','x"} or vector(1) #'),'board-wide variables keep today\'s meaning');
});

test('V5 fragments, SQL placeholders and structured sources',()=>{
  const not=(why)=>'Variable ${code} from this import or carrier cannot be filled in safely here ('+why+'), so the signal is not shown. Use another value, or copy the provider\'s query and edit it.';
  const allowed='a telemetry variable may hold only letters, digits and _ . @ : - (and spaces inside a string)';
  const p=provider({loki:'sum(count_over_time({app="dcf"}[5m]))',needsNarrow:['code']});
  const run=(value,fragment='| code="${code}"')=>{const c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:value},nodeTracking:{dcf:{telemetry:{extends:true,signals:{sent:{narrow:{loki:fragment}}}}}}}]);return sent(c,[p,c],'fc::dcf');};
  assert.equal(run('FULL').query,'sum(count_over_time({app="dcf"} | code="FULL" [5m]))');
  assert.equal(run('FULL charge').query,'sum(count_over_time({app="dcf"} | code="FULL charge" [5m]))','a space inside a string');
  assert.equal(run('x" | drop code').error,not(allowed));
  // #1359: a fragment is read like the query: bare, a space is refused and a comparison takes a number.
  assert.equal(run('a b','| code=${code}').error,not(allowed));
  assert.equal(run('FULL','| code = ${code}').error,not('outside a string only a number or a duration may be filled in here; a name may be filled in only inside by (…) / without (…) or as a TraceQL status/kind value'));
  assert.equal(run('500','| code = ${code}').query,'sum(count_over_time({app="dcf"} | code = 500 [5m]))');
  const sql=provider({sql:"SELECT count(*) FROM events WHERE code = '${code}'"});
  let c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:'FULL'}}]);
  assert.equal(sent(c,[sql,c],'fc::dcf').query,"SELECT count(*) FROM events WHERE code = 'FULL'",'the SQL route');
  c=consumer([{spec:'provider',export:'core',as:'fc',variables:{code:"x' OR '1'='1"}}]);
  assert.equal(sent(c,[sql,c],'fc::dcf').error,not(allowed));
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

const scopedRun=(signal,vars)=>{const p=provider(signal);const c=consumer([{spec:'provider',export:'core',as:'fc',variables:vars}]);return sent(c,[p,c],'fc::dcf');};
const unsafe=(name,why)=>'Variable ${'+name+'} from this import or carrier cannot be filled in safely here ('+why+'), so the signal is not shown. Use another value, or copy the provider\'s query and edit it.';
// #1359 VARTEST-1359: one allowlist for every scoped value, in every language and position.
const ALLOWED='a telemetry variable may hold only letters, digits and _ . @ : - (and spaces inside a string)';
const REGEX='it is filled into a regex and holds regex characters';
const PATTERN='in a SQL query that uses patterns or regexes, a variable may not hold _ or .';
const NUMERIC='outside a string only a number or a duration may be filled in here; a name may be filled in only inside by (…) / without (…) or as a TraceQL status/kind value';
const unreadable=f=>'this SQL query uses '+f+', which Flowview cannot read safely';

test('V9 comments: an apostrophe in a comment never opens a string; a placeholder in a comment fails closed',()=>{
  const sql={sql:"SELECT count(*) FROM events -- don't count tests\nWHERE code = ${code}"};
  for(const v of ["x' OR '1'='1",'1 OR 1=1','*/ OR 1=1 --'])assert.equal(scopedRun(sql,{code:v}).error,unsafe('code',ALLOWED),v);
  assert.equal(scopedRun(sql,{code:'42'}).query,"SELECT count(*) FROM events -- don't count tests\nWHERE code = 42");
  const block={sql:"SELECT count(*) FROM events /* it's the main table */ WHERE code = ${code}"};
  assert.equal(scopedRun(block,{code:'1 OR 1=1'}).error,unsafe('code',ALLOWED));
  for(const q of ["SELECT count(*) FROM events -- ${code}\nWHERE 1=1","SELECT count(*) FROM events /* ${code} */"])assert.equal(scopedRun({sql:q},{code:'x'}).error,unsafe('code','it sits in a comment of the provider\'s query'),q);
  const prom={grafana:'sum(rate(x_total{job="dcf"}[5m])) # it\'s ${code}'};
  assert.equal(scopedRun(prom,{code:'x'}).error,unsafe('code','it sits in a comment of the provider\'s query'));
  const logs={cloudwatchLogs:{logGroups:['g'],query:"filter a = 1 # it's\n| filter code = ${code} | stats count() as n",region:'us-east-1',valueField:'n'}};
  assert.equal(scopedRun(logs,{code:'1 or 1=1'}).error,unsafe('code',ALLOWED));
  const loki={loki:'sum(count_over_time({app="dcf"} | code=${code} [5m])) # "'};
  assert.equal(scopedRun(loki,{code:'"} or vector(1) #'}).error,unsafe('code',ALLOWED));
});

test('V10 a SQL LIKE or ILIKE query takes no % and no _ in a value',()=>{
  for(const op of ['LIKE','ilike','NOT LIKE']){
    const q={sql:"SELECT count(*) FROM events WHERE code "+op+" '${code}'"};
    assert.equal(scopedRun(q,{code:'a%'}).error,unsafe('code',ALLOWED),op+' a%');
    assert.equal(scopedRun(q,{code:'a_b'}).error,unsafe('code',PATTERN),op+' a_b');
    assert.equal(scopedRun(q,{code:'FULL'}).error,undefined,op);
    assert.equal(scopedRun(q,{code:"x' OR '1'='1"}).error,unsafe('code',ALLOWED));
  }
  assert.equal(scopedRun({sql:"SELECT count(*) FROM events WHERE code = '${code}'"},{code:'a_b'}).error,undefined,'= takes _ literally');
});

test('V11 label_replace arguments and LogQL regexp and pattern strings take the regex rule',()=>{
  const lr='label_replace(up{job="dcf"}, "dst", "$1", "src", "${code}")';
  assert.equal(scopedRun({grafana:lr},{code:'a.b'}).error,unsafe('code',REGEX));
  assert.equal(scopedRun({grafana:lr},{code:'.*'}).error,unsafe('code',ALLOWED));
  assert.equal(scopedRun({grafana:lr},{code:'abc'}).error,undefined);
  for(const stage of ['regexp','pattern'])assert.equal(scopedRun({loki:'sum(count_over_time({app="dcf"} | '+stage+' "${code}" [5m]))'},{code:'a.b'}).error,unsafe('code',REGEX),stage);
  assert.equal(scopedRun({grafana:'up{job="dcf", code="${code}"}'},{code:'svc.name'}).error,undefined,'a plain matcher string takes . literally');
});

test('V12 TraceQL: \' is not a string quote',()=>{
  const q={tempo:"{ span.code = '${code}' }"};
  assert.equal(scopedRun(q,{code:'x" || span.any = "'}).error,unsafe('code',ALLOWED));
  assert.equal(scopedRun(q,{code:'line\nbreak'}).error,unsafe('code',ALLOWED));
  assert.equal(scopedRun({tempo:'{ span.code = "${code}" }'},{code:'FULL'}).error,undefined);
  assert.equal(scopedRun({tempo:'{ span.code = `${code}` }'},{code:'a`b'}).error,unsafe('code',ALLOWED));
  assert.equal(scopedRun({tempo:'{ span.code =~ "${code}" }'},{code:'a.b'}).error,unsafe('code',REGEX));
});

test('V13 SQL the scan cannot read safely refuses every scoped value, naming the form',()=>{
  const cases=[
    ["SELECT count(*) FROM t WHERE path = 'C:\\' AND code = ${code}",'a backslash before a quote'],
    ["SELECT count(*) FROM t # it's\nWHERE code = ${code}",'a # (MySQL comment, or a Postgres #> / # operator)'],
    ["SELECT count(*) FROM t /* a /* b */ it's */ WHERE code = ${code}",'a nested block comment'],
    ["SELECT count(*) FROM t WHERE note = $$it's$$ AND code = ${code}",'dollar quoting'],
    ["SELECT count(*) FROM t WHERE note = $tag$it's$tag$ AND code = '${code}'",'dollar quoting'],
    ["SELECT count(*) FROM t /* unclosed WHERE code = ${code}",'an unclosed block comment']];
  for(const [q,f] of cases)for(const v of ['1 OR 1=1','1--','a"b',"a'b",'a%','FULL-1','full_charge','42'])
    assert.equal(scopedRun({sql:q},{code:v}).error,unsafe('code',unreadable(f)),q+' / '+v);
  const doubled={sql:"SELECT count(*) FROM t WHERE name = 'it''s' AND code = '${code}'"};
  assert.equal(scopedRun(doubled,{code:'FULL'}).query,"SELECT count(*) FROM t WHERE name = 'it''s' AND code = 'FULL'",'standard doubled quotes still read');
  assert.equal(scopedRun(doubled,{code:"x' OR '1'='1"}).error,unsafe('code',ALLOWED));
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE name = 'it''s' AND code = ${code}"},{code:'1 OR 1=1'}).error,unsafe('code',ALLOWED),'after a doubled quote the scan is still in step');
});

test('V14 SQL LIKE operands and regex operators: the pattern gate covers the whole query',()=>{
  for(const q of ["SELECT count(*) FROM t WHERE code LIKE '%' || '${code}'","SELECT count(*) FROM t WHERE code ILIKE CONCAT('%', '${code}', '%')","SELECT count(*) FROM t WHERE code SIMILAR TO '(' || '${code}' || ')'"]){
    assert.equal(scopedRun({sql:q},{code:'a%'}).error,unsafe('code',ALLOWED),q+' / a%');
    assert.equal(scopedRun({sql:q},{code:'a_b'}).error,unsafe('code',PATTERN),q+' / a_b');
    assert.equal(scopedRun({sql:q},{code:'FULL'}).error,undefined,q);
  }
  for(const op of ['~','~*','!~','!~*','REGEXP','RLIKE','rlike']){
    const q={sql:"SELECT count(*) FROM t WHERE code "+op+" '${code}'"};
    for(const v of ['.*','A|B'])assert.equal(scopedRun(q,{code:v}).error,unsafe('code',ALLOWED),op+' '+v);
    assert.equal(scopedRun(q,{code:'a.b'}).error,unsafe('code',PATTERN),op+' a.b');
    assert.equal(scopedRun(q,{code:'FULL'}).error,undefined,op);
  }
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE code = '${code}' AND name LIKE 'x%'"},{code:'a_b'}).error,unsafe('code',PATTERN),'a string before the LIKE');
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE name LIKE 'x%' AND code = '${code}'"},{code:'a_b'}).error,unsafe('code',PATTERN),'and one after AND');
});

test('V15 a % is refused in every SQL string; Postgres ~~ operators are patterns',()=>{
  for(const q of ["SELECT count(*) FROM t WHERE code = '${code}'","SELECT count(*) FROM t WHERE code LIKE /* and */ '${code}'","SELECT count(*) FROM t WHERE code LIKE CONCAT(t.order, '${code}')",
    "SELECT count(*) FROM t WHERE code LIKE '%' || CAST(n AS text) || '${code}'","SELECT count(*) FROM t WHERE code LIKE CONCAT(\"a and b\", '${code}')"])
    assert.equal(scopedRun({sql:q},{code:'a%'}).error,unsafe('code',ALLOWED),q);
  for(const op of ['~~','~~*','!~~','!~~*']){
    const q={sql:"SELECT count(*) FROM t WHERE code "+op+" '${code}'"};
    for(const v of ['a_b','A.B'])assert.equal(scopedRun(q,{code:v}).error,unsafe('code',PATTERN),op+' '+v);
    assert.equal(scopedRun(q,{code:'FULL'}).error,undefined,op);
  }
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE code = '${code}'"},{code:'full_charge'}).error,undefined,'_ in a query with no pattern is fine');
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE code LIKE '${code}'"},{code:'full_charge'}).error,unsafe('code',PATTERN),'_ in a pattern query is refused: compare with = instead');
});

test('V16 VARTEST-1359 boundaries: comment openers, label_replace, pattern filters, templates, SIMILAR TO, ranges, parse globs',()=>{
  const q1={sql:"SELECT count(*) FROM events WHERE code = ${code} AND tenant = 'acme'"};
  for(const v of ['1--','-1'])assert.equal(scopedRun(q1,{code:v}).error,unsafe('code',ALLOWED),v+': a - only between allowed characters');
  assert.equal(scopedRun(q1,{code:'1'}).error,undefined);
  assert.equal(scopedRun({loki:'label_replace(sum by (src) (count_over_time({app="dcf"}[5m])), "dst", "$1", "src", "${code}")'},{code:'a.b'}).error,unsafe('code',REGEX),'LogQL label_replace');
  assert.equal(scopedRun({loki:'label_replace(count_over_time({app="dcf", code="${code}"}[5m]), "dst", "$1", "src", "(.*)")'},{code:'svc.name'}).error,undefined,'a LogQL matcher inside the selector is literal');
  assert.equal(scopedRun({grafana:'label_replace(up{job="dcf", code="${code}"}, "dst", "$1", "src", "(.*)")'},{code:'svc.name'}).error,undefined,'a PromQL matcher inside label_replace\'s selector is literal');
  for(const op of ['|>','!>']){
    const q={loki:'sum(count_over_time({app="dcf"} '+op+' "${code}" [5m]))'};
    assert.equal(scopedRun(q,{code:'<_>'}).error,unsafe('code',ALLOWED),op);
    assert.equal(scopedRun(q,{code:'full_charge'}).error,undefined,op+': _ alone is literal');
  }
  for(const q of ['sum(count_over_time({app="dcf"} | line_format "code=${code} {{.msg}}" [5m]))','sum(count_over_time({app="dcf"} | label_format dst="${code} {{.src}}" [5m]))'])
    assert.equal(scopedRun({loki:q},{code:'{{.secret}}'}).error,unsafe('code',ALLOWED),q);
  const similar={sql:"SELECT count(*) FROM events WHERE code SIMILAR TO '${code}'"};
  for(const v of ['a|b','a+','(a)','[ab]','a*'])assert.equal(scopedRun(similar,{code:v}).error,unsafe('code',ALLOWED),v);
  assert.equal(scopedRun(similar,{code:'svc.name'}).error,unsafe('code',PATTERN));
  for(const q of [{grafana:'sum(rate(x_total{job="dcf"}[${code}]))'},{loki:'sum(count_over_time({app="dcf"}[${code}]))'}]){
    assert.equal(scopedRun(q,{code:'5m:1m'}).error,unsafe('code','inside a range it may not hold :, which turns the range into a subquery'));
    assert.equal(scopedRun(q,{code:'5m'}).error,undefined);
  }
  const glob={cloudwatchLogs:{logGroups:['g'],query:'parse @message "code=${code} took *ms" as t | stats count() as n',region:'us-east-1',valueField:'n'}};
  assert.equal(scopedRun(glob,{code:'a*'}).error,unsafe('code',ALLOWED));
  assert.equal(scopedRun(glob,{code:'FULL'}).error,undefined);
  assert.equal(scopedRun({sql:"SELECT count(*) FROM events WHERE code LIKE N'${code}'"},{code:'a_b'}).error,unsafe('code',PATTERN),'an N-prefixed string in a LIKE query');
});

test('V17 a bare comparison operand is a number or a duration, never a field name (a bare value is numeric by default)',()=>{
  const cases=[
    [{sql:"SELECT count(*) FROM events WHERE status = ${code}"},['status','OR','NULL','TRUE','a'],['200','1.5e3','0.25']],
    [{sql:"SELECT count(*) FROM events WHERE ${code} = status"},['status'],['1']],
    [{sql:"SELECT count(*) FROM events WHERE status IN (200, ${code})"},['status'],['404']],
    [{sql:"SELECT count(*) FROM events WHERE n BETWEEN ${code} AND 10"},['n'],['1']],
    [{sql:"SELECT count(*) FROM events WHERE n BETWEEN 1 AND ${code}"},['n'],['10']],
    [{sql:"SELECT count(*) FROM events WHERE n <> ${code}"},['n'],['3']],
    [{cloudwatchLogs:{logGroups:['g'],query:'filter status = ${code} | stats count() as n',region:'us-east-1',valueField:'n'}},['status','or'],['200']],
    [{tempo:'{ span.http.status_code = ${code} }'},['span.http.status_code'],['200']],
    [{tempo:'{ span.duration > ${code} }'},['span.duration'],['250ms','1h30m']],
    [{loki:'sum(count_over_time({app="dcf"} | json | status >= ${code} [5m]))'},['status'],['500']],
    [{grafana:'sum(rate(x_total{job="dcf"}[5m])) > ${code}'},['x_total'],['100']]];
  for(const [signal,bad,good] of cases){
    for(const v of bad)assert.equal(scopedRun(signal,{code:v}).error,unsafe('code',NUMERIC),JSON.stringify(signal)+' / '+v);
    for(const v of good)assert.equal(scopedRun(signal,{code:v}).error,undefined,JSON.stringify(signal)+' / '+v);
  }
  for(const [q,v] of [['{ status = ${code} }','error'],['{ status != ${code} }','ok'],['{ kind = ${code} }','server'],['{ span:kind = ${code} }','consumer']])
    assert.equal(scopedRun({tempo:q},{code:v}).error,undefined,'TraceQL '+q+' takes '+v);
  assert.equal(scopedRun({tempo:'{ status = ${code} }'},{code:'span.name'}).error,unsafe('code',NUMERIC));
  assert.equal(scopedRun({sql:"SELECT count(*) FROM ${code} WHERE a = 1"},{code:'events'}).error,unsafe('code','a table name cannot come from a telemetry variable'),'a table name may widen the query');
  assert.equal(scopedRun({grafana:'topk(${code}, sum by (job) (rate(x_total[5m])))'},{code:'5'}).error,undefined);
});

test('V18 VARTEST-1359 round 2: a - only between allowed characters, more unreadable SQL, SQL regex functions, patterns apart from their operator',()=>{
  // N1: a value that starts or ends with - cannot form -- with the provider's own text.
  for(const [q,v] of [["SELECT count(*) FROM t WHERE delta = ${code}-1 AND tenant = 'acme'",'1-'],["SELECT count(*) FROM t WHERE delta > -${code} AND tenant = 'acme'",'-1'],["SELECT count(*) FROM t WHERE code = '${code}'",'-x'],["SELECT count(*) FROM t WHERE code = '${code}'",'x-'],["SELECT count(*) FROM t WHERE code = '${code}'",'a--b']])
    assert.equal(scopedRun({sql:q},{code:v}).error,unsafe('code',ALLOWED),q+' / '+v);
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE delta = ${code}${code2} AND tenant = 'acme'"},{code:'1-',code2:'1'}).error,unsafe('code',ALLOWED),'two placeholders side by side');
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE code = '${code}'"},{code:'full-charge'}).error,undefined,'a - between letters');
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE delta > -${code} AND tenant = 'acme'"},{code:'1'}).error,undefined);
  // N2, N8: more dialect forms the scan cannot read.
  const forms=[
    ["SELECT [it's] FROM events WHERE code = ${code}",'a [bracket] identifier'],
    ["SELECT count(*) FROM events WHERE note <> q'[it's]' AND code = ${code}","q'…' quoting"],
    ["SELECT count(*) FROM events WHERE note <> '''it's''' AND code = ${code}",'triple quotes'],
    ["SELECT count(*) FROM events WHERE n = 2--1 AND note = 'x\n' AND code = ${code}",'a -- with no space after it'],
    ["SELECT count(*) FROM events WHERE code LIKE U&'${code}' UESCAPE '!'",'UESCAPE']];
  for(const [q,f] of forms)for(const v of ['1 OR TRUE','x0025','1'])assert.equal(scopedRun({sql:q},{code:v}).error,unsafe('code',unreadable(f)),q+' / '+v);
  for(const v of ['1 OR TRUE','1'])assert.equal(scopedRun({sql:"SELECT count(*) FROM events WHERE note = 'it AND code = ${code}"},{code:v}).error,unsafe('code','this query has an unclosed string, which Flowview cannot read safely'),v);
  assert.equal(scopedRun({sql:"SELECT count(*) FROM events WHERE kind = 'q' AND code = '${code}'"},{code:'FULL'}).error,undefined,"a string 'q' is not q-quoting");
  // N3, N4, N6: pattern and template syntax never fits the allowlist.
  assert.equal(scopedRun({loki:'sum by (c) (count_over_time({app="dcf"} | pattern "<_> code=${code} <c>" [5m]))'},{code:'<x>'}).error,unsafe('code',ALLOWED));
  assert.equal(scopedRun({loki:'sum(count_over_time({app="dcf"} | label_format a="{{.x | lower}}", b="${code}" [5m]))'},{code:'{{.secret}}'}).error,unsafe('code',ALLOWED));
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE code LIKE '${code}'"},{code:'[a-z]bc'}).error,unsafe('code',ALLOWED));
  // N5: SQL regex functions; N7: a pattern written apart from its operator.
  for(const q of ["SELECT count(*) FROM t WHERE REGEXP_LIKE(code, '${code}')","SELECT count(*) FROM t WHERE regexp_match(code, '${code}') IS NOT NULL","SELECT count(*) FROM t WHERE REGEXP_CONTAINS(code, '${code}')","SELECT count(*) FROM t WHERE substring(code from '${code}') IS NOT NULL",
    "WITH p AS (SELECT '${code}' AS re) SELECT count(*) FROM t, p WHERE code ~ p.re","WITH p AS (SELECT '${code}' AS pat) SELECT count(*) FROM t, p WHERE code LIKE p.pat","SELECT count(*) FROM t WHERE code LIKE CASE WHEN tenant = 'a' THEN '${code}' ELSE 'x' END"]){
    assert.equal(scopedRun({sql:q},{code:'.*'}).error,unsafe('code',ALLOWED),q+' / .*');
    for(const v of ['a.b','a_b'])assert.equal(scopedRun({sql:q},{code:v}).error,unsafe('code',PATTERN),q+' / '+v);
    assert.equal(scopedRun({sql:q},{code:'FULL'}).error,undefined,q);
  }
  // A regex position in every language refuses .
  for(const signal of [{loki:'sum(count_over_time({app="dcf"} |~ "${code}" [5m]))'},{grafana:'up{job=~"${code}"}'},{tempo:'{ span.code !~ "${code}" }'}])
    assert.equal(scopedRun(signal,{code:'a.b'}).error,unsafe('code',REGEX),JSON.stringify(signal));
});

test('V19 a bare value is a number or a duration except in a named list of token positions',()=>{
  const bare=[
    ['sql',"SELECT count(*) FROM t WHERE status IN (lower(${code}))"],['sql',"SELECT count(*) FROM t WHERE code LIKE ${code}"],
    ['sql',"SELECT count(*) FROM t WHERE code ~ ${code}"],['sql',"SELECT count(*) FROM t WHERE code REGEXP ${code}"],
    ['sql',"SELECT count(*) FROM t WHERE status = CASE WHEN x = 1 THEN ${code} ELSE 0 END"],['sql',"SELECT count(*) FROM t WHERE ${code}"],
    ['sql',"SELECT count(*) FROM t WHERE x = 1 AND ${code}"],['sql',"SELECT count(*) FROM t GROUP BY ${code}"],
    ['sql',"SELECT code FROM t LIMIT ${code}"],['sql',"SELECT code FROM t LIMIT 5 OFFSET ${code}"],['sql',"SELECT count(*) FROM t WHERE flag IS ${code}"],
    ['grafana','sum(x_total) > on() ${code}'],['grafana','sum(x_total) * ${code}'],['grafana','${code}{job="dcf"}'],
    ['cloudwatchLogs',{logGroups:['g'],query:'filter isPresent(${code}) | stats count() as n',region:'us-east-1',valueField:'n'}],
    ['cloudwatchLogs',{logGroups:['g'],query:'filter status in [${code}] | stats count() as n',region:'us-east-1',valueField:'n'}],
    ['grafana','sum(x_total) > bool ${code}'],
    ['tempo','{ span.x = ${code} && span.y = 1 }']];
  for(const [src,q] of bare){
    for(const v of ['status','total','OR'])assert.equal(scopedRun({[src]:q},{code:v}).error,unsafe('code',NUMERIC),src+' '+JSON.stringify(q)+' / '+v);
    assert.equal(scopedRun({[src]:q},{code:'5'}).error,undefined,src+' '+JSON.stringify(q)+' takes a number');
  }
  for(const v of ['NULL','true','False'])assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE flag IS ${code}"},{code:v}).error,undefined,'IS takes '+v);
  assert.equal(scopedRun({sql:"SELECT count(*) FROM t WHERE flag IS NOT ${code}"},{code:'NULL'}).error,undefined,'IS NOT takes NULL');
  const tokens=[
    ['grafana','sum by (${code}) (rate(x_total[5m]))'],['grafana','sum without (job, ${code}) (rate(x_total[5m]))'],['grafana','sum BY (${code}) (rate(x_total[5m]))'],
    ['grafana','sum(rate(x_total[5m])) Without (${code})'],['loki','sum by (${code}) (count_over_time({app="dcf"}[5m]))']];
  for(const [src,q] of tokens)assert.equal(scopedRun({[src]:q},{code:'service_name'}).error,undefined,src+' '+q+' takes a token');
  // #1359 c6: a label name is [A-Za-z_][A-Za-z0-9_]* only.
  for(const v of ['svc.name','a-b','@x','a:b','1abc'])assert.equal(scopedRun({grafana:'sum by (${code}) (rate(x_total[5m]))'},{code:v}).error,unsafe('code','a label name may hold only letters, digits and _, and may not start with a digit'),v);
  assert.equal(scopedRun({grafana:'sum by (${code}) (rate(x_total[5m]))'},{code:'5'}).error,undefined,'a number still passes');
  // #1359 c6: a table name and a vector-matching label can widen by design, so neither takes a name.
  for(const q of ['x_total and on(${code}) y_total','x_total / ON(${code}) group_left(job) y_total','x_total / ignoring(${code}) y_total','x_total / on(job) group_left(${code}) y_total','x_total / on(job) group_right(${code}) y_total'])
    assert.equal(scopedRun({grafana:q},{code:'service_name'}).error,unsafe('code','a vector-matching label cannot come from a telemetry variable'),q);
  for(const q of ["SELECT count(*) FROM ${code} WHERE a = 1","SELECT count(*) FROM t JOIN ${code} ON t.id = u.id","SELECT count(*) FROM t WHERE id IN (SELECT id FROM ${code})"])
    assert.equal(scopedRun({sql:q},{code:'other'}).error,unsafe('code','a table name cannot come from a telemetry variable'),q);
  for(const [q,v] of [['{ status = ${code} }','status'],['{ kind = ${code} }','kind'],['{ status = ${code} }','span.status'],['{ status = ${code} && kind = server }','server'],['{ kind = ${code} }','error']])
    assert.equal(scopedRun({tempo:q},{code:v}).error,unsafe('code',NUMERIC),'TraceQL '+q+' refuses '+v);
  for(const q of ["SELECT count(*) FROM events WHERE code IS NOT DISTINCT FROM ${code}","SELECT count(*) FROM t WHERE y = EXTRACT(year FROM ${code})","SELECT count(*) FROM t WHERE x = ')' AND y = substring(a FROM ${code})"])
    assert.equal(scopedRun({sql:q},{code:'code'}).error,unsafe('code',NUMERIC),q+': not a table name');
  // A slot keyword inside a string or a comment never makes a slot.
  for(const [src,q] of [['grafana','sum(x_total) > # by (\n${code})'],['grafana','label_replace(x_total, "a", "by (", "b", "c") > ${code}'],
    ['sql',"SELECT count(*) FROM t WHERE note = 'from' AND x = /* JOIN */ ${code}"],['sql',"SELECT count(*) FROM t WHERE x = -- from\n${code}"],['sql',"SELECT count(*) FROM t WHERE x = 'SELECT a FROM' || ${code}"]])
    assert.equal(scopedRun({[src]:q},{code:'total'}).error,unsafe('code',NUMERIC),src+' '+JSON.stringify(q));
  for(const q of ["SELECT count(*) FROM t WHERE PATINDEX('%' + '${code}' + '%', code) > 0","SELECT count(*) FROM t WHERE patindex('${code}', code) > 0"])
    assert.equal(scopedRun({sql:q},{code:'a_b'}).error,unsafe('code',PATTERN),q);
});

test('V20 #1360: a refused narrowing or scoped variable names the other way out; an unmet needsNarrow does not',()=>{
  assert.equal(scopedRun({loki:LOKI},{code:'a b"'}).error,'Variable ${code} from this import or carrier cannot be filled in safely here (a telemetry variable may hold only letters, digits and _ . @ : - (and spaces inside a string)), so the signal is not shown. Use another value, or copy the provider\'s query and edit it.');
  const p=provider({loki:'sum(count_over_time({app="dcf"}[5m]))',needsNarrow:['code']});
  const run=fragment=>{const c=consumer([{spec:'provider',export:'core',as:'fc',nodeTracking:{dcf:{telemetry:{extends:true,signals:{sent:{narrow:{loki:fragment}}}}}}}]);return sent(c,[p,c],'fc::dcf');};
  assert.equal(run('| code="A" | drop code').error,'A LogQL narrowing of this signal is not valid (one stage per entry: this one has a second "|"), so it is not shown. Change the narrowing, or copy the provider\'s query and edit it.');
  assert.equal(run('| other="A"').error,'The provider asks each board to narrow this signal by code, and nothing narrows it here, so it is not shown.','copying cannot meet needsNarrow, so no hint');
});

'use strict';
/* #945 contract: the authoring route is conditional, schema-backed and portable.
| row | assertion | rejects |
| --- | --- | --- |
| G1 | live-status-board loads metrics.md only for metrics/traffic/Grafana/Honeycomb/Loki/proof; telemetry-only work invents no Jira | growing every board prompt or requiring tickets |
| G2 | local/direct/nested/overlay/loader-selected carriers and every node origin use explicit bindings, never name-derived queries | local-only guidance or inferred queries |
| G3 | every authored field in the chapter table is exercised through valid root/template/raw/use variants; all sources, kinds and card sides survive; renaming documented `window` to `windwo` warns | prose presence masquerading as schema coverage |
| G4 | relative links resolve; hld-to-page stays below 6000 UTF-16 units while preserving new/ambiguous versus fully specified edit scope | a broken route, oversized entry router or skipped question phases |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const root=path.join(__dirname,'..'),skillPath='.claude/skills/live-status-board/SKILL.md',chapterPath='.claude/skills/live-status-board/metrics.md';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const C={URL,TextEncoder};vm.createContext(C);vm.runInContext(loader.composeSources(['canon.js','validator.js']),C);
const plain=value=>JSON.parse(JSON.stringify(value));

function chapterExample(text){
  const blocks=[...text.matchAll(/```json\n([\s\S]*?)```/g)].map(match=>JSON.parse(match[1]));
  const full=blocks.find(value=>value && value.page && value.page.tracking && value.page.tracking.telemetry);
  assert.ok(full,'chapter has one complete telemetry page example');
  return full;
}
function specProblems(spec){
  const problems=[],invalid=(at,message)=>problems.push(at+': '+message);
  const templates=C.trackingTelemetry(spec.page,invalid).templates;
  for(const section of spec.page.sections||[]){
    const diagram=section.diagram||{};
    for(const node of Object.values(diagram.nodes||{}))if(Object.hasOwn(node,'telemetry'))C.carrierTelemetry(node,templates,invalid);
    for(const edge of diagram.edges||[])if(Object.hasOwn(edge,'telemetry'))C.carrierTelemetry(edge,templates,invalid);
  }
  return problems;
}
function documentedFields(text){
  const start=text.indexOf('| object | fields |'),end=text.indexOf('\n\nThis complete example',start);
  assert.ok(start>0 && end>start,'authored field table is present');
  const fields=new Set();
  for(const row of text.slice(start,end).split('\n')){
    const cells=row.split('|');if(cells.length<4 || /^(?:fields|---)$/.test(cells[2].trim()))continue;
    for(const match of cells[2].matchAll(/`([A-Za-z][A-Za-z0-9]*)`/g))fields.add(match[1]);
  }
  return fields;
}
function localLinks(file){
  const text=read(file),base=path.dirname(path.join(root,file));
  return [...text.matchAll(/\]\(([^)]+)\)/g)].map(match=>match[1].split('#',1)[0]).filter(link=>link && !link.includes('://')).map(link=>path.resolve(base,link));
}

test('G1 G2 conditional metrics route covers every carrier without Jira fiction or inferred bindings',()=>{
  const skill=read(skillPath),chapter=read(chapterPath),hld=read('.claude/skills/hld-to-page/SKILL.md');
  const route=skill.slice(skill.indexOf('## Metrics requests'),skill.indexOf('## 0. The interaction'));
  assert.match(route,/\[Metrics authoring\]\(metrics\.md\)/);
  for(const signal of ['metrics','traffic','Grafana','Honeycomb','Loki','proof'])assert.ok(route.includes(signal),signal);
  assert.match(route.replace(/\s+/g,' '),/metrics-only request does not require Jira/);
  assert.match(hld,/live-status-board.*Metrics chapter is conditional/s);
  const flat=chapter.replace(/\s+/g,' ');
  for(const origin of ['local','direct-imported','nested-imported','consumer-overlay','loader-selected detail'])assert.ok(flat.includes(origin),origin);
  assert.match(flat,/never derive a query/i);
  for(const fact of ['Preview metrics layout','synthetic','no connector or network call','exact prior-24-hour window','never a signed result/download URL'])assert.ok(flat.includes(fact),fact);
  assert.doesNotMatch(flat,/current repository task|this task is not permission/i);
});

test('G3 every documented telemetry field is accepted by root, template, raw and use parsers',()=>{
  const chapter=read(chapterPath),example=chapterExample(chapter);
  assert.deepEqual(specProblems(example),[],'the complete documented page parses cleanly');

  const template={kind:'call',params:['route'],signals:{
    rate:{grafana:'sum(rate(http_requests_total{route="$route"}[5m]))',unit:'req/h',scope:'route $route · ${service} · account ${iotAccount}'},
    errors:{loki:'sum(count_over_time({route="$route"} |= "error" [5m]))',unit:'req/h'}},
    proof:{rate:{min:1,max:1000},errors:{max:0.1,maxRatioOf:'rate'}},
    links:{dashboard:'https://grafana.example/d/api',query:'https://grafana.example/explore?route=$route'}};
  const authoredRoot={enabled:false,environment:'qa',variables:{service:'api',iotAccount:'111111111111'},environments:{qa:{grafana:{prometheus:'prom-qa'},variables:{iotAccount:'222222222222'}},prd:{}},grafana:{baseUrl:'https://grafana.example',prometheus:'prom-main',loki:'loki-main',tempo:'tempo-main',sql:'sql-main',cloudwatch:'cw-main',accountId:'123456789012'},
    honeycomb:{environment:'prod',dataset:'api-prod'},window:'7d',refreshMs:300000,templates:{'http-call':template}};
  const rootWarnings=[],parsed=C.trackingTelemetry({tracking:{telemetry:authoredRoot}},(at,message)=>rootWarnings.push(at+': '+message));
  assert.deepEqual(rootWarnings,[]);
  assert.equal(parsed.environment,'qa');assert.equal(parsed.environments.qa.grafana.prometheus,'prom-qa');assert.deepEqual(plain(parsed.environments.prd),{grafana:{},honeycomb:{}});
  assert.equal(parsed.enabled,false);assert.deepEqual(plain(parsed.grafana),authoredRoot.grafana);
  assert.deepEqual(plain(parsed.variables),authoredRoot.variables);
  assert.deepEqual(plain(parsed.environments.qa.variables),authoredRoot.environments.qa.variables);
  const page={tracking:{telemetry:authoredRoot}},qa=C.telemetryEnvironmentConfig(page,'qa'),prd=C.telemetryEnvironmentConfig(page,'prd');
  assert.deepEqual(plain(qa.variables),{service:'api',iotAccount:'222222222222'},'profile overrides one shared variable and inherits the other');
  assert.deepEqual(plain(prd.variables),authoredRoot.variables,'profiles without overrides inherit shared variables');
  assert.deepEqual(plain(parsed.honeycomb),authoredRoot.honeycomb);assert.equal(parsed.window,'7d');assert.equal(parsed.refreshMs,300000);
  const parsedTemplate=parsed.templates['http-call'];
  assert.equal(parsedTemplate.kind,'call');assert.deepEqual(plain(parsedTemplate.params),['route']);
  assert.equal(parsedTemplate.signals.rate.unit,'req/h');assert.equal(parsedTemplate.proof.errors.maxRatioOf,'rate');
  assert.equal(parsedTemplate.signals.rate.scope,template.signals.rate.scope);
  assert.equal(parsedTemplate.links.dashboard,template.links.dashboard);assert.equal(parsedTemplate.links.query,template.links.query);

  const variants=[
    ['grafana','sum(rate(requests_total[5m]))'],
    ['loki','sum(count_over_time({app="api"}[5m]))'],
    ['tempo','{ resource.service.name = "api" }'],
    ['sql','SELECT count(*) FROM requests'],
    ['honeycomb',{calculations:[{op:'COUNT'}]}],
    ['cloudwatch',{namespace:'AWS/IoT',metric:'TopicMatch',region:'us-east-1',accountId:'$account',dimensions:{RuleName:'camera_message_camera_stats'},statistic:'Sum',missingMeansZero:true,period:300}],
    ['cloudwatchLogs',{logGroups:['arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2'],query:'filter topicName = "$aws/rules/camera_message_power_state" | stats count() as n',region:'us-east-1',valueField:'n',trend:{query:'stats count() as n by bin(5m) as t',timeField:'t',valueField:'n',binSeconds:300},breakdown:{query:'stats count() as n, latest(reason) as sampleReason by clientId',labelField:'clientId',valueField:'n',title:'Devices',labelTitle:'Client ID',valueTitle:'Failures',columns:[{field:'sampleReason',label:'Latest reason'}],limit:20}}],
  ],kinds=['call','queue','service','log-event','device','service','log-event'],sides=['right','left','above','below','right','left','above'];
  variants.forEach(([source,query],index)=>{
    const rate={[source]:query,unit:'req/h',scope:'authored counting scope',label:'Observed requests',showOnCard:index%2===0,links:{query:'https://metrics.example/query?source='+source}},warnings=[];
    const raw={kind:kinds[index],signals:{rate,errors:{grafana:'sum(rate(errors_total[5m]))',unit:'req/h'}},
      proof:{rate:{min:0,max:1000},errors:{max:0.01,maxRatioOf:'rate'}},
      links:{dashboard:'https://grafana.example/d/api',query:'https://grafana.example/explore'},
      card:{side:sides[index],offset:index-2,title:'Card '+index,width:200+index}};
    const binding=C.carrierTelemetry({telemetry:raw},{},(at,message)=>warnings.push(at+': '+message));
    assert.deepEqual(warnings,[],source);assert.equal(binding.kind,kinds[index]);
    assert.equal(binding.signals.rate.source,source);assert.deepEqual(plain(binding.signals.rate.query),query);assert.equal(binding.signals.rate.unit,'req/h');
    assert.equal(binding.signals.rate.scope,rate.scope);assert.equal(binding.signals.rate.label,rate.label);assert.equal(binding.signals.rate.showOnCard,rate.showOnCard);assert.deepEqual(plain(binding.signals.rate.links),rate.links);
    if(source==='cloudwatchLogs'){
      const effective=C.carrierTelemetry({telemetry:raw},{},undefined,qa);
      assert.deepEqual(plain(effective.signals.rate.query),{...query,logGroups:['arn:aws:logs:us-east-1:222222222222:log-group:AWSIotLogsV2']});
      assert.equal(query.logGroups[0],'arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2','resolving a structured query preserves authored input');
    }
    assert.deepEqual(plain(binding.proof),raw.proof);assert.deepEqual(plain(binding.links),raw.links);assert.deepEqual(plain(binding.card),raw.card);
  });

  const useWarnings=[],used=C.carrierTelemetry({telemetry:{use:'http-call',route:'v1-items',
    links:{query:'https://grafana.example/explore?route=v1-items'},card:{side:'below',offset:7,title:'Route v1-items',width:320}}},parsed.templates,
    (at,message)=>useWarnings.push(at+': '+message));
  assert.deepEqual(useWarnings,[]);assert.equal(used.kind,'call');assert.match(used.signals.rate.query,/v1-items/);
  assert.equal(used.proof.errors.maxRatioOf,'rate');assert.equal(used.links.query,'https://grafana.example/explore?route=v1-items');
  assert.deepEqual(plain(used.card),{side:'below',offset:7,title:'Route v1-items',width:320});
  assert.equal(used.signals.rate.scope,'route v1-items · ${service} · account ${iotAccount}');
  const resolvedUse=C.carrierTelemetry({telemetry:{use:'http-call',route:'v1-items'}},parsed.templates,undefined,qa);
  assert.equal(resolvedUse.signals.rate.scope,'route v1-items · api · account 222222222222');
  assert.deepEqual(authoredRoot.variables,{service:'api',iotAccount:'111111111111'},'profile resolution preserves authored defaults');

  const exercised=new Set(['period','trend','timeField','binSeconds','showOnCard','missingMeansZero','namespace','metric','dimensions','statistic','cloudwatch','cloudwatchLogs','logGroups','region','valueField','breakdown','labelField','title','labelTitle','valueTitle','columns','limit','field','label','scope','variables','accountId','baseUrl','environments','enabled','grafana','honeycomb','window','refreshMs','templates','prometheus','loki','tempo','sql','environment','dataset',
    'kind','signals','proof','links','card','use','unit','min','max','maxRatioOf','dashboard','query','side','offset','width','params']);
  assert.deepEqual([...documentedFields(chapter)].sort(),[...exercised].sort(),'every field named in the chapter table has a parser-backed fixture');

  const negative=chapterExample(chapter),config=negative.page.tracking.telemetry;
  config.windwo=config.window;delete config.window;
  assert.match(specProblems(negative).join('\n'),/\.windwo: unknown field/,'renaming a documented field makes the contract assertion fail');
});

test('G4 conditional chapter links resolve and bounded hld entry stays below its UTF-16 cap',()=>{
  for(const file of [skillPath,chapterPath])for(const target of localLinks(file))assert.ok(fs.existsSync(target),file+' -> '+target);
  const hld=read('.claude/skills/hld-to-page/SKILL.md');
  assert.ok(Buffer.from(hld,'utf16le').length/2<6000,'hld-to-page stays below 6000 UTF-16 units');
  const compact=hld.replace(/\s+/g,' ');
  assert.match(compact,/New\/changed stories use `--mode new`.*source, question and worksheet phases before JSON/);
  assert.match(compact,/Fully specified scoped edits need no new questions or worksheet/);
});

test('feature evidence discovery begins with Jira and PR changes and rejects unrelated traffic',()=>{
  const text=read(chapterPath),inventory=text.indexOf('read the scoped Jira tickets'),discovery=text.indexOf('`search_dashboards`');
  assert.ok(inventory>=0 && inventory<discovery);
  for(const phrase of ['linked PRs and','new queues, topics, pipes','exact new resource','ticket/PR evidence','deployment environment','Missing instrumentation','never fill it with unrelated traffic','Never\nfabricate Jira tickets or PRs'])assert.ok(text.includes(phrase),phrase);
});

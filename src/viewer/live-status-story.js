/* One demo story day as the live-status controller's maps (#944). Shared by the standalone demo player
   (live-status-demo.js) and the Workbench's agent snapshot preview (#1265). No network, DOM or spec writes. */
function liveStatusDemoMap(day,keys,epics){
  var map=Object.create(null),issues=day && day.issues || {};
  // Timeline-level epics {KEY: {summary}} seed the epic box; state is derived from that day's children.
  Object.keys(epics || {}).forEach(function(epic){
    var children=Object.keys(issues).filter(function(key){return issues[key] && issues[key].epic===epic;}).map(function(key){return issues[key].state;});
    var state=children.length && children.every(function(s){return s==='done';})?'done':children.some(function(s){return s==='active' || s==='blocked';})?'active':children.some(function(s){return s==='testing';})?'testing':children.some(function(s){return s==='done';})?'active':'todo';
    var entry={state:state};if(epics[epic] && typeof epics[epic].summary==='string')entry.title=epics[epic].summary;map[epic]=entry;
  });
  (keys || []).concat(Object.keys(issues)).filter(function(key,index,all){return all.indexOf(key)===index;}).forEach(function(key){
    var issue=issues[key];if(!issue){map[key]={state:'missing'};return;}
    var entry={state:issue.state};
    [['summary','title'],['assignee','assignee'],['assigneeId','assigneeId'],['updated','updatedAt'],['epic','epic'],['parent','parent'],['kind','kind'],['lane','lane']].forEach(function(pair){if(typeof issue[pair[0]]==='string')entry[pair[1]]=issue[pair[0]];});
    if(Array.isArray(issue.initiatives))entry.initiatives=issue.initiatives.slice();
    if(issue.statusName || issue.flagged)entry.detail=(issue.statusName || '')+(issue.flagged?' · flagged':'');
    if(issue.prs && issue.prs.count>0){entry.prs={count:issue.prs.count,state:String(issue.prs.state).toLowerCase()};if(Array.isArray(issue.prs.links))entry.prs.links=JSON.parse(JSON.stringify(issue.prs.links));}
    // Timeline `links` stand in for Jira issue links: {type: "is blocked by", key: "HW-124"}.
    if(Array.isArray(issue.links)){var deps=[];issue.links.forEach(function(link){if(link && typeof link.key==='string' && trackingKeyPattern.test(link.key) && typeof link.type==='string' && link.type)deps.push({key:link.key,source:'jira',linkType:link.type});});if(deps.length)entry.dependsOn=deps;}
    map[key]=entry;
  });return map;
}
/* One story day's telemetry block (#944) as the proof engine's telemetry map (#938):
   {carrierId: {signals: {name: {value, series: [[t, v], ...], unit}}, observedAt}}.
   The block holds values per carrier signal from `start` every `stepSeconds`; each
   point is stamped at the end of its step and the value is the last step. A null step
   is missing evidence, never an implicit zero. An absent final sample leaves
   that signal unobserved for this day. */
function liveStatusDemoTelemetry(day){
  var map=Object.create(null),block=day && day.telemetry;
  if(!block || typeof block!=='object' || !block.carriers || typeof block.carriers!=='object')return map;
  var start=typeof block.start==='string'?Date.parse(block.start):NaN,step=Number(block.stepSeconds)*1000,end=start;
  if(!isFinite(start) || !(step>0) || !isFinite(step))return map;
  Object.keys(block.carriers).forEach(function(id){
    var signals=block.carriers[id],out=Object.create(null),any=false;
    if(!signals || typeof signals!=='object')return;
    Object.keys(signals).forEach(function(name){
      var signal=signals[name],values=signal && Array.isArray(signal.values)?signal.values:null;
      if(!values || !values.length || typeof values[values.length-1]!=='number' || !isFinite(values[values.length-1]))return;
      var series=values.map(function(v,k){return typeof v==='number' && isFinite(v)?[start+(k+1)*step,v]:null;}).filter(Boolean);
      // A signal's `value` (an agent snapshot, #1270) is the window's measurement, such as a CloudWatch Sum; else the last step.
      out[name]={value:typeof signal.value==='number' && isFinite(signal.value)?signal.value:series[series.length-1][1],series:series,unit:typeof signal.unit==='string'?signal.unit:null};
      end=Math.max(end,start+values.length*step);any=true;
    });
    if(any)map[id]={signals:out};
  });
  // A time past the Date range (a huge step or start, #1265) is no usable evidence.
  if(!(Math.abs(end)<=8.64e15))return Object.create(null);
  var observedAt=new Date(end).toISOString();
  Object.keys(map).forEach(function(id){map[id].observedAt=observedAt;});
  return map;
}

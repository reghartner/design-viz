/* Standalone-only, local story transport. No network or authored-spec writes. */
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
  if(!isFinite(start) || !(step>0))return map;
  Object.keys(block.carriers).forEach(function(id){
    var signals=block.carriers[id],out=Object.create(null),any=false;
    if(!signals || typeof signals!=='object')return;
    Object.keys(signals).forEach(function(name){
      var signal=signals[name],values=signal && Array.isArray(signal.values)?signal.values:null;
      if(!values || !values.length || typeof values[values.length-1]!=='number' || !isFinite(values[values.length-1]))return;
      var series=values.map(function(v,k){return typeof v==='number' && isFinite(v)?[start+(k+1)*step,v]:null;}).filter(Boolean);
      out[name]={value:series[series.length-1][1],series:series,unit:typeof signal.unit==='string'?signal.unit:null};
      end=Math.max(end,start+values.length*step);any=true;
    });
    if(any)map[id]={signals:out};
  });
  var observedAt=new Date(end).toISOString();
  Object.keys(map).forEach(function(id){map[id].observedAt=observedAt;});
  return map;
}
function liveStatusDemoLabel(day,index){var label=String(day.label || '');return /^Day \d+\s*[—-]/.test(label)?label:'Day '+(index+1)+' — '+label;}
/* Over time (#929): each timeline day as status only. A ticket first named on a later day is
   left out of the day, and the overlay shows it as Missing. One absent after that, or on the
   last day, is what the live demo shows: missing. */
function liveStatusDemoDays(timeline,keys){
  var seen=Object.create(null),last=timeline.days.length-1;
  return timeline.days.map(function(day,index){
    var full=liveStatusDemoMap(day,keys,timeline.epics),issues=day.issues || {},states=Object.create(null);
    Object.keys(issues).forEach(function(key){seen[key]=true;});
    Object.keys(full).forEach(function(key){
      if(full[key].state==='missing' && !issues[key] && !seen[key] && index<last)return;
      states[key]={state:full[key].state};if(full[key].detail)states[key].detail=full[key].detail;
    });
    var start=day.telemetry && Date.parse(day.telemetry.start);
    return {key:isFinite(start)?new Date(start).toISOString().slice(0,10):null,at:isFinite(start)?new Date(start+86400000).toISOString():null,telemetry:liveStatusDemoTelemetry(day),label:liveStatusDemoLabel(day,index),short:'Day '+(index+1),states:states};
  });
}
function liveStatusDemoTimeline(keys){
  var labels=['kickoff','work starts','dependency blocked','delivery complete'];
  return {version:1,intervalSeconds:6,days:labels.map(function(label,index){
    var issues=Object.create(null);(keys || []).forEach(function(key,i){issues[key]={state:index===0?'todo':index===3?'done':index===2 && i===0?'blocked':'active'};});
    return {label:'Day '+(index+1)+' — '+label,issues:issues};
  })};
}
function createLiveStatusDemo(doc){
  // `shown` is the slider's day while Over time is open. The day buttons carry on from it.
  var timeline=null,api=null,day=0,shown=null,retired=false;
  var block=doc.getElementById('live-timeline');
  if(block){try{var parsed=JSON.parse(block.textContent);if(parsed && Array.isArray(parsed.days) && parsed.days.length)timeline=parsed;}catch(ex){/* A missing/unusable timeline uses page-local tickets. */}}
  function ensure(keys){if(!timeline)timeline=liveStatusDemoTimeline(keys);return timeline;}
  function current(){return shown===null?day:shown;}
  function ended(){return current()>=timeline.days.length-1;}
  function first(){return current()<=0;}
  function controls(){api.setDemoControls({ended:ended(),first:first(),prev:previous,next:next});}
  function announce(){api.note(liveStatusDemoLabel(timeline.days[current()],current()),'info');controls();}
  function paint(){
    if(retired)return;
    if(typeof api.status==='function')api.status({state:'demo',source:'Demo',busy:false,checkedAt:Date.now()});
    // While a past day shows, the controller holds this map until the return to Live.
    api.apply(liveStatusDemoMap(timeline.days[day],api.refs().tickets,timeline.epics));
    if(api.telemetry && typeof api.telemetry.apply==='function')api.telemetry.apply(liveStatusDemoTelemetry(timeline.days[day]));
    if(shown!==null)api.overTimeDay(shown);
    announce();
  }
  function step(target){day=target;if(shown!==null)shown=day;paint();}
  function next(){if(!retired && !ended())step(current()+1);}
  function previous(){if(!retired && !first())step(current()-1);}
  var history={
    load:function(){
      var keys=api.refs().tickets;shown=day;controls();
      return {today:liveStatusDemoMap(timeline.days[timeline.days.length-1],keys,timeline.epics),days:liveStatusDemoDays(timeline,keys),index:day};
    },
    day:function(index){shown=index;announce();},
    close:function(){shown=null;announce();}
  };
  return {
    provider:function(refs){var t=ensure(refs.tickets);return liveStatusDemoMap(t.days[day],refs.tickets,t.epics);},
    telemetry:{provider:function(){return timeline?liveStatusDemoTelemetry(timeline.days[day]):Object.create(null);}},
    demo:{mount:function(live){
      api=live;ensure(api.refs().tickets);paint();api.setHistory(history);
      return function(){retired=true;};
    }}
  };
}

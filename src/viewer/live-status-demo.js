/* Standalone-only, local story transport. No network or authored-spec writes. The day readers
   (liveStatusDemoMap, liveStatusDemoTelemetry) are in live-status-story.js, shared with the Workbench (#1265). */
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

/* Standalone-only, local story transport. No network or authored-spec writes. */
function liveStatusDemoMap(day,keys){
  var map=Object.create(null),issues=day && day.issues || {};
  (keys || []).concat(Object.keys(issues)).filter(function(key,index,all){return all.indexOf(key)===index;}).forEach(function(key){
    var issue=issues[key];if(!issue){map[key]={state:'missing'};return;}
    var entry={state:issue.state};
    [['summary','title'],['assignee','assignee'],['assigneeId','assigneeId'],['updated','updatedAt'],['epic','epic'],['lane','lane']].forEach(function(pair){if(typeof issue[pair[0]]==='string')entry[pair[1]]=issue[pair[0]];});
    if(issue.statusName || issue.flagged)entry.detail=(issue.statusName || '')+(issue.flagged?' · flagged':'');
    if(issue.prs && issue.prs.count>0){entry.prs={count:issue.prs.count,state:String(issue.prs.state).toLowerCase()};if(Array.isArray(issue.prs.links))entry.prs.links=JSON.parse(JSON.stringify(issue.prs.links));}
    map[key]=entry;
  });return map;
}
function liveStatusDemoTimeline(keys){
  var labels=['kickoff','work starts','dependency blocked','delivery complete'];
  return {version:1,intervalSeconds:6,days:labels.map(function(label,index){
    var issues=Object.create(null);(keys || []).forEach(function(key,i){issues[key]={state:index===0?'todo':index===3?'done':index===2 && i===0?'blocked':'active'};});
    return {label:'Day '+(index+1)+' — '+label,issues:issues};
  })};
}
function createLiveStatusDemo(doc){
  var timeline=null,api=null,day=0,timer=0,retired=false,playing=false;
  var media=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var block=doc.getElementById('live-timeline');
  if(block){try{var parsed=JSON.parse(block.textContent);if(parsed && Array.isArray(parsed.days) && parsed.days.length)timeline=parsed;}catch(ex){/* A missing/unusable timeline uses page-local tickets. */}}
  function ensure(keys){if(!timeline)timeline=liveStatusDemoTimeline(keys);return timeline;}
  function stop(){if(timer){clearTimeout(timer);timer=0;}}
  function manual(){return !!(media && media.matches);}
  function ended(){return day>=timeline.days.length-1;}
  function controls(){api.setDemoControls({playing:playing,manual:manual(),ended:ended(),toggle:toggle,next:next});}
  function paint(){
    if(retired)return;
    var current=timeline.days[day],label=String(current.label || '');
    if(typeof api.status==='function')api.status({state:'demo',source:'Demo',busy:false,checkedAt:Date.now()});
    api.apply(liveStatusDemoMap(current,api.refs().tickets));
    api.note(/^Day \d+\s*[—-]/.test(label)?label:'Day '+(day+1)+' — '+label,'info');controls();
  }
  function arm(){
    stop();if(retired || !playing || manual() || ended() || doc.hidden)return;
    var seconds=Number(timeline.intervalSeconds),delay=isFinite(seconds) && seconds>0?seconds*1000:6000;
    timer=setTimeout(function(){timer=0;next();},delay);
  }
  function next(){if(retired || ended())return;day++;if(ended())playing=false;paint();arm();}
  function toggle(){if(retired || manual() || ended())return;playing=!playing;controls();arm();}
  function motionChanged(){if(manual())playing=false;controls();arm();}
  function visibility(){arm();}
  return {
    provider:function(refs){return liveStatusDemoMap(ensure(refs.tickets).days[day],refs.tickets);},
    demo:{mount:function(live){
      api=live;ensure(api.refs().tickets);playing=!manual();paint();arm();
      doc.addEventListener('visibilitychange',visibility);if(media)media.addEventListener('change',motionChanged);
      return function(){retired=true;stop();doc.removeEventListener('visibilitychange',visibility);if(media)media.removeEventListener('change',motionChanged);};
    }}
  };
}

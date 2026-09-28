/* Browser-local learning history for built-in tour topics. Custom page tours
   never share this namespace. No diagram IDs, source, or telemetry are stored. */
var TOUR_PROGRESS_KEY = 'dv_tour_features_v1';
var tourProgressMemory = {version:1,persona:'both',seen:[]};

function tourFeatureKey(step){
  if(!step || (step.kind || 'spot')!=='spot')return null;
  /* The UX and engineering lessons teach the same step transport. */
  return step.id==='controls'?'mode-step':step.id;
}
function parseTourProgress(text){
  var value;
  try{value=JSON.parse(text);}catch(ex){}
  if(!value || value.version!==1 || !Array.isArray(value.seen))
    return {version:1,persona:'both',seen:[]};
  return {version:1,persona:TOUR_PERSONAS.indexOf(value.persona)>=0?value.persona:'both',
    seen:value.seen.filter(function(id,i,all){
      return typeof id==='string' && /^[a-z][a-z0-9-]{0,79}$/.test(id) && all.indexOf(id)===i;
    }).slice(0,128)};
}
function createTourProgress(win){
  function read(){
    var saved;
    try{var raw=win.localStorage.getItem(TOUR_PROGRESS_KEY);saved=raw?parseTourProgress(raw):tourProgressMemory;}
    catch(ex){saved={version:1,persona:tourProgressMemory.persona,seen:[]};}
    /* Keep same-page learning when storage is denied, and merge another tab's
       newer topics before writing rather than overwriting them with a cache. */
    return {version:1,persona:saved.persona,
      seen:Array.from(new Set(saved.seen.concat(tourProgressMemory.seen)))};
  }
  function write(value){
    tourProgressMemory=value;
    try{win.localStorage.setItem(TOUR_PROGRESS_KEY,JSON.stringify(value));}catch(ex){}
  }
  return {read:read,
    seen:function(step){
      var id=tourFeatureKey(step);if(!id)return;
      var value=read();if(value.seen.indexOf(id)>=0)return;
      value.seen.push(id);write(value);
    },
    persona:function(persona){var value=read();value.persona=persona;write(value);}
  };
}
function unseenTourSteps(steps,progress){
  return steps.filter(function(step){
    var id=tourFeatureKey(step);return id && progress.seen.indexOf(id)<0;
  });
}

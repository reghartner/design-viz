/* One history budget for this viewer runtime, shared by Jira and telemetry.
   Queued work checks cancellation before starting; an abort never frees a slot
   until the actual call settles. The MCP namespace owns viewer/artifact storage. */
var LIVE_STATUS_HISTORY_CACHE_MS=604800000,LIVE_STATUS_HISTORY_CALLS=6;
var liveStatusHistoryQueue=[],liveStatusHistoryActive=0;
function liveStatusHistoryCall(work,signal){
  return new Promise(function(resolve,reject){
    liveStatusHistoryQueue.push(function(){
      if(signal && signal.aborted){reject(new Error('History cancelled'));return Promise.resolve();}
      return Promise.resolve().then(work).then(resolve,reject);
    });
    pump();
  });
  function pump(){
    while(liveStatusHistoryActive<LIVE_STATUS_HISTORY_CALLS && liveStatusHistoryQueue.length){
      liveStatusHistoryActive++;
      liveStatusHistoryQueue.shift()().then(function(){liveStatusHistoryActive--;pump();});
    }
  }
}

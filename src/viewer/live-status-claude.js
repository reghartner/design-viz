/* Standalone claude.ai transport adapter. The overlay owns all rendering;
   the artifact MCP namespace owns networking, consent and watch polling. */
function liveStatusJiraState(issue,flaggedKeys){
  var fields=issue && issue.fields || {},status=fields.status || {},key=issue && issue.key;
  var flagged=flaggedKeys && (typeof flaggedKeys.has==='function'?flaggedKeys.has(key):Array.isArray(flaggedKeys)?flaggedKeys.indexOf(key)>=0:flaggedKeys[key]);
  if(flagged || /block/i.test(status.name || ''))return 'blocked';
  var category=(status.statusCategory || {}).key;
  return category==='indeterminate'?'active':category==='done'?'done':'todo';
}
function liveStatusJiraIssues(payload){
  if(Array.isArray(payload))return payload;
  if(!payload || typeof payload!=='object')return [];
  if(Array.isArray(payload.issues))return payload.issues;
  if(payload.issues && Array.isArray(payload.issues.nodes))return payload.issues.nodes;
  if(payload.data && typeof payload.data==='object' && !Array.isArray(payload.data) && payload.data.key)return [payload.data];
  return [];
}
function liveStatusDevelopmentSummary(fields){
  if(!fields || typeof fields!=='object')return null;
  var values=[],custom=fields.customFields || {};
  if(custom.Development)values.push(custom.Development);
  [fields,custom].forEach(function(source){Object.keys(source).forEach(function(key){if(/^customfield_/.test(key))values.push(source[key]);});});
  for(var i=0;i<values.length;i++){
    if(typeof values[i]!=='string')continue;
    var match=/json=\s*(\{)/.exec(values[i]);if(!match)continue;
    // The Development field wraps JSON in a non-JSON Java-style string. Find
    // the matching brace without being confused by braces inside JSON strings.
    var start=match.index+match[0].length-1,depth=0,quoted=false,escaped=false,end=start;
    for(;end<values[i].length;end++){
      var ch=values[i].charAt(end);
      if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}
      else if(ch==='"')quoted=true;
      else if(ch==='{')depth++;
      else if(ch==='}' && --depth===0)break;
    }
    try{
      var parsed=JSON.parse(values[i].slice(start,end+1)),summary=parsed.cachedValue && parsed.cachedValue.summary;
      var overall=summary && summary.pullrequest && summary.pullrequest.overall,state=overall && String(overall.state).toLowerCase();
      if(overall && typeof overall.count==='number' && isFinite(overall.count) && overall.count>=0 && ['open','merged','declined'].indexOf(state)>=0)return {count:overall.count,state:state};
    }catch(ex){}
  }
  return null;
}
function liveStatusJiraChunks(keys){
  var chunks=[];for(var i=0;i<keys.length;i+=10)chunks.push(keys.slice(i,i+10));return chunks;
}
function liveStatusJiraMap(requestedKeys,issuesByChunk,flaggedKeys,site,storedAt){
  var issues=Object.create(null),map=Object.create(null);
  (issuesByChunk || []).forEach(function(chunk){liveStatusJiraIssues(chunk).forEach(function(issue){if(issue && typeof issue.key==='string')issues[issue.key]=issue;});});
  requestedKeys.forEach(function(key){
    var issue=issues[key],fields=issue && issue.fields || {},entry={state:issue?liveStatusJiraState(issue,flaggedKeys):'missing'};
    if(site)entry.url=site.replace(/\/+$/,'')+'/browse/'+key;
    if(issue){
      if(typeof fields.summary==='string')entry.title=fields.summary;
      if(fields.assignee && typeof fields.assignee.displayName==='string')entry.assignee=fields.assignee.displayName;
      // Atlassian accountId (#764): the Tickets table links the owner to <site>/wiki/people/<id>. No extra tool call.
      if(fields.assignee && typeof fields.assignee.accountId==='string' && fields.assignee.accountId.trim())entry.assigneeId=fields.assignee.accountId.trim();
      if(typeof fields.updated==='string')entry.updatedAt=fields.updated;
      var prs=liveStatusDevelopmentSummary(fields);if(prs)entry.prs=prs;
    }
    map[key]=entry;
  });
  // Cache age is transport metadata, never an issue's modification timestamp.
  // Non-enumerable so ordinary consumers still see only requested ticket keys.
  if(typeof storedAt==='number' && isFinite(storedAt))Object.defineProperty(map,'storedAt',{value:storedAt});
  return map;
}
function wireLiveStatusClaude(ctl,page,win){
  var claude,use,api=ctl && ctl.liveStatus;
  try{claude=win.claude;use=claude && claude.use;}catch(ex){return null;}
  if(typeof use!=='function' || !api || win.flowviewLiveStatus)return null;
  if(!api.refs().tickets.length && !(api.refs().epics || []).length){
    var removeWaitingChange=null,removeWaitingDestroy=null;
    var stopWaiting=function(){if(removeWaitingChange)removeWaitingChange();if(removeWaitingDestroy)removeWaitingDestroy();};
    removeWaitingChange=api.onChange(function(){
      if(!api.refs().tickets.length && !(api.refs().epics || []).length)return;
      stopWaiting();wireLiveStatusClaude(ctl,page,win);
    });
    removeWaitingDestroy=api.onDestroy(stopWaiting);
    return null;
  }
  var stopped=false,mcp=null,server=null,site='',cloudId=null,chunks=[],jobs=[],subscriptions=[],timers=[];
  var watchedTickets=Object.create(null),watchedEpics=Object.create(null),syncing=false;
  var dirty=false,publishing=false,removeChange=null,removeDestroy=null;
  var addConnector='Add the Atlassian connector in claude.ai Settings → Connectors to see live ticket status.';
  function status(value){if(typeof api.status==='function')api.status(value);}
  // busy = any job (discovery, resource lookup, watch, scheduled retry) still outstanding.
  function mark(job,on){if(job)job.inflight=!!on;}
  function busy(){return jobs.some(function(job){return job.inflight;});}
  status({state:'connecting',source:'Jira',busy:true});
  function unsubscribe(value){try{if(typeof value==='function')value();else if(value && typeof value.unsubscribe==='function')value.unsubscribe();}catch(ex){}}
  function stop(){
    if(stopped)return;stopped=true;
    subscriptions.splice(0).forEach(unsubscribe);timers.splice(0).forEach(function(id){win.clearTimeout(id);});
    if(removeChange)removeChange();if(removeDestroy)removeDestroy();
  }
  function cancelRetry(job){
    if(job.timer!=null){win.clearTimeout(job.timer);var i=timers.indexOf(job.timer);if(i>=0)timers.splice(i,1);job.timer=null;}
  }
  function publish(){
    if(stopped || publishing || !dirty || !api.enabled())return;
    var keys=[],issues=[],flagged=Object.create(null),epics=Object.create(null),stamp=null;
    chunks.forEach(function(chunk){
      if(!chunk.answered)return;
      var found=chunk.epic?chunk.issues.filter(function(issue){return issue && typeof issue.key==='string';}).map(function(issue){return issue.key;}):chunk.keys;
      found.forEach(function(key){if(keys.indexOf(key)<0)keys.push(key);if(chunk.epic && !epics[key])epics[key]=chunk.epic;});
      issues.push(chunk.issues);
      (chunk.flagged || []).forEach(function(issue){if(issue && issue.key)flagged[issue.key]=true;});
      [chunk.storedAt,chunk.flaggedAt].forEach(function(at){if(typeof at==='number' && isFinite(at))stamp=stamp==null?at:Math.max(stamp,at);});
    });
    dirty=false;publishing=true;
    try{var map=liveStatusJiraMap(keys,issues,flagged,site,stamp);Object.keys(epics).forEach(function(key){if(map[key])map[key].epic=epics[key];});api.apply(map);}finally{publishing=false;}
  }
  function notices(){
    if(stopped)return;
    var approval=jobs.filter(function(job){return job.error && ['approval_required','consent_required'].indexOf(job.error.code)>=0 && !job.approvalUsed;})[0];
    var failed=approval || jobs.filter(function(job){return job.error;})[0];
    api.action('',null);
    if(!failed){api.note('','info');return;}
    var error=failed.error,code=error.code;
    if(code==='approval_required' || code==='consent_required'){
      api.note('Jira access needs your approval','warn');
      if(approval && approval.tool)api.action('Allow Jira',function(){
        if(stopped || approval.approvalUsed)return;
        approval.approvalUsed=true;api.action('',null);runCall(approval);
      });
    }else if(code==='tool_error')api.note(error.message || 'Jira did not answer','warn');
    else api.note(code==='rate_limited'?'Jira is rate limited; retrying':error.retryable?'Jira did not answer; retrying':'Jira did not answer','info');
  }
  function fail(job,error,mayRetry){
    if(stopped)return;
    error=error || {};job.error=error;
    var code=error.code,message=null,kind='info';
    mark(job,false);
    if(code==='user_changed'){if(!job.chunk || !job.chunk.epic)api.clear();api.note('','info');api.action('',null);status({state:'disconnected',busy:false});stop();return;}
    if(code==='needs_reauth'){message='Reconnect Atlassian in claude.ai Settings → Connectors';kind='error';}
    if(code==='server_not_connected' || code==='selection_required')message=addConnector;
    if(code==='not_in_manifest' || code==='blocked_by_policy'){message='This page is not allowed to read Jira for your account.';kind='warn';}
    if(message){if(!job.chunk || !job.chunk.epic)api.clear();api.action('',null);api.note(message,kind);status({state:code==='needs_reauth' || code==='server_not_connected' || code==='selection_required'?'disconnected':'error',busy:false});stop();return;}
    var retry=code==='rate_limited' || (code==='server_unavailable' || code==='upstream_error') && error.retryable;
    // Unknown errors are non-retryable, even if a foreign code says otherwise.
    if(!retry && ['approval_required','consent_required','tool_error'].indexOf(code)<0)job.error={code:'upstream_error',retryable:false};
    notices();
    var now=Date.now();
    if(retry && mayRetry && job.timer==null && (job.lastRetry==null || now-job.lastRetry>=60000)){
      job.lastRetry=now;
      var delay=typeof error.retryAfterMs==='number' && isFinite(error.retryAfterMs) && error.retryAfterMs>=0?error.retryAfterMs:code==='rate_limited'?5000:1000+Math.floor(Math.random()*2001);
      job.timer=win.setTimeout(function(){cancelRetry(job);if(!stopped)runCall(job);},delay);timers.push(job.timer);
    }
    mark(job,job.timer!=null);status({state:code==='approval_required' || code==='consent_required'?'approval':'error',busy:busy()});
  }
  function accept(job,result){
    if(stopped)return;
    cancelRetry(job);job.error=null;
    var stored=result && result.cache && result.cache.storedAt,checkedAt=typeof stored==='number' && isFinite(stored)?stored:Date.now();
    if(job.accept){mark(job,false);status({state:'connected',busy:busy(),checkedAt:checkedAt});notices();job.accept(result);return;}
    status({state:'connected',checkedAt:checkedAt});
    var chunk=job.chunk,version=job.version,all=[],seen=Object.create(null),stamp=null;
    function pageResult(result){
      if(stopped || version!==job.version)return;
      var payload=result && result.payload,at=result && result.cache && result.cache.storedAt;
      all=all.concat(liveStatusJiraIssues(payload));
      if(typeof at==='number' && isFinite(at))stamp=stamp==null?at:Math.max(stamp,at);
      var info=payload && (payload.pageInfo || payload.issues && payload.issues.pageInfo);
      var token=payload && payload.nextPageToken || result && result.nextPageToken || info && info.hasNextPage && info.endCursor;
      if(chunk.epic && token){
        if(seen[token]){fail(job,{code:'tool_error',message:'Jira repeated a page cursor'},false);return;}
        seen[token]=true;
        var input=Object.assign({},job.input,{nextPageToken:token});
        Promise.resolve().then(function(){if(!stopped && version===job.version)return mcp.callTool(server,job.tool,input,job.options);}).then(pageResult,function(error){if(!stopped && version===job.version)fail(job,error,true);});
        return;
      }
      // Publish only a complete page chain. A failed refresh keeps all prior evidence.
      if(job.flagged){chunk.flagged=all;chunk.flaggedAt=stamp;}
      else{chunk.answered=true;chunk.issues=all;chunk.storedAt=stamp;}
      mark(job,false);status({busy:busy()});
      dirty=true;publish();notices();
    }
    pageResult(result);
  }
  function runCall(job){
    var version=++job.version;mark(job,true);status({busy:true});
    return Promise.resolve().then(function(){
      if(stopped)return;
      return mcp.callTool(server,job.tool,job.input,job.options);
    }).then(function(result){if(!stopped && version===job.version)accept(job,result);},function(error){if(!stopped && version===job.version)fail(job,error,false);});
  }
  function watch(job){
    if(stopped)return;
    var subscription;mark(job,true);status({busy:true});
    try{
      subscription=mcp.watchTool(server,job.tool,job.input,function(event){
        if(stopped || !event)return;
        job.version++;
        if(event.type==='data')accept(job,event.result);
        else if(event.type==='error')fail(job,event.error,true);
      },{refetchInterval:60000});
    }catch(error){fail(job,error,true);return;}
    // A synchronous initial event can retire the adapter before registration
    // returns; an asynchronous registration can finish after destroy as well.
    Promise.resolve(subscription).then(function(value){if(stopped)unsubscribe(value);else subscriptions.push(value);},function(error){fail(job,error,true);});
  }
  function host(url){try{return new URL(url).host;}catch(ex){return null;}}
  function syncWatches(){
    if(stopped || !cloudId || syncing)return;
    syncing=true;
    try{
      var refs=api.refs(),added=liveStatusJiraChunks(refs.tickets.filter(function(key){return !watchedTickets[key];})).map(function(keys){
        keys.forEach(function(key){watchedTickets[key]=true;});return {keys:keys,answered:false,issues:[],flagged:[]};
      });
      (refs.epics || []).forEach(function(epic){
        if(watchedEpics[epic])return;watchedEpics[epic]=true;
        added.push({epic:epic,keys:[],answered:false,issues:[],flagged:[]});
      });
      // Register identities before a watch can synchronously publish data.
      chunks=chunks.concat(added);
      added.forEach(function(chunk){
        [false,true].forEach(function(flagged){
          var job={version:0,chunk:chunk,flagged:flagged,tool:'searchJiraIssuesUsingJql',input:{cloudId:cloudId,jql:(chunk.epic?'parent = '+chunk.epic:'key in ('+chunk.keys.join(', ')+')')+(flagged?' AND Flagged = Impediment':''),fields:['summary','status','assignee','updated'].concat(chunk.epic?['issuetype']:[]),maxResults:10}};
          jobs.push(job);watch(job);
        });
      });
    }finally{syncing=false;}
  }
  function resources(result){
    if(stopped)return;
    var list=result && result.payload,desired=page && page.tracking && page.tracking.jira && page.tracking.jira.site;
    list=Array.isArray(list)?list:[];
    var resource=desired?list.filter(function(item){return item && host(item.url) && host(item.url)===host(desired);})[0]:list[0];
    if(!resource || !resource.id){api.note('No Atlassian site is available to this account.','warn');status({state:'disconnected',busy:false});stop();return;}
    site=resource.url;cloudId=resource.id;syncWatches();status({busy:busy()});
  }
  var pending;
  try{pending=use.call(claude,'mcp');}catch(ex){status({state:'disconnected',busy:false});return null;}
  removeDestroy=api.onDestroy(stop);
  removeChange=api.onChange(function(){syncWatches();publish();});
  return Promise.resolve(pending).then(function(namespace){
    if(stopped)return null;
    if(!namespace){status({state:'disconnected',busy:false});stop();return null;}
    mcp=namespace;
    var discovery={version:0,tool:null,input:{},inflight:true};jobs.push(discovery);
    return Promise.resolve().then(function(){if(!stopped)return mcp.listTools();}).then(function(list){
      if(stopped)return null;
      var listed=Array.isArray(list)?list:list && Array.isArray(list.servers)?list.servers:[];
      // Pick the connector by what it can do, not by its display name: the
      // page's mcp manifest already limits which connectors are listed, and
      // "Atlassian MCP" is also the name of Atlassian's directory connector,
      // so a custom connector (for example a mock) may carry any name.
      var qualified=[];
      listed.forEach(function(candidate){
        var name=candidate && (candidate.server || candidate.name);
        if(typeof name!=='string' || !name || !Array.isArray(candidate.tools))return;
        var offered=candidate.tools.map(function(tool){return typeof tool==='string'?tool:tool && tool.name;});
        if(offered.indexOf('searchJiraIssuesUsingJql')>=0 && offered.indexOf('getAccessibleAtlassianResources')>=0 && qualified.indexOf(name)<0)qualified.push(name);
      });
      ['Atlassian MCP','Atlassian'].some(function(name){if(qualified.indexOf(name)>=0)server=name;return !!server;});
      if(!server && qualified.length)server=qualified[0];
      if(!server){api.note(addConnector,'info');status({state:'disconnected',busy:false});stop();return null;}
      var job={version:0,tool:'getAccessibleAtlassianResources',input:{},options:{cache:{staleTime:300000}},accept:resources,inflight:true};jobs.push(job);mark(discovery,false);
      // Initial resource lookup may retry once. All subsequent call failures
      // (including explicit approval) end here rather than recursively retry.
      var version=++job.version;
      return Promise.resolve().then(function(){if(!stopped)return mcp.callTool(server,job.tool,job.input,job.options);}).then(function(result){if(!stopped && version===job.version){job.error=null;mark(job,false);resources(result);}},function(error){fail(job,error,true);});
    },function(error){fail(discovery,error,false);});
  },function(){status({state:'disconnected',busy:false});stop();return null;});
}

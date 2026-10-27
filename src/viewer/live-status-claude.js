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
      if(overall && typeof overall.count==='number' && isFinite(overall.count) && overall.count>=0 && ['open','merged'].indexOf(state)>=0)return {count:overall.count,state:state};
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
  if(typeof use!=='function' || !api || win.flowviewLiveStatus || !api.refs().tickets.length)return null;
  var stopped=false,mcp=null,server=null,site='',chunks=[],jobs=[],subscriptions=[],timers=[];
  var dirty=false,publishing=false,removeChange=null,removeDestroy=null;
  var addConnector='Add the Atlassian connector in claude.ai Settings → Connectors to see live ticket status.';
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
    var keys=[],issues=[],flagged=Object.create(null),stamp=null;
    chunks.forEach(function(chunk){
      if(!chunk.answered)return;
      keys=keys.concat(chunk.keys);issues.push(chunk.issues);
      (chunk.flagged || []).forEach(function(issue){if(issue && issue.key)flagged[issue.key]=true;});
      [chunk.storedAt,chunk.flaggedAt].forEach(function(at){if(typeof at==='number' && isFinite(at))stamp=stamp==null?at:Math.max(stamp,at);});
    });
    dirty=false;publishing=true;
    try{api.apply(liveStatusJiraMap(keys,issues,flagged,site,stamp));}finally{publishing=false;}
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
    if(code==='user_changed'){api.clear();api.note('','info');api.action('',null);stop();return;}
    if(code==='needs_reauth'){message='Reconnect Atlassian in claude.ai Settings → Connectors';kind='error';}
    if(code==='server_not_connected' || code==='selection_required')message=addConnector;
    if(code==='not_in_manifest' || code==='blocked_by_policy'){message='This page is not allowed to read Jira for your account.';kind='warn';}
    if(message){api.clear();api.action('',null);api.note(message,kind);stop();return;}
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
  }
  function accept(job,result){
    if(stopped)return;
    cancelRetry(job);job.error=null;
    if(job.accept){notices();job.accept(result);return;}
    var chunk=job.chunk,issues=liveStatusJiraIssues(result && result.payload),at=result && result.cache && result.cache.storedAt;
    if(job.flagged){chunk.flagged=issues;chunk.flaggedAt=at;}
    else{chunk.answered=true;chunk.issues=issues;chunk.storedAt=at;}
    dirty=true;publish();notices();
  }
  function runCall(job){
    var version=++job.version;
    return Promise.resolve().then(function(){
      if(stopped)return;
      return mcp.callTool(server,job.tool,job.input,job.options);
    }).then(function(result){if(!stopped && version===job.version)accept(job,result);},function(error){if(!stopped && version===job.version)fail(job,error,false);});
  }
  function watch(job){
    if(stopped)return;
    var subscription;
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
  function resources(result){
    if(stopped)return;
    var list=result && result.payload,desired=page && page.tracking && page.tracking.jira && page.tracking.jira.site;
    list=Array.isArray(list)?list:[];
    var resource=desired?list.filter(function(item){return item && host(item.url) && host(item.url)===host(desired);})[0]:list[0];
    if(!resource || !resource.id){api.note('No Atlassian site is available to this account.','warn');stop();return;}
    site=resource.url;
    chunks=liveStatusJiraChunks(api.refs().tickets).map(function(keys){return {keys:keys,answered:false,issues:[],flagged:[]};});
    chunks.forEach(function(chunk){
      [false,true].forEach(function(flagged){
        var job={version:0,chunk:chunk,flagged:flagged,tool:'searchJiraIssuesUsingJql',input:{cloudId:resource.id,jql:'key in ('+chunk.keys.join(', ')+')'+(flagged?' AND Flagged = Impediment':''),fields:['summary','status','assignee','updated'],maxResults:10}};
        jobs.push(job);watch(job);
      });
    });
  }
  var pending;
  try{pending=use.call(claude,'mcp');}catch(ex){return null;}
  removeDestroy=api.onDestroy(stop);
  removeChange=api.onChange(function(){publish();});
  return Promise.resolve(pending).then(function(namespace){
    if(stopped)return null;
    if(!namespace){stop();return null;}
    mcp=namespace;
    var discovery={version:0,tool:null,input:{}};jobs.push(discovery);
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
      if(!server){api.note(addConnector,'info');stop();return null;}
      var job={version:0,tool:'getAccessibleAtlassianResources',input:{},options:{cache:{staleTime:300000}},accept:resources};jobs.push(job);
      // Initial resource lookup may retry once. All subsequent call failures
      // (including explicit approval) end here rather than recursively retry.
      var version=++job.version;
      return Promise.resolve().then(function(){if(!stopped)return mcp.callTool(server,job.tool,job.input,job.options);}).then(function(result){if(!stopped && version===job.version){job.error=null;resources(result);}},function(error){fail(job,error,true);});
    },function(error){fail(discovery,error,false);});
  },function(){stop();return null;});
}

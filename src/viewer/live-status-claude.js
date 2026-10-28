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
/* Dependencies from Jira issue links (#765): the description shown on the
   dependent issue's side (type.inward for inwardIssue, type.outward for
   outwardIssue) must be one of the configured link types. The linked issue's
   key, summary and status ride the link payload, so an upstream outside the
   epic and the diagram gets a state without another call. */
var LIVE_STATUS_JIRA_KEY=/^[A-Z][A-Z0-9_]+-[0-9]+$/,LIVE_STATUS_JIRA_DEPENDENCY_LINKS=['is blocked by','depends on'];
function liveStatusJiraDependencies(issue,linkTypes){
  // Self-contained on purpose: this adapter is also loaded without the core tracking helpers.
  var out=[],types=(linkTypes && linkTypes.length?linkTypes:LIVE_STATUS_JIRA_DEPENDENCY_LINKS).map(function(name){return String(name).trim().toLowerCase();});
  var links=issue && issue.fields && issue.fields.issuelinks;
  (Array.isArray(links)?links:[]).forEach(function(link){
    if(!link || typeof link!=='object' || !link.type)return;
    var target=link.inwardIssue || link.outwardIssue,description=link.inwardIssue?link.type.inward:link.type.outward;
    if(!target || typeof target.key!=='string' || !LIVE_STATUS_JIRA_KEY.test(target.key) || typeof description!=='string')return;
    if(types.indexOf(description.trim().toLowerCase())<0 || out.some(function(item){return item.key===target.key;}))return;
    out.push({key:target.key,linkType:description.trim().toLowerCase(),issue:target});
  });
  return out;
}
function liveStatusJiraChunks(keys){
  var chunks=[];for(var i=0;i<keys.length;i+=10)chunks.push(keys.slice(i,i+10));return chunks;
}
/* Jira hierarchyLevel is authoritative; standard names support older connector payloads. */
function liveStatusJiraKind(issue){
  var type=issue && issue.fields && issue.fields.issuetype || {};
  if(typeof type.hierarchyLevel==='number')return type.hierarchyLevel>=2?'initiative':type.hierarchyLevel===1?'epic':'story';
  return /^epic$/i.test(type.name || '')?'epic':/^initiative$/i.test(type.name || '')?'initiative':null;
}
function liveStatusJiraMap(requestedKeys,issuesByChunk,flaggedKeys,site,storedAt,linkTypes){
  var issues=Object.create(null),map=Object.create(null);
  (issuesByChunk || []).forEach(function(chunk){liveStatusJiraIssues(chunk).forEach(function(issue){if(issue && typeof issue.key==='string')issues[issue.key]=issue;});});
  requestedKeys.forEach(function(key){
    var issue=issues[key],fields=issue && issue.fields || {},entry={state:issue?liveStatusJiraState(issue,flaggedKeys):'missing'};
    if(site)entry.url=site.replace(/\/+$/,'')+'/browse/'+key;
    if(issue){
      if(typeof fields.summary==='string')entry.title=fields.summary;
      var kind=liveStatusJiraKind(issue);if(kind)entry.kind=kind;
      var parent=fields.parent;if(parent && LIVE_STATUS_JIRA_KEY.test(parent.key)){entry.parent=parent.key;if(liveStatusJiraKind(parent)==='epic' && kind!=='epic' && kind!=='initiative')entry.epic=parent.key;}
      if(fields.assignee && typeof fields.assignee.displayName==='string')entry.assignee=fields.assignee.displayName;
      // Atlassian accountId (#764): the Tickets table links the owner to <site>/wiki/people/<id>. No extra tool call.
      if(fields.assignee && typeof fields.assignee.accountId==='string' && fields.assignee.accountId.trim())entry.assigneeId=fields.assignee.accountId.trim();
      if(typeof fields.updated==='string')entry.updatedAt=fields.updated;
      var prs=liveStatusDevelopmentSummary(fields);if(prs)entry.prs=prs;
      var deps=liveStatusJiraDependencies(issue,linkTypes);if(deps.length)entry.dependsOn=deps.map(function(dep){return {key:dep.key,source:'jira',linkType:dep.linkType};});
    }
    map[key]=entry;
  });
  // The epic itself rides each child's parent payload (summary, status): seed its entry for the panel's epic box.
  requestedKeys.forEach(function(key){
    var parent=issues[key] && issues[key].fields && issues[key].fields.parent;
    if(!parent || typeof parent.key!=='string' || !LIVE_STATUS_JIRA_KEY.test(parent.key) || requestedKeys.indexOf(parent.key)>=0 || map[parent.key])return;
    var fields=parent.fields || {};if(!fields.status)return;
    var entry={state:liveStatusJiraState(parent,flaggedKeys)};var kind=liveStatusJiraKind(parent);if(kind)entry.kind=kind;if(typeof fields.summary==='string')entry.title=fields.summary;
    if(site)entry.url=site.replace(/\/+$/,'')+'/browse/'+parent.key;
    map[parent.key]=entry;
  });
  // Linked upstreams the page never asked for: seed them from the link payload; a requested issue always wins.
  requestedKeys.forEach(function(key){
    var issue=issues[key];if(!issue)return;
    liveStatusJiraDependencies(issue,linkTypes).forEach(function(dep){
      if(requestedKeys.indexOf(dep.key)>=0 || map[dep.key])return;
      var fields=dep.issue.fields || {},entry={state:liveStatusJiraState(dep.issue,flaggedKeys)};
      if(typeof fields.summary==='string')entry.title=fields.summary;
      if(site)entry.url=site.replace(/\/+$/,'')+'/browse/'+dep.key;
      map[dep.key]=entry;
    });
  });
  // Cache age is transport metadata, never an issue's modification timestamp.
  // Non-enumerable so ordinary consumers still see only requested ticket keys.
  if(typeof storedAt==='number' && isFinite(storedAt))Object.defineProperty(map,'storedAt',{value:storedAt});
  return map;
}
/* GitHub connector shapes were captured from a real claude.ai custom connector
   (docs/live-status.md, "Pull requests from GitHub"): search items and the
   trimmed pull request of pull_request_read. Nothing here paints a carrier. */
var LIVE_STATUS_GITHUB_TOOLS=['search_pull_requests','pull_request_read'];
var LIVE_STATUS_GITHUB_FIELDS=['number','title','state','html_url','user','pull_request','repository_url','draft'];
var LIVE_STATUS_GITHUB_FAILED=['failure','timed_out','action_required','startup_failure','cancelled'];
function liveStatusGithubURL(url){
  var match=typeof url==='string' && /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)(?:\/?(?:[?#].*)?)?$/.exec(url);
  if(!match)return null;
  return {owner:match[1],repo:match[2],pullNumber:Number(match[3]),url:'https://github.com/'+match[1]+'/'+match[2]+'/pull/'+Number(match[3])};
}
function liveStatusGithubWanted(page,api){
  var scope=trackingGithubScope(page);
  return !!(scope.repos.length || scope.org || api.refs().prs.some(liveStatusGithubURL));
}
function liveStatusGithubPR(item,source){
  if(!item || typeof item!=='object')return null;
  var pull=item.pull_request || {},ref=liveStatusGithubURL(pull.html_url || item.html_url);
  if(!ref || ['open','closed'].indexOf(item.state)<0)return null;
  var mergedAt=pull.merged_at || item.merged_at,merged=!!(mergedAt || item.merged),draft=!!item.draft;
  var repository=typeof item.repository_url==='string' && /^https:\/\/api\.github\.com\/repos\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/?$/.exec(item.repository_url);
  var out={url:ref.url,number:ref.pullNumber,title:typeof item.title==='string'?item.title:'',
    state:merged?'merged':item.state==='open'?(draft?'draft':'open'):'closed',checks:'none',review:'none',
    repo:repository?repository[1]:ref.owner+'/'+ref.repo,author:item.user && typeof item.user.login==='string'?item.user.login:'',source:source};
  if(typeof mergedAt==='string')out.mergedAt=mergedAt;
  if(item.head && typeof item.head.ref==='string')out.branch=item.head.ref;
  return out;
}
/* CI comes from check runs: get_status is the legacy commit-status API and
   Actions-only repositories report nothing there. */
function liveStatusGithubChecks(payload){
  var runs=payload && Array.isArray(payload.check_runs)?payload.check_runs:[];
  if(!runs.length)return 'none';
  if(runs.some(function(run){return run && LIVE_STATUS_GITHUB_FAILED.indexOf(run.conclusion)>=0;}))return 'failing';
  if(runs.some(function(run){return !run || run.status!=='completed';}))return 'pending';
  return runs.every(function(run){return ['success','neutral','skipped'].indexOf(run.conclusion)>=0;})?'passing':'pending';
}
/* One decision per reviewer, the latest wins; a dismissal withdraws it. */
function liveStatusGithubReviews(payload){
  var reviews=Array.isArray(payload)?payload:payload && Array.isArray(payload.reviews)?payload.reviews:[],decided=Object.create(null),commented=false;
  reviews.forEach(function(review){
    if(!review || typeof review!=='object')return;
    var state=String(review.state || '').toUpperCase(),who=review.user && typeof review.user.login==='string'?review.user.login:'';
    if(state==='APPROVED' || state==='CHANGES_REQUESTED')decided[who]=state;
    else if(state==='DISMISSED')delete decided[who];
    else if(state==='COMMENTED')commented=true;
  });
  var states=Object.keys(decided).map(function(who){return decided[who];});
  return states.indexOf('CHANGES_REQUESTED')>=0?'changes-requested':states.indexOf('APPROVED')>=0?'approved':commented?'commented':'none';
}
/* GitHub evidence has its own lifecycle: no GitHub error can clear Jira state
   or write the panel note; it reports through connection.github only. At most
   ten watches are subscribed; a longer queue rotates in 60-second cohorts, which
   also keeps automatic search polling under the connector's search rate limit.
   Pull request reads go to the front of the queue, searches to the back. */
function createLiveStatusGithub(mcp,server,page,api,win,events){
  var jobs=Object.create(null),queue=[],active=[],authored=Object.create(null),checks=Object.create(null),reviews=Object.create(null);
  var stopped=false,pumping=false,rotation=null,knownKeys=[],answered=false;
  function off(value){try{if(typeof value==='function')value();else if(value && typeof value.unsubscribe==='function')value.unsubscribe();}catch(ex){}}
  function cancel(job){if(job.timer!=null){win.clearTimeout(job.timer);job.timer=null;}}
  function all(){return Object.keys(jobs).map(function(id){return jobs[id];});}
  function report(){
    if(stopped)return;
    var list=all(),failed=list.some(function(job){return job.error;}),busy=list.some(function(job){return job.timer!=null || (job.active && !job.answered);});
    events.status({state:failed?'error':answered?'connected':'connecting',busy:busy});
  }
  function retire(job){
    job.active=false;job.version++;cancel(job);
    var registration=job.registration;job.registration=null;
    return Promise.resolve(registration).then(off,function(){});
  }
  function arm(){
    if(stopped || rotation!=null || !queue.length)return;
    rotation=win.setTimeout(function(){
      rotation=null;
      var previous=active.splice(0);queue=queue.concat(previous);
      // Await asynchronous unsubscribe registrations before opening the next cohort.
      pumping=true;Promise.all(previous.map(retire)).then(function(){pumping=false;if(!stopped)pump();});
    },60000);
  }
  function fail(job,error,retry){
    if(stopped)return;
    var code=error && error.code;
    // Account and policy answers end GitHub enrichment; Jira evidence is untouched.
    if(['blocked_by_policy','not_in_manifest','server_not_connected','selection_required','needs_reauth','user_changed'].indexOf(code)>=0){
      stop();events.status({state:'disconnected',busy:false});return;
    }
    job.error=true;
    var now=Date.now();
    if(retry && code==='tool_error' && /rate limit exceeded/i.test(error.message || '') && job.timer==null && (job.lastRetry==null || now-job.lastRetry>=60000)){
      job.lastRetry=now;
      job.timer=win.setTimeout(function(){
        job.timer=null;var version=++job.version;
        Promise.resolve().then(function(){if(!stopped && job.active)return mcp.callTool(server,job.tool,job.input);}).then(function(result){if(!stopped && job.active && job.version===version)accept(job,result);},function(error){if(!stopped && job.active && job.version===version)fail(job,error,false);});
      },1000+Math.floor(Math.random()*2001));
    }
    report();events.changed();
  }
  function accept(job,result){
    cancel(job);job.error=false;job.answered=true;answered=true;job.receive(result && result.payload);report();events.changed();
  }
  function pump(){
    if(stopped || pumping)return;pumping=true;
    while(active.length<10 && queue.length){
      var job=queue.shift();active.push(job);job.active=true;
      (function(job){
        var generation=++job.generation,subscription;
        try{subscription=mcp.watchTool(server,job.tool,job.input,function(event){
          if(stopped || !job.active || job.generation!==generation || !event)return;
          job.version++;
          if(event.type==='data')accept(job,event.result);
          else if(event.type==='error')fail(job,event.error,true);
        },{refetchInterval:60000});}
        catch(error){fail(job,error,true);}
        job.registration=Promise.resolve(subscription);
        job.registration.then(function(value){if(stopped || !job.active || job.generation!==generation)off(value);},function(error){if(!stopped && job.active && job.generation===generation)fail(job,error,true);});
      })(job);
    }
    pumping=false;arm();report();
  }
  function add(id,tool,input,receive,key,first){
    if(jobs[id])return jobs[id];
    var job={id:id,tool:tool,input:input,receive:receive,key:key,version:0,generation:0,error:false,active:false,answered:false,timer:null};
    jobs[id]=job;if(first)queue.unshift(job);else queue.push(job);return job;
  }
  function read(ref,method,id,receive){
    add(id+':'+ref.url,'pull_request_read',{method:method,owner:ref.owner,repo:ref.repo,pullNumber:ref.pullNumber},receive,null,true);
  }
  // Checks and reviews matter while a pull request can still change.
  function follow(pr){
    var ref=pr && ['open','draft'].indexOf(pr.state)>=0 && liveStatusGithubURL(pr.url);if(!ref)return;
    read(ref,'get_check_runs','checks',function(payload){checks[ref.url]=liveStatusGithubChecks(payload);});
    read(ref,'get_reviews','reviews',function(payload){reviews[ref.url]=liveStatusGithubReviews(payload);});
  }
  function sync(keys){
    if(stopped)return;
    var refs=api.refs(),scope=trackingGithubScope(page),repos=scope.repos.slice(),fromAuthored=!repos.length && !scope.org;
    refs.prs.forEach(function(url){
      var ref=liveStatusGithubURL(url);if(!ref)return;
      if(fromAuthored && repos.indexOf(ref.owner+'/'+ref.repo)<0)repos.push(ref.owner+'/'+ref.repo);
      read(ref,'get','get',function(payload){var pr=liveStatusGithubPR(payload,'authored');if(pr){authored[ref.url]=pr;follow(pr);pump();}});
    });
    knownKeys=knownKeys.concat(refs.tickets,keys || []).filter(function(key,index,list){return list.indexOf(key)===index;});
    var scopes=repos.map(function(repo){return ' repo:'+repo;});if(!scopes.length && scope.org)scopes=[' org:'+scope.org];
    knownKeys.forEach(function(key){scopes.forEach(function(where){
      var job=add('search:'+key+where,'search_pull_requests',{query:'"'+key+'" in:title,body'+where,fields:LIVE_STATUS_GITHUB_FIELDS.slice(),perPage:20},function(payload){
        if(!payload || !Array.isArray(payload.items))return;
        job.links=payload.items.map(function(item){return liveStatusGithubPR(item,'github-search');}).filter(Boolean);job.links.forEach(follow);pump();
      },key,false);
    });});
    pump();
  }
  // Authored links come first and keep the authored source; discovered ones follow. Jira's count stays authoritative when present.
  function enrich(map){
    Object.keys(map).forEach(function(key){
      var entry=map[key],discovered=[],links=[],urls=[];
      all().forEach(function(job){if(job.key===key)discovered=discovered.concat(job.links || []);});
      var authoredURLs=api.refs(key).prs.map(liveStatusGithubURL).filter(Boolean).map(function(ref){return ref.url;});
      function append(pr,source){
        if(!pr || urls.indexOf(pr.url)>=0)return;urls.push(pr.url);
        var link={};Object.keys(pr).forEach(function(field){link[field]=pr[field];});link.source=source || pr.source;
        var live=['open','draft'].indexOf(pr.state)>=0;
        link.checks=live && checks[pr.url] || 'none';link.review=live && reviews[pr.url] || 'none';
        links.push(link);
      }
      authoredURLs.forEach(function(url){append(authored[url] || discovered.filter(function(pr){return pr.url===url;})[0],'authored');});
      discovered.forEach(function(pr){append(pr);});
      if(!links.length)return;
      var summary=entry.prs || {count:links.length,state:links.some(function(pr){return pr.state==='open' || pr.state==='draft';})?'open':links.every(function(pr){return pr.state==='merged';})?'merged':'declined'};
      entry.prs={count:summary.count,state:summary.state,links:links};
    });
    return map;
  }
  function stop(){
    if(stopped)return;stopped=true;if(rotation!=null)win.clearTimeout(rotation);rotation=null;queue=[];
    all().forEach(cancel);active.splice(0).forEach(retire);
  }
  events.status({state:'connecting',busy:true});
  return {sync:sync,enrich:enrich,stop:stop};
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
  var syncing=false,resync=false,linkTypes=typeof trackingDependencyLinks==='function'?trackingDependencyLinks(page):null;
  var dirty=false,publishing=false,removeChange=null,removeDestroy=null,github=null;
  var addConnector='Add the Atlassian connector in claude.ai Settings → Connectors to see live ticket status.';
  function status(value){if(typeof api.status==='function')api.status(value);}
  // busy = any job (discovery, resource lookup, watch, scheduled retry) still outstanding.
  function mark(job,on){if(job)job.inflight=!!on;}
  function busy(){return jobs.some(function(job){return !job.retired && job.inflight;});}
  status({state:'connecting',source:'Jira',busy:true});
  function unsubscribe(value){try{if(typeof value==='function')value();else if(value && typeof value.unsubscribe==='function')value.unsubscribe();}catch(ex){}}
  function stop(){
    if(stopped)return;stopped=true;if(github)github.stop();
    subscriptions.splice(0).forEach(unsubscribe);timers.splice(0).forEach(function(id){win.clearTimeout(id);});
    if(removeChange)removeChange();if(removeDestroy)removeDestroy();
  }
  function cancelRetry(job){
    if(job.timer!=null){win.clearTimeout(job.timer);var i=timers.indexOf(job.timer);if(i>=0)timers.splice(i,1);job.timer=null;}
  }
  function publish(){
    if(stopped || syncing || publishing || !dirty || !api.enabled())return;
    // A hierarchy is a single piece of evidence. Keep the last complete map
    // while any root, child or flagged page chain is incomplete or has failed.
    var refs=api.refs(),roots=initiativeRoots();
    if(chunks.some(function(chunk){return chunk.roots && !chunk.answered;}))return;
    if(roots.length && (chunks.some(function(chunk){return !chunk.answered || !chunk.flaggedAnswered;}) || jobs.some(function(job){return !job.retired && (job.inflight || job.error);})))return;
    var keys=[],issues=[],flagged=Object.create(null),epics=Object.create(null),stamp=null;
    chunks.forEach(function(chunk){
      if(!chunk.answered)return;
      var found=chunk.epic || chunk.initiative?chunk.issues.filter(function(issue){return issue && typeof issue.key==='string';}).map(function(issue){return issue.key;}):chunk.keys.filter(function(key){return (chunk.roots?refs.epics:refs.tickets).indexOf(key)>=0;});
      found.forEach(function(key){if(keys.indexOf(key)<0)keys.push(key);if(chunk.epic && !epics[key])epics[key]=chunk.epic;});
      issues.push(chunk.issues);
      (chunk.flagged || []).forEach(function(issue){if(issue && issue.key)flagged[issue.key]=true;});
      [chunk.storedAt,chunk.flaggedAt].forEach(function(at){if(typeof at==='number' && isFinite(at))stamp=stamp==null?at:Math.max(stamp,at);});
    });
    dirty=false;publishing=true;
    try{var map=liveStatusJiraMap(keys,issues,flagged,site,stamp,linkTypes);
      Object.keys(epics).forEach(function(key){if(map[key]){map[key].epic=epics[key];map[key].parent=epics[key];}});
      var membership=Object.create(null);
      chunks.forEach(function(chunk){if(chunk.initiative)chunk.issues.forEach(function(issue){var list=membership[issue.key] || (membership[issue.key]=[]);if(list.indexOf(chunk.initiative)<0)list.push(chunk.initiative);});});
      Object.keys(map).forEach(function(key){
        var entry=map[key];
        if(roots.indexOf(key)>=0){entry.kind='initiative';delete entry.epic;}
        else if((refs.epics || []).indexOf(key)>=0 || membership[key]){entry.kind='epic';delete entry.epic;}
        var parents=membership[key] || membership[entry.epic];if(parents)entry.initiatives=parents.slice();
      });
      if(github){github.sync(keys);github.enrich(map);}api.apply(map);}finally{publishing=false;}
    // A GitHub watch answering synchronously inside sync() marks dirty again; one more pass folds it in.
    if(dirty)publish();
  }
  function notices(){
    if(stopped)return;
    var approval=jobs.filter(function(job){return !job.retired && job.error && ['approval_required','consent_required'].indexOf(job.error.code)>=0 && !job.approvalUsed;})[0];
    var failed=approval || jobs.filter(function(job){return !job.retired && job.error;})[0];
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
    if(stopped || job.retired)return;
    error=error || {};job.error=error;
    var code=error.code,message=null,kind='info';
    mark(job,false);
    if(code==='user_changed'){if(!job.chunk || !(job.chunk.epic || job.chunk.initiative || job.chunk.roots || initiativeRoots().length))api.clear();api.note('','info');api.action('',null);status({state:'disconnected',busy:false});stop();return;}
    if(code==='needs_reauth'){message='Reconnect Atlassian in claude.ai Settings → Connectors';kind='error';}
    if(code==='server_not_connected' || code==='selection_required')message=addConnector;
    if(code==='not_in_manifest' || code==='blocked_by_policy'){message='This page is not allowed to read Jira for your account.';kind='warn';}
    if(message){if(!job.chunk || !(job.chunk.epic || job.chunk.initiative || job.chunk.roots || initiativeRoots().length))api.clear();api.action('',null);api.note(message,kind);status({state:code==='needs_reauth' || code==='server_not_connected' || code==='selection_required'?'disconnected':'error',busy:false});stop();return;}
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
    if(stopped || job.retired)return;
    cancelRetry(job);job.error=null;mark(job,true);
    var stored=result && result.cache && result.cache.storedAt,checkedAt=typeof stored==='number' && isFinite(stored)?stored:Date.now();
    if(job.accept){mark(job,false);status({state:'connected',busy:busy(),checkedAt:checkedAt});notices();job.accept(result);return;}
    status({state:'connected',checkedAt:checkedAt});
    var chunk=job.chunk,version=job.version,all=[],seen=Object.create(null),stamp=null;
    function pageResult(result){
      if(stopped || job.retired || version!==job.version)return;
      var payload=result && result.payload,at=result && result.cache && result.cache.storedAt;
      all=all.concat(liveStatusJiraIssues(payload));
      if(typeof at==='number' && isFinite(at))stamp=stamp==null?at:Math.max(stamp,at);
      var info=payload && (payload.pageInfo || payload.issues && payload.issues.pageInfo);
      var token=payload && payload.nextPageToken || result && result.nextPageToken || info && info.hasNextPage && info.endCursor;
      if(token){
        if(seen[token]){fail(job,{code:'tool_error',message:'Jira repeated a page cursor'},false);return;}
        seen[token]=true;
        var input=Object.assign({},job.input,{nextPageToken:token});
        Promise.resolve().then(function(){if(!stopped && version===job.version)return mcp.callTool(server,job.tool,input,job.options);}).then(pageResult,function(error){if(!stopped && version===job.version)fail(job,error,true);});
        return;
      }
      // Publish only a complete page chain. A failed refresh keeps all prior evidence.
      if(job.flagged){chunk.flagged=all;chunk.flaggedAt=stamp;chunk.flaggedAnswered=true;}
      else{
        // Expand exactly Initiative -> Epic -> work item. Containers and cycles
        // cannot enter story totals, even when Jira returns unexpected rows.
        chunk.rawIssues=all;chunk.answered=true;chunk.issues=children(chunk,all);chunk.storedAt=stamp;
      }
      mark(job,false);status({busy:busy()});
      dirty=true;syncWatches();publish();notices();
    }
    pageResult(result);
  }
  function runCall(job){
    if(stopped || job.retired)return Promise.resolve();
    var version=++job.version;mark(job,true);status({busy:true});
    return Promise.resolve().then(function(){
      if(stopped || job.retired)return;
      return mcp.callTool(server,job.tool,job.input,job.options);
    }).then(function(result){if(!stopped && version===job.version)accept(job,result);},function(error){if(!stopped && version===job.version)fail(job,error,false);});
  }
  function watch(job){
    if(stopped)return;
    var subscription;mark(job,true);status({busy:true});
    try{
      subscription=mcp.watchTool(server,job.tool,job.input,function(event){
        if(stopped || job.retired || !event)return;
        job.version++;
        if(event.type==='data')accept(job,event.result);
        else if(event.type==='error')fail(job,event.error,true);
      },{refetchInterval:60000});
    }catch(error){fail(job,error,true);return;}
    // A synchronous initial event can retire the adapter before registration
    // returns; an asynchronous registration can finish after destroy as well.
    Promise.resolve(subscription).then(function(value){if(stopped || job.retired)unsubscribe(value);else{job.subscription=value;subscriptions.push(value);}},function(error){fail(job,error,true);});
  }
  function host(url){try{return new URL(url).host;}catch(ex){return null;}}
  function retireChunk(chunk){
    jobs.filter(function(job){return job.chunk===chunk;}).forEach(function(job){
      job.retired=true;job.version++;mark(job,false);cancelRetry(job);
      if(job.subscription){var index=subscriptions.indexOf(job.subscription);if(index>=0)subscriptions.splice(index,1);unsubscribe(job.subscription);job.subscription=null;}
    });
    jobs=jobs.filter(function(job){return job.chunk!==chunk;});
  }
  function children(chunk,all){
    all=all.filter(function(issue){return issue && typeof issue.key==='string' && LIVE_STATUS_JIRA_KEY.test(issue.key);});
    if(chunk.initiative)return all.filter(function(issue){return issue && issue.key!==chunk.initiative && liveStatusJiraKind(issue)==='epic' && initiativeRoots().indexOf(issue.key)<0;});
    if(chunk.epic)return all.filter(function(issue){var kind=liveStatusJiraKind(issue);return issue && issue.key!==chunk.epic && kind!=='epic' && kind!=='initiative' && initiativeRoots().indexOf(issue.key)<0 && (api.refs().epics || []).indexOf(issue.key)<0;});
    return all;
  }
  function initiativeRoots(){
    var roots=api.refs().epics || [],found=[];
    chunks.forEach(function(chunk){if(chunk.roots)chunk.issues.forEach(function(issue){if(roots.indexOf(issue.key)>=0 && liveStatusJiraKind(issue)==='initiative' && found.indexOf(issue.key)<0)found.push(issue.key);});});
    return found;
  }
  function syncWatches(){
    if(stopped || !cloudId)return;
    if(syncing){resync=true;return;}
    syncing=true;
    try{
      do{
        resync=false;
        var refs=api.refs(),configured=refs.epics || [],roots=initiativeRoots(),epics=configured.filter(function(key){return roots.indexOf(key)<0;}),wanted=refs.tickets,added=[];
        chunks.forEach(function(chunk){
          var key=chunk.epic || chunk.initiative;if(configured.indexOf(key)<0)return;
          var initiative=roots.indexOf(key)>=0;
          if(initiative!==!!chunk.initiative){delete chunk.epic;delete chunk.initiative;chunk[initiative?'initiative':'epic']=key;chunk.issues=children(chunk,chunk.rawIssues || []);dirty=true;}
        });
        chunks.forEach(function(chunk){if(chunk.initiative && roots.indexOf(chunk.initiative)>=0)chunk.issues.forEach(function(issue){if(epics.indexOf(issue.key)<0)epics.push(issue.key);});});
        chunks=chunks.filter(function(chunk){
          var keep=chunk.roots?chunk.keys.some(function(key){return configured.indexOf(key)>=0;}):chunk.initiative?roots.indexOf(chunk.initiative)>=0:chunk.epic?epics.indexOf(chunk.epic)>=0:chunk.keys.some(function(key){return wanted.indexOf(key)>=0;});
          if(!keep){retireChunk(chunk);dirty=true;}
          return keep;
        });
        var watched=[],lookedUp=[];chunks.forEach(function(chunk){if(chunk.roots)lookedUp=lookedUp.concat(chunk.keys);else if(!chunk.epic && !chunk.initiative)watched=watched.concat(chunk.keys);});
        liveStatusJiraChunks(wanted.filter(function(key){return watched.indexOf(key)<0;})).forEach(function(keys){added.push({keys:keys});});
        roots.forEach(function(key){if(!chunks.some(function(chunk){return chunk.initiative===key;}))added.push({initiative:key,keys:[]});});
        epics.forEach(function(key){if(!chunks.some(function(chunk){return chunk.epic===key;}))added.push({epic:key,keys:[]});});
        // Root metadata has its own watch: empty parents still have a title and
        // kind. The persisted legacy `epic` setting now accepts either kind.
        liveStatusJiraChunks(configured.filter(function(key){return lookedUp.indexOf(key)<0;})).forEach(function(keys){added.push({roots:true,keys:keys});});
        added.forEach(function(chunk){chunk.answered=false;chunk.flaggedAnswered=!!chunk.roots;chunk.issues=[];chunk.flagged=[];});
        // Register all identities before a watch can synchronously answer.
        chunks=chunks.concat(added);
        added.forEach(function(chunk){
          (chunk.roots?[false]:[false,true]).forEach(function(flagged){
            var job={version:0,chunk:chunk,flagged:flagged,tool:'searchJiraIssuesUsingJql',input:{cloudId:cloudId,jql:(chunk.initiative || chunk.epic?'parent = '+(chunk.initiative || chunk.epic):'key in ('+chunk.keys.join(', ')+')')+(flagged?' AND Flagged = Impediment':''),fields:['summary','status','assignee','updated','issuelinks','parent','issuetype'],maxResults:10}};
            jobs.push(job);watch(job);
          });
        });
      }while(resync && !stopped);
      if(github)github.sync();
    }finally{syncing=false;}
    publish();
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
      // GitHub is optional and also chosen by offered tools. "GitHub" is only a tie-break.
      var githubServers=[];
      listed.forEach(function(candidate){
        var name=candidate && (candidate.server || candidate.name),tools=candidate && candidate.tools;
        if(typeof name!=='string' || !name || !Array.isArray(tools))return;
        var offered=tools.map(function(tool){return typeof tool==='string'?tool:tool && tool.name;});
        if(LIVE_STATUS_GITHUB_TOOLS.every(function(tool){return offered.indexOf(tool)>=0;}) && githubServers.indexOf(name)<0)githubServers.push(name);
      });
      if(githubServers.length)github=createLiveStatusGithub(mcp,githubServers.indexOf('GitHub')>=0?'GitHub':githubServers[0],page,api,win,{
        changed:function(){if(chunks.some(function(chunk){return chunk.answered;})){dirty=true;publish();}},
        status:function(value){status({github:value});}
      });
      else if(liveStatusGithubWanted(page,api))status({github:{state:'disconnected',busy:false}});
      var job={version:0,tool:'getAccessibleAtlassianResources',input:{},options:{cache:{staleTime:300000}},accept:resources,inflight:true};jobs.push(job);mark(discovery,false);
      // Initial resource lookup may retry once. All subsequent call failures
      // (including explicit approval) end here rather than recursively retry.
      var version=++job.version;
      return Promise.resolve().then(function(){if(!stopped)return mcp.callTool(server,job.tool,job.input,job.options);}).then(function(result){if(!stopped && version===job.version){job.error=null;mark(job,false);resources(result);}},function(error){fail(job,error,true);});
    },function(error){fail(discovery,error,false);});
  },function(){status({state:'disconnected',busy:false});stop();return null;});
}

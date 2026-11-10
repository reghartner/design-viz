#!/usr/bin/env node
'use strict';
/* live-snapshot.js — write a snapshot of a board's real Jira status and metrics (#1265).

   Usage:
     node tools/live-snapshot.js <board.spec.json> [--out <file>] [--timeout <seconds>]

   The Workbench never calls Jira or a metrics provider. An agent runs this script instead; the
   Workbench then shows the snapshot as it shows Demo live status. The script runs the viewer's
   own Jira, Grafana and Honeycomb adapters (src/viewer/live-status-claude.js, telemetry-claude.js,
   telemetry-honeycomb.js) on a
   headless copy of the board, so it makes the calls the viewer makes. Each connector tool call
   goes to the provider's REST API instead of a claude.ai connector:

     Jira     searchJiraIssuesUsingJql  POST {JIRA_SITE}/rest/api/3/search/jql
              getJiraIssue              GET  {JIRA_SITE}/rest/api/3/issue/{key}
     Grafana  query_prometheus          GET  {GRAFANA_URL}/api/datasources/proxy/uid/{uid}/api/v1/query_range
              query_loki_logs           GET  {GRAFANA_URL}/api/datasources/proxy/uid/{uid}/loki/api/v1/query_range
              get_annotations           GET  {GRAFANA_URL}/api/annotations
              query_sql, query_cloudwatch  POST {GRAFANA_URL}/api/ds/query (#1270)
     Honeycomb run_query                POST {HONEYCOMB_API_URL}/1/queries/{dataset}, POST /1/query_results/{dataset},
                                        then GET /1/query_results/{dataset}/{id} until complete (#1270)

   Credentials come from the environment and are never written: JIRA_EMAIL and JIRA_API_TOKEN
   (Atlassian Cloud basic auth; the site is the board's tracking.jira.site, or JIRA_SITE);
   GRAFANA_URL and GRAFANA_TOKEN (a service account token); HONEYCOMB_API_KEY (HONEYCOMB_API_URL defaults
   to https://api.honeycomb.io). A missing variable is named in the output and that provider is skipped.

   The snapshot (default <board>.snapshot.json next to the board; `*.snapshot.json` is ignored by
   git; the script refuses any path inside a git work tree that git does not ignore) is one day of the demo story format (src/viewer/live-status-demo.js) plus `snapshotAt`.
   Provider responses never reach stdout: the script prints exactly one summary line. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {entrypoint}=require('./source-loader.cjs');

const SNAPSHOT_KIND='flowview-live-snapshot';
const JIRA_TOOLS=['getAccessibleAtlassianResources','searchJiraIssuesUsingJql','getJiraIssue'];
// Every tool the viewer's Grafana adapter may ask for; the ones this script cannot serve fail per call.
const GRAFANA_TOOLS=['query_prometheus','query_loki_logs','query_sql','query_cloudwatch','query_cloudwatch_logs','get_annotations'];
const MAX_SLOTS=2000;

/* A DOM just large enough for the live-status controller to run without painting anything. */
class Node{
  constructor(tag){this.tagName=tag;this.attrs={};this.children=[];this.hidden=false;this.isConnected=true;this.style={setProperty(){},removeProperty(){},getPropertyValue(){return '';}};
    const self=this;this.classList={contains:c=>(self.attrs.class || '').split(' ').includes(c),add(...c){self.attrs.class=[...new Set((self.attrs.class || '').split(' ').filter(Boolean).concat(c))].join(' ');},remove(...c){self.attrs.class=(self.attrs.class || '').split(' ').filter(x=>!c.includes(x)).join(' ');},toggle(){return false;}};}
  get className(){return this.attrs.class || '';}set className(v){this.attrs.class=v;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return Object.prototype.hasOwnProperty.call(this.attrs,k)?this.attrs[k]:null;}removeAttribute(k){delete this.attrs[k];}
  appendChild(el){this.children.push(el);el.parentNode=el.parentElement=this;return el;}insertBefore(el){return this.appendChild(el);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}replaceChildren(...els){this.children=[];els.forEach(el=>this.appendChild(el));}
  querySelectorAll(){return [];}querySelector(){return null;}closest(){return null;}contains(el){return el===this;}
  addEventListener(){}removeEventListener(){}dispatchEvent(){}getBoundingClientRect(){return {left:0,top:0,right:0,bottom:0,width:0,height:0};}focus(){}
}
function headlessDocument(){
  const doc=new Node('#document');Object.assign(doc,{createElement:t=>new Node(t),createElementNS:(_,t)=>new Node(t),body:new Node('body'),documentElement:new Node('html'),
    getElementById:()=>null,visibilityState:'visible',hidden:false});return doc;
}

/* The viewer runtime (standalone entrypoint) in its own context. */
function loadRuntime(win,doc){
  const C={URL,console:{log(){},info(){},warn(){},error(){},debug(){}},AbortController,TextEncoder,TextDecoder,document:doc,window:win,
    setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
    MutationObserver:class{observe(){}disconnect(){}}};
  vm.runInNewContext(entrypoint('standalone').body,C);return C;
}

/* `now-24h`, `now`, an ISO time or epoch ms/s as epoch milliseconds. */
function parseTime(value,now){
  if(typeof value==='number' && isFinite(value))return value<1e12?value*1000:value;
  const text=String(value==null?'now':value).trim(),rel=/^now(?:-(\d+)([smhdw]))?$/.exec(text);
  if(rel){const unit={s:1e3,m:6e4,h:36e5,d:864e5,w:6048e5}[rel[2] || 's'];return now-(rel[1]?Number(rel[1])*unit:0);}
  const at=Date.parse(text);return isFinite(at)?at:now;
}
function failure(message){return {code:'tool_error',message:String(message)};}
async function readJson(response,what){
  const text=await response.text();
  if(response.status===429){
    // The viewer's adapter retries a rate-limited call once after retryAfterMs (capped here at 10 s).
    const wait=response.headers && response.headers.get && response.headers.get('retry-after'),seconds=Number(wait);
    throw {code:'rate_limited',retryAfterMs:isFinite(seconds) && seconds>=0?Math.min(10000,seconds*1000):5000,message:what+' is rate limited (HTTP 429'+(wait?', retry after '+String(wait).slice(0,40):'')+')'};
  }
  if(!response.ok)throw failure(what+' answered HTTP '+response.status);
  try{return JSON.parse(text);}catch(ex){throw failure(what+' did not answer JSON');}
}

/* Credentials go only to a host the agent's environment names (JIRA_SITE, GRAFANA_URL) or, for Jira, to the
   board's own site when it is an https Atlassian Cloud host. Plain http, and a URL holding a user name or
   password, are refused: a board authored by someone else cannot direct an agent's token anywhere. */
function providerBase(value){
  let url;try{url=new URL(String(value).trim());}catch(ex){return {error:'is not a URL'};}
  if(url.protocol!=='https:')return {error:'must use https'};
  if(url.username || url.password)return {error:'must not contain a user name or password'};
  if(url.search || url.hash)return {error:'must not contain a query or fragment'};
  return {base:(url.origin+url.pathname).replace(/\/+$/,'')};
}
function atlassianCloud(value){try{const url=new URL(String(value));return url.protocol==='https:' && !url.username && !url.password && /\.atlassian\.net$/i.test(url.hostname);}catch(ex){return false;}}
const REQUEST_MS=30000,HONEYCOMB_MAX_SECONDS=7*86400;
// An ordinary tool error to the viewer's adapter, which then fails only that signal; `unsupported` keeps it out of
// the recorded errors, since takeSnapshot records one error per unread signal itself.
function unsupported(message){return {code:'tool_error',unsupported:true,message:String(message)};}
/* A Grafana or Honeycomb failure as one signal's tool error: their adapters fail only that signal on a tool error and
   stop the whole refresh on anything else. Rate limits, network errors, request timeouts and unreadable answers
   all become tool errors; the run's own abort stays as it is. Only fixed text is recorded, never provider text. */
function perSignal(error,what,signal){
  if(signal && signal.aborted)return error;
  if(error && error.code==='rate_limited')return failure(error.message);
  if(error && typeof error.code==='string')return error;
  const name=error && error.name;
  if(name==='TimeoutError')return failure(what+' did not answer within '+Math.round(REQUEST_MS/1000)+' s');
  if(name==='SyntaxError')return failure(what+' did not answer JSON');
  return failure(what+' could not be reached');
}

/* REST transports built from the environment. `missing` names each variable a provider lacks, `refused` each
   one the URL rules refuse; `secrets` are the values every printed or recorded message is scrubbed of. */
// `boardSite` is the board's tracking.jira.site: the site the viewer matches.
// `options.pollMs` bounds one Honeycomb query's polling.
function restTransport(env,fetchImpl,now,boardSite,options){
  options=options || {};
  const fetcher=fetchImpl || globalThis.fetch,servers=[],missing=[],refused=[],handlers=Object.create(null);
  const set=name=>!!(env[name] && String(env[name]).trim()),need=names=>names.filter(name=>!set(name));
  const secrets=['JIRA_API_TOKEN','GRAFANA_TOKEN','GITHUB_TOKEN','HONEYCOMB_API_KEY','JIRA_EMAIL'].filter(set).map(name=>String(env[name]));
  if(set('JIRA_EMAIL') && set('JIRA_API_TOKEN'))secrets.push(Buffer.from(env.JIRA_EMAIL+':'+env.JIRA_API_TOKEN).toString('base64'));
  // Every request ends: the run's signal (aborted when the snapshot is written) or 30 s, whichever is first.
  const request=(url,options,signal)=>fetcher(url,Object.assign({},options,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(REQUEST_MS)]):AbortSignal.timeout(REQUEST_MS),redirect:'error'}));
  let site=null,jiraMissing=need(['JIRA_EMAIL','JIRA_API_TOKEN']);
  if(set('JIRA_SITE')){const checked=providerBase(env.JIRA_SITE);if(checked.error)refused.push({provider:'jira',message:'JIRA_SITE '+checked.error});else site=checked.base;}
  else if(boardSite && atlassianCloud(boardSite))site=providerBase(boardSite).base;
  else jiraMissing=['JIRA_SITE'].concat(jiraMissing);
  if(!site && !jiraMissing.includes('JIRA_SITE') && !refused.some(r=>r.provider==='jira'))jiraMissing.unshift('JIRA_SITE');
  if(jiraMissing.length)missing.push({provider:'jira',variables:jiraMissing,note:!set('JIRA_SITE') && boardSite && !atlassianCloud(boardSite)?'the board\'s site is not an https *.atlassian.net host, so credentials are not sent to it':''});
  else if(site){
    const shown=String(boardSite || site).replace(/\/+$/,''),auth='Basic '+Buffer.from(env.JIRA_EMAIL+':'+env.JIRA_API_TOKEN).toString('base64');
    const headers={Authorization:auth,Accept:'application/json','Content-Type':'application/json'};
    servers.push({server:'Jira REST',tools:JIRA_TOOLS.map(name=>({name}))});
    handlers['Jira REST']=async(tool,input,signal)=>{
      if(tool==='getAccessibleAtlassianResources')return [{id:'rest',url:shown,name:'Jira REST'}];
      if(tool==='searchJiraIssuesUsingJql'){
        const body={jql:input.jql,fields:input.fields,maxResults:input.maxResults};if(input.nextPageToken)body.nextPageToken=input.nextPageToken;
        return readJson(await request(site+'/rest/api/3/search/jql',{method:'POST',headers,body:JSON.stringify(body)},signal),'Jira search');
      }
      if(tool==='getJiraIssue'){
        const query=new URLSearchParams();if(Array.isArray(input.fields))query.set('fields',input.fields.join(','));if(input.expand)query.set('expand',String(input.expand));
        return readJson(await request(site+'/rest/api/3/issue/'+encodeURIComponent(input.issueIdOrKey)+'?'+query,{headers},signal),'Jira issue');
      }
      throw unsupported(tool+' is not available in the snapshot script');
    };
  }
  const grafanaMissing=need(['GRAFANA_URL','GRAFANA_TOKEN']);let grafana=null;
  if(set('GRAFANA_URL')){const checked=providerBase(env.GRAFANA_URL);if(checked.error)refused.push({provider:'grafana',message:'GRAFANA_URL '+checked.error});else grafana=checked.base;}
  if(grafanaMissing.length)missing.push({provider:'grafana',variables:grafanaMissing});
  else if(grafana){
    const base=grafana,headers={Authorization:'Bearer '+env.GRAFANA_TOKEN,Accept:'application/json'};
    const get=async(route,params,what,signal)=>readJson(await request(base+route+'?'+new URLSearchParams(params),{headers},signal),what);
    const range=input=>({start:parseTime(input.startTime || input.startRfc3339 || 'now-1h',now()),end:parseTime(input.endTime || input.endRfc3339 || 'now',now())});
    servers.push({server:'Grafana REST',tools:GRAFANA_TOOLS.map(name=>({name}))});
    let prometheusLoki=null;
    // A datasource uid is one path segment: anything else could reach another Grafana route with the token.
    const uidOf=value=>{const uid=String(value==null?'':value);if(!/^[A-Za-z0-9._-]+$/.test(uid) || uid==='.' || uid==='..')throw failure('datasource uid "'+uid.slice(0,40)+'" is not valid');return uid;};
    /* /api/ds/query (SQL and CloudWatch): one query, refId A. A query error comes back in results.A.error,
       usually with HTTP 400. It is recorded as a fixed message with the status: the provider's text can hold
       data and must not reach the one printed line. */
    const dsQuery=async(uid,query,from,to,what,signal)=>{
      const response=await request(base+'/api/ds/query',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},headers),
        body:JSON.stringify({from:String(from),to:String(to),queries:[Object.assign({refId:'A',datasource:{uid}},query)]})},signal);
      const text=await response.text();let answer=null;try{answer=JSON.parse(text);}catch(ex){answer=null;}
      const result=answer && answer.results && answer.results.A;
      if(result && result.error)throw failure(what+' query error (HTTP '+response.status+')');
      if(response.status===429)throw failure(what+' is rate limited (HTTP 429)');
      if(!response.ok)throw failure(what+' answered HTTP '+response.status);
      if(!result)throw failure(what+' returned no result');
      return Array.isArray(result.frames)?result.frames:[];
    };
    const columns=frame=>{const fields=frame && frame.schema && Array.isArray(frame.schema.fields)?frame.schema.fields:[],values=frame && frame.data && Array.isArray(frame.data.values)?frame.data.values:[];return {fields,values};};
    const grafanaCall=async(tool,input,signal)=>{
      if(tool==='query_sql'){
        const uid=uidOf(input.datasourceUid),r={start:parseTime(input.start || 'now-24h',now()),end:parseTime(input.end || 'now',now())};
        const frames=await dsQuery(uid,{rawSql:String(input.query || ''),format:'table',rawQuery:true},r.start,r.end,'Grafana SQL',signal);
        // query_sql's rows: one object per row, keyed by column name.
        const {fields,values}=columns(frames[0]),rows=[],length=values.length?values[0].length:0;
        for(let i=0;i<length;i++){const row={};fields.forEach((field,j)=>{row[field.name || 'column'+j]=values[j]?values[j][i]:null;});rows.push(row);}
        return {rows};
      }
      if(tool==='query_cloudwatch'){
        const uid=uidOf(input.datasourceUid),r={start:parseTime(input.start,now()),end:parseTime(input.end,now())},dimensions={};
        Object.keys(input.dimensions || {}).forEach(key=>{const value=input.dimensions[key];dimensions[key]=Array.isArray(value)?value.map(String):[String(value)];});
        const query={type:'timeSeriesQuery',queryMode:'Metrics',metricQueryType:0,metricEditorMode:0,namespace:input.namespace,metricName:input.metricName,region:input.region,
          dimensions,statistic:input.statistic,period:String(input.period || 300),matchExact:true,id:'',expression:'',label:''};
        if(input.accountId)query.accountId=String(input.accountId);
        const frames=await dsQuery(uid,query,r.start,r.end,'Grafana CloudWatch',signal);
        // query_cloudwatch's answer: one series as {values, timestamps (epoch ms)}.
        const series=frames.filter(frame=>columns(frame).values.length>=2);
        if(!series.length)return {status:'success',values:[],timestamps:[]};
        if(series.length>1)throw failure('Grafana CloudWatch returned '+series.length+' series; set dimensions that select one');
        const {fields,values}=columns(series[0]),time=fields.findIndex(f=>f.type==='time'),numbers=fields.map((f,i)=>i!==time && f.type==='number'?i:-1).filter(i=>i>=0),value=numbers[0];
        if(time<0 || !numbers.length)throw failure('Grafana CloudWatch returned no time and value columns');
        if(numbers.length>1)throw failure('Grafana CloudWatch returned '+numbers.length+' value columns; set dimensions that select one');
        const timestamps=values[time].map(t=>typeof t==='string'?Date.parse(t):Number(t));
        return {status:'success',values:values[value],timestamps};
      }
      return prometheusLoki(tool,input,signal);
    };
    handlers['Grafana REST']=async(tool,input,signal)=>{
      // A rate-limited Grafana call fails only its signal: the Grafana adapter does not retry, and treats any other code as fatal.
      try{return await grafanaCall(tool,input,signal);}catch(error){throw perSignal(error,'Grafana',signal);}
    };
    prometheusLoki=async(tool,input,signal)=>{
      if(tool==='query_prometheus'){
        const uid=uidOf(input.datasourceUid),r=range(input),proxy='/api/datasources/proxy/uid/'+uid+'/api/v1/';
        if(input.queryType==='instant')return get(proxy+'query',{query:input.expr,time:String(r.end/1000)},'Grafana Prometheus',signal);
        return get(proxy+'query_range',{query:input.expr,start:String(r.start/1000),end:String(r.end/1000),step:String(input.stepSeconds || 60)},'Grafana Prometheus',signal);
      }
      if(tool==='query_loki_logs'){
        const uid=uidOf(input.datasourceUid),r=range(input),params={query:input.logql,start:String(r.start*1e6),end:String(r.end*1e6),limit:String(input.limit || 100)};
        if(input.stepSeconds)params.step=String(input.stepSeconds);
        const answer=await get('/api/datasources/proxy/uid/'+uid+'/loki/api/v1/query_range',params,'Grafana Loki',signal);
        // The connector answers {data: [series]}; Loki answers {data: {result: [series]}}.
        return {data:answer && answer.data && Array.isArray(answer.data.result)?answer.data.result:[]};
      }
      if(tool==='get_annotations'){
        const params={};['type','limit','dashboardUid','panelId','tags'].forEach(key=>{if(input[key]!=null)params[key]=String(input[key]);});
        if(input.from!=null)params.from=String(parseTime(input.from,now()));if(input.to!=null)params.to=String(parseTime(input.to,now()));
        return get('/api/annotations',params,'Grafana annotations',signal);
      }
      // Recorded once per signal by takeSnapshot, not per call.
      throw unsupported(tool+' is not supported by the snapshot script yet');
    };
  }
  /* Honeycomb Query API: create the query, run it, poll the result. The key's environment must be the
     board's tracking.telemetry.honeycomb.environment (checked once through /1/auth). */
  let honeycomb=null,pollMs=20000;
  if(set('HONEYCOMB_API_URL')){const checked=providerBase(env.HONEYCOMB_API_URL);if(checked.error)refused.push({provider:'honeycomb',message:'HONEYCOMB_API_URL '+checked.error});else honeycomb=checked.base;}
  else honeycomb='https://api.honeycomb.io';
  if(!set('HONEYCOMB_API_KEY'))missing.push({provider:'honeycomb',variables:['HONEYCOMB_API_KEY']});
  else if(honeycomb){
    const base=honeycomb,headers={'X-Honeycomb-Team':String(env.HONEYCOMB_API_KEY),Accept:'application/json','Content-Type':'application/json'};pollMs=Math.max(1000,Number(options.pollMs) || 20000);
    const call=async(route,body,what,signal)=>readJson(await request(base+route,body===undefined?{headers}:{method:'POST',headers,body:JSON.stringify(body)},signal),what);
    let auth=null;
    const environment=signal=>auth || (auth=call('/1/auth',undefined,'Honeycomb auth',signal).then(a=>a && a.environment && typeof a.environment.slug==='string'?a.environment.slug:null,error=>{auth=null;throw error;}));
    servers.push({server:'Honeycomb REST',tools:[{name:'run_query',inputSchema:{type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:'string'},query_spec:{type:'object'}},required:['environment_slug','query_spec']}}]});
    handlers['Honeycomb REST']=async(tool,input,signal)=>{
      try{
        if(tool!=='run_query')throw unsupported(tool+' is not available in the snapshot script');
        const slug=await environment(signal);
        if(slug && input.environment_slug && slug!==input.environment_slug)throw failure('HONEYCOMB_API_KEY belongs to environment "'+slug+'", but the board names "'+input.environment_slug+'"');
        // A dataset slug is one path segment, like a Grafana uid.
        const datasetSlug=String(input.dataset_slug || '__all__');
        if(!/^[A-Za-z0-9._-]+$/.test(datasetSlug) || datasetSlug==='.' || datasetSlug==='..')throw failure('Honeycomb dataset "'+datasetSlug.slice(0,40)+'" is not valid');
        const spec=typeof input.query_spec==='string'?JSON.parse(input.query_spec):Object.assign({},input.query_spec),dataset=encodeURIComponent(datasetSlug);
        // The connector's relative `from` ("-24h") or absolute from/to become the REST time range.
        const relative=typeof spec.from==='string' && /^-(\d+)([smhdw])$/.exec(spec.from);
        if(relative)spec.time_range=Number(relative[1])*{s:1,m:60,h:3600,d:86400,w:604800}[relative[2]];
        else if(spec.from!=null){spec.start_time=Math.floor(parseTime(spec.from,now())/1000);spec.end_time=Math.floor(parseTime(spec.to==null?'now':spec.to,now())/1000);}
        delete spec.from;delete spec.to;
        // Honeycomb answers a query over more than 7 days with HTTP 400; say why instead.
        const span=spec.time_range!=null?spec.time_range:spec.end_time-spec.start_time;
        if(span>HONEYCOMB_MAX_SECONDS)throw failure('Honeycomb queries cover at most 7 days; the board window is '+Math.round(span/86400)+' d');
        const query=await call('/1/queries/'+dataset,spec,'Honeycomb query',signal);
        if(!query || typeof query.id!=='string')throw failure('Honeycomb query returned no id');
        // Honeycomb allows 10 query-result creations a minute; past that each signal fails alone and says why.
        let result=await call('/1/query_results/'+dataset,{query_id:query.id,disable_series:false},'Honeycomb query result',signal).catch(error=>{
          if(error && error.code==='rate_limited')throw failure('Honeycomb query result is rate limited (HTTP 429; Honeycomb allows 10 query results a minute)');throw error;});
        const started=Date.now();
        while(!(result && result.complete===true)){
          if(!result || typeof result.id!=='string')throw failure('Honeycomb query result returned no id');
          if(Date.now()-started>=pollMs)throw failure('Honeycomb query did not complete within '+Math.round(pollMs/1000)+' s');
          await new Promise(resolve=>setTimeout(resolve,500));
          result=await call('/1/query_results/'+dataset+'/'+encodeURIComponent(result.id),undefined,'Honeycomb query result',signal);
        }
        // A failed query answers HTTP 200, complete:true and an `error` string where `data` would be (docs.honeycomb.io
        // /api/query-data/get-query-result). Only fixed text is recorded: the provider's message can hold data.
        if(result.error!=null)throw failure('Honeycomb query failed (complete with an error)');
        if(!result.data || typeof result.data!=='object')throw failure('Honeycomb query answered no data');
        // The docs show result keys as OP(column) (COUNT, P99(duration_ms)) and give no rule for a calculation's
        // `name`, so a named calculation's value is also copied to its name, which the viewer's adapter looks up.
        const calc=Array.isArray(spec.calculations) && spec.calculations.length===1?spec.calculations[0]:null;
        const opKey=calc && typeof calc.op==='string'?calc.op+(calc.column?'('+calc.column+')':''):null,alias=calc && typeof calc.name==='string' && calc.name?calc.name:null;
        const named=data=>{const out=Object.assign({},data);if(alias && opKey && !Object.prototype.hasOwnProperty.call(out,alias) && Object.prototype.hasOwnProperty.call(out,opKey))out[alias]=out[opKey];return out;};
        // Series rows are {time, data} with time beside data (the same page); run_query's raw rows carry time inside data.
        const data=result.data,series=(Array.isArray(data.series)?data.series:[]).map(row=>({data:Object.assign(named(row && row.data),{time:row && row.time})}));
        let granularity=Number(spec.granularity);
        if(!(granularity>0)){const times=series.map(row=>Date.parse(row.data.time)).filter(isFinite).sort((a,b)=>a-b);for(let i=1;i<times.length;i++){const gap=(times[i]-times[i-1])/1000;if(gap>0 && (!(granularity>0) || gap<granularity))granularity=gap;}}
        /* The REST answer's shape (docs.honeycomb.io/api/query-data/get-query-result, and Honeycomb's Go client,
           terraform-provider-honeycombio client/query_result.go): data.series rows {time, data}, data.results rows
           {data}, and no header, info or granularity field. The granularity is the query's, or the series
           spacing. run_query's raw result keeps time inside data. */
        const raw={results:(Array.isArray(data.results)?data.results:[]).map(row=>({data:named(row && row.data)})),series};
        if(granularity>0 && Number.isSafeInteger(granularity))raw.info={granularity_seconds:granularity};
        return raw;
      }catch(error){
        throw perSignal(error,'Honeycomb',signal);
      }
    };
  }
  return {servers:()=>servers,missing,refused,secrets,
    // The viewer's Honeycomb adapter runs its queries one after another: each one's polling gets its share of the run.
    shareHoneycomb:(timeoutMs,count)=>{if(count>0)pollMs=Math.max(1000,Math.min(pollMs,Math.floor(timeoutMs*0.8/count)));},
    call:(server,tool,input,signal)=>{const handler=handlers[server];if(!handler)return Promise.reject(failure('No server '+server));return handler(tool,input || {},signal);}};
}

/* An MCP JSON-RPC handler per server ({name: handleMcp}), for the mock connectors in tests. */
function mcpHandlerTransport(handlers,env){
  let id=0;const servers=Object.keys(handlers).map(name=>({server:name,tools:handlers[name]({jsonrpc:'2.0',id:++id,method:'tools/list'},env || {}).result.tools}));
  return {servers:()=>servers,missing:[],refused:[],secrets:[],call:async(server,tool,input)=>{
    const answer=handlers[server]({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name:tool,arguments:input || {}}},env || {});
    if(answer.error)throw failure(answer.error.message);
    return answer.result.structuredContent!==undefined?answer.result.structuredContent:answer.result;
  }};
}

/* The connector namespace the adapters expect, over a transport. A watch answers once: a snapshot never polls. */
function providerOf(server){return /grafana/i.test(server)?'grafana':/honeycomb/i.test(server)?'honeycomb':'jira';}
// A failed call is recorded under its call key; the same call answering later (the adapter's retry) removes it.
function connectorNamespace(transport,errors,signal,answered){
  const call=(server,tool,input)=>{
    const key=server+'\u0000'+tool+'\u0000'+JSON.stringify(input || {});
    return Promise.resolve().then(()=>transport.call(server,tool,input,signal)).then(payload=>{
      for(let i=errors.length-1;i>=0;i--)if(errors[i].key===key)errors.splice(i,1);
      if(answered){const source=providerOf(server);answered[source]=(answered[source] || 0)+1;}
      return {payload};
    },error=>{
      if(!(error && error.unsupported) && !(signal && signal.aborted))errors.push({source:providerOf(server),tool,message:String(error && error.message || error),key,input});throw error;});
  };
  return {
    listTools:()=>Promise.resolve(transport.servers()),
    callTool:(server,tool,input)=>call(server,tool,input),
    watchTool:(server,tool,input,handler)=>{let stopped=false;call(server,tool,input).then(result=>{if(!stopped)handler({type:'data',result});},error=>{if(!stopped)handler({type:'error',error});});return ()=>{stopped=true;};}
  };
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const GRAFANA_SOURCES=['grafana','loki','sql','cloudwatch','cloudwatchLogs'];
// The same text for a bound signal and for the connector call it makes, to name the signal a failed call belongs to.
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value && typeof value==='object'){const out={};Object.keys(value).sort().forEach(key=>{out[key]=canonical(value[key]);});return out;}return value;}
function honeycombKey(query){const q=Object.assign({},query);['from','to','start','end','start_time','end_time','time_range'].forEach(key=>delete q[key]);return 'h:'+JSON.stringify(canonical(q));}
function signalFingerprint(signal){
  const q=signal && signal.query;
  if(signal.source==='grafana' || signal.source==='loki' || signal.source==='sql')return typeof q==='string'?signal.source[0]+':'+q:null;
  if(signal.source==='cloudwatch')return q && typeof q==='object'?'c:'+JSON.stringify(canonical([q.namespace,q.metric,q.region,q.dimensions || {}])):null;
  if(signal.source==='honeycomb')return q && typeof q==='object'?honeycombKey(q):null;
  return null;
}
function callFingerprint(tool,input){
  if(!input)return null;
  if(tool==='query_prometheus')return 'g:'+input.expr;
  if(tool==='query_loki_logs')return 'l:'+input.logql;
  if(tool==='query_sql')return 's:'+input.query;
  if(tool==='query_cloudwatch')return 'c:'+JSON.stringify(canonical([input.namespace,input.metricName,input.region,input.dimensions || {}]));
  if(tool==='run_query'){try{return honeycombKey(typeof input.query_spec==='string'?JSON.parse(input.query_spec):input.query_spec || {});}catch(ex){return null;}}
  return null;
}

/* Runs the viewer's adapters on a headless copy of the board and returns {snapshot, summary}. */
// Signal sources the REST transport reads; every other bound signal is recorded as one error.
const READ_SOURCES=['grafana','loki','sql','cloudwatch','honeycomb'];
// A copy of `text` with every secret replaced: nothing printed or written may carry one.
// Also the URL-encoded forms of each secret (a token or a base64 value in a query string or a path).
function scrub(text,secrets){
  let out=String(text);const forms=new Set();
  (secrets || []).filter(s=>s && s.length>=4).forEach(secret=>{
    const encoded=encodeURIComponent(secret);
    [secret,encoded,encoded.replace(/%[0-9A-F]{2}/g,m=>m.toLowerCase()),encodeURI(secret)].forEach(form=>forms.add(form));
  });
  [...forms].sort((a,b)=>b.length-a.length).forEach(form=>{out=out.split(form).join('***');});
  return out.replace(/(Basic|Bearer)\s+[A-Za-z0-9+/=._%-]{8,}/g,'$1 ***');
}
async function takeSnapshot({specText,board='board',transport,now=()=>Date.now(),timeoutMs=60000}){
  const run=new AbortController(),errors=[],answered={jira:0,grafana:0,honeycomb:0},doc=headlessDocument(),namespace=connectorNamespace(transport,errors,run.signal,answered);
  try{return await snapshotRun({specText,board,transport,now,timeoutMs,errors,doc,namespace,answered});}
  finally{run.abort();}
}
async function snapshotRun({specText,board,transport,now,timeoutMs,errors,doc,namespace,answered}){
  const win={document:doc,setTimeout,clearTimeout,setInterval,clearInterval,location:{href:'file:///snapshot',pathname:'/snapshot'},addEventListener(){},removeEventListener(){},
    claude:{use:name=>Promise.resolve(name==='mcp'?namespace:null)}};
  const C=loadRuntime(win,doc),page=C.normalize(JSON.parse(specText)),view=new Node('div');view.ownerDocument=doc;
  // Imported carriers carry tickets and signals the script cannot resolve yet: refuse rather than miss them.
  const imports=C.sectionRecords(page).filter(record=>{const d=record.section && record.section.diagram;return d && Array.isArray(d.topologyImports) && d.topologyImports.length;});
  if(imports.length)return {refused:'the board imports shared topology (topologyImports in section '+imports.map(r=>r.number).join(', ')+'), which the snapshot script does not resolve yet'};
  const sections=C.sectionRecords(page).map(record=>({sectionEl:view.appendChild(new Node('section')),reference:record.reference,number:record.number}));
  const ctl={view,page,sections},providers=typeof C.createTelemetryProviders==='function'?C.createTelemetryProviders(page,win):null;
  const api=ctl.liveStatus=C.createLiveStatus(ctl,page,{},providers?{telemetry:providers.options}:{});
  const refs=api.refs(),wantsJira=!!(refs.tickets.length || refs.epics.length);
  const boundSources=new Set();ctl.telemetry.bindings().forEach(b=>Object.keys(b.signals).forEach(name=>boundSources.add(b.signals[name].source)));
  // A provider's missing or refused variables are named only when the board binds a signal it reads.
  const grafanaBound=GRAFANA_SOURCES.some(source=>boundSources.has(source)),honeycombBound=boundSources.has('honeycomb');
  const wanted=provider=>provider==='jira'?wantsJira:provider==='honeycomb'?honeycombBound:provider==='grafana'?grafanaBound:true;
  transport.missing.forEach(m=>{if(!wanted(m.provider))return;errors.push({source:m.provider,tool:null,message:m.variables.join(', ')+(m.variables.length>1?' are':' is')+' not set'+(m.note?' ('+m.note+')':'')});});
  (transport.refused || []).forEach(r=>{if(!wanted(r.provider))return;errors.push({source:r.provider,tool:null,message:r.message+'; no request was made'});});
  const hasServer=name=>transport.servers().some(s=>s.server===name);
  if(typeof transport.shareHoneycomb==='function'){let count=0;ctl.telemetry.bindings().forEach(b=>Object.keys(b.signals).forEach(name=>{if(b.signals[name].source==='honeycomb')count++;}));transport.shareHoneycomb(timeoutMs,count);}
  const hasJira=wantsJira && transport.servers().some(s=>s.tools.some(t=>(t.name || t)==='searchJiraIssuesUsingJql'));
  const hasMetrics=!!providers && transport.servers().some(s=>s.tools.some(t=>['query_prometheus','run_query'].indexOf(t.name || t)>=0));
  if(hasJira)C.wireLiveStatusClaude(ctl,page,win);
  if(hasMetrics){providers.attach(ctl,page);await sleep(0);api.setMetricsEnabled(true);}
  const started=Date.now();
  const jiraDone=()=>{const c=api.snapshot().connection;return !hasJira || !c.busy && c.state!=='connecting';};
  const metricsDone=()=>{if(!hasMetrics)return true;const s=ctl.telemetry.status();return !s.busy && (!!s.refreshedAt || s.state==='error' || s.state==='absent' || s.state==='approval');};
  while(!(jiraDone() && metricsDone()) && Date.now()-started<timeoutMs)await sleep(20);
  const timedOut=!(jiraDone() && metricsDone());
  // Every provider still busy at the deadline is named.
  if(!jiraDone())errors.push({source:'jira',tool:null,message:'no answer within '+Math.round(timeoutMs/1000)+' s'});
  const metricsSources=[grafanaBound && hasServer('Grafana REST')?'grafana':null,honeycombBound && hasServer('Honeycomb REST')?'honeycomb':null].filter(Boolean);
  if(!metricsDone())metricsSources.forEach(source=>errors.push({source,tool:null,message:'no answer within '+Math.round(timeoutMs/1000)+' s'}));
  const live=api.snapshot(),evidence=hasMetrics?ctl.telemetry.snapshot():{map:{}};
  if(hasJira && live.note && live.note.text && live.note.kind!=='info')errors.push({source:'jira',tool:null,message:live.note.text});
  const metricsNote=hasMetrics && ctl.telemetry.status().note;if(metricsNote && ctl.telemetry.status().state==='error')errors.push({source:metricsSources.length===1?metricsSources[0]:'metrics',tool:null,message:metricsNote});
  const bindings=ctl.telemetry.bindings();
  bindings.forEach(b=>Object.keys(b.signals).forEach(name=>{
    const signal=b.signals[name];
    // One error per signal the script does not read (Grafana SQL and CloudWatch, Honeycomb, …).
    const source=signal.source==='honeycomb'?'honeycomb':'grafana';
    if(READ_SOURCES.indexOf(signal.source)<0){errors.push({source,tool:b.id+' '+name,message:signal.source+' signals are not read by the snapshot script yet'});return;}
    if(hasMetrics && signal.error)errors.push({source,tool:b.id+' '+name,message:String(signal.error)});
  }));
  // A failed metrics call is recorded on each signal that made it (carrier id and signal name), not on the tool.
  const fingerprints=[];bindings.forEach(b=>Object.keys(b.signals).forEach(name=>{const f=signalFingerprint(b.signals[name]);if(f)fingerprints.push({f,tool:b.id+' '+name});}));
  for(let i=errors.length-1;i>=0;i--){
    const e=errors[i];if(!e.input || (e.source!=='grafana' && e.source!=='honeycomb'))continue;
    const f=callFingerprint(e.tool,e.input),owners=f?fingerprints.filter(x=>x.f===f):[];
    if(owners.length)errors.splice(i,1,...owners.map(owner=>({source:e.source,tool:owner.tool,message:e.message})));
  }
  // PR states come from GitHub, which the script does not read yet: one error per authored PR.
  refs.prs.forEach(url=>errors.push({source:'github',tool:url,message:'pull request state is not read by the snapshot script yet'}));
  api.destroy();if(providers && providers.destroy)providers.destroy();
  const at=new Date(now()).toISOString(),day=snapshotDay(hasJira?live.states:{},evidence.map || {},bindings,at);
  // intervalSeconds keeps the file a valid demo timeline (tools/inject.py --timeline); one day never advances.
  const snapshot={version:1,kind:SNAPSHOT_KIND,snapshotAt:at,board,intervalSeconds:6,epics:day.epics,days:[{label:'Snapshot from '+at,issues:day.issues,telemetry:day.telemetry}],
    errors:dedupe(errors.map(e=>({source:e.source,tool:e.tool==null?null:scrub(e.tool,transport.secrets),message:scrub(e.message,transport.secrets)})))};
  const requested=refs.tickets,missingTickets=requested.filter(key=>!day.issues[key]).length;
  const signals=hasMetrics?bindings.reduce((n,b)=>n+Object.keys(b.signals).length,0):0,observed=Object.keys(day.telemetry.carriers).reduce((n,id)=>n+Object.keys(day.telemetry.carriers[id]).length,0);
  /* The viewer publishes ticket state only when every search it made answered, and then it names every requested
     ticket (missing when Jira did not return it). With no state at all the tickets are unknown, not missing. */
  const jiraFailed=hasJira && requested.length>0 && !requested.some(key=>Object.prototype.hasOwnProperty.call(live.states,key));
  return {snapshot,summary:{tickets:requested.length,missing:hasJira && !jiraFailed?missingTickets:null,jiraFailed,carriers:Object.keys(day.telemetry.carriers).length,signals,observed,errors:snapshot.errors,at,jira:hasJira,metrics:hasMetrics}};
}
function dedupe(list){const seen=new Set();return list.filter(e=>{const key=JSON.stringify(e);if(seen.has(key))return false;seen.add(key);return true;});}

/* The controller's maps as one demo story day: `issues` as liveStatusDemoMap reads them back, and the
   metric series on one grid from `start` every `stepSeconds` (a missing point is null). */
function snapshotDay(states,telemetryMap,bindings,at){
  const issues={},epics={};
  Object.keys(states).forEach(key=>{
    const entry=states[key];if(!entry || entry.state==='missing')return;
    const issue={state:entry.state};
    [['title','summary'],['assignee','assignee'],['assigneeId','assigneeId'],['updatedAt','updated'],['epic','epic'],['parent','parent'],['kind','kind'],['lane','lane']].forEach(([from,to])=>{if(typeof entry[from]==='string')issue[to]=entry[from];});
    if(Array.isArray(entry.initiatives))issue.initiatives=entry.initiatives.slice();
    if(typeof entry.detail==='string' && entry.detail)issue.statusName=entry.detail;
    if(entry.prs && entry.prs.count>0){issue.prs={count:entry.prs.count,state:entry.prs.state};if(Array.isArray(entry.prs.links))issue.prs.links=entry.prs.links;}
    const links=(entry.dependsOn || []).filter(dep=>dep.source==='jira' && dep.linkType).map(dep=>({type:dep.linkType,key:dep.key}));if(links.length)issue.links=links;
    if(entry.kind==='epic' || entry.kind==='initiative')epics[key]=entry.title?{summary:entry.title}:{};
    issues[key]=issue;
  });
  const units={};bindings.forEach(b=>Object.keys(b.signals).forEach(name=>{if(b.signals[name].unit)units[b.id+'\u0000'+name]=b.signals[name].unit;}));
  const series=[];Object.keys(telemetryMap).forEach(id=>{const signals=telemetryMap[id] && telemetryMap[id].signals || {};Object.keys(signals).forEach(name=>{
    const s=signals[name];if(!s || typeof s.value!=='number' || !isFinite(s.value))return;
    let points=Array.isArray(s.series)?s.series.filter(p=>Array.isArray(p) && isFinite(p[0]) && typeof p[1]==='number' && isFinite(p[1])):[];
    if(!points.length)points=[[Date.parse(telemetryMap[id].observedAt) || Date.parse(at),s.value]];
    series.push({id,name,unit:s.unit || units[id+'\u0000'+name] || null,value:s.value,points:points.slice().sort((a,b)=>a[0]-b[0])});
  });});
  // All queries end now, so each series is aligned by its last point, which takes the last slot. The step is
  // the most common gap between a series' points (a Prometheus range step); a point between slots takes the nearest.
  const gaps={};series.forEach(s=>{for(let i=1;i<s.points.length;i++){const gap=s.points[i][0]-s.points[i-1][0];if(gap>0)gaps[gap]=(gaps[gap] || 0)+1;}});
  // Whole seconds: a demo story's stepSeconds is a positive integer (tools/inject.py).
  const step=Math.max(1000,Math.round((Number(Object.keys(gaps).sort((x,y)=>gaps[y]-gaps[x] || x-y)[0]) || 60000)/1000)*1000);
  const end=series.length?Math.max(...series.map(s=>s.points[s.points.length-1][0])):Date.parse(at);
  const slots=Math.min(MAX_SLOTS,Math.max(1,...series.map(s=>Math.round((s.points[s.points.length-1][0]-s.points[0][0])/step)+1)));
  const start=end-slots*step,carriers={};
  series.forEach(s=>{
    const values=new Array(slots).fill(null),last=s.points[s.points.length-1][0];
    s.points.forEach(([t,v])=>{const k=slots-1-Math.round((last-t)/step);if(k>=0)values[k]=v;});
    // `value` is the viewer's measurement for the window (a CloudWatch Sum or Average is not its last bucket).
    const entry={values};if(s.unit)entry.unit=s.unit;if(s.value!==s.points[s.points.length-1][1])entry.value=s.value;
    (carriers[s.id] || (carriers[s.id]={}))[s.name]=entry;
  });
  return {issues,epics,telemetry:{start:new Date(start).toISOString(),stepSeconds:step/1000,carriers}};
}

/* The one line an agent sees. */
function summaryLine(file,summary){
  const parts=[];
  parts.push(!summary.jira?'Jira skipped':summary.jiraFailed?'Jira failed ('+summary.tickets+' tickets unknown)':summary.tickets+' tickets ('+summary.missing+' missing)');
  parts.push(summary.metrics?summary.carriers+' carriers, '+summary.observed+' of '+summary.signals+' signals':'metrics skipped');
  const errors=summary.errors.map(e=>e.source+(e.tool?' '+e.tool:'')+': '+e.message.replace(/\s+/g,' ').slice(0,120));
  parts.push(errors.length?errors.length+' error'+(errors.length===1?'':'s')+' ('+errors.slice(0,3).join('; ')+(errors.length>3?'; …':'')+')':'no errors');
  return 'snapshot '+file+' at '+summary.at+': '+parts.join(' · ');
}
/* design-viz is public: a snapshot holds real ticket titles, assignees and metric values. Inside a git work
   tree the file must be ignored (git check-ignore), so it can never be committed by accident. Returns the
   reason to refuse, or null. Without git there is no work tree to commit to. */
function unsafeOut(file){
  const dir=path.dirname(path.resolve(file));if(!fs.existsSync(dir))return 'the folder '+dir+' does not exist';
  const inside=spawnSync('git',['-C',dir,'rev-parse','--is-inside-work-tree'],{encoding:'utf8'});
  if(inside.error || inside.status!==0 || inside.stdout.trim()!=='true')return null;
  const ignored=spawnSync('git',['-C',dir,'check-ignore','-q',path.resolve(file)],{encoding:'utf8'});
  return ignored.status===0?null:file+' is inside a git work tree and git does not ignore it (name it *.snapshot.json, or write it outside the repository)';
}
function defaultOut(specPath){
  const dir=path.dirname(specPath),base=path.basename(specPath).replace(/\.json$/i,'').replace(/\.spec$/i,'');
  return path.join(dir,base+'.snapshot.json');
}

async function main(argv,env,{fetchImpl,stdout=process.stdout,transport}={}){
  const args=argv.slice();let out=null,timeout=60;const files=[];
  while(args.length){const a=args.shift();if(a==='--out')out=args.shift();else if(a==='--timeout')timeout=Number(args.shift());else files.push(a);}
  if(files.length!==1 || !(timeout>0)){stdout.write('usage: node tools/live-snapshot.js <board.spec.json> [--out <file>] [--timeout <seconds>]\n');return 2;}
  const specPath=files[0],file=out || defaultOut(specPath);
  let specText;try{specText=fs.readFileSync(specPath,'utf8');JSON.parse(specText);}catch(ex){stdout.write('snapshot not written: cannot read '+specPath+' as JSON\n');return 2;}
  // Checked before any provider call.
  const unsafe=unsafeOut(file);if(unsafe){stdout.write('snapshot not written: '+unsafe+'\n');return 1;}
  const tracking=JSON.parse(specText),jiraSite=tracking && tracking.page && tracking.page.tracking && tracking.page.tracking.jira && tracking.page.tracking.jira.site || tracking && tracking.tracking && tracking.tracking.jira && tracking.tracking.jira.site;
  const now=()=>Date.now(),source=transport || restTransport(env,fetchImpl,now,typeof jiraSite==='string' && /^https?:\/\//.test(jiraSite)?jiraSite:null,{pollMs:Math.min(20000,timeout*500)});
  const result=await takeSnapshot({specText,board:path.basename(specPath),transport:source,timeoutMs:timeout*1000,now});
  if(result.refused){stdout.write('snapshot not written: '+result.refused+'\n');return 1;}
  const {snapshot,summary}=result;
  // Every ticket would read missing: no snapshot at all is better than a wrong one.
  if(summary.jiraFailed){stdout.write(scrub('snapshot not written: the board\'s '+summary.tickets+' tickets are unknown, because Jira did not answer every search for them'+(summary.errors.filter(e=>e.source==='jira')[0]?' (first: '+summary.errors.filter(e=>e.source==='jira')[0].message+')':''),source.secrets)+'\n');return 1;}
  if(!summary.jira && !summary.metrics){stdout.write(scrub('snapshot not written: '+(summary.errors.filter(e=>e.tool==null && (e.source==='jira' || e.source==='grafana' || e.source==='honeycomb')).map(e=>e.source+': '+e.message).join('; ') || 'the board has no tickets and no bound signals'),source.secrets)+'\n');return 1;}
  fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n');
  stdout.write(scrub(summaryLine(file,summary),source.secrets)+'\n');
  return 0;
}

module.exports={takeSnapshot,restTransport,mcpHandlerTransport,snapshotDay,summaryLine,defaultOut,unsafeOut,parseTime,providerBase,scrub,main,SNAPSHOT_KIND};
// The process ends once its one line is out: an unanswered request never keeps the agent's command waiting.
if(require.main===module){
  const finish=code=>process.stdout.write('',()=>process.exit(code));
  main(process.argv.slice(2),process.env).then(finish,error=>{const env=process.env;process.stdout.write(scrub('snapshot not written: '+String(error && error.message || error).split('\n')[0],['JIRA_API_TOKEN','GRAFANA_TOKEN','GITHUB_TOKEN','JIRA_EMAIL'].map(n=>env[n]).filter(Boolean))+'\n');finish(1);});
}

/* Declarative direct trace connections. Shared by validation, packaging and all
   viewers. No networking, authentication, evaluation or authored mutations. */
var TELEMETRY_COMPANY_TRACE_CONNECTIONS=/* @company-trace-connections */ {};
var FlowTraceConnections=(function(){
  var reserved=['__proto__','prototype','constructor'],encodings=['relative','iso8601','unix-seconds','unix-milliseconds'];
  function own(v,k){return Object.prototype.hasOwnProperty.call(v,k);}
  function object(v){return !!v && typeof v==='object' && !Array.isArray(v);}
  function fail(stage,message){var e=new Error(stage+': '+message);e.stage=stage;throw e;}
  function name(v){return typeof v==='string' && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(v) && reserved.indexOf(v)<0;}
  function text(v){return typeof v==='string' && v.length>0 && v.length<=200 && !/[\x00-\x1f<>]/.test(v);}
  function fields(v,allowed,at){if(!object(v) || Object.keys(v).some(function(k){return allowed.indexOf(k)<0 || reserved.indexOf(k)>=0;}))fail('configuration',at+' has an unsupported shape or field.');}
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function literals(v,at){
    if(!object(v) || Object.keys(v).length>24)fail('configuration',at+' must be a bounded object.');
    Object.keys(v).forEach(function(k){var x=v[k];if(!name(k) || /(?:secret|password|credential|token|authorization|cookie|header|api.?key)/i.test(k) || !(x===null || typeof x==='boolean' || typeof x==='number' && Number.isFinite(x) || typeof x==='string' && x.length<=200 && !/[\x00-\x1f<>]|https?:\/\/|bearer\s/i.test(x)))fail('configuration',at+' permits only non-secret scalar configuration.');});
    return copy(v);
  }
  function profile(raw){
    fields(raw,['version','label','provider','server','tool','readOnly','adapter','arguments','time','literals','environments','links'],'profile');
    if(raw.version!==1 || !text(raw.label) || !text(raw.server) || !name(raw.tool) || raw.readOnly!==true || !({honeycomb:'honeycomb-table-v1',tempo:'tempo-v1'}[raw.provider]===raw.adapter))fail('configuration','Use version 1, an exact server/tool, readOnly:true and a registered provider adapter.');
    var p=copy(raw),a=p.arguments;
    fields(a,['traceId','start','end','environment','context'],'arguments');
    if(!name(a.traceId) || !name(a.start) || own(a,'end') && !name(a.end) || own(a,'environment') && !name(a.environment))fail('configuration','Arguments require traceId and start field names.');
    if(own(a,'context') && (!object(a.context) || Object.keys(a.context).length>12 || Object.keys(a.context).some(function(k){return !name(k) || !name(a.context[k]);})))fail('configuration','Invalid context argument mapping.');
    var targets=[a.traceId,a.start,a.end,a.environment].filter(Boolean).concat(Object.values(a.context || {}));
    if(new Set(targets).size!==targets.length)fail('configuration','Argument mappings must have distinct targets.');
    fields(p.time,['encoding','type','defaultLookback'],'time');
    if(encodings.indexOf(p.time.encoding)<0 || ['string','number'].indexOf(p.time.type)<0 || ['relative','iso8601'].indexOf(p.time.encoding)>=0 && p.time.type!=='string' || !/^[1-9][0-9]{0,3}[smhdw]$/.test(p.time.defaultLookback || ''))fail('configuration','Specify time encoding, type and bounded defaultLookback.');
    p.literals=literals(p.literals || {},'literals');
    if(Object.keys(p.literals).some(function(k){return targets.indexOf(k)>=0;}))fail('configuration','Literal and mapped arguments conflict.');
    if(!object(p.environments) || !Object.keys(p.environments).length || Object.keys(p.environments).length>32)fail('configuration','Configure 1–32 environments.');
    Object.keys(p.environments).forEach(function(id){var env=p.environments[id];if(!name(id))fail('configuration','Invalid environment id.');fields(env,['label','value','context','literals'],'environment');
      if(own(env,'label') && !text(env.label) || a.environment && !text(env.value) || !a.environment && own(env,'value'))fail('configuration','Environment value must match its argument mapping.');
      env.context=literals(env.context || {},'environment context');env.literals=literals(env.literals || {},'environment literals');
      if(Object.keys(env.literals).some(function(k){return targets.indexOf(k)>=0;}))fail('configuration','Environment literals conflict with mapped arguments.');
      Object.keys(a.context || {}).forEach(function(k){if(!own(env.context,k))fail('configuration','Every environment must supply mapped context '+k+'.');});
    });
    p.links=p.links || [];
    if(!Array.isArray(p.links) || p.links.length>8)fail('configuration','links must contain at most eight descriptors.');
    p.links.forEach(function(link){fields(link,['origin','path','query','timeEncoding'],'link');
      var u;try{u=new URL(link.origin);}catch(e){fail('configuration','Invalid link origin.');}
      if(u.origin!==link.origin || u.protocol!=='https:' || u.username || u.password || p.provider==='honeycomb' && u.hostname!=='ui.honeycomb.io')fail('configuration','Unsupported link origin.');
      if(typeof link.path!=='string' || link.path.length>240 || !/^\/(?:[A-Za-z0-9._~-]+|\{[A-Za-z][A-Za-z0-9_]*\})(?:\/(?:[A-Za-z0-9._~-]+|\{[A-Za-z][A-Za-z0-9_]*\}))*$/.test(link.path))fail('configuration','Use a literal path with named whole-segment placeholders.');
      if(!object(link.query) || Object.keys(link.query).length>12 || Object.keys(link.query).some(function(k){return !name(k) || !name(link.query[k]);}) || encodings.indexOf(link.timeEncoding)<0)fail('configuration','Invalid link query mapping/timeEncoding.');
      var keys=(link.path.match(/\{[^}]+\}/g) || []).map(function(k){return k.slice(1,-1);}).concat(Object.keys(link.query));
      if(new Set(keys).size!==keys.length || new Set(Object.values(link.query)).size!==Object.keys(link.query).length || keys.indexOf('traceId')<0 || keys.some(function(k){return ['traceId','start','end','environment'].indexOf(k)<0 && !Object.keys(a.context || {}).includes(k);}))fail('configuration','Link fields must uniquely map traceId, time, environment or configured context.');
    });return p;
  }
  function profiles(raw){if(!object(raw) || Object.keys(raw).length>16)fail('configuration','traceConnections must be an object of at most 16 profiles.');var out={};Object.keys(raw).forEach(function(id){if(!name(id))fail('configuration','Invalid connection id.');out[id]=profile(raw[id]);});return out;}
  /* #1095: company profiles are inherited only by a board that uses traces: a
     step with traceMatch, or a live-status panel (Status -> Trace) on a page
     with tracking.telemetry, a node, edge or import-overlay telemetry binding,
     or a node detail reference (a loaded detail can hold traceMatch steps).
     Callers pass the page the viewer renders, after topology resolution. The
     section walk mirrors FlowCanon sections() (src/canon.js). */
  function usesTraces(page){
    var diagrams=[];if(!object(page))return false;
    function list(v){return Array.isArray(v)?v:[];}
    function walk(items){list(items).forEach(function(s){if(!object(s))return;if(object(s.diagram))diagrams.push(s.diagram);list(s.tabs).forEach(function(t){if(object(t))walk(t.sections || t.blocks);});});}
    walk(page.blocks || page.sections);
    function values(v){return object(v)?Object.keys(v).map(function(k){return v[k];}):[];}
    function bound(v){return object(v) && own(v,'telemetry');}
    if(diagrams.some(function(d){return list(d.steps).some(function(s){var m=object(s) && s.traceMatch;return Array.isArray(m)?m.length>0:!!m;});}))return true;
    if(!diagrams.some(function(d){return list(d.panels).some(function(p){return object(p) && p.type==='live-status';});}))return false;
    if(object(page.tracking) && own(page.tracking,'telemetry'))return true;
    return diagrams.some(function(d){return values(d.nodes).some(function(n){return bound(n) || object(n) && !!n.detail;}) || list(d.edges).some(bound) || list(d.topologyImports).some(function(imp){return object(imp) && (values(imp.nodeTracking).some(bound) || values(imp.edgeTracking).some(bound));});});
  }
  function resolve(page,company,invalid){
    var config=page && page.tracking && page.tracking.telemetry,out={};config=object(config)?config:{};
    if(config.enabled===false)return out;
    if(!own(config,'traceConnections')){if(!company || object(company) && !Object.keys(company).length || !usesTraces(page))return out;try{return profiles(company);}catch(e){if(invalid)invalid('.traceConnections',e.message);return out;}}
    var raw=config.traceConnections;
    try{if(!object(raw) || Object.keys(raw).length>16)fail('configuration','traceConnections must be a bounded object.');}catch(e){if(invalid)invalid('.traceConnections',e.message);return out;}
    Object.keys(raw).forEach(function(id){try{
      if(!name(id))fail('configuration','Invalid connection id.');var entry=raw[id],p;
      if(entry && own(entry,'profile')){
        fields(entry,['profile','label','literals','environments'],'board connection');
        if(!name(entry.profile) || !own(company || {},entry.profile))fail('configuration','Unknown company trace profile.');p=profile(company[entry.profile]);
        if(own(entry,'label'))p.label=entry.label;
        if(own(entry,'literals')){var overrides=literals(entry.literals,'board literals');if(Object.keys(overrides).some(function(k){return !own(p.literals,k);}))fail('configuration','Board literals may override only declared profile literals.');Object.assign(p.literals,overrides);}
        if(own(entry,'environments')){if(!object(entry.environments) || !Object.keys(entry.environments).length)fail('configuration','Board environments must select configured environments.');var envs={};Object.keys(entry.environments).forEach(function(k){if(!own(p.environments,k))fail('configuration','Unknown profile environment.');var over=entry.environments[k];fields(over,['label','value','context','literals'],'board environment');var base=copy(p.environments[k]);['label','value'].forEach(function(f){if(own(over,f))base[f]=over[f];});['context','literals'].forEach(function(f){if(own(over,f)){var v=literals(over[f],'board environment '+f);if(Object.keys(v).some(function(n){return !own(base[f],n);}))fail('configuration','Overrides may only replace declared environment fields.');Object.assign(base[f],v);}});envs[k]=base;});p.environments=envs;}
        p=profile(p);
      }else p=profile(entry);
      out[id]=p;
    }catch(e){if(invalid)invalid('.traceConnections.'+id,e.message);}});return out;
  }
  function decimalNs(value,encoding){
    if(typeof value!=='string' || !/^\d{1,16}(?:\.\d{1,9})?$/.test(value))fail('input','Invalid absolute link timestamp.');
    var parts=value.split('.'),digits=encoding==='unix-seconds'?9:6;
    if((parts[1] || '').length>digits)fail('input','Timestamp precision exceeds declared units.');
    var n=BigInt(parts[0])*10n**BigInt(digits)+BigInt((parts[1] || '').padEnd(digits,'0'));
    if(n>=253402300800000000000n)fail('input','Timestamp is outside supported date bounds.');return n;
  }
  function instant(value,encoding){
    if(encoding==='unix-seconds' || encoding==='unix-milliseconds')return decimalNs(value,encoding);
    if(typeof value!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) || !Number.isFinite(Date.parse(value)))fail('input','Use an absolute UTC ISO timestamp or a signed lookback.');
    var m=/^(.*?)(?:\.(\d{1,9}))?Z$/.exec(value),base=Date.parse(m[1]+'Z');if(new Date(base).toISOString().slice(0,19)!==m[1])fail('input','Invalid calendar timestamp.');return BigInt(base)*1000000n+BigInt((m[2] || '').padEnd(9,'0'));
  }
  function iso(ns){var ms=ns/1000000n,remainder=ns%1000000000n;return new Date(Number(ms)).toISOString().replace(/\.\d{3}Z$/,'.'+remainder.toString().padStart(9,'0')+'Z');}
  function lookback(value){var m=/^-([1-9][0-9]{0,3})([smhdw])$/.exec(value || '');if(!m)fail('input','Use a signed lookback such as -2h.');return Number(m[1])*({s:1,m:60,h:3600,d:86400,w:604800}[m[2]]);}
  function encode(ns,time){if(time.encoding==='iso8601')return iso(ns);var digits=time.encoding==='unix-seconds'?9:6,unit=10n**BigInt(digits),whole=ns/unit,tail=(ns%unit).toString().padStart(digits,'0').replace(/0+$/,''),s=whole.toString()+(tail?'.'+tail:'');if(time.type==='string')return s;var n=Number(s);if(decimalNs(String(n),time.encoding)!==ns)fail('arguments','Timestamp cannot be represented exactly as a number; configure a string argument.');return n;}
  function input(p,request,now){
    if(!object(request) || typeof request.input!=='string' || request.input.length>4096)fail('input','Enter a trace ID or supported trace link.');
    var value=request.input.trim(),found=[];
    if(/^https?:/i.test(value)){
      var url;try{url=new URL(value);}catch(e){fail('input','Invalid trace link.');}
      if(url.username || url.password || url.hash || /[\\\s]/.test(value))fail('input','Unsupported trace link.');
      var seen=new Set();url.searchParams.forEach(function(v,k){if(seen.has(k))fail('input','Duplicate trace link query field.');seen.add(k);});
      p.links.forEach(function(link){if(url.origin!==link.origin)return;var parts=url.pathname.split('/'),template=link.path.split('/'),parsed={};if(parts.length!==template.length)return;
        for(var i=0;i<parts.length;i++){if(template[i][0]==='{'){try{parsed[template[i].slice(1,-1)]=decodeURIComponent(parts[i]);}catch(e){fail('input','Invalid encoded link path.');}}else if(parts[i]!==template[i])return;}
        if(Array.from(url.searchParams.keys()).some(function(k){return Object.values(link.query).indexOf(k)<0;}))fail('input','Unsupported trace link query field; remove unrelated or credential-bearing parameters.');
        Object.keys(link.query).forEach(function(k){if(url.searchParams.has(link.query[k]))parsed[k]=url.searchParams.get(link.query[k]);});parsed.encoding=link.timeEncoding;found.push(parsed);
      });
      if(found.length!==1)fail('input',found.length?'Ambiguous trace link descriptors.':'This connection does not support that trace link.');
    }else found=[{traceId:value}];
    var parsed=found[0];Object.keys(parsed).forEach(function(k){var v=parsed[k];if(typeof v!=='string' || !v.length || v!==v.trim() || /[\x00-\x1f\x7f]/.test(v))fail('input','Supplied trace link fields must be nonempty and well formed.');});if(!/^[0-9a-f]{16,32}$/i.test(parsed.traceId || ''))fail('input','Invalid trace ID.');
    var ids=Object.keys(p.environments).filter(function(id){var e=p.environments[id];if(own(parsed,'environment') && parsed.environment!==e.value)return false;return Object.keys(p.arguments.context || {}).every(function(k){return !own(parsed,k) || String(e.context[k])===parsed[k];});});
    if(request.environment){if(ids.indexOf(request.environment)<0)fail('input','Trace link conflicts with the selected environment/context.');ids=[request.environment];}
    if(ids.length!==1)fail('input',ids.length?'Choose an environment; the request is ambiguous.':'Trace link does not match a configured environment/context.');
    ['start','end'].forEach(function(k){if(own(parsed,k) && request[k])fail('input','Time supplied in both the link and controls; clear the time control.');});
    var start=own(parsed,'start')?parsed.start:request.start || '-'+p.time.defaultLookback,end=own(parsed,'end')?parsed.end:request.end,encoding=own(parsed,'start')?parsed.encoding:'iso8601',relative=start[0]==='-',to=BigInt(now)*1000000n,from;
    if(relative){if(own(parsed,'start') && encoding!=='relative' || end)fail('input','Relative time cannot be combined with an absolute end.');from=to-BigInt(lookback(start))*1000000000n;}
    else {if(!end)fail('input','Absolute trace time requires both start and end.');from=instant(start,encoding);to=instant(end,own(parsed,'end')?parsed.encoding:'iso8601');}
    if(from<0n || from>to)fail('input','Invalid trace time bounds.');
    if(p.time.encoding==='relative' && !relative)fail('arguments','This connection supports only relative time; it cannot honor absolute trace-link bounds.');
    if(p.time.encoding!=='relative' && !p.arguments.end)fail('arguments','Absolute time requires an end argument mapping.');
    var env=p.environments[ids[0]],args=Object.assign({},p.literals,env.literals),a=p.arguments;args[a.traceId]=parsed.traceId;
    args[a.start]=p.time.encoding==='relative'?start:encode(from,p.time);if(a.end && p.time.encoding!=='relative')args[a.end]=encode(to,p.time);
    if(a.environment)args[a.environment]=env.value;Object.keys(a.context || {}).forEach(function(k){args[a.context[k]]=env.context[k];});
    return {traceId:parsed.traceId,environment:ids[0],args:args,range:{from:iso(from),to:iso(to)}};
  }
  /* Fail closed on schema features we cannot honor. anyOf/oneOf nullable unions
     and all required arguments are validated before a tool call. */
  function validate(value,schema,at,depth){
    at=at || 'arguments';depth=depth || 0;if(depth>20)fail('schema','Schema nesting exceeds bounds.');
    if(schema===true)return;if(schema===false)fail('arguments',at+' is forbidden.');
    var allowed=['type','properties','required','additionalProperties','items','enum','const','anyOf','oneOf','allOf','description','title','default','$schema','examples','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems'];
    if(!object(schema) || Object.keys(schema).some(function(k){return allowed.indexOf(k)<0;}))fail('schema',at+' uses unsupported constraints.');
    ['anyOf','oneOf'].forEach(function(k){if(!own(schema,k))return;if(!Array.isArray(schema[k]) || !schema[k].length || schema[k].length>16)fail('schema','Invalid '+k+'.');var matches=0;schema[k].forEach(function(s){try{validate(value,s,at,depth+1);matches++;}catch(e){if(e.stage==='schema')throw e;}});if(!matches || k==='oneOf' && matches!==1)fail('arguments',at+' does not match '+k+'.');});
    if(own(schema,'allOf')){if(!Array.isArray(schema.allOf) || schema.allOf.length>16)fail('schema','Invalid allOf.');schema.allOf.forEach(function(s){validate(value,s,at,depth+1);});}
    function type(t){if(['null','object','array','integer','number','string','boolean'].indexOf(t)<0)fail('schema','Unsupported type.');return t==='null'?value===null:t==='object'?object(value):t==='array'?Array.isArray(value):t==='integer'?Number.isSafeInteger(value):t==='number'?typeof value==='number' && Number.isFinite(value):typeof value===t;}
    if(own(schema,'type')){var ts=Array.isArray(schema.type)?schema.type:[schema.type];if(!ts.length || !ts.map(type).some(Boolean))fail('arguments',at+' has the wrong type.');}
    if(own(schema,'enum') && (!Array.isArray(schema.enum) || !schema.enum.some(function(v){return JSON.stringify(v)===JSON.stringify(value);})) || own(schema,'const') && JSON.stringify(value)!==JSON.stringify(schema.const))fail('arguments',at+' is not an allowed value.');
    if(typeof value==='number')Object.keys({minimum:1,maximum:1,exclusiveMinimum:1,exclusiveMaximum:1}).forEach(function(k){if(own(schema,k) && (typeof schema[k]!=='number' || (k==='minimum'?value<schema[k]:k==='maximum'?value>schema[k]:k==='exclusiveMinimum'?value<=schema[k]:value>=schema[k])))fail('arguments',at+' violates '+k+'.');});
    if(typeof value==='string' || Array.isArray(value)){var lo=typeof value==='string'?'minLength':'minItems',hi=typeof value==='string'?'maxLength':'maxItems';[lo,hi].forEach(function(k){if(own(schema,k) && (!Number.isSafeInteger(schema[k]) || schema[k]<0))fail('schema','Invalid '+k+'.');});if(own(schema,lo) && value.length<schema[lo] || own(schema,hi) && value.length>schema[hi])fail('arguments',at+' exceeds schema bounds.');}
    if(object(value)){if(own(schema,'required')){if(!Array.isArray(schema.required) || schema.required.length>64 || schema.required.some(function(k){return typeof k!=='string' || k.length>80;}))fail('schema','Invalid required fields.');var missing=schema.required.filter(function(k){return !own(value,k);});if(missing.length)fail('arguments',at+' is missing required fields: '+missing.join(', ')+'.');}if(own(schema,'properties') && !object(schema.properties))fail('schema','Invalid properties.');if(own(schema,'additionalProperties') && typeof schema.additionalProperties!=='boolean' && !object(schema.additionalProperties))fail('schema','Invalid additionalProperties.');Object.keys(value).forEach(function(k){var props=schema.properties || {};if(reserved.indexOf(k)>=0)fail('arguments','Reserved argument name.');if(own(props,k))validate(value[k],props[k],at+'.'+k,depth+1);else if(schema.additionalProperties===false)fail('arguments',at+'.'+k+' is not declared.');else if(object(schema.additionalProperties))validate(value[k],schema.additionalProperties,at+'.'+k,depth+1);});}
    if(Array.isArray(value) && own(schema,'items'))value.forEach(function(v,i){validate(v,schema.items,at+'['+i+']',depth+1);});
  }
  function tool(p,t,args){
    if(!t || t.name!==p.tool || !object(t.inputSchema))fail('schema','The exact detail tool and its runtime schema are required.');
    var a=t.annotations || {},known=p.provider==='honeycomb'?p.tool==='get_trace':p.tool==='get_tempo_trace';
    if(a.readOnlyHint===false || a.destructiveHint===true || !known && a.readOnlyHint!==true)fail('schema','Tool is not verified read-only; custom aliases require readOnlyHint:true.');
    if(t.inputSchema.type!=='object' || !object(t.inputSchema.properties))fail('schema','Runtime detail tool requires an object input schema.');
    validate(args,t.inputSchema);
  }
  return {profile:profile,profiles:profiles,resolve:resolve,usesTraces:usesTraces,input:input,validate:validate,tool:tool,fail:fail};
})();

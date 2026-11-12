/* #1344 / #1348: narrowing an inherited metric signal. A signal's `narrow` holds fragments in
   its provider's own language, keyed by source; Flowview only appends them to the query, never
   translates them. `needsNarrow` (field names, or true) says every board must narrow the signal.
   Anything that cannot be applied safely fails closed: the signal is not shown, with a reason.
   Pure and DOM-free; carrierTelemetry (core/tracking.js) applies it when the query is built.
   Honeycomb filters and CloudWatch dimensions are structured; LogQL stages, PromQL matcher text and
   Logs Insights filter commands are text, checked to be exactly one appended stage or matcher and
   placed by a scanner that masks strings first (#1354). Injection is the risk: anything it cannot
   parse fails closed. */
var TELEMETRY_NARROW_LABELS={grafana:'Prometheus',loki:'LogQL',tempo:'Tempo',sql:'Grafana SQL',honeycomb:'Honeycomb',cloudwatch:'CloudWatch',cloudwatchLogs:'Logs Insights'};
var TELEMETRY_NARROW_STRUCTURED=['honeycomb','cloudwatch','loki','grafana','cloudwatchLogs'];
var TELEMETRY_HONEYCOMB_OPS=['=','!=','>','>=','<','<=','starts-with','does-not-start-with','ends-with','does-not-end-with','contains','does-not-contain','exists','does-not-exist','in','not-in'];
function telemetryNarrowObject(v){return !!v && typeof v==='object' && !Array.isArray(v);}
// An authored narrow.<source> is one fragment or a list of them; a merged one is always a list.
function telemetryNarrowList(value){return value==null?[]:Array.isArray(value)?value:[value];}
function telemetryNarrowCanonical(v){
  if(Array.isArray(v))return '['+v.map(telemetryNarrowCanonical).join(',')+']';
  if(telemetryNarrowObject(v))return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+telemetryNarrowCanonical(v[k]);}).join(',')+'}';
  return JSON.stringify(v===undefined?null:v);
}
/* #1354 text fragments. Strings are masked first: each character inside quotes becomes "x", so
   structure (pipes, braces, comments) is read only outside strings. regex (provider Logs Insights
   query text only, never a board's fragment, which may hold no / at all) also masks a /regex/
   where Logs Insights reads one: after parse <field> at the start of a command, and after like,
   not like or =~ that follow an operand. Any other / is a division (#1356 review). null when a
   string never closes. */
var TELEMETRY_LOGS_NOT_OPERANDS=['filter','and','or','not','parse','like','in','by','as','fields','stats','sort'];
function telemetryLogsRegexOpens(before){
  if(/(?:^|\|)\s*parse(?:\s+(?:[@A-Za-z_][\w.@]*|`[^`]*`))?\s*$/i.test(before))return true;
  var hit=/(\S+)\s+not\s+like\s*$/i.exec(before) || /(\S+)\s+like\s*$/i.exec(before) || /(\S+?)\s*!?=~\s*$/.exec(before);
  if(!hit)return false;
  var operand=hit[1];
  return /[A-Za-z0-9_@.`"')\]]$/.test(operand) && TELEMETRY_LOGS_NOT_OPERANDS.indexOf(operand.toLowerCase())<0;
}
function telemetryNarrowMask(text,quotes,regex){
  var out='',i=0,n=text.length;
  while(i<n){
    var c=text[i];
    if(quotes.indexOf(c)>=0 || regex && c==='/' && telemetryLogsRegexOpens(text.slice(0,i))){
      var j=i+1;out+=c;
      while(j<n && text[j]!==c){if(c!=='`' && text[j]==='\\'){out+=j+1<n?'xx':'x';j+=2;continue;}out+='x';j++;}
      if(j>=n)return null;
      out+=c;i=j+1;continue;
    }
    out+=c;i++;
  }
  return out;
}
function telemetryNarrowBalanced(m){
  var stack=[],pairs={')':'(',']':'[','}':'{'};
  for(var i=0;i<m.length;i++){var c=m[i];if(c==='(' || c==='[' || c==='{')stack.push(c);else if(pairs[c]){if(stack.pop()!==pairs[c])return false;}}
  return !stack.length;
}
var TELEMETRY_LOKI_REFUSED=['line_format','label_format','unwrap','drop','keep','decolorize','distinct'];
var TELEMETRY_LOKI_STRING='(?:"x*"|`x*`)';
// A LogQL label filter expression: term ((and|or|,) term)*, term = ( expr ) | label op value.
function telemetryLokiLabelFilter(m){
  var tokens=[],re=/\s*(\(|\)|,|and\b|or\b|[A-Za-z_][A-Za-z0-9_]*|==|=~|!=|!~|>=|<=|=|>|<|"x*"|`x*`|-?[0-9][0-9.]*[A-Za-z]*)/y,at=0;
  while(at<m.length){
    if(/^\s*$/.test(m.slice(at)))break;
    re.lastIndex=at;var hit=re.exec(m);if(!hit)return false;tokens.push(hit[1]);at=re.lastIndex;
  }
  var i=0;
  function value(t){return /^(?:"x*"|`x*`)$/.test(t) || /^-?[0-9]/.test(t);}
  function term(){
    if(tokens[i]==='('){i++;if(!expr())return false;if(tokens[i]!==')')return false;i++;return true;}
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[i] || '') || tokens[i]==='and' || tokens[i]==='or')return false;i++;
    if(['==','=~','!=','!~','>=','<=','=','>','<'].indexOf(tokens[i])<0)return false;i++;
    if(!value(tokens[i] || ''))return false;i++;return true;
  }
  function expr(){if(!term())return false;while(tokens[i]==='and' || tokens[i]==='or' || tokens[i]===','){i++;if(!term())return false;}return true;}
  return tokens.length>0 && expr() && i===tokens.length;
}
function telemetryLokiFragmentProblem(fragment){
  var stage='a LogQL narrowing is one line filter (|= "x"), label filter (| a="x") or parser (| json)';
  if(typeof fragment!=='string' || !fragment.trim())return stage;
  if(/[\r\n]/.test(fragment))return 'a narrowing is one line';
  var t=fragment.trim(),m=telemetryNarrowMask(t,'"`');
  if(m===null)return 'its quotes are unbalanced';
  if(m.indexOf('#')>=0)return '"#" would comment out the rest of the query';
  if(/[{}\[\]]/.test(m))return 'a LogQL narrowing cannot hold { } [ ]';
  if(!telemetryNarrowBalanced(m))return 'its parentheses are unbalanced';
  if(new RegExp('^(?:\\|=|\\|~|!=|!~)\\s*'+TELEMETRY_LOKI_STRING+'(?:\\s+or\\s+'+TELEMETRY_LOKI_STRING+')*$').test(m))return null;
  if((m.match(/\|/g) || []).length>(m[0]==='|'?1:0))return 'one stage per entry: this one has a second "|"';
  if(m[0]!=='|')return stage;
  var body=m.slice(1).trim(),word=(/^[A-Za-z_]+/.exec(body) || [''])[0];
  if(TELEMETRY_LOKI_REFUSED.indexOf(word)>=0)return word+' changes what is counted and cannot narrow';
  if(/^(?:json|logfmt)(?:\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*"x*"(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*"x*")*)?$/.test(body) || body==='unpack')return null;
  if(new RegExp('^(?:regexp|pattern)\\s+'+TELEMETRY_LOKI_STRING+'$').test(body))return null;
  if(/^(?:json|logfmt|unpack|regexp|pattern)\b/.test(body))return stage;
  return telemetryLokiLabelFilter(body)?null:stage;
}
var TELEMETRY_PROM_MATCHERS=/^\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:=~|!~|!=|=)\s*(?:"x*"|'x*'|`x*`)\s*(?:,\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:=~|!~|!=|=)\s*(?:"x*"|'x*'|`x*`)\s*)*$/;
function telemetryPromFragmentProblem(fragment){
  var bad='use PromQL matcher text such as type="full_charge"';
  if(typeof fragment!=='string' || /[\r\n]/.test(fragment))return bad;
  var m=telemetryNarrowMask(fragment,'"\'`');
  return m!==null && TELEMETRY_PROM_MATCHERS.test(m)?null:bad;
}
function telemetryLogsFragmentProblem(fragment){
  var command='a Logs Insights narrowing is one filter command';
  if(typeof fragment!=='string' || !fragment.trim())return command;
  if(/[\r\n]/.test(fragment))return 'a narrowing is one line';
  // No \ at all: the check never depends on how Logs Insights reads escapes (#1356 review c3).
  if(fragment.indexOf('\\')>=0)return 'a Logs Insights narrowing may not contain \\';
  // A board's fragment is masked for strings only: any / left is refused (#1356 review c2).
  var t=fragment.trim(),m=telemetryNarrowMask(t,'"\'`');
  if(m===null)return 'its quotes are unbalanced';
  if(m.indexOf('/')>=0)return 'a Logs Insights narrowing may not contain / (use like "text" or a quoted string)';
  if(m.indexOf('#')>=0)return '"#" would comment out the rest of the query';
  if(m.indexOf('|')>=0)return 'one filter command: this one has a "|"';
  if(!/^filter\s+\S/i.test(m))return command;
  if(!telemetryNarrowBalanced(m.replace(/[{}]/g,'')))return 'its brackets or parentheses are unbalanced';
  return null;
}
/* Placement in text queries. Each returns {query} or {error}. */
function telemetryNarrowPlacement(label,why){return {kind:'placement',error:'This '+label+' query '+why+', so the narrowing cannot be added; it is not shown.'};}
function telemetryLokiPlace(query,stages){
  var m=typeof query==='string'?telemetryNarrowMask(query,'"`'):null;
  if(m===null)return telemetryNarrowPlacement('LogQL','has an unclosed string');
  if(m.indexOf('#')>=0)return telemetryNarrowPlacement('LogQL','has a # comment');
  if(!telemetryNarrowBalanced(m))return telemetryNarrowPlacement('LogQL','has unbalanced braces, brackets or parentheses');
  var lineFilter=stages.some(function(stage){return /^\s*(?:\|=|\|~|!=|!~)/.test(stage);}),points=[];
  var labelFilter=stages.some(function(stage){return !/^\s*(?:\|=|\|~|!=|!~)/.test(stage) && !/^\s*\|\s*(?:json|logfmt|unpack|regexp|pattern)\b/.test(stage);});
  for(var i=0;i<m.length;i++){
    if(m[i]!=='{')continue;
    var close=m.indexOf('}',i);if(close<0 || m.slice(i+1,close).indexOf('{')>=0)return telemetryNarrowPlacement('LogQL','has unbalanced braces, brackets or parentheses');
    var at=close+1,depth=0;
    while(at<m.length){
      var c=m[at];
      if(c==='(')depth++;
      else if(c===')'){if(!depth)break;depth--;}
      else if(c==='[' && !depth)break;
      else if(c==='{')break;
      else if(c==='|' && !depth && /^\|\s*unwrap\b/.test(m.slice(at)))break;
      at++;
    }
    if(labelFilter && /\|\s*(?:drop|keep|label_format)\b/.test(m.slice(close+1,at)))return {kind:'placement',error:'This LogQL query changes its labels with drop, keep or label_format, so a label filter cannot be added safely; it is not shown.'};
    if(lineFilter && /\|\s*line_format\b/.test(m.slice(close+1,at)))return {kind:'placement',error:'This LogQL query reformats its lines with line_format, so a line filter cannot be added safely; it is not shown.'};
    points.push(at);i=close;
  }
  if(!points.length)return telemetryNarrowPlacement('LogQL','has no stream selector Flowview can find');
  var out=query;
  points.reverse().forEach(function(at){
    var head=out.slice(0,at).replace(/\s+$/,''),tail=out.slice(at).replace(/^\s+/,'');
    out=head+' '+stages.join(' ')+(tail?(tail[0]===')'?'':' ')+tail:'');
  });
  return {query:out};
}
var TELEMETRY_PROM_GROUPING=['by','without','on','ignoring','group_left','group_right'];
var TELEMETRY_PROM_KEYWORDS=['and','or','unless','offset','bool','atan2','inf','nan'];
var TELEMETRY_PROM_AGGREGATORS=['sum','min','max','avg','group','stddev','stdvar','count','count_values','bottomk','topk','quantile','limitk','limit_ratio'];
function telemetryPromPlace(query,text){
  var m=typeof query==='string'?telemetryNarrowMask(query,'"\'`'):null;
  if(m===null)return telemetryNarrowPlacement('PromQL','has an unclosed string');
  if(m.indexOf('#')>=0)return telemetryNarrowPlacement('PromQL','has a # comment');
  var edits=[],i=0,n=m.length;
  function match(open,close,from){var depth=0;for(var k=from;k<n;k++){if(m[k]===open)depth++;else if(m[k]===close && !--depth)return k;}return -1;}
  function braces(open){var close=m.indexOf('}',open);if(close<0)return false;edits.push({from:open+1,to:close,braces:true});i=close+1;return true;}
  while(i<n){
    var c=m[i];
    if(/\s/.test(c)){i++;continue;}
    if(c==='"' || c==='\'' || c==='`'){i=m.indexOf(c,i+1)+1;continue;}
    if(c==='['){var end=m.indexOf(']',i);if(end<0)return telemetryNarrowPlacement('PromQL','has unbalanced braces, brackets or parentheses');i=end+1;continue;}
    if(c==='{'){if(!braces(i))return telemetryNarrowPlacement('PromQL','has unbalanced braces, brackets or parentheses');continue;}
    if(c==='$')return telemetryNarrowPlacement('PromQL','has a $ variable outside a string or range');
    if(/[0-9.]/.test(c)){var num=/^[0-9.]+(?:[eE][+-]?[0-9]+)?[A-Za-z]*/.exec(m.slice(i));i+=num?num[0].length:1;continue;}
    if(/[A-Za-z_:]/.test(c)){
      var word=/^[A-Za-z_:][A-Za-z0-9_:]*/.exec(m.slice(i))[0],after=i+word.length,next=after;
      while(next<n && /\s/.test(m[next]))next++;
      i=after;
      var lower=word.toLowerCase();
      // PromQL keywords and aggregation operators are case-insensitive (#1356 review).
      if(TELEMETRY_PROM_GROUPING.indexOf(lower)>=0){if(m[next]==='('){var shut=match('(',')',next);if(shut<0)return telemetryNarrowPlacement('PromQL','has unbalanced braces, brackets or parentheses');i=shut+1;}continue;}
      if(TELEMETRY_PROM_KEYWORDS.indexOf(lower)>=0 || m[next]==='(')continue;
      if(TELEMETRY_PROM_AGGREGATORS.indexOf(lower)>=0 && m[next]!=='{')continue;
      if(m[next]==='{'){if(!braces(next))return telemetryNarrowPlacement('PromQL','has unbalanced braces, brackets or parentheses');}
      else edits.push({from:after,to:after,braces:false});
      continue;
    }
    if('(),+-*/%^=!<>~@'.indexOf(c)>=0){i++;continue;}
    return telemetryNarrowPlacement('PromQL','has a token Flowview does not recognise ('+c+')');
  }
  if(!telemetryNarrowBalanced(m))return telemetryNarrowPlacement('PromQL','has unbalanced braces, brackets or parentheses');
  if(!edits.length)return telemetryNarrowPlacement('PromQL','has no vector selector Flowview can find');
  var out=query;
  edits.sort(function(a,b){return b.from-a.from;}).forEach(function(e){
    if(!e.braces){out=out.slice(0,e.from)+'{'+text+'}'+out.slice(e.to);return;}
    var inner=out.slice(e.from,e.to).trim();
    out=out.slice(0,e.from)+(inner?inner+(/,$/.test(inner)?'':',')+text:text)+out.slice(e.to);
  });
  return {query:out};
}
var TELEMETRY_LOGS_BEFORE_FILTER=['fields','filter','filterindex','parse','sort','unmask','unnest','source'];
function telemetryLogsPlace(query,commands){
  var m=typeof query==='string'?telemetryNarrowMask(query,'"\'`',true):null;
  if(m===null)return {kind:'placement',error:'This Logs Insights query has an unclosed string or regex, so a filter cannot be added safely; it is not shown.'};
  if(m.indexOf('#')>=0)return {kind:'placement',error:'This Logs Insights query has a # comment, so a filter cannot be added safely; it is not shown.'};
  // Commands split at each | outside strings and regexes; the provider's text is kept as written and
  // the filter is spliced in at one point only (#1356 review).
  var starts=[0];for(var i=0;i<m.length;i++)if(m[i]==='|')starts.push(i+1);
  var parts=starts.map(function(from,k){var to=k+1<starts.length?starts[k+1]-1:m.length;return {from:from,masked:m.slice(from,to).trim()};});
  var at=parts.findIndex(function(p){return /^stats\b/i.test(p.masked);});
  var before=at<0?parts:parts.slice(0,at);
  // Only commands known to keep every row's fields may come before the filter (#1356 review c2).
  var unknown=before.filter(function(p){var w=(/^[A-Za-z]+/.exec(p.masked) || [''])[0].toLowerCase();return TELEMETRY_LOGS_BEFORE_FILTER.indexOf(w)<0;})[0];
  // The regex reason is about the refused command's own text (#1356 review c4): it holds a / left
  // from a regex the scanner did not read as one.
  if(unknown && unknown.masked.indexOf('/')>=0 && /(?:\blike|=~)\s*\//i.test(m))return {kind:'placement',error:'This Logs Insights query has a regex after like or =~ that Flowview cannot read, so a filter cannot be added safely; it is not shown.'};
  if(unknown){var word=(/^[A-Za-z]+/.exec(unknown.masked) || [''])[0];return {kind:'placement',error:'This Logs Insights query has '+(word?'a '+word+' command':'an empty command')+' before its stats, so a filter cannot be added safely; it is not shown.'};}
  var added=commands.map(function(c){return c.trim();}).join(' | ');
  if(at<0)return {query:query.replace(/\s+$/,'')+' | '+added};
  var from=parts[at].from;while(from<query.length && /\s/.test(query[from]))from++;
  return {query:query.slice(0,from)+added+' | '+query.slice(from)};
}
// Fields a text fragment pins (label = value), and those it only mentions. "|=" marks a LogQL line
// filter, which meets needsNarrow: true only. A fragment with or (or not) pins nothing.
function telemetryNarrowTextFields(source,fragment,pinned,named){
  if(typeof fragment!=='string')return;
  var m=telemetryNarrowMask(fragment.trim(),source==='loki'?'"`':'"\'`');
  if(m===null)return;
  // A |= line filter meets needsNarrow: true only when every alternative is non-empty ("" matches every line).
  if(source==='loki' && /^\|=/.test(m)){if(/^\|=\s*(?:"x+"|`x+`)(?:\s+or\s+(?:"x+"|`x+`))*\s*$/.test(m))pinned.push('|=');return;}
  if(source==='loki' && /^(?:\|~|!=|!~)/.test(m))return;
  if(source==='loki' && (!/^\|/.test(m) || /^\|\s*(?:json|logfmt|unpack|regexp|pattern)\b/.test(m)))return;
  // A Logs Insights fragment pins only through a top-level and chain: no parentheses or function calls (#1356 review).
  var negated=source==='grafana'?false:/\b(?:or|not)\b/i.test(m) || source==='cloudwatchLogs' && /\(/.test(m),re=source==='cloudwatchLogs'?/([@A-Za-z_][\w.@]*)\s*(==|=|!=|<>|>=|<=|>|<)\s*("x*"|'x*'|`x*`|[0-9][\w.]*)/g:/([A-Za-z_][A-Za-z0-9_]*)\s*(==|=~|!=|!~|>=|<=|=|>|<)\s*("x*"|'x*'|`x*`|-?[0-9][\w.]*)/g,hit;
  while((hit=re.exec(m))){
    named.push(hit[1]);
    var nonEmpty=/^["'`]/.test(hit[3])?hit[3].length>2:true;
    if(!negated && (hit[2]==='=' || hit[2]==='==') && nonEmpty)pinned.push(hit[1]);
  }
  if(source==='cloudwatchLogs'){var inRe=/([@A-Za-z_][\w.@]*)\s+in\s*\[([^\]]*)\]/gi;while((hit=inRe.exec(m))){named.push(hit[1]);if(!negated && /["'`]x|[0-9]/.test(hit[2]))pinned.push(hit[1]);}}
}
/* What is wrong with one fragment as written, in plain words ('' when it is fine). `at` is the
   fragment's path below narrow.<source>, for the problem's own path. */
function telemetryNarrowFragmentProblem(source,fragment){
  if(source==='honeycomb'){
    if(!telemetryNarrowObject(fragment))return {at:'',message:'a Honeycomb narrowing is {"filters": [ … ]}'};
    var extra=Object.keys(fragment).filter(function(k){return k!=='filters';});
    if(extra.length)return {at:'.'+extra[0],message:'a Honeycomb narrowing holds only filters, so '+extra[0]+' cannot be used'};
    if(!Array.isArray(fragment.filters) || !fragment.filters.length)return {at:'.filters',message:'list at least one Honeycomb filter'};
    for(var i=0;i<fragment.filters.length;i++){
      var f=fragment.filters[i],at='.filters['+i+']';
      if(!telemetryNarrowObject(f))return {at:at,message:'a Honeycomb filter is {"column", "op", "value"}'};
      var unknown=Object.keys(f).filter(function(k){return ['column','op','value'].indexOf(k)<0;});
      if(unknown.length)return {at:at+'.'+unknown[0],message:'a Honeycomb filter has only column, op and value'};
      if(typeof f.column!=='string' || !f.column.trim())return {at:at+'.column',message:'name the Honeycomb column to filter on'};
      if(TELEMETRY_HONEYCOMB_OPS.indexOf(f.op)<0)return {at:at+'.op',message:'use a Honeycomb filter operator such as "=" or "in"'};
      var bare=f.op==='exists' || f.op==='does-not-exist',list=f.op==='in' || f.op==='not-in';
      if(bare && Object.prototype.hasOwnProperty.call(f,'value'))return {at:at+'.value',message:f.op+' takes no value'};
      if(list && !(Array.isArray(f.value) && f.value.length && f.value.every(function(v){return ['string','number','boolean'].indexOf(typeof v)>=0;})))return {at:at+'.value',message:f.op+' takes a list of values'};
      if(!bare && !list && ['string','number','boolean'].indexOf(typeof f.value)<0)return {at:at+'.value',message:'give the filter a text, number or true/false value'};
    }
    return null;
  }
  if(source==='cloudwatch'){
    if(!telemetryNarrowObject(fragment))return {at:'',message:'a CloudWatch narrowing is {"dimensions": {"Name": "Value"}}'};
    var other=Object.keys(fragment).filter(function(k){return k!=='dimensions';});
    if(other.length)return {at:'.'+other[0],message:'a CloudWatch narrowing holds only dimensions, so '+other[0]+' cannot be used'};
    var d=fragment.dimensions;
    if(!telemetryNarrowObject(d) || !Object.keys(d).length)return {at:'.dimensions',message:'name at least one CloudWatch dimension'};
    var bad=Object.keys(d).filter(function(k){return !k.trim() || typeof d[k]!=='string' || !d[k].trim();});
    if(bad.length)return {at:'.dimensions.'+bad[0],message:'a CloudWatch dimension has a text name and a text value'};
    return null;
  }
  var text=source==='loki'?telemetryLokiFragmentProblem(fragment):source==='grafana'?telemetryPromFragmentProblem(fragment):source==='cloudwatchLogs'?telemetryLogsFragmentProblem(fragment):null;
  return text?{at:'',message:text}:null;
}
// The first fault in a narrow's fragments for this source, or null.
function telemetryNarrowProblem(source,narrow){
  var list=telemetryNarrowObject(narrow)?telemetryNarrowList(narrow[source]):[];
  for(var i=0;i<list.length;i++){var p=telemetryNarrowFragmentProblem(source,list[i]);if(p)return p;}
  return null;
}
// The fields a fragment pins to chosen values, for needsNarrow: a Honeycomb filter with = or in and
// a value, a CloudWatch dimension. A filter that only tests a field (exists, !=, not-in, contains …)
// still counts every value, so it does not narrow (#1353 review). `named` lists every field a
// fragment mentions, to say why a filter on it did not count.
function telemetryNarrowFields(source,fragments,named){
  var out=[];
  function pins(v){return typeof v==='number' || typeof v==='boolean' || typeof v==='string' && v.trim().length>0;}
  fragments.forEach(function(fragment){
    if(source==='honeycomb' && telemetryNarrowObject(fragment) && Array.isArray(fragment.filters))fragment.filters.forEach(function(f){
      if(!telemetryNarrowObject(f) || typeof f.column!=='string')return;
      if(named)named.push(f.column);
      if(f.op==='=' && pins(f.value) || f.op==='in' && Array.isArray(f.value) && f.value.some(pins))out.push(f.column);
    });
    if(source==='cloudwatch' && telemetryNarrowObject(fragment) && telemetryNarrowObject(fragment.dimensions))Object.keys(fragment.dimensions).forEach(function(k){
      if(named)named.push(k);
      if(pins(fragment.dimensions[k]))out.push(k);
    });
     if(['loki','grafana','cloudwatchLogs'].indexOf(source)>=0)telemetryNarrowTextFields(source,fragment,out,named || []);
  });
  return out;
}
function telemetryNarrowJoin(items){return items.length>1?items.slice(0,-1).join(', ')+' and '+items[items.length-1]:items[0];}
/* A merged signal's narrow: inherited fragments first, then the patch's, each identical fragment
   once. A patch never removes one (null is ignored; the validator says so). */
function telemetryNarrowMerge(inherited,patch){
  var out={},a=telemetryNarrowObject(inherited)?inherited:{},b=telemetryNarrowObject(patch)?patch:{};
  Object.keys(a).concat(Object.keys(b)).forEach(function(source){
    if(Object.prototype.hasOwnProperty.call(out,source))return;
    var list=[],seen=Object.create(null);
    telemetryNarrowList(a[source]).concat(telemetryNarrowList(b[source])).forEach(function(fragment){
      var key=telemetryNarrowCanonical(fragment);if(seen[key])return;seen[key]=true;list.push(fragment);
    });
    if(list.length)out[source]=list;
  });
  return Object.keys(out).length?out:null;
}
// needsNarrow only adds up: true stays true, field lists join.
function telemetryNeedsMerge(inherited,patch){
  if(inherited===true || patch===true)return true;
  var out=[];[inherited,patch].forEach(function(v){if(Array.isArray(v))v.forEach(function(f){if(typeof f==='string' && out.indexOf(f)<0)out.push(f);});});
  return out.length?out:null;
}
/* The query to send, or why the signal is not shown. kind says which rule failed: language,
   unsupported, shape, unmet, or, conflict; written is true when the fault is in a fragment as
   written (the validator reports those where they are written). fragments is the display list of
   what was applied. */
function telemetryNarrowQuery(source,query,narrow,needs){
  var label=TELEMETRY_NARROW_LABELS[source] || source;
  if(narrow!=null && !telemetryNarrowObject(narrow))return {kind:'shape',written:true,error:'This signal\'s narrowing is not keyed by its source, so it is not shown.'};
  var map=telemetryNarrowObject(narrow)?narrow:{};
  var foreign=Object.keys(map).filter(function(k){return k!==source && telemetryNarrowList(map[k]).length;});
  if(foreign.length)return {kind:'language',written:true,error:'This signal reads from '+label+', so a '+(TELEMETRY_NARROW_LABELS[foreign[0]] || foreign[0])+' narrowing cannot apply; it is not shown.'};
  var fragments=telemetryNarrowList(map[source]);
  var needed=needs===true || Array.isArray(needs) && needs.length;
  if(!fragments.length && !needed)return {query:query,fragments:[]};
  if(source==='sql' || source==='tempo')return {kind:'unsupported',written:fragments.length>0,error:label+' signals cannot be narrowed, so this one is not shown. Ask the provider to write a ${name} placeholder in its query, then set that variable.'};
  if(TELEMETRY_NARROW_STRUCTURED.indexOf(source)<0 && fragments.length)return {kind:'unsupported',written:true,error:'Flowview cannot narrow '+label+' signals, so this one is not shown.'};
  // #1353 review: a Honeycomb trace search reads its own query_spec, which a filter here cannot reach.
  if(source==='honeycomb' && fragments.length && telemetryNarrowObject(query) && Object.prototype.hasOwnProperty.call(query,'query_spec'))return {kind:'unsupported',written:true,error:'This Honeycomb trace search cannot be narrowed, so it is not shown.'};
  for(var i=0;i<fragments.length;i++){
    var problem=telemetryNarrowFragmentProblem(source,fragments[i]);
    if(problem)return {kind:'shape',written:true,error:'A '+label+' narrowing of this signal is not valid ('+problem.message+'), so it is not shown.'};
  }
  if(needed){
    var mentioned=[],pinned=telemetryNarrowFields(source,fragments,mentioned);
    var missing=needs===true?(pinned.length?[]:['*']):needs.filter(function(f){return pinned.indexOf(f)<0;});
    if(missing.length){
      // A filter on a required field that does not pin it is named, so the board sees why it did not count.
      var tested=needs===true?mentioned.length>0:missing.some(function(f){return mentioned.indexOf(f)>=0;});
      if(tested)return {kind:'unmet',error:'The provider asks each board to narrow this signal'+(needs===true?'; a filter':' by '+telemetryNarrowJoin(missing)+'; a filter on '+telemetryNarrowJoin(missing))+' counts only with '+(source==='cloudwatch'?'a dimension value':source==='loki' || source==='grafana'?'= and a value':'= or in and a value')+', so it is not shown.'};
      return {kind:'unmet',error:'The provider asks each board to narrow this signal'+(needs===true?'':' by '+telemetryNarrowJoin(missing))+', and nothing narrows it here, so it is not shown.'};
    }
  }
  if(!fragments.length)return {query:query,fragments:[]};
  if(source==='loki'){var placed=telemetryLokiPlace(query,fragments.map(function(f){return f.trim();}));return placed.error?placed:{query:placed.query,fragments:fragments.map(function(f){return f.trim();})};}
  if(source==='grafana'){var text=fragments.map(function(f){return f.trim();}).join(',');var put=telemetryPromPlace(query,text);return put.error?put:{query:put.query,fragments:fragments.map(function(f){return f.trim();})};}
  if(source==='cloudwatchLogs'){
    var logs=JSON.parse(JSON.stringify(query)),total=telemetryLogsPlace(logs.query,fragments);if(total.error)return total;
    logs.query=total.query;var result={query:logs,fragments:fragments.map(function(f){return f.trim();})};
    // The optional details and trend queries are narrowed too; a failure there stops only them.
    ['breakdown','trend'].forEach(function(key){
      if(!telemetryNarrowObject(logs[key]) || typeof logs[key].query!=='string')return;
      var side=telemetryLogsPlace(logs[key].query,fragments);
      if(side.error)result[key+'Error']=side.error;else logs[key].query=side.query;
    });
    return result;
  }
  var out=JSON.parse(JSON.stringify(query)),shown=[];
  if(source==='honeycomb'){
    if(typeof out.filter_combination==='string' && out.filter_combination.toUpperCase()==='OR')return {kind:'or',error:'This Honeycomb query combines its filters with OR, so a filter cannot be added safely; it is not shown.'};
    out.filters=Array.isArray(out.filters)?out.filters:[];
    fragments.forEach(function(fragment){fragment.filters.forEach(function(f){
      out.filters.push(JSON.parse(JSON.stringify(f)));
      shown.push(f.column+' '+f.op+(Object.prototype.hasOwnProperty.call(f,'value')?' '+(Array.isArray(f.value)?'['+f.value.join(', ')+']':String(f.value)):''));
    });});
    return {query:out,fragments:shown};
  }
  // CloudWatch matches the whole dimension set: a dimension the query or another fragment sets to
  // a different value can never match.
  out.dimensions=telemetryNarrowObject(out.dimensions)?out.dimensions:{};
  var from=Object.create(null);Object.keys(out.dimensions).forEach(function(k){from[k]='query';});
  for(var j=0;j<fragments.length;j++){
    var dims=fragments[j].dimensions,keys=Object.keys(dims);
    for(var k=0;k<keys.length;k++){
      var name=keys[k],value=dims[name];
      if(Object.prototype.hasOwnProperty.call(out.dimensions,name) && out.dimensions[name]!==value)
        return {kind:'conflict',error:'Dimension '+name+' is '+out.dimensions[name]+(from[name]==='query'?' in the provider\'s query':' in one narrowing')+' and '+value+' in another narrowing, so nothing can match; it is not shown.'};
      if(!Object.prototype.hasOwnProperty.call(out.dimensions,name)){out.dimensions[name]=value;from[name]='narrow';shown.push(name+' = '+value);}
    }
  }
  return {query:out,fragments:shown};
}

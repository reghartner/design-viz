/* Authored references only; live Jira state never belongs in the spec.
   The optional invalid callback lets validation report original entry indices
   while every consumer shares the same filtering and deduplication rules. */
var trackingKeyPattern = /^[A-Z][A-Z0-9_]+-[0-9]+$/;
function trackingRefs(obj, invalid){
  var refs = {tickets:[], prs:[]};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return refs;
  ['tickets', 'prs'].forEach(function(field){
    if (!Object.prototype.hasOwnProperty.call(obj, field)) return;
    if (!Array.isArray(obj[field])){
      if (invalid) invalid(field, null);
      return;
    }
    obj[field].forEach(function(value, index){
      var ref = field === 'tickets'
        ? (typeof value === 'string' && trackingKeyPattern.test(value) ? value : null)
        : deltaLinkUrl(value);
      if (ref === null){
        if (invalid) invalid(field, index);
      } else if (refs[field].indexOf(ref) < 0) refs[field].push(ref);
    });
  });
  return refs;
}
/* Page-level parent roots (legacy `epic` field) share the ticket key grammar.
   Jira metadata determines whether each root is an Epic or an Initiative. */
function trackingEpics(page,invalid){
  var jira=page && page.tracking && page.tracking.jira,out=[];
  if(!jira || !Object.prototype.hasOwnProperty.call(jira,'epic'))return out;
  var value=jira.epic;
  if(typeof value!=='string' && !Array.isArray(value)){if(invalid)invalid(null);return out;}
  (Array.isArray(value)?value:[value]).forEach(function(key,index){
    if(typeof key!=='string' || !trackingKeyPattern.test(key)){if(invalid)invalid(Array.isArray(value)?index:null);}
    else if(out.indexOf(key)<0)out.push(key);
  });return out;
}
/* GitHub discovery is always bounded to authored repositories or an org. */
var trackingGithubRepoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
var trackingGithubOrgPattern=/^[A-Za-z0-9_.-]+$/;
function trackingGithubScope(page,invalid){
  var out={repos:[],org:null},tracking=page && page.tracking;
  if(!tracking || !Object.prototype.hasOwnProperty.call(tracking,'github'))return out;
  var github=tracking.github;
  if(!github || typeof github!=='object' || Array.isArray(github)){if(invalid)invalid('',null);return out;}
  if(Object.prototype.hasOwnProperty.call(github,'repos')){
    if(!Array.isArray(github.repos)){if(invalid)invalid('.repos',null);}
    else github.repos.forEach(function(repo,index){
      if(typeof repo!=='string' || !trackingGithubRepoPattern.test(repo)){if(invalid)invalid('.repos',index);}
      else if(out.repos.indexOf(repo)<0)out.repos.push(repo);
    });
  }
  if(Object.prototype.hasOwnProperty.call(github,'org')){
    if(typeof github.org==='string' && trackingGithubOrgPattern.test(github.org))out.org=github.org;
    else if(invalid)invalid('.org',null);
  }
  return out;
}
/* Authored delivery dependencies (#765): ticket -> ticket pairs the design source
   implies, merged at runtime with Jira issue links. Never derived from edges. */
function trackingDependencies(page,invalid){
  var tracking=page && page.tracking,out=[];
  if(!tracking || typeof tracking!=='object' || !Object.prototype.hasOwnProperty.call(tracking,'dependencies'))return out;
  var value=tracking.dependencies;
  if(!Array.isArray(value)){if(invalid)invalid(null);return out;}
  value.forEach(function(entry,index){
    var ok=entry && typeof entry==='object' && !Array.isArray(entry) &&
      typeof entry.ticket==='string' && trackingKeyPattern.test(entry.ticket) &&
      typeof entry.on==='string' && trackingKeyPattern.test(entry.on) && entry.ticket!==entry.on &&
      (!Object.prototype.hasOwnProperty.call(entry,'reason') || typeof entry.reason==='string');
    if(!ok){if(invalid)invalid(index);return;}
    if(out.some(function(item){return item.ticket===entry.ticket && item.on===entry.on;}))return;
    var item={ticket:entry.ticket,on:entry.on};if(typeof entry.reason==='string' && entry.reason.trim())item.reason=entry.reason.trim();out.push(item);
  });
  return out;
}
/* Jira link descriptions (as shown on the dependent issue) that mean "waits on". */
var TRACKING_DEFAULT_DEPENDENCY_LINKS=['is blocked by','depends on'];
function trackingDependencyLinks(page,invalid){
  var jira=page && page.tracking && page.tracking.jira;
  if(!jira || typeof jira!=='object' || !Object.prototype.hasOwnProperty.call(jira,'dependencyLinks'))return TRACKING_DEFAULT_DEPENDENCY_LINKS.slice();
  var value=jira.dependencyLinks,out=[];
  if(!Array.isArray(value)){if(invalid)invalid(null);return TRACKING_DEFAULT_DEPENDENCY_LINKS.slice();}
  value.forEach(function(name,index){
    var text=typeof name==='string'?name.trim().toLowerCase():'';
    if(!text){if(invalid)invalid(index);return;}
    if(out.indexOf(text)<0)out.push(text);
  });
  return out.length?out:TRACKING_DEFAULT_DEPENDENCY_LINKS.slice();
}

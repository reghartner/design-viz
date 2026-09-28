/* A readable, inert story ledger and a portable snapshot. Referenced files are
   identified only; this module never reads or fetches their contents. */
function parseStoryLedger(value){
  var text=typeof value==='string'?value:'',limit=1024*1024;
  if(new TextEncoder().encode(text).length>limit)throw Error('The story ledger exceeds 1 MiB. Ask Claude to shorten it before preparing a handoff.');
  var sections=[],current={title:'Source and coverage',text:''},fence=null;
  text.replace(/\r\n?/g,'\n').split('\n').forEach(function(line){
    var marker=line.match(/^\s*(`{3,}|~{3,})/);
    if(marker){if(!fence)fence=marker[1][0];else if(marker[1][0]===fence)fence=null;}
    var heading=!fence && line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if(heading){if(current.text.trim())sections.push({title:current.title,text:current.text.trim()});current={title:heading[1],text:''};}
    else current.text+=line+'\n';
  });
  if(current.text.trim())sections.push({title:current.title,text:current.text.trim()});
  var groups={intent:[],behavior:[],decisions:[],assumptions:[],questions:[],evidence:[],other:[]};
  sections.forEach(function(section){
    var name=section.title.toLowerCase(),kind=/^(?:a\.\s*)?story$|audience|takeaway|intent|narration/.test(name)?'intent':
      /agreed|accepted|amendment|operator answer|behavior|behaviour/.test(name)?'behavior':
      /assum/.test(name)?'assumptions':/question|gap|conflict|unresolved|unknown/.test(name)?'questions':
      /decision/.test(name)?'decisions':/source|coverage|evidence|reference/.test(name)?'evidence':'other';
    groups[kind].push(section);
  });
  return {text:text,sections:sections,groups:groups};
}

function storyBriefReferences(raw,ledger){
  var refs=[],seen=new Set(),visited=0;
  function add(kind,location,value){
    if(refs.length>=1000)throw Error('This story has more than 1,000 references. Narrow the handoff before exporting.');
    var key=kind+'|'+location+'|'+JSON.stringify(value);if(seen.has(key))return;seen.add(key);
    refs.push({kind:kind,location:location,reference:value,contentsIncluded:false});
  }
  function walk(value,path,depth){
    if(!value || typeof value!=='object')return;
    if(depth>80 || ++visited>100000)throw Error('The story is too deeply nested to prepare a handoff.');
    Object.keys(value).forEach(function(key){
      var item=value[key],location=path+'.'+key;
      if(key==='codeRefs' && Array.isArray(item))item.forEach(function(ref,index){add('code',location+'['+index+']',ref);});
      else if(key==='generatedFrom' && item && typeof item==='object')add('source',location,item);
      else if(key==='binding' && item && typeof item==='object')add('service',location,item);
      else if(key==='source' && (typeof item==='string' && /^(?:https?:\/\/|\.?\.?\/|~\/)/i.test(item) || item && typeof item==='object' && (item.url || item.path)))add('source',location,item);
      if(key!=='storyBrief')walk(item,location,depth+1);
    });
  }
  walk(raw,'spec',0);
  var evidence=raw && raw.storyBrief && raw.storyBrief.evidence;
  if(Array.isArray(evidence))evidence.forEach(function(item,index){add('engineering-evidence','spec.storyBrief.evidence['+index+']',item);});
  (ledger || '').split(/\r?\n/).forEach(function(line,index){
    if(/^\s*source\s*:/i.test(line))add('ledger-source','story.ledger.md:'+String(index+1),line.trim());
    var matcher=/https?:\/\/[^\s<>|\]]+/g,match;
    while((match=matcher.exec(line)))add('ledger-link','story.ledger.md:'+String(index+1),match[0].replace(/[),;]+$/,''));
  });
  return refs;
}

function storyBriefLedgerStatus(ledger,snapshot){
  if(!ledger || !ledger.text)return {state:'missing',text:'No story ledger is available. Connect Claude or include the brief and open questions before sharing.'};
  if(ledger.sourceMatches===false || ledger.stale===true || ledger.source && ledger.source!==snapshot.source)
    return {state:'stale',text:'The story has changed since this ledger was checked. Review its decisions and evidence before sharing.'};
  if(ledger.sourceMatches===true || ledger.source && ledger.source===snapshot.source)
    return {state:'matched',text:'Read from the connected session for this story. Evidence and outcomes still need human review.'};
  return {state:'unverified',text:'Ledger available. Its correspondence to the current story has not been confirmed.'};
}

function buildStoryHandoff(options){
  var source=options.source;
  if(typeof source!=='string' || new TextEncoder().encode(source).length>4*1024*1024)throw Error('Handoff needs a story of at most 4 MiB.');
  var raw;try{raw=JSON.parse(source);}catch(ex){throw Error('Fix the story JSON before preparing a handoff.');}
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw Error('Handoff needs a story object.');
  if(typeof options.html!=='string' || !options.html.trim())throw Error('A viewable story could not be generated. The handoff was not downloaded.');
  var ledger=typeof options.ledger==='string'?{text:options.ledger}:options.ledger || null;
  var parsed=parseStoryLedger(ledger && ledger.text || ''),page=raw.page || raw;
  var title=typeof page.title==='string'?page.title:'Untitled story';
  var slug=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'story';
  var status=storyBriefLedgerStatus(ledger,{source:source});
  var manifest={format:'flowview-engineering-handoff',version:1,title:title,preparedAt:options.at || new Date().toISOString(),
    publication:'local-draft',provenance:options.provenance || null,ledger:{status:status.state,note:status.text,
      checkedRevision:ledger && (ledger.sourceRevision || ledger.revision) || null,readAt:ledger && ledger.readAt || null},
    references:storyBriefReferences(raw,parsed.text)};
  var changes=Array.isArray(options.changes)?options.changes.slice(-100):[];
  var summary=['# '+title,'','This is a local draft prepared for human review. Downloading or opening this package does not publish it.','',
    '## Files','','- story.spec.json — editable story; open it in Flowview Workbench.',
    '- story.html — generated viewer for the same story snapshot.',
    '- story.ledger.md — story brief, decisions, assumptions and unresolved questions from the session.',
    '- sources.json — source references and provenance; referenced source file contents are not included.',
    '- changes.json — available agent change receipts, not a complete audit of every manual edit.','',
    '## Review before engineering work','',status.text,
    'Read the agreed behavior and intended customer outcome first. Treat assumptions and conflicting evidence as open decisions. Enrich the same story; review changes to the promised outcome with its author.',
    'The viewer may reference external media or links authored in the story. Those assets are not copied into this package.','',
    '## Change summary',''];
  if(changes.length)changes.forEach(function(change){summary.push('- '+String(change.summary || change.message || 'Agent change')+' ('+String(change.status || 'recorded')+')');});
  else summary.push('No agent change receipts are available in this session. Review the editable story against its source.');
  var files=[{name:'story.spec.json',text:source},{name:'story.html',text:options.html},
    {name:'story.ledger.md',text:parsed.text || '# Story ledger unavailable\n\nNo ledger was available when this handoff was prepared. Confirm intent, decisions, assumptions, and open questions with the author.\n'},
    {name:'sources.json',text:JSON.stringify(manifest,null,2)+'\n'},
    {name:'changes.json',text:JSON.stringify(changes,null,2)+'\n'},
    {name:'README.md',text:summary.join('\n')+'\n'}];
  return {name:slug+'-engineering-handoff.zip',files:files,manifest:manifest};
}

/* ZIP32, stored entries. A single explicit download works offline and needs no
   archive library, source-file access or multiple-download permissions. */
function storyBriefZip(files){
  var encoder=new TextEncoder(),entries=[],offset=0,total=22,limit=48*1024*1024;
  if(!Array.isArray(files) || files.length>100)throw Error('Invalid handoff file list.');
  var names=new Set();
  files.forEach(function(file){
    if(!file || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(file.name) || names.has(file.name))throw Error('Invalid handoff file name.');
    names.add(file.name);var name=encoder.encode(file.name),bytes=encoder.encode(String(file.text)),crc=0xffffffff;
    for(var i=0;i<bytes.length;i++){crc^=bytes[i];for(var bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    entries.push({name:name,bytes:bytes,crc:(crc^0xffffffff)>>>0,offset:offset});
    offset+=30+name.length+bytes.length;total+=76+name.length*2+bytes.length;
    if(total>limit)throw Error('This handoff exceeds 48 MiB. Reduce embedded assets before exporting.');
  });
  var out=new Uint8Array(total),view=new DataView(out.buffer),cursor=0;
  function u16(at,value){view.setUint16(at,value,true);}function u32(at,value){view.setUint32(at,value,true);}
  entries.forEach(function(entry){
    u32(cursor,0x04034b50);u16(cursor+4,20);u16(cursor+6,0x800);u16(cursor+12,33);u32(cursor+14,entry.crc);
    u32(cursor+18,entry.bytes.length);u32(cursor+22,entry.bytes.length);u16(cursor+26,entry.name.length);
    out.set(entry.name,cursor+30);out.set(entry.bytes,cursor+30+entry.name.length);cursor+=30+entry.name.length+entry.bytes.length;
  });
  var central=cursor;
  entries.forEach(function(entry){
    u32(cursor,0x02014b50);u16(cursor+4,20);u16(cursor+6,20);u16(cursor+8,0x800);u16(cursor+14,33);
    u32(cursor+16,entry.crc);u32(cursor+20,entry.bytes.length);u32(cursor+24,entry.bytes.length);u16(cursor+28,entry.name.length);u32(cursor+42,entry.offset);
    out.set(entry.name,cursor+46);cursor+=46+entry.name.length;
  });
  u32(cursor,0x06054b50);u16(cursor+8,entries.length);u16(cursor+10,entries.length);u32(cursor+12,cursor-central);u32(cursor+16,central);
  return out;
}

function initWorkbenchStoryBrief(opts){
  var document=opts.document,mount=document.getElementById('editor-brief'),disposed=false,run=0,exportRun=0,exporting=false,lastSource=null,lastProject=null,ledger=null,listeners=[],urls=new Set(),timers=new Set();
  if(!mount)return {refresh:function(){},destroy:function(){}};
  var content=document.createElement('div');content.className='story-brief-content';mount.appendChild(content);
  function el(tag,text,parent,className){var node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;(parent || content).appendChild(node);return node;}
  function listen(node,type,fn){node.addEventListener(type,fn);listeners.push(function(){node.removeEventListener(type,fn);});}
  var lead=el('p','The story, its decisions, and the evidence an engineer needs. Keep the intended outcome visible as the implementation grows.',null,'story-brief-intro');
  var provenance=el('p','Local draft',null,'story-brief-provenance');
  var actions=el('div',undefined,null,'story-brief-actions'),refreshButton=el('button','Refresh brief',actions),handoffButton=el('button','Prepare engineering handoff',actions);
  refreshButton.type=handoffButton.type='button';refreshButton.className='bbtn';handoffButton.className='rbtn';
  var status=el('p','',null,'story-brief-status');status.setAttribute('role','status');
  var body=el('div',undefined,null,'story-brief-sections');
  var evidenceForm=null,evidenceTarget=null,evidenceReference=null,evidenceNote=null,evidenceRelationship=null,evidenceStatus=null;
  if(opts.addEvidence){
    var details=el('details',undefined,null,'story-brief-add-evidence');el('summary','Add engineering evidence',details);
    el('p','Attach support or a conflict to a story moment. This records a reference and leaves the agreed story unchanged.',details);
    evidenceForm=el('form',undefined,details);
    function field(label,tag,name){var wrap=el('label',label,evidenceForm),input=el(tag,undefined,wrap);input.name=name;return input;}
    evidenceTarget=field('Story moment','select','storyTarget');evidenceReference=field('Source reference (URL, path, or document name)','input','reference');evidenceReference.required=true;evidenceReference.maxLength=2000;
    evidenceRelationship=field('What it establishes','select','relationship');[['unverified','Needs verification'],['supports','Supports the story'],['conflicts','Conflicts — needs a decision']].forEach(function(pair){var option=el('option',pair[1],evidenceRelationship);option.value=pair[0];});
    evidenceNote=field('Evidence and question','textarea','note');evidenceNote.required=true;evidenceNote.maxLength=4000;evidenceNote.rows=3;
    var submit=el('button','Attach evidence',evidenceForm);submit.type='submit';submit.className='bbtn';evidenceStatus=el('p','',evidenceForm);evidenceStatus.setAttribute('role','status');
    listen(evidenceForm,'submit',async function(event){
      event.preventDefault();if(disposed || submit.disabled)return;
      var snap=opts.snapshot(),target;try{target=JSON.parse(evidenceTarget.value);}catch(ex){evidenceStatus.textContent='Choose a story moment first.';return;}
      var note=evidenceNote.value.trim(),reference=evidenceReference.value.trim();if(!note || !reference)return;
      submit.disabled=true;try{
        var result=await opts.addEvidence({storyTarget:target,reference:reference,note:note,relationship:evidenceRelationship.value},snap);
        // A successful attachment intentionally changes the source. Only project
        // ownership and lifetime must still match after that mutation.
        if(!currentProject(snap))return;
        if(!result || result.ok!==true)throw Error(result && result.error || 'The evidence could not be attached.');
        evidenceReference.value='';evidenceNote.value='';evidenceStatus.textContent='Evidence attached. Review conflicts before changing the agreed outcome.';await refresh();
      }catch(ex){if(currentProject(snap))evidenceStatus.textContent=ex.message;}finally{if(!disposed)submit.disabled=false;}
    });
  }
  function currentProject(snapshot){if(disposed)return false;var next=opts.snapshot();return next.open!==false && next.project===snapshot.project;}
  function current(snapshot){return currentProject(snapshot) && opts.snapshot().source===snapshot.source;}
  function sourceProvenance(){return typeof opts.provenance==='function'?opts.provenance():opts.provenance || null;}
  function paint(snapshot,error){
    if(disposed)return;body.textContent='';
    var raw;try{raw=JSON.parse(snapshot.source);}catch(ex){}
    var page=raw && (raw.page || raw),summary=sourceProvenance();
    provenance.textContent=typeof summary==='string'?summary:'Local draft'+(summary && (summary.title || summary.sourceTitle)?' · Based on '+(summary.title || summary.sourceTitle):'');
    if(!raw || typeof raw!=='object' || Array.isArray(raw)){el('p','Open a story with valid JSON to review its brief.',body);status.textContent='The current story cannot be prepared for review yet.';handoffButton.disabled=true;return;}
    handoffButton.disabled=exporting || !opts.renderHtml || snapshot.open===false;lead.textContent=(page.title || 'Untitled story')+' · Intent, decisions, evidence and unresolved questions.';
    var parsed;try{parsed=parseStoryLedger(ledger && ledger.text || '');}catch(ex){error=ex.message;parsed=parseStoryLedger('');}
    var check=storyBriefLedgerStatus(ledger,snapshot);status.textContent=error || check.text;status.dataset.state=error?'error':check.state;
    var labels={intent:'Intent & audience',behavior:'Agreed behavior & answers',decisions:'Decisions to review',assumptions:'Assumptions',questions:'Questions & engineering gaps'};
    Object.keys(labels).forEach(function(key){
      var section=el('section',undefined,body,'story-brief-section');el('h3',labels[key],section);
      if(!parsed.groups[key].length)el('p','No dedicated section in the ledger yet. Review the full worksheet for related notes.',section,'story-brief-empty');
      parsed.groups[key].forEach(function(part){appendStoryBriefText(document,section,part.text);});
    });
    var evidence=el('section',undefined,body,'story-brief-section');el('h3','Source references & engineering evidence',evidence);
    var refs=[];try{refs=storyBriefReferences(raw,parsed.text);}catch(ex){el('p',ex.message,evidence);}
    if(!refs.length)el('p','No source references recorded. Ask for evidence before treating the story as confirmed implementation.',evidence,'story-brief-empty');
    refs.forEach(function(ref){var item=el('div',undefined,evidence,'story-brief-reference');
      if(ref.kind==='engineering-evidence'){var value=ref.reference && typeof ref.reference==='object'?ref.reference:{note:String(ref.reference)};el('strong',value.relationship==='conflicts'?'Conflict — needs a decision':value.relationship==='supports'?'Supporting evidence':'Unverified evidence',item);el('p',value.reference,item);el('p',value.note,item);el('small',JSON.stringify(value.storyTarget),item);}
      else{el('strong',ref.kind==='code'?'Code reference':ref.kind==='service'?'Service reference':'Source reference',item);el('pre',typeof ref.reference==='string'?ref.reference:JSON.stringify(ref.reference,null,2),item);el('small',ref.location,item);}
    });
    parsed.groups.other.forEach(function(part){var extra=el('details',undefined,body,'story-brief-full');el('summary',part.title,extra);appendStoryBriefText(document,extra,part.text);});
    if(parsed.text){var full=el('details',undefined,body,'story-brief-full');el('summary','Full ledger · source and worksheet',full);el('pre',parsed.text,full,'story-brief-ledger-text');}
    if(evidenceTarget){
      var prior=evidenceTarget.value;evidenceTarget.textContent='';
      storyBriefTargets(raw).forEach(function(target){var option=el('option',target.label,evidenceTarget);option.value=JSON.stringify(target.value);});
      if(Array.from(evidenceTarget.options).some(function(option){return option.value===prior;}))evidenceTarget.value=prior;
    }
  }
  async function refresh(){
    if(disposed)return;var token=++run,snapshot=opts.snapshot();
    if(snapshot.source!==lastSource || snapshot.project!==lastProject){ledger=null;lastSource=snapshot.source;lastProject=snapshot.project;}
    paint(snapshot);if(!opts.readLedger || snapshot.open===false)return;
    try{var next=await opts.readLedger();if(token!==run || !current(snapshot))return;ledger=typeof next==='string'?{text:next}:next;paint(snapshot);}
    catch(ex){if(token===run && current(snapshot))paint(snapshot,'Could not read the story ledger: '+ex.message);}
  }
  function release(url){if(!urls.delete(url))return;document.defaultView.URL.revokeObjectURL(url);}
  listen(refreshButton,'click',refresh);
  listen(handoffButton,'click',async function(){
    if(disposed || handoffButton.disabled)return;var token=++exportRun,snapshot=opts.snapshot();exporting=true;handoffButton.disabled=true;status.textContent='Preparing a snapshot for engineering review…';
    try{
      var freshLedger=opts.readLedger?await opts.readLedger():ledger;
      if(token!==exportRun || !current(snapshot))throw Error('The story changed while preparing the handoff. Prepare it again to include the current draft.');
      var html=await opts.renderHtml(snapshot.source);
      if(token!==exportRun || !current(snapshot))throw Error('The story changed while preparing the handoff. Prepare it again to include the current draft.');
      var summary=sourceProvenance(),bundle=buildStoryHandoff({source:snapshot.source,html:html,ledger:freshLedger,provenance:summary,changes:summary && summary.changes});
      var zip=storyBriefZip(bundle.files),win=document.defaultView,url=win.URL.createObjectURL(new win.Blob([zip],{type:'application/zip'})),anchor=document.createElement('a');urls.add(url);anchor.href=url;anchor.download=bundle.name;
      try{document.body.appendChild(anchor);anchor.click();}catch(ex){release(url);throw ex;}finally{anchor.remove();}
      var timer=win.setTimeout(function(){timers.delete(timer);release(url);},1000);timers.add(timer);
      status.textContent='Handoff downloaded as a local draft. Review its brief, gaps, and references before sharing or submitting it to your team.';
    }catch(ex){if(!disposed && token===exportRun)status.textContent=ex.message;}
    finally{if(!disposed && token===exportRun){exporting=false;handoffButton.disabled=!opts.renderHtml || opts.snapshot().open===false;}}
  });
  refresh();
  return {refresh:refresh,destroy:function(){if(disposed)return;disposed=true;run++;exportRun++;listeners.forEach(function(remove){remove();});timers.forEach(function(timer){document.defaultView.clearTimeout(timer);});urls.forEach(release);content.remove();}};
}

function storyBriefTargets(raw){
  var targets=[{label:'Whole story',value:{kind:'story'}}],records=[];
  function collect(page){
    var sections=page && (page.blocks || page.sections);if(!Array.isArray(sections))return;
    sections.forEach(function(section){
      if(section && Array.isArray(section.tabs))section.tabs.forEach(collect);
      else if(section)records.push({section:section,diagram:section.diagram,id:section.id});
    });
  }
  if(raw && raw.nodes && raw.rows)records.push({section:raw,diagram:raw,id:'$root'});
  else collect(raw && (raw.page || raw));
  function safeId(id){return typeof id==='string' && !!id.trim() && !['__proto__','constructor','prototype'].includes(id);}
  records.forEach(function(record){
    var section=record.section,sectionId=record.id;
    if(!safeId(sectionId) || records.filter(function(item){return item.id===sectionId;}).length!==1)return;
    var label=section.heading || section.title || sectionId;targets.push({label:label,value:{kind:'section',sectionId:sectionId}});
    var diagram=record.diagram;if(!diagram)return;
    Object.keys(diagram.nodes || {}).forEach(function(id){if(safeId(id))targets.push({label:label+' / '+(diagram.nodes[id] && diagram.nodes[id].title || id),value:{kind:'node',sectionId:sectionId,id:id}});});
    var steps=Array.isArray(diagram.steps)?diagram.steps:[];
    steps.forEach(function(step){if(step && safeId(step.id) && steps.filter(function(item){return item && item.id===step.id;}).length===1)targets.push({label:label+' / '+(step.label || step.text || step.id),value:{kind:'step',sectionId:sectionId,id:step.id}});});
  });
  return targets;
}

/* Deliberately small formatting vocabulary: paragraphs, lists and tables.
   Markup and URLs stay literal text; no HTML, images, script or link handlers. */
function appendStoryBriefText(document,parent,text){
  function cell(value){return value.replace(/\\\|/g,'|').replace(/<br\s*\/?\s*>/gi,'\n').trim();}
  function cells(line){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(cell);}
  function append(tag,value,host){var node=document.createElement(tag);node.textContent=value;(host || parent).appendChild(node);return node;}
  var lines=text.split('\n'),i=0;
  while(i<lines.length){
    if(!lines[i].trim()){i++;continue;}
    if(i+1<lines.length && lines[i].indexOf('|')>=0 && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
      var wrapper=append('div','');wrapper.className='story-brief-table';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','Story ledger table');
      var table=append('table','',wrapper),thead=append('thead','',table),head=append('tr','',thead),tbody=append('tbody','',table);
      cells(lines[i]).forEach(function(value){append('th',value,head);});i+=2;
      while(i<lines.length && lines[i].trim() && lines[i].indexOf('|')>=0){var row=append('tr','',tbody);cells(lines[i++]).forEach(function(value){append('td',value,row);});}
    }else if(/^\s*[-*]\s+/.test(lines[i])){
      var list=append('ul','');while(i<lines.length && /^\s*[-*]\s+/.test(lines[i]))append('li',lines[i++].replace(/^\s*[-*]\s+/,''),list);
    }else{
      var paragraph=[];while(i<lines.length && lines[i].trim() && !(paragraph.length && (i+1<lines.length && lines[i+1].match(/^\s*\|?\s*:?-{3,}/) || /^\s*[-*]\s+/.test(lines[i]))))paragraph.push(lines[i++]);
      append('p',paragraph.join('\n')).className='story-brief-ledger-text';
    }
  }
}

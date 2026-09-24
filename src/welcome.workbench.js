/* Local project entry and agent handoff. Project writes belong to the builder. */
function welcomeBlankSpec(title){
  return {page:{title:title || 'Untitled project',skin:'pastel',blocks:[{heading:'Your diagram',diagram:{nodes:{},rows:[[]],edges:[],steps:[]}}]}};
}

function welcomeRepository(raw, revision){
  var url;
  try { url = new URL(String(raw).trim()); } catch (ex){ return {error:'Enter a full GitHub repository URL, starting with https://.'}; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    return {error:'Use an HTTPS repository URL without credentials, a query, or a fragment.'};
  var path = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
  if (path.split('/').filter(Boolean).length !== 2)
    return {error:'Use the repository root, such as https://github.com/your-team/design-viz.'};
  revision = String(revision || '').trim();
  if (!revision || /[\s?#]/.test(revision)) return {error:'Enter a branch, tag, or commit without spaces, ? or #.'};
  var repository = url.origin + path;
  return {repository:repository, revision:revision,
    skill:repository + '/blob/' + encodeURIComponent(revision) + '/.claude/skills/hld-to-page/SKILL.md'};
}

function welcomeAgentPrompt(kind, brief, audience, repository){
  var task = {
    design:'Create a Flowview diagram from the design, documentation, or system description I provide.',
    code:'Create a Flowview diagram explaining a specific flow in my codebase. Find and cite the implementation that supports each important step.',
    improve:'Improve the Flowview spec I provide using its source material. Preserve existing supported behavior and paths while making the explanation clearer.'
  }[kind] || 'Create a Flowview diagram from my source material.';
  return [task, '', 'First read and follow the Flowview authoring skill:', repository.skill,
    'Toolkit repository: ' + repository.repository + ' (revision: ' + repository.revision + ').',
    'Use an available checkout of that revision, or obtain one if needed. Resolve the skill’s referenced files in that checkout.', '',
    'Audience: ' + audience + '.',
    brief.trim() ? 'My brief: ' + brief.trim() : 'Start by locating the source material I provide and identifying the question this diagram should answer.', '',
    'Plan the story and meaningful outcomes before writing JSON. Ground actors, steps, state changes, failures, and numbers in the sources. Identify unknowns and label hypothetical behavior.',
    'Use the pastel skin and target a readable desktop experience. Choose useful panels and alternate paths; keep shared events on one timeline when showing multiple perspectives.', '',
    'Deliver a .spec.json file and a .ledger.md coverage ledger in my project. Validate with the toolkit’s tools/validate.js, build the standalone page with tools/page_build.py, and inspect the result as the skill directs. Keep the toolkit itself unchanged.',
    'Tell me which .spec.json to open in Flowview Workbench. If you cannot access the skill or run a check, say so clearly rather than claiming it passed.'
  ].join('\n');
}

/* Stable public links identify a document, independent of its source filename. */
function canonDiagramURL(href,id){
  var url=new URL(href);url.search='';url.hash='';url.searchParams.set('diagram',id);return url.href;
}

/* Screens are history entries, not project snapshots. The small visit marker
   only retires an old Canon attachment; authored text stays in the draft owner. */
function createWelcomeNavigation(win, initial, changed){
  var key='flowviewWorkbenchEntry', retiredPrefix='dv-workbench-retired-entry-';
  var names=['home','paste','new','agent','editor','library','reader'];
  function read(state){
    var value=state && state[key];
    return value && value.v===1 && names.indexOf(value.screen)>=0 &&
      typeof value.visit==='string' && value.visit.length>0 && value.visit.length<100 &&
      Number.isSafeInteger(value.depth) && value.depth>=0 ? value : null;
  }
  var current=read(win.history.state), retiredVisits=new Set();
  if(!current)current={v:1,screen:initial,visit:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),depth:0,canon:!!new URL(win.location.href).searchParams.get('canon')};
  var linked=new URL(win.location.href).searchParams;
  if(linked.has('diagram')){
    current=Object.assign({},current,{screen:'reader',diagram:linked.get('diagram'),shareable:true,canon:false});
  }
  function wasRetired(route){
    var retired=!!route.retired || retiredVisits.has(route.visit);
    try{retired=retired || win.sessionStorage.getItem(retiredPrefix+route.visit)==='1';}catch(ex){}
    if(retired)retiredVisits.add(route.visit);
    return retired;
  }
  var retired=wasRetired(current);
  function stateWith(route){
    var previous=win.history.state, next;
    if(previous && typeof previous==='object' && !Array.isArray(previous)){
      next={};Object.keys(previous).forEach(function(name){Object.defineProperty(next,name,{value:previous[name],writable:true,enumerable:true,configurable:true});});
    }else next=previous==null?{}:{flowviewPreviousState:previous};
    next[key]=route;return next;
  }
  function cleanCanon(){
    if(!retired || !current.canon)return;
    var url=new URL(win.location.href);
    if(!url.searchParams.has('canon') && !url.searchParams.has('review'))return;
    /* Keep unrelated query bytes (including encoding) and the fragment intact. */
    var fields=url.search.slice(1).split('&').filter(function(field){
      var params=new URLSearchParams(field);return !params.has('canon') && !params.has('review');
    });
    win.history.replaceState(win.history.state,'',url.pathname+(fields.length?'?'+fields.join('&'):'')+url.hash);
  }
  function write(screen,replace,diagram,shareable){
    var selected=diagram===undefined?current.diagram:diagram;
    var published=shareable===undefined?current.shareable!==false:shareable;
    current={v:1,screen:screen,visit:current.visit,depth:current.depth+(replace?0:1),canon:!!current.canon,retired:retired};
    if(screen==='reader' && typeof selected==='string'){
      current.diagram=selected;current.shareable=published;
    }
    var url=new URL(win.location.href);
    var fields=url.search.slice(1).split('&').filter(function(field){
      var params=new URLSearchParams(field);
      return field && !params.has('diagram') && (screen!=='reader' || !params.has('canon') && !params.has('review'));
    });
    if(screen==='reader' && published && typeof selected==='string')fields.push('diagram='+encodeURIComponent(selected));
    win.history[replace?'replaceState':'pushState'](stateWith(current),'',url.pathname+(fields.length?'?'+fields.join('&'):'')+url.hash);
    cleanCanon();
  }
  function move(screen,replace,focus,diagram,shareable){
    if(names.indexOf(screen)<0)return;
    if(screen!==current.screen || replace || diagram!==undefined && diagram!==current.diagram)write(screen,!!replace,diagram,shareable);
    changed(screen,focus);
  }
  function pop(){
    var next=read(win.history.state);
    if(next){current=next;retired=wasRetired(next);}
    else current={v:1,screen:'home',visit:current.visit,depth:0,canon:!!current.canon,retired:retired};
    /* A visited old entry also carries retirement if session storage is blocked. */
    if(retired && !current.retired)write(current.screen,true);else cleanCanon();
    changed(current.screen,true);
  }
  write(current.screen,true); // Claim this entry, without adding an initial Back stop.
  win.addEventListener('popstate',pop);
  return {
    screen:function(){return current.screen;},
    diagram:function(){return current.diagram;},
    shareable:function(){return current.shareable!==false;},
    retired:function(){return retired;},
    go:function(screen,diagram,shareable){move(screen,false,true,diagram,shareable);},
    replace:function(screen,focus){move(screen,true,focus);},
    back:function(){if(current.depth>0)win.history.back();else move('home',false,true);},
    localProject:function(){
      if(!current.canon)return;
      retired=true;retiredVisits.add(current.visit);
      try{win.sessionStorage.setItem(retiredPrefix+current.visit,'1');}catch(ex){}
      write(current.screen,true);
    }
  };
}

function initWorkbenchWelcome(opts){
  var root = document.getElementById('workbench-welcome');
  var editor = document.getElementById('workbench-workspace');
  if (!root || !editor) return {show:function(){}, enterEditor:function(){}, openWorkspace:function(){},localProjectOpened:function(){},canonicalLoaded:function(){}};
  var builder = opts.builder, templates = opts.templates || [];
  var screens = {home:'welcome-home', paste:'welcome-paste-screen', new:'welcome-new-screen', agent:'welcome-agent-screen', library:'welcome-library-screen', reader:'welcome-reader-screen'};
  var screen = 'home', operation = 0, manifestStarted = false, activeReader=null, navigation, library;
  function retireRead(){
    operation++;
    if(activeReader && activeReader.readyState===1){try{activeReader.abort();}catch(ex){}}
    activeReader=null;
  }
  var resume = document.getElementById('welcome-resume');
  var headerResume = document.getElementById('welcome-header-resume');
  var file = document.getElementById('welcome-file');
  var json = document.getElementById('welcome-json');
  var templateGrid = document.getElementById('welcome-templates');
  var filter = 'all';
  var categories = {all:'All examples', engineering:'Engineering', business:'Business & teams', devices:'Connected devices'};
  var blank = {name:'Blank diagram', category:'blank', desc:'A clean canvas for your own nodes, connections, and story.',
    spec:welcomeBlankSpec()};
  function el(id){ return document.getElementById(id); }
  function error(id, message){ var target = el(id); target.textContent = message || ''; target.hidden = !message; }
  function projectTitle(){
    try { var raw = JSON.parse(opts.src.value); return (raw.page || raw).title || 'Untitled project'; }
    catch (ex){ return 'Unfinished diagram'; }
  }
  function updateResume(){
    var current = builder.isProjectOpen(), draft = builder.draftInfo();
    resume.hidden = !current && !draft;
    headerResume.hidden = !current || root.hidden;
    el('welcome-resume-title').textContent = current ? 'Continue ' + projectTitle() : 'Resume ' + (draft ? draft.title : 'your draft');
    var date = draft && new Date(draft.savedAt);
    el('welcome-resume-detail').textContent = current ? 'Your current project is still here, including its undo history.' :
      'Saved in this browser' + (date && Number.isFinite(date.getTime()) ? ' · ' + date.toLocaleString() : '') + '.';
  }
  function selectScreen(name, focus){
    retireRead();
    screen = name;
    Object.keys(screens).forEach(function(key){ el(screens[key]).hidden = key !== name; });
    error('welcome-file-error', '');
    updateResume();
    if (name === 'new') loadManifest();
    if(library && (name==='library' || name==='reader'))library.show(name,navigation.diagram());
    if (focus !== false){
      window.scrollTo(0, 0);
      var target = el(screens[name]).querySelector('h1');
      if (target) target.focus({preventScroll:true});
    }
  }
  function displayEditor(focus){
    retireRead();screen='editor';
    root.hidden = true; editor.hidden = false; headerResume.hidden = true;
    document.body.classList.remove('welcome-active');
    window.dispatchEvent(new Event('resize'));
    if(focus!==false){window.scrollTo(0, 0);el('workspace-home').focus({preventScroll:true});}
  }
  function displayWelcome(name,focus){
    if (builder.prepareWelcome) builder.prepareWelcome();
    /* Focus mode hides the header and source reference. Exit through its own control. */
    if (document.body.classList.contains('workspace-focus')) el('workspace-focus').click();
    editor.hidden = true; root.hidden = false;
    document.body.classList.add('welcome-active');
    selectScreen(name,focus);
  }
  function display(screen,focus){
    if(library)library.hide();
    if(screen==='editor'){
      if(builder.isProjectOpen() || (opts.skipWelcome && !navigation.retired()))displayEditor(focus);
      else if(builder.restoreDraft()){navigation.localProject();displayEditor(focus);}
      else navigation.replace('home',focus);
    }else displayWelcome(screen,focus);
  }
  function enterEditor(){navigation.go('editor');}
  function show(){navigation.go('home');}
  function resumeProject(){
    if (builder.isProjectOpen() || builder.restoreDraft()) enterEditor();
    else { updateResume(); error('welcome-file-error', 'This draft is no longer available. Open a file or start a new project.'); }
  }
  function openSpec(spec, failureId){
    try { builder.loadSpec(JSON.parse(JSON.stringify(spec))); error(failureId, ''); enterEditor(); }
    catch (ex){ error(failureId, ex.message || 'This project could not be opened.'); el(failureId).scrollIntoView({block:'nearest'}); }
  }
  el('workbench-home').addEventListener('click', show);
  el('workspace-home').addEventListener('click', show);
  headerResume.addEventListener('click', resumeProject);
  resume.addEventListener('click', resumeProject);
  el('welcome-paste').addEventListener('click', function(){ navigation.go('paste'); json.focus(); });
  el('welcome-library').addEventListener('click',function(){navigation.go('library');});
  el('welcome-new').addEventListener('click', function(){ navigation.go('new'); });
  ['welcome-catalog','welcome-new-catalog'].forEach(function(id){
    el(id).addEventListener('click',function(){builder.openCatalog({newProject:true,onCreated:enterEditor});});
  });
  ['welcome-agent', 'welcome-new-agent'].forEach(function(id){ el(id).addEventListener('click', function(){ navigation.go('agent'); }); });
  el('welcome-agent-paste').addEventListener('click', function(){ navigation.go('paste'); json.focus(); });
  root.querySelectorAll('[data-welcome-back]').forEach(function(button){ button.addEventListener('click', function(){ navigation.back(); }); });
  ['welcome-open', 'welcome-paste-file'].forEach(function(id){ el(id).addEventListener('click', function(){ file.value = ''; file.click(); }); });
  el('welcome-paste-form').addEventListener('submit', function(ev){
    ev.preventDefault();
    try { builder.loadText(json.value); error('welcome-paste-error', ''); json.removeAttribute('aria-invalid'); enterEditor(); }
    catch (ex){ error('welcome-paste-error', ex.message || 'This JSON could not be opened.'); json.setAttribute('aria-invalid', 'true'); json.focus(); }
  });
  json.addEventListener('input', function(){ error('welcome-paste-error', ''); json.removeAttribute('aria-invalid'); });
  file.addEventListener('change', function(){
    var selected = file.files && file.files[0];
    if (!selected) return;
    retireRead();
    var token = operation, reader = new FileReader();activeReader=reader;
    error('welcome-file-error', '');
    reader.onload = function(){
      if (token !== operation) return;
      activeReader=null;
      try { builder.loadText(String(reader.result)); enterEditor(); }
      catch (ex){ error('welcome-file-error', 'Could not open “' + selected.name + '”. ' + (ex.message || 'Check the JSON and try again.')); el('welcome-file-error').scrollIntoView({block:'nearest'}); }
    };
    reader.onerror = function(){
      if (token !== operation) return;
      activeReader=null;
      error('welcome-file-error', 'Could not read “' + selected.name + '”. Choose the file again.');
      el('welcome-file-error').scrollIntoView({block:'nearest'});
    };
    reader.readAsText(selected);
  });
  function artwork(entry){
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 117'); svg.setAttribute('aria-hidden', 'true');
    var mode = entry.art || 'flow';
    /* Schematic thumbnails, never HTML from a template or hosted manifest. */
    var drawings = {
      home:'<path d="m84 43 64-30 66 30v54H84Z" fill="#fcfffd" stroke="#afc6bb"/><path d="M148 16v79M86 57h127" stroke="#c5d7cc"/><rect x="126" y="65" width="23" height="32" rx="3" fill="#e0ebe4" stroke="#adbfaf"/><circle cx="193" cy="73" r="12" fill="#eadcf0"/><circle cx="104" cy="38" r="7" fill="#b4cabb"/><path d="M58 79h59" stroke="#abaccc" stroke-width="2" stroke-dasharray="4 4"/><circle cx="54" cy="79" r="8" fill="#c6bedf"/>',
      trace:'<rect x="52" y="26" width="192" height="64" rx="7" fill="#fff" stroke="#c3bfd6"/><path d="M84 38v42m39-42v42m40-42v42m40-42v42" stroke="#ece9f2"/><rect x="66" y="37" width="153" height="8" rx="3" fill="#bdb2db"/><rect x="94" y="53" width="49" height="8" rx="3" fill="#b2cec9"/><rect x="144" y="53" width="62" height="8" rx="3" fill="#e4c7ad"/><rect x="169" y="69" width="33" height="8" rx="3" fill="#c3b8dd"/>',
      phone:'<rect x="169" y="17" width="49" height="86" rx="9" fill="#fff" stroke="#a4bab7"/><rect x="176" y="28" width="35" height="33" rx="4" fill="#d3e6da"/><path d="M181 69h25m-25 8h19m-19 8h22" stroke="#b8c7be" stroke-width="3"/><path d="M95 40h62m-62 35h62" stroke="#c2c3d5" stroke-dasharray="4 4"/><rect x="67" y="27" width="43" height="25" rx="5" fill="#ece9f7" stroke="#c7bcdf"/><rect x="67" y="62" width="43" height="25" rx="5" fill="#e3eee9" stroke="#b1c6b9"/>',
      branch:'<path d="M61 59h73m28 0h78m-91-5V29h91m-91 35v25h91" stroke="#c2b9d4" stroke-width="1.7" fill="none"/><rect x="33" y="42" width="48" height="33" rx="7" fill="#fff" stroke="#c1b5d6"/><path d="m149 43 17 16-17 16-17-16Z" fill="#e6ddf2" stroke="#beaed4"/><rect x="212" y="16" width="50" height="27" rx="6" fill="#e5f0e8" stroke="#b7cabb"/><rect x="212" y="47" width="50" height="26" rx="6" fill="#f7eadb" stroke="#dec3a4"/><rect x="212" y="76" width="50" height="26" rx="6" fill="#f6e3e5" stroke="#d8b7be"/>',
      flow:'<path d="M63 61h174M150 53V29" stroke="#bcb5d1" stroke-width="1.7" stroke-dasharray="4 4"/><rect x="25" y="43" width="61" height="39" rx="8" fill="#fff" stroke="#c3bad7"/><rect x="119" y="43" width="61" height="39" rx="8" fill="#e9e3f6" stroke="#bcb0d7"/><rect x="213" y="43" width="61" height="39" rx="8" fill="#fff" stroke="#c3bad7"/><rect x="133" y="12" width="34" height="21" rx="5" fill="#e1ede6" stroke="#b3cabd"/><path d="M39 56h31M39 64h20M135 56h30M135 64h19M228 56h30M228 64h19" stroke="#c0b6d1" stroke-width="3"/>',
      layers:'<rect x="44" y="17" width="212" height="84" rx="9" fill="#fff" stroke="#c5bdd6"/><rect x="53" y="26" width="49" height="66" rx="5" fill="#e9e3f3"/><path d="M113 40h129M113 54h129M113 68h129M113 82h83" stroke="#e1dceb" stroke-width="5"/><rect x="131" y="33" width="47" height="14" rx="4" fill="#b8cfc6"/><rect x="177" y="60" width="46" height="14" rx="4" fill="#d5c2de"/>',
      perspectives:'<rect x="29" y="23" width="106" height="70" rx="8" fill="#fff" stroke="#c2b8d4"/><rect x="165" y="23" width="106" height="70" rx="8" fill="#fff" stroke="#c2b8d4"/><path d="M135 58h30" stroke="#b3a6cb" stroke-width="2"/><path d="m49 53 33-19 33 19v25H49Z" fill="#dfede5" stroke="#b8cabb"/><path d="M181 58h73" stroke="#b8afd0"/><rect x="178" y="47" width="20" height="23" rx="4" fill="#e8def2"/><rect x="208" y="47" width="20" height="23" rx="4" fill="#e8def2"/><rect x="239" y="47" width="20" height="23" rx="4" fill="#e8def2"/>'
    };
    svg.innerHTML = drawings[mode] || drawings.flow;
    return svg;
  }
  function card(entry, isBlank){
    var button = document.createElement('button'); button.type = 'button';
    button.className = 'welcome-template-card' + (isBlank ? ' welcome-blank' : '');
    button.dataset.category = entry.category || 'team';
    var art = document.createElement('span'); art.className = 'welcome-template-art'; art.setAttribute('aria-hidden', 'true');
    if (isBlank){ var plus = document.createElement('span'); plus.textContent = '+'; art.appendChild(plus); } else art.appendChild(artwork(entry));
    button.appendChild(art);
    var copy = document.createElement('span'); copy.className = 'welcome-template-copy';
    function line(cls, value){ var span = document.createElement('span'); span.className = cls; span.textContent = value; copy.appendChild(span); return span; }
    line('welcome-template-eyebrow', isBlank ? 'Start from scratch' : entry.tag || categories[entry.category] || 'Team template');
    var title = line('welcome-template-title', entry.name); var arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true'); title.appendChild(arrow);
    line('welcome-template-desc', entry.desc || 'An editable Flowview project.');
    line('welcome-template-meta', isBlank ? 'No sample nodes. All possibility.' : starterCountLine(entry.spec));
    button.appendChild(copy);
    button.addEventListener('click', function(){ openSpec(entry.spec, 'welcome-template-error'); });
    return button;
  }
  function renderTemplates(){
    templateGrid.replaceChildren(card(blank, true));
    var shown = templates.filter(function(entry){ return filter === 'all' || entry.category === filter || (entry.categories || []).indexOf(filter) >= 0; });
    shown.forEach(function(entry){ templateGrid.appendChild(card(entry, false)); });
    el('welcome-template-status').textContent = shown.length + ' editable examples · Every project can be changed in the workbench';
    el('welcome-template-filters').querySelectorAll('button').forEach(function(button){ button.setAttribute('aria-pressed', String(button.dataset.category === filter)); });
  }
  Object.keys(categories).forEach(function(key){
    var button = document.createElement('button'); button.type = 'button'; button.textContent = categories[key]; button.dataset.category = key;
    button.addEventListener('click', function(){ filter = key; renderTemplates(); }); el('welcome-template-filters').appendChild(button);
  });
  function loadManifest(){
    if (manifestStarted || typeof fetch !== 'function' || window.location.protocol === 'file:') return;
    manifestStarted = true;
    fetch('starters.json', {cache:'no-store'}).then(function(response){
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Team templates could not be loaded (' + response.status + ').');
      return response.text();
    }).then(function(text){
      if (text == null) return;
      var parsed = parseStarterManifest(text);
      if (parsed.error) throw new Error(parsed.error);
      var company = el('welcome-company-grid');
      parsed.entries.forEach(function(entry){ company.appendChild(card(entry, false)); });
      el('welcome-company-templates').hidden = !parsed.entries.length;
      if (parsed.skipped){ el('welcome-manifest-status').textContent = parsed.skipped + ' team template entries were skipped because their name or spec was missing.'; el('welcome-manifest-status').hidden = false; }
    }).catch(function(ex){
      el('welcome-manifest-status').textContent = 'Team templates unavailable. ' + ex.message + ' Built-in examples are ready to use.';
      el('welcome-manifest-status').hidden = false;
    });
  }
  var repositoryInput = el('welcome-repository'), revisionInput = el('welcome-revision');
  var repositoryKey = 'dv-workbench-authoring-repository-v1', config;
  try { config = JSON.parse(localStorage.getItem(repositoryKey)); } catch (ex){}
  if (config && !welcomeRepository(config.repository, config.revision).error){ repositoryInput.value = config.repository; revisionInput.value = config.revision; }
  function updatePrompt(){
    var repository = welcomeRepository(repositoryInput.value, revisionInput.value);
    error('welcome-repo-error', repository.error || '');
    repositoryInput.setAttribute('aria-invalid', String(!!repository.error));
    el('welcome-copy-prompt').disabled = !!repository.error;
    if (repository.error){ el('welcome-prompt').value = ''; el('welcome-skill-link').hidden = true; return; }
    el('welcome-skill-link').hidden = false;
    el('welcome-skill-link').href = repository.skill;
    el('welcome-repo-link').href = repository.repository;
    var selected = root.querySelector('input[name="welcome-prompt-kind"]:checked');
    var audience = el('welcome-audience');
    el('welcome-prompt').value = welcomeAgentPrompt(selected.value, el('welcome-brief').value, audience.options[audience.selectedIndex].text, repository);
    el('welcome-copy-status').textContent = 'Paste into your agent’s conversation.';
    try { localStorage.setItem(repositoryKey, JSON.stringify({repository:repository.repository,revision:repository.revision})); } catch (ex){}
  }
  [repositoryInput, revisionInput, el('welcome-brief'), el('welcome-audience')].forEach(function(input){ input.addEventListener('input', updatePrompt); });
  root.querySelectorAll('input[name="welcome-prompt-kind"]').forEach(function(input){ input.addEventListener('change', updatePrompt); });
  el('welcome-copy-prompt').addEventListener('click', function(){
    var text = el('welcome-prompt').value;
    if (!text) return;
    function fallback(){ el('welcome-prompt').focus(); el('welcome-prompt').select(); el('welcome-copy-status').textContent = 'Prompt selected. Press ⌘C / Ctrl+C to copy.'; }
    if (!navigator.clipboard || !navigator.clipboard.writeText){ fallback(); return; }
    navigator.clipboard.writeText(text).then(function(){ el('welcome-copy-status').textContent = 'Copied. Paste into your agent and attach your sources.'; }, fallback);
  });
  renderTemplates(); updatePrompt();
  navigation=createWelcomeNavigation(window,opts.skipWelcome?'editor':'home',display);
  library=initWorkbenchLibrary({builtin:opts.canon,selected:navigation.diagram,shareable:navigation.shareable,open:function(id,published){navigation.go('reader',id,published);},edit:function(spec){builder.loadSpec(spec);enterEditor();}});
  display(navigation.screen(),false);
  window.addEventListener('pagehide',function(){retireRead();if(builder.prepareWelcome)builder.prepareWelcome();});
  return {show:show, enterEditor:enterEditor, openWorkspace:enterEditor,
    localProjectOpened:navigation.localProject,
    canonicalLoaded:function(){if(navigation.screen()==='editor')displayEditor(false);else updateResume();}};
}

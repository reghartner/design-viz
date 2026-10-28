/* Hosted desktop projects use the existing header, button primitives and skin
   tokens. The native dialog owns focus; no cloud surface mounts without config. */
function initFlowviewCloud(options){
  var config=JSON.parse(document.getElementById('flowview-cloud-config').textContent);
  var auth=createFlowviewCloudAuth(config),apiBase=new URL(config.api,location.href);
  var disposed=false,generation=0,user=null,latest={state:'detached'},projects=[],replacingCloud=false;
  var reader=new URLSearchParams(location.search).get('view')==='read';
  var memoryOnlyDraft=false,exportedRecovery=null,beforeUnload;
  if(!config.mock && apiBase.protocol!=='https:')throw Error('The cloud API must use HTTPS.');
  var cloudIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 18a5 5 0 0 1-.6-10A6.5 6.5 0 0 1 19 9a4.5 4.5 0 0 1-1 9H7Z"/><path d="m9 13 2 2 4-4"/></svg>';
  var root=document.createElement('div');root.id='flowview-cloud';root.className='cloud-entry';
  root.innerHTML='<button type="button" class="bbtn cloud-toggle" id="cloud-toggle" aria-haspopup="dialog" aria-controls="cloud-panel" aria-expanded="false">'+cloudIcon+'<span>Team library</span></button><span id="cloud-status" class="cloud-toolbar-status" role="status" aria-live="polite">Sign in to connect</span>';
  document.querySelector('.workbench-header').appendChild(root);
  var dialog=document.createElement('dialog');dialog.id='cloud-panel';dialog.className='cloud-dialog';dialog.setAttribute('aria-labelledby','cloud-heading');
  dialog.innerHTML=`
    <header class="cloud-dialog-header">
      <div><p class="cloud-eyebrow">FLOWVIEW · SHARED PROJECTS</p><h2 id="cloud-heading">Team library</h2></div>
      <button class="bbtn cloud-close" id="cloud-close" type="button" aria-label="Close team library">×</button>
    </header>
    <section id="cloud-login" class="cloud-signin">
      <div class="cloud-signin-intro"><span class="cloud-signin-icon">${cloudIcon}</span><h3>A home for your<br>team’s projects.</h3><p>Pick up where you left off. Keep your team’s diagrams together, with a shared link and a history of every saved version.</p><ul><li>Save directly from the editor</li><li>Share with invited teammates</li><li>Keep your local agent workflow</li></ul></div>
      <div class="cloud-signin-action"><p class="cloud-eyebrow">YOUR TEAM, YOUR WORK</p><h3>Welcome back</h3><p>Sign in with your invited account to open the shared library.</p><label id="cloud-mock-label" class="cloud-field" hidden><span>Local rehearsal account</span><select id="cloud-mock-user"><option value="alice">Alice</option><option value="bob">Bob</option><option value="reader">Read-only teammate</option><option value="outsider">Uninvited account</option></select></label><button class="rbtn" id="cloud-sign-in" type="button">Sign in to team library <span aria-hidden="true">→</span></button><p class="cloud-caption">Your current project stays yours. Connecting does not share it until you choose Save online.</p></div>
    </section>
    <div id="cloud-member" hidden>
      <div class="cloud-content">
        <section class="cloud-library" aria-labelledby="cloud-library-heading">
          <div class="cloud-section-heading"><h3 id="cloud-library-heading">Shared projects <span id="cloud-count" class="cloud-count">0</span></h3><button class="bbtn cloud-quiet" id="cloud-refresh" type="button" aria-label="Refresh library">Refresh</button></div>
          <div id="cloud-empty" class="cloud-empty">${cloudIcon}<h4>Your first project starts here</h4><p id="cloud-empty-hint">Start a new project or open a file, then save it here for your team.</p></div>
          <ul id="cloud-projects" class="cloud-project-list" aria-label="Shared projects"></ul>
        </section>
        <section id="cloud-author" class="cloud-current" aria-labelledby="cloud-current-heading">
          <p class="cloud-eyebrow" id="cloud-current-label">IN YOUR EDITOR</p><h3 id="cloud-current-heading">Start with a project</h3><p id="cloud-current-description" class="cloud-description">Start a new project or open a file from Home. Come back here when you’re ready to share it.</p>
          <div id="cloud-save-form"><label id="cloud-name-field" class="cloud-field"><span>Project name</span><input id="cloud-name" maxlength="120" autocomplete="off"></label><button class="rbtn cloud-primary" id="cloud-save" type="button">Save current project online</button></div>
          <div id="cloud-attached-actions" class="cloud-attached-actions" hidden><a class="bbtn cloud-share" id="cloud-share" hidden target="_blank" rel="noopener">${cloudIcon}<span>Open share link</span><span aria-hidden="true">↗</span></a><p class="cloud-caption">Only invited teammates can open this read-only link.</p><button class="bbtn" id="cloud-history" type="button" aria-expanded="false" aria-controls="cloud-history-panel">Revision history <span aria-hidden="true">⌄</span></button></div>
          <section id="cloud-history-panel" class="cloud-history-panel" hidden aria-label="Revision history"><label class="cloud-field"><span>Saved version</span><select id="cloud-revisions" aria-label="Online revision"></select></label><p class="cloud-caption">Restoring creates a new version. Earlier versions stay available.</p><button class="bbtn" id="cloud-restore" type="button">Restore this version</button></section>
          <details id="cloud-copy-options" class="cloud-copy-options"><summary>Save a separate copy</summary><label class="cloud-field"><span>New copy name</span><input id="cloud-copy-name" maxlength="120" autocomplete="off"></label><button class="bbtn" id="cloud-copy" type="button">Save as new copy</button></details>
        </section>
        <section id="cloud-readonly-note" class="cloud-current" hidden><p class="cloud-eyebrow">VIEWER ACCESS</p><h3>See the story.</h3><p class="cloud-description">Open a project to view the latest saved version. Editing is available to your team’s editors.</p></section>
      </div>
      <section id="cloud-recovery" class="cloud-recovery" hidden><div><h3>An unsynced draft is waiting</h3><p>Recover your local work before replacing it with an online version.</p></div><button class="bbtn" id="cloud-recover" type="button">Recover unsynced online draft</button></section>
      <footer class="cloud-account-bar"><span id="cloud-avatar" class="cloud-avatar" aria-hidden="true"></span><div><span class="cloud-caption">CONNECTED TO YOUR TEAM</span><p id="cloud-account"></p></div><button class="bbtn cloud-quiet" id="cloud-sign-out" type="button">Sign out</button></footer>
    </div>
    <section id="cloud-feedback" class="cloud-feedback" hidden aria-label="Online storage status"><p id="cloud-message" role="status"></p><div class="cloud-feedback-actions"><button class="rbtn" id="cloud-retry" type="button" hidden>Retry save</button><button class="bbtn" id="cloud-reload" type="button" hidden>Reload online version</button><button class="bbtn" id="cloud-download" type="button" hidden>Download recovery copy</button><a class="bbtn" id="cloud-end-session" hidden target="_blank" rel="noopener">Finish account sign-out ↗</a></div></section>`;
  document.body.appendChild(dialog);
  function el(id){return document.getElementById('cloud-'+id);}
  function message(text,tone){el('message').textContent=text || '';el('feedback').hidden=!text;el('feedback').dataset.tone=tone || 'notice';}
  function title(){try{var raw=JSON.parse(options.builder.cloud.snapshot().source);return String((raw.page || raw).title || 'Untitled project');}catch(error){return 'Unfinished draft';}}
  function editorURL(value){
    // Screens have their own history state. Only the cloud binding belongs here;
    // preserve other query bytes, fragments, and authenticated read-only links.
    if(disposed || reader || replacingCloud)return;
    var id=value.project && value.project.projectId || null,url=new URL(location.href);
    if(!id && value.state!=='detached' || url.searchParams.get('cloud')===id)return;
    var fields=url.search.slice(1).split('&').filter(function(field){return field && !new URLSearchParams(field).has('cloud');});
    if(id)fields.push('cloud='+encodeURIComponent(id));
    history.replaceState(history.state,'',url.pathname+(fields.length?'?'+fields.join('&'):'')+url.hash);
  }
  function refreshCurrent(){
    var p=session && session.attachment(),opened=options.builder.isProjectOpen(),writable=user && user.role==='editor' && !reader;
    el('author').hidden=!writable;el('readonly-note').hidden=writable;
    el('current-heading').textContent=p?p.name:opened?title():'Start with a project';
    el('current-label').textContent=p?'SAVED IN YOUR TEAM LIBRARY':'IN YOUR EDITOR';
    el('current-description').textContent=latest.state==='conflict'?'Your changes are still open. A newer online version needs your attention.':p?'Version '+p.revision+' · Changes save automatically as you work.':opened?'Save this project to your team library. Future changes will save automatically.':'Start a new project or open a file from Home. Come back here when you’re ready to share it.';
    el('save-form').hidden=!opened;el('save').disabled=!opened || !writable || ['saving','conflict'].includes(latest.state);el('save').textContent=latest.state==='conflict'?'Resolve the conflict below':p?'Save now':'Save current project online';
    el('name-field').hidden=!!p;el('attached-actions').hidden=!p || !p.projectId;el('copy-options').hidden=!opened || !p;
    if(!p){el('name').value=opened?title():'';el('history-panel').hidden=true;el('history').setAttribute('aria-expanded','false');}
    el('empty-hint').textContent=opened?'Save the project you’re editing to make it available to your team.':'Start a new project or open a file, then save it here for your team.';
    el('share').hidden=!p || !p.projectId;if(p && p.projectId)el('share').href=shareURL(p.projectId);
    el('copy-name').value=(p?p.name:title())+' copy';
  }
  function report(value){
    latest=value;options.builder.cloud.refreshDestination();
    if(value.state==='saved' && value.project && value.project.projectId){
      var listed=projects.find(function(p){return p.projectId===value.project.projectId;});
      if(listed){Object.assign(listed,{name:value.project.name,revision:value.project.revision,updatedAt:value.project.updatedAt});drawProjects();}
    }
    var labels={detached:user?'Local draft':'Sign in to connect',pending:'Changes pending',saving:'Saving online…',saved:'Saved online',failed:'Save needs attention',conflict:'Conflict to resolve'};
    el('status').textContent=labels[value.state] || value.state;el('status').dataset.state=value.state;
    el('status').title=value.project?value.project.name+' · '+el('status').textContent:el('status').textContent;
    message(value.detail,value.state==='failed' || value.state==='conflict'?'error':'notice');
    el('retry').hidden=!['failed','pending'].includes(value.state);el('reload').hidden=!value.project || !value.project.projectId || !['conflict','failed'].includes(value.state);
    if(value.state==='conflict')message('A newer version is saved online. Your draft is still here. Reload the online version or use Save a separate copy to keep your changes.'+(value.detail?'\n'+value.detail:''),'error');
    refreshCurrent();
  }
  async function api(method,path,body){
    var token=auth.access();if(!token){var expired=Error('Sign in again to save online. Your current draft is still open.');expired.status=401;throw expired;}
    var response=await fetch(apiBase.href.replace(/\/$/,'')+path,{method:method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    var data=await response.json();if(!response.ok){var error=Error(data.error || 'Online request failed.');error.status=response.status;error.current=data.current;throw error;}return data;
  }
  async function download(url){var response=await fetch(new URL(url,apiBase),{cache:'no-store'});if(!response.ok)throw Error('Could not read the online snapshot.');return response.json();}
  function recoveryKey(){return 'flowview-cloud-recovery:'+(user?user.teamId+':'+user.userId:'signed-out');}
  function recover(value){try{localStorage.setItem(recoveryKey(),JSON.stringify(value));}catch(error){throw Error('Browser recovery is full or unavailable. Export your current draft or free recovery storage before switching projects. Cloud saving can continue.');}}
  var session=createCloudProjectSession({snapshot:options.builder.cloud.snapshot,archive:options.builder.cloud.archive,replace:function(value){
    // Installing a fetched/recovered envelope retires the builder's old project
    // synchronously. Its temporary detach is not a switch to a local draft.
    replacingCloud=true;try{return options.builder.cloud.replace(value);}finally{replacingCloud=false;}
  },
    api:api,download:download,upload:async function(url,value){var response=await fetch(new URL(url,apiBase),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(value)});if(!response.ok)throw Error('Snapshot upload failed. Your draft is still here. Retry to save it online.');},
    uuid:function(){return crypto.randomUUID();},recover:recover,clearRecovery:function(){localStorage.removeItem(recoveryKey());},status:function(value){editorURL(value);report(value);}});
  options.builder.cloud.connect(session);
  function navigated(){editorURL({state:session.attachment()?'attached':'detached',project:session.attachment()});}
  window.addEventListener('popstate',navigated);
  function panel(open){if(disposed)return;refreshCurrent();if(open && !dialog.open)dialog.showModal();else if(!open && dialog.open)dialog.close();el('toggle').setAttribute('aria-expanded',String(open));}
  el('toggle').onclick=function(){panel(!dialog.open);};el('close').onclick=function(){panel(false);};
  function closed(){el('toggle').setAttribute('aria-expanded','false');if(!disposed)el('toggle').focus();}
  dialog.addEventListener('close',closed);el('mock-label').hidden=!config.mock;
  function action(id,fn){el(id).onclick=async function(){try{await fn();}catch(error){message(error.message,'error');}};}
  function shareURL(id){var url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('cloud',id);url.searchParams.set('view','read');return url.href;}
  function drawProjects(){
    el('projects').replaceChildren();el('count').textContent=projects.length;el('empty').hidden=!!projects.length;
    var active=session.attachment();
    projects.forEach(function(p){
      var row=document.createElement('li'),button=document.createElement('button'),name=document.createElement('strong'),meta=document.createElement('span'),arrow=document.createElement('span');
      button.type='button';button.className='cloud-project';name.textContent=p.name;meta.className='cloud-project-meta';meta.textContent='Version '+p.revision+' · '+new Date(p.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'});arrow.className='cloud-project-arrow';arrow.textContent='→';arrow.setAttribute('aria-hidden','true');
      button.append(name,meta,arrow);if(active && active.projectId===p.projectId)button.setAttribute('aria-current','true');
      button.onclick=async function(){if(reader || user && user.role==='reader'){location.assign(shareURL(p.projectId));return;}if(await session.open(p.projectId)){options.welcome.enterEditor();panel(false);drawProjects();}};
      row.appendChild(button);el('projects').appendChild(row);
    });
  }
  async function list(){var run=generation,data=await api('GET','/projects');if(run!==generation)return;projects=data.projects.sort(function(a,b){return b.updatedAt-a.updatedAt;});drawProjects();refreshCurrent();}
  async function signedIn(){
    if(disposed)return;var run=++generation,next=await api('GET','/me');if(run!==generation)return;user=next;
    el('account').textContent=user.name+' · '+user.teamId;el('avatar').textContent=user.name.slice(0,1).toUpperCase();el('member').hidden=false;el('login').hidden=true;message('');
    try{el('recovery').hidden=!localStorage.getItem(recoveryKey());}catch(error){el('recovery').hidden=true;}
    report(latest);await list();if(run!==generation)return;
    var projectId=new URLSearchParams(location.search).get('cloud');
    if(projectId){if(reader || user.role==='reader')await read(projectId);else if(await session.open(projectId))options.welcome.enterEditor();}
    else if(user.role==='reader'){reader=true;readerHost();}
  }
  function readerHost(){
    var host=document.getElementById('cloud-reader');if(host)return host;
    document.body.classList.add('cloud-reading');document.body.classList.remove('welcome-active');host=document.createElement('main');host.id='cloud-reader';host.innerHTML='<div class="cloud-reader-empty">'+cloudIcon+'<h2>Your shared project</h2><p id="cloud-reader-message">Sign in to view this project with your team.</p></div>';document.body.appendChild(host);
    document.getElementById('workbench-workspace').inert=true;document.getElementById('workbench-workspace').hidden=true;document.getElementById('workbench-welcome').inert=true;return host;
  }
  async function read(projectId){
    var run=generation,host=readerHost();
    try{
      var meta=await api('GET','/projects/'+encodeURIComponent(projectId)),value=await download(meta.downloadUrl);if(run!==generation)return;
      var raw;try{raw=FlowTopology.resolveSource(JSON.parse(value.source),value.topologyContext);}catch(error){throw Error('This saved draft cannot be displayed yet: '+error.message+' Ask an editor to repair it.');}
      var response=await fetch(new URL(config.viewerTemplate || './template/flowview.html',location.href));if(!response.ok)throw Error('Viewer template unavailable.');
      var built=buildExportHtml(await response.text(),JSON.stringify(raw));if(built.error)throw Error('This saved draft cannot be displayed yet: '+built.error);if(run!==generation)return;
      var frame=document.createElement('iframe');frame.title=meta.name;frame.setAttribute('sandbox','allow-scripts');frame.srcdoc=built.html;host.replaceChildren(frame);
      el('status').textContent='Read only · v'+meta.revision;el('status').dataset.state='reader';document.getElementById('workbench-editor-title').textContent=meta.name;document.getElementById('workbench-editor-title').hidden=false;document.getElementById('workbench-reader-title').hidden=false;panel(false);
    }catch(error){if(run===generation){host.replaceChildren();var note=document.createElement('p');note.className='cloud-reader-empty';note.textContent='This saved draft cannot be displayed yet. '+error.message;host.appendChild(note);message(error.message,'error');}}
  }
  function preserveBeforeAuth(){options.builder.cloud.archive();session.preserve();}
  function currentDraftExported(){return exportedRecovery===JSON.stringify(options.builder.cloud.snapshot());}
  action('sign-in',async function(){
    if(options.builder.isProjectOpen()){try{preserveBeforeAuth();memoryOnlyDraft=false;}catch(error){if(!currentDraftExported()){memoryOnlyDraft=true;el('download').hidden=false;throw Error('Your draft is open, but browser recovery is unavailable. Download a recovery copy before continuing sign-in.');}}}
    await auth.signIn(el('mock-user').value);if(config.mock)await signedIn();
  });
  action('sign-out',function(){
    var failure=null;if(!reader){try{preserveBeforeAuth();}catch(error){failure=error;}}
    // Retire requests and credentials even when local recovery refuses writes.
    generation++;session.detach();var logoutURL=auth.signOut({redirect:false});user=null;projects=[];drawProjects();el('member').hidden=true;el('login').hidden=false;el('account').textContent='';
    if(reader)readerHost().replaceChildren(document.createTextNode('Sign in to view this shared project.'));
    else if(!failure){try{options.builder.cloud.replace({source:JSON.stringify(welcomeBlankSpec(),null,2),ledger:null,topologyContext:null});options.welcome.show();}catch(error){failure=error;}}
    if(failure){
      memoryOnlyDraft=true;exportedRecovery=null;el('status').textContent='Signed out · draft kept';el('status').dataset.state='signed-out';el('download').hidden=false;
      message('You are signed out of this editor. Browser recovery is unavailable, so your draft is still open in this tab. Download a recovery copy before closing or signing in again.','error');
      if(logoutURL){el('end-session').href=logoutURL;el('end-session').hidden=false;}return;
    }
    el('status').textContent='Sign in to connect';if(logoutURL)location.assign(logoutURL);
  });
  action('download',function(){
    var value=options.builder.cloud.snapshot(),url=URL.createObjectURL(new Blob([JSON.stringify({version:1,source:value.source,ledger:value.ledger,topologyContext:value.topologyContext},null,2)],{type:'application/json'}));
    var a=document.createElement('a');a.href=url;a.download='flowview-unsynced-recovery.json';a.click();URL.revokeObjectURL(url);exportedRecovery=JSON.stringify(value);
    message('Recovery copy downloaded with your source, coverage ledger and frozen context. Your draft remains open in this tab. You can now continue sign-in.');
  });
  action('refresh',list);
  action('save',async function(){if(!options.builder.isProjectOpen())return;await session.save(el('name').value.trim() || title());await list();});
  action('copy',async function(){if(!options.builder.isProjectOpen())return;await session.copy(el('copy-name').value.trim() || title()+' copy');await list();});
  action('retry',async function(){await session.save();await list();});
  action('reload',async function(){var p=session.attachment();if(p && await session.open(p.projectId)){options.welcome.enterEditor();panel(false);}});
  action('recover',function(){var entry=JSON.parse(localStorage.getItem(recoveryKey()) || 'null');if(entry){session.recover(entry);options.welcome.enterEditor();panel(false);}});
  action('history',async function(){
    if(!el('history-panel').hidden){el('history-panel').hidden=true;el('history').setAttribute('aria-expanded','false');return;}
    var p=session.attachment();if(!p || !p.projectId)return;var run=generation,data=await api('GET','/projects/'+p.projectId+'/revisions');if(run!==generation || session.attachment()?.projectId!==p.projectId)return;
    el('history-panel').hidden=false;el('history').setAttribute('aria-expanded','true');el('revisions').replaceChildren();
    data.revisions.sort(function(a,b){return b.revision-a.revision;}).forEach(function(r){var option=document.createElement('option');option.value=r.revision;option.textContent='Version '+r.revision+' · '+new Date(r.updatedAt).toLocaleString();el('revisions').appendChild(option);});el('revisions').focus();
  });
  action('restore',async function(){if(!el('revisions').value)return;await session.restore(Number(el('revisions').value));await list();});
  beforeUnload=function(event){try{session.preserve();if(memoryOnlyDraft && !currentDraftExported())throw Error('Draft remains in memory.');}catch(error){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  if(reader)readerHost();
  auth.init().then(async function(){if(disposed)return;if(auth.access())await signedIn();else panel(true);}).catch(function(error){message(error.message,'error');panel(true);});
  function destroy(){if(disposed)return;disposed=true;generation++;window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('popstate',navigated);dialog.removeEventListener('close',closed);session.destroy();dialog.close();dialog.remove();root.remove();var host=document.getElementById('cloud-reader');if(host)host.remove();document.body.classList.remove('cloud-reading');}
  options.builder.cloud.own(destroy);return {destroy:destroy};
}

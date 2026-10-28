/* Desktop hosted-project controls. The default standalone has no configuration
   node, so neither these controls nor network requests are initialized. */
function initFlowviewCloud(options){
  var node=document.getElementById('flowview-cloud-config'),config=JSON.parse(node.textContent),auth=createFlowviewCloudAuth(config);
  var apiBase=new URL(config.api,location.href),disposed=false,generation=0,user=null,reader=new URLSearchParams(location.search).get('view')==='read';
  if(!config.mock && apiBase.protocol!=='https:')throw Error('The cloud API must use HTTPS.');
  var beforeUnload;
  var root=document.createElement('aside');root.id='flowview-cloud';root.setAttribute('aria-label','Online projects');
  root.innerHTML='<button type="button" id="cloud-toggle" aria-expanded="false">Online projects</button> <span id="cloud-status" role="status">Sign in to your team library</span><section id="cloud-panel" hidden><h2>Team library</h2><p id="cloud-account"></p><div id="cloud-login"><label id="cloud-mock-label" hidden>Local test user <select id="cloud-mock-user"><option value="alice">Alice</option><option value="bob">Bob</option><option value="reader">Read-only teammate</option><option value="outsider">Uninvited account</option></select></label><button id="cloud-sign-in" type="button">Sign in</button></div><div id="cloud-member" hidden><button id="cloud-sign-out" type="button">Sign out</button><button id="cloud-refresh" type="button">Refresh library</button><div id="cloud-author"><label>Project name <input id="cloud-name" maxlength="120" value="Untitled project"></label><button id="cloud-save" type="button">Save online</button><button id="cloud-copy" type="button">Save as new copy</button><button id="cloud-retry" type="button" hidden>Retry save</button><button id="cloud-reload" type="button" hidden>Reload online version</button><button id="cloud-recover" type="button" hidden>Recover unsynced online draft</button><label>Revision <select id="cloud-revisions" aria-label="Online revision"></select></label><button id="cloud-history" type="button">Load revisions</button><button id="cloud-restore" type="button">Restore selected revision</button></div><a id="cloud-share" hidden target="_blank" rel="noopener">Open authenticated share link</a><ul id="cloud-projects"></ul></div><p id="cloud-message" role="status"></p></section>';
  document.body.appendChild(root);
  var css=document.createElement('style');css.textContent='#flowview-cloud{position:fixed;right:18px;top:8px;z-index:1500;font:13px system-ui;color:#17243c;background:#fff;border:1px solid #8296ad;border-radius:8px;padding:6px;box-shadow:0 3px 12px #15263d22;max-width:650px}#cloud-status{display:inline-block;max-width:320px;vertical-align:middle}#cloud-panel{padding:12px;width:560px;max-height:75vh;overflow:auto}#cloud-panel h2{font-size:18px;margin:0 0 8px}#cloud-panel button,#cloud-panel input,#cloud-panel select{font:inherit;margin:5px;padding:6px;border:1px solid #8b9caf;border-radius:4px}#cloud-panel label{display:block}#cloud-projects{padding-left:20px}#cloud-projects li{padding:4px}#cloud-panel [hidden]{display:none!important}#cloud-message{white-space:pre-wrap}#cloud-reader{position:fixed;inset:0;z-index:1400;background:#fff;padding-top:56px}#cloud-reader iframe{border:0;width:100%;height:100%}#cloud-reader-message{padding:24px;font:18px system-ui}';document.head.appendChild(css);
  function el(id){return document.getElementById('cloud-'+id);}
  function message(text){el('message').textContent=text || '';}
  function report(value){
    options.builder.cloud.refreshDestination();
    var labels={detached:'Browser draft · choose Save online',pending:'Changes waiting to save online',saving:'Saving online…',saved:'Saved online',failed:'Online save failed',conflict:'Conflict · your draft is preserved'};
    el('status').textContent=(labels[value.state] || value.state)+(value.project?' · '+value.project.name:'');el('status').dataset.state=value.state;
    message(value.detail);el('retry').hidden=!['failed','conflict','pending'].includes(value.state);el('reload').hidden=!value.project || !value.project.projectId;
    var share=el('share');share.hidden=!value.project || !value.project.projectId;
    if(!share.hidden){var url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('cloud',value.project.projectId);url.searchParams.set('view','read');share.href=url.href;}
    if(value.project)el('name').value=value.project.name;
  }
  async function api(method,path,body){
    var token=auth.access();if(!token){var expired=Error('Sign in again to save online. Your draft stays in this browser.');expired.status=401;throw expired;}
    var response=await fetch(apiBase.href.replace(/\/$/,'')+path,{method:method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    var data=await response.json();if(!response.ok){var error=Error(data.error || 'Online request failed.');error.status=response.status;error.current=data.current;throw error;}return data;
  }
  async function download(url){var response=await fetch(new URL(url,apiBase),{cache:'no-store'});if(!response.ok)throw Error('Could not read the online snapshot.');return response.json();}
  function recoveryKey(){return 'flowview-cloud-recovery:'+(user?user.teamId+':'+user.userId:'signed-out');}
  function recover(value){try{localStorage.setItem(recoveryKey(),JSON.stringify(value));}catch(error){throw Error('Browser recovery is full or unavailable. Export your current draft or free recovery storage before switching projects. Cloud saving can continue.');}}
  var session=createCloudProjectSession({snapshot:options.builder.cloud.snapshot,archive:options.builder.cloud.archive,replace:options.builder.cloud.replace,
    api:api,download:download,upload:async function(url,value){var response=await fetch(new URL(url,apiBase),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(value)});if(!response.ok)throw Error('Snapshot upload failed. Retry save.');},
    uuid:function(){return crypto.randomUUID();},recover:recover,clearRecovery:function(){localStorage.removeItem(recoveryKey());},status:report});
  options.builder.cloud.connect(session);
  function panel(open){el('panel').hidden=!open;el('toggle').setAttribute('aria-expanded',String(open));}
  el('toggle').onclick=function(){panel(el('panel').hidden);};
  el('mock-label').hidden=!config.mock;
  function action(id,fn){el(id).onclick=async function(){try{await fn();}catch(error){message(error.message);}};}
  function shareURL(id){var url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('cloud',id);url.searchParams.set('view','read');return url.href;}
  async function list(){
    var run=generation,data=await api('GET','/projects');if(run!==generation)return;
    el('projects').replaceChildren();data.projects.sort(function(a,b){return b.updatedAt-a.updatedAt;}).forEach(function(p){
      var row=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=p.name+' · revision '+p.revision;
      button.onclick=async function(){if(reader){location.assign(shareURL(p.projectId));return;}if(await session.open(p.projectId)){options.welcome.enterEditor();panel(false);}};
      row.appendChild(button);el('projects').appendChild(row);
    });
  }
  async function signedIn(){
    if(disposed)return;
    var run=++generation,next=await api('GET','/me');if(run!==generation)return;user=next;
    el('account').textContent=user.name+' · '+user.teamId;el('member').hidden=false;el('login').hidden=true;el('author').hidden=reader || user.role!=='editor';
    el('recover').hidden=!localStorage.getItem(recoveryKey());await list();if(run!==generation)return;
    var projectId=new URLSearchParams(location.search).get('cloud');
    if(projectId){if(reader || user.role==='reader')await read(projectId);else if(await session.open(projectId))options.welcome.enterEditor();}
    else if(user.role==='reader'){reader=true;readerHost();}
  }
  function readerHost(){
    var host=document.getElementById('cloud-reader');if(host)return host;
    host=document.createElement('main');host.id='cloud-reader';host.innerHTML='<p id="cloud-reader-message">Sign in to view this shared project.</p>';document.body.appendChild(host);
    document.getElementById('workbench-workspace').inert=true;document.getElementById('workbench-workspace').hidden=true;document.getElementById('workbench-welcome').inert=true;
    return host;
  }
  async function read(projectId){
    var run=generation,host=readerHost();
    try{
      var meta=await api('GET','/projects/'+encodeURIComponent(projectId)),value=await download(meta.downloadUrl);if(run!==generation)return;
      var raw;try{raw=FlowTopology.resolveSource(JSON.parse(value.source),value.topologyContext);}catch(error){throw Error('This saved draft cannot be displayed yet: '+error.message+' Ask an editor to repair it.');}
      var response=await fetch(new URL(config.viewerTemplate || './template/flowview.html',location.href));if(!response.ok)throw Error('Viewer template unavailable.');
      var built=buildExportHtml(await response.text(),JSON.stringify(raw));if(built.error)throw Error('This saved draft cannot be displayed yet: '+built.error);
      if(run!==generation)return;
      var frame=document.createElement('iframe');frame.title=meta.name;frame.setAttribute('sandbox','allow-scripts');frame.srcdoc=built.html;host.replaceChildren(frame);
      el('status').textContent='Read only · '+meta.name+' · revision '+meta.revision;el('status').dataset.state='reader';panel(false);
    }catch(error){if(run===generation){host.textContent='This saved draft cannot be displayed yet. '+error.message;message(error.message);}}
  }
  action('sign-in',async function(){await auth.signIn(el('mock-user').value);if(config.mock)await signedIn();});
  action('sign-out',async function(){options.builder.cloud.archive();session.preserve();generation++;session.detach();options.builder.cloud.replace({source:JSON.stringify(welcomeBlankSpec(),null,2),ledger:null,topologyContext:null});options.welcome.show();user=null;el('projects').replaceChildren();el('member').hidden=true;el('login').hidden=false;el('account').textContent='';if(reader)readerHost().textContent='Sign in to view this shared project.';auth.signOut();});
  action('refresh',list);
  action('save',async function(){await session.save(el('name').value.trim() || 'Untitled project');await list();});
  action('copy',async function(){await session.copy(el('name').value.trim() || 'Untitled project');await list();});
  action('retry',async function(){await session.save();await list();});
  action('reload',async function(){var p=session.attachment();if(p && await session.open(p.projectId))options.welcome.enterEditor();});
  action('recover',function(){var entry=JSON.parse(localStorage.getItem(recoveryKey()) || 'null');if(entry){session.recover(entry);options.welcome.enterEditor();}});
  action('history',async function(){var p=session.attachment();if(!p || !p.projectId)throw Error('Open or save a project first.');var run=generation,data=await api('GET','/projects/'+p.projectId+'/revisions');if(run!==generation || session.attachment()?.projectId!==p.projectId)return;el('revisions').replaceChildren();data.revisions.sort(function(a,b){return b.revision-a.revision;}).forEach(function(r){var option=document.createElement('option');option.value=r.revision;option.textContent='Revision '+r.revision+' · '+new Date(r.updatedAt).toLocaleString();el('revisions').appendChild(option);});});
  action('restore',async function(){if(!el('revisions').value)throw Error('Load and choose a revision first.');await session.restore(Number(el('revisions').value));await list();});
  beforeUnload=function(event){try{session.preserve();}catch(error){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  if(reader)readerHost();
  auth.init().then(async function(){if(disposed)return;if(auth.access())await signedIn();else panel(true);}).catch(function(error){message(error.message);panel(true);});
  function destroy(){if(disposed)return;disposed=true;generation++;window.removeEventListener('beforeunload',beforeUnload);session.destroy();root.remove();css.remove();}
  options.builder.cloud.own(destroy);return {destroy:destroy};
}

/* One onboarding journey, using wireTour and the real renderer/workbench.
   Practice runs in an opaque-origin, network-disabled iframe. Its source is
   captured before boot touches drafts or navigation. Only explicit tour progress
   crosses the boundary; the user's spec, history, folder and clipboard do not. */
var WORKBENCH_VIEWER_TOPICS=TOUR_DEFAULT_CONFIG.steps.filter(function(step){return (step.kind || 'spot')==='spot';}).map(tourFeatureKey);
function workbenchTourHasViewerHistory(win){
  try{if(win.localStorage.getItem(TOUR_STORAGE_KEY)==='done')return true;}catch(ignored){}
  try{if(tourDoneFromCookie(win.document.cookie))return true;}catch(ignored){}
  var seen=createTourProgress(win).read().seen;
  return WORKBENCH_VIEWER_TOPICS.every(function(id){return seen.indexOf(id)>=0;});
}
function workbenchPracticeSource(source,chapter,viewState){
  if(['viewer','agent','manual','example'].indexOf(chapter)<0)throw Error('Unknown tour chapter');
  // No same-origin capability: storage, the parent's DOM and file handles are
  // inaccessible. CSP also forbids network requests and external navigations.
  return source.replace(/<html\b/i,'<html data-flowview-practice="'+chapter+'" data-flowview-view="'+encodeURIComponent(JSON.stringify(viewState || null))+'"')
    .replace(/<head\b[^>]*>/i,function(head){return head+'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; media-src data:; connect-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri \'none\'">';});
}
function workbenchTourCatalog(){
  return {version:1,source:'Fictional tour catalog · example of a Backstage snapshot',services:[
    {entityRef:'component:default/event-service',title:'Event service',owner:'group:default/devices',dependsOn:['component:default/notifications'],apis:[{entityRef:'api:default/events',title:'Events API',operations:[{operationId:'createEvent',method:'POST',path:'/events',summary:'Register a device event'}]}]},
    {entityRef:'component:default/notifications',title:'Notifications',owner:'group:default/resident-experience',apis:[{entityRef:'api:default/notifications',title:'Notifications API',operations:[{operationId:'notifyResident',method:'POST',path:'/notifications'}]}]},
    {entityRef:'component:default/recording',title:'Recording service',owner:'group:default/media',apis:[]}
  ]};
}
function createWorkbenchPracticeAgent(example){
  var copied='',client=null,storage=new Map(),offered=false;
  return {
    storage:{getItem:function(key){return storage.has(key)?storage.get(key):null;},setItem:function(key,value){storage.set(key,String(value));},removeItem:function(key){storage.delete(key);}},
    instructions:'PRACTICE EXAMPLE — no connection is being created.\n\nIn a real build, paste the full instructions from this dialog into your own local coding agent. They identify your selected diagram folder, spec, coverage ledger and connection files. Ask the agent to explain the visitor-at-the-door story, validate both artifacts and submit its proposed update for preview. Keep the conversation in your agent’s app.',
    copy:function(text){copied=text;return Promise.resolve();},
    copied:function(){return copied;},
    hasReview:function(){return !!(client && client.reviewSnapshot());},
    offered:function(){return offered;},
    connect:function(opts,paint){
      var review=null,revision=0;
      opts.setLedger('# Story coverage\n\n- Visitor detection\n- Delivery to the resident\n');
      client={
        manifest:function(){return {sessionId:'practice',artifacts:{metadata:'.flowview-agent'}};},
        readLedger:function(){return Promise.resolve(opts.snapshot().ledger);},
        reviewSnapshot:function(){return review;},
        propose:function(){
          if(offered)return;offered=true;
          var current=opts.snapshot(),spec=example?JSON.parse(JSON.stringify(example)):JSON.parse(current.source),diagram=(spec.page.sections || spec.page.blocks)[0].diagram;
          diagram.nodes.cloud.sub='Validate event · notify resident';
          var source=JSON.stringify(spec,null,2);
          review={current:current.source,currentLedger:current.ledger,source:source,ledger:'# Story coverage\n\n- Visitor detection\n- Event validation and resident notification\n- Internet-down alternate\n',expected:current,
            review:{id:'practice-update',version:++revision,ok:true,summary:'Clarify the event service and record the alternate outcome.'}};
          paint({review:review.review,pending:null});
        },
        acceptReview:async function(version){
          if(!review || review.review.version!==version)return;
          var result=opts.apply(review.source,review.expected,{id:'practice-update',summary:review.review.summary,ledger:review.ledger});
          if(!result.ok)throw Error(result.error || 'Practice update could not be applied');
          review=null;paint({review:null,pending:null,status:'Practice update committed. Undo restores the diagram and ledger together.'});
        },
        rejectReview:async function(){review=null;paint({review:null,pending:null});},
        send:async function(){return {id:'practice-request',sessionId:'practice',connectionId:'practice'};},
        disconnect:function(){return Promise.resolve();},destroy:function(){},cancel:function(){return Promise.resolve();}
      };return client;
    }
  };
}
function installWorkbenchTourKeyGuard(win){
  // Install before workspace listeners, including their Space-to-pan shortcut.
  win.addEventListener('keydown',function(ev){
    if(!win.document.querySelector('.workbench-tour-host[open]'))return;
    ev.stopImmediatePropagation();
    if((ev.metaKey || ev.ctrlKey) && /^[zdycvx]$/i.test(ev.key) || ev.key==='Delete' || ev.key==='Backspace')ev.preventDefault();
  },true);
}
function initWorkbenchOnboarding(opts){
  var doc=document,example=doc.getElementById('welcome-example-view'),sample=JSON.parse(JSON.stringify(WORKBENCH_ONBOARDING));
  sample.page.sections[0].diagram.sectionLayout={default:[
    {x:0,y:0,w:7,h:7},{panel:'home',x:7,y:0,w:5,h:7},
    {panel:'app',x:0,y:7,w:4,h:10},{panel:'device',x:4,y:7,w:8,h:10},
    {controls:'steps',x:0,y:17,w:12,h:4}
  ]};
  var ctl=null,home=doc.getElementById('welcome-home'),welcomeRoot=doc.getElementById('workbench-welcome');
  var stage=doc.createElement('div');stage.id='welcome-example-stage';
  function sizeExample(){var scale=example.clientWidth/1100;stage.style.transform='scale('+scale+')';example.style.height=(900*scale)+'px';}
  function paintExample(){
    if(home.hidden || welcomeRoot.hidden){if(ctl){ctl.destroy();ctl=null;example.replaceChildren();}return;}
    if(!ctl){example.appendChild(stage);ctl=renderPage(stage,normalize(sample),'pastel',null,{autoplay:false});ctl.suppressFragmentWrites=true;sizeExample();}
  }
  var exampleSize=new ResizeObserver(sizeExample);exampleSize.observe(example);
  var welcomeVisibility=new MutationObserver(paintExample);
  welcomeVisibility.observe(home,{attributes:true,attributeFilter:['hidden']});
  welcomeVisibility.observe(welcomeRoot,{attributes:true,attributeFilter:['hidden']});paintExample();
  var dialog=doc.createElement('dialog');dialog.className='workbench-tour-host';dialog.setAttribute('aria-label','Flowview tour');
  var header=doc.createElement('header');header.className='workbench-tour-header';
  var title=doc.createElement('b');title.textContent='Flowview · Practice project';header.appendChild(title);
  var chapter='viewer',frame=null,returnFocus=null,buttons={},enteredFullscreen=false;
  function button(label,fn){var node=doc.createElement('button');node.type='button';node.className='bbtn';node.textContent=label;node.onclick=fn;header.appendChild(node);return node;}
  ['viewer','agent','manual'].forEach(function(key,index){buttons[key]=button((index+1)+'. '+{viewer:'Explore a diagram',agent:'Work with my agent',manual:'Edit in workbench'}[key],function(){load(key);});});
  button('Full screen',function(){
    if(doc.fullscreenElement){if(doc.exitFullscreen)doc.exitFullscreen().catch(function(){});}
    else if(doc.documentElement.requestFullscreen)doc.documentElement.requestFullscreen().then(function(){enteredFullscreen=true;},function(){note.textContent='Full screen is unavailable in this browser. The tour still fills this tab.';});
  });
  button('Start my diagram',function(){close();opts.welcome.buildWithAgent();});
  button('Close tour',close);
  var practiceNotice='Practice project · Changes stay here. Your draft, folder and clipboard are untouched.';
  var note=doc.createElement('p');note.className='workbench-tour-safety';note.textContent=practiceNotice;
  dialog.append(header,note);doc.body.appendChild(dialog);
  function viewerDismissed(){
    try{window.localStorage.setItem(TOUR_STORAGE_KEY,'done');}catch(ignored){}
    try{doc.cookie=TOUR_COOKIE_NAME+'=1;path=/;max-age=31536000;samesite=lax';}catch(ignored){}
  }
  function load(next){
    if(frame && chapter==='viewer' && next!=='viewer')viewerDismissed();
    note.textContent=practiceNotice;
    if(frame)frame.remove();chapter=next;
    Object.keys(buttons).forEach(function(key){buttons[key].setAttribute('aria-pressed',String(key===next));});
    frame=doc.createElement('iframe');frame.title='Interactive Flowview practice';frame.setAttribute('sandbox','allow-scripts');
    var sp=next==='example' && ctl && ctl.steppers[0] && ctl.steppers[0].stepper;
    var state=sp?{mode:sp.mode(),path:sp.path(),step:sp.sourceIndex()}:null;
    frame.addEventListener('load',function(){if(frame && dialog.open)frame.focus();});
    frame.srcdoc=workbenchPracticeSource(opts.source,next,state);dialog.appendChild(frame);
  }
  function open(next){
    returnFocus=doc.activeElement;if(!dialog.open)dialog.showModal();
    load(next || (workbenchTourHasViewerHistory(window)?'agent':'viewer'));
  }
  function close(){
    if(frame)frame.remove();frame=null;dialog.close();
    if(enteredFullscreen && doc.fullscreenElement && doc.exitFullscreen)doc.exitFullscreen().catch(function(){});enteredFullscreen=false;
    if(returnFocus && returnFocus.isConnected)returnFocus.focus();
  }
  dialog.addEventListener('cancel',function(ev){ev.preventDefault();close();});
  window.addEventListener('message',function(ev){
    if(!frame || ev.source!==frame.contentWindow || !ev.data || ev.data.type!=='flowview-tour')return;
    var data=ev.data;
    if(data.event==='error'){note.textContent='This practice lesson could not open. Choose a chapter above to restart it. Your draft is unchanged.';return;}
    var feature=tourFeatureKey({id:data.id});
    if(data.event==='seen' && chapter==='viewer' && WORKBENCH_VIEWER_TOPICS.indexOf(feature)>=0)
      createTourProgress(window).seen({id:feature});
    if(data.event==='skipped'){
      if(chapter==='viewer'){viewerDismissed();load('agent');}else close();return;
    }
    if(data.event==='finished'){
      if(chapter==='viewer'){viewerDismissed();load('agent');}
      else if(chapter==='agent')load('manual');
      else note.textContent='Tour complete. Keep exploring this practice project, replay a chapter, or choose Start my diagram.';
    }
  });
  var workbenchEntry=doc.createElement('button');workbenchEntry.type='button';workbenchEntry.className='bbtn';
  workbenchEntry.textContent='Take the workbench tour';workbenchEntry.setAttribute('data-workbench-tour','');
  doc.querySelector('.workspace-save').prepend(workbenchEntry);
  doc.querySelectorAll('[data-workbench-tour]').forEach(function(node){node.addEventListener('click',function(){open();});});
  // A tour entry beside the existing written guide, on every real setup surface.
  doc.querySelectorAll('[data-open-human-guide="hg-agent"]').forEach(function(node){
    var tour=doc.createElement('button');tour.type='button';tour.className='welcome-text-button';tour.textContent='Take the workbench tour';
    tour.addEventListener('click',function(){open();});node.insertAdjacentElement('afterend',tour);
  });
  doc.getElementById('welcome-example-expand').addEventListener('click',function(){open('example');});
  return {open:open};
}

function workbenchPracticeLessons(chapter){
  if(chapter==='viewer')return TOUR_DEFAULT_CONFIG;
  function step(id,selector,heading,body,state){return {id:id,target:{selector:selector,within:'page'},diagramState:state,copy:{eyebrow:{viewer:'EXPLORE A DIAGRAM',agent:'WORK WITH YOUR AGENT',manual:'EDIT IN WORKBENCH'}[chapter]+' · PRACTICE',heading:heading,body:body}};}
  var lessons={
    agent:[
      step('setup','#folder-agent-guide','Start with your own agent','Choose the focus of your visualization. Copy & paste is the primary path: you bring a coding agent with access to a local folder. Inside workbench is an optional Beta using your Claude Monitor.'),
      step('folder','#folder-agent-start-detail, .folder-agent-start-detail','Choose the diagram folder','For a new diagram, choose an empty folder your agent can access. Flowview creates the spec and coverage ledger there. Try Select Empty Folder here: this tour uses a pretend folder.'),
      step('instructions','#folder-agent-guide-review','Review, then copy the instructions','Read the connection instructions before copying them into your agent. The real instructions identify your folder and files. This practice copy stays inside the tour.'),
      step('conversation','#practice-agent-window','Continue in your agent’s app','This is an illustrative second window, representing your own agent. Paste the setup instructions, explain the story, answer questions, and ask it to submit an update. Flowview does not supply or launch the agent.'),
      step('pending','#agent-update-banner','A proposed update arrives','The workbench has a pending update. Your accepted diagram is unchanged. Preview Agent Updates opens the proposed diagram and its coverage ledger.'),
      step('preview','#agent-update-dialog','Compare the current and proposed story','Switch Current state and Proposed state, inspect the coverage ledger, and review the actual diagram. Commit update accepts the diagram and ledger together; a Git commit is separate.'),
      step('commit','#agent-update-dialog','Commit when the story is right','Try Commit update, or choose Next to commit this practice update. The spec and coverage ledger become one undoable change. Nothing is written to a real folder.'),
      step('undo','#undo-builder','You remain in control','Undo restores the spec and coverage ledger together. Redo reapplies the accepted update. Review each proposal before accepting it.'),
      step('refine','#practice-agent-window','Ask for the next change','Keep working in the same agent conversation: “Show what the resident sees when the internet is down.” You can make that request more precise with selections in the workbench.'),
      step('selection','#workbench-workspace','Select exactly what you mean','Select a node, connection, step, or panel. Use Shift to select several items. The selection gives your agent precise references alongside the active view and step.'),
      step('copy-agent','#folder-agent-selection','Copy for agent, bottom left','Try Copy for agent. It prepares the selected references and context without replacing your message. Paste that context beside your request in the same agent conversation. Next, try editing directly in the workbench.')
    ],
    manual:[
      step('add','#diagram-add','Start with Add to Diagram','This large button is your entry to nodes, connections, steps, panels, and services from your catalog. Choose a destination section, then add the part your story needs.'),
      step('panel-library','#panel-picker','Choose a panel visually','Browse the real panel library, search or filter by category, select a preview, then explicitly add it. Home maps, App screens, Device app and other panels are different views of the same story.'),
      step('catalog','#catalog-picker','Build with services from your catalog','In your workspace this picker uses your Backstage-sourced catalog or an imported snapshot. This tour supplies a fictional catalog. Choose services and review new/reused counts. Optional connections reflect declared dependencies—not a story sequence.'),
      step('inspector','#editor-inspect','Select something to edit it','Click a node on the diagram, then edit its title, icon, style and other fields in the inspector. Changes are immediate and undoable. Panels have their own fields when selected.'),
      step('rows','#workbench-workspace','Arrange diagram nodes in rows','This node’s float field is set to in rows. Drag it to another row or slot, or drag a row handle to move the row. Rows and stacks organize diagram nodes; panel positions are managed separately in the section layout.'),
      step('align','#editor-inspect','Multi-select and align','These sample nodes are freely positioned floats. Shift-select nodes, then Align horizontally or Align vertically. Alignment uses the first selected node; row nodes use their row and slot controls.'),
      step('service','#editor-inspect','Bind a node to a real company service','Use Company service, then Service API and API operation. The choices come from the catalog. These sample entries demonstrate the same controls used with your Backstage-sourced services.'),
      step('choose-step','#editor-steps','Select a step, then inspect it','Choose the detection step in the Steps list, then click Inspect selected step. The inspector now edits that step’s node selections, connections, and panel changes.'),
      step('step-inspector','#editor-inspect','Edit what belongs to this step','The selected step has its own text, nodes, edges and panel fields. ADD TO STEP lets you choose its participants directly on the canvas. Keep this step selected for the next lessons.'),
      step('add-to-step','#workbench-workspace','Add to Step: click on the diagram','ADD TO STEP is armed for your selected step. Click nodes, connections or panels to toggle their membership. Each click takes effect immediately. Done or Esc exits and keeps your changes. Adding an empty panel patch does not change its contents or visibility.'),
      step('step-panels','#editor-inspect','Change a panel on this same step','After Done, edit this step’s panel fields. All declared panels are available, even without a patch. Show/Hide and App screen choices carry forward. Inherit removes only that assignment; removing a panel patch restores inheritance, not Hide.'),
      step('alternates','#editor-steps','Tell the alternate outcome','Use the Path controls to work on Internet down. An alternate path can share earlier steps and then branch. Its panel updates show the experience along that outcome.'),
      step('nesting','#editor-inspect','Nest a diagram inside a node','A node’s Detail controls link to a child section or approved diagram. Open it to edit the child’s nodes, edges and steps. Nesting belongs to diagrams, never panels.'),
      step('handoff','#editor-brief','Keep the complete story','Use Brief to review the story and prepare a handoff. Your agent and manual edits work on the same diagram. When ready, choose Start my diagram above to leave practice and open the canonical setup.')
    ]
  };
  return {version:1,steps:lessons[chapter] || []};
}
function initWorkbenchPractice(opts){
  var doc=document,chapter=doc.documentElement.dataset.flowviewPractice,builder=opts.builder,tour=null;
  var sample=JSON.parse(JSON.stringify(WORKBENCH_ONBOARDING)),workspace=opts.workspace;
  doc.body.classList.add('workbench-practice');doc.body.classList.remove('welcome-active');
  doc.getElementById('workbench-welcome').hidden=true;doc.getElementById('workbench-workspace').hidden=false;
  builder.loadSpec(chapter==='agent'?welcomeBlankSpec('My visitor story'):sample);workspace.showTool('inspect');
  var reader=null;
  if(chapter==='viewer' || chapter==='example'){
    builder.destroy();
    var readerView=doc.getElementById('docview');readerView.replaceChildren();
    reader=renderPage(readerView,normalize(sample),'pastel',null,{autoplay:false});reader.suppressFragmentWrites=true;
    if(chapter==='example'){
      var initial=JSON.parse(decodeURIComponent(doc.documentElement.dataset.flowviewView || 'null'));
      var player=reader.steppers[0] && reader.steppers[0].stepper;
      if(initial && player){player.jumpSource(initial.step,initial.path);if(initial.mode==='ambient')player.enterAmbient();}
    }
    doc.body.classList.add('practice-viewer');
  }
  function send(event,id){parent.postMessage({type:'flowview-tour',event:event,id:id},'*');}
  function click(id){var node=doc.getElementById(id);if(node && !node.disabled)node.click();}
  function action(text){var node=Array.from(doc.querySelectorAll('#editor-inspect button')).find(function(n){return n.textContent.indexOf(text)>=0;});if(node && !node.disabled)node.click();}
  function select(target,extend){builder.practice.select(target,extend);workspace.showTool('inspect');}
  function revealInspector(node){
    if(!node)return;
    var guide=doc.getElementById('guide');
    for(var parent=node;parent && parent!==guide;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    guide.scrollTop+=node.getBoundingClientRect().top-guide.getBoundingClientRect().top-16;
  }
  function exitMode(){click('addmode-exit');}
  function closeDialog(node){if(node.dispatchEvent(new Event('cancel',{cancelable:true})))node.close();}
  function closeDialogs(keep){doc.querySelectorAll('dialog[open]').forEach(function(node){if(node.id!==keep)closeDialog(node);});}
  var conversation=doc.createElement('dialog');conversation.id='practice-conversation';conversation.className='practice-conversation';
  conversation.setAttribute('aria-label','Your agent’s app · Practice');
  conversation.innerHTML=[
    '<div class="practice-desktop" aria-hidden="true"><div class="practice-desktop-menubar"><b>⌘ &nbsp; Agent</b><span>File &nbsp; Edit &nbsp; View &nbsp; Window &nbsp; Help</span><span class="practice-desktop-clock">Wi-Fi &nbsp; 9:41</span></div><div class="practice-desktop-folders"><span>📁<small>Projects</small></span><span>📁<small>tour-story</small></span></div><div class="practice-desktop-dock"><i>F</i><i>⌘</i><i>›_</i><i>✦</i><i>▤</i></div></div>',
    '<section id="practice-agent-window" class="practice-agent-window" aria-label="Example external coding agent window">',
    '<header class="practice-agent-titlebar"><span class="practice-window-controls" aria-hidden="true"><i></i><i></i><i></i></span><b>Your coding agent</b><span class="practice-window-folder">tour-story</span></header>',
    '<div class="practice-agent-content"><p class="welcome-kicker">Illustration · Your own agent’s window</p><h2>Your agent, your conversation</h2><p>Use your own account and a coding agent that can read the diagram folder.</p>',
    '<div class="practice-message"><b>You</b><p>Explain a visitor arriving at the door. Show the camera, services, and what the resident sees. Include the internet-down outcome.</p></div>',
    '<div class="practice-message practice-reply"><b>Your agent</b><p>I’ll use the shared diagram and ledger to build the story, then submit both for your preview. You can review the result in Flowview.</p></div>',
    '<label for="practice-request">Try a follow-up request</label><textarea id="practice-request" rows="3">Show what the resident sees when the internet is down.</textarea><p class="practice-agent-disclaimer">Example only. This window is not connected to an agent.</p></div></section>'
  ].join('');
  doc.body.appendChild(conversation);
  var last=null,selectedStep=null,aligned=false,activeLesson=null;
  function prepare(step){
    activeLesson=step;
    if(step.id!=='add-to-step')exitMode();
    var id=step.id;
    var keep=['setup','folder','instructions'].includes(id)?'folder-agent-guide':['preview','commit'].includes(id)?'agent-update-dialog':['conversation','refine'].includes(id)?'practice-conversation':null;
    closeDialogs(keep);
    if(chapter==='viewer' || chapter==='example')return;
    if(chapter==='agent'){
      if(id==='setup' || id==='folder')builder.startAgent('external',last?undefined:{newProject:true});
      if(id==='instructions'){builder.practice.agent.connect();builder.startAgent('external');}
      if(['conversation','refine'].includes(id))conversation.showModal();
      if(['pending','preview','commit','selection','copy-agent','undo'].includes(id)){
        builder.practice.agent.connect();
        if(['pending','preview','commit'].includes(id)){
          builder.practice.agent.propose();
          if(opts.agent.hasReview()){if(id!=='pending' && !doc.getElementById('agent-update-dialog').open)click('agent-update-open');}
          else{step.target.selector='#undo-builder';step.copy.body='You already handled this practice update. An accepted update can be undone; a discarded update leaves the diagram unchanged. Continue to refine the story with your agent.';}
        }
      }
      if(id==='selection' || id==='copy-agent'){
        var current=JSON.parse(doc.getElementById('src').value);
        if(!(current.page.sections || current.page.blocks)[0].diagram.nodes.cloud)builder.loadSpec(sample);
        select({kind:'node',section:0,id:'cloud'});
      }
    }else{
      if(id==='add'){workspace.showTool('inspect');}
      if(id==='panel-library'){click('diagram-add');click('add-panel');}
      if(id==='catalog')builder.openCatalog();
      if(id==='inspector' || id==='service')select({kind:'node',section:0,id:'cloud'});
      if(id==='service')revealInspector(Array.from(doc.querySelectorAll('#guide .flab')).find(function(label){return label.textContent==='Company service';}));
      if(id==='rows')select({kind:'node',section:0,id:'camera'});
      if(id==='align'){
        if(!aligned){
          var floats=JSON.parse(doc.getElementById('src').value),d=floats.page.sections[0].diagram;
          d.rows=d.rows.map(function(row){return row.filter(function(id){return id!=='camera' && id!=='hub';});});
          d.floats=(d.floats || []).filter(function(f){return f.id!=='camera' && f.id!=='hub';}).concat([{id:'camera',x:110,y:90},{id:'hub',x:330,y:140}]);
          builder.practice.edit(floats);aligned=true;
        }
        select({kind:'node',section:0,id:'camera'});select({kind:'node',section:0,id:'hub'},true);
      }
      if(['choose-step','step-inspector','add-to-step','step-panels'].includes(id)){
        // Preserve the selected step and every exercise edit across this group.
        var currentSelection=builder.practice.selected();
        if(currentSelection && currentSelection.kind==='step')selectedStep=currentSelection;
        if(!selectedStep){builder.navigate({d:'visitor',s:'detect',p:'happy'});selectedStep={kind:'step',section:0,index:1};}
        select(selectedStep);
        if(id==='choose-step')workspace.showTool('steps');
        if(id==='add-to-step')action('ADD TO STEP');
        if(id==='step-panels'){
          var app=doc.querySelector('#guide .panel-step-group[data-panel-id="app"]');if(app)app.open=true;
          revealInspector(doc.querySelector('#guide .panel-visibility'));
        }
      }
      if(id==='alternates'){workspace.showTool('steps');builder.navigate({d:'visitor',s:'offline',p:'offline'});}
      if(id==='nesting'){
        select({kind:'node',section:0,id:'cloud'});
        revealInspector(doc.querySelector('#guide .node-detail-editor'));
      }
      if(id==='handoff')workspace.showTool('brief');
    }
    last=id;
  }
  // Isolated practice still avoids initiating real clipboard/file/navigation UI.
  doc.addEventListener('click',function(ev){
    var link=ev.target.closest && ev.target.closest('a[href]');
    if(link){ev.preventDefault();ev.stopImmediatePropagation();}
  },true);
  doc.addEventListener('copy',function(ev){ev.preventDefault();ev.stopImmediatePropagation();},true);
  doc.addEventListener('cut',function(ev){ev.preventDefault();ev.stopImmediatePropagation();},true);
  doc.getElementById('agent-update-commit').addEventListener('click',function(){
    if(!tour || !tour.active() || opts.agent.hasReview() || !activeLesson || !['preview','commit'].includes(activeLesson.id))return;
    activeLesson.target.selector='#undo-builder';activeLesson.copy.heading='Update committed';
    activeLesson.copy.body='Your practice diagram and coverage ledger were accepted together. Undo restores both. Choose Next to continue.';
    tour.refresh();
  });
  if(chapter==='example')return;
  function controller(){return reader || opts.controller();}
  tour=wireTour(controller(),doc.body,window,workbenchPracticeLessons(chapter),{
    request:'force',recordCompletion:false,restore:false,replay:false,controller:controller,prepareStep:chapter==='viewer'?null:prepare,
    beforeAdvance:function(step){
      if(step.id==='commit' && opts.agent.hasReview()){
        if(!doc.getElementById('agent-update-dialog').open)click('agent-update-open');
        click('agent-update-proposed');click('agent-update-commit');
        return !opts.agent.hasReview();
      }
    },
    overlayHost:function(){var dialogs=doc.querySelectorAll('dialog[open]');return dialogs[dialogs.length-1] || doc.body;},
    escape:function(ev){
      var dialogs=doc.querySelectorAll('dialog[open]');
      if(dialogs.length){closeDialog(dialogs[dialogs.length-1]);ev.preventDefault();ev.stopImmediatePropagation();return true;}
      if(!doc.getElementById('addmode-exit').hidden){exitMode();ev.preventDefault();ev.stopImmediatePropagation();return true;}return false;
    },
    onShow:function(step){if(chapter==='viewer')send('seen',tourFeatureKey(step));},
    onError:function(){send('error');},
    onFinish:function(done){send(done?'finished':'skipped');}
  });
  return tour;
}

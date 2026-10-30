/* #827: one row per board save, newest first. Read-only runtime evidence: the live-status
   controller hands the validated `page.editHistory` to the panel through its snapshot;
   nothing is authored here and nothing is written back. */
(function(){
  var SAMPLE=[
    {at:'2026-10-30T16:23:15Z',by:{name:'Riley'},changes:[{op:'add',ticket:'BE-68',node:'backend',label:'Backend'},{op:'remove',ticket:'UX-90',node:'ux',label:'UX mobile app'}]},
    {at:'2026-10-29T09:40:00Z',by:{name:'Sam'},changes:[{op:'add',ticket:'FW-46',edge:['hardware','firmware'],label:'Hardware → Firmware'}]}
  ];
  function empty(){return {};}
  function carrierLabel(change){
    if(typeof change.label==='string' && change.label)return change.label;
    if(typeof change.node==='string')return change.node;
    return Array.isArray(change.edge)?change.edge[0]+' → '+change.edge[1]:'';
  }
  function opText(change){return change.op==='remove'?'removed from':'added to';}
  function changeText(change){return change.ticket+' '+opText(change)+' '+carrierLabel(change);}
  function countText(n){return n+' '+(n===1?'change':'changes');}
  function whenText(at){
    var date=new Date(at);if(!isFinite(date.getTime()))return String(at);
    try{return date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
    catch(ex){return date.toISOString().replace('T',' ').slice(0,16)+' UTC';}
  }
  // Chuck 2026-10-30: the live claude.ai profile name, else the stored copy, else "Someone".
  function editorName(entry,names){
    var by=entry.by || {},live=typeof by.id==='string' && names?names[by.id]:'';
    return live || (typeof by.name==='string' && by.name) || 'Someone';
  }
  /* Static markup for the picker preview: the same structure the live mount builds. */
  function rowsHTML(entries){
    return '<ol class="dv-edit-history" aria-label="Edit history">'+entries.map(function(entry){
      return '<li class="dv-edit-entry" data-edit-at="'+esc(entry.at)+'"><details class="dv-edit-details"><summary class="dv-edit-summary">'+
        '<span class="dv-edit-who">'+esc(editorName(entry,null))+'</span><time class="dv-edit-when" datetime="'+esc(entry.at)+'">'+esc(whenText(entry.at))+'</time>'+
        '<span class="dv-edit-count">'+esc(countText(entry.changes.length))+'</span><span class="dv-edit-first">'+esc(changeText(entry.changes[0]))+'</span></summary>'+
        '<ul class="dv-edit-changes">'+entry.changes.map(function(change){
          return '<li class="dv-edit-change" data-edit-op="'+esc(change.op)+'" data-edit-ticket="'+esc(change.ticket)+'"><span class="dv-edit-ticket">'+esc(change.ticket)+'</span>'+
            '<span class="dv-edit-op">'+esc(opText(change))+'</span><span class="dv-edit-carrier">'+esc(carrierLabel(change))+'</span></li>';
        }).join('')+'</ul></details></li>';
    }).join('')+'</ol>';
  }
  function mount(host){
    if(host._panelMotionCleanup)host._panelMotionCleanup();
    var doc=host.ownerDocument || document,live=true,api=null,offChange=null,offDestroy=null,offReady=null,names=Object.create(null),last=null,asked='';
    function el(parent,tag,cls,text){var node=doc.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=String(text);parent.appendChild(node);return node;}
    // Rows are rebuilt on every paint; a row the reader opened stays open across repaints.
    function openKeys(){var keys=Object.create(null);Array.prototype.forEach.call(host.querySelectorAll('details[data-edit-key]'),function(node){if(node.open)keys[node.getAttribute('data-edit-key')]=true;});return keys;}
    function paint(value){
      if(!live)return;last=value;
      var entries=value && Array.isArray(value.editHistory)?value.editHistory:[],states=value && value.states || {},open=openKeys();
      host.replaceChildren();
      if(!entries.length){el(host,'p','dv-edit-history-empty','No edits yet.');return;}
      var list=el(host,'ol','dv-edit-history');list.setAttribute('aria-label','Edit history');
      entries.forEach(function(entry,index){
        var key=entry.at+'#'+index,item=el(list,'li','dv-edit-entry');item.setAttribute('data-edit-at',entry.at);
        var details=el(item,'details','dv-edit-details');details.setAttribute('data-edit-key',key);if(open[key])details.open=true;
        var summary=el(details,'summary','dv-edit-summary');
        el(summary,'span','dv-edit-who',editorName(entry,names));
        el(summary,'time','dv-edit-when',whenText(entry.at)).setAttribute('datetime',entry.at);
        el(summary,'span','dv-edit-count',countText(entry.changes.length));
        el(summary,'span','dv-edit-first',changeText(entry.changes[0]));
        var changes=el(details,'ul','dv-edit-changes');
        entry.changes.forEach(function(change){
          var row=el(changes,'li','dv-edit-change');row.setAttribute('data-edit-op',change.op);row.setAttribute('data-edit-ticket',change.ticket);
          el(row,'span','dv-edit-ticket',change.ticket);
          // The ticket title is live evidence from the status map; absent until a connector answers.
          var title=states[change.ticket] && states[change.ticket].title;if(title)el(row,'span','dv-edit-ticket-title',title);
          el(row,'span','dv-edit-op',opText(change));
          el(row,'span','dv-edit-carrier',carrierLabel(change));
        });
      });
      resolveNames(entries);
    }
    /* Editor names resolve through the viewer's claude.ai `user` capability. Only ids leave
       the page; the shell caches answers, so asking again after each paint is cheap. Without
       window.claude, or when the namespace resolves null, the stored copies stay. */
    function resolveNames(entries){
      var ids=[];entries.forEach(function(entry){var id=entry.by && entry.by.id;if(typeof id==='string' && id && ids.indexOf(id)<0)ids.push(id);});
      if(!ids.length)return;
      var claude=null;try{claude=typeof window!=='undefined'?window.claude:null;}catch(ex){claude=null;}
      if(!claude || typeof claude.use!=='function')return;
      var request=ids.slice().sort().join('\n');if(request===asked)return;asked=request;
      Promise.resolve().then(function(){return claude.use('user');}).then(function(user){
        return user && typeof user.profiles==='function'?user.profiles(ids):null;
      }).then(function(profiles){
        if(!live || !profiles)return;var changed=false;
        ids.forEach(function(id){var name=profiles[id] && typeof profiles[id].name==='string'?profiles[id].name:'';if((names[id] || '')!==name){names[id]=name;changed=true;}});
        if(changed && last)paint(last);
      }).catch(function(){});
    }
    function cleanup(){if(!live)return;live=false;if(offChange)offChange();if(offDestroy)offDestroy();if(offReady)offReady();}
    host._panelMotionCleanup=cleanup;
    function connect(controller){if(!live || api)return;api=controller;if(offReady)offReady();paint(api.snapshot());offChange=api.onChange(paint);offDestroy=api.onDestroy(cleanup);}
    var controller=typeof liveStatusControllerFor==='function'?liveStatusControllerFor(host):null;
    if(controller)connect(controller);else {paint(null);if(typeof liveStatusWhenReady==='function')offReady=liveStatusWhenReady(host,connect);}
  }
  var EDIT_HISTORY_STYLES=String.raw`.pwidget.pt-edit-history{display:flex;flex-direction:column}
.pt-edit-history>.ptitle{flex:none}
.pt-edit-history .pbody{flex:1;min-width:0;min-height:0;overflow:auto;color:var(--dtext);font:13px/1.5 'IBM Plex Sans',sans-serif}
.dv-edit-history-empty{margin:0;color:var(--dfaint)}
.dv-edit-history{list-style:none;margin:0;padding:0}
.dv-edit-entry{border-bottom:1px solid var(--explore-border)}
.dv-edit-summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;padding:8px 4px;cursor:pointer;color:var(--dtext)}
.dv-edit-summary:focus-visible{outline:2px solid var(--dink,currentColor);outline-offset:2px}
.dv-edit-who{font-weight:600;color:var(--dink)}
.dv-edit-when,.dv-edit-count{font:11px/1.5 'IBM Plex Mono',monospace;color:var(--dfaint);white-space:nowrap;font-variant-numeric:tabular-nums}
.dv-edit-first{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.dv-edit-changes{list-style:none;margin:0 0 8px;padding:0 4px 0 20px}
.dv-edit-change{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;padding:3px 0;font-size:12px}
.dv-edit-ticket{font:600 11px/1.5 'IBM Plex Mono',monospace;color:var(--dink)}
.dv-edit-ticket-title{color:var(--dfaint);overflow-wrap:anywhere}
.dv-edit-op{color:var(--dfaint)}
.dv-edit-carrier{color:var(--dtext);overflow-wrap:anywhere}
@media print{.pt-edit-history .pbody{overflow:visible;max-height:none}}
`;
  PanelRegistry.define('edit-history',{
    label:'Edit history',since:'0.2.0',
    validateDeclaration:function(panel,path,warnings,errors,diagram){
      if(Object.prototype.hasOwnProperty.call(panel,'initial'))warnings.push(path+'.initial: edit history has no authored state');
      (diagram && diagram.steps || []).forEach(function(step,index){var patch=stepPanelPatch(step);
        if(patch && Object.prototype.hasOwnProperty.call(patch,panel.id) && !panelObject(patch[panel.id]))
          warnings.push(path.replace(/\.panels\[\d+\]$/,'')+'.steps['+index+'].panels.'+panel.id+': edit history has no authored state');
      });
    },
    validatePatch:function(patch,path,panel,warnings){warnings.push(path+': edit history has no authored state');},
    fold:function(panel,steps){return foldSanitizedPanelStates(panel,steps,empty).map(empty);},
    presentation:{ambientInitial:true},
    layout:{height:6,fallbackHeight:6,supporting:false,large:true,attachControls:false,
      canvasSizing:{mode:'content-fit',maxHeight:480,resizeAxis:'width'},
      sectionSizing:{minWidth:480,preferredWidth:880,maxWidth:1200,aspectPolicy:'content',grow:1}},
    render:function(host,panel,state){return state && state.editSample?{html:rowsHTML(state.editSample)}:
      {html:'<p class="dv-edit-history-empty">No edits yet.</p>',mounted:function(){mount(host);}};},
    authoring:{template:{title:'Edit history'},setupFields:[],patchFields:[],
      picker:{name:'Edit history',category:'Delivery',tagline:'See who changed the board and when',description:'List every save of the live board below the diagram: editor, time and a summary that expands to each ticket added or removed.'},
      example:function(sample){sample.state.editSample=SAMPLE.map(function(entry){return JSON.parse(JSON.stringify(entry));});return sample;}},
    styles:EDIT_HISTORY_STYLES
  });
})();

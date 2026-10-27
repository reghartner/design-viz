/* Authored placement, runtime evidence. No ticket status is folded into the spec. */
(function(){
  var LIVE_SAMPLE=[["BE-67", "Build the notification service", "Riley"], ["BE-68", "Accept firmware events over HTTPS", "Riley"], ["FW-45", "Deliver firmware events", "Sam"], ["FW-46", "Integrate hardware interrupts", "Sam"], ["HW-123", "Debounce the doorbell button", "Alex"], ["HW-124", "Stabilize the hardware event signal", "Alex"], ["UX-89", "Show resident notifications", "Morgan"], ["UX-90", "Alert sound setting", "Morgan"]];
  var states=['todo','active','done','blocked','missing'];
  function empty(){return {};}
  function sampleHTML(sample){
    return '<div class="dv-live-head"><span class="dv-live-note">Day 12 — delivery complete</span></div>'+
      '<div class="dv-live-panel-body"><div class="dv-live-completion">11/11 carriers done</div><p class="dv-live-verdict">Ready to demo · 7 of 8 epic stories on diagram</p><h3>Blockers</h3><p>None</p><h3>Tickets</h3><div class="dv-live-tickets-scroll"><table class="dv-live-tickets"><thead><tr><th>Key</th><th>Title</th><th>State</th><th>Owner</th><th>PRs</th></tr></thead><tbody>'+
      sample.map(function(row){return '<tr><td>'+esc(row.key)+'</td><td>'+esc(row.title)+'</td><td>done</td><td>'+esc(row.owner)+'</td><td>1 merged</td></tr><tr class="dv-live-coverage-row"><td colspan="5"><div class="dv-live-coverage">'+(row.key==='UX-90'?'<span class="dv-live-coverage-tag">NOT ON DIAGRAM</span>':'<span class="reader-button dv-live-chip">On diagram</span>')+'</div></td></tr>';}).join('')+'</tbody></table></div><h3>Activity</h3></div>';
  }
  function mount(host){
    if(host._panelMotionCleanup)host._panelMotionCleanup();
    var doc=host.ownerDocument || document,live=true,offChange=null,offDestroy=null,offReady=null,api=null,epoch=0;
    // The shared renderer may have replaced its shell since our previous mount.
    if(!host._liveHead || host._liveHead.parentNode!==host){host.replaceChildren();host._liveChildren=Object.create(null);}
    function el(parent,tag,key,cls,text){
      var children=parent._liveChildren || (parent._liveChildren=Object.create(null)),node=children[key];
      if(node && node.tagName.toLowerCase()!==tag){node.remove();node=null;}
      if(!node){node=children[key]=tag==='svg' || tag==='circle'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag);parent.appendChild(node);}
      if(parent._liveOrderEpoch!==epoch){parent._liveOrderEpoch=epoch;parent._livePosition=0;}
      var position=parent._livePosition++;
      if(parent.children[position]!==node)parent.insertBefore(node,parent.children[position] || null);
      node._liveEpoch=epoch;
      if(tag==='svg' || tag==='circle')node.setAttribute('class',cls || '');else node.className=cls || '';
      if(text!=null && node.textContent!==String(text))node.textContent=String(text);
      return node;
    }
    function sweep(parent){Object.keys(parent._liveChildren || {}).forEach(function(key){var node=parent._liveChildren[key];if(node._liveEpoch!==epoch){node.remove();delete parent._liveChildren[key];}else sweep(node);});}
    function button(parent,key,cls,text,method){
      var node=el(parent,'button',key,cls,text);node.type='button';node._liveMethod=method;
      if(!node._liveClick){node._liveClick=function(){var owner=host._livePanelApi;if(owner && !node.disabled)owner[node._liveMethod](node._liveArgument);};node.addEventListener('click',node._liveClick);}
      return node;
    }
    function prLink(parent,url){
      var number=/\/(?:pull|pulls|pull-requests|merge_requests|merge-requests)\/(\d+)/.exec(url),host='';try{host=new URL(url).host.replace(/^www\./,'');}catch(ex){}
      var node=el(parent,'a',url,'nbacklink dv-live-pr-link',null);node.setAttribute('href',url);node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');
      node.setAttribute('aria-label','Pull request'+(number?' #'+number[1]:'')+(host?' on '+host:''));node.setAttribute('title',url);
      if(!node.firstChild)node.innerHTML=FlowIcons.render('pull-request',{className:'dv-live-pr-icon',monochrome:true});return node;
    }
    function link(parent,key,label,url){var node=el(parent,url?'a':'span',key,'nbacklink',label);
      if(url){node.setAttribute('href',url);node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');}else node.removeAttribute('href');return node;}
    function paint(value){
      if(!live)return;epoch=host._livePaintEpoch=(host._livePaintEpoch || 0)+1;var focused=doc.activeElement;
      var head=el(host,'div','head','dv-live-head');host._liveHead=head;
      var available=value && value.available,hasData=available && value.hasData;
      var toggle=button(head,'toggle','reader-button dv-live-toggle','Live','setEnabled');toggle.hidden=!hasData;
      toggle._liveArgument=value?!value.enabled:false;toggle.setAttribute('aria-pressed',String(!!(value && value.enabled)));
      states.forEach(function(state){var count=el(head,'span','count-'+state,'dv-live-count',state+' '+(value?value.counts[state]:0));count.setAttribute('data-live-count',state);count.hidden=!hasData || !value.counts[state];});
      var conn=value && value.connection || {state:'none'},connLabel={disconnected:'not connected',approval:'needs approval',connecting:'connecting',connected:'connected',error:'error',demo:'demo'}[conn.state];
      var connection=el(head,'span','connection','dv-live-connection');connection.setAttribute('data-state',conn.state);connection.setAttribute('data-busy',String(!!conn.busy));connection.setAttribute('role','status');
      var connWho=(conn.source || '')+(connLabel && connLabel!==String(conn.source || '').toLowerCase()?' '+connLabel:'');
      el(connection,'i','dot','dv-live-connection-dot');el(connection,'span','text','',[connWho,conn.checkedText].filter(Boolean).join(', '));
      connection.hidden=!available || conn.state==='none';
      var note=el(head,'span','note','dv-live-note',available?value.note.text:'');note.setAttribute('role','status');note.setAttribute('data-kind',value?value.note.kind:'info');note.hidden=!available || !value.note.text;
      var action=button(head,'action','reader-button dv-live-action',available?value.actionLabel:'','runAction');action.hidden=!available || !value.actionLabel;
      var first=button(head,'first','reader-button dv-live-first','First blocker','firstBlocker');first.hidden=!hasData || !value.firstBlocker;
      if(hasData && value.demo){var demo=el(head,'span','demo','dv-live-demo');var play=button(demo,'play','reader-button',value.demo.playing?'Pause':'Play','toggleDemo');play.disabled=value.demo.manual || value.demo.ended;button(demo,'next','reader-button','Next day','nextDemo').disabled=value.demo.ended;}
      head.hidden=!available || !(hasData || value.note.text || value.actionLabel);
      if(!available)el(host,'p','empty','dv-live-empty','This page has no ticket references.');
      if(hasData){
        var body=el(host,'div','body','dv-live-panel-body'),completion=el(body,'div','completion','dv-live-completion'),svg=el(completion,'svg','ring','');svg.setAttribute('viewBox','0 0 44 44');svg.setAttribute('aria-hidden','true');
        ['track','done'].forEach(function(kind){var circle=el(svg,'circle',kind,'dv-live-ring-'+kind);circle.setAttribute('cx','22');circle.setAttribute('cy','22');circle.setAttribute('r','18');circle.setAttribute('pathLength','100');if(kind==='done')circle.setAttribute('stroke-dasharray',(value.readiness.total?100*value.readiness.done/value.readiness.total:0)+' 100');});
        el(completion,'strong','count','',value.readiness.done+'/'+value.readiness.total+' carriers done');el(body,'p','verdict','dv-live-verdict',value.verdict);
        // Lane data stays in the snapshot (step pills, Tickets stripes, Blockers lanes); the Teams rows are not rendered (#767).
        el(body,'h3','blockers-heading','','Blockers');var blockers=el(body,'ul','blockers','dv-live-blockers');
        value.blockers.forEach(function(item){var row=el(blockers,'li',item.key,'dv-live-blocker');link(row,'key',item.key,item.url);el(row,'span','state','dv-live-state-pill',item.state);el(row,'span','lanes','dv-live-blocker-lanes',item.lanes);el(row,'span','downstream','dv-live-downstream',item.downstream);if(item.state==='missing')el(row,'span','missing','dv-live-missing-detail','not found in Jira (deleted, renamed, or no permission)');});
        el(body,'h3','tickets-heading','','Tickets');var scroll=el(body,'div','scroll','dv-live-tickets-scroll'),table=el(scroll,'table','table','dv-live-tickets');table.setAttribute('aria-label','Tickets');
        var tr=el(el(table,'thead','thead',''),'tr','tr','');['Key','Title','State','Owner','PRs'].forEach(function(label){el(tr,'th',label,'',label).setAttribute('scope','col');});
        var tbody=el(table,'tbody','tbody','');value.tickets.forEach(function(item,index){
          var row=el(tbody,'tr',item.key,'dv-live-ticket-row');row.setAttribute('data-live-ticket',item.key);if(item.laneColor)row.style.setProperty('--dv-live-lane-color',item.laneColor);else row.style.removeProperty('--dv-live-lane-color');
          // Retain row and control identities through state changes and sorting (two rows per ticket: data, then its coverage chips).
          if(tbody.children[2*index]!==row)tbody.insertBefore(row,tbody.children[2*index] || null);
          link(el(row,'td','key','dv-live-ticket-key'),'link',item.key,item.url);el(row,'td','title','',item.title);
          el(el(row,'td','state',''),'span','pill','dv-live-state-pill'+(value.enabled && states.indexOf(item.state)>=0?' dv-live-'+item.state:''),item.state);
          el(row,'td','owner','',item.owner);var prs=el(row,'td','prs','dv-live-ticket-prs');item.urls.forEach(function(url){prLink(prs,url);});if(item.prs){var summary=el(prs,'span','summary','dv-live-pr-summary',item.prs.count+' '+item.prs.state);summary.setAttribute('title','Jira Development field: '+item.prs.count+' '+item.prs.state+' pull request'+(item.prs.count===1?'':'s')+'. Jira does not expose the link.');}
          var coverageRow=el(tbody,'tr',item.key+'/coverage','dv-live-coverage-row');coverageRow.setAttribute('data-live-coverage-for',item.key);if(item.laneColor)coverageRow.style.setProperty('--dv-live-lane-color',item.laneColor);else coverageRow.style.removeProperty('--dv-live-lane-color');
          if(tbody.children[2*index+1]!==coverageRow)tbody.insertBefore(coverageRow,tbody.children[2*index+1] || null);
          var coverageCell=el(coverageRow,'td','cell','dv-live-coverage-cell');coverageCell.setAttribute('colspan','5');var coverage=el(coverageCell,'div','coverage','dv-live-coverage');item.carriers.forEach(function(carrier){var key=JSON.stringify([carrier.pageKey,carrier.reference,carrier.id]),control=button(coverage,key,'reader-button dv-live-chip',carrier.label,'focusCarrier');control._liveArgument=carrier;control.disabled=carrier.disabled;if(carrier.title)control.setAttribute('title',carrier.title);else control.removeAttribute('title');});if(item.tag)el(coverage,'span','tag','dv-live-coverage-tag',item.tag);
        });
        el(body,'h3','activity-heading','','Activity');var activity=el(body,'ol','activity','dv-live-activity');value.activity.forEach(function(item,index){var row=el(activity,'li',String(index),'dv-live-activity-entry',item.key+' · '+(item.added?'added to epic · not on diagram':item.old+' → '+item.state)+' · '+item.relative);if(item.at)row.setAttribute('data-updated-at',item.at);else row.removeAttribute('data-updated-at');});
      }
      sweep(host);
      if(focused && host.contains(focused) && doc.activeElement!==focused && focused.focus)focused.focus({preventScroll:true});
    }
    function cleanup(){if(!live)return;live=false;host._livePanelApi=null;if(offChange)offChange();if(offDestroy)offDestroy();if(offReady)offReady();}
    host._panelMotionCleanup=cleanup;
    function connect(controller){if(!live || api)return;api=controller;host._livePanelApi=api;if(offReady)offReady();paint(api.snapshot());offChange=api.onChange(paint);offDestroy=api.onDestroy(cleanup);}
    var controller=typeof liveStatusControllerFor==='function'?liveStatusControllerFor(host):null;
    if(controller)connect(controller);else {paint(null);if(typeof liveStatusWhenReady==='function')offReady=liveStatusWhenReady(host,connect);}
  }
  var LIVE_STYLES=String.raw`.dv-live-toggle{display:flex;gap:4px;align-items:center;}
.dv-live-count{border-radius:4px;padding:2px 4px;color:#111827;}
.dv-live-count[data-live-count="todo"]{background:var(--dv-live-todo);}
.dv-live-count[data-live-count="active"]{background:var(--dv-live-active);}
.dv-live-count[data-live-count="done"]{background:var(--dv-live-done);}
.dv-live-count[data-live-count="blocked"]{background:var(--dv-live-blocked);}
.dv-live-count[data-live-count="missing"]{background:var(--dv-live-missing);}
.dv-live-note{color:var(--dtext);}
.dv-live-connection{display:inline-flex;align-items:center;gap:6px;color:var(--dtext);white-space:nowrap;}
.dv-live-connection[hidden]{display:none!important;}
.dv-live-connection-dot{width:8px;height:8px;border-radius:50%;background:var(--dfaint,var(--dv-live-todo));flex:none;}
.dv-live-connection[data-state="connected"] .dv-live-connection-dot,.dv-live-connection[data-state="demo"] .dv-live-connection-dot{background:var(--dv-live-done);}
.dv-live-connection[data-state="connecting"] .dv-live-connection-dot,.dv-live-connection[data-state="approval"] .dv-live-connection-dot{background:var(--dv-live-active);}
.dv-live-connection[data-state="error"] .dv-live-connection-dot{background:var(--dv-live-blocked);}
.dv-live-connection[data-busy="true"] .dv-live-connection-dot{animation:dv-live-connection-pulse 1.2s ease-in-out infinite;}
@keyframes dv-live-connection-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.7);}}
@media (prefers-reduced-motion: reduce){.dv-live-connection-dot{animation:none!important;}}
.dv-live-pr-link{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:5px;color:var(--navigation-accent,var(--dink));}
.dv-live-pr-link .dv-live-pr-icon{width:14px;height:14px;flex:none;}
.dv-live-pr-link:hover{background:color-mix(in srgb,var(--navigation-accent,var(--dink)) 10%,transparent);}
.dv-live-note[data-kind="warn"],.dv-live-note[data-kind="error"]{color:var(--dv-live-blocked);}
.dv-live-demo{display:inline-flex;gap:6px;}
.dv-live-completion{display:flex;align-items:center;gap:12px;font-variant-numeric:tabular-nums;}
.dv-live-completion svg{width:64px;height:64px;flex:none;transform:rotate(-90deg);}
.dv-live-completion circle{fill:none;stroke-width:4;}
.dv-live-ring-track{stroke:var(--dv-live-todo);opacity:.3;}
.dv-live-ring-done{stroke:var(--dv-live-done);}
.dv-live-verdict{font-weight:700;}
.dv-live-blockers,.dv-live-activity{list-style:none;padding:0;margin:0;}
.dv-live-blocker{display:flex;flex-wrap:wrap;gap:4px 8px;padding:10px 0;border-bottom:1px solid var(--explore-border);}
.dv-live-blocker-lanes,.dv-live-downstream,.dv-live-missing-detail{flex-basis:100%;}
.dv-live-activity-entry{padding:5px 0;font-size:12px;}
.dv-live-tickets-scroll{overflow:auto;max-width:100%;}
.dv-live-tickets{width:100%;min-width:480px;border-collapse:collapse;text-align:left;font-size:12px;}
.dv-live-tickets th,.dv-live-tickets td{padding:8px;vertical-align:top;border-bottom:1px solid var(--explore-border);}
.dv-live-tickets th{font-weight:700;}
.dv-live-ticket-key{border-left:4px solid var(--dv-live-lane-color,transparent);white-space:nowrap;}
.dv-live-tickets .dv-live-ticket-prs{white-space:nowrap;}
.dv-live-tickets .dv-live-ticket-row td{border-bottom:0;padding-bottom:4px;}
.dv-live-coverage-cell{padding-top:0!important;}
.dv-live-coverage{display:flex;flex-wrap:wrap;justify-content:flex-start;align-items:center;gap:6px;}
.dv-live-coverage .dv-live-chip{display:inline-flex;align-items:center;min-height:22px;padding:1px 8px;border:1px solid var(--explore-border);border-radius:999px;font:500 11px/1.4 'IBM Plex Sans',sans-serif;white-space:nowrap;}
.dv-live-coverage-tag{display:inline-flex;align-items:center;min-height:22px;padding:1px 8px;border-radius:4px;font:700 10px/1.4 'IBM Plex Mono',monospace;letter-spacing:.06em;white-space:nowrap;background:color-mix(in srgb,var(--dv-live-active) 18%,transparent);color:var(--dink);}
.dv-live-pr-summary{color:var(--dfaint);margin-left:4px;}
.dv-live-tickets .dv-live-state-pill{color:var(--dv-live-color,inherit);white-space:nowrap;}

.pwidget.pt-live-status{display:flex;flex-direction:column}
.pt-live-status>.ptitle{flex:none}
.pt-live-status .pbody{flex:1;min-width:0;min-height:0;overflow:auto;color:var(--dtext);font:13px/1.5 'IBM Plex Sans',sans-serif}
.dv-live-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--explore-border);font:11px/1.5 'IBM Plex Mono',monospace}
.pt-live-status [hidden]{display:none!important}
.dv-live-panel-body{min-width:0;color:var(--dtext)}
.dv-live-panel-body h3{margin:18px 0 8px;font:600 14px/1.4 'IBM Plex Sans',sans-serif;color:var(--dink)}
.dv-live-empty{color:var(--dfaint)}
.dv-live-ring-done{transition:stroke-dasharray .3s ease}
@media(prefers-reduced-motion:reduce){.dv-live-ring-done{transition:none;animation:none}}
@media print{.pt-live-status .pbody,.dv-live-tickets-scroll{overflow:visible;max-height:none}.dv-live-ring-done{transition:none;animation:none}}
`;
  PanelRegistry.define('live-status',{
    label:'Live status',since:'0.2.0',
    validateDeclaration:function(panel,path,warnings,errors,diagram){
      if(Object.prototype.hasOwnProperty.call(panel,'initial'))warnings.push(path+'.initial: live status has no authored state');
      // The shared validator reports malformed patches before type dispatch.
      // Still explain that even those patches cannot author this panel's state.
      (diagram && diagram.steps || []).forEach(function(step,index){var patch=stepPanelPatch(step);
        if(patch && Object.prototype.hasOwnProperty.call(patch,panel.id) && !panelObject(patch[panel.id]))
          warnings.push(path.replace(/\.panels\[\d+\]$/,'')+'.steps['+index+'].panels.'+panel.id+': live status has no authored state');
      });
    },
    validatePatch:function(patch,path,panel,warnings){warnings.push(path+': live status has no authored state');},
    fold:function(panel,steps){return foldSanitizedPanelStates(panel,steps,empty).map(empty);},
    presentation:{ambientInitial:true},
    layout:{height:10,fallbackHeight:10,supporting:false,large:true,attachControls:false,
      canvasSizing:{mode:'content-fit',maxHeight:640,resizeAxis:'width'},
      sectionSizing:{minWidth:480,preferredWidth:880,maxWidth:1200,aspectPolicy:'content',grow:1}},
    render:function(host,panel,state){return state && state.liveSample?{html:sampleHTML(state.liveSample)}:
      {html:'<div class="dv-live-head"></div><p class="dv-live-empty">This page has no ticket references.</p>',mounted:function(){mount(host);}};},
    authoring:{template:{title:'Live status'},setupFields:[],patchFields:[],
      picker:{name:'Live status',category:'Delivery',tagline:'See what is ready and what is blocked',description:'Show live ticket progress, blockers and the stories in your epic beside or below the diagram.'},
      example:function(sample){sample.state.liveSample=LIVE_SAMPLE.map(function(row){return {key:row[0],title:row[1],owner:row[2]};});return sample;}},
    styles:LIVE_STYLES
  });
})();

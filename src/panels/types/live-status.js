/* Authored placement, runtime evidence. No ticket status is folded into the spec. */
(function(){
  var LIVE_SAMPLE=[["BE-67", "Build the notification service", "Riley"], ["BE-68", "Accept firmware events over HTTPS", "Riley"], ["FW-45", "Deliver firmware events", "Sam"], ["FW-46", "Integrate hardware interrupts", "Sam"], ["HW-123", "Debounce the doorbell button", "Alex"], ["HW-124", "Stabilize the hardware event signal", "Alex"], ["UX-89", "Show resident notifications", "Morgan"], ["UX-90", "Alert sound setting", "Morgan"]];
  var states=['todo','active','done','blocked','missing'];
  function empty(){return {};}
  function sampleHTML(sample){
    return '<div class="dv-live-head"><span class="dv-live-note">Day 12 — delivery complete</span></div>'+
      '<div class="dv-live-panel-body"><div class="dv-live-epic"><div class="dv-live-completion">11/11 carriers done</div><div class="dv-live-epic-main"><span class="dv-live-epic-key">DOOR-100</span> <span class="dv-live-epic-title">Connected doorbell delivery</span> <span class="dv-live-state-pill dv-live-epic-state">done</span><div class="dv-live-epic-progress">8 of 8 stories done · 7 of 8 epic stories on diagram</div><div class="dv-live-epic-counts">Ready to demo</div></div></div>'+
      '<h3>Tickets</h3><div class="dv-live-tickets-scroll"><table class="dv-live-tickets"><thead><tr><th>Key</th><th>Title</th><th>State</th><th>Owner</th><th>Depends on</th><th>PRs</th></tr></thead><tbody>'+
      sample.map(function(row){return '<tr><td>'+esc(row.key)+'</td><td>'+esc(row.title)+'</td><td>done</td><td>'+esc(row.owner)+'</td><td>'+(row.key==='FW-46'?'<span class="dv-live-dep" data-tone="none"><span class="dv-live-dep-key">HW-124</span> <span class="dv-live-state-pill">done</span></span>':'')+'</td><td>1 merged</td></tr><tr class="dv-live-coverage-row"><td colspan="6"><div class="dv-live-coverage">'+(row.key==='UX-90'?'<span class="dv-live-coverage-tag">NOT ON DIAGRAM</span>':'<span class="reader-button dv-live-chip">On diagram</span>')+'</div></td></tr>';}).join('')+'</tbody></table></div><h3>Blockers and dependency chains</h3><p>None</p><h3>Activity</h3></div>';
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
    // One keyed icon per URL: GitHub evidence (#756) and a plain authored link share the node, so a URL that gains evidence keeps its identity.
    function prLink(parent,pr){return liveStatusPRDecorate(el(parent,'a',typeof pr==='string'?pr:pr.url,'nbacklink dv-live-pr-link',null),pr);}
    // One bounded control per upstream (#765): icon (hand while unfinished, alarm when blocked or missing),
    // key, state pill. No source line; an authored reason rides the tooltip. Click focuses the upstream row.
    function depButton(parent,key,dep){
      var node=el(parent,'button',key,'dv-live-dep'+(dep.tone==='red'?' dv-live-dep-red':''));node.type='button';node.setAttribute('data-live-dep-for',dep.key);node.setAttribute('data-tone',dep.tone);
      if(dep.reason)node.setAttribute('title',dep.reason);else node.removeAttribute('title');
      node.setAttribute('aria-label',dep.key+' · '+dep.state+(dep.tone==='red'?' · blocked upstream':dep.tone==='grey'?' · upstream not done':'')+(dep.reason?' · '+dep.reason:''));
      var icon=dep.tone==='red'?'alarm':dep.tone==='grey'?'hand':null;
      var glyph=el(node,'span','icon','dv-live-dep-icon');if(icon){if(glyph.getAttribute('data-icon')!==icon){glyph.innerHTML=FlowIcons.render(icon,{className:'dv-live-dep-glyph',monochrome:true});glyph.setAttribute('data-icon',icon);}}else{glyph.innerHTML='';glyph.removeAttribute('data-icon');}glyph.hidden=!icon;
      el(node,'span','key','dv-live-dep-key',dep.key);el(node,'span','state','dv-live-state-pill'+(states.indexOf(dep.state)>=0?' dv-live-'+dep.state:''),dep.state);
      if(!node._liveClick){node._liveClick=function(){var table=host.querySelector('table.dv-live-tickets'),row=table && table.querySelector('tr[data-live-ticket="'+node.getAttribute('data-live-dep-for')+'"]'),target=row && (row.querySelector('a') || row.querySelector('.dv-live-ticket-key'));if(target && target.focus){target.focus({preventScroll:false});if(row.scrollIntoView)row.scrollIntoView({block:'nearest'});}};node.addEventListener('click',node._liveClick);}
      return node;
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
      var gh=conn.github || {state:'none'},ghLabel={disconnected:'GitHub not connected',connecting:'GitHub connecting',connected:'GitHub connected',error:'GitHub did not answer'}[gh.state];
      var github=el(connection,'span','github','dv-live-connection-github',ghLabel || '');github.setAttribute('data-state',gh.state);github.setAttribute('data-busy',String(!!gh.busy));github.hidden=!ghLabel;
      connection.hidden=!available || conn.state==='none';
      var note=el(head,'span','note','dv-live-note',available?value.note.text:'');note.setAttribute('role','status');note.setAttribute('data-kind',value?value.note.kind:'info');note.hidden=!available || !value.note.text;
      var action=button(head,'action','reader-button dv-live-action',available?value.actionLabel:'','runAction');action.hidden=!available || !value.actionLabel;
      var first=button(head,'first','reader-button dv-live-first','First blocker','firstBlocker');first.hidden=!hasData || !value.firstBlocker;
      if(hasData && value.demo){var demo=el(head,'span','demo','dv-live-demo');var play=button(demo,'play','reader-button',value.demo.playing?'Pause':'Play','toggleDemo');play.disabled=value.demo.manual || value.demo.ended;button(demo,'next','reader-button','Next day','nextDemo').disabled=value.demo.ended;}
      head.hidden=!available || !(hasData || value.note.text || value.actionLabel);
      if(!available)el(host,'p','empty','dv-live-empty','This page has no ticket references.');
      if(hasData){
        var body=el(host,'div','body','dv-live-panel-body'),epic=value.epic || {keys:[]};
        // Epic header box (#765): the epic is shown large inside the panel, never in the title bar. The old verdict line is gone.
        var box=el(body,'div','epic','dv-live-epic'),completion=el(box,'div','completion','dv-live-completion'),svg=el(completion,'svg','ring','');svg.setAttribute('viewBox','0 0 44 44');svg.setAttribute('aria-hidden','true');
        ['track','done'].forEach(function(kind){var circle=el(svg,'circle',kind,'dv-live-ring-'+kind);circle.setAttribute('cx','22');circle.setAttribute('cy','22');circle.setAttribute('r','18');circle.setAttribute('pathLength','100');if(kind==='done')circle.setAttribute('stroke-dasharray',(value.readiness.total?100*value.readiness.done/value.readiness.total:0)+' 100');});
        el(completion,'strong','count','',value.readiness.done+'/'+value.readiness.total+' carriers done');
        var main=el(box,'div','main','dv-live-epic-main');
        if(epic.keys.length){
          var keyRow=el(main,'div','keys','dv-live-epic-keys');link(keyRow,'key',epic.keys[0],epic.url).className='nbacklink dv-live-epic-key';if(epic.keys.length>1)el(keyRow,'span','more','dv-live-epic-more','+'+(epic.keys.length-1)+' more');
          el(main,'div','title','dv-live-epic-title',epic.title || '');
          var pill=el(main,'span','state','dv-live-state-pill dv-live-epic-state'+(value.enabled && epic.state?' dv-live-'+epic.state:''),epic.state || 'No status');pill.hidden=!epic.state;
          var progress=el(main,'div','progress','dv-live-epic-progress',epic.done+' of '+epic.stories+' stories done · '+epic.onDiagram+' of '+epic.stories+' on diagram');progress.hidden=!epic.stories;
        }
        var countParts=[epic.blocked+' blocked',epic.waiting+' waiting'];if(epic.keys.length)countParts.push(epic.outside+' outside epic');if(epic.ready)countParts.unshift('Ready to demo');
        el(main,'div','counts','dv-live-epic-counts',countParts.join(' · '));
        // Tickets first and tall (#765); lane data stays on step pills, row stripes and Blockers lanes (#767).
        el(body,'h3','tickets-heading','','Tickets');var scroll=el(body,'div','scroll','dv-live-tickets-scroll'),table=el(scroll,'table','table','dv-live-tickets');table.setAttribute('aria-label','Tickets');
        var tr=el(el(table,'thead','thead',''),'tr','tr','');['Key','Title','State','Owner','Depends on','PRs'].forEach(function(label){el(tr,'th',label,'',label).setAttribute('scope','col');});
        var tbody=el(table,'tbody','tbody','');value.tickets.forEach(function(item,index){
          var row=el(tbody,'tr',item.key,'dv-live-ticket-row');row.setAttribute('data-live-ticket',item.key);if(item.laneColor)row.style.setProperty('--dv-live-lane-color',item.laneColor);else row.style.removeProperty('--dv-live-lane-color');
          // Retain row and control identities through state changes and sorting (two rows per ticket: data, then its coverage chips).
          if(tbody.children[2*index]!==row)tbody.insertBefore(row,tbody.children[2*index] || null);
          var keyCell=el(row,'td','key','dv-live-ticket-key');link(keyCell,'link',item.key,item.url);if(item.epicLabel)el(keyCell,'div','epic','dv-live-ticket-epic',item.epicLabel);el(row,'td','title','',item.title);
          el(el(row,'td','state',''),'span','pill','dv-live-state-pill'+(value.enabled && states.indexOf(item.state)>=0?' dv-live-'+item.state:''),item.state);
          var ownerCell=el(row,'td','owner','dv-live-ticket-owner');if(item.ownerUrl)link(ownerCell,'link',item.owner,item.ownerUrl);else el(ownerCell,'span','text','',item.owner);var depends=el(row,'td','depends','dv-live-ticket-depends');(item.dependsOn || []).forEach(function(dep){depButton(depends,dep.key,dep);});
          var prs=el(row,'td','prs','dv-live-ticket-prs'),links=item.prs && item.prs.links || [],covered=links.map(function(pr){return pr.url;});
          links.forEach(function(pr){prLink(prs,pr);});item.urls.forEach(function(url){if(covered.indexOf(url)<0)prLink(prs,url);});
          // Jira's Development count stays informational; it is shown only when it says more than the icons do.
          if(item.prs && item.prs.count>links.length){var summary=el(prs,'span','summary','dv-live-pr-summary',item.prs.count+' '+item.prs.state);summary.setAttribute('title','Jira Development field: '+item.prs.count+' '+item.prs.state+' pull request'+(item.prs.count===1?'':'s')+'. Jira does not expose the link.');}
          var coverageRow=el(tbody,'tr',item.key+'/coverage','dv-live-coverage-row');coverageRow.setAttribute('data-live-coverage-for',item.key);if(item.laneColor)coverageRow.style.setProperty('--dv-live-lane-color',item.laneColor);else coverageRow.style.removeProperty('--dv-live-lane-color');
          if(tbody.children[2*index+1]!==coverageRow)tbody.insertBefore(coverageRow,tbody.children[2*index+1] || null);
          var coverageCell=el(coverageRow,'td','cell','dv-live-coverage-cell');coverageCell.setAttribute('colspan','6');var coverage=el(coverageCell,'div','coverage','dv-live-coverage');item.carriers.forEach(function(carrier){var key=JSON.stringify([carrier.pageKey,carrier.reference,carrier.id]),control=button(coverage,key,'reader-button dv-live-chip',carrier.label,'focusCarrier');control._liveArgument=carrier;control.disabled=carrier.disabled;if(carrier.title)control.setAttribute('title',carrier.title);else control.removeAttribute('title');});if(item.tag)el(coverage,'span','tag','dv-live-coverage-tag',item.tag);
        });
        // A light hint only: the agent, not the page, writes to Jira.
        var suggestions=value.suggestions || [],suggest=el(body,'p','suggest','dv-live-suggest',suggestions.length?suggestions.length+' authored '+(suggestions.length===1?'dependency':'dependencies')+' ('+suggestions.map(function(item){return item.ticket+' → '+item.on;}).join(', ')+') '+(suggestions.length===1?'has':'have')+' no Jira link. Suggest link in Jira':'');suggest.hidden=!suggestions.length;
        if(!suggestions.length)suggest.remove();
        el(body,'h3','blockers-heading','','Blockers and dependency chains');var blockers=el(body,'ul','blockers','dv-live-blockers');
        value.blockers.forEach(function(item){var row=el(blockers,'li',item.key,'dv-live-blocker');link(row,'key',item.key,item.url);el(row,'span','state','dv-live-state-pill',item.state);el(row,'span','lanes','dv-live-blocker-lanes',item.lanes);el(row,'span','downstream','dv-live-downstream',item.downstream);if(item.state==='missing')el(row,'span','missing','dv-live-missing-detail','not found in Jira (deleted, renamed, or no permission)');});
        // One row per chain: each hop is the same bounded button, "holds" between hops.
        var chains=el(body,'ul','chains','dv-live-chains'),depOf=function(key){var found=null;value.tickets.some(function(ticket){return (ticket.dependsOn || []).some(function(dep){if(dep.key===key)found=dep;return !!found;});});
          var entry=value.states[key],state=found?found.state:entry && states.indexOf(entry.state)>=0?entry.state:'missing';return {key:key,state:state,tone:found?found.tone:state==='done'?'none':state==='blocked' || state==='missing'?'red':'grey',reason:found?found.reason:''};};
        (value.chains || []).forEach(function(chain){var row=el(chains,'li',chain.join('>'),'dv-live-chain');chain.forEach(function(key,index){if(index)el(row,'span','holds-'+index,'dv-live-chain-holds','holds');
          var dep=depOf(key);if(index===chain.length-1){var last=value.tickets.filter(function(ticket){return ticket.key===key;})[0];dep={key:key,state:last?last.state:dep.state,tone:last && last.waiting?last.waiting:'none',reason:''};}
          depButton(row,'hop-'+index,dep);});});
        if(!value.blockers.length && !(value.chains || []).length)el(body,'p','none','dv-live-none','None');
        el(body,'h3','activity-heading','','Activity');var activity=el(body,'ol','activity','dv-live-activity');value.activity.forEach(function(item,index){var row=el(activity,'li',String(index),'dv-live-activity-entry',item.key+' · '+(item.added?'added to epic · not on diagram':item.old+' → '+item.state)+' · '+item.relative);if(item.at)row.setAttribute('data-updated-at',item.at);else row.removeAttribute('data-updated-at');});
      }
      // #758: a built page carries an agent guide block; tell editors where it is. Nothing is painted without it.
      if(doc.getElementById('dv-agent-guide'))el(host,'p','agent-guide','dv-live-agent-guide',"Editors: ask your agent to read this page's agent guide (id dv-agent-guide)");
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
.dv-live-count{border-radius:4px;padding:2px 4px;color:var(--dv-live-on);}
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
.dv-live-connection-github::before{content:'· ';}
.dv-live-connection-github[data-state="error"]{color:var(--dv-live-blocked);}
@keyframes dv-live-connection-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.7);}}
@media (prefers-reduced-motion: reduce){.dv-live-connection-dot{animation:none!important;}}
.dv-live-note[data-kind="warn"],.dv-live-note[data-kind="error"]{color:var(--dv-live-blocked);}
.dv-live-demo{display:inline-flex;gap:6px;}
.dv-live-epic{display:flex;gap:16px;align-items:center;padding:14px 16px;margin-top:12px;border:1px solid var(--explore-border);border-radius:10px;background:color-mix(in srgb,var(--dink) 4%,transparent);}
.dv-live-epic-main{display:flex;flex-direction:column;gap:4px;min-width:0;}
.dv-live-epic-keys{display:flex;align-items:baseline;gap:8px;font:700 20px/1.2 'IBM Plex Mono',monospace;letter-spacing:.02em;}
.dv-live-epic-key{font:inherit;}
.dv-live-epic-more{font:11px/1.4 'IBM Plex Mono',monospace;color:var(--dfaint);}
.dv-live-epic-title{font:600 14px/1.4 'IBM Plex Sans',sans-serif;color:var(--dink);overflow-wrap:anywhere;}
.dv-live-epic-state{align-self:flex-start;}
.dv-live-epic-progress,.dv-live-epic-counts{font:11px/1.5 'IBM Plex Mono',monospace;color:var(--dtext);font-variant-numeric:tabular-nums;}
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
.dv-live-ticket-epic{font:10px/1.4 'IBM Plex Mono',monospace;color:var(--dfaint);letter-spacing:.04em;margin-top:2px;}
.dv-live-ticket-depends{min-width:140px;}
.dv-live-dep{display:inline-flex;align-items:center;gap:5px;max-width:100%;margin:0 4px 4px 0;padding:2px 7px 2px 5px;border:1px solid var(--dv-live-todo);border-radius:6px;background:transparent;color:var(--dtext);font:600 11px/1.4 'IBM Plex Mono',monospace;cursor:pointer;white-space:nowrap;}
.dv-live-dep:hover{background:color-mix(in srgb,var(--dink) 6%,transparent);}
.dv-live-dep:focus-visible{outline:2px solid var(--dink,currentColor);outline-offset:2px;}
.dv-live-dep.dv-live-dep-red{border-color:var(--dv-live-blocked);color:var(--dv-live-blocked);}
.dv-live-dep-icon{display:inline-flex;width:14px;height:14px;flex:none;}
.dv-live-dep-icon[hidden]{display:none!important;}
.dv-live-dep-icon .dv-live-dep-glyph{width:14px;height:14px;}
.dv-live-dep .dv-live-state-pill{font:500 10px/1.4 'IBM Plex Sans',sans-serif;}
.dv-live-chains{list-style:none;padding:0;margin:0;}
.dv-live-chain{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;padding:8px 0;border-bottom:1px solid var(--explore-border);}
.dv-live-chain-holds{font:11px/1.4 'IBM Plex Sans',sans-serif;color:var(--dfaint);}
.dv-live-none{color:var(--dfaint);}
.dv-live-suggest{margin:8px 0 0;font:11px/1.5 'IBM Plex Sans',sans-serif;color:var(--dfaint);}
.dv-live-tickets .dv-live-state-pill{color:var(--dv-live-color,inherit);white-space:nowrap;}
.dv-live-tickets .dv-live-state-pill:is(.dv-live-todo,.dv-live-active,.dv-live-done,.dv-live-blocked,.dv-live-missing){background:var(--dv-live-color);border-color:var(--dv-live-color);color:var(--dv-live-on);}

.pwidget.pt-live-status{display:flex;flex-direction:column}
.pt-live-status>.ptitle{flex:none}
.pt-live-status .pbody{flex:1;min-width:0;min-height:0;overflow:auto;color:var(--dtext);font:13px/1.5 'IBM Plex Sans',sans-serif}
.dv-live-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--explore-border);font:11px/1.5 'IBM Plex Mono',monospace}
.pt-live-status [hidden]{display:none!important}
.dv-live-panel-body{min-width:0;color:var(--dtext)}
.dv-live-panel-body h3{margin:18px 0 8px;font:600 14px/1.4 'IBM Plex Sans',sans-serif;color:var(--dink)}
.dv-live-empty{color:var(--dfaint)}
.dv-live-agent-guide{margin:12px 0 0;font:11px/1.5 'IBM Plex Sans',sans-serif;color:var(--dfaint)}
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

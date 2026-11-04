/* Authored placement, runtime evidence. No ticket status is folded into the spec. */
(function(){
  var LIVE_SAMPLE=[["BE-67", "Build the notification service", "Riley"], ["BE-68", "Accept firmware events over HTTPS", "Riley"], ["FW-45", "Deliver firmware events", "Sam"], ["FW-46", "Integrate hardware interrupts", "Sam"], ["HW-123", "Debounce the doorbell button", "Alex"], ["HW-124", "Stabilize the hardware event signal", "Alex"], ["UX-89", "Show resident notifications", "Morgan"], ["UX-90", "Alert sound setting", "Morgan"]];
  var states=['todo','active','done','blocked','missing'];
  var ticketStateOrder=['blocked','missing','active','todo','done'];
  var ticketCollator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
  function ticketText(value){return String(value == null?'':value).trim();}
  function ticketCompareText(a,b){
    var left=ticketText(a),right=ticketText(b);
    return left && right?ticketCollator.compare(left,right):left? -1:right?1:0;
  }
  function sortedTickets(tickets,sort){
    if(!sort)return tickets;
    return tickets.slice().sort(function(a,b){
      var diff=0,field=sort.field;
      if(field==='state'){
        var left=ticketStateOrder.indexOf(a.state),right=ticketStateOrder.indexOf(b.state);
        diff=(left<0?ticketStateOrder.length:left)-(right<0?ticketStateOrder.length:right);
        if(left<0 || right<0){if(left<0 && right<0)diff=0;else return diff;}
      }else{
        var leftText=field==='title' && a.title==='—'?'':field==='owner' && a.owner==='Unassigned'?'':a[field];
        var rightText=field==='title' && b.title==='—'?'':field==='owner' && b.owner==='Unassigned'?'':b[field];
        diff=ticketCompareText(leftText,rightText);
        if(!ticketText(leftText) || !ticketText(rightText))return diff || ticketCompareText(a.key,b.key);
      }
      return (sort.direction==='descending'?-diff:diff) || ticketCompareText(a.key,b.key) || (a.key<b.key?-1:a.key>b.key?1:0);
    });
  }
  function empty(){return {};}
  function sampleHTML(sample){
    return '<div class="dv-live-head"><span class="dv-live-note">Day 12 — delivery complete</span></div>'+
      '<div class="dv-live-panel-body"><div class="dv-live-epic"><div class="dv-live-completion">11/11 carriers done</div><div class="dv-live-epic-main"><span class="dv-live-epic-key">DOOR-100</span> <span class="dv-live-epic-title">Connected doorbell delivery</span> <span class="dv-live-state-pill dv-live-epic-state">done</span><div class="dv-live-epic-progress">8 of 8 stories done · 7 of 8 epic stories on diagram</div><div class="dv-live-epic-counts">Ready to demo</div></div></div>'+
      '<h3>Tickets</h3><div class="dv-live-tickets-scroll"><table class="dv-live-tickets"><thead><tr><th>Key</th><th>Title</th><th>State</th><th>Owner</th><th>Depends on</th><th>PRs</th></tr></thead><tbody>'+
      sample.map(function(row){return '<tr class="dv-live-ticket-row'+(row.key==='UX-90'?' dv-live-ticket-with-tag':'')+'"><td class="dv-live-ticket-key">'+esc(row.key)+'</td><td class="dv-live-ticket-title">'+esc(row.title)+'</td><td>done</td><td class="dv-live-ticket-owner">'+esc(row.owner)+'</td><td class="dv-live-ticket-depends">'+(row.key==='FW-46'?'<span class="dv-live-dep dv-live-dep-done" data-tone="done"><span class="dv-live-dep-icon" data-icon="check"></span><span class="dv-live-dep-key">HW-124</span> <span class="dv-live-state-pill">done</span></span>':'')+'</td><td class="dv-live-ticket-prs">1 merged</td></tr>'+(row.key==='UX-90'?'<tr class="dv-live-coverage-row"><td colspan="6"><div class="dv-live-coverage"><span class="dv-live-coverage-tag">NOT ON DIAGRAM</span></div></td></tr>':'');}).join('')+'</tbody></table></div><h3>Blockers and dependency chains</h3><p>None</p><h3>Activity</h3></div>';
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
    // Header buttons wear `tbtn`, the reader's per-theme button look shared with the section's Play and Present buttons (#863).
    function button(parent,key,cls,text,method){
      var node=el(parent,'button',key,cls+' tbtn',text);node.type='button';node._liveMethod=method;
      if(!node._liveClick){node._liveClick=function(){var owner=host._livePanelApi;if(owner && !node.disabled)owner[node._liveMethod](node._liveArgument);};node.addEventListener('click',node._liveClick);}
      return node;
    }
    // One keyed icon per URL: GitHub evidence (#756) and a plain authored link share the node, so a URL that gains evidence keeps its identity.
    function prLink(parent,pr){return liveStatusPRDecorate(el(parent,'a',typeof pr==='string'?pr:pr.url,'nbacklink dv-live-pr-link',null),pr);}
    // One bounded control per upstream (#765): icon (hand while unfinished, alarm when blocked or missing,
    // green check when done), key, state pill. No source line; an authored reason rides the tooltip.
    // Click focuses the upstream row.
    function depButton(parent,key,dep){
      var node=el(parent,'button',key,'dv-live-dep'+(dep.tone==='red'?' dv-live-dep-red':dep.tone==='done'?' dv-live-dep-done':''));node.type='button';node.setAttribute('data-live-dep-for',dep.key);node.setAttribute('data-tone',dep.tone);
      if(dep.reason)node.setAttribute('title',dep.reason);else node.removeAttribute('title');
      node.setAttribute('aria-label',dep.key+' · '+dep.state+(dep.tone==='red'?' · blocked upstream':dep.tone==='grey'?' · upstream not done':dep.tone==='done'?' · upstream done':'')+(dep.reason?' · '+dep.reason:''));
      var icon=dep.tone==='red'?'alarm':dep.tone==='grey'?'hand':dep.tone==='done'?'check':null;
      var glyph=el(node,'span','icon','dv-live-dep-icon');if(icon){if(glyph.getAttribute('data-icon')!==icon){glyph.innerHTML=FlowIcons.render(icon,{className:'dv-live-dep-glyph',monochrome:true});glyph.setAttribute('data-icon',icon);}}else{glyph.innerHTML='';glyph.removeAttribute('data-icon');}glyph.hidden=!icon;
      el(node,'span','key','dv-live-dep-key',dep.key);el(node,'span','state','dv-live-state-pill'+(states.indexOf(dep.state)>=0?' dv-live-'+dep.state:''),dep.state);
      if(!node._liveClick){node._liveClick=function(){var table=host.querySelector('table.dv-live-tickets'),row=table && table.querySelector('tr[data-live-ticket="'+node.getAttribute('data-live-dep-for')+'"]'),keyCell=row && row.querySelector('.dv-live-ticket-key'),target=keyCell && (keyCell.querySelector('a') || keyCell);if(target && target.focus){target.focus({preventScroll:true});if(row.scrollIntoView)row.scrollIntoView({block:'nearest',inline:'nearest'});if(target.scrollIntoView)target.scrollIntoView({block:'nearest',inline:'nearest'});}};node.addEventListener('click',node._liveClick);}
      return node;
    }
    function link(parent,key,label,url){var node=el(parent,url?'a':'span',key,'nbacklink',label);
      if(url){node.setAttribute('href',url);node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');}else node.removeAttribute('href');return node;}
    function excludedStories(body,items){
      if(!items.length)return;
      el(body,'h3','excluded-heading','','Excluded stories');
      el(body,'p','excluded-help','dv-live-suggest','Parent exclusions apply before manual tickets and displayed dependencies are added.');
      var exclusions=el(body,'ul','excluded','dv-live-excluded');exclusions.setAttribute('aria-label','Excluded stories');
      items.forEach(function(item){var row=el(exclusions,'li',item.key,'dv-live-excluded-story');row.setAttribute('data-live-excluded',item.key);
        link(row,'key',item.key,item.url);el(row,'span','title','',item.title);el(row,'span','state','dv-live-state-pill'+(states.indexOf(item.state)>=0?' dv-live-'+item.state:''),item.state);el(row,'span','reason','dv-live-excluded-reason',item.reason);
      });
    }
    host._liveSortHandler=function(field){
      var current=host._liveTicketSort;
      host._liveTicketSort={field:field,direction:current && current.field===field && current.direction==='ascending'?'descending':'ascending'};
      if(api)paint(api.snapshot());
    };
    function paint(value){
      if(!live)return;epoch=host._livePaintEpoch=(host._livePaintEpoch || 0)+1;var focused=doc.activeElement;
      var head=el(host,'div','head','dv-live-head');host._liveHead=head;
      // #986: the first row holds buttons that never move. Everything that changes has a row of its own, whose height depends on the panel's width and never on its text, so it cannot move the buttons or what is below.
      var controls=el(head,'div','controls','dv-live-controls'),statusRow=el(head,'div','status','dv-live-status'),countRow=el(statusRow,'div','counts','dv-live-counts'),statusLine=el(statusRow,'div','text','dv-live-status-text');
      var available=value && value.available,hasData=available && value.hasData;
      // Live and Over time are the two modes (#929, Chuck 2026-11-04): first in the header, so changing Jira text cannot wrap them apart. The selected one is filled. Live returns from a past day; while selected it still turns colors off.
      var over=value && value.overTime,past=!!(over && over.active);
      var toggle=button(controls,'toggle','reader-button dv-live-toggle','Live',past?'overTimeClose':'setEnabled');toggle.hidden=!hasData;
      toggle._liveArgument=value?!value.enabled:false;toggle.setAttribute('aria-pressed',String(!!(value && value.enabled) && !past));
      var overTime=button(controls,'over-time','reader-button dv-live-over-time',over && over.loading?'Loading history'+(over.progress?' '+over.progress:'')+'…':'Over time','overTime');overTime.hidden=!hasData || !over || !over.available;overTime.disabled=!!(over && (over.loading || over.disabled));overTime.setAttribute('aria-pressed',String(past));
      states.forEach(function(state){var count=el(countRow,'span','count-'+state,'dv-live-count'+(hasData && value && value.enabled && value.counts[state]?' dv-live-'+state:''),state+' '+(value?value.counts[state]:0));count.setAttribute('data-live-count',state);count.hidden=!hasData || !value.counts[state];});
      var conn=value && value.connection || {state:'none'},connLabel={disconnected:'not connected',approval:'needs approval',connecting:'connecting',connected:'connected',error:'error',demo:'demo'}[conn.state];
      var connection=el(statusLine,'span','connection','dv-live-connection');connection.setAttribute('data-state',conn.state);connection.setAttribute('data-busy',String(!!conn.busy));connection.setAttribute('role','status');
      var connWho=(conn.source || '')+(connLabel && connLabel!==String(conn.source || '').toLowerCase()?' '+connLabel:'');
      el(connection,'i','dot','dv-live-connection-dot');el(connection,'span','text','',[connWho,conn.checkedText].filter(Boolean).join(', '));
      var gh=conn.github || {state:'none'},ghLabel={connecting:'GitHub connecting',connected:'GitHub connected',error:'GitHub did not answer'}[gh.state];
      var github=el(connection,'span','github','dv-live-connection-github',ghLabel || '');github.setAttribute('data-state',gh.state);github.setAttribute('data-busy',String(!!gh.busy));github.hidden=!ghLabel;
      connection.hidden=!available || conn.state==='none';
      var note=el(statusLine,'span','note','dv-live-note',available?value.note.text:'');note.setAttribute('role','status');note.setAttribute('data-kind',value?value.note.kind:'info');note.hidden=!available || !value.note.text;
      var action=button(controls,'action','reader-button dv-live-action',available?value.actionLabel:'','runAction');action.hidden=!available || !value.actionLabel;
      var overStatus=el(statusLine,'span','over-time-status','dv-live-over-time-status',hasData && over && over.error?over.error:'');overStatus.setAttribute('role','status');overStatus.hidden=!overStatus.textContent;
      // #828 shared-board Edit mode lives in this header: Edit for editors, then a prominent Save N changes and Discard.
      var edit=available && value.edit || null,pending=edit?edit.pending:0,editing=!!(edit && edit.active);
      var editControl=button(controls,'edit','reader-button dv-live-edit','Edit','editStart');editControl.hidden=!(edit && edit.editable && !editing);editControl.disabled=!!(edit && (edit.blocked || edit.saving));
      var saveControl=button(controls,'save','reader-button dv-live-save',edit && edit.saving?'Saving…':'Save '+pending+' change'+(pending===1?'':'s'),'editSave');saveControl.hidden=!(editing && pending);saveControl.disabled=!!(edit && edit.saving);
      var discardControl=button(controls,'discard','reader-button dv-live-discard','Discard','editDiscard');discardControl.hidden=!(editing && pending);discardControl.disabled=!!(edit && edit.saving);
      button(controls,'done','reader-button dv-live-edit-done','Done','editDone').hidden=!(editing && !pending);
      // A fixed slot and size, last in the row so a button appearing to its left cannot move it (#986). "No blockers" only when that is true: blockers off the current path, or with colors off, leave "First blocker" greyed out.
      var first=button(controls,'first','reader-button dv-live-first',value && (value.firstBlocker || (value.blockers || []).length)?'First blocker':'No blockers','firstBlocker');first.hidden=!hasData;first.disabled=!(value && value.firstBlocker);
      var reason=el(statusLine,'span','edit-reason','dv-live-edit-reason',edit && edit.editable && edit.blocked?edit.blocked:'');reason.hidden=!reason.textContent;
      var editNotice=el(statusLine,'span','edit-notice','dv-live-edit-notice',edit && edit.notice?edit.notice.text:'');editNotice.setAttribute('role','status');editNotice.setAttribute('data-kind',edit && edit.notice?edit.notice.kind:'info');editNotice.hidden=!editNotice.textContent;
      var editShown=!!(edit && (edit.editable || edit.notice));
      head.hidden=!available || !(hasData || value.note.text || value.actionLabel || editShown);
      controls.hidden=!available || !(hasData || value.actionLabel || editShown);statusRow.hidden=!available || !(hasData || value.note.text);
      // Long text is cut off on screen; the tooltip and the status elements keep all of it.
      var statusText=[connection.hidden?'':[connWho,conn.checkedText].filter(Boolean).concat(ghLabel?[ghLabel]:[]).join(', '),note.textContent,overStatus.textContent,reason.textContent,editNotice.textContent].filter(Boolean).join(' · ');
      if(statusText)statusRow.setAttribute('title',statusText);else statusRow.removeAttribute('title');
      if(!available)el(host,'p','empty','dv-live-empty','This page has no ticket references.');
      // Day buttons: on the slider row, and on a row of their own for a demo in Live mode, which has no slider. A demo's buttons move its own day.
      if(hasData && (past || value.demo)){
        var demoDays=value.demo,row=el(host,'div','day-row','dv-live-day-row'+(past?' dv-live-over-time-row':'')+(demoDays?' dv-live-demo':''));
        var previousDay=button(row,'previous','reader-button dv-live-step','<',demoDays?'prevDemo':'overTimeStep');previousDay._liveArgument=-1;previousDay.setAttribute('aria-label','Previous day');previousDay.disabled=demoDays?demoDays.first:over.index<=0;
        if(past){
          el(row,'span','first','dv-live-over-time-end',over.first);
          var slider=el(row,'input','slider','dv-live-over-time-slider');slider.type='range';slider.min='0';slider.max=String(over.count-1);slider.step='1';slider.setAttribute('aria-label','Day');
          if(slider.value!==String(over.index))slider.value=String(over.index);slider.setAttribute('aria-valuetext',over.label);
          if(!slider._liveInput){slider._liveInput=function(){var owner=host._livePanelApi;if(owner)owner.overTimeDay(Number(slider.value));};slider.addEventListener('input',slider._liveInput);}
          el(row,'span','last','dv-live-over-time-end',over.last);
        }
        var nextDay=button(row,'next','reader-button dv-live-step','>',demoDays?'nextDemo':'overTimeStep');nextDay._liveArgument=1;nextDay.setAttribute('aria-label','Next day');nextDay.disabled=demoDays?demoDays.ended:over.index>=over.count-1;
        if(past)el(row,'p','note','dv-live-over-time-note','Status as of '+over.label+' · other columns show today').setAttribute('role','status');
      }
      if(hasData){
        var body=el(host,'div','body','dv-live-panel-body'),epic=value.epic || {keys:[]};
        // Epic header box (#765): the epic is shown large inside the panel, never in the title bar. The old verdict line is gone.
        var box=el(body,'div','epic','dv-live-epic'),completion=el(box,'div','completion','dv-live-completion'),svg=el(completion,'svg','ring','');svg.setAttribute('viewBox','0 0 44 44');svg.setAttribute('aria-hidden','true');
        ['track','done'].forEach(function(kind){var circle=el(svg,'circle',kind,'dv-live-ring-'+kind);circle.setAttribute('cx','22');circle.setAttribute('cy','22');circle.setAttribute('r','18');circle.setAttribute('pathLength','100');if(kind==='done')circle.setAttribute('stroke-dasharray',(value.readiness.total?100*value.readiness.done/value.readiness.total:0)+' 100');});
        el(completion,'strong','count','',value.readiness.done+'/'+value.readiness.total+' carriers done');
        var main=el(box,'div','main','dv-live-epic-main');
        if(epic.keys.length){
          var initiative=epic.initiatives && epic.initiatives.length;
          if(initiative)el(main,'div','scope','dv-live-scope',(initiative>1?'Initiatives':'Initiative')+' · '+epic.epics.length+' '+(epic.epics.length===1?'epic':'epics'));
          var keyRow=el(main,'div','keys','dv-live-epic-keys');link(keyRow,'key',epic.keys[0],epic.url).className='nbacklink dv-live-epic-key';if(epic.keys.length>1)el(keyRow,'span','more','dv-live-epic-more','+'+(epic.keys.length-1)+' more');
          el(main,'div','title','dv-live-epic-title',epic.title || '');
          var pill=el(main,'span','state','dv-live-state-pill dv-live-epic-state'+(value.enabled && epic.state?' dv-live-'+epic.state:''),epic.state || 'No status');pill.hidden=!epic.state;

        }
        var progress=el(main,'div','progress','dv-live-epic-progress',epic.done+' of '+epic.stories+' stories done · '+epic.onDiagram+' of '+epic.stories+' on diagram');
        var countParts=[epic.blocked+' blocked',epic.waiting+' waiting'];if(epic.keys.length)countParts.push(epic.outside+(epic.initiatives && epic.initiatives.length?' outside scope':' outside epic'));if(epic.ready)countParts.unshift(epic.initiatives && epic.initiatives.length?'Diagram ready to demo':'Ready to demo');
        el(main,'div','counts','dv-live-epic-counts',countParts.join(' · '));
        // Tickets first and tall (#765); lane data stays on step pills, row stripes and Blockers lanes (#767).
        el(body,'h3','tickets-heading','','Tickets');var scroll=el(body,'div','scroll','dv-live-tickets-scroll'),table=el(scroll,'table','table','dv-live-tickets');table.setAttribute('aria-label','Tickets');
        var tr=el(el(table,'thead','thead',''),'tr','tr',''),sort=host._liveTicketSort;
        ['Key','Title','State','Owner','Depends on','PRs'].forEach(function(label){
          var th=el(tr,'th',label,'');th.setAttribute('scope','col');
          var field=label.toLowerCase();
          if(field==='key' || field==='title' || field==='state' || field==='owner'){
            th.setAttribute('aria-sort',sort && sort.field===field?sort.direction:'none');
            var control=el(th,'button','sort','dv-live-sort');control.type='button';control._liveSortKey=field;
            if(!control._liveSortClick){control._liveSortClick=function(){if(host._liveSortHandler)host._liveSortHandler(control._liveSortKey);};control.addEventListener('click',control._liveSortClick);}
            el(control,'span','label','',label);
            var cue=el(control,'span','cue','dv-live-sort-cue',sort && sort.field===field?(sort.direction==='ascending'?'▲':'▼'):'');cue.setAttribute('aria-hidden','true');
          }else th.textContent=label;
        });
        var tbody=el(table,'tbody','tbody','');sortedTickets(value.tickets,sort).forEach(function(item){
          var row=el(tbody,'tr',item.key,'dv-live-ticket-row'+(item.tag?' dv-live-ticket-with-tag':'')+(editing?' dv-live-draggable':''));row.setAttribute('data-live-ticket',item.key);
          // Edit mode: a row drags its key onto a node or an edge (the board adds it there; drag only, #825).
          if(editing)row.setAttribute('draggable','true');else row.removeAttribute('draggable');
          if(!row._liveDrag){row._liveDrag=function(ev){if(row.getAttribute('draggable')!=='true' || !ev.dataTransfer)return;var key=row.getAttribute('data-live-ticket');ev.dataTransfer.setData('application/x-flowview-ticket',key);ev.dataTransfer.setData('text/plain',key);ev.dataTransfer.effectAllowed='copy';};row.addEventListener('dragstart',row._liveDrag);}if(item.laneColor)row.style.setProperty('--dv-live-lane-color',item.laneColor);else row.style.removeProperty('--dv-live-lane-color');
          // The keyed renderer keeps data rows and controls in order, with a companion row only for an informational tag.
          var keyCell=el(row,'td','key','dv-live-ticket-key');keyCell.setAttribute('tabindex','-1');link(keyCell,'link',item.key,item.url);if(item.epicLabel)el(keyCell,'div','epic','dv-live-ticket-epic',item.epicLabel);el(row,'td','title','dv-live-ticket-title',item.title);
          el(el(row,'td','state',''),'span','pill','dv-live-state-pill'+(value.enabled && states.indexOf(item.state)>=0?' dv-live-'+item.state:''),item.state);
          var ownerCell=el(row,'td','owner','dv-live-ticket-owner');if(item.ownerUrl)link(ownerCell,'link',item.owner,item.ownerUrl);else el(ownerCell,'span','text','',item.owner);var depends=el(row,'td','depends','dv-live-ticket-depends');(item.dependsOn || []).forEach(function(dep){depButton(depends,dep.key,dep);});
          var prs=el(row,'td','prs','dv-live-ticket-prs'),links=item.prs && item.prs.links || [],covered=links.map(function(pr){return pr.url;});
          links.forEach(function(pr){prLink(prs,pr);});item.urls.forEach(function(url){if(covered.indexOf(url)<0)prLink(prs,url);});
          // Jira's Development count stays informational; it is shown only when it says more than the icons do.
          if(item.prs && item.prs.count>links.length){var summary=el(prs,'span','summary','dv-live-pr-summary',item.prs.count+' '+item.prs.state);summary.setAttribute('title','Jira Development field: '+item.prs.count+' '+item.prs.state+' pull request'+(item.prs.count===1?'':'s')+'. Jira does not expose the link.');}
          if(item.tag){var coverageRow=el(tbody,'tr',item.key+'/coverage','dv-live-coverage-row');coverageRow.setAttribute('data-live-coverage-for',item.key);if(item.laneColor)coverageRow.style.setProperty('--dv-live-lane-color',item.laneColor);else coverageRow.style.removeProperty('--dv-live-lane-color');
            var coverageCell=el(coverageRow,'td','cell','dv-live-coverage-cell');coverageCell.setAttribute('colspan','6');var coverage=el(coverageCell,'div','coverage','dv-live-coverage');el(coverage,'span','tag','dv-live-coverage-tag',item.tag);}
        });
        excludedStories(body,value.excluded || []);
        // A light hint only: the agent, not the page, writes to Jira.
        var suggestions=value.suggestions || [],suggest=el(body,'p','suggest','dv-live-suggest',suggestions.length?suggestions.length+' authored '+(suggestions.length===1?'dependency':'dependencies')+' ('+suggestions.map(function(item){return item.ticket+' → '+item.on;}).join(', ')+') '+(suggestions.length===1?'has':'have')+' no Jira link. Suggest link in Jira':'');suggest.hidden=!suggestions.length;
        if(!suggestions.length)suggest.remove();
        el(body,'h3','blockers-heading','','Blockers and dependency chains');var blockers=el(body,'ul','blockers','dv-live-blockers');
        value.blockers.forEach(function(item){var row=el(blockers,'li',item.key,'dv-live-blocker');link(row,'key',item.key,item.url);el(row,'span','state','dv-live-state-pill'+(states.indexOf(item.state)>=0?' dv-live-'+item.state:''),item.state);el(row,'span','lanes','dv-live-blocker-lanes',item.lanes);el(row,'span','downstream','dv-live-downstream',item.downstream);if(item.state==='missing')el(row,'span','missing','dv-live-missing-detail','not found in Jira (deleted, renamed, or no permission)');});
        // One row per chain: each hop is the same bounded button, "holds" between hops.
        var chains=el(body,'ul','chains','dv-live-chains'),depOf=function(key){var found=null;value.tickets.some(function(ticket){return (ticket.dependsOn || []).some(function(dep){if(dep.key===key)found=dep;return !!found;});});
          var entry=value.states[key],state=found?found.state:entry && states.indexOf(entry.state)>=0?entry.state:'missing';return {key:key,state:state,tone:found?found.tone:state==='done'?'done':state==='blocked' || state==='missing'?'red':'grey',reason:found?found.reason:''};};
        (value.chains || []).forEach(function(chain){var row=el(chains,'li',chain.join('>'),'dv-live-chain');chain.forEach(function(key,index){if(index)el(row,'span','holds-'+index,'dv-live-chain-holds','holds');
          var dep=depOf(key);if(index===chain.length-1){var last=value.tickets.filter(function(ticket){return ticket.key===key;})[0];dep={key:key,state:last?last.state:dep.state,tone:last && last.waiting?last.waiting:last && last.state==='done'?'done':'none',reason:''};}
          depButton(row,'hop-'+index,dep);});});
        if(!value.blockers.length && !(value.chains || []).length)el(body,'p','none','dv-live-none','None');
        el(body,'h3','activity-heading','','Activity');var activity=el(body,'ol','activity','dv-live-activity');value.activity.forEach(function(item,index){var row=el(activity,'li',String(index),'dv-live-activity-entry',item.key+' · '+(item.added?'added to epic · not on diagram':item.old+' → '+item.state)+' · '+item.relative);if(item.at)row.setAttribute('data-updated-at',item.at);else row.removeAttribute('data-updated-at');});
      }
      if(!hasData && value && (value.excluded || []).length)excludedStories(el(host,'div','audit','dv-live-panel-body'),value.excluded);
      // #758: a built page carries an agent guide block; tell editors where it is. Nothing is painted without it.
      if(doc.getElementById('dv-agent-guide'))el(host,'p','agent-guide','dv-live-agent-guide',"Editors: ask your agent to read this page's agent guide (id dv-agent-guide)");
      sweep(host);
      if(value && !value.enabled && typeof liveStatusClass==='function')host.querySelectorAll('[data-live-appearance],.dv-live-state-pill,.dv-live-count').forEach(function(node){liveStatusClass(node,null);});
      if(typeof liveStatusClass==='function')states.forEach(function(state){host.querySelectorAll('.dv-live-'+state).forEach(function(node){liveStatusClass(node,state);});});
      if(typeof liveStatusInk==='function')host.querySelectorAll('.dv-live-state-pill:not([data-live-appearance])').forEach(function(node){liveStatusInk(node,null);});
      if(focused && host.contains(focused) && doc.activeElement!==focused && focused.focus)focused.focus({preventScroll:true});
    }
    function cleanup(){if(!live)return;live=false;host._livePanelApi=null;host._liveSortHandler=null;if(offChange)offChange();if(offDestroy)offDestroy();if(offReady)offReady();}
    host._panelMotionCleanup=cleanup;
    function connect(controller){if(!live || api)return;api=controller;host._livePanelApi=api;if(offReady)offReady();paint(api.snapshot());offChange=api.onChange(paint);offDestroy=api.onDestroy(cleanup);}
    var controller=typeof liveStatusControllerFor==='function'?liveStatusControllerFor(host):null;
    if(controller)connect(controller);else {paint(null);if(typeof liveStatusWhenReady==='function')offReady=liveStatusWhenReady(host,connect);}
  }
  var LIVE_STYLES=String.raw`.dv-live-toggle{display:flex;gap:4px;align-items:center;}
.dv-live-count{border-radius:4px;padding:2px 4px;color:var(--dv-live-on);}
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
.dv-live-over-time-status{color:var(--dv-live-blocked);}
/* Amber marks "not live": no ticket status uses it. */
.pt-live-status{--dv-live-past:#f5a524;}
.pt-live-status .dv-live-head .tbtn.dv-live-toggle[aria-pressed="true"],.pt-live-status .dv-live-head .tbtn.dv-live-toggle[aria-pressed="true"]:hover{background:var(--dv-live-active);border-color:var(--dv-live-active);color:#fff;}
.pt-live-status .dv-live-head .tbtn.dv-live-over-time[aria-pressed="true"],.pt-live-status .dv-live-head .tbtn.dv-live-over-time[aria-pressed="true"]:hover{background:var(--dv-live-past);border-color:var(--dv-live-past);color:#2b1a00;}
.dv-live-day-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:10px;font:11px/1.4 'IBM Plex Mono',monospace;color:var(--dtext);font-variant-numeric:tabular-nums;}
.dv-live-over-time-row{padding:8px 12px;border-left:3px solid var(--dv-live-past);border-radius:4px;background:color-mix(in srgb,var(--dv-live-past) 14%,transparent);}
.dv-live-step{min-width:34px;text-align:center;}
.dv-live-over-time-slider{-webkit-appearance:none;appearance:none;flex:1 1 80px;min-width:80px;height:16px;margin:0;background:transparent;cursor:pointer;}
.dv-live-over-time-slider::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:var(--dfaint,var(--explore-border));}
.dv-live-over-time-slider::-moz-range-track{height:3px;border-radius:2px;background:var(--dfaint,var(--explore-border));}
.dv-live-over-time-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;margin-top:-4.5px;border:0;border-radius:50%;background:var(--dv-live-past);}
.dv-live-over-time-slider::-moz-range-thumb{width:12px;height:12px;border:0;border-radius:50%;background:var(--dv-live-past);}
.dv-live-over-time-slider:focus-visible{outline:2px solid var(--dink,currentColor);outline-offset:2px;}
.dv-live-over-time-note{flex:0 0 100%;margin:0;color:var(--dtext);}
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
.dv-live-blockers,.dv-live-activity{list-style:none;padding:0;margin:0;}
.dv-live-blocker{display:flex;flex-wrap:wrap;gap:4px 8px;padding:10px 0;border-bottom:1px solid var(--explore-border);}
.dv-live-blocker-lanes,.dv-live-downstream,.dv-live-missing-detail{flex-basis:100%;}
.dv-live-activity-entry{padding:5px 0;font-size:12px;}
.dv-live-excluded{list-style:none;padding:0;margin:0;}
.dv-live-excluded-story{display:flex;flex-wrap:wrap;gap:4px 8px;padding:8px 0;border-bottom:1px solid var(--explore-border);}
.dv-live-excluded-reason{flex-basis:100%;color:var(--dfaint);font-size:11px;}
.dv-live-tickets-scroll{overflow:auto;max-width:100%;}
.dv-live-tickets{color:var(--dtext);width:100%;min-width:580px;table-layout:auto;border-collapse:collapse;text-align:left;font-size:12px;}
.dv-live-tickets th,.dv-live-tickets td{padding:8px;vertical-align:top;border-bottom:1px solid var(--explore-border);}
.dv-live-tickets th{font-weight:700;}
.dv-live-sort{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:3px;padding:2px 3px;margin:-2px -3px;background:transparent;color:inherit;font:inherit;font-weight:inherit;text-align:left;cursor:pointer;}
.dv-live-sort:hover{background:color-mix(in srgb,var(--dink) 7%,transparent);}
.dv-live-sort:focus-visible{outline:2px solid var(--dink,currentColor);outline-offset:2px;}
.dv-live-sort-cue{min-width:9px;font-size:9px;line-height:1;}
.dv-live-tickets th:nth-child(1),.dv-live-tickets th:nth-child(3),.dv-live-tickets th:nth-child(6){width:1%;white-space:nowrap;}
.dv-live-ticket-key{border-left:4px solid var(--dv-live-lane-color,transparent);white-space:nowrap;}
.dv-live-ticket-key:focus,.dv-live-ticket-key a:focus{outline:2px solid var(--dink,currentColor);outline-offset:-2px;}
.dv-live-ticket-title,.dv-live-ticket-owner{overflow-wrap:anywhere;}
.dv-live-ticket-owner .nbacklink{display:inline-block;box-sizing:border-box;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:center;vertical-align:top;}
.dv-live-tickets .dv-live-ticket-prs{white-space:normal;}
.dv-live-tickets .dv-live-ticket-with-tag td{border-bottom:0;padding-bottom:4px;}
.dv-live-coverage-cell{padding-top:0!important;}
.dv-live-coverage{display:flex;flex-wrap:wrap;justify-content:flex-start;align-items:center;gap:6px;}
.dv-live-coverage-tag{display:inline-flex;align-items:center;min-height:22px;padding:1px 8px;border-radius:4px;font:700 10px/1.4 'IBM Plex Mono',monospace;letter-spacing:.06em;white-space:nowrap;background:color-mix(in srgb,var(--dv-live-active) 18%,transparent);color:var(--dink);}
.dv-live-pr-summary{color:var(--dfaint);margin-left:4px;}
.dv-live-ticket-epic{font:10px/1.4 'IBM Plex Mono',monospace;color:var(--dfaint);letter-spacing:.04em;margin-top:2px;}
.dv-live-ticket-depends:has(.dv-live-dep){min-width:130px;}
.dv-live-dep{display:inline-flex;align-items:center;gap:5px;max-width:100%;margin:0 4px 4px 0;padding:2px 7px 2px 5px;border:1px solid var(--dv-live-todo);border-radius:6px;background:transparent;color:var(--dtext);font:600 11px/1.4 'IBM Plex Mono',monospace;cursor:pointer;white-space:nowrap;}
.dv-live-dep:hover{background:color-mix(in srgb,var(--dink) 6%,transparent);}
.dv-live-dep:focus-visible{outline:2px solid var(--dink,currentColor);outline-offset:2px;}
.dv-live-dep.dv-live-dep-red{border-color:var(--dv-live-blocked);color:var(--dv-live-blocked);}
.dv-live-dep.dv-live-dep-done{border-color:var(--dv-live-done);}
.dv-live-dep.dv-live-dep-done .dv-live-dep-icon{color:var(--dv-live-done);}
.dv-live-dep-icon{display:inline-flex;width:14px;height:14px;flex:none;}
.dv-live-dep-icon[hidden]{display:none!important;}
.dv-live-dep-icon .dv-live-dep-glyph{width:14px;height:14px;}
.dv-live-dep .dv-live-state-pill{font:500 10px/1.4 'IBM Plex Sans',sans-serif;}
.dv-live-chains{list-style:none;padding:0;margin:0;}
.dv-live-chain{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;padding:8px 0;border-bottom:1px solid var(--explore-border);}
.dv-live-chain-holds{font:11px/1.4 'IBM Plex Sans',sans-serif;color:var(--dfaint);}
.dv-live-none{color:var(--dfaint);}
.dv-live-suggest{margin:8px 0 0;font:11px/1.5 'IBM Plex Sans',sans-serif;color:var(--dfaint);}
/* Save keeps its fill over every theme's tbtn rules, hover included. */
.pt-live-status .dv-live-head .tbtn.dv-live-save,.pt-live-status .dv-live-head .tbtn.dv-live-save:hover{background:var(--dv-live-active);border-color:var(--dv-live-active);color:#fff;font-weight:700;}
.pt-live-status .dv-live-head .tbtn.dv-live-save:disabled{opacity:.7;}
/* Fixed slot and size: the width of the longer label, plus the button's padding and border (#986). */
.pt-live-status .dv-live-head .tbtn.dv-live-first{margin-left:auto;width:calc(13ch + 24px);text-align:center;}
.pt-live-status .dv-live-head .tbtn:disabled,.pt-live-status .dv-live-day-row .tbtn:disabled{opacity:.5;cursor:default;}
/* Paper has no controls: print hides these buttons as it hides the reader's other tbtn controls. */
@media print{.pt-live-status .dv-live-head .tbtn,.pt-live-status .dv-live-day-row .tbtn{display:none;}}
.dv-live-edit-reason,.dv-live-edit-notice{flex-basis:100%;font:12px/1.5 'IBM Plex Sans',sans-serif;color:var(--dtext);}
.dv-live-edit-notice[data-kind="warn"],.dv-live-edit-notice[data-kind="error"]{color:var(--dv-live-blocked);}
.dv-live-draggable{cursor:grab;}
.dv-live-draggable:active{cursor:grabbing;}
.dv-live-remove{justify-self:end;}
.dv-live-clear{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:6px 0;}
.dv-live-question{flex-basis:100%;margin:0;font-weight:600;color:var(--dtext);}
.dv-live-missing-source{margin:6px 0;}
.dv-live-tickets .dv-live-state-pill{color:var(--dv-live-color,inherit);white-space:nowrap;}

.pwidget.pt-live-status{display:flex;flex-direction:column}
.pt-live-status>.ptitle{flex:none}
.pt-live-status .pbody{flex:1;min-width:0;min-height:0;overflow:auto;color:var(--dtext);font:13px/1.5 'IBM Plex Sans',sans-serif}
.dv-live-head{container-type:inline-size;display:flex;flex-direction:column;gap:6px;padding-bottom:10px;border-bottom:1px solid var(--explore-border);font:11px/1.5 'IBM Plex Mono',monospace}
.dv-live-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}
.dv-live-status{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:0 8px;height:28px;overflow:hidden;white-space:nowrap;}
.dv-live-counts{display:flex;align-items:center;gap:8px;}
.dv-live-status-text{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;}
.dv-live-status-text>*{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
.dv-live-connection>span{min-width:0;overflow:hidden;text-overflow:ellipsis;}
.dv-live-controls[hidden],.dv-live-status[hidden]{display:none!important;}
/* A narrow panel gives counts and text a line each: the height follows the panel's width, never its text. */
@container (max-width:560px){.dv-live-status{grid-template-columns:minmax(0,1fr);height:56px;}}
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
      // #864: Standard tiles grow to this panel's content; the authored h is the minimum.
      sectionSizing:{minWidth:480,preferredWidth:880,maxWidth:1200,aspectPolicy:'content',grow:1,height:'content'}},
    render:function(host,panel,state){return state && state.liveSample?{html:sampleHTML(state.liveSample)}:
      {html:'<div class="dv-live-head"></div><p class="dv-live-empty">This page has no ticket references.</p>',mounted:function(){mount(host);}};},
    authoring:{template:{title:'Live status'},setupFields:[],patchFields:[],
      picker:{name:'Live status',category:'Delivery',tagline:'See what is ready and what is blocked',description:'Show live ticket progress, blockers and the stories in your epic beside or below the diagram.'},
      example:function(sample){sample.state.liveSample=LIVE_SAMPLE.map(function(row){return {key:row[0],title:row[1],owner:row[2]};});return sample;}},
    styles:LIVE_STYLES
  });
})();

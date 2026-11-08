/* Authored placement, runtime evidence. No ticket status is folded into the spec. */
(function(){
  var LIVE_SAMPLE=[["BE-67", "Build the notification service", "Riley"], ["BE-68", "Accept firmware events over HTTPS", "Riley"], ["FW-45", "Deliver firmware events", "Sam"], ["FW-46", "Integrate hardware interrupts", "Sam"], ["HW-123", "Debounce the doorbell button", "Alex"], ["HW-124", "Stabilize the hardware event signal", "Alex"], ["UX-89", "Show resident notifications", "Morgan"], ["UX-90", "Alert sound setting", "Morgan"]];
  var states=['todo','active','testing','done','blocked','missing'];
  var logValueLists=0;
  var ticketStateOrder=['blocked','missing','active','testing','todo','done'];
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
    if(!host._liveChildren || !host.querySelector('.dv-status-modes')){host.replaceChildren();host._liveChildren=Object.create(null);}
    function el(parent,tag,key,cls,text){
      var children=parent._liveChildren || (parent._liveChildren=Object.create(null)),node=children[key];
      if(node && node.tagName.toLowerCase()!==tag){node.remove();node=null;}
      if(!node){node=children[key]=['svg','circle','polyline','line','title'].indexOf(tag)>=0?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag);parent.appendChild(node);}
      if(parent._liveOrderEpoch!==epoch){parent._liveOrderEpoch=epoch;parent._livePosition=0;}
      var position=parent._livePosition++;
      if(parent.children[position]!==node)parent.insertBefore(node,parent.children[position] || null);
      node._liveEpoch=epoch;
      if(['svg','circle','polyline','line','title'].indexOf(tag)>=0)node.setAttribute('class',cls || '');else node.className=cls || '';
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
    var proofLabels={proven:'proven',degraded:'degraded',unproven:'unproven',liveEarly:'live early',neutral:'unclassified',unbound:'unbound'};
    function proofBox(body,proof){
      var box=el(body,'div','proof','dv-live-proof'),ring=el(box,'div','ring','dv-live-completion');
      box.setAttribute('data-proof-bound',proof.counts.bound);box.setAttribute('data-proof-unbound',proof.counts.unbound);
      var svg=el(ring,'svg','svg','');svg.setAttribute('viewBox','0 0 44 44');svg.setAttribute('aria-hidden','true');
      [{key:'track'}].concat(proof.arcs).forEach(function(arc){
        var circle=el(svg,'circle',arc.key,arc.key==='track'?'dv-live-ring-track':'dv-live-proof-arc');
        circle.setAttribute('cx','22');circle.setAttribute('cy','22');circle.setAttribute('r','18');circle.setAttribute('pathLength','100');
        if(arc.key!=='track'){circle.setAttribute('data-proof-bucket',arc.key);circle.setAttribute('stroke-dasharray',arc.size+' 100');circle.setAttribute('stroke-dashoffset',-arc.offset);}
      });
      el(ring,'strong','count','dv-live-proof-ratio',proof.counts.proven+'/'+proof.counts.bound+' bound proven');
      var main=el(box,'div','main','dv-live-epic-main');el(main,'h3','heading','','Proof');
      var pills=el(main,'div','pills','dv-live-proof-pills');Object.keys(proofLabels).forEach(function(key){
        var pill=el(pills,'span',key,'dv-live-state-pill dv-live-proof-pill',proof.counts[key]+' '+proofLabels[key]);pill.setAttribute('data-proof-bucket',key);
      });
      el(main,'p','sentence','dv-live-proof-sentence',proof.sentence);el(main,'p','predicate','dv-live-proof-predicate',proof.predicate);
    }
    function proofTable(body,proof){
      el(body,'h3','proof-heading','','Proof table');
      var scroll=el(body,'div','proof-scroll','dv-live-tickets-scroll'),table=el(scroll,'table','proof-table','dv-live-tickets dv-live-proof-table');table.setAttribute('aria-label','Proof');
      var headings=el(el(table,'thead','head',''),'tr','row','');
      ['Carrier','Jira',proof.window+' window','Signals','Since Done','Verdict','Link'].forEach(function(label,i){el(headings,'th',String(i),'',label).setAttribute('scope','col');});
      var rows=el(table,'tbody','rows','');proof.rows.forEach(function(item){
        var row=el(rows,'tr',item.id,'dv-live-proof-row');row.setAttribute('data-loading',item.initialLoading?'true':'false');row.setAttribute('data-proof-carrier',item.id);row.setAttribute('data-verdict',item.verdict || 'unobserved');row.setAttribute('data-telemetry',item.telemetry);
        var carrier=el(row,'td','carrier','');el(carrier,'strong','title','',item.title);el(carrier,'div','identity','dv-live-proof-detail',item.id+' · '+item.kind);
        el(row,'td','jira','',item.tickets.length?item.tickets.join(', ')+' · '+item.jira:'No tickets');
        var chart=el(row,'td','chart','dv-live-proof-chart');
        if(item.chart.points.length || item.chart.markers.length){
          var svg=el(chart,'svg','svg','dv-live-proof-sparkline');svg.setAttribute('viewBox','0 0 100 32');svg.setAttribute('role','img');svg.setAttribute('aria-label',proof.window+' window: '+item.chart.points.length+' observed points');
          if(item.chart.line){var line=el(svg,'polyline','series','dv-live-proof-series');line.setAttribute('points',item.chart.line);}
          item.chart.points.forEach(function(point,i){var dot=el(svg,'circle','point-'+i,'dv-live-proof-point');dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);dot.setAttribute('r','1.8');});
          item.chart.markers.forEach(function(marker,i){var tick=el(svg,'line','marker-'+i,'dv-live-proof-marker');tick.setAttribute('x1',marker.x);tick.setAttribute('x2',marker.x);tick.setAttribute('y1','2');tick.setAttribute('y2','30');tick.setAttribute('data-kind',marker.kind);el(tick,'title','title','',marker.label);});
        }else el(chart,'span','empty','',item.chart.pending?'Loading…':'unobserved');
        var metrics=el(row,'td','signals','dv-live-proof-kpi');
        item.kpis.forEach(function(kpi){var metric=el(metrics,'div',kpi.name,'dv-live-proof-detail');el(metric,'span','value','',kpi.label+': '+kpi.text);if(kpi.url){var source=link(metric,'query',null,kpi.url);source.className='dv-live-metric-link';source.setAttribute('aria-label','Open '+kpi.label+' source query in a new tab');source.innerHTML=FlowIcons.render('external-link',{className:'dv-live-pr-icon',monochrome:true});}});
        el(row,'td','since','dv-live-proof-since',item.since);
        var verdict=el(row,'td','verdict','');var pill=el(verdict,'span','pill','dv-live-state-pill dv-live-proof-pill',item.label);pill.setAttribute('data-proof-bucket',TELEMETRY_SEALS[item.verdict]==='live-early'?'liveEarly':TELEMETRY_SEALS[item.verdict] || 'neutral');
        el(verdict,'div','evidence','dv-live-proof-detail',(item.initialLoading?'Loading…':item.telemetry)+(item.failing.length?' · failing: '+item.failing.join(', '):''));el(verdict,'div','predicate','dv-live-proof-predicate',item.predicate);
        var action=el(row,'td','link','');if(item.url){var anchor=link(action,'link',null,item.url);anchor.className='nbacklink dv-live-proof-link';anchor.setAttribute('aria-label','Open telemetry for '+item.title);anchor.setAttribute('title','Open telemetry for '+item.title);if(!anchor._proofIcon){anchor.innerHTML=FlowIcons.render('external-link',{className:'dv-live-pr-icon',monochrome:true});anchor._proofIcon=true;}}
      });
    }
    function logDetails(body,items){
      if(!items.length)return;
      var group=el(body,'section','log-details','dv-live-log-details');el(group,'h3','heading','','Log details');
      items.forEach(function(item){
        var config=item.config,data=item.details,box=el(group,'details',item.key,'dv-live-log-group');
        box.setAttribute('data-log-carrier',item.id);box.setAttribute('data-log-signal',item.signal);
        el(box,'summary','summary','',(config.title || 'Groups')+' · '+item.title+' · '+item.signal);
        el(box,'p','identity','dv-live-proof-detail',item.id+' · '+item.signal+(item.scope?' · '+item.scope:''));
        el(box,'p','total','dv-live-log-total','Total: '+item.total);
        if(!data || data.status==='error'){
          el(box,'p','status','dv-live-log-status',data?'Log details unavailable: '+data.error:'Log details unobserved; waiting for a successful scalar and grouped query.').setAttribute('role','status');return;
        }
        el(box,'p','range','dv-live-proof-detail',data.range.from+' → '+data.range.to);
        el(box,'p','limit','dv-live-log-status','Showing '+data.rows.length+' of '+data.returnedRows+' returned rows (display limit '+data.limit+'). These rows may not include every group; use the total above for the overall count.'+(data.textTruncated?' Long text shortened to 500 characters.':''));
        if(!data.rows.length){el(box,'p','empty','dv-live-log-empty','Query complete: no grouped rows returned.');return;}
        var scroll=el(box,'div','scroll','dv-live-log-scroll');scroll.setAttribute('tabindex','0');scroll.setAttribute('role','region');scroll.setAttribute('aria-label',(config.title || 'Log details')+' rows for '+item.id+' '+item.signal);
        var table=el(scroll,'table','table','dv-live-tickets dv-live-log-table');table.setAttribute('aria-label',item.id+' '+item.signal+' log details');table.style.minWidth=(2+(config.columns || []).length)*90+'px';
        var head=el(el(table,'thead','head',''),'tr','row','');
        [config.labelTitle || config.labelField,config.valueTitle || config.valueField].concat((config.columns || []).map(function(c){return c.label;})).forEach(function(label,i){el(head,'th',String(i),'',label).setAttribute('scope','col');});
        var rows=el(table,'tbody','rows','');data.rows.forEach(function(item,i){
          var row=el(rows,'tr',String(i),'');el(row,'td','label','',item.label);el(row,'td','value','',item.value);
          (config.columns || []).forEach(function(column,n){el(row,'td','cell-'+n,'',item.cells[n]===undefined?'(missing)':item.cells[n]);});
        });
      });
    }
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
    // #1099: find a trace from a Loki log line. A chosen line loads through the
    // form above it (connection, environment, lookback) and focuses its span.
    function logLookupBody(config,box,logs,direct){
      var section=el(config,'section','logs','dv-trace-logs');section.setAttribute('aria-label','Find a trace from a log line');
      el(section,'h4','title','dv-trace-logs-title','Find a trace from a log line');
      if(!logs.available)el(section,'p','unavailable','dv-trace-logs-status',logs.note).setAttribute('role','status');
      function control(key,label,tag){
        var wrap=el(section,'label',key+'-label','dv-trace-input-label');el(wrap,'span','label','',label);
        var node=el(wrap,tag,key,'dv-trace-input');node.setAttribute('aria-label',label);node.disabled=!logs.available;
        if(!node._logChange){node._logChange=function(){var owner=host._livePanelApi;if(owner)owner.setLogLookupField({field:key,value:node.value});};node.addEventListener(tag==='select'?'change':'input',node._logChange);}
        return node;
      }
      var choose=control('lookup','Log lookup','select');
      logs.lookups.forEach(function(l){el(choose,'option',l.id,'',l.label).value=l.id;});el(choose,'option',logs.typed,'','Type a LogQL query').value=logs.typed;
      if(choose.value!==logs.form.lookup)choose.value=logs.form.lookup;
      var lookup=logs.lookups.find(function(l){return l.id===logs.form.lookup;});
      if(lookup && lookup.slot){
        var value=control('value',lookup.label,'input');value.type='text';value.maxLength=200;value.autocomplete='off';value.spellcheck=false;value.placeholder=lookup.values.length?'Type or pick a value':'Type a value';
        if(lookup.values.length){var list=el(section,'datalist','values','');list.id=host._logValuesId || (host._logValuesId='dv-trace-log-values-'+(++logValueLists));lookup.values.forEach(function(v,i){el(list,'option',String(i),'').value=v;});value.setAttribute('list',list.id);}
        else value.removeAttribute('list');
        if(value.value!==logs.form.value)value.value=logs.form.value;
      }
      if(!lookup){var typed=control('logql','LogQL log query','textarea');typed.maxLength=2000;typed.rows=3;typed.spellcheck=false;typed.placeholder='{env="prod"} |= "message" | field="value"';if(typed.value!==logs.form.logql)typed.value=logs.form.logql;}
      var find=button(el(section,'div','actions','dv-live-controls'),'find','reader-button dv-trace-log-find','Find log lines','findLogLines');find.disabled=!logs.available || logs.busy;
      var r=logs.result;if(!r)return;
      var text=r.error || (logs.busy?'Finding log lines…':r.note || '');
      if(text)el(section,'p','status','dv-trace-logs-status',text).setAttribute('role','status');
      if(r.chosenNote)el(box,'p','log-note','dv-trace-direct-status',r.chosenNote).setAttribute('role','status');
      if(!r.rows.length)return;
      var rows=el(section,'ol','results','dv-trace-log-results');rows.setAttribute('aria-label','Matching log lines');
      r.rows.forEach(function(row,i){
        var item=el(rows,'li',String(i),'dv-trace-log-row');item.setAttribute('data-chosen',String(r.chosen===i));
        el(item,'time','time','dv-trace-log-time',row.time?row.time.replace('T',' ').replace(/\.\d+Z$/,'Z'):'time unavailable');
        el(item,'span','value','dv-trace-log-value',row.value).title=row.line;
        if(!row.traceId){el(item,'span','missing','dv-trace-log-missing',row.missing);return;}
        el(item,'code','trace','dv-trace-log-id',row.traceId);
        var load=el(item,'button','load','reader-button dv-trace-log-load tbtn','Load');load.type='button';load.setAttribute('aria-label','Load trace '+row.traceId);load._logIndex=i;load.disabled=!direct.available || direct.busy;
        if(!load._logClick){load._logClick=function(){
          var owner=host._livePanelApi;if(!owner || load.disabled)return;var request=host._directRevealRequest=(host._directRevealRequest || 0)+1;
          Promise.resolve(owner.loadLogTrace(load._logIndex)).then(function(result){
            if(!live || !result || host._livePanelApi!==owner || host._directRevealRequest!==request)return;
            var target=host.querySelector('.dv-trace-selected');if(target && target.getClientRects().length && target.scrollIntoView)target.scrollIntoView({block:'nearest',inline:'nearest'});
          });
        };load.addEventListener('click',load._logClick);}
      });
    }
    function directTraceBody(body,direct){
      if(!direct || !direct.profiles.length)return;
      var box=el(body,'section','direct','dv-trace-direct'),r=direct.report,loaded=!!(direct.exemplar && r && r.stage==='complete');
      var profile=direct.profiles.find(function(p){return p.id===direct.form.connection;}),environment=profile && profile.environments.find(function(e){return e.id===direct.form.environment;});
      var config=el(box,'details','config','dv-trace-config'),token=loaded?direct.exemplar.selectionToken:null,focusConfig=config.contains(doc.activeElement);
      if(config._directLoaded!==loaded || config._directToken!==token){config.open=!loaded;config._directLoaded=loaded;config._directToken=token;}
      var summary=el(config,'summary','summary','');summary.setAttribute('aria-label',loaded?'Change or load another trace':'Load trace options');
      el(summary,'strong','title','',loaded?[profile && profile.label,environment && environment.label].filter(Boolean).join(' · '):'Load trace');
      if(loaded)el(summary,'span','change','dv-trace-config-action','Change / load another trace');
      if(loaded && !config.open && focusConfig)summary.focus({preventScroll:true});
      el(config,'p','help','','Load one exact request. This session only; diagram mappings use authored traceMatch steps.');
      function field(parent,key,label,options,placeholder){
        var wrap=el(parent,'label',key+'-label','dv-trace-input-label');el(wrap,'span','label','',label);
        var control=el(wrap,options?'select':'input',key,'dv-trace-input');control.setAttribute('aria-label',label);
        if(options){el(control,'option','empty','','Choose…').value='';options.forEach(function(o){el(control,'option',o.id,'',o.label).value=o.id;});}
        else {control.type='text';control.maxLength=4096;control.autocomplete='off';control.spellcheck=false;control.placeholder=placeholder || '';}
        if(control.value!==direct.form[key])control.value=direct.form[key];
        if(!control._directChange){control._directChange=function(){var owner=host._livePanelApi;if(owner)owner.setDirectTraceField({field:key,value:control.value});};control.addEventListener(options?'change':'input',control._directChange);}
        return control;
      }
      field(config,'connection','Trace connection',direct.profiles);
      field(config,'environment','Connection environment',profile?profile.environments:[]);
      if(direct.sections.length)field(config,'section','Mapping diagram',direct.sections);
      field(config,'input','Trace ID or link',null,'Paste a trace ID or supported Honeycomb link');
      var start=direct.form.start,relative=/^-([1-9][0-9]{0,3}[smhdw])$/.exec(start),bounds=direct.bounds,back=bounds?bounds.lookback:direct.form.end?null:start?relative && relative[1]:profile && profile.lookback;
      if(start || profile)el(config,'p','lookback','dv-trace-lookback-note',bounds && bounds.linkTime?(bounds.linkUsable?'Uses the time range in the pasted link.':'This link\'s time range cannot be used with this connection; paste the trace ID alone.'):back?'Looks back '+back+'; change under Lookback.':'Uses the time set under Lookback.');
      var time=el(config,'details','time','dv-trace-time');el(time,'summary','summary','','Lookback (optional)');
      // Open once per not-found report; the section may be rebuilt when Trace mode is re-entered.
      // A log-line trace that was not kept opens Lookback only when the line is outside it (#1124).
      if(r && r.code==='trace_not_found' && (!r.logLine || r.lookbackHint) && host._directNotFoundReport!==r.serial){time.open=true;host._directNotFoundReport=r.serial;}
      el(time,'p','help','','Leave blank to use link bounds or the connection lookback.');
      field(time,'start','Trace start',null,'-2h or UTC ISO timestamp');field(time,'end','Trace end',null,'UTC ISO timestamp (absolute start only)');
      var controls=el(config,'div','actions','dv-live-controls');
      var load=el(controls,'button','load','reader-button dv-trace-load tbtn','Load trace');load.type='button';load.disabled=!direct.available || !direct.form.input.trim();
      // Reveal only the successful gesture's own panel, after its render. A
      // routine repaint, Verify, cancellation or remount must not move the view.
      load._directLoadAction=function(){
        var owner=host._livePanelApi;if(!owner || load.disabled)return;
        var request=host._directRevealRequest=(host._directRevealRequest || 0)+1;
        Promise.resolve(owner.loadDirectTrace(false)).then(function(result){
          if(!live || !result || host._livePanelApi!==owner || host._directRevealRequest!==request)return;
          var value=owner.snapshot(),selected=value.trace && value.trace.selected;
          if(value.mode!=='trace' || !selected || !selected.manual || selected.exemplar.selectionToken!==result.selectionToken)return;
          var target=host.querySelector('.dv-trace-selected');if(target && target.getClientRects().length && target.scrollIntoView)target.scrollIntoView({block:'nearest',inline:'nearest'});
        });
      };
      if(!load._directLoadClick){load._directLoadClick=function(){load._directLoadAction();};load.addEventListener('click',load._directLoadClick);}
      var verify=button(controls,'verify','reader-button dv-trace-verify','Verify trace connection','loadDirectTrace');verify._liveArgument=true;verify.disabled=load.disabled;
      if(direct.logs)logLookupBody(config,box,direct.logs,direct);
      if(!direct.available)el(box,'p','unavailable','dv-trace-direct-status','Direct trace retrieval is unavailable in this host or view.').setAttribute('role','status');
      if(r){var report=el(box,'section','report','dv-trace-direct-report'+(loaded?' dv-trace-report-compact':''));report.setAttribute('aria-label','Trace connection report');
        el(report,'p','stage','dv-trace-direct-status',r.error || (r.stage==='complete'?'Loaded · ID matched · '+r.spanCount+' spans · '+r.completeness+' completeness':r.stage==='schema'?'Checking runtime tool schema…':'Loading exact trace…')).setAttribute('role','status');
        if(r.error)el(report,'p','error-stage','','Stage: '+r.stage);
        // #1124: the provider may not have kept a log line's trace; offer the next line with a trace ID.
        if(r.code==='trace_not_found' && r.logLine && direct.logs && direct.logs.result && direct.logs.result.next>=0){var nextLine=button(el(report,'div','next-line','dv-live-controls'),'next','reader-button dv-trace-log-next','Try the next log line','loadNextLogTrace');nextLine.disabled=!direct.available || direct.busy;}
        var diagnostics=el(report,'details','diagnostics','dv-trace-diagnostics');el(diagnostics,'summary','summary','',r.mode==='verify'?'Verification details':'Connection details');
        if(diagnostics._directMode!==r.mode || diagnostics._directBusy!==direct.busy){diagnostics.open=r.mode==='verify';diagnostics._directMode=r.mode;diagnostics._directBusy=direct.busy;}
        el(diagnostics,'p','identity','', [r.connection,r.server,r.tool,r.environment].filter(Boolean).join(' · '));
        el(diagnostics,'p','receipt','', 'Stage: '+r.stage+' · request accepted: '+(r.requestAccepted?'yes':'no')+' · ID matched: '+(r.idMatched?'yes':'no'));
        if(r.arguments){el(diagnostics,'p','argument-note','','Resolved arguments (configured literals and context redacted):');el(diagnostics,'pre','arguments','dv-trace-arguments',JSON.stringify(r.arguments,null,2));}
      }
      if(direct.busy || direct.exemplar || r)button(el(box,'div','actions','dv-live-controls'),'clear','reader-button',direct.busy?'Cancel request':'Clear loaded trace','clearDirectTrace');
    }
    // #1078: board Edit mode is reachable from the Trace view too, so a span can be mapped and saved here.
    function traceEditControls(body,controls,edit){
      if(!edit || !(edit.editable || edit.active || edit.notice))return;
      var editing=!!edit.active,pending=edit.pending;
      var start=button(controls,'edit','reader-button dv-live-edit','Edit','editStart');start.hidden=!(edit.editable && !editing);start.disabled=!!(edit.blocked || edit.saving);
      var save=button(controls,'save','reader-button dv-live-save',edit.saving?'Saving…':'Save '+pending+' change'+(pending===1?'':'s'),'editSave');save.hidden=!(editing && pending);save.disabled=!!edit.saving;
      var discard=button(controls,'discard','reader-button dv-live-discard','Discard','editDiscard');discard.hidden=!(editing && pending);discard.disabled=!!edit.saving;
      button(controls,'done','reader-button dv-live-edit-done','Done','editDone').hidden=!(editing && !pending);
      var text=edit.notice?edit.notice.text:edit.editable && edit.blocked?edit.blocked:'';
      if(text){var notice=el(body,'p','edit-notice','dv-live-edit-notice',text);notice.setAttribute('role','status');notice.setAttribute('data-kind',edit.notice?edit.notice.kind:'info');}
    }
    function traceBody(value){
      // #1131: Env and the Metrics overlay switch are in the shared header, not here.
      var trace=value.trace,body=el(host,'div','trace-body','dv-live-panel-body dv-live-trace'),controls=el(body,'div','controls','dv-live-controls');
      if(value.actionLabel)button(controls,'action','reader-button',value.actionLabel,'runAction');
      var show=button(controls,'show','reader-button dv-trace-show','Show on diagram','setTraceShow');show._liveArgument=!trace.show;show.setAttribute('aria-pressed',String(trace.show));show.disabled=!trace.selected;
      traceEditControls(body,controls,value.edit);
      directTraceBody(body,trace.direct);
      var message=trace.direct && trace.direct.profiles.length?(!trace.hasMappings?'Diagram mapping is not configured. Loaded traces still show a waterfall.':''):!trace.hasMappings?'No traceMatch steps on this board':!trace.hasBindings && !trace.entries.length?'No trace bindings on this board':trace.historical?'Traces are unavailable in Over time. Return to Live to inspect a request.':trace.status.busy?'Loading trace evidence…':!trace.available?(trace.entries.length?'Host-provided trace evidence; live retrieval unavailable.':'Trace evidence unavailable. Check page bindings and connector permissions.'):!trace.enabled?(trace.entries.length?'Host-provided trace evidence. Turn on Metrics overlay to refresh explicit bindings.':'Turn on Metrics overlay to retrieve the explicitly bound request samples.'):!trace.entries.length?'No trace evidence returned. Check explicit trace bindings and provider availability.':'';
      var status=el(body,'p','status','dv-trace-mode-status',[message,trace.hasMappings?trace.status.note:'',trace.hasMappings?trace.notice:''].filter(Boolean).join(' '));status.setAttribute('role','status');
      if(trace.entries.length){
        el(body,'h3','candidates-title','','Returned traces');
        var list;
        var source=el(body,'select','trace-source','dv-trace-source-select');source.setAttribute('aria-label','Trace source');trace.entries.forEach(function(entry){var option=el(source,'option',entry.key,'',entry.label);option.value=entry.key;});
        var current=trace.entries.find(function(entry){return trace.selected && entry.key===trace.selected.key;}) || trace.entries[0];source.value=current.key;source._traceEntries=trace.entries;
        if(!source._traceChange){source._traceChange=function(){var entry=source._traceEntries.find(function(e){return e.key===source.value;}),owner=host._livePanelApi;if(entry && owner)owner.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});};source.addEventListener('change',source._traceChange);}
        list=el(body,'div','candidates','dv-trace-candidates');
        [current].forEach(function(entry){
          var group=el(list,'div',entry.key,'dv-trace-source');
          entry.candidates.forEach(function(candidate){
            var active=trace.selected && trace.selected.key===entry.key && trace.selected.exemplar.traceId===candidate.traceId;
            var choose=button(group,candidate.traceId,'reader-button dv-trace-candidate',candidate.traceId.slice(0,12)+' · '+candidate.status+(candidate.durationMs!=null?' · '+candidate.durationMs+' ms':''),'chooseTrace');
            choose._liveArgument={key:entry.key,traceId:candidate.traceId};choose.disabled=!candidate.available;choose.setAttribute('aria-pressed',String(!!active));choose.setAttribute('data-trace-id',candidate.traceId);choose.title=candidate.traceId+(candidate.time?' · '+candidate.time:'');
          });
        });
      }
      if(!trace.selected)return;
      var selected=trace.selected,e=selected.exemplar,model=selected.model,detail=el(body,'section','selected','dv-trace-selected');detail.setAttribute('data-trace-id',e.traceId);
      el(detail,'h3','heading','','Selected request');el(detail,'code','identity','dv-trace-identity',e.traceId);if(selected.manual && !selected.hasMappings)el(detail,'p','mapping-unavailable','','Diagram mapping is not configured for this section.');
      var candidate=e.candidates.find(function(c){return c.traceId===e.traceId;}),time=candidate && candidate.time || e.spans.map(function(s){return s.time;}).sort()[0];
      el(detail,'p','completeness','dv-trace-completeness',e.completeness+' completeness · '+e.spans.length+' spans · absence is not an outcome');
      var limit=e.warnings.filter(function(w){return /200 spans|timeline unavailable/i.test(w);});if(model.warning)limit.push(model.warning);if(limit.length)el(detail,'p','limit','dv-trace-limit',Array.from(new Set(limit)).join(' '));
      if(model.mapping)el(detail,'p','coverage','dv-trace-coverage',model.rows.filter(function(r){return r.status==='matched';}).length+'/'+model.rows.length+' steps matched · '+model.mapping.unmatched.length+' spans unmatched');
      var focus=selected.focus,focusedSpan=focus && e.spans.find(function(s){return s.id===focus.spanId;});
      var focusBox=el(detail,'div','focus','dv-trace-focus-summary');
      el(focusBox,'span','hint','dv-trace-focus-hint',focusedSpan?'Trace focus · '+focusedSpan.name:'Select a span to focus its operation and pause playback.');
      if(focusedSpan){
        var clear=button(focusBox,'clear','reader-button','Clear trace focus','clearTraceFocus');clear._liveArgument={context:selected.context};
        var operation=el(detail,'div','operation','dv-trace-operation-detail'),matched=focus.choice && focus.choice.row;
        el(operation,'strong','name','',focusedSpan.name);var duration=el(operation,'span','duration','dv-trace-duration',telemetryTraceDuration(focusedSpan.ms));duration.setAttribute('role','img');duration.setAttribute('aria-label',focusedSpan.ms+' milliseconds');duration.title=focusedSpan.ms+' ms';if(matched && matched.budget!=null)el(operation,'small','budget','',matched.budget+' ms budget');
        // #1078: the exact strings a step's traceMatch names (serviceName, operation), shown for copying.
        var identity=el(operation,'div','identity','dv-trace-span-identity');
        [['service','Service',focusedSpan.service],['operation','Operation',focusedSpan.name]].forEach(function(item){var field=el(identity,'span',item[0],'dv-trace-span-field');el(field,'span','label','dv-trace-span-label',item[1]);el(field,'code','value','dv-trace-span-'+item[0],item[2]);});
        el(operation,'small','conditions','',matched?matched.conditions.map(function(c){return c.label;}).join(' · '):'');
        el(operation,'small','navigation','dv-trace-focus-status',focus.choice?focus.choice.label+(!focus.choice.row.nodeId && focus.choice.row.edgeIndex==null?' · no authored diagram target':'')+(!focus.navigable?' · open this diagram to navigate':''):focus.choices.length?'Choose the authored step for this span.':'No authored step maps this span. Add a traceMatch to a step to map this span.').setAttribute('role','status');
        if(!focus.choice && !focus.choices.length)link(operation,'map-guide','How to map a span','https://github.com/reghartner/design-viz/blob/main/docs/trace-ready-authoring.md').classList.add('dv-trace-map-guide');
        // #1078: Edit mode only. The chosen step gets traceMatch {serviceName, operation} with this span's exact values.
        // A span without a service or operation name has nothing exact to write.
        var mapSteps=focusedSpan.service && focusedSpan.name?model.mapSteps:null;
        if(!focus.choice && !focus.choices.length && mapSteps){
          var mapper=el(operation,'div','map','dv-trace-map-step');mapper.setAttribute('role','group');mapper.setAttribute('aria-label','Map this span to a step');
          if(mapSteps.length){
            var pick=el(mapper,'select','step','reader-button tbtn dv-trace-map-select');pick.setAttribute('aria-label','Step to map');
            mapSteps.forEach(function(step){el(pick,'option',step.id,'',step.label).value=step.id;});
            if(!mapSteps.some(function(step){return step.id===pick.value;}))pick.value=mapSteps[0].id;
            var apply=button(mapper,'apply','reader-button dv-trace-map-apply','Map this span to a step','mapTraceSpan');apply._liveArgument={context:selected.context,spanId:focusedSpan.id,stepId:pick.value};pick._mapApply=apply;
            if(!pick._mapChange){pick._mapChange=function(){if(pick._mapApply && pick._mapApply._liveArgument)pick._mapApply._liveArgument.stepId=pick.value;};pick.addEventListener('change',pick._mapChange);}
          }else el(mapper,'p','none','dv-trace-map-none','Every step of this diagram already has a traceMatch.');
        }
        if(!focus.choice && focus.choices.length){
          var choices=el(operation,'div','choices','dv-trace-step-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','Choose trace step');
          focus.choices.forEach(function(choice){var pick=button(choices,choice.key,'reader-button dv-trace-step-choice',choice.label,'selectTraceSpan');pick._liveArgument={context:selected.context,spanId:focusedSpan.id,choiceKey:choice.key};});
        }
      }
      var waterfall=el(detail,'div','waterfall','dv-trace-waterfall');waterfall.setAttribute('aria-label','Selected trace waterfall');
      var extent=Math.max.apply(null,e.spans.map(function(s){return s.startMs+s.ms;}).concat([1]));
      e.spans.forEach(function(span){
        var row=el(waterfall,'button',span.id,'dv-trace-span');row.type='button';row.setAttribute('data-error',String(span.error));row.setAttribute('aria-pressed',String(!!focusedSpan && span.id===focusedSpan.id));row._traceSpan={context:selected.context,spanId:span.id};row.setAttribute('data-span-id',span.id);
        if(!row._traceClick){row._traceClick=function(){var owner=host._livePanelApi;if(owner && row.isConnected)owner.selectTraceSpan(row._traceSpan);};row.addEventListener('click',row._traceClick);}
        el(row,'span','name','dv-trace-span-name',span.service+' · '+span.name).title=span.id;
        var track=el(row,'span','track','dv-trace-track'),bar=el(track,'i','bar','dv-trace-bar');bar.style.marginLeft=100*span.startMs/extent+'%';bar.style.width=Math.max(.4,100*span.ms/extent)+'%';
        var duration=el(row,'span','duration','dv-trace-duration',telemetryTraceDuration(span.ms)+(span.error?' · error':''));duration.setAttribute('role','img');duration.setAttribute('aria-label',span.ms+' milliseconds'+(span.error?' · error':''));duration.title=span.ms+' ms';
      });
      var actions=el(detail,'div','actions','dv-live-controls');if(!selected.manual)button(actions,'pin','reader-button','Pin as evidence','pinSelectedTrace');
      var url=telemetryTraceUrl(e.url,e.provider);if(url)link(actions,'source','Open trace in '+(e.provider==='tempo'?'Grafana':'Honeycomb'),url);
      var metadata=el(detail,'details','metadata','dv-trace-metadata');el(metadata,'summary','summary','','Source and limitations');
      el(metadata,'p','selection','dv-trace-selection',e.selectionReason);el(metadata,'p','time','dv-trace-age',(time?'Observed '+time:'Trace age unavailable')+' · '+e.range.from+' – '+e.range.to);
      el(metadata,'p','meaning','','Edge labels show operation duration, not network latency. Unobserved operations are not proof of failure or success.');
      var warnings=el(metadata,'div','warnings','dv-trace-warnings');e.warnings.concat(model.warning?[model.warning]:[]).forEach(function(w,i){el(warnings,'p',String(i),'tr-notice',w);});
      var all=el(detail,'details','all','dv-trace-all');el(all,'summary','summary','','All operation mappings');var mappings=el(all,'div','mappings','dv-trace-mappings');
      model.rows.forEach(function(item){var row=el(mappings,'div',item.id,'dv-trace-mapping');row.setAttribute('data-tone',item.tone);el(row,'strong','operation','',item.operation);el(row,'span','duration','',item.label+(item.budget!=null?' / '+item.budget+' ms budget':''));el(row,'small','conditions','',[item.detail].concat(item.conditions.map(function(c){return c.label;})).filter(Boolean).join(' · '));});
    }
    // #1131 (Chuck D1 D6 D8 D12): one header above the Jira and the Trace view. Top row: Jira | Trace, Env and the
    // Metrics overlay switch. Then Live | Over time, the Over time error and the day row.
    function sharedHeader(value){
      var header=el(host,'div','header','dv-status-header'),top=el(header,'div','top','dv-status-top'),trace=!!(value && value.mode==='trace');
      var modes=el(top,'div','modes','dv-status-modes dv-status-segmented');modes.setAttribute('role','group');modes.setAttribute('aria-label','Status view');
      ['jira','trace'].forEach(function(mode){var count=value && value.trace?new Set(value.trace.entries.flatMap(function(e){return e.candidates.map(function(c){return c.traceId;});})).size:0;var control=button(modes,mode,'reader-button dv-status-mode',mode==='jira'?'Jira':'Trace'+(count?' · '+count:''),'setStatusMode');control._liveArgument=mode;control.setAttribute('aria-pressed',String((value && value.mode || 'jira')===mode));});
      var metrics=value && value.metrics || {available:false,enabled:false};
      if(metrics.environments && metrics.environments.length){
        var environmentLabel=el(top,'label','environment-label','dv-live-environment');
        el(environmentLabel,'span','caption','','Env');
        var environmentSelect=el(environmentLabel,'select','select','reader-button tbtn');environmentSelect.setAttribute('aria-label','Env');
        metrics.environments.forEach(function(id){var option=el(environmentSelect,'option',id,'',id);option.value=id;});
        environmentSelect.value=metrics.environment;
        if(!environmentSelect._liveChange){environmentSelect._liveChange=function(){var owner=host._livePanelApi;if(owner)owner.setMetricsEnvironment(environmentSelect.value);};environmentSelect.addEventListener('change',environmentSelect._liveChange);}
      }
      // Metrics (#939): an on/off switch, not a third view (D12). Shown only with a telemetry provider or demo, off by default, never persisted.
      var metricsSwitch=el(top,'button','metrics','dv-live-metrics');metricsSwitch.type='button';metricsSwitch.setAttribute('role','switch');metricsSwitch.setAttribute('aria-checked',String(!!metrics.enabled));metricsSwitch.hidden=!metrics.available;metricsSwitch._liveArgument=!metrics.enabled;
      el(el(metricsSwitch,'span','track','dv-live-switch-track'),'i','thumb','dv-live-switch-thumb').parentNode.setAttribute('aria-hidden','true');el(metricsSwitch,'span','label','','Metrics overlay');
      if(!metricsSwitch._liveClick){metricsSwitch._liveClick=function(){var owner=host._livePanelApi;if(owner)owner.setMetricsEnabled(metricsSwitch._liveArgument);};metricsSwitch.addEventListener('click',metricsSwitch._liveClick);}
      var available=value && value.available,hasData=available && value.hasData;
      // Live and Over time are the two modes (#929, Chuck 2026-11-04), in a row of their own. The selected one is filled. Live returns from a past day; while selected it still turns colors off (D6).
      var over=value && value.overTime,past=!!(over && over.active);
      var time=el(header,'div','time','dv-live-time dv-status-segmented');time.setAttribute('role','group');time.setAttribute('aria-label','Status time');
      var toggle=button(time,'toggle','reader-button dv-live-toggle','Live',past?'overTimeClose':'setEnabled');toggle.hidden=!hasData;time.hidden=!hasData;
      toggle._liveArgument=value?!value.enabled:false;toggle.setAttribute('aria-pressed',String(!!(value && value.enabled) && !past));
      var overTime=button(time,'over-time','reader-button dv-live-over-time',over && over.loading?'Loading history'+(over.progress?' '+over.progress:'')+'…':'Over time','overTime');overTime.hidden=!hasData || !over || !over.available;overTime.disabled=!!(over && (over.loading || over.disabled));overTime.setAttribute('aria-pressed',String(past));
      var overStatus=el(header,'p','over-time-status','dv-live-over-time-status',hasData && over && over.error?over.error:'');overStatus.setAttribute('role','status');overStatus.hidden=!overStatus.textContent;
      // Day buttons: on the slider row, and on a row of their own for a demo in Live mode, which has no slider. A demo's buttons move its own day.
      // The demo's Live row and the note about other columns belong to the Jira view.
      if(hasData && (past || value.demo && !trace)){
        var demoDays=value.demo,row=el(header,'div','day-row','dv-live-day-row'+(past?' dv-live-over-time-row':'')+(demoDays?' dv-live-demo':''));
        // #1082: the selected day, larger than the epic key; a day dated today reads TODAY with its date beside it.
        if(past){var heading=el(row,'div','heading','dv-live-over-time-heading');el(heading,'strong','day','dv-live-over-time-day',over.today?'TODAY':over.label);el(heading,'span','date','dv-live-over-time-date',over.today?over.label:'').hidden=!over.today;}
        var previousDay=button(row,'previous','reader-button dv-live-step','<',demoDays?'prevDemo':'overTimeStep');previousDay._liveArgument=-1;previousDay.setAttribute('aria-label','Previous day');previousDay.disabled=demoDays?demoDays.first:over.index<=0;
        if(past){
          el(row,'span','first','dv-live-over-time-end',over.first);
          var slider=el(row,'input','slider','dv-live-over-time-slider');slider.type='range';slider.min='0';slider.max=String(over.count-1);slider.step='1';slider.setAttribute('aria-label','Day');
          if(slider.value!==String(over.index))slider.value=String(over.index);slider.setAttribute('aria-valuetext',over.label);
          if(!slider._liveInput){slider._liveInput=function(){var owner=host._livePanelApi;if(owner)owner.overTimeDay(Number(slider.value));};slider.addEventListener('input',slider._liveInput);}
          el(row,'span','last','dv-live-over-time-end',over.last);
        }
        var nextDay=button(row,'next','reader-button dv-live-step','>',demoDays?'nextDemo':'overTimeStep');nextDay._liveArgument=1;nextDay.setAttribute('aria-label','Next day');nextDay.disabled=demoDays?demoDays.ended:over.index>=over.count-1;
        if(past && !trace)el(row,'p','note','dv-live-over-time-note','Status as of '+over.label+' · other columns show today').setAttribute('role','status');
      }
    }
    function paint(value){
      if(!live)return;epoch=host._livePaintEpoch=(host._livePaintEpoch || 0)+1;var focused=doc.activeElement;
      sharedHeader(value);
      if(value && value.mode==='trace'){traceBody(value);sweep(host);return;}
      var head=el(host,'div','head','dv-live-head');host._liveHead=head;
      // #986: the first row holds buttons that never move. Everything that changes has a row of its own, whose height depends on the panel's width and never on its text, so it cannot move the buttons or what is below.
      var controls=el(head,'div','controls','dv-live-controls'),statusRow=el(head,'div','status','dv-live-status'),countRow=el(statusRow,'div','counts','dv-live-counts'),statusLine=el(statusRow,'div','text','dv-live-status-text');
      var available=value && value.available,hasData=available && value.hasData;
      countRow.setAttribute('role','region');countRow.setAttribute('aria-label','Status counts');countRow.setAttribute('tabindex','0');countRow.setAttribute('title','Scroll horizontally to see all counts.');
      // Preserve native count scrolling when the page presenter also owns arrow keys.
      if(!countRow._liveKeys){countRow._liveKeys=function(event){if(event.target===countRow && ['ArrowLeft','ArrowRight','Home','End'].indexOf(event.key)>=0)event.stopPropagation();};countRow.addEventListener('keydown',countRow._liveKeys);}
      var missingWork=value && value.missingWork || {count:0,painted:false};
      var missingCount=el(countRow,'span','count-missing-work','dv-live-count'+(hasData && missingWork.count && missingWork.painted?' dv-live-missing':''),'Missing work '+missingWork.count);
      missingCount.setAttribute('data-live-count','missing-work');missingCount.setAttribute('title','Authored nodes and connections marked as missing work; each occurrence counts.');missingCount.hidden=!hasData || !missingWork.count;
      states.forEach(function(state){var count=el(countRow,'span','count-'+state,'dv-live-count'+(hasData && value && value.enabled && value.counts[state]?' dv-live-'+state:''),state+' '+(value?value.counts[state]:0));count.setAttribute('data-live-count',state);count.hidden=!hasData || !value.counts[state];});
      var metrics=value && value.metrics || {available:false,enabled:false},proof=metrics.proof;
      var conn=value && value.connection || {state:'none'},connLabel={disconnected:'not connected',approval:'needs approval',connecting:'connecting',connected:'connected',error:'error',demo:'demo'}[conn.state];
      var connection=el(statusLine,'span','connection','dv-live-connection');connection.setAttribute('data-state',conn.state);connection.setAttribute('data-busy',String(!!conn.busy));connection.setAttribute('role','status');
      var connWho=(conn.source || '')+(connLabel && connLabel!==String(conn.source || '').toLowerCase()?' '+connLabel:'');
      el(connection,'i','dot','dv-live-connection-dot');el(connection,'span','text','',[connWho,conn.checkedText].filter(Boolean).join(', '));
      var gh=conn.github || {state:'none'},ghLabel={connecting:'GitHub connecting',connected:'GitHub connected',error:'GitHub did not answer'}[gh.state];
      var github=el(connection,'span','github','dv-live-connection-github',ghLabel || '');github.setAttribute('data-state',gh.state);github.setAttribute('data-busy',String(!!gh.busy));github.hidden=!ghLabel;
      connection.hidden=!available || conn.state==='none';
      // The telemetry connector beside the Jira one: same markup and dot tokens, its own class
      // names so `.dv-live-connection` keeps naming the Jira connector alone.
      var metricsState=metrics.state==='ok'?(metrics.demo?'demo':'connected'):{loading:'connecting',error:'error',approval:'approval'}[metrics.state] || 'disconnected';
      var metricsLabel={connected:'connected',demo:'demo',connecting:'connecting',error:'did not answer',approval:'needs approval'}[metricsState] || 'not connected';
      var metricsConnection=el(statusLine,'span','metrics-connection','dv-live-metrics-connection');metricsConnection.setAttribute('data-state',metricsState);metricsConnection.setAttribute('data-busy',String(!!metrics.busy));metricsConnection.setAttribute('role','status');
      el(metricsConnection,'i','dot','dv-live-metrics-dot');
      // A note on a good answer (a failed query beside answered ones) follows the refreshed time.
      var answered=metricsState==='connected' || metricsState==='demo',metricsText;
      if(metrics.source){
        // #943: "Grafana connected · 24h window · refreshed 10:42:13"; an error shows its note, which names the fix.
        var named=metrics.source+' '+metricsLabel;
        metricsText=metricsState==='error'?metrics.note || named:metricsState==='disconnected'?named:
          [named,metrics.window?metrics.window+' window':'',answered?metrics.checkedText:'',answered?metrics.note:''].filter(Boolean).join(' · ');
      }else metricsText=metricsState==='error'?'Metrics: '+metricsLabel+(metrics.note?' · '+metrics.note:''):
        ['Metrics: '+metricsLabel,metrics.checkedText].filter(Boolean).join(', ')+(answered && metrics.note?' · '+metrics.note:'');
      if(!metrics.available && metrics.note)metricsText=metrics.note;
      if(metrics.environment)metricsText+=' · '+metrics.environment;
      el(metricsConnection,'span','text','',metricsText);
      metricsConnection.hidden=!metrics.available && !metrics.note;
      var note=el(statusLine,'span','note','dv-live-note',available?value.note.text:'');note.setAttribute('role','status');note.setAttribute('data-kind',value?value.note.kind:'info');note.hidden=!available || !value.note.text;
      var actionLabel=(available || metrics.available) && value && value.actionLabel || '';
      var action=button(controls,'action','reader-button dv-live-action',actionLabel,'runAction');action.hidden=!actionLabel;
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
      head.hidden=!metrics.note && !metrics.available && (!available || !(hasData || value.note.text || value.actionLabel || editShown));
      controls.hidden=!actionLabel && (!available || !(hasData || editShown));statusRow.hidden=!metrics.note && !metrics.available && (!available || !(hasData || value.note.text));
      // Long text is cut off on screen; the tooltip and the status elements keep all of it.
      var statusText=[connection.hidden?'':[connWho,conn.checkedText].filter(Boolean).concat(ghLabel?[ghLabel]:[]).join(', '),metricsConnection.hidden?'':metricsText,note.textContent,reason.textContent,editNotice.textContent].filter(Boolean).join(' · ');
      if(statusText)statusRow.setAttribute('title',statusText);else statusRow.removeAttribute('title');
      if(!available && !proof)el(host,'p','empty','dv-live-empty','This page has no ticket references.');
      if(hasData || proof || (metrics.logDetails || []).length || value && value.activity.length){
        var body=el(host,'div','body','dv-live-panel-body'),epic=value.epic || {keys:[]};
        if(hasData){
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
        }
        if(proof)proofBox(body,proof);
        if(hasData){
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
        }
        if(proof)proofTable(body,proof);
        logDetails(body,metrics.logDetails || []);
        if(hasData){
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
      }
        el(body,'h3','activity-heading','','Activity');var activity=el(body,'ol','activity','dv-live-activity');value.activity.forEach(function(item,index){
          var telemetry=item.type==='telemetry',row=el(activity,'li',(telemetry?'telemetry-':'jira-')+index,'dv-live-activity-entry',telemetry?null:item.key+' · '+(item.added?'added to epic · not on diagram':item.old+' → '+item.state)+' · '+item.relative);
          row.setAttribute('data-activity-type',telemetry?'telemetry':'jira');
          if(telemetry){row.setAttribute('data-activity-kind',item.kind);row.setAttribute('data-activity-carrier',item.carrier);}else{row.removeAttribute('data-activity-kind');row.removeAttribute('data-activity-carrier');}
          if(telemetry)el(row,'span','text','',item.title+' · '+item.text+' · '+item.relative);
          if(telemetry && item.url)link(row,'source','Source',item.url);
          if(item.at)row.setAttribute('data-updated-at',item.at);else row.removeAttribute('data-updated-at');
        });
      }
      if(!hasData && value && (value.excluded || []).length)excludedStories(el(host,'div','audit','dv-live-panel-body'),value.excluded);
      // #758: a built page carries an agent guide block; tell editors where it is. Nothing is painted without it.
      if(doc.getElementById('dv-agent-guide'))el(host,'p','agent-guide','dv-live-agent-guide',"Editors: ask your agent to read this page's agent guide (id dv-agent-guide)");
      sweep(host);
      if(value && !value.enabled && typeof liveStatusClass==='function')host.querySelectorAll('[data-live-appearance],.dv-live-state-pill,.dv-live-count').forEach(function(node){liveStatusClass(node,null);});
      if(typeof liveStatusClass==='function')states.forEach(function(state){host.querySelectorAll('.dv-live-'+state).forEach(function(node){liveStatusClass(node,state);});});
      if(typeof liveStatusClass==='function')liveStatusClass(missingCount,hasData && missingWork.count && missingWork.painted?'missing':null);
      if(typeof liveStatusInk==='function')host.querySelectorAll('.dv-live-state-pill:not([data-live-appearance])').forEach(function(node){liveStatusInk(node,null);});
      if(focused && host.contains(focused) && doc.activeElement!==focused && focused.focus)focused.focus({preventScroll:true});
    }
    function cleanup(){if(!live)return;live=false;host._livePanelApi=null;host._liveSortHandler=null;if(offChange)offChange();if(offDestroy)offDestroy();if(offReady)offReady();}
    host._panelMotionCleanup=cleanup;
    function connect(controller){if(!live || api)return;api=controller;host._livePanelApi=api;if(offReady)offReady();paint(api.snapshot());offChange=api.onChange(paint);offDestroy=api.onDestroy(function(){var value=api.snapshot();value.metrics=Object.assign({},value.metrics,{proof:null,available:false,enabled:false});value.trace=Object.assign({},value.trace,{entries:[],selected:null,available:false,enabled:false});paint(value);cleanup();});}
    var controller=typeof liveStatusControllerFor==='function'?liveStatusControllerFor(host):null;
    if(controller)connect(controller);else {paint(null);if(typeof liveStatusWhenReady==='function')offReady=liveStatusWhenReady(host,connect);}
  }
  var LIVE_STYLES=String.raw`
/* #1131: the header shared by the Jira and Trace views. Segments keep the reader's button look (#863); the selected one is filled. */
.dv-status-header{display:flex;flex-direction:column;gap:8px;margin:0 0 12px;padding-bottom:10px;border-bottom:1px solid var(--explore-border)}
.dv-status-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.dv-status-segmented{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.dv-live-environment{display:inline-flex;align-items:center;gap:6px;font:11px/1.5 'IBM Plex Mono',monospace;color:var(--dtext)}
.dv-live-metrics{display:inline-flex;align-items:center;gap:8px;margin-left:auto;padding:2px 0;border:0;background:none;color:var(--dink);font:12px/1.4 'IBM Plex Sans',sans-serif;cursor:pointer}
.dv-live-switch-track{position:relative;flex:none;width:30px;height:16px;border-radius:999px;background:var(--dfaint,#9aa3ad);transition:background-color .15s}
.dv-live-switch-thumb{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .15s}
.dv-live-metrics[aria-checked="true"] .dv-live-switch-track{background:var(--dv-live-active)}
.dv-live-metrics[aria-checked="true"] .dv-live-switch-thumb{transform:translateX(14px)}
.dv-live-metrics:focus-visible{outline:2px solid var(--dink,currentColor);outline-offset:3px;border-radius:4px}
@media(prefers-reduced-motion:reduce){.dv-live-switch-track,.dv-live-switch-thumb{transition:none}}
.dv-status-header>.dv-live-over-time-status{margin:0;font:11px/1.5 'IBM Plex Mono',monospace}
.dv-status-header>.dv-live-day-row{margin-top:0}
.pt-live-status .dv-status-modes .tbtn.dv-status-mode[aria-pressed="true"],.pt-live-status .dv-live-trace .tbtn.dv-trace-candidate[aria-pressed="true"],.pt-live-status .dv-live-trace .tbtn.dv-trace-show[aria-pressed="true"]{background:var(--dv-live-active);color:#fff;border-color:var(--dv-live-active)}
.dv-live-trace{font-size:12px}.dv-live-trace p{margin:6px 0;overflow-wrap:anywhere}.dv-trace-mode-status:empty{display:none}
.dv-trace-direct{border:1px solid var(--explore-border);border-radius:6px;padding:10px;margin:10px 0}.dv-trace-input-label{display:grid;gap:4px;margin:8px 0}.dv-trace-input{box-sizing:border-box;width:100%;min-width:0;font:inherit;color:inherit;background:transparent;border:1px solid var(--explore-border);border-radius:4px;padding:6px}.dv-trace-arguments{white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto;font-size:10px}.dv-trace-direct-report{padding:8px;border:1px solid var(--explore-border);margin-top:8px}
.dv-trace-config>summary,.dv-trace-time>summary,.dv-trace-diagnostics>summary{cursor:pointer;overflow-wrap:anywhere}.dv-trace-config-action{display:block;margin:3px 0 0 14px;color:var(--dfaint)}.dv-trace-time{margin:10px 0}.dv-trace-diagnostics{margin:6px 0}.dv-trace-report-compact{border:0;padding:0;margin:6px 0}.dv-trace-direct>.dv-live-controls{margin-top:6px}
.dv-trace-source-select{display:block;width:100%;max-width:100%;margin-bottom:6px;font:inherit;color:inherit;background:transparent;border:1px solid var(--explore-border);padding:6px;border-radius:4px}.dv-trace-metadata,.dv-trace-all{margin-top:10px}.dv-trace-metadata summary,.dv-trace-all summary{cursor:pointer;color:var(--dfaint)}.dv-trace-mappings{max-height:220px;overflow:auto}.dv-trace-candidates{max-height:120px;overflow:auto;border:1px solid var(--explore-border);border-radius:6px;padding:8px}.dv-trace-source{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}.dv-trace-source-label{width:100%;font-size:11px;color:var(--dfaint);overflow-wrap:anywhere}
.dv-trace-logs{margin:12px 0 4px;padding-top:10px;border-top:1px solid var(--explore-border)}.dv-trace-logs-title{margin:0 0 4px;font-size:12px}textarea.dv-trace-input{resize:vertical}.dv-trace-log-results{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px}.dv-trace-log-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--explore-border);font-size:11px}.dv-trace-log-row:last-child{border-bottom:0}.dv-trace-log-time{color:var(--dfaint);white-space:nowrap}.dv-trace-log-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv-trace-log-id{grid-column:1/3;font-size:10px;overflow-wrap:anywhere}.dv-trace-log-missing{grid-column:1/-1;color:var(--dfaint)}.dv-trace-log-load{grid-column:3;grid-row:1/3}
.dv-trace-selected{min-width:0}.dv-trace-identity{overflow-wrap:anywhere}.dv-trace-age,.dv-trace-selection{font-size:10px;color:var(--dfaint)}
.dv-trace-warnings{max-height:90px;overflow:auto}.dv-trace-waterfall{max-height:240px;overflow:auto;margin:12px 0;border:1px solid var(--explore-border);border-radius:6px;padding:8px}
.dv-trace-span{width:100%;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 8px;align-items:center;padding:5px 0;font-size:10px}.dv-trace-span[aria-pressed="true"]{background:color-mix(in srgb,var(--dv-live-active) 10%,transparent)}.dv-trace-span:focus-visible{outline:2px solid var(--dv-live-active)}.dv-trace-operation-detail{display:grid;grid-template-columns:minmax(0,1fr);min-width:0;gap:6px;margin-top:12px;padding:8px;border:1px solid var(--explore-border);border-radius:6px}.dv-trace-operation-detail>*{min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere}.dv-trace-operation-detail small{grid-column:1/-1}.dv-trace-duration{font:700 13px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}.dv-trace-span .dv-trace-duration{grid-column:2;grid-row:1;white-space:nowrap}.dv-trace-operation-detail .dv-trace-duration{font-size:20px;line-height:1.4}.dv-trace-span-name{grid-column:1;grid-row:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv-trace-track{grid-column:1/-1;grid-row:2;height:10px;background:color-mix(in srgb,var(--dink) 7%,transparent)}.dv-trace-bar{display:block;box-sizing:border-box;max-width:100%;height:10px;background:var(--dv-live-active)}.dv-trace-span[data-error="true"] .dv-trace-bar{background:var(--dv-live-blocked)}
.dv-trace-mappings{display:grid;gap:5px}.dv-trace-mapping{display:grid;grid-template-columns:1fr auto;gap:2px 8px;border-left:3px solid var(--dfaint);padding:5px 8px}.dv-trace-mapping small{grid-column:1/-1;color:var(--dfaint)}.dv-trace-mapping[data-tone="error"]{border-color:var(--dv-live-blocked)}.dv-trace-mapping[data-tone="warning"]{border-color:#d49620}
[data-trace-tone="error"]{--dv-trace-color:#d64b68}[data-trace-tone="warning"]{--dv-trace-color:#c88b14}[data-trace-tone="observed"]{--dv-trace-color:#368cc9}[data-trace-tone="unknown"]{--dv-trace-color:#87929e}
/* Evidence never replaces status or missing-work borders. Only the selected
   operation escapes step/ambient dimming; whole-trace annotations stay quiet. */
g.node[data-trace-focus="true"]{opacity:1!important}
.dv-trace-focus-overlay .dv-trace-focus-brackets{fill:none;stroke:#009fc7;stroke-width:3;stroke-linecap:square;stroke-linejoin:round;stroke-dasharray:none;filter:drop-shadow(0 0 2px var(--dbg,#fff))}
.dv-trace-focus-overlay rect{fill:#007d9c;stroke:var(--dbg,#fff);stroke-width:2}
.dv-trace-focus-overlay text{fill:#fff;font:700 10px 'IBM Plex Mono',monospace;letter-spacing:.3px}
.dv-trace-focus-summary{display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:10px 12px;border:1px solid color-mix(in srgb,#009fc7 40%,var(--dfaint));border-radius:7px;background:color-mix(in srgb,#009fc7 7%,var(--dbg));font-size:12px}
.dv-trace-focus-hint{min-width:0;overflow-wrap:anywhere}.dv-trace-focus-summary .reader-button{align-self:flex-start;max-width:100%;white-space:normal;overflow-wrap:anywhere}
.dv-trace-focus-status{color:var(--dtext)}.dv-trace-span-identity{display:grid;gap:3px;min-width:0}.dv-trace-span-field{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px;align-items:baseline;min-width:0;font-size:10px}.dv-trace-span-label{color:var(--dtext)}.dv-trace-span-field code{min-width:0;overflow-wrap:anywhere;user-select:all}.dv-trace-map-guide{justify-self:start;max-width:100%;overflow-wrap:anywhere}.dv-trace-map-step{display:flex;flex-wrap:wrap;gap:7px;min-width:0}.dv-trace-map-select{min-width:0;max-width:100%}.dv-trace-map-apply{min-width:0;max-width:100%;white-space:normal}.dv-trace-map-none{margin:0;color:var(--dtext)}.dv-trace-step-choices{display:flex;flex-wrap:wrap;gap:7px;grid-column:1/-1}.dv-trace-step-choice{min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:left}
.dv-trace-span:focus-visible,.dv-trace-step-choice:focus-visible{outline:2px solid #009fc7;outline-offset:3px}

.dv-trace-overlay{fill:#368cc9}.dv-trace-overlay[data-tone="error"]{fill:#d64b68}.dv-trace-overlay[data-tone="warning"]{fill:#c88b14}.dv-trace-overlay[data-tone="unknown"]{fill:#87929e}.dv-trace-overlay text{font:700 14px 'IBM Plex Mono',monospace;paint-order:stroke;stroke:var(--dbg,#fff);stroke-width:3px;stroke-linejoin:round}
.dv-live-toggle{display:flex;gap:4px;align-items:center;}
.dv-live-count{border-radius:4px;padding:2px 4px;color:var(--dv-live-on);}
.dv-live-note{color:var(--dtext);}
.dv-live-connection,.dv-live-metrics-connection{display:inline-flex;align-items:center;gap:6px;color:var(--dtext);white-space:nowrap;}
.dv-live-connection[hidden],.dv-live-metrics-connection[hidden]{display:none!important;}
.dv-live-connection-dot,.dv-live-metrics-dot{width:8px;height:8px;border-radius:50%;background:var(--dfaint,var(--dv-live-todo));flex:none;}
.dv-live-connection[data-state="connected"] .dv-live-connection-dot,.dv-live-connection[data-state="demo"] .dv-live-connection-dot,.dv-live-metrics-connection[data-state="connected"] .dv-live-metrics-dot,.dv-live-metrics-connection[data-state="demo"] .dv-live-metrics-dot{background:var(--dv-live-done);}
.dv-live-connection[data-state="connecting"] .dv-live-connection-dot,.dv-live-connection[data-state="approval"] .dv-live-connection-dot,.dv-live-metrics-connection[data-state="connecting"] .dv-live-metrics-dot,.dv-live-metrics-connection[data-state="approval"] .dv-live-metrics-dot{background:var(--dv-live-active);}
.dv-live-connection[data-state="error"] .dv-live-connection-dot,.dv-live-metrics-connection[data-state="error"] .dv-live-metrics-dot{background:var(--dv-live-blocked);}
.dv-live-connection[data-busy="true"] .dv-live-connection-dot,.dv-live-metrics-connection[data-busy="true"] .dv-live-metrics-dot{animation:dv-live-connection-pulse 1.2s ease-in-out infinite;}
.dv-live-connection-github::before{content:'· ';}
.dv-live-connection-github[data-state="error"]{color:var(--dv-live-blocked);}
@keyframes dv-live-connection-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.7);}}
@media (prefers-reduced-motion: reduce){.dv-live-connection-dot,.dv-live-metrics-dot{animation:none!important;}}
.dv-live-note[data-kind="warn"],.dv-live-note[data-kind="error"]{color:var(--dv-live-blocked);}
.dv-live-over-time-status{color:var(--dv-live-blocked);}
/* Amber marks "not live": no ticket status uses it. */
.pt-live-status{--dv-live-past:#f5a524;}
.pt-live-status .dv-live-time .tbtn.dv-live-toggle[aria-pressed="true"],.pt-live-status .dv-live-time .tbtn.dv-live-toggle[aria-pressed="true"]:hover{background:var(--dv-live-active);border-color:var(--dv-live-active);color:#000;}
.pt-live-status :is(.dv-live-head,.dv-live-time) .tbtn:focus-visible{outline:2px solid var(--dink,currentColor);outline-offset:3px;}
.pt-live-status .dv-live-time .tbtn.dv-live-over-time[aria-pressed="true"],.pt-live-status .dv-live-time .tbtn.dv-live-over-time[aria-pressed="true"]:hover{background:var(--dv-live-past);border-color:var(--dv-live-past);color:#2b1a00;}
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
.dv-live-over-time-heading{flex:0 0 100%;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 12px;min-width:0;margin-bottom:2px;}
.dv-live-over-time-day{font:700 28px/1.15 'IBM Plex Mono',monospace;letter-spacing:.02em;color:var(--dink);overflow-wrap:anywhere;}
.dv-live-over-time-date{font:600 16px/1.3 'IBM Plex Mono',monospace;color:var(--dtext);}
.dv-live-epic,.dv-live-proof{display:flex;gap:16px;align-items:center;padding:14px 16px;margin-top:12px;border:1px solid var(--explore-border);border-radius:10px;background:color-mix(in srgb,var(--dink) 4%,transparent);}
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

.dv-live-proof{flex-wrap:wrap;}
.dv-live-proof>.dv-live-epic-main{flex:1 1 220px;}
.dv-live-proof h3,.dv-live-proof p{margin:0;}
.dv-live-proof-pills{display:flex;flex-wrap:wrap;gap:4px;}
.dv-live-proof-pill[data-proof-bucket="proven"]{color:var(--dv-live-done);}
.dv-live-proof-pill[data-proof-bucket="degraded"],.dv-live-proof-pill[data-proof-bucket="unproven"]{color:var(--dv-metrics-degraded,var(--dv-live-past));}
.dv-live-proof-pill[data-proof-bucket="liveEarly"]{color:var(--dv-live-active);}
.dv-live-proof-arc[data-proof-bucket="proven"]{stroke:var(--dv-live-done);}
.dv-live-proof-arc[data-proof-bucket="degraded"]{stroke:var(--dv-metrics-degraded,var(--dv-live-past));}
.dv-live-proof-arc[data-proof-bucket="unproven"]{stroke:var(--dfaint);}
.dv-live-proof-arc[data-proof-bucket="liveEarly"]{stroke:var(--dv-live-active);}
.dv-live-proof-sentence{font:11px/1.5 'IBM Plex Mono',monospace;}
.dv-live-proof-predicate,.dv-live-proof-detail{font:10px/1.5 'IBM Plex Sans',sans-serif;color:var(--dfaint);overflow-wrap:anywhere;}
.dv-live-log-group{margin:8px 0;border:1px solid var(--explore-border);border-radius:6px;padding:8px;min-width:0}.dv-live-log-group summary{cursor:pointer;font-weight:600;overflow-wrap:anywhere}.dv-live-log-group p{font-size:11px;overflow-wrap:anywhere}.dv-live-log-scroll{max-height:280px;overflow:auto;border:1px solid var(--explore-border)}.dv-live-tickets.dv-live-log-table{width:100%;table-layout:fixed}.dv-live-tickets.dv-live-log-table th:nth-child(n){width:auto;white-space:normal;overflow-wrap:anywhere}.dv-live-log-table td{vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}.dv-live-log-status{color:var(--dfaint)}
.dv-live-tickets.dv-live-proof-table{min-width:960px;}
.dv-live-proof-table td:first-child{min-width:140px;}
.dv-live-proof-table td:nth-child(8){min-width:160px;}
.dv-live-proof-table td{vertical-align:top;}
.dv-live-proof-kpi{white-space:normal;min-width:160px;max-width:240px;}
.dv-live-proof-since{min-width:150px;max-width:180px;overflow-wrap:anywhere;}
.dv-live-proof-sparkline{width:100px;height:32px;overflow:visible;color:var(--dtext);}
.dv-live-proof-series{fill:none;stroke:currentColor;stroke-width:1.5;}
.dv-live-proof-point{fill:currentColor;}
.dv-live-proof-marker{stroke:var(--dfaint);stroke-dasharray:3 2;stroke-width:1;}
.dv-live-proof-link{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;}
.dv-live-proof-link svg{width:18px;height:18px;}

.dv-live-ring-track{stroke:var(--dv-live-todo);opacity:.3;}
.dv-live-ring-done{stroke:var(--dv-live-done);}
.dv-live-blockers,.dv-live-activity{list-style:none;padding:0;margin:0;}
.dv-live-blocker{display:flex;flex-wrap:wrap;gap:4px 8px;padding:10px 0;border-bottom:1px solid var(--explore-border);}
.dv-live-blocker-lanes,.dv-live-downstream,.dv-live-missing-detail{flex-basis:100%;}
.dv-live-activity-entry{padding:5px 0;font-size:12px;}
.dv-live-activity-entry>a{margin-left:6px;}
.dv-live-production{border-top:1px solid var(--explore-border);margin-top:8px;padding-top:8px;}
.dv-live-production h3,.dv-live-production p{margin:4px 0;}
.dv-live-production[data-loading="true"] .dv-live-production-verdict,.dv-live-proof-row[data-loading="true"] .dv-live-proof-pill{color:var(--dv-live-active,#2879d9);}
.dv-live-production-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;}
.dv-live-metric-link{display:inline-flex;padding:3px;margin-left:4px;vertical-align:middle;}
.dv-live-metric-scope{display:block;opacity:.8;margin-top:4px;}
.dv-live-production-kpi{border:1px solid var(--explore-border);border-radius:5px;padding:6px;overflow-wrap:anywhere;}
.dv-live-production-since{color:var(--dfaint);overflow-wrap:anywhere;}
.dv-live-production-link{display:inline-flex;align-items:center;gap:4px;}
.dv-live-production-link svg{width:16px;height:16px;}
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
.pt-live-status :is(.dv-live-head,.dv-live-time,.dv-live-day-row) .tbtn:disabled{opacity:.5;cursor:default;}
/* Paper has no controls: print hides these buttons as it hides the reader's other tbtn controls. */
@media print{.pt-live-status :is(.dv-live-head,.dv-live-time,.dv-live-day-row) .tbtn,.pt-live-status :is(.dv-live-metrics,.dv-live-environment){display:none;}}
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
.dv-live-status{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);align-items:center;gap:0 8px;height:36px;overflow:hidden;white-space:nowrap;}
/* A fixed count row reserves room for the scrollbar; changing counts never moves the header below it. */
.dv-live-counts{display:flex;align-items:center;gap:8px;min-width:0;height:36px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;}
.dv-live-counts>.dv-live-count{flex:none;}
.dv-live-counts:focus-visible{outline:2px solid var(--dv-live-active);outline-offset:-2px;}
.dv-live-status-text{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;}
.dv-live-status-text>*{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
.dv-live-connection>span{min-width:0;overflow:hidden;text-overflow:ellipsis;}
.dv-live-controls[hidden],.dv-live-status[hidden]{display:none!important;}
/* A narrow panel gives counts and text a line each: the height follows the panel's width, never its text. */
@container (max-width:560px){.dv-live-status{grid-template-columns:minmax(0,1fr);grid-template-rows:36px 28px;height:64px;}}
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

/* #1243 Links window (desktop Workbench): one tab per link kind. Part 1 builds
   the Tickets tab: rows by ticket or by element, highlight on the canvas and in
   Steps, + Assign checklists, drag to attach / move (⌥ copies) and a keyboard
   Move to… / Copy to… path. Every write is one planner call (commands/links.js),
   so each edit is one Undo step and writes what the Inspector writes. */
function initWorkbenchLinksView(opts){
  var doc=opts.document,win=opts.window || window,root=doc.getElementById('links-view'),view=opts.view,session=opts.session;
  if(!root || !session)return null;
  var life=createWorkbenchLifetime(),rowsLife=createWorkbenchLifetime(),popLife=createWorkbenchLifetime();
  life.own(function(){rowsLife.destroy();popLife.destroy();});
  var TABS=[['tickets','Tickets'],['metrics','Metrics'],['trace','Trace match'],['logs','Log searches']];
  var state={tab:'tickets',by:'ticket',show:'all',filter:'',drafts:[],highlight:null,popover:null,drag:null,editing:null,adding:false};
  var modelRev=0,byId=Object.create(null),byKey=Object.create(null),visible=false,filterTimer=null,dryRuns=Object.create(null),model=null,modelKey=null,stale=false,suppressClick=false,uid='links-'+Math.random().toString(36).slice(2);

  function el(tag,cls,text){var n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function button(cls,text,label,title){var b=el('button',cls,text);b.type='button';if(label)b.setAttribute('aria-label',label);if(title)b.title=title;return b;}

  /* ---------- static chrome ---------- */
  root.innerHTML='';
  var heading=el('div','editor-pane-heading links-heading');
  heading.appendChild(el('h2',null,'Links'));
  heading.appendChild(el('p',null,'See what each ticket is attached to, or what each node, connection and step carries. Click to highlight; drag or use Assign to reassign. Every change is one Undo step.'));
  root.appendChild(heading);
  var tablist=el('div','links-tabs');tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label','Link kinds');root.appendChild(tablist);
  var tabButtons={},panels={};
  TABS.forEach(function(entry){
    var b=el('button','links-tab');b.type='button';b.setAttribute('role','tab');b.id=uid+'-tab-'+entry[0];
    b.setAttribute('aria-controls',uid+'-panel-'+entry[0]);
    b.appendChild(el('span','links-tab-label',entry[1]));var count=el('span','links-tab-count');b.appendChild(count);
    life.listen(b,'click',function(){selectTab(entry[0]);});
    life.listen(b,'keydown',function(ev){
      var at=TABS.findIndex(function(t){return t[0]===entry[0];}),next=ev.key==='ArrowRight'?at+1:ev.key==='ArrowLeft'?at-1:ev.key==='Home'?0:ev.key==='End'?TABS.length-1:null;
      if(next==null)return;ev.preventDefault();next=(next+TABS.length)%TABS.length;selectTab(TABS[next][0]);tabButtons[TABS[next][0]].focus();
    });
    tabButtons[entry[0]]=b;tablist.appendChild(b);
    var panel=el('div','links-panel');panel.setAttribute('role','tabpanel');panel.id=uid+'-panel-'+entry[0];panel.setAttribute('aria-labelledby',b.id);
    panels[entry[0]]=panel;root.appendChild(panel);
    if(entry[0]!=='tickets'){
      panel.appendChild(el('p','links-coming','Coming next: '+entry[1]+' links in both directions. Until then, edit them in Inspect.'));
    }
  });
  var tickets=panels.tickets;
  var toolbar=el('div','links-toolbar');tickets.appendChild(toolbar);
  function segmented(label,choices,current,onPick){
    var wrap=el('div','links-segment');wrap.setAttribute('role','group');wrap.setAttribute('aria-label',label);
    var cap=el('span','links-segment-label',label);cap.setAttribute('aria-hidden','true');wrap.appendChild(cap);
    var buttons={};
    choices.forEach(function(choice){
      var b=button('links-seg',choice[1]);b.setAttribute('aria-pressed','false');
      life.listen(b,'click',function(){onPick(choice[0]);});buttons[choice[0]]=b;wrap.appendChild(b);
    });
    return {el:wrap,paint:function(value){Object.keys(buttons).forEach(function(k){buttons[k].setAttribute('aria-pressed',String(k===value));});}};
  }
  var bySeg=segmented('Rows by',[['ticket','By ticket'],['element','By element']],state.by,function(value){state.by=value;closePopover(false);render();});
  var showSeg=segmented('Show',[['all','All'],['step','Steps'],['node','Nodes'],['edge','Connections']],state.show,function(value){state.show=value;render();});
  toolbar.appendChild(bySeg.el);toolbar.appendChild(showSeg.el);
  var filter=el('input','fctl links-filter');filter.type='search';filter.setAttribute('aria-label','Filter tickets, nodes, connections and steps');filter.placeholder='Filter tickets, nodes, connections, steps';
  life.listen(filter,'input',function(){
    if(filterTimer!=null)life.cancelDelay(filterTimer);
    filterTimer=life.delay(function(){filterTimer=null;state.filter=filter.value;render();},120);
  });
  toolbar.appendChild(filter);
  var addKey=button('bbtn links-new','+ New ticket key',null,'Start a ticket row, then drag it or use Assign to attach it');
  life.listen(addKey,'click',function(){state.adding=true;render();var input=tickets.querySelector('.links-new-input');if(input)input.focus();});
  toolbar.appendChild(addKey);
  var list=el('div','links-list');list.setAttribute('role','list');list.setAttribute('aria-label','Ticket links');tickets.appendChild(list);
  var footer=el('div','links-footer');tickets.appendChild(footer);
  var error=el('p','links-error');error.setAttribute('role','alert');error.hidden=true;footer.appendChild(error);
  var status=el('p','links-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');footer.appendChild(status);
  var clear=button('bbtn links-clear','Clear highlight (Esc)');clear.hidden=true;footer.appendChild(clear);
  life.listen(clear,'click',function(){setHighlight(null);});

  function selectTab(name){state.tab=name;closePopover(false);paintTabs();}
  function paintTabs(){
    TABS.forEach(function(entry){
      var on=entry[0]===state.tab;tabButtons[entry[0]].setAttribute('aria-selected',String(on));tabButtons[entry[0]].tabIndex=on?0:-1;panels[entry[0]].hidden=!on;
    });
    var count=model && !model.error?model.tickets.length+state.drafts.length:null;
    tabButtons.tickets.querySelector('.links-tab-count').textContent=count==null?'':String(count);
    if(count==null)tabButtons.tickets.removeAttribute('aria-label');else tabButtons.tickets.setAttribute('aria-label','Tickets ('+count+')');
  }
  function say(text){status.textContent=text || '';}
  function fail(text){error.textContent=text || '';error.hidden=!text;}
  /* A refused key shows next to its own field (aria-invalid + describedby), as the Inspector does. */
  var fieldIds=0;
  function fieldError(input,text){
    var msg=input.nextElementSibling && input.nextElementSibling.classList.contains('links-field-error')?input.nextElementSibling:null;
    if(!text){input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');if(msg)msg.remove();return;}
    if(!msg){msg=el('span','links-field-error');msg.id=uid+'-field-'+(++fieldIds);msg.setAttribute('role','alert');input.after(msg);}
    msg.textContent=text;input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',msg.id);input.focus();
  }
  var KEY_HELP='Use a Jira key like HW-123 or an absolute http(s) Jira browse URL.';

  /* ---------- model ---------- */
  function snapshot(){return session.snapshot();}
  function context(){return session.topologyContext?session.topologyContext():null;}
  function ensureModel(){
    var s=snapshot();
    if(s.error){stale=true;model={error:'Fix the JSON source to see links.'};return model;}
    stale=s.renderedText!=null && s.renderedText!==s.text;
    var key=JSON.stringify([s.project,s.text,s.topologyRevision]);
    if(key!==modelKey){
      modelKey=key;modelRev++;dryRuns=Object.create(null);model=linksTicketModel(s.text,s.raw,context());
      // Lookups by element id and ticket key stay constant-time on large boards.
      byId=Object.create(null);byKey=Object.create(null);
      if(!model.error){model.elements.forEach(function(e){byId[linksElementId(e)]=e;});model.tickets.forEach(function(t){byKey[t.key]=t;});}
    }
    return model;
  }
  function element(id){return model && !model.error && byId[id] || null;}
  function sectionPrefix(e){return model.sections.length>1?'S'+(e.section+1)+' · ':'';}
  function kindName(e){return e.kind==='edge'?'connection':e.kind;}
  function describe(e){return kindName(e)+' '+e.label;}
  function ticketRow(key){return model && !model.error && byKey[key] || null;}
  function refOf(key){var row=ticketRow(key);if(row)return row.ref;var draft=state.drafts.find(function(d){return d.key===key;});return draft?draft.ref:key;}

  /* ---------- writes ---------- */
  function commit(planFor,done){
    fail('');
    var s=snapshot();if(s.error){fail(s.error);return false;}
    if(stale){fail('The source changed. Click Render before editing links.');return false;}
    var plan=planFor(s.text,s.raw,context());
    if(!plan || plan.error){fail(plan?plan.error:'That edit could not be made.');return false;}
    if(plan.text===s.text){if(done && done.same)say(done.same);return true;}
    var ok=opts.apply(plan,{editError:function(message){fail('This edit was not applied: '+message);}},s);
    if(ok && done && done.ok)say(done.ok);
    return ok;
  }
  function assign(link,key,remove){
    var e=link,ref=refOf(key);
    return commit(function(text,raw,ctx){return planLinksTicket(text,raw,e,key,ref,remove,ctx);},
      {ok:(remove?(e.kind==='step'?'Hid '+key+' on ':'Removed '+key+' from '):(e.kind==='step'?'Showing '+key+' on ':'Attached '+key+' to '))+describe(e)+'. Undo restores it.',
        same:key+(remove?' is not on ':' is already on ')+describe(e)+'.'});
  }
  function rename(from,value,key,merge){
    // Re-key a highlight on the old key before the edit renders, so it follows the rename.
    var lit=state.highlight && state.highlight.type==='ticket' && state.highlight.key===from;if(lit)state.highlight.key=key;
    var ok=commit(function(text,raw,ctx){return planLinksTicketRename(text,raw,from,value,ctx,merge);},{ok:(merge?'Merged '+from+' into ':'Renamed '+from+' to ')+key+' everywhere it is attached here. Undo restores it.'});
    if(!ok){if(lit && state.highlight)state.highlight.key=from;render();}
    var row=list.querySelector('[data-links-ticket="'+cssEscape(ok?key:from)+'"] .links-key');if(row)row.focus();
    return ok;
  }
  function move(from,to,key,copy){
    var ref=refOf(key);
    return commit(function(text,raw,ctx){return planLinksTicketMove(text,raw,from,to,key,ref,copy,ctx);},
      {ok:(from?(copy?'Copied ':'Moved ')+key+' from '+describe(from)+' to ':'Attached '+key+' to ')+describe(to)+'. Undo restores it.',same:key+' is already on '+describe(to)+'.'});
  }
  /* Why a ticket cannot go onto an element, or null: the static source and
     target rules, then a dry run of the same plan the drop would make. */
  /* Static rules only, for lists of many targets (Move to…, Copy to…). */
  function refusal(e,key,from,copy){return linksDropRefusal(from || null,e,key,!!copy);}
  /* The hovered drag target also gets a dry run of the real plan, once per
     target and model revision, so a drop never glows amber and then fails. */
  function dropRefusal(e,key,from,copy){
    var why=refusal(e,key,from,copy);if(why)return why;
    var memo=modelRev+'|'+(from?linksElementId(from):'')+'|'+linksElementId(e)+'|'+key+'|'+(copy?1:0);
    if(!(memo in dryRuns)){
      var s=snapshot();if(s.error)return s.error;
      var plan=planLinksTicketMove(s.text,s.raw,copy?null:from,e,key,refOf(key),false,context());
      dryRuns[memo]=plan.error || null;
    }
    return dryRuns[memo];
  }

  /* ---------- rows ---------- */
  function matches(text){var q=state.filter.trim().toLowerCase();return !q || q.split(/\s+/).every(function(term){return text.toLowerCase().indexOf(term)>=0;});}
  function chip(link,key,owner){
    // owner: the element the chip sits on (By ticket: the linked element; By element: the row).
    var e=element(linksElementId(owner)) || owner,inherited=link.inherited,wrap=el('span','links-chip links-chip-'+e.kind);
    wrap.setAttribute('data-links-chip',linksElementId(e));wrap.setAttribute('data-links-chip-ticket',key);wrap.setAttribute('role','listitem');
    if(inherited)wrap.classList.add('links-chip-inherited');
    var main=button('links-chip-main');
    var name=state.by==='ticket'?describe(e):key;
    main.setAttribute('aria-label',(state.by==='ticket'?'Highlight '+name+' ('+key+')':'Highlight '+key+' (on '+describe(e)+')'));
    main.setAttribute('aria-haspopup','menu');main.setAttribute('data-links-opener','chip:'+linksElementId(e)+'|'+key);
    main.title=(inherited?'Inherited from the provider (read only). ':!e.editable?e.reason+' ':'')+(!inherited && e.editable?'Click to highlight. Enter or right-click: Move to…, Copy to…, Remove. Drag to move; hold ⌥ to copy.':'Click to highlight. Enter or right-click: Copy to…. Drag to copy it elsewhere.')+(link.via && link.via.length?'\nShown through '+link.via.join(', ')+'.':'');
    if(state.by==='ticket'){var tag=el('span','links-kind',e.kind==='edge'?'EDGE':e.kind.toUpperCase());tag.setAttribute('aria-hidden','true');main.appendChild(tag);main.appendChild(el('span','links-chip-text',sectionPrefix(e)+e.label));}
    else main.appendChild(el('span','links-chip-text',key));
    if(e.imported && e.kind!=='step')main.appendChild(el('span','links-chip-note',inherited?'inherited':'imported · local override'));
    wrap.appendChild(main);
    rowsLife.listen(main,'click',function(){if(suppressClick){suppressClick=false;return;}chipHighlight(e,key);});
    rowsLife.listen(main,'keydown',function(ev){if(ev.key==='Enter' || ev.key==='ContextMenu' || ev.key==='F10' && ev.shiftKey){ev.preventDefault();openMenu(main,e,key,!movable);}});
    rowsLife.listen(main,'contextmenu',function(ev){ev.preventDefault();openMenu(main,e,key,!movable);});
    var movable=!inherited && e.editable;
    rowsLife.listen(main,'pointerdown',function(ev){startDrag(ev,main,key,movable?e:null,!movable);});
    if(!inherited && e.editable){
      var x=button('links-chip-remove','×',(e.kind==='step'?'Hide '+key+' on ':'Remove '+key+' from ')+describe(e),e.kind==='step'?'Hide on this step (writes the step ticket filter)':'Remove');
      rowsLife.listen(x,'click',function(){assign(e,key,true);});wrap.appendChild(x);
    }
    return wrap;
  }
  // A chip highlights what it names: the element in By ticket, the ticket in By element.
  function chipHighlight(e,key){setHighlight(state.by==='ticket'?{type:'element',id:linksElementId(e)}:{type:'ticket',key:key},true);}
  function assignButton(text,label,popover){
    var b=button('links-assign',text,label);b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-expanded','false');
    b.setAttribute('data-links-opener',popover.opener);
    rowsLife.listen(b,'click',function(){openPopover(popover,b);});
    return b;
  }
  function renderByTicket(){
    var rows=model.tickets.map(function(t){return t;}).concat(state.drafts.filter(function(d){return !ticketRow(d.key);}).map(function(d){return {key:d.key,ref:d.ref,links:[],draft:true};}));
    if(state.adding){
      var adder=el('div','links-row links-new-row');adder.setAttribute('role','listitem');
      var input=el('input','fctl links-new-input');input.setAttribute('aria-label','New ticket key');input.placeholder='HW-123 or https://…/browse/HW-123, then Enter';
      rowsLife.listen(input,'keydown',function(ev){
        if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();state.adding=false;render();addKey.focus();return;}
        if(ev.key!=='Enter')return;ev.preventDefault();
        var ticket=trackingTicket(input.value.trim());if(!ticket){fieldError(input,KEY_HELP);return;}
        fail('');state.adding=false;
        if(!ticketRow(ticket.key) && !state.drafts.some(function(d){return d.key===ticket.key;}))state.drafts.push({key:ticket.key,ref:ticket.url || ticket.key});
        render();say(ticket.key+' is ready. Drag it onto an element or use Assign.');
        var made=list.querySelector('[data-links-ticket="'+ticket.key+'"] .links-key');if(made)made.focus();
      });
      adder.appendChild(input);list.appendChild(adder);
    }
    var shown=0;
    rows.forEach(function(t){
      var text=[t.key].concat(t.links.map(function(l){return kindName(l)+' '+l.label;})).join(' ');
      if(!matches(text))return;shown++;
      var row=el('div','links-row links-ticket-row');row.setAttribute('role','listitem');row.setAttribute('data-links-ticket',t.key);
      var head=el('div','links-row-head');row.appendChild(head);
      var handle=button('links-handle','⠿','Drag '+t.key+' to a node, connection or step','Drag onto a canvas node or connection, a step coin or a Steps row to attach '+t.key+'. Enter opens Assign.');
      rowsLife.listen(handle,'pointerdown',function(ev){startDrag(ev,handle,t.key,null);});
      rowsLife.listen(handle,'keydown',function(ev){if(ev.key==='Enter' || ev.key===' '){ev.preventDefault();openPopover({type:'assign-ticket',key:t.key,opener:'assign:'+t.key},row.querySelector('.links-assign'));}});
      head.appendChild(handle);
      if(state.editing===t.key){
        var edit=el('input','fctl links-key-input');edit.value=t.key;edit.setAttribute('aria-label','New key for '+t.key);
        rowsLife.listen(edit,'keydown',function(ev){
          if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();state.editing=null;render();focusIn('[data-links-ticket="'+t.key+'"] .links-edit');return;}
          if(ev.key!=='Enter')return;ev.preventDefault();
          var value=edit.value.trim(),next=trackingTicket(value);
          if(!next){fieldError(edit,KEY_HELP);return;}
          if(t.draft){
            if(ticketRow(next.key) || state.drafts.some(function(x){return x.key===next.key && x.key!==t.key;})){fieldError(edit,next.key+' already exists.');return;}
            var d=state.drafts.find(function(x){return x.key===t.key;});d.key=next.key;d.ref=next.url || next.key;state.editing=null;render();return;
          }
          if(next.key!==t.key && ticketRow(next.key)){state.merge={from:t.key,to:value,key:next.key};state.editing=null;render();focusIn('[data-links-ticket="'+cssEscape(t.key)+'"] .links-merge-confirm');return;}
          state.editing=null;rename(t.key,value,next.key,false);
        });
        head.appendChild(edit);
        win.setTimeout(function(){if(edit.isConnected){edit.focus();edit.select();}},0);
      }else{
        var key=button('links-key',t.key,'Highlight '+t.key,'Highlight everything '+t.key+' is attached to');
        key.setAttribute('aria-pressed',String(!!state.highlight && state.highlight.type==='ticket' && state.highlight.key===t.key));
        rowsLife.listen(key,'click',function(){setHighlight(state.highlight && state.highlight.type==='ticket' && state.highlight.key===t.key?null:{type:'ticket',key:t.key},true);});
        head.appendChild(key);
      }
      if(state.merge && state.merge.from===t.key){
        var ask=el('div','links-merge');ask.setAttribute('role','group');ask.setAttribute('aria-label','Merge '+t.key+' into '+state.merge.key);
        ask.appendChild(el('span','links-merge-text',state.merge.key+' already exists. Merge '+t.key+' into it? Every element with '+t.key+' gets '+state.merge.key+' instead (one Undo step).'));
        var yes=button('bbtn links-merge-confirm','Merge into '+state.merge.key),no=button('bbtn links-merge-cancel','Cancel');
        rowsLife.listen(yes,'click',function(){var m=state.merge;state.merge=null;rename(m.from,m.to,m.key,true);});
        rowsLife.listen(no,'click',function(){state.merge=null;render();focusIn('[data-links-ticket="'+cssEscape(t.key)+'"] .links-edit');});
        rowsLife.listen(ask,'keydown',function(ev){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();no.click();}});
        ask.appendChild(yes);ask.appendChild(no);row.appendChild(ask);
      }
      head.appendChild(el('span','links-count',t.draft?'not attached yet':t.links.length+(t.links.length===1?' link':' links')));
      var editKey=button('bbtn links-edit','Edit key','Edit key '+t.key,'Rename '+t.key+' on every node and connection that carries it here (one Undo step)');
      rowsLife.listen(editKey,'click',function(){state.editing=t.key;render();});head.appendChild(editKey);
      var chips=el('div','links-chips');chips.setAttribute('role','list');chips.setAttribute('aria-label',t.key+' links');row.appendChild(chips);
      t.links.forEach(function(link){chips.appendChild(chip(link,t.key,link));});
      chips.appendChild(assignButton('+ Assign','Assign '+t.key,{type:'assign-ticket',key:t.key,opener:'assign:'+t.key}));
      if(state.highlight && state.highlight.type==='ticket' && state.highlight.key===t.key)row.classList.add('links-row-active');
      list.appendChild(row);
    });
    if(!shown && !state.adding)list.appendChild(el('p','links-empty',rows.length?'No ticket matches the filter.':'No tickets yet. Choose + New ticket key, or add one in Inspect → Tracking.'));
  }
  function renderByElement(){
    var groups=[['step','Steps'],['node','Nodes'],['edge','Connections']],shown=0;
    groups.forEach(function(group){
      if(state.show!=='all' && state.show!==group[0])return;
      var items=model.elements.filter(function(e){return e.kind===group[0];});if(!items.length)return;
      var imported=items.filter(function(e){return e.imported;}).length;
      var title=el('p','links-group',group[1]+' · '+items.length+(imported?' ('+imported+' imported)':''));title.setAttribute('role','presentation');list.appendChild(title);
      items.forEach(function(e){
        var keys=e.kind==='step'?e.shown:e.keys;
        if(!matches([kindName(e),e.label,e.caption || ''].concat(keys).join(' ')))return;shown++;
        var row=el('div','links-row links-element-row');row.setAttribute('role','listitem');row.setAttribute('data-links-element',linksElementId(e));
        var tag=el('span','links-kind',e.kind==='edge'?'EDGE':e.kind.toUpperCase());tag.setAttribute('aria-hidden','true');row.appendChild(tag);
        var name=button('links-element-name',sectionPrefix(e)+e.label,'Highlight '+describe(e),'Highlight this '+kindName(e)+' on the canvas'+(e.kind==='step'?' and in Steps':''));
        rowsLife.listen(name,'click',function(){setHighlight({type:'element',id:linksElementId(e)},true);});row.appendChild(name);
        if(e.imported)row.appendChild(el('span','links-chip-note','imported'));
        var chips=el('div','links-chips');chips.setAttribute('role','list');chips.setAttribute('aria-label','Tickets on '+describe(e));
        if(!keys.length)chips.appendChild(el('span','links-none',e.kind==='step'?'No tickets on what it lights':'No tickets'));
        keys.forEach(function(key){
          var link=ticketRow(key) && ticketRow(key).links.find(function(l){return linksElementId(l)===linksElementId(e);}) || {inherited:false,via:e.via && e.via[key]};
          chips.appendChild(chip(link,key,e));
        });
        if(e.editable && !(e.kind==='step' && !e.lit.length))chips.appendChild(assignButton('+ Assign ticket','Assign ticket to '+describe(e),{type:'assign-element',id:linksElementId(e),opener:'assign:'+linksElementId(e)}));
        else if(!e.editable)chips.appendChild(el('span','links-none',e.reason));
        row.appendChild(chips);
        if(e.unreadable && e.unreadable.length){var kept=el('p','links-none links-unrecognised','Not recognised, kept as written (fix in JSON): '+e.unreadable.join(', ')+'.');row.appendChild(kept);}
        if(state.highlight && state.highlight.type==='element' && state.highlight.id===linksElementId(e))row.classList.add('links-row-active');
        list.appendChild(row);
      });
    });
    if(!shown)list.appendChild(el('p','links-empty',state.filter?'Nothing matches the filter.':'This document has no nodes, connections or steps yet.'));
  }
  function render(){
    var focusKey=focusSignature();
    rowsLife.destroy();rowsLife=createWorkbenchLifetime();list.innerHTML='';
    ensureModel();if(!model.error)state.drafts=state.drafts.filter(function(d){return !ticketRow(d.key);});
    paintTabs();bySeg.paint(state.by);showSeg.paint(state.show);
    showSeg.el.hidden=state.by!=='element';addKey.hidden=state.by!=='ticket';
    if(model.error){list.appendChild(el('p','links-empty',model.error));applyHighlight();return;}
    if(stale)list.appendChild(el('p','links-empty links-stale','The source changed. Click Render to refresh links before editing.'));
    if(state.by==='ticket')renderByTicket();else renderByElement();
    applyHighlight();
    if(state.popover)paintPopover();
    restoreFocus(focusKey);
  }
  /* Rows are rebuilt on every source render; keep focus on the same control. */
  function focusSignature(){
    var a=doc.activeElement;if(!a || !root.contains(a) && !(popover && popover.contains(a)))return null;
    var c=a.closest('[data-links-chip]'),r=a.closest('[data-links-ticket],[data-links-element]'),o=a.closest('[data-links-option]');
    var rows=Array.prototype.slice.call(list.querySelectorAll('[data-links-ticket],[data-links-element]'));
    return {at:r?rows.indexOf(r):-1,cls:a.className,chip:c && c.getAttribute('data-links-chip')+'|'+c.getAttribute('data-links-chip-ticket'),row:r && (r.getAttribute('data-links-ticket') || r.getAttribute('data-links-element')),option:o && o.getAttribute('data-links-option'),inPopover:!!(popover && popover.contains(a))};
  }
  function restoreFocus(sig){
    if(!sig)return;var scope=sig.inPopover?popover:list,found=null;if(!scope)return;
    var cls=String(sig.cls || '').split(' ')[0];
    if(sig.option){var opt=scope.querySelector('[data-links-option="'+cssEscape(sig.option)+'"]');found=opt && (opt.matches('button')?opt:opt.querySelector('input'));}
    if(!found && sig.chip && cls){var parts=sig.chip.split('|');found=scope.querySelector('[data-links-chip="'+cssEscape(parts[0])+'"][data-links-chip-ticket="'+cssEscape(parts[1])+'"] .'+cls);}
    if(!found && sig.row){var row=scope.querySelector('[data-links-ticket="'+cssEscape(sig.row)+'"],[data-links-element="'+cssEscape(sig.row)+'"]');found=row && (cls && row.querySelector('.'+cls) || row.querySelector('button'));}
    // The row went away (its last link was removed): the next row, else the previous one, else the filter.
    if(!found && !sig.inPopover && sig.at>=0){
      var rows=list.querySelectorAll('[data-links-ticket],[data-links-element]'),near=rows[sig.at] || rows[sig.at-1];
      found=near?near.querySelector('.links-key,.links-element-name') || near.querySelector('button'):filter;
    }
    if(found && found!==doc.activeElement)found.focus({preventScroll:true});
  }
  function cssEscape(value){return String(value).replace(/["\\]/g,'\\$&');}
  function focusIn(selector){var n=list.querySelector(selector);if(n)n.focus();}
  // After a keyboard move, focus the ticket where it now is (By element) or its row (By ticket).
  function focusChip(e,key){
    var n=state.by==='element'?list.querySelector('[data-links-element="'+cssEscape(linksElementId(e))+'"] [data-links-chip-ticket="'+cssEscape(key)+'"] .links-chip-main'):list.querySelector('[data-links-ticket="'+cssEscape(key)+'"] [data-links-chip="'+cssEscape(linksElementId(e))+'"] .links-chip-main');
    if(n)n.focus();
  }

  /* ---------- popovers: Assign checklists, chip menu, Move to… ---------- */
  var popover=null;
  function openPopover(spec,opener){closePopover(false);state.popover=spec;state.popover.search='';paintPopover(true);if(opener)opener.setAttribute('aria-expanded','true');}
  function closePopover(focus){
    var spec=state.popover;state.popover=null;popLife.destroy();popLife=createWorkbenchLifetime();
    if(popover){popover.remove();popover=null;}
    if(spec){var opener=root.querySelector('[data-links-opener="'+cssEscape(spec.opener)+'"]');if(opener){opener.setAttribute('aria-expanded','false');if(focus)opener.focus();}}
  }
  function paintPopover(fresh){
    var spec=state.popover;if(!spec)return;
    var keep=!fresh && popover?{scroll:popover.querySelector('.links-pop-list') && popover.querySelector('.links-pop-list').scrollTop}:null;
    popLife.destroy();popLife=createWorkbenchLifetime();if(popover)popover.remove();
    var opener=root.querySelector('[data-links-opener="'+cssEscape(spec.opener)+'"]');
    if(!opener){state.popover=null;popover=null;return;}
    opener.setAttribute('aria-expanded','true');
    popover=el('div','links-popover');popover.setAttribute('role',spec.type==='menu'?'menu':'dialog');
    if(spec.type==='menu')return paintMenu(spec,opener);
    var e=spec.id?element(spec.id):null,from=spec.from?element(spec.from):null;
    if(spec.id && !e || spec.from && !from){state.popover=null;popover=null;return;}
    var title=spec.type==='assign-ticket'?'Assign '+spec.key:spec.type==='assign-element'?'Assign ticket to '+describe(e):(spec.copy?'Copy ':'Move ')+spec.key+' from '+describe(from);
    popover.setAttribute('aria-label',title);
    var head=el('div','links-pop-head');head.appendChild(el('strong',null,title));
    var close=button('links-pop-close','×','Close');popLife.listen(close,'click',function(){closePopover(true);});head.appendChild(close);popover.appendChild(head);
    var search=el('input','fctl links-pop-search');search.type='search';search.value=spec.search || '';
    search.setAttribute('aria-label',spec.type==='assign-element'?'Find or type a ticket key':'Find node, connection or step');
    search.placeholder=spec.type==='assign-element'?'Find a ticket, or type a new key and press Enter':'Find node, connection or step…';
    popLife.listen(search,'input',function(){spec.search=search.value;paintPopover();var s=popover && popover.querySelector('.links-pop-search');if(s){s.focus();s.setSelectionRange(s.value.length,s.value.length);}});
    popover.appendChild(search);
    var body=el('div','links-pop-list');popover.appendChild(body);
    var q=(spec.search || '').trim().toLowerCase();
    function section(name){var h=el('p','links-group',name);body.appendChild(h);}
    if(spec.type==='assign-element'){
      if(e.kind!=='step'){
        popLife.listen(search,'keydown',function(ev){
          if(ev.key!=='Enter')return;ev.preventDefault();var ticket=trackingTicket(search.value.trim());
          if(!ticket){fieldError(search,KEY_HELP);return;}
          if(!ticketRow(ticket.key) && !state.drafts.some(function(d){return d.key===ticket.key;}))state.drafts.push({key:ticket.key,ref:ticket.url || ticket.key});
          spec.search='';assign(e,ticket.key,false);
        });
      }
      var keys=e.kind==='step'?e.lit:model.tickets.map(function(t){return t.key;}).concat(state.drafts.map(function(d){return d.key;})).filter(function(k,i,all){return all.indexOf(k)===i;});
      section(e.kind==='step'?'Tickets on what this step lights':'Tickets');
      keys.filter(function(k){return !q || k.toLowerCase().indexOf(q)>=0;}).forEach(function(key){
        var on=e.kind==='step'?e.shown.indexOf(key)>=0:e.keys.indexOf(key)>=0,locked=e.kind!=='step' && e.inherited.indexOf(key)>=0;
        body.appendChild(option('ticket:'+key,key,on,locked?'Inherited from the provider (read only)':null,function(checked){assign(e,key,!checked);}));
      });
      if(!keys.length)body.appendChild(el('p','links-none',e.kind==='step'?'The nodes and connections this step lights carry no tickets.':'No tickets yet. Type a key above and press Enter.'));
    }else{
      var key=spec.key;
      [['node','Nodes'],['edge','Connections'],['step','Steps']].forEach(function(group){
        var items=model.elements.filter(function(x){return x.kind===group[0] && (!q || (x.label+' '+(x.caption || '')).toLowerCase().indexOf(q)>=0);});
        if(!items.length)return;section(group[1]);
        items.forEach(function(x){
          var id=linksElementId(x),note=x.imported?(x.kind==='step'?'':'imported'):'';
          if(spec.type==='assign-ticket'){
            var on=x.kind==='step'?x.shown.indexOf(key)>=0:x.keys.indexOf(key)>=0;
            var reason=!x.editable?x.reason:x.kind==='step' && x.lit.indexOf(key)<0?'Lights no node or connection with '+key:x.kind!=='step' && x.inherited.indexOf(key)>=0?'Inherited from the provider (read only)':null;
            body.appendChild(option(id,sectionPrefix(x)+x.label,on,reason,function(checked){assign(x,key,!checked);},note));
          }else{
            var why=refusal(x,key,from,spec.copy),pick=button('links-pop-target',sectionPrefix(x)+x.label);pick.setAttribute('data-links-option',id);
            if(why){pick.disabled=true;pick.title=why;}
            popLife.listen(pick,'click',function(){var source=from,copy=spec.copy;closePopover(false);if(move(copy?null:source,x,key,false))focusChip(x,key);});
            var line=el('div','links-pop-row');line.appendChild(pick);if(note)line.appendChild(el('span','links-chip-note',note));body.appendChild(line);
          }
        });
      });
    }
    var hint=el('p','links-pop-hint',spec.type==='move'?'↑↓ move · Enter picks · Esc closes · one Undo step':'↑↓ move · Space ticks or unticks · Esc closes · each tick is one Undo step');popover.appendChild(hint);
    popLife.listen(popover,'keydown',popKeys);
    place(opener);
    if(keep && popover.querySelector('.links-pop-list'))popover.querySelector('.links-pop-list').scrollTop=keep.scroll || 0;
    if(fresh)search.focus();
  }
  function option(id,label,checked,reason,onChange,note){
    var line=el('div','links-pop-row');line.setAttribute('data-links-option',id);
    var lab=el('label','links-pop-option'),box=el('input');box.type='checkbox';box.checked=!!checked;
    if(reason){box.disabled=true;lab.title=reason;}
    popLife.listen(box,'change',function(){if(!onChange(box.checked))box.checked=!box.checked;});
    lab.appendChild(box);lab.appendChild(el('span',null,label));line.appendChild(lab);
    if(note)line.appendChild(el('span','links-chip-note',note));
    if(reason)line.appendChild(el('span','links-pop-reason',reason));
    return line;
  }
  function paintMenu(spec,opener){
    var e=element(spec.id);
    popover.setAttribute('aria-label',spec.key+' on '+describe(e));
    var items=[['Highlight',function(){closePopover(false);if(e)chipHighlight(e,spec.key);}]];
    if(!spec.inherited)items.push(['Move to…',function(){openPopover({type:'move',key:spec.key,from:spec.id,copy:false,opener:spec.opener},opener);}]);
    items.push(['Copy to…',function(){openPopover({type:'move',key:spec.key,from:spec.id,copy:true,opener:spec.opener},opener);}]);
    if(!spec.inherited)items.push([e.kind==='step'?'Hide on this step':'Remove',function(){closePopover(false);assign(e,spec.key,true);}]);
    items.forEach(function(item){var b=button('links-menu-item',item[0]);b.setAttribute('role','menuitem');popLife.listen(b,'click',item[1]);popover.appendChild(b);});
    popLife.listen(popover,'keydown',popKeys);
    place(opener);
    var first=popover.querySelector('[role="menuitem"]');if(first)first.focus();
  }
  function openMenu(main,e,key,inherited){
    main.setAttribute('data-links-opener','chip:'+linksElementId(e)+'|'+key);
    openPopover({type:'menu',id:linksElementId(e),key:key,inherited:inherited,opener:'chip:'+linksElementId(e)+'|'+key},main);
  }
  function popKeys(ev){
    if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();closePopover(true);return;}
    if(ev.key!=='ArrowDown' && ev.key!=='ArrowUp')return;
    var items=Array.from(popover.querySelectorAll('input:not([disabled]),[role="menuitem"],.links-pop-target:not([disabled])'));if(!items.length)return;
    ev.preventDefault();var at=items.indexOf(doc.activeElement),next=ev.key==='ArrowDown'?at+1:at-1;
    items[(next+items.length)%items.length].focus();
  }
  function place(opener){
    var host=root.closest('.workspace-window') || root;host.appendChild(popover);
    var h=host.getBoundingClientRect(),o=opener.getBoundingClientRect();
    var top=o.bottom-h.top+4,left=Math.max(8,Math.min(o.left-h.left,h.width-popover.offsetWidth-8));
    if(top+popover.offsetHeight>h.height-8)top=Math.max(8,o.top-h.top-popover.offsetHeight-4);
    popover.style.top=top+'px';popover.style.left=left+'px';
  }
  life.listen(doc,'pointerdown',function(ev){if(popover && !popover.contains(ev.target) && !(ev.target.closest && ev.target.closest('[data-links-opener]')))closePopover(false);},true);

  /* ---------- highlight ---------- */
  function highlightLinks(){
    var h=state.highlight;if(!h || !model || model.error)return [];
    if(h.type==='ticket'){var row=ticketRow(h.key);return row?row.links:[];}
    var e=element(h.id);return e?[e]:[];
  }
  function sectionEl(section){return view && view.querySelector('.doc-sec[data-dv-section="'+section+'"]');}
  function litTargets(links){
    var out=[];
    links.forEach(function(l){
      var sec=sectionEl(l.section);if(!sec)return;
      var sel=l.kind==='node'?'[data-dv-node="'+cssEscape(l.id)+'"]':l.kind==='edge'?'[data-dv-edge="'+l.index+'"]':'[data-dv-step="'+l.index+'"],.schips [data-step-source="'+l.index+'"]';
      Array.prototype.forEach.call(sec.querySelectorAll(sel),function(n){out.push(n);});
    });
    var steps=doc.getElementById('steps-list'),pick=doc.getElementById('steps-section');
    if(steps)links.forEach(function(l){if(l.kind==='step' && pick && Number(pick.value)===l.section)Array.prototype.forEach.call(steps.querySelectorAll('[data-step-index="'+l.index+'"]'),function(n){out.push(n);});});
    return out;
  }
  /* On-canvas note while a highlight dims the board, so the dimming always has
     a visible reason and a way out, even with the Links window closed. */
  var pill=el('div','links-canvas-pill');pill.setAttribute('role','status');pill.hidden=true;
  var pillText=el('span','links-canvas-pill-text');pill.appendChild(pillText);
  var pillClear=button('bbtn links-canvas-pill-clear','Clear (Esc)','Clear link highlight');pill.appendChild(pillClear);
  life.listen(pillClear,'click',function(){setHighlight(null);});
  (doc.body || root).appendChild(pill);life.own(function(){pill.remove();});
  function paintPill(links){
    pill.hidden=!state.highlight;if(!state.highlight)return;
    pillText.textContent=summary(links).replace(/\. Others dim\. Esc clears\.$/,'');
    var controls=doc.getElementById('workspace-canvas-controls'),r=controls && controls.getClientRects().length?controls.getBoundingClientRect():null;
    pill.style.bottom=(r?Math.max(12,win.innerHeight-r.top+8):24)+'px';
  }
  function applyHighlight(){
    Array.prototype.forEach.call(doc.querySelectorAll('.dv-links-lit'),function(n){n.classList.remove('dv-links-lit');});
    Array.prototype.forEach.call(doc.querySelectorAll('.dv-links-dimming'),function(n){n.classList.remove('dv-links-dimming');});
    var links=highlightLinks();clear.hidden=!state.highlight;paintPill(links);
    if(!state.highlight){return;}
    links.forEach(function(l){var sec=sectionEl(l.section);if(sec)sec.classList.add('dv-links-dimming');});
    litTargets(links).forEach(function(n){n.classList.add('dv-links-lit');});
    if(!state.drag)say(summary(links));
  }
  function summary(links){
    var h=state.highlight,counts={node:0,edge:0,step:0};links.forEach(function(l){counts[l.kind]++;});
    var parts=[];if(counts.node)parts.push(counts.node+(counts.node===1?' node':' nodes'));if(counts.edge)parts.push(counts.edge+(counts.edge===1?' connection':' connections'));if(counts.step)parts.push(counts.step+(counts.step===1?' step':' steps'));
    var name=h.type==='ticket'?h.key:(element(h.id)?describe(element(h.id)):'');
    return 'Highlighting '+name+(h.type==='ticket'?' · '+(parts.join(' · ') || 'nothing attached'):'')+'. Others dim. Esc clears.';
  }
  function setHighlight(value,reveal){
    state.highlight=value;
    Array.prototype.forEach.call(list.querySelectorAll('.links-row-active'),function(n){n.classList.remove('links-row-active');});
    Array.prototype.forEach.call(list.querySelectorAll('.links-key[aria-pressed]'),function(n){n.setAttribute('aria-pressed',String(!!value && value.type==='ticket' && n.textContent===value.key));});
    if(value){var row=list.querySelector(value.type==='ticket'?'[data-links-ticket="'+cssEscape(value.key)+'"]':'[data-links-element="'+cssEscape(value.id)+'"]');if(row)row.classList.add('links-row-active');}
    applyHighlight();
    if(!value)say('');
    if(value && reveal)revealLinks();
  }
  /* Bring the highlighted canvas elements into view only when one is hidden
     (off the board or under a tool window); the Steps row scrolls to nearest. */
  function revealLinks(){
    var links=highlightLinks(),targets=litTargets(links);
    var rows=targets.filter(function(n){return n.closest('#steps-list');});if(rows[0])rows[0].scrollIntoView({block:'nearest'});
    var canvas=targets.filter(function(n){return n.ownerSVGElement && n.getClientRects().length;});if(!canvas.length)return;
    var sec=canvas[0].closest('.doc-sec[data-dv-section]'),section=Number(sec.getAttribute('data-dv-section'));
    canvas=canvas.filter(function(n){return n.closest('.doc-sec')===sec;});
    var board=sec.querySelector('.explore-board') || sec,b=board.getBoundingClientRect();
    var windows=Array.prototype.filter.call(doc.querySelectorAll('.workspace-window:not([hidden])'),function(w){return w.getClientRects().length;}).map(function(w){return w.getBoundingClientRect();});
    var hidden=canvas.some(function(n){
      var r=n.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
      if(cx<b.left || cx>b.right || cy<b.top || cy>b.bottom)return true;
      return windows.some(function(w){return cx>=w.left && cx<=w.right && cy>=w.top && cy<=w.bottom;});
    });
    if(!hidden)return;
    var svg=sec.querySelector('.boardcanvas > svg'),matrix=svg && svg.getScreenCTM && svg.getScreenCTM();if(!matrix)return;
    var inverse=matrix.inverse(),pts=[];
    canvas.forEach(function(n){var r=(n.querySelector && n.querySelector('.card') || n).getBoundingClientRect();[[r.left,r.top],[r.right,r.bottom]].forEach(function(p){pts.push(new win.DOMPoint(p[0],p[1]).matrixTransform(inverse));});});
    var x=Math.min.apply(null,pts.map(function(p){return p.x;})),y=Math.min.apply(null,pts.map(function(p){return p.y;}));
    var w=Math.max.apply(null,pts.map(function(p){return p.x;}))-x,h=Math.max.apply(null,pts.map(function(p){return p.y;}))-y;
    // Pad a small extent so a single node is framed with context instead of zoomed in.
    var pw=Math.max(0,480-w)/2,ph=Math.max(0,320-h)/2;
    view.dispatchEvent(new win.CustomEvent('workbench-fit-selection',{detail:{section:section,x:x-pw,y:y-ph,w:w+2*pw,h:h+2*ph}}));
  }
  var stepsList=doc.getElementById('steps-list');
  if(stepsList && typeof win.MutationObserver==='function'){
    var observer=new win.MutationObserver(function(){if(state.highlight)applyHighlight();});
    observer.observe(stepsList,{childList:true});life.own(function(){observer.disconnect();});
  }

  /* ---------- drag ---------- */
  function startDrag(ev,source,key,from,copyOnly){
    if(ev.button!==0 || !ev.isPrimary || state.drag)return;
    if(stale){fail('The source changed. Click Render before editing links.');return;}
    state.drag={id:ev.pointerId,source:source,key:key,from:from,x:ev.clientX,y:ev.clientY,active:false,target:null,copy:!!ev.altKey,copyOnly:!!copyOnly,ghost:null,marked:[]};
    try{source.setPointerCapture(ev.pointerId);}catch(_){}
    var d=state.drag;
    d.off=[life.listen(source,'pointermove',dragMove),life.listen(source,'pointerup',dragEnd),life.listen(source,'pointercancel',function(){cancelDrag('Drag cancelled.');}),
      life.listen(source,'lostpointercapture',function(){if(state.drag===d)cancelDrag(d.active?'Drag cancelled.':null);})];
  }
  function dragMove(ev){
    var d=state.drag;if(!d || ev.pointerId!==d.id)return;
    if(!d.active){
      if(Math.abs(ev.clientX-d.x)+Math.abs(ev.clientY-d.y)<5)return;
      d.active=true;fail('');doc.body.classList.add('links-dragging');
      d.ghost=el('div','links-ghost',d.key);d.ghost.setAttribute('aria-hidden','true');doc.body.appendChild(d.ghost);
      if(d.source.closest('.links-chip'))d.source.closest('.links-chip').classList.add('links-chip-dragging');
    }
    ev.preventDefault();d.copy=!!ev.altKey || d.copyOnly;
    d.ghost.style.left=(ev.clientX+12)+'px';d.ghost.style.top=(ev.clientY+10)+'px';
    d.last={x:ev.clientX,y:ev.clientY};d.target=dropTarget(ev.clientX,ev.clientY);paintDrop();
  }
  /* The Links window must not hide its own drop targets: over the window but not
     over one of its By element rows, look through it to the Steps list or canvas
     below, and fade the window so the glowing target shows. */
  function dropTarget(x,y){
    var hits=doc.elementsFromPoint?doc.elementsFromPoint(x,y):[doc.elementFromPoint(x,y)],host=root.closest('.workspace-window') || root;
    var top=hits[0];if(!top)return null;
    var row=top.closest && top.closest('[data-links-element]');
    if(row && root.contains(row)){seeThrough(false);return {element:element(row.getAttribute('data-links-element')),marks:[row]};}
    var hit=hits.find(function(n){return n && !host.contains(n) && !(state.drag && state.drag.ghost && state.drag.ghost.contains(n));});
    var under=!!(host.contains(top) && hit),found=hit?targetAt(hit):null;
    // Over the list itself, look through only after a short hover on the same
    // target, so a release over the rows does not land on the canvas behind them.
    if(under && found && state.drag && list.contains(top)){
      var id=linksElementId(found.element || {kind:'none',section:0,index:0}),d=state.drag,now=Date.now();
      if(!d.peek || d.peek.id!==id){
        d.peek={id:id,since:now};if(d.peekTimer)win.clearTimeout(d.peekTimer);
        d.peekTimer=win.setTimeout(function(){if(state.drag===d && d.last){d.target=dropTarget(d.last.x,d.last.y);paintDrop();}},PEEK_MS+20);
      }
      if(now-d.peek.since<PEEK_MS){seeThrough(false);return null;}
    }else if(state.drag)state.drag.peek=null;
    seeThrough(under && !!found);return found;
  }
  var PEEK_MS=450;
  function seeThrough(on){var host=root.closest('.workspace-window');if(host)host.classList.toggle('links-see-through',!!on);}
  function targetAt(hit){
    var stepRow=hit.closest('#steps-list [data-step-index]'),pick=doc.getElementById('steps-section');
    if(stepRow && pick){var st=element('step:'+Number(pick.value)+':'+stepRow.getAttribute('data-step-index'));return {element:st,marks:[stepRow].concat(st?litTargets([st]).filter(function(n){return n!==stepRow;}):[])};}
    if(!view || !view.contains(hit) || root.contains(hit))return null;
    var sec=hit.closest('.doc-sec[data-dv-section]');if(!sec)return null;
    var s=Number(sec.getAttribute('data-dv-section')),n;
    if((n=hit.closest('[data-dv-step]')))return markFor(element('step:'+s+':'+n.getAttribute('data-dv-step')));
    if((n=hit.closest('[data-dv-node]')))return markFor(element('node:'+s+':'+n.getAttribute('data-dv-node')));
    if((n=hit.closest('[data-dv-edge]')))return markFor(element('edge:'+s+':'+n.getAttribute('data-dv-edge')));
    return null;
  }
  function markFor(e){return e?{element:e,marks:litTargets([e]).concat(listRowFor(e))}:null;}
  function listRowFor(e){var r=list.querySelector('[data-links-element="'+cssEscape(linksElementId(e))+'"]');return r?[r]:[];}
  function paintDrop(){
    var d=state.drag;d.marked.forEach(function(n){n.classList.remove('dv-links-drop','dv-links-refused');});d.marked=[];
    if(!d.target){say(d.from?'Dragging '+d.key+' from '+describe(d.from)+'. Drop on a node, connection, step or row. Esc cancels.':'Dragging '+d.key+'. Drop on a node, connection or step. Esc cancels.');return;}
    var why=dropRefusal(d.target.element,d.key,d.from,d.copy);
    d.target.marks.forEach(function(n){n.classList.add(why?'dv-links-refused':'dv-links-drop');d.marked.push(n);});
    var verb=d.from && !d.copyOnly?(d.copy?'copy':'move'):'attach';
    say(why?'Cannot drop here: '+why:'Drop to '+verb+' '+d.key+(d.from && !d.copy?' from '+describe(d.from):'')+' to '+describe(d.target.element)+(d.from && !d.copy?' · hold ⌥ to copy':'')+'.');
  }
  function endDrag(){
    var d=state.drag;if(!d)return null;state.drag=null;seeThrough(false);if(d.peekTimer)win.clearTimeout(d.peekTimer);
    (d.off || []).forEach(function(off){off();});
    try{if(d.source.hasPointerCapture && d.source.hasPointerCapture(d.id))d.source.releasePointerCapture(d.id);}catch(_){}
    d.marked.forEach(function(n){n.classList.remove('dv-links-drop','dv-links-refused');});
    if(d.ghost)d.ghost.remove();doc.body.classList.remove('links-dragging');
    var chipEl=d.source.closest && d.source.closest('.links-chip');if(chipEl)chipEl.classList.remove('links-chip-dragging');
    return d;
  }
  function dragEnd(ev){
    var d=state.drag;if(!d || ev.pointerId!==d.id)return;
    if(!d.active){endDrag();return;}
    d.copy=!!ev.altKey || d.copyOnly;d.target=dropTarget(ev.clientX,ev.clientY);
    endDrag();suppressClick=true;win.setTimeout(function(){suppressClick=false;},0);
    if(!d.target){say('Nothing changed: drop on a node, connection or step.');return;}
    var why=dropRefusal(d.target.element,d.key,d.from,d.copy);
    if(why){fail(why);say('');return;}
    move(d.copy?null:d.from,d.target.element,d.key,false);
  }
  function cancelDrag(message){if(!state.drag)return;endDrag();if(message)say(message);applyHighlight();}
  life.listen(win,'keydown',function(ev){
    if(state.drag && ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancelDrag('Drag cancelled. Nothing changed.');return;}
    if(state.drag && ev.key==='Alt' && state.drag.active){state.drag.copy=true;paintDrop();}
  },true);
  life.listen(win,'keyup',function(ev){if(state.drag && ev.key==='Alt' && state.drag.active){state.drag.copy=state.drag.copyOnly;paintDrop();}},true);
  life.listen(win,'blur',function(){cancelDrag(null);});

  /* ---------- keyboard ---------- */
  life.listen(root,'keydown',function(ev){
    if(ev.key!=='Escape')return;
    if(state.popover){ev.preventDefault();closePopover(true);return;}
    if(state.highlight){ev.preventDefault();ev.stopPropagation();setHighlight(null);say('Highlight cleared.');}
  });
  // Esc on the canvas clears the highlight once nothing else used that Esc
  // (a canvas drag, a menu, add-to-step); fields, dialogs and menus keep their own.
  life.listen(doc,'keydown',function(ev){
    if(ev.key!=='Escape' || ev.defaultPrevented || !state.highlight || root.contains(ev.target) || state.drag)return;
    if(ev.target.isContentEditable || ev.target.closest && ev.target.closest('input,textarea,select,[role="dialog"],[role="menu"],dialog'))return;
    setHighlight(null);
  });

  function shown(){var host=root.closest('.workspace-window');return !host || !host.hidden;}
  function refresh(){
    // Closed, the window keeps no work: the next open rebuilds from the source.
    if(!shown())return;
    ensureModel();
    var h=state.highlight;
    // A highlighted element or ticket that no longer exists (deleted, renamed, undone) ends the highlight.
    if(h && !model.error && (h.type==='element'?!element(h.id):!ticketRow(h.key) && !state.drafts.some(function(d){return d.key===h.key;}))){state.highlight=null;say('');}
    render();
  }
  life.listen(doc,'workbench-tool-visibility',function(ev){
    if(!ev.detail || ev.detail.name!=='links')return;
    var was=visible;visible=!!ev.detail.open;
    if(visible){if(!was)refresh();return;}
    // Closing (or hiding) the Links window ends its highlight and any drag or popover.
    else{cancelDrag(null);closePopover(false);if(state.highlight)setHighlight(null);}
  });
  visible=shown();paintTabs();render();
  return {refresh:life.guard(refresh),
    highlight:function(){return state.highlight?JSON.parse(JSON.stringify(state.highlight)):null;},
    destroy:function(){cancelDrag(null);closePopover(false);state.highlight=null;applyHighlight();life.destroy();root.innerHTML='';}};
}

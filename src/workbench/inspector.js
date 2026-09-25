/* Instance-owned form DOM, panel editor cache and deferred refresh. Commands and
   read models remain shared leaves; source/history publication belongs to session. */
function createBuilderInspector(opts){
  var document=opts.document,guide=opts.guide,session=opts.session,modes=opts.modes;
  var panelEditors=Object.create(null),inspectorScrollKey=null,invalidateEffectiveState=null,invalidateExtraction=null;
  var OPEN_VOCABULARY=new Set(),OPEN_INITIAL_EDITORS=new Map(),OPEN_PATCH_EDITORS=new Set(),CUSTOM_PANEL_FOLDS=new Map(),OPEN_EFFECTIVE_STATE=false,OPEN_EFFECTIVE_PANELS=new Set();
  var disposed=false,refreshTimer=null,refreshVersion=0,formLife=createWorkbenchLifetime();
  var proseDraft={key:null,url:''};
  function listen(target,type,fn,options){return formLife.listen(target,type,fn,options);}
  function retireForm(){formLife.destroy();formLife=createWorkbenchLifetime();invalidateExtraction=null;}
  var prefix='dv-inspector-'+Math.random().toString(36).slice(2);
  var accentListId=prefix+'-accents',groupListId=prefix+'-groups';
  function parseEditor(){return session.snapshot();}
  function applyPlan(plan,options,snapshot){return !disposed && opts.apply(plan,options,snapshot);}
  function selectRange(range,force){if(!disposed)return opts.selection.range(range,force);}
  function selectTarget(target,focus,keepTool){if(!disposed)return opts.selection.select(target,focus,keepTool);}
  function rehighlight(){if(!disposed)return opts.selection.rehighlight();}
  function stepperFor(section){return disposed?null:opts.preview.stepper(section);}
  function findTargetEl(target){return opts.preview.targetElement(target);}
  function revealInspector(){opts.surface.reveal();}
  function hideDiff(){opts.surface.hideDiff();}
  function clipboard(){return disposed?null:opts.clipboard.current();}
  function targetIdentity(){
    var t=session.target;
    return t?JSON.stringify([session.snapshot().project,t.kind,t.section,t.id,t.index,t.bulletPath,t.card,t.block,t.tab,t.pathId]):null;
  }
  function multiIdentity(targets){
    return JSON.stringify([session.snapshot().project,targets.map(function(t){
      return JSON.stringify([t.kind,t.section,t.id,t.index,t.bulletPath,t.card,t.block,t.tab,t.pathId]);
    }).sort()]);
  }
  function beginForm(identity){
    var same=identity===inspectorScrollKey;
    var previous={focus:same?captureFocus():null,scroll:same?guide.scrollTop:0};
    retireForm();
    inspectorScrollKey=identity;invalidateEffectiveState=null;
    revealInspector();guide.hidden=false;guide.innerHTML='';
    return previous;
  }
  function finishForm(previous){
    assignControlKeys();restoreFocus(previous.focus);guide.scrollTop=previous.scroll;
  }
  function cancelRefresh(){
    refreshVersion++;
    if(refreshTimer!=null)opts.cancel(refreshTimer);
    refreshTimer=null;
  }
  function assignControlKeys(){
    var counts=Object.create(null);
    Array.prototype.forEach.call(guide.querySelectorAll('input,textarea,select'),function(control){
      var row=control.closest('.frow'),label=row && row.querySelector('.flab');
      var name=JSON.stringify([label?label.textContent:'',control.getAttribute('aria-label'),
        control.getAttribute('placeholder'),control.tagName,control.type || '']);
      var index=counts[name] || 0;counts[name]=index+1;
      control.setAttribute('data-inspector-control',name+':'+index);
    });
  }
  function captureFocus(){
    var active=document.activeElement;
    if(!active || !guide.contains(active) || !active.getAttribute)return null;
    var key=active.getAttribute('data-inspector-control');
    return key?{key:key,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,
      scrollTop:active.scrollTop,scrollLeft:active.scrollLeft}:null;
  }
  function restoreFocus(saved){
    if(!saved)return;
    var found=null;
    Array.prototype.forEach.call(guide.querySelectorAll('[data-inspector-control]'),function(control){
      if(control.getAttribute('data-inspector-control')===saved.key)found=control;
    });
    if(!found)return;
    found.focus({preventScroll:true});
    if(typeof saved.start==='number' && found.setSelectionRange){
      try{found.setSelectionRange(saved.start,saved.end,saved.direction);}catch(ex){/* select/number controls have no text caret */}
    }
    found.scrollTop=saved.scrollTop;found.scrollLeft=saved.scrollLeft;
  }
  function retire(){cancelRefresh();retireForm();invalidateEffectiveState=null;inspectorScrollKey=null;opts.surface.retire();}

function flashPositionLine(){
    /* one background pulse on the "step 2 of 3" line — the visible proof
       that a move happened when the form fields themselves look the same */
    var pos = guide && guide.querySelector('.gpos');
    if (!pos) return;
    pos.classList.remove('gposflash');
    void pos.offsetWidth; /* restart the animation */
    pos.classList.add('gposflash');
  }

/* ================= inspector: forms that write the JSON ================= */

  function inspectorMessage(text, keepTool){
    if(disposed)return;
    cancelRefresh();retireForm();
    if (!guide) return;
    opts.surface.show(keepTool);
    revealInspector();
    guide.hidden = false;
    guide.innerHTML = '';
    var n = document.createElement('div');
    n.className = 'gerr'; n.textContent = text;
    guide.appendChild(n);
  }

function formError(text){
    if(disposed)return;
    var slot = guide && guide.querySelector('.ierr');
    if (!slot){ if (text) inspectorMessage(text); return; }
    slot.textContent = text || '';
    slot.hidden = !text;
  }

function commitSimple(key, valueTextOrNull){
    if(disposed)return false;
    var parsed = parseEditor();
    if (parsed.error){ formError(parsed.error); return false; }
    var path = builderTargetPath(parsed.raw, session.target);
    if (!path){ formError('element not found — click Render, then reselect'); return false; }
    return applyPlan(planSetField(parsed.text, parsed.raw, path, key, valueTextOrNull),null,parsed);
  }

function commitCascade(planFor, opt){
    if(disposed)return false;
    var parsed = parseEditor();
    if (parsed.error){ formError(parsed.error); return false; }
    return applyPlan(planFor(parsed.raw), opt, parsed);
  }

function commitValue(valueText){
    /* replace the selected element's WHOLE value (bullet string, paragraph) */
    var parsed = parseEditor();
    if (parsed.error){ formError(parsed.error); return false; }
    var path = builderTargetPath(parsed.raw, session.target);
    if (!path){ formError('element not found — click Render, then reselect'); return false; }
    return applyPlan(planReplaceValue(session.text(), parsed.raw, path, valueText));
  }

/* ---- form controls ---- */
  function frow(labelText, control){
    var row = document.createElement('label');
    row.className = 'frow';
    var lab = document.createElement('span');
    lab.className = 'flab'; lab.textContent = labelText;
    row.appendChild(lab); row.appendChild(control);
    return row;
  }

function commitOnChange(input,getCommitValue,commit,commitUnchanged){
    return wireBuilderCommit(input,function(){return commit(getCommitValue?getCommitValue(input.value):input.value);},
      {commitUnchanged:commitUnchanged,listen:listen});
  }
  function textControl(value, commit, opts){
    var input = document.createElement(opts && opts.textarea ? 'textarea' : 'input');
    if (!opts || !opts.textarea) input.type = 'text';
    input.className = 'fctl';
    if (opts && opts.placeholder) input.placeholder = opts.placeholder;
    if (opts && opts.list) input.setAttribute('list', opts.list);
    input.value = value == null ? '' : String(value);
    /* empty commits as removal unless the field is required */
    commitOnChange(input, null, function(v){
      var trimmed = v.trim();
      if (!trimmed && opts && opts.required){ formError(opts.required); return false; }
      return commit(trimmed === '' ? null : trimmed);
    }, opts && opts.commitUnchanged);
    return input;
  }

function numberControl(value, commit){
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'fctl fnum';
    input.value = value == null ? '' : String(value);
    commitOnChange(input, null, function(v){
      var trimmed = v.trim();
      if (trimmed === '') return commit(null);
      var num = Number(trimmed);
      if (!isFinite(num)){ formError('"' + trimmed + '" is not a number'); return false; }
      return commit(num);
    });
    return input;
  }

function selectControl(options, current, commit, allowEmpty){
    var sel = document.createElement('select');
    sel.className = 'fctl';
    if (allowEmpty){
      var none = document.createElement('option');
      none.value = ''; none.textContent = '(none)';
      sel.appendChild(none);
    }
    var seen = false;
    options.forEach(function(o){
      var op = document.createElement('option');
      op.value = o; op.textContent = o;
      if (o === current) seen = true;
      sel.appendChild(op);
    });
    if (current != null && current !== '' && !seen){
      var extra = document.createElement('option');
      extra.value = current; extra.textContent = current + ' (unknown)';
      sel.appendChild(extra);
    }
    sel.value = current == null ? '' : String(current);
    commitOnChange(sel, null, function(v){ return commit(v === '' ? null : v); });
    return sel;
  }

function checkboxControl(checked, commit){
    var wrap = document.createElement('span');
    wrap.className = 'fctl fchk';
    var input = document.createElement('input');
    input.type = 'checkbox'; input.checked = !!checked;
    formLife.listen(input,'change', function(){
      if (commit(input.checked) === false) input.checked = !input.checked;
    });
    wrap.appendChild(input);
    return wrap;
  }

function actionButton(label, onClick, cls){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'bbtn ' + (cls || '');
    b.textContent = label;
    formLife.listen(b,'click', function(ev){if(!disposed)return onClick.call(this,ev);});
    return b;
  }

function ensureAccentDatalist(){
    if (guide.querySelector('#'+accentListId)) return;
    var dl = document.createElement('datalist');
    dl.id = accentListId;
    Object.keys(ACCENTS).forEach(function(name){
      var op = document.createElement('option');
      op.value = name; dl.appendChild(op);
    });
    guide.appendChild(dl);
  }

function ensureGroupDatalist(diagrams){
    var dl = guide.querySelector('#'+groupListId);
    if (!dl){
      dl = document.createElement('datalist'); dl.id = groupListId;
      guide.appendChild(dl);
    }
    dl.innerHTML = '';
    var seen = Object.create(null);
    diagrams.forEach(function(d){
      Object.keys((d && d.groups) || {}).forEach(function(key){
        if (seen[key]) return;
        seen[key] = true;
        var op = document.createElement('option');
        op.value = key; dl.appendChild(op);
      });
    });
  }

function commitGroup(planFor, opt){
    if (modes.adding()){
      formError('finish ADD TO STEP first (DONE or Esc) — this control is paused while the mode is armed');
      return false;
    }
    return commitCascade(planFor, opt);
  }

function groupControl(value, commit, opts){
    var input = textControl(value, commit, Object.assign({list: groupListId}, opts || {}));
    input.classList.add('groupctl');
    return input;
  }

function groupForm(val, ctx){
    var t = session.target;
    var members = Object.keys((ctx.diagram && ctx.diagram.nodes) || {}).filter(function(id){
      return ctx.diagram.nodes[id] && ctx.diagram.nodes[id].group === t.id;
    });
    var memberRow = chipRow('members', members.map(function(id){ return {key: id, label: id}; }),
      'no members — select nodes and set their group', function(id){
        return commitGroup(function(raw){ return planSetNodeGroup(session.text(), raw, t.section, id, null); },
          {after: function(){ renderInspector(); }});
      }, null, 'group');
    memberRow.classList.add('groupctl');
    var parentOptions = builderGroupParentOptions(ctx.diagram && ctx.diagram.groups, t.id);
    var parentControl = selectControl(parentOptions, parentOptions.indexOf(val.parent) >= 0 ? val.parent : '', function(v){
      return commitGroup(function(raw){ return planSetGroupParent(session.text(), raw, t.section, t.id, v); },
        {after: function(){ renderInspector(); }});
    }, true);
    parentControl.firstChild.textContent = 'top-level';
    return [
      frow('key', groupControl(t.id, function(v){
        return commitGroup(function(raw){ return planRenameGroup(session.text(), raw, t.section, t.id, v); },
          {after: function(){ t.id = v.trim(); renderInspector(); }});
      }, {required: 'a group needs a key'})),
      frow('title', groupControl(val.title, function(v){
        return commitGroup(function(raw){ return planSetGroupTitle(session.text(), raw, t.section, t.id, v); },
          {after: function(){ renderInspector(); }});
      }, {list: null})),
      frow('icon', selectControl(ICON_SET, val.icon || '', function(v){
        return commitGroup(function(raw){ return planSetGroupIcon(session.text(), raw, t.section, t.id, v); },
          {after: function(){ renderInspector(); }});
      }, true)),
      frow('parent (nesting)', parentControl),
      memberRow
    ];
  }

function vocabularyControl(kind,page,value,target){
    var raw=parseEditor().raw,path=builderTargetPath(raw,target),expected=JSON.stringify(path && specValueAt(raw,path));
    return createVocabularyControl({document:document,kind:kind,value:value,open:OPEN_VOCABULARY,listen:listen,
      definitions:kind==='protocols'?resolveProtocols(page || {}):resolveLanes(page || {}),
      controls:{select:selectControl,text:textControl,row:frow,action:actionButton},
      select:function(next){var ok=commitSimple(kind==='protocols'?'kind':'lane',next==null?null:JSON.stringify(next));if(ok)refreshFormSoon();return ok;},
      update:function(id,changes,create){return commitCascade(function(raw){return planVocabulary(session.text(),raw,target,kind,id,changes,create,expected);},{after:refreshFormSoon});}
    });
  }

/* ---- per-kind form builders; each returns an array of DOM rows ---- */
  function catalogControls(val){
    var registry=opts.catalog && opts.catalog();
    var rows=[];
    if (registry && typeof FlowCanon!=='undefined'){
      var bound=val.binding || {}, service=registry.services.find(function(s){return s.entityRef===bound.entityRef;});
      function set(ref,api,operation){
        try { return commitSimple('binding',ref ? JSON.stringify(FlowCanon.binding(registry,ref,api,operation)) : null); }
        catch(ex){formError(ex.message);return false;}
      }
      var picker=selectControl(registry.services.map(function(s){return s.entityRef;}),bound.entityRef,function(ref){
        try {
          var binding=ref ? FlowCanon.binding(registry,ref) : null, t=session.target;
          var ok=commitCascade(function(raw){return planBindNodeService(session.text(),raw,t.section,t.id,binding);});
          if(ok) refreshFormSoon(); return ok;
        }catch(ex){formError(ex.message);return false;}
      },true);
      Array.prototype.forEach.call(picker.options,function(option){var s=registry.services.find(function(s){return s.entityRef===option.value;});if(s) option.textContent=s.title+' · '+s.entityRef;});
      rows.push(frow('Company service',picker));
      if(service){
        rows.push(frow('Service API',selectControl((service.apis || []).map(function(a){return a.entityRef;}),bound.api && bound.api.entityRef,function(api){var ok=set(service.entityRef,api);if(ok)refreshFormSoon();return ok;},true)));
        var api=(service.apis || []).find(function(a){return bound.api && a.entityRef===bound.api.entityRef;});
        if(api) rows.push(frow('API operation',selectControl((api.operations || []).map(function(o){return o.operationId;}),bound.api.operationId,function(op){return set(service.entityRef,api.entityRef,op);},true)));
      }
    }
    if(val.binding || !registry) rows.push(frow('Service binding JSON',jsonFieldControl('binding',val.binding,'json')));
    return rows;
  }

function nodeForm(val, ctx){
    var t = session.target;
    ensureGroupDatalist([ctx.diagram]);
    var floatSide = '',floatEntry=null;
    ((ctx.diagram && ctx.diagram.floats) || []).forEach(function(f){
      if (f && f.id === t.id){floatEntry=f;floatSide=positionedFloat(f)?'free':f.side === 'below' ? 'below' : 'above';}
    });
    var floatControl = selectControl(['free','above', 'below'], floatSide, function(v){
      return commitCascade(function(raw){ return planSetNodeFloat(session.text(), raw, t.section, t.id, v); },
        {after: function(){ renderInspector(); }});
    }, true);
    floatControl.firstChild.textContent = 'in rows';
    Array.from(floatControl.children).forEach(function(option){
      if(option.value)option.textContent={free:'Free placement',above:'Auto above',below:'Auto below'}[option.value];
    });
    var floatRows=[];
    if(floatEntry){
      var position=layout(ctx.diagram).pos[t.id];
      [['x','Float X','cx'],['y','Float Y','cy']].forEach(function(field){
        floatRows.push(frow(field[1],numberControl(position[field[2]],function(value){
          return commitCascade(function(raw){
            var got=builderDiagram(session.text(),raw,t.section);if(got.error)return got;
            var p=layout(got.d).pos[t.id];
            return planPlaceFloat(session.text(),raw,t.section,t.id,field[0]==='x'?value:p.cx,field[0]==='y'?value:p.cy);
          },{after:function(){renderInspector();}});
        })));
      });
      var hint=document.createElement('p');hint.className='fnote';
      hint.textContent='Drag anywhere to pin this node. X/Y locate its center in diagram units, independent of zoom. Choose Auto above/below to release the pin, or in rows to restore row placement.';
      floatRows.push(hint);
    }
    return [
      frow('id', textControl(t.id, function(v){
        if (v == null){ formError('a node needs an id'); return false; }
        if (v === t.id){ formError(''); return true; }
        return commitCascade(function(raw){ return planRenameNode(session.text(), raw, t.section, t.id, v); },
          {after: function(){ t.id = v; renderInspector(); }});
      }, {required: 'a node needs an id'})),
      frow('title', textControl(val.title, function(v){ return commitSimple('title', v == null ? null : JSON.stringify(v)); })),
      frow('group', groupControl(val.group, function(v){
        return commitGroup(function(raw){ return planSetNodeGroup(session.text(), raw, t.section, t.id, v); },
          {after: function(){ ensureGroupDatalist([builderDiagram(session.text(), JSON.parse(session.text()), t.section).d]); }});
      })),
      frow('float', floatControl)
    ].concat(floatRows,[
      frow('sub', textControl(val.sub, function(v){ return commitSimple('sub', v == null ? null : JSON.stringify(v)); })),
      frow('icon', selectControl(ICON_SET, val.icon || 'gear', function(v){ return commitSimple('icon', JSON.stringify(v || 'gear')); })),
      frow('tint', selectControl(TINT_SET, val.tint || 'cmd', function(v){ return commitSimple('tint', JSON.stringify(v || 'cmd')); })),
      frow('link', textControl(val.link, function(v){ return commitSimple('link', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'})),
      frow('delta (change marker)', checkboxControl(val.delta === true, function(on){ return commitSimple('delta', on ? 'true' : null); }))
    ],[handoffControls(val),detailControls(val,ctx)],catalogControls(val),[frow('Code references JSON',jsonFieldControl('codeRefs',val.codeRefs,'jsonArr'))]);
  }

function handoffControls(val){
    var target=session.target,fold=document.createElement('details'),summary=document.createElement('summary');
    fold.className='node-handoff-editor';fold.open=val.handoff!=null;summary.textContent='Diagram handoff';fold.appendChild(summary);
    var note=document.createElement('p');note.className='fnote';
    note.textContent='The node’s arrow continues in a separate diagram document. Supply a destination URL or a stable spec ID for the host to resolve. Use link above for source documentation. Apply saves these fields together.';
    fold.appendChild(note);
    if(val.detail!=null){
      var conflict=document.createElement('p');conflict.className='fnote';
      conflict.textContent='Remove the existing domain detail before applying a diagram handoff.';fold.appendChild(conflict);
    }
    var draft=val.handoff || {},fields={};
    [['url','Destination URL','https://…'],['spec','Spec ID (optional)','stable-spec-id'],
      ['revision','Revision (optional)','pinned revision; requires a spec ID'],['section','Section (optional)','section ID; requires a spec ID']].forEach(function(field){
      var control=document.createElement('input');control.type='text';control.className='fctl';
      control.value=draft[field[0]]==null?'':String(draft[field[0]]);control.placeholder=field[2];fields[field[0]]=control;
      fold.appendChild(frow(field[1],control));
    });
    fold.appendChild(actionButton('Apply handoff',function(){
      var handoff={};Object.keys(fields).forEach(function(key){var value=fields[key].value.trim();if(value)handoff[key]=value;});
      var ok=commitCascade(function(raw){return planSetNodeHandoff(session.text(),raw,target.section,target.id,handoff);});
      if(ok)refreshFormSoon();
    }));
    if(val.handoff!=null)fold.appendChild(actionButton('Remove handoff',function(){
      var ok=commitCascade(function(raw){return planSetNodeHandoff(session.text(),raw,target.section,target.id,null);});
      if(ok)refreshFormSoon();
    }));
    return fold;
  }

function detailControls(val,ctx){
    var target=session.target,fold=document.createElement('details'),summary=document.createElement('summary');
    fold.className='node-detail-editor';fold.open=!!val.detail;summary.textContent='Domain detail';fold.appendChild(summary);
    var note=document.createElement('p');note.className='fnote';
    note.textContent='Open an ordinary section as this node’s inner flow, or link to an approved spec. Apply saves these fields together. Changing the child section or target type resets its entry position, mappings and boundary ports.';
    fold.appendChild(note);
    if(val.handoff!=null){
      var conflict=document.createElement('p');conflict.className='fnote';
      conflict.textContent='Remove the existing diagram handoff before applying a domain detail.';fold.appendChild(conflict);
    }
    var body=document.createElement('div');fold.appendChild(body);
    var draft=val.detail?builderClone(val.detail):{mode:'focus'};
    var type=draft.spec?'Approved spec':draft.url && !draft.section?'URL':'Local section';
    var collect=function(){return draft;},pending=false;
    function resetChildBindings(){['path','step','stepMap','ports'].forEach(function(key){delete draft[key];});}
    function input(value,placeholder,area){
      var control=document.createElement(area?'textarea':'input');control.className='fctl';
      if(!area)control.type='text';control.value=value==null?'':String(value);
      if(placeholder)control.placeholder=placeholder;
      return control;
    }
    function picker(options,value,empty){return selectControl(options,value,function(){return true;},empty);}
    function draw(){
      body.innerHTML='';
      var kind=picker(['Local section','Approved spec','URL'],type,false);
      body.appendChild(frow('Detail target',kind));
      listen(kind,'change',function(){
        try{draft=collect();}catch(ex){kind.value=type;formError('Step mapping must be valid JSON before changing target type.');return;}
        if(type!==kind.value)resetChildBindings();
        pending=true;type=kind.value;draw();assignControlKeys();
      });
      var section,path,step,map,spec,revision,url;
      if(type==='Local section'){
        var records=builderDetailRecords(parseEditor().raw).filter(function(record){return record.section && record.section.diagram;});
        var current=records.find(function(record){return record.reference===String(draft.section);}) ||
          records.find(function(record){return record.aliases.indexOf(String(draft.section))>=0 || String(record.number)===String(draft.section);});
        section=picker(records.map(function(record){return record.reference;}),current?current.reference:draft.section,true);
        Array.prototype.forEach.call(section.options || [],function(option){
          var record=records.find(function(rec){return rec.reference===option.value;});
          if(record)option.textContent=(record.section.heading || 'Section '+record.number)+' · '+record.reference+(record.section.detailOnly?' (detail only)':'');
        });
        section.setAttribute('aria-label','Local section');body.appendChild(frow('Local section',section));
        listen(section,'change',function(){if(!current || current.reference!==section.value)resetChildBindings();draft=Object.assign({},draft,{section:section.value,mode:'focus'});pending=true;draw();assignControlKeys();});
        var help=document.createElement('p');help.className='fnote';
        help.textContent='Opens a focused drilldown with an overview map and a return trail.';
        body.appendChild(help);
        var chosen=records.find(function(record){return record.reference===section.value;}),d=chosen && chosen.section.diagram || {};
        path=picker((d.paths || []).map(function(p){return p.id;}),draft.path,true);
        step=picker((d.steps || []).filter(function(s){return typeof s.id==='string' && s.id;}).map(function(s){return s.id;}),draft.step,true);
        path.setAttribute('aria-label','Initial child path');step.setAttribute('aria-label','Initial child step');
        body.appendChild(frow('Initial child path',path));body.appendChild(frow('Initial child step',step));
        listen(path,'change',function(){pending=true;});listen(step,'change',function(){pending=true;});
        if(val.detail && chosen && String(val.detail.section)===String(draft.section)){
          var expected=JSON.stringify(val.detail);
          function ready(){if(pending){formError('Apply the detail settings before editing or previewing mappings.');return false;}return true;}
          body.appendChild(createDetailMappingControl({document:document,detail:val.detail,parent:ctx.diagram,child:d,listen:listen,
            controls:{row:frow,action:actionButton},error:formError,
            change:function(edit){if(!ready())return false;return commitCascade(function(raw){
              return planDetailMapping(session.text(),raw,target,edit,expected);
            },{after:refreshFormSoon});},
            preview:function(parentId){if(!ready())return;var result=opts.preview.detail && opts.preview.detail(target,parentId);if(result && result.error)formError(result.error);}}));
        }else{
          var mappingHelp=document.createElement('p');mappingHelp.className='fnote';
          mappingHelp.textContent='Apply this local detail first to map parent and child events.';body.appendChild(mappingHelp);
        }
      }else{
        if(type==='Approved spec'){
          spec=input(draft.spec,'approved-spec-id');revision=input(draft.revision,'optional pinned revision');section=input(draft.section,'child-section-id');
          body.appendChild(frow('Approved spec ID',spec));body.appendChild(frow('Revision (optional)',revision));body.appendChild(frow('External section',section));
        }
        url=input(draft.url,'https://…');body.appendChild(frow(type==='Approved spec'?'Fallback URL (optional)':'Detail URL',url));
        var externalHelp=document.createElement('p');externalHelp.className='fnote';
        externalHelp.textContent='External details use link mode. The host resolves approved spec IDs; the URL is the fallback when available.';
        body.appendChild(externalHelp);
      }
      collect=function(){
        var detail=builderClone(draft);detail.mode=type==='Local section'?'focus':'link';
        ['section','path','step','spec','revision','url'].forEach(function(key){delete detail[key];});
        function put(key,control){if(control && control.value.trim())detail[key]=control.value.trim();}
        put('section',section);
        if(type==='Local section'){
          put('path',path);put('step',step);

        }else {put('spec',spec);put('revision',revision);put('url',url);}
        return detail;
      };
      body.appendChild(actionButton('Apply detail',function(){
        var detail;
        try{detail=collect();}catch(ex){formError('Step mapping must be valid JSON.');return;}
        var ok=commitCascade(function(raw){return planSetNodeDetail(session.text(),raw,target.section,target.id,detail);});
        if(ok)refreshFormSoon();
      }));
      if(val.detail)body.appendChild(actionButton('Remove detail',function(){
        var ok=commitCascade(function(raw){return planSetNodeDetail(session.text(),raw,target.section,target.id,null);});
        if(ok)refreshFormSoon();
      }));
    }
    draw();return fold;
  }

function visibilityControl(val,ctx){
    var target=Object.assign({},session.target),expected=JSON.stringify(val);
    return createVisibilityControl({document:document,value:val,diagram:ctx.diagram,
      controls:{select:selectControl,row:frow,action:actionButton},error:formError,
      current:function(){var s=stepperFor(target.section);return s?Object.assign({},s.current(),{path:s.path(),mode:s.mode()}):null;},
      change:function(key,value){return commitCascade(function(raw){
        return planFragmentVisibility(session.text(),raw,target,key,value,expected);
      },{after:refreshFormSoon});}});
  }

function edgeForm(val, ctx){
    var t = session.target;
    var ids = Object.keys((ctx.diagram && ctx.diagram.nodes) || {});
    function endpoint(field){
      return selectControl(ids, val[field], function(v){
        if (v == null) return true; /* endpoint kept — nothing to commit */
        return commitCascade(function(raw){
          return planSetEdgeEndpoint(session.text(), raw, t.section, t.index, field, v);
        });
      });
    }
    function portRows(field,label){
      var current=validEdgePort(val[field])?val[field]:null;
      function update(side,offset){
        return commitCascade(function(raw){
          var got=builderDiagram(session.text(),raw,t.section);if(got.error)return got;
          var edge=got.d.edges[t.index],port=edge[field],next=null;
          if(side){next={side:side,offset:validEdgePort(port) && port.offset!=null?port.offset:.5};}
          else if(offset!=null && validEdgePort(port))next={side:port.side,offset:offset};
          return planSetField(session.text(),raw,got.path.concat(['edges',t.index]),field,next?JSON.stringify(next):null);
        },side!==undefined?{after:function(){renderInspector();}}:undefined);
      }
      var control=selectControl(EDGE_PORT_SIDES,current && current.side,function(side){return update(side || '',null);},true);
      control.firstChild.textContent='Auto';
      var rows=[frow(label+' side',control)];
      if(current){
        var position=numberControl((current.offset==null ? .5 : current.offset)*100,function(value){
          if(!Number.isFinite(value) || value<0 || value>100){formError('Port position must be between 0 and 100%.');return false;}
          return update(undefined,value/100);
        });
        rows.push(frow(label+' position (%)',position));
      }
      return rows;
    }
    var portHint=document.createElement('p');portHint.className='fnote';
    portHint.textContent='Entry/exit positions run from 0% at the left or top to 100% at the right or bottom. Pinned ports use a curve, including in lane routing; Auto restores automatic routing.';
    return [
      frow('from', endpoint('from')),
      frow('to', endpoint('to'))
    ].concat(portRows('fromPort','Exit'),portRows('toPort','Entry'),[portHint,
      frowBlock('Connection type',vocabularyControl('protocols',ctx.page,val.kind || 'int',t)),
      frow('ret (response)', checkboxControl(val.ret, function(on){ return commitSimple('ret', on ? 'true' : null); })),
      frow('delta (change marker)', checkboxControl(val.delta === true, function(on){ return commitSimple('delta', on ? 'true' : null); })),
      frow('label', textControl(val.label, function(v){ return commitSimple('label', v == null ? null : JSON.stringify(v)); })),
      frow('bend', numberControl(val.bend, function(v){ return commitSimple('bend', v == null ? null : String(v)); })),
      frow('labelDx', numberControl(val.labelDx, function(v){ return commitSimple('labelDx', v == null ? null : String(v)); })),
      frow('labelDy', numberControl(val.labelDy, function(v){ return commitSimple('labelDy', v == null ? null : String(v)); })),
      visibilityControl(val,ctx)
    ]);
  }

function chipRow(labelText, items, emptyText, onRemove, onBody, ownerKind){
    var box = document.createElement('span');
    box.className = 'fctl mchips';
    if (!items.length){
      var none = document.createElement('span');
      none.className = 'fnote';
      none.textContent = emptyText;
      box.appendChild(none);
    }
    items.forEach(function(it){
      var chip = document.createElement('span');
      chip.className = 'mchip' + (it.open ? ' open' : '');
      var lab = document.createElement('button');
      lab.type = 'button'; lab.className = 'mlab';
      lab.textContent = it.label;
      if (onBody) formLife.listen(lab,'click', function(){ onBody(it.key); });
      else lab.tabIndex = -1;
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'mx';
      x.textContent = '\u00d7'; x.title = 'remove from this ' + (ownerKind || 'step');
      x.setAttribute('aria-label', 'remove ' + it.label + ' from this ' + (ownerKind || 'step'));
      formLife.listen(x,'click', function(){ onRemove(it.key); });
      chip.appendChild(lab); chip.appendChild(x);
      box.appendChild(chip);
    });
    return frow(labelText, box);
  }

function stepForm(val, ctx){
    var t = session.target, panelRows=[];
    function toggled(planFn){
      return function(key){
        commitCascade(function(raw){ return planFn(session.text(), raw, t.section, t.index, key); },
          {after: function(){ renderInspector(); }});
      };
    }
    var rows = [
      frow('Step ID',textControl(val.id,function(v){
        if(v==null){formError('Use a stable step ID to support paths and detail mappings.');return false;}
        return commitCascade(function(raw){return planRenameStep(session.text(),raw,t.section,t.index,v);});
      },{placeholder:'optional stable-step-id'})),
      frow('text', textControl(val.text, function(v){ return commitSimple('text', v == null ? null : JSON.stringify(v)); }, {textarea: true}))
    ];
    var colorBox=document.createElement('div');colorBox.className='step-color-control';
    function commitColor(value){
      if(value!=null && !stepCircleColor({color:value})){formError('Use a color like #38bdf8 or #abc.');return false;}
      return commitSimple('color',value==null?null:JSON.stringify(value));
    }
    var colorPicker=document.createElement('input');colorPicker.type='color';colorPicker.className='fctl';
    colorPicker.value=stepCircleColor(val) || '#6875ca';colorPicker.setAttribute('aria-label','Choose step circle color');
    formLife.listen(colorPicker,'change',function(){commitColor(colorPicker.value);});
    var colorText=textControl(val.color,commitColor,{placeholder:'Default'});colorText.setAttribute('aria-label','Step circle color');
    colorBox.appendChild(colorPicker);colorBox.appendChild(colorText);
    var resetColor=actionButton('Use default',function(){return commitColor(null);});
    resetColor.setAttribute('aria-label','Use default circle color');colorBox.appendChild(resetColor);
    var colorRow=document.createElement('div');colorRow.className='frow';
    var colorLabel=document.createElement('span');colorLabel.className='flab';colorLabel.textContent='Circle color';
    colorRow.appendChild(colorLabel);colorRow.appendChild(colorBox);rows.push(colorRow);
    var colorHelp=document.createElement('p');colorHelp.className='step-color-help';
    colorHelp.textContent='This step only. Repeat the color on adjacent steps to mark a phase; no alternate path is needed.';rows.push(colorHelp);
    var evidence=document.createElement('details');
    var evidenceTitle=document.createElement('summary'); evidenceTitle.textContent='Code and trace evidence';evidence.appendChild(evidenceTitle);
    evidence.appendChild(frow('Code references JSON',jsonFieldControl('codeRefs',val.codeRefs,'jsonArr')));
    evidence.appendChild(frow('Trace match JSON',jsonFieldControl('traceMatch',val.traceMatch,'json')));
    evidence.appendChild(frow('Runtime conditions JSON',jsonFieldControl('conditions',val.conditions,'jsonArr')));
    rows.push(evidence);
    ((ctx.diagram && ctx.diagram.panels) || []).forEach(function(p){
      var editor=p && panelEditor(p.type);
      if(editor && editor.stepControl){
        var fold=document.createElement('details'),key=JSON.stringify([session.snapshot().project,t.section,p.type,p.id]);
        fold.className='patchedit panel-step-group';fold.open=CUSTOM_PANEL_FOLDS.get(key)!==false;
        var summary=document.createElement('summary');summary.textContent=(p.title || p.id)+' · '+p.type;fold.appendChild(summary);
        fold.appendChild(editor.stepControl(ctx.diagram,p,t));
        formLife.listen(fold,'toggle',function(ev){if(ev.target===fold && guide.contains(fold))CUSTOM_PANEL_FOLDS.set(key,fold.open);});
        panelRows.push(fold);
      }
    });
    rows.push(frowBlock('Story lane',vocabularyControl('lanes',ctx.page,val.lane,t)));
    rows.push(frow('link', textControl(val.link, function(v){ return commitSimple('link', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'})));
    rows.push(frow('delta (change marker)', checkboxControl(val.delta === true, function(on){ return commitSimple('delta', on ? 'true' : null); })));

    /* ---- the step's contract: hops, lit nodes, panel patches ---- */
    rows.push(chipRow('hops',
      builderStepHops(val).map(function(k){ return {key: k, label: k}; }),
      'none — edgeless step', toggled(planStepToggleHop)));
    var failures = stepFailures(val);
    function outcomeSelect(key){
      var input = document.createElement('select'); input.className = 'fctl';
      [['delivered','Delivered'],['dropped','Dropped in transit'],['blocked','Not sent']].forEach(function(pair){
        var option = document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; input.appendChild(option);
      });
      input.value = failures[key] || 'delivered';
      formLife.listen(input,'change',function(){
        commitCascade(function(raw){return planStepCommunication(session.text(),raw,t.section,t.index,key,input.value);},
          {after:function(){renderInspector();}});
      });
      return input;
    }
    builderStepHops(val).forEach(function(key){rows.push(frow('Delivery · ' + key,outcomeSelect(key)));});
    var addFailure = document.createElement('select'); addFailure.className = 'fctl';
    var placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose an edge…'; addFailure.appendChild(placeholder);
    (ctx.diagram.edges || []).forEach(function(edge){
      var key = builderEdgeKey(edge); if (builderStepHops(val).indexOf(key) >= 0) return;
      var option = document.createElement('option'); option.value = key; option.textContent = key; addFailure.appendChild(option);
    });
    addFailure.disabled = addFailure.children.length < 2;
    formLife.listen(addFailure,'change',function(){
      if (!addFailure.value) return;
      commitCascade(function(raw){return planStepCommunication(session.text(),raw,t.section,t.index,addFailure.value,'dropped');},
        {after:function(){renderInspector();}});
    });
    rows.push(frow('Add failed communication',addFailure));
    rows.push(chipRow('nodes',
      (Array.isArray(val.nodes) ? val.nodes : []).map(function(n){ return {key: n, label: n}; }),
      'none', toggled(planStepToggleNode)));

    /* ---- per-node tone patches: this step's node-color claims ---- */
    var toneMap = (val.tone && typeof val.tone === 'object' && !Array.isArray(val.tone)) ? val.tone : {};
    function toneSelect(id){
      var input = document.createElement('select'); input.className = 'fctl';
      [['', '(no patch)'],
       ['alert', 'alert — failed / danger (red)'],
       ['warn', 'warn — at risk / degraded (amber)'],
       ['ok', 'ok — healthy / recovered (green)'],
       ['dim', 'dim — inactive / de-emphasized'],
       ['base', 'base — clear an inherited tone']].forEach(function(pair){
        var option = document.createElement('option');
        option.value = pair[0]; option.textContent = pair[1];
        input.appendChild(option);
      });
      var cur = toneMap[id];
      if (cur === null) input.value = 'base'; /* JSON null clears like base */
      else if (typeof cur === 'string' && STEP_TONE_TOKENS.indexOf(cur) >= 0) input.value = cur;
      else if (typeof cur === 'string'){
        var extra = document.createElement('option');
        extra.value = cur; extra.textContent = cur + ' (unknown)';
        input.appendChild(extra); input.value = cur;
      } else input.value = '';
      formLife.listen(input,'change', function(){
        commitCascade(function(raw){
          return planStepTone(session.text(), raw, t.section, t.index, id, input.value === '' ? null : input.value);
        }, {after: function(){ renderInspector(); }});
      });
      return input;
    }
    Object.keys(toneMap).forEach(function(id){ rows.push(frow('tone · ' + id, toneSelect(id))); });
    var addTone = document.createElement('select'); addTone.className = 'fctl';
    var tonePh = document.createElement('option'); tonePh.value = ''; tonePh.textContent = 'Choose a node…';
    addTone.appendChild(tonePh);
    Object.keys((ctx.diagram && ctx.diagram.nodes) || {}).forEach(function(id){
      if (Object.prototype.hasOwnProperty.call(toneMap, id)) return;
      var option = document.createElement('option'); option.value = id; option.textContent = id;
      addTone.appendChild(option);
    });
    addTone.disabled = addTone.children.length < 2;
    formLife.listen(addTone,'change', function(){
      if (!addTone.value) return;
      commitCascade(function(raw){
        return planStepTone(session.text(), raw, t.section, t.index, addTone.value, 'alert');
      }, {after: function(){ renderInspector(); }});
    });
    rows.push(frow('Add node tone', addTone));
    var pids = Object.keys(val.panels || {});
    panelRows.push(chipRow('panels',
      pids.map(function(pid){ return {key: pid, label: pid}; }),
      'none', toggled(planStepTogglePanel)));
    var declarations = (ctx.diagram && ctx.diagram.panels) || [];
    pids.forEach(function(pid){
      var decl = Array.isArray(declarations) ? declarations.filter(function(p){ return p && p.id === pid; })[0] : null;
      if (decl && panelEditor(decl.type).stepControl) return;
      panelRows.push(panelPatchControl(pid, val.panels[pid], decl, t));
    });
    if (declarations.length) rows.push(effectiveStateControl(t));
    var columns=document.createElement('div');columns.className='step-form-columns';
    var story=document.createElement('div');story.className='step-form-story';
    rows.forEach(function(row){story.appendChild(row);});columns.appendChild(story);
    var panels=document.createElement('div');panels.className='step-form-panels';
    var heading=document.createElement('h3');heading.textContent='Panel changes';panels.appendChild(heading);
    panelRows.forEach(function(row){panels.appendChild(row);});columns.appendChild(panels);
    return [columns];
  }

function effectiveStateControl(target){
    var outer=document.createElement('details'); outer.className='effective-state'; outer.open=OPEN_EFFECTIVE_STATE;
    var summary=document.createElement('summary'); summary.textContent='Effective state · all panels'; outer.appendChild(summary);
    var note=document.createElement('p'); note.className='effective-note'; outer.appendChild(note);
    var refresh=document.createElement('button'); refresh.type='button'; refresh.className='bbtn'; refresh.textContent='Refresh effective state'; outer.appendChild(refresh);
    var body=document.createElement('div'); body.className='effective-body'; outer.appendChild(body);
    var indexedText=null, populated=false;
    function stale(){
      indexedText=null; populated=false; body.textContent='';
      note.textContent='Source changed. Refresh to inspect the current JSON at this step; Render updates the board.';
    }
    invalidateEffectiveState=stale;
    function sourceButton(source,base){
      var button=document.createElement('button'); button.type='button'; button.className='bbtn effective-source';
      button.textContent=source.label; button.title=builderPathString(base.concat(source.path));
      formLife.listen(button,'click',function(){
        if (session.text()!==indexedText){ stale(); return; }
        var loc=jsonLocate(session.text(),base.concat(source.path));
        if (loc) selectRange(loc,true);
      });
      return button;
    }
    function populate(){
      var parsed=parseEditor(), refs=parsed.error?[]:specSectionPaths(parsed.raw), rec=refs[target.section];
      body.textContent=''; indexedText=session.text(); populated=true;
      if (parsed.error || !rec){ note.textContent='Fix the JSON source before inspecting effective state.'; return; }
      var d=specValueAt(parsed.raw,rec.diagram), model=builderEffectivePanelStates(d,target.index,stepperFor(target.section) && stepperFor(target.section).path());
      if (model.error){ note.textContent=model.error; return; }
      var st=d.steps[target.index], sp=stepperFor(target.section), route=diagramPathList(d).find(function(p){return sp && p.id===sp.path();}) || diagramPathList(d)[0];
      note.textContent='Step '+(route.indices.indexOf(target.index)+1)+(st && st.id?' · '+st.id:'')+': folded state sent to each widget, including panels without a patch here. Widget-specific defaults may still apply. Values are read-only; source buttons select the authored JSON. Computed fields list input history, including superseded or ignored inputs.';
      model.panels.forEach(function(p){
        var box=document.createElement('details'); box.className='effective-panel'; box.open=OPEN_EFFECTIVE_PANELS.has(p.id);
        formLife.listen(box,'toggle',function(ev){
          if (ev.target!==box || !guide.contains(box)) return;
          if (box.open) OPEN_EFFECTIVE_PANELS.add(p.id); else OPEN_EFFECTIVE_PANELS.delete(p.id);
        });
        var label=document.createElement('summary'); label.textContent=p.id+' · '+p.type+' · '+p.fields.length+' fields'; box.appendChild(label);
        p.fields.forEach(function(field){
          var row=document.createElement('div'); row.className='effective-field'; row.setAttribute('data-effective-field',field.key);
          var heading=document.createElement('div'); heading.className='effective-heading';
          var name=document.createElement('code'); name.textContent=field.key; heading.appendChild(name);
          var origin=document.createElement('span'); origin.className='effective-origin'; origin.setAttribute('data-origin',field.origin.kind); origin.textContent=field.origin.label; heading.appendChild(origin); row.appendChild(heading);
          var value=document.createElement('pre'); value.textContent=JSON.stringify(field.value,null,2); row.appendChild(value);
          var history=field.origin.inputs;
          if (history.length>12){ var count=document.createElement('small'); count.textContent='Showing the latest 12 of '+history.length+' input locations.'; row.appendChild(count); }
          history.slice(-12).forEach(function(source){ row.appendChild(sourceButton(source,rec.diagram)); });
          box.appendChild(row);
        });
        var raw=document.createElement('details'); raw.className='effective-json';
        var rawLabel=document.createElement('summary'); rawLabel.textContent='Folded JSON'; raw.appendChild(rawLabel);
        var area=document.createElement('textarea'); area.className='fctl'; area.readOnly=true; area.rows=6; area.value=JSON.stringify(p.state,null,2); area.setAttribute('aria-label','Effective JSON for '+p.id); raw.appendChild(area);
        var select=document.createElement('button'); select.type='button'; select.className='bbtn'; select.textContent='Select JSON';
        formLife.listen(select,'click',function(){ if (session.text()!==indexedText){ stale(); return; } area.focus(); area.select(); }); raw.appendChild(select);
        box.appendChild(raw); body.appendChild(box);
      });
    }
    formLife.listen(refresh,'click',populate);
    formLife.listen(outer,'toggle',function(ev){
      if (ev.target!==outer || !guide.contains(outer)) return;
      OPEN_EFFECTIVE_STATE=outer.open;
      if (outer.open && (!populated || indexedText!==session.text())) populate();
    });
    if (outer.open) populate();
    return outer;
  }

function panelPatchControl(pid, patch, decl, target, options){
    options=options || {};
    var initial=!!options.initial;
    var editor=panelEditor(decl && decl.type);
    var det = document.createElement('details');
    det.className = initial ? 'initialedit patchedit' : 'patchedit';
    det.setAttribute('data-panel-state',initial?'initial':'step');
    det.open = initial ? OPEN_INITIAL_EDITORS.get(pid)!==false : OPEN_PATCH_EDITORS.has(pid);
    formLife.listen(det,'toggle', function(ev){
      if (ev.target !== det || !guide.contains(det)) return;
      if(initial){OPEN_INITIAL_EDITORS.set(pid,det.open);return;}
      if (det.open) OPEN_PATCH_EDITORS.add(pid);
      else OPEN_PATCH_EDITORS.delete(pid);
    });
    var summary = document.createElement('summary');
    summary.textContent = initial ? 'Starting state' : pid + ' · ' + patchSummaryLine(patch);
    det.appendChild(summary);
    var body = document.createElement('div');
    body.className = 'rowsedit';
    det.appendChild(body);

    function commitPatch(key, value, whole, shape, storage){
      if (modes.adding()){
        formError('finish ADD TO STEP first (DONE or Esc) — this control is paused while the mode is armed');
        return false;
      }
      var ok = commitCascade(function(raw){
        var next=value,path,panel,got,current;
        if(initial){
          path=builderTargetPath(raw,target);panel=path && specValueAt(raw,path);
          if(!panel || panel.id!==pid || panel.type!==decl.type)return {error:'Select the panel again.'};
          current=panel.initial;
        }else{
          got=builderStepAt(raw,target.section,target.index);
          if(!got || !got.st.panels || !Object.prototype.hasOwnProperty.call(got.st.panels,pid))
            return {error:'panel "'+pid+'" is not in this step'};
          current=got.st.panels[pid];
        }
        if(!whole){
          next=Object.assign(Object.create(null),panelObject(current)?current:{});
          if(storage==='once' && Object.prototype.hasOwnProperty.call(next,'enterOnce') && !panelObject(next.enterOnce))return {error:'Repair enterOnce in raw JSON before editing a temporary field.'};
          var values=storage==='once'?Object.assign(Object.create(null),next.enterOnce || {}):next;
          if(typeof value==='function')value=value(values[key]);
          if(shape){
            var nested=Object.assign(Object.create(null),panelObject(values[key])?values[key]:{});
            shape.forEach(function(field){delete nested[field[0]];});
            Object.assign(nested,value || {});
            value=Object.keys(nested).length?nested:undefined;
          }
          if(value===undefined)delete values[key];else values[key]=value;
          if(storage==='once'){if(Object.keys(values).length)next.enterOnce=values;else delete next.enterOnce;}
        }
        return initial ? planSetField(session.text(),raw,path,'initial',JSON.stringify(next)) :
          planStepSetPanelPatch(session.text(),raw,target.section,target.index,pid,JSON.stringify(next));
      });
      if (ok) refreshFormSoon();
      return ok;
    }
    function fieldInput(f, value){
      var input;
      if (f[1] === 'enum' || f[1] === 'bool'){
        var boolOpts = f[2] && f[2].trueOnly ? ['true'] : ['true', 'false'];
        input = colInput({k: f[0], kind: 'enum', options: f[1] === 'bool' ? boolOpts : f[2]},
          value == null ? null : String(value));
        input.options[0].textContent = '(unset)';
      } else if (['json', 'jsonArr', 'jsonAny'].indexOf(f[1]) >= 0){
        input = document.createElement('textarea');
        input.className = 'fctl';
        input.value = value === undefined ? '' : JSON.stringify(value);
      } else {
        input = colInput({k: f[0], kind: f[1]}, value);
        if (f[1] === 'num') input.className += ' fnum';
      }
      input.setAttribute('aria-label', f[0]);
      if (editor.patchField) editor.patchField(f,input,options);
      return input;
    }
    function rawControl(){
      return textControl(JSON.stringify(patch), function(v){
        if (v == null){if(initial)return commitPatch(null,{},true);formError('a patch is a JSON object — remove the panel chip instead');return false;}
        var out = patchFieldsCollect([['patch', 'json']], {patch: v});
        if (out.error){ formError(out.error); return false; }
        return commitPatch(null, out.item.patch, true);
      }, {textarea: true});
    }
    var fields = panelPatchFields(decl);
    if(initial){
      var note=document.createElement('p');note.className='home-note';
      note.textContent='These values start every path. Step changes stay separate; unset fields use the panel defaults.';body.appendChild(note);
    }else if (editor.patchIntro) editor.patchIntro(body,decl);
    if (fields === null){
      body.appendChild(frow('patch ' + pid, rawControl()));
      return det;
    }
    if(!initial && (panelAuthoring(decl.type).transientFields || []).length){
      var durationNote=document.createElement('p');durationNote.className='fnote';
      durationNote.textContent='Set a value, then choose Carry forward or This step only. Inherit removes this step’s assignment. One-step values resume the carried state at the next stop.';
      body.appendChild(durationNote);
    }
    fields.forEach(function(f){
      var key = f[0], cur = patch && patch[key];
      var temporary=!initial && (panelAuthoring(decl.type).transientFields || []).indexOf(key)>=0;
      var once=temporary && patch && panelObject(patch.enterOnce)?patch.enterOnce:null;
      var hasOnce=once && Object.prototype.hasOwnProperty.call(once,key),hasCarry=patch && Object.prototype.hasOwnProperty.call(patch,key);
      var storage=hasOnce?'once':'carry';if(hasOnce)cur=once[key];
      if(temporary){
        var state=hasOnce?(hasCarry?'both':'once'):(hasCarry?'carry':'inherit');
        var duration=selectControl(['inherit','carry','once'].concat(state==='both'?['both']:[]),state,function(value){
          if(value==='both')return true;
          return commitCascade(function(raw){return planPanelFieldDuration(session.text(),raw,target,pid,key,value,JSON.stringify(patch));},{after:refreshFormSoon});
        });
        var labels={inherit:'Inherit previous state',carry:'Carry forward',once:'This step only',both:'This step + carried value (advanced)'};
        Array.from(duration.options).forEach(function(o){o.textContent=labels[o.value];});duration.setAttribute('aria-label',key+' duration');
        duration.disabled=state==='inherit';body.appendChild(frow((editor.patchLabel?editor.patchLabel(key):key)+' duration',duration));
        var hint=document.createElement('p');hint.className='fnote';
        hint.textContent=state==='both'?'Editing the current temporary value; a separate carried value resumes afterwards. Choosing a duration keeps the current value and replaces those two assignments.':state==='inherit'?'Enter a value below, then choose its duration.':state==='once'?'This value applies only at this stop. Later steps resume the carried state. Choose Inherit to remove this override.':'Later steps keep this value. Choose Inherit to remove this step’s assignment.';
        if(key==='audio')hint.textContent+=' Audio is one complete snapshot; its individual fields do not inherit separately.';
        if(state==='both')hint.textContent+=' Saved for later: '+JSON.stringify(patch[key]).slice(0,180);
        duration.title=hint.textContent;
        if(state==='both')body.appendChild(hint);
        else if(key==='audio'){hint.textContent='Audio replaces the whole snapshot; individual fields do not inherit separately.';body.appendChild(hint);}
      }
      if(panelAuthoring(decl.type).notifications){
        if(key==='notify'){
          body.appendChild(frowBlock('Notifications',createNotificationComposer({
            document:document,value:cur,initial:initial,app:decl.appName || decl.brand && decl.brand.app,
            controls:{row:frow,text:textControl,action:actionButton},listen:listen,
            commit:function(value){return commitPatch('notify',value);}
          })));return;
        }
        if(key==='clear'){
          if(!initial)body.appendChild(frow('Clear earlier notifications',checkboxControl(cur===true,function(value){return commitPatch('clear',value?true:undefined);})));return;
        }
      }
      if (f[1] === 'objf'){
        var group = document.createElement('div');
        group.className = 'rowsedit';
        f[2].forEach(function(col){
          var input=fieldInput(col,cur && cur[col[0]]);
          wireCommit(input,function(){
            var values=Object.create(null);values[col[0]]=input.value;
            var out=patchFieldsCollect([col],values);
            if(out.error){formError(key+': '+out.error);return false;}
            return commitPatch(key,out.item,false,[col],storage);
          });
          group.appendChild(frow(editor.patchLabel ? editor.patchLabel(col[0]) : col[0], input));
        });
        body.appendChild(frowBlock(key, group));
      } else {
        var input = fieldInput(f, cur);
        wireCommit(input, function(){
          var values = Object.create(null);
          values[key] = input.value;
          var out = patchFieldsCollect([f], values);
          if (out.error){ formError(out.error); return false; }
          return commitPatch(key, out.item[key],false,null,storage);
        });
        body.appendChild(frow(editor.patchLabel ? editor.patchLabel(key) : key, input));
      }
    });
    var rawFold = document.createElement('details');
    rawFold.className = 'rawjson';
    var rawSummary = document.createElement('summary');
    rawSummary.textContent = 'raw JSON';
    rawFold.appendChild(rawSummary);
    rawFold.appendChild(rawControl());
    body.appendChild(rawFold);
    return det;
  }

function jsonFieldControl(key, value, kind, after){
    /* kind: 'json' (object) | 'jsonArr' (array) | 'jsonAny' (any JSON —
       radar rings takes a count OR a radii array). `after` runs on a
       successful commit — the typed editors pass a form refresh so the
       two views of one field can never go stale against each other. */
    return textControl(value === undefined ? '' : JSON.stringify(value), function(v){
      var ok;
      if (v == null) ok = commitSimple(key, null);
      else {
        var parsed;
        try { parsed = JSON.parse(v); }
        catch (ex){ formError(key + ': not valid JSON (' + ex.message + ')'); return false; }
        if (kind === 'jsonArr' && !Array.isArray(parsed)){
          formError(key + ' is a JSON array — [ ... ]'); return false;
        }
        if (kind === 'json' && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))){
          formError(key + ' is a JSON object — { ... }'); return false;
        }
        ok = commitSimple(key, JSON.stringify(parsed));
      }
      if (ok && after) after();
      return ok;
    }, {textarea: true});
  }

/* frow wraps in a <label>, which is wrong for controls holding MANY
     inputs — this is the same row look on a plain div */
  function frowBlock(labelText, control){
    var row = document.createElement('div');
    row.className = 'frow';
    var lab = document.createElement('span');
    lab.className = 'flab'; lab.textContent = labelText;
    row.appendChild(lab); row.appendChild(control);
    return row;
  }

/* after any successful commit from a typed editor OR its raw fallback,
     rebuild the form from the fresh JSON — the two views of one field must
     never go stale against each other. Deferred a tick so the change event
     finishes on a still-attached input. */
  function refreshFormSoon(){
    if(disposed)return;
    cancelRefresh();
    var identity=targetIdentity(),version=refreshVersion;
    refreshTimer=opts.schedule(function(){
      if(disposed || version!==refreshVersion || identity!==targetIdentity())return;
      refreshTimer=null;
      // A preceding field's change can schedule this while the next field is
      // already being typed. Let that field commit before replacing its DOM.
      var active=document.activeElement;
      if(active && guide.contains(active) && active._flowviewHasDraft && active._flowviewHasDraft()){
        // A draft can be reverted without committing; still refresh on exit.
        formLife.listen(active,'blur',function(){if(!active._flowviewHasDraft())refreshFormSoon();},{once:true});return;
      }
      if(session.target && !guide.hidden)renderInspector();
    },0);
  }
  function rawJsonFallback(key, cur, jsonKind){
    var det = document.createElement('details');
    det.className = 'rawjson';
    var sum = document.createElement('summary');
    sum.textContent = 'raw JSON';
    det.appendChild(sum);
    det.appendChild(jsonFieldControl(key, cur, jsonKind, refreshFormSoon));
    return det;
  }

function colInput(col, value){
    var input;
    var options = col.kind === 'icon' ? ICON_SET : (col.options || []);
    if (col.kind === 'enum' || col.kind === 'icon'){
      input = document.createElement('select');
      input.className = 'fctl';
      var none = document.createElement('option');
      none.value = ''; none.textContent = '(' + col.k + ')';
      input.appendChild(none);
      options.forEach(function(o){
        var op = document.createElement('option');
        op.value = o; op.textContent = o;
        input.appendChild(op);
      });
      /* an unknown existing value keeps a selectable option (same pattern
         as selectControl) — coercing it to '' would delete it on the next
         sibling-column commit */
      if (typeof value === 'string' && value !== '' && options.indexOf(value) < 0){
        var extra = document.createElement('option');
        extra.value = value; extra.textContent = value + ' (unknown)';
        input.appendChild(extra);
      }
      input.value = (typeof value === 'string') ? value : '';
    } else {
      input = document.createElement('input');
      input.type = 'text'; input.className = 'fctl';
      input.placeholder = col.k + (col.req ? ' *' : '') + (col.kind === 'clock' ? ' (5m, 2h…)' : '');
      input.value = value == null ? '' : String(value);
    }
    return input;
  }

function wireCommit(input,fire){return wireBuilderCommit(input,fire,{blur:true,listen:listen});}
  function rowsFieldControl(key, cur, shape, options){
    options=options || {};
    var wrap = document.createElement('div');
    wrap.className = 'rowsedit';
    var rowRefs = [];
    function commitRows(refsOverride){
      var refs = refsOverride || rowRefs;
      var rows = refs.map(function(r){
        var values = {};
        Object.keys(r.inputs).forEach(function(k){ values[k] = r.inputs[k].value; });
        return {base: r.base, values: values};
      });
      var out = rowsEditorCollect(shape, rows);
      if (out.error){ formError(key + ': ' + out.error); return false; }
      formError('');
      var ok = commitSimple(key, out.items.length ? JSON.stringify(out.items) : null);
      if (ok){
        if (options.committed) options.committed(refs.filter(function(r){return !rowIsBlank(r);}));
        refreshFormSoon(); /* resync typed rows, raw fallback, stale bases */
      }
      return ok;
    }
    var addBtn = document.createElement('button');
    function rowIsBlank(ref){
      return !ref.base && Object.keys(ref.inputs).every(function(k){
        return ref.inputs[k].value.trim() === '';
      });
    }
    function moveRow(ref, delta){
      /* commit-first like removal: the reordered list is committed and the
         success-path form refresh redraws the order; a blank uncommitted
         line has no JSON to reorder, so moving it is a no-op */
      if (rowIsBlank(ref)) return;
      var i = rowRefs.indexOf(ref), to = i + delta;
      if (i < 0 || to < 0 || to >= rowRefs.length) return;
      var reordered = rowRefs.slice();
      reordered.splice(i, 1);
      reordered.splice(to, 0, ref);
      commitRows(reordered);
    }
    function smallButton(text, title, onClick){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'bbtn rowx'; b.textContent = text;
      b.title = title;
      formLife.listen(b,'click', function(ev){if(!disposed)return onClick.call(this,ev);});
      return b;
    }
    function buildRow(base){
      /* 5+ columns cannot share one flex line — the inputs shrink into
         unreadable slivers. Wide shapes render each item as a card of
         LABELED inputs in a wrapping grid instead. */
      var wide = (shape.cols || []).length > 4;
      var line = document.createElement('div');
      line.className = wide ? 'rowline rowcard' : 'rowline';
      var ref = {base: base, inputs: {}};
      (shape.cols || []).forEach(function(col){
        var input = colInput(col, base ? base[col.k] : null);
        wireCommit(input, commitRows);
        ref.inputs[col.k] = input;
        if (wide){
          var cell = document.createElement('label');
          cell.className = 'rowcell';
          var cap = document.createElement('span');
          cap.className = 'rowk';
          cap.textContent = col.k + (col.req ? ' *' : '');
          cell.appendChild(cap);
          if (!options.cell || !options.cell({column:col,input:input,cell:cell,ref:ref,base:base})) cell.appendChild(input);
          line.appendChild(cell);
        } else line.appendChild(input);
      });

      var acts = line;
      if (wide){
        acts = document.createElement('div');
        acts.className = 'rowcardacts';
        line.appendChild(acts);
      }
      if(options.actions) options.actions({line:line,actions:acts,base:base,index:rowRefs.length,ref:ref,button:smallButton});

      acts.appendChild(smallButton('↑', 'move this item up', function(){ moveRow(ref, -1); }));
      acts.appendChild(smallButton('↓', 'move this item down', function(){ moveRow(ref, 1); }));
      /* commit first; only a SUCCESSFUL commit removes the line (via the
         form refresh) — a failed one must leave form and JSON agreeing */
      acts.appendChild(smallButton('✕', 'remove this item', function(){
        commitRows(rowRefs.filter(function(r){ return r !== ref; }));
      }));
      var index = rowRefs.length;
      rowRefs.push(ref);
      return options.wrapRow ? options.wrapRow({line:line,ref:ref,base:base,index:index,refs:rowRefs}) : line;
    }
    (Array.isArray(cur) ? cur : []).forEach(function(it){
      wrap.appendChild(buildRow(it && typeof it === 'object' ? it : {}));
    });
    addBtn.type = 'button'; addBtn.className = 'bbtn rowadd'; addBtn.textContent = '+ item';
    formLife.listen(addBtn,'click', function(){
      if (shape.max && rowRefs.length >= shape.max){
        formError(key + ': at most ' + shape.max + ' items'); return;
      }
      var line = buildRow(null);
      wrap.insertBefore(line, addBtn);
      var first = line.querySelector('input, select');
      if (first) first.focus();
    });
    wrap.appendChild(addBtn);
    wrap.appendChild(rawJsonFallback(key, cur, 'jsonArr'));
    return wrap;
  }

function mapFieldControl(key, cur, opts){
    var wrap = document.createElement('div');
    wrap.className = 'rowsedit';
    var pairRefs = [];
    function commitPairs(refsOverride){
      var out = mapEditorCollect((refsOverride || pairRefs).map(function(p){
        return {key: p.keyInput.value, value: p.valInput.value};
      }));
      if (out.error){ formError(key + ': ' + out.error); return false; }
      formError('');
      var ok = commitSimple(key, out.obj ? JSON.stringify(out.obj) : null);
      if (ok) refreshFormSoon();
      return ok;
    }
    var addBtn = document.createElement('button');
    function buildPair(k, v){
      var line = document.createElement('div');
      line.className = 'rowline';
      var keyInput = document.createElement('input');
      keyInput.type = 'text'; keyInput.className = 'fctl';
      keyInput.placeholder = 'key'; keyInput.value = k == null ? '' : String(k);
      var valInput = document.createElement('input');
      valInput.type = 'text'; valInput.className = 'fctl';
      valInput.placeholder = (opts && opts.valPlaceholder) || 'value';
      valInput.value = v == null ? '' : String(v);
      var ref = {keyInput: keyInput, valInput: valInput};
      wireCommit(keyInput, commitPairs); wireCommit(valInput, commitPairs);
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'bbtn rowx'; x.textContent = '✕';
      x.title = 'remove this pair';
      formLife.listen(x,'click', function(){
        commitPairs(pairRefs.filter(function(p){ return p !== ref; }));
      });
      line.appendChild(keyInput); line.appendChild(valInput); line.appendChild(x);
      pairRefs.push(ref);
      return line;
    }
    var obj = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? cur : {};
    Object.keys(obj).forEach(function(k){ wrap.appendChild(buildPair(k, obj[k])); });
    addBtn.type = 'button'; addBtn.className = 'bbtn rowadd'; addBtn.textContent = '+ pair';
    formLife.listen(addBtn,'click', function(){
      var line = buildPair(null, null);
      wrap.insertBefore(line, addBtn);
      line.querySelector('input').focus();
    });
    wrap.appendChild(addBtn);
    wrap.appendChild(rawJsonFallback(key, cur, 'json'));
    return wrap;
  }

function objFieldsControl(key, cur, shape){
    var wrap = document.createElement('div');
    wrap.className = 'rowsedit';
    var line = document.createElement('div');
    line.className = 'rowline' + ((shape.cols || []).some(function(col){return col.label;}) ? ' obj-fields' : '');
    var base = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? cur : {};
    var inputs = {};
    function commitObj(){
      var values = {};
      Object.keys(inputs).forEach(function(k){ values[k] = inputs[k].value; });
      var out = objFieldsCollect(shape, base, values);
      if (out.error){ formError(key + ': ' + out.error); return false; }
      formError('');
      var ok = commitSimple(key, out.obj ? JSON.stringify(out.obj) : null);
      if (ok) refreshFormSoon();
      return ok;
    }
    (shape.cols || []).forEach(function(col){
      var input = colInput(col, base[col.k]);
      if (col.kind === 'num') input.inputMode = 'decimal';
      wireCommit(input, commitObj);
      inputs[col.k] = input;
      if (col.label){
        var field=document.createElement('label'); field.className='obj-field'; field.textContent=col.label;
        field.appendChild(input); line.appendChild(field);
      } else line.appendChild(input);
    });
    wrap.appendChild(line);
    if (shape.hint){
      var hint=document.createElement('p'); hint.className='fnote'; hint.textContent=shape.hint; wrap.appendChild(hint);
    }
    wrap.appendChild(rawJsonFallback(key, cur, 'json'));
    return wrap;
  }

/* The extension boundary exposes live reads and existing controls/commands.
     Plugins cannot replace history, selection restoration, or JSON mutation. */
  function panelEditor(type){
    if (disposed || !type) return {};
    var factory=panelAuthoring(type).editor, cached=panelEditors[type];
    if(cached && cached.factory===factory) return cached.value;
    var context={
      source:function(){return session.text();}, target:function(){return session.target;},
      editingBlocked:function(){return !!modes.adding();}, parse:parseEditor,
      commit:commitSimple, transact:commitCascade, error:formError,
      refresh:refreshFormSoon, inspect:renderInspector, select:selectTarget,
      rehighlight:rehighlight, stepper:stepperFor,
      clipboard:function(){return clipboard();}, selectClipboard:function(target){if(!disposed)opts.clipboard.selectHome(target);},
      listen:function(target,type,fn,options){if(!disposed)return listen(target,type,fn,options);},
      onFormRetire:function(cleanup){if(disposed)cleanup();else formLife.own(cleanup);},
      clearClipboard:function(){if(!disposed)opts.clipboard.clearHome();},
      controls:{row:frow,block:frowBlock,action:actionButton,text:textControl,
        number:numberControl,select:selectControl,rows:rowsFieldControl}
    };
    var value=factory ? factory(context) : {};
    panelEditors[type]={factory:factory,value:value};return value;
  }

function panelEditorForTarget(target){
    if(disposed)return {};
    if(!target || ['panel','home'].indexOf(target.kind)<0) return {};
    var parsed=parseEditor();if(parsed.error)return {};
    var path=builderTargetPath(parsed.raw,{kind:'panel',section:target.section,index:target.index});
    var panel=path && specValueAt(parsed.raw,path);return panelEditor(panel && panel.type);
  }

function panelEditorForCard(card){
    if(disposed)return {};
    var section=card && card.closest('.doc-sec[data-dv-section]');
    return section ? panelEditorForTarget({kind:'panel',section:Number(section.getAttribute('data-dv-section')),index:Number(card.getAttribute('data-dv-panel'))}) : {};
  }

function panelSetupRows(val){
    var fields = PANEL_SETUP_FIELDS[val.type] || [['initial', 'json']];
    return fields.map(function(f){
      var key = f[0], kind = f[1], cur = val[key], editor=panelEditor(val.type);
      if(key==='initial' && panelAuthoring(val.type).initialFields)return panelPatchControl(val.id,val.initial || {},val,Object.assign({},session.target),{initial:true});
      var custom=editor.setupField && editor.setupField(f,val);
      if(custom) return custom;

      if (kind === 'text')
        return frow(key, textControl(cur, function(v){ return commitSimple(key, v == null ? null : JSON.stringify(v)); }));
      if (kind === 'num')
        return frow(key, numberControl(cur, function(v){ return commitSimple(key, v == null ? null : String(v)); }));

      if (kind === 'clock')
        return frow(key, textControl(cur, function(v){
          if (v != null && builderClockInvalid(v)){
            formError(key + ': "' + v + '" is not ' + BUILDER_CLOCK_HINT); return false;
          }
          return commitSimple(key, v == null ? null : JSON.stringify(v));
        }, {placeholder: '90s, 5m, 2h30m'}));
      if (kind === 'rows'){
        return frowBlock(key, rowsFieldControl(key, cur, f[2] || {cols: []}));
      }
      if (kind === 'map') return frowBlock(key, mapFieldControl(key, cur, f[2] || {}));
      if (kind === 'objf') return frowBlock(key, objFieldsControl(key, cur, f[2] || {cols: []}));
      if (kind === 'csv'){
        /* comma-separated entry is lossy for labels that CONTAIN commas —
           such lists fall back to JSON editing instead of being rewritten */
        var hasComma = Array.isArray(cur) && cur.some(function(s){
          return typeof s === 'string' && s.indexOf(',') >= 0;
        });
        if (hasComma) return frow(key, jsonFieldControl(key, cur, 'jsonArr'));
        return frow(key, textControl(Array.isArray(cur) ? cur.join(', ') : cur, function(v){
          if (v == null) return commitSimple(key, null);
          var list = v.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
          return commitSimple(key, list.length ? JSON.stringify(list) : null);
        }, {placeholder: 'A, B, C'}));
      }
      return frow(key, jsonFieldControl(key, cur, kind));
    });
  }

function panelForm(val, ctx){
    var t = session.target;
    var rows = [
      frow('id', textControl(val.id, function(v){
        if (v == null){ formError('a panel needs an id'); return false; }
        if (v === val.id){ formError(''); return true; }
        return commitCascade(function(raw){ return planRenamePanel(session.text(), raw, t.section, t.index, v); },
          {after: function(){ renderInspector(); }});
      }, {required: 'a panel needs an id'})),
      frow('type', selectControl(PANEL_TYPES, val.type, function(v){
        var ok = commitSimple('type', v == null ? null : JSON.stringify(v));
        if (ok) renderInspector(); /* the setup rows follow the type */
        return ok;
      })),
      frow('title', textControl(val.title, function(v){ return commitSimple('title', v == null ? null : JSON.stringify(v)); }))
    ];
    rows.push(frow('Presentation', selectControl(['Sidebar', 'Centerpiece'], ctx.diagram.primaryPanel === val.id ? 'Centerpiece' : 'Sidebar', function(v){
      return commitCascade(function(raw){ return planPrimaryPanel(session.text(), raw, t.section, v === 'Centerpiece' ? val.id : null); },
        {after:function(){ renderInspector(); }});
    })));
    var editor=panelEditor(val.type);
    if(editor.setupRows) editor.setupRows(val,ctx.diagram,t,rows);
    return rows.concat(panelSetupRows(val));
  }

function selectContract(section,card,kind,index){
    var t={section:section,kind:kind || 'contract',card:card,index:index};
    selectTarget(Object.assign(t,{el:findTargetEl(t)}),false);
  }
function addContract(section,copy){
    return commitCascade(function(raw){return planAddContract(session.text(),raw,section,copy);},
      {after:function(plan){selectContract(section,plan.card);}});
  }
function contractManager(section,val){
    var list=document.createElement('div');list.className='contract-manager';
    sectionContracts(val).forEach(function(rec){
      var width={4:'⅓',6:'½',8:'⅔',12:'full'}[contractColumnSpan(rec.value.span)];
      list.appendChild(actionButton((rec.value.title || 'On the wire')+' · '+width+' width',function(){selectContract(section,rec.key);}));
    });
    list.appendChild(actionButton('+ Add contract block',function(){addContract(section);}));
    return list;
  }
function contractForm(val,ctx){
    var t=session.target,widths={'Full width':12,'Half width':6,'Third width':4,'Two-thirds width':8};
    var selected=Object.keys(widths).find(function(label){return widths[label]===contractColumnSpan(val.span);});
    var widthControl=selectControl(Object.keys(widths),selected,function(v){return commitSimple('span',String(widths[v]));});
    widthControl.setAttribute('aria-label','Contract block width');
    return [
      frow('title',textControl(val.title,function(v){return commitSimple('title',v==null?null:JSON.stringify(v));})),
      frow('Width',widthControl),
      frow('source',textControl(val.source,function(v){return commitSimple('source',v==null?null:JSON.stringify(v));},{placeholder:'permalink URL'})),
      frowBlock('note',proseControl(val.note,function(v){return commitSimple('note',v==null?null:JSON.stringify(v));})),
      frowBlock('Fields',actionButton('+ Add field',function(){
        commitCascade(function(raw){return planAddContractField(session.text(),raw,t);},
          {after:function(plan){selectContract(t.section,t.card,'crow',plan.index);}});
      })),
      frowBlock('Section',actionButton('All contract blocks',function(){selectTarget({kind:'section',section:t.section,el:findTargetEl({kind:'section',section:t.section})},false);}))
    ];
  }
function sectionForm(val, ctx){
    ensureAccentDatalist();
    var target=session.target;
    function identity(key,value){return commitCascade(function(raw){return planSetSectionIdentity(session.text(),raw,target.section,key,value);});}
    return [
      frow('heading', textControl(val.heading, function(v){ return identity('heading',v); })),
      frowBlock('Contract blocks',contractManager(target.section,val)),
      frow('Stable section ID',textControl(val.id,function(v){return identity('id',v);},{placeholder:'optional stable-section-id'})),
      frow('Detail only',checkboxControl(val.detailOnly,function(on){return commitSimple('detailOnly',on?'true':null);})),
      frow('accent', textControl(val.accent, function(v){ return commitSimple('accent', v == null ? null : JSON.stringify(v)); },
        {list: accentListId, placeholder: 'token or #hex'})),
      frow('source', textControl(val.source, function(v){ return commitSimple('source', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'}))
    ];
  }

function proseControl(value,commit){
    var key=targetIdentity();if(proseDraft.key!==key)proseDraft={key:key,url:''};
    var draft=proseDraft;
    var wrap=document.createElement('div');wrap.className='prose-editor';
    var input=textControl(value,function(v){var ok=commit(v);if(ok)refreshFormSoon();return ok;},{textarea:true});
    if(draft.text===input.value && Number.isInteger(draft.start))input.setSelectionRange(draft.start,draft.end);
    function remember(){draft.text=input.value;draft.start=input.selectionStart;draft.end=input.selectionEnd;}
    ['select','keyup','mouseup','blur'].forEach(function(event){listen(input,event,remember);});
    input.setAttribute('aria-label','Prose text');
    var toolbar=document.createElement('div');toolbar.className='prose-toolbar';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Text formatting');
    function insert(kind,url){
      var edit=proseFormatEdit(input.value,input.selectionStart,input.selectionEnd,kind,url);
      if(edit.error){formError(edit.error);return;}
      input.value=edit.text;input.focus({preventScroll:true});input.setSelectionRange(edit.start,edit.end);
      remember();
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    function button(label,kind,url){
      var b=actionButton(label,function(){insert(kind,url && url.value.trim());});
      listen(b,'mousedown',function(event){event.preventDefault();});return b;
    }
    [['Bold','bold'],['Italic','italic'],['Code','code'],['Code block','block']].forEach(function(pair){toolbar.appendChild(button(pair[0],pair[1]));});
    wrap.appendChild(toolbar);wrap.appendChild(input);
    var link=document.createElement('div');link.className='prose-link';
    var url=document.createElement('input');url.type='url';url.className='fctl';url.placeholder='https://…';url.setAttribute('aria-label','Formatting link URL');
    url.value=draft.url;listen(url,'input',function(){draft.url=url.value;});
    link.appendChild(url);link.appendChild(button('Insert link','link',url));wrap.appendChild(link);
    return wrap;
  }

function bulletForm(val, ctx){
    var isObj = val != null && typeof val === 'object';
    var target=Object.assign({},session.target),snapshot=parseEditor(),rec=specSectionPaths(snapshot.raw)[target.section];
    var tree=specValueAt(snapshot.raw,rec.section.concat(['bullets'])),expected=JSON.stringify(tree);
    var rows = [
      frowBlock('text', proseControl(isObj ? val.text : val, function(v){
        var s = JSON.stringify(v == null ? '' : v);
        return isObj ? commitSimple('text', s) : commitValue(s);
      }))
    ];
    var actions=document.createElement('div');actions.className='prose-toolbar';
    var indices=builderBulletIndices(target),path=builderTargetPath(snapshot.raw,target),siblings=specValueAt(snapshot.raw,path.slice(0,-1)),index=indices[indices.length-1];
    [['Add sibling','sibling'],['Add subpoint','child'],['Indent','indent'],['Outdent','outdent'],['Move point up','up'],['Move point down','down']].forEach(function(pair){
      var button=actionButton(pair[0],function(){
        return commitCascade(function(raw){return planBulletStructure(session.text(),raw,target,pair[1],expected);},
          {after:function(plan){selectTarget(Object.assign({},plan.target,{el:findTargetEl(plan.target)}),false,true);}});
      });
      button.disabled=(pair[1]==='indent' || pair[1]==='up') && index===0 || pair[1]==='outdent' && indices.length===1 || pair[1]==='down' && index===siblings.length-1;
      actions.appendChild(button);
    });rows.push(actions);
    rows.push(visibilityControl(val,ctx));
    return rows;
  }

function paraForm(val, ctx){
    return [
      frowBlock('text', proseControl(val, function(v){
        return commitValue(JSON.stringify(v == null ? '' : v));
      }))
    ];
  }

function crowForm(val, ctx){
    var target=session.target;
    return [
      frowBlock('Block',actionButton('Edit contract block',function(){selectContract(target.section,target.card);})),
      frow('k', textControl(val.k, function(v){
        if (v == null){ formError('a contract row needs k — the field name'); return false; }
        return commitSimple('k', JSON.stringify(v));
      }, {required: 'a contract row needs k — the field name'})),
      frow('v', textControl(val.v, function(v){ return commitSimple('v', v == null ? null : JSON.stringify(v)); })),
      frowBlock('g', proseControl(val.g, function(v){ return commitSimple('g', v == null ? null : JSON.stringify(v)); })),
      frow('hot', checkboxControl(val.hot, function(on){ return commitSimple('hot', on ? 'true' : null); })),
      frow('delta', selectControl(['added', 'removed', 'changed'], val.delta, function(v){
        return commitSimple('delta', v == null ? null : JSON.stringify(v));
      }, true)),
      frow('link', textControl(val.link, function(v){ return commitSimple('link', v == null ? null : JSON.stringify(v)); }, {placeholder: 'permalink URL'})),
      visibilityControl(val,ctx)
    ];
  }

function tabForm(val, ctx){
    var t = session.target;
    return [
      frow('label', textControl(val.label, function(v){
        if (v == null){ formError('a tab needs a label'); return false; }
        /* capture BEFORE the commit whether this tab is the shown one —
           only then may the rename re-activate it (the engine restores
           the active tab by LABEL slug, so renaming the shown tab makes
           the re-render fall back to the first tab; a tab that was not
           shown must stay not shown) */
        var before = findTargetEl(t);
        var wasActive = !!(before && before.getAttribute('aria-selected') === 'true');
        var ok = commitSimple('label', JSON.stringify(v));
        if (ok && wasActive){
          var btn = findTargetEl(t);
          if (btn && btn.getAttribute('aria-selected') !== 'true') btn.click();
        }
        return ok;
      }, {required: 'a tab needs a label'})),
      frow('highlight', textControl(val.highlight === true ? 'true' : val.highlight, function(v){
        if (v == null) return commitSimple('highlight', null);
        return commitSimple('highlight', v === 'true' ? 'true' : JSON.stringify(v));
      }, {list: accentListId, placeholder: 'true, token, or #hex'}))
    ];
  }

function renderExtractionPreview(multiSel){
    var snapshot=parseEditor();
    if(snapshot.error){formError(snapshot.error);return;}
    var selected=multiSel.map(function(t){return {kind:t.kind,section:t.section,id:t.id};});
    var identity=multiIdentity(selected),previous=beginForm('extraction:'+identity),lifetime=formLife;
    var draft=null,draftKey=null,downloadedKey=null,downloadReleases=[],stale=false;
    var panel=document.createElement('div');panel.className='extraction-preview';guide.appendChild(panel);
    var heading=document.createElement('h3');heading.textContent='Create an independent domain';panel.appendChild(heading);
    function paragraph(text,cls){var p=document.createElement('p');p.className=cls || '';p.textContent=text;panel.appendChild(p);return p;}
    paragraph('Move '+selected.length+' selected nodes into their own diagram. The child starts with no steps; author its sequence independently.','extraction-intro');
    var form=document.createElement('div');form.className='iform';panel.appendChild(form);
    function field(label,value,placeholder,container){
      var input=document.createElement('input');input.type='text';input.className='fctl';input.value=value || '';
      if(placeholder)input.placeholder=placeholder;
      (container || form).appendChild(frow(label,input));listen(input,'input',updatePreview);listen(input,'change',updatePreview);return input;
    }
    var title=field('Domain title','New domain');
    var mode=document.createElement('select');mode.className='fctl';
    [['local','Local zoom'],['external','Separate document']].forEach(function(choice){
      var option=document.createElement('option');option.value=choice[0];option.textContent=choice[1];mode.appendChild(option);
    });
    mode.value='local';form.appendChild(frow('Destination',mode));listen(mode,'change',updatePreview);
    var destination=document.createElement('div');destination.className='extraction-destination';form.appendChild(destination);
    var url=field('Destination URL','','https://example.com/flow',destination);
    var spec=field('Spec ID','','Optional when a URL is supplied',destination);
    var revision=field('Revision','','Optional with a spec ID',destination);
    var section=field('Section ID','','With a spec ID; leave empty to generate',destination);
    var destinationHelp=document.createElement('p');destinationHelp.className='extraction-help';
    destinationHelp.textContent='Provide a URL or an approved spec ID. Revision and section ID require a spec ID, which needs a host resolver. Download this JSON, then save or publish it at that destination. Apply adds the parent handoff; it does not publish the child.';
    destination.appendChild(destinationHelp);
    var localHelp=paragraph('Local zoom adds a focused detail section in this document. Parent playback does not drive the child.','extraction-help');
    var error=document.createElement('div');error.className='gerr ierr';error.hidden=true;error.setAttribute('role','alert');panel.appendChild(error);
    var report=document.createElement('section');report.className='extraction-report';report.setAttribute('aria-label','Extraction preview');panel.appendChild(report);
    var status=paragraph('','extraction-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    var actions=document.createElement('div');actions.className='iacts extraction-actions';panel.appendChild(actions);
    var download=actionButton('Download destination JSON',function(){
      if(!ready())return;
      if(!opts.download){showError('Download is unavailable in this editor. The source is unchanged.');return;}
      try{
        var release=opts.download(specFileName(draft.plan.childSpec),draft.childText,'application/json');
        if(typeof release!=='function')throw new Error('The download could not be started.');
        downloadReleases.push(release);downloadedKey=draftKey;apply.disabled=false;
        status.textContent='Download requested. Save or publish this destination separately, then apply the parent handoff.';
      }catch(ex){showError('Download failed: '+(ex.message || String(ex)));}
    });
    actions.appendChild(download);
    var apply=actionButton('Apply extraction',function(){
      if(!ready())return;
      if(mode.value==='external' && downloadedKey!==draftKey){showError('Download the current destination JSON before applying its handoff.');return;}
      applyPlan(draft.plan,{after:function(plan){
        if(opts.selection.clear)opts.selection.clear();
        session.target={kind:'node',section:plan.section,id:plan.id};session.insertSection=plan.section;
        rehighlight();renderInspector();
      }},snapshot);
    },'extraction-apply');
    actions.appendChild(apply);
    function cancel(){
      var current=opts.selection.current?opts.selection.current():selected;
      if(current && current.length>1)renderMultiInspector(current);
      else if(session.target)renderInspector();else retire();
    }
    actions.appendChild(actionButton('Cancel',cancel));
    listen(panel,'keydown',function(ev){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancel();}});
    function releaseDownloads(){downloadReleases.splice(0).forEach(function(release){release();});}
    lifetime.own(releaseDownloads);
    function showError(message){error.textContent=message || '';error.hidden=!message;}
    function options(){
      var out={title:title.value.trim(),mode:mode.value};
      if(out.mode==='external'){
        out.handoff={};[['url',url],['spec',spec],['revision',revision],['section',section]].forEach(function(pair){
          var value=pair[1].value.trim();if(value)out.handoff[pair[0]]=value;
        });
      }
      return out;
    }
    function current(){
      var now=parseEditor(),targets=opts.selection.current?opts.selection.current():multiSel;
      return !stale && lifetime.alive() && now.project===snapshot.project && now.text===snapshot.text && multiIdentity(targets || [])===identity;
    }
    function invalidate(){
      stale=true;draft=null;downloadedKey=null;releaseDownloads();apply.disabled=true;download.disabled=true;
      showError('Source or selection changed. Cancel this preview and select the nodes again.');status.textContent='';
    }
    invalidateExtraction=invalidate;
    function ready(){
      if(!current()){invalidate();return false;}
      if(JSON.stringify(options())!==draftKey){updatePreview();showError('Settings changed. Review the updated preview before continuing.');return false;}
      if(draft)showError('');return !!draft;
    }
    function reportList(label,items){
      if(!items || !items.length)return;
      var heading=document.createElement('h4');heading.textContent=label+' ('+items.length+')';report.appendChild(heading);
      var list=document.createElement('ul');items.forEach(function(item){var li=document.createElement('li');li.textContent=item;list.appendChild(li);});report.appendChild(list);
    }
    function updatePreview(){
      if(!current()){invalidate();return;}
      var config=options(),key=JSON.stringify(config),external=config.mode==='external';
      destination.hidden=!external;localHelp.hidden=external;download.hidden=!external;
      if(key===draftKey)return;
      releaseDownloads();downloadedKey=null;draftKey=key;draft=null;apply.disabled=true;download.disabled=true;status.textContent='';report.innerHTML='';
      if(!config.title){showError('Give the domain a title.');return;}
      var plan=planExtractIndependentDiagram(snapshot.text,snapshot.raw,selected[0].section,selected.map(function(t){return t.id;}),config);
      if(plan.error){showError(plan.error);return;}
      showError('');draft={plan:plan,childText:JSON.stringify(plan.childSpec,null,2)+'\n'};
      var summary=document.createElement('p');summary.className='extraction-summary';
      summary.textContent=plan.report.movedNodes+' nodes · '+plan.report.internalEdges+' internal '+(plan.report.internalEdges===1?'edge':'edges')+' · 0 child steps';report.appendChild(summary);
      var location=document.createElement('p');location.className='extraction-help';location.textContent='Destination section: '+plan.sectionId;report.appendChild(location);
      reportList('Affected parent steps',plan.report.affectedSteps);
      reportList('Boundary links',plan.report.boundaryEdges);
      reportList('References',plan.report.references);
      reportList('Changes to review',plan.report.notes);
      download.disabled=false;apply.disabled=external;
      status.textContent=external?'Download the destination before replacing the selected nodes with a handoff.':'Ready to apply. This creates one Undo action.';
    }
    updatePreview();finishForm(previous);title.focus({preventScroll:true});
  }

function renderMultiInspector(multiSel){
    if(disposed)return;
    cancelRefresh();
    function applyBulkField(key,value){return applyPlan(planBulkSetField(session.text(),multiSel,key,value));}
    if (!guide || multiSel.length < 2) return;
    var previous=beginForm(multiIdentity(multiSel));
    var kind = multiSel[0].kind;
    var head = document.createElement('b');
    head.textContent = multiSel.length + ' ' + kind + 's selected';
    guide.appendChild(head);
    var p = document.createElement('span');
    p.className = 'gpath';
    p.textContent = 'shift-click adds/removes · Esc clears';
    guide.appendChild(p);
    var err = document.createElement('div');
    err.className = 'gerr ierr'; err.hidden = true;
    guide.appendChild(err);
    var form = document.createElement('div');
    form.className = 'iform';
    /* every control writes the SAME value to every selected element;
       an empty value removes the field from all of them */
    if (kind === 'node'){
      var parsed = parseEditor();
      var values = [], diagrams = [];
      if (!parsed.error) multiSel.forEach(function(t){
        var got = builderDiagram(session.text(), parsed.raw, t.section);
        if (!got.error){
          diagrams.push(got.d);
          values.push(((got.d.nodes || {})[t.id] || {}).group || '');
        }
      });
      ensureGroupDatalist(diagrams);
      var mixed = values.some(function(v){ return v !== values[0]; });
      form.appendChild(frow('group', groupControl(mixed ? null : values[0], function(v){
        return commitGroup(function(raw){ return planBulkSetGroup(session.text(), raw, multiSel, v); });
      }, {placeholder: mixed ? 'mixed — empty removes' : 'group key — empty removes', commitUnchanged: mixed})));
      form.appendChild(frow('tint', selectControl(['cmd', 'auth', 'data', 'mqtt', 'dev'], null, function(v){
        return applyBulkField('tint', v == null ? null : JSON.stringify(v));
      }, true)));
      form.appendChild(frow('icon', selectControl(
        ICON_SET, null, function(v){
        return applyBulkField('icon', v == null ? null : JSON.stringify(v));
      }, true)));
    }
    if (kind === 'edge'){
      form.appendChild(frow('kind', textControl(null, function(v){
        return applyBulkField('kind', v == null ? null : JSON.stringify(v));
      }, {placeholder: 'https | int | mqtt | declared protocol'})));
      form.appendChild(frow('ret', checkboxControl(false, function(on){
        return applyBulkField('ret', on ? 'true' : null);
      })));
    }
    if (kind === 'step'){
      form.appendChild(frow('lane', textControl(null, function(v){
        return applyBulkField('lane', v == null ? null : JSON.stringify(v));
      }, {placeholder: 'lane id from page.lanes — empty removes'})));
    }
    if (form.childNodes.length) guide.appendChild(form);
    var acts = document.createElement('div');
    acts.className = 'iacts';
    if(clipboard() && (kind === 'node' || kind === 'panel')){
      acts.appendChild(actionButton('Copy selected',function(){clipboard().copy(multiSel);}));
      acts.appendChild(actionButton('Duplicate selected',function(){clipboard().duplicate(multiSel);}));
    }
    if (kind === 'node' || kind === 'edge' || kind === 'step'){
      acts.appendChild(actionButton('mark delta', function(){ return applyBulkField('delta', 'true'); }));
      acts.appendChild(actionButton('clear delta', function(){ return applyBulkField('delta', null); }));
    }
    if (kind === 'node'){
      acts.appendChild(actionButton('Create domain from selected nodes',function(){
        if(multiSel.some(function(t){return t.section!==multiSel[0].section;})){
          formError('Choose nodes from a single section to create a domain.');return;
        }
        renderExtractionPreview(multiSel);
      }));
      acts.appendChild(actionButton('stack together', function(){
        var secs = {};
        multiSel.forEach(function(t){ secs[t.section] = true; });
        if (Object.keys(secs).length !== 1){
          formError('stacking needs nodes from a single section');
          return;
        }
        var sec = multiSel[0].section;
        var ids = multiSel.map(function(t){ return t.id; });
        commitGroup(function(raw){ return planStackNodes(session.text(), raw, sec, ids); });
      }));
    }
    acts.appendChild(actionButton('delete ' + multiSel.length + ' ' + kind + 's',
      opts.selection.removeMany, 'bdanger'));
    guide.appendChild(acts);
    finishForm(previous);
  }

function renderInspector(){
    if(disposed)return;
    cancelRefresh();
    invalidateEffectiveState=null;
    hideDiff();
    if (!guide || !session.target) return;
    var t = session.target;
    /* Same authored selection retains the form view; a new context starts fresh. */
    var previous=beginForm(targetIdentity());
    var g = BUILDER_GUIDES[t.kind] || {title: t.kind, how: '', fields: []};

    var head = document.createElement('b');
    head.textContent = g.title;
    guide.appendChild(head);

    var parsed = parseEditor();
    var path = parsed.error ? null : builderTargetPath(parsed.raw, t);
    var loc = path ? jsonLocate(session.text(), path) : null;

    var p = document.createElement(loc ? 'button' : 'span');
    p.className = 'gpath';
    p.textContent = path ? builderPathString(path) + (loc ? ' ↗ JSON' : '') : '';
    if (loc){
      var sourceAtSelection = session.text();
      p.type = 'button'; p.setAttribute('aria-label', 'Show selected element in JSON');
      formLife.listen(p,'click', function(){
        if (session.text() !== sourceAtSelection){ formError('Source changed. Click Render and reselect this element.'); return; }
        selectRange(loc, true);
      });
    }
    guide.appendChild(p);

    var posText = parsed.error ? null : builderPositionLine(parsed.raw, t);
    if (posText){
      var pos = document.createElement('span');
      pos.className = 'gpos';
      pos.textContent = posText;
      guide.appendChild(pos);
    }

    var err = document.createElement('div');
    err.className = 'gerr ierr'; err.hidden = true;
    guide.appendChild(err);

    if (parsed.error){
      formError(parsed.error + ' — fix it to edit this element');
    } else if (!loc && !(t.kind === 'group' && !builderDiagram(session.text(), parsed.raw, t.section).error)){
      formError('definition not found in the editor text — the render and the editor may be out of sync (click Render)');
    } else if (t.kind === 'section' && path.length === 0){
      formError('bare diagram — wrap it as {"page": {"blocks": [ ... ]}} to edit heading and accent');
    } else {
      var val = path ? specValueAt(parsed.raw, path) : {};
      if (val == null) val = {};
      var rec = specSectionPaths(parsed.raw)[t.section];
      var ctx = {
        page: normalize(parsed.raw) || {},
        diagram: rec ? specValueAt(parsed.raw, rec.diagram) : null
      };
      if (t.kind === 'step' && ctx.diagram && ctx.diagram.paths){
        var sharing = diagramPathList(ctx.diagram).filter(function(route){return route.indices.indexOf(t.index) >= 0;});
        if (sharing.length > 1){
          var sharedNote = document.createElement('p'); sharedNote.className = 'fnote shared-step-note';
          sharedNote.textContent = 'Shared step — edits apply to: ' + sharing.map(function(route){return route.label;}).join(', ') + '.';
          guide.appendChild(sharedNote);
          var independent = actionButton('Make independent here', function(){ modes.editPathStep('independent'); });
          independent.disabled = !!modes.adding() || !!modes.connecting(); guide.appendChild(independent);
        }
      }
      if(t.kind==='node'){
        var connectButton=actionButton('Connect from this node',function(){modes.connectFrom(t);});
        connectButton.className+=' node-connect-button';connectButton.title='Alt/Option-click a node, then click its destination';
        guide.appendChild(connectButton);
        var connectTip=document.createElement('p');connectTip.className='fnote';
        connectTip.textContent='Shortcut: Alt/Option-click this node, then click a destination. Escape cancels.';guide.appendChild(connectTip);
      }
      var form = document.createElement('div');
      form.className = 'iform';
      if (t.kind === 'tab') ensureAccentDatalist();
      var rows =
        t.kind === 'group' ? groupForm(val, ctx) :
        t.kind === 'node' ? nodeForm(val, ctx) :
        t.kind === 'edge' ? edgeForm(val, ctx) :
        t.kind === 'step' ? stepForm(val, ctx) :
        t.kind === 'panel' ? panelForm(val, ctx) :
        t.kind === 'bullet' ? bulletForm(val, ctx) :
        t.kind === 'para' ? paraForm(val, ctx) :
        t.kind === 'crow' ? crowForm(val, ctx) :
        t.kind === 'contract' ? contractForm(val,ctx) :
        t.kind === 'tab' ? tabForm(val, ctx) : sectionForm(val, ctx);
      rows.forEach(function(r){ form.appendChild(r); });
      guide.appendChild(form);

      var acts = document.createElement('div');
      acts.className = 'iacts';
      if(clipboard() && ['node','section','panel'].indexOf(t.kind)>=0){
        acts.appendChild(actionButton('Copy '+t.kind,function(){clipboard().copy([t]);}));
        acts.appendChild(actionButton('Paste…',function(){opts.clipboard.clearHome();clipboard().open();}));
        if(t.kind === 'panel')acts.appendChild(actionButton('Duplicate panel',function(){clipboard().duplicate([t]);}));
      }
      if (t.kind === 'node'){
        if(!val.detail && val.handoff==null)acts.appendChild(actionButton('Create detail flow',function(){
          commitCascade(function(raw){return planCreateNodeDetail(session.text(),raw,t.section,t.id);},
            {after:function(plan){
              session.target={section:plan.index,kind:'section'};session.insertSection=plan.index;
              rehighlight();renderInspector();
            }});
        }));
        acts.appendChild(actionButton('duplicate', function(){
          commitCascade(function(raw){ return planDuplicateNode(session.text(), raw, t.section, t.id); },
            {after: function(plan){
              session.target = {section: t.section, kind: 'node', id: plan.id};
              renderInspector();
            }});
        }));
      }
      if(t.kind==='contract'){
        acts.appendChild(actionButton('Duplicate block',function(){addContract(t.section,val);}));
        var contracts=sectionContracts(specValueAt(parsed.raw,rec.section)),ci=contracts.findIndex(function(c){return c.key===(t.card==null?'legacy':String(t.card));});
        [-1,1].forEach(function(delta){
          var move=actionButton(delta<0?'↑ Move earlier':'↓ Move later',function(){
            commitCascade(function(raw){return planMoveContract(session.text(),raw,t,delta);},
              {after:function(plan){selectContract(t.section,plan.card);}});
          });
          move.disabled=ci+delta<0 || ci+delta>=contracts.length;acts.appendChild(move);
        });
      }
      if (t.kind === 'section'){
        acts.appendChild(actionButton('duplicate', function(){
          commitCascade(function(raw){ return planDuplicateSection(session.text(), raw, t.section); },
            {after: function(plan){
              session.target = {section: plan.index, kind: 'section'};
              session.insertSection = plan.index;
              renderInspector();
            }});
        }));
        /* the plan hands back the section's new LIST slot; the flat ordinal
           is recomputed because moving over a tabs container hops all of
           its sections at once */
        var moveSection = function(delta){
          commitCascade(function(raw){ return planMoveSection(session.text(), raw, t.section, delta); },
            {after: function(plan){
              var parsed = parseEditor();
              if (!parsed.error){
                var key = JSON.stringify(plan.newPath);
                specSectionPaths(parsed.raw).forEach(function(rec, i){
                  if (JSON.stringify(rec.section) === key) t.section = i;
                });
              }
              session.target = {section: t.section, kind: 'section'};
              session.insertSection = t.section;
              rehighlight();
              renderInspector();
              flashPositionLine();
            }});
        };
        acts.appendChild(actionButton('↑ move up', function(){ moveSection(-1); }));
        acts.appendChild(actionButton('↓ move down', function(){ moveSection(1); }));
      }
      if (t.kind === 'tab'){
        acts.appendChild(actionButton('+ tab', function(){
          commitCascade(function(raw){ return planAddTab(session.text(), raw, t.block, t.tab); },
            {after: function(plan){
              session.target = {kind: 'tab', block: plan.block, tab: plan.index};
              renderInspector();
            }});
        }));
        acts.appendChild(actionButton('← move left', function(){
          commitCascade(function(raw){ return planMoveTab(session.text(), raw, t.block, t.tab, -1); },
            {after: function(plan){ t.tab = plan.index; renderInspector(); flashPositionLine(); }});
        }));
        acts.appendChild(actionButton('→ move right', function(){
          commitCascade(function(raw){ return planMoveTab(session.text(), raw, t.block, t.tab, 1); },
            {after: function(plan){ t.tab = plan.index; renderInspector(); flashPositionLine(); }});
        }));
      }
      var armedHere = !!(modes.adding() && t.kind === 'step' &&
                         modes.adding().section === t.section && modes.adding().step === t.index);
      if (t.kind === 'step'){
        acts.appendChild(actionButton(armedHere ? '✕ DONE adding (Esc)' : 'ADD TO STEP', function(){
          modes.toggleAdding(t);
        }, armedHere ? 'bexit-inline' : ''));
      }
      if (t.kind === 'step' && !armedHere){
        if (ctx.diagram && ctx.diagram.paths){
          var removeHere = actionButton('Remove from this path', function(){ modes.editPathStep('remove'); });
          var selectedPath = diagramPathList(ctx.diagram).find(function(p){ return p.id === (stepperFor(t.section) && stepperFor(t.section).path()); });
          removeHere.disabled = !!modes.connecting() || !selectedPath || selectedPath.indices.length <= 1;
          acts.appendChild(removeHere);
        }
        acts.appendChild(actionButton('duplicate step', function(){
          commitCascade(function(raw){ return planDuplicateStep(session.text(), raw, t.section, t.index, stepperFor(t.section) && stepperFor(t.section).path()); },
            {after:function(plan){ t.index = plan.index; renderInspector(); flashPositionLine(); }});
        }));
        acts.appendChild(actionButton('↑ move up', function(){
          commitCascade(function(raw){ return planMoveStep(session.text(), raw, t.section, t.index, -1, stepperFor(t.section) && stepperFor(t.section).path()); },
            {after: function(plan){ t.index = plan.index; renderInspector(); flashPositionLine(); }});
        }));
        acts.appendChild(actionButton('↓ move down', function(){
          commitCascade(function(raw){ return planMoveStep(session.text(), raw, t.section, t.index, 1, stepperFor(t.section) && stepperFor(t.section).path()); },
            {after: function(plan){ t.index = plan.index; renderInspector(); flashPositionLine(); }});
        }));
      }
      if (!armedHere)
        acts.appendChild(actionButton(t.kind === 'step' && ctx.diagram && ctx.diagram.paths ? 'Delete from all paths' : t.kind==='contract'?'Delete block':'delete ' + t.kind, opts.selection.remove, 'bdanger' + (t.kind === 'group' ? ' groupctl' : '')));
      guide.appendChild(acts);
    }

    /* the pass-1 field guidance, tucked under a details fold */
    var help = document.createElement('details');
    help.className = 'ihelp';
    var sum = document.createElement('summary');
    sum.textContent = 'field help';
    help.appendChild(sum);
    var how = document.createElement('div');
    how.textContent = g.how;
    help.appendChild(how);
    var ul = document.createElement('ul');
    g.fields.forEach(function(f){
      var li = document.createElement('li');
      var c = document.createElement('code');
      c.textContent = f[0];
      li.appendChild(c);
      li.appendChild(document.createTextNode(' — ' + f[1]));
      ul.appendChild(li);
    });
    help.appendChild(ul);
    if (g.tokens){
      var tok = document.createElement('div');
      tok.className = 'gtokens'; tok.textContent = g.tokens;
      help.appendChild(tok);
    }
    guide.appendChild(help);
    finishForm(previous);
  }


  function refreshCatalog(){
    if(disposed || !session.target || session.target.kind!=='node')return;
    var active=document.activeElement;
    if(active && guide && guide.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
      formLife.listen(active,'blur',refreshFormSoon,{once:true});
    else refreshFormSoon();
  }

  return {
    render:renderInspector,renderMulti:renderMultiInspector,refresh:refreshFormSoon,refreshCatalog:refreshCatalog,retire:function(){if(!disposed)retire();},
    sourceChanged:function(){if(disposed)return;cancelRefresh();if(invalidateEffectiveState)invalidateEffectiveState();if(invalidateExtraction)invalidateExtraction();},
    message:inspectorMessage,error:formError,commit:commitSimple,transact:commitCascade,
    panel:panelEditor,panelForTarget:panelEditorForTarget,panelForCard:panelEditorForCard,
    busy:function(view){return !disposed && Object.keys(panelEditors).some(function(type){var editor=panelEditors[type].value;return editor.busy && editor.busy(view,guide);});},
    destroy:function(){if(disposed)return;disposed=true;try{retire();}finally{formLife.destroy();panelEditors=Object.create(null);if(guide)guide.innerHTML='';}}
  };
}

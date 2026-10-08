/* Layout controls use the pure commands assembled before the builder. */
/* Bind visibility to explicit tile identities, independently of the placement
   selector. Labels identify both the element and the layout being edited. */
function sectionLayoutVisibilityControl(doc,d,items,name,onChange,listen,contentTiles){
  listen=listen || function(target,type,fn){target.addEventListener(type,fn);};
  var group=doc.createElement('fieldset');group.className='layout-visibility';
  var legend=doc.createElement('legend');legend.textContent='Visible elements · '+name;group.appendChild(legend);
  var tiles=sectionLayoutTiles(d).concat(contentTiles || []);
  tiles.forEach(function(tile){
    var item=items.find(function(it){return sectionLayoutKey(it)===tile.key;}) || (contentTiles || []).find(function(it){return it.key===tile.key;});
    if(!item || tile.key==='steps')return;
    var title=tile.title;
    if(tile.panel && tiles.filter(function(t){return t.title===title;}).length>1)title+=' ('+tile.panel+')';
    var label=doc.createElement('label'),input=doc.createElement('input'),text=doc.createElement('span');
    input.type='checkbox';input.checked=!item.hidden;
    input.setAttribute('data-layout-visibility',tile.key);
    input.setAttribute('aria-label','Show '+title+' in '+name);
    listen(input,'change',function(){onChange(tile.key,input.checked);});
    text.textContent=title;label.appendChild(input);label.appendChild(text);group.appendChild(label);
  });
  if(tiles.some(function(tile){return tile.key==='steps';})){
    var note=doc.createElement('span');note.className='layout-visibility-note';note.textContent='Step controls stay visible.';group.appendChild(note);
  }
  return group;
}
function initSectionLayoutEditor(opts){
  var life=createWorkbenchLifetime(),sections=new Map(),controlsLife=life;
  function clearSections(){var old=Array.from(sections.values());sections.clear();var cleanup=createWorkbenchLifetime();old.forEach(function(rec){cleanup.own(function(){rec.fields.destroy();});cleanup.own(function(){rec.viewFields.destroy();});cleanup.own(function(){rec.life.destroy();});});cleanup.destroy();}
  life.own(clearSections);
  function sectionScope(section){
    var rec=sections.get(section);if(!rec){rec={life:createWorkbenchLifetime(),fields:createWorkbenchLifetime(),viewFields:createWorkbenchLifetime(),optionsOpen:false};sections.set(section,rec);}return rec;
  }
  var view=opts.view,editing=null,drag=null,selected='diagram',profile='default',pathsOpen=false,stepsOpen=false,widths={backstage:1080,confluence:760};
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}
  function button(label,fn){var b=el('button','bbtn',label);b.type='button';controlsLife.listen(b,'click',fn);return b;}
  var toolbar=el('div','layout-preview-tools'),label=el('label',null,'Preview '),target=el('select');
  target.id='layout-preview-target';target.setAttribute('aria-label','Preview host');
  [['default','Responsive'],['backstage','Backstage'],['confluence','Confluence']].forEach(function(v){var o=el('option',null,v[1]);o.value=v[0];target.appendChild(o);});
  label.appendChild(target);toolbar.appendChild(label);
  var widthLabel=el('label',null,'Width '),width=el('input');width.type='number';width.min='320';width.max='1920';width.step='10';width.setAttribute('aria-label','Preview width in pixels');widthLabel.appendChild(width);toolbar.appendChild(widthLabel);
  var note=el('span','fnote');note.setAttribute('role','status');toolbar.appendChild(note);
  var stage=el('div','layout-preview-stage'),frame=el('div','layout-preview-frame');
  var appearance=document.getElementById('workspace-appearance-body');
  if(appearance)appearance.appendChild(toolbar);else view.parentNode.insertBefore(toolbar,view);
  view.parentNode.insertBefore(stage,view);stage.appendChild(frame);frame.appendChild(view);
  function feedback(text){note.textContent=text;note.title=text;}
  function rawDiagram(index){
    try{var raw=JSON.parse(opts.src.value),rec=specSectionPaths(raw)[index];return rec&&specValueAt(raw,rec.diagram);}catch(ex){return null;}
  }
  function ready(){
    if(opts.renderedText && opts.renderedText()!==opts.src.value){feedback('Render the current JSON before arranging the section.');return false;}
    if(opts.locked && opts.locked()){feedback('Finish the current diagram editing action first.');return false;}
    return true;
  }
  function persist(index,items,expectedLayout){
    if(!ready())return false;
    if(expectedLayout!==undefined && expectedLayout!==activeLayout(index)){feedback('The selected layout changed. Use its current visibility controls.');return false;}
    var ok=opts.commit(index,profile,items,activeLayout(index));if(ok)feedback('Saved '+profile+' chapter arrangement · Undo restores the previous arrangement.');
    return ok;
  }
  function presentation(index){
    var ctl=opts.ctl && opts.ctl(),rec=ctl && ctl.sections.find(function(r){return r.number===index+1;});
    return rec && rec.presentation;
  }
  function activeLayout(index){var p=presentation(index);return p && p.layoutId?p.layoutId():undefined;}
  function selectedView(index){var p=presentation(index);return p && p.viewId?p.viewId():'flow';}
  function currentItems(index,d){return sectionLayoutItems(d || rawDiagram(index),profile,activeLayout(index));}
  function forceLayout(index){
    var p=presentation(index);if(!p)return;
    if(p.setLayoutTarget)p.setLayoutTarget(profile);
    p.setMode('layout');
  }
  function viewSettings(section,d){
    var host=section.querySelector('.section-viewport>.diagram-views');if(!host)return;
    var rec=sectionScope(section),row=host.querySelector('.section-view-settings');if(row && row.querySelector('details'))rec.optionsOpen=row.querySelector('details').open;
    rec.viewFields.destroy();rec.viewFields=createWorkbenchLifetime();var fieldLife=rec.viewFields;controlsLife=fieldLife;
    if(!row){row=el('div','section-view-settings');row.setAttribute('role','group');row.setAttribute('aria-label','Chapter settings');host.appendChild(row);}
    row.replaceChildren();
    var index=Number(section.getAttribute('data-dv-section')),id=selectedView(index),definition=diagramLayoutViews(d).find(function(v){return v.id===id || v.legacy && id==='layout';});
    function current(){return row.isConnected && ready() && selectedView(index)===id;}
    function activate(nextId){var p=presentation(index);if(p && p.setLayout)p.setLayout(nextId);refresh();}
    var choices=host.querySelector('.diagram-view-choice');
    if(choices){choices.setAttribute('role','group');choices.setAttribute('aria-label','Chapters');}
    if(choices && !choices.querySelector('.workbench-views-label'))choices.prepend(el('span','workbench-views-label','Chapters'));
    function focusControl(selector){
      var next=view.querySelector('[data-dv-section="'+index+'"] .section-view-settings '+selector);if(!next)return;
      var options=next.closest('details');if(options){options.open=true;sectionScope(next.closest('.doc-sec')).optionsOpen=true;syncNavigationPopover(options);}
      next.focus({preventScroll:true});
    }
    var label=el('label',null,'Viewing mode '),select=el('select');select.setAttribute('aria-label','Viewing mode');
    [['standard','Standard'],['explore','Explore']].forEach(function(choice){var option=el('option',null,choice[1]);option.value=choice[0];select.appendChild(option);});
    select.value=definition?definition.presentation:'standard';select.title='Standard uses a curated page layout. Explore uses the full canvas. The selected chapter keeps this viewing mode in the editor and built HTML.';
    fieldLife.listen(select,'change',function(){
      if(!current()){select.value=definition?definition.presentation:'standard';return;}
      cancel();var nextId=opts.setPresentation(index,id,select.value);if(nextId){activate(nextId);focusControl('[aria-label="Viewing mode"]');}
    });label.appendChild(select);
    var openingId=d.layouts && d.layouts.length?sectionLayoutDefinition(d).id:d.sectionLayout?'layout':d.primaryPanel?'home':'flow';
    var isDefault=openingId===id;
    var opening=button(isDefault?'Opening chapter':'Make opening chapter',function(){if(current()){var nextId=opts.makeDefault(index,id);if(nextId)activate(nextId);}});
    opening.disabled=isDefault;opening.title=isDefault?'This Chapter opens first in the built HTML.':'Open this Chapter first in the built HTML.';
    var options=el('details','section-view-options');options.open=rec.optionsOpen;options.appendChild(el('summary',null,'Chapter'));
    fieldLife.listen(options,'toggle',function(){if(options.isConnected)rec.optionsOpen=options.open;});
    var body=el('div','section-view-options-body'),nameLabel=el('label',null,'Chapter name '),name=el('input');name.type='text';name.maxLength=40;
    name.setAttribute('aria-label','Chapter name');name.value=definition?definition.name:(id==='home'?'Home':'Data flow');
    name.disabled=!definition || definition.legacy;
    function renameView(){if(!name.disabled && definition && current() && name.value!==definition.name && opts.rename(index,name.value,id))focusControl('[aria-label="Chapter name"]');}
    fieldLife.listen(name,'keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();renameView();}});
    body.appendChild(label);
    var diagramLabel=el('label','chapter-diagram-visibility'),diagramCheck=el('input');diagramCheck.type='checkbox';
    diagramCheck.setAttribute('aria-label','Show diagram in this chapter');diagramCheck.title='Save this choice for every host profile in this chapter.';
    var p=presentation(index),diagramShown=p && p.diagramVisible?p.diagramVisible():id!=='home';diagramCheck.checked=diagramShown;
    diagramLabel.appendChild(diagramCheck);diagramLabel.appendChild(el('span',null,'Show diagram in this chapter'));body.appendChild(diagramLabel);
    fieldLife.listen(diagramCheck,'change',function(){
      if(!current()){diagramCheck.checked=diagramShown;return;}
      cancel();var nextId=opts.setDiagramVisibility(index,id,diagramCheck.checked);
      if(nextId){activate(nextId);focusControl('[aria-label="Show diagram in this chapter"]');}else diagramCheck.checked=diagramShown;
    });
    body.appendChild(opening);nameLabel.appendChild(name);body.appendChild(nameLabel);
    var rename=button('Rename chapter',renameView);rename.disabled=name.disabled;body.appendChild(rename);
    body.appendChild(button('Duplicate chapter',function(){
      if(!current())return;rec.optionsOpen=true;
      var nextId=opts.duplicate(index,id);if(!nextId)return;
      var p=presentation(index);if(p && p.setLayout)p.setLayout(nextId);refresh();
      var nextSection=view.querySelector('[data-dv-section="'+index+'"]');if(!nextSection)return;
      var nextOptions=nextSection.querySelector('.section-view-options');if(nextOptions){nextOptions.open=true;sectionScope(nextSection).optionsOpen=true;}
      var nextName=nextSection.querySelector('.section-view-settings [aria-label="Chapter name"]');if(nextName){nextName.focus({preventScroll:true});nextName.select();}
    }));
    if(definition && !definition.legacy)body.appendChild(button('Delete chapter',function(){if(current()){editing=null;opts.remove(index,id);refresh();}}));
    body.appendChild(button('Arrange chapter and saved visibility…',function(){options.open=false;rec.optionsOpen=false;syncNavigationPopover(options);var arrange=section.querySelector('[data-arrange-toggle]');if(arrange)arrange.click();}));
    var auto=button('Auto arrange',function(){options.open=false;rec.optionsOpen=false;syncNavigationPopover(options);document.getElementById('auto-arrange').click();});body.appendChild(auto);
    if(definition && definition.presentation==='explore'){
      body.appendChild(button('Use current camera as opening view',function(){if(!current())return;var ctl=opts.ctl(),record=ctl.sections.find(function(r){return r.number===index+1;});var next=JSON.parse(JSON.stringify(definition.exploreLayout || {}));next.camera=record.viewport.currentCamera();opts.setExploreLayout(index,id,next);}));
      body.appendChild(button('Reset opening camera',function(){if(!current())return;var next=JSON.parse(JSON.stringify(definition.exploreLayout || {}));delete next.camera;opts.setExploreLayout(index,id,next);}));
    }
    fieldLife.listen(options,'keydown',function(ev){if(!((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase()==='z'))ev.stopPropagation();if(ev.key==='Escape'){ev.preventDefault();options.open=false;options.querySelector('summary').focus();}});
    body.appendChild(el('p','fnote','Chapters share the same story and steps. Each chapter saves its viewing mode, arrangement and opening choice.'));
    options.appendChild(body);row.appendChild(options);
    fieldLife.listen(row,'click',function(ev){ev.stopPropagation();});fieldLife.listen(row,'pointerdown',function(ev){ev.stopPropagation();});
    section.dispatchEvent(new CustomEvent('workbench-navigation-refresh',{bubbles:true}));
  }
  var appearanceMenu=document.getElementById('workspace-appearance');
  document.querySelector('.workspace-save').prepend(appearanceMenu);
  function updateTarget(){width.disabled=target.value==='default';width.value=target.value==='default'?'':widths[target.value];}
  life.listen(target,'change',updateTarget);
  life.listen(width,'change',function(){
    cancel();var n=Number(width.value);if(!Number.isFinite(n))n=760;
    widths[target.value]=Math.max(320,Math.min(1920,Math.round(n)));
  });
  function paint(grid,items){
    var d=rawDiagram(Number(grid.closest('.doc-sec').getAttribute('data-dv-section')));
    grid.querySelectorAll('.section-layout-tile').forEach(function(tile){
      var item=items.find(function(it){return sectionLayoutKey(it)===tile.getAttribute('data-layout-key');});if(!item)return;
      tile.style.setProperty('--tile-x',item.x+1);tile.style.setProperty('--tile-y',item.y+1);tile.style.setProperty('--tile-w',item.w);tile.style.setProperty('--tile-h',item.h);
      if(d && tile.classList.contains('layout-has-attached-controls'))tile.style.setProperty('--attached-controls-height',(sectionLayoutControlsRows(d,items)*40-8)+'px');
    });
  }
  function cancel(){
    if(!drag)return;var prior=drag;drag=null;paint(prior.grid,prior.items);
    if(prior.handle.hasPointerCapture(prior.pointer))prior.handle.releasePointerCapture(prior.pointer);
    prior.grid.classList.remove('layout-dragging');
    prior.grid.style.minHeight=prior.minHeight;
  }
  function fields(section,d){
    var rec=sectionScope(section);rec.fields.destroy();rec.fields=createWorkbenchLifetime();var fieldLife=rec.fields;controlsLife=fieldLife;
    var row=section.querySelector('.section-arrange-fields');if(!row)return;row.replaceChildren();
    var index=Number(section.getAttribute('data-dv-section')),id=activeLayout(index),definition=sectionLayoutDefinition(d,id);
    var items=currentItems(index,d);if(!items)return;
    var explore=definition && definition.presentation==='explore';
    if(explore)row.appendChild(el('p','fnote','Drag floating panel or Section notes headers, or the step grip, to move; drag corners to resize. Pan and zoom the graph. Changes save to this Chapter with Undo. Hide panels is temporary; use Visible elements below to save visibility.'));
    var dock=sectionLayoutDock(items);
    if(!explore){if(dock && selected==='steps')selected=dock;
    var choose=el('select');choose.setAttribute('aria-label','Layout element');
    sectionLayoutTiles(d).filter(function(t){return !(dock && t.key==='steps') && items.some(function(it){return sectionLayoutKey(it)===t.key;});}).forEach(function(t){var o=el('option',null,t.title);o.value=t.key;choose.appendChild(o);});
    if(!items.some(function(it){return sectionLayoutKey(it)===selected;}))selected='diagram';choose.value=selected;
    fieldLife.listen(choose,'change',function(){selected=choose.value;fields(section,d);});row.appendChild(choose);
    var item=items.find(function(it){return sectionLayoutKey(it)===selected;}),inputs={};
    [['x','Column',1,SECTION_LAYOUT_COLUMNS],['y','Row',1,501],['w','Width',1,SECTION_LAYOUT_COLUMNS],['h','Height',3,40]].forEach(function(f){
      var l=el('label',null,f[1]+' '),input=el('input');input.type='number';input.min=f[2];input.max=f[3];input.step='1';input.value=item[f[0]]+(f[0]==='x'||f[0]==='y'?1:0);input.setAttribute('aria-label',f[1]);inputs[f[0]]=input;l.appendChild(input);row.appendChild(l);
    });
    row.appendChild(button('Apply size / position',function(){
      var next=items.map(function(it){return Object.assign({},it);}),it=next.find(function(v){return sectionLayoutKey(v)===selected;});
      Object.keys(inputs).forEach(function(k){it[k]=Number(inputs[k].value)-(k==='x'||k==='y'?1:0);});
      var warnings=[];sectionLayoutWarnings(Object.assign({},d,{sectionLayout:{columns:24,default:next}}),'diagram',warnings);
      if(warnings.length){feedback(warnings[0]);return;}
      persist(Number(section.getAttribute('data-dv-section')),sectionLayoutPack(next,selected));
    }));
    }
    var contentTiles=explore && section.querySelector('.sec-prose')?[{key:'prose',title:'Section notes',hidden:!!(definition.exploreLayout.prose && definition.exploreLayout.prose.hidden)}]:[];
    var visibility=sectionLayoutVisibilityControl(document,d,items,definition?definition.name:'Layout',function(key,visible){
      if(key==='prose'){
        if(!ready() || activeLayout(index)!==id)return;
        var current=sectionLayoutDefinition(rawDiagram(index),id),next=JSON.parse(JSON.stringify(current.exploreLayout || {}));
        next.prose=Object.assign({},next.prose || {},{hidden:!visible});
        opts.setExploreLayout(index,id,next);return;
      }
      var next=items.map(function(it){var copy=Object.assign({},it);if(sectionLayoutKey(it)===key){if(visible)delete copy.hidden;else copy.hidden=true;}return copy;});
      persist(index,next,id);
    },fieldLife.listen,contentTiles);
    row.insertBefore(visibility,row.firstChild);
    if(sectionLayoutTiles(d).some(function(t){return t.key==='steps';})){
      if(!explore){
      var coupling=el('label',null,'Step controls '),attach=el('select');attach.setAttribute('aria-label','Attach step controls to');
      [{key:'',title:'Detached'}].concat(sectionLayoutTiles(d).filter(function(t){return t.key==='diagram' || panelCapability(t.type,'attachControls',false);})).forEach(function(t){var o=el('option',null,t.key?'Attached to '+t.title:t.title);o.value=t.key;attach.appendChild(o);});
      var controls=items.find(function(it){return it.controls==='steps';});attach.value=controls?controls.attachTo || '':'diagram';
      fieldLife.listen(attach,'change',function(){persist(index,sectionLayoutAttach(d,items,attach.value),id);});coupling.appendChild(attach);row.appendChild(coupling);
      if(dock || !controls){
        var heightLabel=el('label',null,'Attached controls height '),height=el('input');
        var host=items.find(function(it){return sectionLayoutKey(it)===(dock || 'diagram');}),current=sectionLayoutControlsRows(d,items);
        height.type='number';height.min='3';height.max=String(host?Math.min(40,current+40-host.h):40);height.step='1';height.value=current;height.setAttribute('aria-label','Attached controls height in rows');
        heightLabel.appendChild(height);row.appendChild(heightLabel);
        row.appendChild(button('Apply controls height',function(){
          if(!height.checkValidity() || !height.value){feedback('Use a whole number from 3 to '+height.max+' rows for the attached controls.');return;}
          persist(index,sectionLayoutResizeControls(d,items,Number(height.value)),id);
        }));
        row.appendChild(el('span','fnote','Controls scroll when text is longer. Resizing them preserves the visualization height.'));
      }
      if(controls && controls.attachTo && !dock)row.appendChild(el('span','fnote','Attachment panel is hidden; controls are shown separately.'));
      }
      if(definition && !definition.legacy){
        if(Array.isArray(d.paths) && d.paths.length>1){
          var pathDetail=el('details','layout-step-selection');pathDetail.open=pathsOpen;
          var pathCount=definition.paths?definition.paths.length:d.paths.length;
          pathDetail.appendChild(el('summary',null,'Paths shown in this Chapter · '+(definition.paths?pathCount+' selected':'All '+pathCount)));
          fieldLife.listen(pathDetail,'toggle',function(){if(pathDetail.isConnected)pathsOpen=pathDetail.open;});
          pathDetail.appendChild(el('p','fnote','Hidden paths stay in the shared story, but readers cannot select or play them in this Chapter.'));
          pathDetail.appendChild(button('Show all paths',function(){if(ready() && activeLayout(index)===id)opts.paths(index,id,null);}));
          var pathList=el('div','layout-step-options');
          d.paths.forEach(function(path){
            var label=el('label'),input=el('input');input.type='checkbox';input.checked=!definition.paths || definition.paths.indexOf(path.id)>=0;
            input.disabled=input.checked && pathCount===1;input.setAttribute('data-view-path',path.id);input.setAttribute('aria-label','Show path '+(path.label || path.id)+' in '+definition.name);
            label.appendChild(input);label.appendChild(el('span',null,path.label || path.id));
            fieldLife.listen(input,'change',function(){
              if(!ready() || activeLayout(index)!==id)return;
              var ids=Array.prototype.filter.call(pathList.querySelectorAll('input'),function(box){return box.checked;}).map(function(box){return box.getAttribute('data-view-path');});
              if(!opts.paths(index,id,ids))fields(section,d);
            });pathList.appendChild(label);
          });pathDetail.appendChild(pathList);row.appendChild(pathDetail);
        }
        var detail=el('details','layout-step-selection');detail.open=stepsOpen;
        var count=definition.steps?definition.steps.length:(d.steps || []).length;
        detail.appendChild(el('summary',null,'Steps shown in this Chapter · '+(definition.steps?count+' selected':'All '+count)));
        fieldLife.listen(detail,'toggle',function(){if(detail.isConnected)stepsOpen=detail.open;});
        detail.appendChild(el('p','fnote','Skipped steps still affect the story. Each path plays only its selected stops, in story order.'));
        detail.appendChild(button('Show all steps',function(){if(ready() && activeLayout(index)===id)opts.steps(index,id,null);}));
        var list=el('div','layout-step-options');
        (d.steps || []).forEach(function(st,i){
          var label=el('label'),input=el('input');input.type='checkbox';input.checked=!definition.steps || definition.steps.indexOf(st.id)>=0;
          input.disabled=input.checked && count===1;input.setAttribute('data-view-step',String(i));input.setAttribute('aria-label','Show step '+(i+1)+' in '+definition.name);
          label.appendChild(input);label.appendChild(el('span',null,(i+1)+'. '+(st.text || st.id || 'Untitled step')));
          fieldLife.listen(input,'change',function(){
            if(!ready() || activeLayout(index)!==id)return;
            var indices=Array.prototype.filter.call(list.querySelectorAll('input'),function(box){return box.checked;}).map(function(box){return Number(box.getAttribute('data-view-step'));});
            if(!opts.steps(index,id,indices))fields(section,d);
          });list.appendChild(label);
        });detail.appendChild(list);row.appendChild(detail);
      }
    }
    if(!explore && selected!=='steps'){
      var swap=el('select');swap.setAttribute('aria-label','Swap places with');
      sectionLayoutTiles(d).filter(function(t){return t.key!==selected && t.key!=='steps';}).forEach(function(t){var o=el('option',null,t.title);o.value=t.key;swap.appendChild(o);});
      row.appendChild(swap);var swapButton=button('Swap places',function(){persist(index,sectionLayoutSwap(items,selected,swap.value));});
      swapButton.disabled=!swap.options.length;swapButton.title='Exchange position, size and visibility with the selected element.';row.appendChild(swapButton);
    }
    section.querySelectorAll('.section-layout-tile').forEach(function(tile){tile.classList.toggle('layout-selected',tile.getAttribute('data-layout-key')===selected);});
  }
  function refresh(){
    sections.forEach(function(rec,section){if(!view.contains(section)){rec.life.destroy();rec.fields.destroy();rec.viewFields.destroy();sections.delete(section);}});
    if(drag && !drag.grid.isConnected)cancel();
    view.querySelectorAll('.doc-sec[data-dv-section]').forEach(function(section){
      if(section.closest('[data-dv-detail-preview]'))return;
      var index=Number(section.getAttribute('data-dv-section')),d=rawDiagram(index);if(!d)return;
      var actions=section.querySelector('.section-arranger');
      if(!actions){
        var actionsLife=sectionScope(section).life;controlsLife=actionsLife;
        actions=el('div','section-arranger');actions.setAttribute('popover','manual');var controls=el('div','section-arrange-actions');actions.appendChild(controls);
        var arrange=button('Arrange section',function(){
          if(!ready())return;
          if(editing===index){editing=null;refresh();var trigger=section.querySelector('.section-view-options>summary');if(trigger)trigger.focus({preventScroll:true});return;}
          editing=index;selected='diagram';if(opts.pause)opts.pause();
          var current=rawDiagram(index),items=currentItems(index,current);
          if(!Array.isArray(current.layouts)){opts.ensureView(index,profile);return;}
          forceLayout(index);refresh();
        });arrange.setAttribute('data-arrange-toggle','');controls.appendChild(arrange);
        var disclosure=button('Hide arrangement controls',function(){actions.classList.toggle('arranger-collapsed');refresh();});disclosure.setAttribute('data-arrange-disclosure','');controls.appendChild(disclosure);
        var profileLabel=el('label',null,'Arrangement profile '),profileSelect=el('select');profileSelect.setAttribute('aria-label','Arrangement profile');
        [['default','Responsive'],['backstage','Backstage'],['confluence','Confluence']].forEach(function(choice){var option=el('option',null,choice[1]);option.value=choice[0];profileSelect.appendChild(option);});
        profileLabel.appendChild(profileSelect);controls.appendChild(profileLabel);
        actionsLife.listen(profileSelect,'change',function(){if(!ready()){profileSelect.value=profile;return;}cancel();profile=profileSelect.value;forceLayout(index);refresh();profileSelect.focus({preventScroll:true});});
        controls.appendChild(button('Optimize layout',function(){
          if(!ready())return;editing=index;
          if(!Array.isArray(rawDiagram(index).layouts)){opts.ensureView(index,profile);return;}
          var current=rawDiagram(index),items=currentItems(index,current),p=presentation(index);
          if(sectionLayoutDefinition(current,activeLayout(index)).presentation==='explore'){if(p && p.resetExplore)p.resetExplore();return;}
          persist(index,sectionLayoutOptimize(current,profile,items));
        }));
        controls.appendChild(button('Reset layout',function(){if(!ready())return;var p=presentation(index),v=sectionLayoutDefinition(rawDiagram(index),activeLayout(index));if(v && v.presentation==='explore'){if(p && p.resetExplore)p.resetExplore();return;}editing=null;persist(index,null);}));
        var caption=el('span','fnote');caption.setAttribute('data-arrange-target','');controls.appendChild(caption);
        actions.appendChild(el('div','section-arrange-fields'));
        actionsLife.listen(actions,'keydown',function(ev){
          if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancel();editing=null;refresh();var trigger=section.querySelector('.section-view-options>summary');if(trigger)trigger.focus({preventScroll:true});}
          else if(!((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase()==='z'))ev.stopPropagation();
        });
        actionsLife.listen(actions,'click',function(ev){ev.stopPropagation();});actionsLife.listen(actions,'pointerdown',function(ev){ev.stopPropagation();});
        var board=section.querySelector('.diagram-views,.boardgrid');
        while(board && board.parentNode!==section)board=board.parentNode;
        section.insertBefore(actions,board);
      }
      actions.querySelector('[data-arrange-toggle]').textContent=editing===index?'Done arranging':'Arrange section';
      actions.querySelector('[data-arrange-toggle]').setAttribute('aria-pressed',String(editing===index));
      var definition=sectionLayoutDefinition(d,activeLayout(index));
      viewSettings(section,d);
      actions.querySelector('[data-arrange-target]').textContent='Editing '+(definition?'“'+definition.name+'” · ':'')+({default:'Responsive',backstage:'Backstage',confluence:'Confluence'}[profile]);
      actions.querySelector('[aria-label="Arrangement profile"]').value=profile;
      var collapsed=actions.classList.contains('arranger-collapsed');actions.querySelector('.section-arrange-fields').hidden=editing!==index || collapsed;
      var disclosure=actions.querySelector('[data-arrange-disclosure]');disclosure.textContent=collapsed?'Show arrangement controls':'Hide arrangement controls';disclosure.setAttribute('aria-expanded',String(!collapsed));
      section.classList.toggle('section-arranging',editing===index);
      if(actions.showPopover){if(editing===index && !actions.matches(':popover-open'))actions.showPopover();else if(editing!==index && actions.matches(':popover-open'))actions.hidePopover();}
      var p=presentation(index);if(p && p.setLayoutTarget)p.setLayoutTarget(profile);if(p && p.setArranging)p.setArranging(editing===index);
      if(p && p.setExploreAuthor)p.setExploreAuthor({
        begin:function(id){
          if(!ready() || activeLayout(index)!==id)return false;
          var focused=document.activeElement,host=focused && focused.closest('.explore-window,.explore-player');
          return {text:opts.src.value,panel:host && host.getAttribute('data-explore-panel'),content:host && host.getAttribute('data-explore-content'),player:host && host.classList.contains('explore-player'),panelMenu:!!(focused && focused.closest('.explore-panel-menu')),label:focused && focused.getAttribute('aria-label')};
        },
        commit:function(id,value,token){
          if(!ready() || !token || token.text!==opts.src.value || activeLayout(index)!==id){feedback('Source or Chapter changed; Explore adjustment cancelled.');return false;}
          var ok=opts.setExploreLayout(index,id,value);
          if(ok){
            feedback('Saved Explore panel positions and sizes · Undo restores the previous arrangement.');
            if(token.label)life.delay(function(){
              if(activeLayout(index)!==id)return;
              var sec=view.querySelector('[data-dv-section="'+index+'"]');if(!sec)return;
              if(token.panelMenu){var menu=sec.querySelector('.explore-panel-menu');if(menu){menu.open=true;syncNavigationPopover(menu);var control=Array.prototype.find.call(menu.querySelectorAll('button,select'),function(b){return b.getAttribute('aria-label')===token.label;});if(control)control.focus({preventScroll:true});}return;}
              var hosts=Array.prototype.slice.call(sec.querySelectorAll('.explore-window,.explore-player'));
              var host=hosts.find(function(h){return token.player?h.classList.contains('explore-player'):token.content?h.getAttribute('data-explore-content')===token.content:h.getAttribute('data-explore-panel')===token.panel;});
              var button=host && Array.prototype.find.call(host.querySelectorAll('button'),function(b){return b.getAttribute('aria-label')===token.label;});
              if(button)button.focus({preventScroll:true});
            },0);
          }
          return ok;
        }
      });
      section.querySelectorAll('.section-controls-resize').forEach(function(handle){handle.remove();});
      if(editing===index){
        forceLayout(index);fields(section,d);
        if(!definition || definition.presentation!=='explore')section.querySelectorAll('.section-layout-tile').forEach(function(tile){
          if(!tile.querySelector('.section-tile-move')){
            var name=tile.getAttribute('data-layout-label');
            var move=el('button','section-tile-move','⠿ '+name);move.type='button';move.setAttribute('aria-label','Move '+name);move.title='Drag to move. Arrow keys move; Shift + arrows resize.';tile.appendChild(move);
            var resize=el('button','section-tile-resize','↘');resize.type='button';resize.setAttribute('aria-label','Resize '+name);resize.title='Drag to resize; arrow keys also resize.';tile.appendChild(resize);
          }
          var bar=tile.querySelector('.termbar');
          if(bar && tile.classList.contains('layout-has-attached-controls')){
            var grip=el('button','section-controls-resize','↕');grip.type='button';grip.setAttribute('aria-label','Resize attached step controls');grip.title='Drag vertically, or use Up / Down, to resize controls without shrinking the visualization.';bar.appendChild(grip);
          }
        });
      }
    });
  }
  life.listen(view,'click',function(ev){
    if(ev.target.closest('[data-dv-detail-preview]'))return;
    if(ev.target.closest('[data-view-layout],.tabbtn')){cancel();editing=null;refresh();}
    else if(ev.target.closest('[data-view-focus]')){cancel();editing=null;refresh();}
  });
  life.listen(view,'diagram-view-change',function(ev){
    if(ev.target.closest('[data-dv-detail-preview]'))return;
    var section=ev.target.closest('.doc-sec[data-dv-section]');if(!section || !view.contains(section))return;
    var d=rawDiagram(Number(section.getAttribute('data-dv-section')));if(d)viewSettings(section,d);
  });
  life.listen(view,'pointerdown',function(ev){
    if(ev.target.closest('[data-dv-detail-preview]'))return;
    var handle=ev.target.closest('.section-tile-move,.section-tile-resize,.section-controls-resize');if(!handle || ev.button!==0 || ev.isPrimary===false)return;
    var section=handle.closest('.doc-sec'),index=Number(section.getAttribute('data-dv-section'));if(editing!==index||!ready())return;
    var grid=handle.closest('.section-layout-grid');if(getComputedStyle(grid).display!=='grid'){feedback('Use size / position fields on narrow screens, or widen the preview to drag.');return;}
    ev.preventDefault();ev.stopPropagation();cancel();selected=handle.closest('.section-layout-tile').getAttribute('data-layout-key');
    var items=currentItems(index),rect=grid.getBoundingClientRect(),scale=grid.offsetWidth?rect.width/grid.offsetWidth:1;
    drag={handle:handle,grid:grid,section:index,key:selected,items:items,next:items,text:opts.src.value,x:ev.clientX,y:ev.clientY,left:rect.left,top:rect.top,pointer:ev.pointerId,resize:handle.classList.contains('section-tile-resize'),controls:handle.classList.contains('section-controls-resize'),cell:(grid.clientWidth+8)*scale/SECTION_LAYOUT_COLUMNS,row:40*scale,minHeight:grid.style.minHeight};
    // Keep the scroll range while moving the bottom tile upward. Otherwise
    // scroll clamping moves the grid origin and feeds back into the next delta.
    grid.style.minHeight=rect.height/scale+'px';
    handle.setPointerCapture(ev.pointerId);grid.classList.add('layout-dragging');
  },true);
  life.listen(view,'pointermove',function(ev){
    if(!drag||ev.pointerId!==drag.pointer)return;ev.preventDefault();
    var rect=drag.grid.getBoundingClientRect();
    var dy=(ev.clientY-drag.y+drag.top-rect.top)/drag.row,d=rawDiagram(drag.section);
    drag.next=drag.controls?sectionLayoutResizeControls(d,drag.items,sectionLayoutControlsRows(d,drag.items)+dy):sectionLayoutGesture(drag.items,drag.key,(ev.clientX-drag.x+drag.left-rect.left)/drag.cell,dy,drag.resize);paint(drag.grid,drag.next);
  },true);
  life.listen(view,'pointerup',function(ev){
    if(!drag||ev.pointerId!==drag.pointer)return;ev.preventDefault();ev.stopPropagation();var finished=drag;cancel();
    if(finished.text!==opts.src.value){feedback('Source changed during the gesture; arrangement cancelled.');return;}
    if(JSON.stringify(finished.items)!==JSON.stringify(finished.next))persist(finished.section,finished.next);
    else fields(finished.handle.closest('.doc-sec'),rawDiagram(finished.section));
  },true);
  ['pointercancel','lostpointercapture'].forEach(function(type){life.listen(view,type,cancel,true);});
  life.listen(view,'keydown',function(ev){
    if(editing!==null && ev.target.closest('.tabbar') && ['ArrowLeft','ArrowRight','Home','End'].indexOf(ev.key)>=0){cancel();editing=null;refresh();}
    if(ev.target.closest('[data-dv-detail-preview]'))return;
    var handle=ev.target.closest('.section-tile-move,.section-tile-resize,.section-controls-resize');if(!handle)return;
    if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancel();return;}
    if(ev.altKey||ev.metaKey||ev.ctrlKey||['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(ev.key)<0)return;
    ev.preventDefault();ev.stopPropagation();if(!ready())return;
    var section=handle.closest('.doc-sec'),index=Number(section.getAttribute('data-dv-section')),key=handle.closest('.section-layout-tile').getAttribute('data-layout-key'),controls=handle.classList.contains('section-controls-resize');
    if(controls && (ev.key==='ArrowLeft' || ev.key==='ArrowRight'))return;
    selected=key;var delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[ev.key];
    var resize=ev.shiftKey||handle.classList.contains('section-tile-resize');
    var items=currentItems(index),d=rawDiagram(index),next=controls?sectionLayoutResizeControls(d,items,sectionLayoutControlsRows(d,items)+delta[1]):sectionLayoutGesture(items,key,delta[0],delta[1],resize);
    if(persist(index,next))life.delay(function(){
      if(editing!==index)return;refresh();
      var sec=view.querySelector('[data-dv-section="'+index+'"]');if(!sec)return;
      var tile=Array.prototype.find.call(sec.querySelectorAll('.section-layout-tile'),function(t){return t.getAttribute('data-layout-key')===key;});
      var focus=tile && tile.querySelector(controls?'.section-controls-resize':resize?'.section-tile-resize':'.section-tile-move');if(focus)focus.focus({preventScroll:true});
    },0);
  },true);
  life.listen(view,'click',function(ev){if(!ev.target.closest('[data-dv-detail-preview]') && ev.target.closest('.section-tile-move,.section-tile-resize,.section-controls-resize')){ev.preventDefault();ev.stopPropagation();}},true);
  life.listen(document,'keydown',function(ev){if(drag&&ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancel();}},true);
  life.listen(window,'blur',cancel);life.listen(window,'resize',cancel);life.listen(opts.src,'input',function(){cancel();editing=null;view.querySelectorAll('.section-arranger:popover-open').forEach(function(actions){actions.hidePopover();});view.querySelectorAll('.section-arranging').forEach(function(section){section.classList.remove('section-arranging');});});
  var query=new URLSearchParams(window.location.search).get('layout');if(['backstage','confluence'].indexOf(query)>=0){target.value=query;profile=query;}
  updateTarget();return {refresh:life.guard(refresh),cancel:life.guard(cancel),
    beforeReplace:life.guard(function(request){cancel();if(!request || ['edit','history'].indexOf(request.origin)<0)editing=null;clearSections();}),
    destroy:function(){if(!life.alive())return;cancel();life.destroy();editing=null;
      var ctl=opts.ctl && opts.ctl();if(ctl)ctl.sections.forEach(function(rec){if(rec.presentation && rec.presentation.setArranging)rec.presentation.setArranging(false);if(rec.presentation && rec.presentation.setExploreAuthor)rec.presentation.setExploreAuthor(null);});
      view.querySelectorAll('.section-arranger,.section-view-settings,.section-tile-move,.section-tile-resize,.section-controls-resize').forEach(function(node){node.remove();});
      view.querySelectorAll('.section-arranging,.layout-selected').forEach(function(node){node.classList.remove('section-arranging','layout-selected');});
      view.style.removeProperty('--home-max-height');
      if(stage.parentNode)stage.parentNode.insertBefore(view,stage);toolbar.remove();stage.remove();
    }};
}

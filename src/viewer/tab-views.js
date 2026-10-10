/* Instance-owned selection and visibility. Only membership references cross
   Views; the section renderer, playback state and content object stay shared. */
function createTabViewController(ctl,page){
  var owners=tabViewOwners(page),updating=false,retired=false;
  owners.forEach(function(owner){owner.views=tabViewDefinitions(owner);owner.current=tabViewDefault(owner,owner.views);owner.records.forEach(function(record){record.runtime=ctl.sections.find(function(rec){return rec.number===record.number;});record.runtime.detailOnly=record.domainOnly;record.runtime.viewOwner=owner;});owner.selected=owner.current && owner.current.members[0] && owner.current.members[0].record.runtime;});
  function ownerOf(rec){return rec && rec.viewOwner;}
  function members(owner){return owner && owner.current?owner.current.members.map(function(member){return member.record.runtime;}):[];}
  function apply(owner){
    if(!owner || !owner.current)return;
    updating=true;
    try{
      var active=members(owner);if(active.indexOf(owner.selected)<0)owner.selected=active[0];
      if(!owner.current.legacy && active.length){var anchor=owner.anchor;if(!anchor){anchor=document.createComment('Tab section order');active[0].sectionEl.before(anchor);owner.anchor=anchor;}var previous=anchor;active.forEach(function(rec){previous.after(rec.sectionEl);previous=rec.sectionEl;});}
      owner.records.forEach(function(record){var rec=record.runtime,member=owner.current.members.find(function(m){return m.record===record;}),visible=!!member && (owner.current.presentation==='standard' || rec===owner.selected);
        rec.viewExcluded=!member;rec.viewingMode=owner.current.presentation;
        if(member && rec.presentation){var layout=member.layout || rec.presentation.defaultView();if(rec.presentation.viewId()!==layout)rec.presentation.setView(layout);}
        if(rec.viewport)rec.viewport.setPresentation(member?owner.current.presentation:'standard');
        var wasHidden=rec.sectionEl.hidden;rec.sectionEl.hidden=!visible;
        if(rec.stepper){if(visible && wasHidden)rec.stepper.onShow();else if(!visible){rec.stepper.pause();rec.stepper.onHide();}}
      });
    }finally{updating=false;}
  }
  function notify(owner){
    if(!owner.selected)return;
    ctl.activeTarget={kind:'diagram',section:owner.selected.number};
    ctl.view.dispatchEvent(new CustomEvent('tab-view-change',{detail:{section:owner.selected.number,view:owner.current.id}}));
    if(ctl.onChange)ctl.onChange();
  }
  function select(rec,id,desired,silent){
    if(retired || updating)return false;var owner=ownerOf(rec),next=owner && owner.views.find(function(view){return view.id===id;});if(!next)return false;
    if(desired && !next.members.some(function(member){return member.record.runtime===desired;}))return false;
    if(ctl.details)ctl.details.close(true);
    owner.current=next;owner.selected=desired || (members(owner).indexOf(owner.selected)>=0?owner.selected:members(owner)[0]);apply(owner);if(!silent)notify(owner);return true;
  }
  function ensure(rec,id,silent){
    var owner=ownerOf(rec);if(!owner || rec.detailOnly)return false;
    var record=owner.records.find(function(record){return record.runtime===rec;}),diagram=record.section.diagram;
    if(!owner.source.views && id==='home' && diagram && !Array.isArray(diagram.layouts) && diagramLayoutViews(diagram).length)id='layout';
    var plainFlow=id==='flow' && diagram && !diagramLayoutViews(diagram).length && !diagramFocusPanel(diagram);
    var view=id?owner.views.find(function(v){return v.id===id || v.legacy && (v.legacyLayout===id || plainFlow && v.id==='standard') && v.members.some(function(m){return m.record.runtime===rec;});}):owner.current;
    if(id && (!view || !view.members.some(function(m){return m.record.runtime===rec;})))return false;
    if(!view || !view.members.some(function(m){return m.record.runtime===rec;}))view=owner.views.find(function(v){return v.members.some(function(m){return m.record.runtime===rec;});});
    if(view && owner.current===view && owner.selected===rec)return true;
    return view?select(rec,view.id,rec,silent):false;
  }
  function legacyChanged(ev){
    if(updating || retired)return;
    var rec=ctl.sections.find(function(r){return r.sectionEl.contains(ev.target);}),owner=ownerOf(rec);
    if(!owner || owner.source.views || !rec.presentation)return;
    var id=rec.presentation.viewId(),current=owner.current;
    if(current && current.members.some(function(m){return m.record.runtime===rec && m.layout===id;}))return;
    var next=owner.views.find(function(v){return v.legacyLayout===id && v.members.some(function(m){return m.record.runtime===rec;});});
    if(next)select(rec,next.id,rec);
  }
  ctl.view.addEventListener('diagram-view-change',legacyChanged);
  owners.forEach(apply);
  return {owners:owners,owner:ownerOf,current:function(rec){var owner=ownerOf(rec);return owner && owner.current;},members:function(rec){return members(ownerOf(rec));},select:select,ensure:ensure,
    primary:function(tabBlock,tab){var owner=owners.find(function(o){return o.tabBlock===tabBlock && o.tab===tab;});return owner && owner.selected;},
    apply:function(){owners.forEach(apply);},updating:function(){return updating;},
    destroy:function(){retired=true;ctl.view.removeEventListener('diagram-view-change',legacyChanged);owners.forEach(function(owner){if(owner.anchor)owner.anchor.remove();});}};
}

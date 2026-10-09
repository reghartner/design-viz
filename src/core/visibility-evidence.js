/* Read-only presentation eligibility for explicit authoring expectations.
   Does not measure pixels, prove legibility, compare values, or verify sources. */
function visibilityEvidence(raw,document){
  function object(v){return v && typeof v==='object' && !Array.isArray(v);}
  if(!object(document) || document.version!==1 || !Array.isArray(document.expectations) || !document.expectations.length ||
    Object.keys(document).some(function(k){return ['version','expectations'].indexOf(k)<0;}))
    throw new Error('Expected {version:1, expectations:[...]} with at least one expectation');
  var page=normalize(raw),validation=validate(page);
  if(validation.errors.length)throw new Error('Invalid spec: '+validation.errors.join('; '));
  var records=sectionRecords(page);
  var results=document.expectations.map(function(e,index){
    var result={index:index,target:e,status:'invalid',reason:''};
    function stop(status,reason){result.status=status;result.reason=reason;return result;}
    var keys=['section','view','path','step','panel','field','visible','profile'];
    if(!object(e) || Object.keys(e).some(function(k){return keys.indexOf(k)<0;}) ||
      !['section','view','path','step','panel'].every(function(k){return typeof e[k]==='string' && e[k].length>0;}) ||
      typeof e.visible!=='boolean' || (e.field!==undefined && (typeof e.field!=='string' || !e.field)) ||
      (e.profile!==undefined && ['default','backstage','confluence'].indexOf(e.profile)<0))
      return stop('invalid','Use section/view/path/step/panel strings, visible boolean, optional field string and profile');
    var matching=records.filter(function(r){return r.reference===e.section;}),record=matching[0];
    if(matching.length!==1 || !record.section.diagram)return stop('invalid','Unknown or ambiguous diagram section reference');
    var d=record.section.diagram,views=diagramLayoutViews(d),named=views.length && !views[0].legacy;
    if((Array.isArray(d.layouts)?d.layouts:[]).filter(function(v){return v && v.id===e.view;}).length>1)return stop('invalid','Ambiguous view ID');
    var view=views.find(function(v){return (v.legacy?'layout':v.id)===e.view;});
    if(named && !view || !named && ['flow','home'].indexOf(e.view)<0 && !view ||
      e.view==='home' && !views.length && !diagramFocusPanel(d))return stop('invalid','Unknown view');
    // Legacy home is the saved layout alias; named views never fall back to flow.
    if(!named && e.view==='home' && views.length)view=views[0];
    if(d.view==='ambient-only')return stop('invalid','Step is unreachable in ambient-only mode');
    var resolved=resolveSourceStep(d,e.path,e.step);
    if(!resolved || resolved.sourceIndex<0)return stop('invalid','Unknown path or step on this path');
    var filter=sectionViewFilter(d,view && view.paths,view && view.steps);
    if(filter.paths && filter.paths.indexOf(e.path)<0)return stop('invalid','Path is excluded by this view');
    if(filter.steps && filter.steps.indexOf(d.steps[resolved.sourceIndex].id)<0)return stop('invalid','Step is filtered out of this view');
    var panels=(d.panels || []).filter(function(p){return p.id===e.panel;}),panel=panels[0];
    if(panels.length!==1)return stop('invalid','Unknown or ambiguous panel');
    var dp=diagramForPath(d,e.path),states=foldPanelStates(dp),visibility=foldPanelVisibility(dp);
    var descriptor=PanelRegistry.get(panel.type),evidence={supported:true,visible:true,reason:'Panel is eligible'};
    if(e.field!==undefined){
      if(!descriptor || !descriptor.visibilityEvidence)return stop('unsupported','Field visibility is unsupported for panel type '+panel.type);
      evidence=descriptor.visibilityEvidence(panel,states[e.panel][resolved.pathIndex],e.field);
      if(!evidence || !evidence.supported)return stop('unsupported',evidence && evidence.reason || 'Field visibility is unsupported');
    }
    var items=view && sectionLayoutItems(d,e.profile || 'default',view.id);
    var hidden=items && items.some(function(it){return it.panel===e.panel && it.hidden;});
    var visible=!hidden && visibility[e.panel][resolved.pathIndex] && evidence.visible;
    result.eligible=!!visible;
    result.resolved={section:record.reference,sectionNumber:record.number,view:e.view,path:e.path,
      step:stepReference(dp.steps.map(function(s){return s.id;}),resolved.pathIndex),
      sourceIndex:resolved.sourceIndex,panelIndex:(d.panels || []).indexOf(panel),profile:e.profile || 'default',address:evidence.address || null};
    return stop(visible===e.visible?'pass':'fail',hidden?'Panel excluded by layout':!visibility[e.panel][resolved.pathIndex]?'Panel hidden by starting visibility or carried panelVisibility':evidence.reason);
  });
  return {version:1,kind:'presentation-eligibility',ok:results.every(function(r){return r.status==='pass';}),
    limitations:'Logical presentation eligibility only; no DOM, clipping, occlusion, legibility or source-truth proof.',results:results};
}

/* Static backend facade. This shares the outer pure core and never initializes
   the DOM renderer; consumers do not need source files at runtime. */
function validateSpec(raw){return validate(normalize(raw));}
var viewerRoutingCache;
function viewerRouting(){
  if(!viewerRoutingCache)viewerRoutingCache=createViewerRouting();
  return viewerRoutingCache;
}
function createViewerRouting(){
  return {normalize, blocksOf, sectionRecords, sectionReferences, parseHash, buildHash,
    diagramPathList, diagramForPath, resolveSourceStep, stepKeys, stepFailures, stepReference,
    diagramLayoutViews, sectionLayoutItems, foldNodeTones, foldPanelStates, layout, lintPage};
}

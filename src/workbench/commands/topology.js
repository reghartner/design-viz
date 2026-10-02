/* Pure reference insertion. Validate the complete candidate against an approved
   authored snapshot; only the consumer import array is edited. */
function topologyNamespace(diagram,stem){
  stem=String(stem || 'child').replace(/[^a-zA-Z0-9_.-]/g,'-').replace(/^[^a-zA-Z0-9]+/,'') || 'child';
  function taken(name){return (diagram.topologyImports || []).some(function(imp){return imp.as===name;}) ||
    Object.keys(diagram.nodes || {}).concat(Object.keys(diagram.groups || {})).some(function(id){return id.startsWith(name+'::');});}
  var name=stem,n=2;while(taken(name))name=stem+'-'+n++;return name;
}
function planAddTopologyImport(text,raw,section,reference,context){
  var got=builderDiagram(text,raw,section);if(got.error)return got;
  if(!context)return {error:'Open a Canon v3 authored-source session before adding referenced topology.'};
  if(!reference || typeof reference!=='object' || Array.isArray(reference))return {error:'A topology reference must be an object.'};
  if(got.d.topologyImports!=null && !Array.isArray(got.d.topologyImports))return {error:'topologyImports must be an array.'};
  var parsed;try{parsed=JSON.parse(text);}catch(ex){return {error:'The source is not valid JSON.'};}
  if(JSON.stringify(parsed)!==JSON.stringify(raw))return {error:'The source changed. Reopen the picker.'};
  var imports=(got.d.topologyImports || []).concat([builderClone(reference)]);
  var plan=planSetField(text,raw,got.path,'topologyImports',JSON.stringify(imports,null,2));
  if(plan.error)return plan;
  try{
    var resolved=FlowTopology.resolveSource(JSON.parse(plan.text),context);
    var diagram=specValueAt(resolved,specSectionPaths(resolved)[section].diagram);
    var provenance=diagram.topologyProvenance.imports.find(function(imp){return imp.as===reference.as;});
    plan.kind='node';plan.id=provenance.nodes[0];plan.section=section;
  }catch(ex){return {error:ex.message};}
  return plan;
}

/* Shared central membership contract for repository providers and site builds. */
var FlowCanonLibrary = (function(){
  'use strict';
  function entries(raw){
    if(!raw || raw.version!==1 || !Array.isArray(raw.diagrams))throw new Error('canon.json requires version 1 and a diagrams array.');
    var seen=new Set();
    return raw.diagrams.map(function(entry){
      if(!entry || typeof entry.folder!=='string' || !/^diagrams\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.folder))throw new Error('Canon folder must be diagrams/<kebab-case-name>.');
      if(seen.has(entry.folder))throw new Error('Duplicate canon folder: '+entry.folder);
      seen.add(entry.folder);
      if(typeof entry.owner!=='string' || !/^[a-z][a-z0-9-]*:[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(entry.owner))throw new Error('Canon entry requires an owner entity reference: '+entry.folder);
      var id=entry.folder.slice('diagrams/'.length);
      return {id:id,folder:entry.folder,owner:entry.owner,path:entry.folder+'/'+id+'.spec.json',html:entry.folder+'/'+id+'.html'};
    });
  }
  function spec(raw,entry){
    if(!raw || !raw.page || typeof raw.page!=='object' || Array.isArray(raw.page))throw new Error('Canon requires a page spec: '+entry.id);
    var copy=JSON.parse(JSON.stringify(raw));
    // Compatibility metadata for existing viewers and evidence tools is derived
    // from membership. A flag in the source JSON cannot enroll a diagram.
    copy.page.canon={version:1,id:entry.id,kind:'canonical',owner:entry.owner};
    return copy;
  }
  return {entries:entries,spec:spec};
})();
if(typeof module!=='undefined' && module.exports)module.exports=FlowCanonLibrary;

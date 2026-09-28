/* Explicit host-to-workbench navigation. Metadata is not authorization and
   never supplies a fetch URL, executable prompt, or local filesystem path. */
function readWorkspaceHandoff(hash){
  var value=new URLSearchParams(String(hash || '').replace(/^#/,'')).get('fv');
  if(value==null)return null;
  try{
    if(value.length>3000)throw new Error();
    var data=JSON.parse(value);
    if(!data || data.version!==1 || typeof data.id!=='string' || !data.id || data.id.length>200 ||
      typeof data.revision!=='string' || !/^[a-f0-9]{64}$/.test(data.revision) ||
      ['view','edit','build'].indexOf(data.action)<0 ||
      data.entity!=null && (typeof data.entity!=='string' || data.entity.length>300))throw new Error();
    return {id:data.id,revision:data.revision,action:data.action,entity:data.entity || '',target:parseHash(hash)};
  }catch(ex){return {error:'This Backstage link is invalid. Refresh diagrams in Backstage and open it again.'};}
}
async function verifyWorkspaceHandoff(raw,request,cryptoProvider){
  if(!request)return;
  if(request.error)throw new Error(request.error);
  if(!raw || !raw.page || !raw.page.canon || raw.page.canon.id!==request.id)
    throw new Error('This link points to a different diagram. Refresh diagrams in Backstage and open it again.');
  var digest=await cryptoProvider.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(raw)));
  var revision=Array.from(new Uint8Array(digest)).map(function(byte){return byte.toString(16).padStart(2,'0');}).join('');
  if(revision!==request.revision)throw new Error('This story has changed since you opened it in Backstage. Refresh diagrams there and open it again. Your draft has not changed.');
}
function applyWorkspaceTarget(ctl,page,target){
  if(!target || target.d==null)return null;
  var source=sectionRecords(page).find(function(rec){return rec.reference===target.d || rec.aliases && rec.aliases.indexOf(target.d)>=0;});
  var rec=source && ctl.sections.find(function(r){return r.reference===source.reference;});
  if(!rec)throw new Error('The linked story section is unavailable. Refresh diagrams in Backstage.');
  if(rec.tabBlock!=null)ctl.tabBlocks[rec.tabBlock-1].select(rec.tab,false,false);
  ctl.activeTarget={kind:'diagram',section:rec.number};
  if(target.v!=null && (rec.presentation ? !rec.presentation.setView || !rec.presentation.setView(target.v) : target.v!=='flow'))
    throw new Error('The linked view is unavailable. Refresh diagrams in Backstage.');
  if(target.p!=null || target.s!=null){
    var sp=rec.stepper,resolved=sp && resolveSourceStep(source.section.diagram,target.p || sp.path(),target.s);
    if(!resolved || (target.s!=null ? resolved.sourceIndex<0 || !sp.jumpSource(resolved.sourceIndex,resolved.path.id) : !sp.selectPath(resolved.path.id)))
      throw new Error('The linked story step is unavailable. Refresh diagrams in Backstage.');
  }
  return rec;
}

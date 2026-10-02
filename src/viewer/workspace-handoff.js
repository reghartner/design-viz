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
// Content consistency, not authentication. The pure fallback keeps static HTTP
// nginx deployments usable where Web Crypto's secure-context API is unavailable.
async function workspaceSourceDigest(raw,cryptoProvider){
  var bytes=new TextEncoder().encode(JSON.stringify(raw));
  if(cryptoProvider && cryptoProvider.subtle){
    var digest=await cryptoProvider.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
  }
  var k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var data=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);data.set(bytes);data[bytes.length]=128;
  var view=new DataView(data.buffer),bits=bytes.length*8;
  view.setUint32(data.length-8,Math.floor(bits/4294967296));view.setUint32(data.length-4,bits>>>0);
  function rotr(x,n){return (x>>>n)|(x<<(32-n));}
  var w=new Int32Array(64);
  for(var offset=0;offset<data.length;offset+=64){
    for(var i=0;i<16;i++)w[i]=view.getInt32(offset+i*4);
    for(i=16;i<64;i++){var x=w[i-15],y=w[i-2];w[i]=(rotr(x,7)^rotr(x,18)^(x>>>3))+w[i-16]+(rotr(y,17)^rotr(y,19)^(y>>>10))+w[i-7];}
    var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for(i=0;i<64;i++){
      var t1=(hh+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0;
      var t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;
      hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,hh].forEach(function(value,index){h[index]=(h[index]+value)|0;});
  }
  return h.map(function(value){return (value>>>0).toString(16).padStart(8,'0');}).join('');
}
async function verifyWorkspaceHandoff(raw,request,cryptoProvider){
  if(!request)return;
  if(request.error)throw new Error(request.error);
  if(!raw || !raw.page || !raw.page.canon || raw.page.canon.id!==request.id)
    throw new Error('This link points to a different diagram. Refresh diagrams in Backstage and open it again.');
  var revision=await workspaceSourceDigest(raw,cryptoProvider);
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

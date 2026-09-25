/* Shared branding editor; source/history and form lifetime remain inspector-owned. */
function createFlowBrandControl(options) {
  var o=options, doc=o.document, controls=o.controls, alive=true, reader=null, probe=null;
  var fold=doc.createElement('details');fold.className='rawjson fv-brand-editor';
  var heading=doc.createElement('summary');heading.textContent='Company branding';fold.appendChild(heading);
  var scope=o.local===false?'none':o.local && typeof o.local==='object'?'panel':'diagram';
  var value=builderClone((scope==='panel'?o.local:o.shared) || {});
  var mode=controls.select(['diagram','panel','none'],scope,function(next){
    if(next==='diagram')return o.change(false,null);
    if(next==='none')return o.change(false,false);
    return o.change(false,FlowBrand.resolve(o.shared,o.local) || {});
  });
  Array.from(mode.options).forEach(function(opt){opt.textContent={diagram:'Shared across this diagram',panel:'Override for this panel',none:'No brand on this panel'}[opt.value];});
  mode.setAttribute('aria-label','Branding scope');fold.appendChild(controls.row('Use brand',mode));
  var note=doc.createElement('p');note.className='fnote';
  note.textContent=scope==='diagram'?'Edit once: every branded panel in this diagram inherits this name and logo.':scope==='panel'?'These settings override the shared brand for this panel.':'This panel does not display the shared company brand.';
  fold.appendChild(note);
  if(scope==='none')return fold;
  var preview=doc.createElement('div');preview.className='fv-brand-preview';preview.innerHTML=FlowBrand.render(FlowBrand.resolve(scope==='panel'?o.shared:null,value)) || '<span>No brand set</span>';fold.appendChild(preview);
  function save(key,v) {
    var next=builderClone(value);
    if(v==null || v==='')delete next[key];else next[key]=v;
    if(['icon','logo','logoImage'].indexOf(key)>=0 && v){['icon','logo','logoImage'].forEach(function(k){if(k!==key)delete next[k];});}
    return o.change(scope==='diagram',Object.keys(next).length?next:null);
  }
  fold.appendChild(controls.row('Company / app name',controls.text(value.app,function(v){return save('app',v);})));
  var icon=controls.select(ICON_SET,value.icon || '',function(v){return save('icon',v);},true);
  icon.setAttribute('aria-label','Brand icon');
  fold.appendChild(controls.row('Library icon',o.iconPicker(icon)));
  fold.appendChild(controls.row('Monogram',controls.text(value.logo,function(v){
    if(v && v.length>4){o.error('Use up to four characters for a monogram.');return false;}return save('logo',v);
  })));
  ['accent','bg','fg'].forEach(function(key){fold.appendChild(controls.row({accent:'Accent color',bg:'Monogram background',fg:'Text color'}[key],controls.text(value[key],function(v){
    if(v && (!(v.length===4 || v.length===7) || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(v))){o.error('Use #RGB or #RRGGBB for brand colors.');return false;}return save(key,v);
  },{placeholder:'#6675c4'})));});
  var file=doc.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.setAttribute('aria-label','Company logo file');
  fold.appendChild(controls.row('Upload logo',file));
  var help=doc.createElement('p');help.className='fnote';help.textContent='PNG, JPEG or WebP · up to 512 KiB and 4096 × 4096. Embedded in the spec; no remote image requests.';fold.appendChild(help);
  if(value.logoImage)fold.appendChild(controls.action('Remove uploaded logo',function(){return save('logoImage',null);}));
  function cancel(){alive=false;if(reader){reader.onload=reader.onerror=null;if(reader.readyState===1)reader.abort();}if(probe)probe.onload=probe.onerror=null;}
  o.onRetire(cancel);
  o.listen(file,'change',function(){
    var chosen=file.files && file.files[0],original=o.source();
    if(!chosen)return;
    if(chosen.size>EMBEDDED_IMAGE_MAX_BYTES || ['image/png','image/jpeg','image/webp'].indexOf(chosen.type)<0){o.error('Choose a PNG, JPEG or WebP logo up to 512 KiB.');file.value='';return;}
    if(reader){reader.onload=reader.onerror=null;if(reader.readyState===1)reader.abort();}
    if(probe)probe.onload=probe.onerror=null;
    var currentReader=reader=new doc.defaultView.FileReader();
    function current(){return alive && fold.isConnected && reader===currentReader && o.source()===original;}
    reader.onerror=function(){if(current())o.error('Could not read this logo.');};
    reader.onload=function(){
      if(!current())return;
      var image=embeddedImageSource(reader.result);
      if(!image){o.error('Choose a valid embedded raster logo.');return;}
      probe=new doc.defaultView.Image();
      probe.onerror=function(){if(current())o.error('This file is not a readable image.');};
      probe.onload=function(){
        if(!current())return;
        if(!probe.naturalWidth || !probe.naturalHeight || probe.naturalWidth>4096 || probe.naturalHeight>4096){o.error('Use a logo no larger than 4096 × 4096 pixels.');return;}
        save('logoImage',image);
      };probe.src=image;
    };reader.readAsDataURL(chosen);
  });
  return fold;
}

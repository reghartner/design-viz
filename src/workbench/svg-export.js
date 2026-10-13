/* Prepare one live renderer-owned graph as a standalone, inert SVG. The
   Workbench integration below this boundary owns active-section policy and I/O. */
var SVG_EXPORT_STYLE_PROPERTIES=[
  'color','display','visibility','opacity','fill','fill-opacity','fill-rule',
  'stroke','stroke-opacity','stroke-width','stroke-dasharray','stroke-linecap',
  'stroke-linejoin','stroke-miterlimit','marker-start','marker-mid','marker-end',
  'paint-order','vector-effect','shape-rendering','text-rendering','font-family',
  'font-size','font-style','font-weight','font-stretch','letter-spacing','word-spacing',
  'text-anchor','dominant-baseline','alignment-baseline','filter','clip-path','mask'
];
var SVG_EXPORT_REMOVED_SELECTOR=[
  'script','foreignObject','image','audio','video','iframe','object','embed','style',
  'animate','animateMotion','animateTransform','set','.pkt','.comm-failure',
  '.dv-connect-preview','.dv-free-edge-preview','.dv-topology-boundary',
  '.dv-topology-handle','.dv-rowgrab','.dv-rowline','.dv-slotline',
  '.dv-position-lock-badge',
  '.nlink','.nbackref','.nrefs-trigger','.detail-trigger'
].join(',');
var SVG_EXPORT_EDITOR_CLASSES=/^(?:dv-(?:sel|instep|inserttarget|dragsrc|droptgt|ghost|ghostback|grabbing|position-locked|connect-(?:source|candidate|target|replaced)|free-edge-source|topology-boundary-drag)|view-focus)$/;

function svgExportSlug(value){
  value=typeof value==='string'?value:'';
  try{value=value.normalize('NFKD');}catch(ex){}
  var slug=value.toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64).replace(/-+$/,'');
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(slug)?'diagram-'+slug:slug;
}
function svgExportFilename(documentTitle,sectionTitle){
  var doc=svgExportSlug(documentTitle),section=svgExportSlug(sectionTitle),parts=[];
  if(doc)parts.push(doc);if(section && section!==doc)parts.push(section);
  return (parts.join('-') || 'diagram')+'.svg';
}
function svgExportLabel(documentTitle,sectionTitle){
  var doc=typeof documentTitle==='string'?documentTitle.trim():'',section=typeof sectionTitle==='string'?sectionTitle.trim():'';
  if(doc && section && doc!==section)return doc+' — '+section+' diagram';
  return (section || doc || 'Flowview')+' diagram';
}
function svgExportClassName(value){
  return String(value || '').split(/\s+/).filter(function(name){return name && !SVG_EXPORT_EDITOR_CLASSES.test(name);}).join(' ');
}
function svgExportLocalReference(value,base){
  var raw=String(value || '').trim().replace(/^['"]|['"]$/g,'');
  if(raw.charAt(0)==='#')return raw;
  try{
    var resolved=new URL(raw,base),owner=new URL(base);
    if(resolved.origin===owner.origin && resolved.pathname===owner.pathname && resolved.search===owner.search && resolved.hash)return resolved.hash;
  }catch(ex){}
  return null;
}
function svgExportSafeStyleValue(value,base){
  value=String(value || '').trim();if(!value || /(?:expression|javascript|data:|@import)/i.test(value))return null;
  var unsafe=false;
  value=value.replace(/url\(([^)]*)\)/gi,function(match,target){var local=svgExportLocalReference(target,base);if(!local){unsafe=true;return '';}return 'url('+local+')';});
  return unsafe?null:value;
}
function svgExportStripAttributes(el,base){
  Array.from(el.attributes || []).forEach(function(attr){
    var name=attr.name.toLowerCase(),value=attr.value;
    if(name.indexOf('on')===0 || name.indexOf('data-')===0 || name==='tabindex' || name==='contenteditable' || name==='target' || name==='rel' || name==='title' ||
      name==='aria-haspopup' || name==='aria-expanded' || name==='aria-controls' || name==='aria-keyshortcuts' || name==='aria-description')el.removeAttribute(attr.name);
    else if(name==='class'){
      var classes=svgExportClassName(value);if(classes)el.setAttribute('class',classes);else el.removeAttribute('class');
    }else if(name==='href' || name==='xlink:href'){
      var local=svgExportLocalReference(value,base);if(local)el.setAttribute(attr.name,local);else el.removeAttribute(attr.name);
    }else if(name==='style')el.removeAttribute(attr.name);
    else if(/url\(/i.test(value)){
      var safe=svgExportSafeStyleValue(value,base);if(safe==null)el.removeAttribute(attr.name);else el.setAttribute(attr.name,safe);
    }
  });
}
function svgExportCleanTree(root,base){
  Array.from(root.querySelectorAll(SVG_EXPORT_REMOVED_SELECTOR)).forEach(function(el){el.remove();});
  [root].concat(Array.from(root.querySelectorAll('*'))).forEach(function(el){svgExportStripAttributes(el,base);});
}
function svgExportReferencedIds(root){
  var refs=new Set();
  [root].concat(Array.from(root.querySelectorAll('*'))).forEach(function(el){
    Array.from(el.attributes || []).forEach(function(attr){
      var value=attr.value,match;
      if((attr.name==='href' || attr.name==='xlink:href') && value.charAt(0)==='#')refs.add(value.slice(1));
      var pattern=/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g;while((match=pattern.exec(value)))refs.add(match[1]);
      if(attr.name==='aria-labelledby' || attr.name==='aria-describedby')value.split(/\s+/).forEach(function(id){if(id)refs.add(id);});
    });
  });
  return refs;
}
function svgExportInjectSymbols(source,clone){
  var doc=source.ownerDocument,defs=clone.querySelector('defs');
  if(!defs){defs=doc.createElementNS('http://www.w3.org/2000/svg','defs');clone.insertBefore(defs,clone.firstChild);}
  var complete=new Set(Array.from(clone.querySelectorAll('[id]')).map(function(el){return el.id;})),pending=Array.from(svgExportReferencedIds(clone));
  while(pending.length){
    var id=pending.shift();if(complete.has(id))continue;
    var original=doc.getElementById(id);
    if(!original || String(original.localName).toLowerCase()!=='symbol')throw Error('The diagram icon #'+id+' is unavailable.');
    var copy=original.cloneNode(true);svgExportCleanTree(copy,doc.baseURI);defs.appendChild(copy);complete.add(id);
    svgExportReferencedIds(copy).forEach(function(ref){if(!complete.has(ref))pending.push(ref);});
  }
}
function svgExportInlineStyles(root,win,base){
  [root].concat(Array.from(root.querySelectorAll('*'))).forEach(function(el){
    var computed=win.getComputedStyle(el),styles=[];
    SVG_EXPORT_STYLE_PROPERTIES.forEach(function(name){
      var value=svgExportSafeStyleValue(computed.getPropertyValue(name),base);
      if(value!=null && value!=='' && value!=='normal' && value!=='auto')styles.push(name+':'+value);
    });
    if(styles.length)el.setAttribute('style',styles.join(';'));
  });
}
function svgExportRebaseIds(root){
  var ids=new Map(),serial=0;
  Array.from(root.querySelectorAll('[id]')).forEach(function(el){var old=el.id;if(ids.has(old))throw Error('The rendered graph has a duplicate ID (#'+old+').');ids.set(old,'dvx-'+(++serial));el.id=ids.get(old);});
  [root].concat(Array.from(root.querySelectorAll('*'))).forEach(function(el){
    Array.from(el.attributes || []).forEach(function(attr){
      var value=attr.value;
      if((attr.name==='href' || attr.name==='xlink:href') && value.charAt(0)==='#' && ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));
      value=value.replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g,function(match,id){return ids.has(id)?'url(#'+ids.get(id)+')':match;});
      if(attr.name==='aria-labelledby' || attr.name==='aria-describedby')value=value.split(/\s+/).map(function(id){return ids.get(id)||id;}).join(' ');
      el.setAttribute(attr.name,value);
    });
  });
  return ids;
}
function svgExportAssertReferences(root){
  var ids=new Set(Array.from(root.querySelectorAll('[id]')).map(function(el){return el.id;})),missing=[];
  svgExportReferencedIds(root).forEach(function(id){if(!ids.has(id))missing.push(id);});
  if(missing.length)throw Error('The exported graph has an unresolved reference (#'+missing[0]+').');
}
function prepareStandaloneSvg(source,options){
  options=options || {};if(!source || String(source.localName).toLowerCase()!=='svg')throw Error('The active section has no rendered diagram graph.');
  var doc=source.ownerDocument,win=doc.defaultView;if(!win || !win.XMLSerializer)throw Error('This browser cannot serialize SVG.');
  var clone=source.cloneNode(true),base=doc.baseURI || '';
  svgExportCleanTree(clone,base);svgExportInjectSymbols(source,clone);
  var wrapper=doc.createElement('div'),theme=source.closest && source.closest('.docview');
  wrapper.className=theme?theme.className:'';wrapper.setAttribute('aria-hidden','true');
  wrapper.style.cssText='position:fixed;left:-100000px;top:0;width:1200px;pointer-events:none';wrapper.appendChild(clone);doc.body.appendChild(wrapper);
  try{svgExportInlineStyles(clone,win,base);}finally{wrapper.remove();}
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('version','1.1');clone.setAttribute('role','img');
  clone.removeAttribute('aria-label');clone.removeAttribute('aria-labelledby');clone.removeAttribute('focusable');
  var vb=String(clone.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if(vb.length===4 && vb.every(Number.isFinite) && vb[2]>0 && vb[3]>0){clone.setAttribute('width',String(vb[2]));clone.setAttribute('height',String(vb[3]));}
  var label=svgExportLabel(options.documentTitle,options.sectionTitle),title=doc.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=label;
  var defs=clone.querySelector('defs');if(defs && defs.nextSibling)clone.insertBefore(title,defs.nextSibling);else clone.insertBefore(title,clone.firstChild);
  svgExportRebaseIds(clone);title.id='dvx-title';clone.setAttribute('aria-labelledby',title.id);svgExportAssertReferences(clone);
  var text='<?xml version="1.0" encoding="UTF-8"?>\n'+new win.XMLSerializer().serializeToString(clone);
  if(/<(?:script|foreignObject|image|iframe|object|embed)\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*['"]\s*(?:javascript|data|https?):/i.test(text))throw Error('The exported graph contained unsafe external content.');
  return {text:text,name:svgExportFilename(options.documentTitle,options.sectionTitle),label:label};
}

function captureWorkbenchSvgExport(options){
  var ctl=options.controller,page=options.page;
  if(!ctl || ctl.destroyed || !page)return {error:'SVG export is unavailable because there is no usable diagram preview.'};
  var records=(ctl.sections || []).concat(ctl.details && ctl.details.activeSections?ctl.details.activeSections():[]),active=records.find(function(rec){
    return rec.hasDiagram!==false && rec.sectionEl && rec.sectionEl.classList && (rec.sectionEl.classList.contains('workspace-active-section') || rec.sectionEl.classList.contains('explore-active-section'));
  });
  if(!active && Number.isInteger(options.activeSection))active=records.find(function(rec){return rec.number===options.activeSection+1;});
  if(!active && ctl.activeTarget && ctl.activeTarget.kind==='diagram')active=records.find(function(rec){return rec.number===ctl.activeTarget.section;});
  if(!active)return {error:'SVG export needs an active diagram section; select a section with a rendered graph first.'};
  var svg=active.sectionEl.querySelector('.boardcanvas > svg');
  if(!svg || !svg.isConnected || svg.closest('[hidden]') || svg.ownerDocument.defaultView.getComputedStyle(svg).display==='none')return {error:'The active section’s diagram graph is hidden or unavailable, so nothing was exported.'};
  var sourceRecord=sectionRecords(page)[active.number-1],section=sourceRecord && sourceRecord.section || {},title=section.heading || section.diagram && section.diagram.title || active.reference || 'Diagram';
  try{return Object.assign(prepareStandaloneSvg(svg,{documentTitle:page.title,sectionTitle:title}),{section:title,number:active.number});}
  catch(ex){return {error:'SVG export failed: '+(ex && ex.message?ex.message:ex)};}
}

/* Diagram continuation artwork stays within the ordinary node bounds, so edge
   routing, stack placement, step focus and semantic tones remain shared. */
function handoffNodeContent(node, position, id, prefix, options){
  options=options || {};
  var w=position.w,h=position.h,tip=19;
  var href=diagramHandoffURL(node.handoff,options.resolveDiagramLink);
  var title=node.title || id, available=!!href;
  var hint=available?'Open '+title+' diagram (new tab)':'Diagram destination unavailable. Add a URL or configure the host diagram-link resolver.';
  var caption=available?'OPEN DIAGRAM ↗':'DESTINATION UNAVAILABLE';
  var max=Math.max(10,Math.floor((w-tip-22)/6.6));
  var chars=Array.from(title),shown=chars.length>max?chars.slice(0,max-1).join('')+'…':title;
  var outline='M10 0H'+(w-tip)+'L'+w+' '+(h/2)+'L'+(w-tip)+' '+h+'H10Q0 '+h+' 0 '+(h-10)+'V10Q0 0 10 0Z';
  var body='<path class="card handoff-card" data-node-width="'+w+'" data-node-height="'+h+'" d="'+outline+'"/>'+
    '<path class="handoff-stripe" d="M'+(w-tip-5)+' 10L'+(w-6)+' '+h/2+'L'+(w-tip-5)+' '+(h-10)+'"/>'+
    '<text class="t1" x="12" y="'+(h/2-2)+'">'+esc(shown)+'</text>'+
    '<text class="t2 handoff-caption" x="12" y="'+(h/2+14)+'">'+caption+'</text>';
  var tooltip=esc(title+(node.sub?' · '+node.sub:'')+' — '+hint);
  if(!available)return '<g class="handoff-unavailable" role="img" aria-label="'+esc(title+' — '+hint)+'"><title>'+tooltip+'</title>'+body+'</g>';
  var attrs=' class="handoff-link" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" aria-label="'+esc(hint)+'"';
  // In the builder, the body remains selectable; the arrow tip is the preview link.
  if(options.authoring)return '<title>'+tooltip+'</title>'+body+'<a'+attrs+'><title>'+esc(hint)+'</title><path class="handoff-hit" d="M'+(w-tip-7)+' 0H'+(w-tip)+'L'+w+' '+h/2+'L'+(w-tip)+' '+h+'H'+(w-tip-7)+'Z"/></a>';
  return '<a'+attrs+'><title>'+tooltip+'</title>'+body+'</a>';
}

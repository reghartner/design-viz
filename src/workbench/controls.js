/* Shared commit discipline, with caller-selected blur and unchanged-value policy. */
function wireBuilderCommit(input,commit,options){
  options=options || {};
  var last=input.value;
  function fire(){
    if(input.value===last && !options.commitUnchanged)return;
    last=input.value;
    if(commit()===false)last=null;
  }
  input.addEventListener('change',fire);
  if(options.blur)input.addEventListener('blur',fire);
  input.addEventListener('keydown',function(ev){
    if(ev.key==='Enter' && input.tagName!=='TEXTAREA'){ev.preventDefault();fire();}
  });
}

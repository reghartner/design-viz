/* Shared commit discipline, with caller-selected blur and unchanged-value policy. */
function wireBuilderCommit(input,commit,options){
  options=options || {};
  var last=input.value,listen=options.listen || function(target,type,fn){target.addEventListener(type,fn);};
  input._flowviewHasDraft=function(){return input.value!==last;};
  function fire(){
    if(input.value===last && !options.commitUnchanged)return;
    last=input.value;
    if(commit()===false)last=null;
  }
  listen(input,'change',fire);
  if(options.blur)listen(input,'blur',fire);
  listen(input,'keydown',function(ev){
    if(ev.key==='Enter' && input.tagName!=='TEXTAREA'){ev.preventDefault();fire();}
  });
}

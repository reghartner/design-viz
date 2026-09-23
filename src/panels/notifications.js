/* Authored notifications are operations; snapshots are absolute and isolated.
   Both phone surfaces use this owner for validation, history and card markup. */
var FlowNotifications = (function () {
  function clean(n) {
    if (!panelObject(n) || typeof n.app !== 'string' || !n.app) return null;
    return {app:n.app,title:typeof n.title==='string'?n.title:'',text:typeof n.text==='string'?n.text:''};
  }
  function warnings(patch,path,out) {
    if (!panelObject(patch)) return;
    if (panelOwn(patch,'clear') && patch.clear!==true)out.push(path+'.clear: must be true — ignored');
    if (!panelOwn(patch,'notify')) return;
    var entries=Array.isArray(patch.notify)?patch.notify:[patch.notify];
    entries.forEach(function(n,i){
      var at=path+'.notify'+(Array.isArray(patch.notify)?'['+i+']':'');
      if(!panelObject(n)){out.push(at+': expected {app, title?, text?} — notification ignored');return;}
      if(typeof n.app!=='string' || !n.app)out.push(at+'.app: required non-empty string — notification ignored');
      ['title','text'].forEach(function(k){if(panelOwn(n,k) && typeof n[k]!=='string')out.push(at+'.'+k+': must be a string — ignored');});
      Object.keys(n).forEach(function(k){if(['app','title','text'].indexOf(k)<0)out.push(at+'.'+k+': not a notification field — ignored (valid: app, title, text)');});
    });
  }
  function create() {
    var stack=[];
    return {
      apply:function(patch){
        if(!panelObject(patch))return 0;
        if(patch.clear===true)stack=[];
        if(!panelOwn(patch,'notify'))return 0;
        var added=(Array.isArray(patch.notify)?patch.notify:[patch.notify]).map(clean).filter(Boolean);
        stack=added.concat(stack);return added.length;
      },
      snapshot:function(){return stack.map(clean);}
    };
  }
  function model(state) {
    var notifications=(Array.isArray(state && state.notifications)?state.notifications:[]).map(clean).filter(Boolean);
    return {notifications:notifications,cards:notifications.slice(0,3),count:notifications.length,badge:notifications.length,
      overflow:Math.max(0,notifications.length-3),added:typeof (state && state._phoneAdded)==='number'?Math.max(0,Math.round(state._phoneAdded)):0};
  }
  function grew(previous,next) {
    return Array.isArray(previous) && next.length>previous.length && previous.every(function(card,i){
      var current=next[next.length-previous.length+i];
      return current && current.app===card.app && current.title===card.title && current.text===card.text;
    });
  }
  function cardsHTML(model,fresh) {
    return model.cards.map(function(card,i){
      return '<div class="phonecard'+(fresh && i===0?' fresh':'')+'">'+
        '<div class="phoneapp" title="'+esc(card.app)+'">'+esc(card.app)+'</div>'+
        (card.title?'<div class="phonetitle" title="'+esc(card.title)+'">'+esc(card.title)+'</div>':'')+
        (card.text?'<div class="phonetext" title="'+esc(card.text)+'">'+esc(card.text)+'</div>':'')+'</div>';
    }).join('');
  }
  return {clean:clean,warnings:warnings,create:create,model:model,grew:grew,cardsHTML:cardsHTML};
})();

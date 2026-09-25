/* Shared authoring surface for both phone panels. The inspector owns the
   transaction and form lifetime; this owns only notification-list controls. */
function createNotificationComposer(options){
  var doc=options.document,controls=options.controls;
  var list=Array.isArray(options.value)?options.value.slice():options.value===undefined?[]:[options.value];
  var wrap=doc.createElement('div');wrap.className='notification-composer';
  var note=doc.createElement('p');note.className='fnote';
  note.textContent=options.initial?'Notifications shown when the story begins.':'These cards are added at this step, above earlier notifications. Top card is shown first.';
  wrap.appendChild(note);
  function update(edit){
    return options.commit(function(current){
      var items=edit(Array.isArray(current)?current.slice():current===undefined?[]:[current]);
      return !items.length?undefined:items.length===1 && !Array.isArray(current)?items[0]:items;
    });
  }
  list.forEach(function(entry,index){
    var card=doc.createElement('fieldset');card.className='notification-editor';
    var title=doc.createElement('legend');title.textContent='Notification '+(index+1);card.appendChild(title);
    if(!panelObject(entry)){
      var warning=doc.createElement('p');warning.className='fnote';
      warning.textContent='This entry is not a notification object. Edit raw JSON or remove it.';card.appendChild(warning);
    }else{
      var preview=doc.createElement('div');preview.className='notification-preview';
      [['app','App'],['title','Title'],['text','Message']].forEach(function(field){
        var key=field[0],label=field[1];
        var input=controls.text(entry[key],function(value){
          return update(function(items){
            if(!panelObject(items[index]))return items;
            var updated=Object.assign(Object.create(null),items[index]);
            if(value===null)delete updated[key];else updated[key]=value;
            items[index]=updated;return items;
          });
        },{required:key==='app'?'An app name is required.':undefined,textarea:key==='text'});
        input.setAttribute('aria-label',label);card.appendChild(controls.row(label,input));
        var line=doc.createElement(key==='app'?'small':key==='title'?'b':'span');
        line.textContent=typeof entry[key]==='string'?entry[key]:'';preview.appendChild(line);
        options.listen(input,'input',function(){line.textContent=input.value;});
      });
      card.appendChild(preview);
    }
    var actions=doc.createElement('div');actions.className='story-actions';
    function move(delta){return update(function(items){var other=index+delta;if(index>=items.length || other<0 || other>=items.length)return items;var current=items[index];items[index]=items[other];items[other]=current;return items;});}
    var up=controls.action('Move up',function(){return move(-1);});up.disabled=index===0;
    var down=controls.action('Move down',function(){return move(1);});down.disabled=index===list.length-1;
    actions.append(up,down,controls.action('Remove notification',function(){return update(function(items){return items.filter(function(_,i){return i!==index;});});}));
    card.appendChild(actions);wrap.appendChild(card);
  });
  wrap.appendChild(controls.action('Add notification',function(){return update(function(items){return items.concat([{app:typeof options.app==='string' && options.app.trim()?options.app:'App'}]);});}));
  return wrap;
}

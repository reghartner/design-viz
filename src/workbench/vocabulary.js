/* Contextual names/colors for connections and story lanes. */
function createVocabularyControl(options){
  var doc=options.document,c=options.controls,protocol=options.kind==='protocols';
  var noun=protocol?'connection type':'lane',definitions=options.definitions;
  var wrap=doc.createElement('div');wrap.className='vocabulary-control';
  var select=c.select(Object.keys(definitions),options.value,options.select,!protocol);
  select.setAttribute('aria-label',protocol?'Connection type':'Story lane');
  Array.from(select.options).forEach(function(option){
    var def=definitions[option.value];if(def)option.textContent=(def.label || option.value)+' · '+option.value;
  });wrap.appendChild(select);
  function remember(details,suffix){
    var key=options.kind+':'+options.value+':'+suffix;details.open=options.open.has(key);
    options.listen(details,'toggle',function(event){if(event.target!==details)return;if(details.open)options.open.add(key);else options.open.delete(key);});
  }
  var current=definitions[options.value];
  if(current){
    var edit=doc.createElement('details');edit.className='rawjson';
    var heading=doc.createElement('summary');heading.textContent='Edit '+noun;edit.appendChild(heading);remember(edit,'edit');
    var note=doc.createElement('p');note.className='fnote';note.textContent='Name and color apply everywhere this '+noun+' is used in the document.';edit.appendChild(note);
    var label=c.text(current.label || options.value,function(value){return options.update(options.value,{label:value},false);},{required:'A display name is required.'});
    label.setAttribute('aria-label','Display name');edit.appendChild(c.row('Display name',label));
    var color=c.text(typeof current.color==='string'?current.color:'',function(value){return options.update(options.value,{color:value},false);},{placeholder:'Palette in JSON; enter #RRGGBB to replace'});
    color.setAttribute('aria-label','Color');edit.appendChild(c.row('Color',color));wrap.appendChild(edit);
  }
  var add=doc.createElement('details');add.className='rawjson';
  var summary=doc.createElement('summary');summary.textContent='New '+noun+'…';add.appendChild(summary);remember(add,'new');
  function input(label,value,placeholder){
    var field=doc.createElement('input');field.className='fctl';field.type='text';field.value=value || '';
    field.setAttribute('aria-label',label);if(placeholder)field.placeholder=placeholder;add.appendChild(c.row(label,field));return field;
  }
  var name=input('Name','','For example, event stream'),id=input('ID (optional)','','Derived from the name'),color=input('New color','#7C5CC4');
  add.appendChild(c.action('Create '+noun,function(){
    var label=name.value.trim(),key=id.value.trim() || label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    return options.update(key,{label:label,color:color.value.trim()},true);
  }));wrap.appendChild(add);return wrap;
}

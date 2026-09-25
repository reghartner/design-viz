/* Local detail rows expose stable IDs while keeping imported null/position
   references and presentation metadata unchanged until explicitly edited. */
function createDetailMappingControl(options){
  var doc=options.document,c=options.controls,detail=options.detail,parent=options.parent || {},child=options.child || {};
  var root=doc.createElement('div');root.className='detail-mappings';
  var map=specObject(detail.stepMap)?detail.stepMap:{},paths=diagramPathList(child),parents=(parent.steps || []).filter(function(s){return typeof s.id==='string' && s.id;});
  var note=doc.createElement('p');note.className='fnote';note.textContent='Map a parent event to the child story. Unset fields inherit the detail’s entry defaults. Preview uses the saved mapping. Numeric imports keep their original type until edited.';root.appendChild(note);
  function option(select,value,label){var o=doc.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);}
  function select(label,items,value,onchange,container){
    var s=doc.createElement('select');s.className='fctl';s.setAttribute('aria-label',label);
    items.forEach(function(p){option(s,p[0],p[1]);});
    if(!items.some(function(p){return p[0]===value;}))option(s,value,'Missing / imported: '+value.replace(/^id:|^number:/,''));
    s.value=value;options.listen(s,'change',onchange);container.appendChild(c.row(label,s));return s;
  }
  function encode(value){return value===undefined?'':value===null?'null':typeof value==='number'?'number:'+value:'id:'+value;}
  function decode(value){return value===''?undefined:value==='null'?null:value.indexOf('number:')===0?Number(value.slice(7)):value.slice(3);}
  function label(s){return (s.text || s.id || 'Untitled event')+(s.id?' · '+s.id:'');}
  function row(key,original,creating){
    var box=doc.createElement('fieldset');box.className='mapping-row';
    var legend=doc.createElement('legend');legend.textContent=creating?'New mapping':(parents.find(function(s){return s.id===key;}) || {}).text || key;box.appendChild(legend);root.appendChild(box);
    if(!specObject(original)){
      var warning=doc.createElement('p');warning.className='fnote';warning.textContent='This imported target is not an object. Repair it in Advanced mapping JSON or remove it.';box.appendChild(warning);
      box.appendChild(c.action('Remove mapping',function(){options.change({action:'remove',key:key});}));return;
    }
    var changes={},draft=Object.assign({},original),parentId=key || (parents.find(function(s){return !Object.prototype.hasOwnProperty.call(map,s.id);}) || {}).id || '';
    var parentSelect=select('When parent event',parents.map(function(s){return [s.id,label(s)];}),parentId,function(){parentId=parentSelect.value;save();},box);
    var childControls=doc.createElement('div');box.appendChild(childControls);
    var error=doc.createElement('p');error.className='fnote mapping-error';error.setAttribute('role','status');box.appendChild(error);
    function effective(){return Object.assign({path:detail.path,step:detail.step},draft);}
    function valid(){
      var target=effective(),resolved=resolveSourceStep(child,target.path || paths[0].id,target.step);
      var reason=!parents.some(function(s){return s.id===parentId;})?'Choose an existing parent event.':!resolved || target.step!=null && resolved.sourceIndex<0?'Choose a child event in this path. Unset fields inherit the entry defaults.':'';
      error.textContent=reason;return !reason;
    }
    function save(){
      if(!valid() || creating)return;
      options.change({action:'write',key:key,parent:parentId,changes:changes});
    }
    function field(key,value){changes[key]=value;if(value===undefined)delete draft[key];else draft[key]=value;}
    function draw(){
      childControls.innerHTML='';
      var target=effective(),route=paths.find(function(p){return p.id===(target.path || paths[0].id);});
      var path=select('Child path',[['','Use default — '+(detail.path || paths[0].id)],['null','First path (explicit)']].concat(paths.map(function(p){return ['id:'+p.id,p.label+' · '+p.id];})),encode(draft.path),function(){field('path',decode(path.value));draw();save();},childControls);
      var step=select('Child event',[['','Use default'+(detail.step?' — '+detail.step:'')],['null','No event override (explicit)']].concat((route?route.indices:[]).map(function(i,n){var s=child.steps[i];return [s.id?'id:'+s.id:'number:'+(n+1),label(s)+(s.id?'':' · position '+(n+1))];})),encode(draft.step),function(){field('step',decode(step.value));save();},childControls);
      if(draft.step!==undefined && draft.step!==null){
        var resolved=resolveSourceStep(child,target.path || paths[0].id,draft.step),caption=doc.createElement('p');caption.className='fnote';
        caption.textContent=resolved && resolved.sourceIndex>=0?'Resolves to '+label(child.steps[resolved.sourceIndex])+(typeof draft.step==='number'?' (imported numeric position)':''):'This imported event is unavailable in the selected path.';childControls.appendChild(caption);
      }
      valid();
    }
    draw();
    if(creating){box.appendChild(c.action('Add mapping',function(){if(valid())options.change({action:'write',key:null,parent:parentId,changes:changes});}));}
    else{
      box.appendChild(c.action('Preview mapping',function(){if(valid())options.preview(key);}));
      box.appendChild(c.action('Remove mapping',function(){options.change({action:'remove',key:key});}));
    }
  }
  Object.keys(map).forEach(function(key){row(key,map[key],false);});
  if(parents.some(function(s){return !Object.prototype.hasOwnProperty.call(map,s.id);})){row(null,{},true);}
  else if(!parents.length){var empty=doc.createElement('p');empty.className='fnote';empty.textContent='Give parent story steps IDs to create mappings.';root.appendChild(empty);}
  var advanced=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent='Advanced mapping JSON';advanced.appendChild(summary);
  var raw=doc.createElement('textarea');raw.className='fctl';raw.setAttribute('aria-label','Advanced mapping JSON');raw.value=detail.stepMap==null?'':JSON.stringify(detail.stepMap,null,2);advanced.appendChild(raw);
  advanced.appendChild(c.action('Apply mapping JSON',function(){var value;try{value=raw.value.trim()?JSON.parse(raw.value):null;}catch(_){options.error('Mapping JSON must be valid JSON.');return;}options.change({action:'replace',value:value});}));root.appendChild(advanced);
  return root;
}

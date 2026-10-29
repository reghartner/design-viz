/* Browser-local status preferences. Built-in values live in the production CSS;
   only explicit overrides are stored, so untouched skin defaults remain intact. */
var FlowStatusColors=(function(){
  var key='flowview.status-colors.v1';
  var fields=[
    ['live-todo','To do'],['live-active','Active'],['live-done','Done'],['live-blocked','Blocked'],['live-missing','Missing work'],['live-unchanged','Unchanged'],
    ['pr-open','PR open'],['pr-draft','PR draft'],['pr-merged','PR merged'],['pr-closed','PR closed'],
    ['checks-passing','Checks passing'],['checks-failing','Checks failing'],['checks-pending','Checks pending']
  ];
  function validate(raw){
    if(!raw || typeof raw!=='object' || Array.isArray(raw) || raw.version!==1 || !raw.colors || typeof raw.colors!=='object' || Array.isArray(raw.colors) || Object.keys(raw).some(function(k){return k!=='version' && k!=='colors';}))throw new Error('Expected a version 1 status palette with a colors object.');
    var colors={};Object.keys(raw.colors).forEach(function(name){
      var value=raw.colors[name];
      if(!fields.some(function(field){return field[0]===name;}) || typeof value!=='string' || !/^#[0-9a-f]{6}$/i.test(value))throw new Error('Invalid color '+name+'. Use a supported name and #RRGGBB.');
      colors[name]=value.toLowerCase();
    });return {version:1,colors:colors};
  }
  function read(win){var raw=win.localStorage.getItem(key);return raw===null?{version:1,colors:{}}:validate(JSON.parse(raw));}
  function apply(view,palette){
    var colors=validate(palette).colors;
    fields.forEach(function(field){var name='--dv-'+field[0];if(colors[field[0]])view.style.setProperty(name,colors[field[0]]);else view.style.removeProperty(name);});
  }
  function save(win,palette){
    palette=validate(palette);
    if(Object.keys(palette.colors).length)win.localStorage.setItem(key,JSON.stringify(palette));else win.localStorage.removeItem(key);
    // storage covers other tabs; this event covers sibling mounts in this window.
    win.dispatchEvent(new win.CustomEvent('flowview-status-colors-change'));
  }
  function connect(view,changed){
    var win=view.ownerDocument && view.ownerDocument.defaultView,retired=false;
    if(!win)return function(){};
    function refresh(event){
      if(retired || event && event.type==='storage' && event.key!==key && event.key!==null)return;
      var palette;try{palette=read(win);}catch(error){palette={version:1,colors:{}};}
      apply(view,palette);if(changed)changed();
    }
    refresh();win.addEventListener('storage',refresh);win.addEventListener('flowview-status-colors-change',refresh);
    return function(){retired=true;win.removeEventListener('storage',refresh);win.removeEventListener('flowview-status-colors-change',refresh);apply(view,{version:1,colors:{}});};
  }
  return {key:key,fields:fields,validate:validate,read:read,apply:apply,save:save,connect:connect};
})();

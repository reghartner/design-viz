/* Browser-local status preferences. Built-in values live in the production CSS;
   only explicit overrides are stored, so untouched skin defaults remain intact. */
var FlowStatusColors=(function(){
  var key='flowview.status-colors.v1';
  var fields=[
    ['live-todo','To do'],['live-active','Active'],['live-done','Done'],['live-blocked','Blocked'],['live-missing','Missing work'],['live-unchanged','Unchanged'],
    ['pr-open','PR open'],['pr-draft','PR draft'],['pr-merged','PR merged'],['pr-closed','PR closed'],
    ['checks-passing','Checks passing'],['checks-failing','Checks failing'],['checks-pending','Checks pending']
  ];
  var settings={borderColor:{suffix:'border-color'},borderWidth:{suffix:'border-width',min:0,max:8,unit:'px'},fillStrength:{suffix:'fill-strength',min:0,max:100,unit:'%'},glowStrength:{suffix:'glow-strength',min:0,max:200,scale:100}};
  function color(value){return typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value);}
  function object(value){return value && typeof value==='object' && !Array.isArray(value);}
  function validate(raw){
    if(!object(raw) || (raw.version!==1 && raw.version!==2) || !object(raw.colors) || Object.keys(raw).some(function(k){return k!=='version' && k!=='colors' && !(raw.version===2 && k==='appearance');}) || raw.version===2 && !object(raw.appearance))throw new Error('Expected a version 1 color palette or version 2 palette with colors and appearance objects.');
    var colors={};Object.keys(raw.colors).forEach(function(name){
      var value=raw.colors[name];
      if(!fields.some(function(field){return field[0]===name;}) || !color(value))throw new Error('Invalid color '+name+'. Use a supported name and #RRGGBB.');
      colors[name]=value.toLowerCase();
    });
    var result={version:raw.version,colors:colors};
    if(raw.version===2){result.appearance={};Object.keys(raw.appearance).forEach(function(name){
      var values=raw.appearance[name];
      if(!fields.slice(0,6).some(function(field){return field[0]===name;}) || !object(values))throw new Error('Invalid status appearance '+name+'.');
      var next={};Object.keys(values).forEach(function(prop){
        if(!Object.prototype.hasOwnProperty.call(settings,prop))throw new Error('Unknown appearance setting '+prop+'.');
        var setting=settings[prop],value=values[prop];
        if(prop==='borderColor'){if(!color(value))throw new Error('Invalid border color. Use #RRGGBB.');next[prop]=value.toLowerCase();}
        else {if(typeof value!=='number' || !Number.isFinite(value) || value<setting.min || value>setting.max)throw new Error(prop+' must be a number from '+setting.min+' to '+setting.max+'.');next[prop]=value;}
      });if(Object.keys(next).length)result.appearance[name]=next;
    });}return result;
  }
  function read(win){var raw=win.localStorage.getItem(key);return raw===null?{version:1,colors:{}}:validate(JSON.parse(raw));}
  function apply(view,palette){
    palette=validate(palette);
    fields.forEach(function(field){var name='--dv-'+field[0];if(palette.colors[field[0]])view.style.setProperty(name,palette.colors[field[0]]);else view.style.removeProperty(name);});
    fields.slice(0,6).forEach(function(field){Object.keys(settings).forEach(function(prop){
      var setting=settings[prop],name='--dv-'+field[0]+'-'+setting.suffix,values=palette.appearance && palette.appearance[field[0]];
      if(values && Object.prototype.hasOwnProperty.call(values,prop)){var value=values[prop];view.style.setProperty(name,prop==='borderColor'?value:String(value/(setting.scale || 1))+(setting.unit || ''));}
      else view.style.removeProperty(name);
    });});
  }
  function save(win,palette){
    palette=validate(palette);
    if(Object.keys(palette.colors).length || palette.appearance && Object.keys(palette.appearance).length)win.localStorage.setItem(key,JSON.stringify(palette));else win.localStorage.removeItem(key);
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
  return {key:key,fields:fields,settings:settings,validate:validate,read:read,apply:apply,save:save,connect:connect};
})();

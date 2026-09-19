/* Visual panel catalog. Examples are isolated from the insertion templates.
   Previews are frozen clones of real renderer output, with no player/controller. */
var PANEL_CATALOG = [
  ['table','Data table','Software & data','Records at a glance','Show rows, changed values, and record status as a request moves through your system.'],
  ['checks','Decision checks','Software & data','Make a decision visible','Explain authorization, validation, or release gates with a result for each check.'],
  ['budget','Resource budget','Software & data','Targets and thresholds','Compare latency, capacity, or cost against an explicit limit and warning threshold.'],
  ['trace','Service trace','Software & data','Inside a request','Break a request into nested spans to show where services spend their time.'],
  ['replicas','Replica positions','Software & data','Who has caught up?','Compare primary and follower positions, roles, and independently reported replication lag.'],
  ['queue','Message queue','Software & data','A message on its journey','Show a message arriving, waiting, or leaving, including what it is waiting for.'],
  ['inflight','In-flight work','Software & data','Concurrent operations','Put overlapping operations on the same step axis so concurrency is easy to follow.'],
  ['log','Event log','Software & data','The running record','Build a readable, tagged event history alongside the steps of your story.'],
  ['state','State machine','State & timing','The current state, clearly','Highlight the current state in a compact rail of possible states.'],
  ['orbit','Lifecycle orbit','State & timing','A cycle of states','Place lifecycle states around a ring and emphasize the active state and transition.'],
  ['waterfall','Latency waterfall','State & timing','See where time goes','Compare operation durations or timed spans to explain the cost of a request.'],
  ['timeline','Heartbeat timeline','State & timing','Events in wall-clock time','Show periodic beats, event markers, and elapsed time across a declared time span.'],
  ['gauge','Value gauge','State & timing','One number and its range','Track a changing measurement against a maximum, with a clear numeric readout.'],
  ['buffer','Buffer','State & timing','A window of stored data','Show occupied, written, or locked segments and the write head of a finite buffer.'],
  ['homemap','Home map','Places & sensing','Put the story in a place','Arrange rooms, devices, doors, and people on a shared map, then change their states step by step.'],
  ['screen','Camera view','Places & sensing','What the camera sees','Show a camera scene moving through live view, recording, saving, and other modes.'],
  ['zoneframe','Detection zones','Places & sensing','Where an event counts','Explain armed, ignored, or masked regions inside a camera frame.'],
  ['pir','Motion sensor','Places & sensing','Inside the motion cone','Show a subject entering or leaving a passive infrared sensor’s field of view.'],
  ['radar','Range radar','Places & sensing','Distance makes the difference','Show measured range, detection zones, and alert thresholds around a sensor.'],
  ['thermo','Temperature','Devices & interfaces','Temperature over time','Display temperature, warning bands, and its history across the story’s steps.'],
  ['battery','Battery','Devices & interfaces','Charge and power context','Track charge level, charging source, thresholds, and a history of battery levels.'],
  ['leds','Status lights','Devices & interfaces','Small signals, clear meaning','Show power, radio, and activity indicators changing with a device’s state.'],
  ['signal','Connection strength','Devices & interfaces','The health of a link','Compare transport, connection status, signal strength, and notes for device links.'],
  ['tiles','Device fleet','Devices & interfaces','Many devices, one view','Compare named devices in a compact grid, each with its own status and detail.'],
  ['phone','Phone notifications','Devices & interfaces','The user-facing moment','Show notifications stacking on a phone as events reach the user.'],
  ['deviceapp','Device app','Devices & interfaces','Values with their sources','Present device health fields and the backend source that supplied each value.'],
  ['xray','Layer X-ray','Devices & interfaces','Look through the layers','Explain nested layers, who holds each key, and where a payload becomes readable.'],
  ['image','Reference image','Reference','Bring your own visual','Embed a screenshot, photo, or sketch beside the flow, with optional caption and source link.']
].map(function(entry){ return {type:entry[0],name:entry[1],category:entry[2],tagline:entry[3],description:entry[4]}; });

function panelPickerExample(type){
  var panel = builderClone(PANEL_TEMPLATES[type]);
  panel.type = type; panel.id = 'picker-example-' + type;
  var state = builderClone(panel.initial || {}), states = [], step = 0;
  if (type === 'table') state.rows = [
    {id:'order',cells:{key:'order.status',value:'confirmed'},status:'changed'},
    {id:'payment',cells:{key:'payment.id',value:'pay_2048'},status:'added'},
    {id:'stock',cells:{key:'inventory',value:'reserved'}}];
  if (type === 'checks') state.results = {auth:{status:'pass'},unique:{status:'pass'}};
  if (type === 'budget') state.values = {latency:186};
  if (type === 'queue') state = {state:'held',label:'order.created',reason:'worker ready'};
  if (type === 'inflight'){
    panel.lanes = [{id:'request',label:'Request'},{id:'query',label:'Database'},{id:'event',label:'Event'}];
    state = {bars:[{lane:'request',start:0,end:5,label:'handle request'},{lane:'query',start:1,end:3,label:'query'},{lane:'event',start:3,label:'publish'}]};
    states = [{},{},{},{},{},{}]; step = 5;
  }
  if (type === 'log') state.log = [{tag:'NET',text:'Connected to gateway'},{tag:'NET',text:'Event received · 200 OK'},{tag:'NET',text:'Acknowledgement sent'}];
  if (type === 'state') state.state = 'LIVE';
  if (type === 'orbit') state = {state:'ACTIVE',via:'request received'};
  if (type === 'waterfall') panel.spans = [{id:'net',label:'network',ms:40},{id:'auth',label:'authorize',ms:25},{id:'work',label:'processing',ms:120}];
  if (type === 'timeline') state = {now:'2h',events:[{at:'45m',label:'wake',kind:'info'},{at:'1h40m',label:'report',kind:'info'}]};
  if (type === 'gauge') state.value = 248;
  if (type === 'buffer') state = {cells:['buffered','buffered','buffered','protected','protected','protected','empty','empty','empty','empty','empty','empty'],head:6,note:'6 of 12 segments in use'};
  if (type === 'screen'){ panel.scene = 'person-through-door'; state = {mode:'live'}; }
  if (type === 'zoneframe') state = {zones:{porch:'armed'},subject:{x:86,y:110},verdict:'alert'};
  if (type === 'pir') state = {subject:{x:188,y:88},tripped:true};
  if (type === 'radar') state = {subject:{x:195,y:90},alert:true};
  if (type === 'thermo'){
    state.value = 42; states = [21,24,26,25,31,38,42].map(function(value){ return {value:value}; }); step = 6;
  }
  if (type === 'battery'){
    state = {charge:76,source:'solar',trend:'charging'};
    states = [48,47,49,56,64,72,76].map(function(charge){ return {charge:charge}; }); step = 6;
  }
  if (type === 'leds') state = {power:'on',radio:'tx'};
  if (type === 'signal') state = {up:{state:'ok',bars:3,note:'Connected'}};
  if (type === 'tiles') state = {t1:{state:'ONLINE',sub:'Gateway'},t2:{state:'READY',sub:'Camera'}};
  if (type === 'phone') state = {clock:'9:41',notifications:[{app:'Home',title:'Someone is at the door',text:'Front door · Just now'}]};
  if (type === 'xray'){panel.layers[0].holder = 'Gateway';state = {layers:[{id:'case',open:true},{id:'board',open:false}],hop:'gateway'};}
  panel.initial = builderClone(state);
  if (type === 'phone'){
    panel.initial.notify = panel.initial.notifications;
    delete panel.initial.notifications;
    state = foldPhoneStates(panel,[])[0];
  }
  return {panel:panel,state:state,states:states,step:step};
}

/* Make the image example locally: no fetch, third-party media, or spec mutation. */
function panelPickerReferenceImage(){
  var canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 340;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3f1fa'; ctx.fillRect(0,0,640,340);
  ctx.strokeStyle = '#b6adc9'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(180,170); ctx.lineTo(460,170); ctx.stroke();
  [[45,'App','#e1ece6'],[245,'Service','#e8e0f5'],[445,'Store','#dfe9f4']].forEach(function(item){
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(item[0],108,150,126,14); ctx.fill();
    ctx.strokeStyle = '#c8c1d8'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = item[2]; ctx.beginPath(); ctx.arc(item[0]+75,147,16,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#56516c'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(item[1],item[0]+75,197);
  });
  ctx.fillStyle = '#82788e'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('REFERENCE · SYSTEM OVERVIEW',34,42);
  return canvas.toDataURL('image/png');
}

var PANEL_PICKER_ID = 0;
function panelPickerNamespace(root){
  var ids = Object.create(null);
  root.querySelectorAll('[id]').forEach(function(node){
    var id;
    do { id = 'dv-panel-preview-' + (++PANEL_PICKER_ID); } while (document.getElementById(id));
    ids[node.id] = id; node.id = id;
  });
  root.querySelectorAll('*').forEach(function(node){
    Array.from(node.attributes).forEach(function(attr){
      var value = attr.value.replace(/url\(#([^\)]+)\)/g,function(match,id){ return ids[id] ? 'url(#' + ids[id] + ')' : match; });
      if ((attr.name === 'href' || attr.name === 'xlink:href') && value[0] === '#' && ids[value.slice(1)]) value = '#' + ids[value.slice(1)];
      if (['aria-labelledby','aria-describedby','for'].indexOf(attr.name) >= 0) value = value.split(' ').map(function(id){ return ids[id] || id; }).join(' ');
      if (value !== attr.value) node.setAttribute(attr.name,value);
    });
  });
  return root;
}

function panelPickerPreview(type, referenceImage, skin){
  var sample = panelPickerExample(type);
  if (type === 'image'){ sample.panel.src = referenceImage; sample.panel.caption = 'Your screenshot, photo, or sketch'; }
  var host = document.createElement('div'); host.className = 'pbody';
  renderPanelBody(host,sample.panel,sample.state,skin || 'aurora',sample.states,sample.step,false);
  /* false disables JS animation. Cloning drops device-app listeners and every
     renderer expando; the detached original is then collectible. CSS motion is
     paused on the clone. Never instantiate buildPanels or a playback timer. */
  var snapshot = panelPickerNamespace(host.cloneNode(true));
  var widget = document.createElement('div'); widget.className = 'pwidget pt-' + type;
  var title = document.createElement('div'); title.className = 'ptitle'; title.textContent = sample.panel.title;
  widget.appendChild(title); widget.appendChild(snapshot);
  return widget;
}

function panelPickerCurrent(snapshot, current){
  return !!snapshot && !!current && !current.error && snapshot.text === current.text && snapshot.section === current.section;
}

function initPanelPicker(opts){
  var dialog = document.getElementById('panel-picker');
  if (!dialog) return null;
  var grid = document.getElementById('panel-picker-grid'), search = document.getElementById('panel-picker-search');
  var filters = document.getElementById('panel-picker-filters'), detail = document.getElementById('panel-picker-preview');
  var add = document.getElementById('panel-picker-add'), status = document.getElementById('panel-picker-status');
  var snapshot = null, selected = null, category = 'All panels', opener = null, invalid = false, referenceImage = null;
  var resize = typeof ResizeObserver === 'function' ? new ResizeObserver(fitPreviews) : null;
  function el(id){ return document.getElementById(id); }
  function fitPreviews(){
    dialog.querySelectorAll('.panel-picker-art').forEach(function(frame){
      var widget = frame.firstElementChild;
      if (!widget) return;
      widget.style.maxHeight = ''; widget.style.overflow = '';
      var widthScale = Math.min((frame.clientWidth - 26) / 340,1), height = widget.offsetHeight;
      var large = frame.classList.contains('panel-picker-art-large');
      if (large) frame.style.height = Math.min(440,Math.max(245,height * widthScale + 24)) + 'px';
      /* Fit the complete widget in both views. No content is clipped from
         catalog thumbnails; tall reports simply use a smaller scale. */
      var scale = Math.min(widthScale,(frame.clientHeight - 24) / height);
      widget.style.transform = 'translate(-50%,-50%) scale(' + Math.max(.1,scale) + ')';
    });
  }
  function makePreview(type, large){
    var frame = document.createElement('div');
    var skins = Array.from(document.body.classList).filter(function(name){return name.indexOf('sk-') === 0;});
    frame.className = 'panel-picker-art docview ' + skins.join(' ') + (large ? ' panel-picker-art-large' : '');
    frame.setAttribute('aria-hidden','true'); frame.setAttribute('inert','');
    frame.appendChild(panelPickerPreview(type,referenceImage,skins.indexOf('sk-daylight') >= 0 ? 'daylight' : 'aurora'));
    return frame;
  }
  function select(type){
    selected = PANEL_CATALOG.find(function(entry){ return entry.type === type; });
    grid.querySelectorAll('.panel-picker-card').forEach(function(card){card.setAttribute('aria-pressed',String(card.dataset.panelType === type));});
    el('panel-picker-category').textContent = selected.category;
    el('panel-picker-name').textContent = selected.name;
    el('panel-picker-description').textContent = selected.description;
    el('panel-picker-type').textContent = selected.type;
    detail.replaceChildren(makePreview(type,true));
    add.disabled = invalid;
    fitPreviews();
  }
  function paintGrid(){
    var query = search.value.trim().toLowerCase();
    var entries = PANEL_CATALOG.filter(function(entry){return (category === 'All panels' || entry.category === category) &&
      (!query || [entry.name,entry.type,entry.category,entry.description].join(' ').toLowerCase().indexOf(query) >= 0);});
    grid.replaceChildren();
    entries.forEach(function(entry){
      var card = document.createElement('button'); card.type = 'button'; card.className = 'panel-picker-card'; card.dataset.panelType = entry.type;
      card.setAttribute('aria-pressed',String(selected && selected.type === entry.type)); card.setAttribute('aria-label',entry.name + ': ' + entry.tagline);
      card.appendChild(makePreview(entry.type,false));
      var copy = document.createElement('span'); copy.className = 'panel-picker-card-copy';
      var name = document.createElement('strong'); name.textContent = entry.name; copy.appendChild(name);
      var check = document.createElement('span'); check.className = 'panel-picker-check'; check.textContent = '✓'; check.setAttribute('aria-hidden','true'); copy.appendChild(check);
      var tagline = document.createElement('span'); tagline.textContent = entry.tagline; copy.appendChild(tagline);
      card.appendChild(copy); card.addEventListener('click',function(){select(entry.type);}); grid.appendChild(card);
    });
    filters.querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.textContent === category));});
    el('panel-picker-count').textContent = entries.length + (entries.length === 1 ? ' panel' : ' panels');
    el('panel-picker-empty').hidden = !!entries.length;
    grid.scrollTop = 0; fitPreviews();
  }
  function invalidate(){
    if (!dialog.open) return;
    invalid = true; add.disabled = true;
    status.textContent = 'The diagram or destination changed. Close this picker and open it again to choose the current section.';
    status.hidden = false;
  }
  function cleanup(){
    if (resize) resize.disconnect();
    grid.replaceChildren(); detail.replaceChildren(); snapshot = null; selected = null; referenceImage = null;
  }
  function close(){
    if (!dialog.open) return;
    dialog.close(); cleanup();
    if (opener && opener.isConnected) opener.focus({preventScroll:true});
  }
  function open(){
    var current = opts.context();
    if (current.error){ opts.error(current.error); return; }
    snapshot = current; opener = document.activeElement; invalid = false; selected = null;
    category = 'All panels'; search.value = ''; status.hidden = true; status.textContent = '';
    el('panel-picker-destination').textContent = current.label;
    referenceImage = panelPickerReferenceImage();
    if (opts.pause) opts.pause();
    paintGrid(); select('table'); dialog.showModal(); fitPreviews();
    if (resize) resize.observe(dialog);
    search.focus();
  }
  ['All panels'].concat(Array.from(new Set(PANEL_CATALOG.map(function(entry){return entry.category;})))).forEach(function(name){
    var button = document.createElement('button'); button.type = 'button'; button.textContent = name;
    button.addEventListener('click',function(){category = name;paintGrid();}); filters.appendChild(button);
  });
  search.addEventListener('input',paintGrid);
  el('panel-picker-clear').addEventListener('click',function(){search.value = '';category = 'All panels';paintGrid();search.focus();});
  el('panel-picker-close').addEventListener('click',close);
  el('panel-picker-cancel').addEventListener('click',close);
  add.addEventListener('click',function(){
    if (invalid || !selected) return;
    if (!panelPickerCurrent(snapshot,opts.context())){invalidate();return;}
    var type = selected.type;
    close(); opts.insert(type);
  });
  dialog.addEventListener('cancel',function(ev){ev.preventDefault();close();});
  dialog.addEventListener('close',function(){if (!dialog.open) cleanup();});
  /* Keep Escape, Delete, and editor/history shortcuts inside the modal. Native
     dialog behavior handles focus containment; Escape also closes from a
     populated search field instead of only clearing its search text. */
  dialog.addEventListener('keydown',function(ev){ev.stopPropagation();if (ev.key === 'Escape'){ev.preventDefault();close();}});
  dialog.addEventListener('click',function(ev){ev.stopPropagation();});
  opts.src.addEventListener('input',invalidate);
  return {open:open,close:close,refresh:function(){if(dialog.open && !panelPickerCurrent(snapshot,opts.context())) invalidate();},invalidate:invalidate};
}

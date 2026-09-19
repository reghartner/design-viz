/* Visual panel catalog. Examples are isolated from the insertion templates.
   Previews are frozen clones of real renderer output, with no player/controller. */
var PANEL_CATALOG = new Proxy([], {
  get:function(_,key){var entries=panelAuthoringCatalog();var value=entries[key];return typeof value === 'function' ? value.bind(entries) : value;}
});
function panelPickerExample(type, context){
  var authoring=panelAuthoring(type), panel=builderClone(authoring.template || {});
  panel.type=type;panel.id='picker-example-'+type;
  var sample={panel:panel,state:builderClone(panel.initial || {}),states:[],step:0};
  if (authoring.example) sample=authoring.example(sample,context || {}) || sample;
  else panel.initial=builderClone(sample.state);
  return sample;
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
  var sample = panelPickerExample(type, {referenceImage:referenceImage});
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
    detail.parentElement.scrollTop = 0;
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
    paintFilters(); paintGrid();
    var first=panelAuthoringCatalog()[0];if(first)select(first.type);
    dialog.showModal(); fitPreviews();
    if (resize) resize.observe(dialog);
    search.focus({preventScroll:true});
    /* A hidden dialog can retain its old scroll positions. Reset after it is
       visible and focused, so each opening starts with the selected card. */
    grid.scrollTop = 0;
    detail.parentElement.scrollTop = 0;
    dialog.querySelector('.panel-picker-content').scrollTop = 0;
  }
  function paintFilters(){
    filters.replaceChildren();
  ['All panels'].concat(Array.from(new Set(PANEL_CATALOG.map(function(entry){return entry.category;})))).forEach(function(name){
    var button = document.createElement('button'); button.type = 'button'; button.textContent = name;
    button.addEventListener('click',function(){category = name;paintGrid();}); filters.appendChild(button);
  });
  }
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

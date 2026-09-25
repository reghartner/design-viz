/* deviceapp validation and pure state helpers. */
/* Device app values are authored UI data, with optional per-field provenance.
   A source node is a diagram reference, never an instruction to fetch an API. */
var DEVICEAPP_STATUSES = ['unknown', 'loading', 'ready', 'stale', 'error'];
var DEVICEAPP_SCREENS = ['home', 'app'];
function deviceAppItems(panel, key) {
  var seen = Object.create(null),
    reserved = ['phoneScreen', 'clock', 'date', 'note', 'notify', 'clear', 'notifications', 'constructor', 'prototype'];
  return (Array.isArray(panel && panel[key]) ? panel[key] : [])
    .filter(function (item) {
      if (
        !panelObject(item) ||
        typeof item.id !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_-]*$/.test(item.id) ||
        seen[item.id] ||
        reserved.indexOf(item.id) >= 0
      )
        return false;
      seen[item.id] = true;
      return true;
    })
    .slice(0, key === 'sources' ? 6 : 12);
}
function deviceAppPatchWarnings(obj, path, panel, warnings) {
  if (obj == null) return;
  if (!panelObject(obj)) {
    warnings.push(path + ': expected an object — ignored');
    return;
  }
  FlowNotifications.warnings(obj,path,warnings);
  var fields = deviceAppItems(panel, 'fields'),
    sources = deviceAppItems(panel, 'sources');
  Object.keys(obj).forEach(function (key) {
    if (key === 'notify' || key === 'clear') return;
    if (key === 'phoneScreen') {
      if (DEVICEAPP_SCREENS.indexOf(obj[key]) < 0) warnings.push(path + '.phoneScreen: expected home or app — ignored');
      return;
    }
    if (key === 'clock' || key === 'date' || key === 'note') {
      if (typeof obj[key] !== 'string')
        warnings.push(path + '.' + key + ': expected text — ignored');
      return;
    }
    var f = fields.find(function (field) {
        return field.id === key;
      }),
      v = obj[key],
      p = path + '.' + key;
    if (!f) {
      warnings.push(p + ': unknown deviceapp field — ignored');
      return;
    }
    if (v === null) return;
    if (!panelObject(v)) {
      warnings.push(p + ': expected {value?, status?, source?, detail?, visible?, icon?} or null — ignored');
      return;
    }
    Object.keys(v).forEach(function (k) {
      if (['value', 'status', 'source', 'detail', 'visible', 'icon'].indexOf(k) < 0)
        warnings.push(p + '.' + k + ': unknown field property — ignored');
    });
    if (
      panelOwn(v, 'value') &&
      v.value !== null &&
      !(typeof v.value === 'string' || isFiniteNum(v.value) || typeof v.value === 'boolean')
    )
      warnings.push(p + '.value: expected text, finite number, boolean or null — ignored');
    if (
      f.kind === 'battery' &&
      v.value != null &&
      (!isFiniteNum(v.value) || v.value < 0 || v.value > 100)
    )
      warnings.push(p + '.value: battery expects 0–100 — invalid values display as unknown');
    if (panelOwn(v, 'status') && DEVICEAPP_STATUSES.indexOf(v.status) < 0)
      warnings.push(p + '.status: expected ' + DEVICEAPP_STATUSES.join(', ') + ' — ignored');
    if (
      panelOwn(v, 'source') &&
      v.source !== null &&
      !sources.some(function (s) {
        return s.id === v.source;
      })
    )
      warnings.push(p + '.source: unknown source ID — ignored');
    if (panelOwn(v, 'detail') && v.detail !== null && typeof v.detail !== 'string')
      warnings.push(p + '.detail: expected text or null — ignored');
    if (panelOwn(v, 'visible') && typeof v.visible !== 'boolean')
      warnings.push(p + '.visible: expected true or false — ignored');
    if (panelOwn(v, 'icon') && v.icon !== null && ICON_SET.indexOf(v.icon) < 0)
      warnings.push(p + '.icon: unknown icon — ignored');
  });
}
function deviceAppWarnings(panel, d, path, warnings) {
  ['device', 'subtitle', 'appName'].forEach(function (k) {
    if (panel[k] != null && typeof panel[k] !== 'string')
      warnings.push(path + '.' + k + ': expected text — ignored');
  });
  if(panel.showSources!=null && typeof panel.showSources!=='boolean')warnings.push(path+'.showSources: expected true or false — using automatic source visibility');
  ['sources', 'fields'].forEach(function (key) {
    var items = deviceAppItems(panel, key),
      raw = panel[key];
    if (raw == null) return;
    if (!Array.isArray(raw))warnings.push(path+'.'+key+': expected an array — ignored');
    else if (items.length !== raw.length)
      warnings.push(
        path +
          '.' +
          key +
          ': use unique letter-led IDs and at most ' +
          (key === 'sources' ? 6 : 12) +
          ' entries; phoneScreen/clock/date/note/notify/clear/notifications/constructor/prototype are reserved — invalid entries ignored'
      );
    items.forEach(function (item, i) {
      var p = path + '.' + key + '[' + i + ']';
      ['label', 'detail', 'endpoint', 'unit'].forEach(function (k) {
        if (item[k] != null && typeof item[k] !== 'string')
          warnings.push(p + '.' + k + ': expected text — ignored');
      });
      if (key === 'sources') {
        if (
          item.color != null &&
          (typeof item.color !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(item.color))
        )
          warnings.push(p + '.color: use #RGB or #RRGGBB — using palette color');
        if (item.node != null && (typeof item.node !== 'string' || !panelOwn(d.nodes, item.node)))
          warnings.push(p + '.node: unknown diagram node — no node highlight');
      } else {
        if (item.kind != null && ['text', 'battery'].indexOf(item.kind) < 0)
          warnings.push(p + '.kind: expected text or battery — using text');
        if (item.icon != null && ICON_SET.indexOf(item.icon) < 0)
          warnings.push(p + '.icon: unknown icon — ignored');
        if (
          item.source != null &&
          !deviceAppItems(panel, 'sources').some(function (s) {
            return s.id === item.source;
          })
        )
          warnings.push(p + '.source: unknown source ID — shown as unmapped');
      }
    });
  });
  deviceAppPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function foldDeviceAppStates(panel, steps) {
  var fields = deviceAppItems(panel, 'fields'),
    sources = deviceAppItems(panel, 'sources'),
    carried = Object.create(null),
    notifications = FlowNotifications.create(),
    added = 0,
    states = [];
  function apply(patch) {
    var updated = [];
    added = notifications.apply(patch);
    if (!panelObject(patch)) return updated;
    if (DEVICEAPP_SCREENS.indexOf(patch.phoneScreen) >= 0) carried.phoneScreen = patch.phoneScreen;
    ['clock', 'date', 'note'].forEach(function (k) {
      if (typeof patch[k] === 'string') carried[k] = patch[k];
    });
    fields.forEach(function (f) {
      if (!panelOwn(patch, f.id)) return;
      var v = patch[f.id],
        next = Object.assign({}, carried[f.id] || {});
      if (v === null) next = { value: null, status: 'unknown', detail: '', source: null };
      else if (panelObject(v)) {
        if (
          panelOwn(v, 'value') &&
          (v.value === null ||
            typeof v.value === 'string' ||
            isFiniteNum(v.value) ||
            typeof v.value === 'boolean')
        )
          next.value = v.value;
        if (DEVICEAPP_STATUSES.indexOf(v.status) >= 0) next.status = v.status;
        if (
          panelOwn(v, 'source') &&
          (v.source === null ||
            sources.some(function (s) {
              return s.id === v.source;
            }))
        )
          next.source = v.source;
        if (v.detail === null || typeof v.detail === 'string') next.detail = v.detail || '';
        if (typeof v.visible === 'boolean') next.visible = v.visible;
        if (panelOwn(v, 'icon') && (v.icon === null || ICON_SET.indexOf(v.icon) >= 0)) next.icon = v.icon;
      } else return;
      if (JSON.stringify(next) !== JSON.stringify(carried[f.id] || {})) updated.push(f.id);
      carried[f.id] = next;
    });
    return updated;
  }
  function snapshot(updated) {
    var out = Object.create(null);
    Object.keys(carried).forEach(function (k) {
      out[k] = panelObject(carried[k]) ? Object.assign({}, carried[k]) : carried[k];
    });
    out._updated = updated;
    out.notifications = notifications.snapshot();
    out._phoneAdded = added;
    return out;
  }
  apply(panel.initial);
  (steps || []).forEach(function (st) {
    states.push(snapshot(apply((stepPanelPatch(st) || {})[panel.id])));
  });
  if (!states.length) {added=0;states.push(snapshot([]));}
  return states;
}

PanelRegistry.extend('deviceapp', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    deviceAppWarnings(p, d, PP, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    deviceAppPatchWarnings(patch, path, panel, warnings);
  },
  fold: foldDeviceAppStates,
});

/* deviceapp panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function deviceAppModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var str = function (v, fallback) {
    return typeof v === 'string' ? v : fallback || '';
  };
  var palette = ['#5865d8', '#168878', '#bd6716', '#a354b5', '#287fbe', '#b95164'];
  var sources = deviceAppItems(panel, 'sources').map(function (s, i) {
    return {
      id: s.id,
      label: str(s.label, s.id),
      letter: String.fromCharCode(65 + i),
      color:
        typeof s.color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.color)
          ? s.color
          : palette[i],
      node: str(s.node),
      endpoint: str(s.endpoint),
      detail: str(s.detail),
    };
  });
  var fields = deviceAppItems(panel, 'fields').map(function (f) {
    var v = panelObject(state[f.id]) ? state[f.id] : {},
      battery = f.kind === 'battery';
    var source = sources.find(function (s) {
      return s.id === (v.source == null ? f.source : v.source);
    });
    var valid =
      v.value != null &&
      (typeof v.value === 'string' || isFiniteNum(v.value) || typeof v.value === 'boolean');
    if (battery) valid = isFiniteNum(v.value) && v.value >= 0 && v.value <= 100;
    return {
      id: f.id,
      label: str(f.label, f.id),
      source: source || null,
      battery: battery,
      icon: ICON_SET.indexOf(v.icon) >= 0 ? v.icon : ICON_SET.indexOf(f.icon) >= 0 ? f.icon : battery ? 'battery' : null,
      value: valid ? String(v.value) + (battery ? '%' : str(f.unit)) : '—',
      pct: battery && valid ? v.value : 0,
      status: DEVICEAPP_STATUSES.indexOf(v.status) >= 0 ? v.status : 'unknown',
      detail: str(v.detail),
      visible: v.visible !== false,
      updated: Array.isArray(state._updated) && state._updated.indexOf(f.id) >= 0,
    };
  });
  return {
    screen: state.phoneScreen === 'home' ? 'home' : 'app',
    appName: str(panel.appName, str(panel.brand && panel.brand.app, 'Device app')),
    brand: panel.brand,
    device: str(panel.device, 'Camera'),
    subtitle: str(panel.subtitle, 'Device health'),
    clock: str(state.clock, '9:41'),
    date: str(state.date),
    note: str(state.note),
    showSources: sources.length>0 && panel.showSources!==false,
    notifications: FlowNotifications.model(state),
    sources: sources,
    fields: fields,
  };
}
function deviceAppNotificationsHTML(m, fresh) {
  if (!m.notifications.count) return '';
  return '<section class="da-notifications" aria-label="Notifications">'+
    '<div class="da-notification-heading"><span>Notifications</span><span class="da-notification-count" aria-label="'+m.notifications.count+' unread">'+m.notifications.count+'</span></div>'+
    '<div class="da-notification-cards">'+FlowNotifications.cardsHTML(m.notifications,fresh)+'</div>'+
    (m.notifications.overflow?'<div class="phoneoverflow">+'+m.notifications.overflow+' more</div>':'')+'</section>';
}
function deviceAppHomeHTML(m, fresh) {
  var h='<div class="da-home-clock"><span>Home screen</span><strong>'+esc(m.clock)+'</strong></div>'+
    deviceAppNotificationsHTML(m,fresh)+
    (!m.notifications.count?'<div class="da-home-empty">No notifications</div>':'')+
    '<div class="da-launcher" aria-label="Home screen apps">';
  [['camera',m.appName],['phone','Calls'],['speaker','Music'],['gear','Settings']].forEach(function(app,index){
    // Decorative phone UI: story steps own navigation, not these app icons.
    h+='<div class="da-launcher-app'+(index===0?' da-launcher-primary':'')+'"><span class="da-launcher-icon" aria-hidden="true">'+
      (index===0 && deviceAppBrand(m,true) || FlowIcons.render(app[0]))+
      (index===0 && m.notifications.count?'<i>'+m.notifications.count+'</i>':'')+'</span><span>'+esc(app[1])+'</span></div>';
  });
  return h+'</div>'+(!m.showSources && m.note?'<p class="da-app-note">'+esc(m.note)+'</p>':'');
}
function deviceAppBrand(m, compact) {
  return FlowBrand.render(panelObject(m.brand) ? Object.assign({},m.brand,{app:m.appName}) : m.brand,{compact:!!compact});
}
function deviceAppPanelHTML(panel, state, fresh, notificationFresh, screenFresh) {
  var m = deviceAppModel(panel, state),
    labels = {
      unknown: 'No data',
      loading: 'Loading',
      ready: 'Current',
      stale: 'Cached',
      error: 'Unavailable',
    };
  function badge(s) {
    return '<span class="da-badge" aria-hidden="true">' + (s ? s.letter : '?') + '</span>';
  }
  function props(s) {
    return (
      ' data-da-source="' +
      esc(s ? s.id : '') +
      '" style="--da-color:' +
      (s ? s.color : '#78808d') +
      '"'
    );
  }
  var h =
    '<div class="deviceapp'+(m.showSources?'':' da-standalone')+'"><div class="da-phone-fit"><div class="da-phone da-phone-'+m.screen+'" data-da-screen="'+m.screen+'">'+
    '<div class="da-statusbar'+(m.date?' da-has-date':'')+'"><span>'+esc(m.clock)+'</span>'+
    (m.date?'<span class="da-date" title="'+esc(m.date)+'">'+esc(m.date)+'</span>':'')+
    '<span class="da-system-icons" aria-hidden="true">'+FlowIcons.render('signal',{monochrome:true})+FlowIcons.render('battery-full',{monochrome:true})+'</span></div>'+
    '<div class="da-screen da-screen-'+m.screen+(screenFresh?' fresh':'')+'" tabindex="0" aria-label="'+(m.screen==='home'?'Phone home screen':'Device app screen')+'">';
  if(m.screen==='home') h+=deviceAppHomeHTML(m,notificationFresh);
  else {
    h+='<div class="da-appbar">'+(deviceAppBrand(m,false) || FlowIcons.render('camera')+esc(m.appName))+'</div>'+
      '<div class="da-heading"><span class="da-eyebrow">CAMERA DETAILS</span><h3>'+esc(m.device)+'</h3><span>'+esc(m.subtitle)+'</span></div>'+
      deviceAppNotificationsHTML(m,notificationFresh)+'<div class="da-fields">';
    m.fields.filter(function(f){return f.visible;}).forEach(function (f) {
      var mapped=m.showSources && f.source;
      h +=
        (mapped?'<button type="button"':'<div')+' class="da-field da-' +
        f.status +
        (f.updated ? ' da-updated' : '') +
        (fresh && f.updated ? ' fresh' : '') +
        '" data-da-field="' +
        esc(f.id) +
        '"' +
        (mapped?props(f.source)+' aria-pressed="false"':' style="--da-color:#6875ca"') +
        ' aria-label="' +
        esc(
          f.label +
            ': ' +
            f.value +
            '. ' +
            labels[f.status] +
            (mapped?'. Source: '+f.source.label:'')
        ) +
        '">' +
        '<span class="da-field-top"><span>' +
        esc(f.label) +
        '</span>' +
        (mapped?badge(f.source):'') +
        '</span>' +
        '<span class="da-value">' +
        (f.icon
          ? FlowIcons.render(f.icon,{className:'da-icon'})
          : '') +
        esc(f.value) +
        '</span>' +
        (f.battery
          ? '<span class="da-meter" aria-hidden="true"><i style="width:' + f.pct + '%"></i></span>'
          : '') +
        '<span class="da-meta"><span class="da-state">' +
        labels[f.status] +
        '</span>' +
        (f.updated ? '<span class="da-update-label">Updated</span>' : '') +
        '</span>' +
        (f.detail ? '<span class="da-detail">' + esc(f.detail) + '</span>' : '') +
        (mapped?'</button>':'</div>');
    });
    h+='</div>';
    if(!m.fields.some(function(f){return f.visible;}))h+='<div class="da-empty-cards">No data cards shown</div>';
    if(!m.showSources && m.note)h+='<p class="da-app-note">'+esc(m.note)+'</p>';
  }
  h+='</div><div class="da-home" aria-hidden="true"></div></div></div>';
  if(!m.showSources)return h+'</div>';
  h += '<div class="da-provenance"><div class="da-eyebrow">WHERE THE DATA COMES FROM</div>' +
    '<h3>One screen. Multiple sources.</h3><p class="da-help">Select a field or source to trace its data' +
    (m.sources.some(function (s) {
      return s.node;
    })
      ? ' and highlight its service in the diagram'
      : '') +
    '.</p><div class="da-sources">';
  m.sources.forEach(function (s) {
    var fields = m.fields.filter(function (f) {
      return f.visible && f.source && f.source.id === s.id;
    });
    h +=
      '<button type="button" class="da-source"' +
      props(s) +
      ' aria-pressed="false"><span class="da-source-title">' +
      badge(s) +
      '<strong>' +
      esc(s.label) +
      '</strong></span>' +
      (s.endpoint ? '<code>' + esc(s.endpoint) + '</code>' : '') +
      (s.detail ? '<span class="da-detail">' + esc(s.detail) + '</span>' : '') +
      '<span class="da-source-fields">' +
      esc(
        fields.length
          ? fields
              .map(function (f) {
                return f.label + ' · ' + labels[f.status];
              })
              .join(' / ')
          : 'No fields in this step'
      ) +
      '</span></button>';
  });
  return (
    h + '</div>' + (m.note ? '<p class="da-note">' + esc(m.note) + '</p>' : '') + '</div></div>'
  );
}
function bindDeviceAppSources(host, panel, state) {
  if (typeof host.querySelectorAll !== 'function') return;
  if (host._daClear) host._daClear();
  var nodes = [],
    m = deviceAppModel(panel, state);
  var buttons = Array.from(host.querySelectorAll('[data-da-source]'));
  function clearNodes() {
    nodes.forEach(function (n) {
      if (n._daOwners) {
        n._daOwners.delete(host);
        if (!n._daOwners.size) n.classList.remove('da-node-focus');
      }
    });
    nodes = [];
  }
  host._daClear = clearNodes;
  function select(id) {
    clearNodes();
    host._daSource = id;
    buttons.forEach(function (b) {
      var on = !!id && b.getAttribute('data-da-source') === id;
      b.setAttribute('aria-pressed', String(on));
    });
    var source = m.sources.find(function (s) {
      return s.id === id;
    });
    var section = host.closest && host.closest('.doc-sec');
    if (section && source && source.node)
      Array.from(section.querySelectorAll('[data-dv-node]')).forEach(function (n) {
        if (n.getAttribute('data-dv-node') !== source.node) return;
        if (!n._daOwners) n._daOwners = new Set();
        n._daOwners.add(host);
        n.classList.add('da-node-focus');
        nodes.push(n);
      });
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-da-source');
      select(host._daSource === id ? null : id);
    });
  });
  select(m.showSources?host._daSource:null);
}

PanelViews.register('deviceapp', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var hBaseline = null;
  // A refolded path is a new sequence, even when its ordinal follows the old one.
  var sameSequence = host._daStates === states;
  if (host._daStates && !sameSequence) settlePanelPresentation(host, {});
  var daFresh =
    animate && sameSequence &&
    validRevealIndex(host._daStep) &&
    validRevealIndex(stepIdx) &&
    stepIdx === host._daStep + 1;
  var notifications=FlowNotifications.model(state);
  var notificationFresh=daFresh && FlowNotifications.grew(host._daNotifications,notifications.notifications);
  var screen=deviceAppModel(panel,state).screen;
  var screenFresh=daFresh && host._daScreen!==screen;
  host._daStates=states;
  host._daScreen=screen;
  host._daNotifications=notifications.notifications;
  host._daStep = validRevealIndex(stepIdx) ? stepIdx : null;
  h += deviceAppPanelHTML(panel, state, daFresh,notificationFresh,screenFresh);
  hBaseline = daFresh ? deviceAppPanelHTML(panel, state, false,false,false) : null;
  return {
    html: h,
    baseline: hBaseline,
    mounted: function () {
      bindDeviceAppSources(host, panel, state);
    },
  };
});

PanelRegistry.extend('deviceapp', {
  order: 21,
  label: 'Device app',
  since: '0.1.0',
  layout: {
    large: true,
    height: 23,
    supporting: false,
  },
});

PanelRegistry.extend('deviceapp', {
  styles: [
    { order: 375, css: String.raw`.pt-deviceapp{container-type:inline-size;}` },
    {
      order: 377,
      css: String.raw`/* The slot supplies the scale; source explanations retain their normal text size. */
.deviceapp{--da-px:1px;--da-padding:12px;box-sizing:border-box;}
.da-phone-fit{container-type:inline-size;width:100%;max-width:330px;min-width:0;aspect-ratio:9/18.5;align-self:start;justify-self:center;}
.deviceapp.da-standalone{grid-template-columns:minmax(0,330px);max-width:354px;gap:0;justify-content:center;}
.da-phone{--da-px:calc(100cqi / 330);font-size:calc(13 * var(--da-px));width:100%;max-width:330px;min-width:0;min-height:0;aspect-ratio:9/18.5;align-self:start;position:relative;box-sizing:border-box;display:flex;flex-direction:column;border:calc(4 * var(--da-px)) solid #79869e;border-radius:calc(38 * var(--da-px));padding:calc(18 * var(--da-px)) calc(12 * var(--da-px)) calc(27 * var(--da-px));background:#f5f7fc;color:#24324b;box-shadow:0 calc(14 * var(--da-px)) calc(30 * var(--da-px)) #23324b18,inset 0 0 0 calc(1 * var(--da-px)) #ffffffa8;overflow:hidden;}
.da-phone::before{content:"";position:absolute;top:calc(12 * var(--da-px));left:calc(50% - 23 * var(--da-px));width:calc(46 * var(--da-px));height:calc(9 * var(--da-px));border-radius:calc(8 * var(--da-px));background:#42506a;}
.da-statusbar{display:flex;flex:none;justify-content:space-between;gap:calc(55 * var(--da-px));font:600 calc(10 * var(--da-px)) 'IBM Plex Mono',monospace;padding:0 calc(5 * var(--da-px)) calc(18 * var(--da-px));}
.da-statusbar>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.da-statusbar.da-has-date{gap:calc(8 * var(--da-px));padding-top:calc(10 * var(--da-px));}
.da-date{min-width:0;flex:1;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.da-statusbar>span:last-child{flex:none;}
.da-system-icons{display:flex;align-items:center;gap:calc(4 * var(--da-px));}
.da-system-icons .fv-icon{width:calc(14 * var(--da-px));height:calc(14 * var(--da-px));}
.da-screen{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;border-radius:calc(10 * var(--da-px));padding:calc(2 * var(--da-px)) calc(3 * var(--da-px)) calc(8 * var(--da-px));}
.da-screen:focus-visible{outline:calc(2 * var(--da-px)) solid #6875ca;outline-offset:calc(-2 * var(--da-px));}
.da-appbar{display:flex;align-items:center;gap:calc(7 * var(--da-px));font:600 calc(11 * var(--da-px))/1.4 'Sora',sans-serif;color:#6673c2;padding:calc(3 * var(--da-px)) calc(4 * var(--da-px)) calc(8 * var(--da-px));}
.da-appbar svg{width:calc(20 * var(--da-px));height:calc(20 * var(--da-px));flex:none;}
.da-phone-home{background:radial-gradient(ellipse at 15% 10%,#f8dbfa 0,transparent 58%),radial-gradient(ellipse at 95% 85%,#9fcef1 0,transparent 60%),linear-gradient(150deg,#e8e8fc,#c3d3ee);}
.da-screen-home{display:flex;flex-direction:column;}
.da-home-clock{padding:calc(24 * var(--da-px)) 0 calc(22 * var(--da-px));text-align:center;color:#384b71;}
.da-home-clock>span{display:block;font:600 calc(10 * var(--da-px))/1.5 'Sora',sans-serif;letter-spacing:.12em;text-transform:uppercase;}
.da-home-clock strong{display:block;font:500 calc(54 * var(--da-px))/1.2 'Sora',sans-serif;letter-spacing:-.06em;margin-top:calc(5 * var(--da-px));overflow-wrap:anywhere;}
.da-home-empty,.da-empty-cards{padding:calc(20 * var(--da-px)) calc(12 * var(--da-px));text-align:center;font:calc(12 * var(--da-px))/1.5 'Sora',sans-serif;color:#65728a;}
.da-launcher{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:calc(8 * var(--da-px));padding:calc(16 * var(--da-px)) calc(7 * var(--da-px)) calc(8 * var(--da-px));margin-top:auto;flex:none;}
.da-launcher-app{min-width:0;text-align:center;font:500 calc(9 * var(--da-px))/1.35 'Sora',sans-serif;color:#344762;}
.da-launcher-icon{position:relative;display:grid;place-items:center;width:min(100%,calc(47 * var(--da-px)));aspect-ratio:1;margin:0 auto calc(6 * var(--da-px));border-radius:calc(13 * var(--da-px));background:#ffffffa8;box-shadow:0 calc(4 * var(--da-px)) calc(9 * var(--da-px)) #536f8d13;color:#627494;}
.da-launcher-icon svg{width:calc(25 * var(--da-px));height:calc(25 * var(--da-px));}
.da-launcher-primary .da-launcher-icon{background:linear-gradient(145deg,#8292ec,#5564c2);color:#fff;}
.da-launcher-icon i{position:absolute;top:calc(-5 * var(--da-px));right:calc(-5 * var(--da-px));min-width:calc(16 * var(--da-px));padding:calc(2 * var(--da-px)) calc(4 * var(--da-px));border-radius:calc(10 * var(--da-px));background:#cc4d6c;color:#fff;font:700 calc(9 * var(--da-px))/1.4 'IBM Plex Mono',monospace;font-style:normal;}
.da-heading{padding:calc(5 * var(--da-px)) calc(4 * var(--da-px)) calc(16 * var(--da-px));}
.da-eyebrow{font:600 calc(10 * var(--da-px))/1.5 'IBM Plex Mono',monospace;letter-spacing:.12em;opacity:.7;}
.da-heading h3,.da-provenance h3{font:600 calc(21 * var(--da-px))/1.2 'Sora',sans-serif;margin:calc(7 * var(--da-px)) 0 calc(5 * var(--da-px));letter-spacing:calc(-.5 * var(--da-px));}
.da-heading>span:last-child{font-size:calc(12 * var(--da-px));color:#65728a;}
.da-notifications{margin:0 0 calc(16 * var(--da-px));min-width:0;}
.da-notification-heading{display:flex;align-items:center;justify-content:space-between;margin:0 calc(3 * var(--da-px)) calc(8 * var(--da-px));font:600 calc(10 * var(--da-px))/1.5 'IBM Plex Mono',monospace;color:#59677f;text-transform:uppercase;letter-spacing:.06em;}
.da-notification-count{border-radius:calc(9 * var(--da-px));min-width:calc(20 * var(--da-px));padding:calc(1 * var(--da-px)) calc(5 * var(--da-px));text-align:center;color:#fff;background:#6875ca;}
.da-notification-cards{display:grid;gap:calc(7 * var(--da-px));}
.deviceapp .da-notifications .phonecard{max-height:none;border-radius:calc(10 * var(--da-px));padding:calc(10 * var(--da-px)) calc(12 * var(--da-px));border:calc(1 * var(--da-px)) solid #dce2f0;border-left:calc(3 * var(--da-px)) solid #6875ca;background:#fff;color:#24324b;box-shadow:0 calc(3 * var(--da-px)) calc(8 * var(--da-px)) #23324b08;}
.deviceapp .da-notifications .phoneapp{font-size:calc(9 * var(--da-px));color:#6673c2;}
.deviceapp .da-notifications .phonetitle{margin-top:calc(2 * var(--da-px));font-size:calc(12 * var(--da-px));white-space:normal;overflow-wrap:anywhere;}
.deviceapp .da-notifications .phonetext{margin-top:calc(2 * var(--da-px));font-size:calc(11 * var(--da-px));line-height:1.4;color:#65728a;}
.deviceapp .da-notifications .phoneoverflow{font-size:calc(8 * var(--da-px));padding-top:calc(7 * var(--da-px));color:#59677f;}
.da-app-note{font-size:calc(11 * var(--da-px));line-height:1.5;color:#65728a;margin:calc(12 * var(--da-px)) calc(4 * var(--da-px)) 0;}
.da-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(9 * var(--da-px));}`,
    },
    {
      order: 386,
      css: String.raw`.da-field{display:flex;flex-direction:column;gap:calc(7 * var(--da-px));border:calc(1 * var(--da-px)) solid #dfe4ef;border-top:calc(3 * var(--da-px)) solid var(--da-color);border-radius:calc(12 * var(--da-px));padding:calc(10 * var(--da-px));background:#fff;color:#24324b;transition:box-shadow .16s;}
.da-field:first-child{grid-column:1/-1;}
.da-field:last-child:nth-child(even){grid-column:1/-1;}
.da-field-top{display:flex;align-items:center;justify-content:space-between;gap:calc(5 * var(--da-px));font-size:calc(11 * var(--da-px));color:#59677f;}
.da-badge{display:inline-flex;flex:none;align-items:center;justify-content:center;width:calc(20 * var(--da-px));height:calc(20 * var(--da-px));border-radius:calc(6 * var(--da-px));border:calc(1 * var(--da-px)) solid var(--da-color);color:var(--da-color);font:700 calc(11 * var(--da-px)) 'IBM Plex Mono',monospace;}
.da-value{display:flex;align-items:center;gap:calc(6 * var(--da-px));font-size:calc(16 * var(--da-px));font-weight:600;line-height:1.2;}
.da-field:first-child .da-value{font-size:calc(29 * var(--da-px));}
.da-icon{width:calc(19 * var(--da-px));height:calc(19 * var(--da-px));flex:none;stroke:currentColor;fill:none;stroke-width:1.7;}
.da-meter{display:block;height:calc(7 * var(--da-px));border-radius:calc(5 * var(--da-px));background:#e7ecf4;overflow:hidden;}
.da-meter i{display:block;height:100%;background:var(--da-color);border-radius:calc(5 * var(--da-px));}
.da-meta{display:flex;flex-wrap:wrap;align-items:center;gap:calc(6 * var(--da-px));font-size:calc(9 * var(--da-px));}
.da-state{border-radius:calc(4 * var(--da-px));padding:calc(2 * var(--da-px)) calc(5 * var(--da-px));background:#edf0f6;color:#53617a;}
.da-ready .da-state{background:#e0f3ec;color:#17694c;}
.da-stale .da-state{background:#fff0d6;color:#915209;}
.da-error .da-state{background:#fde4e7;color:#a62f46;}
.da-loading .da-state{background:#e4edff;color:#325dab;}
.da-update-label{color:#626f87;}
.da-detail{display:block;font-size:calc(11 * var(--da-px));line-height:1.4;opacity:.78;}
.da-updated{box-shadow:0 0 0 calc(1 * var(--da-px)) color-mix(in srgb,var(--da-color) 35%,transparent);}
.da-field[aria-pressed="true"],.da-source[aria-pressed="true"]{outline:calc(2 * var(--da-px)) solid var(--da-color);outline-offset:calc(2 * var(--da-px));}`,
    },
    {
      order: 407,
      css: String.raw`.da-field.fresh{animation:da-arrive .6s ease-out;}
@keyframes da-arrive{from{transform:translateY(calc(4 * var(--da-px)));background:#e8f1ff;}to{transform:none;background:#fff;}}
.da-screen-app.fresh{animation:da-open-app .45s cubic-bezier(.2,.8,.2,1);transform-origin:20% 90%;}
.da-screen-home.fresh{animation:da-return-home .35s ease-out;}
@keyframes da-open-app{from{opacity:0;transform:translateY(calc(24 * var(--da-px))) scale(.9);}to{opacity:1;transform:none;}}
@keyframes da-return-home{from{opacity:0;transform:scale(1.04);}to{opacity:1;transform:none;}}
.da-home{position:absolute;bottom:calc(10 * var(--da-px));left:37%;width:26%;height:calc(4 * var(--da-px));border-radius:calc(4 * var(--da-px));background:#8694ab;}
.da-provenance{align-self:center;min-width:0;}
.da-help{color:var(--dtext);font-size:12px;margin:10px 0 20px;}
.da-sources{display:grid;gap:12px;}
.da-source{display:block;width:100%;border:1px solid color-mix(in srgb,var(--dtext) 22%,transparent);border-left:4px solid var(--da-color);border-radius:12px;padding:13px 15px;color:var(--dink);background:color-mix(in srgb,var(--da-color) 4%,transparent);}
.da-source-title{display:flex;gap:9px;align-items:center;}
.da-source code{display:block;font:10px/1.5 'IBM Plex Mono',monospace;margin:8px 0;}
.da-source .da-detail{margin-top:6px;}
.da-source-fields{display:block;border-top:1px solid color-mix(in srgb,var(--dtext) 16%,transparent);margin-top:9px;padding-top:9px;font-size:11px;color:var(--dtext);}
.da-note{font-size:12px;border-left:3px solid var(--acc);padding:9px 13px;background:color-mix(in srgb,var(--acc) 6%,transparent);margin:18px 0 0;}
.node.da-node-focus .card{stroke:var(--acc)!important;stroke-width:4px!important;stroke-dasharray:5 3!important;}`,
    },
    {
      order: 421,
      css: String.raw`/* A saved layout has a definite height. Reserve the title and any attached
   controls, then fit the portrait to both dimensions of the remaining body. */
.docview .section-layout-tile>.pt-deviceapp{display:flex;flex-direction:column;}
.docview .section-layout-tile>.pt-deviceapp>.ptitle{flex:none;}
.docview .section-layout-tile>.pt-deviceapp>.pbody{flex:1;min-height:0;container-type:size;overflow:auto;}
.section-layout-tile>.pt-deviceapp>.pbody .da-phone-fit{width:min(100%,330px,calc((100cqb - 2 * var(--da-padding)) * 9 / 18.5));}
.da-phone button:focus-visible{outline-width:calc(3 * var(--da-px));outline-offset:calc(3 * var(--da-px));}
@container (max-width:560px){.deviceapp{--da-padding:5px;}}
@container (max-width:560px){.da-provenance h3{font-size:17px;}}
@media(prefers-reduced-motion:reduce){.da-field.fresh{animation:none;}}
@media(prefers-reduced-motion:reduce){.da-screen.fresh{animation:none;}}
@media(prefers-reduced-motion:reduce){.da-field{transition:none;}}
@media print{.da-field.fresh{animation:none;}}
@media print{.da-screen.fresh{animation:none;}}
@media print{.da-provenance{color:#222;--dink:#222;--dtext:#444;}}
@media print{.da-phone{box-shadow:none;}
.docview .section-layout-tile>.pt-deviceapp{display:block;}
.docview .section-layout-tile>.pt-deviceapp>.pbody{container-type:normal;overflow:visible;}
.section-layout-tile>.pt-deviceapp>.pbody .da-phone-fit{width:100%;}}`,
    },
    {
      order: 1257,
      css: String.raw`@media print{
  .panelcol .pwidget.pt-deviceapp{display:block !important;background:#fff;border-color:#bbb;}
}`,
    },
  ],
});

/* deviceapp authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('deviceapp', {
  references: { nodes: ['sources.*.node'] },
  authoring: {
    branding: true,
    notifications: true,
    template: {
      title: 'Device app',
      appName: 'Homestead',
      device: 'Front door camera',
      subtitle: 'Device health',
      fields: [
        { id: 'battery', label: 'Battery', kind: 'battery' },
        { id: 'power', label: 'Charging source' },
        { id: 'model', label: 'Camera model', icon: 'camera' },
        { id: 'firmware', label: 'Firmware', icon: 'chip' },
      ],
      initial: {
        battery: { value: 68, status: 'ready' },
        power: { value: 'Solar panel', status: 'ready' },
        model: { value: 'Doorbell camera', status: 'ready' },
        firmware: { value: 'v2.4.1', status: 'ready' },
        clock: '9:41',
      },
    },
    initialFields: true,
    setupFields: [
      ['appName', 'text'],
      ['device', 'text'],
      ['subtitle', 'text'],
      ['showSources', 'jsonAny'],
      [
        'sources',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'color' },
            { k: 'node' },
            { k: 'endpoint' },
            { k: 'detail' },
          ],
          max: 6,
        },
      ],
      [
        'fields',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            { k: 'kind', kind: 'enum', options: ['text', 'battery'] },
            { k: 'source' },
            { k: 'icon', kind: 'icon' },
            { k: 'unit' },
          ],
          max: 12,
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['phoneScreen', 'enum', DEVICEAPP_SCREENS],
      ['notify', 'jsonAny'],
      ['clear', 'bool', { trueOnly: true }],
      ['clock', 'text'],
      ['date', 'text'],
      ['note', 'text'],
    ],
    picker: {
      order: 25,
      name: 'Device app',
      category: 'Devices & interfaces',
      tagline: 'Home screen to device app',
      description: 'Receive notifications on a phone home screen, open the app, and show or hide data cards as the story unfolds. Backend source mapping is optional.',
    },
    example: function(sample){
      sample.panel.initial.notify={app:'Homestead',title:'Doorbell pressed',text:'Someone is at the front door.'};
      sample.state=foldDeviceAppStates(sample.panel,[])[0];sample.states=[sample.state];return sample;
    },
    editor: function(context){
      return {patchLabel:function(key){return key==='phoneScreen'?'Phone screen':key==='visible'?'Card visibility':key;},
      patchField:function(field,input,options){
        if(field[0]==='date'){
          if(options && options.initial)input.setAttribute('aria-label','Starting date');
          input.placeholder=options && options.initial?'Optional · Thu, Sep 24':'Inherit previous date';
          return;
        }
        if(field[0]!=='phoneScreen' && field[0]!=='visible')return;
        input.setAttribute('aria-label',field[0]==='phoneScreen'?(options && options.initial?'Starting phone screen':'Phone screen'):'Card visibility');
        Array.from(input.options).forEach(function(option){
          option.textContent=option.value===''?(options && options.initial?'Default':'Inherit'):({home:'Home screen',app:'Device app',true:'Show card',false:'Hide card'}[option.value] || option.textContent);
        });
      },patchIntro:function(body){
        var note=document.createElement('p');note.className='home-note';
        note.textContent='Phone screen switches between Home screen and Device app. Each card’s visibility carries forward; hiding it keeps its data. Notify adds a notification independently of the screen.';
        body.appendChild(note);
      },setupField:function(field,panel){
        if(field[0]!=='showSources')return null;
        var options=['Automatic (when sources exist)','Show','Hide'];
        var value=panel.showSources===true?'Show':panel.showSources===false?'Hide':options[0];
        var control=context.controls.select(options,value,function(next){
          return context.commit('showSources',next==='Show'?'true':next==='Hide'?'false':null);
        });
        control.setAttribute('aria-label','Show data sources');
        return context.controls.row('Show data sources',control);
      }};
    },
    expandPatchFields: function (decl) {
      var sourceIds = (Array.isArray(decl.sources) ? decl.sources : [])
        .filter(function (s) {
          return s && typeof s.id === 'string';
        })
        .map(function (s) {
          return s.id;
        });
      var appFields = (Array.isArray(decl.fields) ? decl.fields : [])
        .filter(function (f) {
          return f && typeof f.id === 'string';
        })
        .map(function (f) {
          return [
            f.id,
            'objf',
            [
              ['value', f.kind === 'battery' ? 'num' : 'text'],
              ['status', 'enum', ['unknown', 'loading', 'ready', 'stale', 'error']],
              ['icon', 'enum', ICON_SET],
              ['source', 'enum', sourceIds],
              ['detail', 'text'],
              ['visible', 'bool'],
            ],
          ];
        });
      if(!sourceIds.length)appFields.forEach(function(field){field[2]=field[2].filter(function(prop){return prop[0]!=='source';});});
      return PANEL_PATCH_FIELDS.deviceapp.concat(appFields);
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if(key==='notifications')return history(['notify','clear'],true,'Computed notification history');
      if(key==='_phoneAdded')return {kind:'engine',label:'Engine · notifications added at this step',inputs:[]};
      if (key === '_updated')
        return { kind: 'engine', label: 'Engine · fields changed at this step', inputs: [] };
      if (key === 'phoneScreen')return assignment(key,function(v){return DEVICEAPP_SCREENS.indexOf(v)>=0;},false);
      if (key === 'clock' || key === 'date' || key === 'note')
        return assignment(
          key,
          function (v) {
            return typeof v === 'string';
          },
          false
        );
      return history([key], true, 'Field value and source history');
    },
  },
});

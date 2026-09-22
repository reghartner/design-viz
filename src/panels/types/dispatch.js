/* Emergency dispatch visualizes authored handoffs; it never contacts responders. */
(function () {
  var statuses = ['unknown', 'idle', 'requested', 'assigned', 'enroute', 'onscene', 'resolved', 'cancelled', 'blocked'];
  var priorities = ['routine', 'urgent', 'critical'];
  var unitStatuses = ['unknown', 'available', 'assigned', 'enroute', 'onscene', 'released', 'unavailable'];
  var kinds = ['police', 'fire', 'medical', 'security'];
  var times = ['day', 'dusk', 'night'];
  var fields = {status:statuses, priority:priorities, timeOfDay:times, incident:'text', location:'text', dispatcher:'text', detail:'text', note:'text'};
  var unitFields = {status:unitStatuses, lights:['on','off'], eta:'text', detail:'text'};
  var labels = {unknown:'Dispatch status unknown',idle:'Standing by',requested:'Dispatch requested',assigned:'Responders assigned',
    enroute:'Responders en route',onscene:'Responders on scene',resolved:'Response resolved',cancelled:'Dispatch cancelled',blocked:'Dispatch blocked'};
  var unitLabels = {unknown:'Status unknown',available:'Available',assigned:'Assigned',enroute:'En route',onscene:'On scene',released:'Released',unavailable:'Unavailable'};
  function items(panel) { return panelOperationalItems(panel, 'responders', 8, fields); }
  function clean(panel, raw, path, warnings, once) {
    if (!panelObject(raw)) return panelOperationalSnapshot(raw, fields, items(panel), unitFields, path, warnings, once);
    /* Keep the shared typed snapshot rules; route position is this panel's one
       numeric extension. Invalid-only patches must not reset a carried unit. */
    var copy = Object.assign(Object.create(null), raw), positions = Object.create(null);
    items(panel).forEach(function (unit) {
      if (!panelOwn(raw, unit.id) || !panelObject(raw[unit.id]) || !panelOwn(raw[unit.id], 'progress')) return;
      var value = raw[unit.id].progress, entry = Object.assign(Object.create(null), raw[unit.id]);
      delete entry.progress;
      if (typeof value === 'number' && isFinite(value) && value >= 0 && value <= 100) positions[unit.id] = value;
      else if (warnings) warnings.push(path + '.' + unit.id + '.progress: expected a finite number from 0 to 100 — ignored');
      if (!Object.keys(entry).length && !panelOwn(positions, unit.id)) delete copy[unit.id];
      else copy[unit.id] = entry;
    });
    if (once && panelObject(raw.enterOnce)) delete copy.enterOnce;
    var out = panelOperationalSnapshot(copy, fields, items(panel), unitFields, path, warnings, once);
    Object.keys(positions).forEach(function (id) {
      if (!panelOwn(out, id)) out[id] = Object.create(null);
      out[id].progress = positions[id];
    });
    if (once && panelObject(raw.enterOnce)) out.enterOnce = clean(panel, raw.enterOnce, path + '.enterOnce', warnings, false);
    return out;
  }
  function text(value) { return typeof value === 'string' ? value : ''; }
  function icon(kind) {
    var paths = {
      police:'<path d="m12 3 8 4v6c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m12 7 1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L7 10.5l3.5-.5Z"/>',
      fire:'<path d="M12 2c1 6 7 7 7 13a7 7 0 0 1-14 0c0-3 2-6 4-8 0 4 2 4 3 4 2-2 1-6 0-9Z"/><path d="M12 13c0 3 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5Z"/>',
      medical:'<path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z"/>',
      security:'<path d="m12 3 8 4v6c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m8 12 3 3 5-6"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[kinds.indexOf(kind) >= 0 ? kind : 'security'] + '</svg>';
  }
  function routePosition(progress) {
    var t = progress / 100, a = 1 - t;
    return {x:40*a*a + 420*a*t + 448*t*t, y:275*a*a + 580*a*t + 210*t*t,
      angle:Math.atan2(30 - 190*t, 420 - 24*t) * 180 / Math.PI};
  }
  function vehicle(kind) {
    var wheel = '<circle r="7" fill="#29374b" stroke="#172337" stroke-width="2"/><circle r="3.3" fill="#d8e4f0"/><path d="M-3 0H3M0-3V3" stroke="#6e829a" stroke-width="1.4"/>';
    var body;
    if (kind === 'fire') body = '<path d="M-39-24H13V-13H30L39-4V3H-39Z" fill="#da5c58" stroke="#963f4c" stroke-width="1.4"/><path d="M15-23H28L35-13H15Z" fill="#d8edf4" stroke="#963f4c" stroke-width="1.5"/><path d="M-35-29H9M-35-25H9M-32-29V-25M-24-29V-25M-16-29V-25M-8-29V-25M0-29V-25M8-29V-25" stroke="#e7edf4" stroke-width="2.2"/><path d="M-34-17H6V-3H-34Z" fill="#ba4850"/><path d="M-31-13H3M-31-8H3M-38-1H38" stroke="#f8d69b" stroke-width="2"/><circle cx="10" cy="-9" r="4" fill="#edf0ef"/><text x="-14" y="-4" fill="#fff" font-size="6" font-weight="700" text-anchor="middle">FIRE</text>';
    else if (kind === 'medical') body = '<path d="M-36-29H9V-22H23L35-10V3H-36Z" fill="#faf8ed" stroke="#a2b1bf" stroke-width="1.4"/><path d="M12-20H22L30-11H12Z" fill="#82bdd5"/><path d="M-36-6H34V-1H-36Z" fill="#e57065"/><path d="M-19-24H-11V-19H-6V-11H-11V-6H-19V-11H-24V-19H-19Z" fill="#dc6262"/><path d="M8-25V0M12-6H16" stroke="#9aabb8" stroke-width="1.2"/>';
    else if (kind === 'security') body = '<path d="M-34-14-24-25H12L24-14 36-10V3H-36V-9Z" fill="#e8d294" stroke="#9b8052" stroke-width="1.4"/><path d="M-21-22H-5V-13H-27ZM-2-22H10L19-13H-2Z" fill="#59758f"/><path d="M-35-9H34V-2H-35Z" fill="#485f79"/><path d="m0-9 5 2v4c0 3-5 5-5 5s-5-2-5-5v-4Z" fill="#e4c275"/>';
    else body = '<path d="M-36-11-25-15-17-25H12L23-14 35-10V3H-37Z" fill="#e9eff6" stroke="#5e738f" stroke-width="1.4"/><path d="M-15-22H-3V-13H-22ZM0-22H10L18-13H0Z" fill="#668ba8"/><path d="M-36-10H-15V1H-36ZM17-11H35V1H17Z" fill="#3a557f"/><path d="M-6-10H7V0H-6Z" fill="#d9e4f0"/><path d="m0-9 1.5 3 3.5.5-2.5 2.5.5 3.5L0-1l-3 1.5.5-3.5L-5-5.5l3.5-.5Z" fill="#bc9952"/>';
    var axle = kind === 'fire' ? 26 : 24;
    return '<ellipse cx="0" cy="7" rx="42" ry="5" fill="#283a54" opacity=".16"/>' + body +
      '<path d="M31-8H36V-4H31Z" fill="#fff2bd"/><path d="M-37-7H-33V-3H-37Z" fill="#ec826e"/>' +
      '<g transform="translate(-25 3)"><g class="dispatch-wheel">'+wheel+'</g></g><g transform="translate('+axle+' 3)"><g class="dispatch-wheel">'+wheel+'</g></g>'+
      '<g class="dispatch-beacons"><ellipse class="dispatch-beacon-glow" cx="1" cy="-29" rx="25" ry="12" fill="'+(kind === 'security' ? '#e7b85f' : '#86bbff')+'" opacity=".2"/><rect x="-7" y="-29" width="16" height="4" rx="1.5" fill="#394f72"/><rect class="dispatch-lamp-a" x="-6" y="-30" width="6" height="4" rx="1" fill="'+(kind === 'security' ? '#f7c56b' : '#f77985')+'"/><rect class="dispatch-lamp-b" x="2" y="-30" width="6" height="4" rx="1" fill="'+(kind === 'fire' || kind === 'security' ? '#ffca72' : '#8dc8ff')+'"/></g>';
  }
  function house(x, y, scale, main) {
    return '<g transform="translate('+x+' '+y+') scale('+scale+')" class="'+(main ? 'dispatch-destination-house' : 'dispatch-neighbor-house')+'">'+
      '<ellipse cx="0" cy="72" rx="81" ry="10" fill="#365e57" opacity=".09"/><path d="M-60 0H60V67H-60Z" fill="'+(main ? '#ede5d4' : '#c1cecf')+'" stroke="#9fadae" stroke-width="1.5"/><path d="M-74 0 0-51 74 0 65 8 0-36-65 8Z" fill="'+(main ? '#627794' : '#83989f')+'"/><path d="M36-26V-48H49V-17Z" fill="#91a4b2"/>'+
      '<path d="M-13 20H13V67H-13Z" fill="'+(main ? '#739296' : '#80969e')+'"/><circle cx="7" cy="45" r="1.6" fill="#ffe0a4"/><path d="M-47 15H-25V38H-47ZM25 15H47V38H25Z" class="dispatch-house-windows" fill="#f5d9a1" stroke="#fff9e9" stroke-width="3"/><path d="M-36 15V38M25 26.5H47M-47 26.5H-25M36 15V38" stroke="#fff9e9" stroke-width="2"/><path d="M-24 68H24V74H-24ZM-31 74H31V79H-31Z" fill="#b0bfc0"/>'+
      (main ? '<path d="M-20 20H20L16 14H-16Z" fill="#6d828f"/><circle cx="20" cy="32" r="2.5" fill="#ffe5a9"/><rect x="17" y="37" width="4" height="7" rx="1" fill="#536b83"/><circle cx="19" cy="39.5" r="1" fill="#b6d6e5"/>' : '')+'</g>';
  }
  function tree(x, y, scale) {
    return '<g transform="translate('+x+' '+y+') scale('+scale+')"><ellipse cy="3" rx="18" ry="5" fill="#456c60" opacity=".1"/><path d="M0 0V-24" stroke="#779182" stroke-width="4"/><circle cy="-29" r="17" fill="#7baca0"/><circle cx="-7" cy="-35" r="11" fill="#95bca7"/><circle cx="9" cy="-27" r="11" fill="#6e9d92"/></g>';
  }
  function scene(host, panel, state, animate) {
    var prior = host._dispatchPositions || Object.create(null), now = Object.create(null), moved = false;
    var unitList = items(panel), units = [], arrived = false;
    unitList.forEach(function (unit, index) {
      var value = panelObject(state[unit.id]) ? state[unit.id] : {}, status = value.status || 'unknown';
      if (['available','assigned','enroute','onscene'].indexOf(status) < 0) return;
      var travelling = status === 'enroute', onscene = status === 'onscene', parked = !travelling && !onscene;
      var progress = onscene ? 100 : travelling ? (typeof value.progress === 'number' ? value.progress : 45) : 0;
      var pos = routePosition(progress);
      /* Small lane offsets distinguish simultaneous responders; parked units
         remain in the depot. State never comes from previous DOM coordinates. */
      if (parked) { pos.x = 35 + (index % 3)*38; pos.y = 227 + Math.floor(index / 3)*17; pos.angle = 0; }
      else { pos.y += (index % 3)*16; pos.x -= Math.floor(index / 3)*42; }
      pos.kind = kinds.indexOf(unit.kind) >= 0 ? unit.kind : 'security';
      now[unit.id] = pos;
      var previous = prior[unit.id], dx = 0, dy = 0;
      if (animate && previous && previous.kind === pos.kind) { dx = previous.x - pos.x; dy = previous.y - pos.y; }
      if (dx || dy) moved = true;
      var lights = !parked && value.lights !== 'off';
      units.push({id:unit.id,kind:pos.kind,status:status,progress:progress,pos:pos,dx:dx,dy:dy,lights:lights,
        label:text(unit.callsign) || text(unit.label) || unit.id, travelling:travelling});
      arrived = arrived || onscene;
    });
    host._dispatchPositions = now;
    function build(transient) {
      var time = times.indexOf(state.timeOfDay) >= 0 ? state.timeOfDay : 'dusk';
      var h = '<div class="dispatch-scene dispatch-scene-'+time+'" data-motion="'+(animate ? 'play' : 'still')+'"><div class="dispatch-scene-caption"><span>Response map</span><span>'+(arrived ? 'AT THE ADDRESS' : units.some(function(u){return u.travelling;}) ? 'ON THE WAY' : 'AWAITING DEPARTURE')+'</span></div>'+
        '<svg viewBox="0 0 540 338" role="img" aria-label="Neighborhood response scene. '+esc(state.location || 'Incident address')+'. Vehicle positions are authored story stages."><rect class="dispatch-sky" width="540" height="338" fill="#e7edf5"/><circle class="dispatch-sun" cx="74" cy="54" r="22" fill="#f5dfa7"/><path d="M0 102Q120 62 251 91T540 78V338H0Z" class="dispatch-terrain" fill="#d1e2d8"/><path d="M0 144Q179 91 319 125T540 108V338H0Z" fill="#8eb5a3" opacity=".1"/>'+
        '<path d="M-45 275Q243 310 460 204T590 183" fill="none" stroke="#bccdcc" stroke-width="74"/><path d="M-45 275Q243 310 460 204T590 183" fill="none" stroke="#f0f1e9" stroke-width="67"/><path d="M-45 275Q243 310 460 204T590 183" class="dispatch-road" fill="none" stroke="#8295a9" stroke-width="55"/><path d="M-45 275Q243 310 460 204T590 183" fill="none" stroke="#e6e8d6" stroke-width="2" stroke-dasharray="12 13" opacity=".75"/>'+
        '<path d="M406 170 421 218 451 206 437 170Z" fill="#e6e6d9"/>'+
        house(225,107,.57,false)+house(521,71,.47,false)+tree(141,161,1.1)+tree(292,148,.72)+tree(474,116,.8)+
        '<path d="M330 169Q402 152 482 167" stroke="#c3d3c2" stroke-width="16" fill="none"/>'+house(410,105,.9,true)+
        '<g class="dispatch-house-marker"><path d="M410 19c-12 0-17 9-17 17 0 12 17 23 17 23s17-11 17-23c0-8-5-17-17-17Z" fill="#627cad" stroke="#fff" stroke-width="2"/><path d="m402 36 8-7 8 7v9h-6v-6h-4v6h-6Z" fill="#fff"/></g>'+
        '<g transform="translate(38 177)"><path d="M-13 8H83V43H-13Z" fill="#b5c7d0" stroke="#8ca4b2" stroke-width="1.4"/><path d="M-18 8H88V1H-18Z" fill="#7f96ae"/><path d="M-5 19H18V43H-5ZM29 19H54V43H29ZM62 20H75V29H62Z" fill="#657e98"/><text x="36" y="-9" text-anchor="middle" fill="#536d87" font-size="9" font-weight="700" letter-spacing="1.4">RESPONSE BASE</text></g>'+
        tree(514,293,1.4)+tree(308,333,1.12)+tree(172,334,.85)+
        '<g transform="translate(464 182)"><path d="M0 0V-18" stroke="#8ba193" stroke-width="3"/><path d="M-7-27H8V-15H-7Z" fill="#7995a0"/><path d="M-7-24H4" stroke="#b4cbd1" stroke-width="2"/></g>';
      if (arrived) h += '<g class="dispatch-arrival" transform="translate(410 35)"><circle r="24" fill="none" stroke="#58ad8b" stroke-width="3" opacity=".5"/><circle r="20" fill="#e8f7ef" stroke="#63ad8c" stroke-width="1.5"/><path d="m-8 0 5 5 11-11" fill="none" stroke="#4b9b7b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>';
      units.forEach(function (u) {
        var offset = transient && (u.dx || u.dy) ? ' style="transform:translate('+u.dx.toFixed(2)+'px,'+u.dy.toFixed(2)+'px)"' : '';
        h += '<g class="dispatch-vehicle dispatch-vehicle-'+u.kind+' dispatch-pose-'+u.status+(u.lights ? ' dispatch-lights-on' : '')+'" data-unit-id="'+esc(u.id)+'" data-progress="'+u.progress+'" transform="translate('+u.pos.x.toFixed(2)+' '+u.pos.y.toFixed(2)+')"><title>'+esc(u.label)+' · '+unitLabels[u.status]+'</title><g class="dispatch-vehicle-travel"'+offset+'><g transform="rotate('+u.pos.angle.toFixed(2)+') scale(.8)">'+vehicle(u.kind)+'</g>'+
          '<g class="dispatch-vehicle-label" transform="translate(0 21)"><rect x="-32" y="-7" width="64" height="14" rx="7" fill="#f7fbfa" stroke="#b3c5cf" stroke-width=".8"/><text y="2.5" text-anchor="middle" fill="#526b86" font-size="8" font-weight="600">'+esc(u.label.length > 12 ? u.label.slice(0,11)+'…' : u.label)+'</text></g></g></g>';
      });
      h += '</svg><div class="dispatch-scene-address"><span>'+esc(state.location || 'Incident address not set')+'</span><small>Illustrated response · authored positions</small></div></div>';
      return h;
    }
    return {html:build(true),baseline:moved ? build(false) : null};
  }
  function render(host, panel, raw, skin, states, stepIndex, animate) {
    var state = clean(panel, raw, '', null, false), status = state.status || 'unknown';
    var unitList = items(panel), priority = state.priority || '', active = 0;
    var rows = unitList.map(function (unit) {
      var value = panelObject(state[unit.id]) ? state[unit.id] : {}, s = value.status || 'unknown';
      if (['assigned','enroute','onscene'].indexOf(s) >= 0) active++;
      return '<li class="dispatch-unit dispatch-unit-' + s + '" data-responder-id="' + esc(unit.id) + '">' +
        '<div class="dispatch-unit-top"><span class="dispatch-unit-icon">' + icon(unit.kind) + '</span><div class="dispatch-unit-title"><strong>' + esc(text(unit.label) || unit.id) + '</strong><span>' + esc(text(unit.callsign) || (kinds.indexOf(unit.kind) >= 0 ? unit.kind : 'Responder')) + '</span></div>' +
        '<span class="dispatch-unit-status">' + unitLabels[s] + '</span></div>' +
        '<div class="dispatch-unit-bottom"><span class="dispatch-eta">' + (value.eta ? '<small>ETA</small> ' + esc(value.eta) : s === 'onscene' ? 'Arrival confirmed' : s === 'enroute' ? 'ETA not provided' : s === 'assigned' ? 'Awaiting departure' : s === 'available' ? 'Ready for assignment' : s === 'released' ? 'Unit released' : s === 'unavailable' ? 'Cannot accept assignment' : 'Awaiting unit update') + '</span>' +
        (value.detail ? '<span class="dispatch-unit-detail">' + esc(value.detail) + '</span>' : '') + '</div></li>';
    }).join('');
    var hero = '<div class="dispatch-topline"><span>' + esc(text(panel.agency) || 'Emergency response') + '</span><span class="dispatch-priority dispatch-priority-' + (priority || 'unknown') + '">' + (priority ? priority + ' priority' : 'Priority not set') + '</span></div>' +
      '<div class="dispatch-status">' + labels[status] + '</div><div class="dispatch-dispatcher"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 11V8a6 6 0 0 1 12 0v3M4 10H2v5h4v-5Zm12 0h2v5h-4v-5ZM16 15v2h-6"/></svg>' + esc(state.dispatcher || 'No dispatcher assigned') + '</div>';
    var rail = [{id:'requested',label:'Request'},{id:'assigned',label:'Assign'},{id:'enroute',label:'En route'},{id:'onscene',label:'On scene'}].map(function (stage) {
      var current = status === stage.id;
      return '<li class="dispatch-stage' + (current ? ' is-current' : '') + '"' + (current ? ' aria-current="step"' : '') + '><span class="dispatch-stage-dot" aria-hidden="true"></span><span>' + stage.label + '</span></li>';
    }).join('');
    var support = '<div class="dispatch-incident"><span class="dispatch-case-label">Incident</span><strong>' + esc(state.incident || 'No incident recorded') + '</strong></div><ol class="dispatch-progress" aria-label="Current dispatch stage">'+rail+'</ol>'+
      (['blocked','cancelled','resolved','unknown','idle'].indexOf(status) >= 0 ? '<div class="dispatch-stage-note">' + ({blocked:'Handoff not accepted',cancelled:'Request cancelled',resolved:'Response closed',unknown:'No dispatch status recorded',idle:'No dispatch requested'})[status] + '</div>' : '') +
      (state.detail ? '<div class="dispatch-brief">' + esc(state.detail) + '</div>' : '') +
      '<div class="dispatch-roster-head"><span>Response team</span><span>' + active + ' active / ' + unitList.length + '</span></div>' +
      '<ul class="dispatch-roster" aria-label="Responders">' + rows + '</ul>' + (!unitList.length ? '<div class="swempty">No responders configured</div>' : '');
    var sceneResult = scene(host, panel, state, !!animate), sceneBaseline = sceneResult.baseline || sceneResult.html;
    function shell(sceneHTML) { return softwarePanelShell('<div class="dispatch dispatch-'+status+'"><div class="dispatch-hero">'+hero+'</div>'+sceneHTML+'<div class="dispatch-support">'+support+'</div></div>',state); }
    return {html:shell(sceneResult.html), baseline:sceneResult.baseline ? shell(sceneBaseline) : null,
      glide:{selector:'.dispatch-vehicle-travel[style]',multiple:true},
      patch:function () {
        var same = host._dispatchSceneHTML === sceneBaseline;
        host._dispatchSceneHTML = sceneBaseline;
        if (!same || typeof host.querySelector !== 'function') return false;
        var root = host.querySelector('.dispatch'), header = host.querySelector('.dispatch-hero'), content = host.querySelector('.dispatch-support'), wrapper = host.querySelector('.swpanel');
        if (!root || !header || !content || !wrapper) return false;
        root.className = 'dispatch dispatch-'+status;
        header.innerHTML = hero; content.innerHTML = support;
        var note = wrapper.querySelector('.swnote');
        if (note) note.remove();
        if (state.note) wrapper.insertAdjacentHTML('beforeend','<div class="swnote">'+esc(state.note)+'</div>');
        return true;
      },
      pulse:{selector:'.dispatch-status',changed:['requested','onscene','blocked'].indexOf(status) >= 0}};
  }
  PanelRegistry.define('dispatch', {
    label:'Emergency dispatch', since:'0.1.0', render:render,
    presentation:{growing:true, ambientInitial:true},
    layout:{height:14, fallbackHeight:14, supporting:true, attachControls:true},
    validateDeclaration:function (panel, path, warnings) {
      if (panel.agency != null && typeof panel.agency !== 'string') warnings.push(path + '.agency: expected text — ignored');
      panelCollectionWarnings(panel, path, warnings, 'responders', 8, function (unit, at) {
        if (!items({responders:[unit]}).length) warnings.push(at + '.id: use a unique letter-led ID; state fields and prototype names are reserved — ignored');
        ['label','callsign'].forEach(function (key) { if (unit[key] != null && typeof unit[key] !== 'string') warnings.push(at + '.' + key + ': expected text — ignored'); });
        if (unit.kind != null && kinds.indexOf(unit.kind) < 0) warnings.push(at + '.kind: expected ' + kinds.join('|') + ' — using security');
      });
      clean(panel, panel.initial, path + '.initial', warnings, false);
    },
    validatePatch:function (patch, path, panel, warnings) { clean(panel, patch, path, warnings, true); },
    fold:function (panel, steps) { return foldSanitizedPanelStates(panel, steps, function (raw, once) { return clean(panel, raw, '', null, once); }); },
    authoring:{
      template:{title:'Emergency dispatch',agency:'City response center',responders:[
        {id:'patrol',label:'Patrol unit',kind:'police',callsign:'Unit 24'},
        {id:'backup',label:'Security response',kind:'security',callsign:'Unit 08'}],
        initial:{status:'idle',priority:'routine',timeOfDay:'dusk',patrol:{status:'available'},backup:{status:'available'}}},
      setupFields:[['agency','text'],['responders','rows',{cols:[{k:'id',req:true},{k:'label'},{k:'kind',kind:'enum',options:kinds},{k:'callsign'}],max:8}],['initial','json']],
      patchFields:[['status','enum',statuses],['priority','enum',priorities],['timeOfDay','enum',times],['incident','text'],['location','text'],['dispatcher','text'],['detail','text'],['note','text']],
      expandPatchFields:function (panel) {
        return PanelRegistry.get('dispatch').authoring.patchFields.concat(items(panel).map(function (unit) {
          return [unit.id,'objf',[['status','enum',unitStatuses],['progress','num'],['lights','enum',['on','off']],['eta','text'],['detail','text']]];
        }));
      },
      origin:function (panel, key, snapshot, context) {
        return panelSanitizedOrigin(key, context, function (raw) { return clean(panel, raw, '', null, false); });
      },
      picker:{order:27,name:'Emergency dispatch',category:'Devices & interfaces',tagline:'Make the response visible',
        description:'Follow a response vehicle through a miniature neighborhood to the front door. Choose police, fire, medical or security units; author the journey, lights and arrival in steps.'},
      example:function (sample) {
        sample.state = {status:'enroute',priority:'urgent',timeOfDay:'dusk',incident:'Verified entry · Oak House',location:'14 Oak Lane · front entrance',dispatcher:'Jordan · dispatch desk',detail:'Patrol accepted the request. Security remains available as backup.',
          patrol:{status:'enroute',progress:64,lights:'on',eta:'4 min',detail:'Turning onto Oak Lane'},backup:{status:'available'}};
        sample.panel.initial = JSON.parse(JSON.stringify(sample.state));
        return sample;
      }
    },
    styles:String.raw`
.dispatch{--dispatch-accent:#6576b3;--dispatch-good:#368068;--dispatch-warn:#b87924;--dispatch-bad:#bd5265;color:var(--dtext);min-width:0;container-type:inline-size;}
.dispatch-blocked{--dispatch-accent:var(--dispatch-bad);}.dispatch-onscene,.dispatch-resolved{--dispatch-accent:var(--dispatch-good);}.dispatch-unknown,.dispatch-cancelled{--dispatch-accent:var(--dfaint);}
.dispatch-hero{padding:14px;border:1px solid color-mix(in srgb,var(--dispatch-accent) 25%,transparent);border-radius:15px;background:linear-gradient(125deg,color-mix(in srgb,var(--dispatch-accent) 13%,transparent),color-mix(in srgb,var(--dispatch-accent) 3%,transparent));}
.dispatch-topline{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:10px;}.dispatch-topline>span:first-child{font:600 10px/1.5 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.05em;color:var(--dfaint);}.dispatch-priority{font:600 9px/1.5 'IBM Plex Mono',monospace;text-transform:uppercase;padding:3px 7px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dtext) 15%,transparent);}.dispatch-priority-urgent{color:var(--dispatch-warn);background:color-mix(in srgb,var(--dispatch-warn) 10%,transparent);border-color:color-mix(in srgb,var(--dispatch-warn) 25%,transparent);}.dispatch-priority-critical{color:var(--dispatch-bad);background:color-mix(in srgb,var(--dispatch-bad) 10%,transparent);border-color:color-mix(in srgb,var(--dispatch-bad) 25%,transparent);}
.dispatch-status{font:600 22px/1.2 'IBM Plex Sans',sans-serif;color:var(--dink);margin-bottom:9px;overflow-wrap:anywhere;border-radius:5px;}.dispatch-dispatcher{display:flex;align-items:center;gap:6px;font-size:11px;}.dispatch-dispatcher svg{width:17px;height:17px;flex:none;color:var(--dispatch-accent);}
.dispatch-incident{padding:13px 2px 12px;display:grid;gap:4px;}.dispatch-case-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--dfaint);font-weight:600;}.dispatch-incident strong{font-size:13px;line-height:1.4;color:var(--dink);font-weight:600;}.dispatch-location{display:flex;align-items:flex-start;gap:4px;font-size:11px;}.dispatch-location svg{width:14px;height:16px;flex:none;}
.dispatch-progress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));list-style:none;margin:5px 0 0;padding:0;}.dispatch-stage{display:flex;align-items:center;flex-direction:column;gap:6px;position:relative;text-align:center;color:var(--dfaint);font-size:10px;line-height:1.3;min-width:0;}.dispatch-stage:before{position:absolute;content:'';height:1px;background:color-mix(in srgb,var(--dtext) 20%,transparent);top:7px;width:100%;left:50%;}.dispatch-stage:last-child:before{display:none;}.dispatch-stage-dot{width:13px;height:13px;border:1.5px solid color-mix(in srgb,var(--dtext) 30%,transparent);border-radius:50%;position:relative;z-index:1;background:var(--panel-bg,#f1f4fb);box-sizing:border-box;}.dispatch-stage.is-current{color:var(--dispatch-accent);font-weight:700;}.dispatch-stage.is-current .dispatch-stage-dot{border-color:var(--dispatch-accent);background:var(--dispatch-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--dispatch-accent) 12%,transparent);}
.dispatch-stage-note{text-align:center;color:var(--dispatch-accent);font:600 10px/1.5 'IBM Plex Mono',monospace;margin-top:9px;}.dispatch-brief{font-size:11px;line-height:1.5;margin:12px 0;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--dispatch-accent) 5%,transparent);border-left:2px solid color-mix(in srgb,var(--dispatch-accent) 55%,transparent);}
.dispatch-roster-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;margin:13px 0 8px;}.dispatch-roster-head>span:first-child{text-transform:uppercase;font-weight:600;letter-spacing:.05em;}.dispatch-roster-head>span+span{color:var(--dfaint);font-family:'IBM Plex Mono',monospace;}.dispatch-roster{list-style:none;margin:0;padding:0;display:grid;gap:9px;}
.dispatch-unit{border:1px solid color-mix(in srgb,var(--dtext) 15%,transparent);border-radius:12px;padding:11px 12px;min-width:0;}.dispatch-unit-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}.dispatch-unit-icon{display:grid;place-items:center;flex:none;width:30px;height:34px;border-radius:8px;background:color-mix(in srgb,var(--dispatch-accent) 8%,transparent);color:var(--dispatch-accent);}.dispatch-unit-icon svg{width:22px;height:22px;}.dispatch-unit-title{display:grid;gap:2px;flex:1;min-width:70px;}.dispatch-unit-title strong{font-size:12px;line-height:1.35;font-weight:600;color:var(--dink);}.dispatch-unit-title>span{font:10px/1.4 'IBM Plex Mono',monospace;color:var(--dfaint);}.dispatch-unit-status{font-size:10px;color:var(--dfaint);padding:2px 6px;border-radius:999px;background:color-mix(in srgb,var(--dtext) 6%,transparent);}.dispatch-unit-enroute .dispatch-unit-status,.dispatch-unit-assigned .dispatch-unit-status{color:var(--dispatch-accent);}.dispatch-unit-onscene .dispatch-unit-status{color:var(--dispatch-good);}.dispatch-unit-unavailable .dispatch-unit-status{color:var(--dispatch-bad);}
/* The neighborhood is the reading surface; the roster supports the scene. */
.dispatch-scene{margin:12px 0 0;border:1px solid color-mix(in srgb,var(--dispatch-accent) 20%,transparent);border-radius:15px;overflow:hidden;background:#e7edf5;isolation:isolate;}
.dispatch-scene>svg{display:block;width:100%;height:auto;aspect-ratio:540/338;overflow:visible;}
.dispatch-scene-caption{display:flex;justify-content:space-between;gap:6px;align-items:center;padding:9px 11px 0;color:#556e89;font:600 9px/1.4 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.06em;background:#e7edf5;}
.dispatch-scene-caption>span+span{font-size:8px;letter-spacing:.025em;opacity:.75;}
.dispatch-scene-address{display:grid;gap:3px;padding:9px 11px;background:rgba(255,255,255,.65);color:#4d6680;border-top:1px solid #c7d6dc;}
.dispatch-scene-address>span{font:600 11px/1.4 'IBM Plex Sans',sans-serif;overflow-wrap:anywhere;}.dispatch-scene-address small{font:9px/1.4 'IBM Plex Mono',monospace;color:#718399;}
.dispatch-scene-day .dispatch-sky{fill:#dcedf2;}.dispatch-scene-day .dispatch-terrain{fill:#d5e7d5;}.dispatch-scene-day,.dispatch-scene-day .dispatch-scene-caption{background:#dcedf2;}.dispatch-scene-day .dispatch-house-windows{fill:#bbdbe3;}
.dispatch-scene-night .dispatch-sky{fill:#334761;}.dispatch-scene-night .dispatch-terrain{fill:#688b89;}.dispatch-scene-night .dispatch-road{stroke:#5b718b;}.dispatch-scene-night .dispatch-sun{fill:#d6e6ee;}.dispatch-scene-night,.dispatch-scene-night .dispatch-scene-caption{background:#334761;color:#d9e7f5;}.dispatch-scene-night .dispatch-scene-address{background:#31455f;color:#d9e7f5;border-color:#738a9e;}.dispatch-scene-night .dispatch-scene-address small{color:#aabbcc;}
.dispatch-vehicle-travel{transition:transform 1800ms cubic-bezier(.22,.7,.25,1);}
.dispatch-wheel{transform-box:fill-box;transform-origin:center;}.dispatch-pose-enroute .dispatch-wheel{animation:dispatch-wheel-spin .8s linear infinite;}
.dispatch-beacon-glow{opacity:0;}.dispatch-lamp-a,.dispatch-lamp-b{opacity:.3;}.dispatch-lights-on .dispatch-beacon-glow{animation:dispatch-beacon-glow 1.3s ease-in-out infinite;}.dispatch-lights-on .dispatch-lamp-a{animation:dispatch-beacon-flash .9s steps(1,end) infinite;}.dispatch-lights-on .dispatch-lamp-b{animation:dispatch-beacon-flash .9s steps(1,end) -.45s infinite;}
.dispatch-pose-available{opacity:.66;}.dispatch-pose-available .dispatch-vehicle-label{display:none;}.dispatch-arrival{filter:drop-shadow(0 2px 5px #37645130);}
.dispatch-scene[data-motion="still"] *{animation:none!important;transition:none!important;}.dispatch-scene[data-motion="still"] .dispatch-lights-on .dispatch-lamp-a,.dispatch-scene[data-motion="still"] .dispatch-lights-on .dispatch-lamp-b{opacity:1;}
.dispatch-hero{padding:11px 12px;}.dispatch-topline{margin-bottom:6px;}.dispatch-status{font-size:20px;margin-bottom:6px;}.dispatch-incident{padding:11px 2px 5px;gap:2px;}.dispatch-incident strong{font-size:12px;}.dispatch-case-label{font-size:8px;}.dispatch-brief{margin:9px 0;font-size:10.5px;padding:7px 9px;}.dispatch-progress{margin-top:7px;}.dispatch-stage{font-size:9px;gap:4px;}.dispatch-stage-dot{width:10px;height:10px;}.dispatch-stage:before{top:5px;}.dispatch-stage.is-current .dispatch-stage-dot{box-shadow:0 0 0 3px color-mix(in srgb,var(--dispatch-accent) 12%,transparent);}
.dispatch-roster-head{margin:10px 0 5px;font-size:9px;}.dispatch-roster{gap:5px;}.dispatch-unit{padding:7px 9px;border-radius:9px;}.dispatch-unit-top{gap:6px;}.dispatch-unit-icon{width:24px;height:26px;}.dispatch-unit-icon svg{width:18px;height:18px;}.dispatch-unit-title{gap:0;}.dispatch-unit-title strong{font-size:11px;}.dispatch-unit-title>span{font-size:9px;}.dispatch-unit-status{font-size:9px;}.dispatch-unit-bottom{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 8px;margin-top:4px;padding-left:30px;}.dispatch-eta{font-size:9px;line-height:1.4;}.dispatch-eta small{font-size:8px;color:var(--dfaint);margin-right:2px;}.dispatch-unit-enroute .dispatch-eta{font-weight:600;color:var(--dink);}.dispatch-unit-detail{font-size:9px;line-height:1.4;margin:0;color:var(--dfaint);}
@keyframes dispatch-wheel-spin{to{transform:rotate(360deg);}}@keyframes dispatch-beacon-flash{0%,100%{opacity:1;}50%{opacity:.25;}}@keyframes dispatch-beacon-glow{0%,100%{opacity:.08;}50%{opacity:.24;}}
@container(max-width:260px){.dispatch-hero{padding:11px;}.dispatch-status{font-size:18px;}.dispatch-unit{padding:10px;}.dispatch-unit-status{margin-left:auto;}.dispatch-stage{font-size:9px;}.dispatch-unit-title{min-width:65px;}.dispatch-unit-top{gap:6px;}}
.sk-aurora .dispatch,.sk-terminal .dispatch,.sk-blueprint .dispatch{--dispatch-accent:#a6b6fa;--dispatch-good:#76c7a4;--dispatch-warn:#e2b571;--dispatch-bad:#ef91a6;--panel-bg:#15253a;}.sk-aurora .dispatch-blocked,.sk-terminal .dispatch-blocked,.sk-blueprint .dispatch-blocked{--dispatch-accent:var(--dispatch-bad);}.sk-aurora .dispatch-onscene,.sk-terminal .dispatch-onscene,.sk-blueprint .dispatch-onscene,.sk-aurora .dispatch-resolved,.sk-terminal .dispatch-resolved,.sk-blueprint .dispatch-resolved{--dispatch-accent:var(--dispatch-good);}
.sk-terminal .dispatch-hero,.sk-terminal .dispatch-unit,.sk-terminal .dispatch-brief,.sk-blueprint .dispatch-hero,.sk-blueprint .dispatch-unit,.sk-blueprint .dispatch-brief{border-radius:3px;}
@media(prefers-reduced-motion:reduce){.dispatch *{animation:none!important;transition:none!important;}.dispatch-lights-on .dispatch-lamp-a,.dispatch-lights-on .dispatch-lamp-b{opacity:1;}}
@media print{.dispatch{--dispatch-accent:#333!important;--dispatch-good:#333!important;--dispatch-warn:#333!important;--dispatch-bad:#333!important;--panel-bg:#fff;color:#222;}.dispatch *{animation:none!important;transition:none!important;box-shadow:none!important;}.dispatch-hero,.dispatch-unit,.dispatch-brief{background:#fff;border:1px solid #999;}.dispatch-unit{break-inside:avoid;}}
`
  });
})();

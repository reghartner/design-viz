/* Manually exported app screens: assets belong to the panel, steps select IDs.
   The same definition ships in standalone pages, the workbench and native hosts. */
(function () {
  var maxScreens = 32;
  function screens(panel) { return panelCollectionItems(panel, 'screens', maxScreens); }
  function text(value) { return typeof value === 'string' ? value : ''; }
  function dimension(value) { return Number.isInteger(value) && value > 0 && value <= 4096; }
  function clean(panel, raw, once, path, warnings) {
    var out = {};
    function warn(key, message) { if (warnings) warnings.push(path + key + ': ' + message); }
    if (raw == null) return out;
    if (!panelObject(raw)) { warn('', 'expected a state object — ignored'); return out; }
    Object.keys(raw).forEach(function (key) {
      if (key === 'screen') {
        if (raw.screen === null || screens(panel).some(function (item) { return item.id === raw.screen; }))
          out.screen = raw.screen;
        else warn('.screen', 'expected a declared screen ID or null — ignored');
      } else if (key === 'enterOnce' && once) {
        if (panelObject(raw.enterOnce)) out.enterOnce = clean(panel, raw.enterOnce, false, path + '.enterOnce', warnings);
        else warn('.enterOnce', 'expected a state object — ignored');
      } else warn('.' + key, 'unknown app screens state field — ignored');
    });
    return out;
  }
  function image(item, previous) {
    var src = item && embeddedImageSource(item.src);
    if (!src) return '';
    return '<img class="appscreen-' + (previous ? 'previous' : 'current') + '" src="' + esc(src) +
      '" alt="' + esc(previous ? '' : text(item.alt) || text(item.label) || item.id) + '"' +
      (previous ? ' aria-hidden="true"' : ' data-screen-id="' + esc(item.id) + '"') + '>';
  }
  function render(host, panel, state, skin, states, index, animate) {
    var items = screens(panel), current = items.find(function (item) { return item.id === state.screen; });
    var first = items.find(function (item) { return dimension(item.width) && dimension(item.height); });
    var ratio = first ? first.width / first.height : panel.frame === 'none' ? 1.6 : 9 / 19.5;
    var src = current && embeddedImageSource(current.src), old = host.querySelector('.appscreen-current');
    var previous = animate && panel.transition === 'crossfade' && src && old && old.getAttribute('src') !== src
      ? {src:old.getAttribute('src')} : null;
    var stage = src ? image(current, false) : '<div class="appscreen-empty">' +
      (current ? 'This screen needs an image.' : items.length ? 'No screen selected' : 'Upload your app screens in the inspector') + '</div>';
    var caption = current ? '<figcaption><strong>' + esc(text(current.label) || current.id) + '</strong>' +
      (current.caption ? '<span>' + esc(text(current.caption)) + '</span>' : '') + '</figcaption>' : '';
    var link = current && typeof FlowCanon !== 'undefined' && FlowCanon.http(current.link);
    if (link) caption += '<a class="appscreen-reference" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open design reference ↗</a>';
    var before = '<figure class="appscreens" style="--appscreen-ratio:' + ratio.toFixed(6) + '"><div class="appscreen-stage"><div class="appscreen-viewport' +
      (panel.frame !== 'none' ? ' appscreen-phone' : '') + '">';
    var after = '</div></div>' + caption + '</figure>', baseline = before + stage + after;
    return {
      html: before + stage + image(previous, true) + after,
      baseline: baseline,
      transient: '.appscreen-previous',
      mounted: function () {
        if (!previous) return;
        var next = host.querySelector('.appscreen-current'), outgoing = host.querySelector('.appscreen-previous');
        if (!next || !outgoing) return;
        /* Keep the decoded old screen visible until the next image is ready.
           CSS owns motion; no timers or global listeners survive a remount. */
        function ready() {
          if (next.parentNode && outgoing.parentNode === next.parentNode) outgoing.classList.add('appscreen-fade');
        }
        outgoing.addEventListener('animationend', function () { outgoing.remove(); }, {once:true});
        if (next.complete) ready();
        else {
          next.addEventListener('load', ready, {once:true});
          next.addEventListener('error', function () { outgoing.remove(); }, {once:true});
        }
      }
    };
  }
  function editor(context) {
    var expanded = Object.create(null);
    function select(label, pairs, value, change) {
      var input = document.createElement('select'); input.className = 'fctl'; input.setAttribute('aria-label', label);
      pairs.forEach(function (pair) {
        var option = document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; input.appendChild(option);
      });
      input.value = value;
      context.listen(input, 'change', function () { change(input.value); });
      return context.controls.row(label, input);
    }
    function choices(panel) { return screens(panel).map(function (item) { return [item.id, text(item.label) || item.id]; }); }
    function editPanel(update) {
      if (context.editingBlocked()) { context.error('Finish ADD TO STEP before editing app screens.'); return false; }
      return context.transact(function (raw) {
        var path = builderTargetPath(raw, context.target()), panel = path && specValueAt(raw, path);
        if (!panel || panel.type !== 'appscreens') return {error:'Select the App screens panel again.'};
        return update(raw, panel, path);
      }, {after:function () { context.refresh(); }});
    }
    function updateItem(id, key, value) {
      return editPanel(function (raw, panel, path) {
        var index = (panel.screens || []).findIndex(function (item) { return item.id === id; });
        if (index < 0) return {error:'Screen no longer exists. Reselect the panel.'};
        return planSetField(context.source(), raw, path.concat(['screens', index]), key, value == null ? null : JSON.stringify(value));
      });
    }
    function remove(id) {
      return editPanel(function (raw, panel, path) {
        var rec = specSectionPaths(raw)[context.target().section], d = specValueAt(raw, rec.diagram);
        var out = context.source(), error;
        function set(owner, key, value) {
          if (error) return;
          var plan = jsonSetField(out, owner, key, value === undefined ? null : JSON.stringify(value));
          if (!plan) error = 'Could not remove screen references.'; else out = plan.text;
        }
        var remaining = (panel.screens || []).filter(function (item) { return item.id !== id; });
        set(path, 'screens', remaining);
        if (panel.initial && panel.initial.screen === id) set(path.concat(['initial']), 'screen', remaining.length ? remaining[0].id : null);
        /* Shared step bodies are visited once, including bodies outside the active path. */
        (d.steps || []).forEach(function (step, index) {
          ['panels', 'patch'].forEach(function (key) {
            var patch = step[key] && step[key][panel.id], at = rec.diagram.concat(['steps', index, key, panel.id]);
            if (!patch) return;
            if (patch.screen === id) set(at, 'screen', undefined);
            if (patch.enterOnce && patch.enterOnce.screen === id) set(at.concat(['enterOnce']), 'screen', undefined);
          });
        });
        return error ? {error:error} : {text:out};
      });
    }
    function upload(panel, replaceId) {
      var input = document.createElement('input'), retired = false, epoch = 0, pending = [];
      input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.multiple = !replaceId;
      input.setAttribute('aria-label', replaceId ? 'Replace image for ' + replaceId : 'Upload app screens');
      function cancel() {
        epoch++;
        pending.splice(0).forEach(function (stop) { stop(); });
      }
      context.onFormRetire(function () { retired = true; cancel(); });
      context.listen(input, 'change', function () {
        cancel();
        var files = Array.from(input.files || []), generation = epoch;
        if (!files.length) return;
        var original = context.source(), target = JSON.stringify(context.target());
        function current() { return !retired && generation === epoch && original === context.source() && target === JSON.stringify(context.target()); }
        function fail(message) { if (current()) { context.error(message); input.value = ''; } }
        if (!replaceId && (panel.screens || []).length + files.length > maxScreens) { fail('Use at most ' + maxScreens + ' screens per panel.'); return; }
        var invalid = files.find(function (file) { return file.size > EMBEDDED_IMAGE_MAX_BYTES || ['image/png','image/jpeg','image/webp'].indexOf(file.type) < 0; });
        if (invalid) { fail(invalid.name + ': choose PNG, JPEG or WebP up to 512 KiB.'); return; }
        Promise.all(files.map(function (file) {
          return new Promise(function (resolve, reject) {
            var reader = new FileReader(), probe = new Image();
            pending.push(function () {
              reader.onload = reader.onerror = null; probe.onload = probe.onerror = null;
              if (reader.readyState === 1) reader.abort();
              reject(new Error('Upload cancelled.'));
            });
            reader.onerror = function () { reject(new Error(file.name + ': could not read image.')); };
            reader.onload = function () {
              var src = embeddedImageSource(reader.result);
              if (!src) { reject(new Error(file.name + ': invalid image.')); return; }
              probe.onerror = function () { reject(new Error(file.name + ': not a readable image.')); };
              probe.onload = function () {
                if (!dimension(probe.naturalWidth) || !dimension(probe.naturalHeight)) { reject(new Error(file.name + ': use an image no larger than 4096 × 4096 pixels.')); return; }
                resolve({src:src, width:probe.naturalWidth, height:probe.naturalHeight, name:file.name});
              };
              probe.src = src;
            };
            reader.readAsDataURL(file);
          });
        })).then(function (loaded) {
          if (!current()) return;
          editPanel(function (raw, live, path) {
            var items = builderClone(live.screens || []), firstImport = items.length === 0;
            loaded.forEach(function (asset) {
              if (replaceId) {
                var item = items.find(function (item) { return item.id === replaceId; });
                if (item) { item.src = asset.src; item.width = asset.width; item.height = asset.height; }
              } else {
                var label = asset.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Screen';
                var stem = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen';
                var id = stem, suffix = 2;
                while (items.some(function (item) { return item.id === id; })) id = stem + '-' + suffix++;
                items.push({id:id, label:label, alt:label, src:asset.src, width:asset.width, height:asset.height});
              }
            });
            var pairs = [['screens', JSON.stringify(items)]];
            if (firstImport) pairs.push(['initial', JSON.stringify(Object.assign({}, live.initial, {screen:items[0].id}))]);
            return planSetFields(context.source(), raw, path, pairs);
          });
        }).catch(function (error) { fail(error.message); });
      });
      return input;
    }
    return {
      setupField: function (field, panel) {
        if (field[0] === 'frame' || field[0] === 'transition') {
          var frame = field[0] === 'frame';
          return select(frame ? 'Frame' : 'Transition', frame ? [['phone','Phone'],['none','None']] : [['cut','Cut'],['crossfade','Crossfade']],
            panel[field[0]] || (frame ? 'phone' : 'cut'), function (value) { context.commit(field[0], JSON.stringify(value)); });
        }
        if (field[0] === 'initial') {
          return select('Starting screen', [['','No screen']].concat(choices(panel)), panel.initial && panel.initial.screen || '', function (value) {
            editPanel(function (raw, live, path) {
              return planSetField(context.source(), raw, path, 'initial', JSON.stringify(Object.assign({}, live.initial, {screen:value || null})));
            });
          });
        }
        if (field[0] !== 'screens') return;
        var box = document.createElement('div'); box.className = 'appscreen-editor';
        box.appendChild(upload(panel));
        var help = document.createElement('p'); help.className = 'fnote';
        help.textContent = 'Upload exported Figma screens or screenshots. PNG, JPEG or WebP; up to 512 KiB and 4096 × 4096 per image. Each image is stored once and reused by steps.';
        box.appendChild(help);
        screens(panel).forEach(function (item) {
          var card = document.createElement('details'), foldKey = JSON.stringify([context.target(), item.id]); card.className = 'appscreen-card';
          card.open = !!expanded[foldKey];
          context.listen(card, 'toggle', function () { expanded[foldKey] = card.open; });
          var summary = document.createElement('summary'); summary.textContent = text(item.label) || item.id; card.appendChild(summary);
          if (embeddedImageSource(item.src)) {
            var preview = document.createElement('img'); preview.src = item.src; preview.alt = text(item.alt) || item.id; preview.className = 'appscreen-thumbnail'; card.appendChild(preview);
          }
          [['label','Name'],['alt','Image description'],['caption','Caption'],['link','Design reference link']].forEach(function (pair) {
            var input = context.controls.text(item[pair[0]], function (value) {
              if (pair[0] === 'link' && value && !FlowCanon.http(value)) { context.error('Use an HTTP(S) design reference link.'); return false; }
              return updateItem(item.id, pair[0], value);
            });
            input.setAttribute('aria-label', pair[1] + ' for ' + item.id);
            card.appendChild(context.controls.row(pair[1], input));
          });
          card.appendChild(context.controls.row('Replace image', upload(panel, item.id)));
          card.appendChild(context.controls.action('Remove ' + (text(item.label) || item.id), function () { remove(item.id); }));
          var note = document.createElement('p'); note.className = 'fnote';
          note.textContent = 'Removing a screen makes its step selections inherit. Undo restores the image and all selections.'; card.appendChild(note);
          box.appendChild(card);
        });
        return context.controls.block('Screens', box);
      },
      stepControl: function (diagram, panel, target) {
        var step = diagram.steps[target.index], patch = (stepPanelPatch(step) || {})[panel.id] || {};
        var box = document.createElement('div'); box.className = 'rowsedit';
        box.appendChild(select('App screen · ' + (panel.title || panel.id), [['','Inherit previous screen'],['@blank','No screen']].concat(choices(panel).map(function (pair) { return ['id:' + pair[0], pair[1]]; })),
          panelOwn(patch, 'screen') ? patch.screen === null ? '@blank' : 'id:' + patch.screen : '', function (value) {
            if (context.editingBlocked()) { context.error('Finish ADD TO STEP before choosing a screen.'); return; }
            context.transact(function (raw) {
              var got = builderStepAt(raw, target.section, target.index);
              if (!got) return {error:'Reselect the step.'};
              var key = panelObject(got.st.panels) ? 'panels' : panelObject(got.st.patch) ? 'patch' : 'panels';
              var all = Object.assign({}, got.st[key]), next = Object.assign({}, all[panel.id]);
              if (!value) delete next.screen; else next.screen = value === '@blank' ? null : value.slice(3);
              if (Object.keys(next).length) all[panel.id] = next; else delete all[panel.id];
              return planSetField(context.source(), raw, builderTargetPath(raw, target), key, Object.keys(all).length ? JSON.stringify(all) : null);
            }, {after:function () { context.refresh(); }});
          }));
        var help = document.createElement('p'); help.className = 'fnote'; help.textContent = 'The selected screen carries forward until another step changes it. Add or replace images by selecting the App screens panel.'; box.appendChild(help);
        return box;
      }
    };
  }
  PanelRegistry.define('appscreens', {
    label:'App screens', since:'0.1.0', order:22, render:render,
    layout:{large:true, height:23, supporting:false},
    presentation:{ambientInitial:true},
    validateDeclaration:function (panel, path, warnings, errors) {
      if (panel.screens != null && !Array.isArray(panel.screens)) errors.push(path + '.screens: expected an array');
      else if (Array.isArray(panel.screens) && panel.screens.length) {
        panelCollectionWarnings(panel, path, warnings, 'screens', maxScreens, function (item, at) {
          if (item.src != null && !embeddedImageSource(item.src)) errors.push(at + '.src: use an embedded PNG, JPEG or WebP up to 512 KiB');
          ['label','alt','caption'].forEach(function (key) { if (item[key] != null && typeof item[key] !== 'string') warnings.push(at + '.' + key + ': expected text'); });
          if (item.src && !text(item.alt).trim()) warnings.push(at + '.alt: describe the image for readers who cannot see it');
          if (item.link != null && (typeof FlowCanon === 'undefined' || !FlowCanon.http(item.link))) warnings.push(at + '.link: expected an HTTP(S) URL without credentials');
          ['width','height'].forEach(function (key) { if (item[key] != null && !dimension(item[key])) warnings.push(at + '.' + key + ': use an integer from 1 to 4096'); });
        });
      }
      if (panel.frame != null && ['phone','none'].indexOf(panel.frame) < 0) warnings.push(path + '.frame: expected phone or none — using phone');
      if (panel.transition != null && ['cut','crossfade'].indexOf(panel.transition) < 0) warnings.push(path + '.transition: expected cut or crossfade — using cut');
      clean(panel, panel.initial, false, path + '.initial', warnings);
    },
    validatePatch:function (patch, path, panel, warnings) { clean(panel, patch, true, path, warnings); },
    fold:function (panel, steps) { return foldSanitizedPanelStates(panel, steps, function (raw, once) { return clean(panel, raw, once); }); },
    authoring:{
      template:{title:'App screens', screens:[], frame:'phone', transition:'cut', initial:{screen:null}},
      setupFields:[['screens','jsonArr'],['frame','text'],['transition','text'],['initial','json']],
      patchFields:[['screen','text']],
      expandPatchFields:function (panel) { return [['screen','enum',screens(panel).map(function (item) { return item.id; })]]; },
      origin:function (panel, key, snapshot, context) { return panelSanitizedOrigin(key, context, function (raw) { return clean(panel, raw, false); }); },
      picker:{order:26, name:'App screens', category:'Devices & interfaces', tagline:'Your product screens, in step',
        description:'Upload exported Figma screens or screenshots, then change the displayed screen alongside the flow. Choose a phone frame and cut or crossfade transitions.'},
      example:function (sample, context) {
        if (context.referenceImage) {
          sample.panel.screens = [{id:'sample',label:'Sample screen',alt:'Illustrative screen preview',src:context.referenceImage,width:640,height:340}];
          sample.panel.frame = 'none'; sample.panel.initial = {screen:'sample'}; sample.state = {screen:'sample'};
        }
        return sample;
      },
      editor:editor
    },
    styles: String.raw`
.pt-appscreens .pbody{min-height:0;display:flex;flex-direction:column;}
.appscreens{margin:0;display:flex;flex-direction:column;gap:8px;min-width:0;min-height:390px;flex:1;color:var(--dtext);}
.appscreen-stage{container-type:size;display:flex;align-items:center;justify-content:center;flex:none;height:340px;min-height:280px;}
.appscreen-viewport{position:relative;box-sizing:border-box;overflow:hidden;background:var(--dfaint);width:min(100cqw,calc(100cqh * var(--appscreen-ratio)));height:min(100cqh,calc(100cqw / var(--appscreen-ratio)));}
.appscreen-phone{border:6px solid #343b49;border-radius:24px;background:#161d2a;box-shadow:0 5px 16px #10182822;}
.appscreen-current,.appscreen-previous{display:block;width:100%;height:100%;object-fit:contain;}
.appscreen-previous{position:absolute;inset:0;pointer-events:none;}
.appscreen-fade{animation:appscreen-crossfade .24s ease-out forwards;}
@keyframes appscreen-crossfade{to{opacity:0;}}
.appscreen-empty{display:grid;place-items:center;height:100%;padding:20px;box-sizing:border-box;text-align:center;font:12px/1.5 'Sora',sans-serif;color:var(--dtext);background:var(--dfaint);}
.appscreens figcaption{display:flex;flex-direction:column;gap:3px;text-align:center;font:12px/1.4 'Sora',sans-serif;overflow-wrap:anywhere;flex:none;}
.appscreens figcaption span{font-size:11px;opacity:.75;}
.appscreen-reference{font:11px/1.4 'Sora',sans-serif;text-align:center;color:var(--dtext);}
.section-layout-tile>.pt-appscreens{display:flex;flex-direction:column;}
.section-layout-tile>.pt-appscreens>.ptitle{flex:none;}
.section-layout-tile>.pt-appscreens>.pbody{flex:1;}
.section-layout-tile .appscreens,.section-layout-tile .appscreen-stage{min-height:0;}
.section-layout-tile .appscreen-stage{height:auto;flex:1;}
@media(prefers-reduced-motion:reduce){.appscreen-previous{display:none;}.appscreen-fade{animation:none;}}
@media print{
  .appscreen-previous{display:none;}
  .panelcol:has(.pt-appscreens){display:flex !important;}
  .docview .pwidget.pt-appscreens{display:block !important;break-inside:avoid;}
  .docview .appscreens{min-height:390px;}
  .docview .appscreen-stage{height:320px;min-height:320px;flex:none;}
}
`,
    editorStyles:String.raw`
.appscreen-editor{display:flex;flex-direction:column;gap:10px;min-width:0;}
.appscreen-editor input[type=file]{width:100%;min-width:0;font:inherit;font-size:12px;}
.appscreen-card{border:1px solid var(--border);border-radius:8px;padding:8px;}
.appscreen-card summary{cursor:pointer;overflow-wrap:anywhere;}
.appscreen-card[open]{display:flex;flex-direction:column;gap:8px;}
.appscreen-thumbnail{display:block;max-width:100%;max-height:160px;object-fit:contain;margin:8px auto;}
`
  });
})();

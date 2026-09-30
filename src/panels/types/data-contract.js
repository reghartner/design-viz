/* Authored contract defaults with step-specific content, layout and emphasis. */
(function () {
  var MAX_COLUMNS = 12, MAX_FIELDS = 64;
  var colors = {blue:'#3b82f6', green:'#22c55e', amber:'#f59e0b', red:'#ef4444', purple:'#a855f7', teal:'#14b8a6'};
  function color(value) {
    if (typeof value !== 'string') return null;
    return panelOwn(colors, value) ? colors[value] : /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  }
  function width(value, fallback) {
    return typeof value === 'number' && isFinite(value) && value >= 40 ? value : fallback;
  }
  function columns(panel) { return panelCollectionItems(panel, 'columns', MAX_COLUMNS); }
  function fields(panel) { return panelCollectionItems(panel, 'fields', MAX_FIELDS); }
  function text(value) {
    return value === undefined ? '' : value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  function content(panel, state) {
    var resolved = Object.assign({}, panel);
    ['columns', 'fields'].forEach(function (key) {
      if (Array.isArray(state && state[key])) resolved[key] = state[key];
    });
    if (state && width(state.fieldWidth, null) !== null) resolved.fieldWidth = state.fieldWidth;
    return resolved;
  }
  function contentWarnings(value, path, warnings) {
    if (value.fieldWidth != null && width(value.fieldWidth, null) === null)
      warnings.push(path + '.fieldWidth: use a width of at least 40 pixels — using declared width');
    ['columns', 'fields'].forEach(function (key) {
      if (value[key] === undefined || Array.isArray(value[key]) && !value[key].length) return;
      panelCollectionWarnings(value, path, warnings, key, key === 'columns' ? MAX_COLUMNS : MAX_FIELDS, function (item, at, warnings) {
        if (key === 'columns' && item.width != null && width(item.width, null) === null)
          warnings.push(at + '.width: use a width of at least 40 pixels — using 160');
        if (key === 'fields' && item.cells != null && !panelObject(item.cells))
          warnings.push(at + '.cells: expected an object keyed by column id — cells ignored');
      });
    });
  }
  function patchWarnings(state, path, panel, warnings) {
    softwarePanelPatchWarnings(state, path, content(panel, state), warnings, function (state, at, panel, warnings) {
      contentWarnings(state, at, warnings);
      var known = Array.isArray(state.fields) ? fields(state) : (Array.isArray(panel.fields) ? panel.fields : []);
      if (state.highlights == null) return;
      if (!panelObject(state.highlights)) { warnings.push(at + '.highlights: expected an object keyed by declared id'); return; }
      Object.keys(state.highlights).forEach(function (id) {
        var entry = state.highlights[id], entryPath = at + '.highlights.' + id;
        if (!known.some(function (field) { return panelObject(field) && field.id === id; })) {
          warnings.push(entryPath + ': unknown declared id — ignored'); return;
        }
        validateHighlight(entry, entryPath, warnings);
      });
      function validateHighlight(entry, at, warnings) {
        if (!panelObject(entry)) warnings.push(at + ': expected {color, label?} — highlight ignored');
        else {
          if (entry.color != null && !color(entry.color)) warnings.push(at + '.color: use blue, green, amber, red, purple, teal or a six-digit hex color — highlight ignored');
          if (entry.label != null && typeof entry.label !== 'string') warnings.push(at + '.label: expected text');
        }
      }
    });
  }
  function render(host, panel, state) {
    state = state || {};
    panel = content(panel, state);
    var cols = columns(panel), rows = fields(panel), firstWidth = width(panel.fieldWidth, 180);
    var total = cols.reduce(function (sum, col) { return sum + width(col.width, 160); }, firstWidth);
    var h = '<div class="dcontract-scroll" tabindex="0" role="region" aria-label="' + esc(panel.title || 'Data contract') + '">' +
      '<table class="dcontract-table" style="width:' + total + 'px"><caption class="dcontract-caption">' + esc(panel.title || 'Data contract') +
      '</caption><colgroup><col style="width:' + firstWidth + 'px">';
    cols.forEach(function (col) { h += '<col style="width:' + width(col.width, 160) + 'px">'; });
    h += '</colgroup><thead><tr><th scope="col">Field</th>';
    cols.forEach(function (col) { h += '<th scope="col">' + esc(col.label || col.id) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (field) {
      var highlight = panelOwn(state.highlights, field.id) && panelObject(state.highlights[field.id]) ? state.highlights[field.id] : {};
      var tint = color(highlight.color), label = typeof highlight.label === 'string' ? highlight.label : '';
      h += '<tr data-contract-field="' + esc(field.id) + '"' + (tint ? ' class="dcontract-highlight" style="--contract-highlight:' + tint + '"' : '') +
        '><th scope="row"><span class="dcontract-name">' + esc(field.label || field.id) + '</span>' +
        (tint && label ? '<span class="dcontract-reason">' + esc(label) + '</span>' : '') + '</th>';
      cols.forEach(function (col) {
        h += '<td>' + (panelOwn(field.cells, col.id) ? esc(text(field.cells[col.id])) : '<span class="dcontract-missing">—</span>') + '</td>';
      });
      h += '</tr>';
    });
    if (!rows.length) h += '<tr><td colspan="' + (cols.length + 1) + '" class="dcontract-empty">No fields declared</td></tr>';
    return {html:softwarePanelShell(h + '</tbody></table></div>', state)};
  }

  function editor(context) {
    var controls = context.controls, doc = context.document;
    function saveCollection(key, panel, items) {
      if (context.editingBlocked()) { context.error('Finish ADD TO STEP before editing the contract.'); return false; }
      return context.transact(function (raw) {
        var target = context.target(), path = builderTargetPath(raw, target), live = path && specValueAt(raw, path);
        if (!live || live.type !== 'data-contract' || JSON.stringify(live[key]) !== JSON.stringify(panel[key]))
          return {error:'The contract changed. Select it again before editing.'};
        var result = planSetField(context.source(), raw, path, key, JSON.stringify(items));
        if (result.error || key !== 'fields') return result;
        var removed = fields(panel).map(function (field) { return field.id; }).filter(function (id) {
          return !items.some(function (field) { return field.id === id; });
        });
        if (!removed.length) return result;
        var out = result.text, rec = specSectionPaths(raw)[target.section], diagram = specValueAt(raw, rec.diagram), error;
        function prune(state, at) {
          if (!panelObject(state)) return;
          if (panelObject(state.highlights) && removed.some(function (id) { return panelOwn(state.highlights, id); })) {
            var next = Object.assign(Object.create(null), state.highlights);
            removed.forEach(function (id) { delete next[id]; });
            var edit = jsonSetField(out, at, 'highlights', JSON.stringify(next));
            if (edit) out = edit.text; else error = 'Could not remove the field highlights.';
          }
          if (panelObject(state.enterOnce)) prune(state.enterOnce, at.concat(['enterOnce']));
        }
        prune(live.initial, path.concat(['initial']));
        (diagram.steps || []).forEach(function (step, index) {
          ['panels','patch'].forEach(function (key) {
            if (panelOwn(step[key], live.id)) prune(step[key][live.id], rec.diagram.concat(['steps',index,key,live.id]));
          });
        });
        return error ? {error:error} : {text:out};
      }, {after:function () { context.refresh(); }});
    }
    function collection(key, panel, commit) {
      var isFields = key === 'fields', original = panel[key] === undefined ? [] : panel[key], cols = columns(panel);
      // Unsupported imports retain the ordinary JSON editor without a lossy projection.
      if (!Array.isArray(original) || original.some(function (item) {
        return !panelObject(item) || typeof item.id !== 'string' || !item.id ||
          isFields && item.cells != null && !panelObject(item.cells);
      })) return null;
      var shape = [{k:'label',label:isFields ? 'Field name' : 'Column name',req:true}];
      if (isFields) cols.forEach(function (col, index) { shape.push({k:'cell'+index,label:col.label || col.id}); });
      else shape.push({k:'width',label:'Width (px)',kind:'num'});
      var projected = original.map(function (item, index) {
        var row = {_sourceIndex:index,label:item.label || item.id};
        if (isFields) cols.forEach(function (col, i) { row['cell'+i] = panelOwn(item.cells, col.id) ? text(item.cells[col.id]) : ''; });
        else row.width = item.width;
        return row;
      });
      var control = controls.rows(key, projected, {cols:shape,wide:true,max:isFields ? MAX_FIELDS : MAX_COLUMNS}, {
        raw:false,
        collect:function (items) {
          var used = Object.create(null), error;
          original.forEach(function (item) { used[item.id] = true; });
          var out = items.map(function (item) {
            var base = original[item._sourceIndex], next = Object.assign(Object.create(null), base);
            if (!base) {
              var stem = item.label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || (isFields ? 'field' : 'column');
              var id = stem, suffix = 2;
              while (used[id]) id = stem + '-' + suffix++;
              used[id] = true; next.id = id;
            }
            if (!base || item.label !== (base.label || base.id)) next.label = item.label;
            if (isFields) {
              next.cells = Object.assign(Object.create(null), base && base.cells);
              cols.forEach(function (col, i) {
                var value = item['cell'+i] || '', prior = panelOwn(base && base.cells, col.id) ? text(base.cells[col.id]) : '';
                if (value === prior.trim()) return;
                if (value === '') delete next.cells[col.id]; else next.cells[col.id] = value;
              });
            } else {
              if (item.width !== undefined && width(item.width, null) === null) error = 'Column widths must be at least 40 pixels.';
              if (item.width === undefined) delete next.width; else next.width = item.width;
            }
            return next;
          });
          return error ? {error:error} : {value:out};
        },
        commitValue:function (items) { return commit ? commit(items) : saveCollection(key, panel, items); }
      });
      control.querySelector('.rowadd').textContent = isFields ? '+ Add field' : '+ Add column';
      control.setAttribute('data-contract-editor', key);
      return controls.block(isFields ? 'Fields' : 'Columns', control);
    }
    function highlights(options) {
      var values = options.value;
      if (values === undefined && options.effective) values = options.effective.value;
      if (values !== undefined && !panelObject(values)) return null;
      var box = doc.createElement('div'); box.className = 'dcontract-highlights';
      function commit(next) {
        var ok = options.commit(next);
        // Another control can commit before the deferred form refresh runs.
        if (ok) values = next;
        return ok;
      }
      var clear = controls.action('Clear all highlights', function () { return commit({}); });
      box.appendChild(clear);
      fields(options.panel).forEach(function (field) {
        var name = field.label || field.id, current = panelOwn(values, field.id) ? values[field.id] : undefined;
        var card = doc.createElement('div'); card.className = 'panel-collection-item';
        var title = doc.createElement('b'); title.textContent = name; card.appendChild(title);
        function change(key, value) {
          var result = panelKeyedStateChange(values, field.id, key, value);
          if (result.error) { context.error(result.error); return false; }
          return commit(result.value);
        }
        if (current !== undefined && !panelObject(current)) {
          card.appendChild(controls.action('Clear unsupported highlight', function () { return change(null, undefined); }));
          box.appendChild(card); return;
        }
        function setColor(value) { return value ? change('color', value) : change(null, undefined); }
        var choices = Object.keys(colors);
        if (current && color(current.color) && choices.indexOf(current.color) < 0) choices.push(current.color);
        var select = controls.select(choices, current && current.color, setColor, true);
        select.options[0].textContent = 'None'; select.setAttribute('aria-label', name + ' highlight');
        var group = doc.createElement('div'); group.className = 'dcontract-color-controls';
        var picker = doc.createElement('input'); picker.type = 'color'; picker.className = 'fctl';
        picker.value = color(current && current.color) || colors.blue; picker.setAttribute('aria-label', name + ' custom color');
        context.listen(picker, 'change', function () { setColor(picker.value); });
        group.appendChild(select); group.appendChild(picker);
        card.appendChild(controls.block('Highlight', group));
        var label = controls.text(current && current.label, function (value) { return change('label', value == null ? undefined : value); });
        label.setAttribute('aria-label', name + ' highlight label');
        card.appendChild(controls.row('Label', label)); box.appendChild(card);
      });
      return box;
    }
    return {
      setupField:function (field, panel) {
        if (field[0] === 'columns' || field[0] === 'fields') return collection(field[0], panel);
        if (field[0] === 'fieldWidth') return controls.row('Field name width (px)', controls.number(panel.fieldWidth, function (value) {
          if (value !== null && width(value, null) === null) { context.error('Field name width must be at least 40 pixels.'); return false; }
          return context.commit('fieldWidth', value === null ? null : String(value));
        }));
      },
      patchControl:function (field, options) {
        var state = {};
        Object.keys(options.effectiveFields || {}).forEach(function (key) { state[key] = options.effectiveFields[key].value; });
        var resolved = content(options.panel, options.initial ? options.panel.initial : state), key = field[0];
        var value = options.value === undefined && options.effective ? options.effective.value : options.value;
        if (key === 'highlights') return highlights(Object.assign({}, options, {panel:resolved}));
        if (key === 'columns' || key === 'fields') {
          if (value !== undefined) resolved[key] = value;
          return collection(key, resolved, options.commit);
        }
        if (key === 'fieldWidth') return controls.number(value === undefined ? resolved.fieldWidth : value, function (next) {
          if (next !== null && width(next, null) === null) { context.error('Field name width must be at least 40 pixels.'); return false; }
          return options.commit(next === null ? undefined : next);
        });
      }
    };
  }

  PanelRegistry.define('data-contract', {
    label:'Data contract', since:'0.1.0', order:23.5,
    itemCollection:{key:'fields',max:MAX_FIELDS},
    layout:{focusByDefault:true,focusLabel:'Contract',large:true,height:12,supporting:false,attachControls:true},
    validateDeclaration:function (panel, path, warnings, errors, diagram) {
      if (panel.fieldWidth != null && width(panel.fieldWidth, null) === null) warnings.push(path + '.fieldWidth: use a width of at least 40 pixels — using 180');
      if (Array.isArray(panel.columns) && !panel.columns.length) { /* A field-only contract is valid. */ }
      else panelCollectionWarnings(panel, path, warnings, 'columns', MAX_COLUMNS, function (col, at, warnings) {
        if (col.width != null && width(col.width, null) === null) warnings.push(at + '.width: use a width of at least 40 pixels — using 160');
      });
      if (Array.isArray(panel.fields) && !panel.fields.length) { /* Empty while authoring. */ }
      else panelCollectionWarnings(panel, path, warnings, 'fields', MAX_FIELDS, function (field, at, warnings) {
        if (field.cells != null && !panelObject(field.cells)) warnings.push(at + '.cells: expected an object keyed by column id — cells ignored');
      });
      patchWarnings(panel.initial, path + '.initial', panel, warnings);
      // Use the shared folder on each path; future and sibling fields must not
      // make a missing highlight target appear valid at this stop.
      var contexts = new Map();
      if (diagram) diagramPathList(diagram).forEach(function (route) {
        var steps = route.indices.map(function (index) { return diagram.steps[index]; });
        var carriedSteps = steps.map(function (step) {
          var patch = (stepPanelPatch(step) || {})[panel.id], values = {}, patches = Object.create(null);
          if (panelOwn(patch, 'fields')) values.fields = patch.fields;
          patches[panel.id] = values;
          return {panels:patches};
        });
        var states = foldCommonPanelStates(panel, carriedSteps);
        steps.forEach(function (step, index) {
          var patch = (stepPanelPatch(step) || {})[panel.id];
          if (!panelObject(patch)) return;
          if (!contexts.has(patch)) contexts.set(patch, []);
          contexts.get(patch).push(content(panel, states[index]));
        });
      });
      return contexts;
    },
    validatePatch:function (state, path, panel, warnings, context) {
      var candidates = context && context.get(state), found = [];
      (candidates || [content(panel, panel.initial)]).forEach(function (active) {
        patchWarnings(state, path, active, found);
      });
      Array.from(new Set(found)).forEach(function (warning) { warnings.push(warning); });
    }, render:render,
    authoring:{
      initialFields:true, transientFields:['columns','fields','fieldWidth','highlights'],
      template:{title:'Data contract',fieldWidth:180,
        columns:[{id:'type',label:'Type',width:110},{id:'required',label:'Required',width:90},{id:'example',label:'Example',width:180},{id:'notes',label:'Notes',width:240}],
        fields:[{id:'order-id',label:'order_id',cells:{type:'string',required:'Yes',example:'ord_2048',notes:'Unique order identifier'}},
          {id:'status',label:'status',cells:{type:'enum',required:'Yes',example:'pending',notes:'pending | confirmed | cancelled'}},
          {id:'customer-id',label:'customer_id',cells:{type:'string',required:'No',example:'cus_1024',notes:'Present for registered customers'}}],
        initial:{highlights:{}}},
      setupFields:[['columns','jsonArr'],['fields','jsonArr'],['fieldWidth','num'],['initial','json']],
      patchFields:[['columns','jsonArr'],['fields','jsonArr'],['fieldWidth','num'],['highlights','json'],['note','text']],
      fieldMeta:{
        columns:{label:'Columns',group:'Content',help:'Add, rename, reorder or remove custom columns. Set columns and widths for this step or inherit the previous values. Blank widths use 160 px. Up to 12 custom columns.'},
        fields:{label:'Fields',group:'Content',help:'One contract field per row. Field and column names can change without losing highlights or values. Edit every cell for this step or inherit the previous rows. Up to 64 fields.'},
        fieldWidth:{label:'Field name width (px)',group:'Layout'},
        highlights:{label:'Field highlights',help:'Choose colors and optional labels for the fields to emphasize. Inherit previous keeps earlier highlights; Clear all highlights removes them. Use This step only for temporary emphasis.'},
        note:{label:'Explanation'}
      },
      editor:editor,
      picker:{order:0.5,name:'Data contract',category:'Software & data',tagline:'Fields, meaning, and emphasis',
        description:'Describe a data contract with field rows and custom columns, then highlight selected fields with colors as the story advances.'},
      example:function (sample) {
        sample.state.highlights={'order-id':{color:'blue',label:'Primary key'},status:{color:'amber',label:'Changes here'}};
        sample.panel.initial = builderClone(sample.state); return sample;
      }
    },
    styles:String.raw`.dcontract-scroll{overflow:auto;max-height:480px;border:1px solid color-mix(in srgb,var(--dtext) 20%,transparent);border-radius:8px;}
.dcontract-scroll:focus-visible{outline:2px solid var(--dink);outline-offset:2px;}
.dcontract-table{min-width:100%;table-layout:fixed;border-collapse:collapse;text-align:left;font:12px/1.5 'IBM Plex Mono',monospace;color:var(--dtext);}
.dcontract-table th,.dcontract-table td{padding:10px 12px;border-bottom:1px solid color-mix(in srgb,var(--dtext) 14%,transparent);vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;}
.dcontract-table thead th{font:600 10px/1.5 'IBM Plex Mono',monospace;color:var(--dfaint);text-transform:uppercase;letter-spacing:.05em;background:color-mix(in srgb,var(--dtext) 4%,transparent);}
.dcontract-table tbody th{font-weight:600;color:var(--dink);}
.dcontract-table tr:last-child>*{border-bottom:0;}
.dcontract-highlight>*{background:color-mix(in srgb,var(--contract-highlight) 14%,transparent);}
.dcontract-highlight>th{box-shadow:inset 4px 0 var(--contract-highlight);}
.dcontract-reason{display:block;margin-top:5px;font:500 10px/1.4 'IBM Plex Sans',sans-serif;}
.dcontract-missing,.dcontract-empty{color:var(--dfaint);}
.dcontract-caption{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
@media print{.dcontract-scroll{max-height:none;overflow:visible}.dcontract-highlight>*{print-color-adjust:exact}}`,
    editorStyles:'.dcontract-highlights{display:grid;gap:8px;}.dcontract-color-controls{display:flex;gap:6px;min-width:0;}.dcontract-color-controls input[type=color]{flex:none;width:38px;padding:3px;}'
  });
})();

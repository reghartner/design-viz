/* ---------------- panel setup fields ----------------
   One row of typed controls per setup field of each widget type.
   Kinds: text | num | csv (comma-separated string list) | scene (token
   select) | json (an object, edited as JSON) | jsonArr (an array,
   edited as JSON). Structural fields stay JSON-in-place — their shapes
   differ too much per widget for typed sub-forms — but every declared
   field is exposed. tests assert the table covers exactly the engine's
   PANEL_TYPES and every key the insert palette's starter templates
   carry. */

/* Setup-field control kinds:
   text / num / csv / scene keep their original meaning; json / jsonArr /
   jsonAny are raw textareas. New typed kinds (each still offers a raw-JSON
   fallback in the form):
     clock — duration string validated by the bundle's parseClock when present
     map   — {key: value} object edited as key/value rows (colors, tags)
     rows  — array of objects edited as one input row per item; the shape
             (third tuple element) lists cols [{k, kind?, req?, options?}]
             and an optional max; unknown keys on existing items survive edits
     objf  — one fixed-shape object edited inline (timeline cadence) */
var PANEL_SETUP_FIELDS = panelAuthoringMap('setupFields');

/* Dynamic-key types are expanded from their declarations by panelPatchFields. */
var PANEL_PATCH_FIELDS = panelAuthoringMap('patchFields');

function patchSummaryLine(patchObj){
  var keys = Object.keys(patchObj || {}).slice(0, 2);
  if (!keys.length) return 'empty patch';
  return keys.map(function(key){
    var value = patchObj[key];
    var compact = Array.isArray(value) ? '[' + value.length + ' items]' :
      value !== null && typeof value === 'object' ? '{…}' : String(value);
    return key + ' → ' + compact;
  }).join(' · ');
}

function panelPatchFields(decl){
  var authoring=decl && panelAuthoring(decl.type), fields=authoring && authoring.patchFields;
  if (!authoring || fields === undefined) return null;
  return authoring.expandPatchFields ? authoring.expandPatchFields(decl) : fields;
}

/* Collect only the supplied fields. Blank values omit keys; callers merge
   at the patch level, but dynamic tile/link objects replace wholesale. */
function patchFieldsCollect(fields, values){
  var item = Object.create(null);
  for (var i = 0; i < fields.length; i++){
    var f = fields[i], key = f[0], kind = f[1], extra = f[2];
    var raw = !Object.prototype.hasOwnProperty.call(values, key) || values[key] == null ? '' : String(values[key]);
    if (kind !== 'enum') raw = raw.trim();
    if (raw === '') continue;
    var value = raw;
    if (kind === 'num'){
      value = Number(raw);
      if (!isFinite(value)) return {error: key + ': "' + raw + '" is not a number'};
      if (extra && (value < extra.min || value > extra.max))
        return {error: key + ': use a number from ' + extra.min + ' to ' + extra.max};
    } else if (kind === 'bool'){
      if (raw !== 'true' && raw !== 'false') return {error: key + ': use true or false'};
      /* the validator accepts only literal true for phone clear — false is
         an always-warned no-op, so the form refuses to write it */
      if (extra && extra.trueOnly && raw === 'false')
        return {error: key + ': only true (or unset) — false is ignored by the renderer'};
      value = raw === 'true';
    } else if (kind === 'clock' && builderClockInvalid(raw)){
      return {error: key + ': "' + raw + '" is not ' + BUILDER_CLOCK_HINT};
    } else if (kind === 'json' || kind === 'jsonArr' || kind === 'jsonAny'){
      try { value = JSON.parse(raw); }
      catch (ex){ return {error: key + ': not valid JSON (' + ex.message + ')'}; }
      if (kind === 'jsonArr' && !Array.isArray(value)) return {error: key + ' is a JSON array — [ ... ]'};
      if (kind === 'json' && !(value === null && extra && extra.nullable) &&
          (!value || typeof value !== 'object' || Array.isArray(value)))
        return {error: key + ' is a JSON object' + (extra && extra.nullable ? ' or null' : '') + ' — { ... }'};
    }
    item[key] = value;
  }
  return {item: item};
}

/* parseClock rides in the same bundle (validator.js); the vm-loaded test
   copy of this file has no validator, so capture defensively. */
var BUILDER_CLOCK_PARSE = typeof parseClock === 'function' ? parseClock : null;

var BUILDER_CLOCK_HINT = 'a duration like 90s, 5m, 2h30m';

function builderClockInvalid(text){
  return !!(BUILDER_CLOCK_PARSE && typeof text === 'string' && text.trim() !== '' &&
            BUILDER_CLOCK_PARSE(text) == null);
}

/* Merge one edited row into its original item: edited cols overwrite or
   delete keys; keys the editor does not know about survive untouched. */
function builderRowMerge(shape, base, values){
  var item = {};
  Object.keys(base || {}).forEach(function(k){ item[k] = base[k]; });
  var error = null;
  (shape.cols || []).forEach(function(col){
    if (error) return;
    var raw = values && typeof values[col.k] === 'string' ? values[col.k].trim() : '';
    if (raw === ''){
      if (col.req){ error = col.k + ' is required'; return; }
      delete item[col.k];
      return;
    }
    if (col.kind === 'num'){
      var num = Number(raw);
      if (!isFinite(num)){ error = col.k + ': "' + raw + '" is not a number'; return; }
      item[col.k] = num;
      return;
    }
    if (col.kind === 'clock' && builderClockInvalid(raw)){
      error = col.k + ': "' + raw + '" is not ' + BUILDER_CLOCK_HINT; return;
    }
    /* an unknown enum value already ON the item passes through unchanged —
       editing a sibling column must never delete or reject it */
    var options = col.kind === 'icon' ? ICON_SET : (col.options || []);
    if ((col.kind === 'enum' || col.kind === 'icon') && options.indexOf(raw) < 0 &&
        !(base && base[col.k] === raw)){
      error = col.k + ': "' + raw + '" is not one of ' + options.join(' | '); return;
    }
    item[col.k] = raw;
  });
  return error ? {error: error} : {item: item};
}

/* rows: [{base: originalItem|null, values: {colKey: rawString}}] in display
   order. Fully-empty NEW rows are dropped; empty EXISTING rows are kept and
   fail their required columns (deleting is the ✕ button's job, not blanking). */
function rowsEditorCollect(shape, rows){
  var items = [];
  for (var i = 0; i < (rows || []).length; i++){
    var row = rows[i];
    var blank = (shape.cols || []).every(function(col){
      var raw = row.values && typeof row.values[col.k] === 'string' ? row.values[col.k].trim() : '';
      return raw === '';
    });
    if (blank && !row.base) continue;
    var merged = builderRowMerge(shape, row.base, row.values);
    if (merged.error) return {error: 'item ' + (i + 1) + ': ' + merged.error};
    items.push(merged.item);
  }
  if (shape.max && items.length > shape.max)
    return {error: 'at most ' + shape.max + ' items (' + items.length + ' given)'};
  return {items: items};
}

/* pairs: [{key: rawString, value: rawString}] -> plain object or null when
   nothing is left. Blank keys drop the pair; duplicate keys are an error. */
function mapEditorCollect(pairs){
  var obj = {}, count = 0;
  for (var i = 0; i < (pairs || []).length; i++){
    var key = typeof pairs[i].key === 'string' ? pairs[i].key.trim() : '';
    var value = typeof pairs[i].value === 'string' ? pairs[i].value.trim() : '';
    if (key === '') continue;
    if (Object.prototype.hasOwnProperty.call(obj, key))
      return {error: 'duplicate key "' + key + '"'};
    if (value === '') continue;
    obj[key] = value;
    count++;
  }
  return {obj: count ? obj : null};
}

/* one fixed-shape object (timeline cadence): all-empty means remove the
   field entirely; otherwise the same column rules as rows apply. */
function objFieldsCollect(shape, base, values){
  var blank = (shape.cols || []).every(function(col){
    var raw = values && typeof values[col.k] === 'string' ? values[col.k].trim() : '';
    return raw === '';
  });
  if (blank) return {obj: null};
  var merged = builderRowMerge(shape, base, values);
  return merged.error ? {error: merged.error} : {obj: merged.item};
}

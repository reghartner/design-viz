/* Pure normalization and document identities. Source paths are relative to
   the normalized page; canonical references come from core/navigation.js. */

function normalize(raw){
  if (!specObject(raw)) return null;
  if (Object.prototype.hasOwnProperty.call(raw, 'page')) return raw.page;
  if (Object.prototype.hasOwnProperty.call(raw, 'blocks') || Object.prototype.hasOwnProperty.call(raw, 'sections')) return raw;
  if (Object.prototype.hasOwnProperty.call(raw, 'nodes') && Object.prototype.hasOwnProperty.call(raw, 'rows')) return {title:'', sections:[{diagram: raw}]};
  return null;
}

function specObject(value){
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function blocksOf(page){
  if (!specObject(page)) return [];
  var raw = page.blocks || page.sections || [];
  var pfx = page.blocks ? 'blocks' : 'sections';
  var out = [];
  (Array.isArray(raw) ? raw : []).forEach(function(b, i){
    if (b && Array.isArray(b.tabs)){
      out.push({type:'tabs', path:pfx + '[' + i + ']', tabs:b.tabs.map(function(t, j){
        return {label:(t && t.label) || ('Tab ' + (j + 1)),
                highlight:(t && t.highlight != null) ? t.highlight : undefined,
                sections:(t && Array.isArray(t.sections)) ? t.sections : [],
                path:pfx + '[' + i + '].tabs[' + j + ']'};
      })});
    } else {
      out.push({type:'section', sec:b, path:pfx + '[' + i + ']'});
    }
  });
  return out;
}

/* Every section counts, including prose and inactive tabs. Keep raw source
   block indices separate from one-based rendered numbers and tab-block routes.
   Canon's diagram-only evidence indices and the editor's raw JSON paths are
   separate contracts; neither is replaced by this viewer traversal. */
function sectionRecords(page){
  var out = [], tabBlock = 0;
  blocksOf(page).forEach(function(block, blockIndex){
    function add(section, path, tab, tabLabel){
      out.push({section:section, path:path, blockIndex:blockIndex,
        number:out.length + 1, tabBlock:tab == null ? null : tabBlock,
        tab:tab, tabLabel:tabLabel});
    }
    if (block.type === 'section') add(block.sec, block.path, null, null);
    else {
      tabBlock++;
      block.tabs.forEach(function(tab, tabIndex){
        tab.sections.forEach(function(section, index){
          add(section, tab.path + '.sections[' + index + ']', tabIndex, tab.label);
        });
      });
    }
  });
  var references = sectionReferences(out.map(function(record){return record.section && record.section.heading;}));
  out.forEach(function(record, index){
    var id=record.section && record.section.id;
    record.reference=typeof id==='string' && id.trim() ? id : references[index];
    if(record.reference!==references[index])record.aliases=[references[index]];
  });
  return out;
}

/* Optional discovery metadata shown on library cards and matched by search.
   `at` prefixes each finding: the spec path in validation, the field label in
   Document settings. */
var DOCUMENT_DESCRIPTION_MAX = 200, DOCUMENT_TAGS_MAX = 12, DOCUMENT_TAG_MAX = 32;
function validateDocumentDescription(value, at, errors){
  if (value == null) return;
  if (typeof value !== 'string') errors.push(at + ': expected one line of text');
  else if (!value.trim()) errors.push(at + ': must not be empty — remove it instead');
  else if (/[\r\n]/.test(value)) errors.push(at + ': must be one line (no line breaks)');
  else if (value.length > DOCUMENT_DESCRIPTION_MAX) errors.push(at + ': must be ' + DOCUMENT_DESCRIPTION_MAX + ' characters or fewer (found ' + value.length + ')');
}
function validateDocumentTags(value, at, errors){
  if (value == null) return;
  if (!Array.isArray(value)){ errors.push(at + ': expected a list of tags such as ["payments", "onboarding"]'); return; }
  if (value.length > DOCUMENT_TAGS_MAX){ errors.push(at + ': use at most ' + DOCUMENT_TAGS_MAX + ' tags (found ' + value.length + ')'); return; }
  var seen = Object.create(null);
  value.forEach(function(tag, i){
    var path = at + '[' + i + ']';
    if (typeof tag !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag))
      errors.push(path + ': ' + JSON.stringify(tag) + ' — use a short lowercase tag: letters, numbers and single hyphens');
    else if (tag.length > DOCUMENT_TAG_MAX) errors.push(path + ': "' + tag + '" — tags must be ' + DOCUMENT_TAG_MAX + ' characters or fewer');
    else if (seen[tag]) errors.push(path + ': duplicate tag "' + tag + '"');
    else seen[tag] = true;
  });
}

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
  out.forEach(function(record, index){ record.reference = references[index]; });
  return out;
}

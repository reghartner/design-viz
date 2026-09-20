/* Pure page/section/tab commands. Preserve raw source block/list addresses
   and rendered section ordinals; common commands supply clone/rewrite. */

var BUILDER_SECTION_TEMPLATE = [
  '{',
  '  "heading": "New section",',
  '  "accent": "cyan",',
  '  "text": ["What this flow does, in one or two sentences."],',
  '  "diagram": {',
  '    "nodes": {',
  '      "svc1": {"title": "Service A", "sub": "does a thing", "icon": "gear", "tint": "cmd"},',
  '      "svc2": {"title": "Service B", "sub": "stores it", "icon": "db", "tint": "data"}',
  '    },',
  '    "rows": [["svc1", "svc2"]],',
  '    "edges": [{"from": "svc1", "to": "svc2", "kind": "int", "label": "call"}],',
  '    "steps": [{"edge": "svc1->svc2", "text": "Service A calls Service B"}]',
  '  }',
  '}'
].join('\n');
function planAddSection(text, raw){
  var base, page;
  if (raw && raw.page){ page = raw.page; base = ['page']; }
  else if (raw && (raw.blocks || raw.sections)){ page = raw; base = []; }
  else if (raw && raw.nodes && raw.rows)
    return {error: 'this spec is a bare diagram — wrap it as {"page": {"blocks": [ {...} ]}} to hold more than one section'};
  else return {error: 'no page to add a section to'};
  var key = page.blocks ? 'blocks' : 'sections';
  if (!jsonLocate(text, base.concat([key])))
    return {error: 'could not find the ' + key + ' list in the editor text'};
  var r = jsonInsertMember(text, base.concat([key]), null, BUILDER_SECTION_TEMPLATE);
  if (!r) return {error: 'could not edit the ' + key + ' list in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'section',
          index: specSectionPaths(raw).length};
}

function planDeleteSection(text, raw, sectionIdx){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'no such section'};
  if (!rec.section.length)
    return {error: 'this spec is one bare diagram — clear the editor instead of deleting'};
  var parentPath = rec.section.slice(0, -1);
  var key = rec.section[rec.section.length - 1];
  var r = jsonRemoveMember(text, parentPath, key);
  if (!r) return {error: 'could not edit the editor text'};
  return r;
}

function planDuplicateSection(text, raw, sectionIdx){
  /* Deep-copy a section directly after the original; the copy renders as
     the next section ordinal (render order is depth-first list order). */
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'no such section'};
  if (!rec.section.length)
    return {error: 'this spec is one bare diagram \u2014 wrap it as {"page": {"blocks": [ ... ]}} first'};
  var clone = builderClone(specValueAt(raw, rec.section));
  if (clone && typeof clone.heading === 'string') clone.heading += ' (copy)';
  var parentPath = rec.section.slice(0, -1);
  var idx = rec.section[rec.section.length - 1];
  var r = jsonInsertArrayItemAfter(text, parentPath, idx, JSON.stringify(clone, null, 2));
  if (!r) return {error: 'could not edit the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'section', index: sectionIdx + 1};
}

/* ---------------- tab management ----------------
   Tabs are addressed by BLOCK index (the position in the page's
   blocks/sections list — the same index the engine bakes into each tab
   button's id "tab-<block>-<tab>") plus the tab index inside that
   block's tabs list. */

var BUILDER_TAB_TEMPLATE = [
  '{',
  '  "label": "New tab",',
  '  "sections": [' + BUILDER_SECTION_TEMPLATE.split('\n').join('\n  ') + ']',
  '}'
].join('\n');

/* a whole tabs container: two tabs, one starter section each — the
   "+ tab" button on a selected tab grows it from there */
var BUILDER_TABS_TEMPLATE = [
  '{',
  '  "tabs": [',
  '    ' + BUILDER_TAB_TEMPLATE.replace('"New tab"', '"Tab one"').split('\n').join('\n    ') + ',',
  '    ' + BUILDER_TAB_TEMPLATE.replace('"New tab"', '"Tab two"').split('\n').join('\n    '),
  '  ]',
  '}'
].join('\n');

function planAddTabs(text, raw){
  /* append a tabs container to the page's block list — same shape rules
     as planAddSection */
  var base, page;
  if (raw && raw.page){ page = raw.page; base = ['page']; }
  else if (raw && (raw.blocks || raw.sections)){ page = raw; base = []; }
  else if (raw && raw.nodes && raw.rows)
    return {error: 'this spec is a bare diagram — wrap it as {"page": {"blocks": [ {...} ]}} to hold tabs'};
  else return {error: 'no page to add tabs to'};
  var key = page.blocks ? 'blocks' : 'sections';
  if (!jsonLocate(text, base.concat([key])))
    return {error: 'could not find the ' + key + ' list in the editor text'};
  var r = jsonInsertMember(text, base.concat([key]), null, BUILDER_TABS_TEMPLATE);
  if (!r) return {error: 'could not edit the ' + key + ' list in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'tabs',
          block: (page[key] || []).length,
          index: specSectionPaths(raw).length};
}

function planAddTab(text, raw, blockIdx, afterIdx){
  /* insert a renderable tab (one starter section) directly after the
     tab the operator is looking at */
  var path = builderTabPath(raw, blockIdx, afterIdx);
  if (!path) return {error: 'tab not found — reselect and try again'};
  var tabsPath = path.slice(0, -1);
  var r = jsonInsertArrayItemAfter(text, tabsPath, afterIdx, BUILDER_TAB_TEMPLATE);
  if (!r) return {error: 'could not edit the tabs list in the editor text'};
  return {text: r.text, start: r.start, end: r.end, kind: 'tab',
          block: blockIdx, index: afterIdx + 1};
}

function planDeleteTab(text, raw, blockIdx, tabIdx){
  var path = builderTabPath(raw, blockIdx, tabIdx);
  if (!path) return {error: 'tab not found — reselect and try again'};
  var tabsPath = path.slice(0, -1);
  var tabs = specValueAt(raw, tabsPath);
  if (Array.isArray(tabs) && tabs.length === 1)
    return {error: 'this is the block\u2019s last tab — delete its sections instead, or remove the whole tabs block in the JSON'};
  var r = jsonRemoveMember(text, tabsPath, tabIdx);
  if (!r) return {error: 'could not edit the tabs list in the editor text'};
  return r;
}

function planMoveTab(text, raw, blockIdx, tabIdx, delta){
  var path = builderTabPath(raw, blockIdx, tabIdx);
  if (!path) return {error: 'tab not found — reselect and try again'};
  var tabsPath = path.slice(0, -1);
  var tabs = specValueAt(raw, tabsPath);
  var to = tabIdx + delta;
  if (to < 0 || to >= tabs.length) return {error: 'already at that end'};
  var r = builderRewrite(text, raw, tabsPath, function(copy){
    var item = copy.splice(tabIdx, 1)[0];
    copy.splice(to, 0, item);
  });
  if (r.error) return r;
  r.kind = 'tab'; r.block = blockIdx; r.index = to;
  return r;
}

/* move a section one slot within ITS OWN list (the top-level blocks list,
   or its tab's sections list). A neighbor blocks-list entry may be a tabs
   container — the move hops over it whole. Returns newPath (the section's
   list slot after the move); the caller recomputes the flat ordinal from
   it, because hopping a tabs container shifts ordinals by its section
   count. */
function planMoveSection(text, raw, sectionIdx, delta){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'section not found — reselect and try again'};
  var spath = rec.section;
  if (!spath.length) return {error: 'a bare-diagram page has only one section'};
  var listPath = spath.slice(0, -1);
  var idx = spath[spath.length - 1];
  var list = specValueAt(raw, listPath);
  if (!Array.isArray(list)) return {error: 'section list not found in the editor text'};
  var to = idx + delta;
  if (to < 0) return {error: 'already first in its list'};
  if (to >= list.length) return {error: 'already last in its list'};
  var swap = jsonSwapListItems(text, listPath, idx, to);
  if (!swap) return {error: 'could not locate both sections in the editor text'};
  var span = delta < 0 ? swap.first : swap.second;
  return {text: swap.text, start: span.start, end: span.end,
          kind: 'section', newPath: listPath.concat([to])};
}

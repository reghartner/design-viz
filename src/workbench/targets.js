/* Raw authored-document addressing. These paths retain page wrappers and
   bare diagrams; they are not normalized viewer section-record paths.
   builderDiagram() uses jsonLocate() from source-edit.js at call time. */

/* ---------------- spec shape walking ----------------
   Mirrors normalize() + blocksOf(): the raw editor JSON may be
   {page:{blocks|sections}}, a bare {blocks|sections} page, or a bare
   diagram ({nodes, rows}). One entry per rendered section, in render
   order — the same order buildSection assigns gi. */

function specSectionPaths(raw){
  var base, page;
  if (raw && raw.page){ page = raw.page; base = ['page']; }
  else if (raw && (raw.blocks || raw.sections)){ page = raw; base = []; }
  else if (raw && raw.nodes && raw.rows) return [{section: [], diagram: []}];
  else return [];
  var key = page.blocks ? 'blocks' : 'sections';
  var out = [];
  (page[key] || []).forEach(function(b, i){
    if (b && Array.isArray(b.tabs)){
      b.tabs.forEach(function(t, j){
        ((t && Array.isArray(t.sections)) ? t.sections : []).forEach(function(sec, k){
          out.push({section: base.concat([key, i, 'tabs', j, 'sections', k])});
        });
      });
    } else out.push({section: base.concat([key, i])});
  });
  out.forEach(function(rec){ rec.diagram = rec.section.concat(['diagram']); });
  return out;
}
function specValueAt(raw, path){
  var v = raw;
  for (var i = 0; i < path.length && v != null; i++) v = v[path[i]];
  return v;
}

function builderTargetPath(raw, target){
  /* target: {section:<zero-based ordinal>, kind, id?, index?} → path array
     into the raw editor JSON, or null. Tabs address by block index
     instead of section ordinal. */
  if (target.kind === 'tab') return builderTabPath(raw, target.block, target.tab);
  var rec = specSectionPaths(raw)[target.section];
  if (!rec) return null;
  if (target.kind === 'section') return rec.section;
  var d = rec.diagram;
  if (target.kind === 'node') return d.concat(['nodes', target.id]);
  if (target.kind === 'group'){
    var groups = specValueAt(raw, d.concat(['groups']));
    return groups && Object.prototype.hasOwnProperty.call(groups, target.id)
      ? d.concat(['groups', target.id]) : null;
  }
  if (target.kind === 'edge') return d.concat(['edges', target.index]);
  if (target.kind === 'step') return d.concat(['steps', target.index]);
  if (target.kind === 'panel') return d.concat(['panels', target.index]);
  if (target.kind === 'bullet') return rec.section.concat(['bullets', target.index]);
  if (target.kind === 'para'){
    var sec = specValueAt(raw, rec.section);
    if (sec && typeof sec.text === 'string') return rec.section.concat(['text']);
    return rec.section.concat(['text', target.index]);
  }
  if (target.kind === 'crow') return rec.section.concat(['contract', 'fields', target.index]);
  return null;
}

function builderPathString(path){
  return path.length ? path.map(function(seg, i){
    if (typeof seg === 'number') return '[' + seg + ']';
    return (i ? '.' : '') + (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(seg) ? seg : JSON.stringify(seg));
  }).join('') : '(whole document)';
}

function builderDiagram(text, raw, sectionIdx){
  var rec = specSectionPaths(raw)[sectionIdx];
  if (!rec) return {error: 'no section to insert into — click a section first'};
  if (!jsonLocate(text, rec.diagram))
    return {error: 'this section has no diagram yet — add "diagram": {"nodes": {...}, "rows": [[...]]} inside it first'};
  return {path: rec.diagram, d: specValueAt(raw, rec.diagram)};
}

function builderTabPath(raw, blockIdx, tabIdx){
  var base, page;
  if (raw && raw.page){ page = raw.page; base = ['page']; }
  else if (raw && (raw.blocks || raw.sections)){ page = raw; base = []; }
  else return null;
  var key = page.blocks ? 'blocks' : 'sections';
  var block = (page[key] || [])[blockIdx];
  if (!block || !Array.isArray(block.tabs) || !block.tabs[tabIdx]) return null;
  return base.concat([key, blockIdx, 'tabs', tabIdx]);
}

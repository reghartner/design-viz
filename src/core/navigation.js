/* Pure document references and hash navigation. No viewer initialization;
   only link-base canonicalization needs the standard URL constructor. */

/* ---------------- deep-link hash (C2/E3, pure core) ---------------- */
function slugify(s){
  var out = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || 'tab';
}
function sectionSlugify(s){
  var out = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!out) out = 'section';
  /* Purely numeric slugs would be indistinguishable from the accepted legacy
     rendered-section index, so keep the two namespaces disjoint. */
  if (/^\d+$/.test(out)) out = 'section-' + out;
  return out;
}
function sectionReferences(headings){
  var used = {};
  return (Array.isArray(headings) ? headings : []).map(function(heading, index){
    /* Heading-less sections retain their rendered index as the canonical
       fallback. Heading references are unique document-wide. */
    if (typeof heading !== 'string' || !heading.trim()){
      var positional = String(index + 1);
      used[positional] = true;
      return positional;
    }
    var base = sectionSlugify(heading), ref = base, suffix = 2;
    while (used[ref]) ref = base + '-' + suffix++;
    used[ref] = true;
    return ref;
  });
}
function parseHash(h){
  var kv = {};
  String(h || '').replace(/^#/, '').split('&').forEach(function(part){
    var i = part.indexOf('=');
    if (i > 0){
      try { kv[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1)); }
      catch (ex) { /* malformed escape: ignore that pair */ }
    }
  });
  var result = {b: kv.b != null ? kv.b : null,
          t: kv.t != null ? kv.t : null,
          d: kv.d != null ? kv.d : null,
          c: kv.c != null ? kv.c : null,
          r: kv.r != null ? kv.r : null,
          s: kv.s != null ? kv.s : null,
          x: kv.x != null ? kv.x : null,
          e: kv.e != null ? kv.e : null,
          m: (kv.m === 'step' || kv.m === 'ambient') ? kv.m : null};
  if (kv.ct != null) result.ct=kv.ct;
  if (kv.p != null) result.p = kv.p;
  if (kv.v != null) result.v = kv.v;
  if (kv.q != null) result.q = kv.q;
  return result;
}
function encodeSectionRefList(value){
  return String(value == null ? '' : value).split(',').map(function(ref){
    return encodeURIComponent(ref);
  }).join(',');
}
function buildHash(st){
  var parts = [];
  if (st && st.b != null) parts.push('b=' + encodeURIComponent(st.b));
  if (st && st.t != null) parts.push('t=' + encodeURIComponent(st.t));
  if (st && st.d != null) parts.push('d=' + encodeURIComponent(st.d));
  if (st && st.v != null) parts.push('v=' + encodeURIComponent(st.v));
  if (st && st.m) parts.push('m=' + st.m);
  if (st && st.p != null) parts.push('p=' + encodeURIComponent(st.p));
  if (st && st.s != null) parts.push('s=' + encodeURIComponent(st.s));
  if (st && st.q != null) parts.push('q=' + encodeURIComponent(st.q));
  if (st && st.c != null) parts.push('c=' + encodeURIComponent(st.c));
  if (st && st.ct != null) parts.push('ct=' + encodeURIComponent(st.ct));
  if (st && st.r != null) parts.push('r=' + encodeURIComponent(st.r));
  if (st && st.x != null) parts.push('x=' + encodeSectionRefList(st.x));
  if (st && st.e != null) parts.push('e=' + encodeSectionRefList(st.e));
  return parts.length ? '#' + parts.join('&') : '';
}
function canonicalLinkBase(base){
  if (typeof base !== 'string' || /[\s"]/.test(base)) return null;
  try {
    var parsed = new URL(base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    var href = parsed.href;
    /* Keep the serialized value safe to embed in copied text even if URL
       parsing behavior changes or a non-special URL slips through later. */
    return /[\s"]/.test(href) ? null : href;
  } catch (ex) { return null; }
}
function isValidLinkBase(base){
  return canonicalLinkBase(base) !== null;
}
function composeLinkURL(base, hash){
  var params = String(hash || '').replace(/^#/, '');
  if (!params) return base;
  var tail = base.charAt(base.length - 1);
  return base + (tail === '&' || tail === '#' ? '' :
    (base.indexOf('#') >= 0 ? '&' : '#')) + params;
}
function oneBasedIndex(ref, count){
  if (ref == null || !/^\d+$/.test(String(ref))) return -1;
  var n = parseInt(String(ref), 10) - 1;
  return n >= 0 && n < count ? n : -1;
}
function tabIndexOf(ref, slugs, count){
  if (ref == null) return -1;
  var n = slugs.indexOf(String(ref));
  return n >= 0 ? n : oneBasedIndex(ref, count);
}
function tabReference(slugs, index){
  var slug = slugs[index];
  if (slug != null && slugs.indexOf(slug) === index) return slug;
  var ref = String(index + 1);
  while (slugs.indexOf(ref) >= 0) ref = '0' + ref;
  return ref;
}
function stepIndexOf(stepIds, ref){
  if (ref == null) return -1;
  var str = String(ref);
  for (var i = 0; i < stepIds.length; i++) if (stepIds[i] === str) return i;
  return oneBasedIndex(str, stepIds.length);
}
function stepReference(stepIds, index){
  var id = stepIds[index];
  if (typeof id === 'string' && id && stepIds.indexOf(id) === index &&
      stepIds.lastIndexOf(id) === index) return id;
  var ref = String(index + 1);
  while (stepIds.indexOf(ref) >= 0) ref = '0' + ref;
  return ref;
}

/* Resolve a parsed fragment against a DOM-free page manifest. Canonical links
   use the unique heading-derived section reference for d/c, falling back to a
   rendered section number only when the section has no heading. Numeric d/c
   references remain accepted as legacy rendered indices. Direct diagram and
   contract targets are resolved independently so their state can compose. */
function resolveHashTarget(st, manifest){
  st = st || {};
  manifest = manifest || {};
  var tabs = Array.isArray(manifest.tabBlocks) ? manifest.tabBlocks : [];
  var sections = Array.isArray(manifest.sections) ? manifest.sections : [];
  function sectionAt(ref){
    if (ref == null) return null;
    var key = String(ref), i;
    for (i = 0; i < sections.length; i++)
      if (sections[i].reference != null && String(sections[i].reference) === key)
        return sections[i];
    for(i=0;i<sections.length;i++)if(sections[i].aliases && sections[i].aliases.indexOf(key)>=0)return sections[i];
    var n = oneBasedIndex(key, sections.length);
    if (n < 0) return null;
    for (i = 0; i < sections.length; i++)
      if (sections[i].number === n + 1) return sections[i];
    return null;
  }
  function route(sec, out){
    if (sec && sec.tabBlock != null){
      out.tabBlock = sec.tabBlock;
      out.tab = sec.tab;
    }
    return out;
  }
  function diagram(sec, legacy){
    if (!sec || (!Array.isArray(sec.stepIds) && !sec.hasDiagram)) return {kind:'invalid'};
    var mode = (st.m === 'step' || st.s != null) ? 'step' :
               (st.m === 'ambient' ? 'ambient' : null);
    if(!Array.isArray(sec.stepIds))mode=null;
    var step = mode === 'step' ? (st.s != null ? stepIndexOf(sec.stepIds, st.s) : 0) : null;
    return route(sec, {kind:'diagram', section:sec.number, mode:mode,
                       step:step, legacy:!!legacy, tabBlock:null, tab:null});
  }

  var block = null, blockIndex = st.b != null ? oneBasedIndex(st.b, tabs.length) :
                   (tabs.length ? 0 : -1);
  if (blockIndex >= 0) block = tabs[blockIndex];
  var ti = block ? tabIndexOf(st.t, block.slugs || [], block.count || 0) : -1;
  if (st.t != null && (!block || ti < 0)) return {kind:'invalid'};

  var diagramTarget = null;
  if (st.d != null){
    diagramTarget = diagram(sectionAt(st.d), false);
    if (diagramTarget.kind === 'invalid') return diagramTarget;
  } else if (st.m === 'step' || st.m === 'ambient' || st.s != null || st.v != null){
    var legacySec = null;
    if (block){
      var activeTab = ti >= 0 ? ti : 0;
      for (var j = 0; j < sections.length; j++){
        if (sections[j].tabBlock === block.index && sections[j].tab === activeTab &&
            (Array.isArray(sections[j].stepIds) || st.v != null && sections[j].hasDiagram)){ legacySec = sections[j]; break; }
      }
    } else {
      for (var k = 0; k < sections.length; k++){
        if (Array.isArray(sections[k].stepIds) || st.v != null && sections[k].hasDiagram){ legacySec = sections[k]; break; }
      }
    }
    diagramTarget = diagram(legacySec, true);
    if (diagramTarget.kind === 'invalid') return diagramTarget;
  }

  var cardTarget = null;
  if (st.c != null){
    var cardSec = sectionAt(st.c);
    if (!cardSec || !cardSec.hasCard) return {kind:'invalid'};
    var cards=cardSec.cards || [],cardIndex=0;
    if(st.ct!=null){
      cardIndex=cards.findIndex(function(card){return card.reference===String(st.ct);});
      if(cardIndex<0)return {kind:'invalid'};
    }
    var rowCount=cards[cardIndex]?cards[cardIndex].rowCount:cardSec.rowCount;
    var row = st.r != null ? oneBasedIndex(st.r, rowCount || 0) : null;
    if (row === -1) row = null; /* bad/out-of-range row ref degrades to the card */
    cardTarget = route(cardSec, {kind:row == null ? 'card' : 'row', section:cardSec.number,
                                 row:row, tabBlock:null, tab:null});
    if(st.ct!=null)cardTarget.cardIndex=cardIndex;
  }

  var tabTarget = block && ti >= 0 ? {kind:'tab', tabBlock:block.index, tab:ti} : null;
  /* The card/row is the most specific scroll and route target, followed by
     the diagram and then an explicitly addressed tab. The attached targets
     still all apply even though one supplies the top-level kind. */
  var primary = cardTarget || diagramTarget || tabTarget || {kind:'page'};
  var out = {};
  Object.keys(primary).forEach(function(key){ out[key] = primary[key]; });
  out.diagram = diagramTarget;
  out.card = cardTarget;
  out.explicitTab = tabTarget;
  return out;
}

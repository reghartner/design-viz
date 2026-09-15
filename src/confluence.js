/* Manual Confluence handoff. Shared by the workbench, Forge viewer and CLI.
   This is ordinary spec JSON, never HTML, ADF or a direct publishing request. */
var CONFLUENCE_MAX_BYTES = 128 * 1024; /* Our supported snapshot size, not a Forge platform quota. */
var CONFLUENCE_INPUT_BYTES = 2 * 1024 * 1024;
function confluenceByteLength(text){ return new TextEncoder().encode(text).length; }
function buildConfluenceExport(text){
  if (typeof text !== 'string' || !text.trim()) return {error:'Choose a JSON file or paste a page spec.'};
  if (confluenceByteLength(text) > CONFLUENCE_INPUT_BYTES) return {error:'Input is larger than 2 MiB. Export a smaller spec from the workbench.'};
  try {
    var raw = JSON.parse(text), page = normalize(raw);
    var result = validate(page);
    if (result.errors.length) return {error:result.errors.join('\n')};
    var compact = JSON.stringify(raw), bytes = confluenceByteLength(compact);
    if (bytes > CONFLUENCE_MAX_BYTES)
      return {error:'This spec is ' + Math.ceil(bytes / 1024) + ' KiB. Confluence snapshots currently support up to 128 KiB; split the story into smaller specs.'};
    var title = typeof page.title === 'string' ? page.title : '';
    var slug = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);
    return {text:compact, bytes:bytes, name:(slug || 'flowspec') + '.confluence.json', page:page, warnings:result.warnings};
  } catch (ex){ return {error:'Could not read the spec: ' + ex.message}; }
}
function confluenceSections(page){
  var out = [];
  blocksOf(page).forEach(function(block){
    function add(sec, tab){
      out.push({id:String(out.length + 1), label:(tab ? tab + ' / ' : '') + (sec.heading || 'Section ' + (out.length + 1)), section:sec});
    }
    if (block.type === 'section') add(block.sec);
    else block.tabs.forEach(function(tab){ tab.sections.forEach(function(sec){ add(sec,tab.label); }); });
  });
  return out;
}
function buildConfluenceConfig(text, values){
  var exported = buildConfluenceExport(text);
  if (exported.error) return exported;
  values = values || {};
  var section = values.section || 'all', focus = values.focus || 'spec', skin = values.skin || 'spec';
  if (section !== 'all' && !confluenceSections(exported.page).some(function(s){return s.id === section;}))
    return {error:'The selected section is missing. Choose a section from the imported spec.'};
  if (['spec','home','data'].indexOf(focus) < 0) return {error:'Choose a supported starting view.'};
  if (skin !== 'spec' && SKIN_NAMES.indexOf(skin) < 0) return {error:'Choose a supported skin.'};
  return {config:{specJson:exported.text, section:section, focus:focus, skin:skin}, exported:exported};
}
function confluenceDisplayPage(page, config){
  var display = JSON.parse(JSON.stringify(page));
  if (config.section !== 'all'){
    var selected = confluenceSections(display).find(function(s){return s.id === config.section;});
    if (!selected) throw new Error('The selected section no longer exists.');
    display.blocks = [selected.section]; delete display.sections;
  }
  confluenceSections(display).forEach(function(s){
    var d = s.section.diagram;
    if (!d) return;
    if (config.focus === 'data') delete d.primaryPanel;
    if (config.focus === 'home'){
      var homes = (d.panels || []).filter(function(p){return p.type === 'homemap';});
      var home = homes.find(function(p){return p.id === d.primaryPanel;}) || homes[0];
      if (home) d.primaryPanel = home.id;
    }
  });
  if (config.skin !== 'spec') display.skin = config.skin;
  return display;
}
function confluenceSourceUrl(href, siteUrl){
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    /* Relative repository files are not Confluence pages. Only resolve /wiki/ links. */
    if (!/^https?:\/\//i.test(href) && !/^\/wiki\//.test(href)) return null;
    var url = new URL(href, siteUrl);
    return ['https:','http:'].indexOf(url.protocol) >= 0 ? url.href : null;
  } catch (ex){ return null; }
}

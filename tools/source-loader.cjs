'use strict';
/* Build/test-time assembly only. Shipped runtimes contain the expanded source. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceRoot = path.join(__dirname, '../src');
function manifest(root) { return JSON.parse(fs.readFileSync(path.join(root, 'source-bundles.json'), 'utf8')); }
function sourceFiles(name, root = sourceRoot) {
  const config = manifest(root), entries = Object.hasOwn(config, name) ? config[name] : [name];
  if (!Array.isArray(entries)) throw new Error('Not a logical source bundle: ' + name);
  return entries.flatMap((entry) => {
    if (!entry.endsWith('/*.js')) return [entry];
    const directory = entry.slice(0, -5);
    const files = fs.readdirSync(path.join(root, directory)).filter(file => file.endsWith('.js')).sort();
    if (!files.length) throw new Error('Empty source glob: ' + entry);
    return files.map(file => directory + '/' + file);
  });
}
function sourceRecords(names, root = sourceRoot, substitute = true) {
  const files = names.flatMap(name => sourceFiles(name, root)), seen = new Set();
  return files.map(file => {
    if (seen.has(file)) throw new Error('Duplicate physical source: ' + file);
    seen.add(file);
    let source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n?/g, '\n').trimEnd();
    if (file === 'compatibility.js' && substitute) {
      const marker = '/* @panel-features */ {}';
      if (!source.includes(marker)) throw new Error('Missing panel feature marker: ' + file);
      const assets=panelAssets(root);
      source = source.replace(marker, JSON.stringify(assets.features));
      source = source.replace('/* @icon-ids */ []',JSON.stringify(assets.iconIds || []));
    }
    return {file, source};
  });
}
function formatSources(records) {
  return records.map(record => '/* ---- src/' + record.file + ' ---- */\n' + record.source).join('\n');
}
function readSource(name, root = sourceRoot) { return sourceRecords([name], root).map(record => record.source).join('\n'); }
function composeSources(names, root = sourceRoot) { return formatSources(sourceRecords(names, root)); }
function entrypoint(name, root = sourceRoot) {
  const config = manifest(root).entrypoints;
  if (!config || !Object.hasOwn(config, name)) throw new Error('Unknown source entrypoint: ' + name);
  const definition = config[name], records = sourceRecords(definition.sources, root);
  const body = formatSources(records), all = records.slice();
  if (definition.boot) all.push(...sourceRecords([definition.boot], root));
  if (new Set(all.map(record => record.file)).size !== all.length) throw new Error('Duplicate entrypoint source: ' + name);
  const exports = definition.exports || {}, identifiers = [...Object.values(exports), ...(definition.defaultExport ? [definition.defaultExport] : [])];
  if ([...Object.keys(exports), ...identifiers].some(value => !/^[A-Za-z_$][\w$]*$/.test(value)))
    throw new Error('Invalid export identifier: ' + name);
  if (identifiers.length) {
    // Export-bearing cores contain trusted definitions only. Verify the actual
    // bindings in an isolated build-time context; never run boot or spec data.
    const missing = vm.runInNewContext(body + '\n;[' + identifiers.map(value =>
      'typeof ' + value + "===\"undefined\"?" + JSON.stringify(value) + ':null').join(',') + '].filter(Boolean);',
      {URL, TextEncoder}, {timeout:5000});
    if (missing.length) throw new Error('Missing entrypoint export: ' + name + ': ' + missing.join(', '));
  }
  return {name, records:all, body, source:formatSources(all), exports, defaultExport:definition.defaultExport || null,
    styles:definition.styles || [], fonts:definition.fonts || null, icons:!!definition.icons};
}
function moduleSource(name, format = 'esm', root = sourceRoot) {
  const entry = entrypoint(name, root), entries = Object.entries(entry.exports);
  if (!entries.length && !entry.defaultExport) throw new Error('Entrypoint has no module exports: ' + name);
  if (format === 'esm') return entry.source + '\n' + (entry.defaultExport ? 'export default ' + entry.defaultExport + ';\n' : '') +
    'export {' + entries.map(([key,value]) => key === value ? value : value + ' as ' + key).join(',') + '};\n';
  if (format === 'cjs') return entry.source + '\nmodule.exports = Object.assign(' + (entry.defaultExport || '{}') + ',{' +
    entries.map(([key,value]) => JSON.stringify(key) + ':' + value).join(',') + '});\n';
  throw new Error('Unknown module format: ' + format);
}
function panelAssets(root = sourceRoot) {
  const context = {};
  // Only trusted repository modules execute here, never a diagram/spec. No DOM,
  // filesystem, process or network is exposed to module registration.
  vm.runInNewContext(formatSources(sourceRecords(['validator.js'], root, false)), context, { timeout: 5000 });
  const features = {},
    styles = [],
    editorStyles = [];
  for (const type of context.PanelRegistry.types()) {
    const definition = context.PanelRegistry.get(type);
    features['panel.' + type] = {
      label: (definition.label || type) + ' panel',
      since: definition.since || '0.1.0',
    };
    function collect(value, into) {
      if (!value) return;
      for (const entry of Array.isArray(value) ? value : [value]) {
        const item = typeof entry === 'string' ? { css: entry, order: 100000 } : entry;
        if (
          !item ||
          typeof item.css !== 'string' ||
          (item.order != null && !Number.isFinite(item.order))
        )
          throw new Error('Invalid panel styles: ' + type);
        into.push({ css: item.css, order: item.order == null ? 100000 : item.order });
      }
    }
    collect(definition.styles, styles);
    collect(definition.editorStyles, editorStyles);
  }
  return { features, styles, editorStyles, iconIds:context.FlowIcons ? Array.from(context.FlowIcons.ids).filter(id=>!context.FlowIcons.registry[id].legacy) : [] };
}
function readStyles(name, root = sourceRoot) {
  let source = fs.readFileSync(path.join(root, name), 'utf8');
  const inventory = manifest(root).assets || {};
  const key = Object.keys(inventory.styles || {}).find(key => inventory.styles[key] === name);
  const shared = ((inventory.sharedStyles || {})[key] || []).map(file => fs.readFileSync(path.join(root,file),'utf8')).join('\n');
  if (shared) source += '\n' + shared;
  const assets = panelAssets(root);
  const entries = name === 'style.workbench.css' ? assets.editorStyles : assets.styles;
  if (source.includes('/* @panel-style-order:')) {
    const segments = source.split(/\/\* @panel-style-order:(\d+) \*\//);
    if (segments[0].trim()) entries.push({ css: segments[0], order: 0 });
    for (let i = 1; i < segments.length; i += 2)
      entries.push({ order: Number(segments[i]), css: segments[i + 1] });
    return entries
      .sort((a, b) => a.order - b.order)
      .map((item) => item.css)
      .join('\n');
  }
  const css = entries
    .sort((a, b) => a.order - b.order)
    .map((item) => item.css)
    .join('\n');
  if (source.includes('/* @panel-styles */')) return source.replace('/* @panel-styles */', css);
  return source + '\n' + css;
}
function fontAssets(profile, root = sourceRoot) {
  const assets = manifest(root).assets;
  if (!assets || !assets.fontProfiles.includes(profile)) throw new Error('Unknown font profile: ' + profile);
  const directory = path.dirname(assets.fonts);
  const fonts = JSON.parse(fs.readFileSync(path.join(root, assets.fonts), 'utf8'))
    .filter(font => font.profiles.includes(profile)).map(font => ({...font,
      file:directory + '/' + font.file, license:directory + '/' + font.license,
      data:fs.readFileSync(path.join(root, directory, font.file)).toString('base64')}));
  if (!fonts.length) throw new Error('Empty font profile: ' + profile);
  const licenses = [...new Set(fonts.map(font => font.license))].map(file => ({file,text:fs.readFileSync(path.join(root,file),'utf8')}));
  return {fonts, licenses};
}
function fontCss(profile, root = sourceRoot) {
  const {fonts,licenses} = fontAssets(profile, root);
  const licenseText = licenses.slice().sort((a,b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0).map(item => item.text).join('\n\n');
  return ['/* Bundled font licenses\n' + licenseText.replaceAll('*/','* /') + '\n*/', ...fonts.map(font =>
    "@font-face{font-family:'" + font.family + "';font-style:normal;font-weight:" + font.weight +
    ';font-display:swap;src:url(data:font/woff2;base64,' + font.data + ") format('woff2');}")].join('\n');
}
function iconAssets(root = sourceRoot) {
  const inventory = manifest(root).assets;
  const sprite = fs.readFileSync(path.join(root,inventory.icons),'utf8');
  if (!inventory.iconLibrary) return sprite;
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(root,inventory.iconLibrary),'utf8'),context,{timeout:5000});
  return sprite.replace('</svg>', context.FlowIcons.symbols({newOnly:true}) + '</svg>');
}
function entrypointAssets(name, root = sourceRoot) {
  const entry = entrypoint(name, root), inventory = manifest(root).assets;
  return {styles:entry.styles.map(key => {
    const file = inventory.styles[key];
    if (!file) throw new Error('Unknown style input: ' + key);
    return {key,file,source:key === 'core' || key === 'workbench' ? readStyles(file,root) : fs.readFileSync(path.join(root,file),'utf8')};
  }),icons:entry.icons ? iconAssets(root) : '',
    ...(entry.fonts ? fontAssets(entry.fonts,root) : {fonts:[],licenses:[]})};
}
module.exports = { sourceFiles, sourceRecords, composeSources, readSource, entrypoint, moduleSource,
  panelAssets, readStyles, fontAssets, fontCss, entrypointAssets };
if (require.main === module) {
  const [mode, ...names] = process.argv.slice(2);
  if (mode === '--assets') process.stdout.write(JSON.stringify(panelAssets()));
  else if (mode === '--styles' && names.length === 1) process.stdout.write(readStyles(names[0]));
  else if (mode === '--sources' && names.length) process.stdout.write(composeSources(names));
  else if (mode === '--files' && names.length === 1) process.stdout.write(JSON.stringify(sourceFiles(names[0])));
  else if (mode === '--entrypoint' && names.length === 1) process.stdout.write(JSON.stringify(entrypoint(names[0])));
  else if (mode === '--entry-assets' && names.length === 1) process.stdout.write(JSON.stringify(entrypointAssets(names[0])));
  else if (mode === '--font-css' && names.length === 1) process.stdout.write(fontCss(names[0]));
  else if (mode === '--module' && names.length === 2) process.stdout.write(moduleSource(names[0],names[1]));
  else throw new Error('usage: source-loader.cjs --entrypoint NAME | --entry-assets NAME | --module NAME esm|cjs | --sources SOURCES... | --files SOURCE | --font-css PROFILE | --assets | --styles STYLESHEET');
}

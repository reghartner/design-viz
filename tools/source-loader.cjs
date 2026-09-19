'use strict';
/* Build/test-time assembly only. Shipped runtimes contain the expanded source. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceRoot = path.join(__dirname, '../src');
function sourceFiles(name, root = sourceRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-bundles.json'), 'utf8'));
  return (manifest[name] || [name]).flatMap((entry) => {
    if (!entry.endsWith('/*.js')) return [entry];
    const directory = entry.slice(0, -5);
    return fs
      .readdirSync(path.join(root, directory))
      .filter((file) => file.endsWith('.js'))
      .sort()
      .map((file) => directory + '/' + file);
  });
}
function readSource(name, root = sourceRoot) {
  const source = sourceFiles(name, root)
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  return name === 'compatibility.js'
    ? source.replace('/* @panel-features */ {}', JSON.stringify(panelAssets(root).features))
    : source;
}
function panelAssets(root = sourceRoot) {
  const context = {};
  // Only trusted repository modules execute here, never a diagram/spec. No DOM,
  // filesystem, process or network is exposed to module registration.
  vm.runInNewContext(readSource('validator.js', root), context, { timeout: 5000 });
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
  return { features, styles, editorStyles };
}
function readStyles(name, root = sourceRoot) {
  let source = fs.readFileSync(path.join(root, name), 'utf8');
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
module.exports = { sourceFiles, readSource, panelAssets, readStyles };
if (require.main === module) {
  const [mode, ...names] = process.argv.slice(2);
  if (mode === '--assets') process.stdout.write(JSON.stringify(panelAssets()));
  else if (mode === '--styles' && names.length === 1) process.stdout.write(readStyles(names[0]));
  else throw new Error('usage: source-loader.cjs --assets | --styles stylesheet');
}

'use strict';
/* Build/test-time assembly only. Shipped runtimes contain the expanded source. */
const fs = require('node:fs');
const path = require('node:path');
const sourceRoot = path.join(__dirname, '../src');
function sourceFiles(name, root = sourceRoot) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'source-bundles.json'), 'utf8')
  );
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
  return sourceFiles(name, root)
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
}
module.exports = { sourceFiles, readSource };

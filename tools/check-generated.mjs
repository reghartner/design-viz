/* Development/CI gate. Uses the production generators, never a second assembly. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, readdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = 'tools/canon/generated-runtime.cjs';
const native = 'apps/backstage/src/generated';
const pages = ['template/flowview.html', 'workbench/flowspec.html', 'workbench/diagrams.json'];
const generated = [...pages, runtime, native];
const run = (command, args) => execFileSync(command, args, {cwd: root, stdio: 'inherit'});
const tracked = execFileSync('git', ['ls-files', '--', ...generated], {cwd: root, encoding: 'utf8'}).trim();
assert.equal(tracked, '', 'Generated outputs must not be tracked. Remove from Git:\n' + tracked);
if (!process.argv.includes('--tracking-only')) {
  async function freshBuild() {
    for (const name of generated) await rm(path.join(root, name), {recursive: true, force: true});
    run('python3', ['tools/build.py']);
    run(process.execPath, ['apps/backstage/build-viewer.mjs']);
    const names = [...pages, runtime, ...(await readdir(path.join(root, native))).sort().map(name => native + '/' + name)];
    return Promise.all(names.map(async name => [name, await readFile(path.join(root, name))]));
  }
  const first = await freshBuild();
  const second = await freshBuild();
  assert.deepEqual(second, first, 'Two builds from absent outputs must be byte-identical.');
  console.log('HTML, backend and native runtime outputs regenerate deterministically from absent files.');
}
console.log('Generated entrypoints and runtime bundles are absent from the Git index.');

import {copyFile, mkdir, writeFile, readFile, rm, realpath, mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

async function canonicalPath(value) {
  let current = path.resolve(value); const suffix = [];
  for (;;) {
    try { return path.join(await realpath(current), ...suffix.reverse()); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.push(path.basename(current)); current = parent;
    }
  }
}
export async function vendorFlowview(source, destination) {
  const sourcePath = await realpath(source);
  const pluginPath = await canonicalPath(path.join(destination, 'apps/backstage'));
  if (pluginPath === sourcePath || pluginPath.startsWith(sourcePath + path.sep) || sourcePath.startsWith(pluginPath + path.sep))
    throw new Error('Vendor into a separate designer checkout.');
  const git = (...args) => execFileSync('git', args, {cwd: source, encoding: 'utf8'}).trim();
  if (git('status', '--porcelain')) throw new Error('Vendor from a clean Flowview checkout so its source pin is accurate.');
  const revision = git('rev-parse', 'HEAD');
  const prefixes = ['template/', 'src/starters/', 'tools/canon/', 'tools/catalog-sync/', 'deploy/workbench/'];
  // An explicit tracked-file allowlist excludes private/local files and dependencies.
  const buildFiles = new Set(['LICENSE']);
  const tracked = git('ls-files', '-z').split('\0');
  const files = tracked.filter(name => buildFiles.has(name) || prefixes.some(prefix => name.startsWith(prefix)));
  // Generate portable pages from tracked source, never ignored local HTML. Build
  // before replacing the destination; failure leaves its existing runtime intact.
  const buildRoot = await mkdtemp(path.join(tmpdir(), 'flowview-vendor-build-'));
  const inputs = ['src/', 'tools/', 'apps/backstage/', 'contract/', 'cookbook/', 'docs/',
    '.claude/skills/hld-to-page/', 'examples/canon/', 'examples/contract-blocks/',
    'examples/data-contract/', 'examples/doorbell-chime/', 'examples/independent-extraction/', 'diagrams/'];
  try {
    for (const name of tracked.filter(name => ['canon.json', 'LICENSE'].includes(name) || inputs.some(prefix => name.startsWith(prefix)))) {
      const target = path.join(buildRoot, name);
      await mkdir(path.dirname(target), {recursive:true});
      await copyFile(path.join(source, name), target);
    }
    execFileSync('python3', ['tools/build.py'], {cwd:buildRoot, stdio:'inherit'});
    const publisher = path.join(buildRoot, 'apps/backstage');
    execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {cwd:publisher, stdio:'inherit'});
    execFileSync('npm', ['run', 'build'], {cwd:publisher, stdio:'inherit'});
    const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', buildRoot], {cwd:publisher, encoding:'utf8'}));

    // The pinned plugin is generator-owned, including deletions on upgrades.
    await rm(path.join(destination, 'apps/backstage'), {recursive:true, force:true});
    for (const name of files) {
      const target = path.join(destination, name);
      await mkdir(path.dirname(target), {recursive: true});
      await copyFile(path.join(source, name), target);
    }
    const plugin = path.join(destination, 'apps/backstage');
    await mkdir(plugin, {recursive:true});
    execFileSync('tar', ['-xzf', path.join(buildRoot, packed.filename), '--strip-components=1', '-C', plugin]);
    // This copy is a distribution, not a publisher checkout. Host installation
    // may repack dist, but must never invoke upstream generators or dev tooling.
    const manifest = JSON.parse(await readFile(path.join(plugin, 'package.json'), 'utf8'));
    delete manifest.scripts;
    delete manifest.devDependencies;
    await writeFile(path.join(plugin, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    for (const name of ['template/flowview.html', 'workbench/flowspec.html', 'tools/canon/generated-runtime.cjs']) {
      const target = path.join(destination, name);
      await mkdir(path.dirname(target), {recursive:true});
      await copyFile(path.join(buildRoot, name), target);
    }
    // This runtime-only rehearsal has no engine source tree. The company fork's
    // default Dockerfile builds source; this package consumes the pages above.
    await copyFile(path.join(source, 'deploy/workbench/Dockerfile.prebuilt'), path.join(destination, 'deploy/workbench/Dockerfile'));
  } finally {
    await rm(buildRoot, {recursive:true, force:true});
  }
  await copyFile(path.join(source, 'LICENSE'), path.join(destination, 'FLOWVIEW-LICENSE'));
  await mkdir(path.join(destination, '.flowview'), {recursive: true});
  let repository = git('remote', 'get-url', 'origin');
  repository = repository.replace(/^git@github.com:/, 'https://github.com/').replace(/\.git$/, '');
  // Never copy embedded URL credentials into a public manifest.
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository)) repository = 'local checkout';
  await writeFile(path.join(destination, '.flowview/runtime.json'), JSON.stringify({repository, revision}, null, 2) + '\n');
  console.log('Built and copied Flowview runtime files at ' + revision + '; company catalog preserved.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/vendor-flowview.mjs PATH_TO_CLEAN_FLOWVIEW_CHECKOUT');
  await vendorFlowview(path.resolve(process.argv[2]), process.cwd());
}

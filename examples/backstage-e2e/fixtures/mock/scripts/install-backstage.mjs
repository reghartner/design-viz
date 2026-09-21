import {mkdir, copyFile, readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, {cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'});
}

export async function stagePluginTarball(tarball, sandbox) {
  const bytes = await readFile(tarball);
  // A new path for changed bytes prevents Yarn from reusing the previous file
  // dependency's cached contents, even when the package version is unchanged.
  const digest = createHash('sha256').update(bytes).digest('hex');
  const filename = `flowview-backstage-plugin-${digest}.tgz`;
  const destination = path.join(sandbox, '.local', filename);
  const manifest = path.join(sandbox, 'packages/app/package.json');
  const app = JSON.parse(await readFile(manifest, 'utf8'));
  app.dependencies['@flowview/backstage-plugin'] = `file:../../.local/${filename}`;
  await mkdir(path.dirname(destination), {recursive: true});
  await copyFile(tarball, destination);
  await writeFile(manifest, JSON.stringify(app, null, 2) + '\n');
  return destination;
}

export async function preparePluginPackage(root = process.cwd(), execute = run) {
  const {source} = JSON.parse(await readFile(path.join(root, '.local/designer.json'), 'utf8'));
  if (typeof source !== 'string' || !path.isAbsolute(source)) throw new Error('Run scripts/setup-sandbox.mjs with the designer checkout first.');
  const publisher = path.join(source, 'apps/backstage');
  const manifest = JSON.parse(await readFile(path.join(publisher, 'package.json'), 'utf8'));
  if (manifest.name !== '@flowview/backstage-plugin') throw new Error('The recorded designer does not contain @flowview/backstage-plugin.');
  const packed = await mkdtemp(path.join(root, '.local/flowview-pack-'));
  try {
    await execute('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], publisher);
    await execute('npm', ['run', 'build'], publisher);
    const result = JSON.parse(await execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packed], publisher, true));
    const item = result[0];
    if (result.length !== 1 || item.name !== manifest.name || path.basename(item.filename) !== item.filename)
      throw new Error('npm pack did not produce the expected Flowview package.');
    return await stagePluginTarball(path.join(packed, item.filename), path.join(root, 'sandbox/backstage'));
  } finally { await rm(packed, {recursive: true, force: true}); }
}

export async function installBackstage(root = process.cwd()) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node 24 for the Backstage sandbox.');
  const tarball = await preparePluginPackage(root);
  console.log('Installing packed plugin: ' + tarball);
  // Tooling is installed locally and ignored. No global Yarn/Corepack install required.
  run('npm', ['install', '--prefix', '.local/yarn-toolchain', '--ignore-scripts', '--no-audit', '--no-fund', '@yarnpkg/cli-dist@4.13.0'], root);
  const sandbox = path.join(root, 'sandbox/backstage');
  await mkdir(path.join(sandbox, '.yarn/releases'), {recursive: true});
  await copyFile(path.join(root, '.local/yarn-toolchain/node_modules/@yarnpkg/cli-dist/bin/yarn.js'), path.join(sandbox, '.yarn/releases/yarn-4.13.0.cjs'));
  // The fixture locks host dependencies. The locally built tarball is deliberately
  // resolved now; review the app manifest/lockfile changes after runtime upgrades.
  run(process.execPath, ['.yarn/releases/yarn-4.13.0.cjs', 'install', '--no-immutable'], sandbox);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await installBackstage();
}

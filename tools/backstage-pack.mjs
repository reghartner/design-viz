#!/usr/bin/env node
/* Pack or publish apps/backstage with the fork's package identity, without
 * editing apps/backstage/package.json.
 *
 *   node tools/backstage-pack.mjs pack [npm pack options]
 *   node tools/backstage-pack.mjs publish [npm publish options]
 *
 * repository.url: FLOWVIEW_PACKAGE_REPOSITORY_URL, else company/company.json
 *   package.repositoryUrl, else git+<company.json repository>.git.
 * publishConfig.registry: FLOWVIEW_PACKAGE_REGISTRY, else company/company.json
 *   package.registry.
 * With neither, this runs `npm pack|publish` in apps/backstage with the same
 * options. Otherwise it builds once (the package's prepack) unless
 * --ignore-scripts is given, copies exactly the files npm would pack into a
 * staging folder with a patched package.json, and runs npm there with
 * --ignore-scripts. In both cases a relative --pack-destination resolves from
 * the current directory, which is also the default destination, as for
 * `npm pack` run in that directory.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../apps/backstage/', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export function packageIdentity({ env = process.env, company = null } = {}) {
  const pkg = company?.package || {};
  const repositoryUrl = env.FLOWVIEW_PACKAGE_REPOSITORY_URL || pkg.repositoryUrl ||
    (company?.repository ? 'git+' + company.repository + '.git' : null);
  const registry = env.FLOWVIEW_PACKAGE_REGISTRY || pkg.registry || null;
  if (registry && !/^https?:\/\/\S+$/.test(registry)) throw new Error('The package registry must be an http(s) URL: ' + registry);
  if (repositoryUrl && /\s/.test(repositoryUrl)) throw new Error('The package repository URL must not contain spaces.');
  return { repositoryUrl, registry };
}

export function stagedManifest(manifest, { repositoryUrl, registry }) {
  const next = structuredClone(manifest);
  if (repositoryUrl) next.repository = { ...(next.repository || { type: 'git' }), url: repositoryUrl };
  if (registry) next.publishConfig = { ...(next.publishConfig || {}), registry };
  return next;
}

function resolveDestinations(args) {
  const out = [];
  let destination = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pack-destination' && i + 1 < args.length) { out.push(arg, path.resolve(args[++i])); destination = true; }
    else if (arg.startsWith('--pack-destination=')) { out.push('--pack-destination=' + path.resolve(arg.slice(19))); destination = true; }
    else out.push(arg);
  }
  return { args: out, destination };
}

function packedFiles(stdout) {
  const parsed = JSON.parse(stdout);
  const record = (Array.isArray(parsed) ? parsed : Object.values(parsed ?? {})).find(item => Array.isArray(item?.files));
  if (!record) throw new Error('npm pack --dry-run --json listed no files.\n' + stdout);
  return record.files.map(file => file.path);
}

function run(args, cwd) {
  const result = spawnSync(npm, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command !== 'pack' && command !== 'publish') {
    console.error('usage: node tools/backstage-pack.mjs pack|publish [npm options]');
    return 2;
  }
  const loader = createRequire(import.meta.url)('./source-loader.cjs');
  const identity = packageIdentity({ company: loader.companyConfig() });
  const { args, destination } = resolveDestinations(rest);
  if (command === 'pack' && !destination) args.push('--pack-destination', process.cwd());
  if (!identity.repositoryUrl && !identity.registry) return run([command, ...args], source);
  if (!args.includes('--ignore-scripts')) {
    const status = run(['run', '--if-present', 'prepack'], source);
    if (status) return status;
  }
  const staging = await mkdtemp(path.join(tmpdir(), 'flowview-backstage-pack-'));
  try {
    const listing = execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: source, encoding: 'utf8' });
    for (const file of packedFiles(listing)) {
      if (file === 'package.json') continue;
      await mkdir(path.dirname(path.join(staging, file)), { recursive: true });
      await copyFile(path.join(source, file), path.join(staging, file));
    }
    const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
    await writeFile(path.join(staging, 'package.json'), JSON.stringify(stagedManifest(manifest, identity), null, 2) + '\n');
    console.error('Packing with ' + [identity.repositoryUrl && 'repository.url ' + identity.repositoryUrl,
      identity.registry && 'publishConfig.registry ' + identity.registry].filter(Boolean).join(' and ') + '.');
    return run([command, ...args.filter(arg => arg !== '--ignore-scripts'), '--ignore-scripts'], staging);
  } finally { await rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2));

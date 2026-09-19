import {mkdir, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node 24 for the Backstage sandbox.');
// Tooling is installed locally and ignored. No global Yarn/Corepack install required.
execFileSync('npm', ['install', '--prefix', '.local/yarn-toolchain', '--ignore-scripts', '--no-audit', '--no-fund', '@yarnpkg/cli-dist@4.13.0'], {stdio: 'inherit'});
const sandbox = path.resolve('sandbox/backstage');
await mkdir(path.join(sandbox, '.yarn/releases'), {recursive: true});
await copyFile('.local/yarn-toolchain/node_modules/@yarnpkg/cli-dist/bin/yarn.js', path.join(sandbox, '.yarn/releases/yarn-4.13.0.cjs'));
execFileSync(process.execPath, ['.yarn/releases/yarn-4.13.0.cjs', 'install', '--immutable'], {cwd: sandbox, stdio: 'inherit'});

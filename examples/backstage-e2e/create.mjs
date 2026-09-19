#!/usr/bin/env node
import {cp, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {vendorFlowview} from './fixtures/designer/scripts/vendor-flowview.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const flowview = path.resolve(here, '../..');
const usage = 'node examples/backstage-e2e/create.mjs --out NEW_DIRECTORY --owner GITHUB_OWNER [--mock-repo NAME] [--designer-repo NAME]';
export function options(args) {
  const values = {mockRepo: 'backstage-designer-mock', designerRepo: 'backstage-designer'};
  const names = {'--out': 'out', '--owner': 'owner', '--mock-repo': 'mockRepo', '--designer-repo': 'designerRepo'};
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    if (!names[args[i]] || !args[i + 1] || args[i + 1].startsWith('--') || seen.has(args[i])) throw new Error(usage);
    seen.add(args[i]); values[names[args[i]]] = args[i + 1];
  }
  if (!values.out || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(values.owner || '')) throw new Error(usage);
  for (const name of [values.mockRepo, values.designerRepo]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(name) || name.endsWith('.git')) throw new Error('Use plain GitHub repository names, without paths or .git.');
  }
  if (values.mockRepo.toLowerCase() === values.designerRepo.toLowerCase()) throw new Error('Use two distinct repository names.');
  return values;
}
function run(command, args, cwd, env = {}) {
  execFileSync(command, args, {cwd, env: {...process.env, ...env}, stdio: 'inherit'});
}
function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Flowview Rehearsal', '-c', 'user.email=rehearsal@example.test', ...args], {cwd, encoding: 'utf8'}).trim();
}
async function renderTree(source, target, substitutions) {
  await mkdir(target, {recursive: true});
  for (const entry of await readdir(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) await renderTree(from, to, substitutions);
    else if (entry.isFile()) {
      const bytes = await readFile(from);
      // Leave images intact; templates contain only UTF-8 text otherwise.
      if (/\.(png|ico)$/.test(entry.name)) await cp(from, to);
      else {
        let text = bytes.toString('utf8');
        for (const [key, value] of Object.entries(substitutions)) text = text.replaceAll(key, value);
        await writeFile(to, text);
      }
    } else throw new Error('Unexpected non-file fixture: ' + from);
  }
}
export async function createRehearsal(config) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node 24 for this pinned Backstage sandbox.');
  // Resolve source identity before creating anything; runtime vendoring also checks cleanliness.
  if (git(flowview, 'status', '--porcelain')) throw new Error('Commit or stash Flowview changes first; the package pins a clean source commit.');
  const output = path.resolve(config.out);
  const relative = path.relative(flowview, output);
  if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw new Error('Create the rehearsal outside the Flowview checkout.');
  await mkdir(path.dirname(output), {recursive: true});
  await mkdir(output); // Never overwrite or reuse an existing rehearsal.
  const mock = path.join(output, config.mockRepo), designer = path.join(output, config.designerRepo);
  const substitutions = {
    __MOCK_REPOSITORY__: config.owner + '/' + config.mockRepo,
    __DESIGNER_REPOSITORY__: config.owner + '/' + config.designerRepo,
    __MOCK_NAME__: config.mockRepo,
    __DESIGNER_NAME__: config.designerRepo,
  };
  await renderTree(path.join(here, 'fixtures/mock'), mock, substitutions);
  await renderTree(path.join(here, 'fixtures/designer'), designer, substitutions);
  await cp(path.join(flowview, 'LICENSE'), path.join(mock, 'LICENSE'));
  await mkdir(path.join(designer, '.flowview'), {recursive: true});
  await mkdir(path.join(designer, 'specs'), {recursive: true});
  const repository = 'https://github.com/' + substitutions.__MOCK_REPOSITORY__;
  await writeFile(path.join(designer, '.flowview/local-sources.json'), JSON.stringify({version: 1, repositories: {[repository]: '.local/mock-source'}}, null, 2) + '\n');
  await vendorFlowview(flowview, designer);
  for (const directory of [mock, designer]) git(directory, 'init', '--quiet', '--initial-branch=main', '--template=');
  git(mock, 'add', '.');
  git(mock, 'commit', '--quiet', '-m', 'Fictional doorbell baseline: record before notifying');
  const baseline = git(mock, 'rev-parse', 'HEAD');
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], mock);
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], path.join(designer, 'tools/catalog-sync'));
  const {createMockServer} = await import(pathToFileURL(path.join(mock, 'mock/server.mjs')));
  const token = randomBytes(32).toString('hex'), server = createMockServer({token});
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  try {
    // Async child: the parent must continue servicing the mock's HTTP requests.
    const {spawn} = await import('node:child_process');
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['tools/canon/catalog-sync.mjs', '--backstage', '--output', 'workbench/catalog.json'], {
        cwd: designer, stdio: 'inherit', env: {...process.env, FLOWVIEW_BACKSTAGE_BACKEND_URL: 'http://127.0.0.1:' + server.address().port, FLOWVIEW_BACKSTAGE_APP_URL: 'http://localhost:3000', FLOWVIEW_BACKSTAGE_TOKEN: token},
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('Catalog GET seeding failed: ' + code)));
    });
  } finally {await new Promise(resolve => server.close(resolve));}
  run(process.execPath, ['scripts/author-demo.mjs', mock], designer);
  run(process.execPath, ['scripts/setup-sandbox.mjs', designer], mock);
  git(designer, 'add', '.');
  git(designer, 'commit', '--quiet', '-m', 'Seed catalog over HTTP and pin the doorbell diagram to source');
  // These are local experiment branches. Main stays at the known-good baseline.
  for (const [branch, patch] of [['codex/rehearsal-refactor', 'non-breaking'], ['codex/rehearsal-timeout', 'breaking']]) {
    git(mock, 'switch', '--quiet', '-c', branch);
    git(mock, 'apply', '--check', path.join(mock, 'changes', patch + '.patch'));
    git(mock, 'apply', path.join(mock, 'changes', patch + '.patch'));
    git(mock, 'add', 'src/recording-service.js');
    git(mock, 'commit', '--quiet', '-m', 'Rehearsal experiment: ' + patch);
  }
  git(mock, 'switch', '--quiet', 'main');
  await writeFile(path.join(output, 'rehearsal.json'), JSON.stringify({...config, out: output, baseline}, null, 2) + '\n');
  console.log('\nCreated ' + output + '\nNo GitHub repositories were created, and no PRs were merged.\nNext: read ' + path.join(mock, 'README.md'));
  return {output, mock, designer, baseline, repository};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {await createRehearsal(options(process.argv.slice(2)));}
  catch (error) {console.error(error.message); process.exitCode = 1;}
}

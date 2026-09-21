import {readFile, writeFile, mkdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';

export async function configureSandbox(designer, root = process.cwd()) {
  const source = await realpath(path.resolve(root, designer));
  const plugin = JSON.parse(await readFile(path.join(source, 'apps/backstage/package.json'), 'utf8'));
  if (plugin.name !== '@flowview/backstage-plugin') throw new Error('The designer must contain @flowview/backstage-plugin in apps/backstage.');
  await mkdir(path.join(root, '.local'), {recursive: true});
  const credentials = path.join(root, '.local/secrets.json');
  try { JSON.parse(await readFile(credentials, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(credentials, JSON.stringify({catalog: randomBytes(32).toString('hex'), read: randomBytes(32).toString('hex')}), {mode: 0o600});
  }
  // Record publisher source for the explicit, larger install step. Setup never
  // copies source into the Backstage host or downloads its dependencies.
  await writeFile(path.join(root, '.local/designer.json'), JSON.stringify({source}, null, 2) + '\n');
  await mkdir(path.join(root, 'sandbox/backstage'), {recursive: true});
  await writeFile(path.join(root, 'sandbox/backstage/app-config.local.yaml'), JSON.stringify({backend: {csp: {
    'script-src': ["'self'"], 'script-src-elem': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"], 'font-src': ["'self'", 'data:'], 'img-src': ["'self'", 'data:'],
  }}}, null, 2) + '\n');
  console.log('Recorded designer package source and configured bundled-script and embedded-asset CSP. Local credentials are ignored by Git.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await configureSandbox(process.argv[2] || '../__DESIGNER_NAME__');
}

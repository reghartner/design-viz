/* Verify the documented copy install, without the upstream runtime or fixtures. */
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../apps/backstage/', import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'flowview-plugin-copy-'));
try {
  const destination = path.join(temp, 'plugin');
  await cp(source, destination, {
    recursive: true,
    filter: (file) =>
      !['node_modules', '.local', 'dist'].some((name) =>
        path.relative(source, file).split(path.sep).includes(name)
      ),
  });
  for (const args of [
    ['ci', '--no-fund', '--no-audit', '--ignore-scripts'],
    ['run', 'verify'],
  ]) {
    const run = spawnSync('npm', args, {
      cwd: destination,
      encoding: 'utf8',
      timeout: 180000,
    });
    if (run.status !== 0)
      throw new Error(
        run.stdout +
          '\n' +
          run.stderr +
          '\n' +
          (run.error || 'npm exited ' + run.status)
      );
    if (args[0] === 'run') process.stdout.write(run.stdout);
  }
  console.log('Copied plugin verifies without the Flowview source checkout.');
} finally {
  await rm(temp, { recursive: true, force: true });
}

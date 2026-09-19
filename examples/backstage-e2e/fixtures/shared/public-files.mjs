import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

/** Read only within the selected public subtree, including after symlink resolution.
 * The caller decodes the URL exactly once and handles malformed encodings as 400.
 * Private siblings must never become readable through an allowed URL prefix.
 */
export async function readPublicFile(root, relative, publicPaths) {
  if (typeof relative !== 'string' || /[\\\x00-\x1f\x7f]/.test(relative))
    return null;
  const segments = relative.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  )
    return null;
  const selected = publicPaths.find(
    (prefix) => relative === prefix || relative.startsWith(prefix + '/')
  );
  if (!selected) return null;
  try {
    const canonicalRoot = await realpath(root);
    const boundary = path.join(canonicalRoot, selected);
    const filename = await realpath(path.join(canonicalRoot, relative));
    if (filename !== boundary && !filename.startsWith(boundary + path.sep))
      return null;
    return await readFile(filename);
  } catch {
    // Missing paths, directories, broken symlinks and denied reads are all 404s.
    return null;
  }
}

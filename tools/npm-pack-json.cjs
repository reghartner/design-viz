'use strict';
/* `npm pack --json` prints an array of artifacts through npm 11 and an object
   keyed by package name from npm 12. Accept both and fail with npm's output. */
function packedArtifact(stdout, stderr = '') {
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch (error) { throw new Error('npm pack --json did not print JSON.\nstdout:\n' + stdout + '\nstderr:\n' + stderr, { cause: error }); }
  const records = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
  const artifact = records.find(record => typeof record?.filename === 'string');
  if (!artifact) throw new Error('npm pack --json reported no artifact filename.\nstdout:\n' + stdout + '\nstderr:\n' + stderr);
  return artifact;
}
module.exports = { packedArtifact };

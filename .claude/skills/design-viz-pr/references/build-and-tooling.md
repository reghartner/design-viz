# Build and tooling

- Use `.github/workflows/ci.yml` for current runtimes and required commands;
  don't freeze version numbers or test counts in review policy. Shared runtime
  source is in `src/`; `tools/build.py` builds both committed HTML entry points.
  Generated-only edits need a source explanation or correction, not acceptance
  of a hand patch that the next build erases.
- Panel discovery follows `src/source-bundles.json`: the assembled validator
  includes `panels/registry.js`, shared helpers and every `panels/types/*.js`.
  Use `tools/source-loader.cjs` (`readSource`) for VM tests and tools; raw-file
  reads skip module definitions. The same collector supplies module CSS and
  compatibility metadata to portable pages and host builds. See
  `docs/panel-modularity.md` and `tests/panel-extension.test.js` for the complete
  single-file extension contract, including headless backend packaging.
- The logical validator bundle includes the shared `core/` leaves once, including
  navigation in the same outer scope as document traversal. The engine bundle
  adds only renderer/player code. Backend `viewerRouting()` exposes this static
  pure core without initializing the DOM renderer. See `docs/shared-core.md`;
  keep source/package parity and temporary source fixtures in sync with moves.
- Pure geometry lives in `core/geometry.js`, included once in the validator
  bundle after shared helpers; its existing `clamp()` dependency is call-time.
  Validator/lint tooling must use that bundle without loading the DOM engine.
  Preserve algorithm bodies, candidate order and diagnostics during extraction.
- The logical `builder.workbench.js` bundle loads source/target leaves and
  common/graph/document/narrative command leaves before the builder. The logical
  `clipboard.workbench.js` bundle loads its pure command leaf before transport.
  Use `readSource()` for UI harnesses; pure tests load only required leaves. Keep
  physical file lists flat and preserve registry-before-builder ordering. Workbench module
  ownership and source-preservation contracts are in `docs/workbench-modules.md`.
- Tool/CLI changes: check actual callers, exit codes, input/output formats,
  escaping, destination safety and reproducibility. Run matching Python/Node
  tests; shared Python helpers may warrant
  `python3 -m unittest discover -s tests -v`.
- Dependency changes: examine manifests and lockfile delta, runtime/import
  compatibility and resulting build. Use the affected app's install/verify
  commands. A lockfile-only diff can still change runtime behavior.
- Workflow changes: check event/ref selection, permissions, secret availability,
  concurrency and failure propagation. Pull-request content must not acquire
  privileged execution via changed triggers. `canon-drift.yml` also requires
  the canon route because it handles review decisions and writes accepted pins.

Validate generated freshness from the reviewed head. Keep local build output
separate from authored changes until explained; don't discard somebody else's
work to obtain a clean result. Check required remote CI for that same head before
merging. Repeat only affected validation after subsequent changes.

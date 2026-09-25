# Build and tooling

- Use `.github/workflows/ci.yml` for current runtimes and required commands;
  don't freeze version numbers or test counts in review policy. Shared runtime
  source is in `src/`; `tools/build.py` builds both HTML entry points before CI
  tests. Checked-in HTML does not have to match the current engine byte for byte.
  Generated-only edits need a source explanation or correction, not acceptance
  of a hand patch that the next build erases.
- Named `standalone`, `workbench`, `backend`, `native`, `forge` and
  `compatibility` entrypoints in `src/source-bundles.json` own complete source
  order, explicit boot, public module exports and asset selections.
  `tools/source-loader.cjs` is the physical expansion/substitution owner; Python
  calls its CLI. Use `entrypoint().body` for whole-core/UI definition harnesses
  and `entrypoint().source` for emitted-content assertions, never neighboring
  comment or private-function slicing. Pure tests still load required leaves.
  See `docs/build-entrypoints.md` and `tests/source-loader.test.js`. Preserve raw
  page CSS versus registry-expanded core/workbench CSS, and the explicit all-22
  versus Forge-nine font profiles with their licenses.
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
  common/graph/document/narrative/layout command leaves, then persistence/session
  leaves, followed by field-value/read-model, local lifetime, control-policy and inspector leaves
  and pure I/O preparation/browser-adapter/I/O-controller and interaction leaves before the
  builder. The shared local lifetime leaf is included once; standalone satellite UI
  tests load it explicitly. The logical `clipboard.workbench.js` and `reuse.workbench.js`
  bundles load their pure command leaves before their controllers; layout controls use the builder-owned
  layout leaf. Do not include the same leaf again in a satellite bundle.
  The logical workspace bundle prepends `workbench/preview.js` for preview
  outcomes and snapshot/restore before workspace layout/preferences.
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
- Required browser contracts live in the isolated `tools/browser-tests` package.
  Follow its README for locked dependencies and the matching downloaded Chromium;
  no ambient browser fallback, retries or missing-browser skips are allowed.
  The `browser-contracts` job runs on every PR, preserving existing pure/host
  gates. Review fixtures against their production artifact and named-assembly
  owners, strict error/network audit, resource baseline and failure traces.
  Check the new job is green on the reviewed head before merging; local Chrome
  evidence alone does not satisfy the required CI contract.
- Workflow changes: check event/ref selection, permissions, secret availability,
  concurrency and failure propagation. Pull-request content must not acquire
  privileged execution via changed triggers. `canon-drift.yml` also requires
  the canon route because it handles review decisions and writes accepted pins.

- Backstage native composition lives in `tools/native-viewer-build.mjs` and
  `src/native/`; `apps/backstage/build-viewer.mjs` emits the portable static ESM
  artifact and declarations. Use logical source-loader assemblies, including
  physical-file compatibility panel metadata. Export bindings are declared and
  checked centrally; keep environment/mount/scoping and package wrappers in their
  native adapters. Do not hand-edit generated code or restore runtime
  source evaluation. Rebuild and verify the isolated copy install after changes.

Validate fresh builds and behavior from the reviewed head; check committed
freshness for packaged JavaScript, not HTML exports. Keep local build output
separate from authored changes until explained; don't discard somebody else's
work to obtain a clean result. Check required remote CI for that same head before
merging. Repeat only affected validation after subsequent changes.

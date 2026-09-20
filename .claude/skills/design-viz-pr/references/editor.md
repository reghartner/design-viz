# Editor

- Follow the user action through selection, the mutation planner, JSON write,
  rerender and restored selection. Check one Undo/Redo per logical operation,
  invalid-input preservation and stale dialogs after source/section changes.
- Source scanners/splices and raw addressing live in `src/workbench/source-edit.js`
  and `targets.js`; see `docs/workbench-modules.md`. Load those leaves directly for
  pure source tests; load command leaves for planners and the logical
  `builder.workbench.js` bundle for editor/UI tests.
  Preserve raw wrapper/bare-diagram paths, surrounding source bytes and result
  offsets; normalized viewer section records are not editor addresses.
- Pure common/graph/document/narrative/layout/reuse/clipboard commands live under
  `src/workbench/commands/`. Satellite clipboard and reuse bundles prepend their
  pure leaves; layout controls use the builder assembly's layout leaf. Pure tests
  must not load the inspector or renderer. Preserve registry reference rewrites,
  distinct copy policies, source ranges and bulk failure without publication.
- Narrative finalization shares path validation, view reachability and result
  ranges. Keep raw source step index, route identity, occurrence position and
  filtered visible stop distinct. Occurrence removal retains the registry body;
  independent copies carry applicable view membership. Check action-specific
  errors/no-ops and each actual editor action's single Undo/selection behavior.
- Session/history/project and draft lifetime live in `src/workbench/session.js`
  and `persistence.js`. Test these leaves without DOM code; actual controls must
  publish through `session.accept()` once. Snapshot the current exact source,
  including invalid handwriting; keep render freshness tied to the last successful
  preview. Check ordinary manual writes as well as `applyPlan`, caller-specific
  focus/no-op policies, 800 ms autosave, pending-draft first Undo, matching baseline
  recovery and cancelled/disposed callbacks. Browser API adapters must preserve
  the native receiver. Session destroy is not full editor teardown.
- `createBuilderInspector()` in `src/workbench/inspector.js` owns forms, per-instance
  expansion/cache state and deferred refresh. Preserve the registered panel editor
  context and factory-identity cache. `controls.js` owns commit policy with explicit
  blur/unchanged behavior; field values and effective-state models load without
  inspector/DOM code. Test two instances and held callbacks after retirement or
  destroy. Deferred refresh captures the latest active field at execution: wait
  for replacement DOM before checking Enter caret/scroll, Tab destination and no
  focus steal from outside. Single and multiple forms must share that view
  lifecycle while changed authored target sets start fresh. Source/project/target/path changes must retire stale
  refreshes. I/O generations and gesture/observer resources still have separate
  owners; inspector destroy must not be described as complete editor teardown.
- Keep shared Home layout/initial state distinct from per-step overrides. Use
  `docs/homemap-workbench.md` only for those controls. Test the context being
  edited, including non-step selection when affected.
- Step operations: read `docs/workbench-step-reuse.md` and, for branch semantics,
  `docs/alternate-paths.md`. Copies are independent; shared references deliberately
  edit one body. Verify IDs, path membership and the first independent branch.
- Clipboard operations: read `docs/workbench-clipboard.md`. Check reference/ID
  remapping, cross-spec destinations, initial versus animated state, native text
  editing, mobile/manual fallback and failure without partial mutation.

Run suites for the touched planner/control (for example `builder`, `clipboard`,
`reuse-steps`, `homemap-edit` or `workspace`). For interaction changes, exercise
the user gesture in the built workbench and Undo/Redo; cover keyboard and narrow
layout when affected. Read `docs/workbench-workspace.md` only for sizing/focus.
Behavior changes also need the corresponding user guide/HLD skill route updated.

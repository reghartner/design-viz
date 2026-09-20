# Editor

- Follow the user action through selection, the mutation planner, JSON write,
  rerender and restored selection. Check one Undo/Redo per logical operation,
  invalid-input preservation and stale dialogs after source/section changes.
- Source scanners/splices and raw addressing live in `src/workbench/source-edit.js`
  and `targets.js`; see `docs/workbench-modules.md`. Load those leaves directly for
  pure source tests and the logical `builder.workbench.js` bundle for planners/UI.
  Preserve raw wrapper/bare-diagram paths, surrounding source bytes and result
  offsets; normalized viewer section records are not editor addresses.
- Common/graph/document commands and clipboard planning live under
  `src/workbench/commands/`. Shared-step deletion also lives there so bulk
  dispatch runs without the inspector; other narrative/layout planners remain
  in the builder until their extraction. Preserve registry reference rewrites,
  distinct copy policies and bulk failure without partial publication. Test
  pure leaves plus the actual editor action's single Undo/selection behavior.
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

# Viewer and spec

- Trace changed fields through normalization, validation, state folding and
  rendering. Check old specs that omit new fields, safe text/URL handling and
  round trips. Contract changes need matching authoring guidance and an example.
- For paths, read `docs/alternate-paths.md`: step bodies form a shared registry;
  paths reference IDs. The first unique reference is the first branch column.
  Recompute state from initial values along the selected path; another outcome's
  state must not leak. Check a shared prefix, independent first branch and early end.
- For Home/layout work, use the relevant parts of `docs/homemap-workbench.md`.
  Check Home/Data switching, wide/narrow containers, panel space and the affected
  skin. Animation changes need paused/reduced-motion behavior and cleanup.
- For trace changes, use `docs/trace-import.md`; distinguish wall time from summed
  child durations and preserve concurrency/unknown evidence. Validate malformed
  and incomplete imports as well as the happy fixture.

Run the relevant `tests/*.test.js` suites; use the full Node suite for shared
validator/state/engine changes. Browser-check visible changes with a representative
starter and the actual failing container/skin where available. A browser claim
needs observed results; pure-function tests do not establish layout quality.

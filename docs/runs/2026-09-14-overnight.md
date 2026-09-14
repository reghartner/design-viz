# Overnight build — September 14, 2026

Chuck authorized focused PRs, stacked or independent, through tonight. First
priority: smart layouts for complex Honeycomb traces and service-internal time.
The overnight continuation ends at 08:00 America/New_York (12:00 UTC).
PR creation is authorized; leave PRs open for review. Work directly in this
worktree. Preserve user edits and the unrelated control-callouts PR #49.

## Work queue

| Order | Scope | Branch | Status |
|---|---|---|---|
| 1 | Trace import, software panels and outline | codex/trace-import-foundation | Open: https://github.com/reghartner/design-viz/pull/50 |
| 2 | Dependency-aware trace rows, crossing reduction and routing | codex/trace-smart-layout | Open: https://github.com/reghartner/design-viz/pull/51 |
| 3 | Internal spans and inclusive / child-covered / uncovered timing | codex/trace-service-time | Implemented; 13 timing tests pass; browser verification next |
| 4 | Large trace focus by service/subtree and import preview | TBD | Follow core trace readability |
| 5 | Effective step-state inspector and inheritance provenance | TBD | Next workbench improvement if time permits |

## Validation and evidence

- Foundation before rebase: 380 Node tests and 158 Python tests passed.
- Browser verified local import, invalid-input preservation, span selection,
  undo/redo, hidden-tab navigation, panel step folding and responsive layout.
- Rebased on main 378a030 without conflicts; build and Node suite rechecked.
- Phone preview: `http://192.168.1.242:8765/workbench/flowspec.html`.
  A separate localhost server uses the same port and worktree.
- Overnight heartbeat: `design-viz-overnight-build`, hourly through the cutoff.

## Design commitments

- Inclusive span duration is observed wall time. Child-covered time is the
  union of clipped direct-child intervals, not their sum. The remainder is
  uncovered wall time, not CPU time or a proven waiting interval.
- Preserve internal operations and parent IDs. Missing instrumentation may
  overstate the uncovered remainder; expose that limit.
- Layout must be deterministic and measurably reduce crossings on complex
  fixtures. Arbitrary non-planar graphs cannot promise zero crossings.
- Large traces need bounded focused views and explicit omitted counts.
- New widgets include validator, renderer, picker/inspector, contract,
  examples and tests. Regenerate template/workbench pages with source changes.

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
| 3 | Internal spans and inclusive / child-covered / uncovered timing | codex/trace-service-time | Open: https://github.com/reghartner/design-viz/pull/52 |
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
- PRs #50 and #51 passed all GitHub checks. PR #52 passed the full local Node
  suite, all 158 Python tests, and browser verification; CI runs on the PR.
- Added 7 layout tests (including seeded dense graphs and exact card-clearance
  checks) and 13 timing tests (including an independent interval oracle).
- Browser verified a 17-service/24-span trace, 22 routed relationships,
  readable-size/fit controls, operation/service selection, synchronized
  waterfall and details, backward jumps, retained focus and light/dark styles.

## Next continuation

Start from the current `codex/trace-service-time` branch, inspect checks and
working-tree changes, and create the next focused branch. Do not recreate the
three PRs above. Suggested next slice: import preview plus explicit service or
subtree focus before replacing the document. Preserve a route back to the full
trace and show omitted-span counts; selecting one service should not silently
reparent spans or claim complete coverage. Larger input support should be
bounded, tested and avoid rendering hundreds of step chips at once. Then add
the effective-state inspector to explain inherited values while editing steps.

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

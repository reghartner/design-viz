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
| 4 | Large trace focus by service/subtree and import preview | codex/trace-import-focus | Open: https://github.com/reghartner/design-viz/pull/53 |
| 5 | Effective step-state inspector and inheritance provenance | codex/effective-state-inspector | Open: https://github.com/reghartner/design-viz/pull/54 |
| 6 | Resizable workbench workspace / focused editing | codex/resizable-workspace | Open: https://github.com/reghartner/design-viz/pull/55 |
| 7 | Retry/timeout and circuit-breaker story | TBD | Reuse existing panels; add a focused software recipe/starter |

## Validation and evidence

- Foundation before rebase: 380 Node tests and 158 Python tests passed.
- Browser verified local import, invalid-input preservation, span selection,
  undo/redo, hidden-tab navigation, panel step folding and responsive layout.
- Rebased on main 378a030 without conflicts; build and Node suite rechecked.
- Phone preview: `http://192.168.1.242:8765/workbench/flowspec.html`.
  A separate localhost server uses the same port and worktree.
- Overnight heartbeat: `design-viz-overnight-build`, hourly through the cutoff.
- PRs #50, #51, #52, #53 and #54 passed all GitHub checks.
- Added 7 layout tests (including seeded dense graphs and exact card-clearance
  checks) and 13 timing tests (including an independent interval oracle).
- Browser verified a 17-service/24-span trace, 22 routed relationships,
  readable-size/fit controls, operation/service selection, synchronized
  waterfall and details, backward jumps, retained focus and light/dark styles.
- Focus import: full Node suite and all 158 Python tests passed. Twelve new
  tests cover deep 10,000-span analysis, descendant retention, unchanged child
  coverage, stable identities, boundaries, malformed exports, CLI summary and
  overwrite protection. Browser verified a 1,000-span preview without document
  mutation, one-span import, undo, clear-focus recovery, service descendants,
  invalid focus, stale-preview disabling and retained original offsets.
- Effective-state inspector: full Node suite and 158 Python tests passed,
  with 13 focused regressions for normal and specialized reducers, exact source
  paths, transient values, non-finite input and hidden-tab paths. Browser
  verified inherited/unpatched panels, transient overrides, exact selection,
  unchanged undo history, immediate stale-value clearing and read-only JSON.
- Resizable workspace: full Node suite and 158 Python tests passed. Four
  interaction tests cover bounds, persistence, keyboard modifiers, pointer
  cancellation and blocked storage. Browser verified real divider drags,
  keyboard limits/reset, reload persistence, unchanged spec and undo history,
  focus/exit, source collapse/expand, and a 390-pixel phone viewport. No console
  errors. PR #55 is open; check final CI before claiming it green.

## Next continuation

Start from the current `codex/resizable-workspace` branch, inspect checks
and working-tree changes, and create the next focused branch. Do not recreate
the completed PRs above. Workspace resizing and focus are built; keep phone
layouts usable and retain native text editing. Next, broaden software examples with an
explicit retry/timeout/circuit-breaker story using existing panels, with honest
authored timing and outcomes. Only add another widget when it expresses
something the existing catalog cannot clearly represent.

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

# Preseeded candidate files: single live-author smoke (PR #297)

Product head `a680b0c75ec51b4f13f05b95f393282d0945e2fa`, based directly on
exact main `3799dfa25e637290ea828e6acbb1b8bcbea674f4`. PR #297 is independent
of #292, #293 and #296, not stacked on them.

## Behavior under test

Before publishing a registered agent request, Workbench writes complete copies
of the request's exact spec and ledger under request-scoped names
(`candidate-<request id>.spec.json`, `candidate-<request id>.ledger.md`),
rereads both, and records `candidate: {spec, ledger, baseRevision}` in
`request.json`. Every `request.json` write phase rechecks both copies byte for
byte; a mismatch visible at those checks publishes no request. Agents edit the copies with their
existing native file tools. Proposal, preview, explicit **Commit update**,
result receipts, persistence and Undo are unchanged; nothing bypasses approval.

Copy request, Beta Send and native begin share this behavior; the trial used
the real registered Copy flow. Setup, copied-request, mandatory skill and
session guidance ship with it and are tested.

## Trial

One author, no retries, no cohort, frozen before launch.

- Fixture: 35,017-byte source and 40,829-byte ledger, adopted through the
  fixture disk adapter.
- Request: revise the `normal/h-upload` caption leaf
  (`page.blocks[0].diagram.steps[6].text`).
  - Before: `… The app's last event changes to the package.`
  - After: `… The app's Last event becomes **Package · 8:10 AM**.`
- Author: `claude-opus-5-5` configured, and observed in both init records. CLI
  effort was set to `high`; no observed internal effort is claimed.
- One process, two turns (request, then post-Commit follow-up), 69.403 s.
  Same-process evidence is the single-spawn driver, one invocation receipt and
  one shared session ID; no OS PID was retained.

## Observed result

- At publication the candidate pair matched the frozen fixture bytes, and
  `baseRevision` matched the request revision.
- Filtered public tool events: 13 Read, 1 Grep, 1 Edit, 0 Write, 6 Bash. The
  single native Edit targeted the request-scoped candidate spec. Reads of the
  candidate pair were whole-file (no offset or limit). These counts describe
  access and ordering only.
- Exactly one changed leaf; candidate, proposal-check, accepted and final
  sources are byte-identical. All ledgers equal the fixture.
- Validator 0 errors/0 warnings and state walk 0 warnings/3 checks, at baseline
  and on the proposal.
- One proposal, unconflicted real preview, one explicit Commit click, applied
  result and one completion reply, all bound to one request. No accepted write
  before Commit; the pair was stable at completion.
- 0 permission denials; no direct edits outside the candidate pair.

**Disclosed deviation.** The author's first state-walk command failed because an
expectation containing spaces was unquoted. The same process reran it quoted,
it succeeded, and only then did the author propose. This was an in-session
command correction, not a process retry or second proposal.

## Presentation

Root and an independent SOL reviewer each viewed the actual `normal/h-upload`
images at 1440 and 800 wide. Narrow pass: the revised caption is legible, Last
event shows `Package · 8:10 AM` inside the phone, and there is no horizontal
overflow. Last event sits below the initial 1000 px viewport at both widths
(y = 1083 and 1597), so seeing it requires ordinary scrolling. The DOM capture
covered 38 views with 0 page errors. No overall presentation grade is given.

## Product checks before the trial

- 64 folder-agent core tests, 3 agent-instruction tests and 6 copied-message
  tests pass; fresh build passes.
- 4 selected browser routes pass: one new real-file flow (candidate edit,
  proposal, preview, Commit, completion, Undo) and 3 existing route
  regressions.
- Earlier browser setup failures (two missing dependencies, one zero-test
  filter) are preserved separately; they preceded any author run.

## Known residual

File System Access has no exclusive create or compare-and-swap. The writer
rereads at every candidate and `request.json` write phase, refusing foreign
bytes visible at those checks; this does not make publication atomic or
guarantee the published pair equals the seed. Known windows include: an empty
file another process creates between lookup and create is indistinguishable
from the browser placeholder and may be filled with the seed; a foreign write
committed after a candidate's final pre-close reread can be overwritten by our
`close()` without later detection; and a candidate edit made after the final
pair reread in the `request.json` before-close guard, but before that close
commits, survives alongside a published request naming it. Request-specific
UUID names make accidental collisions unlikely but do not close these windows.
A detected mismatch publishes no request and restores no bytes.

## Scope

This is one completed editing flow. It makes no claim about context savings,
comparative quality, scores, causality or adoption. Tool counts and file sizes
do not measure tokens.

## Next step (status as of 2026-10-01)

The plan is conditional on this arm passing its gates, which it did: one
matched baseline author on ordinary exact main `3799dfa`, with the same
fixture, step, request, model, CLI setting, tool scope, disk adapter and frozen
renderer, but main's shipped guidance and fixed candidate names. It would give
one order-confounded pair, reported descriptively.

Root's single no-model baseline dry run
(`main-baseline-dry-2026-10-01-01/`, outside the repository) finished
`dry-run-passed`: all 20 gates passed, with no author and no Commit, and
cleanup completed cleanly. Its product was exact main `3799dfa`; the request
carried no candidate metadata and both fixed-name candidate files were absent.
Independent review of the adapted driver is pending, and the baseline author
has not been launched.

## Evidence

All artifacts are machine-local and git-ignored, and are not published with
this note. Raw and private logs were not inspected. Lab paths are relative to
the PR worktree's `.local/preseeded-candidates-2026-10-01/`; the bench run is
`preseed-smoke-live-2026-10-01-01/` outside the repository.

| Artifact | Location | SHA-256 |
| --- | --- | --- |
| Live freeze | `live-author-freeze.json` | `7500c167346d081e0664e4a87efda01d21e36e474a3d04d4076f6944001badb4` |
| Frozen driver | `preseed-author-smoke.mjs` | `08c63ba3c4e00caddcb29076b8d79252a2979862ccc99fc812ab1f08596244ca` |
| Fixture source | `author-fixture.spec.json` | `808e86104ff04ddbebc46b95d74e09796b3340a79f5bb5b5f6baeac52ca88c93` |
| Fixture/accepted ledger | `author-fixture.ledger.md` | `81f38a2364e1dc804c7fdeafbe351b79478705bb6d717673533f6733ff6c52ab` |
| Accepted source | bench final source | `0e9ac20a1a065462b52e955ec85bc8dc01d582e9b8845125d378416dcb62fe54` |
| Run summary | bench `smoke/summary.json` | `42153ebe7f273077cbca5c673295ce2b1772fa54eb5fe8b9a9da84b27392385f` |
| Publication receipt | bench | `622da622bd157bb1c74824c72954ab8627d42c7f384ba6bb051dddeb9eccb2d0` |
| Precommit review | bench | `e4c3dc9ce5309b08a49e0dba0a978a1f02fe4888e19669ae0cb4d3f51c0dbf83` |
| Commit receipt | bench | `2ebfd89b4c21e20f84894b7e95b2b6004c7a79934d6af3b6a981cb58b69b7ca2` |
| Completion receipt | bench | `b5377e4ec02d55a3af57e735e3a4100bbbb14a1f9929b591d32e56224cc5ec9f` |
| Invocation receipt | bench | `28672318c6307052ba3fd57685867989ea62f38fe2d9f3c9f9b1c076c1881749` |
| Filtered public transcript | bench | `39c214835e6e818c1fbb88880974c1bd0bb4f9de630484e1daded49a11fed352` |
| Capture verification | `live-capture-verification.json` | `66195733ac458c2de07b593aa27cf655c405070bf083ea2cd144a86de5680239` |
| 1440 image | `live-author-capture/screenshots/1440-1-normal-07-h-upload.png` | `f8a35f467d387d39467672bf9f4a72231273bcd9ce67e139a2c2ffb23fee3b8e` |
| 800 image | `live-author-capture/screenshots/800-1-normal-07-h-upload.png` | `8cb8b219853e1272ca85441819c6ebc65179be88b39e1874de378cd978f78d6b` |

Reviews: `live-author-review.json`, `live-author-visual-review.json`,
`root-live-visual-review.json`. Residual analysis: `core-fix-notes.md`. Next
step: `next-evidence-plan.md`.

# Existing-edit entry guide: caption-edit mechanism check

**2026-10-01** · branch `codex/existing-edit-guide` at `4acaf40c5dc28713b8b4ade12433bc7e78427f80`, from fresh main `3799dfa` · draft [PR298](https://github.com/reghartner/design-viz/pull/298), independent of PR297

## Result

One Opus 5.5 author used the new 3,870-character physical entry guide. It skipped the full `SKILL.md` and folder-session document and completed the caption edit. The accepted source, ledger and HTML are byte-identical to the prior local-copy run on main. This shows the mechanism worked once. It is not a presentation win and not evidence of general context savings.

## Change

The change is exactly one shared setup sentence plus the new guide and its tests. After `prepare`, that sentence now routes to `docs/folder-agent-existing-edit.md` instead of the mandatory full skill and session document. The full skill, session document, helper, copied-message rules and source-read rules are unchanged and still available.

## Run

- Observed model `claude-opus-5-5` with CLI effort configured `high`. One process ran two turns in 81.954 s and passed 41/41 gates.
- The author had zero errors, denials or retries. Tool calls: 2 `cp`, 1 Edit, 0 Write; 12 Read, 7 Bash, 3 Grep.
- One proposal, full preview, explicit Commit, applied result and reply. Exactly one leaf changed: the `normal`/`h-upload` caption in a 35,017-byte fixture. The 40,829-byte ledger was unchanged.

## Public Read results

| Returned chars | Guide run | Prior local-copy |
|---|---:|---:|
| Entry guidance | 4,083 (guide) | 31,544 (SKILL) + 14,390 (session) |
| Helper | 21,876 | 21,876 |
| Pair | 125,548 | 127,447 |
| All Reads | 162,476 | 209,516 |
| Whole / ranged | 9 / 3 | 11 / 4 |

These are raw returned characters, not tokens, unique input or peak context. "All Reads" includes metadata and setup reads, so it is not a guidance-only figure. Ranged reads were not necessarily small: one ranged `state.json` read returned 42,102 characters. This is one sequential observation. Methods, round trips and the prior run's failed walk all differ, so usage is not causally attributed and no percentages are claimed.

## Validation

- Passing checks: 3 instruction tests, 13 build tests and 1 real-browser `prepare`. The earlier browser setup failure, a zero-test filter, is retained.
- The Opus driver hit one Glob denial outside the worktree. This happened during implementation, not in the author run.
- The first dry run passed 22/22 gates with no author and no Commit.
- Root and SOL confirmed that the prompt differed only by the guide sentence, with the same task and allowedTools. All 30 pins were unchanged after the author run and capture.
- Root viewed the actual 1440- and 800-pixel images: caption and phone gates passed; 38 views, 0 errors. The Last event field sits below the fold (y = 1083 / 1597). `visual-review.json` passed the same narrow gate. Neither review gives an overall quality grade.

## Next

Preserve the draft. Run one substantive value-plus-ledger edit before initial creation. If widening is warranted, initial creation will use the original brief with a contemporary control and four SOL Medium item-level grades with computed totals. No caption cohort, no implementation adoption and no new API.

## Evidence

The evidence is machine-local and gitignored, and has not been published.

| File | SHA-256 |
|---|---|
| `author-freeze.json` | `cad5055736b7532b746e8c32f88130f136fa8feea4f7f23e67c58a24420d494e` |
| `author-review.json` | `b4c4353127430f8d8cd03686b59eff708fe6ae14a1a95b36ef88b9fa55b501b1` |
| `guidance-usage-review.json` | `58f97bd2ab78425aa9db1c0d1687287abbbcf00272ca1d1e2e4ddd1ef2290e56` |
| `capture-verification.json` | `a4b01cae2476900279a9fbe0991b52dfa9c925241d6ca93e98ca280e3a09c3a2` |

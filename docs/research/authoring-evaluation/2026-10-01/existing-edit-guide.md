# Existing-edit entry guide: caption and substantive trials

**2026-10-01** · branch `codex/existing-edit-guide`, from fresh main `3799dfa` · draft [PR298](https://github.com/reghartner/design-viz/pull/298), independent of PR297. The caption run was frozen at `4acaf40c5dc28713b8b4ade12433bc7e78427f80`. The substantive run used `29fb6ceff884658dc0dbf7bf029cdf612855f4d1`, which adds a legacy-path guide fix made after the caption run.

## Caption result (`4acaf40`)

One Opus 5.5 author used the new 3,870-character physical entry guide. It skipped the full `SKILL.md` and folder-session document and completed the caption edit. The accepted source, ledger and HTML are byte-identical to the prior local-copy run on main. This shows the mechanism worked once. It is not a presentation win and not evidence of general context savings.

## Change

The change is exactly one shared setup sentence plus the new guide and its tests. After `prepare`, that sentence now routes to `docs/folder-agent-existing-edit.md` instead of the mandatory full skill and session document. The full skill, session document, helper, copied-message rules and source-read rules are unchanged and still available. After the caption run, `29fb6ce` corrected the guide's toolkit path for legacy root-metadata sessions. The guide hash changed from `b8c411f2…` to `55d67623…`; the full skill, session document and helper still match main.

## Caption run

- Observed model `claude-opus-5-5` with CLI effort configured `high`. One process ran two turns in 81.954 s and passed 41/41 gates.
- The author had zero errors, denials or retries. Tool calls: 2 `cp`, 1 Edit, 0 Write; 12 Read, 7 Bash, 3 Grep.
- One proposal, full preview, explicit Commit, applied result and reply. Exactly one leaf changed: the `normal`/`h-upload` caption in a 35,017-byte fixture. The 40,829-byte ledger was unchanged.

## Caption run: public Read results

| Returned chars | Guide run | Prior local-copy |
|---|---:|---:|
| Entry guidance | 4,083 (guide) | 31,544 (SKILL) + 14,390 (session) |
| Helper | 21,876 | 21,876 |
| Pair | 125,548 | 127,447 |
| All Reads | 162,476 | 209,516 |
| Whole / ranged | 9 / 3 | 11 / 4 |

These are raw returned characters, not tokens, unique input or peak context. "All Reads" includes metadata and setup reads, so it is not a guidance-only figure. Ranged reads were not necessarily small: one ranged `state.json` read returned 42,102 characters. This is one sequential observation. Methods, round trips and the prior run's failed walk all differ, so usage is not causally attributed and no percentages are claimed.

## Caption run: validation

- Passing checks: 3 instruction tests, 13 build tests and 1 real-browser `prepare`. The earlier browser setup failure, a zero-test filter, is retained.
- The Opus driver hit one Glob denial outside the worktree. This happened during implementation, not in the author run.
- The first dry run passed 22/22 gates with no author and no Commit.
- Root and SOL confirmed that the prompt differed only by the guide sentence, with the same task and allowedTools. All 30 pins were unchanged after the author run and capture.
- Root viewed the actual 1440- and 800-pixel images: caption and phone gates passed; 38 views, 0 errors. The Last event field sits below the fold (y = 1083 / 1597). `visual-review.json` passed the same narrow gate. Neither review gives an overall quality grade.

## Substantive value-plus-ledger trial (`29fb6ce`)

One Opus 5.5 author (observed `claude-opus-5-5`, CLI effort configured `high`, one turn) was asked to correct the app's reported battery at Wi-Fi `w-back` from 21% to 20% and to update the ledger. Three outcomes are recorded separately.

1. **Frozen protocol: COMMIT-WITHHELD.** 34/35 gates passed. `review/source-footprint` failed, so there were 0 Commit clicks and no result, completion turn, reply or retry. The accepted pair is still the original fixture. This run stays a failure and is not relabelled a pass.
2. **Reading route.** The author read the short guide (4,100 returned chars) and `references/evidence-and-updates.md` (9,276), plus a ranged `spec_walk.py` read. It did not read the full skill or session document.
3. **Post-hoc, non-blind root/SOL review** of the proposal source, ledger and four actual images (`w-back`/`w-late` at 1440/800). The correction is right: `w-back` reports 20 and the next step, `w-late`, inherits 20 without a patch. The physical battery (21%), the normal path and unrelated values are preserved. The two related caption changes are accurate. The frozen harness wrongly enforced an exact footprint and rejected those two captions.

| Proposal leaf | Change |
|---|---|
| `steps[12].panels.app.battery.value` (`w-back`) | 21 → 20 |
| `steps[12].text` | says the reconnect check-in reported 20% |
| `steps[13].text` (`w-late`) | says the 20% check-in does not repeat the low-battery alert until re-armed above 30% |

The ledger proposal adds amendment A9 and decision D15 (43,760 bytes, not accepted). The same author hit one Bash walk error from argument quoting and corrected it; there were 0 permission denials. Cleanup logged a disconnect timeout because the open preview modal blocked the Agent-tab click. The driver still closed the browser and the author process.

The visual checks are narrow: 38 views, 0 page errors, no overflow. The Last event card at `w-late` was already clipped in the baseline, and it is unchanged. There is no overall presentation grade. Completion usage is not compared with the caption run because this flow did not complete and the task differs. No context-savings or causal claim is made.

## Next

The plan below is kept as written. Later, the guide was combined
with the clip-evidence cue, and one author ran that combined route once
through Copy for agent: see [tandem guidance trial](tandem-guidance.md). That
run does not change the verdicts above. Reported costs for these runs are in
[cost accounting](cost-accounting.md).

Preserve the draft. The next trial is initial creation. No further substantive author will run, and the failed run will not be replaced. Initial creation will use the original brief. If widening is warranted, it will add a contemporary control and four SOL Medium item-level grades with computed totals. No caption cohort, no implementation adoption and no new API.

## Evidence

The evidence is machine-local and gitignored, and has not been published. Local reviews: `substantive-author-review`, `substantive-guidance-usage-review`, `substantive-visual-review`, `root-substantive-visual-review`, `substantive-outcome-decision.json`. Substantive archive: `/Users/chuck/flowview-bench/existing-edit-substantive-archive-2026-10-01-01` (327 files, 37 frozen pins unchanged).

| File | SHA-256 |
|---|---|
| `author-freeze.json` | `cad5055736b7532b746e8c32f88130f136fa8feea4f7f23e67c58a24420d494e` |
| `author-review.json` | `b4c4353127430f8d8cd03686b59eff708fe6ae14a1a95b36ef88b9fa55b501b1` |
| `guidance-usage-review.json` | `58f97bd2ab78425aa9db1c0d1687287abbbcf00272ca1d1e2e4ddd1ef2290e56` |
| `capture-verification.json` | `a4b01cae2476900279a9fbe0991b52dfa9c925241d6ca93e98ca280e3a09c3a2` |
| substantive author freeze | `d07fa8fc3570f70b3127fb136aedfa33d61fda7da07cf73399fe0579194038a7` |
| substantive `summary.json` | `5158bdc1d4fb27f8e3e9fd1476b5eeaad399e8f800dee4386ec4a08396c43ba2` |
| substantive proposal source | `392911951409730069d3c65bfeecb215e32a60214c30988e7bbac482b2743b2a` |
| substantive proposal ledger | `632184f4861d6aa5ced27b274aecf0da7910effa22a8f42b74a89cb3196d4fbf` |

# Author instruction versus timing rubric: factual audit

The report should disclose a material instruction-versus-rubric tension. The timing deductions remain reproducible under the frozen adjudication interpretation, but these battery holds should not all be presented as unequivocal author mistakes. No scores, ledgers, rules, candidate bytes or model runs were changed for this audit.

## Exact instruction and evaluation language

Restored skill at `62a1c7a:.claude/skills/hld-to-page/SKILL.md`, rule 5, lines 71–75:

> If two anchors cannot both be met at the stated rate, the rate does not apply between them: hold the earlier value with `charge` patches on the steps between (no invented in-between values), jump at the next anchor, and say on the page and in the ledger that the given times and the stated rate disagree.

This is a positive instruction to author intermediate charge patches. It calls the held value the alternative to inventing intermediate values. It is more specific than the general instruction earlier in rule 5 to use automatic drift and source-backed clip drain.

Frozen original rubric, `tests/fixtures/authoring-evaluation/overnight/judge-only/judge2-prompt.md:13`:

> when two operator-given anchors cannot both be met at the stated rate, a direct jump between those anchors is correct and is not deducted if the author notes the conflict (ledger or page); in that case deduct −3 for each invented in-between value that uses an unstated rate

The original rubric does not explicitly name an intermediate hold of the earlier anchor as an invented value. There is ambiguity between retaining the first anchor until the direct jump and introducing a new interpolated value. The frozen calibration chose the stricter reading. `adjudication/calibration/rules.json`, rule `2-time`:

> When conflicting operator anchors are explicitly noted, a direct anchor-to-anchor jump is permitted. Any intermediate battery or temperature value that implies an unstated rate is a separate inconsistent change.

Final rate rows repeatedly apply this interpretation to an explicit intermediate 25% hold, describing it as an invented zero-drain rate. That is the direct instruction conflict.

## Trial-version proof

Rule 5 is byte-identical at restored `62a1c7a`, trial `bab5c539e906925a5f3c749b801e944cfad7b558`, and `1266f61`: extracted rule SHA-256 `4151c691864ec4ba998bc962b3cb69b8d84c6168db66d6b9d83aa78ab905d20d`.

The complete trial skill hash is `7ed4f47901d632b37d79b27a3d9fd5944d63f4091421a875a25679f4f5db1d32`. All six original `protected-files.before.json` and `after.json` records match it, as do all six diagnostic-continuation before/after records. The changed rule numbering location (restored line 60 versus trial line 73) reflects other additions, not a different battery instruction. A hook rejected a raw session-directory skill read; this verification instead used the committed trial source and structured protected-file hash records, without dumping the rejected session file.

## Observed author choices

The published ledgers explicitly invoke the hold policy: historical-business D5 (line 72), historical-engineer D1 (line 78), run-01 D5 (line 75), run-02 D4 (line 68), run-03 D4/T1 (lines 54/75), run-04 D1 (line 65), run-05 D2 (line 72), and run-06 D5 (line 77). Paths are under `adjudication/packets/<candidateId>/candidate/story.ledger.md`; `provenance.json` maps stories to candidate IDs.

Historical business/engineering and runs 01–05 hold the physical battery at 25% at the raccoon step, then retain the 20% approximately 4 AM anchor. Run-06 uses 24%, describing the clip cost as applied while the idle interval remains held. Thus run-06 is a variation combining the general clip-cost instruction with the exception; it is less literally the unchanged earlier value, and should not be described as identical to the others.

The newly authored 1 AM 25% reports in historical engineering and runs 01, 03, 04, 05 and 06 are genuinely new reported claims, not cached report carry-forward. However, treating the physical device as intentionally held at 25% until the later anchor gives those reports a coherent derivation within the author's instructed policy. This is an inference from the hold policy and the scheduled-report instruction, not a separate explicit command to publish a 25% report. Their distinction from physical state remains valid; the assertion that both are independently wrong under an always-applicable idle rate is conditional on rejecting the hold policy. Run-02 and historical business do not get this new-report deduction because they retain the older report.

## Suggested report qualification

“Battery-rate deductions reflect a mismatch between the authoring instructions and the frozen judging interpretation. The supplied skill explicitly told authors to hold an earlier charge with intermediate patches when anchors conflict with the rate; the adjudication treated those holds, and some new reports derived from them, as inconsistent intermediate values. Several authors documented that they were following the skill. We preserve the recorded scores and deduction ledgers, but these timing penalties are not an unambiguous measure of author error.”

This qualification applies to the identified conflicting-anchor battery holds and their report derivatives. It does not dismiss unrelated timing, visible-panel, edge, question or fidelity findings, and it does not establish an API-versus-file causal effect.

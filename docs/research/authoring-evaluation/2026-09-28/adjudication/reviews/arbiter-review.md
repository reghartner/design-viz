# Third-arbiter factual and unit review

Read-only audit of all eight completed third-arbiter ledgers in `.local/benchmarks/judge-adjudication-20260928/arbiters`. No model calls or replacement scores. All eight source specs, questions, renderer fact tables and interpretation files are byte-identical to the evidence reviewed for the paired audit. Every supplied claim is covered exactly once in each arbiter ledger.

This review preserves supported deductions. It narrows further review to the remaining concrete evidence challenges and the one cross-story counting inconsistency; it does not recommend reopening all judgments.

## Remaining evidence challenges

| Run / arbiter row | Status | Exact counterevidence and bounded question |
|---|---|---|
| 03 `DF001` | Confirmed premise mismatch; rule application needs correction/explicit justification | `/steps/7/panels/phone/clear=true` is an **authored** dismissal. The renderer shows an empty stack because of that patch, not automatically because `phoneScreen` changes. Frozen interpretation 5 allows an authored dismissal; HLD/answers provide no mandatory retention rule. The arbiter repeats that opening does not *automatically* dismiss, but does not explain why the explicit authored clear contradicts supplied behavior. |
| 03 `DP005` | Confirmed unsupported attribution in the explanation | Step 4 says “the phone now shows solar charging,” then “the low-battery mark stays.” It does **not** say “the phone's low-battery mark remains visible.” HLD puts `low_battery` in device-shadow. The earlier low-battery notification remains visible; the phone battery field is hidden. The solar promise is established; the extra promised phone-card mark is inferred. |
| 04 `D-P-002` | Confirmed source facts; classifier interpretation unsupported by a typed field or caption | `/steps/10/panels/sd` contains `state:"enqueue"`, `label:"Clip 8:05 AM (package)"`, `from:"PIR · ~20 s clip"`. It contains no classification-result field. Step 10 explicitly says nothing reaches ingest/store; step 13 explicitly places classifier output after reconnect. The label can describe the known clip content. The arbiter calls it a “package classification” without evidence that this generic queue label represents classifier output. Resolve that attribution once, rather than presuming classification from the noun alone. |

Exact evidence and quoted frozen rules are retained in `current-pair-review.md` challenges C1, C2 and C5. The current arbiter ledger still upholds run-03 claims A012/B016 under DF001, B012 under DP005, and run-04 A008 under D-P-002.

## Remaining grammatical/presentation interpretations

These are materially disputed applications, not false renderer facts. Present both readings in the focused appeal and retain the final same-level explanation.

- **Run-04 `D-E-001`:** the actual sentence is “The device page now reads **Battery 25%**, last report 10:30 PM.” It can mean the page now displays that text; it does not say the app reads **from shadow**. The arbiter interprets “now reads” as a network read. Frozen interpretation 3 distinguishes representation from read/fetch execution. Historical-engineer's comparable “The device page reads 25%…” is treated as representation. The current heartbeat's camera/router/ingest/shadow edges are lit. The separate missing app/shadow topology finding is sound and should remain untouched.
- **Run-04 `D-P-001`:** the full paragraph explicitly says animal events are saved to the timeline with no push; its subsequent notify-service clause says “so nothing reaches the phone.” The visible event card reads `Saved to timeline · no push`, and notifications are empty. The arbiter now explicitly chooses the broad literal reading despite the correct no-push wording. That is a disclosed scope-of-language choice, not evidence that an animal alert exists. The alternative contextual reading limits “nothing” to notifications.
- **Run-02 `D004`:** Q6 asks “Should it show the phone?” and proposes depicting the camera page and alerts. HLD establishes phone/app behavior, but does not separately prescribe how to visualize that behavior. The arbiter's reason proves the phone is the customer surface, not that a **presentation choice** was already answered. Interpretation 1 separates supplied facts from unanswered presentation preferences. The counterargument is that the requested scenario makes a phone depiction necessary; the appeal should decide that inference explicitly rather than treating it as verbatim HLD direction. Existing physical-battery, label, clip-display and other question rows are outside this challenge.

## Material cross-story question-unit inconsistency

The arbiter bundles battery/not-charging into one redundancy in run-01 `D-Q-REDUNDANT-Q5`, but splits them in run-03 `DQ003`/`DQ004` and run-05 `D-Q6-BATTERY-001`/`D-Q6-CHARGING-001`.

Exact prompts:

- **01 Q5:** “Starting situation: how should the phone look at bedtime?” Default: phone locked/no alerts; app shows “Battery 25% · updated 10:00 PM”, not charging.
- **03 Q5:** “Starting situation. Suggested: camera at 25% and not charging, Wi-Fi working, the phone's camera page showing ‘Battery 25% · updated 10:00 PM’, and no alerts yet.” No separate interrogatives divide battery and charging.
- **05 Q6:** “Starting situation at bedtime.” Default: phone on nightstand/no earlier alerts; app shows “Battery 25% · updated 10:30 PM”, not charging, online. “Is that right?”

There is no grammatical battery-versus-charging separation in 03/05 that is absent in 01: all are compound starting-state proposals. Either property can be answered while the other remains unanswered in all three. **If these default supplied-state clauses count as requested confirmations, the frozen independent-decision test calls for consistent splitting or grouping across the three prompts.** The alternative issue is whether a presentation question's default supplied facts are independent confirmation requests at all; that reading must also be applied consistently. This is a counting-unit inconsistency supported by exact wording, not a request for a new scoring policy or a replacement score.

## Resolved disputes: do not reopen

- **Run-01 hidden courier power versus visible open:** the arbiter rejects B013 explicitly: “The normal-path defect is scored once at its visible manifestation at open, not again as hidden state at courier.” Thus the proposed duplicate hidden/visible unit is gone. D-TIME-OPEN-POWER remains supported by the visible 07:00 power report alongside the authored 08:00 battery report.
- **Run-01 other hidden power rows:** raccoon/low-battery/sunrise and Wi-Fi-down/reconnect assert different later report times while power metadata remains at 22:30 or 07:00. Those are distinct authored report claims, not app/shadow mirrors or the same shared step repeated across paths. They remain hidden, so they are not scored as visible freshness. No additional concrete renderer counterfact was found against them.
- **Run-01 new 01:00 battery report:** now included as D-TIME-RACCOON-REPORTED, with the explicit value/report-time patch correctly distinguished from the physical battery.
- **Run-06 Q5 overstatement:** the arbiter corrected the explanation to the supplied 25% bedtime clause alone; it no longer claims Q5 asked about not-charging.
- **Mirrored report units:** run-04 app/shadow, run-05 app/shadow and run-06 phone/record each remain one reported-value deduction per authored report, distinct from physical charge. No duplicate remains.
- **Both baselines:** no new material factual dispute. Historical-business's proposed separate meter can make the exact question count debatable, but its greater-than-seven conclusion holds without that item. The baseline phone-report distinction remains sound: business carries bedtime state; engineer explicitly advances the report to 01:00.
- **Run-03/other missing displays:** explicit phone-report/solar/Online promises are actually hidden. The arbiter further splits compound bedtime battery/power and Wi-Fi report/Online displays into field-specific units. Their absence is factual; whether a compound visible state is one or several panel events remains interpretive sensitivity under the existing event-unit rule. It does not introduce a different source or renderer dispute and should not start another open-ended judging cycle.
- **Run-05/06 other findings:** physical/report-rate states, missing engineering topology and absent normal clip visual are supported. No new factual appeal is identified beyond run-05's starting-state question units above.

## Bounded handoff

The focused final appeals can preserve all unchanged rows and address only: the three evidence-attribution challenges, the three explicit grammar/presentation choices, and the cross-story starting-state counting unit. Record any remaining interpretation sensitivity after that same-level decision; do not reroll until all readers select the same grammar.

## Reviewed evidence identity

Result files are `arbiters/judgments/<candidate>/judge-1/result.json`. Source pointers above are under `/page/blocks/0/diagram` unless their full prefix is shown.

| Story | Candidate | Result SHA-256 |
|---|---|---|
| historical-business | `specimen-f4d35ae7d929` | `c62e28ff4446c33eea2153247c2e6cc0b32166e42e7f1a2f336a2c403d020d42` |
| historical-engineer | `specimen-5395841c704d` | `44341d2e94d2470f0e0fe792072bfbc35679adfce90e6b87a627693b2ac91caa` |
| run-01 | `specimen-87e36f6ebc2e` | `14bf9af5c8058188ef3ae901c6bf2bf7051e75eb8e15810ab657fa6ca49a5c61` |
| run-02 | `specimen-7036a4f62b32` | `6e610954960ff621db1ca053427e79be678b58fe17ac22f4a4ae017af19aa7f7` |
| run-03 | `specimen-3d313b05cc71` | `9d17adafd6c9ea4fa2e6853f26833a59abbc9a403ee6c81eb3fde40300408074` |
| run-04 | `specimen-8abdbcba1a1f` | `fc254af680d6aac9b5ad5bee5fec411230b6d209a985c7afec97971132479c9c` |
| run-05 | `specimen-fba9ebbeb297` | `7242dc73b11df5371013240285dc234882e19f86d2434eaa78a56f0239423892` |
| run-06 | `specimen-8c365a9d184d` | `27916787fa6677076a97842ef7672878ae800dd6740feb2a714970162ee19bbd` |

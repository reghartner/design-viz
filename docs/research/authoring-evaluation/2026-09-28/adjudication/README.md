# Reconciled judge scores for the exact saved outputs

The six editor outputs average **79.3/100**, compared with **90.5/100** for the two saved CLI specimens, a descriptive gap of **11.2 points**. Business averages **76.0 versus 91**; engineering averages **82.7 versus 90**. These are reference scores under the original rubric with disclosed, consistently applied interpretations and verified renderer evidence. They are not an estimate that the API itself costs 11.2 points.

The original audit used **GPT-5.6 SOL / medium**. We verified its actual run headers and used that same model and reasoning effort throughout this adjudication, with `service_tier="fast"`. The author stories were not regenerated or edited. Both historical stories were assessed under the same pinned current renderer as the six current stories.

[HTML report](report.html) · [Results and composition](results.json) · [Predeclared plan and amendments](../../adjudication-plan.md) · [Frozen interpretations](../../adjudication-interpretations.json) · [Original scores and evidence](../README.md)

## Reference scores

Original values are historical medians, except the incomplete run-01. Reference values are computed from the final deduction ledgers, not medians of judge totals. Criterion caps are applied separately.

| Story | Original | Reference | Questions | Level | Time | Edges | Panels | Backstage | Fidelity |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| historical-business | 96 | **91** | 7/10 | 10/10 | 17/20 | 15/15 | 12/15 | 15/15 | 15/15 |
| historical-engineer | 90 | **90** | 8/10 | 8/10 | 14/20 | 15/15 | 15/15 | 15/15 | 15/15 |
| run-01 | Incomplete (70, 63 valid) | **68** | 5/10 | 6/10 | 12/20 | 15/15 | 0/15 | 15/15 | 15/15 |
| run-02 | 80 | **88** | 6/10 | 8/10 | 17/20 | 15/15 | 12/15 | 15/15 | 15/15 |
| run-03 | 88 | **72** | 5/10 | 8/10 | 14/20 | 15/15 | 0/15 | 15/15 | 15/15 |
| run-04 | 80 | **87** | 5/10 | 8/10 | 14/20 | 15/15 | 15/15 | 15/15 | 15/15 |
| run-05 | 87 | **83** | 4/10 | 8/10 | 14/20 | 15/15 | 12/15 | 15/15 | 15/15 |
| run-06 | 79 | **78** | 5/10 | 8/10 | 14/20 | 15/15 | 6/15 | 15/15 | 15/15 |

The current six-output median is **80.5**. Do not calculate an original six-output mean by silently discarding run-01: its third original judge had invalid arithmetic. Its individual criterion scores summed to 73 while its reported total was 83; that original response remains preserved as invalid.

## Why the judges disagreed

- **Incorrect renderer assumptions.** Homemap signals are step-local. Two original run-02 judges each deducted 12 points for arrows that did not exist; an original run-03 judge made one similar 3-point deduction. All nine allegations have [exact state evidence](verified-signal-errors.json). Hidden phone field cards were also confused with visibly false freshness values. The actual production fold and 141 real browser path-step occurrences were checked.
- **Different interpretations of the same words.** “The page now reads Battery 25%” describes displayed text; it does not establish a new network fetch. A queued “package” clip label does not establish on-device classification. An explicitly authored `clear:true` is not an assumed automatic dismissal. The final appeals preserve both the initial arguments and the counterevidence, then record each ruling.
- **Inconsistent scoring units.** Seven numbered questions can contain more than seven independent decisions. Conversely, asking whether to show a phone or emphasize a moment can be a presentation choice, even when the source already describes that behavior. A final common pass applied the same question rule to all eight batches, including battery/charging confirmations, and used only facts supplied before the questions to decide redundancy.
- **Real defects were also missed.** The historical business specimen has an inconsistent intermediate physical battery and a promised solar app state hidden behind the phone home screen; its reference is 91, not 96. Run-03's previously high score missed numerous promised visible app states, yielding 72 after correction. Correcting judging does not simply raise every score.

## What still separates these outputs

The business outputs particularly need to show the app state they narrate: battery report, charging, and cached state during the outage. Normal clip opening needs a visible clip/screen state in runs 01, 02, 05 and 06. Every current engineering output omits the source-established app/device-shadow dependency. Inconsistent intermediate physical battery values occur in all six; five also explicitly author a separate inconsistent 1 AM battery report. Run-02 instead carries its bedtime report and receives no new-report deduction.

Backstage metadata scored 15/15 in all eight under the fixed rule: a correct singleton `binding.api` is a catalog identity link and need not list every endpoint that the service can handle. Explicit step-call assertions still must match approved operations.

Some rubric costs concern presentation and question wording, so these numbers do not replace usability judgment. The run-03 low-marker placement remains a contextual interpretation after appeal; accepting the contrary reading would remove one panel deduction but would not change the capped panel score or total. Other reasonable rubrics could value the artifacts differently.

## How the reference was produced

1. Preserve all 24 original judge responses, their claims and the one invalid arithmetic response. Freeze the original rubric, exact eight author sources, current renderer facts and common interpretations.
2. Run two independent same-level adjudicators per story with complete UTF-8 evidence inline, without previous scores or workflow labels. Author style can still reveal the workflow, so this is limited label blinding.
3. Review agreements as well as disagreements against source and renderer facts. Run a third same-level arbiter for each story with both arguments; no averaging or desired total.
4. Submit six specific surviving challenges across three stories once more, with the exact preceding ledger and counterevidence. All unchallenged deduction rows remained unchanged. Five challenged deductions were rejected; the low-marker placement deduction was upheld.
5. Resolve a discovered cross-story question-unit inconsistency with one same-level pass over all eight question batches. Its question deductions exclusively replace that criterion in every final ledger. All other criteria come from the reviewed arbiter or evidence appeal.
6. Compute each criterion as `max(0, cap - sum(deductions))`, then add the seven criteria. Keep the accepted/rejected claim decisions, intermediate assessments, and final composition separately.

This used 16 successful paired assessments, 8 arbiters, 3 evidence appeals and 1 common questions assessment, plus an earlier unscored interpretation calibration. The first 16 adjudication requests failed before model generation because the API rejected a wire-schema keyword; the [failure record](wire-format-failure.json) remains preserved. Removing that unsupported wire keyword retained the same duplicate validation in the host. One empty-output format probe verified the repair. These were not discarded low scores or hidden rerolls.

## Evidence and reproducibility

- `packets/<candidateId>/` contains each exact initial neutral packet: source, questions, ledger, operator answers, HLD, rubric, renderer facts and the 202 original deduction claims.
- `stages/<stage>/prepared.json` records exact file and full-stdin hashes, fixed model/effort/tier, prompt hash and output schema hash. To reconstruct a later packet, begin with its base packet, then overlay `stages/<stage>/packet-overrides/<candidateId>/`. The common questions packet is entirely in its overrides directory. Use the tracked adjudication tool's `compose_prompt()` over sorted packet files to verify the original inline prompt hash; no account call is needed.
- Every exact structured model response is in `stages/<stage>/judgments/`. `final-ledgers/<story>.json` records the host-computed reference and the hashes of its two composing assessments. `provenance.json` maps neutral candidate IDs and original claim origins; stage provenance records subsequent claim origins.
- `renderer-verification/` records pinned renderer hashes, production-fold extraction, 141 browser checks and the separate proof that both historical normal endings do contain a visible clip/screen state.
- `reviews/` preserves independent factual review. The published file manifest pins all artifact bytes. Original 68 published evidence files and their manifest are unchanged.

The packet content and model responses are preserved exactly. Machine-local CLI stdout/stderr remain in the local experiment archive; they are not published as account/session logs. Prepared metadata retains the original input-manifest hash, whose only extra data was local staging-directory placement; the semantic packet and full-stdin hashes are independently reproducible from the published content.

## Limits of the comparison

There are three current authors per audience and only one saved CLI author per audience. Skill revision, system prompt, permissions, renderer and six-way concurrency differ. The reference scores establish differences between these saved artifacts; they do not isolate an API transport effect, estimate population quality, or provide statistical confidence intervals. Original medians remain original measurements rather than being overwritten with these adjudicated values.

# Exact-v1 contemporary replication: results

The registered cohort finished, and focused-v1 does not qualify for promotion, for two independent reasons:

- It missed the original 20% context screen.
- The source audit triggered the repeated new correctness-defect guard.

The strict quality comparison is also incomplete because one control grade is invalid. No strategy is promoted. Structured values and evidence bindings are in [v1-replication-results.json](v1-replication-results.json).

## What was compared

Eight fresh Claude Opus 5.5/high authors ran on the common current scaffold `3799dfa25e637290ea828e6acbb1b8bcbea674f4`. Four used the historical corrected-control guidance. Four used the exact eleven-path historical focused-v1 guidance. Everything outside those eleven path states was identical: runtime, wrappers, prompts and fixtures. All eight authors completed and were accepted. The [single unscored feasibility trial](v1-replication-feasibility.md) ran first, and its result, including its recorded deviation, is unchanged.

This comparison does not cover:

- today's default guidance;
- a full reproduction of the historical environment;
- Workbench adoption or compatibility.

PR292 and PR293 were neither stacked nor measured. Both historical Workbench JavaScript inputs are inert in this initial-authoring comparison.

## Grading

There were two blocks, each with four reviewer invocations configured for SOL 5.6 Medium under the frozen v3 profile. Every session graded all five anonymous candidates in a fixed rotated order: two focused, two control and the same historical anchor. Each candidate came with eight direct images. One actual grader pilot passed before the grading fanout. It was then excluded and was never used as a substitute grade.

All 40 grades were retained: 32 fresh grades and 8 anchor grades. Of these, 39 are valid and 1 is invalid. In block 01, reviewer R3's grade for C01 (control run-03) declared a total of 87, while its seven criteria sum to 92. The frozen v3 parser therefore rejects it. That grade was not repaired, retried or replaced. All 8 anchor grades are valid, as are 31 of 32 fresh grades.

The fixed rule requires four valid grades per author. Run-03 therefore has no correctness or presentation aggregate. As a result, the control-arm means and both primary arm differences are null. This report gives no available-case or repaired mean or delta, and it draws no conclusion that quality was preserved or worsened.

| Author | Arm | Block / candidate | Peak context, tokens | Correctness mean | Presentation mean |
|---|---|---|---:|---:|---:|
| run-01 | focused | 01 / C02 | 202,179 | 85.5 | 18.25 |
| run-02 | focused | 02 / C03 | 200,351 | 93.25 | 17.5 |
| run-05 | focused | 01 / C03 | 190,969 | 86.5 | 18.5 |
| run-06 | focused | 02 / C01 | 189,599 | 81.0 | 19.0 |
| run-03 | control | 01 / C01 | 200,172 | null | null |
| run-04 | control | 01 / C05 | 211,605 | 92.5 | 21.75 |
| run-07 | control | 02 / C05 | 228,627 | 92.25 | 19.5 |
| run-08 | control | 02 / C02 | 234,749 | 90.75 | 19.25 |

The historical anchor (C04) scored 82.25 / 16.5 in block 01 and 82.0 / 18.5 in block 02. These scores are block-specific descriptive context, not a control. Both blocks graded the same anchor source, but they used different fresh captures, reviewer sessions and order. The between-block difference therefore isolates neither reviewer-stage drift nor any other single cause.

## Original screen

| Criterion | Threshold | Result |
|---|---|---|
| All focused authors complete | 4/4 | met |
| Mean peak-context reduction | ≥ 20% | **missed**: 10.5187% (summary rounds to 0.1052) |
| Correctness difference | ≥ −3 | cannot be assessed (null) |
| Presentation difference | ≥ −1 | cannot be assessed (null) |
| No new repeated source-confirmed correctness defect | 0 families | **failed**: 3 families, each in ≥ 2 focused / 0 control |
| No attributable author-flow or transport regression | — | none found in the bounded public audits |

Mean peak context was 218,788.25 tokens for control and 195,774.5 for focused, a gap of 23,013.75. The exact reduction computed from these means is 10.5187321531%. Neither the failed defect guard nor the context miss changes or fills in any score.

## Repeated-defect source audit

The original guard fires when the same frozen rule and source symptom are confirmed in at least two focused outputs and in no control output. The final source audit found three families that trigger it:

| Family (rubric row, deduction) | Focused | Control |
|---|---|---|
| Opened package clip has no visible matching still or thumbnail (`panels`, −3) | run-01, run-05, run-06 | none |
| Questions independently ask the operator to restate the supplied starting state (`questions`, −1) | run-02, run-05 | none |
| Caption says the app reads a value without lighting the app request and reply hops (`edges`, −2) | run-01, run-05 | none |

This audit is a diagnosis, not a rescore. All raw grades, including the invalid one, are unchanged. The audit's findings do not fill in the missing primary quality values.

**Retained correction.** The first version of this audit counted the missing-clip family as 4 focused / 0 control. After the root coordinator questioned run-02's symmetry with the controls, a direct inspection of its folded state and its 1440 and 800 opening captures showed something different. Run-02 retains a visible, matching package-drop still at the opening. The frozen rule does not require a "Playing" label, which also matches how control run-03 was treated. The corrected count is 3 / 0. The original audit is preserved as `-v1`. The block-02 R1/C03 reviewer allegation to the contrary is unsupported under the frozen interpretation, but its grade is unchanged. In run-05, by contrast, the screen is explicitly hidden at `package-alert` and not restored at the opening.

**Cause not established.** The exact matching-still rule and the customer-visible-fields rule are byte-equivalent in the two kits. The focused kit's catalog/guide routing does not cross-link a textual clip card to a visible matching Screen. That is only a hypothesis. Reading behavior does not support a simple skipped-guide account:

- Focused run-02 and run-05 and control run-07 and run-08 all read the camera-events guide.
- Run-02 included a Screen, read that guide and passed the rule.
- Controls run-03 and run-04 passed without reading it.

Three focused outputs omit or hide the screen.

**Selected conditional candidate.** After the final Fable consult (corrected advice `6db2e6c3…`), the root coordinator selected one conditional quality-repair candidate. It is a small cue in the existing catalog/guide output, with matching agent guidance, saying two things:

- When a clip is opened, a visible matching Screen must be shown, not just a textual Device app card.
- The Screen's inherited visibility and state must still show that matching scene at the opening step. Retaining a matching still is enough; no "Playing" label is required.

The cue addresses only the missing-clip family. The two other 2/0 families remain unrepaired, so it cannot clear the guard.

Before any implementation, SOL first maps whether the cue can be carried by the exact helper and by the current Workbench Copy for agent / Work with agent path. These constraints apply:

- The existing catalog must stay under 8,000 B.
- There must be no new required helper calls, modes or reports. Incidental variation in extra calls is retained and assessed, not automatically blamed on the treatment.
- The work reuses the current proven initial-authoring flow; the stopped edit pipeline stays closed.
- One actual inspected trial must come before any fanout, and a new prospective registration must come before any cohort.

Nothing is implemented, trialed or adopted, and no context claim is made.

## Integrity audits

- **Grader integrity.** The audit is complete.
  - **Sessions:** eight distinct reviewer sessions, none of them the pilot.
  - **Images:** all 40 per reviewer, with hashes and order consistent.
  - **Command access:** 200 public command executions, all bounded to the review packet.
  - **Reconnects:** 32 automatic reconnect messages, all within the eight retained invocations.
  - **Replacements:** none.
  - **Arithmetic:** the 87-versus-92 failure is retained, and the strict null quality result is correctly applied.
  - **Reviewer model:** the commanded model and effort (SOL 5.6 Medium) are verified. Provider metadata reporting the actual model and effort is absent, so the actual reviewer identity is not independently observed. The artifact checks pass, but that is not provider model verification.
- **Author flow.** No concrete treatment-attributable cause was found in the bounded public command/result audit. The grading arithmetic failure belongs to reviewer output, not to the author flow.
- **Metrics.** All eight authors' metrics independently matched 64 of 64 public-usage crosschecks. No private reasoning was inspected.
- **Capture.** All 10 of 10 candidate slots produced 376 views, with no page errors and no horizontal overflow. 80 image roles were bound. This is mechanical evidence and says nothing about quality.

## Context location

Mean context at the first spec Write was 184,209.25 tokens for control and 164,192 for focused. That first-write gap of 20,017.25 tokens already accounts for most of the 23,013.75-token peak gap. Bytes are not per-file tokens, and none of these figures is causal proof. The helper-intake and broader guidance inventories found no within-author reread or duplication that would justify a trim. [context-followup.md](context-followup.md) has the details.

## Unchanged records

These earlier results stand as recorded:

- the historical v1 miss (14.49%);
- the v2 failure;
- the incomplete composition result;
- the inconclusive stop of the edit pipeline.

The historical and contemporary context deltas are separate, non-contemporaneous estimates and are not pooled. Exhausted edit repairs are not reopened. PR292 and PR293 remain draft, unmeasured candidates.

## Evidence bindings

- Primary review summary: `28d35c94edd1d06adda19807721f6075a1a56ac17ae6cc86073d47aabf21072f`.
- Corrected repeated-defect audit: `87c152c17101b70e36e8d937d2496c7a7876e1a2f4b3c842ac9438e2aff50369`. The superseded v1 JSON is preserved at `d71f7631dc32020561d600c140f27808dc1f4706541b21cf92745a178900a83c`.
- Grader integrity audit: `3256193d51dc0dbbc3f8ea3f71592685f16d889ff7f8354544b1213ae07cf929`.
- Frozen current inputs (144 paths): `5dda0ff09dc911768a830fd38b33f94aa71be70b8ac3ae70b75f201c391255ad`.
- Exact frozen-input capsule receipt (144 paths, 140 unique blobs, 17,703,823 bytes): `c0972f3bfb89e83b63b80a71ec178f9897078a39d0e706bccec07cd795c51583`. The capsule holds the frozen experiment inputs, including evidence and report material. It is not a product-source snapshot.
- Review-output archive receipt (100 paths, 94 unique, 5,265,686 bytes): `bc5b5ef95f1ac3364b5e78207f6a59849d1678881ed87cdd5cab3bd224337c30`.
- Excluded grader pilot result: `a30f4e3215f74b83ea9b7346aec934b4884db1d0dd685165eea06f3b53bdc6f6`.
- Author-flow audit report: `af6fd6fb1ed8433ddf179c9e31ef89d65f3596f78b96b9c508d4fee8a7c452a9`.
- Context waterfall: `a33af8a5ba8f209bbc78a0b09ea9bf61e66c859a664b4e3b7178ced015e94402`.
- Non-widget guidance intake: `58bbd2e3712fd12a05df37366b758db4d569738bfb5ca1277a84afdd5be76d85`.
- Fable post-results corrected advice: `6db2e6c34d6aa9fe209a8a7ad3c21fabdb712973bdf83a74e2399cda70871f11`.

Both archives are opaque local archives, and neither is a portable, runnable package. This publication contains summaries and exact evidence bindings only. It includes no raw logs, session content or private reasoning.

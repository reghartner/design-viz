# Current-pair factual audit and unscored challenges

Scope: the twelve paired-v2 adjudications for run-01 through run-06, checked against their exact packet sources, questions, approved HLD/catalog, pinned renderer facts, and frozen interpretations. No new scores, model calls, candidate edits, or rule changes. These notes are evidence challenges for the same-level adjudicator; agreement between two judges is not treated as factual proof.

## Priority challenge notes

### C1 — run-03 explicitly authored notification clearing

Affected: judge 1 `DF001`; judge 2 `D-F-OPEN-CLEAR` (`fidelity.behavior`).

- The actual source `/page/blocks/0/diagram/steps/7/panels/phone/clear` is `true`. The step explicitly changes `phoneScreen` to `app`, and the separate camera screen says `Playing on the resident's phone`. Renderer facts for normal/a-open confirm the notification stack becomes empty.
- The judges reason that opening a clip does not *automatically* clear notifications. That renderer fact is true, but automatic clearing is not what this source does: it supplies the explicit clearing instruction.
- Frozen interpretation 5 says a notification may remain “unless an authored step or the source explicitly dismisses it or changes its state.” The pinned renderer semantics likewise say only a `clear:true` patch clears the stack. HLD and answers specify no retention/dismissal contract.
- **Challenge:** neither adjudication identifies an established source behavior contradicted by this explicit dismissal. The clear exists; the explanation misattributes it to automatic app-open behavior. An arbiter should evaluate this against the already frozen allowance for authored clearing, without inventing a mandatory retention rule.

### C2 — run-04 queue label does not establish a premature classifier result

Affected: judge 1 `D-P-002` (`panels.contradiction`).

- Step 10 `/panels/sd/label` is `Clip 8:05 AM (package)`; `/panels/sd/from` is `PIR · ~20 s clip`. Its state is `enqueue`. The queue has no authored classification/status field asserting a classifier response.
- Step 10 caption explicitly says the clip cannot reach event-ingest or clip-store. Step 13 text explicitly places motion-classifier's **package** classification after reconnect at 08:16.
- **Challenge:** the deduction converts a generic content label into a classifier-result assertion. The word “package” can describe the known scene/clip content for the viewer. Nothing in the supplied renderer semantics gives queue labels the type “classifier output.” This is unsupported inference, not a demonstrated contradiction. The original argument and these exact counterfacts should remain available to the arbiter.

### C3 — run-04 animal wording has two readings; no animal alert is rendered

Affected: judge 1 `D-P-001` (`panels.contradiction`).

- Step 2 text first says “Animal events are saved to the timeline with no push (default user setting),” then says only person/package events go to notify-service, “so nothing reaches the phone.”
- `/steps/2/panels/app/event` explicitly becomes `Animal · 1:10 AM` with detail `Saved to timeline · no push`. Pinned renderer facts show that field card visible and the notification count zero on both paths.
- **Challenge/ambiguity:** read literally without context, “nothing reaches the phone” conflicts with the visible timeline update. Read in its immediately preceding notification clause, it means no push reaches the phone, which the display satisfies. This is not factual evidence of an animal alert. The frozen rule against inferring executions beyond the actual wording makes the contextual scope important. The arbiter should state which reading it applies rather than claiming the renderer sent an alert.

### C4 — run-04 “page now reads [text]” is not an unambiguous fetch claim

Affected: judge 1 `D-E-001`; judge 2 `D-EDGE-BEDTIME-001` (`edges.unlit_message`).

- Exact step 0 sentence: “The device page now reads **Battery 25%**, last report 10:30 PM.” Its subject is the page and its object is the displayed text. It does not say the app now reads **from device-shadow**, fetches or refreshes.
- The same caption explicitly describes a current camera heartbeat through router/ingest to shadow, and those three edges are lit. The app's displayed 25% is present and visible.
- The missing engineering app/shadow topology is independently factual and remains distinct. The challenge concerns the *additional current fetch* inference only.
- Frozen interpretation 3 distinguishes current read/fetch from representation; its example includes “from the shadow.” Historical-engineer bedtime similarly says “The device page reads 25%…” and both baseline judges treat that as display wording. In all eight sources, the clear contrasting fetch examples are historical-business `a-open` (“app reads the camera's status,” with matching read edges) and run-05 `open-clip` (“app fetches it from clip-store,” with explicit GET).
- **Challenge/ambiguity:** “now” makes the display current; it does not by itself change the grammatical page-content statement into a network operation. Preserve this wording issue for a consistent same-level resolution.

### C5 — run-03 low-battery mark is not explicitly promised on a phone card

Affected: judge 2 `D-P-CHARGING-LOWMARK` (`panels.missing_event`).

- Step 4 caption says the phone now shows solar charging, then: “The battery is still under 30%, so the low-battery mark stays.” It does not say “the phone's low-battery mark,” as the deduction explanation does.
- HLD defines `low_battery` as a camera state set by device-shadow, with re-arming above 30%. The existing `Porch Cam battery low` notification remains visibly rendered at this step. The battery field card is hidden, but the caption does not clearly promise that card/icon.
- **Challenge:** the separate deduction imports phone-card ownership into an unlocated low-battery state statement. The promised solar display is a distinct, clearly supported missing event because the caption explicitly names the phone and the solar field is hidden.

## Checks across all six current pairs

### Physical versus newly reported battery

All six explicitly set a raccoon physical battery value inconsistent with elapsed idle drain: run-01 through run-05 set 25; run-06 sets 24 (clip cost only). The noted conflicting anchors do not make these extra intermediate overrides a direct anchor jump under interpretation 2.

| Run | Report at raccoon | Verified source/fold fact | Pair issue |
|---|---|---|---|
| 01 | Newly authored 01:00 report, 25 | `/steps/1/panels/phone/battery/value=25`, `reportedAt="01:00"`; renderer resolves 01:00 | Judge 1 omits this unit; judge 2 includes it. It is not carried bedtime state. |
| 02 | Carried bedtime report, 25 | No raccoon phone patch; value/time origins remain initial, report resolves 22:30 | Both correctly avoid treating it as a new 01:00 report. |
| 03 | Newly authored 01:00 report, 25 | `/steps/1/panels/phone/battery` sets value and report time | Both identify a separate report unit. Only pre-01:00 idle drain matters to this report; the raccoon clip occurs later. |
| 04 | Newly authored 01:00 report, 25 | app report time advances; shadow row explicitly says 01:00 and 25 | Both consolidate shadow/app mirrors into one report unit. |
| 05 | Newly authored 01:00 report, 25 | app value/report time and shadow rows authored in step 1 | Both consolidate mirrors into one report unit. |
| 06 | Newly authored 01:00 report, 25 | record rows plus phone report-time patch; inherited phone value remains 25 | Both consolidate mirrors into one report unit. |

No app/shadow double-counting was found in the current pairs. A repeated numeric value is still a new report when its authored report time advances; `lastValueChange` alone does not identify report origin.

### Visible-event deductions

Pinned facts confirm home-screen field cards are absent for the following clear caption promises: run-01 solar and retry/Online; run-03 bedtime report, sunrise report, charging solar, courier report, and Wi-Fi SD-card cached report/Online; run-06 charging solar and retry's older updated display. These captions actually name the displayed phone/app state. Run-03's extra low-mark deduction is the exception discussed in C5.

Run-01/open, run-02/a-open, run-05/open-clip and run-06/openclip narrate the required normal clip opening but provide only ordinary device-app fields, without a screen, still, thumbnail or other clear clip-open visual. The paired missing-clip findings have factual support under frozen interpretation 4. Run-03 instead supplies the camera screen's playing state and is not subject to that claim.

Run-03 judge 2 splits the SD-card caption's report and Online state into separate missing events, while judge 1 groups them. Both fields are in fact hidden. Whether these are one promised compound phone state or two separately promised field events is a deduction-unit ambiguity, not a disagreement about visibility; this audit does not create a new unit rule.

### Run-01 power report origins

The stored power report remains 22:30 at raccoon, low-battery and sunrise while the authored battery reports advance to 01:00, 04:00 and 06:30. After solar it remains 07:00 at both authored 08:00 report steps and at the 08:15 reconnect report. The HLD says each heartbeat includes charging, and the renderer interprets `reportedAt` as report time rather than last value-change time. The mismatched report metadata is real. Its home-screen text is hidden; at open the power card becomes visible with 07:00/“Updated 1 h ago” while battery shows 08:00.

A narrow unit issue remains: judge 2 counts hidden courier power metadata and its later visible carry-forward at open separately. There is no new power report authored at open; the same 07:00 property origin carries. Fixed rule 7 permits distinct per-step violations, while the overall limitation forbids duplicating one symptom. The arbiter should explicitly resolve that application without treating the two steps as independent new reports. No score recommendation is made here.

### Question/source wording

The question batches all contain compound audience/takeaway, timing or presentation decisions; punctuation counts are not used. A few justifications overstate their literal evidence:

- Run-06 judge 2 `Q-003` names a starting “battery/not-charging” confirmation, but Q5 mentions battery 25% and no unread alerts, not charging. The battery clause does exist; the extra phrase should not be treated as another supplied question.
- Run-02 both judges treat “Should it show the phone?” as already answered because HLD establishes phone behavior. The source establishes the phone's role, but does not independently dictate the visual presentation method. This is an unanswered-presentation-versus-redundant-behavior ambiguity under interpretation 1, not evidence that HLD literally asks for a drawn phone.
- Across question deductions, proposed defaults versus explicit interrogatives are sometimes counted differently (for example compound starting-state confirmations). This audit identifies exact wording rather than silently choosing a new counting policy.

Visible provider labels and the engineering app/shadow topology omissions are present in the exact sources. No additional false renderer fact was found in the checked current-pair deductions.

## Evidence identity

Sources and facts are `paired-v2/packets/<candidateId>/candidate/story.spec.json` and `evidence/renderer.json` under `.local/benchmarks/judge-adjudication-20260928`. Frozen rules are each packet's `interpretations.json`; HLD and answers are in `brief/`. Result hashes pin the reviewed deduction records:

| Run | Candidate | Judge 1 result SHA-256 | Judge 2 result SHA-256 |
|---|---|---|---|
| run-01 | `specimen-87e36f6ebc2e` | `cc0838d22b1a5758154f0e41dd367e7fa0ce37749ec91d273218ec245f33bf57` | `b91eeedbb3a932debe8a032df28bd18176adc9731d1d50b9e668787ae2ed417a` |
| run-02 | `specimen-7036a4f62b32` | `7ebe85816e29bca175a85216a3d394b432041153e3eac2ec5894b1dc11336ff7` | `d447d279b66e110f4d465f7c42d2fa705ce63307b080fc28ebcabc575c2d3e0e` |
| run-03 | `specimen-3d313b05cc71` | `b471e9dabe9272de82e56bbee0efa9ab9daff960f17554dfc3503496f5c93371` | `89977150780fca7457bac611ef0e0b5118d7aea13248774f39a9d4545bbd23ad` |
| run-04 | `specimen-8abdbcba1a1f` | `718ad18758d852ea4f71d2cff96464cc218f3df46ca9326c99d2c2285b3b0e0f` | `0554939b864429ce47aea9983f6ef0dbcec69aa246ea20c4f4fe75dc0d9dccc3` |
| run-05 | `specimen-fba9ebbeb297` | `61b7e1d57e173e17930c9bc652be6fdf458dc87ed306d917a917826db5961dee` | `a62a40ad66d57696c11e3f26227f0dbd638ea4b923702482836ab72228e3cdc6` |
| run-06 | `specimen-8c365a9d184d` | `b77f35f482f0307118cc4305a0a69638bcb38b33ee8b519dc8d4611199c3f1fb` | `8150d31ca0f96e7b6f42ae54638d0b6ba6a82d91940a65b9e6fd0d27c2ea7542` |

# Claude editor API versus the saved CLI experiment

The six Opus 5.5 authors all delivered an accepted story through the real editor after a documented startup-harness repair. **This batch did not match the saved CLI output quality.** The file transport was fast; content fidelity, visible app state and authoring UX still need work.

Same target: the weekend’s fictional **b1-overnight** camera story, with three business and three engineering authors. The original source, answer sheets and 100-point rubric were frozen before generation. [Plan](../api-comparison-plan.md) · [startup amendment](../startup-amendment.md) · [machine-readable results](results.json).

| Output | Score /100 (three judges) | Active author time | Apply latency |
|---|---:|---:|---:|
| Saved CLI — business | 96 (96–96) | 6m39s historical elapsed | — |
| Saved CLI — engineering | 90 (83–92) | 8m31s historical elapsed | — |
| [run-01 — business](evidence/run-01/final.spec.json) | Incomplete: valid judgments 70, 63 | 10m05s | 441 ms |
| [run-02 — business](evidence/run-02/final.spec.json) | 80 (76–95) | 9m17s | 164 ms |
| [run-03 — business](evidence/run-03/final.spec.json) | 88 (85–90) | 8m24s | 162 ms |
| [run-04 — engineering](evidence/run-04/final.spec.json) | 80 (79–81) | 12m00s | 218 ms |
| [run-05 — engineering](evidence/run-05/final.spec.json) | 87 (83–92) | 10m25s | 227 ms |
| [run-06 — engineering](evidence/run-06/final.spec.json) | 79 (78–80) | 9m46s | 279 ms |

Run-01’s third judge gave criterion scores summing to 73 but wrote a total of 83. It is retained as invalid; no official median, replacement judge or silent arithmetic correction was used. All 18 requested judgments ran, 17 were valid. Run-02’s 76–95 spread also shows substantial judge uncertainty. The old business and engineering scores each represent one author and three judgments; this is a small descriptive comparison. In results.json, each medianDimensions value is an independent criterion median; their sum is not the median total. The sum and equality flag are retained explicitly.

## What worked

- All twelve author invocations resolved to Claude Opus 5.5; phase two resumed the original six sessions.
- Six matching editor receipts, one accepted source proposal each, no rejected proposals or continuation permission denials. Both question and final-reply text matched the actual editor DOM and persisted transcript exactly.
- All six accepted stories and both historical specimens build under the current renderer with zero warnings. Source hashes were unchanged through rendering and review.
- Independent reviewers traversed 46 business and 61 engineering path occurrences. Notification timing, date rollover, short-outage behavior and branch separation passed. Engineering references matched all 72 approved code-reference occurrences and 15 catalog bindings; the uncatalogued classifier stayed unbound.
- Proposal-to-result publication took **162–441 ms**, median **222.5 ms**. These are same-machine protocol timestamps, not paint measurements.

## What needs improvement

1. **Show the relevant app state.** All three business stories hide app report data behind the phone home screen during key charging/outage steps. Run-01 has stale Power freshness; run-02 also fails to update hidden outage report values. Run-06 hides stale app state on its alternate. A customer story should make the physical-versus-reported difference visible without inventing an extra customer action.
2. **Depict the promised ending.** Runs 01, 02 and 06 say a clip opens but render device-health cards. Run 03 provides a camera scene, with a porch-label collision and a fourth panel below the expanded viewport.
3. **Finish the engineering read path.** All three engineering diagrams omit the app-to-device-shadow read dependency despite the supplied getState evidence. Correct catalog/code metadata does not prove every relevant connection is shown.
4. **Keep feedback visible during long work.** Initial second-turn progress arrived after 10–17 seconds; progress gaps reached 154 seconds. Six or seven numbered questions take 441–568 words. Shorter questions and clear continuing-work feedback matter for adoption.
5. **Carry the canvas experience into the reader.** The editor renders the full-window canvas, but default business panels are small/cropped while the backend graph dominates. None of the six specs supplies a named Explore layout for the standalone reader; the old CLI baselines lack one too. Expand is a separate curated fullscreen control. The benchmark brief did not request Explore, so this is a product/authoring gap, not a new rubric deduction.

The historical rendered pages also have label overflow, phone fields below an internal scroll and tall unused curated areas. They are not a flawless visual reference despite high native scores.

## Startup and interpretation

The original runner reported 0/6 completed: four false failures because a question-only session has no changes.json, and two permission failures from unallowed read/clock shell shortcuts. All six questions had reached the editor, with no proposals. The coordinator fix and explicit continuation were documented before second-turn generation. No first turn or author was replaced; all 75 original evidence files/hashes remain unchanged. The continuation is 6/6 completed and is **not relabelled a clean first attempt**.

Active times above sum each Claude subprocess invocation and exclude the repair pause. They include tool work. Historical elapsed times use different instrumentation. Current skill, prompts, permissions, renderer and six-way concurrency also differ, so the table does not isolate API overhead or establish a statistically reliable regression. It does establish that these saved outputs have lower rubric scores and concrete visual gaps. The measured file-application delay is a small part of the authoring time.

All six proposals replace the initial blank story with a full source document. Granular-operation ambiguity and atomicity were tested separately in [PR251](https://github.com/reghartner/design-viz/pull/251); these six author runs do not add six semantic-patch trials. Native pairing consent and Monitor dispatch were replaced by a bounded test coordinator; the connecting badge in editor screenshots reflects that unverified listener setup.

Judge packets used the unchanged rubric and three read-only Codex SOL/medium invocations per candidate, without prior scores or method labels. Author style could reveal the method. A clean build is not a semantic/visual pass. The engineering visual reviewer could not read the ledgers through its tool guard and records that limit; the judge packets contain the exact ledgers.

[Evidence manifest](evidence-manifest.json) preserves accepted specs, ledgers, questions, answer sheets, final replies, mechanical checks and every judge response. Original account logs stay local. Exact ledgers retain non-secret exchange identifiers. No source was changed to improve its score or render. No merge is authorized.

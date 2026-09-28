# Adjudicating the September 28 score discrepancy

The user requested a defensible score and an explanation of the disagreement,
using the original audit's judge level. This plan precedes the adjudication
calls. It does not replace the preserved first-round scores or author outputs.

## Fixed inputs and judge settings

- Assess all eight exact stories: six editor outputs and both saved CLI
  baselines. Do not regenerate, repair or select only favorable stories.
- Retain the original 100-point rubric and its seven caps. Its SHA-256 remains
  `c740ac21b34aae930203dfd1b40afa8bd5dfd5c271a7f868c6762daa502870a9`.
- The original `judge2.py` explicitly selected `gpt-5.6-sol` and medium
  reasoning. Every new adjudicator uses that same model and reasoning level.
  Request Fast service with `service_tier="fast"`; no model/effort downgrade.
  The setting is documented in the [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#service_tier).
- Run read-only, with explicit opt-in and immutable packet/prompt hashes.
  Preserve failed calls. No permission or hook bypass flags.

## Resolve evidence before points

1. Parse the 24 existing judge responses into individual deduction claims,
   retaining their origins and arithmetic validity outside judge packets.
2. Independently derive step-by-step state using the renderer's actual folding
   semantics. Distinguish stored values from visible values, physical battery
   from the last reported battery, clocks from report timestamps, graph topology
   from the edges active in a particular step, and a repeated shared step from
   a distinct state in an alternate path. Pin one current renderer/folding
   implementation and record its source hashes for all eight stories; this is
   not a claim about how an older native renderer displayed the baseline.
3. Record explicit interpretations where the rubric leaves counting or state
   semantics ambiguous. Apply the same interpretation to all eight stories.
   Freeze these interpretations before the first adjudication call. The exact
   [SOL/medium interpretations](adjudication-interpretations.json) and
   [adjudication prompt](adjudication-prompt.md) are recorded alongside this plan. Changes
   after judging require a disclosed amendment and consistent reassessment of
   every affected story, not an adjustment to a selected score.
4. Give two independent SOL/medium adjudicators each story, its original brief,
   answers, questions, ledger, mechanical check, factual state evidence and the
   disputed claims. Remove previous scores, judge identities and method labels.
   Repeated claims from old judges carry no extra weight. Author style can still
   reveal the workflow; this is limited label blinding.
5. Require evidence-backed decisions on every prior claim and evidence-backed
   deductions for any additional defect. Each deduction identifies its rubric
   rule, scoring unit and source location. Review both agreements and
   disagreements against actual evidence. Refer unresolved disagreements to a
   third independent SOL/medium adjudicator with both arguments and evidence.

## Produce a reproducible result

The final score comes from an adjudicated deduction ledger, with criterion caps
and addition performed in code. A model does not supply the arithmetic. Preserve
accepted and rejected claims, reasons and the resolved counting rules. Publish
one reference score per story when all material disputes are resolved; label any
remaining ambiguity explicitly rather than claiming a uniquely objective number.

Original medians remain historical measurements of unconstrained judging. The
adjudicated scores are a separately labelled assessment under the disclosed
interpretations and richer factual evidence. They must not silently overwrite
the first-round numbers. No product or authored-story change, and no merge, is
part of this investigation.

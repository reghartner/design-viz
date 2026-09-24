# Three triggers, one shared pipeline

Source: user request, “an example where three tracks share steps” (2026-09-24).
This is a fictional teaching example, not a claim about a commercial doorbell.
Audience: a Flowview author inspecting three-way convergence and selected-path state.

## Coverage

| Request | Representation |
| --- | --- |
| Three tracks share steps | Button press, Motion detected, Sound detected all reference process, persist, notify |
| Compact presentation | Uses the current viewer’s compact timeline, with no shared boxes or repeated labels |
| Different lead-in lengths | Two, three, and four private steps respectively; shared processing is step 3, 4, or 5 |

## Storyboard and authored assumptions

All actors and operations below are illustrative. Edges use an explicitly illustrative handoff kind; no production transport or timing is claimed.

| Steps | Action | Visible state |
| --- | --- | --- |
| press, translate-press | Button event is translated | Origin Button; button-only log entry |
| detect, debounce, translate-motion | Motion is detected, confirmed, translated | Origin Motion; motion-only log entry |
| hear, filter-sound, classify-sound, translate-sound | Sound is detected, filtered, classified, translated | Origin Sound; sound-only log entry |
| process | Handle any normalized event | Origin preserved; append common processing log |
| persist | Store event | Origin preserved; append common persistence log |
| notify | Notify resident | Origin preserved; append common notification log; all three tracks end here |

These are three possible event histories, not three concurrent prerequisites. No physical measurement, real company API, external link, failure, or wire schema is asserted. Shared step bodies are identical and never replace the selected origin.

## Acceptance

Open paused. Exercise every private lead-in and shared ending, switch between all three paths, and verify origin/log state is rebuilt for the selected path. At process the circle shows 3, 4, or 5. Exactly three downstream circles are shared by all three routes. Inspect desktop rendering for overlap and clipping.

## Verified result

- Page builder completed with zero validation errors or warnings.
- Browser walked every stop on all three paths: origin and log history stay isolated; all paths end after the common notification.
- Exactly three shared downstream circles; processing is numbered 3 / 4 / 5 for button / motion / sound.
- Timeline is 108 px high and 598 px wide; step buttons do not overlap; no page errors.
- Desktop visual inspection at 1600 px: three input columns converge on a centered processor; storage and app branches are separate.
- Final LAN page loaded successfully and Sound selected at its shared processing step.

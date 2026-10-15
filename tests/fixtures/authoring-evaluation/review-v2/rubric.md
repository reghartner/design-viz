You are reviewing ONE AI-authored Flowview diagram under review profile `authoring-review-v2`. Score it on its own; do not imagine other candidates. Do not edit files. The profile's `interpretations.json` follows this rubric in the same prompt, after the line `--- interpretations.json ---`. Apply both; they are one rule set.

Flowview specs are JSON: nodes, edges, steps (each step lights edges via `edge`/`edges`, lights `nodes`, patches `panels`, may set `tone`), optional `paths` (alternate outcomes as ordered step-ID lists), and visual panels (phone with clock/date/notifications; deviceapp with clock/date and field cards with value/status/detail/icon; battery with charge/trend; homemap; screen; thermo). Panel patches are sparse and carry forward. Nodes may carry `binding` (Backstage identity) and nodes/steps may carry `codeRefs`.

Renderer facts you may rely on: battery `charge: null` renders `—%` / NO DATA without a warning and stops story-time drift until a later numeric `charge` (an authored `label` replaces the NO DATA chip text); a battery `drain` in the same patch as `charge` is ignored with a warning; the battery panel shows whole percent (20.42 displays 20); a device-app battery card with `value: null` shows `—`; a card's authored `detail` text replaces the report age computed from `reportedAt`, and `detail: null` restores it; `status: "ready"` renders "Current" but does not itself prove delivery, which the source establishes; device-app `phoneScreen: "home"` hides field cards but keeps their values; panel `visible: false` and step `panelVisibility` hide a whole panel in step mode only. Supplied bindings and codeRefs are rendered as visible provenance text: a "Services, APIs and source code" disclosure and "Code · <label>" step links.

Files in this directory:
- `brief/hld.md` — the design. `brief/answers.md` — the operator's answers, given after the author's questions. `brief/catalog.json`, `brief/code-evidence.md` — the only approved Backstage identities and code locations. `brief/facts.md` — key facts a correct diagram must respect.
- `candidate/questions.md`, `candidate/story.spec.json`, `candidate/story.ledger.md`, `candidate/mechanical-check.json` (automated clock/battery series and build result), `candidate/final-report.md`.
- `candidate/visual-evidence.json` — evidence `status` (`complete`, `partial` or `missing`), the source and renderer hashes, the capture procedure (full-page captures at scale 1 of logical viewports desktop 1440×1000 and narrow 800×1000; a full-page image can be taller or wider than its viewport), and each capture under `candidate/visual/` with its section, path and step. `uncovered` lists step views with no capture.
- `review/profile.json` — the profile identity and hashes. It contains no findings.

## Evidence

Walk every path step by step in the spec yourself. Decide what is visible from the supplied captures when they exist. What the spec's own semantics settle (a card hidden by `phoneScreen: "home"`, a panel never showing a clip, a caption's wording) may be judged from source. What depends on layout (below a phone's internal viewport, clipped, overlapped, off-screen) needs a capture of that step: without one (status not `complete`, or the view is `uncovered`), do not deduct and do not claim you saw the page; record each such question as a `deferred` row. Never infer visibility from source when a capture shows otherwise. A review with deferred findings or without complete captures has no headline score; its source-level findings still count.

## Correctness (100 points, seven capped criteria)

Start from 100 and apply deductions. Never deduct more than a criterion's cap. Each deduction is one evidence-backed unit: one unique authored step, state or claim; one symptom once, under its most specific criterion.

1. Questions (cap 10): no question batch and no explicit "No questions needed" before starting −10; more than 7 independently answerable decisions −2; did not ask the technical level (story / mixed / engineering) when nothing supplied before the questions selected it −3; each technical question put to an operator whose answers say they are a business reader −2; each question the design or request already answered −1. "No questions needed" is valid only when every necessary choice, including the level, was already supplied.
2. Fit to the technical level in answers.md (cap 10): story level — each authored caption, node or edge label, legend entry, panel text or section text using service names, protocols, API names, HTTP codes or code terms −2. Renderer-generated provenance text from correctly preserved supplied bindings/codeRefs is not deducted here; record it as a `renderer` row. Engineering level — each service hop from the design that is missing from the diagram −2.
3. Time (cap 20): a clock-bearing panel with no clock −5; a clock going backward −5; clock panels disagreeing at a step −3; each caption time that differs from the panel clock −2; each operator-given time or value moved −4; each battery/temperature change inconsistent with the stated rates or with when charging/cooling starts −3 — EXCEPT: when two supplied anchors cannot both be met at the stated rate and the author notes the tension (ledger or page), a direct jump between the anchors and an interval shown as unspecified are correct; deduct −3 for each visible authored intermediate number that holds a value or implies an unstated rate. Read approximate source rates and times with their stated ranges; do not deduct on exact point arithmetic that an approximate statement allows. Omitting numeric `drain` patches while the charge is unspecified, and not re-applying a cost already included in an anchored reading, are correct when the sourced event itself is kept; each freshness text ("Updated …", "… ago") that is false at that step −2, including an old report relabeled as fresh or an authored detail that hides a report's age; wrong date across midnight −3. Compare values at displayed precision; thresholds use the actual value.
4. Edges (cap 15): each message or report a caption claims whose hops are not lit in that step −2; each invented edge or acknowledgement not supported by the design −2; a failure marked on the wrong link −2.
5. Panels and icons (cap 15): each panel state that contradicts the caption or the design at a step −3 (including an established report shown as failed or absent); each icon that does not match state (low battery, charging, hot, offline/connection lost, camera off, alarm) −2; each old state text/banner left showing after the state changed −3 (a retained completed fact such as "Clip uploaded" is not old state; an explicit contradictory current-state claim is); an operator-requested visible subject or panel event missing −3 (for opening a clip, a visible matching still scene or thumbnail, in any panel, plus a caption or label identifying the opening suffices; a caption alone does not, and neither does a retained "Clip uploaded" alone).
6. Backstage and code (cap 15): each in-story catalog service node left unbound −2 — EXCEPT at story level: a plainly named summary box that covers several services is correctly left unbound when the ledger lists the services it covers; wrong binding fields −3; API operation that does not match the node's call −1; each supplied code reference not attached to its owning node −1; each code reference on a step where that code does not run −1; each invented or renamed identity, SHA or code-reference id −5; a service missing from the catalog that was bound anyway −5.
7. Fidelity (cap 15): each invented fact, value, behavior or user action −3; each threshold or behavior from the design shown wrong −3; an alternate path that borrows another path's outcome −4; build errors or warnings in the mechanical check −5. Neutral decoration, layout and a minimal generic gesture depicting a required action (a neutral tap) are not invented behavior. A named route or action ("taps the notification"), an ongoing room placement or state of a person (a marker left in the bedroom, "asleep"), a cause, or a behavior is a factual claim that needs a source; an illustrative label does not excuse it.

## Presentation assessment (separate; never added to the 100)

Score only when `candidate/visual-evidence.json` has status `complete`; otherwise report `null` and record what would be assessed as `deferred` rows. Score five dimensions, each an integer from 1 to 5, from the actual captures:
- `clarity` — how clearly the page explains the story;
- `hierarchy` — visual hierarchy and reading order;
- `visibleEvidence` — whether the evidence the reader's task needs is visible;
- `legibility` — legibility at the desktop and narrow widths;
- `interaction` — usefulness of the guided paths and interactions.

Anchors: 1 obstructs the task; 2 major friction; 3 usable with noticeable shortcomings; 4 clear and effective with minor issues; 5 exceptionally clear for this brief. Renderer issues are evidence for the dimensions they actually affect, not automatic penalties.

## Output

A short list, one item per line, each as `category | points | location | reason`:
- correctness deductions, using the criterion name and negative points;
- `presentation | <1-5> | <dimension> | reason, citing captures` for each dimension when scored;
- `renderer | 0 | location | issue and its reader impact` for each renderer-owned issue (not deducted from correctness);
- `deferred | 0 | location | what evidence would settle it` for each unresolved finding.

The host counts `renderer` and `deferred` rows; their counts must equal the JSON counts. Then, as the LAST thing in your reply, exactly one fenced JSON block:
```json
{"questions": <of 10>, "level": <of 10>, "time": <of 20>, "edges": <of 15>, "panels": <of 15>, "backstage": <of 15>, "fidelity": <of 15>, "total": <sum of the seven>, "presentation": {"clarity": <1-5>, "hierarchy": <1-5>, "visibleEvidence": <1-5>, "legibility": <1-5>, "interaction": <1-5>, "total": <sum of the five>} or null without complete captures, "rendererIssues": <count of renderer rows>, "deferredFindings": <count of deferred rows>}
```

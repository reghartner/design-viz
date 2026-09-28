# Factual renderer evidence — 2026-09-28

This is an unscored, read-only extraction from the eight exact published specs. No model calls, old judge scores, or judge transcripts were used. The specs and published HTML were hash-checked before and after browser traversal and were not modified. `manifest.json` records the frozen evidence hashes, fixture hashes, expanded production bundle hashes, and individual renderer file hashes.

Each `<story>/evidence.json` contains every path and step, raw caption, exact spec pointer, resolved clock/date, physical battery, independently merged phone fields, field visibility, notifications, active/delivered/failed edge keys, topology, bindings and code references. `<story>/browser.json` independently records the published page DOM, including field intersection with the phone scrollport. Rendering a field card is distinct from its being completely inside that scrollport.

The actual browser walk used Node 24.21.0, Chromium 153.0.8010.12, an 1800×1200 viewport and reduced motion. For every route it selected the actual path button, used Next, and asserted both active path and source-step index. All **141 path-step visits** completed with no page errors. Every device-app screen, card list, rendered field value/status/detail/update marker, notification stack, physical battery gauge and homemap direction marker matched the independently computed production fold.

| Published story | Path-step visits | Evidence | DOM proof |
|---|---:|---|---|
| run-01 | 15 | [evidence](run-01/evidence.json) | [browser](run-01/browser.json) |
| run-02 | 15 | [evidence](run-02/evidence.json) | [browser](run-02/browser.json) |
| run-03 | 16 | [evidence](run-03/evidence.json) | [browser](run-03/browser.json) |
| run-04 | 21 | [evidence](run-04/evidence.json) | [browser](run-04/browser.json) |
| run-05 | 24 | [evidence](run-05/evidence.json) | [browser](run-05/browser.json) |
| run-06 | 16 | [evidence](run-06/evidence.json) | [browser](run-06/browser.json) |
| historical-business | 15 | [evidence](historical-business/evidence.json) | [browser](historical-business/browser.json) |
| historical-engineer | 19 | [evidence](historical-engineer/evidence.json) | [browser](historical-engineer/browser.json) |

## Disputed signals and notification states

Homemap signals are **not carried between steps**. `src/panels/types/homemap.js:294` excludes signals from the carried map, and lines 341–353 create a snapshot from only the current patch's signals or `[]`. Static direction markers remain readable when paused/reduced-motion (lines 845–860); animated packets are separate. These are production semantics, not a proposed interpretation.

In the table below, JSON pointers are relative to the named story's published `final.spec.json`.

| Story / step | Exact step pointer | Browser fact | Screenshot |
|---|---|---|---|
| run-02 / sunrise | `/page/blocks/0/diagram/steps/3` | Zero homemap direction markers; no carried camera/router signal. Phone is home. | [sunrise](run-02/normal-sunrise.png) |
| run-02 / charging | `/page/blocks/0/diagram/steps/4` | One current `cam → router` direction marker, demonstrating the nonempty control. | [charging](run-02/normal-charging.png) |
| run-02 / a-open | `/page/blocks/0/diagram/steps/6` | Zero homemap markers; app screen; battery 21%, solar charging, Online, package event; two notification cards remain. | [app open](run-02/normal-a-open.png) |
| run-02 / b-deliver | `/page/blocks/0/diagram/steps/7` | Zero homemap markers; home screen; one low-battery notification. | [delivery](run-02/wifidown-b-deliver.png) |
| run-02 / b-retry | `/page/blocks/0/diagram/steps/8` | Zero homemap markers; home screen; one low-battery notification. | [retry](run-02/wifidown-b-retry.png) |
| run-03 / b-sdcard | `/page/blocks/0/diagram/steps/8` | Zero homemap markers; home screen; one low-battery notification. No preceding charging-report signal persists. | [SD-card step](run-03/wifi-down-b-sdcard.png) |
| run-03 / a-open | `/page/blocks/0/diagram/steps/7` | App screen; zero notifications because this step explicitly authors `clear:true`. | [app open](run-03/normal-a-open.png) |

Notifications persist unless a patch explicitly authors `clear:true` (`src/panels/notifications.js:26–38`). Switching to the app screen does not clear them; both home and app render the notification stack (`src/panels/types/deviceapp.js:380–432`). The approved HLD normal ending says that the resident opens the clip (`input/hld.md:59–60`) but does not specify dismissal-on-open. Thus run-02's retained notifications are a verified display fact, not proof of violating an explicit dismissal requirement. Run-03's different result is caused by its authored clear operation.

## Stored values, reports and visible fields

Device-app field patches merge properties (`src/panels/types/deviceapp.js:235–289`). `phoneScreen:home` omits field cards entirely (lines 384–392, 425–432), though values continue to fold. A separate source-provenance area may show names/status, not the field values (lines 481 onward). Therefore a stored old battery value on a home screen must not be reported as a visibly wrong battery card. The distinction does not claim that a hidden field demonstrates the story effectively; it records precisely what appears.

All phone field cards are absent throughout the alternate route of run-01, run-02, run-03, run-06 and historical-business. Their normal routes switch to app only at `open`, `a-open`, `a-open`, `openclip`, and `a-open`, respectively. Exact `phoneScreenPointer`, merged fields, `renderedAsCard`, and hidden reasons are in each step's evidence.

- **run-02:** stored bedtime battery 25% and not-charging values persist while the phone is home. At `/page/blocks/0/diagram/steps/6/panels`, the visible app receives battery 21%, solar charging, Online and package delivered. This is not a visible 25% battery at sunrise or during the alternate delivery.
- **historical-business:** initial battery 25% and bedtime detail likewise persist in hidden fields through the alternate ending. The app shown at `/page/blocks/0/diagram/steps/6/panels` instead displays battery 21%, charging from sun, Online and Package, with 8:00 AM report details. [Sunrise home screen](historical-business/normal-sunrise.png), [normal app open](historical-business/normal-a-open.png), [reconnect home screen](historical-business/wifi-down-b-back.png).
- **run-01:** the actual app at `/page/blocks/0/diagram/steps/6` displays battery 21% with report 8:00, power “Solar · charging” with report 7:00, online with report 8:00, and package event with report 8:05. Its different power report age is explicitly represented; a value-change time and a report time are not interchangeable. The HLD says every heartbeat carries charging state (`input/hld.md:29–32`); no scoring conclusion is assigned here.
- **run-04 / run-05 / historical-engineer:** the app is present at sunrise. It visibly shows an 18% battery report from 6:30 AM and not charging, while the independent physical gauge shows 17% and solar charging. At their 7:00 AM charging-heartbeat step, the app switches to solar. Pointers: run-04 and run-05 `/page/blocks/0/diagram/steps/5` and `/6`; historical-engineer `/steps/4` and `/5`. This is a visible physical-versus-reported distinction matching the next-heartbeat rule (`input/hld.md:42–43`). [Historical sunrise](historical-engineer/happy-sunrise.png).
- **run-06:** the sunrise report lag is present in merged fields and the caption at `/page/blocks/0/diagram/steps/3`, but the home screen hides those field cards. The normal endpoint `/steps/6` renders only battery, power and online; there is no authored clip/event field. The caption states clip opening. All alternate frames remain home, including the late push.

“Current” is the renderer's label for authored `ready`; “Updated” marks a changed field or assigned report in this step (`src/panels/types/deviceapp.js:228–230, 280, 399–406, 470`). Neither independently proves a new network message. Explicit prose detail can remain pinned while a report's resolved timestamp changes. The evidence preserves `merged`, exact property origins, `resolvedReportTime`, `reportAgeMinutes`, and `lastValueChange` separately.

## Clock, topology and evidence boundaries

Business answers allow Thursday around 10:30 PM, approximate overnight times and sensible minutes, without a specified calendar date (`operator/answers-business.md:9–11`). The four business stories use Thu Oct 1/Fri Oct 2. Engineering answers specify Sep 24 22:30, 01:10, 04:00, 06:50 and 08:05 (`operator/answers-engineer.md:9–11`); all four engineering stories resolve those anchors. The browser clock/date matched each resolved story timeline.

Every sunrise step has no active message edges. References in captions to the earlier 6:30 heartbeat describe stored reports; they do not activate a current heartbeat. Declared topology, step-active edges, delivered edges and failures are separate fields in the evidence (`src/core/paths.js:17–54`). A hidden/collapsed data-flow SVG can still contain lit DOM classes; their presence alone is not a claim that the reader currently sees that graph.

For the engineering stories, `/page/blocks/0/diagram/edges` contains no app-to-device-shadow read edge. The HLD explicitly says the app reads device-shadow (`input/hld.md:23`), so that topology absence can be assessed separately from the app field state. Run-05 and historical-engineer include app-to-clip-store fetch/return edges at their normal open step; run-04 and run-06 omit that hop and say so in the respective `/steps/9/text` and `/steps/6/text`. The approved catalog includes `getClip`. This records the scope of the drawn topology, not an inferred network event.

All 184 distinct authored code-reference occurrences across the eight stories match the approved repository/path/revision/anchor/line location exactly; each boolean and pointer is in the evidence. Bound entity references match the approved catalog. `bindingEntityRefApproved` deliberately checks entity identity only; full binding contents remain present for inspection. Where the classifier is a separate node, it has no catalog binding. Business run-01/02/03 instead abstract the cloud. These facts do not invent an approved classifier identity.

The alternate endings show delayed notification, not a new late clip-open step. Ten minutes of Wi-Fi loss is below the HLD's two-missed-heartbeat offline threshold (`input/hld.md:46–50`); an Online cached field is therefore not inherently contradictory. Exact captions, field report ages, notification arrival steps and failed edge keys are available per path rather than inferred from topology alone.

These observations deliberately leave score choice, relative weighting, and subjective clarity to the fresh adjudication. They provide factual corrections and reproducible state evidence only.

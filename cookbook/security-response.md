# Security monitoring and emergency dispatch

Use `security` to show what monitoring knows: individual sensor health and
alarm state, the operator's assessment, and the incident under review. Use
`dispatch` to show what response knows: request state, priority, assignment,
unit progress and an authored arrival estimate. The monitoring operator can
open a stock camera clip on the desk's monitor; a response vehicle drives
through the neighborhood toward the house as authored positions change.
Both work independently and
can sit beside a Home map, camera screen or service diagram.

Read their exact fields together:

```sh
python3 tools/widget_doc.py security dispatch
```

The complete [From alarm to response seed](../src/starters/security-response.json)
is also available in **New project → From alarm to response**. Open the panel
picker to add either panel to an existing diagram. Its setup inspector edits
the site/agency and sensor/responder rows; its step inspector exposes individual
status dropdowns and text fields. Initial state is edited in the setup JSON.

## The example's evidence and storyboard

All people, services, decisions and arrival estimates are fictional, authored
for demonstrating the panels. This is a proposed scenario, not a provider's
documented policy or a connection to an emergency service.

| Step | Visible event | State change |
| --- | --- | --- |
| armed | Quiet home, healthy sensors | Monitoring armed; response idle |
| detected | Front entry opens; recording starts | Entry alarm triggered; cause unverified |
| review | Operator pulls up the front-door clip | Alarm acknowledged; video opening |
| clip-review | The operator watches the person enter on the desk monitor | Video reviewing/playing; assessment still reviewing |
| verified | Operator confirms the incident and sends a request | Monitoring verified; response requested |
| assigned | Dispatcher assigns P-12 | That unit assigned; backup remains available |
| enroute | The vehicle leaves the station and travels through the neighborhood | Unit en route at illustrated progress 35; illustrative ETA shown |
| approaching | Vehicle moves closer to the house | Progress 78; arrival not yet reported |
| onscene | Vehicle parks outside the house | Unit on scene at progress 100; no resolution claimed |

| Path | Shared prefix | First different step | Ending |
| --- | --- | --- | --- |
| Confirmed incident | armed → detected → review → clip-review | verified | Unit on scene; no resolution claimed |
| False alarm | armed → detected → review → clip-review | false-alarm | Monitoring cleared; no request or assignment |
| Dispatch unavailable | armed → detected → review → clip-review | dispatch-blocked | Verified incident; request not delivered; no responder assigned |

The **Response room**, **At the property** and **Service flow** layouts use the
same steps and panels. The response room focuses on the two new panels; the
other views add the physical home or service handoffs. The
broken edge belongs only to the failed-delivery step. Panel state folds through
the selected path, so visiting a successful response cannot contaminate the
false-alarm or failed-handoff ending.

## Authoring decisions

- Give the operator a clip with `scene` and `videoLabel` in panel setup. Use
  `video: "opening"` while it loads, then `video: "reviewing"` and
  `scenePlayback: "playing"` when the operator watches. `video: "closed"`
  returns to the desk's idle screen. `unavailable` plus `videoReason` explains
  missing video without silently changing the incident assessment. The same
  clip choices, colors and animation are shared with Camera Screen; no copied
  media assets or remote video URL is needed.
- To stage the vehicle, patch its whole responder object: assigned at progress
  0, en route at 35, approaching at 78, then on scene. Those example percentages
  control the illustration, not real travel distance or arrival time. A step
  jump renders that step's position directly; normal forward transitions animate
  between positions. Arrival must be authored. Set `lights` explicitly when
  beacon activity matters, and use panel `timeOfDay` to choose day, dusk or night.
- Sensor health and alarm state are independent. A device may be online and
  triggered, or offline with an earlier alarm still awaiting assessment.
- An acknowledged alarm is not a verified incident. Verification does not
  assign responders. An assignment does not prove travel or arrival.
- Each declared sensor/responder gets its own top-level state key. Omitting
  that key carries it forward. An object replaces the **whole item**; include
  the health/alarm or status/ETA/detail fields you intend to retain. Null resets
  the item to unknown. Use `enterOnce` for a current-step-only override.
- ETAs are text, supplied by the author. Omit an unknown ETA; there is no clock,
  route calculation or automatic countdown. Responder kind chooses a vehicle, not
  response policy. Use police, fire, medical or property security as supported
  by the source.
- Pair an explicit `blocked` dispatch status with a broken edge only when the
  source establishes non-delivery. An unobserved acknowledgement alone is not
  proof of a dropped request.
- Explicitly author cleared, cancelled or resolved outcomes. The panel never
  calls services, sends an alert or progresses a real incident.

Validate and build the complete example:

```sh
node tools/validate.js src/starters/security-response.json
python3 tools/inject.py src/starters/security-response.json template/flowview.html /tmp/security-response.html
```

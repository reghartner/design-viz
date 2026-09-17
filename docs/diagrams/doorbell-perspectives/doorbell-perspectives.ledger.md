# Coverage ledger — A visitor at the door
source: docs/hlds/doorbell-perspectives.md | version: 1 | updated: 09-17-2026 08:09

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | Both perspectives describe | Same complete sequence and alternatives for two audiences | covered @ diagram.layoutName, sectionLayout, steps and paths |
| 2 | flow | Camera is on without | Quiet active camera, closed door, resident inside, visitor absent | covered @ panels[home,clip,resident-phone,outbox,checkpoints].initial |
| 3 | service | Camera | Camera retains its named role | covered @ diagram.nodes.camera |
| 4 | service | Event Gateway | Event Gateway retains its named role | covered @ diagram.nodes.gateway |
| 5 | service | Policy | Policy retains its named role | covered @ diagram.nodes.policy |
| 6 | service | Registry | Registry retains its named role | covered @ diagram.nodes.registry |
| 7 | service | Event Bus | Event Bus retains its named role | covered @ diagram.nodes.bus |
| 8 | service | Clip Worker | Clip Worker retains its named role | covered @ diagram.nodes.worker |
| 9 | service | Clip Store | Clip Store retains its named role | covered @ diagram.nodes.store |
| 10 | service | Notifications | Notifications retains its named role | covered @ diagram.nodes.notify |
| 11 | service | Push Provider | Push Provider retains its named role | covered @ diagram.nodes.push |
| 12 | service | Phone | Phone retains its named role | covered @ diagram.nodes.phone |
| 13 | service | Playback API | Playback API retains its named role | covered @ diagram.nodes.playback |
| 14 | flow | Ready | The porch is quiet. Camera is active; the resident is inside. | covered @ diagram.steps[id=ready] |
| 15 | flow | Recording armed | A local schedule starts recording before anyone arrives. No livestream is open. | covered @ diagram.steps[id=arm] |
| 16 | flow | Approach | A visitor approaches the porch while the camera records. | covered @ diagram.steps[id=approach] |
| 17 | flow | Ring | The visitor presses the doorbell. Camera sends the event to Event Gateway. | covered @ diagram.steps[id=ring] |
| 18 | flow | Policy request | Event Gateway asks Policy whether this device may publish. | covered @ diagram.steps[id=authorize] |
| 19 | flow | Device check | Registry confirms enrollment and permission; Policy allows the event. | covered @ diagram.steps[id=enrollment] |
| 20 | flow | Publish work | Policy publishes the clip-processing job to Event Bus. | covered @ diagram.steps[id=publish] |
| 21 | flow | Consume work | Event Bus delivers the job to Clip Worker. | covered @ diagram.steps[id=consume] |
| 22 | flow | Local clip ready | Recording ends. Camera retains the local clip and uploads its bytes to Clip Worker. | covered @ diagram.steps[id=local-clip] |
| 23 | flow | Cloud persistence | Clip Worker stores the clip successfully. Cloud persistence is now confirmed. | covered @ diagram.steps[id=persist] |
| 24 | flow | Delivery scheduled | Clip Worker schedules delivery; Notifications adds the item to its outbox. | covered @ diagram.steps[id=schedule] |
| 25 | flow | Push requested | Notifications removes the outbox item and submits it to Push Provider. | covered @ diagram.steps[id=push-request] |
| 26 | flow | Resident notified | The phone receives “Visitor at the front door.” The resident starts toward the entry. | covered @ diagram.steps[id=notify-resident] |
| 27 | flow | Open clip | The resident opens the notification; the phone requests the saved clip. | covered @ diagram.steps[id=open-clip] |
| 28 | flow | Fetch clip | Playback API authorizes the resident and fetches the stored clip. | covered @ diagram.steps[id=fetch-clip] |
| 29 | flow | View clip | The phone receives the authorized clip. The resident sees the recorded porch approach. | covered @ diagram.steps[id=view-clip] |
| 30 | flow | Welcome | The resident opens the door. The visitor crosses into the entry. | covered @ diagram.steps[id=welcome] |
| 31 | flow | Inside | The visitor joins the resident inside; the door closes. The saved clip remains available. | covered @ diagram.steps[id=inside] |
| 32 | failure | returns HTTP 503 | Rejected before persistence; error response delivered | covered @ diagram.steps[id=store-rejected] |
| 33 | failure | does not schedule | Keep local clip; no notification; visitor outside | covered @ diagram.steps[id=local-only] |
| 34 | failure | returns HTTP 429 | Rejected before phone delivery; cloud clip stays | covered @ diagram.steps[id=push-delayed] |
| 35 | failure | held for later retry | Hold this item with retry time unspecified | covered @ diagram.steps[id=hold-delivery] |
| 36 | contract | MQTT | Event ingress uses MQTT; HTTPS, SQL and AMQP as specified | covered @ diagram.edges and page.protocols |
| 37 | contract | title “Visitor at the front door,” | One authored notification, only after push delivers | covered @ steps[notify-resident].panels.resident-phone.notify |
| 38 | flow | rather than a physical | Cloud marker summarizes clip delivery; phone marks handset | covered @ panels[home].devices; section.text[1] |
| 39 | number | There are no measured durations | No measurements, capacities, payload schemas or physical dimensions asserted | out-of-scope: none supplied; geometry and animation are illustrative |
| 40 | permalink | or real APIs | No company APIs, code refs or source links fabricated | out-of-scope: fictional example has no supplied external bindings |
| 41 | flow | "takes place after dark" | Night lighting in the recorded porch scene | covered @ panels[clip].scene |

Locations above are relative to `page.sections[0]` unless prefixed with `page`.

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | Intended seed? | Detailed engineering and business-story perspectives, same complete steps, readable in both. | 09-17-2026 | layoutName, sectionLayout and shared registry | active |

## Storyboard
| step ID | actor/action | incoming state | state changes / visible outcome | evidence |
|---|---|---|---|---|
| ready | The porch is quiet. Camera is active; the resident is inside. | Camera on, porch empty | Service handoff; physical state holds | Reference sequence 1 |
| arm | A local schedule starts recording before anyone arrives. No livestream is open. | Quiet camera | home, clip | Reference sequence 2 |
| approach | A visitor approaches the porch while the camera records. | Recording, porch empty | home, clip, experience | Reference sequence 3 |
| ring | The visitor presses the doorbell. Camera sends the event to Event Gateway. | Recording, visitor approaching | home | Reference sequence 4 |
| authorize | Event Gateway asks Policy whether this device may publish. | Gateway received ring | Service handoff; physical state holds | Reference sequence 5 |
| enrollment | Registry confirms enrollment and permission; Policy allows the event. | Policy request pending | checkpoints | Reference sequence 6 |
| publish | Policy publishes the clip-processing job to Event Bus. | Device permitted | Service handoff; physical state holds | Reference sequence 7 |
| consume | Event Bus delivers the job to Clip Worker. | Job published | Service handoff; physical state holds | Reference sequence 8 |
| local-clip | Recording ends. Camera retains the local clip and uploads its bytes to Clip Worker. | Worker has job; local recording on | home, clip, checkpoints | Reference sequence 9 |
| persist | Clip Worker stores the clip successfully. Cloud persistence is now confirmed. | Local clip retained; bytes uploaded | clip, checkpoints | Reference sequence 10 |
| schedule | Clip Worker schedules delivery; Notifications adds the item to its outbox. | Cloud clip stored | outbox | Reference sequence 11 |
| push-request | Notifications removes the outbox item and submits it to Push Provider. | Delivery in outbox | outbox | Reference sequence 12 |
| notify-resident | The phone receives “Visitor at the front door.” The resident starts toward the entry. | Push request submitted | resident-phone, home, outbox, experience, checkpoints | Reference sequence 13 |
| open-clip | The resident opens the notification; the phone requests the saved clip. | Notification delivered | home | Reference sequence 14 |
| fetch-clip | Playback API authorizes the resident and fetches the stored clip. | Playback requested | Service handoff; physical state holds | Reference sequence 15 |
| view-clip | The phone receives the authorized clip. The resident sees the recorded porch approach. | Access permitted and clip fetched | clip, checkpoints | Reference sequence 16 |
| welcome | The resident opens the door. The visitor crosses into the entry. | Resident has viewed clip | home, experience | Reference sequence 17 |
| inside | The visitor joins the resident inside; the door closes. The saved clip remains available. | Door open, visitor in entry | home, experience | Reference sequence 18 |
| store-rejected | Clip Worker attempts persistence. Clip Store rejects it before storing bytes and returns HTTP 503. | Local clip retained; bytes uploaded | home, experience, checkpoints | Cloud storage rejected |
| local-only | The workflow stops. The clip remains local; the resident is not notified and the visitor waits outside. | Persistence rejected | clip | Cloud storage rejected |
| push-delayed | Push Provider returns HTTP 429 before phone delivery. The resident has not been notified. | Push request submitted | home, experience, checkpoints, outbox | Push delayed |
| hold-delivery | Notifications holds the delivery for later retry. The cloud clip exists; the visitor is still waiting. | Push rejected before phone delivery | outbox | Push delayed |

## Branch table
| path | shared prefix | first different step | ending | remaining unknowns |
|---|---|---|---|---|
| happy | ready through local-clip | persist | inside (18) | No observed telemetry; teaching design only |
| storage-rejected | happy steps 1–9 | store-rejected (10) | local-only (11) | No recovery or retry described |
| push-delayed | happy steps 1–12 | push-delayed (13) | hold-delivery (14) | Retry time and aggregate queue depth unspecified |

## Motion and continuity
- `arm`: Home REC and quiet camera recording start together; no visitor yet.
- `approach` then `ring`: visitor appears outdoors, then glides to the door; the camera clip begins with approach.
- `ring` and `local-clip`: Home Camera → Clip delivery signals represent the sourced uplink.
- `local-clip`: recording ends; saved-clip banner appears while retained media remains available.
- `notify-resident`: Cloud → Phone signal and phone notification arrive together; resident starts walking.
- `welcome`: door opens and visitor crosses into the outlined entry; `inside` moves both people in and closes the door.
- Failure branches keep the resident in the living room, visitor outside, door closed and local clip retained.
- The screen after recording is an illustration of saved media, not a claim that the outside visitor is still present.

## Checkable expectations
- One diagram owns both perspectives: switching never selects a different step or path.
- No notification exists before `notify-resident` or at either alternate endpoint.
- `arm` records while scenePlayback is waiting; `approach` starts the scene.
- Every path retains the local clip after `local-clip`; only success and push-delay have a cloud clip.
- HTTP 503/429 are delivered responses, with no broken-edge `failures` claims.
- No visitor enters or door opens on the alternate paths.
- Push-delay ends with one story item held, no invented retry time or total depth.
- All authored gates pass only after their supported causes.

## Delivery and verification
Build with `tools/page_build.py` using this directory as OUT. The spec uses six panels: homemap, screen, state, phone, checks and queue. Source-only provenance is visible prose and this ledger; no fabricated GitHub URL or company binding. Browser QA exercises both views and all three paths at wide and narrow widths, including reduced motion; see the evaluation report for the actual run.

Rendered edge labels for upload/fetch/error are shortened; open/return labels use documented offsets after screenshot inspection found a collision. Captions retain the full operation meaning. Storage rejection animates the attempted write and then its delivered HTTP 503 response.

At the HTTP 429 beat the already-dequeued outbox is empty; only the next beat holds the delivery again. Camera illustration covers the approach and doorbell positions while recording.

The separate controls tile reserves nine rows so three path rows and the current caption remain visible on narrow screens without vertical scrolling.

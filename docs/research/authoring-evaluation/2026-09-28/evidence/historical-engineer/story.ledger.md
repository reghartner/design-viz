# Coverage ledger — Kestrel Porch Cam: overnight on battery
source: input/hld.md (local file; "Status: reviewed design, Kestrel Home platform team") | version: n/a | updated: 09-27-2026 12:00
evidence: input/catalog.json (approved Backstage snapshot, version 1), input/code-evidence.md (approved reviewed code locations)
spec: out/kestrel-overnight.spec.json (stamped) · page: out/kestrel-overnight.html

Status: complete — spec stamped, built with 0 errors / 0 warnings, self-audit below.

Spec locations below use `D.` for `page.blocks[0].diagram`.

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Every 30 minutes the camera sends a heartbeat to event-ingest" | heartbeat cam → router → event-ingest → device-shadow; app device page "Battery NN% · updated <time>" | covered @ D.steps bed, lowbatt, charging, w-reconnect (edges cam->router, router->ingest, ingest->shadow); unshown heartbeats advance D.panels.phoneapp.battery (illus) |
| 2 | contract | "battery %, charging yes/no, firmware" | heartbeat payload fields | covered @ D.edges router->ingest label, camlog lines; firmware named in caption of `bed` only (no value in source) |
| 3 | flow | "Between heartbeats the app shows the last reported value." | app lags device | covered @ D.panels.phoneapp.battery detail "Updated <time>" vs D.panels.batt |
| 4 | flow | "On PIR motion the camera wakes, records a clip (about 20 s), and uploads it: POST /events to event-ingest, then the clip to clip-store." | motion upload | covered @ D.steps raccoon, h-courier, w-reconnect |
| 5 | flow | "event-ingest asks motion-classifier for a label" | classify request + label reply | covered @ D.steps raccoon-label, h-push, w-latepush (ingest->classifier, classifier->ingest ret) |
| 6 | flow | "If the label is `person` or `package`, notify-service sends a push." | package push | covered @ D.steps h-push, w-latepush |
| 7 | flow | "`animal` events are saved to the timeline with no push (default user setting)" | raccoon silent | covered @ D.steps raccoon-label (no notify edge; lastevent card) |
| 8 | flow | "When a heartbeat reports battery at or below 20%, device-shadow marks the camera `low_battery` and notify-service sends one "Porch Cam battery low" push." | low-battery push | covered @ D.steps lowbatt |
| 9 | number | "It is not sent again until battery goes above 30%." | re-arm 30% | covered @ D.steps charging / h-courier captions; battery card detail "low_battery until above 30%"; never reached (max 21%) |
| 10 | flow | "When the panel produces power the camera reports charging=yes on its next heartbeat. The app shows the solar charging icon." | solar report | covered @ D.steps sunrise (physical), charging (report; power card icon `solar`) |
| 11 | number | "Idle drain is about 1% per hour." | 1 %/h | covered @ D.panels.batt.drainPerHour=1 (between 4:00 AM and sunrise, and on the outage path); see tension row 34 |
| 12 | number | "Each recorded clip uses about 1%." | clip 1% | covered @ D.steps h-courier, w-courier (batt drain 1); raccoon clip absorbed by the hold (row 34) |
| 13 | number | "Solar in morning light adds about 3–4% per hour." | 3–4 %/h | covered @ D.panels.batt.chargePerHour=3.5 (A4: no answer; assumed net +3.5) |
| 14 | failure | "If the camera cannot reach the router it keeps recording to its local SD card and retries every 2 minutes." | SD queue + retry | covered @ D.steps w-courier, w-retry (failures cam->router blocked), camlog |
| 15 | number | "retries every 2 minutes" | 2 min | covered @ D.steps w-retry caption + camlog (8:07, 8:09, 8:11 illus times) |
| 16 | failure | "On reconnect it uploads queued clips and sends a heartbeat." | reconnect | covered @ D.steps w-reconnect |
| 17 | failure | "device-shadow marks the camera offline when two heartbeats in a row are missed (60 minutes)" | offline rule | covered @ D.nodes.shadow.codeRefs shadow.offline + section text; not triggered (outage 12 min, no heartbeat missed) |
| 18 | number | "(60 minutes)" | offline threshold | covered @ D.steps w-retry caption |
| 19 | failure | "before that the app still shows the last state with an older "updated" time" | stale-but-online view | covered @ D.steps w-courier, w-retry (link card Online, "Updated 8:00 AM") |
| 20 | number | "Battery is 25%, not charging." | start 25% | covered @ D.panels.batt.initial.charge, D.panels.phoneapp.initial (also operator A5) |
| 21 | number | "a heartbeat reports 20% → low-battery push" | 20% anchor | covered @ D.steps lowbatt (batt charge 20; card 20) |
| 22 | flow | "Morning: a courier drops a package." / "Resident opens the clip." | happy ending | covered @ D.steps h-courier, h-push, h-open |
| 23 | failure | "Alternate: at the delivery, home Wi-Fi is down. ... Wi-Fi returns about 10 minutes later; the clip uploads, then the package push is sent (late)." | Wi-Fi path | covered @ D.paths wifi: w-courier, w-retry, w-reconnect, w-latepush |
| 24 | number | "about 10 minutes later" | outage length | covered @ D.steps w-reconnect time 8:15 (delivery 8:05 + 10) |
| 25 | number | "about 20 s" | clip length | covered @ camlog lines, lastevent/clip card detail |
| 26 | service | "Porch Cam (device)" | camera | covered @ D.nodes.cam (not a catalog service) |
| 27 | service | "Home router" "Not a Kestrel service." | router | covered @ D.nodes.router (not a catalog service) |
| 28 | service | "event-ingest" | bound | covered @ D.nodes.ingest.binding (component:default/event-ingest, api postEvent) |
| 29 | service | "motion-classifier" "Owned by the ML team." | classifier | covered @ D.nodes.classifier; unbound: not in supplied catalog |
| 30 | service | "clip-store" | bound | covered @ D.nodes.clips.binding (component:default/clip-store, api uploadClip) |
| 31 | service | "device-shadow" | bound | covered @ D.nodes.shadow.binding (component:default/device-shadow, api putState) |
| 32 | service | "notify-service" / "through Apple/Google push" | bound; APNs/FCM relay | covered @ D.nodes.notify.binding (component:default/notify-service, api sendPush); D.nodes.pushgw (third party, not a catalog service) |
| 33 | service | "Kestrel app (phone)" | bound, no API | covered @ D.nodes.app.binding (component:default/kestrel-app) |
| 34 | number | operator: "Low-battery heartbeat around 4:00 AM" vs HLD "about 1% per hour" + "about 1%" per clip | tension: from 25% at 10:30 PM, 1 %/h and one clip reach 20% at ~2:30 AM | covered @ D.steps raccoon, raccoon-label (batt charge 25 held), lowbatt (charge 20 anchor); said on page (section text, batt note) |
| 35 | number | step clock minutes | 10:30 PM, 1:10 AM, 4:00 AM, 6:50 AM, 8:05 AM operator; 7:00 AM charging heartbeat (next :00/:30 after sunrise); 8:03 Wi-Fi drop, 8:06 open, 8:11 retry, 8:16 late push illus | covered @ D.steps[].time; illus ones labelled in section text |
| 36 | number | unshown scheduled heartbeats | 11:00 PM … 3:30 AM (25%, held), 4:30 … 6:30 AM, 7:30, 8:00 AM | covered @ D.panels.phoneapp.battery detail at raccoon, sunrise, h-courier, w-courier (illus) |
| 37 | permalink | catalog.json catalogUrl × 5 | Backstage links | covered @ D.nodes.{ingest,clips,shadow,notify,app}.binding.catalogUrl |
| 38 | permalink | catalog.json definitionUrl × 4 | API definitions | covered @ D.nodes.{ingest,clips,shadow,notify}.binding.api.definitionUrl |
| 39 | permalink | code-evidence.md ingest.heartbeat | src/routes/heartbeat.ts 18-44 @ 232a7fae… | covered @ D.nodes.ingest.codeRefs; steps bed, lowbatt, charging, w-reconnect |
| 40 | permalink | code-evidence.md ingest.event | src/routes/events.ts 22-81 @ 232a7fae… | covered @ D.nodes.ingest.codeRefs; steps raccoon, raccoon-label, h-courier, h-push, w-reconnect, w-latepush |
| 41 | permalink | code-evidence.md shadow.lowbattery | src/rules/lowBattery.go 9-37 @ e69b820b… | covered @ D.nodes.shadow.codeRefs; step lowbatt |
| 42 | permalink | code-evidence.md shadow.offline | src/rules/offline.go 11-29 @ e69b820b… | covered @ D.nodes.shadow.codeRefs; no step (never fires) |
| 43 | permalink | code-evidence.md notify.push | lib/push/send.py 40-88 @ 2fb55bed… | covered @ D.nodes.notify.codeRefs; steps lowbatt, h-push, w-latepush |
| 44 | permalink | code-evidence.md clips.upload | src/upload.rs 15-62 @ fc642217… | covered @ D.nodes.clips.codeRefs; steps raccoon, h-courier, w-reconnect |
| 45 | permalink | code-evidence.md app.devicepage | app/screens/DevicePage.tsx 12-140 @ 35715c5b… | covered @ D.nodes.app.codeRefs; no step (the app's read of device-shadow is not drawn, D5) |
| 46 | flow | "Out of scope" "Live view, two-way audio, subscription tiers." | | out-of-scope: HLD excludes them |
| 47 | contract | heartbeat "firmware" field | | out-of-scope: no value given; named only |
| 48 | flow | catalog postHeartbeat, getClip, getState operations | | covered @ D.edges labels router->ingest (POST /heartbeats), app->clips (GET /clips/{clipId}); getState named in phoneapp source endpoint |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | Technical level (default Engineering) | Engineering: every service hop, API operations, code references | 09-27-2026 | whole page | active |
| A2 | Span and clock (default Thu Oct 1 10:00 PM …) | Starts Thursday Sep 24 at 10:30 PM; plausible illustrative minutes where not given; 12-h clock and short date kept as default (no objection) | 09-27-2026 | D.storyTime start 2026-09-24T22:30, end 2026-09-25T08:30 | active |
| A3 | Key moment times | Raccoon ~1:10 AM, low-battery heartbeat ~4:00 AM, sunrise 6:50 AM, courier 8:05 AM | 09-27-2026 | D.steps raccoon, lowbatt, sunrise, h-courier, w-courier | active |
| A4 | Solar 3–4 %/h net or gross (default net +3.5 %/h) | no answer; assumed: net +3.5 %/h | 09-27-2026 | D.panels.batt.chargePerHour | active |
| A5 | Outage window (default 9:05–9:15, no missed heartbeat) | Wi-Fi-down alternate at the delivery (courier 8:05); window not given. no answer on minutes; assumed: Wi-Fi drops 8:03, returns 8:15, no heartbeat missed, no offline | 09-27-2026 | D.steps w-courier…w-latepush | active |
| A6 | Alternate path ends at late push | Outcomes: happy path plus Wi-Fi-down alternate (end not specified); no answer; assumed: ends at the late push | 09-27-2026 | D.paths wifi | active |
| A7 | Audience and takeaway | Camera-platform and device-state engineers; see which service does what at each moment, how the app's view lags the device's real battery, how the outage delays the package push | 09-27-2026 | worksheet A; section text | active |
| A8 | (new) starting state | Battery 25%, not charging, online, Wi-Fi good, no notifications | 09-27-2026 | D.panels.*.initial | active |
| A9 | (new) catalog/code | catalog.json and code-evidence.md are the only approved identities | 09-27-2026 | D.nodes.*.binding, codeRefs | active |
| A10 | (new) delivery | Standalone HTML; no mobile checks | 09-27-2026 | build | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | 25%→20% anchors cannot both be met at the stated 1 %/h + 1 %/clip (that reaches 20% at ~2:30 AM and the 2:30 heartbeat would already fire the low-battery push). Per skill rule 5: the rate does not apply between the anchors; battery held at 25% on the steps between (raccoon, raccoon-label), jumps to 20% at 4:00 AM; the raccoon clip's 1% is absorbed in the hold. Said on the page. | operator anchor wins over rate | D.steps raccoon, raccoon-label, lowbatt; section text; batt note |
| D2 | chargePerHour 3.5 applied as net gain (engine does not drain while charging) | A4 assumed | D.panels.batt |
| D3 | Charging reported at the 7:00 AM heartbeat (first :00/:30 after 6:50 sunrise); heartbeats on :00/:30 from the 10:30 PM start | "reports charging=yes on its next heartbeat" + 30-min cadence | D.steps charging |
| D4 | Unshown scheduled heartbeats advance the app battery card at raccoon (1:00 AM), sunrise (6:30 AM), and courier steps (8:00 AM), labelled illustrative | rule 9, fixed 30-min schedule, nothing stops it | D.panels.phoneapp.battery patches |
| D5 | The app's GET of device-shadow is not drawn: the HLD says "The app reads this" but not when. The device-app panel shows the device page as it renders from device-shadow's state (note in the app). app.devicepage codeRef on the app node only | no read timing in source | D.panels.phoneapp note; D.nodes.app.codeRefs |
| D6 | Edge kinds: cam→router `wifi` (custom, "Wi-Fi"); router→event-ingest `https` (HLD "over HTTPS"); router→clip-store, ingest→shadow, ingest/shadow→notify, app↔clip-store `https` (catalog endpoints are https); ingest↔classifier `unspec` ("Transport unspecified", not in catalog); notify→push gateway→app `push` ("Apple/Google push") | honesty rules on kinds | D.edges, page.protocols |
| D7 | The low-battery push is triggered by device-shadow (edge shadow→notify) | HLD item 3 + shadow.lowbattery "triggers one low-battery push" | D.edges shadow->notify |
| D8 | Classifier label reply drawn as `ret` edge | HLD "asks … for a label"; ingest.event "requests a classification label" | D.edges classifier->ingest |
| D9 | clip-store reply to the app's open drawn as `ret` edge ("clip") | a read has a sourced reply (catalog getClip) | D.edges clips->app |
| D10 | Wi-Fi outage: `cam->router` blocked (camera cannot reach the router); router tone `alert` during the outage, `ok` on return | HLD item 6, scenario | D.steps w-courier, w-retry, w-reconnect |
| D11 | Precedence on the app: battery card keeps `battery-low` (low_battery holds until above 30%); the separate Power card shows the `solar` icon from the 7:00 AM report | HLD items 3 and 4 both hold | D.panels.phoneapp |
| D12 | "Last event" card has no declared source (HLD does not say which service serves the timeline) | honesty | D.panels.phoneapp.fields lastevent |
| D13 | Camera screen panel uses stock `package-drop` scene; hidden until the delivery (the raccoon has no fitting stock scene) | scene rules | D.panels.clip visible:false + panelVisibility |
| D14 | Binding api operations: event-ingest postEvent, clip-store uploadClip, device-shadow putState, notify-service sendPush; kestrel-app no api (catalog lists none); motion-classifier unbound | catalog | D.nodes.*.binding |
| D15 | Anchor uniqueness of codeRefs not verifiable (no checkouts supplied); anchors and lines copied verbatim from code-evidence.md | bindings rules | D.nodes.*.codeRefs |
| D16 | Tones: router `alert` at outage, `ok` on reconnect; no other tones (low battery is shown by panels, not a service fault) | tone rules | D.steps |
| D17 | Happy path does not clear notifications when the clip is opened (HLD does not say) | honesty | D.steps h-open |

## Storyboard worksheet

### A. Story

**Level:** engineering (A1).
**Audience:** camera-platform and device-state engineers (A7).
**Takeaway:** at every moment you can see which service acts; the app's device page trails the real battery by up to one heartbeat, and a Wi-Fi outage delays (does not lose) the package push.
**Story (60-second narration):** 10:30 PM Thursday: the resident goes to bed; the Porch Cam's heartbeat goes through the home router to event-ingest, which writes 25%, not charging, to device-shadow; the device page reads "25% · updated 10:30 PM". At 1:10 AM a raccoon crosses the porch: the camera records 20 s, POSTs the event and PUTs the clip; motion-classifier labels it `animal`, it is saved to the timeline, and nothing is pushed — the phone stays quiet. The operator places the low-battery heartbeat at 4:00 AM; the HLD's 1 %/h would have got there around 2:30, so the page holds the battery at 25% and says so. At 4:00 AM the heartbeat reports 20%: device-shadow sets `low_battery` and notify-service sends one "Porch Cam battery low" push via Apple/Google push. Sunrise at 6:50: the panel charges the battery, but the app still says "not charging, updated 6:30" until the 7:00 heartbeat reports charging=yes and the solar icon appears. The battery stays under 30%, so the low-battery state stays. At 8:05 the courier drops a package. Happy path: the event and clip upload, the classifier says `package`, notify-service pushes "Package delivered at front door", and at 8:06 the resident opens the clip from clip-store. Wi-Fi path: Wi-Fi dropped at 8:03; the clip goes to the SD card, retries every 2 minutes fail, device-shadow still shows Online with "updated 8:00 AM" (offline needs 60 min). Wi-Fi returns at 8:15: the queued clip uploads, a heartbeat goes out, and the package push arrives at 8:16, eleven minutes late.

**What would I show?**
1. Most important moment: the 6:50 → 7:00 AM pair (battery panel charging while the app still says not charging), and w-retry (camera has the clip on SD while the app shows Online, updated 8:00). The battery panel next to the device app shows it best.
2. Expected but missing: which code runs at each beat → step codeRefs; the router being the failed hop → blocked edge + router tone.
3. Must NOT believe: that the camera went offline in device-shadow during the outage; that the raccoon triggered a push; that low battery cleared when charging started; that the push was lost.

### B. Panel plan

| Panel id | Type | Physical or reported | Question it answers | Best moment | Starting state | Must never show |
|---|---|---|---|---|---|---|
| batt | battery | physical | What is the camera's real charge and is it charging? | sunrise / charging | 25%, cells, draining (A8); drain 1 %/h (HLD), charge 3.5 %/h (A4 assumed) | charging before 6:50; a rise without charging |
| phoneapp | deviceapp | reported (device-shadow via the device page) | What does the resident's app show, and how old is it? | charging, w-retry | app screen, battery 25 "Updated 10:30 PM", power Not charging, connection Online, last event —, no notifications (A8) | a value that changes without a delivered or scheduled heartbeat; Offline during a 12-min outage; a raccoon push |
| clip | screen (package-drop) | physical camera view | What did the camera record at the delivery? | h-courier / w-courier | hidden | the delivery scene before 8:05; any raccoon view |
| camlog | log | physical (camera-side) | What does the camera itself do: record, upload, queue on SD, retry? | w-courier, w-retry | empty | an upload during the outage |

Rejected: `phone` panel (the device app shows notifications); `state` panel for device-shadow (app card shows shadow state); `homemap` (one camera on one porch adds nothing).

Customer-visible items: "Battery NN% · updated <time>" → phoneapp.battery; solar charging icon → phoneapp.power icon `solar`; "Porch Cam battery low" push → phoneapp notify; "Package delivered at front door" push → phoneapp notify; last event → phoneapp.lastevent; opened clip → phoneapp.clipcard + clip screen; online/offline → phoneapp.link.

### C. Paths

| Path id | Label | Shared prefix | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| happy | Package push on time | bed, raccoon, raccoon-label, lowbatt, sunrise, charging | h-courier | resident opens the clip (8:06) | none |
| wifi | Wi-Fi down at delivery | same | w-courier | late package push (8:16) | whether resident opens it (not in HLD) |

### D. Time table

**Story time:** start `2026-09-24T22:30`; end `2026-09-25T08:30`; clock `12h`; date `short` (A2).
**Battery rates:** batt drain 1 %/h (HLD "about 1% per hour"), charge 3.5 %/h net (HLD "3–4%", A4 assumed net), clip drain 1 (HLD).

Anchors: 25% at 10:30 PM (A8); 1:10 AM raccoon, 4:00 AM low-battery heartbeat reporting 20% (A3 + HLD), 6:50 AM sunrise, 8:05 AM courier (A3). Tension: 1 %/h + 1 % clip reaches 20% at ~2:30 AM; operator time kept (D1).

Report schedule: heartbeats every 30 min on :00/:30 from 10:30 PM: 10:30 (shown), 11:00 … 3:30 (unshown, 25% held), 4:00 (shown), 4:30 … 6:30 (unshown), 7:00 (shown, charging=yes), 7:30, 8:00 (unshown); happy path ends 8:06; wifi path: outage 8:03–8:15 swallows no scheduled heartbeat; reconnect heartbeat 8:15 (shown).

| Path | Step | `time` | Story time | Anchor/illus | Battery (physical) | App last report + freshness | Day/night |
|---|---|---|---|---|---|---|---|
| both | bed | (start) | 10:30 PM Thu, Sep 24 | anchor A2/A8 | 25, draining | 10:30 PM 25%: "Updated 10:30 PM" | night |
| both | raccoon | `2026-09-25T01:10` | 1:10 AM Fri, Sep 25 | anchor A3 | charge 25 (hold, D1) | 1:00 AM 25% not shown, illus: "Updated 1:00 AM" | night |
| both | raccoon-label | — | 1:10 AM | — | charge 25 (hold) | holds | night |
| both | lowbatt | `2026-09-25T04:00` | 4:00 AM | anchor A3 + HLD 20% | charge 20 (anchor) | 4:00 AM 20% delivered: "Updated 4:00 AM" | night |
| both | sunrise | `2026-09-25T06:50` | 6:50 AM | anchor A3 | drift → ≈17.2; trend charging, source solar | 6:30 AM ≈17.5 not shown, illus: "Updated 6:30 AM"; power still Not charging | dawn |
| both | charging | `2026-09-25T07:00` | 7:00 AM | illus (D3) | charging drift → ≈17.8 | 7:00 AM delivered: ≈18, charging: "Updated 7:00 AM" | day |
| happy | h-courier | `2026-09-25T08:05` | 8:05 AM | anchor A3 | ≈21.5, drain 1 → ≈20.5 | 8:00 AM ≈21 not shown, illus: "Updated 8:00 AM" | day |
| happy | h-push | — | 8:05 AM | — | holds | holds | day |
| happy | h-open | `+1m` | 8:06 AM | illus | drift | holds "Updated 8:00 AM" | day |
| wifi | w-courier | `2026-09-25T08:05` | 8:05 AM | anchor A3; drop 8:03 illus | same as h-courier | 8:00 AM ≈21 not shown, illus | day |
| wifi | w-retry | `08:11` | 8:11 AM | illus (2-min retries 8:07/8:09/8:11) | drift | holds "Updated 8:00 AM" (11 min old; offline needs 60) | day |
| wifi | w-reconnect | `08:15` | 8:15 AM | HLD "about 10 minutes later" | drift ≈21.1 | 8:15 AM delivered ≈21: "Updated 8:15 AM" | day |
| wifi | w-latepush | `+1m` | 8:16 AM | illus | drift | holds | day |

Exact values: copied from the walk into the self-audit.

### E. Step x panel matrix

```
### bed   paths: happy, wifi   time: 10:30 PM
Beat: Resident goes to bed; the 10:30 PM heartbeat reports 25%, not charging; event-ingest writes it to device-shadow.
Hops claimed: cam -> router (Wi-Fi); router -> event-ingest (POST /heartbeats); event-ingest -> device-shadow (write state)
Edges: cam->router, router->ingest, ingest->shadow
Missing hops check: none; no response in source
Report?: report at 10:30 PM delivered: battery 25, power Not charging, Online — already the starting state (A8)
Focus: phoneapp
batt: holds: starting 25%
phoneapp: holds: initial state is this report
clip: holds: hidden
camlog: patch: "10:30 PM heartbeat → battery 25%, charging no"
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.heartbeat
Evidence: rows 1, 2, 20

### raccoon   paths: happy, wifi   time: 1:10 AM
Beat: PIR motion; the camera records ~20 s and uploads: POST /events to event-ingest, then the clip to clip-store.
Hops claimed: cam -> router; router -> event-ingest (POST /events); router -> clip-store (PUT /clips/{clipId})
Edges: cam->router, router->ingest, router->clips
Missing hops check: none
Report?: unshown scheduled report at 1:00 AM, illus: battery 25 (held), "Updated 1:00 AM"
Focus: camlog
batt: patch: charge 25, note "held at 25% (times vs 1%/h)"
phoneapp: patch: battery detail "Updated 1:00 AM"
clip: holds: hidden (no raccoon scene)
camlog: patch: PIR motion, record 20 s, POST /events, PUT clip
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload
Evidence: rows 4, 12, 34, 36

### raccoon-label   paths: happy, wifi   time: 1:10 AM
Beat: event-ingest asks motion-classifier; label animal; saved to the timeline; no push.
Hops claimed: event-ingest -> motion-classifier; motion-classifier -> event-ingest (label)
Edges: ingest->classifier, classifier->ingest (ret)
Missing hops check: no notify edge on purpose
Report?: no report
Focus: phoneapp
batt: holds: same minute (hold from raccoon)
phoneapp: patch: lastevent "Animal · 1:10 AM", ready, detail "Saved to timeline · no push"
clip: holds: hidden
camlog: holds: nothing on the camera
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.event
Evidence: rows 5, 7

### lowbatt   paths: happy, wifi   time: 4:00 AM
Beat: heartbeat reports 20%; device-shadow marks low_battery; notify-service sends one push through Apple/Google push.
Hops claimed: cam -> router -> event-ingest -> device-shadow -> notify-service -> push gateway -> app
Edges: cam->router, router->ingest, ingest->shadow, shadow->notify, notify->pushgw, pushgw->app
Missing hops check: push gateway relay added (HLD "through Apple/Google push")
Report?: report at 4:00 AM delivered: battery 20, "Updated 4:00 AM · low_battery"
Focus: phoneapp
batt: patch: charge 20 (anchor), note
phoneapp: patch: battery 20, icon battery-low, detail; notify "Porch Cam battery low"
clip: holds: hidden
camlog: patch: "4:00 AM heartbeat → battery 20%, charging no"
State cleared: battery card normal → low (icon); power, link still true
Icons: phoneapp.battery → battery-low
Tones: none
Code/binding: ingest.heartbeat, shadow.lowbattery, notify.push
Evidence: rows 8, 21, 34

### sunrise   paths: happy, wifi   time: 6:50 AM
Beat: Sun on the panel: the battery starts charging; nothing is reported yet.
Hops claimed: none (physical)
Edges: none (nodes: cam)
Missing hops check: none
Report?: unshown scheduled report at 6:30 AM, illus: battery ≈18, "Updated 6:30 AM · low_battery"
Focus: batt
batt: patch: trend charging, source solar, note
phoneapp: patch: battery value (6:30 report) + detail; power holds Not charging
clip: holds: hidden
camlog: patch: "6:50 AM solar panel producing power"
State cleared: batt draining → charging; app power card still Not charging (true as reported)
Icons: none (app has not heard)
Tones: none
Code/binding: none
Evidence: rows 10, 13, 36

### charging   paths: happy, wifi   time: 7:00 AM
Beat: next heartbeat reports charging=yes; device-shadow updated; app shows the solar icon; low_battery stays (below 30%).
Hops claimed: cam -> router -> event-ingest -> device-shadow
Edges: cam->router, router->ingest, ingest->shadow
Missing hops check: none
Report?: report at 7:00 AM delivered: battery ≈18, power "Solar · charging"
Focus: phoneapp
batt: holds: drift only (charging)
phoneapp: patch: battery value, detail "Updated 7:00 AM · low_battery until above 30%"; power "Solar · charging", icon solar, detail "Updated 7:00 AM"
clip: holds: hidden
camlog: patch: "7:00 AM heartbeat → battery 18%, charging yes"
State cleared: power Not charging → Solar charging; battery-low icon still true
Icons: phoneapp.power → solar
Tones: none
Code/binding: ingest.heartbeat
Evidence: rows 9, 10

### h-courier   paths: happy   time: 8:05 AM
Beat: courier drops a package; camera records and uploads event + clip.
Hops claimed: cam -> router -> event-ingest (POST /events); router -> clip-store (PUT clip)
Edges: cam->router, router->ingest, router->clips
Missing hops check: none
Report?: unshown scheduled reports 7:30, 8:00 AM, illus: battery ≈21 "Updated 8:00 AM"
Focus: clip
batt: patch: drain 1 (clip)
phoneapp: patch: battery value + detail "Updated 8:00 AM"; power detail "Updated 8:00 AM"
clip: patch: visible, mode rec
camlog: patch: PIR, record, POST /events, PUT clip
State cleared: none
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload
Evidence: rows 4, 12, 22

### h-push   paths: happy   time: 8:05 AM
Beat: classifier labels package; event-ingest forwards to notify-service; push via Apple/Google push.
Hops claimed: ingest -> classifier -> ingest; ingest -> notify -> push gateway -> app
Edges: ingest->classifier, classifier->ingest, ingest->notify, notify->pushgw, pushgw->app
Missing hops check: push gateway relay
Report?: no report
Focus: phoneapp
batt: holds: same minute
phoneapp: patch: notify "Package delivered at front door"; lastevent "Package · 8:05 AM", icon package
clip: patch: mode save, banner "Clip uploaded · package"
camlog: holds: nothing on the camera
State cleared: lastevent Animal → Package
Icons: phoneapp.lastevent → package
Tones: none
Code/binding: ingest.event, notify.push
Evidence: rows 5, 6

### h-open   paths: happy   time: 8:06 AM
Beat: resident opens the clip; the app fetches it from clip-store.
Hops claimed: app -> clip-store (GET /clips/{clipId}); clip-store -> app (clip)
Edges: app->clips, clips->app (ret)
Missing hops check: none
Report?: no report (clip fetch, not device state)
Focus: phoneapp
batt: holds: drift only
phoneapp: patch: clipcard visible "Package · 8:05 AM", detail "Playing · 20 s"
clip: patch: banner "Opened in the Kestrel app 8:06 AM"
camlog: holds: nothing on the camera
State cleared: no state change; notifications stay (D17)
Icons: none
Tones: none
Code/binding: none (clips.upload does not run on a read)
Evidence: row 22

### w-courier   paths: wifi   time: 8:05 AM
Beat: Wi-Fi dropped at 8:03; courier drops package; camera records to SD; POST /events cannot be sent.
Hops claimed: cam -> router fails (blocked)
Edges: failures cam->router blocked
Missing hops check: none
Report?: unshown scheduled reports 7:30, 8:00 AM (before the drop), illus: battery ≈21 "Updated 8:00 AM"
Focus: camlog
batt: patch: drain 1
phoneapp: patch: battery value + detail "Updated 8:00 AM"; power detail "Updated 8:00 AM"; link detail "Updated 8:00 AM" (still Online)
clip: patch: visible, mode rec
camlog: patch: Wi-Fi lost 8:03, PIR, record, saved to SD (queue 1), POST not sent
State cleared: router up → down (tone); app link Online still true as device-shadow's last state
Icons: none (app does not know)
Tones: router alert
Code/binding: none (no service reached)
Evidence: rows 14, 19, 23

### w-retry   paths: wifi   time: 8:11 AM
Beat: retries every 2 minutes fail; device-shadow still shows Online with updated 8:00 AM (offline needs 60 min).
Hops claimed: cam -> router fails
Edges: failures cam->router blocked
Missing hops check: none
Report?: no report
Focus: phoneapp
batt: holds: drift only
phoneapp: holds: every detail names 8:00 AM, still true
clip: patch: mode save, banner "Saved to SD card · upload queued"
camlog: patch: retries 8:07, 8:09, 8:11 failed
State cleared: none
Icons: none
Tones: router alert (carried)
Code/binding: none (offline rule does not fire)
Evidence: rows 15, 17, 18, 19

### w-reconnect   paths: wifi   time: 8:15 AM
Beat: Wi-Fi returns; camera uploads the queued event and clip and sends a heartbeat.
Hops claimed: cam -> router; router -> event-ingest (POST /events + POST /heartbeats); router -> clip-store (PUT clip); event-ingest -> device-shadow
Edges: cam->router, router->ingest, router->clips, ingest->shadow
Missing hops check: none
Report?: report at 8:15 AM delivered: battery ≈21 "Updated 8:15 AM"
Focus: camlog
batt: holds: drift only
phoneapp: patch: battery value/detail, power detail, link detail "Updated 8:15 AM"
clip: patch: banner "Queued clip uploaded 8:15 AM"
camlog: patch: reconnect, upload queue, heartbeat
State cleared: router down → up (tone ok); camera queue 1 → 0 (log)
Icons: none
Tones: router ok
Code/binding: ingest.event, clips.upload, ingest.heartbeat
Evidence: rows 16, 24

### w-latepush   paths: wifi   time: 8:16 AM
Beat: classifier labels package; push sent 11 minutes after the delivery.
Hops claimed: ingest -> classifier -> ingest; ingest -> notify -> push gateway -> app
Edges: ingest->classifier, classifier->ingest, ingest->notify, notify->pushgw, pushgw->app
Missing hops check: none
Report?: no report
Focus: phoneapp
batt: holds: drift only
phoneapp: patch: notify "Package delivered at front door"; lastevent "Package · 8:05 AM", icon package, detail "Uploaded 8:15 AM · push 8:16 AM"
clip: holds: banner from reconnect still true
camlog: holds: nothing on the camera
State cleared: lastevent Animal → Package
Icons: phoneapp.lastevent → package
Tones: none (router ok carried)
Code/binding: ingest.event, notify.push
Evidence: rows 6, 23
```

### F. Coverage grid

| Path: happy | bed | raccoon | raccoon-label | lowbatt | sunrise | charging | h-courier | h-push | h-open |
|---|---|---|---|---|---|---|---|---|---|
| batt | H | P | H | P | P | H | P | H | H |
| phoneapp | H | P | P | P | P | P | P | P | P |
| clip | H | H | H | H | H | H | P | P | P |
| camlog | P | P | H | P | P | P | P | H | H |

| Path: wifi | bed | raccoon | raccoon-label | lowbatt | sunrise | charging | w-courier | w-retry | w-reconnect | w-latepush |
|---|---|---|---|---|---|---|---|---|---|---|
| batt | H | P | H | P | P | H | P | H | H | H |
| phoneapp | H | P | P | P | P | P | P | H | P | P |
| clip | H | H | H | H | H | H | P | P | P | H |
| camlog | P | P | H | P | P | P | P | P | P | H |

Boring panel check: `clip` is H for six steps because it is hidden until the delivery (panel visibility), then patched on every delivery step. Kept. `batt` holds are drift-only (it moves with the clock). Busy steps: none all-P except h-courier/w-courier where caption names the camera view.

### G. Icon state plan

| Panel.element | Default icon | State | Set at (icon) | Clears at | Restore |
|---|---|---|---|---|---|
| phoneapp.battery | battery | low_battery (≤20 reported) | lowbatt (`battery-low`) | not restored on either path: never above 30% | none |
| phoneapp.power | (none) | solar charging reported | charging (`solar`) | not restored: charging persists | none |
| phoneapp.link | wifi | offline | never set (outage 12 min < 60 min) | — | — |
| phoneapp.lastevent | recorded | package event | h-push / w-latepush (`package`) | not restored | none |

Precedence: battery card keeps `battery-low` while charging (re-arm above 30% never reached); charging shows in the separate Power card (`solar`, HLD "solar charging icon") and in batt `trend: charging`. The batt panel's own icon is computed (charging bolt).

### H. Bindings and code

| Node | Catalog entityRef | API | codeRefs | Steps where it runs | Gap |
|---|---|---|---|---|---|
| cam | — | — | — | — | not a catalog service (device) |
| router | — | — | — | — | not a catalog service (home Wi-Fi) |
| ingest | component:default/event-ingest | api:default/event-ingest postEvent POST /events | ingest.heartbeat (src/routes/heartbeat.ts 18-44); ingest.event (src/routes/events.ts 22-81) | heartbeat: bed, lowbatt, charging, w-reconnect; event: raccoon, raccoon-label, h-courier, h-push, w-reconnect, w-latepush | postHeartbeat named in edge label only (binding holds one operation) |
| classifier | — | — | — | — | unbound: not in supplied catalog; code not located |
| clips | component:default/clip-store | api:default/clip-store uploadClip PUT /clips/{clipId} | clips.upload (src/upload.rs 15-62) | raccoon, h-courier, w-reconnect | getClip named in edge label |
| shadow | component:default/device-shadow | api:default/device-shadow putState PUT /devices/{deviceId}/state | shadow.lowbattery (src/rules/lowBattery.go 9-37); shadow.offline (src/rules/offline.go 11-29) | lowbattery: lowbatt; offline: none: never fires (outage 12 min) | — |
| notify | component:default/notify-service | api:default/notify-service sendPush POST /notifications | notify.push (lib/push/send.py 40-88) | lowbatt, h-push, w-latepush | — |
| pushgw | — | — | — | — | not a catalog service (Apple/Google push, third party) |
| app | component:default/kestrel-app | none in catalog | app.devicepage (app/screens/DevicePage.tsx 12-140) | none: the app's read is not drawn (D5) | — |

### I. Checkable expectations

1. `lowbatt` (4:00 AM) shows batt.charge = 20 and phoneapp.battery.value = 20 (operator anchor); raccoon shows batt.charge = 25 (hold).
2. At `sunrise` batt.trend = charging while phoneapp.power.value = "Not charging"; at `charging` power = "Solar · charging".
3. At `w-retry` phoneapp.link.value = "Online" (offline needs 60 min) and the clock reads 8:11 AM.
4. No notification between bed and lowbatt (raccoon silent): phoneapp notifications count 0 at raccoon-label, 1 at lowbatt, 2 at h-push / w-latepush.
5. The last step of path wifi reads 8:16 AM Fri, Sep 25; happy ends 8:06 AM.
6. phoneapp.battery icon stays `battery-low` to the end of both paths.

## Self-audit (09-27-2026)

**Build:** `node tools/validate.js` 0 errors, 0 warnings (after shortening two edge labels flagged by lint); `tools/page_build.py … --root out` → PAGE_BUILD OK (no `--allow-warnings`). Spec stamped with `tools/compatibility.js --stamp`.

**Walk:** `spec_walk.py out/kestrel-overnight.spec.json --catalog input/catalog.json --rate batt=-1:3.5 --state` plus expects → **0 WARN, 6 CHECK, 2 NOTE**; all 13 `--expect` checks ok (lowbatt batt.charge=20 and card=20, raccoon charge=25, sunrise trend charging with power still "Battery · not charging", charging power "Solar · charging", w-retry link Online, battery-low icon at the end of both paths).
- A first run also passed `--rate phoneapp.battery=-1:3.5`; it gave one WARN at `lowbatt` (card 25 → 20 over 2h50 = -1.76/h). This is the operator-anchor jump from D1 (the stated rate does not apply between the two anchors). The batt panel's same jump is marked `(anchor)` by the walk. That `--rate` does not fit this interval, so it was dropped rather than bending the anchor. The card's other changes (-0.71/h, +2.77/h) are within the source rates.
- CHECK raccoon-label, h-push, w-latepush (lastevent card has no declared route): correct by D12. The HLD does not say which service serves the timeline, and each change sits on the step that lights the classify/notify path for that event.
- CHECK sunrise, h-courier, w-courier (battery card advances with no delivering edge): these are unshown scheduled heartbeats (6:30 AM; 7:30/8:00 AM, before the 8:03 drop), labelled illustrative in D4 and in the section text; the detail names the report time. Values match the walk's physical charge at those times (17.5 → 18; 21.25 → 21).
- NOTE app.devicepage and shadow.offline on nodes only: correct per section H (read not drawn, D5; offline rule never fires in a 12-minute outage).

**Worksheet comparison:** paths, step order and endings match C. Clock column matches D (10:30 PM Thu → 8:06 AM / 8:16 AM Fri, never backward; no panel clock/date patches). Physical values from the walk: 25 (held) → 20 at 4:00 → 17.17 at 6:50 → 17.75 at 7:00 → 20.54 at 8:05 (after clip) → 20.6 at 8:06 / 21.13 at 8:15 / 21.18 at 8:16. App reports: 25 (1:00), 20 (4:00), 18 (6:30, 7:00), 21 (8:00, 8:15). Camera log values (18% at 7:00, 21% at 8:15) match. P/H pattern in the walk equals grid F on both paths. Icons match G (battery-low from lowbatt to the end; solar from charging; package at h-push / w-latepush; link never changes). Tones: router alert at w-courier, carried through w-retry, ok at w-reconnect. Bindings copied from catalog.json; `--catalog` found no unknown entityRef or operation. All seven codeRefs carry the full SHAs and anchors from code-evidence.md.

**Transition check:** at lowbatt, the battery card changes value, icon and detail together. At sunrise, the power card correctly still says not charging (reported). At charging, the power card changes value, icon and detail. At w-courier, the link card stays Online with detail "Updated 8:00 AM", which is true to device-shadow. At w-reconnect, router tone → ok and every card detail → 8:15 AM. No stale "just now" text anywhere (all freshness is absolute "Updated <time>").

**Reverse audit:** every edge kind is in D6. The tones are D10/D16. The notifications are HLD items 3 and 6 (titles verbatim). Card values come from rows 1, 8, 10, 21 and D4. Screen scene is D13, log lines are rows 1, 4, 14 and 16, links are rows 37 to 45. Minutes not in the source are in rows 35 and 36 and in the section text.

**Not done:**
- **Visual checks:** no browser was available. Not checked: node and edge layout, label collisions, the router→clip-store edge crossing rows, the device-app card layout and freshness text on screen, the clip screen appearing at the delivery (panelVisibility) and staying hidden before it, the notification stack, path switching between happy and wifi, and the router's tone colors.
- **Anchor uniqueness:** the `grep -cF` check was not run because no source checkouts were supplied (D15).

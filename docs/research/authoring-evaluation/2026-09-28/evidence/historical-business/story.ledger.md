# Coverage ledger — Kestrel Porch Cam: one night on battery
source: input/hld.md ("HLD: Kestrel Porch Cam — overnight on battery", reviewed design) + input/catalog.json + input/code-evidence.md + operator answers | version: n/a | updated: 09-27-2026

Spec: `kestrel-overnight.spec.json` (stamped). One section, `blocks[0]` (id `overnight`), one diagram, two paths.
Location shorthand: `D` = `blocks[0].diagram`.

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Every 30 minutes the camera sends a heartbeat" | heartbeat camera → router → ingest → shadow | covered @ D.steps bedtime, lowbatt, charging, b-back (edges cam->router, router->ingest, ingest->shadow) |
| 2 | flow | "On PIR motion the camera wakes, records a clip" | event + clip upload, classify, push only for person/package | covered @ D.steps raccoon (animal, no push), a-courier (package, push), b-back + b-late |
| 3 | flow | "device-shadow marks the camera `low_battery`" | one low-battery push; re-arm above 30% | covered @ D.steps lowbatt (push), charging + a-open captions (no re-send, still marked low) |
| 4 | flow | "reports charging=yes on its next heartbeat" | charging shown after next heartbeat | covered @ D.steps sunrise (physical), charging (reported 7:00), a-open (app power card, `solar` icon) |
| 5 | failure | "If the camera cannot reach the router" | records to SD card, retries every 2 min, uploads queued clip + heartbeat on reconnect | covered @ D.steps b-courier (cam->router blocked, SD banner), b-back |
| 6 | failure | "marks the camera offline when two heartbeats in a row are missed" | offline only after 60 min | covered @ D.steps b-back caption ("never marked offline"); rule not triggered (10-min outage) |
| 7 | service | "Porch Cam (device)" | device | covered @ D.nodes.cam (not a catalog service) |
| 8 | service | "Home router" | not a Kestrel service | covered @ D.nodes.router (not a catalog service) |
| 9 | service | "event-ingest" | component:default/event-ingest | covered @ D.nodes.ingest.binding (api postEvent) |
| 10 | service | "motion-classifier" | not in supplied catalog | covered @ D.nodes.classifier — unbound: not in supplied catalog (D4) |
| 11 | service | "clip-store" | component:default/clip-store | covered @ D.nodes.clipstore.binding (api uploadClip) |
| 12 | service | "device-shadow" | component:default/device-shadow | covered @ D.nodes.shadow.binding (api putState) |
| 13 | service | "sends them through Apple/Google push" | third-party push relay | covered @ D.nodes.push (not a catalog service) |
| 14 | service | "notify-service" | component:default/notify-service | covered @ D.nodes.notify.binding (api sendPush) |
| 15 | service | "Kestrel app (phone)" | component:default/kestrel-app (no APIs in catalog) | covered @ D.nodes.app.binding |
| 16 | number | "Every 30 minutes" | heartbeat interval | covered @ D.steps bedtime caption; schedule in worksheet D |
| 17 | number | "about 20 s" | clip length | covered @ D.steps raccoon caption |
| 18 | number | "at or below 20%" | low threshold | covered @ D.panels batt.low=20; D.steps lowbatt |
| 19 | number | "above 30%" | re-arm threshold | covered @ D.steps lowbatt, charging, a-open captions |
| 20 | number | "Idle drain is about 1% per hour" | drain rate | covered @ D.panels batt.drainPerHour=1 (applies from 4:00 AM on; see D5) |
| 21 | number | "Each recorded clip uses about 1%" | per-clip cost | covered @ D.steps a-courier, b-courier `drain: 1`; not applied at raccoon (D5) |
| 22 | number | "adds about 3–4% per hour" | solar charge | covered @ D.panels batt.chargePerHour=3 (low end, D6) |
| 23 | number | "retries every 2 minutes" | Wi-Fi retry | covered @ D.steps b-courier caption |
| 24 | number | "(60 minutes)" | offline threshold | covered @ D.steps b-back caption ("shorter than an hour") |
| 25 | number | "Battery is 25%, not charging" | start anchor | covered @ D.panels batt.initial.charge=25; D.panels app.initial |
| 26 | number | "a heartbeat reports 20%" | low anchor, 4:00 AM (A3) | covered @ D.steps lowbatt `charge: 20` |
| 27 | number | "about 10 minutes later" | outage length | covered @ D.steps b-back time 08:20 |
| 28 | contract | "battery %, charging yes/no, firmware" | heartbeat fields | covered @ edge label "battery · charging" (firmware out-of-scope: nothing in the story turns on it) |
| 29 | number | illustrative | step minutes 1:05, 4:00, 7:00, 8:10, 8:12, 8:20; heartbeats on :00/:30 | covered @ D.steps[].time; page text says illustrative |
| 30 | number | illustrative | app card values at 8:12 from the unshown 8:00 AM heartbeat (21%, charging) | covered @ D.steps a-open |
| 31 | flow | "Resident opens the clip." | app reads status + plays clip | covered @ D.steps a-open |
| 32 | flow | "the clip uploads, then the package push is sent (late)" | late push | covered @ D.steps b-back, b-late |
| 33 | out | "Live view, two-way audio, subscription tiers." | excluded by source | out-of-scope: excluded by source |
| 34 | out | "The app's device page shows \"Battery NN% · updated <time>\"" | device page between heartbeats | covered @ D.panels app battery card detail "Updated 8:00 AM" (only opened at a-open) |
| 35 | permalink | catalog URLs, code links | Backstage + code refs | covered @ D.nodes.*.binding / codeRefs |
| 36 | service | code ingest.heartbeat src/routes/heartbeat.ts 18-44 @232a7fa… | | covered @ D.nodes.ingest.codeRefs; steps bedtime, lowbatt, charging, b-back |
| 37 | service | code ingest.event src/routes/events.ts 22-81 @232a7fa… | | covered @ D.nodes.ingest.codeRefs; steps raccoon, a-courier, b-back, b-late |
| 38 | service | code shadow.lowbattery src/rules/lowBattery.go 9-37 @e69b820… | | covered @ D.nodes.shadow.codeRefs; step lowbatt |
| 39 | service | code shadow.offline src/rules/offline.go 11-29 @e69b820… | | covered @ D.nodes.shadow.codeRefs; no step (never fires, outage < 60 min) |
| 40 | service | code notify.push lib/push/send.py 40-88 @2fb55be… | | covered @ D.nodes.notify.codeRefs; steps lowbatt, a-courier, b-late |
| 41 | service | code clips.upload src/upload.rs 15-62 @fc64221… | | covered @ D.nodes.clipstore.codeRefs; steps raccoon, a-courier, b-back |
| 42 | service | code app.devicepage app/screens/DevicePage.tsx 12-140 @35715c5… | | covered @ D.nodes.app.codeRefs; step a-open |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | Technical level (default Story) | Story. Product manager; keep it about the customer; no service names or APIs on screen | 09-27-2026 | whole page: plain node titles, plain connection legend, source map hidden | active |
| A2 | Audience & takeaway | Support leads and PMs; they can explain why a customer got a low-battery alert at night and why the package alert came late when Wi-Fi was down | 09-27-2026 | blocks[0].heading; captions lowbatt, b-late | active |
| A3 | Span & times | Thu evening ~10:30 PM; raccoon ~1 AM; low-battery ~4 AM; sunrise ~6:50 AM; courier a little after 8 AM; pick minutes | 09-27-2026 | D.storyTime; steps times 22:30, 01:05, 04:00, 06:50, 08:10 | active |
| A4 | Endings | Normal morning; Wi-Fi down at delivery | 09-27-2026 | D.paths normal, wifi-down | active |
| A5 | Resident opens clip in Wi-Fi-down ending? (default no) | no answer; assumed: no — path ends at the late alert | 09-27-2026 | D.paths wifi-down ends at b-late | active |
| A6 | Show app page + separate real battery meter? (default yes) | no explicit answer; assumed: yes | 09-27-2026 | D.panels app, batt | active |
| A7 | Show raccoon clip on timeline? (default yes) | no explicit answer; assumed: shown in the caption only (app is not opened overnight, so no card shows it) | 09-27-2026 | D.steps raccoon caption | active |
| A8 | Starting situation | Battery 25%, not charging, everything online, no alerts on the phone | 09-27-2026 | D.panels batt.initial, app.initial | active |
| A9 | Anything technical | "Use whatever you were given and decide sensibly" | 09-27-2026 | Decisions I made | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | Story date Thu Oct 1 → Fri Oct 2, 2026; 12-h clock; short date | operator said "Thursday"; next Thursday after today | D.storyTime |
| D2 | Backend drawn as plainly named boxes, one per service ("Camera check-ins", "Clip sorter", "Video storage", "Camera status", "Alerts") instead of one "Kestrel cloud" box | lets each box carry its Backstage binding and code refs (rule 10) while no service name appears on screen | D.nodes |
| D3 | Connection legend in plain words: Home Wi-Fi, Internet, Inside Kestrel cloud, Phone alert | story level; HLD says HTTPS for camera→ingest only; inside-cloud transport unspecified | page.protocols |
| D4 | motion-classifier ("Clip sorter") left unbound | not in supplied catalog | D.nodes.classifier |
| D5 | **Anchor conflict.** 25% at 10:30 PM and a 20% report at ~4 AM cannot both hold at the design's ~1 %/h + 1 %/clip (would reach 20% at ~2:30 AM). Operator time kept; battery held at 25% through 1:05 AM (`charge: 25`), 20% anchored at 4:00 AM; the raccoon clip's 1% is not shown separately. Stated on the page (section text) and in the battery note. | skill rule 5 | D.steps raccoon, lowbatt; blocks[0].text[1] |
| D6 | Solar charge 3 %/h (low end of "3–4%"), treated as the net rate while charging (engine applies charge instead of drain) | claims least | D.panels batt.chargePerHour |
| D7 | Heartbeats placed on :00/:30 (10:30 PM, 11:00 … 8:00 AM); only 10:30 PM, 4:00 AM, 7:00 AM and the 8:20 reconnect heartbeat drawn; others are unshown scheduled reports | HLD cadence; illustrative phase | worksheet D |
| D8 | App cards change only when the resident opens the app (a-open); the phone stays on its home screen all night, so overnight card values are not visible | HLD does not say the app refreshes while closed | D.steps a-open |
| D9 | App battery card at 8:12 shows 21% "Updated 8:00 AM" (unshown 8:00 heartbeat, physical 20.67); physical meter shows 20% (after the 8:10 clip) | reported vs physical (rule 9); illustrative | D.steps a-open |
| D10 | Power card icon `solar` at a-open ("app shows the solar charging icon"); battery card keeps default icon — HLD does not say the device page shows the low_battery mark; low mark explained in caption | HLD Behavior 4 | D.steps a-open |
| D11 | Wi-Fi failure drawn on camera→Wi-Fi link as `blocked`; router tone `warn` at b-courier, `base` at b-back; retries not drawn as separate steps | HLD "cannot reach the router"; retries mentioned in caption | D.steps b-courier, b-back |
| D12 | Outage 8:10–8:20; reconnect on the 8:20 retry (fits 2-min cadence); 8:00 heartbeat assumed delivered before the outage | "about 10 minutes later"; illustrative | D.steps b-back |
| D13 | Classifier reply drawn as a return edge ("animal / package") | HLD "asks motion-classifier for a label"; code ingest.event "requests a classification label" | D.edges classifier->ingest |
| D14 | App reads drawn with replies (status; clip) | HLD "The app reads this"; "Resident opens the clip"; catalog getState/getClip | D.edges shadow->app, clipstore->app |
| D15 | Camera view panel (`package-drop` scene) shown only from the delivery on; hidden at night (no stock raccoon scene) | skill: scene fixed per diagram | D.panels porch.visible=false; panelVisibility at a-courier, b-courier |
| D16 | Binding API operation per node: ingest postEvent, clipstore uploadClip, shadow putState, notify sendPush; kestrel-app has none | catalog | D.nodes.*.binding.api |
| D17 | App data sources declared (status → shadow, clips → clipstore) but hidden (`showSources:false`) | lets the walk verify card deliveries without showing service names | D.panels app.sources |

## Storyboard worksheet

### A. Story

**Level:** Story (A1).
**Audience:** support leads and product managers (A2); they know the app, not the backend.
**Takeaway:** A low-battery alert at night is a single alert sent when the camera's regular check-in reports 20%; a late package alert means the camera couldn't reach home Wi-Fi — it kept the clip and sent it when Wi-Fi returned.
**Story (60-second narration):** At 10:30 PM Thursday the resident goes to bed; the Porch Cam is at 25%, not charging, and checks in every 30 minutes. At 1:05 AM a raccoon crosses the porch: the camera records and uploads, the clip is sorted as an animal, and — by default — no alert. At 4:00 AM the regular check-in reports 20%: the phone gets one "Porch Cam battery low" alert, and no repeats until the battery is back above 30%. At 6:50 the sun comes up and the battery meter starts climbing; at 7:00 the check-in says "charging". At 8:10 a courier drops a package. Normal morning: the alert arrives at once and at 8:12 the resident taps it and watches the clip; the camera page shows 21% from the 8:00 check-in, charging from the sun. Wi-Fi-down morning: the camera records to its memory card but can't reach the Wi-Fi; nothing reaches the phone. At 8:20 Wi-Fi is back, the clip uploads, and the package alert arrives ten minutes late.

**What would I show?**
1. Most important moment: `lowbatt` (the 4:00 AM alert on the lock screen) and `b-late` (the late package alert at 8:20 next to the earlier memory-card banner). Phone panel carries both.
2. Expected but not shown yet: the camera page in the Wi-Fi ending — not in the source (A5), so not shown. The actual battery vs the app's number — shown by the separate battery meter.
3. Must not believe: that the camera died or went offline during the outage (never marked offline); that the raccoon triggered an alert; that more than one battery alert is sent; that Kestrel lost the clip.

### B. Panel plan

| Panel id | Type | Physical or reported | Question it answers | Best moment | Starting state | Must never show |
|---|---|---|---|---|---|---|
| app | deviceapp | reported | What did the resident see, and when? | lowbatt, b-late, a-open | home screen, no alerts; cards 25%, Battery only, Online (10:30 PM) (A8) | an alert the source doesn't send (raccoon); card changes without an app read |
| batt | battery | physical | How much charge does the camera really have? | lowbatt, sunrise | 25%, cells, draining (A8) | a value between the anchors other than the held 25 |
| porch | screen (`package-drop`) | physical | What happened at the door, and where did the clip go? | a-courier, b-courier | hidden, off | anything before the courier (scene is the delivery) |

Rejected: `phone` panel (deviceapp already shows lock-screen alerts); `homemap` (no raccoon icon; the porch view is enough); a state panel for "camera status" (would name a service).
Customer-visible items: low-battery push → app.notify at lowbatt; package push → app.notify at a-courier / b-late; device page battery/charging/updated/online/last event → app cards at a-open; solar icon → app.power icon at a-open.

### C. Paths

| Path id | Label | Shared prefix | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| normal | Normal morning | bedtime, raccoon, lowbatt, sunrise, charging | a-courier | resident plays the clip (a-open) | none |
| wifi-down | Wi-Fi down at delivery | same | b-courier | late package alert (b-late) | whether the resident opens the clip (not in source) |

### D. Time table

**Story time:** start `2026-10-01T22:30`; end `2026-10-02T08:30`; clock 12h; date short (A3, D1).
**Battery rates:** batt drain 1 %/h (source), charge 3 %/h (source low end, D6). Extra drain 1% per clip (source) at a-courier / b-courier. Anchors: 25% at 10:30 PM (operator), 20% at 4:00 AM (operator time + source value). Tension: rates imply 20% at ~2:30 AM → hold 25 at raccoon (D5).
**Report schedule:** heartbeats 10:30 PM, 11:00, … every 30 min … 8:00 AM, 8:30 (normal path); on wifi-down 8:00 delivered, none possible 8:10–8:20, reconnect heartbeat at 8:20.

| Path | Step | `time` | Shown | Anchor/illus | Battery | Last report app holds / freshness | Day/night |
|---|---|---|---|---|---|---|---|
| both | bedtime | 2026-10-01T22:30 | 10:30 PM Thu, Oct 1 | anchor (A3/A8) | 25 | 10:30 PM, 25%, "Updated 10:30 PM" (hidden: home screen) | night |
| both | raccoon | 2026-10-02T01:05 | 1:05 AM Fri, Oct 2 | ~1 AM operator; minutes illus | `charge: 25` held (D5) | holds (app closed) | night |
| both | lowbatt | 2026-10-02T04:00 | 4:00 AM | anchor | `charge: 20` | report delivered to cloud; app closed, push only | night |
| both | sunrise | 06:50 | 6:50 AM | anchor | 17.17 (drift), trend charging, source solar | holds | dawn |
| both | charging | 07:00 | 7:00 AM | illus (next heartbeat) | 17.67 | report to cloud; app closed | day |
| normal | a-courier | 08:10 | 8:10 AM | "a little after 8" | 20.17 (after `drain: 1`) | 8:00 report unshown (illus 20.67→21%) | day |
| normal | a-open | 08:12 | 8:12 AM | illus | 20.27 | app reads: 21%, "Updated 8:00 AM", charging, last check-in 8:00, Package 8:10 | day |
| wifi-down | b-courier | 08:10 | 8:10 AM | as above | 20.17 (after `drain: 1`) | holds | day |
| wifi-down | b-back | 08:20 | 8:20 AM | "about 10 minutes later" | 20.67 | reconnect heartbeat to cloud; app closed | day |
| wifi-down | b-late | (none) | 8:20 AM | seconds later | 20.67 | holds; push only | day |

### E. Step x panel matrix

```
### bedtime   paths: normal, wifi-down   time: 10:30 PM
Beat: Resident goes to bed; camera checks in at 25%, not charging.
Hops claimed: camera -> Wi-Fi -> check-ins -> camera status
Edges: cam->router, router->ingest, ingest->shadow
Missing hops check: none (no response evidenced)
Report?: report at 10:30 PM delivered to the cloud; app not open
Focus: batt
app: holds: initial state (home screen, no alerts)
batt: holds: initial 25%
porch: holds: hidden until the delivery
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.heartbeat
Evidence: rows 1, 16, 25; A8

### raccoon   paths: both   time: 1:05 AM
Beat: Raccoon; clip recorded, uploaded, sorted animal; no alert.
Hops claimed: camera -> Wi-Fi -> check-ins (event); Wi-Fi -> video storage (clip); check-ins -> clip sorter -> check-ins (label)
Edges: cam->router, router->ingest, router->clipstore, ingest->classifier, classifier->ingest
Missing hops check: no alert edges (animal, no push)
Report?: no report
Focus: batt / caption
app: holds: no alert for animals; app closed
batt: patch: charge 25 (hold, D5), note
porch: holds: hidden (scene is the delivery)
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload (notify.push not run: animal not forwarded)
Evidence: rows 2, 17, 21; D5

### lowbatt   paths: both   time: 4:00 AM
Beat: Check-in reports 20%; one low-battery alert.
Hops claimed: camera -> Wi-Fi -> check-ins -> camera status -> alerts -> phone alert network -> app
Edges: cam->router, router->ingest, ingest->shadow, shadow->notify, notify->push, push->app
Missing hops check: none
Report?: report at 4:00 delivered to cloud; push to phone
Focus: app
app: patch: notify "Porch Cam battery low"
batt: patch: charge 20 (anchor), note
porch: holds: hidden
State cleared: camera now marked low (cloud); battery zone LOW on meter (computed)
Icons: none on cards (app not open); meter icon computed
Tones: none
Code/binding: ingest.heartbeat, shadow.lowbattery, notify.push
Evidence: rows 3, 18, 19, 26; A3

### sunrise   paths: both   time: 6:50 AM
Beat: Sunrise; solar starts charging; nobody told yet.
Hops claimed: none
Edges: none (nodes: cam)
Missing hops check: none
Report?: no report (next heartbeat 7:00)
Focus: batt
app: holds: nothing reported yet
batt: patch: trend charging, source solar, note
porch: holds: hidden
State cleared: batt draining -> charging, cells -> solar
Icons: batt computed battery-charging
Tones: none
Code/binding: none
Evidence: rows 4, 22

### charging   paths: both   time: 7:00 AM
Beat: Check-in reports charging=yes; still under 30%, no new alert.
Hops claimed: camera -> Wi-Fi -> check-ins -> camera status
Edges: cam->router, router->ingest, ingest->shadow
Missing hops check: none
Report?: report at 7:00 to cloud; app closed
Focus: caption / batt
app: holds: app closed
batt: holds: drift only (charging)
porch: holds: hidden
State cleared: no visible state change
Icons: none
Tones: none
Code/binding: ingest.heartbeat
Evidence: rows 4, 19

### a-courier   paths: normal   time: 8:10 AM
Beat: Courier; clip uploaded, sorted package, alert right away.
Hops claimed: camera -> Wi-Fi -> check-ins; Wi-Fi -> video storage; check-ins <-> clip sorter; check-ins -> alerts -> phone alert network -> app
Edges: cam->router, router->ingest, router->clipstore, ingest->classifier, classifier->ingest, ingest->notify, notify->push, push->app
Missing hops check: none
Report?: no heartbeat drawn (8:00 unshown)
Focus: porch
app: patch: notify "Package delivered at front door"
batt: patch: drain 1, note
porch: patch: visible, mode rec, playing
State cleared: porch hidden -> visible/rec
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload, notify.push
Evidence: rows 2, 21

### a-open   paths: normal   time: 8:12 AM
Beat: Resident taps alert; app reads status and plays clip.
Hops claimed: app -> camera status -> app; app -> video storage -> app
Edges: app->shadow, shadow->app, app->clipstore, clipstore->app
Missing hops check: none
Report?: app read delivers 8:00 AM report (illus): battery 21, charging, online; last event Package 8:10
Focus: app
app: patch: phoneScreen app; battery 21 "Updated 8:00 AM"; power "Charging from sun" icon solar; online "Last check-in 8:00 AM"; event Package icon package
batt: patch: note "charging from the sun" (clears "clip used" note)
porch: patch: mode save, banner "Clip playing in the Kestrel app"
State cleared: power "Battery only" -> "Charging from sun"; battery 25/10:30 -> 21/8:00; online detail 10:30 -> 8:00; event unknown -> Package; notifications kept (not dismissed)
Icons: app.power -> solar; app.event -> package
Tones: none
Code/binding: app.devicepage
Evidence: rows 4, 31, 34; D9, D10

### b-courier   paths: wifi-down   time: 8:10 AM
Beat: Wi-Fi down; clip saved on memory card; nothing sent.
Hops claimed: camera -> Wi-Fi (blocked)
Edges: cam->router (failures blocked)
Missing hops check: none
Report?: no report
Focus: porch
app: holds: no alert (nothing reached Kestrel)
batt: patch: drain 1, note
porch: patch: visible, mode save, banner "Saved on the camera's memory card · Wi-Fi down"
State cleared: router healthy -> warn
Icons: none
Tones: router warn
Code/binding: none (device firmware not supplied)
Evidence: rows 5, 23

### b-back   paths: wifi-down   time: 8:20 AM
Beat: Wi-Fi back; event + queued clip uploaded, heartbeat sent; never marked offline.
Hops claimed: camera -> Wi-Fi -> check-ins (event, heartbeat); Wi-Fi -> video storage (queued clip); check-ins -> camera status
Edges: cam->router, router->ingest, router->clipstore, ingest->shadow
Missing hops check: none
Report?: reconnect heartbeat 8:20 to cloud; app closed
Focus: porch / caption
app: holds: app closed, no alert yet
batt: patch: note "charging from the sun"
porch: patch: banner "Uploaded after Wi-Fi returned"
State cleared: router warn -> base; porch banner memory card -> uploaded
Icons: none
Tones: router base
Code/binding: ingest.event, clips.upload, ingest.heartbeat (shadow.offline not run)
Evidence: rows 5, 6, 24, 27

### b-late   paths: wifi-down   time: 8:20 AM
Beat: Clip sorted package; alert arrives ~10 min late.
Hops claimed: check-ins <-> clip sorter; check-ins -> alerts -> phone alert network -> app
Edges: ingest->classifier, classifier->ingest, ingest->notify, notify->push, push->app
Missing hops check: none
Report?: no report
Focus: app
app: patch: notify "Package delivered at front door"
batt: holds: same minute
porch: holds: uploaded banner still true
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.event, notify.push
Evidence: rows 2, 32
```

### F. Coverage grid

| normal | bedtime | raccoon | lowbatt | sunrise | charging | a-courier | a-open |
|---|---|---|---|---|---|---|---|
| app | H | H | P | H | H | P | P |
| batt | H | P | P | P | H | P | P |
| porch | H | H | H | H | H | P | P |

| wifi-down | bedtime | raccoon | lowbatt | sunrise | charging | b-courier | b-back | b-late |
|---|---|---|---|---|---|---|---|---|
| app | H | H | P | H | H | H | H | P |
| batt | H | P | P | P | H | P | P | H |
| porch | H | H | H | H | H | P | P | H |

Boring panel check: `porch` holds for the whole night by design — it is hidden until the delivery (D15). `app` is mostly H because the resident is asleep; its clock still moves each step. Kept.
Busy step check: a-courier (all P) — caption names the delivery; focus porch.

### G. Icon state plan

| Panel.element | Default icon | State | Set at | Clears at | Restore |
|---|---|---|---|---|---|
| app.power | none | solar charging | a-open (`solar`) | not restored on path normal: charging persists to the end | — |
| app.event | none | package event | a-open (`package`) | not restored: persists to end | — |
| app.battery | battery | low_battery mark | not set (D10: HLD does not say the page shows it) | — | — |
| app.online | wifi | offline | never (outage < 60 min) | — | — |
| batt (computed) | battery | low zone / charging | lowbatt (zone), sunrise (charging bolt, computed) | — | — |

Precedence: n/a on cards; the battery meter computes charging over low.

### H. Bindings and code

| Node | Catalog entityRef | API | codeRefs | Steps where it runs | Gap |
|---|---|---|---|---|---|
| cam | — | — | — | — | device, not a catalog service; firmware code not supplied |
| router | — | — | — | — | not a catalog service |
| ingest | component:default/event-ingest | api:default/event-ingest postEvent POST /events | ingest.heartbeat (18-44), ingest.event (22-81) | heartbeat: bedtime, lowbatt, charging, b-back; event: raccoon, a-courier, b-back, b-late | postHeartbeat also used; binding holds one operation |
| classifier | — | — | — | — | unbound: not in supplied catalog |
| clipstore | component:default/clip-store | api:default/clip-store uploadClip PUT /clips/{clipId} | clips.upload (15-62) | raccoon, a-courier, b-back | a-open uses getClip (not on binding) |
| shadow | component:default/device-shadow | api:default/device-shadow putState PUT /devices/{deviceId}/state | shadow.lowbattery (9-37), shadow.offline (11-29) | lowbattery: lowbatt; offline: none — never runs (outage 10 min < 60) | — |
| notify | component:default/notify-service | api:default/notify-service sendPush POST /notifications | notify.push (40-88) | lowbatt, a-courier, b-late | — |
| push | — | — | — | — | third party (Apple/Google), not a catalog service |
| app | component:default/kestrel-app | none in catalog | app.devicepage (12-140) | a-open | — |

### I. Checkable expectations

1. The 10:30 PM step shows 25% and the 4:00 AM step shows 20% on both paths (anchors). — verified by walk `--expect`.
2. No alert on the phone at the raccoon step; exactly one battery alert across the night. — verified in `--state` (notifications 0 → 1 at lowbatt, no further battery alert).
3. On wifi-down, the phone has only the battery alert at 8:10 and the package alert first appears at 8:20 (b-late). — verified in `--state` and `--expect wifi-down/b-late:app.clock=8:20`.
4. The app battery card changes only at a-open, which lights app→status and back; it shows 21% "Updated 8:00 AM". — verified (`--expect normal/a-open:app.battery.value=21`, 0 checks).
5. The camera is never shown offline on wifi-down. — verified: online card unchanged, no offline code on steps.

## Self-audit (09-27-2026)

- Build: `page_build.py` → PAGE_BUILD OK, 0 errors, 0 warnings (also `validate.js`: 0/0). Built from the stamped spec.
- Walk: `spec_walk.py out/kestrel-overnight.spec.json --catalog input/catalog.json --rate batt=-1:3 --state` plus expects → **0 warnings, 0 checks**, 1 NOTE (shadow.offline on node, no step — correct, never fires). All `--expect` anchors pass. The only rate outside 1–3 %/h is the 25 → 20 jump at lowbatt, the operator anchor (D5).
- First walk raised 2 CHECKs (card changes with no declared route); fixed by declaring hidden app sources (D17). A wrong `--expect` of mine (comparing the notifications list to a count) was removed; the state was read by hand instead.
- Transition check: sunrise (draining → charging, cells → solar) ✓; b-courier/b-back router tone warn → base ✓; battery note "clip used about 1%" cleared at a-open and b-back ✓; app cards all rewritten at a-open (power, battery, online, event) ✓.
- Reverse audit: every edge, tone, notification, icon, card value and binding traces to a ledger row or D-row; the illustrative ones are labeled on the page (blocks[0].text[1]).
- Story-level check: no service names, API paths, HTTP codes or file paths in captions, node titles, edge labels, the legend or panel text (bindings and code refs are behind the nodes only; source map hidden).
- **Visual checks not performed (no browser available):** that the focus panel visibly changes per step; the clock and date on the phone status bar; the solar/package icons appearing on the cards; the porch panel appearing at 8:10 and the scene animating; label clipping and node layout (the two-row layout with a stacked column was not seen); switching between the two endings.

## Files
- Spec (stamped): `kestrel-overnight.spec.json`; page: `kestrel-overnight.html`; manifest: `manifest.json`.
- Working files: `work/gen.py` (generates the unstamped spec), `work/kestrel-overnight.raw.json`.

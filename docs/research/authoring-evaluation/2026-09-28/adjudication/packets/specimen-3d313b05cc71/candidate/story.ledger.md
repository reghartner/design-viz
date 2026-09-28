# kestrel-overnight: coverage ledger and storyboard

Session 118e69a8-3b97-4594-a9ec-0b7b0f66c0e8 / connection c168a608-87f0-4893-8271-9bc275f8f8c6

## Status

- Turn 1 (request b76cd302-e4c5-4f75-9c10-b5ab96f7bb74): inventory done, question batch sent through the editor reply, no proposal.
- Turn 2 (request e628cf7f-45db-40fe-9160-ab40460c8a8c): operator answers recorded (A1–A6). Worksheet written, spec authored from it, then validated and walked. Base revision `c168a608-87f0-4893-8271-9bc275f8f8c6-1`. The proposal result is recorded under **Delivery**.
- Visual (browser) checks: **not done**. No browser tools are available.

## Evidence

| Source | Kind | Notes |
|---|---|---|
| input/hld.md | Reviewed design (proposed behavior) | Kestrel Porch Cam, one night on battery; scenario + Wi-Fi-down alternate |
| input/catalog.json | Approved Backstage catalog snapshot | 5 components: event-ingest, clip-store, device-shadow, notify-service, kestrel-app |
| input/code-evidence.md | Approved reviewed code locations | 7 codeRefs: ingest.heartbeat, ingest.event, shadow.lowbattery, shadow.offline, notify.push, clips.upload, app.devicepage |
| Operator answers (turn 2) | Operator decisions | Story level; audience; times; outcomes; starting state |

## Coverage ledger

Spec locations use `blocks[0].diagram` (abbreviated `D`).

| # | Class | Item | Source | Status |
|---|---|---|---|---|
| L1 | flow | Heartbeat every 30 min (battery %, charging) → cloud; app shows "Battery NN% · updated <time>" | hld B1 | covered @ D.steps bedtime, lowbatt, charging-report, b-reconnect (delivered); unshown scheduled reports at raccoon (1:00 AM), sunrise (6:30 AM), courier (8:00 AM) are illustrative; D.panels[phone].fields battery (freshness absolute) |
| L2 | flow | Motion: wake, ~20 s clip, event + clip upload, label, push only for person/package; animal saved with no push | hld B2 | covered @ D.steps raccoon (animal, no alert), a-upload, b-reconnect (package, alert) |
| L3 | flow | Low battery ≤20% → marked low + one "Porch Cam battery low" push; not again until above 30% | hld B3 | covered @ D.steps lowbatt; no re-arm (battery stays under 30) |
| L4 | flow | Solar: charging=yes on the next heartbeat; app shows solar charging icon | hld B4 | covered @ D.steps sunrise (physical), charging-report (reported; power card icon `solar`) |
| L5 | number | Idle ~1 %/h; ~1 % per clip; solar +3–4 %/h | hld B5 | covered @ D.panels[batt].drainPerHour 1, chargePerHour 3.5 (midpoint, illus), drain 1 at courier; raccoon clip see T1 |
| L6 | failure | Wi-Fi down: record to SD, retry every 2 min, on reconnect upload queue + heartbeat; offline only after 60 min | hld B6 | covered @ D.steps b-sdcard, b-reconnect; offline rule never fires (outage ~10 min) |
| L7 | scenario | Evening: bed, 25%, not charging | hld + A5 | covered @ D.steps bedtime; D.panels initial |
| L8 | scenario | Late night raccoon, animal, no push | hld + A3 | covered @ D.steps raccoon (1:04 AM) |
| L9 | scenario | Before dawn: heartbeat reports 20% → low-battery push | hld + A3 | covered @ D.steps lowbatt (4:00 AM, 20% anchor) |
| L10 | scenario | Sunrise: charging starts | hld + A3 | covered @ D.steps sunrise (6:50 AM) |
| L11 | scenario | Courier, package push "Package delivered at front door"; resident opens the clip | hld + A3 | covered @ D.steps courier (8:10 AM), a-upload, a-open |
| L12 | scenario | Alternate: Wi-Fi down at delivery; SD card; Wi-Fi back ~10 min later; upload; late push | hld + A4 | covered @ D.steps b-sdcard, b-reconnect (8:20 AM) |
| L13 | out-of-scope | Live view, two-way audio, subscription tiers | hld | out-of-scope: excluded by the design |
| S1 | service | event-ingest (component:default/event-ingest) | catalog | inside story box `cloud` (unbound story box; listed here) |
| S2 | service | clip-store (component:default/clip-store) | catalog | inside story box `cloud` |
| S3 | service | device-shadow (component:default/device-shadow) | catalog | inside story box `cloud` |
| S4 | service | notify-service (component:default/notify-service) | catalog | inside story box `cloud` |
| S5 | service | kestrel-app (component:default/kestrel-app) | catalog | covered @ D.nodes.app.binding |
| S6 | service | motion-classifier (ML team) | hld | inside story box `cloud`; unbound: not in supplied catalog |
| S7 | service | Apple/Google push | hld | D.nodes.push; not a catalog service (third party) |
| S8 | device | Home router | hld | D.nodes.router; not a Kestrel service |
| C1 | code | ingest.heartbeat: kestrel/event-ingest src/routes/heartbeat.ts 18-44 @ 232a7fae7a1b9c1a2cc709bbfb2b2f28ec579359 | code-evidence | D.nodes.cloud.codeRefs; steps bedtime, lowbatt, charging-report, b-reconnect |
| C2 | code | ingest.event: kestrel/event-ingest src/routes/events.ts 22-81 @ 232a7fae… | code-evidence | D.nodes.cloud.codeRefs; steps raccoon, a-upload, b-reconnect |
| C3 | code | shadow.lowbattery: kestrel/device-shadow src/rules/lowBattery.go 9-37 @ e69b820b1ed193a5c961cacb200492a7b6d51a55 | code-evidence | D.nodes.cloud.codeRefs; step lowbatt |
| C4 | code | shadow.offline: kestrel/device-shadow src/rules/offline.go 11-29 @ e69b820b… | code-evidence | D.nodes.cloud.codeRefs only (never runs: outage < 60 min) |
| C5 | code | notify.push: kestrel/notify-service lib/push/send.py 40-88 @ 2fb55bedb2130e15b05eb2675aec70aed75874d3 | code-evidence | D.nodes.cloud.codeRefs; steps lowbatt, a-upload, b-reconnect |
| C6 | code | clips.upload: kestrel/clip-store src/upload.rs 15-62 @ fc642217b0d93e1bd231ed4d9fd969b1415833de | code-evidence | D.nodes.cloud.codeRefs; steps raccoon, a-upload, b-reconnect |
| C7 | code | app.devicepage: kestrel/kestrel-app app/screens/DevicePage.tsx 12-140 @ 35715c5be4b5abc83e15d8dc51d216b7119657cd | code-evidence | D.nodes.app.codeRefs only (no step shows the resident opening the device page) |
| T1 | tension | Operator's 4 AM low-battery time vs design rates: 25% at 10:30 PM at ~1 %/h plus ~1 % for the raccoon clip first reaches 20% at the 2:30 AM check-in | hld B5 vs A3 | Operator time kept (anchor). Battery holds 25% until the 4:00 AM anchor (no invented in-between values); stated on the page and here |

## Amendments (operator answers, turn 2)

| # | Question | Operator answer | Applied at | Status |
|---|---|---|---|---|
| A1 | Level of detail | **Story.** Product manager; keep it about the customer (porch, camera, phone, what happened and when); no service names or APIs on screen | whole page: plain captions, plain edge and legend names, one "Kestrel cloud" box | active |
| A2 | Audience and takeaway | Support leads and product managers; they should be able to explain to a customer why a low-battery alert came in the night and why the package alert came late when Wi-Fi was down | worksheet A; section text; captions of lowbatt and b-reconnect | active |
| A3 | Time | Starts Thursday evening ~10:30 PM; raccoon ~1 AM; low-battery alert before dawn ~4 AM; sunrise ~6:50 AM; courier a little after 8 AM; "pick sensible minutes" | D.storyTime start 2026-10-01T22:30 (Thu); steps raccoon 01:04, lowbatt 04:00, sunrise 06:50, courier 08:10 | active |
| A4 | Outcomes | The normal morning, and the morning where home Wi-Fi is down when the courier comes | D.paths normal, wifi-down | active |
| A5 | Starting situation | Battery 25%, not charging, everything online, no alerts on the phone | D.panels initial | active |
| A6 | Anything technical | "I don't know. Use whatever you were given and decide sensibly." | Decisions I made | active |
| — | Title (Q7) and Wi-Fi-down ending point (Q4b) | Not answered explicitly; proposals not objected to | title "Kestrel Porch Cam: one night on battery"; wifi-down ends at the late alert (the design does not say the resident opens it) | default kept |

## Decisions I made (for engineering review)

| # | Decision | Reason | Applied at |
|---|---|---|---|
| D1 | Date: Thursday, Oct 1, 2026 (a Thursday). 12-hour clock, short date | Operator said Thursday; no date given; illus | D.storyTime |
| D2 | Minutes: raccoon 1:04 AM, low battery 4:00 AM (a :00 check-in), sunrise 6:50 AM, charging reported 7:00 AM, courier 8:10 AM, normal alert 8:11 AM, clip opened 8:12 AM, Wi-Fi back and late alert 8:20 AM | Operator gave approximate times; the design's 30-min check-in cadence (on :00/:30, phase illus) and "about 10 minutes" | D.steps[].time |
| D3 | Battery rates: drain 1 %/h (design), charge 3.5 %/h (midpoint of the design's 3–4 %/h, illus), 1 % per clip (design) | hld B5 | D.panels[batt] |
| D4 | T1: hold 25% until the 4:00 AM anchor, then 20% | Rule: anchors win, no invented in-between values | D.steps raccoon charge 25, lowbatt charge 20; page text |
| D5 | Wi-Fi goes down after the 8:00 AM check-in (illus) and comes back at 8:20 AM | Design says only "at the delivery" and "about 10 minutes later" | b-sdcard, b-reconnect |
| D6 | Backend shown as one unbound "Kestrel cloud" box. It covers event-ingest, clip-store, device-shadow, notify-service and motion-classifier. All backend code references sit behind that box | Story level (A1): no service names on screen | D.nodes.cloud |
| D7 | "Kestrel app" node bound to component:default/kestrel-app (no API; catalog lists none) | One node = one catalog service | D.nodes.app.binding |
| D8 | Phone app cards show the cloud's record of the camera (what the app shows when opened). Each card updates only at a step that lights a delivery into the cloud, or from an unshown scheduled check-in (illus) | App reads device-shadow (hld B1) | D.panels[phone] |
| D9 | Low-battery icon on the app's battery card stays through the morning (below the 30% re-arm). Solar charging shows on a separate Power card with the `solar` icon | Design: app shows solar charging icon; one icon per card | D.steps charging-report |
| D10 | Camera view panel hidden overnight and shown from the delivery: the only stock scene that fits is `package-drop`. The raccoon is shown on the home map instead | No stock raccoon scene | D.panels[cam] |
| D11 | No "offline" anywhere on the Wi-Fi path; the app keeps the 8:00 AM values with their age | Outage ~10 min < 60 min rule (hld B6) | b-sdcard |
| D12 | Wi-Fi failure drawn as `blocked` on camera→router (the link that failed) | Honesty rules | b-sdcard failures |
| D13 | No response edge on check-ins or uploads (the design shows none). The clip read on opening has a reply (a read) | Honesty rules | edges |

## Storyboard worksheet

### A. Story

**Level:** Story (A1).
**Audience:** support leads and product managers. They know the app, not the backend.
**Takeaway:** a low-battery alert at 4 AM means the camera's regular check-in reported 20%. A package alert that comes late means home Wi-Fi was down: the camera kept the clip and sent it when Wi-Fi returned.
**Story (60-second narration):** Thursday, 10:30 PM. The resident goes to bed; the Porch Cam is on battery at 25% and not charging, and its half-hourly check-in tells the Kestrel cloud so. At 1:04 AM a raccoon crosses the porch: the camera wakes, records a short clip, and sends it. The cloud sees an animal, saves it to the timeline and sends no alert. At 4:00 AM the regular check-in reports 20%. The cloud sends one "Porch Cam battery low" alert, which appears on the phone's lock screen. At 6:50 AM the sun reaches the solar panel and charging starts. The phone shows it after the 7:00 AM check-in. At 8:10 AM a courier leaves a package and the camera records it. Normal morning: the clip goes up at once, the cloud sees a package, and at 8:11 AM the phone shows "Package delivered at front door". The resident opens the clip. Wi-Fi-down morning: the camera can't reach the router, so it keeps the clip on its SD card and retries every 2 minutes. The app still shows 8:00 AM values, not "offline". Wi-Fi returns at 8:20 AM; the clip uploads and the package alert arrives, 10 minutes late.

**What would I show?**
1. Most important moments: the 4:00 AM lock-screen alert beside the battery gauge at 20%; and on the Wi-Fi path, the SD-card save (router crossed out) followed by the 8:20 AM alert. Phone panel and home map.
2. Expected but supported: that the raccoon caused no alert (the app's Last event card shows "Animal", with no notification). Also that charging shows only after a check-in (the sunrise step changes the gauge, not the phone).
3. Must not believe: that the camera went offline; that the package alert was lost; that the 4 AM alert repeats; that the phone knew about sunrise before the check-in.

### B. Panel plan

| Panel id | Type | Physical or reported | Question it answers | Best moment | Starting state | Must never show |
|---|---|---|---|---|---|---|
| home | homemap | physical | Where are the resident, raccoon, courier and package; is Wi-Fi up; is the camera recording? | raccoon; b-sdcard | resident in living room; camera asleep; router up (A5) | a courier at night; Wi-Fi down on the normal path |
| batt | battery | physical | How much charge does the camera really have? | lowbatt (20%); sunrise (charging) | 25%, cells, draining (A5) | charging before sunrise; values between the conflicting anchors (T1) |
| phone | deviceapp | reported (cloud record) | What does the resident's phone show, and how old is it? | lowbatt; a-upload; b-reconnect | home screen; battery 25% reported 10:30 PM; Battery · not charging; Online; no alerts (A5) | "offline"; a package alert during the outage; a repeat low-battery alert |
| cam | screen | physical (camera view) | What did the camera record at the door? | courier | hidden; off | a courier scene at night (hidden until 8:10 AM) |

Rejected: a separate `phone` lock-screen panel (the device app already shows notifications); a state/log panel (story level).
Customer-visible items: low-battery alert → phone notify; package alert → phone notify; battery % with update time → phone.battery; solar charging icon → phone.power icon `solar`; animal on timeline with no push → phone.lastEvent "Animal"; SD-card save → cam banner.

### C. Paths

| Path id | Label | Shared prefix | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| normal | Normal morning | bedtime, raccoon, lowbatt, sunrise, charging-report, courier | a-upload | resident opens the package clip (8:12 AM) | none |
| wifi-down | Wi-Fi down at delivery | same | b-sdcard | late package alert at 8:20 AM | why Wi-Fi dropped; exact outage start (D5) |

### D. Time table

**Story time:** start `2026-10-01T22:30` (Thu); end `2026-10-02T08:30`; clock `12h`; date `short` (A3, D1; minutes illus D2).
**Battery rates:** batt drain 1 %/h (hld), charge 3.5 %/h (illus midpoint of 3–4), clip 1 % (hld).
**Anchors:** 25% at 10:30 PM (A5); 20% at the 4:00 AM check-in (hld + A3). T1: design rates imply 20% at 2:30 AM, so the 4:00 AM time is kept and 25% held until then.
**Report schedule:** check-ins every 30 min at :00/:30 from 10:30 PM (phase illus): 10:30 … 8:00 delivered; on wifi-down the 8:30 check-in is not reached (story ends 8:20); reconnect sends an extra check-in at 8:20 (hld B6).

| Path | Step | `time` | Shown | Anchor/illus | Battery | App's last report, freshness | Day/night |
|---|---|---|---|---|---|---|---|
| both | bedtime | 2026-10-01T22:30 | 10:30 PM Thu | anchor | 25, draining | 10:30 PM check-in delivered: 25%, "Last report 10:30 PM" | night |
| both | raccoon | 01:04 | 1:04 AM Fri | ~1 AM | charge 25 (hold, T1) | unshown 1:00 AM check-in, illus: 25% | night |
| both | lowbatt | 04:00 | 4:00 AM | anchor 20% | charge 20 | 4:00 AM delivered: 20% | night |
| both | sunrise | 06:50 | 6:50 AM | ~6:50 | trend charging, source solar (drift from 20 at 1 %/h) | unshown 6:30 AM check-in, illus: walk value at 6:30 (≈18) | dawn |
| both | charging-report | 07:00 | 7:00 AM | :00 check-in | drift (charging) | 7:00 AM delivered: ≈18%, charging | day |
| both | courier | 08:10 | 8:10 AM | "a little after 8" | drain 1 (clip) | unshown 8:00 AM check-in, illus: ≈21% | day |
| normal | a-upload | 08:11 | 8:11 AM | illus | drift | holds 8:00 AM | day |
| normal | a-open | 08:12 | 8:12 AM | illus | drift | holds 8:00 AM | day |
| wifi-down | b-sdcard | 08:11 | 8:11 AM | illus | drift | holds 8:00 AM (ages) | day |
| wifi-down | b-reconnect | 08:20 | 8:20 AM | "about 10 min later" | drift | 8:20 AM delivered (reconnect check-in) | day |

### E. Step x panel matrix

```
### bedtime   paths: normal, wifi-down   time: 10:30 PM Thu
Beat: The resident goes to bed; the camera's regular check-in tells the cloud 25%, not charging.
Hops claimed: camera -> router -> cloud (check-in)
Edges: cam->router, router->cloud
Missing hops check: none; no reply (design shows none)
Report?: report at 10:30 PM delivered: phone.battery, phone.power, phone.online
Focus: home
home: patch: resident to bedroom; signal cam->hub
batt: holds: starts at 25 (initial), drift only
phone: patch: battery 25 reportedAt now; power/online unchanged values (initial)
cam: holds: hidden overnight (D10)
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.heartbeat
Evidence: L1, L7, A5

### raccoon   paths: both   time: 1:04 AM Fri
Beat: A raccoon crosses the porch; the camera wakes, records ~20 s and sends the clip; the cloud sees an animal, saves it, sends no alert.
Hops claimed: camera -> router -> cloud (event + clip)
Edges: cam->router, router->cloud
Missing hops check: no cloud->push (no alert for animals)
Report?: unshown 1:00 AM check-in, illus: battery 25; event delivered: lastEvent
Focus: home
home: patch: raccoon on porch; porchcam rec; signal cam->hub
batt: patch: charge 25 (hold, T1)
phone: patch: battery 25 reportedAt 01:00; lastEvent visible "Animal · no alert" ready reportedAt now
cam: holds: hidden overnight
State cleared: camera asleep -> recording
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload
Evidence: L2, L8, T1

### lowbatt   paths: both   time: 4:00 AM
Beat: The 4:00 AM check-in reports 20%; the cloud marks low battery and sends one alert to the phone.
Hops claimed: camera -> router -> cloud (check-in); cloud -> phone alert service -> phone (alert)
Edges: cam->router, router->cloud, cloud->push, push->app
Missing hops check: none
Report?: report at 4:00 AM delivered: battery 20
Focus: phone
home: patch: raccoon hidden; porchcam sleep; signal cam->hub
batt: patch: charge 20 (anchor)
phone: patch: notify "Porch Cam battery low"; battery 20 reportedAt now, icon battery-low
cam: holds: hidden
State cleared: camera recording -> asleep; raccoon gone
Icons: phone.battery -> battery-low
Tones: none
Code/binding: ingest.heartbeat, shadow.lowbattery, notify.push
Evidence: L3, L9

### sunrise   paths: both   time: 6:50 AM
Beat: Sunlight reaches the solar panel; charging starts. The phone doesn't know yet.
Hops claimed: none (physical)
Edges: none (nodes: cam)
Report?: unshown 6:30 AM check-in, illus: battery value at 6:30
Focus: batt
home: holds: nothing moves at the house
batt: patch: trend charging, source solar
phone: patch: battery value at 6:30, reportedAt 06:30 (still "Battery · not charging")
cam: holds: hidden
State cleared: draining -> charging (gauge only)
Icons: none (gauge computes its own bolt)
Tones: none
Code/binding: none
Evidence: L4, L10

### charging-report   paths: both   time: 7:00 AM
Beat: The next check-in says "charging"; the app now shows solar charging.
Hops claimed: camera -> router -> cloud
Edges: cam->router, router->cloud
Report?: report at 7:00 AM delivered: battery, power
Focus: phone
home: patch: signal cam->hub
batt: holds: drift only (charging)
phone: patch: battery value reportedAt now (icon stays battery-low, D9); power "Solar charging" icon solar
cam: holds: hidden
State cleared: power "Battery · not charging" -> "Solar charging"
Icons: phone.power -> solar
Tones: none
Code/binding: ingest.heartbeat
Evidence: L4

### courier   paths: both   time: 8:10 AM
Beat: A courier drops a package; the camera wakes and records.
Hops claimed: none yet (recording on the camera)
Edges: none (nodes: cam)
Report?: unshown 8:00 AM check-in, illus: battery value at 8:00
Focus: cam
home: patch: courier at door; package on porch; porchcam rec
batt: patch: drain 1 (clip)
phone: patch: battery value at 8:00 reportedAt 08:00
cam: patch: panel shown; mode rec, playing
State cleared: camera asleep -> recording
Icons: none
Tones: none
Code/binding: none
Evidence: L2, L11, D5

### a-upload   paths: normal   time: 8:11 AM
Beat: The clip goes up at once; the cloud sees a package and sends "Package delivered at front door".
Edges: cam->router, router->cloud, cloud->push, push->app
Report?: event delivered: lastEvent "Package"
Focus: phone
home: patch: courier leaves; porchcam sleep; signal cam->hub
batt: holds: drift only
phone: patch: notify package; lastEvent "Package" reportedAt now
cam: patch: mode save, banner "Clip uploaded"
State cleared: recording -> saved
Icons: none
Code/binding: ingest.event, clips.upload, notify.push
Evidence: L2, L11

### a-open   paths: normal   time: 8:12 AM
Beat: The resident taps the alert and watches the clip.
Edges: app->cloud, cloud->app (clip)
Report?: no report
Focus: phone
home: holds: package stays; resident indoors
batt: holds: drift only
phone: patch: phoneScreen app, clear
cam: patch: banner "Playing on the phone"
State cleared: notifications dismissed
Icons: none
Code/binding: none located for the clip read (clips.upload is upload only)
Evidence: L11

### b-sdcard   paths: wifi-down   time: 8:11 AM
Beat: Home Wi-Fi is down; the camera saves the clip to its SD card and retries every 2 minutes. The app still shows 8:00 AM values.
Edges: none lit; failure cam->router blocked
Report?: no report
Focus: home
home: patch: courier leaves; porchcam sleep; hub icon wifi-off
batt: holds: drift only
phone: holds: last report 8:00 AM, ages; no alert (nothing delivered); still Online (60-min rule not reached)
cam: patch: mode save, banner "Saved to SD card · waiting for Wi-Fi"
State cleared: router up -> down
Icons: home.hub -> wifi-off
Tones: router warn
Code/binding: none (offline rule does not run; outage < 60 min)
Evidence: L6, L12, D5, D11, D12

### b-reconnect   paths: wifi-down   time: 8:20 AM
Beat: Wi-Fi returns; the camera uploads the saved clip and checks in; the package alert arrives 10 minutes late.
Edges: cam->router, router->cloud, cloud->push, push->app
Report?: report at 8:20 AM delivered: battery; event: lastEvent "Package"
Focus: phone
home: patch: hub icon null; signal cam->hub
batt: holds: drift only
phone: patch: notify package; lastEvent "Package" reportedAt now; battery value reportedAt now
cam: patch: banner "Uploaded after Wi-Fi returned"
State cleared: router down -> up (icon restored, tone base)
Icons: home.hub -> null (router)
Tones: router base
Code/binding: clips.upload, ingest.event, ingest.heartbeat, notify.push
Evidence: L6, L12
```

### F. Coverage grid

| Path: normal | bedtime | raccoon | lowbatt | sunrise | charging-report | courier | a-upload | a-open |
|---|---|---|---|---|---|---|---|---|
| home | P | P | P | H | P | P | P | H |
| batt | H | P | P | P | H | P | H | H |
| phone | P | P | P | P | P | P | P | P |
| cam | H | H | H | H | H | P | P | P |

| Path: wifi-down | … shared … | courier | b-sdcard | b-reconnect |
|---|---|---|---|---|
| home | as above | P | P | P |
| batt | as above | P | H | H |
| phone | as above | P | H | P |
| cam | as above | P | P | P |

Boring-panel check: `cam` holds (hidden) all night by design (D10) and carries the morning. Kept.

### G. Icon state plan

| Panel.element | Default | State | Set at | Clears at | Restore |
|---|---|---|---|---|---|
| phone.battery | battery | low battery (≤20, re-arm >30) | lowbatt (`battery-low`) | not restored on either path: stays below 30 | none |
| phone.power | battery | solar charging | charging-report (`solar`) | not restored: charging continues | none |
| home.hub | router | Wi-Fi down | b-sdcard (`wifi-off`) | b-reconnect | `icon: null` |

Precedence: battery card keeps `battery-low` while charging below 30%; charging shows on the Power card and the gauge's trend.

### H. Bindings and code

| Node | Catalog entityRef | API | codeRefs | Steps | Gap |
|---|---|---|---|---|---|
| cam | — | — | — | — | device, not a catalog service; no firmware code supplied |
| router | — | — | — | — | home router, not a Kestrel service |
| cloud | unbound story box (covers S1–S4, S6) | — | C1–C6 | see C rows | motion-classifier not in catalog; no code for it |
| push | — | — | — | — | third party (Apple/Google), not a catalog service |
| app | component:default/kestrel-app | none in catalog | C7 | none (device page never opened on a step) | — |

### I. Checkable expectations

1. lowbatt shows 20% on the gauge and the app (anchor), at 4:00 AM Fri.
2. bedtime shows 25% (anchor) at 10:30 PM Thu.
3. The raccoon step lights no alert edge and adds no notification.
4. On wifi-down, no package alert before 8:20 AM, and the Online card never changes.
5. Only one low-battery notification on both paths.

## Self-audit (turn 2)

- `author-tools.py validate stamped.spec.json`: **0 errors, 0 warnings**.
- `author-tools.py walk stamped.spec.json --catalog input/catalog.json --state --rate batt=-1:3.5` with 6 `--expect` checks: **0 warnings, 2 checks, all expectations ok**.
  - EXPECT ok: bedtime batt 25 (both paths); lowbatt batt 20 and phone battery 20 (both); wifi-down/b-sdcard phone.online = Online; dates Thu, Oct 1 at bedtime and Fri, Oct 2 at lowbatt.
  - CHECK sunrise (phone battery 20 → 18 with no edge) and CHECK courier (18 → 21 with no edge). Correct as written: these are the unshown scheduled check-ins at 6:30 AM and 8:00 AM (rule 9b). Design B1 sets a fixed 30-minute schedule and nothing stops it before 8:00 AM. The card's detail names the report time, and the page text labels them illustrative. Values match the gauge at the report time: 6:30 AM = 20 − 2.5 = 17.5, shown as 18; 8:00 AM = 17.75 + 3.5 = 21.25, shown as 21.
  - NOTE app.devicepage and shadow.offline are on their nodes only. Correct: no step opens the device page, and the 10-minute outage is below the 60-minute offline rule (section H).
  - NOTE: the catalog services clip-store, device-shadow, event-ingest and notify-service are not bound to any node. This is intended: the Story level shows them as the unbound "Kestrel cloud" box (D6, S1–S4).
  - Numeric rates: −1.0 %/h drain and +3.5 %/h charge match D3. The lowbatt change of −1.7 %/h over 2h56 is the operator's anchor (T1).
- Rule-8 check against the `--state` output: raccoon hidden at lowbatt; courier hidden after the delivery; camera returns to sleep after each clip. The router icon is restored at b-reconnect and its tone reset to base. The Online card never claims offline. The low-battery icon stays because the battery is below 30%.
- Reverse audit: every edge, tone, notification, icon and value traces to L1–L12, D1–D13 or T1.
- **Visual/browser checks: not done** (no browser tools). Not checked: home map placement (door, camera, porch subjects), label fit on edges, phone card layout, and the camera view's delivery clip timing.

## Delivery

- Proposal `2d286992888e469c86af7fe92df21e01` (full stamped spec) against base revision `c168a608-87f0-4893-8271-9bc275f8f8c6-1`. Result: **applied**, new revision `c168a608-87f0-4893-8271-9bc275f8f8c6-2`, Undo available.
- No standalone OUT build (per request). The accepted editor story is the deliverable.

## Open engineering gaps

- motion-classifier: no catalog entry, no code reference.
- Camera firmware (SD-card queue, 2-minute retry, charging report): no code reference supplied.
- Clip read when the resident opens the clip: catalog lists clip-store `getClip`, but no reviewed code location was supplied.
- The heartbeat path is `POST /heartbeats` in the catalog; the design names only `POST /events`. Not shown at Story level.
- The design does not say when Wi-Fi dropped (D5) or whether the resident opens the late alert. The Wi-Fi-down ending stops at the alert.
- An engineering view (named services, bindings for S1–S4) could be added later on the same step IDs.

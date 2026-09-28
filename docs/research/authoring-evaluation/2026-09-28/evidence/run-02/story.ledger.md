# Coverage ledger — kestrel-overnight
source: input/hld.md ("HLD: Kestrel Porch Cam — overnight on battery", local file, "Status: reviewed design") + input/catalog.json (approved fictional Backstage snapshot) + input/code-evidence.md (approved reviewed code locations) | version: n/a (local, unversioned) | updated: 09-28-2026

Editor session b8272650-d826-42ab-9cd8-fc6df7a7d92a. Questions sent in request 5cfe86f4-f85d-4960-adf1-6da3f42f709c; answers received in request 02821c17-7611-4972-a850-491d7c763b97 (base revision 0d98f758-eed3-440f-bc3b-8613d10def0a-1). Spec locations below refer to the editor story `blocks[0]` (id `kestrel-overnight`).

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Every 30 minutes the camera sends a heartbeat to event-ingest" | heartbeat: camera → home router → cloud (event-ingest writes device-shadow) | covered @ steps bedtime, lowbatt, charging, b-back (edges cam->router, router->cloud) |
| 2 | contract | "battery %, charging yes/no, firmware" | heartbeat payload (human labels; no wire field names) | covered @ captions (battery %, charging); firmware out-of-scope: plays no part in the story |
| 3 | flow | "On PIR motion the camera wakes, records a clip (about 20 s), and uploads it" | motion: event + clip to cloud; label requested; alert only for person/package | covered @ steps raccoon, a-deliver, b-back |
| 4 | flow | "`animal` events are saved to the timeline with no push (default user setting)" | raccoon clip saved, no alert | covered @ step raccoon (no cloud->push edge; caption) |
| 5 | flow | "device-shadow marks the camera `low_battery` and notify-service sends one" | one low-battery alert at the ≤20 % heartbeat | covered @ step lowbatt (edges to phone; notify "Porch Cam battery low") |
| 6 | number | "at or below 20%" | low threshold 20 % | covered @ panels.batt.low=20; step lowbatt |
| 7 | number | "It is not sent again until battery goes above 30%" | re-arm 30 %; never reached in the story | covered @ phone.battery icon stays battery-low; section text |
| 8 | flow | "reports charging=yes on its next heartbeat. The app shows the solar charging icon" | charging reported at the next heartbeat after sunrise; app shows solar icon | covered @ steps sunrise (physical), charging (report), a-open (phone.power icon solar) |
| 9 | number | "Idle drain is about 1% per hour" | drain 1 %/h | covered @ panels.batt.drainPerHour=1 (applies from 4:00 AM; see D4) |
| 10 | number | "Each recorded clip uses about 1%" | 1 % per clip | covered @ steps a-deliver, b-deliver drain 1; raccoon clip absorbed in the held value (D4) |
| 11 | number | "Solar in morning light adds about 3–4% per hour" | charge 3–4 %/h | covered @ panels.batt.chargePerHour=3.5 (midpoint of the stated range) |
| 12 | number | "Every 30 minutes" | heartbeat interval | covered @ section text; schedule on :00/:30 is illustrative (D6) |
| 13 | number | "records a clip (about 20 s)" | clip ~20 s | covered @ step raccoon caption |
| 14 | failure | "If the camera cannot reach the router it keeps recording to its local SD card and retries every 2 minutes" | Wi-Fi down: SD card, retry every 2 min | covered @ steps b-deliver, b-retry (cam->router blocked) |
| 15 | number | "retries every 2 minutes" | retry 2 min | covered @ step b-retry (8:12 AM) and b-back (8:20 AM = 5th retry) |
| 16 | failure | "Wi-Fi returns about 10 minutes later; the clip uploads, then the package push is sent (late)" | late upload + late alert | covered @ step b-back |
| 17 | number | "two heartbeats in a row are missed (60 minutes)" | offline rule not triggered by a 10-min outage | covered @ section text; shadow.offline code on node cloud only (D5) |
| 18 | number | "about 10 minutes later" | outage ≈10 min | covered @ steps b-deliver 8:10 → b-back 8:20 |
| 19 | service | "Porch Cam (device)" | battery doorbell camera with solar panel | covered @ nodes.cam; panels.home.cam; panels.batt |
| 20 | service | "Home router" "Not a Kestrel service." | home Wi-Fi relay | covered @ nodes.router; panels.home.router (not a catalog service) |
| 21 | service | "event-ingest" | component:default/event-ingest | covered @ nodes.cloud (story box, unbound; D2) |
| 22 | service | "motion-classifier" "Owned by the ML team." | not in supplied catalog | covered @ nodes.cloud (story box); out-of-scope for binding: unbound, not in supplied catalog |
| 23 | service | "clip-store" | component:default/clip-store | covered @ nodes.cloud (story box, unbound; D2) |
| 24 | service | "device-shadow" | component:default/device-shadow | covered @ nodes.cloud (story box, unbound; D2) |
| 25 | service | "notify-service" | component:default/notify-service | covered @ nodes.cloud (story box, unbound; D2) |
| 26 | service | "Apple/Google push" | third-party push delivery | covered @ nodes.push (not a catalog service) |
| 27 | service | "Kestrel app (phone)" | component:default/kestrel-app | covered @ nodes.phone.binding; panels.phone |
| 28 | flow | "Evening: the resident goes to bed. Battery is 25%, not charging." | start anchor 25 %, not charging | covered @ panels.batt.initial; step bedtime (amendment A5) |
| 29 | flow | "Before dawn: a heartbeat reports 20% → low-battery push." | 20 % anchor at the 4:00 AM heartbeat (A3) | covered @ step lowbatt charge 20 |
| 30 | flow | "Morning: a courier drops a package. Clip classified `package` → push "Package delivered at front door". Resident opens the clip." | package alert + resident opens clip | covered @ steps a-deliver, a-open |
| 31 | flow | "Live view, two-way audio, subscription tiers." | source excludes | out-of-scope: source excludes |
| 32 | permalink | ingest.heartbeat src/routes/heartbeat.ts 18-44 @232a7fae… | code ref | covered @ nodes.cloud.codeRefs; steps bedtime, lowbatt, charging, b-back |
| 33 | permalink | ingest.event src/routes/events.ts 22-81 @232a7fae… | code ref | covered @ nodes.cloud.codeRefs; steps raccoon, a-deliver, b-back |
| 34 | permalink | shadow.lowbattery src/rules/lowBattery.go 9-37 @e69b820b… | code ref | covered @ nodes.cloud.codeRefs; step lowbatt |
| 35 | permalink | shadow.offline src/rules/offline.go 11-29 @e69b820b… | code ref; never runs (outage < 60 min) | covered @ nodes.cloud.codeRefs only |
| 36 | permalink | notify.push lib/push/send.py 40-88 @2fb55bed… | code ref | covered @ nodes.cloud.codeRefs; steps lowbatt, a-deliver, b-back |
| 37 | permalink | clips.upload src/upload.rs 15-62 @fc642217… | code ref | covered @ nodes.cloud.codeRefs; steps raccoon, a-deliver, b-back |
| 38 | permalink | app.devicepage app/screens/DevicePage.tsx 12-140 @35715c5b… | code ref | covered @ nodes.phone.codeRefs; step a-open |
| 39 | permalink | catalogUrl component/kestrel-app | Backstage link | covered @ nodes.phone.binding |
| 40 | permalink | catalogUrl ×4 (event-ingest, clip-store, device-shadow, notify-service) | Backstage links for services inside the story box | out-of-scope: story-level "Kestrel cloud" box covers several services and is not bound (skill rule); listed in section H for an engineering view |
| 41 | number | operator: "Starts Thursday evening around 10:30 PM … raccoon around 1 AM … low-battery alert … around 4 AM, sunrise around 6:50 AM, courier a little after 8 AM" | step times 10:30 PM, 1:05 AM, 4:00 AM, 6:50 AM, 8:10 AM (minutes chosen per "Pick sensible minutes") | covered @ diagram.storyTime and steps[].time (A3) |
| 42 | number | illustrative | 7:00 AM charging report, 8:11 AM open, 8:12 retry, 8:20 reconnect; heartbeat phase :00/:30; date Thu, Oct 1 → Fri, Oct 2, 2026 | covered @ steps; section text says times are illustrative/approximate |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | technical level? | Story. PM, not an engineer; customer view: porch, camera, phone, what happened and when; no service names or APIs on screen | 09-28-2026 | whole page: plain node names ("Kestrel cloud"), plain connection legend, no service/API/code text in captions | active |
| A2 | audience and takeaway? | Support leads and product managers; explain to a customer why a low-battery alert came in the night and why the package alert came late when Wi-Fi was down | 09-28-2026 | worksheet A; section text; captions of lowbatt and b-back | active |
| A3 | time span? | Thu evening ~10:30 PM; raccoon ~1 AM; low-battery alert ~4 AM; sunrise ~6:50 AM; courier a little after 8 AM; pick sensible minutes | 09-28-2026 | diagram.storyTime; steps[].time | active |
| A4 | endings? | the normal morning, and the morning where home Wi-Fi is down when the courier comes | 09-28-2026 | diagram.paths normal, wifidown | active |
| A5 | starting situation? | battery 25 %, not charging, everything online, no alerts on the phone | 09-28-2026 | panels.batt.initial; panels.phone.initial; panels.home.initial | active |
| A6 | anything technical? | "I don't know. Use whatever you were given and decide sensibly." | 09-28-2026 | Decisions I made D1–D10 | active |
| A7 | must-see moments, phone, happy ending (my Q5–Q7) | not answered explicitly; the answer sheet describes the same beats and "the phone"; the design itself says the resident opens the clip | 09-28-2026 | defaults used: five moments; phone panel; normal path ends at the open clip (source-described) | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | Panels: `home` (porch map, physical), `phone` (resident's phone, reported), `batt` (camera battery, physical). No camera `screen`: its scene is fixed for the whole diagram and no stock scene fits both the night raccoon and the morning delivery | panel guide: a screen has one fixed scene | blocks[0].diagram.panels |
| D2 | One plain "Kestrel cloud" box stands for event-ingest, motion-classifier, clip-store, device-shadow and notify-service; left unbound (covers several services); all six cloud-side code refs attached to it | A1; skill: a story box covering several services is not bound | nodes.cloud |
| D3 | Phone node bound to component:default/kestrel-app (no API: catalog lists none) with app.devicepage code | catalog; code-evidence | nodes.phone |
| D4 | **Times vs rate tension.** At about 1 %/h idle plus 1 % for the raccoon clip, 25 % at 10:30 PM reaches 20 % at the 2:30 AM heartbeat, not ~4 AM. Both the operator's 4 AM alert and the design's "reports 20%" are anchors, so per the skill's rule the rate does not apply between them: the battery is held at 25 % (charge patch at raccoon, no separate clip drain) and jumps to 20 % at 4:00 AM; drift at 1 %/h applies from 4:00 AM. The page says the given times and the rough rate disagree | skill rule 5; honesty rules (anchors win, no invented effective rate) | panels.batt; steps raccoon, lowbatt; section text |
| D5 | Wi-Fi outage (8:10–8:20) is shorter than the 60-minute offline rule, so nothing marks the camera offline; the offline code ref sits on the cloud node only | HLD behavior 6 | nodes.cloud.codeRefs; step b-back |
| D6 | Heartbeat schedule shown on :00/:30 (10:30 PM, 11:00 … 4:00 AM … 8:00 AM); only the 10:30 PM, 4:00 AM and 7:00 AM ones are drawn on the shared night | illustrative phase; the design states only "every 30 minutes" | steps bedtime, lowbatt, charging |
| D7 | The phone stays on its home screen overnight (resident asleep); device-page cards change only when the resident opens the app at 8:11 AM (phone ↔ cloud), showing the 8:00 AM report (battery 21 %, solar charging, online) | reported panel changes only on a delivered read; HLD "The app reads this" | panels.phone; step a-open |
| D8 | App battery card keeps the `battery-low` icon at 8:11 AM (21 % is still below the 30 % re-arm level); charging shows on the Power card with the `solar` icon ("The app shows the solar charging icon") | skill rule 7 precedence; HLD behaviors 3–4 | step a-open |
| D9 | Opening the clip draws phone → cloud ("open clip") and cloud → phone ("clip") as a read and its reply; the phone's network route is not given in the design, so these connections are labeled "app connection" and not routed through the home router | the design says the resident opens the clip; catalog lists a clip read; transport unspecified | edges phone->cloud, cloud->phone |
| D10 | Wi-Fi-down path ends at the late alert (8:20 AM); the design does not say the resident opens that clip | honesty: end where the source ends | paths.wifidown |
| D11 | The design says Wi-Fi is down "at the delivery", not when it went down; the page shows it down at 8:10 AM and says nothing about when it started | no outage start in source | step b-deliver |
| D12 | Solar charge rate 3.5 %/h (midpoint of "about 3–4%"), treated as net gain while charging | HLD behavior 5 | panels.batt.chargePerHour |

Engineering gaps (for an engineer to review; not shown to the story-level reader):
- motion-classifier: no catalog entry, no code reference.
- No reviewed code for the camera's SD-card queue and 2-minute retry (device firmware); steps b-deliver/b-retry carry no code.
- No code for the app's clip playback (clip-store `getClip` exists in the catalog but no code location was supplied); step a-open carries only app.devicepage.
- The design does not say how the resident's phone reaches the cloud (D9) or when the Wi-Fi outage began (D11).

## Storyboard worksheet

### A. Story

**Level:** Story (A1). No service names, protocols, API names or code in visible text.
**Audience:** support leads and product managers; they know the product, not the backend.
**Takeaway:** the low-battery alert in the night came from the camera's regular battery report crossing 20 %, and a package alert arrives late when home Wi-Fi is down because the camera keeps the clip until Wi-Fi returns.
**Story (60-second narration):** Thursday, 10:30 PM. The resident goes to bed; the Porch Cam runs on battery at 25 %, not charging, and checks in with the Kestrel cloud every 30 minutes. At 1:05 AM a raccoon crosses the porch. The camera wakes, records a 20-second clip and uploads it; the cloud recognizes an animal and saves it to the timeline without an alert, so the phone stays quiet. At 4:00 AM the regular battery report says 20 %. That is the low-battery line, so the cloud sends one "Porch Cam battery low" alert; the phone buzzes before dawn. At 6:50 AM the sun comes up and the solar panel starts charging; the cloud learns it at the 7:00 AM report. At 8:10 AM a courier drops a package. In the normal morning the clip uploads, the cloud recognizes a package and the phone shows "Package delivered at front door" right away; at 8:11 the resident taps it and opens the clip, and the camera page shows 21 %, charging on solar, still flagged low. In the other morning the home Wi-Fi is down at 8:10: the camera saves the clip to its memory card and retries every 2 minutes; at 8:20 Wi-Fi is back, the clip uploads, and the same package alert arrives ten minutes after the delivery.

**What would I show?**
1. Most important moments: the 4:00 AM alert on the phone next to the battery panel at 20 %, and on the Wi-Fi-down path the 8:20 alert next to a map where the package has been on the porch since 8:10. The phone and home panels carry them.
2. Expected but not yet shown: why the raccoon did not alert (added: caption + no alert edge); the camera actually recording during the outage (added: camera `rec`, blocked Wi-Fi link, retry step).
3. Must not believe: that the camera went offline or lost the clip during the outage (it did not: 10 min < 60 min rule; clip kept on SD card); that the alert repeats (one alert until above 30 %); that charging clears the low-battery flag (still below 30 %).

### B. Panel plan

| Panel id | Type | Physical or reported | Question it answers | Best moment | Starting state | Must never show |
|---|---|---|---|---|---|---|
| home | homemap | physical | What is happening at the porch and to the home Wi-Fi? | raccoon; b-deliver (Wi-Fi down, camera recording) | camera asleep (waits for motion), door closed, router idle, resident in bedroom, no animals/people/packages (A5) | an alert or signal going to the camera; the router down on the normal path |
| phone | deviceapp | reported | What did the resident get, and when? What does the camera page say? | lowbatt (night alert); b-back (late alert); a-open (camera page) | home screen, no alerts (A5); cards from the last read: 25 %, Battery (not charging), Online | an alert for the raccoon; card changes without the app reading the cloud |
| batt | battery | physical | How much charge does the camera have, and when does it start charging? | lowbatt (20 %, LOW); sunrise (charging) | 25 %, cells, draining (A5); drain 1 %/h, charge 3.5 %/h (source) | a value between the 25 % and 20 % anchors that the design and times cannot both support (D4) |

Rejected: `screen` (D1); a separate `phone` panel (the device-app panel already shows alerts); a `state` or `log` panel (backend detail, A1).

Customer-visible items from the source: "Porch Cam battery low" push → phone `notify` at lowbatt; "Package delivered at front door" push → phone `notify` at a-deliver / b-back; device page "Battery NN% · updated <time>" → phone `battery` card with `reportedAt`; solar charging icon → phone `power` card icon `solar`; online/offline → phone `online` card; last event → phone `lastEvent` card.

### C. Paths

| Path id | Label | Shared prefix | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| normal | Normal morning | bedtime, raccoon, lowbatt, sunrise, charging | a-deliver | resident opens the package clip at 8:11 AM | none material |
| wifidown | Wi-Fi down at the delivery | bedtime, raccoon, lowbatt, sunrise, charging | b-deliver | package alert arrives at 8:20 AM | when the outage began (D11) |

### D. Time table

**Story time:** start `2026-10-01T22:30`; end `2026-10-02T08:30`; clock `12h`; date `short` (A3; operator times are approximate, minutes chosen).
**Battery rates:** `batt` drain 1 %/h (source), charge 3.5 %/h (source range 3–4); clip 1 % (source). Held between the 25 % and 20 % anchors (D4).

Anchors: 25 % at 10:30 PM (A5, source); 20 % reported at the ~4 AM heartbeat (A3, source). Operator times: 10:30 PM, ~1 AM, ~4 AM, ~6:50 AM, a little after 8 AM.

Report schedule (D6, illus phase): heartbeats 10:30 PM, 11:00 … 3:30, 4:00 AM, 4:30 … 6:30, 7:00 AM, 7:30, 8:00 AM, 8:30. Drawn: 10:30 PM, 4:00 AM, 7:00 AM (shared); reconnect heartbeat 8:20 AM (wifidown). The app reads only at 8:11 AM (normal): it shows the 8:00 AM report.

| Path | Step | `time` | Story time shown | Anchor, source or illus | Battery | Last report the app shows, freshness | Day or night |
|---|---|---|---|---|---|---|---|
| both | bedtime | `2026-10-01T22:30` | 10:30 PM, Thu, Oct 1 | anchor (A3, A5) | 25, draining | cards not visible (home screen); last read 25 % | night |
| both | raccoon | `01:05` | 1:05 AM, Fri, Oct 2 | operator ~1 AM | `charge: 25` hold (D4) | holds (app closed) | night |
| both | lowbatt | `2026-10-02T04:00` | 4:00 AM | anchor (A3 + source 20 %) | `charge: 20` anchor | holds (alert only; app closed) | night |
| both | sunrise | `06:50` | 6:50 AM | operator | trend charging, source solar; walk: ≈17.2 | holds | dawn |
| both | charging | `07:00` | 7:00 AM | illus (next heartbeat) | charging; walk ≈17.8 | holds | day |
| normal | a-deliver | `08:10` | 8:10 AM | operator "a little after 8" | `drain: 1`; walk ≈20.8 | holds | day |
| normal | a-open | `08:11` | 8:11 AM | illus | charging | read at 8:11: 8:00 AM report (21 %, charging, online) → "Updated 11 min ago" | day |
| wifidown | b-deliver | `08:10` | 8:10 AM | operator | `drain: 1` | holds | day |
| wifidown | b-retry | `08:12` | 8:12 AM | source 2-min retry | charging | holds | day |
| wifidown | b-back | `08:20` | 8:20 AM | source "about 10 minutes later" | charging | holds (app not opened) | day |

### E. Step x panel matrix

```
### bedtime   paths: normal, wifidown   time: 10:30 PM Thu (`2026-10-01T22:30`)
Beat: The resident goes to bed; the camera, on battery at 25 %, sends its regular battery report.
Hops claimed: camera -> home router -> Kestrel cloud (battery report)
Edges: cam->router, router->cloud
Missing hops check: none (no reply in source)
Report?: report at 10:30 PM delivered to the cloud; the app is closed, cards unchanged
Focus: batt
home: patch: signal cam->router; router rx
phone: holds: home screen, no alerts (A5)
batt: holds: initial 25 %, draining
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.heartbeat (cloud)
Evidence: rows 1, 12, 28; A5

### raccoon   paths: both   time: 1:05 AM (`01:05`)
Beat: A raccoon crosses the porch; the camera wakes, records a 20-second clip and uploads it; the cloud sees an animal and saves it with no alert.
Hops claimed: camera -> router -> cloud (clip)
Edges: cam->router, router->cloud
Missing hops check: none; deliberately no cloud->push (no alert for animals)
Report?: no battery report shown
Focus: home
home: patch: raccoon on porch; cam rec; router rx; signal cam->router
phone: holds: no alert for an animal (source default setting)
batt: patch: charge 25 (hold, D4)
State cleared: camera sleep -> rec
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload (cloud)
Evidence: rows 3, 4, 13; D4

### lowbatt   paths: both   time: 4:00 AM (`2026-10-02T04:00`)
Beat: The 4:00 AM report says 20 %; the cloud flags low battery and sends one alert; the phone buzzes before dawn.
Hops claimed: camera -> router -> cloud (report); cloud -> phone alert delivery -> phone (alert)
Edges: cam->router, router->cloud, cloud->push, push->phone
Missing hops check: none
Report?: report at 4:00 AM delivered to cloud; phone gets a notification, cards unchanged (app closed)
Focus: phone
home: patch: raccoon hidden; cam sleep; router rx; signal cam->router
phone: patch: notify Kestrel "Porch Cam battery low"
batt: patch: charge 20 (anchor)
State cleared: camera rec -> sleep; raccoon gone
Icons: none on cards (app not opened); batt panel icon computed (battery-low zone)
Tones: none
Code/binding: ingest.heartbeat, shadow.lowbattery, notify.push (cloud)
Evidence: rows 5, 6, 29; A3

### sunrise   paths: both   time: 6:50 AM (`06:50`)
Beat: The sun comes up; the solar panel starts charging the camera. Nothing is reported yet.
Hops claimed: none
Edges: none
Missing hops check: none
Report?: no report
Focus: batt
home: holds: nothing moves on the porch
phone: holds: the cloud has not heard about charging
batt: patch: trend charging, source solar
State cleared: batt draining -> charging
Icons: batt computed battery-charging
Tones: none
Code/binding: none
Evidence: rows 8, 11; A3

### charging   paths: both   time: 7:00 AM (`07:00`)
Beat: The next regular report tells the cloud the camera is charging.
Hops claimed: camera -> router -> cloud (report: charging yes)
Edges: cam->router, router->cloud
Missing hops check: none
Report?: report at 7:00 AM delivered to cloud; app closed
Focus: home
home: patch: router rx; signal cam->router
phone: holds: app closed; the low-battery alert is still on the lock screen
batt: holds: charging drift only
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.heartbeat (cloud)
Evidence: row 8

### a-deliver   paths: normal   time: 8:10 AM (`08:10`)
Beat: A courier drops a package; the camera records and uploads; the cloud recognizes a package and the alert arrives right away.
Hops claimed: camera -> router -> cloud (clip); cloud -> alert delivery -> phone
Edges: cam->router, router->cloud, cloud->push, push->phone
Missing hops check: none
Report?: no battery report
Focus: phone
home: patch: courier + package on porch; cam rec; router rx; signal cam->router
phone: patch: notify "Package delivered at front door"
batt: patch: drain 1 (clip)
State cleared: camera sleep -> rec
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload, notify.push (cloud)
Evidence: rows 3, 10, 30

### a-open   paths: normal   time: 8:11 AM (`08:11`)
Beat: The resident taps the alert and opens the clip; the camera page shows 21 %, solar charging, still low.
Hops claimed: phone -> cloud (open clip, camera page); cloud -> phone (clip, camera page)
Edges: phone->cloud, cloud->phone
Missing hops check: added the reply (a read returns the clip; D9)
Report?: read at 8:11 delivers the 8:00 AM report: battery 21, power Solar charging, online Online; last event Package 8:10 AM
Focus: phone
home: patch: courier gone; cam sleep (package stays)
phone: patch: phoneScreen app; battery {21, ready, reportedAt 08:00, icon battery-low}; power {Solar charging, ready, reportedAt 08:00, icon solar}; online {Online, ready, reportedAt 08:00}; lastEvent {Package delivered, ready, detail "8:10 AM · clip opened"}
batt: holds: charging drift only
State cleared: phone home -> app; power Battery -> Solar charging; alerts remain in the list (not stated otherwise)
Icons: phone.battery battery-low; phone.power solar
Tones: none
Code/binding: app.devicepage (phone)
Evidence: rows 8, 27, 30; D7, D8, D9

### b-deliver   paths: wifidown   time: 8:10 AM (`08:10`)
Beat: Home Wi-Fi is down. The courier drops the package; the camera records the clip to its memory card but cannot reach the router.
Hops claimed: camera -> router (blocked)
Edges: cam->router (failure: blocked)
Missing hops check: none
Report?: none
Focus: home
home: patch: courier + package on porch; cam rec; router alert, icon wifi-off
phone: holds: nothing arrives
batt: patch: drain 1 (clip)
State cleared: router idle -> down; camera sleep -> rec
Icons: home.router wifi-off
Tones: router warn
Code/binding: none located (camera firmware)
Evidence: rows 14, 16; D11

### b-retry   paths: wifidown   time: 8:12 AM (`08:12`)
Beat: Two minutes later the camera tries again; Wi-Fi is still down; the clip stays on the card.
Hops claimed: camera -> router (blocked)
Edges: cam->router (blocked)
Missing hops check: none
Report?: none
Focus: home
home: patch: courier gone; cam sleep (package stays; router still down)
phone: holds: still nothing
batt: holds: charging drift only
State cleared: camera rec -> sleep (clip finished, kept on card)
Icons: router wifi-off persists
Tones: router warn persists
Code/binding: none located
Evidence: rows 14, 15

### b-back   paths: wifidown   time: 8:20 AM (`08:20`)
Beat: Wi-Fi is back; on its next try the camera uploads the saved clip and a battery report; the package alert arrives ten minutes after the delivery.
Hops claimed: camera -> router -> cloud (clip + report); cloud -> alert delivery -> phone
Edges: cam->router, router->cloud, cloud->push, push->phone
Missing hops check: none
Report?: reconnect report at 8:20 delivered to cloud; app closed, cards unchanged
Focus: phone
home: patch: router rx, icon null; signal cam->router
phone: patch: notify "Package delivered at front door"
batt: holds: charging drift only
State cleared: router down -> up (icon restored, tone base); camera never marked offline (D5)
Icons: home.router icon null (restore router)
Tones: router base
Code/binding: clips.upload, ingest.event, ingest.heartbeat, notify.push (cloud)
Evidence: rows 15, 16, 17, 18; D5
```

### F. Coverage grid

| Path: normal | bedtime | raccoon | lowbatt | sunrise | charging | a-deliver | a-open |
|---|---|---|---|---|---|---|---|
| home | P | P | P | H | P | P | P |
| phone | H | H | P | H | H | P | P |
| batt | H | P | P | P | H | P | H |

| Path: wifidown | bedtime | raccoon | lowbatt | sunrise | charging | b-deliver | b-retry | b-back |
|---|---|---|---|---|---|---|---|---|
| home | P | P | P | H | P | P | P | P |
| phone | H | H | P | H | H | H | H | P |
| batt | H | P | P | P | H | P | H | H |

Boring panel check: every panel changes at its own best moment; `phone` holding at raccoon is the point (no alert) and is named in the caption. Kept all three.
Busy step check: lowbatt, a-deliver patch every panel; captions name the phone as the focus.

### G. Icon state plan

| Panel.element | Default icon | State | Set at (icon) | Clears at | Restore |
|---|---|---|---|---|---|
| home.router | router | Wi-Fi down | b-deliver (`wifi-off`) | b-back (Wi-Fi returns) | `icon: null` |
| phone.battery | battery | low battery flagged by the cloud (≤20 %, re-arms above 30 %) | a-open (`battery-low`), the first time the app shows the page after the flag | not restored on path normal: stays below 30 % to the end | none |
| phone.power | none | solar charging | a-open (`solar`) | not restored: still charging at the end | none |
| batt (panel) | computed | low / charging | computed by the renderer from zone and trend | — | — |

Precedence: charging starts while still below the 30 % re-arm level, so the battery card keeps `battery-low`; charging shows on the Power card and in the Battery panel trend.

### H. Bindings and code

| Node | Catalog entityRef | API | codeRefs | Steps where the code runs | Gap |
|---|---|---|---|---|---|
| cam | — | — | — | — | device, not a catalog service; firmware retry/SD code not located |
| router | — | — | — | — | not a catalog service (home equipment) |
| cloud | (story box) covers component:default/event-ingest, component:default/clip-store, component:default/device-shadow, component:default/notify-service, and motion-classifier | — | ingest.heartbeat, ingest.event, shadow.lowbattery, shadow.offline, notify.push, clips.upload | heartbeat: bedtime, lowbatt, charging, b-back; event: raccoon, a-deliver, b-back; lowbattery: lowbatt; offline: none (never runs, D5); push: lowbatt, a-deliver, b-back; upload: raccoon, a-deliver, b-back | unbound (story box covering several services); motion-classifier not in supplied catalog |
| push | — | — | — | — | third party (Apple/Google push), not a catalog service |
| phone | component:default/kestrel-app | none listed in catalog | app.devicepage | a-open | clip playback code not supplied |

### I. Checkable expectations

1. The 4:00 AM step (`lowbatt`) shows the battery at 20 % on both paths (anchor), and the clock reads 4:00 AM on Fri, Oct 2.
2. The raccoon step lights no alert edge and adds no notification.
3. On path wifidown, the package alert appears only at 8:20 AM; `b-deliver` and `b-retry` block the camera→router link and add no notification.
4. On path normal, the camera-page battery card at 8:11 AM shows 21 % (the 8:00 AM report) with `battery-low`, and the Power card shows Solar charging.
5. The router is down only on path wifidown between 8:10 and 8:20 AM; the camera is never shown offline.

## Self-audit

Delivery: proposal f9f6951916724a81aaa187dbc3209ae0 from base revision 0d98f758-eed3-440f-bc3b-8613d10def0a-1 → result **applied**, revision 0d98f758-eed3-440f-bc3b-8613d10def0a-2. The accepted editor source (story.spec.json) validates with 0 errors, 0 warnings.

Tools run (session wrapper):
- `stamp` → stamped.spec.json; `validate stamped.spec.json` → 0 errors, 0 warnings; `validate story.spec.json` → 0 errors, 0 warnings.
- `walk stamped.spec.json --catalog input/catalog.json --state --rate batt=-1:3.5` with expects `*/bedtime:batt.charge=25`, `*/lowbatt:batt.charge=20`, `normal/a-open:phone.battery.value=21`, `normal/a-open:phone.date=Fri, Oct 2`, `wifidown/b-retry:home.router.icon=wifi-off` → all EXPECT ok; **0 warnings, 0 checks**.
- First walk had 1 CHECK (lowbatt: app battery card 25 vs panel 20 with no report time). Fixed in the spec: the card's initial state now carries `reportedAt` 10:30 PM, so it reads as the app's last-known value with its age. The phone is on its home screen overnight, so the card is not on view until 8:11 AM.
- NOTE `shadow.offline` on node but on no step: correct. The 10-minute outage is below the 60-minute rule (D5, section H).
- NOTE catalog services event-ingest, clip-store, device-shadow, notify-service bound to no node: intended. The story-level "Kestrel cloud" box covers them (D2, row 40).

Walk vs worksheet D–H:
- Battery: 25 (10:30 PM) → held 25 (1:05 AM) → 20 anchor (4:00 AM, shown as "-1.71/h (anchor)") → 17.17 (6:50 AM, −1 %/h) → 17.75 (7:00 AM, +3.5 %/h) → 20.83 at 8:10 AM (+3.5 %/h, −1 clip) → 20.89 (8:11 AM); on wifidown 20.95 (8:12 AM), 21.42 (8:20 AM). These match section D. The 8:00 AM report value (17.75 + 3.5 = 21.25 → 21 %) matches the 8:11 AM card.
- Clock: 10:30 PM Thu, Oct 1 → 1:05 AM Fri, Oct 2 → … → 8:11 AM (normal) / 8:20 AM (wifidown). The date changes after midnight; no time goes backward.
- Notifications: 0 at bedtime and raccoon; 1 at lowbatt; 2 at a-deliver (normal) and at b-back (wifidown); still 1 at b-deliver and b-retry. This matches expectations 2 and 3.
- Icons: router `wifi-off` at b-deliver/b-retry and restored at b-back; app battery `battery-low`, power `solar` and last event `package` at a-open. This matches section G.
- Code on steps matches section H: heartbeat on bedtime, lowbatt, charging and b-back; event and upload on raccoon, a-deliver and b-back; low-battery rule on lowbatt; push on lowbatt, a-deliver and b-back; device page on a-open.
- State cleared (rule 8): camera rec → sleep at lowbatt, a-open and b-retry; raccoon hidden at lowbatt; courier hidden at a-open and b-retry; router state and icon restored and tone cleared (`base`) at b-back. The package stays on the porch, since the source never says it is taken in.

Reverse audit: each edge kind is declared in page.protocols in plain words (home Wi-Fi, internet, phone alert, app connection), and each one traces to rows 1/3/5 or to D9. The only tone is router `warn` at b-deliver ("home Wi-Fi is down"), cleared at b-back ("Wi-Fi returns"). Notification texts are the source's exact push texts ("Porch Cam battery low", "Package delivered at front door"). Illustrative values (minutes, heartbeat phase, 7:00/8:11/8:12/8:20 AM, 3.5 %/h as the midpoint) are labeled in the section text and rows 41–42. No service names, API names, protocols or file paths appear in reader-visible text; code refs and the kestrel-app binding sit behind nodes.

Not done: **visual/browser checks were not performed** (no browser tools in this session). Still unchecked: the home map's geometry (door hinge and swing, where the camera cone and subjects sit), whether edge labels fit, the phone panel layout, and how the two paths play back visually.

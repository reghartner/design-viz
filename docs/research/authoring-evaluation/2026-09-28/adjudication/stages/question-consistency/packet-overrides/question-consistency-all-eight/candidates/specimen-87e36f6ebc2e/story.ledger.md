# Coverage ledger — kestrel-overnight ("Kestrel Porch Cam: one night on battery")
source: input/hld.md "HLD: Kestrel Porch Cam — overnight on battery" (local file, Status: reviewed design) + input/catalog.json (approved fictional Backstage snapshot, version 1) + input/code-evidence.md (approved reviewed code locations) | version: n/a (local, unversioned) | updated: 09-28-2026

Turn history:
- Request `56dec7c5-bf89-4471-bd5c-3c5f63a3fac8`: questions turn; 7-question batch sent via editor reply; no proposal.
- Request `9d974976-5ca6-4ea6-8a2d-4f7124042928`: operator answer sheet received (business reader). Base editor revision read before planning: `761986ea-82f4-4c88-9039-84a5d7a528bc-1` (blank "New story"). Full candidate proposed (new complete story).

Provenance: local files only, no publishable URL → `page.generatedFrom` omitted; the section text names the source in plain words ("the reviewed Kestrel Porch Cam overnight design"), no file paths (story level).

## Coverage ledger

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Every 30 minutes the camera sends a heartbeat to event-ingest" | check-in: camera → Home Wi-Fi → Kestrel cloud; app page shows battery + "updated" | covered @ steps bedtime, lowbatt, solar, wifi-back (edges cam->router, router->cloud); unshown scheduled check-ins as illus `reportedAt` at raccoon, sunrise, courier, wifi-down |
| 2 | contract | "battery %, charging yes/no, firmware" | check-in contents | covered @ phone cards battery + power (battery %, charging); firmware out-of-scope: no value given and not customer-relevant at story level |
| 3 | flow | "On PIR motion the camera wakes, records a clip (about 20 s), and uploads it" | motion → clip → upload → label → alert for person/package | covered @ steps raccoon, courier, wifi-back |
| 4 | flow | "`animal` events are saved to the timeline with no push (default user setting)" | raccoon saved, no alert | covered @ step raccoon (no alert edges; phone.event card) |
| 5 | flow | "device-shadow marks the camera `low_battery` and notify-service sends one" | low-battery alert "Porch Cam battery low" | covered @ step lowbatt |
| 6 | flow | "the camera reports charging=yes on its next heartbeat. The app shows the solar charging icon." | charging reported at next check-in after sunrise | covered @ step solar (phone.power icon solar) |
| 7 | flow | "Resident opens the clip." | resident opens the package clip | covered @ step open (happy path end) |
| 8 | failure | "If the camera cannot reach the router it keeps recording to its local SD card and retries every 2 minutes." | Wi-Fi down: cam->router blocked; clip kept on SD card | covered @ steps wifi-down, retry (failures cam->router blocked) |
| 9 | flow | "On reconnect it uploads queued clips and sends a heartbeat." | late upload + check-in | covered @ step wifi-back |
| 10 | failure | "device-shadow marks the camera offline when two heartbeats in a row are missed (60 minutes)" | offline rule not reached in a ~10 min outage; app keeps last state with older "updated" time | covered @ step retry caption + phone.status holds "Online"; shadow.offline code on node only |
| 11 | flow | "Wi-Fi returns about 10 minutes later; the clip uploads, then the package push is sent (late)." | late package alert; path ends there | covered @ step wifi-back (path wifi ends) |
| 12 | service | "Porch Cam (device)" | camera | covered @ nodes.cam; porch.cam |
| 13 | service | "Home router … Not a Kestrel service." | relay on every camera→cloud hop | covered @ nodes.router (unbound: not a catalog service); porch.router |
| 14 | service | "event-ingest" | component:default/event-ingest | covered @ nodes.cloud (story box; unbound because it covers several services, D3); codeRefs ingest.heartbeat, ingest.event |
| 15 | service | "motion-classifier … Owned by the ML team." | not in supplied catalog | covered @ nodes.cloud (part of story box); unbound: not in supplied catalog (G1) |
| 16 | service | "clip-store" | component:default/clip-store | covered @ nodes.cloud (story box, D3); codeRef clips.upload |
| 17 | service | "device-shadow" | component:default/device-shadow | covered @ nodes.cloud (story box, D3); codeRefs shadow.lowbattery, shadow.offline |
| 18 | service | "notify-service … through Apple/Google push" | component:default/notify-service | covered @ nodes.alerts.binding (bound); codeRef notify.push; Apple/Google push @ nodes.push (unbound: not a catalog service) |
| 19 | service | "Kestrel app (phone)" | component:default/kestrel-app | covered @ nodes.app.binding; codeRef app.devicepage; panel phone |
| 20 | number | "Every 30 minutes" | check-in every 30 min, on :00/:30 from 10:30 PM (illus alignment) | covered @ section D report schedule; step times |
| 21 | number | "about 20 s" | clip length | covered @ captions raccoon, courier, wifi-down |
| 22 | number | "at or below 20%" | low threshold | covered @ panels batt.low=20; step lowbatt |
| 23 | number | "until battery goes above 30%" | re-arm > 30% | covered @ caption solar; battery-low icon kept to the end (never above 30%) |
| 24 | number | "Idle drain is about 1% per hour" | drain 1 %/h | covered @ panels batt.drainPerHour=1 (applies after the 4:00 AM anchor; see D5) |
| 25 | number | "Each recorded clip uses about 1%" | clip cost 1% | covered @ batt drain:1 at courier, wifi-down; not applied at raccoon (held between anchors, D5) |
| 26 | number | "Solar in morning light adds about 3–4% per hour" | charge rate | covered @ panels batt.chargePerHour=3 (low end of stated range, D6) |
| 27 | number | "retries every 2 minutes" | retry interval | covered @ step retry (8:07 AM, 2 min after 8:05) |
| 28 | number | "two heartbeats in a row are missed (60 minutes)" | offline threshold | covered @ step retry caption (not reached) |
| 29 | number | "Battery is 25%, not charging." | start anchor 25% | covered @ batt.initial.charge=25; step bedtime |
| 30 | number | "Wi-Fi returns about 10 minutes later" | outage ~10 min | covered @ step wifi-back 8:15 AM (outage from before 8:05; see D8) |
| 31 | number | amendment A3 | story times: Thu 10:30 PM, raccoon ~1 AM, low battery ~4 AM, sunrise ~6:50 AM, courier a little after 8 AM | covered @ storyTime; steps bedtime 22:30, raccoon 01:05, lowbatt 04:00, sunrise 06:50, courier/wifi-down 08:05; minutes illus |
| 32 | contract | "Package delivered at front door" | package alert text | covered @ phone.notify at courier, wifi-back |
| 33 | contract | "Porch Cam battery low" | low-battery alert text | covered @ phone.notify at lowbatt |
| 34 | contract | "Battery NN% · updated <time>" | device page freshness | covered @ phone.battery reportedAt (renders "Updated N min/h ago") |
| 35 | permalink | catalog `catalogUrl` for notify-service, kestrel-app | Backstage links | covered @ nodes.alerts.binding, nodes.app.binding |
| 36 | permalink | catalog `catalogUrl` for event-ingest, clip-store, device-shadow | Backstage links | out-of-scope: behind a multi-service story box (D3); listed here for an engineering view |
| 37 | permalink | catalog operations postEvent, postHeartbeat, uploadClip, getClip, putState, getState, sendPush | API operations | out-of-scope on the page: no `api` on bound nodes because the call each bound node receives is not stated (G4, G5); listed for an engineering view |
| 38 | permalink | code-evidence ids ingest.heartbeat, ingest.event, shadow.lowbattery, shadow.offline, notify.push, clips.upload, app.devicepage | 7 reviewed code refs, full SHAs | covered @ node codeRefs (cloud ×5, alerts ×1, app ×1) and steps where each runs (section H) |
| 39 | flow | "Live view, two-way audio, subscription tiers." | — | out-of-scope: HLD lists them as out of scope |
| 40 | amendment | amendment A1–A6 | operator answers | covered @ Amendments table |
| 41 | number | (none in source) | date Thu, Oct 1 2026; exact minutes; check-in alignment | covered @ storyTime; illus, stated on page |

## Amendments

| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | Q1 technical level? | Story. "I'm a product manager, not an engineer… I don't need service names or APIs on screen." | 09-28-2026 | whole page: plain node titles/edge labels/legend, no API names or code in captions | active |
| A2 | Q2 audience and takeaway? | Support leads and product managers; explain why a low-battery alert came in the night and why the package alert came late when Wi-Fi was down | 09-28-2026 | worksheet A; section text; captions lowbatt, wifi-back | active |
| A3 | Q3 time span and clock? | Thursday ~10:30 PM; raccoon ~1 AM; low-battery alert before dawn ~4 AM; sunrise ~6:50 AM; courier a little after 8 AM; "pick sensible minutes" | 09-28-2026 | storyTime; steps[].time | active |
| A4 | Q4 endings? | Normal morning, and the morning with home Wi-Fi down when the courier comes | 09-28-2026 | paths normal, wifi | active |
| A5 | Q5 starting situation? | Battery 25%, not charging, everything online, no alerts on the phone | 09-28-2026 | batt.initial; phone.initial | active |
| A6 | Q6/Q7 views; anything technical? | "I don't know. Use whatever you were given and decide sensibly." (no views requested; no engineering view requested) | 09-28-2026 | Decisions D1–D10; default panels | active |

## Decisions I made

| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | One diagram, two paths sharing the night: `normal` and `wifi`; split at the delivery | skill rule 11; HLD "Alternate: at the delivery" | diagram.paths |
| D2 | Panels: porch map (physical), Kestrel app on the phone (reported), camera battery (physical); no camera screen (stock scenes don't fit a night raccoon + morning package), no separate engineering view (not requested, A6) | skill rule 2 | diagram.panels |
| D3 | Story boxes: "Kestrel cloud" covers event-ingest, motion-classifier, clip-store, device-shadow (unbound; services listed here); "Kestrel alerts" = notify-service only (bound); "Kestrel app" = kestrel-app (bound); router, phone push relay, camera unbound (not catalog services) | skill: multi-service story box is not bound | nodes |
| D4 | Date Thu, Oct 1, 2026 (a Thursday); minutes: 10:30 PM, 1:05 AM, 4:00 AM, 6:50 AM, 7:00 AM, 8:05 AM, 8:07 AM, 8:15 AM; check-ins on :00/:30 | A3 "pick sensible minutes"; 4:00 and 7:00 fall on the 30-min cadence from 10:30 | storyTime, steps |
| D5 | **Anchor vs rate tension:** 25% at 10:30 PM and 20% at ~4:00 AM cannot both hold at the design's ~1%/h idle drain + 1% per clip (that rate reaches 20% near 2:30 AM). Anchors kept; the battery is held at 25% (charge patch at raccoon, clip cost not applied) and jumps to 20% at the 4:00 AM check-in. Said on the page. | skill rule 5; operator anchor A3 + HLD "heartbeat reports 20%" | batt charge patches raccoon, lowbatt; section text |
| D6 | Solar charge 3 %/h (low end of the design's "about 3–4%"); drain 1 %/h applies after 4:00 AM; the design does not say whether 3–4% is before or after idle drain | HLD Power use | batt.chargePerHour, drainPerHour |
| D7 | App cards follow Kestrel's record of the camera (latest check-in / event), shown when the app is opened; scheduled check-ins between shown steps are illustrative `reportedAt` values at the latest :00/:30 before each step | skill rule 9; HLD "Between heartbeats the app shows the last reported value" | phone patches |
| D8 | Wi-Fi path: the 8:00 AM check-in got through before Wi-Fi dropped (illus); outage 8:05 → 8:15 AM (~10 min), so the 60-min offline rule never fires and the app still shows Online | HLD alternate + offline rule | steps wifi-down, retry, wifi-back |
| D9 | Low-battery icon on the app battery card stays to the end (battery never exceeds the 30% re-arm); charging shown by the power card (solar icon) and the battery panel trend | skill rule 7 precedence | phone.battery.icon; phone.power |
| D10 | Wi-Fi failure drawn as `blocked` on camera → Home Wi-Fi (the link that failed) | honesty rules | steps wifi-down, retry |
| D11 | Tapping an alert is not claimed to dismiss it; notifications stay on screen | not in source | phone |
| D12 | Raccoon drawn as a labeled subject with the `motion` icon (no animal icon in the library) | icon library | porch.subjects |

## Engineering gaps (for an engineer; not asked of the business operator)

| # | gap | handling |
|---|-----|----------|
| G1 | motion-classifier not in the catalog; no code ref | inside unbound "Kestrel cloud" box |
| G2 | Apple/Google push relay not in the catalog | node `push`, unbound |
| G3 | No firmware/camera code refs | none attached |
| G4 | How event-ingest calls notify-service (API `sendPush` vs queue) is not stated; the HLD says notify-service skips animal events while code evidence says event-ingest forwards only person/package | no `api` on alerts binding; story shows no alert request for the raccoon (both readings agree no alert is sent) |
| G5 | How/when the app reads device-shadow (`getState` direct or via another service; foreground only?) is not stated | no source map on the phone panel; cards labeled as the app's view of Kestrel's record |
| G6 | Whether solar 3–4 %/h is gross or net of idle drain | D6 |
| G7 | Physical drain between 10:30 PM and 4:00 AM contradicts the stated rate with the operator's times | D5 |

## Storyboard worksheet

### A. Story

**Level:** Story (A1). **Audience:** support leads and product managers (A2).
**Takeaway:** A low-battery alert in the night is the camera's scheduled check-in crossing 20%; a late package alert on a Wi-Fi-down morning is the camera holding the clip until Wi-Fi returns — nothing is lost.
**Story (60-second narration):** Thursday, 10:30 PM: the resident goes to bed. The Porch Cam checks in over home Wi-Fi: battery 25%, not charging. At 1:05 AM a raccoon crosses the porch; the camera records a short clip and uploads it. Kestrel labels it an animal and saves it — no alert, by default. At the 4:00 AM check-in the camera reports 20%, and the resident's phone shows "Porch Cam battery low". At 6:50 AM the sun comes up and the solar panel starts charging; at the 7:00 AM check-in the app shows solar charging. Normal morning: at 8:05 AM a courier drops a package; the clip is uploaded, labeled a package, and the phone shows "Package delivered at front door"; at 8:07 the resident opens the clip. Wi-Fi-down morning: at 8:05 the camera records the courier but cannot reach home Wi-Fi, so it keeps the clip on its SD card and tries again every 2 minutes. The app still shows the camera online from its 8:00 check-in. At 8:15 Wi-Fi is back: the clip uploads, and the package alert arrives, 10 minutes late.

**What would I show?**
1. Most important moments: 4:00 AM phone alert (phone panel) and 8:15 AM late alert next to the Wi-Fi-down marker (porch map + phone).
2. Expected and supported: the quiet raccoon (event card "Animal", no alert) — added; the app still showing Online during the outage — added.
3. Must not believe: that the raccoon sent an alert; that the camera went offline in the app; that the clip was lost; that the battery was fully charged in the morning (still ~20–21%, low-battery state persists).

### B. Panel plan

| Panel id | Type | Physical or reported | Question it answers | Best moment | Starting state | Must never show |
|---|---|---|---|---|---|---|
| porch | homemap | physical | What is happening at the house? | raccoon; courier; wifi-down | camera sleeping, Wi-Fi idle, resident in bedroom (A5) | raccoon/courier lingering after they leave; Wi-Fi down on the normal path |
| phone | deviceapp | reported | What does the resident see, and how fresh is it? | lowbatt; wifi-back | home screen, no alerts; battery 25% not charging, online, last event none (A5) | a raccoon alert; "Offline" during the 10-min outage; the package event before the upload on the Wi-Fi path |
| batt | battery | physical | Why did the low alert come, and is solar enough? | lowbatt; solar | 25%, cells, draining (A5) | charge rising before sunrise; values between anchors that contradict D5 |

Rejected: camera `screen` (no fitting stock scene; the porch map shows events); `phone` panel (deviceapp shows notifications).
Customer-visible items: low-battery alert (phone notify); package alert (phone notify); battery % + updated (phone.battery); solar charging icon (phone.power icon `solar`); last seen/online (phone.status); last event (phone.event).

### C. Paths

| Path id | Label | Shared prefix | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| normal | Normal morning | bedtime, raccoon, lowbatt, sunrise, solar | courier | resident opens the package clip (8:07 AM) | none |
| wifi | Wi-Fi down at delivery | bedtime, raccoon, lowbatt, sunrise, solar | wifi-down | late package alert at 8:15 AM | when Wi-Fi dropped (D8); what the resident does next (not in source) |

### D. Time table

**Story time:** start `2026-10-01T22:25`; end `2026-10-02T08:30`; clock `12h`; date `short` (A3; date and minutes illus).
**Battery rates:** batt drain 1 %/h (source), charge 3 %/h (source range 3–4, D6); clip `drain: 1` (source); anchors 25% (A5) and 20% at 4:00 AM (A3 + HLD); hold between (D5).
**Report schedule:** check-ins every 30 min at 10:30 PM, 11:00, … 4:00 AM, … 6:30, 7:00, 7:30, 8:00 AM (both paths); normal path next 8:30 (after end); Wi-Fi path: 8:00 delivered (D8), reconnect check-in 8:15.

| Path | Step | `time` | Shown | Anchor/source/illus | Battery | Last report on the app | Day/night |
|---|---|---|---|---|---|---|---|
| both | bedtime | `2026-10-01T22:30` | Thu 10:30 PM | A3 anchor; 25% anchor | 25 (charge anchor) | 10:30 PM check-in shown: 25%, battery, online | night |
| both | raccoon | `01:05` | Fri 1:05 AM | A3 ~1 AM, minutes illus | 25 held (D5) | 1:00 AM check-in, not shown, illus: 25%; event Animal 1:05 AM | night |
| both | lowbatt | `04:00` | 4:00 AM | A3 anchor; 20% anchor (HLD) | 20 (charge anchor) | 4:00 AM check-in shown: 20% | night |
| both | sunrise | `06:50` | 6:50 AM | A3 anchor | drift 1 %/h → trend charging, source solar | 6:30 AM check-in, not shown, illus: walk value | dawn |
| both | solar | `07:00` | 7:00 AM | next check-in (source rule) | charging 3 %/h | 7:00 AM check-in shown: charging = yes | morning |
| normal | courier | `08:05` | 8:05 AM | A3 "a little after 8", illus | clip drain 1 | 8:00 AM check-in, not shown, illus; event Package 8:05 | morning |
| normal | open | `08:07` | 8:07 AM | illus | drift | holds | morning |
| wifi | wifi-down | `08:05` | 8:05 AM | A3, illus | clip drain 1 | 8:00 AM check-in, not shown, illus (D8); event card still Animal | morning |
| wifi | retry | `08:07` | 8:07 AM | source 2-min retry | drift | holds (Online, 8:00 AM) | morning |
| wifi | wifi-back | `08:15` | 8:15 AM | source ~10 min | drift | 8:15 AM check-in shown; event Package 8:05 AM | morning |

### E. Step x panel matrix

```
### bedtime   paths: normal, wifi   time: Thu 10:30 PM
Beat: The resident goes to bed; the camera's check-in reports 25%, not charging.
Hops claimed: camera -> Home Wi-Fi -> Kestrel cloud (check-in)
Edges: cam->router, router->cloud
Missing hops check: none (no reply in source)
Report?: report at 10:30 PM delivered: battery, power, status
Focus: phone
porch: patch: signal cam->router
phone: patch: battery 25 ready reportedAt now; power "Battery · not charging"; status Online reportedAt now
batt: patch: charge 25 (anchor)
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.heartbeat (cloud)
Evidence: 1, 29, A3, A5

### raccoon   paths: normal, wifi   time: 1:05 AM
Beat: A raccoon crosses the porch; the camera records ~20 s and uploads it; Kestrel labels it an animal and saves it — no alert.
Hops claimed: camera -> Home Wi-Fi -> Kestrel cloud (clip)
Edges: cam->router, router->cloud
Missing hops check: no alert hops (source: no push for animal)
Report?: unshown scheduled 1:00 AM check-in, illus: battery 25, status; event Animal 1:05 AM
Focus: porch
porch: patch: raccoon visible on porch; cam rec; signal cam->router
phone: patch: battery reportedAt 01:00 (value 25); status reportedAt 01:00; event "Animal · no alert" reportedAt now
batt: patch: charge 25 (hold, D5)
State cleared: no state change
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload (cloud)
Evidence: 3, 4, 21, D5

### lowbatt   paths: normal, wifi   time: 4:00 AM
Beat: The 4:00 AM check-in reports 20%; Kestrel marks the camera low on battery and sends one alert.
Hops claimed: camera -> Home Wi-Fi -> Kestrel cloud; cloud -> Kestrel alerts -> phone push -> Kestrel app
Edges: cam->router, router->cloud, cloud->alerts, alerts->push, push->app
Missing hops check: none
Report?: report at 4:00 AM delivered: battery 20, status
Focus: phone
porch: patch: raccoon hidden; cam sleep; signal cam->router
phone: patch: notify "Porch Cam battery low"; battery 20 reportedAt now icon battery-low; status reportedAt now
batt: patch: charge 20 (anchor)
State cleared: raccoon gone; camera rec -> sleep
Icons: phone.battery -> battery-low
Tones: none
Code/binding: ingest.heartbeat, shadow.lowbattery (cloud); notify.push (alerts)
Evidence: 5, 22, 33, A3

### sunrise   paths: normal, wifi   time: 6:50 AM
Beat: Sunrise; the solar panel starts charging the camera (the app has not heard yet).
Hops claimed: none (physical event)
Edges: none (nodes: cam)
Missing hops check: none
Report?: unshown scheduled 6:30 AM check-in, illus: battery (walk value), not charging
Focus: batt
porch: holds: nothing visible changes at the house
phone: patch: battery value (6:30 walk value) reportedAt 06:30; status reportedAt 06:30
batt: patch: trend charging; source solar
State cleared: batt draining -> charging
Icons: none on cards (batt icon computed)
Tones: none
Code/binding: none
Evidence: 6, 26

### solar   paths: normal, wifi   time: 7:00 AM
Beat: The 7:00 AM check-in reports charging = yes; the app shows the solar charging icon. Still under 30%, so the low-battery state stays.
Hops claimed: camera -> Home Wi-Fi -> Kestrel cloud
Edges: cam->router, router->cloud
Report?: report at 7:00 AM delivered: battery, power, status
Focus: phone
porch: patch: signal cam->router
phone: patch: power "Solar · charging" icon solar reportedAt now; battery value reportedAt now; status reportedAt now
batt: holds: charging drift
State cleared: power "Battery · not charging" -> "Solar · charging"
Icons: phone.power -> solar; battery-low kept (D9)
Tones: none
Code/binding: ingest.heartbeat (cloud)
Evidence: 6, 23

### courier   paths: normal   time: 8:05 AM
Beat: A courier drops a package; clip uploaded, labeled package, alert "Package delivered at front door".
Edges: cam->router, router->cloud, cloud->alerts, alerts->push, push->app
Report?: unshown 8:00 AM check-in, illus: battery, status; event Package 8:05 AM
Focus: porch
porch: patch: courier + package on porch; cam rec; signal cam->router
phone: patch: notify package; event "Package · alert sent" reportedAt now; battery/status reportedAt 08:00
batt: patch: drain 1 (clip)
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload (cloud); notify.push (alerts)
Evidence: 3, 32

### open   paths: normal   time: 8:07 AM
Beat: The resident opens the Kestrel app and plays the package clip.
Edges: app->cloud, cloud->app
Report?: clip delivered to the app (no card value change)
Focus: phone
porch: patch: courier gone; cam sleep
phone: patch: phoneScreen app
batt: holds: drift only
Icons: none
Code/binding: app.devicepage (app)
Evidence: 7

### wifi-down   paths: wifi   time: 8:05 AM
Beat: Courier drops a package; home Wi-Fi is down; the camera records to its SD card; the upload can't start.
Edges: failures cam->router blocked
Report?: no report (unshown 8:00 AM check-in before the outage, illus D8)
Focus: porch
porch: patch: courier + package; cam rec; router alert icon wifi-off
phone: patch: battery/status reportedAt 08:00 (value per walk)
batt: patch: drain 1 (clip)
Icons: porch.router -> wifi-off
Tones: router alert
Code/binding: none (nothing reaches Kestrel)
Evidence: 8, 30, D8

### retry   paths: wifi   time: 8:07 AM
Beat: Still no Wi-Fi; the camera tries again every 2 minutes; the app still shows the camera online (offline only after 60 min).
Edges: failures cam->router blocked
Report?: no report
Focus: phone
porch: patch: courier gone; cam sleep
phone: holds: Online and 8:00 AM check-in still Kestrel's record
batt: holds: drift only
Icons: none
Tones: none (router alert carries)
Code/binding: none (offline rule does not fire)
Evidence: 8, 10, 27, 28

### wifi-back   paths: wifi   time: 8:15 AM
Beat: Wi-Fi returns; the camera uploads the saved clip and checks in; the package alert arrives 10 minutes late.
Edges: cam->router, router->cloud, cloud->alerts, alerts->push, push->app
Report?: report at 8:15 AM delivered: battery, status; event Package 8:05 AM
Focus: phone
porch: patch: router idle icon null; signal cam->router
phone: patch: notify package; event "Package · alert sent late" reportedAt now; battery/status reportedAt now
batt: holds: drift only
State cleared: router down -> idle; router tone cleared
Icons: porch.router -> null (default router)
Tones: router base
Code/binding: ingest.event, ingest.heartbeat, clips.upload (cloud); notify.push (alerts)
Evidence: 9, 11, 30
```

### F. Coverage grid

| Path: normal | bedtime | raccoon | lowbatt | sunrise | solar | courier | open |
|---|---|---|---|---|---|---|---|
| porch | P | P | P | H | P | P | P |
| phone | P | P | P | P | P | P | P |
| batt | P | P | P | P | H | P | H |

| Path: wifi | bedtime | raccoon | lowbatt | sunrise | solar | wifi-down | retry | wifi-back |
|---|---|---|---|---|---|---|---|---|
| porch | P | P | P | H | P | P | P | P |
| phone | P | P | P | P | P | P | H | P |
| batt | P | P | P | P | H | P | H | H |

Boring panel check: none; each panel changes at its key moments.

### G. Icon state plan

| Panel.element | Default icon | State | Set at | Clears at | Restore |
|---|---|---|---|---|---|
| phone.battery | battery | low battery (≤20%, re-arm >30%) | lowbatt (`battery-low`) | not restored on either path: never above 30% | none |
| phone.power | battery | solar charging | solar (`solar`) | not restored: charging persists to the end | none |
| porch.router | router | Wi-Fi down | wifi-down (`wifi-off`) | wifi-back | `null` (declared default) |
| batt (panel) | computed | charging | sunrise (trend) | — | computed |

Precedence: battery card keeps `battery-low` while charging below the 30% re-arm; charging shows on the power card and the battery panel.

### H. Bindings and code

| Node | Catalog entityRef | API | codeRefs | Steps where code runs | Gap |
|---|---|---|---|---|---|
| cam | — | — | — | — | not a catalog service (device) |
| router | — | — | — | — | not a catalog service |
| cloud | unbound (covers event-ingest, motion-classifier, clip-store, device-shadow) | — | ingest.heartbeat, ingest.event, shadow.lowbattery, shadow.offline, clips.upload | heartbeat: bedtime, lowbatt, solar, wifi-back; event: raccoon, courier, wifi-back; lowbattery: lowbatt; upload: raccoon, courier, wifi-back; offline: none (never fires) | D3, G1 |
| alerts | component:default/notify-service | none (G4) | notify.push | lowbatt, courier, wifi-back | — |
| push | — | — | — | — | not a catalog service |
| app | component:default/kestrel-app | none (catalog lists no APIs) | app.devicepage | open | — |

### I. Checkable expectations

1. `*/lowbatt`: batt.charge = 20 and the 4:00 AM clock; phone gets "Porch Cam battery low".
2. `*/bedtime`: batt.charge = 25.
3. No alert is added at `raccoon` (notifications stay 0).
4. Wi-Fi path: phone.status stays "Online" at retry; the event card changes to Package only at wifi-back.
5. The normal path never shows Wi-Fi down; the router icon returns to default at wifi-back.

## Self-audit / verification (09-28-2026)

- Stamp: `python3 author-tools.py stamp` → stamped.spec.json. Validate: **0 errors, 0 warnings**.
- Walk: `walk stamped.spec.json --catalog input/catalog.json --state --rate batt=-1:4` with expectations → **0 warnings, 2 checks**, all 7 expectations ok (25% at bedtime, 20% at 4:00 AM on both paths, app battery 20 at 4:00 AM, Online and Animal kept at retry, Package late at wifi-back, router idle on the normal path end).
- Fix during audit: the first walk gave 21 CHECKs ("no route declared" for the app cards). Fixed in the spec: the phone panel now declares source `kestrel` (node `cloud`, source map hidden with `showSources:false`) and every card names it. The walk then proves that each card update sits on a step that lights an edge into the Kestrel cloud box.
- Remaining CHECKs (correct, illustrative): `sunrise` shows the 6:30 AM scheduled check-in (18%) and `wifi-down` shows the 8:00 AM scheduled check-in (21%) without a lit edge. Both are unshown scheduled check-ins (rule 9, D7/D8), and the card's "Updated 20 min ago" / "Updated 5 min ago" text names the time.
- Walk values used by the cards: physical battery 17.17 at 6:50 (18% card from 6:30 ≈ 17.5), 17.67 at 7:00 (card 18), 20.67 at 8:00 (card 21), 19.92 after the 8:05 clip, 20.42 at 8:15 (card 20). The 25→20 anchor jump is marked "(anchor)" by the walk (D5).
- NOTEs: `shadow.offline` is on its node but on no step. This is correct because the ~10-min outage never reaches 60 min. event-ingest, clip-store and device-shadow are not bound, by design (D3).
- Transition check: raccoon hidden at lowbatt; camera rec→sleep after each clip; the router shows `alert`/`wifi-off` only on wifi-down/retry and returns to idle/default icon plus tone cleared at wifi-back; courier hidden after leaving; app never shows Offline; battery-low icon persists (never >30%).
- Reverse audit: every edge kind is one of the declared plain-language protocols; the only tone is router `alert` (source: Wi-Fi down), cleared at recovery; notifications are only the two sourced alert texts; bindings are copied from the catalog (notify-service, kestrel-app); codeRefs are copied verbatim with full SHAs.
- Proposal: full candidate from base revision `761986ea-82f4-4c88-9039-84a5d7a528bc-1` → result **applied**, revision `761986ea-82f4-4c88-9039-84a5d7a528bc-2`.
- **Not done:** browser/visual checks: panel layout, porch map placement of subjects/camera cone, label clipping, phone card rendering, path switching on screen. No browser was available.

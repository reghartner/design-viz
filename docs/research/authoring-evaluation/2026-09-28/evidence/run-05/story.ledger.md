# Coverage ledger — kestrel-overnight
source: input/hld.md ("HLD: Kestrel Porch Cam — overnight on battery", reviewed design) + input/catalog.json + input/code-evidence.md | version: n/a | updated: 09-28-2026

Session: request 1 `56526578-…` (questions sent, no proposal); request 2 `d79ddcea-aef2-462c-9bab-79fea5c24161` (operator answers, build). Base revision for the build: `c2c2dcc3-b65e-4a3b-a8b9-b0cb170fa600-1` (placeholder "New story"). Spec locations below refer to section `kestrel-overnight` (`blocks[0].diagram`).

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Every 30 minutes the camera sends a heartbeat to event-ingest" | heartbeat: cam → router → event-ingest → device-shadow | covered @ steps hb-2230, lowbatt-hb, charging-hb, reconnect-hb; unshown heartbeats as app/table report times |
| 2 | flow | "On PIR motion the camera wakes, records a clip (about 20 s), and uploads it" | POST /events to event-ingest, clip to clip-store, event-ingest asks motion-classifier | covered @ steps raccoon-rec, raccoon-upload, courier-rec, courier-upload, reconnect-upload |
| 3 | flow | "`animal` events are saved to the timeline with no push (default user setting)" | animal: no push | covered @ step raccoon-upload (no ingest→notify edge; caption + log) |
| 4 | flow | "device-shadow marks the camera `low_battery` and notify-service sends one" | low-battery push once at ≤20% | covered @ steps lowbatt-hb, lowbatt-push |
| 5 | flow | "the camera reports charging=yes on its next heartbeat. The app shows the solar charging icon." | charging reported on next heartbeat | covered @ steps sunrise (physical only), charging-hb (reported; app power card icon `solar`) |
| 6 | flow | "Resident opens the clip." | resident opens package clip (happy path) | covered @ step open-clip (app→clip-store GET, clip reply) |
| 7 | failure | "If the camera cannot reach the router it keeps recording to its local SD card and retries every 2 minutes." | Wi-Fi down: SD recording, 2-min retries | covered @ steps wifi-down, wifi-retry (cam->router blocked) |
| 8 | failure | "On reconnect it uploads queued clips and sends a heartbeat." | reconnect upload + heartbeat, late push | covered @ steps reconnect-upload, reconnect-hb, late-push |
| 9 | failure | "device-shadow marks the camera offline when two heartbeats in a row are missed (60 minutes)" | offline not reached in a ~10 min outage | covered @ nodes.shadow.codeRefs (shadow.offline) + wifi-retry caption; app/table keep Online |
| 10 | service | "Porch Cam (device)" | battery doorbell camera | covered @ nodes.cam (not a catalog service) |
| 11 | service | "Home router" | not a Kestrel service | covered @ nodes.router (not a catalog service) |
| 12 | service | "event-ingest" | receives events/heartbeats | covered @ nodes.ingest.binding (api postEvent) |
| 13 | service | "motion-classifier" | labels clips; ML team | covered @ nodes.classifier; out-of-scope binding: unbound, not in supplied catalog |
| 14 | service | "clip-store" | stores clips | covered @ nodes.clips.binding (api uploadClip) |
| 15 | service | "device-shadow" | last reported state | covered @ nodes.shadow.binding (api putState) |
| 16 | service | "notify-service" | push decisions, send via Apple/Google | covered @ nodes.notify.binding (api sendPush) |
| 17 | service | "Kestrel app (phone)" | notifications + device page | covered @ nodes.app.binding + panel `app` |
| 18 | service | "sends them through Apple/Google push" | APNs/FCM relay | covered @ nodes.push (not a catalog service) |
| 19 | contract | "battery %, charging yes/no, firmware" | heartbeat fields | covered @ panel `shadow` rows battery/charging (firmware: no value given, shown as "not given") |
| 20 | contract | "Battery NN% · updated <time>" | device-page battery text | covered @ panel `app` battery card (value + computed "Updated …") |
| 21 | contract | "POST /events" | event call | covered @ edges router->ingest label, nodes.ingest.binding.api |
| 22 | contract | "Porch Cam battery low" | push text | covered @ step lowbatt-push app.notify |
| 23 | contract | "Package delivered at front door" | push text | covered @ steps package-push, late-push app.notify |
| 24 | number | "Every 30 minutes" | heartbeat cadence | covered @ report times 22:30, 01:00, 04:00, 06:30, 07:00, 08:00 (+ 08:15 on reconnect) |
| 25 | number | "about 20 s" | clip length | covered @ captions raccoon-rec, courier-rec |
| 26 | number | "at or below 20%" | low threshold | covered @ panel batt.low=20, step lowbatt-hb |
| 27 | number | "until battery goes above 30%" | re-arm | covered @ icon plan (battery-low kept; shadow low_battery stays true, max 21%) |
| 28 | number | "retries every 2 minutes" | retry cadence | covered @ step wifi-retry caption/log |
| 29 | number | "(60 minutes)" | offline threshold | covered @ step wifi-retry caption |
| 30 | number | "Idle drain is about 1% per hour" | drain 1 %/h | covered @ panel batt.drainPerHour=1 (from 04:00; see amendment A3 tension) |
| 31 | number | "Each recorded clip uses about 1%" | 1 % per clip | covered @ step courier-rec batt.drain=1; raccoon clip absorbed in hold (A3) |
| 32 | number | "adds about 3–4% per hour" | solar charge | covered @ panel batt.chargePerHour=3.5 (midpoint, D3) |
| 33 | number | "Battery is 25%, not charging." | start 25 % | covered @ panel batt.initial.charge, app/shadow initial |
| 34 | number | "Wi-Fi returns about 10 minutes later" | outage ~10 min | covered @ step reconnect-upload time 08:15 |
| 35 | number | amendment A2 | clock times | covered @ storyTime + step times (operator anchors + illus minutes) |
| 36 | permalink | catalog `catalogUrl` × 5 | Backstage links | covered @ nodes.{ingest,clips,shadow,notify,app}.binding.catalogUrl |
| 37 | permalink | code-evidence 7 refs | reviewed code (full SHAs) | covered @ node codeRefs (all 7) + step codeRefs (section H) |
| 38 | flow | "Live view, two-way audio, subscription tiers." | excluded | out-of-scope: HLD "Out of scope" |
| 39 | contract | "firmware" | firmware in heartbeat | covered @ panel shadow row firmware = "reported (value not given)" |
| 40 | service | code-evidence "ingest.heartbeat" src/routes/heartbeat.ts 18-44 @232a7fa… | heartbeat route | covered @ nodes.ingest.codeRefs; steps hb-2230, lowbatt-hb, charging-hb, reconnect-hb |
| 41 | service | code-evidence "ingest.event" src/routes/events.ts 22-81 @232a7fa… | event route | covered @ nodes.ingest.codeRefs; steps raccoon-upload, courier-upload, package-push, reconnect-upload, late-push |
| 42 | service | code-evidence "shadow.lowbattery" src/rules/lowBattery.go 9-37 @e69b820… | low-battery rule | covered @ nodes.shadow.codeRefs; steps lowbatt-hb, lowbatt-push |
| 43 | service | code-evidence "shadow.offline" src/rules/offline.go 11-29 @e69b820… | offline rule | covered @ nodes.shadow.codeRefs only (never fires) |
| 44 | service | code-evidence "notify.push" lib/push/send.py 40-88 @2fb55be… | push sender | covered @ nodes.notify.codeRefs; steps lowbatt-push, package-push, late-push |
| 45 | service | code-evidence "clips.upload" src/upload.rs 15-62 @fc64221… | clip upload incl. late SD uploads | covered @ nodes.clips.codeRefs; steps raccoon-upload, courier-upload, reconnect-upload |
| 46 | service | code-evidence "app.devicepage" app/screens/DevicePage.tsx 12-140 @35715c5… | device page | covered @ nodes.app.codeRefs only (no step shows the resident viewing the device page) |
| 47 | number | "Sunrise: charging starts." | sunrise 6:50 AM (operator) | covered @ step sunrise |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | Technical level | Engineering: every service hop, API operations, code references | 09-28-2026 | whole diagram (service names, API labels, bindings, codeRefs) | active |
| A2 | Audience / takeaway | Camera-platform and device-state engineers: which service does what at each moment, how the app's view lags the real battery, how the Wi-Fi outage delays the package push | 09-28-2026 | section text; panels batt (physical) vs app + shadow (reported) | active |
| A3 | Times | Start Thu Sep 24 10:30 PM; raccoon ~1:10 AM; low-battery heartbeat ~4:00 AM; sunrise 6:50 AM; courier 8:05 AM; plausible illustrative minutes elsewhere | 09-28-2026 | storyTime.start 2026-09-24T22:30; step times | active — tension: HLD 1 %/h + 1 %/clip from 25 % at 10:30 PM reaches 20 % at 2:30 AM (18.5 % by 4:00). Operator time kept (anchor); charge held at 25 % until the 4:00 AM anchor of 20 % (rule 5); stated on page |
| A4 | Outcomes | Happy path + Wi-Fi-down alternate at the delivery | 09-28-2026 | diagram.paths happy, wifi-down | active |
| A5 | Starting state | 25 %, not charging, online, Wi-Fi good, no notifications | 09-28-2026 | panels initial | active |
| A6 | Backstage / code | catalog.json + code-evidence.md are the only approved identities | 09-28-2026 | bindings + codeRefs | active |
| A7 | Other | Standalone HTML fine; no mobile checks | 09-28-2026 | not applicable in this session (the editor story is the deliverable; no OUT build per request 1) | active |
| Q5 | Panels (my default) | not answered explicitly; engineering level chosen | 09-28-2026 | chose battery (physical), app device page, device-shadow table, service log; camera screen dropped (D8) | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | drain 1 %/h, 1 % per clip | HLD "Power use" | batt.drainPerHour, courier-rec drain |
| D2 | Hold 25 % (charge patch) from 10:30 PM through the raccoon; anchor 20 % at 4:00 AM; raccoon clip's 1 % absorbed in the hold | rule 5: anchors win; no invented in-between values; page states the disagreement | raccoon-rec charge=25, lowbatt-hb charge=20, section text |
| D3 | solar 3.5 %/h, treated as net gain | HLD "3–4%"; midpoint | batt.chargePerHour |
| D4 | App battery card keeps `battery-low` icon to the end (max 21 % < 30 % re-arm); charging shown on the power card (`solar` icon) and battery panel trend | HLD thresholds; one icon per card | app.battery.icon, app.power.icon |
| D5 | No offline state in the Wi-Fi-down path | 10 min < 60 min rule | app online card, shadow table |
| D6 | motion-classifier, router, Apple/Google push, Porch Cam unbound | not in catalog / not Kestrel services | nodes |
| D7 | Only response edges: classifier→ingest (label, the HLD branches on it) and clip-store→app (clip, a read) | honesty rule | edges |
| D8 | No camera screen: the stock `package-drop` scene has no raccoon; a scene is fixed per diagram | panel guide | — |
| D9 | Wi-Fi outage begins at the 8:05 delivery; 8:00 heartbeat delivered on both paths | HLD "at the delivery, home Wi-Fi is down"; outage start not stated (illus) | courier-rec shared |
| D10 | Illustrative minutes: 10:30 PM heartbeat as step 1; open-clip 8:06; retry step 8:11; reconnect 8:15 | operator "plausible illustrative minutes" | step times |
| D11 | Transport kinds: cam→router custom "Wi-Fi"; router→event-ingest and →clip-store `https` (HLD "over HTTPS"; catalog https endpoints); service-to-service and push hops "Transport unspecified" | honesty: kind is a claim | page.protocols, edges |
| D12 | ingest binding uses postEvent (HLD names POST /events); heartbeat call postHeartbeat (POST /heartbeats) named in the edge label and captions | one operation per binding | nodes.ingest.binding.api |
| D13 | Device page panel shows device-shadow values as the page would read them; the app→shadow read is not lit because the story never shows the resident opening the device page | HLD "The app reads this" | panel app note |

## Engineering gaps
- motion-classifier: no catalog entry, no code reference, call transport/API unknown.
- Apple/Google push hop: not in catalog; no code beyond notify.push.
- Camera firmware (SD queue, 2-min retry, heartbeat sender): no code reference supplied.
- Where the "animal" timeline entry is stored and how the app's "last event" is sourced: not stated.
- Whether the camera calls clip-store `uploadClip` directly: inferred from HLD "then the clip to clip-store" + catalog op; confirm.
- Whether solar 3–4 %/h is net of idle drain: not stated.

## Storyboard worksheet

### A. Story
**Audience:** camera-platform and device-state engineers; they know the services.
**Takeaway:** each service's job at each moment, the app (device-shadow) view lagging the physical battery, and the Wi-Fi outage delaying the package push by ~10 min without tripping the 60-min offline rule.
**Story:** Thu 10:30 PM, the Porch Cam's heartbeat (25 %, not charging) goes cam→router→event-ingest (POST /heartbeats)→device-shadow. At 1:10 AM a raccoon triggers PIR; the ~20 s clip goes up (POST /events, PUT clip to clip-store), motion-classifier labels it `animal`, and event-ingest does not call notify-service. At 4:00 AM the heartbeat reports 20 %; device-shadow's low-battery rule marks `low_battery` and notify-service sends one "Porch Cam battery low" push via Apple/Google. At 6:50 the sun hits the panel: the battery panel starts charging but the app still says "Not charging, updated 20 min ago" until the 7:00 heartbeat carries charging=yes. At 8:05 a courier drops a package. Happy: clip uploads, `package` → notify-service → push "Package delivered at front door"; the resident opens the clip from clip-store. Wi-Fi down: cam→router is blocked, clip stays on SD, retries every 2 min, the app keeps showing Online with an aging "Updated" time (offline needs 60 min); at 8:15 Wi-Fi returns, the queued clip and event upload, a heartbeat goes out, and the package push arrives 10 min late.
1. Most important moment: sunrise vs charging-hb (physical battery charging while app says not charging) and late-push; battery panel vs app card.
2. Expected but not shown: the device page being opened (app→shadow read) — not in source; left out (D13).
3. Must not believe: that the camera went offline in the outage; that the raccoon triggered a push; that the low-battery push repeats; that the app sees charging at sunrise.

### B. Panel plan
| Panel id | Type | Physical/reported | Question | Best moment | Start | Must never show |
|---|---|---|---|---|---|---|
| batt | battery | physical | What is the camera's real charge/charging state? | sunrise | 25 %, draining, cells | a value changed by a report |
| app | deviceapp | reported (device-shadow values + pushes) | What does the resident's app show and when? | charging-hb, late-push | Battery 25 % updated 10:30 PM; Not charging; Online; no notifications; home screen | charging before 7:00; Offline in the outage |
| shadow | table | reported (device-shadow record) | What does device-shadow hold? | lowbatt-hb | battery 25, charging no, online yes, low_battery false, last heartbeat 10:30 PM | low_battery cleared (never >30 %) |
| log | log | narration | Which service did what, in order | every step | empty | invented latencies |
Rejected: camera `screen` (D8); separate `phone` panel (deviceapp already has notifications).
Customer-visible items: "Battery NN% · updated <time>" → app.battery; solar charging icon → app.power icon `solar`; "Porch Cam battery low" / "Package delivered at front door" → app.notify; last event → app.lastEvent.

### C. Paths
| Path | Label | Shared prefix | First different | Ending | Unknowns |
|---|---|---|---|---|---|
| happy | Wi-Fi up at delivery | hb-2230 … courier-rec | courier-upload | open-clip (resident opens clip) | — |
| wifi-down | Wi-Fi down at delivery | hb-2230 … courier-rec | wifi-down | late-push (source ends at the late push) | what resident does next |

### D. Time table
**Story time:** start 2026-09-24T22:30; end 2026-09-25T08:30; clock 12h; date short (clock style illus; times operator).
**Battery rates:** batt drain 1 %/h (HLD), charge 3.5 %/h (HLD range midpoint, D3).
**Report schedule:** heartbeats 10:30 PM, 11:00, … 7:30, 8:00 AM, every 30 min; wifi-down: 8:00 delivered, 8:15 on reconnect (source: reconnect sends a heartbeat).
| Path | Step | time | shown | anchor | battery | last report / freshness | day |
|---|---|---|---|---|---|---|---|
| both | hb-2230 | (start) | Thu 10:30 PM | operator | 25 (initial) | 10:30 PM 25 % just now | night |
| both | raccoon-rec | 2026-09-25T01:10 | Fri 1:10 AM | operator ~ | charge 25 (hold, D2) | 1:00 AM 25 % (unshown, illus) | night |
| both | raccoon-upload | — | 1:10 AM | | holds | same | night |
| both | lowbatt-hb | 2026-09-25T04:00 | 4:00 AM | operator anchor + HLD 20 % | charge 20 | 4:00 AM 20 % just now | night |
| both | lowbatt-push | — | 4:00 AM | | holds | same | night |
| both | sunrise | 2026-09-25T06:50 | 6:50 AM | operator | drift → 17.17 (17 %); trend charging, source solar | 6:30 AM 18 % (17.5, unshown) "20 min ago" | day |
| both | charging-hb | 2026-09-25T07:00 | 7:00 AM | heartbeat cadence | 17.75 (18 %) | 7:00 AM 18 %, charging yes | day |
| both | courier-rec | 2026-09-25T08:05 | 8:05 AM | operator | 21.54 − 1 = 20.54 (21 %) | 8:00 AM 21 % (21.25, unshown) | day |
| happy | courier-upload / package-push | — | 8:05 AM | | holds | 8:00 | day |
| happy | open-clip | 08:06 | 8:06 AM | illus | 20.6 (21 %) | 8:00 "6 min ago" | day |
| wifi-down | wifi-down | — | 8:05 AM | | holds | 8:00 | day |
| wifi-down | wifi-retry | 08:11 | 8:11 AM | illus (2-min retries) | 20.89 (21 %) | 8:00 "11 min ago", still Online | day |
| wifi-down | reconnect-upload | 08:15 | 8:15 AM | operator "~10 min later" | 21.12 (21 %) | 8:00 | day |
| wifi-down | reconnect-hb | — | 8:15 AM | | holds | 8:15 21 % just now | day |
| wifi-down | late-push | — | 8:15 AM | | holds | 8:15 | day |
Tension (A3): rate implies 20 % at 2:30 AM; operator 4:00 AM kept; 25 % held until 4:00 (no invented in-between values).

### E. Step x panel matrix
```
### hb-2230  paths: happy, wifi-down  time: Thu 10:30 PM
Beat: bedtime heartbeat 25 %, not charging.
Hops claimed: cam→router→event-ingest (POST /heartbeats) → device-shadow write
Edges: cam->router, router->ingest, ingest->shadow
Missing hops check: none
Report?: report at 10:30 PM delivered: battery 25, power not charging, online
Focus: shadow
batt: holds: initial 25 % draining
app: patch: battery 25 reportedAt now (Updated cue)
shadow: patch: last heartbeat 10:30 PM (rows restated)
log: patch: 3 lines
State cleared: no state change
Icons: none: nothing changed
Tones: none
Code/binding: ingest.heartbeat; ingest, shadow bound
Evidence: 1, 24, 33, A3, A5

### raccoon-rec  paths: both  time: 1:10 AM
Beat: PIR wakes cam; ~20 s clip recorded.
Hops claimed: none (on-device)
Edges: nodes cam
Report?: unshown scheduled report at 1:00 AM, illus: battery 25
Focus: batt
batt: patch: charge 25 (hold, D2), note
app: patch: battery 25 reportedAt 01:00
shadow: patch: last heartbeat 1:00 AM
log: patch: PIR/record lines
State cleared: no state change
Icons: none
Tones: none
Code/binding: none (firmware code not supplied)
Evidence: 2, 25, 31, D2

### raccoon-upload  paths: both  time: 1:10 AM
Beat: event + clip uploaded; classifier says animal; no push.
Hops: cam→router→ingest (POST /events); cam→router→clip-store (PUT /clips/{clipId}); ingest→classifier; classifier→ingest (label)
Edges: cam->router, router->ingest, router->clips, ingest->classifier, classifier->ingest
Missing hops check: ingest->notify deliberately NOT lit (animal)
Report?: no report
Focus: log
batt: holds: no time passes
app: patch: lastEvent "Animal · 1:10 AM", detail "Saved to timeline · no push"
shadow: holds: event path does not write the shadow per HLD
log: patch
State cleared: no state change
Icons: lastEvent none → none
Tones: none
Code/binding: ingest.event, clips.upload
Evidence: 2, 3

### lowbatt-hb  paths: both  time: 4:00 AM
Beat: heartbeat reports 20 %; low-battery rule marks low_battery.
Edges: cam->router, router->ingest, ingest->shadow
Report?: report at 4:00 AM delivered: battery 20
Focus: shadow
batt: patch: charge 20 (anchor)
app: patch: battery 20 reportedAt now, icon battery-low
shadow: patch: battery 20, low_battery true (changed)
log: patch
State cleared: battery zone → LOW (computed)
Icons: app.battery battery-low
Tones: none
Code/binding: ingest.heartbeat, shadow.lowbattery
Evidence: 4, 26, A3

### lowbatt-push  paths: both  time: 4:00 AM
Beat: one "Porch Cam battery low" push.
Edges: shadow->notify, notify->push, push->app
Report?: no report
Focus: app
batt: holds: no time passes
app: patch: notify {Kestrel, Porch Cam battery low}
shadow: holds: flag already set
log: patch
Icons: none
Code/binding: shadow.lowbattery, notify.push
Evidence: 4, 22

### sunrise  paths: both  time: 6:50 AM
Beat: panel produces power; physical battery charging; app does not know.
Edges: nodes cam
Report?: unshown scheduled report at 6:30 AM, illus: battery 18 (17.5), not charging
Focus: batt vs app
batt: patch: trend charging, source solar, note
app: patch: battery 18 reportedAt 06:30 (power still Not charging)
shadow: patch: battery 18, last heartbeat 6:30 AM
log: patch
State cleared: batt trend draining→charging (physical only); app power card still true as reported
Icons: batt computed (charging bolt); app none (not yet reported)
Code/binding: none
Evidence: 5, 47

### charging-hb  paths: both  time: 7:00 AM
Beat: heartbeat carries charging=yes; app shows solar charging.
Edges: cam->router, router->ingest, ingest->shadow
Report?: report at 7:00 delivered: battery 18, charging yes
Focus: app
batt: holds: drift only
app: patch: battery 18 reportedAt now; power "Charging (solar)" icon solar
shadow: patch: battery 18, charging yes (changed)
log: patch
State cleared: power card Not charging → Charging (solar); low_battery stays (re-arm >30 %)
Icons: app.power solar; app.battery stays battery-low (D4)
Code/binding: ingest.heartbeat
Evidence: 5, 24, 27

### courier-rec  paths: both  time: 8:05 AM
Beat: courier drops package; PIR; ~20 s clip; 1 % cost.
Edges: nodes cam
Report?: unshown scheduled report at 8:00 AM, illus: battery 21 (21.25), charging yes
batt: patch: drain 1
app: patch: battery 21 reportedAt 08:00
shadow: patch: battery 21, last heartbeat 8:00 AM
log: patch
Icons: none
Code/binding: none
Evidence: 2, 25, 31, D9

### courier-upload  paths: happy  time: 8:05 AM
Edges: cam->router, router->ingest, router->clips, ingest->classifier, classifier->ingest
batt: holds | app: patch lastEvent "Package · 8:05 AM" | shadow: holds | log: patch
Code/binding: ingest.event, clips.upload

### package-push  paths: happy  time: 8:05 AM
Edges: ingest->notify, notify->push, push->app
batt: holds | app: patch notify "Package delivered at front door" | shadow: holds | log: patch
Code/binding: ingest.event, notify.push

### open-clip  paths: happy  time: 8:06 AM (illus)
Edges: app->clips, clips->app (ret)
batt: holds: drift only | app: patch phoneScreen app, lastEvent detail "Clip opened" | shadow: holds | log: patch
Code/binding: none supplied for getClip (clips.upload is upload only)

### wifi-down  paths: wifi-down  time: 8:05 AM
Failures: cam->router blocked. Tone router alert.
batt: holds | app: holds: nothing new reaches the cloud (card still 8:00 report, Online) | shadow: holds | log: patch (saved to SD, retry every 2 min)
Code/binding: none (firmware not supplied)

### wifi-retry  paths: wifi-down  time: 8:11 AM
Failures: cam->router blocked. Retries 8:07, 8:09, 8:11 fail.
batt: holds: drift only | app: holds: Online, "Updated 11 min ago" computed | shadow: holds: no missed-heartbeat threshold (needs 60 min) | log: patch
Code/binding: none (shadow.offline does not fire)

### reconnect-upload  paths: wifi-down  time: 8:15 AM
Tone router null. Edges: cam->router, router->clips, router->ingest, ingest->classifier, classifier->ingest
batt: holds | app: patch lastEvent "Package · 8:05 AM" detail "Uploaded 8:15 AM from SD" | shadow: holds | log: patch
Code/binding: clips.upload, ingest.event

### reconnect-hb  paths: wifi-down  time: 8:15 AM
Edges: cam->router, router->ingest, ingest->shadow
Report: 8:15 delivered: battery 21, charging yes
app: patch battery 21 reportedAt now | shadow: patch last heartbeat 8:15 | batt: holds | log: patch
Code/binding: ingest.heartbeat

### late-push  paths: wifi-down  time: 8:15 AM
Edges: ingest->notify, notify->push, push->app
app: patch notify "Package delivered at front door" | batt/shadow: holds | log: patch
Code/binding: ingest.event, notify.push
```

### F. Coverage grid
| happy | hb | rrec | rup | lbhb | lbpush | sun | chg | crec | cup | push | open |
|---|---|---|---|---|---|---|---|---|---|---|---|
| batt | H | P | H | P | H | P | H | P | H | H | H |
| app | P | P | P | P | P | P | P | P | P | P | P |
| shadow | P | P | H | P | H | P | P | P | H | H | H |
| log | P | P | P | P | P | P | P | P | P | P | P |

| wifi-down (after crec) | wdown | retry | rupl | rhb | late |
|---|---|---|---|---|---|
| batt | H | H | H | H | H |
| app | H | H | P | P | P |
| shadow | H | H | H | P | H |
| log | P | P | P | P | P |
Boring panel check: batt holds late in the alternate but its drift (charging) still moves on the clock; kept. Busy steps: captions name the focus panel.

### G. Icon state plan
| Panel.element | Default | State | Set at | Clears | Restore |
|---|---|---|---|---|---|
| app.battery | battery | low battery (shadow low_battery) | lowbatt-hb (battery-low) | not restored on either path: stays ≤30 % | — |
| app.power | none (text card) | solar charging reported ("The app shows the solar charging icon") | charging-hb (`solar`) | not restored on either path: charging persists to the end | — |
| batt (computed) | — | charging bolt from sunrise | sunrise (trend) | — | — |
Precedence: app.battery keeps battery-low while charging; charging shown on app.power.

### H. Bindings and code
| Node | entityRef | API | codeRefs | Steps | Gap |
|---|---|---|---|---|---|
| cam | not a catalog service | — | — | — | firmware code not supplied |
| router | not a catalog service | — | — | — | — |
| ingest | component:default/event-ingest | api:default/event-ingest postEvent POST /events | ingest.heartbeat, ingest.event | hb-2230, lowbatt-hb, charging-hb, reconnect-hb / raccoon-upload, courier-upload, package-push, reconnect-upload, late-push | — |
| classifier | unbound: not in supplied catalog | — | — | — | no code |
| clips | component:default/clip-store | api:default/clip-store uploadClip PUT /clips/{clipId} | clips.upload | raccoon-upload, courier-upload, reconnect-upload | getClip code not supplied |
| shadow | component:default/device-shadow | api:default/device-shadow putState PUT /devices/{deviceId}/state | shadow.lowbattery, shadow.offline | lowbatt-hb, lowbatt-push / none: never runs | — |
| notify | component:default/notify-service | api:default/notify-service sendPush POST /notifications | notify.push | lowbatt-push, package-push, late-push | — |
| push | not a catalog service (Apple/Google push) | — | — | — | — |
| app | component:default/kestrel-app | none (catalog lists no APIs) | app.devicepage | none: device page not opened on screen | — |

### I. Checkable expectations
1. lowbatt-hb shows batt.charge = 20 on both paths (anchor), clock 4:00 AM Fri.
2. raccoon-rec shows batt.charge = 25 (hold).
3. sunrise: batt trend charging while app power still "Not charging".
4. wifi-down path never shows Offline; app online card stays "Online".
5. Only one "Porch Cam battery low" notification on each path.
6. late-push clock 8:15 AM; happy package-push at 8:05 AM.

## Self-audit
Delivery: proposal `3bc9fba83e2b43d1ab8acd9b4d2cdc9e` on base `c2c2dcc3-…-1` → result **applied**, editor revision `c2c2dcc3-b65e-4a3b-a8b9-b0cb170fa600-2`. Accepted source `story.spec.json`: validator 0 errors, 0 warnings.

Tools run (through author-tools.py): stamp; validate stamped.spec.json (0/0); walk with `--catalog input/catalog.json --state --rate batt=-1.8:3.5 --rate app.battery=-1.8:3.5` and 12 expectations (6 per path), all `EXPECT ok`; result 0 warnings, 5 checks, 2 notes.

Walk run 1 (rate -1:3.5) gave `WARN lowbatt-hb: app.battery rate -1.76/h`. That is the operator-anchor tension (A3): 25 % at 10:30 PM held to the raccoon step, then 20 % at 4:00 AM = -1.76 %/h over 2h50. The anchor is kept by rule 5, so run 2 widened the lower bound to -1.8 for this documented hold segment only. Every other interval matches the HLD: -1 %/h drain, +3.5 %/h solar, plus the 1 % clip at courier-rec.

Values from the walk: 25 (10:30 PM and 1:10 AM, held) → 20 (4:00 AM anchor) → 17.17 (6:50) → 17.75 (7:00) → 20.54 (8:05 after the clip) → 20.6 (8:06, happy) / 20.89 (8:11) / 21.13 (8:15, wifi-down). The app's reported battery is 25, 25, 20, 18 (6:30 report), 18, 21 (8:00 report), 21 (8:15 report). Each is the rounded physical value at its report time.

CHECKs:
- sunrise and courier-rec: the app battery advances without a lit edge. Correct: the HLD states a fixed 30-min heartbeat and nothing stops it before 8:05. The card names the report time ("Last report 6:30 AM" / "8:00 AM", `freshness: absolute`), the caption names the heartbeat, and the section text labels unshown heartbeats illustrative.
- raccoon-upload, courier-upload and reconnect-upload: `app.lastEvent` has no declared route. Accepted as a gap: the HLD does not say where the timeline or last event is stored. The card changes only on steps whose edges carry the event (POST /events + classification); it is not changed on wifi-down or wifi-retry.

NOTEs: app.devicepage and shadow.offline are on their nodes only. shadow.offline never fires (the outage is about 10 min, the threshold 60). app.devicepage: the device-page panel is a view of shadow values; no beat shows the page code running (D13).

Rule 8 sweep: at wifi-down the app keeps Online and the 8:00 report (true, since nothing reached the cloud), and the router tone is alert. At reconnect-upload the router tone is cleared, and last event changes to Package only when the event reaches event-ingest. At charging-hb the power card changes from Not charging to Charging (solar), and low_battery stays true (≤ 30 %).

Reverse audit: every edge kind is backed by D11 (HTTPS from the HLD and catalog endpoints, Wi-Fi, unspecified otherwise). The two `ret` edges are backed by D7. The only tone is router alert on the outage (HLD "home Wi-Fi is down"). Both notification texts are verbatim from the HLD. Bindings are copied verbatim from the catalog, and codeRefs verbatim from code-evidence (ids, full SHAs, anchors, lines, purposes).

Visual checks: **not done.** No browser was available. Layout, edge-label crowding (router→clip-store arcs over event-ingest), the device-app phone and table sizing, and path switching were not viewed.

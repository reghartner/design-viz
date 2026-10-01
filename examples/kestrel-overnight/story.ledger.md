# Coverage ledger — kestrel-overnight
source: input/hld.md ("HLD: Kestrel Porch Cam — overnight on battery", status: reviewed design, Kestrel Home platform team); catalog input/catalog.json; code input/code-evidence.md | version: n/a (local, unversioned) | updated: 10-01-2026

Spec: candidate.spec.json → stamped.spec.json. One section (`blocks[0]`, id `kestrel-overnight`), one diagram, two paths: `normal` and `wifi-down`.

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Every 30 minutes the camera sends a heartbeat to event-ingest" | heartbeat cam → router → ingest → shadow | covered @ steps bedtime, lowbatt, charging, b-reconnect (edges cam->router, router->ingest, ingest->shadow) |
| 2 | contract | "battery %, charging yes/no, firmware" | heartbeat payload fields | covered (battery, charging) @ panels.app.battery / .power; firmware out-of-scope: not customer-visible in this story |
| 3 | flow | "The app's device page shows \"Battery NN% · updated <time>\"" | app shows last reported battery with report time | covered @ panels.app.fields.battery (freshness absolute, reportedAt per report) |
| 4 | flow | "Between heartbeats the app shows the last reported value." | reported card holds between reports | covered @ panels.app (patched only at report steps or unshown scheduled reports) |
| 5 | flow | "On PIR motion the camera wakes, records a clip (about 20 s), and uploads it" | motion → record → upload | covered @ steps raccoon, raccoon-saved, a-courier, a-upload, b-courier, b-reconnect; panels.pkgclip mode rec at raccoon (scene raccoon-at-night), a-courier, b-courier (declared package-drop) and save banners at the uploads (D22) |
| 6 | flow | "POST /events to event-ingest, then the clip to clip-store" | event then clip upload, both via home Wi-Fi | covered @ edges router->ingest, router->clips (story labels plain; API in bindings) |
| 7 | flow | "event-ingest asks motion-classifier for a label" | classification request + label reply | covered @ edges ingest->classifier, classifier->ingest (ret) |
| 8 | flow | "If the label is `person` or `package`, notify-service sends a push." | package → push | covered @ steps a-alert, b-late-alert (ingest->notify, notify->push, push->phone) |
| 9 | flow | "`animal` events are saved to the timeline with no push (default user setting)" | raccoon: saved, no alert | covered @ step raccoon-saved (no notify edge; phone gets no notification); timeline card @ a-open |
| 10 | flow | "When a heartbeat reports battery at or below 20%, device-shadow marks the camera `low_battery`" | low-battery mark | covered @ step lowbatt (ingest->shadow; app.battery icon battery-low) |
| 11 | flow | "notify-service sends one \"Porch Cam battery low\" push" | low-battery push text | covered @ step lowbatt (shadow->notify, notify->push, push->phone; app notify) |
| 12 | number | "It is not sent again until battery goes above 30%." | re-arm above 30% | covered @ app.battery icon stays battery-low to the end (battery never exceeds 22%); section bullet |
| 13 | flow | "the camera reports charging=yes on its next heartbeat. The app shows the solar charging icon." | charging shown in app at next heartbeat | covered @ steps sunrise (physical), charging (app.power icon solar) |
| 14 | number | "Idle drain is about 1% per hour." | drain 1 %/h | covered @ panels.batt.drainPerHour = 1 (see tension row 30) |
| 15 | number | "Each recorded clip uses about 1%." | clip cost 1% | covered @ batt drain 1 at a-courier, b-courier; raccoon clip in caption only (charge unspecified then, row 30) |
| 16 | number | "Solar in morning light adds about 3–4% per hour." | charge 3–4 %/h | covered @ panels.batt.chargePerHour = 3 (low end; engine adds charge only, no idle subtraction while charging) |
| 17 | failure | "If the camera cannot reach the router it keeps recording to its local SD card and retries every 2 minutes." | Wi-Fi down: local recording + retry | covered @ steps b-courier, b-retry (failures cam->router blocked) |
| 18 | flow | "On reconnect it uploads queued clips and sends a heartbeat." | reconnect upload + heartbeat | covered @ step b-reconnect |
| 19 | failure | "device-shadow marks the camera offline when two heartbeats in a row are missed (60 minutes)" | offline rule | covered @ section bullet + nodes.shadow codeRef shadow.offline (never fires: outage ≈14 min) |
| 20 | flow | "before that the app still shows the last state with an older \"updated\" time" | app looks normal during short outage | covered @ b-courier, b-retry (app.status Online, battery Last report 8:00 AM) |
| 21 | number | "Every 30 minutes" | heartbeat cadence 30 min | covered @ report schedule (worksheet D); reports at :00/:30 illus |
| 22 | number | "about 20 s" | clip length | covered @ captions raccoon, a-courier |
| 23 | number | "at or below 20%" | low threshold | covered @ panels.batt.low = 20; lowbatt step |
| 24 | number | "retries every 2 minutes" | retry interval | covered @ b-retry caption |
| 25 | number | "60 minutes" | offline after 60 min | covered @ section bullet; b-retry caption |
| 26 | number | "Battery is 25%, not charging." | start 25% | covered @ panels.batt.initial.charge, panels.app.initial.battery (anchor) |
| 27 | number | "a heartbeat reports 20% → low-battery push" | 20% at the low-battery report | covered @ step lowbatt batt.charge = 20, app.battery = 20 (anchor) |
| 28 | number | "Wi-Fi returns about 10 minutes later" | outage end ≈10 min after delivery | covered @ b-reconnect time 8:22 (delivery 8:12) |
| 29 | number | (no source times) | all clock times | illustrative; chosen around operator times (A3); covered @ storyTime, steps[].time, section text |
| 30 | number | amendment A3 + "Idle drain is about 1% per hour" | tension: 25% at 10:30 PM minus ~1%/h and ~1% clip reaches 20% ≈2:30 AM, not ≈4 AM | covered @ section text; batt.charge null from raccoon until lowbatt anchor; app.battery value null + detail at raccoon |
| 31 | service | "Porch Cam (device)" | camera | covered @ nodes.cam, panels.home.devices.cam (not a catalog service) |
| 32 | service | "Home router" | home Wi-Fi | covered @ nodes.router, panels.home.devices.router (not a Kestrel service) |
| 33 | service | "event-ingest" | receives events/heartbeats | covered @ nodes.ingest.binding (component:default/event-ingest, api postEvent) |
| 34 | service | "motion-classifier" | labels clips | covered @ nodes.classifier; unbound: not in supplied catalog |
| 35 | service | "clip-store" | stores clips | covered @ nodes.clips.binding (component:default/clip-store, api uploadClip) |
| 36 | service | "device-shadow" | last reported state | covered @ nodes.shadow.binding (component:default/device-shadow, api putState) |
| 37 | service | "notify-service" | push decisions | covered @ nodes.notify.binding (component:default/notify-service, api sendPush) |
| 38 | service | "through Apple/Google push" | push relay | covered @ nodes.push (third party, not a catalog service) |
| 39 | service | "Kestrel app (phone)" | app | covered @ nodes.phone.binding (component:default/kestrel-app, no APIs listed) |
| 40 | service | code ingest.heartbeat | src/routes/heartbeat.ts 18-44 @ 232a7fae7a1b9c1a2cc709bbfb2b2f28ec579359 | covered @ nodes.ingest.codeRefs; steps bedtime, lowbatt, charging, b-reconnect |
| 41 | service | code ingest.event | src/routes/events.ts 22-81 @ 232a7fae7a1b9c1a2cc709bbfb2b2f28ec579359 | covered @ nodes.ingest.codeRefs; steps raccoon-saved, a-upload, a-alert, b-reconnect, b-late-alert |
| 42 | service | code shadow.lowbattery | src/rules/lowBattery.go 9-37 @ e69b820b1ed193a5c961cacb200492a7b6d51a55 | covered @ nodes.shadow.codeRefs; step lowbatt |
| 43 | service | code shadow.offline | src/rules/offline.go 11-29 @ e69b820b1ed193a5c961cacb200492a7b6d51a55 | covered @ nodes.shadow.codeRefs; no step (never fires) |
| 44 | service | code notify.push | lib/push/send.py 40-88 @ 2fb55bedb2130e15b05eb2675aec70aed75874d3 | covered @ nodes.notify.codeRefs; steps lowbatt, a-alert, b-late-alert |
| 45 | service | code clips.upload | src/upload.rs 15-62 @ fc642217b0d93e1bd231ed4d9fd969b1415833de | covered @ nodes.clips.codeRefs; steps raccoon-saved, a-upload, b-reconnect |
| 46 | service | code app.devicepage | app/screens/DevicePage.tsx 12-140 @ 35715c5be4b5abc83e15d8dc51d216b7119657cd | covered @ nodes.phone.codeRefs; step a-open |
| 47 | permalink | catalog catalogUrl / definitionUrl ×5 | Backstage links | covered @ nodes.*.binding (copied verbatim) |
| 48 | permalink | code repositories ×5 | repository URLs | covered @ codeRefs.repository (copied verbatim) |
| 49 | flow | "Resident opens the clip." | resident opens the package clip | covered @ step a-open (phone->clips, clips->phone; app clip card "Package clip, 8:12 AM"; panels.pkgclip mode playing with PLAYING chip and clip title "Package clip, 8:12 AM", declared scene package-drop, D23). Normal path only |
| 50 | flow | "Clip is saved on the SD card." | local save during outage | covered @ b-courier caption + home cam rec; panels.pkgclip rec at b-courier, then save banner "Clip on memory card · Wi-Fi down" at b-retry (D22) |
| 51 | flow | "the clip uploads, then the package push is sent (late)" | late push after upload | covered @ b-reconnect then b-late-alert |
| 52 | flow | "Evening: the resident goes to bed." | resident in bedroom | covered @ panels.home.subjects.resident (bedroom until sunrise, then hidden: morning location not given) |
| 53 | number | "Live view, two-way audio, subscription tiers." | out of scope list | out-of-scope: HLD marks them out of scope. The camera screen never uses mode live; it shows STANDBY (mode off) whenever the camera is neither recording, saving nor being played back (D22) |
| 54 | flow | "notify-service ... sends them through Apple/Google push" | push route | covered @ edges notify->push, push->phone |
| 55 | flow | "device-shadow ... The app reads this." | app reads camera status | covered @ panels.app.sources.camstatus (node shadow; map hidden, showSources false); read edge not drawn (see D12) |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | technical level? (default: mixed) | Story. "Keep it about the customer: the porch, the camera, the phone, what happened and when." No service names or APIs on screen. | 10-01-2026 | whole page: plain captions, node/edge labels, legend; services as plain boxes | active |
| A2 | audience? (default: PMs + support leads) | Support leads and product managers. | 10-01-2026 | worksheet A; section text | active |
| A3 | story span and clock style? (default: Fri Oct 2, 11:00 PM → ~9:50 AM) | Starts Thursday evening ≈10:30 PM; raccoon ≈1 AM; low-battery alert before dawn ≈4 AM; sunrise ≈6:50 AM; courier a little after 8 AM. "Pick sensible minutes." (12-hour clock / short date: default kept, no objection) | 10-01-2026 | storyTime start 2026-10-01T22:30 (Thu), end 2026-10-02T08:30; steps 22:30, 01:04, 04:00, 06:50, 08:12 | active |
| A4 | takeaway? | "Explain to a customer why they got a low-battery alert in the night and why the package alert came late when their Wi-Fi was down." | 10-01-2026 | worksheet A; section text/bullets; captions lowbatt, b-late-alert | active |
| A5 | endings? (default: both) | The normal morning, and the morning where the home Wi-Fi is down when the courier comes. | 10-01-2026 | paths normal, wifi-down | active |
| A6 | Wi-Fi outage start? (default: a few minutes before the courier; never "offline") | not answered directly; "Anything technical: use whatever you were given and decide sensibly." → assumed default: Wi-Fi drops 8:08 AM, back 8:22 AM; app never shows offline | 10-01-2026 | steps b-wifi-down, b-reconnect | active |
| A7 | starting situation (new from operator) | Battery at 25%, not charging, everything online, no alerts on the phone. | 10-01-2026 | panels.*.initial | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | "Thursday" = Thu, Oct 1, 2026 (today in this session); 12-hour clock, short date | A3; default not objected | diagram.storyTime |
| D2 | Heartbeats on :00/:30 (10:30 PM, 11:00 … 8:00, 8:30 AM), illustrative | source: every 30 min; 4:00 AM alert lands on the schedule | worksheet D; reportedAt values |
| D3 | Battery tension kept, not hidden: idle 1 %/h and 1% clip from 25% at 10:30 PM imply 20% ≈2:30 AM; operator says ≈4 AM. Both kept; charge is `null` from the raccoon step until the 4:00 AM anchor (20%); no numeric drain for the raccoon clip | skill rule 5 / story-time reference | batt patches raccoon (null), lowbatt (20); section text |
| D4 | chargePerHour 3 (low end of "about 3–4% per hour"); the engine adds charge without subtracting idle drain while charging | source row 16; least-claim | panels.batt.chargePerHour |
| D5 | Unshown scheduled reports update the app battery card (illustrative): 1:00 AM (level not specified), 6:30 AM (18%, physical 17.5), 8:00 AM (21%, physical 20.67) | source: fixed 30-min schedule, nothing stops it before the outage | app patches at raccoon, sunrise, a-courier, b-wifi-down |
| D6 | Story-level backend = five plainly named boxes inside a "Kestrel cloud" group, one per catalog service, so each can carry its own binding and code; no service names in my text | A1 + rule 10; viewer still shows catalog/code chrome (presentation limitation) | nodes ingest, classifier, clips, shadow, notify |
| D7 | Bindings: ingest api postEvent, clips api uploadClip, shadow api putState, notify api sendPush; kestrel-app bound without api (catalog lists none); classifier unbound (not in catalog) | catalog | nodes.*.binding |
| D8 | Edge kinds declared as plain words: "Home Wi-Fi", "Internet", "Inside Kestrel cloud", "Phone alert" | story-level legend rule; source gives HTTPS for cam→ingest but the legend must stay plain | page.protocols |
| D9 | Classifier reply drawn as a `ret` edge | "asks motion-classifier for a label"; code "requests a classification label" | edges classifier->ingest |
| D10 | Raccoon: ingest does not forward to the alert service (no notify edge) | code ingest.event "forwards person/package events to notify-service"; HLD "no push". notify.push's "animal events are skipped" not shown as a run | step raccoon-saved |
| D11 | Phone reaches the cloud directly (not via home Wi-Fi) | source does not put the phone behind the router | edges phone->clips, phone->shadow |
| D12 | App camera cards mean "what the Kestrel app shows for the camera" (the camera status record), patched when a check-in reaches it. The app→status read edge was drafted for a-open, then removed: it crowded the row corridor (validator lint), and the cards show the same values either way | "The app reads this"; layout lint | panels.app; step a-open |
| D18 | Device-app sources declared (camstatus → shadow node, clipstore → clips node) with the source map hidden (`showSources: false`), so the walk can tie card changes to lit edges without putting service names on screen | story level (A1); walk route check | panels.app.sources |
| D19 | Unshown scheduled reports carry an explicit card detail naming their time ("Last report 6:30 AM · regular check-in"); the section text says their minutes are illustrative | walk CHECK guidance | sunrise, a-courier, b-wifi-down; blocks[0].text[1] |
| D20 | Edge labels inside the cloud stack kept short ("low") and clip recognizer moved to the second cloud column | validator lint (label length, row-corridor crowding) | rows, edges |
| D13 | Resident shown in bedroom from bedtime through 4 AM, hidden from sunrise (morning location not given); phone not placed on the map | honesty: no unsourced placement | panels.home subjects |
| D14 | Courier hidden after the drop step; package stays on the porch | source says only "drops a package" | a-open, b-retry |
| D15 | Wi-Fi outage 8:08–8:22 AM (A6 default); router tone `alert` during outage, cleared to `base` on return | source: Wi-Fi down at delivery, back ≈10 min later | steps b-wifi-down … b-reconnect |
| D16 | Single page section, primaryPanel = home map (Data flow below) | business audience; story centered on porch/phone | diagram.primaryPanel |
| D17 | Superseded by D22 (10-01-2026). Original reasoning (no stock scene fit a night raccoon) is kept under History | — | — |
| D21 | Superseded by D22 and D23 (10-01-2026). Original a-open-only clip decision is kept under History | — | — |
| D22 | One persistent camera screen, panel `pkgclip` (id kept to limit churn; title "Porch Cam clips (illustrated)"), visible on every step of both paths, including the first step and direct jumps. Declared scene `package-drop`; initial mode off (STANDBY). Lifecycle: raccoon rec + scene override `raccoon-at-night`; raccoon-saved save "Animal clip saved · no alert"; lowbatt off; a-courier rec + `scene:null` (back to package-drop); a-upload save "Package clip uploaded"; a-alert off; a-open mode playing (D23); b-courier rec + `scene:null`; b-retry save "Clip on memory card · Wi-Fi down"; b-reconnect save "Package clip uploaded"; b-late-alert off. STANDBY whenever nothing is recorded, saved or played: there is no continuous live view | user request (screen present for the whole story; show the raccoon recording); rows 5, 15, 17, 50, 53; home map cam rec/scan/sleep at the same steps | panels.pkgclip; steps raccoon, raccoon-saved, lowbatt, a-courier, a-upload, a-alert, a-open, b-courier, b-retry, b-reconnect, b-late-alert |
| D23 | a-open uses mode playing (recorded-clip playback: PLAYING chip, banner "Package clip, 8:12 AM" as the clip title), not save and not live; the camera itself is asleep at 8:13. This is distinct from `scenePlayback`, which only gates the illustrated action and is left at its default. No playback on wifi-down: the source does not say the resident opens a clip there | row 49 "Resident opens the clip."; screen renderer mode playing | step a-open (panels.pkgclip) |
| D24 | The clips are illustrative animated SVG scenes (stock `raccoon-at-night`, `package-drop`), not real footage; the section text says so and that live view is out of scope. Per-state `scene` override with `null` = declared scene keeps one tile instead of two empty ones | user request; rows 49, 53 | blocks[0].text[3]; panels.pkgclip |
| D25 | Compatibility (review fix SCREEN-01): Playing mode, per-state Screen `scene` and the `raccoon-at-night` clip are Flowview 0.2.0 capabilities. `page.flowview` is set to what stamping now produces: authoredWith/minVersion `0.2.0`; features add `panel.screen`, `media.screen-playing`, `media.screen-scene-override`, `media.scene-raccoon-at-night`. A 0.1.0 viewer reports them missing and asks for an upgrade instead of silently showing STANDBY or the package clip. Raccoon motion (review fix SCREEN-02): body and legs share one nine-second timeline; legs hold neutral for the whole 35–62% sniff stop | engineering review SCREEN-01/02 | page.flowview; screen renderer CSS |

## Storyboard worksheet

### A. Story

**Audience:** Support leads and product managers at Kestrel. They know the product, not the backend.
**Takeaway:** The Kestrel app only knows what the camera last reported. That's why the low-battery alert can come in the middle of the night (it rides a scheduled check-in), and why the package alert comes late when home Wi-Fi is down (the clip waits on the camera until Wi-Fi returns).
**Story (60-second narration):** It's Thursday, 10:30 PM. The resident goes to bed; the Porch Cam is on battery at 25% and not charging, and it checks in with Kestrel every half hour. At 1:04 AM a raccoon crosses the porch: the camera wakes, records about 20 seconds and uploads it. Kestrel recognizes an animal, so the clip goes to the timeline and the phone stays quiet. At 4:00 AM a routine check-in reports 20%, the low-battery line, so the phone gets "Porch Cam battery low" while it's still dark. That's the answer to "why did it wake me up?": the alert fires on the first check-in at or below 20%, whatever the hour. At 6:50 AM the sun comes up and the solar panel starts charging. The app doesn't show it until the 7:00 AM check-in, when it switches to a solar charging icon. Normal morning: at 8:12 AM a courier drops a package, the clip uploads, it's recognized as a package, the phone gets "Package delivered at front door" within seconds, and at 8:13 the resident opens the clip. Wi-Fi-down morning: home Wi-Fi drops at 8:08. At 8:12 the camera records the courier to its memory card but can't send anything. It retries every 2 minutes, and the app still says Online with the 8:00 AM battery reading. At 8:22 Wi-Fi comes back, the camera uploads the clip and checks in, and only then does the package alert arrive, 10 minutes after the drop.

**What would I show?**
1. Most important moment: the 4:00 AM alert (phone notification on the app panel while the home map shows night, resident in bed) and the late 8:22 alert after the blocked Wi-Fi. Both are carried by the app panel plus the home map.
2. Expected but source-backed: the raccoon clip *not* alerting (shown by a quiet phone and an "Animal" timeline entry later); the app saying "Online" during the outage (status card unchanged, battery "Last report 8:00 AM").
3. Must NOT believe: that the camera was offline/broken in the app during the outage; that the resident opened the clip on the Wi-Fi-down morning; that the battery level overnight is precisely known (tension D3); that the resident was anywhere specific in the morning; that the camera screen is a live view or real footage (D22, D24).

### B. Panel plan

| Panel id | Type | Physical or reported | Question it answers for this audience | Best moment (step) | Starting state (source or operator) | Must never show |
|---|---|---|---|---|---|---|
| home | homemap | physical | What is happening at the porch and house right now? | raccoon; b-courier (recording while Wi-Fi is down) | camera asleep, door closed, Wi-Fi up, resident in bedroom (A7, row 52) | resident placed in a morning location; Wi-Fi up during outage |
| batt | battery | physical | How much charge does the camera really have, and is it charging? | lowbatt (20%, LOW), sunrise (charging starts) | 25%, not charging, on cells (A7) | a precise number between 10:30 PM and 4:00 AM (D3) |
| app | deviceapp | reported | What does the resident's Kestrel app show and what alerts arrived? | lowbatt notification; b-retry (still "Online", last report 8:00); b-late-alert | home screen, no alerts; Battery 25% updated 10:30 PM; On battery, not charging; Online (A7) | a value newer than the last delivered/scheduled report; "Offline" (never reached 60 min) |
| pkgclip | screen (declared scene package-drop; override raccoon-at-night) | physical recording + saved-clip playback (illustration) | What is the camera recording, what did it save, and what does the resident see when they play the package clip? | raccoon (REC raccoon); a-open (PLAYING package clip) | visible, mode off = STANDBY (D22) | a live view; a recording camera at 8:13; playback on the wifi-down path; real footage claims (D22–D24) |

Rejected: a second screen tile for the raccoon (one persistent screen with a scene override instead, D24); `phone` (deviceapp already carries notifications); `timeline` (heartbeat cadence is told in captions; would add a busy panel for business readers); `state` for camera status (the app card shows it).

Customer-visible items → panel fields:
- "Battery NN% · updated <time>" → app.battery value + freshness absolute ("Last report 4:00 AM").
- Solar charging icon → app.power icon `solar`, value "Solar charging".
- "Porch Cam battery low" push → app notify at lowbatt.
- "Package delivered at front door" push → app notify at a-alert / b-late-alert.
- Timeline with animal event → app.timeline card at a-open ("8:12 AM Package · 1:04 AM Animal").
- Opening the clip → app phoneScreen `app`, app.clip card "Package clip, 8:12 AM" (label "Now playing"), and the pkgclip screen in mode playing (PLAYING chip, clip title "Package clip, 8:12 AM") over the package-drop scene (D23).
- Online status / last state during outage → app.status "Online" unchanged; battery last report ages.

### C. Paths

| Path id | Label | Shared prefix (step ids) | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| normal | Normal morning | bedtime, raccoon, raccoon-saved, lowbatt, sunrise, charging | a-courier | a-open: resident plays the package clip | exact overnight battery level (D3) |
| wifi-down | Wi-Fi down at delivery | same | b-wifi-down | b-late-alert: package alert arrives 10 min late | whether/when the resident opens the clip (not in source); overnight battery level |

### D. Time table

**Story time:** start `2026-10-01T22:30`; end `2026-10-02T08:30`; clock `12h`; date `short` (A3; minutes illus).
**Battery rates:** batt drainPerHour 1 (source "about 1% per hour"); chargePerHour 3 (source "about 3–4%", low end, D4); clip drain 1 (source).

**Anchors:** 10:30 PM 25% not charging (operator + source); ≈4:00 AM low-battery report 20% (operator time + source value); sunrise ≈6:50 AM (operator); courier "a little after 8 AM" → 8:12; Wi-Fi back ≈10 min after delivery → 8:22.
Tension: rate implies 20% at ≈2:30 AM; operator time kept (D3) → charge `null` between.

**Report schedule:** heartbeats 10:30 PM, 11:00, 11:30, 12:00, 12:30, 1:00, 1:30, 2:00, 2:30, 3:00, 3:30, 4:00, 4:30, 5:00, 5:30, 6:00, 6:30, 7:00, 7:30, 8:00, 8:30 AM (illus cadence). Depicted: 10:30 PM, 4:00 AM, 7:00 AM; on wifi-down also the reconnect heartbeat 8:22 AM. Unshown but shown on card: 1:00 AM, 6:30 AM, 8:00 AM.

| Path | Step | `time` as written | Story time shown | Anchor, source or illus | Battery: trend, extra drain, charge | Last report (time, value) and freshness | Day/night |
|---|---|---|---|---|---|---|---|
| both | bedtime | 2026-10-01T22:30 | Thu 10:30 PM | anchor (A3/A7) | charge 25 (initial), trend draining | 10:30 PM, 25% (delivered) "Last report 10:30 PM" | night |
| both | raccoon | 2026-10-02T01:04 | Fri 1:04 AM | illus (≈1 AM) | charge null (D3) | 1:00 AM, unshown, level not specified (D5) | night |
| both | raccoon-saved | +1m | 1:05 AM | illus | holds null | 1:00 AM (same) | night |
| both | lowbatt | 2026-10-02T04:00 | 4:00 AM | anchor | charge 20 | 4:00 AM, 20% (delivered) | night |
| both | sunrise | 2026-10-02T06:50 | 6:50 AM | anchor (≈6:50) | trend charging, source solar; drift → 17.17 (17%) | 6:30 AM unshown, 18% (physical 17.5) | dawn |
| both | charging | 2026-10-02T07:00 | 7:00 AM | illus (next heartbeat) | charging +3/h → 17.67 (18%) | 7:00 AM, 18% (delivered), charging | day |
| normal | a-courier | 2026-10-02T08:12 | 8:12 AM | illus ("a little after 8") | +3.6 → 21.27, drain 1 → 20.27 (20%) | 8:00 AM unshown, 21% (physical 20.67) | day |
| normal | a-upload | (none) | 8:12 AM | seconds | holds | 8:00 AM | day |
| normal | a-alert | (none) | 8:12 AM | seconds | holds | 8:00 AM | day |
| normal | a-open | 08:13 | 8:13 AM | illus | → 20.32 (20%) | 8:00 AM | day |
| wifi-down | b-wifi-down | 2026-10-02T08:08 | 8:08 AM | illus (D15) | → 21.07 (21%) | 8:00 AM unshown, 21% | day |
| wifi-down | b-courier | 08:12 | 8:12 AM | illus | → 21.27, drain 1 → 20.27 (20%) | 8:00 AM, ages | day |
| wifi-down | b-retry | 08:20 | 8:20 AM | illus (2-min retries) | → 20.67 (21%) | 8:00 AM, ages | day |
| wifi-down | b-reconnect | 08:22 | 8:22 AM | source (≈10 min) | → 20.77 (21%) | 8:22 AM, 21% (delivered) | day |
| wifi-down | b-late-alert | (none) | 8:22 AM | seconds | holds | 8:22 AM | day |

### E. Step x panel matrix

```
### bedtime   paths: normal, wifi-down   time: Thu 10:30 PM
Beat: The resident goes to bed; the camera's 10:30 check-in reports 25%, not charging.
Hops claimed: check-in: cam→router→ingest→shadow
Edges: cam->router, router->ingest, ingest->shadow
Missing hops check: none
Report?: report at 10:30 PM delivered: battery 25, power, status
Focus: home
home: patch: signals cam→router (resident already in bedroom per A7/initial)
batt: holds: initial 25%, draining
app: patch: battery {25, ready, reportedAt now}
pkgclip: holds: initial mode off → STANDBY (camera asleep; no live view, D22)
State cleared: no state change
Icons: none: nothing changed
Tones: none
Code/binding: ingest.heartbeat; ingest, shadow bound
Evidence: rows 1, 3, 26, 52; A7
```
```
### raccoon   paths: normal, wifi-down   time: Fri 1:04 AM
Beat: A raccoon crosses the porch; the camera wakes and records about 20 s.
Hops claimed: none (local recording)
Edges: none (nodes: cam)
Missing hops check: none
Report?: unshown scheduled report at 1:00 AM, illus: battery level not specified (D3/D5)
Focus: home + pkgclip
home: patch: raccoon visible on porch; cam rec
batt: patch: charge null, note "Level not specified 10:30 PM–4:00 AM"
app: patch: battery {value null, reportedAt 01:00, detail "Last report 1:00 AM · level not specified"}
pkgclip: patch: mode rec, scene raccoon-at-night (illustrated raccoon crosses and sniffs the porch; REC chip, D22)
State cleared: cam sleep → rec; pkgclip STANDBY → REC
Icons: none
Tones: none
Code/binding: none
Evidence: rows 5, 22, 30; D3, D5
```
```
### raccoon-saved   paths: normal, wifi-down   time: 1:05 AM
Beat: The clip uploads; Kestrel recognizes an animal; saved to the timeline, no alert.
Hops claimed: event cam→router→ingest; clip cam→router→clips; label ingest→classifier→ingest
Edges: cam->router, router->ingest, router->clips, ingest->classifier, classifier->ingest
Missing hops check: none (no notify: D10)
Report?: no report
Focus: app (stays quiet) / Data flow
home: patch: raccoon hidden; cam scan (awake, sending); signals cam→router
batt: holds: charge unspecified (null) until 4:00 anchor
app: holds: no notification for animal; home screen
pkgclip: patch: mode save, banner "Animal clip saved · no alert" (same raccoon clip continues)
State cleared: cam rec → scan (recording ended); pkgclip REC → save
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload
Evidence: rows 5–7, 9, 15; D10
```
```
### lowbatt   paths: normal, wifi-down   time: 4:00 AM
Beat: The 4:00 check-in reports 20% → marked low battery → "Porch Cam battery low" alert.
Hops claimed: check-in cam→router→ingest→shadow; alert shadow→notify→push→phone
Edges: cam->router, router->ingest, ingest->shadow, shadow->notify, notify->push, push->phone
Missing hops check: none
Report?: report at 4:00 AM delivered: battery 20
Focus: app
home: patch: cam sleep; signals cam→router
batt: patch: charge 20 (anchor), note null
app: patch: battery {20, ready, reportedAt now, detail null, icon battery-low}; notify "Porch Cam battery low"
pkgclip: patch: mode off → STANDBY (camera asleep)
State cleared: battery normal → low (app icon battery-low; batt zone LOW computed)
Icons: app.battery → battery-low
Tones: none
Code/binding: ingest.heartbeat, shadow.lowbattery, notify.push
Evidence: rows 10, 11, 23, 27; A3
```
```
### sunrise   paths: normal, wifi-down   time: 6:50 AM
Beat: Sunrise: the solar panel starts charging; the app doesn't know yet.
Hops claimed: none
Edges: none (nodes: cam)
Missing hops check: none
Report?: unshown scheduled report at 6:30 AM, illus: battery 18 (not charging)
Focus: batt
home: patch: resident hidden (morning location not given)
batt: patch: trend charging, source solar, note "Solar: about 3–4% an hour"
app: patch: battery {18, reportedAt 06:30}
pkgclip: holds: STANDBY
State cleared: batt draining → charging; app power still "On battery, not charging" (true as last reported)
Icons: none in app (batt icon computed)
Tones: none
Code/binding: none
Evidence: rows 13, 16; D5, D13
```
```
### charging   paths: normal, wifi-down   time: 7:00 AM
Beat: The 7:00 check-in reports charging; the app shows the solar charging icon.
Hops claimed: cam→router→ingest→shadow
Edges: cam->router, router->ingest, ingest->shadow
Missing hops check: none
Report?: report at 7:00 AM delivered: battery 18, power Solar charging
Focus: app
home: patch: signals cam→router
batt: holds: drift only (charging)
app: patch: battery {18, reportedAt now}; power {"Solar charging", icon solar}
pkgclip: holds: STANDBY
State cleared: power "On battery, not charging" → "Solar charging"; battery icon stays battery-low (G)
Icons: app.power → solar
Tones: none
Code/binding: ingest.heartbeat
Evidence: rows 13, 16
```
```
### a-courier   paths: normal   time: 8:12 AM
Beat: A courier drops a package; the camera records.
Hops claimed: none
Edges: none (nodes: cam)
Missing hops check: none
Report?: unshown scheduled report at 8:00 AM, illus: battery 21
Focus: home
home: patch: courier + package on porch; cam rec
batt: patch: drain 1 (clip)
app: patch: battery {21, reportedAt 08:00}
pkgclip: patch: mode rec, scene null → declared package-drop (courier delivers; REC chip)
State cleared: cam sleep → rec; pkgclip STANDBY → REC, raccoon clip → package clip
Icons: none
Tones: none
Code/binding: none
Evidence: rows 5, 15; D5
```
```
### a-upload   paths: normal   time: 8:12 AM
Beat: Clip uploads; recognized as a package.
Hops claimed: event cam→router→ingest; clip cam→router→clips; label ingest→classifier→ingest
Edges: cam->router, router->ingest, router->clips, ingest->classifier, classifier->ingest
Missing hops check: none
Report?: no report
Focus: Data flow / home signals
home: patch: cam scan; signals cam→router
batt: holds: same minute
app: holds: alert not yet sent
pkgclip: patch: mode save, banner "Package clip uploaded"
State cleared: cam rec → scan; pkgclip REC → save
Icons: none
Tones: none
Code/binding: ingest.event, clips.upload
Evidence: rows 5–7
```
```
### a-alert   paths: normal   time: 8:12 AM
Beat: "Package delivered at front door" arrives right away.
Hops claimed: ingest→notify→push→phone
Edges: ingest->notify, notify->push, push->phone
Missing hops check: none
Report?: no report
Focus: app
home: patch: cam sleep
batt: holds: same minute
app: patch: notify "Package delivered at front door"
pkgclip: patch: mode off → STANDBY (camera asleep)
State cleared: cam back asleep; pkgclip save → STANDBY
Icons: none
Tones: none
Code/binding: ingest.event, notify.push
Evidence: rows 8, 54
```
```
### a-open   paths: normal   time: 8:13 AM
Beat: The resident opens the package clip in the Kestrel app.
Hops claimed: clip read phone→clips→phone (caption says the camera page "still shows" its values: no new read claimed)
Edges: phone->clips, clips->phone
Missing hops check: none (status read edge removed, D12)
Report?: no report (read returns the 8:00 AM record already shown)
Focus: pkgclip (the clip being played) + app
home: patch: courier hidden (D14)
batt: holds: drift only
app: patch: phoneScreen app; clip {visible, "Package clip, 8:12 AM"}; timeline {visible, "8:12 AM Package · 1:04 AM Animal"}
pkgclip: patch: mode playing, banner "Package clip, 8:12 AM" (PLAYING chip + clip title; declared package-drop scene replays from the start after STANDBY; scenePlayback left at its default, D23)
State cleared: pkgclip STANDBY → PLAYING (recorded-clip playback, not a live camera)
Icons: none
Tones: none
Code/binding: app.devicepage
Evidence: rows 9, 49, 55
```
```
### b-wifi-down   paths: wifi-down   time: 8:08 AM
Beat: Home Wi-Fi goes down.
Hops claimed: none
Edges: none (nodes: router)
Missing hops check: none
Report?: unshown scheduled report at 8:00 AM, illus: battery 21 (delivered before the outage)
Focus: home
home: patch: router {alert, icon wifi-off}
batt: holds: drift only
app: patch: battery {21, reportedAt 08:00}
pkgclip: holds: STANDBY
State cleared: Wi-Fi up → down (router state/icon, router tone)
Icons: home.router → wifi-off
Tones: router alert
Code/binding: none
Evidence: rows 17; A6, D15
```
```
### b-courier   paths: wifi-down   time: 8:12 AM
Beat: Courier drops the package; camera records to its memory card; can't reach Wi-Fi.
Hops claimed: none sent (blocked at cam→router)
Edges: failures cam->router blocked
Missing hops check: none
Report?: no report
Focus: home
home: patch: courier + package on porch; cam rec
batt: patch: drain 1 (clip)
app: holds: last report 8:00 AM, still Online, no alert
pkgclip: patch: mode rec, scene null → declared package-drop (recording to the memory card; REC chip)
State cleared: cam sleep → rec; router still alert (true); pkgclip STANDBY → REC, raccoon clip → package clip
Icons: none
Tones: none (router alert carries)
Code/binding: none
Evidence: rows 17, 50
```
```
### b-retry   paths: wifi-down   time: 8:20 AM
Beat: Still no Wi-Fi; camera retries every 2 min; app still looks normal.
Hops claimed: retry blocked at cam→router
Edges: failures cam->router blocked
Missing hops check: none
Report?: no report (8:30 heartbeat not due yet)
Focus: app
home: patch: cam scan (awake, retrying); courier hidden (D14)
batt: holds: drift only
app: holds: Online, Battery 21% Last report 8:00 AM (status ready: not overdue)
pkgclip: patch: mode save, banner "Clip on memory card · Wi-Fi down" (row 50)
State cleared: cam rec → scan; pkgclip REC → save
Icons: none
Tones: none (router alert carries)
Code/binding: none (offline rule not reached: 60 min)
Evidence: rows 17, 19, 20, 24, 25
```
```
### b-reconnect   paths: wifi-down   time: 8:22 AM
Beat: Wi-Fi is back; the camera uploads the saved clip and checks in; package recognized.
Hops claimed: event cam→router→ingest; clip cam→router→clips; label ingest→classifier→ingest; check-in ingest→shadow
Edges: cam->router, router->ingest, router->clips, ingest->classifier, classifier->ingest, ingest->shadow
Missing hops check: none
Report?: report at 8:22 AM delivered: battery 21
Focus: home + Data flow
home: patch: router {idle, icon null}; signals cam→router
batt: holds: drift only
app: patch: battery {21, reportedAt now}
pkgclip: patch: banner "Package clip uploaded" (mode save carries)
State cleared: Wi-Fi down → up (router state, icon, tone)
Icons: home.router → null (default router)
Tones: router base
Code/binding: ingest.event, ingest.heartbeat, clips.upload
Evidence: rows 18, 28
```
```
### b-late-alert   paths: wifi-down   time: 8:22 AM
Beat: Only now does "Package delivered at front door" arrive, 10 min after the drop.
Hops claimed: ingest→notify→push→phone
Edges: ingest->notify, notify->push, push->phone
Missing hops check: none
Report?: no report
Focus: app
home: patch: cam sleep
batt: holds: same minute
app: patch: notify "Package delivered at front door"
pkgclip: patch: mode off → STANDBY (camera asleep; no playback on this path, D23)
State cleared: pkgclip save → STANDBY
Icons: none
Tones: none
Code/binding: ingest.event, notify.push
Evidence: rows 8, 51
```

### F. Coverage grid

| Path: normal | bedtime | raccoon | raccoon-saved | lowbatt | sunrise | charging | a-courier | a-upload | a-alert | a-open |
|---|---|---|---|---|---|---|---|---|---|---|
| home | P | P | P | P | P | P | P | P | P | P |
| batt | H | P | H | P | P | H | P | H | H | H |
| app | P | P | H | P | P | P | P | H | P | P |
| pkgclip | H | P | P | P | H | H | P | P | P | P |

| Path: wifi-down | bedtime | raccoon | raccoon-saved | lowbatt | sunrise | charging | b-wifi-down | b-courier | b-retry | b-reconnect | b-late-alert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| home | P | P | P | P | P | P | P | P | P | P | P |
| batt | H | P | H | P | P | H | H | P | H | H | H |
| app | P | P | H | P | P | P | P | H | H | P | P |
| pkgclip | H | P | P | P | H | H | H | P | P | P | P |

Boring panel check: batt holds on many steps but drifts with story time on each (visible charge change); it carries the two physical beats (4 AM low, sunrise charging) and the clip costs. Kept. pkgclip is visible on every step of both paths (H = STANDBY or the previous save carried); it changes at each recording, save, sleep and the a-open playback, and never plays back on wifi-down (D22, D23). Kept.
Busy step check: lowbatt, sunrise, charging patch all three; captions name the focus (the phone alert / the battery panel / the app icon).

### G. Icon state plan

| Panel.element | Default icon | State that appears | Set at step (icon) | State clears at step | Restore |
|---|---|---|---|---|---|
| app.battery | battery | low_battery (≤20%) | lowbatt (battery-low) | only above 30% — never on either path | not restored on either path: state persists to the end |
| app.power | battery | solar charging reported | charging (solar) | charging never stops in story | not restored: persists |
| home.router | router | Wi-Fi down | b-wifi-down (wifi-off) | b-reconnect | `icon: null` |
| batt (computed) | — | low zone / charging bolt | computed by engine | — | — |

Precedence: battery card keeps battery-low while charging (low state persists until >30%); charging shows on the power card (solar icon) and on the battery panel's bolt.

### H. Bindings and code

| Node id | Catalog entityRef | API entityRef + operation | codeRefs | Steps where that code runs | Gap |
|---|---|---|---|---|---|
| cam | — | — | — | — | not a catalog service (device) |
| router | — | — | — | — | not a catalog service (home equipment) |
| ingest | component:default/event-ingest | api:default/event-ingest · postEvent POST /events | ingest.heartbeat (src/routes/heartbeat.ts 18-44); ingest.event (src/routes/events.ts 22-81) | heartbeat: bedtime, lowbatt, charging, b-reconnect; event: raccoon-saved, a-upload, a-alert, b-reconnect, b-late-alert | postHeartbeat also exists; one api per binding |
| classifier | — | — | — | — | unbound: not in supplied catalog; code: not located |
| clips | component:default/clip-store | api:default/clip-store · uploadClip PUT /clips/{clipId} | clips.upload (src/upload.rs 15-62) | raccoon-saved, a-upload, b-reconnect | getClip used at a-open (read; upload code not attached there) |
| shadow | component:default/device-shadow | api:default/device-shadow · putState PUT /devices/{deviceId}/state | shadow.lowbattery (src/rules/lowBattery.go 9-37); shadow.offline (src/rules/offline.go 11-29) | lowbattery: lowbatt; offline: none (never runs, outage < 60 min) | — |
| notify | component:default/notify-service | api:default/notify-service · sendPush POST /notifications | notify.push (lib/push/send.py 40-88) | lowbatt, a-alert, b-late-alert | — |
| push | — | — | — | — | not a catalog service (Apple/Google third party) |
| phone | component:default/kestrel-app | none listed in catalog | app.devicepage (app/screens/DevicePage.tsx 12-140) | a-open | — |

### I. Checkable expectations

1. `*/bedtime: batt.charge = 25` and `app.battery.value = 25` (anchor A7).
2. `*/lowbatt: batt.charge = 20` and `app.battery.value = 20`, app.battery icon battery-low, one "Porch Cam battery low" notification (anchor).
3. Raccoon steps add no notification; the phone's stack stays empty until 4:00 AM.
4. On wifi-down, app.status stays "Online" and app.battery's report time stays 8:00 AM through b-retry; no package notification before b-late-alert (8:22 AM).
5. app.battery icon is battery-low at the end of both paths (never above 30%).
6. Clock reads 8:13 AM at a-open and 8:22 AM at b-late-alert; time never goes backward.
7. `*/raccoon: pkgclip.mode = rec` with `pkgclip.scene = raccoon-at-night`; `normal/a-courier` and `wifi-down/b-courier: pkgclip.mode = rec` with `pkgclip.scene = null` (declared package-drop); `normal/a-open: pkgclip.mode = playing` with banner "Package clip, 8:12 AM"; no step on wifi-down has mode playing; `*/bedtime`, `*/lowbatt`, `normal/a-alert`, `wifi-down/b-late-alert: pkgclip.mode = off` (STANDBY). The screen is visible on every step of both paths.

## Update 10-01-2026: persistent camera screen (D22–D24)

Request: keep the camera screen present for the whole story, show the camera recording the raccoon, and use a real Playing mode for the resident's package playback. Changes are limited to panel `pkgclip` and its step patches, one added section text line (illustrative clips, no live view), and the stamped `page.flowview` metadata (D25). Steps, paths, times, nodes, edges, bindings, codeRefs, captions, battery/report values and notifications are unchanged. The renderer gained mode playing (PLAYING chip) and the stock scene raccoon-at-night (an illustrative animated SVG clip: a masked, ring-tailed raccoon crossing and sniffing the night porch), plus a per-state `scene` override where `null` uses the declared scene.

Screen per step (mode · scene):
- both: bedtime off · lowbatt off · sunrise/charging STANDBY held; raccoon rec · raccoon-at-night; raccoon-saved save "Animal clip saved · no alert".
- normal: a-courier rec · package-drop (scene null); a-upload save "Package clip uploaded"; a-alert off; a-open mode playing "Package clip, 8:12 AM".
- wifi-down: b-wifi-down STANDBY held; b-courier rec · package-drop (scene null); b-retry save "Clip on memory card · Wi-Fi down"; b-reconnect save "Package clip uploaded"; b-late-alert off. No playback on this path.

Verification: none run by the author of this update (file tools only, no shell or browser). Proposed checks, run by the coordinator: `node --test tests/kestrel-screen.test.js tests/screen-scenes.test.js tests/security-video.test.js`, then the browser smoke `tools/browser-tests/tests/screen-raccoon.spec.mjs`. The bundled-kit `validate`/`walk` commands from the earlier audit were not re-run against this version. Visual checks still open: how the raccoon reads at small tile sizes and whether the persistent tile crowds the home map and phone.

### Correction 10-01-2026: engineering review fixes (D25)

- SCREEN-01: the first version of this update stamped only `panel.screen` at 0.1.0, so an older viewer gave no upgrade signal. Corrected: Flowview runtime 0.2.0 registers and detects the three new Screen capabilities, and this spec's `page.flowview` now declares them with minVersion 0.2.0.
- SCREEN-02: in the first version the raccoon's legs kept stepping during the sniff stop. Corrected: the legs follow the same nine-second timeline as the body and hold neutral from 35% to 62%.
- Story values, lifecycle, captions and the rest of the metadata are unchanged.
- Verification: the author ran nothing. Proposed checks: `node --test tests/compatibility.test.js tests/screen-scenes.test.js tests/kestrel-screen.test.js tests/security-video.test.js` and the extended browser smoke `tools/browser-tests/tests/screen-raccoon.spec.mjs`. The coordinator records the results.
- Evidence note: the external `source-hashes.json` holds hashes of the ORIGINAL frozen source files. It is provenance, not a hash of these edited copies. The coordinator issues a separate, labeled receipt for the final files.

## History (superseded)

The notes below describe earlier versions of this spec. They are kept as a record and are superseded by D22–D24 and the update above.

- Original D17: No camera `screen` for the camera's own recording: no stock scene fit a night raccoon; recording was shown on the home map. Later revised to use a screen only for the package-clip playback at a-open (original D21).
- Original D21: panel `pkgclip` (title "Package clip, played in the app", stock scene `package-drop`) started hidden and was revealed only at a-open by `panelVisibility`; it used mode `save` with banner "Package clip, 8:12 AM" and `scenePlayback: playing`, because the screen recipe then had no recorded-media mode. It was not shown on wifi-down.

### Self-audit (10-01-2026, before D22)

Commands: `validate candidate.spec.json` → 0 errors, 0 warnings; `stamp`; `validate stamped.spec.json` → 0 errors, 0 warnings; `walk stamped.spec.json --catalog input/catalog.json --state --rate batt=-1:4 --rate app.battery=-1:4` with 8 `--expect` checks → 0 WARN, 4 CHECK, 1 NOTE, all expectations ok.

- Expectations passed: bedtime batt 25 / app 25; lowbatt batt 20 / app 20 / icon battery-low (both paths); b-retry app.status Online; app.battery icon battery-low at a-open and b-late-alert.
- Remaining CHECKs (correct, labeled): raccoon (1:00 AM scheduled report, level not specified, D3/D5), sunrise (6:30 AM, 18%), a-courier and b-wifi-down (8:00 AM, 21%). These are unshown regular check-ins; each card detail names the time and the section text says the minutes are illustrative (D19). Earlier CHECKs on lowbatt/charging ("no route declared") fixed by declaring app sources (D18).
- NOTE shadow.offline on node only: correct, the outage (8:08–8:22) never reaches the 60-minute offline rule (section H).
- Walk values vs worksheet D: sunrise 17.17, charging 17.67, a-courier 20.27, b-wifi-down 21.07, b-retry 20.67, b-reconnect 20.77, all matching. Reported cards: 18 at 6:30 (physical 17.5), 21 at 8:00 (20.67), 21 at 8:22 (20.77). Rates are -1/h and +3/h, within the source's stated rates.
- Transition check: Wi-Fi down → router alert + wifi-off + tone alert; restored at b-reconnect (state idle, icon null, tone base). Camera rec → scan → sleep after each clip. Resident hidden from sunrise. Courier hidden after the drop step. Power card switches only at the 7:00 report. No "Offline" anywhere.
- Fixes during audit: validator lints (long in-stack labels, 5 edges crossing the row corridor). Fixed in the spec by re-stacking the cloud columns, shortening a label and removing the app→status read edges (D12, D20); the worksheet a-open block was updated to match.
- Reverse audit: every edge kind is a declared plain-word protocol (D8); the only `ret` edges are the classifier label (D9) and the clip video on a read; tones only on router during the outage; notifications use the source's exact texts; bindings and codeRefs are copied verbatim from the catalog and code evidence (ids unchanged, full SHAs).
- Not done: the browser walk-through (no browser in this environment; the coordinator renders). Visual checks still open: label clipping, home-map subject placement inside the camera cone, the phone's home screen to app transition at a-open, and how the "—" battery card reads overnight.

### Update 10-01-2026: package clip visible at a-open (original D21, superseded)

Request: at a-open, repair the presentation so the resident can actually see the package clip, using only source-supported visuals. Change: added hidden `screen` panel `pkgclip` (stock scene `package-drop`) and, at a-open only, `panelVisibility.pkgclip: true` plus patch `{mode: save, banner: "Package clip, 8:12 AM", scenePlayback: playing}`. Story text, steps, paths, times, nodes, edges, bindings, codeRefs and all other panel values unchanged. Section `page.flowview` features not hand-edited (stamped on save).

Commands (bundled kit, candidate.spec.json): `validate` → 0 errors, 0 warnings; `walk --state --rate batt=-1:4 --rate app.battery=-1:4` with `--expect` `*/bedtime:batt.charge=25`, `*/lowbatt:batt.charge=20`, `*/lowbatt:app.battery.value=20`, `normal/a-open:pkgclip.mode=save` → 0 WARN, 5 CHECK, 1 NOTE, all expectations ok. Not stamped (no stamp tool in this connected workflow).

- Battery and app values match worksheet D exactly (sunrise 17.17, charging 17.67, a-courier 20.27, a-open 20.32, b-wifi-down 21.07, b-retry 20.67, b-reconnect 20.77).
- CHECKs: the same four unshown scheduled check-ins as before (D19), plus "pkgclip never changes on wifi-down". That one is correct: the panel stays hidden on that path because the source does not say the resident opened the clip there.
- Evidence limit: input/hld.md was not present in the connected folder; row 49 and the courier/package beat were taken from this ledger's recorded anchors.
- Visual checks still open: whether the added clip tile fits beside the home map and phone without crowding, and how the `save` banner reads over the delivery scene.

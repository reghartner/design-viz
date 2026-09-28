# Coverage ledger — kestrel-overnight
source: input/hld.md "HLD: Kestrel Porch Cam — overnight on battery" (local file; status "reviewed design, Kestrel Home platform team") + input/catalog.json (approved fictional Backstage snapshot, version 1) + input/code-evidence.md (approved reviewed code locations) | version: n/a (local, unversioned) | updated: 09-28-2026 13:57

Editor session: base revision `6806e219-144e-44c1-b273-ba6baa240b2c-1` (placeholder "New story"), request `93ae651a-a53f-4e0d-85c5-5f2a242e1e5d`. Deliverable: the accepted editor story (`story.spec.json`); no OUT build. Spec locations below use `D` = `blocks[0].diagram` (block id `kestrel-overnight`). Local sources have no HTTP(S) URL, so `page.generatedFrom` is omitted and the source is named in the section text.

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Every 30 minutes the camera sends a heartbeat to event-ingest" | heartbeat cam → router → event-ingest → device-shadow | covered @ D.steps bed, lowbatt, chargerpt, b-reconnect (edges cam->router, router->ingest, ingest->shadow) |
| 2 | flow | "On PIR motion the camera wakes, records a clip (about 20 s), and uploads it" | POST /events, clip to clip-store, classifier label, person/package → notify → push | covered @ D.steps raccoon, courier, b-reconnect, b-latepush |
| 3 | flow | "When a heartbeat reports battery at or below 20%" | shadow marks low_battery; one push | covered @ D.steps lowbatt (shadow->notify, notify->push, push->app; record.lowbatt) |
| 4 | flow | "the camera reports charging=yes on its next heartbeat" | charging reported on next heartbeat; app shows solar charging icon | covered @ D.steps sunrise (physical only), chargerpt (phone.power icon solar) |
| 5 | failure | "it keeps recording to its local SD card and retries every 2 minutes" | SD queue + 2-min retry + upload queued clips and heartbeat on reconnect | covered @ D.steps b-courier (failures cam->router blocked; sd enqueue), b-retry (sd held), b-reconnect (sd dequeue, heartbeat) |
| 6 | failure | "device-shadow marks the camera offline when two heartbeats in a row are missed (60 minutes)" | offline rule not reached by a ~10 min outage | covered @ D.steps b-retry text; record.online stays "yes"; phone.online stays Online |
| 7 | contract | "battery %, charging yes/no, firmware" | heartbeat payload (human labels) | covered @ D.panels record rows battery/charging; firmware out-of-scope: no firmware change in the story |
| 8 | service | "Porch Cam (device)" | battery doorbell cam, PIR, Wi-Fi, SD | covered @ D.nodes.cam (not a catalog service) |
| 9 | service | "Home router" | not a Kestrel service | covered @ D.nodes.router (unbound: not a catalog service) |
| 10 | service | "event-ingest" | receives events + heartbeats over HTTPS | covered @ D.nodes.ingest.binding |
| 11 | service | "motion-classifier" | labels clips; ML team | covered @ D.nodes.classifier — out-of-scope for binding: unbound, not in supplied catalog; code not located |
| 12 | service | "clip-store" | stores clips | covered @ D.nodes.clips.binding |
| 13 | service | "device-shadow" | last reported state | covered @ D.nodes.shadow.binding; D.panels record |
| 14 | service | "notify-service" | sends pushes via Apple/Google push | covered @ D.nodes.notify.binding |
| 15 | service | "Kestrel app (phone)" | notifications + device page | covered @ D.nodes.app.binding; D.panels phone |
| 16 | service | "Apple/Google push" | platform push relay | covered @ D.nodes.push (unbound: vendor, not a catalog service); protocol `push` |
| 17 | number | "Every 30 minutes" | heartbeat interval | covered @ record hb row times (22:30, 1:00, 4:00, 6:30, 7:00, 8:00, 8:15) |
| 18 | number | "about 20 s" | clip length | covered @ D.steps raccoon text |
| 19 | number | "at or below 20%" | low threshold | covered @ D.steps lowbatt; D.panels batt.low=20 |
| 20 | number | "not sent again until battery goes above 30%" | re-arm 30% | covered @ D.steps lowbatt, chargerpt text; record lowbatt row |
| 21 | number | "Idle drain is about 1% per hour" | 1 %/h | covered @ D.panels batt.drainPerHour=1 (suspended 10:30 PM–4:00 AM by the anchor tension, see D5) |
| 22 | number | "Each recorded clip uses about 1%" | 1 % per clip | covered @ raccoon charge 24 (25 − 1); courier/b-courier `drain: 1` |
| 23 | number | "Solar in morning light adds about 3–4% per hour" | 3–4 %/h | covered @ D.panels batt.chargePerHour=3.5 (illustrative midpoint) |
| 24 | number | "retries every 2 minutes" | retry interval | covered @ D.steps b-courier, b-retry (8:07, 8:09 illustrative) |
| 25 | number | "(60 minutes)" | offline threshold | covered @ D.steps b-retry text |
| 26 | number | "Battery is 25%, not charging" | start anchor | covered @ D.panels batt.initial.charge=25; bed step heartbeat |
| 27 | number | "a heartbeat reports 20% → low-battery push" | 20% anchor at 4:00 AM (A3) | covered @ D.steps lowbatt batt.charge=20, phone.battery=20 |
| 28 | number | "Wi-Fi returns about 10 minutes later" | outage ~10 min | covered @ D.steps b-reconnect 8:15 AM |
| 29 | contract | "POST /events" | catalog postEvent | covered @ D.nodes.ingest.binding.api; edge router->ingest label |
| 30 | contract | catalog postHeartbeat POST /heartbeats | heartbeat API | covered @ edge router->ingest label (HLD gives no path; catalog's only heartbeat op) |
| 31 | contract | catalog uploadClip PUT /clips/{clipId} | clip upload | covered @ D.nodes.clips.binding.api; edge router->clips |
| 32 | contract | catalog sendPush POST /notifications | push send | covered @ D.nodes.notify.binding.api (see D8) |
| 33 | contract | "Package delivered at front door" | push title | covered @ D.steps courier, b-latepush phone.notify |
| 34 | contract | "Porch Cam battery low" | push title | covered @ D.steps lowbatt phone.notify |
| 35 | flow | "`animal` events are saved to the timeline with no push" | raccoon no push | covered @ D.steps raccoon (no ingest->notify edge) |
| 36 | flow | "Resident opens the clip." | happy ending | covered @ D.steps openclip (no read edge drawn: route not in HLD, gap G3) |
| 37 | flow | "the clip uploads, then the package push is sent (late)" | late push | covered @ D.steps b-reconnect → b-latepush |
| 38 | permalink | ingest.heartbeat heartbeat.ts @232a7fae…L18-44 | code | covered @ D.nodes.ingest.codeRefs; steps bed, lowbatt, chargerpt, b-reconnect |
| 39 | permalink | ingest.event events.ts @232a7fae…L22-81 | code | covered @ D.nodes.ingest.codeRefs; steps raccoon, courier, b-reconnect, b-latepush |
| 40 | permalink | shadow.lowbattery lowBattery.go @e69b820b…L9-37 | code | covered @ D.nodes.shadow.codeRefs; step lowbatt |
| 41 | permalink | shadow.offline offline.go @e69b820b…L11-29 | code | covered @ D.nodes.shadow.codeRefs only (rule never fires: outage < 60 min) |
| 42 | permalink | notify.push send.py @2fb55bed…L40-88 | code | covered @ D.nodes.notify.codeRefs; steps lowbatt, courier, b-latepush |
| 43 | permalink | clips.upload upload.rs @fc642217…L15-62 | code | covered @ D.nodes.clips.codeRefs; steps raccoon, courier, b-reconnect |
| 44 | permalink | app.devicepage DevicePage.tsx @35715c5b…L12-140 | code | covered @ D.nodes.app.codeRefs; step openclip |
| 45 | permalink | catalog URLs (5 components, 4 API definitions) | Backstage links | covered @ D.nodes.{ingest,clips,shadow,notify,app}.binding |
| 46 | failure | "Live view, two-way audio, subscription tiers." | HLD out of scope | out-of-scope: HLD "Out of scope" section |
| 47 | contract | "device page (battery, power source, last seen, last event)" | device page cards | covered @ D.panels phone fields battery, power, online (last seen = "Last report <time>"); last event out-of-scope: HLD does not say where the page reads it (G4) |
| 48 | number | illustrative times | 7:00 AM charging heartbeat, 8:07 open, 8:07/8:09 retries, 8:15 reconnect, scheduled heartbeat values 1:00/6:30/8:00 | covered @ section text (illustrative line) |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | Technical level? | Engineering: every service hop, API operations, code references | 09-28-2026 | whole page (captions name services, APIs; bindings; codeRefs) | active |
| A2 | Audience and takeaway? | Camera-platform and device-state engineers: which service does what at each moment, how the app's view lags the device's real battery, how the Wi-Fi outage delays the package push | 09-28-2026 | worksheet A; panels batt vs record/phone; path wifi-down | active |
| A3 | Story span and beat times? | Starts Thu Sep 24 10:30 PM; raccoon ~1:10 AM; low-battery heartbeat ~4:00 AM; sunrise 6:50 AM; courier 8:05 AM; illustrative minutes elsewhere | 09-28-2026 | D.storyTime (2026-09-24T22:30 → 2026-09-25T08:30, 12h, short); step times | active |
| A4 | Endings? | Happy path + Wi-Fi-down alternate at the delivery | 09-28-2026 | D.paths happy, wifi-down | active |
| A5 | Starting situation? | 25%, not charging, online, Wi-Fi good, no notifications | 09-28-2026 | D.panels batt/record/phone initial | active |
| A6 | Catalog/code? | Only catalog.json and code-evidence.md | 09-28-2026 | node bindings and codeRefs | active |
| A7 | Other | Standalone HTML fine; no mobile checks | 09-28-2026 | n/a: the request for this session says the accepted editor story is the deliverable, so no standalone build was made | active |

Question batch (sent 09-28-2026, previous turn): Q1 level (default Mixed), Q2 audience/takeaway, Q3 timing, Q4 endings, Q5 starting situation, Q6 must-see moments + porch camera view, Q7 path endings. Q6/Q7 got no explicit answer; the operator's "Outcomes" line and the HLD settle the endings (happy ends at resident opens clip; alternate at late push). The porch camera view was dropped (D2).

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | Panels: batt (physical), record = device-shadow table (reported), sd = SD upload queue (physical), phone = deviceapp (reported) | A2 takeaway: real vs reported battery; outage delay | D.panels |
| D2 | No camera `screen` panel | no stock scene for a raccoon; engineering audience; `package-drop` alone would misstate the night | — |
| D3 | Phone stays on the home screen overnight; enters the app only at openclip | HLD names no other app use; no invented user actions | D.panels phone |
| D4 | App cards show the device-shadow record ("Between heartbeats the app shows the last reported value"); fields `freshness: absolute` → "Last report <time>" like the HLD's "updated <time>" | HLD behavior 1; HLD does not say when the app fetches (G2) | D.panels phone |
| D5 | Anchor tension: at 1 %/h, 25% at 10:30 PM − 1 clip reaches 20% at ~2:30 AM, not 4:00 AM. Kept both anchors: batt held (24% after the 1:10 AM clip), anchored 20% at 4:00 AM; stated rate resumes after | skill rule 5; operator anchor A3 + HLD "reports 20%" | D.steps raccoon, lowbatt; section text |
| D6 | Scheduled heartbeats shown between lit steps (1:00 AM 25%, 6:30 AM 18%, 8:00 AM 21%), illustrative, rounded from the batt panel | skill rule 9(b): fixed 30-min schedule, nothing stops it | D.steps raccoon, sunrise, courier, b-courier |
| D7 | Wi-Fi dropped after the 8:00 AM heartbeat was delivered (illustrative); no heartbeat missed before 8:15 reconnect | HLD gives no drop time; outage "at the delivery", ~10 min | D.steps b-courier |
| D8 | API on bindings: postEvent (HLD names POST /events); uploadClip, putState, sendPush are each the catalog's only matching write operation for that call; heartbeat path POST /heartbeats from catalog. HLD names none of these four explicitly — engineer to confirm | catalog snapshot | D.nodes.*.binding.api; edge labels |
| D9 | Solar net charge 3.5 %/h (HLD 3–4 %/h, net vs gross of idle drain unstated) | illustrative midpoint | D.panels batt.chargePerHour |
| D10 | Battery icon precedence: phone battery card keeps `battery-low` from 4:00 AM to the end (≤30% re-arm never exceeded); charging shown on the power card (`solar`) and batt trend | skill rule 7 | D.steps lowbatt, chargerpt |
| D11 | Tones: cam `warn` from lowbatt (low_battery set, never cleared); router `alert` at b-courier, cleared (base) at b-reconnect | HLD low_battery; Wi-Fi down / returns | D.steps lowbatt, b-courier, b-reconnect |
| D12 | Wi-Fi failure drawn as `blocked` on cam->router (camera queues locally instead of sending) | HLD "cannot reach the router … keeps recording to its local SD card" | D.steps b-courier, b-retry |
| D13 | Custom protocols `wifi` (Home Wi-Fi) and `push` (APNs/FCM); internal calls `int`; router→services `https` | HLD "over HTTPS"; clip upload protocol not stated, catalog endpoint is https | page.protocols; D.edges |

## Engineering gaps
- G1 motion-classifier: no catalog entry and no code reference (unbound).
- G2 When/how the app reads device-shadow is not in the HLD (catalog getState exists; not drawn).
- G3 How the app fetches the clip when opened is not in the HLD (catalog getClip exists; not drawn).
- G4 Where the device page's "last event" comes from is not stated; card omitted.
- G5 Which operation device-shadow → notify-service and event-ingest → notify-service use is not stated (D8).
- G6 The 1 %/h drain and the 4:00 AM 20% report disagree (D5).
- G7 Firmware in the heartbeat payload has no values in the HLD.

## Storyboard worksheet

### A. Story
**Level:** engineering (A1). **Audience:** camera-platform and device-state engineers. **Takeaway:** which service acts at each moment, how the app's view (device-shadow, 30-min heartbeats) lags the physical battery, and how a Wi-Fi outage delays the package push.
**Narration:** 10:30 PM Thu: the heartbeat writes 25%/not charging to device-shadow. 1:10 AM: a raccoon; clip uploaded to clip-store, event to event-ingest, classifier says animal, no push. 4:00 AM: heartbeat reports 20%; device-shadow sets low_battery and notify-service sends one "Porch Cam battery low" push via APNs/FCM. 6:50 AM: sunrise; the battery panel starts charging, but the record and app still say "not charging, 18%, last report 6:30 AM". 7:00 AM: the next heartbeat reports charging=yes; the app shows the solar icon; low_battery stays (≤30%). 8:05 AM happy: courier clip → package → push, resident opens the clip at 8:07. 8:05 AM alternate: Wi-Fi down, clip queued on SD, retries fail at 8:07/8:09, app still "Online, last report 8:00 AM" (not offline: <60 min); 8:15 Wi-Fi returns, clip and heartbeat upload, then the package push arrives ~10 min late.
**What would I show?** 1) Sunrise→charging report: batt panel charging vs record/app "not charging" — batt + phone panels. 2) Engineers expect the offline rule: shown as not firing (b-retry text, record online=yes). 3) Must not believe: that the app polls live state, that the camera went offline, that a second low-battery push was sent, or that the clip was lost.

### B. Panel plan
| Panel id | Type | Physical/reported | Question | Best moment | Starting state | Must never show |
|---|---|---|---|---|---|---|
| batt | battery | physical | What is the real charge and is it charging? | sunrise | 25%, cells, draining (A5) | charging before 6:50 AM |
| record | table | reported | What does device-shadow hold (what the app reads)? | chargerpt, lowbatt | 25%, no, online yes, low_battery no, hb 10:00 PM | a value no heartbeat delivered |
| sd | queue | physical | Where is the package clip during the outage? | b-courier..b-reconnect | empty | a queued clip on the happy path |
| phone | deviceapp | reported | What the resident receives and sees | lowbatt, courier, b-latepush, openclip | home screen, no notifications, 25% as of 10:00 PM heartbeat | "offline", or a charging icon before 7:00 AM |
Rejected: `screen` (D2); a `log` panel (record table carries the same information).
Customer-visible items: pushes → phone.notify; battery % + "updated <time>" → phone.battery (freshness absolute); solar charging icon → phone.power icon `solar`; online → phone.online.

### C. Paths
| Path id | Label | Shared prefix | First different step | Ending | Unknowns |
|---|---|---|---|---|---|
| happy | Wi-Fi up at delivery | bed, raccoon, lowbatt, sunrise, chargerpt | courier | resident opens the clip (8:07) | app fetch route (G2, G3) |
| wifi-down | Wi-Fi down at delivery | same | b-courier | late package push 8:15 | Wi-Fi drop time (D7) |

### D. Time table
**Story time:** start 2026-09-24T22:30; end 2026-09-25T08:30; clock 12h; date short (A3).
**Battery rates:** batt drain 1 %/h (HLD), charge 3.5 %/h (illustrative, HLD 3–4), clip 1 % (HLD).
| Path | Step | time | Shown | Anchor/illus | Battery | Last report (app/record) | Day/night |
|---|---|---|---|---|---|---|---|
| both | bed | 22:30 | 10:30 PM Thu, Sep 24 | operator | 25 | 10:30 PM 25%, now | night |
| both | raccoon | 01:10 | 1:10 AM Fri, Sep 25 | operator ~1:10 | charge 24 (hold + clip, D5) | 1:00 AM 25% (scheduled, illus) | night |
| both | lowbatt | 04:00 | 4:00 AM | operator ~4:00 + HLD 20% | charge 20 anchor | 4:00 AM 20%, now | night |
| both | sunrise | 06:50 | 6:50 AM | operator | 17.17; trend charging, source solar | 6:30 AM 18% (scheduled, illus) | dawn |
| both | chargerpt | 07:00 | 7:00 AM | illus (next heartbeat) | 17.75 | 7:00 AM 18% charging, now | day |
| happy | courier | 08:05 | 8:05 AM | operator | drain 1 → 20.54 | 8:00 AM 21% (scheduled, illus) | day |
| happy | openclip | 08:07 | 8:07 AM | illus | 20.66 | holds 8:00 AM | day |
| wifi-down | b-courier | 08:05 | 8:05 AM | operator | drain 1 → 20.54 | 8:00 AM 21% (delivered before drop, D7) | day |
| wifi-down | b-retry | 08:09 | 8:09 AM | illus (2-min retry) | 20.78 | holds 8:00 AM | day |
| wifi-down | b-reconnect | 08:15 | 8:15 AM | HLD ~10 min | 21.13 | 8:15 AM 21%, now | day |
| wifi-down | b-latepush | (same) | 8:15 AM | HLD | holds | holds | day |

### E. Step x panel matrix
```
bed (both, 10:30 PM) — heartbeat. Edges cam->router, router->ingest, ingest->shadow.
 batt: holds (start value) | record: patch hb 10:30 PM | sd: holds empty | phone: patch reportedAt now (25%, not charging, Online)
 Code: ingest.heartbeat. Icons/tones: none.
raccoon (both, 1:10 AM) — PIR clip, POST /events, PUT clip, classify → animal, no push.
 Edges cam->router, router->ingest, router->clips, ingest->classifier, classifier->ingest.
 batt: patch charge 24 (D5) | record: patch hb 1:00 AM scheduled | sd: holds empty (upload succeeds) | phone: patch reportedAt 01:00 (values unchanged)
 Code: ingest.event, clips.upload (notify.push not run: animal not forwarded). Icons/tones: none.
lowbatt (both, 4:00 AM) — heartbeat 20% → low_battery → one push.
 Edges cam->router, router->ingest, ingest->shadow, shadow->notify, notify->push, push->app.
 batt: patch charge 20 anchor | record: patch battery 20%, low_battery yes, hb 4:00 | sd: holds | phone: patch notify "Porch Cam battery low", battery 20 icon battery-low, reportedAt now
 Code: ingest.heartbeat, shadow.lowbattery, notify.push. Tone cam warn.
sunrise (both, 6:50 AM) — physical charging starts; nothing reported. No edges (nodes: cam).
 batt: patch trend charging, source solar | record: patch battery 18%, hb 6:30 scheduled | sd: holds | phone: patch battery 18 reportedAt 06:30 (still "not charging")
 State cleared: batt source cells→solar, draining→charging. Code: none.
chargerpt (both, 7:00 AM) — heartbeat charging=yes.
 Edges cam->router, router->ingest, ingest->shadow.
 batt: holds (drift) | record: patch charging yes, hb 7:00 | sd: holds | phone: patch power "Solar · charging" icon solar, reportedAt now
 State cleared: power "Battery · not charging"→"Solar · charging". Battery card keeps battery-low (D10). Code: ingest.heartbeat.
courier (happy, 8:05 AM) — clip, package, push.
 Edges cam->router, router->ingest, router->clips, ingest->classifier, classifier->ingest, ingest->notify, notify->push, push->app.
 batt: patch drain 1 | record: patch battery 21%, hb 8:00 scheduled | sd: holds | phone: patch notify "Package delivered at front door", battery 21 reportedAt 08:00
 Code: ingest.event, clips.upload, notify.push.
openclip (happy, 8:07 AM) — resident opens the clip. No edges (nodes: app; route G2/G3).
 batt: holds (drift) | record: holds | sd: holds | phone: patch phoneScreen app
 Code: app.devicepage.
b-courier (wifi-down, 8:05 AM) — Wi-Fi down; clip to SD. failures cam->router blocked.
 batt: patch drain 1 | record: patch battery 21%, hb 8:00 | sd: patch enqueue | phone: patch battery 21 reportedAt 08:00 (no push)
 Tone router alert. Code: none (camera firmware not supplied).
b-retry (wifi-down, 8:09 AM) — retries fail; not offline. failures cam->router blocked.
 batt: holds | record: holds (online yes) | sd: patch held reason | phone: holds (Online, Last report 8:00 AM)
 Code: none (shadow.offline does not fire).
b-reconnect (wifi-down, 8:15 AM) — Wi-Fi back; late upload + heartbeat.
 Edges cam->router, router->ingest, router->clips, ingest->classifier, classifier->ingest, ingest->shadow.
 batt: holds | record: patch hb 8:15 | sd: patch dequeue | phone: patch reportedAt now (21%)
 Tone router cleared. Code: ingest.event, clips.upload, ingest.heartbeat.
b-latepush (wifi-down, 8:15 AM) — package push, late.
 Edges ingest->notify, notify->push, push->app.
 batt: holds | record: holds | sd: patch empty | phone: patch notify "Package delivered at front door"
 Code: ingest.event, notify.push.
```

### F. Coverage grid (P patched / H holds)
| happy | bed | raccoon | lowbatt | sunrise | chargerpt | courier | openclip |
|---|---|---|---|---|---|---|---|
| batt | H | P | P | P | H | P | H |
| record | P | P | P | P | P | P | H |
| sd | H | H | H | H | H | H | H |
| phone | P | P | P | P | P | P | P |

| wifi-down | bed | raccoon | lowbatt | sunrise | chargerpt | b-courier | b-retry | b-reconnect | b-latepush |
|---|---|---|---|---|---|---|---|---|---|
| batt | H | P | P | P | H | P | H | H | H |
| record | P | P | P | P | P | P | H | P | H |
| sd | H | H | H | H | H | P | P | P | P |
| phone | P | P | P | P | P | P | H | P | P |
Boring-panel check: `sd` never changes on the happy path, by design (no outage; uploads succeed); it carries the alternate path.

### G. Icon state plan
| Element | Default | State | Set at | Clears at | Restore |
|---|---|---|---|---|---|
| phone.battery | battery | low battery | lowbatt (`battery-low`) | not in story (re-arm needs >30%) | none |
| phone.power | battery | solar charging | chargerpt (`solar`) | not in story | none |
| phone.online | wifi | — | never changes (not offline: <60 min) | | |
| batt (computed) | — | charging bolt from sunrise | engine | | |

### H. Bindings and code
| Node | entityRef | API op | codeRefs (node) | Steps | Gap |
|---|---|---|---|---|---|
| ingest | component:default/event-ingest | postEvent POST /events | ingest.heartbeat, ingest.event | heartbeat: bed, lowbatt, chargerpt, b-reconnect; event: raccoon, courier, b-reconnect, b-latepush | |
| clips | component:default/clip-store | uploadClip PUT /clips/{clipId} | clips.upload | raccoon, courier, b-reconnect | |
| shadow | component:default/device-shadow | putState PUT /devices/{deviceId}/state | shadow.lowbattery, shadow.offline | lowbattery: lowbatt; offline: none (never fires) | G5 |
| notify | component:default/notify-service | sendPush POST /notifications | notify.push | lowbatt, courier, b-latepush | G5 |
| app | component:default/kestrel-app | (no APIs in catalog) | app.devicepage | openclip | G2, G3 |
| classifier | — | — | — | — | G1: not in supplied catalog, code not located |
| cam, router, push | — | — | — | — | not catalog services |

### I. Checkable expectations (walk --expect, all ok)
1. happy/lowbatt: batt.charge = 20; phone.battery.value = 20.
2. happy/sunrise: phone.battery.value = 18 (app lags; batt 17.17 charging).
3. wifi-down/b-retry: phone.online.value = Online (not offline).
4. Dates: bed Thu, Sep 24; courier Fri, Sep 25.

## Self-audit
- Stamp: ok. Validator (`validate stamped.spec.json`): **0 errors, 0 warnings** (an earlier over-long edge label was shortened).
- Walk (`--catalog input/catalog.json --state --rate batt=-1:3.5`, 6 expects): **0 warnings, 4 checks, 1 note**, all expects ok.
  - CHECK sunrise / courier / b-courier: app card changed without a lit shadow edge → intended rule 9(b) scheduled-heartbeat values; each card names its report time ("Last report 6:30 AM", "8:00 AM") and the section text labels them illustrative.
  - CHECK `sd` never changes on happy → intended (F).
  - NOTE shadow.offline on node only → correct: the 10-min outage never reaches the 60-min rule (H).
- Rate lines: raccoon −0.38/h and lowbatt −1.41/h are the D5 anchor hold/jump; all other intervals are −1 %/h or +3.5 %/h.
- Rule 8 check: power card rewritten at chargerpt; router tone cleared at reconnect; sd emptied after late push; nothing else changes state.
- Reverse audit: every edge, tone, notification, icon and link traces to a ledger row or decision above.
- Visual/browser checks: **not done** (no browser in this session). Layout of the two-row board, label collisions and panel fit remain unverified.

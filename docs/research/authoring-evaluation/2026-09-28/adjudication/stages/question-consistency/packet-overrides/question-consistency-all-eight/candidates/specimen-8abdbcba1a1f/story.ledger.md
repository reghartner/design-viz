# Coverage ledger — kestrel-overnight
source: input/hld.md "HLD: Kestrel Porch Cam — overnight on battery" (+ input/catalog.json, input/code-evidence.md) | version: n/a (reviewed design; no version given) | updated: 09-28-2026 14:10

Editor session e190c4e2-17d9-4338-a586-6bf566965323. Questions were sent in request 87b77e2f. Answers arrived in request 3eadd430-9ea8-405b-870b-a5972376187c. Base revision: `b491fadc-867d-4654-a89b-9ddc260d8fc7-1`.
Spec locations: `D` = `page.blocks[0].diagram`. Step ids are shown as `D.steps[<id>]`.

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Every 30 minutes the camera sends a heartbeat to event-ingest" | heartbeat: cam → router → event-ingest → device-shadow | covered @ D.steps[bedtime, hb-low, hb-charging, b-reconnect]; later schedule shown on shadow table + app freshness (illustrative) |
| 2 | flow | "On PIR motion the camera wakes, records a clip (about 20 s), and uploads it" | POST /events → event-ingest, clip → clip-store; label from motion-classifier; person/package → notify-service → push | covered @ D.steps[raccoon, raccoon-label, courier, package-push, b-reconnect, b-late-push] |
| 3 | flow | "device-shadow marks the camera `low_battery` and notify-service sends one" | low-battery push at ≤20%, once, re-arm above 30% | covered @ D.steps[hb-low, push-low]; no re-push at 8:00/8:15 reports (20% ≤ 30%) @ shadow table row low_battery |
| 4 | flow | "reports charging=yes on its next heartbeat" | charging shown only after next heartbeat | covered @ D.steps[sunrise] (physical) and D.steps[hb-charging] (reported, app power card icon `solar`) |
| 5 | flow | "Resident opens the clip." | happy ending | covered @ D.steps[open-clip] (app clip card; retrieval hop not drawn, gap G6) |
| 6 | flow | "Wi-Fi returns about 10 minutes later; the clip uploads, then the package push is sent (late)" | alternate ending | covered @ path `wifi-down`: D.steps[b-courier, b-retry, b-reconnect, b-late-push] |
| 7 | contract | "battery %, charging yes/no, firmware" | heartbeat payload (human labels; no wire names) | covered @ D.edges router->ingest label "POST /events, /heartbeats" + D.steps[bedtime].text; firmware not rendered as a value (no value given) |
| 8 | contract | "Battery NN% · updated <time>" | device page battery line | covered @ D.panels[app].fields battery (value + computed "Updated …" freshness) |
| 9 | contract | "Porch Cam battery low" | push text | covered @ D.steps[push-low].panels.app.notify |
| 10 | contract | "Package delivered at front door" | push text | covered @ D.steps[package-push], D.steps[b-late-push] notify |
| 11 | failure | "If the camera cannot reach the router it keeps recording to its local SD card and retries every 2 minutes" | Wi-Fi down, SD queue, 2-min retry | covered @ D.steps[b-courier, b-retry] failures `cam->router: dropped`; D.panels[sd] |
| 12 | failure | "marks the camera offline when two heartbeats in a row are missed (60 minutes)" | offline rule | covered @ D.nodes.shadow.codeRefs shadow.offline; not triggered (outage 8:03–8:15 misses no heartbeat) @ D.steps[b-retry] shadow note |
| 13 | failure | "before that the app still shows the last state with an older "updated" time" | app ages, not offline | covered @ D.steps[b-retry] (app battery/seen "Updated 13 min ago", status ready) |
| 14 | service | "Porch Cam (device)" | device node | covered @ D.nodes.cam (not a catalog service) |
| 15 | service | "Home router" | relay, "Not a Kestrel service" | covered @ D.nodes.router (not a catalog service) |
| 16 | service | "event-ingest" | component:default/event-ingest | covered @ D.nodes.ingest.binding (api postEvent POST /events) |
| 17 | service | "motion-classifier" | not in supplied catalog | out-of-scope: unbound, not in supplied catalog (node D.nodes.classifier drawn, no binding, no codeRef) |
| 18 | service | "clip-store" | component:default/clip-store | covered @ D.nodes.clips.binding (api uploadClip PUT /clips/{clipId}) |
| 19 | service | "device-shadow" | component:default/device-shadow | covered @ D.nodes.shadow.binding (api putState, D5) |
| 20 | service | "notify-service" | component:default/notify-service | covered @ D.nodes.notify.binding (api sendPush, D5) |
| 21 | service | "Kestrel app (phone)" | component:default/kestrel-app | covered @ D.nodes.app.binding (no APIs in catalog) |
| 22 | service | "sends them through Apple/Google push" | APNs/FCM, external | covered @ D.nodes.push (not a catalog service, unbound) |
| 23 | number | "Every 30 minutes" | heartbeat interval | covered @ report times 10:30, 1:00, 4:00, 6:30, 7:00, 8:00, 8:15 (reconnect) |
| 24 | number | "about 20 s" | clip length | covered @ D.steps[raccoon, courier] text |
| 25 | number | "at or below 20%" | low threshold | covered @ D.panels[batt].low = 20; D.steps[hb-low] |
| 26 | number | "above 30%" | re-arm threshold | covered @ shadow table row low_battery "re-arms above 30%" |
| 27 | number | "Idle drain is about 1% per hour" | drain 1 %/h | covered @ D.panels[batt].drainPerHour = 1 (suspended 10:30 PM–4:00 AM, see #37) |
| 28 | number | "Each recorded clip uses about 1%" | clip cost 1% | covered @ D.steps[courier], D.steps[b-courier] `drain: 1`; raccoon clip absorbed by the hold (#37) |
| 29 | number | "Solar in morning light adds about 3–4% per hour" | solar | covered @ D.panels[batt].chargePerHour = 2.5 net (illustrative, D3, gap G3) |
| 30 | number | "retries every 2 minutes" | retry interval | covered @ D.steps[b-retry] (retries 8:07, 8:09, 8:11, 8:13) |
| 31 | number | "(60 minutes)" | offline threshold | covered @ D.nodes.shadow.codeRefs + D.steps[b-retry] shadow note |
| 32 | number | "Battery is 25%, not charging" | start anchor | covered @ D.panels[batt].initial.charge 25; app initial |
| 33 | number | "about 10 minutes later" | outage length after delivery | covered @ D.steps[b-reconnect].time 8:15 AM (10 min after 8:05) |
| 34 | number | operator: "Starts Thursday Sep 24 at 10:30 PM. Raccoon around 1:10 AM. Low-battery heartbeat around 4:00 AM. Sunrise 6:50 AM. Courier 8:05 AM." | anchor times | covered @ D.storyTime; D.steps[bedtime 22:30, raccoon 01:10, hb-low 04:00, sunrise 06:50, courier/b-courier 08:05] |
| 35 | number | illustrative minutes | 7:00 AM charging heartbeat, 8:03 Wi-Fi drop, 8:07 clip opened, 8:13 retry, 8:15 reconnect, 8:16 late push | covered @ step times; illustrative, stated in section text |
| 36 | number | derived | app battery 18% at 6:30/7:00 and 20% at 8:00/8:15 reports from the walk's physical values | covered @ app battery patches; illustrative |
| 37 | number | "a heartbeat reports 20%" at operator 4:00 AM vs 1 %/h | anchor/rate tension: rate gives 20% near 2:30 AM | covered @ D.steps[raccoon] `charge: 25` hold, D.steps[hb-low] `charge: 20`; stated in section text and batt note |
| 38 | permalink | catalog `catalogUrl` / `definitionUrl` × 5 | Backstage links | covered @ D.nodes.{ingest,clips,shadow,notify,app}.binding |
| 39 | permalink | code-evidence repositories × 7 | full-SHA code refs | covered @ node codeRefs (all 7) + step codeRefs (section H) |
| 40 | flow | "Live view, two-way audio, subscription tiers." | excluded | out-of-scope: HLD "Out of scope" |
| 41 | flow | "`animal` events are saved to the timeline with no push (default user setting)" | raccoon: no push | covered @ D.steps[raccoon-label] (no notify edge; app event card "Animal · 1:10 AM") |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | technical level? | Engineering: every service hop, API operations and code references | 09-28-2026 | whole page; node bindings, edge labels, codeRefs | active |
| A2 | audience and takeaway? | Camera-platform and device-state engineers; which service does what at each moment, how the app's view lags the real battery, how the Wi-Fi outage delays the package push | 09-28-2026 | worksheet A; panels batt vs app vs shadow; path wifi-down | active |
| A3 | span and times? | Thu Sep 24, 10:30 PM start; raccoon ~1:10 AM; low-battery heartbeat ~4:00 AM; sunrise 6:50 AM; courier 8:05 AM; other minutes illustrative | 09-28-2026 | D.storyTime, step times | active |
| A4 | endings? | Happy path plus the Wi-Fi-down alternate at the delivery | 09-28-2026 | D.paths | active |
| A5 | starting situation? | Battery 25%, not charging, online, Wi-Fi good, no notifications on the phone | 09-28-2026 | panel initial states | active |
| A6 | catalog / code? | Only input catalog.json and code-evidence.md | 09-28-2026 | node bindings and codeRefs | active |
| A7 | other | Standalone HTML fine; no mobile checks | 09-28-2026 | not applied: session deliverable is the editor story (no OUT build per request) | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | Anchor/rate tension: hold the physical battery at 25% until the 4:00 AM report, then anchor 20%. No invented in-between values. The raccoon clip's 1% is absorbed by the hold. | Skill rule 5; operator 4:00 AM vs HLD 1 %/h + 1 %/clip (would reach 20% ≈ 2:30 AM) | D.steps[raccoon].panels.batt.charge 25; D.steps[hb-low] charge 20; section text |
| D2 | Scheduled heartbeats between drawn steps (1:00, 6:30, 8:00 AM) are shown as the latest report on the app cards and shadow table (illustrative), not as extra steps | Skill rule 9(b): fixed 30-min schedule, nothing stops it | D.steps[raccoon, sunrise, courier, b-courier] |
| D3 | Net solar charge 2.5 %/h = midpoint 3.5 %/h solar minus 1 %/h idle; illustrative | HLD "adds about 3–4% per hour"; net vs gross not stated (G3) | D.panels[batt].chargePerHour |
| D4 | The device-app panel is the Kestrel app device page as served from device-shadow (its declared source). It stays on the app screen all night, with a note that the phone is locked. Card changes follow device-shadow writes, not app reads. | HLD "The app reads this"; "Between heartbeats the app shows the last reported value"; A2 wants the app's lag visible at each moment | D.panels[app] note, sources |
| D5 | API operations chosen as the only catalog operation matching each described call: postHeartbeat/postEvent (event-ingest), uploadClip (clip-store), putState (device-shadow write), sendPush (notify-service). The HLD names only POST /events. | catalog.json; HLD Behavior 1–3 | edge labels, node bindings |
| D6 | Wi-Fi drops at 8:03 AM (illustrative), after the 8:00 heartbeat, so the ~12-min outage misses no heartbeat and the offline rule is not reached | HLD "at the delivery, home Wi-Fi is down"; offline needs 60 min | D.steps[b-courier, b-retry] |
| D7 | Failed hop is `cam->router` marked `dropped` (attempted, retried), not `blocked` | HLD "cannot reach the router … retries" | D.steps[b-courier, b-retry].failures |
| D8 | Edge kinds: `wifi` (declared), `https` for camera→cloud (event-ingest "over HTTPS"; clip-store endpoint is https), `int` for internal service calls (protocol not stated), `push` (declared, APNs/FCM) | HLD components; catalog endpoints | page.protocols, D.edges |
| D9 | Low-battery icon on the app battery card stays `battery-low` after charging starts (below the 30% re-arm). Charging shows on the Power card (`solar` icon) and in the batt panel trend. | Skill rule 7 precedence; HLD "The app shows the solar charging icon" | D.steps[hb-charging] |
| D10 | Router tone `alert` from 8:05 (Wi-Fi down), cleared at 8:15 reconnect; shadow tone `warn` from 4:00 (low_battery), never cleared (stays ≤30%) | HLD Behavior 3, 6 | step tones |
| D11 | No screen/homemap panel: no stock scene fits a raccoon night plus a morning delivery; the engineering audience's questions are about services, reports and battery | panel guide (screen scene is not patchable per step) | D.panels |

## Engineering gaps
| # | gap | effect |
|---|-----|--------|
| G1 | motion-classifier not in the supplied catalog; no code reference | node unbound, no codeRefs |
| G2 | No code for camera firmware (PIR, SD queue, retry), router or push providers | those steps carry no codeRefs |
| G3 | "adds 3–4 % per hour" net or gross of idle drain not stated | 2.5 %/h net, illustrative (D3) |
| G4 | Where the timeline / "last event" is stored and how the app reads it is not described | app `event` card has no declared source; walk CHECKs expected |
| G5 | No response edges (200/202/ack) described, except the classifier's label reply | only `classifier->ingest` (ret) is drawn |
| G6 | How the app fetches the clip when opened is not described (catalog lists getClip, but the HLD does not say the app calls it) | open-clip lights no hop |
| G7 | When the app actually refreshes the device page is not described | D4 |
| G8 | HLD scenario "a heartbeat reports 20%" vs operator 4:00 AM vs stated drain | D1 |

## Storyboard worksheet

### A. Story
**Level:** engineering (A1).
**Audience:** camera-platform and device-state engineers (A2).
**Takeaway:** each service's job at each moment. The app lags the real battery by up to one heartbeat (30 min), and charging shows only on the next heartbeat. A Wi-Fi outage at delivery delays the package push by the outage (8:05 → 8:16) without losing the clip.
**Story (60-second narration):** At 10:30 PM Thursday the Porch Cam's heartbeat carries 25%, not charging, through the home router to event-ingest, which writes device-shadow. The app's device page reads that record. At 1:10 AM a raccoon trips PIR. The camera records 20 s, posts the event to event-ingest and puts the clip in clip-store. motion-classifier says `animal`, so event-ingest forwards nothing to notify-service: no push. At 4:00 AM the heartbeat reports 20%. device-shadow marks `low_battery` and notify-service sends the one "Porch Cam battery low" push through APNs/FCM. At 6:50 the sun reaches the panel and the battery starts climbing, but the app still says "not charging" until the 7:00 heartbeat reports charging=yes. At 8:05 a courier drops a package. On the happy path, the clip uploads, the classifier says `package`, notify-service pushes "Package delivered at front door", and the resident opens the clip at 8:07. On the Wi-Fi-down path, the camera cannot reach the router. The clip waits on the SD card while retries fail every 2 minutes and the app's "updated" time ages, but the camera is never marked offline. At 8:15 Wi-Fi returns. The camera uploads the queued clip and sends a heartbeat, and the package push arrives at 8:16, 11 minutes late.

**What would I show?**
1. Most important moment: `b-late-push` (push at 8:16 for an 8:05 event), and `sunrise`→`hb-charging` (the app lags the physical battery). Best panels: `app` beside `batt`.
2. Expected but source-supported: the offline rule not firing during the outage (shadow table note at `b-retry`), and the low-battery push not repeating (low_battery row stays true, re-arms above 30%).
3. Must NOT believe: that the camera was marked offline; that the raccoon triggered a push; that the clip was lost; that the app saw charging at 6:50; that the resident read the late push (path ends at the push).

### B. Panel plan
| Panel id | Type | Physical or reported | Question it answers | Best moment | Starting state | Must never show |
|---|---|---|---|---|---|---|
| batt | battery | physical | What is the camera's real charge and power source? | sunrise (charging starts) | 25%, cells, draining (A5) | charging before 6:50; a drop below 20% before 4:00 (D1) |
| shadow | table | reported (service record) | What does device-shadow hold, and which rule applies? | hb-low (low_battery true); b-retry (offline rule not reached) | battery 25%, charging no, online yes, low_battery false, last heartbeat 10:00 PM (illustrative prior report) | a value that did not arrive by heartbeat; offline=true |
| app | deviceapp | reported | What does the Kestrel app show and how stale is it? | hb-charging (charging appears late); b-late-push | Battery 25% (10:00 PM report), not charging, Online, no notifications (A5) | a value newer than the last heartbeat; a raccoon push; "Offline" |
| sd | queue | physical (camera storage) | Where is the package clip while Wi-Fi is down? | b-retry | empty | anything on the happy path |

Rejected: `screen` (no scene fits both beats; the scene is not per-step), `homemap` (no service information for this audience), `phone` (the deviceapp already shows notifications), `log` (the captions and code refs carry the sequence). See D11.
Customer-visible items: "Battery NN% · updated <time>" → app `battery` card; solar charging icon → app `power` card icon `solar`; "Porch Cam battery low" / "Package delivered at front door" → app `notify`; timeline entry (animal, no push) → app `event` card; opened clip → app `clip` card; last seen / online → app `seen` card.

### C. Paths
| Path id | Label | Shared prefix | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| happy | Delivery on Wi-Fi | bedtime, raccoon, raccoon-label, hb-low, push-low, sunrise, hb-charging | courier | resident opens the clip, 8:07 AM | clip retrieval hop (G6) |
| wifi-down | Wi-Fi down at delivery | same | b-courier | late package push at 8:16 AM | what the resident does next (not in the HLD) |

### D. Time table
**Story time:** start `2026-09-24T22:30`, end `2026-09-25T08:20`, clock `12h`, date `short` (A3).
**Battery rates:** drain 1 %/h (HLD), charge 2.5 %/h net (D3, illustrative), clip `drain: 1` (HLD).
Anchors: 25% at 10:30 PM (A5); 20% at the 4:00 AM heartbeat (A3 + HLD). They conflict with the rate, so the charge holds at 25% until 4:00 (D1).
Report schedule: heartbeats at :00/:30 all night (10:30 PM … 8:00 AM), and a reconnect heartbeat at 8:15 on wifi-down. No heartbeat is missed: the outage runs 8:03–8:15 and the next one is due at 8:30.

| Path | Step | time | Anchor/source/illus | Battery (physical) | App's latest report |
|---|---|---|---|---|---|
| both | (start) | 10:30 PM Thu Sep 24 | A5 | 25, draining | 25% · 10:00 PM (illus) |
| both | bedtime | 22:30 | A3 | 25 | 25% · now (10:30 PM) |
| both | raccoon | 01:10 | A3 | 25 (hold, D1) | 25% · 1:00 AM (schedule, D2) |
| both | raccoon-label | (1:10) | — | 25 | holds |
| both | hb-low | 04:00 | A3 anchor | 20 (anchor) | 20% · now |
| both | push-low | (4:00) | — | 20 | holds |
| both | sunrise | 06:50 | A3 | ≈17.2, trend → charging, solar | 18% · 6:30 AM (D2); still "not charging" |
| both | hb-charging | 07:00 | illus | ≈17.6 | 18% · now; Solar · charging |
| happy | courier | 08:05 | A3 | ≈20.3 − 1 clip ≈ 19.3 | 20% · 8:00 AM (D2) |
| happy | package-push | (8:05) | — | ≈19.3 | holds |
| happy | open-clip | 08:07 | illus | ≈19.4 | holds (8:00) |
| wifi-down | b-courier | 08:05 | A3 | ≈19.3 | 20% · 8:00 AM |
| wifi-down | b-retry | 08:13 | illus (retry schedule) | ≈19.6 | holds 8:00 ("Updated 13 min ago") |
| wifi-down | b-reconnect | 08:15 | ~10 min (HLD) | ≈19.7 | 20% · now |
| wifi-down | b-late-push | 08:16 | illus | ≈19.8 | holds |

### E. Step x panel matrix
```
### bedtime  paths: both  time: 10:30 PM Thu
Beat: resident goes to bed; scheduled heartbeat.
Hops claimed: cam→router, router→event-ingest (POST /heartbeats), event-ingest→device-shadow (write)
Edges: cam->router, router->ingest, ingest->shadow
Report?: yes, heartbeat 25%, charging no
batt: holds: start 25%, draining
shadow: patch: last heartbeat 10:30 PM (battery 25, charging no, online yes, low_battery false)
app: patch: battery 25 reportedAt now; seen reportedAt now
sd: holds: empty
State cleared: none. Icons: none. Tones: none
Code: ingest.heartbeat. Evidence: L1, L7, A5

### raccoon  paths: both  time: 1:10 AM Fri
Beat: PIR, 20 s clip, upload.
Hops: cam→router, router→event-ingest (POST /events), router→clip-store (PUT /clips/{clipId})
Edges: cam->router, router->ingest, router->clips
batt: patch: charge 25 (hold, D1), note
shadow: patch: last heartbeat 1:00 AM (schedule, D2)
app: patch: battery/seen reportedAt 01:00 (D2)
sd: holds: empty (uploaded directly)
Code: ingest.event, clips.upload. Evidence: L2, L24, D1

### raccoon-label  paths: both  time: 1:10 AM
Beat: classifier labels `animal`; saved to timeline, no push.
Hops: event-ingest→motion-classifier, motion-classifier→event-ingest (label)
Edges: ingest->classifier, classifier->ingest (ret)
batt: holds. shadow: holds (events are not device-shadow state)
app: patch: event "Animal · 1:10 AM", detail "Saved to timeline · no push"
sd: holds
Code: ingest.event (forwards only person/package). Evidence: L2, L41, G4

### hb-low  paths: both  time: 4:00 AM
Beat: heartbeat reports 20%; device-shadow marks low_battery.
Edges: cam->router, router->ingest, ingest->shadow
batt: patch: charge 20 (anchor), note
shadow: patch: battery 20%, low_battery true (changed), last heartbeat 4:00 AM
app: patch: battery 20 reportedAt now, icon battery-low; seen reportedAt now
sd: holds
Icons: app.battery → battery-low. Tones: shadow warn
Code: ingest.heartbeat, shadow.lowbattery. Evidence: L3, L25, A3

### push-low  paths: both  time: 4:00 AM
Beat: one low-battery push.
Hops: device-shadow→notify-service, notify-service→APNs/FCM, APNs/FCM→app
Edges: shadow->notify, notify->push, push->app
batt/shadow/sd: holds
app: patch: notify "Porch Cam battery low"
Code: shadow.lowbattery, notify.push. Evidence: L3, L9

### sunrise  paths: both  time: 6:50 AM
Beat: panel produces power; nothing is reported yet.
Edges: none (physical); nodes: cam
batt: patch: trend charging, source solar, note
shadow: patch: battery 18%, last heartbeat 6:30 AM (schedule, D2); charging still no
app: patch: battery 18 reportedAt 06:30; seen reportedAt 06:30 (power still "not charging": the lag)
sd: holds
Code: none (firmware). Evidence: L4, A3

### hb-charging  paths: both  time: 7:00 AM
Beat: next heartbeat reports charging=yes.
Edges: cam->router, router->ingest, ingest->shadow
batt: holds (charging drift)
shadow: patch: battery 18%, charging yes (changed), last heartbeat 7:00 AM
app: patch: battery 18 reportedAt now; power "Solar · charging" icon solar; seen reportedAt now
sd: holds
Icons: app.power → solar; app.battery keeps battery-low (D9)
Code: ingest.heartbeat. Evidence: L4, D3

### courier  paths: happy  time: 8:05 AM
Beat: courier drops a package; clip recorded and uploaded.
Edges: cam->router, router->ingest, router->clips
batt: patch: drain 1
shadow: patch: battery 20%, last heartbeat 8:00 AM (schedule); low_battery stays true (≤30%)
app: patch: battery 20 reportedAt 08:00; seen reportedAt 08:00
sd: holds: empty
Code: ingest.event, clips.upload

### package-push  paths: happy  time: 8:05 AM
Edges: ingest->classifier, classifier->ingest, ingest->notify, notify->push, push->app
batt/shadow/sd: holds
app: patch: notify "Package delivered at front door"; event "Package · 8:05 AM", detail "Push sent 8:05 AM"
Code: ingest.event, notify.push

### open-clip  paths: happy  time: 8:07 AM
Beat: resident opens the clip (retrieval hop not described, G6).
Edges: none; nodes: app
batt/shadow/sd: holds
app: patch: clip visible "Package · 8:05 AM", detail "Opened 8:07 AM from the push"
Code: none

### b-courier  paths: wifi-down  time: 8:05 AM
Beat: Wi-Fi down since 8:03 (illus); clip goes to SD; upload attempt fails at cam→router.
Edges: failures cam->router dropped
batt: patch: drain 1
shadow: patch: battery 20%, last heartbeat 8:00 AM (the 8:00 heartbeat got through before the drop)
app: patch: battery 20 reportedAt 08:00; seen reportedAt 08:00
sd: patch: enqueue "Clip 8:05 AM"
Tones: router alert. Code: none (firmware)

### b-retry  paths: wifi-down  time: 8:13 AM
Beat: retries at 8:07, 8:09, 8:11, 8:13 fail; app ages; no offline.
Edges: failures cam->router dropped
batt: holds (charging drift)
shadow: patch: note "No heartbeat missed yet (next due 8:30); offline needs 2 missed (60 min)"
app: holds: freshness ages by itself ("Updated 13 min ago"), status ready
sd: patch: held, reason retry every 2 min
Code: none (shadow.offline not triggered: node only)

### b-reconnect  paths: wifi-down  time: 8:15 AM
Beat: Wi-Fi back; queued clip uploads (POST /events + PUT clip); heartbeat.
Edges: cam->router, router->ingest, router->clips, ingest->shadow
batt: holds
shadow: patch: battery 20%, last heartbeat 8:15 AM; note cleared
app: patch: battery 20 reportedAt now; seen reportedAt now
sd: patch: dequeue → clip-store
Tones: router null (clear). Code: clips.upload, ingest.event, ingest.heartbeat

### b-late-push  paths: wifi-down  time: 8:16 AM
Edges: ingest->classifier, classifier->ingest, ingest->notify, notify->push, push->app
batt/shadow: holds
app: patch: notify "Package delivered at front door"; event "Package · 8:05 AM", detail "Push sent 8:16 AM (11 min late)"
sd: patch: empty
Code: ingest.event, notify.push
```

### F. Coverage grid
| happy | bedtime | raccoon | raccoon-label | hb-low | push-low | sunrise | hb-charging | courier | package-push | open-clip |
|---|---|---|---|---|---|---|---|---|---|---|
| batt | H | P | H | P | H | P | H | P | H | H |
| shadow | P | P | H | P | H | P | P | P | H | H |
| app | P | P | P | P | P | P | P | P | P | P |
| sd | H | H | H | H | H | H | H | H | H | H |

| wifi-down | (shared 7) | b-courier | b-retry | b-reconnect | b-late-push |
|---|---|---|---|---|---|
| batt | as above | P | H | H | H |
| shadow | as above | P | P | P | H |
| app | as above | P | H | P | P |
| sd | H | P | P | P | P |

Boring panel check: `sd` holds on the whole happy path by design. Its empty state is the contrast with wifi-down. Kept.

### G. Icon state plan
| Panel.element | Default icon | State | Set at | Clears at | Restore |
|---|---|---|---|---|---|
| app.battery | battery | low battery | hb-low (`battery-low`) | not in story (re-arms above 30%; max ≈20%) | none |
| app.power | battery | solar charging | hb-charging (`solar`) | not in story | none |
| app.seen | wifi | offline | never (rule not reached) | | |
| batt | computed | charging bolt | sunrise (trend charging) | not in story | |
Precedence: app.battery keeps `battery-low` while charging below 30%; charging is on app.power and batt.trend (D9).

### H. Bindings and code
| Node | Catalog entityRef | API op | codeRefs (node) | Steps |
|---|---|---|---|---|
| ingest | component:default/event-ingest | postEvent POST /events (edge also names postHeartbeat POST /heartbeats) | ingest.heartbeat, ingest.event | heartbeat: bedtime, hb-low, hb-charging, b-reconnect; event: raccoon, raccoon-label, courier, package-push, b-reconnect, b-late-push |
| clips | component:default/clip-store | uploadClip PUT /clips/{clipId} | clips.upload | raccoon, courier, b-reconnect |
| shadow | component:default/device-shadow | putState (D5) | shadow.lowbattery, shadow.offline | lowbattery: hb-low, push-low; offline: none (not triggered) |
| notify | component:default/notify-service | sendPush POST /notifications (D5) | notify.push | push-low, package-push, b-late-push |
| app | component:default/kestrel-app | none in catalog | app.devicepage | none (the page render time is not described, G7) |
| classifier | — | — | — | unbound: not in supplied catalog (G1) |
| cam, router, push | — | — | — | not catalog services |

### I. Checkable expectations
1. `*/hb-low:batt.charge=20`; `*/raccoon:batt.charge=25` (D1 hold).
2. `*/sunrise:app.power.value=Battery · not charging` (lag); `*/hb-charging:app.power.value=Solar · charging`.
3. `wifi-down/b-retry:app.seen.value=Online` (never offline); `wifi-down/b-retry:app.battery.value=20`.
4. `happy/package-push:app.event.detail=Push sent 8:05 AM`; `wifi-down/b-late-push:app.event.detail=Push sent 8:16 AM (11 min late)`.
5. The raccoon steps light no notify edge. Time never goes backward on either path.

## Self-audit
Result: proposal `7ba3516329f045f5b7ac53b46fee8f05` **applied** at editor revision `b491fadc-867d-4654-a89b-9ddc260d8fc7-2` (base `-1`). Accepted source `story.spec.json` validates at 0 errors, 0 warnings.

Tools run (session wrapper):
- `author-tools.py stamp` + `validate stamped.spec.json`. The first run gave 1 lint (the edge label "POST /events · /heartbeats" was too long); after shortening it to "POST /events, /heartbeats", 0 errors and 0 warnings.
- `author-tools.py walk stamped.spec.json --catalog input/catalog.json --state --rate batt=-1:2.5` with 12 `--expect` checks (section I plus detail checks). All 12 EXPECT ok, 0 WARN, 6 CHECK, 2 NOTE.

CHECK dispositions:
- `sunrise`, `courier`, `b-courier`: app.battery changes without a lit delivery edge. This is intentional (D2, skill rule 9(b)). The HLD states a fixed 30-min heartbeat and nothing stops it before 8:03. Each card names its report time in the detail: "Last report 6:30 AM / 8:00 AM (scheduled heartbeat, illustrative)".
- `package-push`, `b-late-push`: the app `event` card has no declared route. The HLD does not say where the timeline or last event is stored or how the app reads it (G4). The change sits on the step whose push delivery is lit.
- `sd` never changes on path happy: intentional contrast with wifi-down (worksheet F).

NOTE dispositions: `app.devicepage` is on its node only, because when the app renders the page is not described (G7). `shadow.offline` is on its node only, because the outage (8:03–8:15) misses no heartbeat, so the rule never runs (row 12).

Line-by-line comparison with sections D–H:
- Physical battery: 25 → 25 (hold) → 20 (anchor) → 17.17 at sunrise (−1 %/h) → 17.58 at 7:00 → 19.29 at 8:05 (+2.5 %/h, −1 clip).
- App cards: 25 → 20 → 18 → 18 → 20, each with its report time.
- Power: "Battery · not charging" through sunrise, then "Solar · charging" (icon `solar`) at 7:00. The lag is visible.
- Icons: app.battery `battery-low` from 4:00 (not restored, below re-arm).
- Tones: shadow warn from 4:00; router alert 8:05, cleared at 8:15.
- The clock never goes backward on either path; the date rolls from Thu, Sep 24 to Fri, Sep 25 at the raccoon step.
- Code refs per step match section H.

State-clearing check (rule 8):
- At `hb-charging`, power leaves "not charging".
- At `b-reconnect`, the router alert clears, the SD queue dequeues and empties at `b-late-push`, and the shadow note is replaced.
- No card claims Offline. No push appears for the raccoon.

Reverse audit: every edge kind, tone, icon, notification and link traces to a ledger row or to D1–D11. Two edge kinds are declared: `wifi` and `push` (D8).

Not done: browser rendering and visual checks, including label collisions, the phone layout and the path switch at step 8. No browser tools were available. There was no standalone OUT/HTML build, because the request makes the editor story the deliverable (A7).

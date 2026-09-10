# Coverage ledger — Chime Radar — distance-gated alerts, visit paths, early camera wake
source: docs/hlds/chime-radar/chime-radar.md | version: n/a | updated: 09-09-2026 09:25
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Distance-gated motion alert" | outside tracks stay local; an inside-threshold track raises `RADAR_INT`, publishes a motion event, and opens a household alert | covered @ page.blocks[0].tabs[0].sections[0] |
| 2 | flow | "Visit path attached to the alert" | Scout preserves and uploads track fixes; Pathworks assembles and stores the path; the resident receives and scrubs it | covered @ page.blocks[0].tabs[1].sections[0] |
| 3 | flow | "Radar-before-camera wake sequencing" | radar trajectory wakes Vision HP before radio work, then the alert and clip complete in parallel | covered @ page.blocks[0].tabs[2].sections[0] |
| 4 | flow | "False-alert tuning of the distance threshold" | dismissals drive a Sift suggestion and an accepted shadow/config command to Scout RD | covered @ page.blocks[0].tabs[3].sections[0] |
| 5 | contract | "Radar-qualified motion event" | `evt/door/motion` MQTT fields: type, eventId, trigger, range_ft, bearing_deg, speed_fps, threshold_ft, ttl | covered @ page.blocks[0].tabs[0].sections[0].contract |
| 6 | contract | "Track batch" | `evt/door/track` MQTT fields: eventId, t0, cal_rev, fixes | covered @ page.blocks[0].tabs[1].sections[0].contract |
| 7 | contract | "Threshold config" | `cmd/door/radar-config` MQTT QoS 1 fields: threshold_ft, shadow_ver, source | covered @ page.blocks[0].tabs[3].sections[0].contract |
| 8 | failure | "Wifi drops" | local gating continues, flash queues events, and reconnect replay makes alerts late without losing path assembly | covered @ page.blocks[0].tabs[4].sections[0] |
| 9 | failure | "Battery low / radar fault" | low battery stretches duty cycle, then critical battery or repeated resets latch radar off and fall back to PIR | covered @ page.blocks[0].tabs[4].sections[1] |
| 10 | failure | "Pathworks / Registry / Dispatch down" | path assembly may be late and threshold changes fail retryably while the device keeps its last config | covered @ page.blocks[0].tabs[1].sections[0].bullets[9] and page.blocks[0].tabs[3].sections[0].bullets[10] |
| 11 | failure | "Vision HP thermal shutdown" | gating and alerts continue while the camera cools; only clips are lost | covered @ page.blocks[0].tabs[2].sections[0].bullets[8] |
| 12 | service | "Sentry LP" | always-on hub that receives radar interrupts, controls wake, publishes events, and applies config | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.sentry |
| 13 | service | "Scout RD" | radar co-processor that tracks targets, gates alerts, buffers fixes, and stores threshold config | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.scout |
| 14 | service | "Vision HP" | camera and encoder woken early to record and upload the visit | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.vision |
| 15 | service | "Relay Broker" | MQTT broker with persistent QoS 1 sessions | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.relay |
| 16 | service | "Pulse Events" | deduplicates events and manages alert, dismissal, path-ready, and clip-indexed lifecycle | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.pulse |
| 17 | service | "Herald Push" | push gateway that delivers and updates resident notifications | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.herald |
| 18 | service | "Vault Clips" | stores clips and visit-path records keyed by eventId | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.vault |
| 19 | service | "Nimbus API / Sentinel Auth" | Nimbus API receives resident POSTs and forwards authorized requests | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.nimbus |
| 20 | service | "Nimbus API / Sentinel Auth" | Sentinel Auth verifies bearer JWTs and scopes | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.sauth |
| 21 | service | "Dispatch / Registry" | Dispatch sequences accepted config commands and publishes them to Relay | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.dispatch |
| 22 | service | "Dispatch / Registry" | Registry stores versioned desired and reported device shadow state | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.registry |
| 23 | service | "Pathworks" | projects fixes through mount calibration, assembles paths, and stores them in Vault | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.pathworks |
| 24 | service | "Sift" | joins dismissals with visit paths and proposes threshold changes | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.sift |
| 25 | number | "60 GHz" | radar operating frequency is 60 GHz | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.scout.sub |
| 26 | number | "default 15 ft" | the configurable threshold defaults to 15 ft | uncovered |
| 27 | number | "two new services" | Pathworks and Sift are two new services | uncovered |
| 28 | number | "Three chips, three power tiers" | the hardware has three chips | uncovered |
| 29 | number | "3-antenna angle-of-arrival" | Scout RD uses three antennas for angle of arrival | uncovered |
| 30 | number | "0–28 ft range" | Scout RD range is 0–28 ft | covered @ page.blocks[0].tabs[0].sections[0].diagram.panels[0].range |
| 31 | number | "~2 mA duty-cycled" | Scout RD draws about 2 mA while duty-cycled | uncovered |
| 32 | number | "10 Hz idle" | Scout RD idle cadence is 10 Hz | covered @ page.blocks[0].tabs[4].sections[1].diagram.steps[0].text |
| 33 | number | "20 Hz tracking" | Scout RD tracking cadence is 20 Hz | covered @ page.blocks[0].tabs[4].sections[1].diagram.steps[0].text |
| 34 | number | "30 s track ring buffer" | Scout RD retains 30 seconds of track fixes | covered @ page.blocks[0].tabs[1].sections[0].diagram.panels[1].capacity |
| 35 | number | "H.264 encoder" | Vision HP uses an H.264 encoder | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.vision.sub |
| 36 | number | "hundreds of mA running" | Vision HP draws hundreds of mA while running | uncovered |
| 37 | number | "2.4/5 GHz wifi" | Sentry LP alone provides 2.4 GHz wifi | uncovered |
| 38 | number | "TLS :8883" | Relay accepts MQTT over TLS on port 8883 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.relay.sub |
| 39 | number | "QoS 1 traffic" | sleeping-doorbell traffic and the config command use MQTT QoS 1 | covered @ page.blocks[0].tabs[3].sections[0].contract.title |
| 40 | number | "track at 24 ft" | the first track is acquired at 24 ft | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 41 | number | "configured 15 ft alert line" | the active alert line is 15 ft | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 42 | number | "sidewalk arc at 20–24 ft" | the outside passer-by remains at 20–24 ft | covered @ page.blocks[0].tabs[0].sections[0].bullets[1] |
| 43 | number | "`range_ft` 14.6" | trigger range is 14.6 ft | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[3].v |
| 44 | number | "Visitor 14 ft from the door" | resident notification reports the visitor at 14 ft | covered @ page.blocks[0].tabs[0].sections[0].bullets[7] |
| 45 | number | "3.1 ft/s" | closing speed is 3.1 ft/s | covered @ page.blocks[0].tabs[2].sections[0].bullets[0] |
| 46 | number | "~4 s" | computed time to door is about 4 seconds | covered @ page.blocks[0].tabs[2].sections[0].bullets[1] |
| 47 | number | "~12 ft out" | Vision HP boots while the visitor is about 12 ft out | covered @ page.blocks[0].tabs[2].sections[0].bullets[2] |
| 48 | number | "about 1.2 s" | Vision HP reaches RECORD about 1.2 seconds after the radar trip | covered @ page.blocks[0].tabs[2].sections[0].bullets[5] |
| 49 | number | "~9 ft away" | the visitor is about 9 ft away when RECORD begins | covered @ page.blocks[0].tabs[2].sections[0].bullets[5] |
| 50 | number | "three alerts within an hour" | three alerts occur | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 51 | number | "grazed 14–15 ft" | each dismissed sidewalk pass grazes 14–15 ft | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 52 | number | "outside 12 ft" | every dismissed track stays outside 12 ft | covered @ page.blocks[0].tabs[3].sections[0].bullets[4] |
| 53 | number | "alert line to 11 ft" | Sift proposes and the resident accepts an 11 ft threshold | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[0].v |
| 54 | number | "0x51C0FFEE" | sample shared eventId is 0x51C0FFEE | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[1].v |
| 55 | number | "bearing_deg" | sample trigger bearing is 250 degrees | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[4].v |
| 56 | number | "ttl" | motion-event expiry is 30 seconds | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[7].v |
| 57 | number | "cal_rev" | sample mount-calibration revision is 7 | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[2].v |
| 58 | number | "[[0,24.1,255],…]" | sample fix has 0 ms offset | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[3].v |
| 59 | number | "[[0,24.1,255],…]" | sample fix range is 24.1 ft | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[3].v |
| 60 | number | "[[0,24.1,255],…]" | sample fix bearing is 255 degrees | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[3].v |
| 61 | number | "43 in this batch" | sample track batch contains 43 fixes | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[3].g |
| 62 | number | "shadow_ver" | sample Registry shadow version is 19 | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[1].v |
| 63 | number | "sift:sg-284" | sample Sift suggestion identifier is sg-284 | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[2].v |
| 64 | number | "below 20 %" | below 20 percent, Scout RD stretches its idle duty cycle | covered @ page.blocks[0].tabs[4].sections[1].diagram.panels[0].low |
| 65 | number | "10 Hz → 2 Hz" | stretched idle cadence is 2 Hz | covered @ page.blocks[0].tabs[4].sections[1].diagram.steps[1].text |
| 66 | number | "~0.5 s slower acquisition" | stretched duty cycle adds about 0.5 seconds to acquisition | covered @ page.blocks[0].tabs[4].sections[1].diagram.steps[1].text |
| 67 | number | "below 8 %" | below 8 percent, the radar rail latches off | covered @ page.blocks[0].tabs[4].sections[1].diagram.panels[0].crit |
| 68 | permalink | "Cumulus HLD" | platform command-path reference | covered @ page.blocks[0].tabs[3].sections[0].text[0] |
| 69 | permalink | "fw/sentry/main.c#L44" | Sentry LP implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.sentry.link |
| 70 | permalink | "fw/scout/track.c#L88" | Scout RD implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.scout.link |
| 71 | permalink | "fw/vision/pipeline.c#L120" | Vision HP implementation link | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.vision.link |
| 72 | permalink | "services/pathworks/assemble.go#L61" | Pathworks implementation link | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.pathworks.link |
| 73 | permalink | "services/sift/suggest.go#L42" | Sift implementation link | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.sift.link |
| 74 | permalink | "docs/wire.md#radar-motion" | radar-motion wire-format link | covered @ page.blocks[0].tabs[0].sections[0].contract.source |
| 75 | permalink | "docs/wire.md#track-batch" | track-batch wire-format link | covered @ page.blocks[0].tabs[1].sections[0].contract.source |
| 76 | permalink | "docs/wire.md#radar-config" | radar-config wire-format link | covered @ page.blocks[0].tabs[3].sections[0].contract.source |
| 77 | number | "Three chips, three power tiers" | the hardware has three power tiers | uncovered |
| 78 | number | "2.4/5 GHz wifi" | Sentry LP alone provides 5 GHz wifi | uncovered |
| 79 | number | "within an hour" | the three alerts occur within one hour | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)
- Ledger #26 is uncovered: the HLD identifies 15 ft as the default threshold, but no spec carrier states that it is the default.
- Ledger #27 is uncovered: the HLD says Pathworks and Sift are two new services, but the spec does not render their count or NEW status.
- Ledger #28 is uncovered: the HLD's three-chip count is not rendered in the spec.
- Ledger #29 is uncovered: Scout RD's 3-antenna angle-of-arrival hardware is not rendered in the spec.
- Ledger #31 is uncovered: Scout RD's approximately 2 mA duty-cycled draw is not rendered in the spec.
- Ledger #36 is uncovered: Vision HP's hundreds-of-mA running draw is not rendered in the spec.
- Ledger #37 is uncovered: Sentry LP's 2.4 GHz wifi band is not rendered in the spec.
- Ledger #77 is uncovered: the HLD's three-power-tier count is not rendered in the spec.
- Ledger #78 is uncovered: Sentry LP's 5 GHz wifi band is not rendered in the spec.
- The Sentry LP board LED panel invents physical RADAR, RADIO, and CAM PWR indicators not stated by the HLD at `page.blocks[0].tabs[0].sections[0].diagram.panels[1]`.
- The `scout->sentry` edge renders `RADAR_INT` as an internal service call, rather than the HLD's hardware interrupt, at `page.blocks[0].tabs[0].sections[0].diagram.edges[0]`.
- The Pulse-to-Herald internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[0].sections[0].diagram.edges[3]`.
- The Herald-to-phone HTTPS protocol is not stated by the HLD at `page.blocks[0].tabs[0].sections[0].diagram.edges[4]`.
- The Visit path radar panel begins TRACKING at 26 ft although the linked HLD scenario first acquires the track at 24 ft, at `page.blocks[0].tabs[1].sections[0].diagram.panels[0].initial`.
- The 8-cell track-buffer model and its cell-index progression have no HLD-backed time-to-cell conversion at `page.blocks[0].tabs[1].sections[0].diagram.panels[1]` and `page.blocks[0].tabs[1].sections[0].diagram.steps[*].panels.tbuf`.
- The `PUB evt/track` label changes the HLD topic `evt/door/track` at `page.blocks[0].tabs[1].sections[0].diagram.edges[1].label`.
- The `scout->sentry` edge renders the HLD's SPI track read as an internal service call at `page.blocks[0].tabs[1].sections[0].diagram.edges[0]`.
- The Pathworks-to-Vault internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[1].sections[0].diagram.edges[3]`.
- The Pathworks-to-Pulse internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[1].sections[0].diagram.edges[4]`.
- The Pulse-to-Herald internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[1].sections[0].diagram.edges[5]`.
- The Herald-to-phone HTTPS protocol is not stated by the HLD at `page.blocks[0].tabs[1].sections[0].diagram.edges[6]`.
- The GET method is not stated by the HLD for the app's HTTPS path-frame fetch at `page.blocks[0].tabs[1].sections[0].diagram.edges[7].label`.
- The `scout->sentry` edge renders `RADAR_INT` as an internal service call, rather than the HLD's hardware interrupt, at `page.blocks[0].tabs[2].sections[0].diagram.edges[0]`.
- The `sentry->vision` edge renders `WAKE_INT` as an internal service call, rather than the HLD's hardware wake line, at `page.blocks[0].tabs[2].sections[0].diagram.edges[1]`.
- The `PUB evt/motion` label changes the HLD topic `evt/door/motion` at `page.blocks[0].tabs[2].sections[0].diagram.edges[2].label`.
- The Pulse-to-Herald internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[2].sections[0].diagram.edges[4]`.
- The Herald-to-phone HTTPS protocol is not stated by the HLD at `page.blocks[0].tabs[2].sections[0].diagram.edges[5]`.
- The Vision HP-to-Vault HTTPS upload protocol is not stated by the HLD at `page.blocks[0].tabs[2].sections[0].diagram.edges[6]`.
- The Vault-to-Pulse internal-service-call protocol and response/ack semantics are not stated by the HLD at `page.blocks[0].tabs[2].sections[0].diagram.edges[7]`.
- The camera panel invents a night scene not stated by the HLD at `page.blocks[0].tabs[2].sections[0].diagram.panels[2].scene`.
- The waterfall invents a 40 ms interrupt span, 900 ms boot span, and 260 ms first-frame span; the HLD gives only the 1.2 s total at `page.blocks[0].tabs[2].sections[0].diagram.panels[3].spans`.
- The phone-to-Nimbus HTTPS protocol is not stated by the HLD, which specifies POST but not HTTP versus HTTPS, at `page.blocks[0].tabs[3].sections[0].diagram.edges[0]`.
- The Nimbus-to-Sentinel internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[3].sections[0].diagram.edges[1]`.
- The Nimbus-to-Pulse internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[3].sections[0].diagram.edges[2]`.
- The Pulse-to-Sift internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[3].sections[0].diagram.edges[3]`.
- The Sift-to-Pulse internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[3].sections[0].diagram.edges[4]`.
- The Pulse-to-Herald internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[3].sections[0].diagram.edges[5]`.
- The Herald-to-phone HTTPS protocol is not stated by the HLD at `page.blocks[0].tabs[3].sections[0].diagram.edges[6]`.
- The Nimbus-to-Dispatch internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[3].sections[0].diagram.edges[7]`.
- The Dispatch-to-Registry internal-service-call protocol is not stated by the HLD at `page.blocks[0].tabs[3].sections[0].diagram.edges[8]`.
- The `PUB cmd/config` label changes the HLD topic `cmd/door/radar-config` at `page.blocks[0].tabs[3].sections[0].diagram.edges[9].label`.
- The `sentry->scout` edge renders the hardware config-register write as an internal service call instead of the HLD-backed SPI link at `page.blocks[0].tabs[3].sections[0].diagram.edges[11]`.
- The wifi signal panel invents a four-bar link strength on initial load and reconnect; the HLD states only drop and reconnect at `page.blocks[0].tabs[4].sections[0].diagram.panels[0].initial.wifi.bars` and `page.blocks[0].tabs[4].sections[0].diagram.steps[3].panels.net.wifi.bars`.
- The `scout->sentry` edge renders `RADAR_INT` as an internal service call, rather than the HLD's hardware interrupt, at `page.blocks[0].tabs[4].sections[0].diagram.edges[0]`.
- The battery panel invents an initial 34% charge and idle trend not stated by the HLD at `page.blocks[0].tabs[4].sections[1].diagram.panels[0].initial`.
- The battery panel invents a 19% charge and draining trend; the HLD states only “below 20%” at `page.blocks[0].tabs[4].sections[1].diagram.steps[1].panels.batt`.
- The battery panel invents a 7% charge and draining trend; the HLD states only “below 8%” at `page.blocks[0].tabs[4].sections[1].diagram.steps[2].panels.batt`.

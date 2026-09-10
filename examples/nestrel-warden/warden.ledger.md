# Coverage ledger — Nestrel Warden — a cloud camera that remembers the outage
source: docs/hlds/nestrel-warden/warden.md | version: n/a | updated: 09-09-2026 09:24
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Normal event with an LLM-written notification" | Warden classifies an event, indexes and uploads it, Scribe captions it, and Courier notifies the household | covered @ page.blocks[0].tabs[0].sections[0] |
| 2 | flow | "Wifi loss: one hour in the dark" | Warden loses wifi, buffers classified events through ring overwrite, and the cloud sends an offline alert | covered @ page.blocks[0].tabs[1].sections[0] |
| 3 | flow | "Reconnect: back-fill, dedup, reconciliation" | Warden reconnects, sends a manifest, skips a duplicate, uploads three clips, reconciles the timeline, and sends one summary | covered @ page.blocks[0].tabs[2].sections[0] |
| 4 | flow | "Staged firmware rollout, overnight, with a parachute" | Foundry stages firmware to a fleet wave; Warden health-checks, rolls back, reports failure, and the wave is held | covered @ page.blocks[0].tabs[3].sections[0] |
| 5 | contract | "Back-fill manifest" | Warden → Timeline manifest fields and sample values | covered @ page.blocks[0].tabs[2].sections[0].contract |
| 6 | contract | "Update offer" | Foundry → Warden via Skybridge update-offer fields and sample values | covered @ page.blocks[0].tabs[3].sections[0].contract |
| 7 | failure | "Wifi drops" | Classification and recording continue to flash for about 60 minutes; excess loss is oldest-first | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 8 | failure | "Power fails" | A real power outage creates a hard timeline gap; the supercapacitor only completes the in-flight flash write | covered @ page.blocks[0].tabs[1].sections[0].bullets[8] |
| 9 | failure | "Flash wear" | Failed segments are retired and Vitals advises below 30 minutes of capacity | covered @ page.blocks[0].tabs[1].sections[0].bullets[9] |
| 10 | failure | "Scribe down" | Notifications fall back to plain labels and captions are back-filled after recovery | covered @ page.blocks[0].tabs[0].sections[0].bullets[11] |
| 11 | failure | "Inlet down" | Unacked events remain buffered and back-fill runs after ingest recovery | covered @ page.blocks[0].tabs[2].sections[0].bullets[8] |
| 12 | failure | "Timeline down" | Acks stop, segments stay protected, and dedup/splice are delayed without data loss | covered @ page.blocks[0].tabs[2].sections[0].bullets[9] |
| 13 | failure | "Firmware update fails" | Slot B remains boot-once until health passes; the watchdog returns Warden to slot A | covered @ page.blocks[0].tabs[3].sections[0].bullets[9] |
| 14 | service | "Warden is Nestrel's wired indoor/outdoor cloud camera" | Warden performs the on-device and camera-side actions in all four flows | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.cam; page.blocks[0].tabs[1].sections[0].diagram.groups.warden; page.blocks[0].tabs[2].sections[0].diagram.groups.warden; page.blocks[0].tabs[3].sections[0].diagram.nodes.warden |
| 15 | service | "Kestrel SoC (NR-V2)" | Kestrel SoC performs on-device classification and camera processing | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 16 | service | "Skybridge" | Device gateway actions include event forwarding, heartbeat handling, clock sync, and control-channel delivery | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.skybridge; page.blocks[0].tabs[1].sections[0].diagram.nodes.skybridge; page.blocks[0].tabs[2].sections[0].diagram.nodes.skybridge; page.blocks[0].tabs[3].sections[0].diagram.nodes.skybridge |
| 17 | service | "Inlet" | Inlet assembles, verifies, persists, and acknowledges uploaded clips and supplies key frames | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.inlet; page.blocks[0].tabs[2].sections[0].diagram.nodes.inlet |
| 18 | service | "Coldstore" | Coldstore receives clip objects from Inlet | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.coldstore; page.blocks[0].tabs[2].sections[0].diagram.nodes.coldstore |
| 19 | service | "Scribe" | Scribe generates event captions, including batched captions after reconnect | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.scribe; page.blocks[0].tabs[2].sections[0].diagram.nodes.scribe |
| 20 | service | "Timeline" | Timeline indexes, deduplicates, reconciles, badges, and attaches captions to camera events | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.timeline; page.blocks[0].tabs[2].sections[0].diagram.nodes.timeline |
| 21 | service | "Courier" | Courier pushes normal, offline, and post-outage summary notifications | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.courier; page.blocks[0].tabs[1].sections[0].diagram.nodes.courier; page.blocks[0].tabs[2].sections[0].diagram.nodes.courier |
| 22 | service | "Vitals" | Vitals tracks missed heartbeats and rollout health and feeds wave statistics to Foundry | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.vitals; page.blocks[0].tabs[3].sections[0].diagram.nodes.vitals |
| 23 | service | "Foundry" | Foundry promotes firmware, coordinates waves and artifacts, and holds a wave at the rollback threshold | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.foundry |
| 24 | number | "up to one hour of classified events buffers" | Maximum offline event-buffer duration is one hour | covered @ page.blocks[0].tabs[1].sections[0].text[0] |
| 25 | number | "one honest timeline" | The household sees one reconciled timeline | covered @ page.blocks[0].tabs[2].sections[0].text[1] |
| 26 | number | "one summary notification" | The household sees one post-outage summary notification | covered @ page.blocks[0].tabs[2].sections[0].text[1] |
| 27 | number | "dual Cortex-A35" | Kestrel uses dual Cortex-A35 processors | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 28 | number | "one SoC does everything" | Warden has one always-on SoC rather than a power-domain split | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 29 | number | "8 GB eMMC" | Total eMMC capacity is 8 GB | covered @ page.blocks[0].tabs[0].sections[0].bullets[1] |
| 30 | number | "dual firmware slots (A/B)" | Firmware uses two slots, A and B | covered @ page.blocks[0].tabs[0].sections[0].bullets[1] |
| 31 | number | "reserved 512 MB event-buffer partition" | Reserved event-buffer partition is 512 MB | covered @ page.blocks[0].tabs[0].sections[0].bullets[1]; page.blocks[0].tabs[1].sections[0].diagram.nodes.flash.sub |
| 32 | number | "good for ~60 minutes" | Reserved flash holds about 60 minutes of classified clips | covered @ page.blocks[0].tabs[0].sections[0].bullets[1]; page.blocks[0].tabs[1].sections[0].diagram.panels[1].capacity; page.blocks[0].tabs[2].sections[0].diagram.panels[1].capacity |
| 33 | number | "ring of 12 segments" | Event buffer contains 12 segments | covered @ page.blocks[0].tabs[0].sections[0].bullets[1]; page.blocks[0].tabs[1].sections[0].diagram.panels[1].segments; page.blocks[0].tabs[2].sections[0].diagram.panels[1].segments |
| 34 | number | "1/2.8\" 2K HDR sensor" | Image sensor format is 1/2.8 inch | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 35 | number | "2K HDR sensor" | Image sensor resolution is 2K | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 36 | number | "6 IR LEDs" | Warden has six IR LEDs | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 37 | number | "dual-band 802.11ac wifi" | Wifi radio is dual-band | covered @ page.blocks[0].tabs[0].sections[0].bullets[3] |
| 38 | number | "24 V wall adapter" | Wall-adapter voltage is 24 V | covered @ page.blocks[0].tabs[0].sections[0].bullets[4] |
| 39 | number | "sub-second dips" | Supercapacitor ride-through applies only to dips shorter than one second | covered @ page.blocks[0].tabs[0].sections[0].bullets[4] |
| 40 | number | "one-line descriptions" | Scribe produces one-line notification descriptions | covered @ page.blocks[0].tabs[0].sections[0].diagram.steps[4].panels.plog.log[0].text |
| 41 | number | "24-second event clip" | Normal-event clip duration is 24 seconds | covered @ page.blocks[0].tabs[0].sections[0].bullets[5]; page.blocks[0].tabs[0].sections[0].diagram.steps[0].text; page.blocks[0].tabs[0].sections[0].diagram.steps[2].panels.vf.banner |
| 42 | number | "5 s / 15 s / 60 s backoff" | First access-point probe backoff is 5 seconds | covered @ page.blocks[0].tabs[1].sections[0].bullets[1]; page.blocks[0].tabs[1].sections[0].diagram.steps[1].text |
| 43 | number | "5 s / 15 s / 60 s backoff" | Second access-point probe backoff is 15 seconds | covered @ page.blocks[0].tabs[1].sections[0].bullets[1]; page.blocks[0].tabs[1].sections[0].diagram.steps[1].text |
| 44 | number | "5 s / 15 s / 60 s backoff" | Third access-point probe backoff is 60 seconds | covered @ page.blocks[0].tabs[1].sections[0].bullets[1]; page.blocks[0].tabs[1].sections[0].diagram.steps[1].text |
| 45 | number | "flash segment 1" | ev-4361 is written to flash segment 1 | covered @ page.blocks[0].tabs[1].sections[0].bullets[2]; page.blocks[0].tabs[1].sections[0].diagram.steps[2] |
| 46 | number | "Two more events" | Two additional events are buffered | covered @ page.blocks[0].tabs[1].sections[0].bullets[3]; page.blocks[0].tabs[1].sections[0].diagram.steps[3] |
| 47 | number | "segments 2–3" | The two additional events occupy segments 2 and 3 | covered @ page.blocks[0].tabs[1].sections[0].bullets[3]; page.blocks[0].tabs[1].sections[0].diagram.steps[3].panels.buf.mark |
| 48 | number | "41 minutes of capacity left" | Buffer reports 41 minutes remaining | covered @ page.blocks[0].tabs[1].sections[0].bullets[3]; page.blocks[0].tabs[1].sections[0].diagram.steps[3] |
| 49 | number | "At 58 minutes offline" | Ring becomes full at 58 minutes offline | covered @ page.blocks[0].tabs[1].sections[0].bullets[4]; page.blocks[0].tabs[1].sections[0].diagram.steps[4] |
| 50 | number | "misses three heartbeats" | Skybridge declares the camera offline after three missed heartbeats | covered @ page.blocks[0].tabs[1].sections[0].bullets[5]; page.blocks[0].tabs[1].sections[0].diagram.edges[2].label |
| 51 | number | "offline since 18:02" | Offline alert carries the time 18:02 | covered @ page.blocks[0].tabs[1].sections[0].bullets[5]; page.blocks[0].tabs[1].sections[0].diagram.steps[5].panels.blog.log[0].text |
| 52 | number | "shorter (47-minute) outage" | Reconnect scenario outage lasts 47 minutes | covered @ page.blocks[0].tabs[2].sections[0].text[0]; page.blocks[0].tabs[2].sections[0].diagram.steps[5].panels.rlog.log[0].text; page.blocks[0].tabs[2].sections[0].diagram.steps[7].text |
| 53 | number | "listing four buffered events" | Back-fill manifest lists four buffered events | covered @ page.blocks[0].tabs[2].sections[0].bullets[1]; page.blocks[0].tabs[2].sections[0].diagram.nodes.flash.sub; page.blocks[0].tabs[2].sections[0].diagram.steps[1] |
| 54 | number | "uploads the three missing clips" | Three non-duplicate clips are uploaded and recovered | covered @ page.blocks[0].tabs[2].sections[0].bullets[3]; page.blocks[0].tabs[2].sections[0].bullets[7]; page.blocks[0].tabs[2].sections[0].diagram.steps[7].text |
| 55 | number | "captions all three in one call" | Scribe returns three captions | covered @ page.blocks[0].tabs[2].sections[0].bullets[6]; page.blocks[0].tabs[2].sections[0].diagram.edges[8].label; page.blocks[0].tabs[2].sections[0].diagram.steps[6].panels.rlog.log[0].text |
| 56 | number | "captions all three in one call" | Scribe captions the batch in one call | covered @ page.blocks[0].tabs[2].sections[0].bullets[6] |
| 57 | number | "pushes a single summary" | Courier sends one post-outage summary | covered @ page.blocks[0].tabs[2].sections[0].bullets[7]; page.blocks[0].tabs[2].sections[0].diagram.edges[9].label; page.blocks[0].tabs[2].sections[0].diagram.steps[7].text |
| 58 | number | "instead of three stale alerts" | Recovery avoids three stale per-event alerts | covered @ page.blocks[0].tabs[2].sections[0].bullets[7]; page.blocks[0].tabs[2].sections[0].diagram.steps[7].panels.rlog.log[0].text |
| 59 | number | "wave 3 (5% of the fleet)" | Firmware rollout opens wave 3 | covered @ page.blocks[0].tabs[3].sections[0].bullets[0]; page.blocks[0].tabs[3].sections[0].diagram.steps[0] |
| 60 | number | "wave 3 (5% of the fleet)" | Wave 3 contains 5% of the fleet | covered @ page.blocks[0].tabs[3].sections[0].bullets[0]; page.blocks[0].tabs[3].sections[0].diagram.steps[0].panels.flog.log[0].text |
| 61 | number | "at 02:10 local" | Update offer reaches Warden at 02:10 local | covered @ page.blocks[0].tabs[3].sections[0].bullets[2]; page.blocks[0].tabs[3].sections[0].contract.note; page.blocks[0].tabs[3].sections[0].diagram.steps[2].text |
| 62 | number | "about 40 seconds" | Recording pauses about 40 seconds during reboot | covered @ page.blocks[0].tabs[3].sections[0].bullets[4]; page.blocks[0].tabs[3].sections[0].diagram.steps[4].text |
| 63 | number | "within 120 seconds" | Post-boot health check allows 120 seconds for TLS establishment | covered @ page.blocks[0].tabs[3].sections[0].bullets[5]; page.blocks[0].tabs[3].sections[0].contract.fields[6]; page.blocks[0].tabs[3].sections[0].diagram.steps[5].text |
| 64 | number | "rollbacks cross 1%" | Foundry holds wave 3 when rollback rate crosses 1% | covered @ page.blocks[0].tabs[3].sections[0].bullets[8]; page.blocks[0].tabs[3].sections[0].diagram.steps[8] |
| 65 | number | "below 30 minutes" | Vitals raises a flash-wear advisory below 30 minutes of capacity | covered @ page.blocks[0].tabs[1].sections[0].bullets[9] |
| 66 | number | "outage_start" | Back-fill sample outage start is epoch 1757088120 | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[1].v |
| 67 | number | "outage_end" | Back-fill sample outage end is epoch 1757090940 | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[2].v |
| 68 | number | "clock_skew_ms" | Back-fill sample clock correction is 1840 ms | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[3].v |
| 69 | number | "events" | Back-fill sample event timestamp is epoch 1757088180 | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[4].v |
| 70 | number | "dur_s" | Back-fill sample event duration is 19 seconds | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[4].v |
| 71 | number | "dropped" | Back-fill sample reports zero dropped events | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[5].v |
| 72 | number | "one entry per buffered event" | Manifest events array has one entry per buffered event | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[4].g |
| 73 | number | "01:00-05:00" | Update offer install window is 01:00–05:00 local | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[5].v |
| 74 | permalink | "Skybridge" | Skybridge implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.skybridge.link; page.blocks[0].tabs[1].sections[0].diagram.nodes.skybridge.link; page.blocks[0].tabs[2].sections[0].diagram.nodes.skybridge.link; page.blocks[0].tabs[3].sections[0].diagram.nodes.skybridge.link |
| 75 | permalink | "Inlet" | Inlet implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.inlet.link; page.blocks[0].tabs[2].sections[0].diagram.nodes.inlet.link |
| 76 | permalink | "Coldstore" | Coldstore implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.coldstore.link; page.blocks[0].tabs[2].sections[0].diagram.nodes.coldstore.link |
| 77 | permalink | "Scribe" | Scribe implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.scribe.link; page.blocks[0].tabs[2].sections[0].diagram.nodes.scribe.link |
| 78 | permalink | "Timeline" | Timeline implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.timeline.link; page.blocks[0].tabs[2].sections[0].diagram.nodes.timeline.link |
| 79 | permalink | "Courier" | Courier implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.courier.link; page.blocks[0].tabs[1].sections[0].diagram.nodes.courier.link; page.blocks[0].tabs[2].sections[0].diagram.nodes.courier.link |
| 80 | permalink | "Vitals" | Vitals implementation link | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.vitals.link; page.blocks[0].tabs[3].sections[0].diagram.nodes.vitals.link |
| 81 | permalink | "Foundry" | Foundry implementation link | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.foundry.link |
| 82 | permalink | "flashring.c" | Back-fill manifest wire-format implementation link | covered @ page.blocks[0].tabs[2].sections[0].contract.source |
| 83 | permalink | "slots.c" | Update-offer wire-format implementation link | covered @ page.blocks[0].tabs[3].sections[0].contract.source |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)

- Unjustified location claim `porch camera` at `page.blocks[0].tabs[0].sections[0].diagram.nodes.cam.sub`; the HLD says the event occurs in a porch zone, not that Warden is installed as a porch camera.
- Unjustified product name `nestrel app` at `page.blocks[0].tabs[0].sections[0].diagram.nodes.phone.sub`, `page.blocks[0].tabs[1].sections[0].diagram.nodes.phone.sub`, and `page.blocks[0].tabs[2].sections[0].diagram.nodes.phone.sub`; the HLD only says household phones.
- Unjustified initial live-view state `live` at `page.blocks[0].tabs[0].sections[0].diagram.panels[0].initial.mode`; the HLD describes classification and recording but no live-view session.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[0].sections[0].diagram.edges[0].kind` for Warden → Skybridge event envelope; the HLD says Warden posts it but does not name HTTPS.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[0].sections[0].diagram.edges[1].kind` for Skybridge → Timeline forwarding; the HLD names no mechanism.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[0].sections[0].diagram.edges[2].kind` for Warden → Inlet clip chunks; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[0].sections[0].diagram.edges[3].kind` for Inlet → Coldstore writes; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[0].sections[0].diagram.edges[4].kind` for Inlet → Scribe key frames; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[0].sections[0].diagram.edges[5].kind` for Scribe → Timeline captions; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[0].sections[0].diagram.edges[6].kind` for Timeline → Courier notify records; the HLD names no mechanism.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[0].sections[0].diagram.edges[7].kind` for Courier → phones push; the HLD names no mechanism.
- Unjustified qualifier `rich` at `page.blocks[0].tabs[0].sections[0].diagram.edges[7].label`; the HLD says described notification, not rich push.
- Unjustified classifier ownership `classify + write` at `page.blocks[0].tabs[1].sections[0].diagram.nodes.rec.sub`; the HLD assigns classification to Warden's classifier and writing to the recorder.
- Unjustified actor assignment at `page.blocks[0].tabs[1].sections[0].diagram.edges[0]`; the HLD says Warden probes for the access point, not specifically the connection manager.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[1].sections[0].diagram.edges[2].kind` for Skybridge → Vitals heartbeat reporting; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[1].sections[0].diagram.edges[3].kind` for Vitals → Courier alerting; the HLD names no mechanism.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[1].sections[0].diagram.edges[4].kind` for Courier → phones offline alert; the HLD names no mechanism.
- Unjustified `deauth` event at `page.blocks[0].tabs[1].sections[0].diagram.steps[0].panels.blog.log[0].text`; the HLD says association drops after the router reboot but does not say a deauthentication occurred.
- Incorrect overwrite state at `page.blocks[0].tabs[1].sections[0].diagram.steps[4].panels.buf.mark[1]`; the HLD says the oldest event is lost, but cell 0 is marked `buffered` rather than `dropped`.
- Unjustified Flow 3 actor assignment at `page.blocks[0].tabs[2].sections[0].diagram.nodes.conn` and its incident edges; the HLD assigns reconnect, manifest, upload, and acknowledgement actions to Warden, not specifically its connection manager.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[0].kind` for the resumed TLS session; the HLD specifies TLS, not HTTPS.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[1].kind` for Skybridge's clock/ack response; the HLD specifies a resumed TLS session, not HTTPS.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[2].kind` for Warden → Timeline manifest; the HLD names no mechanism.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[3].kind` for Timeline → Warden upload list; the HLD names no mechanism.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[4].kind` for Warden → Inlet clip upload; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[5].kind` for Inlet → Coldstore writes; the HLD names no mechanism.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[6].kind` for Inlet → Warden acknowledgements; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[7].kind` for Timeline → Scribe batch captioning; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[8].kind` for Scribe → Timeline captions; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[9].kind` for Timeline → Courier summary; the HLD names no mechanism.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[2].sections[0].diagram.edges[10].kind` for Courier → phones summary push; the HLD names no mechanism.
- Derived and rounded value `+1.8 s` at `page.blocks[0].tabs[2].sections[0].diagram.steps[0].panels.rlog.log[0].text`; the HLD's stated value is 1840 ms.
- Unjustified reclaimable state at `page.blocks[0].tabs[2].sections[0].diagram.steps[2].panels.buf.note` and `page.blocks[0].tabs[2].sections[0].diagram.steps[2].panels.buf.mark`; the HLD says ev-4410 is marked duplicate and skipped, while only acked segments are stated to become reclaimable.
- Unjustified `foundry console` detail at `page.blocks[0].tabs[3].sections[0].diagram.nodes.eng.sub`; the HLD only names a release engineer promoting firmware in Foundry.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[3].sections[0].diagram.edges[0].kind` for release engineer → Foundry promotion; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[3].sections[0].diagram.edges[1].kind` for Foundry → Vitals health query; the HLD names no mechanism.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[3].sections[0].diagram.edges[2].kind` for Foundry → Skybridge offer publication; the HLD names no mechanism.
- Unjustified MQTT mechanism at `page.blocks[0].tabs[3].sections[0].diagram.edges[3].kind` for Skybridge → Warden update offer; the HLD says control channel but never MQTT.
- Unjustified Warden → Skybridge rollback hop and MQTT mechanism at `page.blocks[0].tabs[3].sections[0].diagram.edges[5]`; the HLD only says Warden reports the rollback to Vitals.
- Unjustified Skybridge → Vitals rollback hop and internal service-call mechanism at `page.blocks[0].tabs[3].sections[0].diagram.edges[6]`; the HLD only says Warden reports the rollback to Vitals.
- Unjustified internal service-call mechanism at `page.blocks[0].tabs[3].sections[0].diagram.edges[7].kind` for Vitals → Foundry wave statistics; the HLD names no mechanism.
- Unjustified HTTPS mechanism at `page.blocks[0].tabs[3].sections[0].diagram.edges[8].kind` for Foundry paging the release engineer; the HLD names no mechanism.
- Unjustified role term `on-call` at `page.blocks[0].tabs[3].sections[0].diagram.edges[8].label` and `page.blocks[0].tabs[3].sections[0].diagram.steps[8].text`; the HLD says release engineer, not on-call.

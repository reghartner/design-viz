# Coverage ledger — Auralis Presence — mmWave room sensing, fall safety, offline autonomy
source: docs/hlds/auralis-presence/presence.md | version: n/a | updated: 09-09-2026 09:25

amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | service | "Presence is auralis's wall-mounted mmWave room sensor" | Presence is the wall-mounted room sensor | covered @ page.title |
| 2 | permalink | "docs/hld.md#overview" | Presence overview permalink https://github.com/auralis/presence/blob/main/docs/hld.md#overview | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 3 | service | "Iris MW" | Iris MW acquires and tracks resident position, posture, height, and breathing | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.iris.title |
| 4 | number | "60 GHz FMCW mmWave front-end" | Iris MW carrier frequency is 60 GHz | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.iris.sub |
| 5 | number | "3TX/4RX angle-of-arrival" | Iris MW has 3TX | uncovered |
| 6 | number | "3TX/4RX angle-of-arrival" | Iris MW has 4RX | uncovered |
| 7 | number | "2 Hz breath-sensing mode" | BREATH sampling rate is 2 Hz | covered @ page.blocks[0].tabs[2].sections[0].bullets[0] |
| 8 | permalink | "fw/iris/tracker.c#L74" | Iris tracker implementation permalink https://github.com/auralis/presence/blob/main/fw/iris/tracker.c#L74 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.iris.link |
| 9 | service | "Aria MCU" | Aria MCU runs the zone engine, cloud and LAN channels, cached rules, and store-and-forward | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.aria.title |
| 10 | number | "dual-core wifi MCU" | Aria MCU is dual-core | uncovered |
| 11 | number | "16 MB flash store-and-forward buffer" | Aria MCU flash buffer capacity is 16 MB | uncovered |
| 12 | number | "16 MB flash store-and-forward buffer (~4 h)" | Aria MCU store-and-forward duration is approximately 4 h | covered @ page.blocks[0].tabs[3].sections[0].bullets[3] |
| 13 | permalink | "fw/aria/zones.c#L112" | Aria zone-engine implementation permalink https://github.com/auralis/presence/blob/main/fw/aria/zones.c#L112 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.aria.link |
| 14 | number | "TRACK at 20 Hz" | TRACK sampling rate is 20 Hz | covered @ page.blocks[0].tabs[2].sections[0].diagram.panels[0].states[0] |
| 15 | service | "Atrium hub" | Atrium is the LAN peer and local automation and safety backstop | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.atrium.title |
| 16 | permalink | "hub/routines/local.go#L91" | Atrium local-routines implementation permalink https://github.com/auralis/atrium/blob/main/hub/routines/local.go#L91 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.atrium.link |
| 17 | service | "Overture API" | Overture API is the public API gateway used for app traffic | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.overture.title |
| 18 | service | "Clef Auth" | Clef Auth verifies JWTs, checks scopes, and handles care-contact grants | uncovered |
| 19 | service | "Chorus" | Chorus is the MQTT broker and delivers sensor events | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.chorus.title |
| 20 | number | "MQTT broker (TLS :8883)" | Chorus listens with TLS on port 8883 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.chorus.sub |
| 21 | service | "Motif" | Motif deduplicates zone events, maintains the room ledger, and fans out events | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.motif.title |
| 22 | service | "Vigil" | Vigil owns safety cases, check-in timing, escalation, and contact calling | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.vigil.title |
| 23 | permalink | "services/vigil/case.go#L58" | Vigil case implementation permalink https://github.com/auralis/cloud/blob/main/services/vigil/case.go#L58 | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.vigil.link |
| 24 | service | "Tempo" | Tempo owns sleep records and daytime-inactivity baselines | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.tempo.title |
| 25 | service | "Encore" | Encore is the push gateway for resident and contact phones | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.encore.title |
| 26 | service | "Cadence" | Cadence compiles routines and syncs them to Atrium and the sensor | uncovered |
| 27 | flow | "Multi-zone presence tracking (entry / exit)" | resident entry, zone-edge publication and mirroring, local lamp automation, app timeline, and stillness occupancy flow | covered @ page.blocks[0].tabs[0].sections[0] |
| 28 | flow | "Fall detection, check-in, escalation" | fall hypothesis, on-device confirmation, case opening, check-in, contact escalation, live occupancy, recovery, and closure flow | covered @ page.blocks[0].tabs[1].sections[0] |
| 29 | number | "height collapse from 1.7 m to 0.4 m" | pre-collapse track height is 1.7 m | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 30 | number | "height collapse from 1.7 m to 0.4 m" | post-collapse track height is 0.4 m | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 31 | number | "30-second on-device confirmation window" | fall confirmation window is 30 s | covered @ page.blocks[0].tabs[1].sections[0].bullets[1] |
| 32 | number | "confidence 0.93" | confirmed fall confidence is 0.93 | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 33 | number | "QoS 1" | fall alert publishes at MQTT QoS 1 | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 34 | number | "respond within 60 s" | resident check-in window is 60 s | covered @ page.blocks[0].tabs[1].sections[0].bullets[4] |
| 35 | failure | "No response arrives" | resident does not answer the check-in while the target remains prone and breathing | covered @ page.blocks[0].tabs[1].sections[0].bullets[5] |
| 36 | number | "first emergency contact" | first escalation call goes to the first emergency contact | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 37 | failure | "No answer within 90 s" | first emergency contact does not answer, causing escalation to the second contact | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 38 | number | "No answer within 90 s" | first-contact answer window is 90 s | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 39 | number | "second contact" | the next escalation call goes to the second contact | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 40 | flow | "Sleep and inactivity monitoring" | bedtime mode switch, sleep record, sample batching, wake event, morning summary, daytime baseline, and inactivity escalation flow | covered @ page.blocks[0].tabs[2].sections[0] |
| 41 | number | "At 23:10" | Bed occupancy begins at 23:10 | covered @ page.blocks[0].tabs[2].sections[0].bullets[0] |
| 42 | number | "every 10 minutes" | overnight respiration and restlessness batch cadence is 10 minutes | covered @ page.blocks[0].tabs[2].sections[0].bullets[2] |
| 43 | number | "at 04:12" | restless spell occurs at 04:12 | covered @ page.blocks[0].tabs[2].sections[0].bullets[3] |
| 44 | number | "At 07:40" | Bed occupancy ends at 07:40 | covered @ page.blocks[0].tabs[2].sections[0].bullets[4] |
| 45 | number | "each daytime hour's zone activity" | inactivity scoring cadence is each daytime hour | covered @ page.blocks[0].tabs[2].sections[0].bullets[5] |
| 46 | number | "By 12:00" | missing Kitchen occupancy triggers the inactivity flag by 12:00 | covered @ page.blocks[0].tabs[2].sections[0].bullets[6] |
| 47 | flow | "Internet outage: local automation and reconciliation" | cloud-link loss, local automation and safety, buffering, reconnection, backfill, recomputation, and case review flow | covered @ page.blocks[0].tabs[3].sections[0] |
| 48 | number | "ISP drops at 20:12" | internet outage begins at 20:12 | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 49 | number | "fires in ~40 ms" | LAN-only kitchen lights routine fires in approximately 40 ms | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 50 | number | "returns at 21:03" | connectivity returns at 21:03 | covered @ page.blocks[0].tabs[3].sections[0].bullets[5] |
| 51 | number | "got up at 20:41" | resident recovers from the local fall at 20:41 | covered @ page.blocks[0].tabs[3].sections[0].bullets[7] |
| 52 | contract | "Zone edge event (`evt/room/zone`, MQTT)" | zone edge event contract with type, zone, state, trackId, pos_m, seq, and ts fields | covered @ page.blocks[0].tabs[0].sections[0].contract |
| 53 | number | "trackId" | zone edge event sample trackId is 3 | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[3].v |
| 54 | number | "pos_m" | zone edge event sample x position is 1.4 m | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[4].v |
| 55 | number | "pos_m" | zone edge event sample y position is 2.1 m | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[4].v |
| 56 | number | "seq \| 8123" | zone edge event sample per-session sequence is 8123 | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[5].v |
| 57 | permalink | "docs/wire.md#zone-event" | zone edge event wire-contract permalink https://github.com/auralis/presence/blob/main/docs/wire.md#zone-event | covered @ page.blocks[0].tabs[0].sections[0].contract.source |
| 58 | contract | "Fall alert (`evt/room/safety`, MQTT QoS 1)" | fall alert contract with type, zone, conf, height_m, window_s, micro_motion, and seq / ts fields | covered @ page.blocks[0].tabs[1].sections[0].contract |
| 59 | number | "8140 / unix ms" | fall alert sample sequence is 8140 | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[6].v |
| 60 | permalink | "docs/wire.md#safety-event" | fall alert wire-contract permalink https://github.com/auralis/presence/blob/main/docs/wire.md#safety-event | covered @ page.blocks[0].tabs[1].sections[0].contract.source |
| 61 | contract | "Backfill envelope (wraps drained events after an outage)" | backfill envelope contract with backfill, span, and count fields | covered @ page.blocks[0].tabs[3].sections[0].contract |
| 62 | number | "count \| 212" | backfill envelope sample count is 212 events | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[2].v |
| 63 | permalink | "docs/wire.md#backfill" | backfill envelope wire-contract permalink https://github.com/auralis/presence/blob/main/docs/wire.md#backfill | covered @ page.blocks[0].tabs[3].sections[0].contract.source |
| 64 | failure | "Internet drops" | LAN automations and local safety continue, events buffer, outbound calling is lost, and the app shows local mode | covered @ page.blocks[0].tabs[3].sections[0].bullets[8] |
| 65 | failure | "Power fails" | sensor goes dark; Atrium raises a lost-sensor alert and Vigil treats it as a soft check-in trigger | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 66 | number | "three missed heartbeats" | Atrium raises the lost-sensor alert after three missed heartbeats | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 67 | number | "(~90 s)" | three missed heartbeats take approximately 90 s | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 68 | failure | "Battery low" | sensor battery-low mode is not applicable; Atrium backup power preserves the siren ladder during a power cut | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 69 | number | "alive ~4 h" | Atrium backup battery keeps the siren ladder alive approximately 4 h | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 70 | failure | "Chorus or Motif down" | sensor buffers and drains while the LAN path remains unaffected | covered @ page.blocks[0].tabs[4].sections[0].bullets[2] |
| 71 | failure | "Vigil down" | Motif retains safety events for retry and pages on-call while Atrium remains the backstop | covered @ page.blocks[0].tabs[4].sections[0].bullets[3] |
| 72 | failure | "Track confusion" | merging people demotes confidence and pauses safety classification while automations continue | covered @ page.blocks[0].tabs[4].sections[0].bullets[4] |
| 73 | number | "two people merging into one track" | track-confusion case has two people | covered @ page.blocks[0].tabs[4].sections[0].bullets[4] |
| 74 | number | "two people merging into one track" | track-confusion case merges into one track | covered @ page.blocks[0].tabs[4].sections[0].bullets[4] |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)
- Ledger row 5 is uncovered: the HLD's Iris MW 3TX count has no location in the spec.
- Ledger row 6 is uncovered: the HLD's Iris MW 4RX count has no location in the spec.
- Ledger row 10 is uncovered: the HLD's dual-core Aria MCU count has no location in the spec.
- Ledger row 11 is uncovered: the HLD's 16 MB Aria MCU flash capacity has no location in the spec.
- Ledger row 18 is uncovered: Clef Auth and its authentication responsibilities have no location in the spec.
- Ledger row 26 is uncovered: Cadence and its routine compilation and sync responsibilities have no location in the spec.
- The heading "Four zones, one track" derives numeric counts not stated verbatim by the HLD at page.blocks[0].tabs[0].sections[0].heading.
- The edge label "PUB evt/zone" introduces a shortened topic identifier instead of the HLD's `evt/room/zone` at page.blocks[0].tabs[0].sections[0].diagram.edges[1].label.
- The initial radar status "SCANNING" is not stated by the HLD at page.blocks[0].tabs[0].sections[0].diagram.panels[0].initial.status.
- The `int` kind asserts a service call for Iris MW→Aria MCU although the HLD names no such mechanism at page.blocks[0].tabs[0].sections[0].diagram.edges[0].kind.
- The `int` kind asserts a service call for Motif→Overture although the HLD names no mechanism at page.blocks[0].tabs[0].sections[0].diagram.edges[5].kind.
- The `https` kind asserts HTTPS for Overture→Resident Phone although the HLD names no app transport at page.blocks[0].tabs[0].sections[0].diagram.edges[6].kind.
- The protocol label "PSTN voice" makes every `tel` edge a PSTN claim, while the HLD states only a telephony bridge and dialing, at page.protocols.tel.label.
- The invented Vanity zone has no HLD support at page.blocks[0].tabs[1].sections[0].diagram.panels[0].zones[1].
- The `int` kind asserts a service call for Iris MW→Aria MCU although the HLD names no such mechanism at page.blocks[0].tabs[1].sections[0].diagram.edges[0].kind.
- The `int` kind asserts a service call for Motif→Vigil although the HLD names no mechanism at page.blocks[0].tabs[1].sections[0].diagram.edges[3].kind.
- The `int` kind asserts a service call for Vigil→Encore although the HLD names no mechanism at page.blocks[0].tabs[1].sections[0].diagram.edges[4].kind.
- The `https` kind asserts HTTPS for Encore→Resident Phone although the HLD names no push transport at page.blocks[0].tabs[1].sections[0].diagram.edges[5].kind.
- The Vigil panel enters CHECK-IN on the case-open beat, before the HLD's following check-in beat, at page.blocks[0].tabs[1].sections[0].diagram.steps[2].panels.vs.state.
- The sentence "one sensor, two sampling modes, one morning summary" introduces derived counts not stated verbatim by the HLD at page.blocks[0].tabs[2].sections[0].text[0].
- The `int` kind asserts a service call for Iris MW→Aria MCU although the HLD names no such mechanism at page.blocks[0].tabs[2].sections[0].diagram.edges[0].kind.
- The `int` kind asserts a service call for Tempo→Encore although the HLD names no mechanism at page.blocks[0].tabs[2].sections[0].diagram.edges[3].kind.
- The `https` kind asserts HTTPS for Encore→Resident Phone although the HLD names no push transport at page.blocks[0].tabs[2].sections[0].diagram.edges[4].kind.
- The derived duration "8 h 30 m" is not stated by the HLD at page.blocks[0].tabs[2].sections[0].diagram.steps[4].panels.log.log[0].text.
- The Atrium LAN is asserted to use wifi and the Thread link is labeled a mesh without those facts in the HLD at page.blocks[0].tabs[3].sections[0].diagram.panels[0].links[1].transport and page.blocks[0].tabs[3].sections[0].diagram.panels[0].links[2].label.
- The buffer visualization invents 12 segments and write positions and mark ranges 0, 2, 3, 4, and 5 without an HLD segment size or event counts at page.blocks[0].tabs[3].sections[0].diagram.panels[1].segments and page.blocks[0].tabs[3].sections[0].diagram.steps[3].panels.sf through page.blocks[0].tabs[3].sections[0].diagram.steps[6].panels.sf.
- The Motif→Tempo edge invents a direct hop and uses the unsupported `int` service-call kind where the HLD only states that Motif reconciles and Tempo recomputes at page.blocks[0].tabs[3].sections[0].diagram.edges[4].
- The `int` kind asserts a service call for Motif→Vigil although the HLD names no mechanism at page.blocks[0].tabs[3].sections[0].diagram.edges[5].kind.

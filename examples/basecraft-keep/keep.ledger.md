# Coverage ledger — Keep — Local AI Hub & Camera Fleet
source: docs/hlds/basecraft-keep/keep.md | version: n/a | updated: 09-09-2026 09:26

amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "The face gallery is enrolled on the LAN" | owner names a face crop; Facewright embeds and back-tags; only the gallery version counter reaches Rollbook | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 2 | flow | "Hub-local face recognition on a motion event" | PIR wake through local recognition, storage, metadata notice, push, and LAN/off-LAN viewing branch | covered @ page.blocks[0].tabs[0].sections[0].bullets |
| 3 | flow | "Cross-camera tracking and the one-clip incident" | driveway-to-yard-to-porch tracking, incident assembly, storage, and push | covered @ page.blocks[0].tabs[1].sections[0].bullets |
| 4 | flow | "Storage rotation with protected events" | high-water rotation, protected-event handling, rollbook write, and storage-page read | covered @ page.blocks[0].tabs[2].sections[0].bullets |
| 5 | flow | "Remote viewing brokered through the relay" | brokered off-LAN session, failed P2P, blind relay, decrypt, and teardown | covered @ page.blocks[0].tabs[3].sections[0].bullets |
| 6 | flow | "the hub pulls images and re-serves cameras" | Foundry stages firmware; the hub pulls it and re-serves cameras | covered @ page.blocks[0].tabs[0].sections[0].text[1] |
| 7 | contract | "Control-channel event notice" | hub → Beacon protobuf-over-TLS notice with hub_id, event_id, cam, kind, who, ts, and clip_ref | uncovered |
| 8 | contract | "Relay session ticket" | Beacon → app and hub ticket with ticket_id, hub_id, relay, expires, and hmac | covered @ page.blocks[0].tabs[3].sections[0].contract |
| 9 | failure | "protected share exceeds its 25% cap" | Vaultd stops auto-protecting new incidents and flags the app | covered @ page.blocks[0].tabs[2].sections[0].bullets[4] |
| 10 | failure | "A direct P2P path fails" | symmetric NAT defeats direct P2P and both sides attach to Passage | covered @ page.blocks[0].tabs[3].sections[0].bullets[4] |
| 11 | failure | "WAN drops" | local recording, recognition, tracking, rotation, and LAN app continue; push and remote view stop | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 12 | failure | "Hub power fails" | B4 stages events and back-fills Vaultd after recovery; wired cameras go dark | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 13 | failure | "Disk pre-fail (SMART)" | Vaultd alerts and copies protected events to an available USB mirror first; no cloud copy | covered @ page.blocks[0].tabs[4].sections[0].bullets[2] |
| 14 | failure | "Camera Wi-Fi weak" | stream downshifts, then Fleetd selects snapshot-burst below threshold | covered @ page.blocks[0].tabs[4].sections[0].bullets[3] |
| 15 | failure | "Beacon outage" | local operation remains; remote view fails closed with no third path | covered @ page.blocks[0].tabs[4].sections[0].bullets[4] |
| 16 | service | "Keep K2 hub" | wall-powered local hub hosts the on-hub flow actors and storage | covered @ page.blocks[0].tabs[0].sections[0].diagram.groups.hub |
| 17 | service | "Lookout B4's LP wake controller" | battery camera wakes on PIR, encodes, and streams | covered @ page.blocks[0].tabs[0].sections[0].diagram.groups.cam |
| 18 | service | "LB-LP0 wake controller" | always-on PIR controller gates the video SoC and raises its rail | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.lp |
| 19 | service | "LB-AP2 video SoC" | video SoC boots and encodes the camera stream | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.soc |
| 20 | service | "Facet NPU" | hub neural accelerator runs Facewright embeddings | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.facew.sub |
| 21 | service | "basecraft-cloud — signaling plane" | named cloud component carries signaling only and never video | uncovered |
| 22 | service | "The hub notifies Beacon" | Beacon brokers sessions, receives hub metadata, and routes notices | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.beacon |
| 23 | service | "Passage forwards encrypted frames" | Passage is the blind relay and cannot decrypt media | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.passage |
| 24 | service | "checks ownership with Rollbook" | Rollbook checks hub ownership for remote sessions and receives gallery version only | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.rollbook |
| 25 | service | "hands the notice to Crier" | Crier fans out text-only push notifications | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.crier |
| 26 | service | "Foundry — firmware image staging" | Foundry stages firmware images for the hub to pull and re-serve | covered @ page.blocks[0].tabs[0].sections[0].text[1] |
| 27 | service | "Fleetd hands boxed frames" | Fleetd supervises LAN camera links, passes boxed frames, and fans out wake commands | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.fleetd |
| 28 | service | "Facewright crops the face" | Facewright embeds faces, matches the gallery, and passes identity to Vaultd | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.facew |
| 29 | service | "event reaches Stitcher" | Stitcher correlates the cross-camera track and assembles the incident clip | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.stitch |
| 30 | service | "Vaultd writes the clip" | Vaultd stores, indexes, rotates, and protects recordings | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.vault |
| 31 | service | "control channel to Porter" | Porter handles the hub side of remote viewing, session keys, and stream encryption | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.porter |
| 32 | number | "up to 16 Lookout cameras" | hub fleet capacity is up to 16 cameras | uncovered |
| 33 | number | "4× Cortex-A55" | hub CPU has four Cortex-A55 cores | uncovered |
| 34 | number | "6-TOPS" | Facet NPU capacity is 6 TOPS | uncovered |
| 35 | number | "4 GB" | hub RAM capacity is 4 GB | uncovered |
| 36 | number | "one 3.5" HDD bay" | hub has one HDD bay | uncovered |
| 37 | number | "3.5" HDD bay" | HDD bay size is 3.5 inches | uncovered |
| 38 | number | "8 TB" | installed HDD capacity is 8 TB | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.disk.title |
| 39 | number | "16 TB max" | HDD maximum capacity is 16 TB | uncovered |
| 40 | number | "6 µA sleep" | LB-LP0 sleep draw is 6 µA | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.lp.sub |
| 41 | number | "2K encode" | LB-AP2 encoding resolution is 2K | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.soc.sub |
| 42 | number | "500 ms boot" | LB-AP2 boot duration is 500 ms | uncovered |
| 43 | number | "200 MB flash" | B4 staging flash capacity is 200 MB | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 44 | number | "single LB-AP2" | each wired Lookout W2 and D3 has one LB-AP2 | uncovered |
| 45 | number | "34 ms/frame" | Facewright embedding duration is 34 ms per frame | covered @ page.blocks[0].tabs[0].sections[0].bullets[3] |
| 46 | number | "score 0.91" | Dana gallery match score is 0.91 | covered @ page.blocks[0].tabs[0].sections[0].bullets[4] |
| 47 | number | "closes segment 1" | driveway portion is segment 1 | covered @ page.blocks[0].tabs[1].sections[0].bullets[3] |
| 48 | number | "at 0.87" | yard re-ID match score is 0.87 | covered @ page.blocks[0].tabs[1].sections[0].bullets[4] |
| 49 | number | "appends segment 2" | yard portion is segment 2 | covered @ page.blocks[0].tabs[1].sections[0].bullets[4] |
| 50 | number | "after 20 s" | track closes after 20 seconds without matches | covered @ page.blocks[0].tabs[1].sections[0].bullets[5] |
| 51 | number | "pulls the three segments" | Stitcher assembles three source segments | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 52 | number | "one incident clip" | the three segments become one incident clip | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 53 | number | "single event" | Vaultd stores the assembled clip as one event | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 54 | number | "One visitor crossed" | notification reports one visitor | covered @ page.blocks[0].tabs[1].sections[0].bullets[8] |
| 55 | number | "3 cameras" | notification reports three crossed cameras | covered @ page.blocks[0].tabs[1].sections[0].bullets[8] |
| 56 | number | "48 s clip ready" | assembled clip duration is 48 seconds | covered @ page.blocks[0].tabs[1].sections[0].bullets[8] |
| 57 | number | "92% high-water mark" | rotation begins above 92% disk fill | covered @ page.blocks[0].tabs[2].sections[0].bullets[0] |
| 58 | number | "85% low-water mark" | unlinking continues until 85% disk fill | covered @ page.blocks[0].tabs[2].sections[0].bullets[2] |
| 59 | number | "25% cap" | protected-share cap is 25% | covered @ page.blocks[0].tabs[2].sections[0].bullets[4] |
| 60 | number | "62 days on disk" | storage page reports 62 days retained | covered @ page.blocks[0].tabs[2].sections[0].bullets[6] |
| 61 | number | "oldest May 3" | storage page reports May 3 as the oldest surviving day | covered @ page.blocks[0].tabs[2].sections[0].bullets[6] |
| 62 | number | "214 protected" | storage page reports 214 protected items | covered @ page.blocks[0].tabs[2].sections[0].bullets[6] |
| 63 | number | "cannot decrypt one" | Passage cannot decrypt even one encrypted frame | covered @ page.blocks[0].tabs[3].sections[0].bullets[6] |
| 64 | number | "120 s validity" | relay session ticket validity is 120 seconds | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[3].g |
| 65 | number | "up to ~15 events" | B4 can stage approximately 15 events during hub power loss | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 66 | permalink | "b4/lp0/wake.c#L44" | LB-LP0 wake implementation | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.lp.link |
| 67 | permalink | "services/beacon/broker.go#L233" | Beacon broker implementation | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.beacon.link |
| 68 | permalink | "services/passage/relay.go#L57" | Passage relay implementation | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.passage.link |
| 69 | permalink | "daemons/fleetd/pair.go#L61" | Fleetd pairing implementation | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.fleetd.link |
| 70 | permalink | "daemons/facewright/gallery.rs#L118" | Facewright gallery implementation | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.facew.link |
| 71 | permalink | "daemons/stitcher/track.rs#L204" | Stitcher tracking implementation | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.stitch.link |
| 72 | permalink | "daemons/vaultd/rotate.go#L87" | Vaultd rotation implementation | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.vault.link |
| 73 | permalink | "daemons/porter/session.go#L142" | Porter session implementation | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.porter.link |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)
- Uncovered row 7: `protobuf over TLS` is absent from `page.blocks[0].tabs[0].sections[0].contract`, while `page.blocks[0].tabs[0].sections[0].diagram.edges[4]` renders the notice as Fleetd → Beacon over HTTPS instead of the HLD's hub → Beacon protobuf-over-TLS contract.
- Uncovered row 21: the proper-named `basecraft-cloud` signaling-plane component is not named anywhere in the spec; the generic phrase `the cloud` appears at `page.blocks[0].tabs[3].sections[0].bullets[5]`.
- Uncovered row 32: the HLD's `up to 16 Lookout cameras` fleet capacity is absent from the spec.
- Uncovered row 33: the HLD's four-core (`4× Cortex-A55`) CPU count is absent from the spec.
- Uncovered row 34: the HLD's `6-TOPS` Facet NPU capacity is absent from the spec.
- Uncovered row 35: the HLD's `4 GB` RAM capacity is absent from the spec.
- Uncovered row 36: the HLD's count of one HDD bay is absent from the spec.
- Uncovered row 37: the HLD's `3.5"` HDD-bay size is absent from the spec.
- Uncovered row 39: the HLD's `16 TB max` HDD capacity is absent from the spec.
- Uncovered row 42: the HLD's `500 ms` LB-AP2 boot duration is absent from the spec.
- Uncovered row 44: the HLD's one-LB-AP2-per-wired-camera count is absent from the spec.
- The authored `Name at the door` label at `page.blocks[0].tabs[0].label` and `page.blocks[0].tabs[0].sections[0].heading` introduces a door location; the HLD locates Dana at the driveway.
- The `person-at-door-night` scene at `page.blocks[0].tabs[0].sections[0].diagram.panels[0].scene` introduces a door and nighttime, neither stated by the HLD.
- The `service call` kind at `page.blocks[0].tabs[0].sections[0].diagram.edges[0].kind` is unsupported for the LP-controller → video-SoC power-rail wake.
- The `service call` kind at `page.blocks[0].tabs[0].sections[0].diagram.edges[2].kind` is unsupported; the HLD does not state the Fleetd → Facewright transport.
- The `service call` kind at `page.blocks[0].tabs[0].sections[0].diagram.edges[3].kind` is unsupported; the HLD does not state the Facewright → Vaultd transport.
- The `service call` kind at `page.blocks[0].tabs[0].sections[0].diagram.edges[5].kind` is unsupported; the HLD does not state the Beacon → Crier transport.
- The `HTTPS` kind at `page.blocks[0].tabs[0].sections[0].diagram.edges[6].kind` is unsupported; the HLD says Crier pushes to the phone but does not name HTTPS.
- The authored `Hand the runner off` label at `page.blocks[0].tabs[1].label` and `page.blocks[0].tabs[1].sections[0].heading` characterizes the subject as a runner, which the HLD does not state.
- `segment 3` at `page.blocks[0].tabs[1].sections[0].diagram.nodes.porch.sub` and `page.blocks[0].tabs[1].sections[0].diagram.edges[5].label` is an invented sequence identifier; the HLD names segment 1 and segment 2, then only says there are three segments.
- The `LAN video` kind at `page.blocks[0].tabs[1].sections[0].diagram.edges[0].kind` is unsupported; the HLD does not state the driveway-camera → Stitcher transport.
- The `service call` kind at `page.blocks[0].tabs[1].sections[0].diagram.edges[1].kind` is unsupported; the HLD does not state the Stitcher → Fleetd transport.
- The `service call` kind at `page.blocks[0].tabs[1].sections[0].diagram.edges[2].kind` is unsupported; the HLD does not state the Fleetd → yard-camera wake transport.
- The `service call` kind at `page.blocks[0].tabs[1].sections[0].diagram.edges[3].kind` is unsupported; the HLD does not state the Fleetd → porch-camera wake transport.
- The `LAN video` kind at `page.blocks[0].tabs[1].sections[0].diagram.edges[4].kind` is unsupported; the HLD does not state the yard-camera → Stitcher transport.
- The `LAN video` kind at `page.blocks[0].tabs[1].sections[0].diagram.edges[5].kind` is unsupported; the HLD does not state the porch-camera → Stitcher transport.
- The `service call` kind at `page.blocks[0].tabs[1].sections[0].diagram.edges[6].kind` is unsupported; the HLD does not state the Stitcher → Vaultd transport.
- The Vaultd → Crier HTTPS edge at `page.blocks[0].tabs[1].sections[0].diagram.edges[7]` is unsupported; the HLD names Crier as the push actor but gives neither this upstream actor/direction nor HTTPS.
- The `Doorbell` / `wired` tile at `page.blocks[0].tabs[1].sections[0].diagram.panels[0].tiles[3]` and `page.blocks[0].tabs[1].sections[0].diagram.panels[0].initial.door` does not participate in the rendered cross-camera flow and has no ledger row.
- `OPEN` at `page.blocks[0].tabs[1].sections[0].diagram.panels[1].initial.state` opens the track before the first narrative event that causes Stitcher to open it.
- At `page.blocks[0].tabs[1].sections[0].diagram.steps[5]`, the track is `CLOSED` while the yard's `TRACKING` state from `page.blocks[0].tabs[1].sections[0].diagram.steps[4].panels.fleet.yard.state` persists and the porch is patched to `TRACKING` at `page.blocks[0].tabs[1].sections[0].diagram.steps[5].panels.fleet.porch.state`; both remain active until step 6 despite the HLD closing the track at this beat.
- The authored `The disk never fills` label at `page.blocks[0].tabs[2].label` and `page.blocks[0].tabs[2].sections[0].heading` asserts an absolute outcome the HLD does not state.
- The `LAN video` kind at `page.blocks[0].tabs[2].sections[0].diagram.edges[0].kind` is unsupported; the HLD does not state the camera → Vaultd segment transport.
- The `service call` kind at `page.blocks[0].tabs[2].sections[0].diagram.edges[1].kind` is unsupported for Vaultd → disk I/O.
- The `HTTPS` kind at `page.blocks[0].tabs[2].sections[0].diagram.edges[2].kind` is unsupported; the HLD says the app reads the rotation rollbook but does not name HTTPS.
- The gauge maximum `100` at `page.blocks[0].tabs[2].sections[0].diagram.panels[0].max` has no HLD number provenance.
- The initial gauge value `92` at `page.blocks[0].tabs[2].sections[0].diagram.panels[0].initial.value` places disk fill at the high-water mark before step 0 narrates the crossing.
- `scan from May 3` at `page.blocks[0].tabs[2].sections[0].diagram.steps[1].panels.log.log[0].text` turns the reported oldest surviving day into the scan's starting point, which the HLD does not state.
- The authored `Seen from afar, read by no one` label at `page.blocks[0].tabs[3].label` and `page.blocks[0].tabs[3].sections[0].heading` conflicts with the HLD's statement that the owner app decrypts and renders the stream.
- The `HTTPS` kind at `page.blocks[0].tabs[3].sections[0].diagram.edges[0].kind` is unsupported; the HLD does not state the off-LAN app → Beacon session-request transport.
- The `service call` kind at `page.blocks[0].tabs[3].sections[0].diagram.edges[1].kind` is unsupported; the HLD does not state the Beacon → Rollbook transport.
- The `HTTPS` kind at `page.blocks[0].tabs[3].sections[0].diagram.edges[2].kind` is unsupported; the HLD specifies the hub's persistent TLS control channel, not HTTPS.
- `Direct P2P probe` at `page.blocks[0].tabs[3].sections[0].diagram.steps[3].text` and `NAT probe timeout` at `page.blocks[0].tabs[3].sections[0].diagram.steps[3].panels.sess.via` add probe and timeout details not stated by the HLD.
- `REQUEST` at `page.blocks[0].tabs[3].sections[0].diagram.panels[1].initial.state` places the session in request state before step 0 narrates the app's request.
- `LIVE` at `page.blocks[0].tabs[3].sections[0].diagram.steps[7].panels.sess.state` remains the final folded session state even though `page.blocks[0].tabs[3].sections[0].bullets[8]` subsequently tears the session down.

# Coverage ledger — Bastion — PoE Camera Fleet & Stronghold NVR
source: docs/hlds/gridseye-bastion/bastion.md | version: n/a | updated: 09-10-2026
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Edge detection, NVR second opinion" | continuous recording, edge detection, NVR verification, confirmation, push, and tunneled clip playback | covered @ page.blocks[1].tabs[0].sections[0] |
| 2 | flow | "Staged firmware rollout" | publish, poll and verify, canary, observe, waves, halt, rollback, and mixed-version pinning | covered @ page.blocks[1].tabs[1].sections[0] |
| 3 | flow | "Grid outage on the UPS power domain" | on-battery transition, tier shedding, critical flush, restoration, gap marking, and camera re-adoption | covered @ page.blocks[1].tabs[2].sections[0] |
| 4 | flow | "LAN-only viewing with the cloud unreachable" | WAN loss, local capture continuity, mDNS fallback, cached LAN auth, LAN TLS viewing, queued push, and recovery | covered @ page.blocks[1].tabs[3].sections[0] |
| 5 | contract | "Detection event — B6 camera → Muster" | LAN event channel detection payload: cam_id, event_id, ts, class, conf, clip, thumb, and npu | covered @ page.blocks[1].tabs[0].sections[0].contract |
| 6 | contract | "Rollout offer — Armory → B6 camera" | rollout offer payload: rollout_id, image, sha256, url, slot, deadline_s, and stage | covered @ page.blocks[1].tabs[1].sections[0].contract |
| 7 | contract | "The UPS also emits a 2 s USB-HID status frame" | UPS status frame fields: status, charge_pct, load_w, and runtime_s | covered @ page.blocks[1].tabs[2].sections[0].contract |
| 8 | failure | "a B6 is dead without PoE" | a B6 has no battery and loses operation without PoE | covered @ page.blocks[0].bullets[0].text |
| 9 | failure | "A wave-2 dome reboot-loops" | a rollout wave camera reboot-loops, halting offers and triggering rollback | covered @ page.blocks[1].tabs[1].sections[0].bullets[7] |
| 10 | failure | "WAN/cloud loss" | capture, verification, and retention continue; viewing becomes LAN-only and push waits for tunnel recovery | covered @ page.blocks[1].tabs[3].sections[0] |
| 11 | failure | "Grid power loss" | UPS tier shedding applies; without UPS, a hard cut can lose the open segment and journal replay flags the gap | covered @ page.blocks[1].tabs[2].sections[0] |
| 12 | failure | "Disk failure" | mirror degrades to one disk with a persistent banner; a second failure stops recording without corrupting the index | covered @ page.blocks[1].tabs[0].sections[0].bullets[9] |
| 13 | failure | "Camera offline" | one camera is marked offline; peers continue, and return resumes live without local backfill | covered @ page.blocks[1].tabs[1].sections[0].bullets[10] |
| 14 | failure | "Forge unreachable" | rollout pauses in place while the fleet remains runnable at pinned mixed versions | covered @ page.blocks[1].tabs[1].sections[0].bullets[11] |
| 15 | failure | "Oracle down" | candidate events still record and index as unverified; notifications use edge confidence at lower priority | covered @ page.blocks[1].tabs[0].sections[0].bullets[10] |
| 16 | service | "B6 camera family" | B6 cameras continuously record, detect at the edge, receive firmware, report health, and depend on PoE | covered @ page.blocks[0].bullets[0].text |
| 17 | service | "Kestrel-V SoC" | Kestrel-V supplies the B6 edge NPU | covered @ page.blocks[0].bullets[0].text |
| 18 | service | "Stronghold NVR" | Stronghold is the local NVR appliance hosting recording, verification, playback, management, and power services | covered @ page.blocks[0].bullets[1].text |
| 19 | service | "Condor-X SoC" | Condor-X supplies the Stronghold NVR NPU | covered @ page.blocks[0].bullets[1].text |
| 20 | service | "the UPS switches to battery" | UPS supplies battery backup and reports power status to Quartermaster | covered @ page.blocks[1].tabs[2].sections[0].diagram.nodes.ups |
| 21 | service | "owner's phone" | the owner's phone receives push and accesses local or tunneled live view and playback | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.phone |
| 22 | service | "Muster (NVR)" | Muster handles adoption, fleet health, and the event and timeline index | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.muster |
| 23 | service | "Archivist (NVR)" | Archivist runs recording, the segment store, and mirror and journal handling | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.archivist |
| 24 | service | "Oracle (NVR)" | Oracle runs second-stage AI verification | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.oracle |
| 25 | service | "Gatehouse (NVR)" | Gatehouse provides the local web and app server, viewing, playback, and LAN authentication replica | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.gatehouse |
| 26 | service | "Quartermaster (NVR)" | Quartermaster integrates the UPS, sheds power tiers, and forecasts runtime | covered @ page.blocks[1].tabs[2].sections[0].diagram.nodes.quartermaster |
| 27 | service | "Armory (NVR)" | Armory stages and coordinates camera firmware rollouts | covered @ page.blocks[1].tabs[1].sections[0].diagram.nodes.armory |
| 28 | service | "Skylink (cloud)" | Skylink brokers remote-access tunnels and relays push notifications | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.skylink |
| 29 | service | "Keymaster (cloud)" | Keymaster supplies identity, SSO, device claim, and session re-validation | covered @ page.blocks[1].tabs[3].sections[0].diagram.nodes.keymaster |
| 30 | service | "Forge (cloud)" | Forge distributes signed firmware images and manifests | covered @ page.blocks[1].tabs[1].sections[0].diagram.nodes.forge |
| 31 | service | "Gridlog (cloud)" | Gridlog receives fleet health telemetry, crash logs, and the failed camera's log bundle | covered @ page.blocks[1].tabs[1].sections[0].bullets[9] |
| 32 | number | "four flows" | document scope contains four flows | covered @ page.blocks[0].text[1] |
| 33 | number | "example 14-camera small-business site" | example site has 14 cameras | covered @ page.blocks[0].text[1] |
| 34 | number | "8 MP sensor" | B6 sensor resolution is 8 MP | covered @ page.blocks[0].bullets[0].text |
| 35 | number | "1.5-TOPS edge NPU" | Kestrel-V edge NPU capacity is 1.5 TOPS | covered @ page.blocks[0].bullets[0].text |
| 36 | number | "PoE 802.3af" | standard B6 cameras use PoE 802.3af | covered @ page.blocks[0].bullets[0].text |
| 37 | number | "PTZ 802.3at" | PTZ uses PoE 802.3at | covered @ page.blocks[0].bullets[0].text |
| 38 | number | "dual A/B firmware" | B6 cameras have two firmware slots | covered @ page.blocks[0].bullets[0].text |
| 39 | number | "26-TOPS NPU" | Stronghold NVR NPU capacity is 26 TOPS | covered @ page.blocks[0].bullets[1].text |
| 40 | number | "16 GB RAM" | Stronghold NVR has 16 GB RAM | covered @ page.blocks[0].bullets[1].text |
| 41 | number | "2× 8 TB" | Stronghold NVR has two mirrored HDDs | covered @ page.blocks[0].bullets[1].text |
| 42 | number | "2× 8 TB" | each mirrored HDD has 8 TB capacity | covered @ page.blocks[0].bullets[1].text |
| 43 | number | "8-port PoE switch" | Stronghold NVR has an 8-port PoE switch | covered @ page.blocks[0].bullets[1].text |
| 44 | number | "120 W budget" | PoE switch budget is 120 W | covered @ page.blocks[0].bullets[1].text |
| 45 | number | "tier 1 (NVR core, disks, recording)" | power tier 1 never sheds | covered @ page.blocks[0].bullets[2].sub[0] |
| 46 | number | "interior cameras) sheds at low charge" | power tier 2 sheds at low charge | covered @ page.blocks[0].bullets[2].sub[1] |
| 47 | number | "tier 3 (IR, PTZ, chime, second-stage" | power tier 3 sheds immediately on grid loss | covered @ page.blocks[0].bullets[2].sub[2] |
| 48 | number | "0.71 confidence" | camera edge confidence is 0.71 | covered @ page.blocks[1].tabs[0].sections[0].bullets[1] |
| 49 | number | "surrounding 8 seconds of keyframes" | Oracle retrieves an 8-second keyframe window | covered @ page.blocks[1].tabs[0].sections[0].bullets[3] |
| 50 | number | "26-TOPS model" | Oracle runs the 26-TOPS model | covered @ page.blocks[1].tabs[0].sections[0].bullets[4] |
| 51 | number | "confidence rises to 0.96" | Oracle confidence result is 0.96 | covered @ page.blocks[1].tabs[0].sections[0].bullets[4] |
| 52 | number | "B6 firmware 3.2.0" | rollout target firmware version is 3.2.0 | covered @ page.blocks[1].tabs[1].sections[0].bullets[0] |
| 53 | number | "downloads the image once" | Armory downloads one image copy | covered @ page.blocks[1].tabs[1].sections[0].bullets[1] |
| 54 | number | "one camera per hardware model" | canary cohort contains one camera per hardware model | covered @ page.blocks[1].tabs[1].sections[0].bullets[2] |
| 55 | number | "3 of 14" | canary cohort contains 3 cameras | covered @ page.blocks[1].tabs[1].sections[0].bullets[2] |
| 56 | number | "3 of 14" | rollout site total is 14 cameras | covered @ page.blocks[1].tabs[1].sections[0].bullets[2] |
| 57 | number | "2-minute boot deadline" | canary boot-report deadline is 2 minutes | covered @ page.blocks[1].tabs[1].sections[0].bullets[4] |
| 58 | number | "24-hour observe window" | canary observation lasts 24 hours | covered @ page.blocks[1].tabs[1].sections[0].bullets[5] |
| 59 | number | "waves of 4 cameras" | rollout expansion wave size is 4 cameras | covered @ page.blocks[1].tabs[1].sections[0].bullets[6] |
| 60 | number | "30-minute soak" | inter-wave soak lasts 30 minutes | covered @ page.blocks[1].tabs[1].sections[0].bullets[6] |
| 61 | number | "wave-2 dome" | reboot-loop occurs in rollout wave 2 | covered @ page.blocks[1].tabs[1].sections[0].bullets[7] |
| 62 | number | "rollback is one reboot" | rollback takes one reboot | covered @ page.blocks[1].tabs[1].sections[0].bullets[8] |
| 63 | number | "pack at 100%" | UPS charge is 100 percent at the first runtime calculation | covered @ page.blocks[1].tabs[2].sections[0].bullets[1] |
| 64 | number | "present 96 W draw" | initial on-battery draw is 96 W | covered @ page.blocks[1].tabs[2].sections[0].bullets[1] |
| 65 | number | "41 minutes" | initial runtime forecast is 41 minutes | covered @ page.blocks[1].tabs[2].sections[0].bullets[1] |
| 66 | number | "sheds tier 3" | first load-shedding action targets tier 3 | covered @ page.blocks[1].tabs[2].sections[0].bullets[2] |
| 67 | number | "draw falls to 71 W" | draw after IR, PTZ, and chime shedding is 71 W | covered @ page.blocks[1].tabs[2].sections[0].bullets[2] |
| 68 | number | "draw 58 W" | draw after Oracle suspension is 58 W | covered @ page.blocks[1].tabs[2].sections[0].bullets[3] |
| 69 | number | "forecast 68 minutes" | forecast after Oracle suspension is 68 minutes | covered @ page.blocks[1].tabs[2].sections[0].bullets[3] |
| 70 | number | "all 14 cameras powered" | all 14 cameras remain on before tier 2 shedding | covered @ page.blocks[1].tabs[2].sections[0].bullets[4] |
| 71 | number | "on battery — ~68 min" | app displays an approximately 68-minute runtime forecast | covered @ page.blocks[1].tabs[2].sections[0].bullets[5] |
| 72 | number | "At 30% charge" | tier 2 shedding threshold is 30 percent charge | covered @ page.blocks[1].tabs[2].sections[0].bullets[6] |
| 73 | number | "sheds tier 2" | low-charge load-shedding action targets tier 2 | covered @ page.blocks[1].tabs[2].sections[0].bullets[6] |
| 74 | number | "6 interior cameras power down" | tier 2 shedding powers down 6 interior cameras | covered @ page.blocks[1].tabs[2].sections[0].bullets[6] |
| 75 | number | "leaving the 8 perimeter cameras" | tier 2 shedding leaves 8 perimeter cameras running | covered @ page.blocks[1].tabs[2].sections[0].bullets[6] |
| 76 | number | "draw 33 W" | draw after tier 2 shedding is 33 W | covered @ page.blocks[1].tabs[2].sections[0].bullets[6] |
| 77 | number | "At 12%" | Archivist critical flush threshold is 12 percent charge | covered @ page.blocks[1].tabs[2].sections[0].bullets[7] |
| 78 | number | "Mains returns at 9%" | mains returns at 9 percent charge | covered @ page.blocks[1].tabs[2].sections[0].bullets[8] |
| 79 | number | "six powered-down cameras" | Muster re-adopts 6 powered-down cameras | covered @ page.blocks[1].tabs[2].sections[0].bullets[9] |
| 80 | number | "`0.71`" | detection contract sample confidence is 0.71 | covered @ page.blocks[1].tabs[0].sections[0].contract.fields[4].v |
| 81 | number | "edge confidence, 0–1" | detection confidence range is 0 through 1 | covered @ page.blocks[1].tabs[0].sections[0].contract.fields[4].g |
| 82 | number | "`{"seg":"s-88412","off_ms":4180}`" | detection contract sample playback offset is 4180 ms | covered @ page.blocks[1].tabs[0].sections[0].contract.fields[5].v |
| 83 | number | "`kestrel/1.5t/m14`" | detection contract sample identifies 1.5-TOPS Kestrel hardware | covered @ page.blocks[1].tabs[0].sections[0].contract.fields[7].v |
| 84 | number | "`120`" | rollout offer boot-report deadline is 120 seconds | covered @ page.blocks[1].tabs[1].sections[0].contract.fields[5].v |
| 85 | number | "2 s USB-HID status frame" | UPS status frame cadence is 2 seconds | covered @ page.blocks[1].tabs[2].sections[0].contract.note |
| 86 | number | "single-disk" | first disk failure leaves one operating disk | covered @ page.blocks[1].tabs[0].sections[0].bullets[9] |
| 87 | number | "a second failure stops recording" | the second disk failure stops recording | covered @ page.blocks[1].tabs[0].sections[0].bullets[9] |
| 88 | number | "costs at most the open segment" | a hard cut without UPS loses at most one open segment | covered @ page.blocks[1].tabs[2].sections[0].bullets[10] |
| 89 | permalink | "Muster (NVR)" | Muster implementation permalink | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.muster.link |
| 90 | permalink | "Archivist (NVR)" | Archivist implementation permalink | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.archivist.link |
| 91 | permalink | "Oracle (NVR)" | Oracle implementation permalink | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.oracle.link |
| 92 | permalink | "Gatehouse (NVR)" | Gatehouse implementation permalink | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.gatehouse.link |
| 93 | permalink | "Quartermaster (NVR)" | Quartermaster implementation permalink | covered @ page.blocks[1].tabs[2].sections[0].diagram.nodes.quartermaster.link |
| 94 | permalink | "Armory (NVR)" | Armory implementation permalink | covered @ page.blocks[1].tabs[1].sections[0].diagram.nodes.armory.link |
| 95 | permalink | "Skylink (cloud)" | Skylink implementation permalink | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.skylink.link |
| 96 | permalink | "Keymaster (cloud)" | Keymaster implementation permalink | covered @ page.blocks[1].tabs[3].sections[0].diagram.nodes.keymaster.link |
| 97 | permalink | "Forge (cloud)" | Forge implementation permalink | covered @ page.blocks[1].tabs[1].sections[0].diagram.nodes.forge.link |
| 98 | permalink | "Gridlog (cloud)" | Gridlog implementation permalink | covered @ page.blocks[1].tabs[1].sections[0].bullets[9] |
| 99 | amendment | amendment A1 | the nightly Armory→Forge image pull is labeled "Database import" (no tool named in the HLD) | covered @ page.protocols.dbimport |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | What tool runs Armory's nightly poll of Forge? The HLD names none; the page had shown a real product brand taken from an earlier pilot answer. | Remove the brand; label the job "Database import". | 09-10-2026 | page.protocols.dbimport; page.blocks[1].tabs[1].sections[0].diagram.edges[0].kind; page.blocks[1].tabs[1].sections[0].diagram.steps[1].text | active |

## Flags (operator review)
- The internal transport kind `int` at `page.blocks[1].tabs[0].sections[0].diagram.edges[2].kind` is not named by the HLD for Muster → Oracle.
- The internal transport kind `int` at `page.blocks[1].tabs[0].sections[0].diagram.edges[3].kind` is not named by the HLD for Oracle → Archivist.
- The internal transport kind `int` at `page.blocks[1].tabs[0].sections[0].diagram.edges[4].kind` is not named by the HLD for Oracle → Muster.
- The internal transport kind `int` at `page.blocks[1].tabs[0].sections[0].diagram.edges[5].kind` is not named by the HLD for Muster → Gatehouse.
- The internal transport kind `int` at `page.blocks[1].tabs[1].sections[0].diagram.edges[2].kind` is not named by the HLD for Camera Fleet → Muster.
- The internal transport kind `int` at `page.blocks[1].tabs[1].sections[0].diagram.edges[3].kind` is not named by the HLD for Armory → Muster.
- The internal transport kind `int` at `page.blocks[1].tabs[2].sections[0].diagram.edges[1].kind` is not named by the HLD for Quartermaster → Oracle.
- The internal transport kind `int` at `page.blocks[1].tabs[2].sections[0].diagram.edges[2].kind` is not named by the HLD for Quartermaster → Gatehouse.
- The internal transport kind `int` at `page.blocks[1].tabs[2].sections[0].diagram.edges[3].kind` is not named by the HLD for Quartermaster → Archivist.
- The HTTPS transport at `page.blocks[1].tabs[3].sections[0].diagram.edges[4].kind` is not named by the HLD for Gatehouse → Keymaster session re-validation.
- The camera subtype `bullet` at `page.blocks[1].tabs[0].sections[0].diagram.nodes.cam.sub` is not assigned to the detection-flow camera by the HLD.
- The `package-drop` scene at `page.blocks[1].tabs[0].sections[0].diagram.panels[2].scene` adds an action beyond the HLD’s person+package classification.
- The 12-cell buffer and head index 11 at `page.blocks[1].tabs[0].sections[0].diagram.panels[0].segments` and `page.blocks[1].tabs[0].sections[0].diagram.panels[0].initial.head` have no HLD quantity.
- The protected-window cell indices 2–9 at `page.blocks[1].tabs[0].sections[0].diagram.steps[3].panels.seg.mark` and `page.blocks[1].tabs[0].sections[0].diagram.steps[5].panels.seg.mark` assume an unstated mapping between the HLD’s 8-second window and buffer cells.
- The Wave 3 cohort and its derived size of 3 cameras at `page.blocks[1].tabs[1].sections[0].diagram.panels[0].tiles[5]` and `page.blocks[1].tabs[1].sections[0].diagram.panels[0].initial.wave3.sub` are not stated by the HLD.
- The exact payload value `on_battery` at `page.blocks[1].tabs[2].sections[0].contract.fields[0].v` and `page.blocks[1].tabs[2].sections[0].diagram.steps[0].panels.log.log[0].text` is not supplied by the HLD for the `status` field.
- The `charge_pct` range `0–100` at `page.blocks[1].tabs[2].sections[0].contract.fields[1].g` is not supplied by the HLD.
- The exact `runtime_s` sample value `2460` at `page.blocks[1].tabs[2].sections[0].contract.fields[3].v` is derived from 41 minutes rather than stated by the HLD.
- The exact payload value `line_power` at `page.blocks[1].tabs[2].sections[0].diagram.steps[8].panels.log.log[0].text` is not supplied by the HLD for the `status` field.
- The initial UPS charge `100` and draw `96` at `page.blocks[1].tabs[2].sections[0].diagram.panels[0].initial.charge` and `page.blocks[1].tabs[2].sections[0].diagram.panels[1].initial.value` appear before the narrative step where Quartermaster reads those values.
- The WAN transport `ethernet` at `page.blocks[1].tabs[3].sections[0].diagram.panels[0].links[0].transport` is not identified by the HLD.
- The 4-bar WAN and wifi signal strengths at `page.blocks[1].tabs[3].sections[0].diagram.panels[0].initial`, `page.blocks[1].tabs[3].sections[0].diagram.steps[2].panels.net.lan.bars`, `page.blocks[1].tabs[3].sections[0].diagram.steps[5].panels.net.lan.bars`, and `page.blocks[1].tabs[3].sections[0].diagram.steps[7].panels.net.wan.bars` are not supplied by the HLD.
- The initially empty Gatehouse push outbox at `page.blocks[1].tabs[3].sections[0].diagram.panels[2].initial.state` is not stated by the HLD.

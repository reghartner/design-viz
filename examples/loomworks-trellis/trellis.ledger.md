# Coverage ledger — loomworks Trellis — Camera-as-Hub
source: docs/hlds/loomworks-trellis/trellis.md | version: n/a | updated: 09-09-2026 09:25
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Thread border-router failover" | Warp-triggered Trellis reboot, Bobbin takeover, sensor re-parent, event delivery, and Trellis rejoin | covered @ page.blocks[1].tabs[0].sections[0] |
| 2 | flow | "A Zigbee sensor event crosses the bridge" | W-12 open report crosses Weft-R and the Loom-V8 bridge to controllers and the local rule engine | covered @ page.blocks[1].tabs[1].sections[0] |
| 3 | flow | "Local automations through a full internet outage" | local person-detection automation continues during WAN loss and later flushes its notification | covered @ page.blocks[1].tabs[2].sections[0] |
| 4 | flow | "Commissioning one device into two fabrics" | one Thread sensor is commissioned into loomworks and partner fabrics without a reset | covered @ page.blocks[1].tabs[3].sections[0] |
| 5 | contract | "Bridged Matter report" | Trellis bridge → subscribed-controller LAN report field table | covered @ page.blocks[1].tabs[1].sections[0].contract |
| 6 | contract | "Zigbee sensor frame" | W-12 → Weft-R IAS Zone frame field table | covered @ page.blocks[1].tabs[1].sections[1].contract |
| 7 | failure | "Internet outage" | local automations, bridging, and recording continue while remote work queues or defers | covered @ page.blocks[1].tabs[2].sections[0].bullets[8].sub[0] |
| 8 | failure | "Trellis power loss (wifi variant)" | whole hub and Zigbee coordinator go down; Bobbin preserves Thread routing; gap events are lost | covered @ page.blocks[1].tabs[0].sections[0].bullets[8].sub[1] |
| 9 | failure | "No second border router" | sleepy Thread devices remain orphaned through a Trellis reboot until re-attach | covered @ page.blocks[1].tabs[0].sections[0].bullets[8].sub[0] |
| 10 | failure | "microSD failure" | recording falls back to RAM pre-roll and immediate Spool upload; app raises an alert | covered @ page.blocks[1].tabs[2].sections[0].bullets[8].sub[1] |
| 11 | failure | "Lattice down" | remote access is lost while same-LAN mDNS access and automations continue | covered @ page.blocks[1].tabs[2].sections[0].bullets[8].sub[2] |
| 12 | failure | "Zigbee interference" | Weft-R changes channel and broadcasts rejoin while bridged endpoint numbers persist | covered @ page.blocks[1].tabs[1].sections[0].bullets[7].sub[0] |
| 13 | failure | "Sensor battery low" | bridged PowerSource carries the level and Heddle notifies the owner | covered @ page.blocks[1].tabs[1].sections[0].bullets[7].sub[1] |
| 14 | service | "Trellis is loomworks' outdoor camera" | Trellis is the camera-hub central to the rendered flows | covered @ page.blocks[0].text[0] |
| 15 | service | "Loom-V8" | Loom-V8 hosts the bridge process that receives Weft-R's frame | covered @ page.blocks[1].tabs[1].sections[0].bullets[1] |
| 16 | service | "Weft-R" | Weft-R coordinates W-12's Zigbee report and forwards it to Loom-V8 | covered @ page.blocks[1].tabs[1].sections[0].diagram.nodes.weft |
| 17 | service | "Bobbin smart plug" | Bobbin becomes mesh leader and active border router during the Trellis reboot | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.bob |
| 18 | service | "Lattice" | Lattice provides the remote-access tunnel that drops and later returns | covered @ page.blocks[1].tabs[2].sections[0].diagram.nodes.lat |
| 19 | service | "Pattern" | Pattern synced the locally executed automation rule | covered @ page.blocks[1].tabs[2].sections[0].bullets[2] |
| 20 | service | "Graft" | Graft's certification-ledger mirror is used for attestation checking | covered @ page.blocks[1].tabs[3].sections[0].diagram.nodes.grf |
| 21 | service | "Warp" | Warp offers Trellis the firmware image that triggers the reboot flow | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.warp |
| 22 | service | "Spool" | Spool is the optional archive used after an outage or as microSD-failure fallback | covered @ page.blocks[1].tabs[2].sections[0].bullets[7] |
| 23 | service | "Heddle" | Heddle relays the queued notification and handles low-battery notification | covered @ page.blocks[1].tabs[2].sections[0].diagram.nodes.hed |
| 24 | service | "Zigbee window sensor W-12" | W-12 reports the open event that crosses the bridge | covered @ page.blocks[1].tabs[1].sections[0].diagram.nodes.w12 |
| 25 | service | "loomworks app" | the loomworks app scans the sensor QR code and hands the payload to Trellis | covered @ page.blocks[1].tabs[3].sections[0].diagram.nodes.lapp |
| 26 | number | "one device carries" | one Trellis device combines camera and hub roles | covered @ page.blocks[0].text[0] |
| 27 | number | "4 MP camera" | camera resolution is 4 MP | covered @ page.blocks[0].text[0] |
| 28 | number | "second Thread" | Bobbin supplies the second of two simultaneous Thread border routers | covered @ page.blocks[0].text[2] |
| 29 | number | "quad-core SoC" | Loom-V8 has four CPU cores | uncovered |
| 30 | number | "5 TOPS NPU" | Loom-V8 NPU capacity is 5 TOPS | uncovered |
| 31 | number | "512 GB" | maximum microSD capacity is 512 GB | uncovered |
| 32 | number | "wifi 2.4/5 GHz" | wifi supports 2.4 GHz | uncovered |
| 33 | number | "wifi 2.4/5 GHz" | wifi supports 5 GHz | uncovered |
| 34 | number | "gigabit PoE" | wired variant has gigabit PoE connectivity | uncovered |
| 35 | number | "endpoint 12" | W-12 maps to stable bridged Matter endpoint 12 | covered @ page.blocks[1].tabs[1].sections[0].text[0] |
| 36 | number | "At 23:10" | person detection occurs at 23:10 | covered @ page.blocks[1].tabs[2].sections[0].bullets[1] |
| 37 | number | "40 minutes later" | WAN outage lasts 40 minutes | covered @ page.blocks[1].tabs[2].sections[0].bullets[6] |
| 38 | number | "one device into two fabrics" | one sensor is commissioned | covered @ page.blocks[1].tabs[3].sections[0].heading |
| 39 | number | "one device into two fabrics" | the sensor joins two fabrics | covered @ page.blocks[1].tabs[3].sections[0].heading |
| 40 | number | "one-time passcode" | the open commissioning window uses a one-time passcode | covered @ page.blocks[1].tabs[3].sections[0].bullets[4] |
| 41 | number | "two independent fabric credential sets" | the sensor stores two independent fabric credential sets | covered @ page.blocks[1].tabs[3].sections[0].bullets[6] |
| 42 | number | "both controllers" | two controllers hold independent CASE subscriptions | covered @ page.blocks[1].tabs[3].sections[0].bullets[6] |
| 43 | number | "fabric 2" | the partner ecosystem receives credentials for fabric 2 | covered @ page.blocks[1].tabs[3].sections[0].bullets[5] |
| 44 | number | "data_version" | subscription consistency counter sample is 881 | covered @ page.blocks[1].tabs[1].sections[0].contract.fields[5] |
| 45 | number | "battery_pct" | sensor battery sample is 87 percent | covered @ page.blocks[1].tabs[1].sections[1].contract.fields[4] |
| 46 | number | "lqi" | sensor link-quality sample is 188 | covered @ page.blocks[1].tabs[1].sections[1].contract.fields[5] |
| 47 | permalink | "vision/pipeline.c#L212" | Loom-V8 camera-pipeline implementation link | covered @ page.blocks[1].tabs[1].sections[0].bullets[1] |
| 48 | permalink | "src/dual_stack.c#L94" | Weft-R dual-stack implementation link | covered @ page.blocks[1].tabs[1].sections[0].diagram.nodes.weft.link |
| 49 | permalink | "bobbin/br_secondary.c#L41" | Bobbin secondary-border-router implementation link | covered @ page.blocks[1].tabs[0].sections[0].diagram.nodes.bob.link |
| 50 | permalink | "lattice/tunnel.go#L133" | Lattice tunnel implementation link | covered @ page.blocks[1].tabs[2].sections[0].diagram.nodes.lat.link |
| 51 | permalink | "pattern/compile.go#L78" | Pattern compiler implementation link | covered @ page.blocks[1].tabs[2].sections[0].bullets[2] |
| 52 | permalink | "bridge/report.c#L167" | bridged Matter report implementation link | covered @ page.blocks[1].tabs[1].sections[0].contract.source |
| 53 | permalink | "src/ias_zone.c#L52" | Zigbee IAS Zone frame implementation link | covered @ page.blocks[1].tabs[1].sections[1].contract.source |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)
- Uncovered HLD row #29: "quad-core SoC" is not rendered anywhere in the spec.
- Uncovered HLD row #30: "5 TOPS NPU" is not rendered anywhere in the spec.
- Uncovered HLD row #31: "512 GB" is not rendered anywhere in the spec.
- Uncovered HLD row #32: 2.4 GHz wifi support is not rendered anywhere in the spec.
- Uncovered HLD row #33: 5 GHz wifi support is not rendered anywhere in the spec.
- Uncovered HLD row #34: gigabit PoE connectivity is not rendered anywhere in the spec.
- Spec-only identifier `BR-1` appears at `page.blocks[1].tabs[0].sections[0].diagram.nodes.tr.sub`; the HLD never assigns Trellis that ordinal identifier.
- Spec-only identifier `BR-2` appears at `page.blocks[1].tabs[0].sections[0].diagram.nodes.bob.sub`; the HLD calls Bobbin secondary but never assigns that identifier or the state "standby."
- `3rd-party fabric` at `page.blocks[1].tabs[0].sections[0].diagram.nodes.ctl.sub` is not stated by the HLD; this flow names only a third-party controller.
- `phone` at `page.blocks[1].tabs[0].sections[0].diagram.nodes.app.sub` is not stated for the partner app.
- The `https` kind at `page.blocks[1].tabs[0].sections[0].diagram.edges[0]` is unjustified; the HLD does not state how Warp delivers the firmware image.
- The `lan` kind at `page.blocks[1].tabs[0].sections[0].diagram.edges[2]` is unjustified; the HLD does not state the transport from Bobbin to the third-party controller.
- The `https` kind at `page.blocks[1].tabs[0].sections[0].diagram.edges[4]` is unjustified; the HLD does not state how the controller notifies the partner app.
- The Trellis→Bobbin Thread edge labeled `BR-2` at `page.blocks[1].tabs[0].sections[0].diagram.edges[5]` has no corresponding message in the HLD.
- Initial Bobbin border-router state `lost` at `page.blocks[1].tabs[0].sections[0].diagram.panels[0].initial.br2.state` is not stated by the HLD.
- `page.blocks[1].tabs[0].sections[0].diagram.steps[2]` says Bobbin activates its border-router function and sets it `ok` when the HLD places activation in the following step.
- `poll timeout` at `page.blocks[1].tabs[0].sections[0].diagram.steps[4].panels.orb.via` is not stated; the HLD says only that the poll fails.
- `phone` at `page.blocks[1].tabs[1].sections[0].diagram.nodes.papp.sub` is not stated for the partner app.
- The `int` kind at `page.blocks[1].tabs[1].sections[0].diagram.edges[1]` is unjustified; the HLD does not name the mechanism between Weft-R and the Loom-V8 bridge process.
- The `https` kind at `page.blocks[1].tabs[1].sections[0].diagram.edges[3]` is unjustified; the HLD does not state how the partner controller reaches its app.
- `rule engine: no rule matched` at `page.blocks[1].tabs[1].sections[0].diagram.steps[5].panels.rlog.log[0].text` is not stated by the HLD.
- The `https` kind at `page.blocks[1].tabs[2].sections[0].diagram.edges[0]` is unjustified; the HLD does not state the WAN-probe transport.
- The ISP-modem→Lattice `https` tunnel edge at `page.blocks[1].tabs[2].sections[0].diagram.edges[1]` has the wrong actor and an unstated transport; the HLD says Trellis re-establishes its Lattice tunnel.
- The `https` kind at `page.blocks[1].tabs[2].sections[0].diagram.edges[5]` is unjustified; the HLD does not state the transport from Trellis to Heddle.
- The `https` kind at `page.blocks[1].tabs[2].sections[0].diagram.edges[6]` is unjustified; the HLD does not state the transport from Heddle to the owner's phone.
- `wifi` at `page.blocks[1].tabs[2].sections[0].diagram.panels[0].links[0].transport` is unjustified for this outage flow; the HLD allows wifi or PoE and does not choose a variant here.
- Initial outbox state `empty` at `page.blocks[1].tabs[2].sections[0].diagram.panels[1].initial.state` is not stated by the HLD.
- `rule engine` at `page.blocks[1].tabs[2].sections[0].diagram.steps[5].panels.outb.from` invents the notification's enqueuing actor; the HLD does not name one.
- `second commissioning window` at `page.blocks[1].tabs[3].sections[0].text[0]` is not stated; the HLD describes one open commissioning window after initial pairing.
- `the fabric tiles fill in one at a time` at `page.blocks[1].tabs[3].sections[0].bullets[8]` is visualizer commentary, not an HLD fact.
- The Partner app/phone node at `page.blocks[1].tabs[3].sections[0].diagram.nodes.papp` is not part of the HLD's two-fabric commissioning flow.
- The `lan` kind at `page.blocks[1].tabs[3].sections[0].diagram.edges[0]` is unjustified; the HLD does not state how the loomworks app hands the setup payload to Trellis.
- The `https` kind at `page.blocks[1].tabs[3].sections[0].diagram.edges[2]` is unjustified; the HLD does not state how Trellis checks Graft's mirror.
- The Graft→Trellis `https` response labeled `cert ok` at `page.blocks[1].tabs[3].sections[0].diagram.edges[3]` is not stated by the HLD.
- `CASE fabric 1` at `page.blocks[1].tabs[3].sections[0].diagram.edges[4].label` invents a numeric identifier for the loomworks fabric.
- The Partner-app→partner-controller `https` edge labeled `add device` at `page.blocks[1].tabs[3].sections[0].diagram.edges[5]` is not present in the HLD's commissioning flow.
- The `lan` kind at `page.blocks[1].tabs[3].sections[0].diagram.edges[6]` is unjustified; the HLD says only that partner commissioning uses the existing network.
- `PASE #2` at `page.blocks[1].tabs[3].sections[0].diagram.edges[6].label` invents a numbered PASE identifier not used by the HLD.
- The `lan` kind at `page.blocks[1].tabs[3].sections[0].diagram.edges[7]` is unjustified; the HLD does not name the transport for the partner controller's CASE session.
- `FABRIC 1` and `FABRIC 1+2` at `page.blocks[1].tabs[3].sections[0].diagram.panels[0].states` invent a numeric identifier for the loomworks fabric.

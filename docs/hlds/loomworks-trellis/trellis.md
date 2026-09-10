# loomworks Trellis — Camera-as-Hub HLD

| | |
|---|---|
| Status | Draft 1 |
| Owners | loomworks device-platform |
| Last updated | 2026-09-05 |
| Reviewers | mesh-radio, home-apps |

## 1. Overview

Trellis is loomworks' outdoor camera that is also the home's hub: one device carries
a 4 MP camera with on-device AI, an embedded Zigbee coordinator, a Matter controller,
and a Thread border router. Video, recognition, and automations execute locally, so a
full internet outage costs only remote viewing and push notifications — rules keep
firing, clips keep landing on the microSD, and bridged Zigbee devices keep their
Matter identities. The companion Bobbin smart plug doubles as a second Thread border
router, so a Trellis reboot does not orphan the mesh. The loomworks cloud is
deliberately thin: rendezvous, rule sync, OTA, and optional clip archive — never in
the automation path.

## 2. Hardware

Trellis splits into a high-power vision side and an always-on radio side:

- **Loom-V8** (high-power side) — quad-core SoC with a 5 TOPS NPU; runs the camera
  pipeline and person/vehicle/face inference, the Matter controller, the
  Zigbee-to-Matter bridge, and the local rule engine.
  https://github.com/loomworks/trellis-fw/blob/main/vision/pipeline.c#L212
- **Weft-R** (low-power side) — 802.15.4 radio co-processor running the Zigbee
  coordinator and the Thread RCP, plus BLE for commissioning; it keeps mesh timing
  while Loom-V8 idles the vision path.
  https://github.com/loomworks/weft-radio/blob/main/src/dual_stack.c#L94
- Optics and I/O: 4 MP sensor, IR array + spotlight, mic/speaker, microSD to 512 GB.
- Connectivity/power: wifi 2.4/5 GHz, or gigabit PoE on the wired variant.
- **Bobbin smart plug** — mains-powered Thread router and secondary border router;
  the failover partner in §4.1.
  https://github.com/loomworks/trellis-fw/blob/main/bobbin/br_secondary.c#L41

## 3. Backend services

- **Lattice** — account and remote-access rendezvous; brokers end-to-end encrypted
  tunnels for remote viewing; never sees automation traffic.
  https://github.com/loomworks/lattice-cloud/blob/main/lattice/tunnel.go#L133
- **Pattern** — automation-rule authoring and sync; rules compile to the device rule
  engine and always execute locally.
  https://github.com/loomworks/lattice-cloud/blob/main/pattern/compile.go#L78
- **Graft** — commissioning assist; mirrors the Matter certification ledger for
  device-attestation checks during pairing.
- **Warp** — OTA distribution for Trellis and Bobbin firmware.
- **Spool** — optional cloud clip archive; the microSD is always primary.
- **Heddle** — push-notification relay with store-and-forward for offline homes.

## 4. Flows

### 4.1 Thread border-router failover

1. Warp offers Trellis a firmware image, and Trellis schedules the apply-and-reboot.
2. Trellis reboots; its Thread border-router and mesh-leader roles vanish from the network.
3. Bobbin detects the leader timeout, wins the election, and becomes the active mesh leader.
4. Bobbin activates its border-router function, advertising the off-mesh prefix and re-registering the home's services on the LAN.
5. The sleepy door sensor wakes for its scheduled poll, and the poll to its vanished parent fails.
6. The sensor runs an attach scan and re-parents to Bobbin, and its queued open event flows through Bobbin to the third-party controller — the automation fires unbroken.
7. The controller notifies the partner app, which never noticed the hub reboot.
8. Trellis finishes booting, rejoins the mesh as a router, and takes the secondary border-router role — Thread happily runs both BRs at once.

### 4.2 A Zigbee sensor event crosses the bridge

1. Zigbee window sensor W-12 reports open: an IAS Zone status change to the Weft-R coordinator.
2. Weft-R forwards the frame to the bridge process on Loom-V8.
3. The bridge maps W-12's IEEE address to its stable bridged Matter endpoint 12, labeled "Back Window" — the same identity every fabric sees.
4. A Matter subscription report (BooleanState cluster) goes out on the LAN to every subscribed controller on the fabric.
5. The partner ecosystem's controller receives the report, and its app shows "Back Window — Open" under exactly that name.
6. The local rule engine consumes the same event internally as just another subscriber.
7. The Zigbee frame's battery and link-quality figures surface as bridged PowerSource attributes, so health crosses the bridge along with identity.

### 4.3 Local automations through a full internet outage

1. The ISP modem dies; Trellis's WAN probe fails and the Lattice tunnel drops, but the LAN, Thread, and Zigbee networks stay up.
2. At 23:10 the camera path detects a person on the driveway — inference on the NPU, nothing leaving the device.
3. The rule engine matches rule R-18 ("person on driveway at night → lock + light"), synced earlier from Pattern and executed entirely locally.
4. Trellis sends a Matter LockDoor command over Thread to the front-door lock, and the lock confirms.
5. Trellis sends a Zigbee on command to the porch light, and the light acks.
6. The clip lands on the microSD and the push notification is queued in the outbox, because no uplink exists.
7. The WAN returns 40 minutes later, and Trellis re-establishes the Lattice tunnel.
8. The queued notification flushes through Heddle to the owner's phone; the clip stays local unless the owner enabled the Spool archive.

### 4.4 Commissioning one device into two fabrics

1. The owner scans the new Thread contact sensor's QR code in the loomworks app, which hands the setup payload to Trellis.
2. Trellis finds the device over BLE and runs PASE with the setup passcode.
3. Trellis checks the device-attestation certificate against Graft's mirror of the certification ledger.
4. Trellis writes operational credentials plus the Thread network key; the sensor joins the mesh, drops BLE, and a CASE session puts it on the loomworks fabric.
5. The owner picks "Add to another ecosystem," and the app asks Trellis to open a commissioning window — a one-time passcode, the device advertising again.
6. The partner ecosystem's controller commissions over the open window: its own PASE and its own credentials for fabric 2, over the existing network, no factory reset.
7. The sensor stores two independent fabric credential sets, and both controllers hold their own CASE subscriptions.
8. A window-open event now reports to both fabrics at once, each under the identity that fabric assigned.

## 5. Wire contracts

Bridged Matter report (Trellis bridge → subscribed controllers, LAN):
https://github.com/loomworks/trellis-fw/blob/main/bridge/report.c#L167

| field | sample value | meaning |
|---|---|---|
| `node_id` | `0x00124B77` | the Trellis bridge node on the fabric |
| `endpoint` | `12` | stable per bridged device — the identity that crosses |
| `cluster` | `0x0045` | BooleanState (contact) |
| `state_value` | `false` | contact open |
| `label` | `"Back Window"` | bridged node label — the same in every app |
| `data_version` | `881` | subscription consistency counter |

Zigbee sensor frame (W-12 → Weft-R coordinator):
https://github.com/loomworks/weft-radio/blob/main/src/ias_zone.c#L52

| field | sample value | meaning |
|---|---|---|
| `short_addr` | `0x4A21` | network address this session |
| `ieee` | `00:15:8D:00:04:A1:B2:77` | stable identity the bridge maps to endpoint 12 |
| `cluster` | `0x0500` | IAS Zone |
| `zone_status` | `0x0001` | alarm1 set — contact open |
| `battery_pct` | `87` | surfaced as a bridged PowerSource attribute |
| `lqi` | `188` | link quality, kept for mesh health |

## 6. Failure modes

- **Internet outage**: §4.3 — automations, bridging, and microSD recording continue;
  remote view and pushes queue; Spool uploads defer until the tunnel returns.
- **Trellis power loss (wifi variant)**: the whole hub is down; Bobbin keeps Thread
  routing alive, but Zigbee devices lose their coordinator and events during the gap
  are lost — the honest tradeoff of hub-in-camera; the PoE variant on a powered
  switch avoids it.
- **No second border router**: sleepy Thread devices sit orphaned through a Trellis
  reboot and their events wait for re-attach; Bobbin exists precisely to close this.
- **microSD failure**: recording falls back to a RAM pre-roll plus immediate Spool
  upload for subscribers; the app raises a storage-health alert.
- **Lattice down**: remote access is lost; the app on the same LAN reaches Trellis
  directly via mDNS, and automations are untouched.
- **Zigbee interference**: Weft-R runs channel agility and broadcasts a rejoin;
  bridged endpoints keep their numbers across the move.
- **Sensor battery low**: bridged PowerSource carries the level; Heddle nags the owner.

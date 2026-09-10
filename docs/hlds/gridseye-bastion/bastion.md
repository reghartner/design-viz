# Bastion — PoE Camera Fleet & Stronghold NVR HLD

| | |
|---|---|
| Org / product | gridseye / Bastion |
| Status / updated | Draft 2 · 2026-09-05 |

## 1. Overview

Bastion is gridseye's wired surveillance system: a fleet of PoE cameras recording
continuously into the Stronghold NVR appliance on the owner's own LAN. Recording,
detection, verification, and playback all run locally; the gridseye cloud exists
only for identity, remote-access tunneling, firmware distribution, and opt-in
health telemetry. This document covers four flows: edge detection with an NVR
second opinion, staged firmware rollouts, the UPS-backed power domain during a
grid outage, and LAN-only viewing when the vendor cloud is unreachable, all at
an example 14-camera small-business site.

## 2. Hardware

- **B6 camera family** (Bullet, Dome, PTZ): 8 MP sensor, Kestrel-V SoC with a
  1.5-TOPS edge NPU, IR array, PoE 802.3af (PTZ 802.3at), dual A/B firmware
  slots. No battery — a B6 is dead without PoE.
- **Stronghold NVR**: Condor-X SoC with a 26-TOPS NPU, 16 GB RAM, 2× 8 TB
  mirrored HDDs, 8-port PoE switch (120 W budget), USB-HID UPS port.
- **Power split**: no low/high chip split — the split is **tiered power
  domains** under UPS: tier 1 (NVR core, disks, recording) never sheds; tier 2
  (interior cameras) sheds at low charge; tier 3 (IR, PTZ, chime, second-stage
  inference) sheds immediately on grid loss.

## 3. Backend services

Services marked (NVR) run on the Stronghold appliance itself; the rest are cloud.

| Service | Responsibility | Code |
|---|---|---|
| Muster (NVR) | Camera adoption, fleet health, event/timeline index | https://github.com/gridseye/stronghold/blob/main/services/muster/index.go#L61 |
| Archivist (NVR) | Recording pipeline, segment store, disk mirror manager | https://github.com/gridseye/stronghold/blob/main/services/archivist/segments.go#L118 |
| Oracle (NVR) | Second-stage AI: re-runs camera detections on the 26-TOPS NPU | https://github.com/gridseye/stronghold/blob/main/services/oracle/infer.go#L142 |
| Gatehouse (NVR) | Local web/app server: live view, playback, LAN auth replica | https://github.com/gridseye/stronghold/blob/main/services/gatehouse/server.go#L77 |
| Quartermaster (NVR) | Power manager: UPS integration, tier shedding, runtime forecast | https://github.com/gridseye/stronghold/blob/main/services/quartermaster/tiers.go#L54 |
| Armory (NVR) | Firmware staging and rollout coordinator for the camera fleet | https://github.com/gridseye/stronghold/blob/main/services/armory/rollout.go#L203 |
| Skylink (cloud) | Remote-access tunnel broker and push relay | https://github.com/gridseye/cloud/blob/main/skylink/tunnel.go#L91 |
| Keymaster (cloud) | Account identity, SSO, device claim | https://github.com/gridseye/cloud/blob/main/keymaster/session.go#L44 |
| Forge (cloud) | Signed firmware image distribution | https://github.com/gridseye/cloud/blob/main/forge/manifest.go#L37 |
| Gridlog (cloud) | Opt-in fleet health telemetry and crash-log intake | https://github.com/gridseye/cloud/blob/main/gridlog/ingest.go#L29 |

## 4. Flows

### Flow 1 — Edge detection, NVR second opinion

1. The B6 camera streams continuously to Archivist over RTSPS; segments land in the recording store regardless of everything below.
2. The camera's edge NPU flags a person at 0.71 confidence and posts a detection event with a thumbnail to Muster on the LAN event channel.
3. Muster writes the event into the timeline index as a *candidate* and hands the event id to Oracle for a second opinion.
4. Oracle pulls the surrounding 8 seconds of keyframes from Archivist's segment store.
5. Oracle runs the 26-TOPS model: confidence rises to 0.96 and the class upgrades from person to person+package.
6. Oracle returns the verdict to Muster, which promotes the event from candidate to *confirmed*.
7. Muster notifies Gatehouse, which forwards the confirmed event to Skylink for push delivery.
8. Skylink pushes the notification with the thumbnail to the owner's phone.
9. The owner taps through; the phone reaches Gatehouse via the Skylink tunnel and plays the clip from local disk.

### Flow 2 — Staged firmware rollout

1. A gridseye release engineer publishes B6 firmware 3.2.0 to Forge with a signed manifest.
2. Armory polls Forge nightly, downloads the image once, and verifies the signature against the pinned gridseye release key.
3. Armory opens the rollout in canary stage: one camera per hardware model at the site (3 of 14).
4. Armory offers the image to each canary; the camera writes it to its inactive A/B slot, verifies the digest, and reboots into it.
5. Each canary reports its running version and health counters to Muster inside the 2-minute boot deadline.
6. Armory holds a 24-hour observe window, watching Muster's metrics for reboots, stream stalls, and detection-rate drift.
7. Metrics stay clean, so Armory expands in waves of 4 cameras with a 30-minute soak between waves.
8. A wave-2 dome reboot-loops on the new image; Armory halts the rollout and issues no further offers.
9. Armory instructs the failing camera to boot its previous slot — rollback is one reboot, since the old image is still resident.
10. Armory pins the fleet at mixed versions, marks the rollout HALTED, and files the camera's log bundle with Gridlog for the vendor ticket.

### Flow 3 — Grid outage on the UPS power domain

1. Mains drops; the UPS switches to battery and raises an on-battery status frame to Quartermaster over USB-HID.
2. Quartermaster reads the pack at 100% and computes runtime at the present 96 W draw: 41 minutes.
3. Quartermaster sheds tier 3: IR illuminators off fleet-wide, PTZ patrols parked, chime muted — draw falls to 71 W.
4. Quartermaster asks Oracle to suspend second-stage inference; camera-edge detection continues — draw 58 W, forecast 68 minutes.
5. Muster keeps all 14 cameras powered on the PoE bus; recording continues untouched.
6. Quartermaster posts the outage and runtime forecast to Gatehouse; the app shows "on battery — ~68 min".
7. At 30% charge Quartermaster sheds tier 2: the 6 interior cameras power down, leaving the 8 perimeter cameras — draw 33 W.
8. At 12% Quartermaster orders Archivist to flush journals and stop opening new segments, so the index survives a hard cut.
9. Mains returns at 9%; the UPS reports line power and Quartermaster restores loads in reverse tier order as charge recovers.
10. Archivist marks the honest recording gaps in the timeline and Muster re-adopts the six powered-down cameras.

### Flow 4 — LAN-only viewing with the cloud unreachable

1. The site's ISP uplink dies; Gatehouse's Skylink keepalives fail and the cloud path is marked LOST.
2. Recording, edge detection, and Oracle verification continue — nothing in the capture path touches the WAN.
3. The owner's phone, on the same wifi, fails to reach Skylink and falls back to mDNS discovery.
4. Gatehouse answers the mDNS query and the app pins the NVR's LAN address.
5. The app authenticates against Gatehouse's local account replica with cached credentials, since Keymaster is unreachable.
6. Gatehouse serves live view and timeline playback directly over LAN TLS (cert pinned at adoption).
7. Push notifications queue in Gatehouse's outbox — Skylink is the only push path off the LAN.
8. The WAN returns; the tunnel re-establishes, the outbox flushes with stale motion pushes collapsed, and the Keymaster session re-validates.

## 5. Wire contracts

Detection event — B6 camera → Muster (LAN event channel, protobuf over TLS):

| field | sample value | meaning |
|---|---|---|
| cam_id | `b6-drive-02` | adopted camera identity |
| event_id | `01JB8QK4X2` | ULID, unique per detection |
| ts | `2026-09-05T14:02:11Z` | detection timestamp |
| class | `person` | edge NPU class label |
| conf | `0.71` | edge confidence, 0–1 |
| clip | `{"seg":"s-88412","off_ms":4180}` | segment + offset for playback |
| thumb | `ref:tmb/01JB8QK4X2` | thumbnail object reference |
| npu | `kestrel/1.5t/m14` | model + hardware that scored it |

Rollout offer — Armory → B6 camera:

| field | sample value | meaning |
|---|---|---|
| rollout_id | `ro-2026-091` | rollout this offer belongs to |
| image | `b6-3.2.0` | target firmware version |
| sha256 | `9f31…c2aa` | image digest the camera must verify |
| url | `https://stronghold.local/fw/b6-3.2.0.img` | LAN fetch path — Forge is never contacted by cameras |
| slot | `B` | inactive A/B slot to flash |
| deadline_s | `120` | boot-report deadline before the offer counts as failed |
| stage | `canary` | rollout stage issuing the offer |

(The UPS also emits a 2 s USB-HID status frame — `status`, `charge_pct`, `load_w`, `runtime_s` — consumed only by Quartermaster.)

## 6. Failure modes

- **WAN/cloud loss**: capture, verification, retention unaffected; viewing degrades to LAN-only (Flow 4); no push until the tunnel returns.
- **Grid power loss**: tiered shedding under UPS (Flow 3); with no UPS, a hard cut costs at most the open segment — Archivist replays its journal on boot and flags the gap.
- **Disk failure**: the mirror degrades to single-disk with a persistent banner; a second failure stops recording but never corrupts the index.
- **Camera offline**: marked in the fleet grid; others unaffected; on return it resumes from live only — a B6 has no local buffer to backfill from.
- **Forge unreachable**: rollouts pause where they stand; the fleet is always runnable at pinned mixed versions.
- **Oracle down**: candidate events still record and index, rendered "unverified"; notifications fall back to edge confidence at lower push priority.

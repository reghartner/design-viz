# basecraft Keep — Local AI Hub & Camera Fleet HLD

| | |
|---|---|
| Status | Draft 2 |
| Owners | hub-platform (basecraft) |
| Last updated | 2026-09-05 |
| Reviewers | fleet-firmware, cloud-edge |

## 1. Overview

Keep is basecraft's local-first security system: a wall-powered hub (the Keep K2)
that pairs with up to 16 Lookout cameras over the home LAN, runs all face recognition
and cross-camera tracking on its own neural accelerator, and stores every clip on its
own disk. Video never leaves the LAN. The basecraft cloud carries signaling only —
push text, session brokering, and a blind relay that forwards ciphertext it cannot
read when the owner views remotely. A cloud system's convenience, an NVR's custody.

## 2. Hardware

- **Keep K2 hub** — quad-core BC-K210 (4× Cortex-A55), 6-TOPS **Facet** NPU, 4 GB
  RAM, one 3.5" HDD bay at 8 TB (16 TB max), GbE + Wi-Fi 5, siren, USB-A for an
  optional mirror disk. Wall power only.
- **Lookout B4** — battery outdoor camera with the low/high-power split: an
  always-on **LB-LP0** wake controller (PIR front end, 6 µA sleep) gates power to — [b4/lp0/wake.c#L44](https://github.com/basecraft/lookout-firmware/blob/main/b4/lp0/wake.c#L44)
  the **LB-AP2** video SoC (2K encode, 500 ms boot); 200 MB staging flash.
- **Lookout W2** (wired cam) and **Lookout D3** (wired doorbell) — single LB-AP2.
- Cameras carry only a small person/vehicle box detector; face embeddings run
  exclusively on the hub's Facet NPU.

## 3. Backend services

Cloud (basecraft-cloud — signaling plane, never video):

- **Beacon** — session broker; terminates each hub's persistent outbound TLS control channel and routes signaling between apps and hubs. — [services/beacon/broker.go#L233](https://github.com/basecraft/cloud/blob/main/services/beacon/broker.go#L233)
- **Passage** — blind relay; forwards end-to-end-encrypted media frames when direct P2P fails. Holds no keys. — [services/passage/relay.go#L57](https://github.com/basecraft/cloud/blob/main/services/passage/relay.go#L57)
- **Rollbook** — accounts, hub ownership, entitlements, device claims.
- **Crier** — push notification fan-out; text metadata only, never pixels.
- **Foundry** — firmware image staging; the hub pulls images and re-serves cameras.

On-hub daemons (Keep K2):

- **Fleetd** — camera pairing, LAN link supervision, wake fan-out to battery cameras. — [daemons/fleetd/pair.go#L61](https://github.com/basecraft/keep-hub/blob/main/daemons/fleetd/pair.go#L61)
- **Facewright** — face embedding + gallery match on the Facet NPU. — [daemons/facewright/gallery.rs#L118](https://github.com/basecraft/keep-hub/blob/main/daemons/facewright/gallery.rs#L118)
- **Stitcher** — cross-camera track correlation and incident clip assembly. — [daemons/stitcher/track.rs#L204](https://github.com/basecraft/keep-hub/blob/main/daemons/stitcher/track.rs#L204)
- **Vaultd** — recording store: segment index, rotation, protection flags. — [daemons/vaultd/rotate.go#L87](https://github.com/basecraft/keep-hub/blob/main/daemons/vaultd/rotate.go#L87)
- **Porter** — hub end of remote viewing; derives session keys, encrypts streams. — [daemons/porter/session.go#L142](https://github.com/basecraft/keep-hub/blob/main/daemons/porter/session.go#L142)

## 4. Flows

(The face gallery is enrolled on the LAN: the owner names a face crop in the app, Facewright embeds it on the NPU and back-tags past events; only a gallery version counter ever reaches Rollbook.)

### Flow 1 — Hub-local face recognition on a motion event

1. Lookout B4's LP wake controller trips on PIR and raises the video SoC's power rail.
2. The camera starts encoding and pushes the stream to Fleetd over LAN Wi-Fi, with its on-camera detector's person boxes muxed in as a metadata track.
3. Fleetd hands boxed frames to Facewright.
4. Facewright crops the face and runs the embedding on the Facet NPU (34 ms/frame).
5. Facewright matches against the gallery — "Dana", score 0.91 — and passes the identity to Vaultd.
6. Vaultd writes the clip with the identity tag and indexes the event.
7. The hub notifies Beacon over the control channel with text-only metadata: event id, camera name, "Dana". No pixels leave the LAN.
8. Beacon hands the notice to Crier, which pushes "Dana at the driveway" to the owner's phone; a LAN app fetches the thumbnail from the hub directly, an off-LAN app opens Flow 4.

### Flow 2 — Cross-camera tracking and the one-clip incident

1. The driveway camera's event reaches Stitcher, which opens a track with a body re-ID embedding (works without a face).
2. Stitcher consults the adjacency graph and asks Fleetd to pre-wake the yard and porch cameras.
3. Fleetd sends wake commands so the battery cameras skip their own PIR wait.
4. The subject exits the driveway frame edge; Stitcher closes segment 1 and predicts the yard as next.
5. The yard camera streams; Stitcher matches the re-ID embedding at 0.87 and appends segment 2 to the same track.
6. The porch camera picks the subject up the same way; the track closes after 20 s with no matches anywhere.
7. Stitcher pulls the three segments from Vaultd, trims dead air, and concatenates one incident clip with per-camera chapter marks.
8. Vaultd stores the assembled clip as a single event referencing its source segments.
9. Crier pushes "One visitor crossed 3 cameras — 48 s clip ready."

### Flow 3 — Storage rotation with protected events

1. Vaultd appends recording segments per camera until disk fill crosses the 92% high-water mark.
2. Vaultd's rotation pass walks the segment index oldest-first.
3. Unprotected segments are unlinked until fill drops to the 85% low-water mark.
4. Protected events — user-starred clips and alarm-tagged incidents — are skipped and survive overwrite regardless of age.
5. If the protected share exceeds its 25% cap, Vaultd stops auto-protecting new incidents and flags the app for review.
6. Vaultd writes a rotation rollbook entry: bytes freed, oldest surviving day, protected count.
7. The app's storage page reads the rollbook: "62 days on disk · oldest May 3 · 214 protected."

### Flow 4 — Remote viewing brokered through the relay

1. The off-LAN app asks Beacon for a session to hub K2-0F3A, presenting its auth token.
2. Beacon checks ownership with Rollbook and issues a session ticket plus a relay candidate list.
3. Beacon forwards the offer down the hub's persistent control channel to Porter.
4. Porter and the app exchange connectivity candidates through Beacon — signaling only.
5. A direct P2P path fails (symmetric NAT), so both sides attach to the same Passage relay node.
6. Porter derives the media key from the pairing secret shared at claim time — a secret the cloud never held.
7. Passage forwards encrypted frames both ways; it can count bytes but cannot decrypt one.
8. The app decrypts and renders the live view with a "relayed" path badge.
9. On teardown Passage logs byte counts only; off the hub's disk, the video exists nowhere at rest.

## 5. Wire contracts

Control-channel event notice (hub → Beacon, protobuf over TLS):

| field | sample value | meaning |
|---|---|---|
| `hub_id` | `K2-0F3A` | claiming hub |
| `event_id` | `ev_88213` | hub-local event key |
| `cam` | `driveway` | owner-assigned camera name |
| `kind` | `face_match` | event class |
| `who` | `Dana` | gallery display name; empty for strangers |
| `ts` | `1757066112` | event start, epoch seconds |
| `clip_ref` | `vault://ev_88213` | fetchable only via a hub session |

Relay session ticket (Beacon → app and hub):

| field | sample value | meaning |
|---|---|---|
| `ticket_id` | `tk_4d1c` | one session, both parties present it |
| `hub_id` | `K2-0F3A` | target hub |
| `relay` | `passage-iad-7:3478` | assigned relay node |
| `expires` | `1757066232` | 120 s validity |
| `hmac` | `9f31…` | Beacon's signature; Passage verifies, learns no keys |

## 6. Failure modes

- **WAN drops** — recording, recognition, tracking, rotation all continue; push and remote viewing stop; a LAN app finds the hub by mDNS and works fully.
- **Hub power fails** — Lookout B4 stages up to ~15 events in its 200 MB flash and back-fills Vaultd when the hub returns; wired cams go dark.
- **Disk pre-fail (SMART)** — Vaultd alerts and copies protected events to the USB mirror disk first if present; there is no cloud copy by design.
- **Camera Wi-Fi weak** — the stream downshifts; below threshold Fleetd switches the camera to snapshot-burst mode so Facewright still gets faces.
- **Beacon outage** — local operation unaffected; remote viewing fails closed rather than routing video through any third path.

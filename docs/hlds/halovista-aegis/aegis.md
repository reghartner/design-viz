# HaloVista Aegis — Cloud Camera Ecosystem HLD

## 1. Overview

Aegis is HaloVista's cloud-first home camera ecosystem: the Halo Doorbell
(battery, quick-release pack), the Halo Cam (wired), the Beacon Chime, one
app, and a subscription ladder (Aegis Basic → Complete → Guard). Video,
history, and AI live in the HaloVista cloud; the cameras are deliberately
thin. This document covers the four flows that define the product: opt-in
end-to-end encryption (privacy bought at the price of cloud AI), natural-
language history search, the human virtual-guard session, and plan lapse.

## 2. Hardware

- **Iris SoC (HV-A53Q)** — quad Cortex-A53 + 2 TOPS NPU; video encode, TLS,
  motion filtering, clip encryption. The high-power side.
- **Ward MCU (HV-M33)** — always-on Cortex-M33 at ~190 µA; PIR front end,
  radar chain, wake logic. The low-power side: on battery models Iris sleeps
  and Ward wakes it only for qualified motion.
- **Sensors** — 1/1.8" 4K HDR sensor; 3-facet PIR; 60 GHz pulse radar for
  distance-gated alerts; mic pair; 2 W speaker; 105 dB siren; light sensor.
- **HV-SE1 secure element** — device identity cert, E2EE media keys (minted
  and held inside the element), secure-boot root.
- **Radios** — dual-band 802.11ac wifi; BLE 5 for commissioning only.
- **Power** — Doorbell: quick-release Li-ion pack, optional wired trickle;
  Halo Cam: 24 V wired, with Ward still filtering wakes.

## 3. Backend services

| Service | Responsibility | Code |
|---|---|---|
| Halogate | Public API gateway; terminates TLS, verifies sessions, routes app traffic | https://github.com/halovista/platform/blob/main/services/halogate/router.go#L118 |
| Conduit | Device broker; persistent MQTT-over-TLS control channel + WebRTC signaling per camera | https://github.com/halovista/platform/blob/main/services/conduit/broker.go#L64 |
| Vault | Clip object store, encrypted at rest; holds ciphertext only for E2EE cameras | https://github.com/halovista/platform/blob/main/services/vault/store.go#L92 |
| Lens AI | Cloud vision pipeline: classification, descriptions, embeddings; needs plaintext | https://github.com/halovista/platform/blob/main/services/lensai/classify.go#L201 |
| Chronicle | Event index; time/label/embedding search behind history and AI search | https://github.com/halovista/platform/blob/main/services/chronicle/index.go#L77 |
| Concierge | Natural-language search frontend; LLM parses questions, composes answers | https://github.com/halovista/platform/blob/main/services/concierge/parse.go#L57 |
| Keyring | E2EE enrollment; registers phone public keys, distributes wrapped media keys, never sees plaintext keys | https://github.com/halovista/platform/blob/main/services/keyring/enroll.go#L88 |
| Watchtower | Virtual-guard dispatcher; entitlement check, incident queue, agent assignment | https://github.com/halovista/platform/blob/main/services/watchtower/queue.go#L141 |
| Agent Desk | Guard-agent console backend; live view, talk-down audio, siren commands, all audited | https://github.com/halovista/platform/blob/main/services/agentdesk/session.go#L53 |
| Casebook | Incident record store; guard-session timelines, outcomes, owner-visible audit | https://github.com/halovista/platform/blob/main/services/casebook/incident.go#L36 |
| Ledger | Subscription + entitlement authority; publishes feature gates to every consumer | https://github.com/halovista/platform/blob/main/services/ledger/entitlements.go#L119 |
| Clarion | Notification fan-out to enrolled phones, with summary collapsing | https://github.com/halovista/platform/blob/main/services/clarion/push.go#L44 |

## 4. Flows

### Flow 1 — Opt-in E2EE enrollment (the tradeoff flow)

1. The owner opens Privacy settings and the app POSTs an E2EE enrollment request, which Halogate verifies and forwards to Keyring.
2. Keyring returns an enrollment challenge to the phone; the app derives the account key from the owner's new passphrase locally — the passphrase never leaves the phone.
3. The app registers its public enrollment key with Keyring, which stores public keys only.
4. Keyring sends an `e2ee_on` command through Conduit to the camera's control channel.
5. The Iris SoC asks the HV-SE1 secure element to mint a fresh media key inside the element.
6. The element returns the key wrapped to each enrolled phone's public key, and the camera forwards the wrapped keys through Conduit to Keyring — plaintext keys never leave the element.
7. Keyring marks the camera E2EE in Ledger, which gates Lens AI descriptions, Chronicle indexing, and Watchtower off for that camera — cloud AI cannot run on ciphertext.
8. The camera now encrypts every clip with the media key before upload, so Vault stores ciphertext it cannot read.
9. On playback the enrolled phone fetches the ciphertext from Vault and decrypts locally — the only place a clip is ever plaintext off-camera.

### Flow 2 — Natural-language AI history search

1. The owner types "did the dog walker come yesterday?" and Halogate authenticates and routes the question to Concierge.
2. Concierge's LLM parses the question into a structured query: range = yesterday, subject = person + dog, cameras = all non-E2EE.
3. Concierge sends the structured query to Chronicle, which runs it against labels and embeddings.
4. Chronicle returns the top matches with descriptions and thumbnails, marking E2EE cameras "unsearchable" rather than silently omitting them.
5. Concierge composes the answer ("Yes — 2:14 pm, front yard, 4 minutes") and returns it through Halogate to the phone.
6. The owner taps a result and the app streams the matched clip from Vault.

### Flow 3 — Virtual guard session (human in the loop)

1. A person lingers in the driveway after midnight and the camera streams the event to Conduit.
2. Conduit forwards frames to Lens AI, which classifies a person at 0.94 confidence loitering 38 seconds.
3. Lens AI posts a guard-eligible alert to Watchtower, which confirms the home's Guard entitlement with Ledger.
4. Watchtower opens incident CB-8841 in Casebook and assigns it to the next free agent at Agent Desk.
5. Agent Desk opens a live WebRTC view of the camera through Conduit; the agent sees the scene in under five seconds.
6. The agent triggers the talk-down and Agent Desk routes their audio through Conduit to the camera speaker.
7. The subject stays, so the agent escalates and Conduit relays the siren command; the camera sounds 105 dB.
8. The subject leaves the frame; the agent marks the outcome "deterred" and Agent Desk writes the resolution to Casebook.
9. Casebook hands the finished incident to Clarion, which pushes the summary and audit link to the owner.

### Flow 4 — Subscription-entitlement loss

1. The nightly billing run fails to charge the card; Ledger moves the account to GRACE and Clarion pushes the 14-day deadline to every enrolled phone.
2. On day 14 Ledger moves the account to LAPSED and publishes the revocation; Lens AI stops analyzing and Watchtower delists the home.
3. Ledger tells Conduit, which commands each camera into unentitled mode.
4. The camera's next clip upload to Vault is refused with 403 — no new cloud recordings.
5. Live view, motion notifications, and the manual siren keep working — they never depended on the plan.
6. Vault keeps already-stored clips until normal expiry; nothing new is written, so the lapse becomes a permanent gap in history.
7. The owner renews; Ledger republishes entitlements through Conduit and every gated feature resumes on the next event.

## 5. Wire contracts

Event envelope (camera → Conduit), [envelope.c](https://github.com/halovista/firmware/blob/main/halo/iris/envelope.c#L142):

| field | sample value | meaning |
|---|---|---|
| event_id | "ev_7c31a9" | camera-minted id; dedup key everywhere downstream |
| camera_id | "halo-4f22" | device identity from the HV-SE1 cert |
| ts | 1757085660 | wall-clock seconds at trigger |
| class | "person" | Ward/Iris local pre-classification hint |
| radar_m | 4.2 | radar distance at trigger, meters |
| e2ee | false | true = payload is ciphertext; Lens AI must skip |
| media | "vault://halo-4f22/ev_7c31a9" | clip object reference |

Wrapped-key record (camera → Keyring, Flow 1 step 6), [e2ee_pipeline.c](https://github.com/halovista/firmware/blob/main/halo/iris/e2ee_pipeline.c#L204):

| field | sample value | meaning |
|---|---|---|
| key_id | "mk_02" | media-key generation counter |
| camera_id | "halo-4f22" | which camera's element minted it |
| wrapped_for | "phone_a81" | enrolled phone this blob is wrapped to |
| alg | "X25519+A256GCM" | wrap algorithm |
| blob | "b64:kJ83…" | the wrapped key; opaque to Keyring |
| created | 1757085710 | wrap time; Keyring rejects stale re-wraps |

## 6. Failure modes

- **Wifi drops** — no offline buffer by design (thin-camera model): events in the gap are lost, and history shows an honest "camera offline" span.
- **Battery low (Doorbell)** — below 15% Iris wake is rationed to radar hits under 3 m; below 5% Ward logs motion timestamps only.
- **Lens AI down** — plain "motion detected" pushes; Chronicle re-indexes from the backlog on recovery, so search has a blind window, not a hole.
- **Watchtower saturated** — incidents past the 60 s claim SLA degrade to a rich notification with a one-tap siren shortcut; the miss is recorded.
- **Keyring down** — E2EE cameras keep capturing and encrypting (keys live in the element); only new enrollments fail.
- **Vault down** — Iris retries from RAM for ~10 minutes, then drops the clip; the notification still goes out marked "clip unavailable".
- **Ledger down** — entitlements cached 24 h at each consumer; safety functions fail open, Guard sessions fail closed.
- **Passphrase lost** — E2EE clips are unrecoverable, by design; Keyring can only reset forward (new media key, old ciphertext stays dark).

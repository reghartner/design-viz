# Coverage ledger — HaloVista Aegis — cloud, keys, and a human in the loop
source: docs/hlds/halovista-aegis/aegis.md | version: n/a | updated: 09-09-2026 09:23
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | number | "the four flows that define the product" | The HLD defines four product flows. | covered @ page.blocks[0].tabs |
| 2 | service | "Iris SoC (HV-A53Q)" | Iris SoC is the high-power video, TLS, and clip-encryption component and asks HV-SE1 to mint a media key. | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.iris; page.blocks[0].tabs[0].sections[0].bullets[4] |
| 3 | service | "HV-SE1 secure element" | HV-SE1 is the secure element that mints the Flow 1 media key internally. | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.se; page.blocks[0].tabs[0].sections[0].bullets[4] |
| 4 | service | "Public API gateway; terminates TLS" | Halogate is the public API gateway. | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.halogate |
| 5 | permalink | "Public API gateway; terminates TLS" | Halogate implementation: https://github.com/halovista/platform/blob/main/services/halogate/router.go#L118 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.halogate.link |
| 6 | service | "Device broker; persistent MQTT-over-TLS" | Conduit is the device broker for the persistent control channel and WebRTC signaling. | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.conduit |
| 7 | permalink | "Device broker; persistent MQTT-over-TLS" | Conduit implementation: https://github.com/halovista/platform/blob/main/services/conduit/broker.go#L64 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.conduit.link |
| 8 | service | "Clip object store, encrypted at rest" | Vault is the clip object store. | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.vault |
| 9 | permalink | "Clip object store, encrypted at rest" | Vault implementation: https://github.com/halovista/platform/blob/main/services/vault/store.go#L92 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.vault.link |
| 10 | service | "Cloud vision pipeline: classification" | Lens AI is the cloud vision service. | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.lens |
| 11 | permalink | "Cloud vision pipeline: classification" | Lens AI implementation: https://github.com/halovista/platform/blob/main/services/lensai/classify.go#L201 | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.lens.link |
| 12 | service | "Event index; time/label/embedding search" | Chronicle is the event index for label and embedding search. | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.chronicle |
| 13 | permalink | "Event index; time/label/embedding search" | Chronicle implementation: https://github.com/halovista/platform/blob/main/services/chronicle/index.go#L77 | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.chronicle.link |
| 14 | service | "Natural-language search frontend" | Concierge is the natural-language and LLM search frontend. | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.concierge |
| 15 | permalink | "Natural-language search frontend" | Concierge implementation: https://github.com/halovista/platform/blob/main/services/concierge/parse.go#L57 | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.concierge.link |
| 16 | service | "E2EE enrollment; registers phone public keys" | Keyring handles E2EE enrollment and wrapped-key distribution without plaintext keys. | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.keyring; page.blocks[0].tabs[0].sections[0].bullets[1] |
| 17 | permalink | "E2EE enrollment; registers phone public keys" | Keyring implementation: https://github.com/halovista/platform/blob/main/services/keyring/enroll.go#L88 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.keyring.link |
| 18 | service | "Virtual-guard dispatcher; entitlement check" | Watchtower dispatches virtual-guard incidents and checks entitlement. | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.watchtower; page.blocks[0].tabs[2].sections[0].bullets[2] |
| 19 | permalink | "Virtual-guard dispatcher; entitlement check" | Watchtower implementation: https://github.com/halovista/platform/blob/main/services/watchtower/queue.go#L141 | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.watchtower.link |
| 20 | service | "Guard-agent console backend; live view" | Agent Desk is the audited guard-agent live console. | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.agentdesk |
| 21 | permalink | "Guard-agent console backend; live view" | Agent Desk implementation: https://github.com/halovista/platform/blob/main/services/agentdesk/session.go#L53 | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.agentdesk.link |
| 22 | service | "Incident record store; guard-session timelines" | Casebook stores guard incidents and their outcomes. | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.casebook |
| 23 | permalink | "Incident record store; guard-session timelines" | Casebook implementation: https://github.com/halovista/platform/blob/main/services/casebook/incident.go#L36 | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.casebook.link |
| 24 | service | "Subscription + entitlement authority" | Ledger is the subscription and entitlement authority. | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.ledger |
| 25 | permalink | "Subscription + entitlement authority" | Ledger implementation: https://github.com/halovista/platform/blob/main/services/ledger/entitlements.go#L119 | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.ledger.link |
| 26 | service | "Notification fan-out to enrolled phones" | Clarion sends notifications to enrolled phones. | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.clarion |
| 27 | permalink | "Notification fan-out to enrolled phones" | Clarion implementation: https://github.com/halovista/platform/blob/main/services/clarion/push.go#L44 | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.clarion.link |
| 28 | flow | "Opt-in E2EE enrollment (the tradeoff flow)" | Owner enrollment, local passphrase derivation, public-key registration, camera key minting and wrapping, cloud-AI gating, encrypted upload, and local playback decryption. | covered @ page.blocks[0].tabs[0].sections[0] |
| 29 | flow | "Natural-language AI history search" | Owner question, structured query, Chronicle search, explicit E2EE unsearchability, composed answer, and matched-clip playback. | covered @ page.blocks[0].tabs[1].sections[0] |
| 30 | number | "Yes — 2:14 pm, front yard, 4 minutes" | The composed search answer gives the match time as 2:14 pm. | covered @ page.blocks[0].tabs[1].sections[0].bullets[4] |
| 31 | number | "Yes — 2:14 pm, front yard, 4 minutes" | The composed search answer gives a four-minute match. | covered @ page.blocks[0].tabs[1].sections[0].bullets[4] |
| 32 | flow | "Virtual guard session (human in the loop)" | Camera event, Lens AI classification, Watchtower entitlement and dispatch, live agent view, talk-down, siren escalation, resolution, and owner notification. | covered @ page.blocks[0].tabs[2].sections[0] |
| 33 | number | "0.94 confidence loitering 38 seconds" | Lens AI classifies the person at 0.94 confidence. | covered @ page.blocks[0].tabs[2].sections[0].bullets[1] |
| 34 | number | "0.94 confidence loitering 38 seconds" | Lens AI observes loitering for 38 seconds. | covered @ page.blocks[0].tabs[2].sections[0].bullets[1] |
| 35 | number | "under five seconds" | The guard agent sees the live scene in under five seconds. | covered @ page.blocks[0].tabs[2].sections[0].bullets[4] |
| 36 | number | "camera sounds 105 dB" | Siren output is 105 dB. | covered @ page.blocks[0].tabs[2].sections[0].bullets[6] |
| 37 | flow | "Subscription-entitlement loss" | Charge failure, GRACE, day-14 LAPSED revocation, camera unentitled mode, refused uploads, surviving safety features, retained clips, and renewal. | covered @ page.blocks[0].tabs[3].sections[0] |
| 38 | number | "14-day deadline" | The GRACE deadline is 14 days and the account moves to LAPSED on day 14. | covered @ page.blocks[0].tabs[3].sections[0].bullets[0]; page.blocks[0].tabs[3].sections[0].bullets[1] |
| 39 | number | "refused with 403" | A lapsed account's next clip upload is refused with HTTP status 403. | covered @ page.blocks[0].tabs[3].sections[0].bullets[3] |
| 40 | contract | "Event envelope (camera → Conduit)" | Event envelope fields: event_id, camera_id, ts, class, radar_m, e2ee, and media, with the HLD's sample values and meanings. | covered @ page.blocks[0].tabs[2].sections[0].contract |
| 41 | permalink | "envelope.c" | Event-envelope implementation: https://github.com/halovista/firmware/blob/main/halo/iris/envelope.c#L142 | covered @ page.blocks[0].tabs[2].sections[0].contract.source |
| 42 | number | "1757085660" | The event-envelope ts sample is 1757085660 wall-clock seconds. | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[2].v |
| 43 | number | "radar distance at trigger, meters" | The event-envelope radar_m sample is 4.2 meters. | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[4].v |
| 44 | contract | "Wrapped-key record" | Wrapped-key record fields: key_id, camera_id, wrapped_for, alg, blob, and created, with the HLD's sample values and meanings. | covered @ page.blocks[0].tabs[0].sections[0].contract |
| 45 | permalink | "e2ee_pipeline.c" | Wrapped-key implementation: https://github.com/halovista/firmware/blob/main/halo/iris/e2ee_pipeline.c#L204 | covered @ page.blocks[0].tabs[0].sections[0].contract.source |
| 46 | number | "wrap time; Keyring rejects stale re-wraps" | The wrapped-key created sample is 1757085710. | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[5].v |
| 47 | failure | "Wifi drops — no offline buffer by design" | Wifi loss drops events in the gap and shows an honest camera-offline span. | covered @ page.blocks[0].tabs[2].sections[0].bullets[9] |
| 48 | failure | "Battery low (Doorbell)" | Below the stated battery thresholds, Iris wakes only for close radar hits and Ward eventually records timestamps only. | covered @ page.blocks[0].tabs[2].sections[0].bullets[10] |
| 49 | number | "below 15% Iris wake is rationed" | Below 15% battery, Iris wake is rationed. | covered @ page.blocks[0].tabs[2].sections[0].bullets[10] |
| 50 | number | "radar hits under 3 m" | Below 15% battery, Iris wakes only for radar hits under 3 m. | covered @ page.blocks[0].tabs[2].sections[0].bullets[10] |
| 51 | number | "below 5% Ward logs" | Below 5% battery, Ward logs motion timestamps only. | covered @ page.blocks[0].tabs[2].sections[0].bullets[10] |
| 52 | failure | "Lens AI down" | Lens AI outage falls back to plain motion pushes and creates a temporary Chronicle search blind window. | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 53 | failure | "Watchtower saturated" | A missed Watchtower claim SLA degrades to a rich notification with siren shortcut and records the miss. | covered @ page.blocks[0].tabs[2].sections[0].bullets[11] |
| 54 | number | "60 s claim SLA" | The Watchtower claim SLA is 60 seconds. | covered @ page.blocks[0].tabs[2].sections[0].bullets[11] |
| 55 | number | "one-tap siren shortcut" | The degraded Watchtower notification has a one-tap siren shortcut. | covered @ page.blocks[0].tabs[2].sections[0].bullets[11] |
| 56 | failure | "Keyring down" | Existing E2EE capture and encryption continue while new enrollments fail. | covered @ page.blocks[0].tabs[0].sections[0].bullets[9] |
| 57 | failure | "Vault down" | Iris retries from RAM, then drops the clip while notification continues as clip unavailable. | covered @ page.blocks[0].tabs[0].sections[0].bullets[10] |
| 58 | number | "retries from RAM for ~10 minutes" | Iris retries a Vault upload from RAM for approximately 10 minutes. | covered @ page.blocks[0].tabs[0].sections[0].bullets[10] |
| 59 | failure | "Ledger down" | Consumers use cached entitlements; safety fails open and Guard fails closed. | covered @ page.blocks[0].tabs[3].sections[0].bullets[7] |
| 60 | number | "entitlements cached 24 h" | Each consumer caches entitlements for 24 hours. | covered @ page.blocks[0].tabs[3].sections[0].bullets[7] |
| 61 | failure | "Passphrase lost" | Lost-passphrase E2EE clips are unrecoverable and Keyring can reset only forward. | covered @ page.blocks[0].tabs[0].sections[0].bullets[11] |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)

- Unsupported camera-model assignment: `Halo Cam` groups the Flow 1 Iris/HV-SE1 nodes although the HLD says only `camera` in this flow, at `page.blocks[0].tabs[0].sections[0].diagram.groups.halocam.title`.
- Unsupported transport: `int` asserts an internal service call for Halogate→Keyring, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[1].kind`.
- Unsupported transport: `https` asserts HTTPS for the Keyring→phone challenge, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[2].kind`.
- Unsupported transport: `https` asserts HTTPS for the phone→Keyring public-key registration, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[3].kind`.
- Unsupported transport: `int` asserts an internal service call for Keyring→Conduit, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[4].kind`.
- Unsupported transport: `int` asserts an internal service call for Iris→HV-SE1, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[6].kind`.
- Unsupported transport: `int` asserts an internal service call for HV-SE1→Iris, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[7].kind`.
- Unsupported transport: `int` asserts an internal service call for Conduit→Keyring, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[9].kind`.
- Unsupported transport: `int` asserts an internal service call for Keyring→Ledger, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[10].kind`.
- Unsupported transport and verb: `https` and `ciphertext PUT` assert HTTPS/PUT for Iris→Vault, while the HLD says only upload, at `page.blocks[0].tabs[0].sections[0].diagram.edges[11]`.
- Unsupported transport: `https` asserts HTTPS for Vault→phone ciphertext fetch, while the HLD names no mechanism, at `page.blocks[0].tabs[0].sections[0].diagram.edges[12].kind`.
- Unsupported encryption scope: `each hop` claims TLS on every hop, while the HLD states TLS only for specific components/channels, at `page.blocks[0].tabs[0].sections[0].diagram.panels[0].layers[0].holder`.
- Unsupported pre-enrollment reader/time claim: `Vault (today)` is not stated by the HLD, at `page.blocks[0].tabs[0].sections[0].diagram.steps[0].panels.who.hop`.
- Unsupported UI detail: `search bar` is not stated by the HLD, at `page.blocks[0].tabs[1].sections[0].diagram.nodes.phone.sub`.
- Unsupported transport: `int` asserts an internal service call for Halogate→Concierge, while the HLD names no mechanism, at `page.blocks[0].tabs[1].sections[0].diagram.edges[1].kind`.
- Unsupported transport: `int` asserts an internal service call for Concierge→Chronicle, while the HLD names no mechanism, at `page.blocks[0].tabs[1].sections[0].diagram.edges[2].kind`.
- Unsupported transport: `int` asserts an internal service call for Chronicle→Concierge, while the HLD names no mechanism, at `page.blocks[0].tabs[1].sections[0].diagram.edges[3].kind`.
- Unsupported transport: `int` asserts an internal service call for Concierge→Halogate, while the HLD names no mechanism, at `page.blocks[0].tabs[1].sections[0].diagram.edges[4].kind`.
- Unsupported payload detail: `answer + refs` adds references to the Halogate→phone response, while the HLD says only that the composed answer returns, at `page.blocks[0].tabs[1].sections[0].diagram.edges[5].label`.
- Unsupported transport and verb: `https` and `GET clip` assert HTTPS/GET for phone→Vault playback, while the HLD says only streams the matched clip, at `page.blocks[0].tabs[1].sections[0].diagram.edges[6]`.
- Unsupported scene: `person-at-door-night` is not the HLD's stated `2:14 pm, front yard` match, at `page.blocks[0].tabs[1].sections[0].diagram.panels[1].scene`.
- Incorrect playback state: `live` presents the matched recorded clip as live view, while the HLD says the owner plays a matched clip, at `page.blocks[0].tabs[1].sections[0].diagram.steps[5].panels.clip.mode`.
- Unsupported camera-model assignment: `Halo Cam` is used for the generic camera in the virtual-guard flow, at `page.blocks[0].tabs[2].sections[0].diagram.nodes.cam.title`.
- Unsupported transport: `mqtt` asserts MQTT for the camera→Conduit event stream, while the HLD does not place that event on the MQTT control channel, at `page.blocks[0].tabs[2].sections[0].diagram.edges[0].kind`.
- Unsupported transport: `int` asserts an internal service call for Conduit→Lens AI, while the HLD names no mechanism, at `page.blocks[0].tabs[2].sections[0].diagram.edges[1].kind`.
- Unsupported transport: `int` asserts an internal service call for Lens AI→Watchtower, while the HLD names no mechanism, at `page.blocks[0].tabs[2].sections[0].diagram.edges[2].kind`.
- Incorrect message label: `person flag` replaces the HLD's `guard-eligible alert`, at `page.blocks[0].tabs[2].sections[0].diagram.edges[2].label`.
- Unsupported transport: `int` asserts an internal service call for Watchtower→Casebook, while the HLD names no mechanism, at `page.blocks[0].tabs[2].sections[0].diagram.edges[3].kind`.
- Unsupported transport: `int` asserts an internal service call for Watchtower→Agent Desk, while the HLD names no mechanism, at `page.blocks[0].tabs[2].sections[0].diagram.edges[4].kind`.
- Unsupported transport: `webrtc` asserts WebRTC for Conduit→camera talk-down audio, while the HLD names WebRTC only for the live view, at `page.blocks[0].tabs[2].sections[0].diagram.edges[6].kind`.
- Unsupported transport: `int` asserts an internal service call for Agent Desk→Casebook, while the HLD names no mechanism, at `page.blocks[0].tabs[2].sections[0].diagram.edges[7].kind`.
- Unsupported transport: `int` asserts an internal service call for Casebook→Clarion, while the HLD names no mechanism, at `page.blocks[0].tabs[2].sections[0].diagram.edges[8].kind`.
- Unsupported transport: `https` asserts HTTPS for Clarion→phone incident push, while the HLD names no mechanism, at `page.blocks[0].tabs[2].sections[0].diagram.edges[9].kind`.
- Unsupported event detail: `motion driveway` calls the initial lingering event motion, which this flow does not state, at `page.blocks[0].tabs[2].sections[0].diagram.steps[0].panels.aud.log[0].text`.
- Unsupported participant: Halogate is inserted into the subscription-renewal flow although the HLD says only that the owner renews and Ledger republishes entitlements, at `page.blocks[0].tabs[3].sections[0].diagram.nodes.halogate`.
- Unsupported camera-model assignment: `Halo Cam` is used for the generic camera in the subscription-lapse flow, at `page.blocks[0].tabs[3].sections[0].diagram.nodes.cam.title`.
- Unsupported location: `front door` is not stated for the subscription-lapse camera, at `page.blocks[0].tabs[3].sections[0].diagram.nodes.cam.sub`.
- Unsupported transport: `int` asserts an internal service call for Ledger→Clarion, while the HLD names no mechanism, at `page.blocks[0].tabs[3].sections[0].diagram.edges[0].kind`.
- Unsupported transport: `https` asserts HTTPS for Clarion→phone deadline push, while the HLD names no mechanism, at `page.blocks[0].tabs[3].sections[0].diagram.edges[1].kind`.
- Unsupported transport: `int` asserts an internal service call for Ledger→Conduit, while the HLD names no mechanism, at `page.blocks[0].tabs[3].sections[0].diagram.edges[2].kind`.
- Unsupported HTTP verb: `PUT clip` is not stated by the HLD for the lapsed camera→Vault upload, at `page.blocks[0].tabs[3].sections[0].diagram.edges[4].label`.
- Unsupported renewal path and transport: `renew plan` sends phone→Halogate over HTTPS, but the HLD names neither Halogate nor a mechanism for renewal, at `page.blocks[0].tabs[3].sections[0].diagram.edges[6]`.
- Unsupported HTTP verb: `PUT clip → 403 lapsed` adds PUT to the HLD's 403 refusal, at `page.blocks[0].tabs[3].sections[0].diagram.steps[3].panels.elog.log[0].text`.
- Unsupported entitlement: AI SEARCH is modeled as a plan-controlled gate and switched off/on, while the HLD's lapse flow names Lens AI analysis and Watchtower but does not say Chronicle search is revoked, at `page.blocks[0].tabs[3].sections[0].diagram.panels[1].leds[2]`, `page.blocks[0].tabs[3].sections[0].diagram.steps[1].panels.gates.search`, and `page.blocks[0].tabs[3].sections[0].diagram.steps[6].panels.gates.search`.
- Unsupported actor detail: `renews through Halogate` adds Halogate to the owner's renewal, at `page.blocks[0].tabs[3].sections[0].diagram.steps[6].text`.

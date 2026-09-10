# Chime Radar — distance-gated alerts, visit paths, early camera wake (HLD)

**Status** Draft 2 · **Owners** doorbuzz-cloud / doorbell-fw + alerts-platform · **Updated** 2026-09-05 · **Reviewers** firmware, mobile, platform-core

## 1. Overview

Chime Radar is the radar-equipped successor to the Chime battery doorbell. A 60 GHz
radar co-processor measures the **distance and bearing** of anything moving in front
of the door, so alerts fire only inside a configurable threshold (default 15 ft),
every alert carries an **aerial visit path** assembled from the radar track, and the
camera wakes on trajectory — seconds **before** the visitor arrives — instead of on
a PIR trip at arm's length. The cloud reuses the doorbuzz-cloud universe (Relay, Pulse, Herald, Vault, plus the platform's Nimbus / Sentinel / Dispatch / Registry command path from the [Cumulus HLD](https://github.com/doorbuzz-cloud/platform/blob/main/docs/cumulus-hld.md#L1)) and adds two new services, Pathworks and Sift.

## 2. Hardware

Three chips, three power tiers — the new middle tier is the point:

- **Sentry LP** (existing) — always-on µA-class hub: wifi, MQTT session to Relay, PIR (retained as fallback trigger), wake lines to both siblings — [fw/sentry/main.c#L44](https://github.com/doorbuzz-cloud/chime/blob/main/fw/sentry/main.c#L44)
- **Scout RD** (NEW) — 60 GHz FMCW radar co-processor: 3-antenna angle-of-arrival, on-die CFAR detector + track filter, 0–28 ft range, ~2 mA duty-cycled (10 Hz idle, 20 Hz tracking); SPI to Sentry LP plus a `RADAR_INT` line; holds a 30 s track ring buffer and the threshold config registers — [fw/scout/track.c#L88](https://github.com/doorbuzz-cloud/chime/blob/main/fw/scout/track.c#L88)
- **Vision HP** (existing) — camera + H.264 encoder, off until `WAKE_INT`, hundreds of mA running — [fw/vision/pipeline.c#L120](https://github.com/doorbuzz-cloud/chime/blob/main/fw/vision/pipeline.c#L120)
- **Power / radio** — quick-release Li-ion pack, optional wired trickle; 2.4/5 GHz wifi on Sentry LP only — Scout RD never touches the network directly.

## 3. Backend services

| Service | Status | Responsibility |
|---|---|---|
| Relay Broker | existing | MQTT over TLS :8883; persistent sessions park QoS 1 traffic for sleeping doorbells |
| Pulse Events | existing | event ingest, eventId dedup, alert lifecycle, dismissal ledger |
| Herald Push | existing | push gateway to resident phones |
| Vault Clips | existing | clip storage; now also stores visit-path records keyed by eventId |
| Nimbus API / Sentinel Auth | existing (platform) | public API gateway / JWT verification and scope checks |
| Dispatch / Registry | existing (platform) | command sequencing / versioned device-shadow store (desired vs reported) |
| Pathworks | NEW | projects radar track fixes through mount calibration into an aerial visit-path record — [services/pathworks/assemble.go#L61](https://github.com/doorbuzz-cloud/chime/blob/main/services/pathworks/assemble.go#L61) |
| Sift | NEW | false-alert tuning: joins dismissals with visit paths, proposes threshold changes — [services/sift/suggest.go#L42](https://github.com/doorbuzz-cloud/chime/blob/main/services/sift/suggest.go#L42) |

## 4. Flows

### Flow 1 — Distance-gated motion alert

1. Scout RD acquires a track at 24 ft and, because that is outside the configured 15 ft alert line, keeps it entirely local — no interrupt, no radio.
2. Scout RD keeps updating the track as the passer-by follows the sidewalk arc at 20–24 ft; Sentry LP and Vision HP stay asleep.
3. The track leaves the field and Scout RD drops it — a non-alert that cost microwatts instead of a push notification.
4. A second visitor turns up the walkway; Scout RD sees range fall through 15 ft and raises `RADAR_INT` to Sentry LP with range and bearing latched in its status registers.
5. Sentry LP wakes its radio and publishes `evt/door/motion` to Relay with trigger `radar`, `range_ft` 14.6, and the threshold in force.
6. Relay delivers the event to Pulse, which dedups on eventId and opens the alert.
7. Pulse asks Herald to notify the household.
8. Herald pushes "Visitor 14 ft from the door, approaching" to the resident's phone.

### Flow 2 — Visit path attached to the alert

1. From first acquisition Scout RD appends every track fix (ms offset, range, bearing) to its 30-second ring buffer, overwriting the oldest frames.
2. When the alert fires (Flow 1 step 4), Scout RD freezes the pre-trigger fixes as protected so the approach cannot be overwritten while the visit continues.
3. Sentry LP reads the full track — protected pre-roll plus live fixes — from Scout RD over SPI.
4. Sentry LP publishes the batch to Relay on `evt/door/track`, tagged with the same eventId as the motion event.
5. Relay delivers the batch to Pathworks.
6. Pathworks projects the fixes into yard coordinates using the stored mount calibration and assembles the aerial visit path.
7. Pathworks stores the path record in Vault under the eventId, beside where the clip will land.
8. Pathworks tells Pulse the path is ready, and Pulse has Herald update the pending notification with the path thumbnail.
9. The resident opens the alert and scrubs the walk-up; the app fetches path frames from Vault over HTTPS.

### Flow 3 — Radar-before-camera wake sequencing

1. Scout RD tracks an approach crossing the 15 ft line inbound at 3.1 ft/s and raises `RADAR_INT` to Sentry LP with range and closing speed.
2. Sentry LP computes time-to-door (~4 s) and raises `WAKE_INT` to Vision HP before touching the radio — the camera gets the head start.
3. Vision HP powers its sensor rail and boots the encoder while the visitor is still ~12 ft out.
4. In parallel, Sentry LP publishes `evt/door/motion` to Relay.
5. Relay delivers the event to Pulse, and Pulse pushes the alert through Herald to the phone.
6. Vision HP reaches RECORD about 1.2 s after the radar trip, with the visitor still ~9 ft away — the clip opens on the approach, not on a doorbell press.
7. Vision HP records the visit and uploads the clip to Vault under the shared eventId.
8. Vault tells Pulse the clip is indexed; the event timeline now holds alert, aerial path, and clip.

### Flow 4 — False-alert tuning of the distance threshold

1. Herald delivers three alerts within an hour, each a sidewalk pass that grazed 14–15 ft without ever turning in.
2. The resident dismisses each alert; the app POSTs the dismissals to Nimbus API with the bearer token.
3. Nimbus verifies the token with Sentinel Auth, then forwards each dismissal to Pulse, where it is recorded against the eventId.
4. Pulse forwards the device's dismissal tally to Sift.
5. Sift joins the dismissed events with their Pathworks records and finds every dismissed track stayed outside 12 ft — the sidewalk clips the alert circle.
6. Sift files a suggestion with Pulse ("tighten the alert line to 11 ft"), and Herald pushes it to the resident.
7. The resident accepts; the app POSTs the config change to Nimbus, which, after another Sentinel check, hands it to Dispatch.
8. Dispatch writes the new desired state to Registry as a versioned shadow write, then publishes `cmd/door/radar-config` to Relay at QoS 1.
9. Relay parks the command in the doorbell's persistent session and delivers it on Sentry LP's next wake window.
10. Sentry LP writes the new threshold into Scout RD's config registers and acknowledges on `ack/door` with the applied shadow version — the same sidewalk pass now ends as Flow 1 step 3, silently.

## 5. Wire contracts

Radar-qualified motion event (`evt/door/motion`, MQTT) — [docs/wire.md#radar-motion](https://github.com/doorbuzz-cloud/chime/blob/main/docs/wire.md#radar-motion)

| field | sample value | meaning |
|---|---|---|
| type | "motion" | logical event type; Relay routes it to `evt/door/motion` |
| eventId | 0x51C0FFEE | dedup key; clip and visit path embed the same id |
| trigger | "radar" | radar-gated; "pir" means Scout RD is offline (fallback mode) |
| range_ft | 14.6 | range at the trigger instant |
| bearing_deg | 250 | bearing in Scout RD's frame at trigger |
| speed_fps | 3.1 | closing speed; positive = inbound |
| threshold_ft | 15 | alert line in force — Sift audits against it |
| ttl | 30s | broker message-expiry; stale motion dropped |

Track batch (`evt/door/track`, MQTT) — [docs/wire.md#track-batch](https://github.com/doorbuzz-cloud/chime/blob/main/docs/wire.md#track-batch)

| field | sample value | meaning |
|---|---|---|
| eventId | 0x51C0FFEE | joins the path to its alert and clip |
| t0 | unix ms | wall time of the first fix |
| cal_rev | 7 | mount-calibration revision Pathworks must project with |
| fixes | [[0,24.1,255],…] | per fix: [ms offset, range ft, bearing deg]; 43 in this batch |

Threshold config (`cmd/door/radar-config`, MQTT QoS 1) — [docs/wire.md#radar-config](https://github.com/doorbuzz-cloud/chime/blob/main/docs/wire.md#radar-config)

| field | sample value | meaning |
|---|---|---|
| threshold_ft | 11 | new alert line, written into Scout RD's registers |
| shadow_ver | 19 | Registry shadow version; stale writes are rejected |
| source | "sift:sg-284" | which Sift suggestion produced this write (audit trail) |

## 6. Failure modes

- **Wifi drops** — Scout RD keeps gating; Sentry LP queues events in flash and Relay's persistent session replays QoS 1 on reconnect; alerts arrive late but the visit path still assembles.
- **Battery low / radar fault** — below 20 % Scout RD stretches idle duty cycle (10 Hz → 2 Hz, ~0.5 s slower acquisition); below 8 % — or after repeated Scout RD watchdog resets — the radar rail latches off and the doorbell degrades to PIR-triggered Chime (`trigger:"pir"`, `radar_fault` published).
- **Pathworks / Registry / Dispatch down** — alerts fire without the map (Relay retains the track batch; the path assembles late); threshold changes fail as retryable API errors while the device enforces its last-applied config, so gating never stops.
- **Vision HP thermal shutdown** — unchanged from the Chime thermal HLD: gating and alerts continue while the camera cools; clips are the only loss.

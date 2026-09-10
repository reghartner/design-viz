# wrenlight Perch — Two-Year Battery Camera & Loft Module HLD

| | |
|---|---|
| Status | Draft 2 |
| Owners | perch-firmware (wrenlight) |
| Last updated | 2026-09-05 |
| Reviewers | rf-systems, cloud-services |

## 1. Overview

Perch is wrenlight's ultra-low-power outdoor camera: two AA lithium cells, a
two-year battery contract, and a wall-powered sync module — the **Loft** — that owns
everything expensive. The camera sleeps at 4 µA behind a PIR gate; a qualified event
records a short clip and ships it over **TwigLink**, wrenlight's proprietary 908 MHz
sub-GHz link, to the Loft, which buffers and uploads over house Wi-Fi. Every design
decision is an entry in one account book: 3300 mAh over 730 days is a daily
allowance of 4.5 mAh, and every wake-up is billed against it.

## 2. Hardware

- **Perch camera** — dual-chip split. **Twig (WL-LP1)**: always-on Cortex-M0+ at — [twig/src/wake.c#L52](https://github.com/wrenlight/perch-firmware/blob/main/twig/src/wake.c#L52), [twig/src/qualify.c#L118](https://github.com/wrenlight/perch-firmware/blob/main/twig/src/qualify.c#L118), [twig/src/coldprofile.c#L33](https://github.com/wrenlight/perch-firmware/blob/main/twig/src/coldprofile.c#L33)
  4 µA sleep; owns the PIR analog front end, the thermistor, the TwigLink radio MAC,
  and the power rail of its big sibling. **Bough (WL-AP4)**: 1080p video SoC, 400 ms
  boot from retained RAM, 64 MB staging flash (about 3 clips). IR illuminator
  (850 nm), no spotlight. Power: 2× AA lithium (Li-FeS₂) primary cells in series —
  3300 mAh at 3 V; alkaline fits the holder but voids the two-year math (§6).
- **TwigLink radio** — 908.4 MHz FSK, 500 kbps, AES-CCM-128, star topology; every — [twig/rf/mac.c#L207](https://github.com/wrenlight/perch-firmware/blob/main/twig/rf/mac.c#L207)
  camera is a leaf of exactly one Loft.
- **Perch Loft (sync module)** — wall-powered; Wi-Fi SoC plus the WL-C2 TwigLink — [src/queue/emmc_store.c#L91](https://github.com/wrenlight/loft-firmware/blob/main/src/queue/emmc_store.c#L91)
  concentrator; 32 GB eMMC store-and-forward buffer; USB-A for a local archive
  drive; serves up to 10 cameras.
- Optional **Sunrail** solar mount: small panel plus a Li-ion buffer cell that
  trickles the AA rail; its charge controller is temperature-gated (§4 Flow 4).

## 3. Backend services

- **Roost** — device registry and session service; each Loft holds one outbound — [services/roost/supervise.go#L144](https://github.com/wrenlight/cloud/blob/main/services/roost/supervise.go#L144)
  persistent TLS channel; tracks per-camera supervision state.
- **Granary** — clip object store for cloud-plan homes; indexes USB-archive — [services/granary/ingest.go#L60](https://github.com/wrenlight/cloud/blob/main/services/granary/ingest.go#L60)
  manifests for local-only homes without holding their video.
- **Abacus** — battery ledger; folds wake receipts into a per-camera forecast and — [services/abacus/forecast.go#L76](https://github.com/wrenlight/cloud/blob/main/services/abacus/forecast.go#L76)
  raises the "months left" number the app shows.
- **Flitter** — push notification fan-out.
- **Molt** — firmware staging; the Loft trickles camera images over TwigLink in the
  supervision windows so a sleeping camera never pays for a long download.

## 4. Flows

### Flow 1 — What a wake-up costs (the battery-day ledger)

1. The PIR front end trips and wakes Twig out of its 4 µA sleep.
2. Twig runs an 800 ms qualification pass at 2 mA — PIR pulse shape plus lux check — and a rejected trip (heat shimmer, headlights) goes back to sleep having spent 0.0004 battery-days.
3. On a qualified trip, Twig raises Bough's power rail; Bough boots from retained RAM in 400 ms at 120 mA.
4. Bough records a 12 s clip at 180 mA — night adds 60 mA of IR — into staging flash.
5. In parallel Twig opens a TwigLink session to the Loft with an event pre-notice (camera, timestamp, estimated size).
6. Bough hands the 2.4 MB encoded clip to Twig, and the radio ships it in 8 s at 45 mA.
7. The Loft acks the final chunk; Twig drops Bough's rail and the camera is back at 4 µA.
8. Twig appends a wake receipt to its ledger: 0.91 mAh total, or 0.20 battery-days — one night event costs a fifth of a day's allowance.
9. The Loft forwards the receipt with the clip manifest to Abacus.
10. Abacus refolds the forecast — five night events a day spends the whole allowance, so today's eleven trims the display from 24 to 22 months — and the app graph updates.

### Flow 2 — The TwigLink leash: retry and supervision

1. Every 60 minutes Twig wakes the radio for a 200 ms check-in: sequence number, battery voltage, temperature, last RSSI.
2. The Loft acks with a clock sync and pending flags (settings changed, arm/disarm, firmware offer).
3. On a missed ack Twig retries at +2 s, +8 s, and +30 s, hopping channels each attempt.
4. Still unheard, Twig enters backoff — a check-in every 5 minutes — while PIR rules stay armed locally and new clips park in the 64 MB staging flash.
5. After two silent check-in windows the Loft marks the camera UNSUPERVISED and reports it to Roost.
6. Roost has Flitter push "Front gate unreachable since 14:20."
7. When the link returns, Twig's check-in carries `missed=7, staged=2`, and the Loft pulls both staged clips.
8. The Loft clears the supervision alarm through Roost and logs the RSSI history for the app's placement advice.

### Flow 3 — Clip upload with the Loft as gateway

1. Twig streams the clip as 1 KB sequenced TwigLink chunks, each sealed with AES-CCM.
2. The Loft writes chunks straight into its eMMC store-and-forward queue and acks with a window credit.
3. Lost chunks are re-requested by NACK bitmap — at most three repair rounds, because retries bill the camera's battery, not the Loft's wall power.
4. The Loft verifies the final MIC and acks END: responsibility transfers, and the camera is released to sleep.
5. The Loft assembles the clip, computes its digest, and enqueues an upload manifest for Granary.
6. The Loft uploads over house Wi-Fi TLS; on success the queue entry flips to uploaded.
7. Granary triggers Flitter, and the push lands with a thumbnail.
8. If Wi-Fi is down the queue simply holds — 32 GB is about three weeks of clips — and drains oldest-first on return; USB-archive homes skip the cloud leg entirely.

### Flow 4 — Cold weather: lithium chemistry and its limits

1. An hourly check-in reports the thermistor at −24 °C.
2. The Loft's next ack sets the camera's cold profile.
3. Twig applies the limits: IR illuminator capped at 50%, clip length capped 12 s → 8 s, live view refused below −30 °C.
4. The battery gauge switches models: Li-FeS₂ still delivers at −24 °C but sags under IR load, so Twig reads voltage under a known load and corrects along the temperature curve instead of trusting open-circuit volts.
5. Qualification thresholds tighten — warm bodies against cold air trip the PIR harder, and small wildlife would otherwise wake Bough all night.
6. On Sunrail mounts the charge controller suspends Li-ion charging below 0 °C (plating risk) and reports `charge_suspended`; the panel still offsets daytime supervision draw.
7. Abacus prices the cold in: "at −20 °C nightly, forecast 24 → 19 months."
8. If the discharge curve says alkaline, the app warns: months not years, and dead below −10 °C — lithium cells are a requirement, not a suggestion.

## 5. Wire contracts

TwigLink clip chunk (camera → Loft, 908.4 MHz frame):

| field | sample value | meaning |
|---|---|---|
| `net_id` | `0x7A31` | Loft's network; leaves of other Lofts ignore it |
| `cam_id` | `PC-2214` | sending camera |
| `seq` | `1847` | chunk sequence within the clip |
| `type` | `CLIP_CHUNK` | frame class (`CHECKIN`, `PRENOTICE`, `CLIP_CHUNK`, `END`) |
| `len` | `1024` | payload bytes |
| `mic` | `c41f…` | AES-CCM tag; Loft drops the frame on mismatch |

Wake receipt (camera → Loft → Abacus):

| field | sample value | meaning |
|---|---|---|
| `event_id` | `pc2214-9917` | ties receipt to clip manifest |
| `qual_ms` | `800` | qualification time at 2 mA |
| `rec_ms` | `12000` | record time at 180 mA |
| `ir` | `true` | night event; +60 mA while recording |
| `radio_ms` | `8200` | TwigLink session length at 45 mA |
| `mah` | `0.91` | metered total for this wake |
| `days_cost` | `0.20` | mAh ÷ 4.5 mAh daily allowance |
| `batt_pct` | `81` | temperature-corrected gauge after the event |
| `temp_c` | `-24` | thermistor at wake |

(The Loft → Granary upload manifest carries `clip_id`, `cam_id`, a `sha256` digest
checked after reassembly, `bytes`, `queued_at`, and an `attempts` counter.)

## 6. Failure modes

- **House Wi-Fi drops** — cameras are unaffected (they never speak Wi-Fi); the Loft keeps taking clips into eMMC and drains the queue on return; pushes arrive late.
- **Loft loses power** — cameras stay armed on local rules, stage up to 3 clips in flash, and burn extra battery on retry backoff; Roost marks the site offline after 5 missed Loft heartbeats and pushes an outage alert.
- **Battery low** — staged degradation: at 20% live view is disabled, at 8% clips cap at 5 s and check-ins go daily, at 3% the camera sends PIR text events only — a last-gasp doorbell, not a camera.
- **Cloud down** — the Loft records and buffers as normal; USB-archive homes don't notice; cloud-plan homes see clips arrive in a burst afterward.
- **RF interference on 908 MHz** — per-attempt channel hopping first; if the noise floor stays high the Loft raises an RF-environment alert with the RSSI history.
- **Alkaline cells installed** — detected by discharge curve; the two-year contract is voided in the app copy and cold limits engage at −10 °C instead of −30 °C.

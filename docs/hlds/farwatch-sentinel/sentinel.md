# Sentinel — Cellular Off-Grid Solar Camera HLD

| | |
|---|---|
| Org / product | farwatch / Sentinel |
| Status / updated | Draft 2 · 2026-09-05 |

## 1. Overview

Sentinel is farwatch's off-grid camera: solar-charged, cellular-connected, and —
unusually for a battery camera — recording **continuously**, 24/7, into a local
microSD ring. There is no wifi, hub, or wire; the only paths in and out are an
LTE modem and a solar panel, both budgeted resources. The design is two ledgers
wrapped around a camera: an **energy ledger** (panel watt-hours in vs recording
and radio watt-hours out) and a **data ledger** (a monthly SIM pool spent on
thumbnails, clips, and live view). This document covers the daily solar budget,
the continuous ring recorder with event indexing, data-cap tier management, and
the cloudy-week degradation sequence that ends in preservation mode.

## 2. Hardware

- **Sensor + optics**: 1/1.8" 4 MP low-light sensor, IR illuminator, 10 m PIR.
- **Low-power / high-power split**, the load-bearing design choice:
  - **Ember LP** — always-on RISC-V core: ISP, ~90 mW H.265 continuous encode,
    ring writer, PIR controller, fuel gauge, energy ledger; alone sustains 24/7.
  - **Blaze HP** — quad-core AP + 2-TOPS NPU, normally off: wakes for event
    classification, thumbnail crops, uploads, and live view.
- **Radio**: LTE Cat-4 modem with eSIM, duty-cycled — attaches only during
  radio windows or on demand; no wifi radio at all.
- **Power**: 19,200 mAh (≈71 Wh) Li-ion pack; 5.4 W panel with MPPT; charging
  locks out below 0 °C via thermistor interlock (the pack still discharges).
- **Storage**: 512 GB microSD ring (~9.5 days at 1.5 Mbps) + 256 MB internal
  flash for the event index and config.

## 3. Backend services

| Service | Responsibility | Code |
|---|---|---|
| Waystation | Cellular device gateway: sessions, frames, store-and-forward to sleeping cameras | https://github.com/farwatch/cloud/blob/main/waystation/session.go#L83 |
| Wrangler | Media intake and storage: thumbnails, on-demand clips, CDN edge | https://github.com/farwatch/cloud/blob/main/wrangler/intake.go#L47 |
| Tally | SIM data-pool metering: per-cycle usage, tier directives, command reserve | https://github.com/farwatch/cloud/blob/main/tally/meter.go#L129 |
| Almanac | Weather and solar forecasting: per-site sun-hour outlooks pushed nightly | https://github.com/farwatch/cloud/blob/main/almanac/outlook.go#L58 |
| Homestead | Accounts, app API, mirrored event/timeline index, energy card | https://github.com/farwatch/cloud/blob/main/homestead/api.go#L212 |
| Signalfire | Push notification delivery (invoked by Wrangler and Homestead) | https://github.com/farwatch/cloud/blob/main/signalfire/push.go#L31 |

## 4. Flows

### Flow 1 — The daily solar energy budget

1. During the 03:00 radio window, Almanac pushes today's solar forecast (2.1 sun-hours, overcast morning) through Waystation to the camera.
2. Ember LP computes expected panel intake: 2.1 h × 5.4 W ≈ 11.3 Wh.
3. Ember LP sums the standing load: continuous encode 6.7 Wh + ring writes 1.2 Wh + radio windows 3.1 Wh + AI wakes 1.4 Wh ≈ 12.4 Wh/day.
4. The ledger lands 1.1 Wh short; with the pack at 64%, Ember LP rules the day "sustainable with drawdown" (−0.9%/day) and leaves the plan unchanged.
5. Blaze HP wakes for 20 seconds and reports the ledger verdict through Waystation to Homestead.
6. Homestead stores the ledger; the app's energy card shows intake vs load and the verdict.
7. At the noon checkpoint the sky has cleared; the panel is delivering 5.1 W and Ember LP revises expected intake to 16 Wh.
8. The revised ledger flips the verdict to "surplus"; the evening close posts +3.2 Wh with the pack at 66%.
9. Homestead appends the closed ledger to the site's energy history, which Almanac uses to calibrate the next forecast.

### Flow 2 — Continuous recording into the ring, with event indexing

1. Ember LP encodes 24/7 at 1.5 Mbps into 30-minute segments on the microSD ring.
2. When the card is full, the write head overwrites the oldest *unprotected* segment — the ring is ~9.5 days deep.
3. The PIR trips; Ember LP tags the timestamp and raises a wake interrupt to Blaze HP.
4. Blaze HP boots in 380 ms and classifies the buffered frames: person, 0.88.
5. Blaze HP writes an event marker to the index and flips the two covering segments to *protected*, exempting them from overwrite.
6. Blaze HP crops a thumbnail and sends it through the modem to Waystation.
7. Waystation hands the media to Wrangler; Wrangler stores it and Signalfire pushes the notification to the owner's phone.
8. The owner scrubs the timeline; the app pulls only the event marker list from Homestead — no video moves.
9. The owner taps play; the clip streams from the ring over LTE, debited against the data pool (Flow 3).
10. Two weeks later the protected pair ages out of retention and returns to the overwritable pool.

### Flow 3 — Cellular data-cap management

1. The camera's eSIM carries a 3 GB/cycle pool; Tally opens the cycle at 0 MB used.
2. The modem driver meters every upload and live-view minute and reports usage to Tally in the daily ledger ping.
3. At 60% used (day 19), Tally issues a tier-1 directive: live view drops 1080p → 720p, clip uploads switch to on-demand only.
4. Waystation relays the directive as a quota state frame; Ember LP applies it without a reboot.
5. The app shows the quota bar and Tally's projected exhaustion date (day 26 of a 30-day cycle).
6. At 80%, tier 2: notifications carry thumbnails only; full clips stay on the ring, marked "held" in the app until the cycle resets or the owner forces a fetch.
7. At 95%, tier 3: event notifications go text-only and live view is disabled.
8. At 100%, Tally seals the pool except a 15 MB command reserve, so settings changes and emergency fetches still reach the camera.
9. The cycle resets on the 1st; Tally clears the tiers, the camera restores 1080p, and held clips remain fetchable on demand rather than auto-uploading as a burst.

### Flow 4 — Cloudy week: degradation to preservation mode

1. Day 1 is overcast: intake 4 Wh against a 12 Wh load; the pack falls 64% → 58% and the ledger verdict is "deficit".
2. Almanac's 5-day outlook shows three more overcast days, so Ember LP enters ECO: encode drops 1.5 → 0.8 Mbps and the IR illuminator is dimmed.
3. Day 2 the pack falls 58% → 50%; radio windows stretch from hourly to 4-hourly and live view is disabled to keep the modem cold.
4. Homestead posts the mode change and the outlook to the app, so the degradation is explained before anyone notices missing features.
5. Day 3 the pack hits 41%; continuous encoding stops — EVENT-ONLY mode records PIR-gated clips and everything else sleeps.
6. Day 4 the pack hits 28%; the radio drops to one 90-second check-in per day.
7. The pack crosses 15%: PRESERVATION — recording stops entirely; the PIR still logs text-only event markers to internal flash.
8. Ember LP flushes the event index to the card and spends one final 20-second modem burst posting "entering preservation" to Homestead.
9. Day 6 the sun returns; the panel charges the sleeping camera and at 30% Ember LP resumes EVENT-ONLY.
10. At 55% the camera returns to FULL continuous recording and posts the recovery ledger; the timeline shows honest gap markers for the dark days.

## 5. Wire contracts

Daily energy ledger — camera → Homestead (via Waystation, CBOR frame):

| field | sample value | meaning |
|---|---|---|
| day | `2026-09-05` | ledger date (site-local) |
| panel_wh | `11.3` | measured + forecast solar intake |
| load_wh | `12.4` | recording + ring + radio + AI load |
| soc_pct | `64` | pack state of charge at report time |
| verdict | `deficit` | `surplus` / `sustainable` / `deficit` |
| mode | `FULL` | `FULL` / `ECO` / `EVENT-ONLY` / `PRESERVATION` |
| chg_lock | `false` | true when the 0 °C charge interlock is active |

Quota state frame — Tally → camera (via Waystation):

| field | sample value | meaning |
|---|---|---|
| cycle_used_mb | `1843` | metered usage this cycle |
| cap_mb | `3072` | pool size for this eSIM plan |
| tier | `1` | 0 = unrestricted … 4 = sealed |
| caps | `{"live":"720p","clips":"on-demand"}` | active restrictions at this tier |
| reserve_mb | `15` | command reserve kept usable at tier 4 |
| resets_at | `2026-10-01T00:00Z` | next cycle boundary |

(A third contract, the event-marker index record — `marker_id`, `ts`, `class/conf`, protected `segs`, `uplinked: none|thumb|clip` — mirrors to Homestead whenever the radio allows.)

## 6. Failure modes

- **Cellular loss / Waystation / Tally down** (identical from the camera's view): recording and indexing continue at the current energy mode; markers queue on-device and mirror on return; the last quota tier is kept rather than assuming an open pool; the app shows last check-in age instead of pretending liveness.
- **Battery low**: the Flow 4 ladder — FULL → ECO → EVENT-ONLY → PRESERVATION; quality sheds before recording, recording before reachability.
- **Cold snap**: below 0 °C the charge interlock opens (`chg_lock=true`); the ledger treats intake as zero and the ladder runs on discharge alone.
- **microSD failure**: the index lives on internal flash so history survives; recording halts and a text-only alert spends the command reserve if needed.
- **Quota sealed**: tier 4 is a data state, not an outage — the 15 MB reserve keeps commands reachable; nothing recorded is lost, only unfetched.

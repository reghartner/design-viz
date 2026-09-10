# Auralis Presence — mmWave room sensing, fall safety, offline autonomy (HLD)

**Status** Draft 2 · **Owners** auralis / sensing-fw + safety-cloud · **Updated** 2026-09-05 · **Reviewers** firmware, hub, mobile, care-partners

## 1. Overview

Presence is auralis's wall-mounted mmWave room sensor. It tracks position — not
just motion — so it can hold **named zones** (Bed, Desk, Kitchen, Entry) with true
occupancy through stillness, watch for the **height-collapse signature of a fall**
and drive a check-in-then-escalate safety ladder, measure **sleep and daytime
inactivity** from respiration and zone activity, and keep local automations running
through the **Atrium** hub when the internet is gone. Cloud transport is MQTT to
the Chorus broker; a parallel LAN channel to Atrium makes the hub path survive an
outage. No camera, no microphone — position, posture, and breathing are the only
signals, which is the pitch for bathrooms and bedrooms — [docs/hld.md#overview](https://github.com/auralis/presence/blob/main/docs/hld.md#overview)

## 2. Hardware

- **Iris MW** — 60 GHz FMCW mmWave front-end, 3TX/4RX angle-of-arrival, on-die tracking DSP: multi-target tracks, posture/height estimation, 2 Hz breath-sensing mode — [fw/iris/tracker.c#L74](https://github.com/auralis/presence/blob/main/fw/iris/tracker.c#L74)
- **Aria MCU** — dual-core wifi MCU: zone engine mapping Iris tracks into the named zone map, MQTT session to Chorus, LAN channel to Atrium, cached local rules, 16 MB flash store-and-forward buffer (~4 h) — [fw/aria/zones.c#L112](https://github.com/auralis/presence/blob/main/fw/aria/zones.c#L112)
- **Power** — USB-C wall supply, no battery; no sleepy low-power split — the split is *sampling modes*, TRACK at 20 Hz versus BREATH at 2 Hz, traded for RF duty cycle rather than sleep.
- **Atrium hub** (companion, sold separately) — LAN peer with a Thread radio for actuators, a speaker/siren, and a compiled-routine cache synced by Cadence — [hub/routines/local.go#L91](https://github.com/auralis/atrium/blob/main/hub/routines/local.go#L91)

## 3. Backend services

| Service | Responsibility |
|---|---|
| Overture API | public API gateway; app traffic, TLS termination, routing |
| Clef Auth | token service; JWT verification, scope checks, care-contact grants |
| Chorus | MQTT broker (TLS :8883); persistent sessions per sensor and hub |
| Motif | zone-event service: dedup, per-room zone ledger, fan-out to consumers |
| Vigil | safety cases: fall/inactivity intake, check-in timer, escalation ladder, telephony bridge to contacts — [services/vigil/case.go#L58](https://github.com/auralis/cloud/blob/main/services/vigil/case.go#L58) |
| Tempo | sleep records and daytime-inactivity baselines per resident |
| Encore | push gateway to resident and contact phones |
| Cadence | routine compiler; syncs compiled routines to Atrium and the sensor so automation can run without the cloud |

## 4. Flows

### Flow 1 — Multi-zone presence tracking (entry / exit)

1. Iris MW acquires a track as the resident steps through the doorway and streams per-frame positions to Aria MCU.
2. Aria MCU maps the position into the room's zone map and marks zone Entry occupied.
3. Aria MCU publishes the `entry → occupied` edge to Chorus and mirrors the same event to Atrium over the LAN channel.
4. Chorus delivers the event to Motif, which updates the room's zone ledger.
5. The resident crosses to the desk; Aria MCU emits `entry → clear` and `desk → occupied` edge events to both Chorus and Atrium.
6. Atrium matches `desk occupied` against its cached routine and switches the desk lamp on over Thread — no cloud round trip.
7. Motif streams the zone timeline through Overture to the resident's open app.
8. The resident sits still reading; Iris MW's micro-motion sensing keeps Desk occupied where a PIR would have timed out to vacant.

### Flow 2 — Fall detection, check-in, escalation

1. Iris MW's posture estimator sees the track's height collapse from 1.7 m to 0.4 m by the shower and flags a fall hypothesis to Aria MCU.
2. Aria MCU runs a 30-second on-device confirmation window — sudden height drop and no recovery motion.
3. Confirmation holds; Aria MCU publishes `evt/room/safety` (fall, confidence 0.93, zone Shower) to Chorus at QoS 1.
4. Chorus delivers to Motif, which forwards safety events straight to Vigil; Vigil opens a case.
5. Vigil starts the human check-in: Encore pushes "Are you OK? — respond within 60 s" to the resident's phone while Atrium speaks the same prompt in the room.
6. No response arrives, and Iris MW still reports a prone target with breathing micro-motion, which Aria attaches to the case as live telemetry.
7. The check-in window expires; Vigil dials the first emergency contact with zone, time, and vitals summary.
8. No answer within 90 s; Vigil dials the second contact, who accepts and confirms they are heading over.
9. Vigil marks the case engaged and streams live occupancy to that contact's app until Iris MW reports an upright, moving track again.
10. Aria reports recovery; Vigil closes the case and writes the full timeline — hypothesis to closure — to the ledger.

### Flow 3 — Sleep and inactivity monitoring

1. At 23:10 the track settles into zone Bed; Aria MCU switches Iris MW into 2 Hz breath-sensing mode.
2. Aria MCU publishes `sleep/session-start`; Chorus delivers it to Tempo, which opens the night's record.
3. Overnight, Aria batches respiration-rate and restlessness samples to Tempo every 10 minutes.
4. A restless spell at 04:12 is folded into the record as a wake event.
5. At 07:40 the track leaves Bed; Aria publishes `session-end`, Tempo finalizes the record, and Encore delivers the morning summary.
6. Separately, Tempo's inactivity watcher scores each daytime hour's zone activity against the resident's rolling baseline.
7. By 12:00 no Kitchen occupancy has been seen on a day the baseline expects it; Tempo raises an inactivity flag to Vigil.
8. Vigil runs the same ladder as a fall, but starts at the gentle end — an app check-in, then contacts — because inactivity is a slow signal.

### Flow 4 — Internet outage: local automation and reconciliation

1. The ISP drops at 20:12; Aria MCU's Chorus session times out and its cloud link flips to OFFLINE while the LAN channel to Atrium stays up.
2. Atrium also loses Chorus and switches to local-authority mode — its cached routine set becomes the only automation engine.
3. The resident walks into the kitchen; Aria sends `kitchen → occupied` to Atrium over the LAN and the lights routine fires in ~40 ms.
4. Aria MCU appends every zone event to its 4-hour flash store-and-forward buffer.
5. A fall during the outage stays local: Vigil is unreachable, so Atrium runs the degraded ladder itself — spoken prompt, then siren and strobing lights; it cannot dial contacts without internet.
6. Connectivity returns at 21:03; Aria reconnects to Chorus and drains the buffer oldest-first, each event carrying its original timestamp.
7. Motif reconciles the backfill into the ledger with the span marked backfilled; Tempo recomputes the sleep/inactivity windows it overlaps.
8. Vigil reviews the buffered fall case, finds it resolved locally (the resident got up at 20:41), and files it with a note instead of paging anyone.

## 5. Wire contracts

Zone edge event (`evt/room/zone`, MQTT) — [docs/wire.md#zone-event](https://github.com/auralis/presence/blob/main/docs/wire.md#zone-event)

| field | sample value | meaning |
|---|---|---|
| type | "zone" | zone occupancy edge |
| zone | "desk" | named zone id from the room map |
| state | "occupied" | occupied / clear |
| trackId | 3 | which tracked person caused the edge |
| pos_m | [1.4, 2.1] | x/y meters from the sensor mount |
| seq | 8123 | per-session sequence; Motif orders backfill by it |
| ts | unix ms | event time — preserved through store-and-forward |

Fall alert (`evt/room/safety`, MQTT QoS 1) — [docs/wire.md#safety-event](https://github.com/auralis/presence/blob/main/docs/wire.md#safety-event)

| field | sample value | meaning |
|---|---|---|
| type | "fall" | safety event class (fall / inactivity) |
| zone | "shower" | where the track collapsed |
| conf | 0.93 | fall-classifier confidence after the 30 s window |
| height_m | 0.4 | track height after collapse (from 1.7) |
| window_s | 30 | on-device confirmation window that was applied |
| micro_motion | true | breathing detected — rides along as vitals context |
| seq / ts | 8140 / unix ms | ordering + original event time |

Backfill envelope (wraps drained events after an outage) — [docs/wire.md#backfill](https://github.com/auralis/presence/blob/main/docs/wire.md#backfill)

| field | sample value | meaning |
|---|---|---|
| backfill | true | tells Motif this is reconciliation, not live traffic |
| span | [20:12, 21:03] | outage window the batch covers |
| count | 212 | events drained from flash ("wifi-outage" reason attached) |

## 6. Failure modes

- **Internet drops** — Flow 4 is the design: LAN automations and the local safety ladder keep running; events buffer 4 h; the honest loss is outbound calling — no contact is dialed until the link returns, and the app shows "local mode".
- **Power fails** — no battery, so the sensor goes dark; Atrium raises a lost-sensor alert after three missed heartbeats (~90 s), and Vigil treats a dark sensor in a care household as a soft check-in trigger, not silence.
- **Battery low** — not applicable on the sensor (wall power); Atrium's own backup battery keeps the siren ladder alive ~4 h into a power cut.
- **Chorus or Motif down** — identical to an outage from the sensor's view: buffer and drain; the LAN path is unaffected.
- **Vigil down** — Motif holds safety events in a dead-letter queue with retry and pages the on-call; Atrium's local ladder is the household backstop.
- **Track confusion** — two people merging into one track demotes tracker confidence; automations still fire, but safety classification pauses rather than guess.

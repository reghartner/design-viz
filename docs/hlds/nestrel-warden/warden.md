# Nestrel Warden — Wired Cloud Camera with Offline Buffer HLD

## 1. Overview

Warden is Nestrel's wired indoor/outdoor cloud camera. Classification runs
on-device; everything else — history, LLM-written notification descriptions,
search — lives in the Nestrel cloud. Warden's defining trait is that it does
not go blind when the wifi does: up to one hour of classified events buffers
to a reserved flash partition and back-fills after reconnect, with dedup and
timeline reconciliation, so the household sees one honest timeline and one
summary notification instead of a burst of stale alerts. This document
covers the normal event path, the buffer's fill and drain, and the staged
overnight firmware rollout with health-checked automatic rollback.

## 2. Hardware

- **Kestrel SoC (NR-V2)** — dual Cortex-A35 + vision DSP; on-device
  person/vehicle/animal/package classifier, H.264 encode, TLS. Wired and
  always on: **no low-power/high-power split** — one SoC does everything.
- **Flash** — 8 GB eMMC: dual firmware slots (A/B) plus a reserved 512 MB
  event-buffer partition good for ~60 minutes of classified event clips,
  managed as a ring of 12 segments.
- **Sensors** — 1/2.8" 2K HDR sensor; 6 IR LEDs with mechanical IR-cut;
  mic + speaker; status LED; enclosure temperature sensor.
- **Radios** — dual-band 802.11ac wifi (no ethernet); BLE 5 for setup only.
- **Power** — 24 V wall adapter; a supercapacitor rides through sub-second
  dips, anything longer is a real outage and a marked gap.

## 3. Backend services

| Service | Responsibility | Code |
|---|---|---|
| Skybridge | Device gateway; persistent TLS control channel, heartbeats, clock sync | https://github.com/nestrel/cloud/blob/main/services/skybridge/session.go#L86 |
| Inlet | Media ingest; chunked event upload, assembly, checksum verification | https://github.com/nestrel/cloud/blob/main/services/inlet/ingest.go#L131 |
| Coldstore | Clip and thumbnail object storage | https://github.com/nestrel/cloud/blob/main/services/coldstore/objects.go#L58 |
| Scribe | Cloud LLM captioner; one-line descriptions from key frames + labels | https://github.com/nestrel/cloud/blob/main/services/scribe/describe.go#L49 |
| Timeline | Per-camera event index; dedup by event_uid, outage reconciliation, gap badging | https://github.com/nestrel/cloud/blob/main/services/timeline/reconcile.go#L133 |
| Courier | Notification fan-out; rate limiting and post-outage summary collapsing | https://github.com/nestrel/cloud/blob/main/services/courier/push.go#L72 |
| Vitals | Fleet health; heartbeat tracking, firmware versions, rollout telemetry | https://github.com/nestrel/cloud/blob/main/services/vitals/health.go#L94 |
| Foundry | Firmware release + staged wave coordinator; artifact store, halt thresholds | https://github.com/nestrel/cloud/blob/main/services/foundry/waves.go#L212 |

## 4. Flows

### Flow 1 — Normal event with an LLM-written notification

1. Warden's classifier detects a person with a package in the porch zone and finalizes a 24-second event clip in RAM.
2. Warden posts the event envelope to Skybridge, which forwards it to Timeline to slot event_uid ev-8f31 into the camera's timeline.
3. Warden streams the clip chunks to Inlet, which assembles, verifies, and writes the object to Coldstore.
4. Inlet hands key frames and the classifier labels to Scribe.
5. Scribe's LLM writes the caption ("A courier leaves a box at the front door") and posts it to Timeline against ev-8f31.
6. Timeline emits a notify record to Courier, which pushes the described notification to the household's phones.

### Flow 2 — Wifi loss: one hour in the dark

1. The router reboots and Warden's association drops; the connection manager marks the wifi link and cloud session LOST and switches the recorder's output to the flash buffer.
2. Warden probes for the access point on a 5 s / 15 s / 60 s backoff while sensing and classification continue unaffected.
3. Motion fires and the recorder writes event ev-4361 to flash segment 1 with its wall-clock timestamp and monotonic counter.
4. Two more events land in segments 2–3; the write head advances and the buffer reports 41 minutes of capacity left.
5. At 58 minutes offline the ring is full and the recorder overwrites the oldest unprotected segment — oldest events are lost first, newest are kept.
6. Skybridge misses three heartbeats and tells Vitals, which has Courier push an "offline since 18:02" alert to the household.

### Flow 3 — Reconnect: back-fill, dedup, reconciliation

An independent incident from Flow 2 — a shorter (47-minute) outage at the
same site that never fills the ring, shown to teach the dedup path.

1. The access point returns; Warden reassociates and resumes its TLS session, and Skybridge resyncs the clock and returns the last event_uid it has acked.
2. Warden sends Timeline a back-fill manifest listing four buffered events with timestamps, durations, and clip hashes.
3. Timeline dedups the manifest against its index and returns the upload list — ev-4410 was uploaded just before the drop but never acked, so it is marked duplicate and skipped.
4. Warden uploads the three missing clips oldest-first to Inlet at background priority so live traffic always wins.
5. Inlet writes each clip to Coldstore and acks each event_uid, and Warden flips each acked flash segment to reclaimable.
6. Timeline splices the back-filled events in at their recorded timestamps and badges the outage window "recovered offline".
7. Timeline sends the batch to Scribe, which captions all three in one call, and attaches the captions without re-notifying per event.
8. Courier pushes a single summary — "Warden was offline 47 min; 3 events recovered" — instead of three stale alerts.

### Flow 4 — Staged firmware rollout, overnight, with a parachute

1. A release engineer promotes firmware 4.2.0 in Foundry, which opens wave 3 (5% of the fleet) for the overnight window.
2. Foundry queries Vitals for each wave-3 camera's health and skips any that is offline, mid-event, or running hot.
3. Foundry publishes the update offer to Skybridge, which delivers it to Warden's control channel at 02:10 local.
4. Warden confirms it is idle — no live view, no buffered backlog — and downloads the signed image from Foundry's artifact store.
5. Warden verifies the signature and digest against its secure-boot keys, writes the image to slot B marked boot-once, and reboots — recording pauses about 40 seconds.
6. The new firmware starts its health check: camera pipeline up, buffer partition mounted, TLS session established within 120 seconds.
7. The 4.2.0 wifi driver fails to associate inside the window, so the boot watchdog reboots the camera into slot A automatically — no cloud round-trip needed.
8. Slot A (4.1.7) comes back, reconnects, and reports the rollback with failure code WIFI_ASSOC_TIMEOUT to Vitals.
9. Vitals feeds wave statistics to Foundry, which holds wave 3 when rollbacks cross 1% and pages the release engineer.

## 5. Wire contracts

Back-fill manifest (Warden → Timeline, Flow 3 step 2), [flashring.c](https://github.com/nestrel/firmware/blob/main/warden/buffer/flashring.c#L77):

| field | sample value | meaning |
|---|---|---|
| cam_id | "warden-7f9" | device identity |
| outage_start | 1757088120 | when the uplink dropped |
| outage_end | 1757090940 | when the TLS session resumed |
| clock_skew_ms | 1840 | correction Skybridge applied; Timeline shifts timestamps |
| events | [{"uid":"ev-4410","ts":1757088180,"dur_s":19,"sha256":"9c41…"},…] | one entry per buffered event; uid is the dedup key |
| dropped | 0 | events lost to ring overwrite during the outage |

Update offer (Foundry → Warden via Skybridge, Flow 4 step 3), [slots.c](https://github.com/nestrel/firmware/blob/main/warden/ota/slots.c#L164):

| field | sample value | meaning |
|---|---|---|
| release_id | "rel-420-w3" | release + wave identity for telemetry |
| version | "4.2.0" | target firmware version |
| image_url | "https://fw.nestrel.io/warden/4.2.0.img" | artifact-store download |
| sha256 | "e07b…" | image digest, checked before flashing |
| sig | "b64:MEUC…" | release signature, checked against secure-boot keys |
| window | "01:00-05:00" | local install window; offer expires outside it |
| health_timeout_s | 120 | how long the post-boot health check may take |

## 6. Failure modes

- **Wifi drops** — the whole point: classification and recording continue,
  events buffer to flash for ~60 minutes, oldest-first overwrite after that;
  a longer outage loses the oldest excess, never the most recent events.
- **Power fails** — wired, no battery: the camera goes dark and the timeline shows a hard gap; the supercap only guarantees the in-flight flash write completes, so the buffer is never corrupted mid-segment.
- **Flash wear** — buffer segments failing verification are retired, shrinking capacity; Vitals raises an advisory below 30 minutes.
- **Scribe down** — notifications fall back to plain labels ("Person, package"); captions are back-filled onto the timeline on recovery.
- **Inlet down** — the same flash buffer absorbs it: unacked events stay buffered and the back-fill flow (§4.3) runs on recovery, so a cloud ingest outage looks like a wifi outage to the camera.
- **Timeline down** — acks stop, so segments stay protected until acked: no data loss, just delayed dedup and splice.
- **Firmware update fails** — slot B never becomes default until the health
  check passes; boot-once plus the watchdog guarantees an unattended return
  to slot A (Flow §4.4 steps 7–8).

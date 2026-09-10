# hearthline Sentry Panel — Monitored Alarm HLD

| | |
|---|---|
| Status | Draft 1 |
| Owners | hearthline platform-core |
| Last updated | 2026-09-05 |
| Reviewers | monitoring-ops, firmware |

## 1. Overview

Sentry Panel is hearthline's professionally monitored home alarm. Battery sensors
(entry, motion, glassbreak) talk to a mains-powered base station over a proprietary
sub-GHz radio; the base station runs the certified alarm state machine locally and
signals the monitoring center over broadband first, failing over to a built-in
cellular modem under active supervision — mid-incident if necessary, with sequence
numbers preserved so the monitoring side never double-books or loses an event.
Monitored plans add camera verification: an agent reviews the attached clip, attempts
a talk-down through the camera's speaker, and only then decides on dispatch. The
keypad supports a duress code that looks exactly like a normal disarm at the premises
while silently opening a priority incident upstream.

## 2. Hardware

The base station is a deliberate low-power/high-power split:

- **Ember-M0** (low-power side) — always-on Cortex-M0+ that owns the certified alarm
  state machine, the 915 MHz sub-GHz transceiver, the siren driver, and the event
  outbox in flash; runs 24 h on the backup pack alone.
  https://github.com/hearthline/panel-fw/blob/main/ember/state_machine.c#L88
- **Hearth-A53** (high-power side) — application SoC that owns wifi, the LTE Cat-M1
  modem (soldered SIM), TLS signaling sessions, and camera liaison; it can be down
  without the alarm core losing state.
  https://github.com/hearthline/panel-fw/blob/main/hearth/uplink_super.c#L141
- Radios: 2.4/5 GHz wifi, LTE Cat-M1, 915 MHz FSK sub-GHz (rolling-code frames);
  power: mains + 4×AA NiMH backup (24 h); 95 dB siren.
- **Keypad** — segment LCD, AA cells, sub-GHz; entry-delay beeper.
- **Sensor family** — entry (reed), motion (pet-immune PIR), glassbreak (dual-stage
  acoustic); coin/AA cells; supervisory beacon every 12 minutes.
- **Sentry Cam** — wifi outdoor camera; rechargeable battery, spotlight, siren, and
  speaker/mic for agent talk-down.

## 3. Backend services

- **Hearthgate** — signaling ingest; terminates panel TLS on both the broadband path
  and the cellular APN; dedupes on (account, seq).
  https://github.com/hearthline/monitor-core/blob/main/hearthgate/ingest.go#L204
- **Register** — append-only alarm event journal; source of truth for incident timelines.
- **Overwatch** — monitoring-center core; opens incidents, assigns agent consoles, tracks
  acknowledgments and SLA clocks, holds test-mode dispatch suppression.
  https://github.com/hearthline/monitor-core/blob/main/overwatch/incident.go#L96
- **Guardline** — agent console backend; clip review queue and live talk-down relay.
- **Clipline** — clip store; cameras upload verification clips, attached to incidents.
- **Summons** — dispatch bridge; forwards verified requests to regional
  emergency-services gateways with the clip reference.
- **Roster** — account/device registry; sensor inventory, zone config, walk-test records.
- **Beacon** — owner push notifications; enforces the duress suppression policy.
- **Countersign** — auth; panel client certificates, agent SSO, keypad code policy
  (including per-account duress codes).
  https://github.com/hearthline/monitor-core/blob/main/countersign/codes.go#L57

## 4. Flows

### 4.1 Alarm over broadband, cellular failover mid-incident

1. Glassbreak sensor GB-2 hears a break and sends a sub-GHz alarm frame to Ember-M0.
2. Ember-M0 latches ALARM in the state machine, fires the siren, and hands the event to Hearth-A53.
3. Hearth-A53 sends signal seq 4181 (alarm, zone 3) to Hearthgate over broadband TLS, and Hearthgate acks it within 2 seconds.
4. Hearthgate appends the event to Register and forwards it to Overwatch, which opens incident INC-7731.
5. Hearth-A53 sends seq 4182 (siren-on) into a broadband link that has just died, so no ack returns.
6. The 15-second ack supervision timer expires, so Hearth-A53 powers the LTE modem and opens a TLS session to Hearthgate over the cellular APN.
7. Hearth-A53 retransmits seq 4182 and continues with seq 4183 on the cellular path, and Hearthgate dedupes on (account, seq) so nothing double-books.
8. Overwatch assigns the incident to an agent, and the monitoring-center acknowledgment travels back to the panel over the same cellular session.
9. Ember-M0 marks the incident center-acknowledged, the keypad shows MONITORING NOTIFIED, and Hearth-A53 keeps probing broadband for fail-back.

### 4.2 Camera-verified dispatch

1. On the ALARM latch, Hearth-A53 asks Sentry Cam to record, and the camera uploads a 30-second clip to Clipline over wifi.
2. Clipline attaches the clip to INC-7731 and tells Overwatch the incident is camera-verification eligible.
3. Overwatch pops the incident on a Guardline agent console with the clip queued first.
4. The agent reviews the clip and confirms a person inside the premises perimeter.
5. The agent opens a talk-down: Guardline relays live agent audio to the camera's speaker while the camera streams live video back.
6. The subject does not leave, so the agent marks the incident "verified intruder" and requests dispatch from Overwatch.
7. Overwatch hands the dispatch request and clip reference to Summons, which forwards it to the regional emergency-services gateway — verified video raises response priority.
8. Beacon pushes the owner the full timeline: alarm, clip, talk-down attempted, dispatch requested.

### 4.3 Walk test

1. The owner starts a walk test in the app; the request lands on Roster, which commands the panel into TEST mode.
2. Ember-M0 enters TEST: sensors report normally, the siren stays quiet, and every signal is tagged test-mode; Overwatch marks the account "test in progress — suppress dispatch."
3. The owner trips each sensor in turn, and each sub-GHz frame reaches Ember-M0, which chirps the keypad and marks that sensor tested.
4. Hearth-A53 streams per-sensor results to Roster, which updates the walk-test inventory: front entry PASS, hall motion PASS.
5. The basement entry sensor never reports; after two attempts Roster shows it FAIL (last supervisory 3 days ago, battery critical).
6. The owner swaps the sensor battery and trips it again, and the arriving frame flips basement entry to PASS.
7. The owner ends the test at the keypad, and Ember-M0 verifies every enrolled sensor was exercised before leaving TEST.
8. Hearth-A53 sends the test-complete report to Hearthgate, which tells Overwatch to lift dispatch suppression.
9. Roster stores the signed walk-test record and the panel returns to DISARMED/READY — fully armed-capable.

### 4.4 Entry-delay disarm, and the duress variant

1. The front door opens while armed-away; the entry sensor's frame reaches Ember-M0, which starts the 30-second entry delay and beeps the keypad.
2. Hearth-A53 sends a pending-entry event to Hearthgate so the monitoring side has context if the delay expires.
3. The user keys a 4-digit code, and the keypad sends it to Ember-M0 in a rolling-code envelope.
4. Normal path: the code matches the owner's code, Ember-M0 disarms and cancels the delay, and Overwatch closes the pending entry silently on the disarm event.
5. Duress path: the code matches the owner's duress code, and locally everything is identical — the keypad shows DISARMED, no siren, entry delay cancelled.
6. The disarm event Hearth-A53 sends carries `flags.duress=1` inside the signed envelope, invisible at the premises.
7. Overwatch opens a silent duress incident and routes it to an agent flagged NO PREMISES CONTACT — no callback, no siren, no talk-down.
8. Beacon suppresses the normal owner push, because an attacker watching the owner's phone must see nothing unusual.
9. The agent follows the duress protocol and requests priority dispatch through Summons while the panel continues to look disarmed.

## 5. Wire contracts

Sensor frame (sensor → panel, sub-GHz 915 MHz):
https://github.com/hearthline/panel-fw/blob/main/ember/subghz_frame.h#L23

| field | sample value | meaning |
|---|---|---|
| `sensor_id` | `0x3F82A1` | factory id, enrolled against the account in Roster |
| `type` | `glassbreak` | sensor class |
| `state` | `alarm` | `alarm` / `restore` / `supervisory` / `tamper` |
| `counter` | `0x00B4` | rolling code; Ember-M0 rejects replays |
| `batt_mv` | `2810` | cell voltage; below 2600 flags low battery |
| `rssi` | `-71` | received strength, logged for placement advice |

Signaling event (panel → Hearthgate, TLS over broadband or cellular):
https://github.com/hearthline/monitor-core/blob/main/hearthgate/envelope.go#L61

| field | sample value | meaning |
|---|---|---|
| `acct` | `HL-55021` | account id |
| `seq` | `4182` | per-panel monotonic; drives dedupe and gap detection |
| `event` | `siren_on` | `alarm` / `siren_on` / `pending_entry` / `disarm` / `test_*` |
| `zone` | `3` | zone number from the Roster config |
| `path` | `cell` | `bb` or `cell` — which uplink carried this copy |
| `flags` | `{"duress":1}` | duress bit rides inside the signed body only |
| `hmac` | `9f31…` | panel key over the whole envelope |

## 6. Failure modes

- **Broadband drops**: 15-second ack supervision triggers cellular failover mid-incident
  (§4.1); seq numbering makes the switch invisible to Register.
- **Power fails**: 24 h on the backup pack; Hearth-A53 sheds wifi and camera liaison
  while Ember-M0 keeps the state machine, sub-GHz, and on-demand LTE alive; the keypad
  announces "on backup power."
- **Both uplinks down**: the siren and latched alarm state still work locally; events
  queue in Ember-M0 flash with their seq numbers and flush in order on restore, and
  Hearthgate gap detection reconciles against Register.
- **Sensor battery low**: supervisory frames carry `batt_mv`; Roster schedules a keypad
  chirp and app nag; a sensor silent past 3 supervisory windows is flagged unsupervised.
- **Hearthgate region down**: panels retry the alternate region endpoint (DNS-steered).
- **Agent overload**: Overwatch queues incidents against SLA clocks; alarm events are never
  dropped, but camera verification degrades to the unverified dispatch policy.
- **Walk test abandoned**: TEST auto-expires after 60 minutes and suppression lifts
  even if the app session died; the §4.3 keypad exit is explicit, expiry is the backstop.

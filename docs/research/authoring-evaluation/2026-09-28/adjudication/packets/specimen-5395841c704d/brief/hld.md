# HLD: Kestrel Porch Cam — overnight on battery

Status: reviewed design, Kestrel Home platform team.

## Summary

The Kestrel Porch Cam is a battery doorbell camera with a small solar panel.
This document describes one night on battery: the camera catches an animal
late at night, its battery crosses the low-battery threshold before dawn,
solar charging starts at sunrise, and a courier delivers a package in the
morning. It also describes what happens when home Wi-Fi is down during the
delivery.

## Components

| Component | Role |
|---|---|
| Porch Cam (device) | Detects motion (PIR), records clips, reports battery. Wi-Fi to the home router. |
| Home router | Home Wi-Fi access point. Not a Kestrel service. |
| event-ingest | Receives motion events and heartbeats from cameras over HTTPS. |
| motion-classifier | Labels clips (person, animal, package). Owned by the ML team. |
| clip-store | Stores uploaded clips. |
| device-shadow | Holds the last reported state of each camera (battery %, charging, online). The app reads this. |
| notify-service | Decides which push notifications to send and sends them through Apple/Google push. |
| Kestrel app (phone) | Shows notifications and the camera's device page (battery, power source, last seen, last event). |

## Behavior

1. **Heartbeat.** Every 30 minutes the camera sends a heartbeat to
   event-ingest: battery %, charging yes/no, firmware. event-ingest writes it to
   device-shadow. The app's device page shows "Battery NN% · updated <time>".
   Between heartbeats the app shows the last reported value.
2. **Motion.** On PIR motion the camera wakes, records a clip (about 20 s),
   and uploads it: POST /events to event-ingest, then the clip to clip-store.
   event-ingest asks motion-classifier for a label. If the label is `person`
   or `package`, notify-service sends a push. `animal` events are saved to the
   timeline with no push (default user setting).
3. **Low battery.** When a heartbeat reports battery at or below 20%,
   device-shadow marks the camera `low_battery` and notify-service sends one
   "Porch Cam battery low" push. It is not sent again until battery goes above
   30%.
4. **Solar.** When the panel produces power the camera reports charging=yes on
   its next heartbeat. The app shows the solar charging icon.
5. **Power use.** Idle drain is about 1% per hour. Each recorded clip uses
   about 1%. Solar in morning light adds about 3–4% per hour.
6. **Wi-Fi down.** If the camera cannot reach the router it keeps recording
   to its local SD card and retries every 2 minutes. On reconnect it uploads
   queued clips and sends a heartbeat. device-shadow marks the camera offline
   when two heartbeats in a row are missed (60 minutes); before that the app
   still shows the last state with an older "updated" time.

## Scenario to depict

- Evening: the resident goes to bed. Battery is 25%, not charging.
- Late night: a raccoon crosses the porch. Clip recorded and uploaded,
  classified `animal`, no push.
- Before dawn: a heartbeat reports 20% → low-battery push.
- Sunrise: charging starts.
- Morning: a courier drops a package. Clip classified `package` → push
  "Package delivered at front door". Resident opens the clip.
- Alternate: at the delivery, home Wi-Fi is down. Clip is saved on the SD
  card. Wi-Fi returns about 10 minutes later; the clip uploads, then the
  package push is sent (late).

## Out of scope

Live view, two-way audio, subscription tiers.

# Panel time and icon guide

Use this while filling worksheet sections B, D, E and G. It lists, per panel
type, the fields that carry time, the fields that carry icons, and what the
renderer computes for you. It is a summary: confirm exact shapes with
`python3 <VIZ>/tools/widget_doc.py <types>` before writing JSON. All patches are
sparse: omitted fields carry forward along the selected path.

## Time-bearing fields

With `diagram.storyTime`, the step's `time` drives the clocks and the
battery (see `docs/step-time.md` in VIZ). The fields below are what is still
yours at every clock move.

| Panel type | Time-bearing fields to reconsider at every clock move | Notes |
|---|---|---|
| `phone` | none: `clock`/`date` follow the step time | Do not set `clock`/`date` in new specs; an explicit value pins the panel until story time moves. Notifications (`notify`) accumulate; `clear: true` removes them. |
| `deviceapp` | each field's `detail` text, `note` (`clock`/`date` follow the step time) | `detail` is where freshness lives ("Updated just now", "Last report 6:05 PM · 13 h ago"). `status` is explicit: `unknown`, `loading`, `ready`, `stale`, `error`. A new value does not change status or detail by itself. Tile badges are optional: `badgeMode:"none"` hides them; `"custom"` uses `badgeText`/hex `badgeColor` without changing status or detail. A `kind: "battery"` card is reported: patch it at report steps. |
| `appscreens` | none: `clock`/`date` follow the step time | Pick screen images that fit the time of day. |
| `battery` | `trend` (`charging`, `draining`, `idle`), extra `drain`, `charge` anchor, `note` | Charge drifts by itself: `drainPerHour`/`chargePerHour` on the panel, else `deviceDefaults.battery`, else built-in placeholders (1 and 20 %/h, never device facts). Charging applies from the step after `trend: "charging"`. `drain` subtracts a one-step operation cost; `charge` sets an exact anchor. `note` can say "illustrative drain estimate". |
| `thermo` | `value` | Moves only with a cause. The zone is computed from `warn`/`crit` (and optional `lowWarn`/`lowCrit`). |
| `dispatch` | `timeOfDay` (`day`, `dusk`, `night`), responder `eta` text | ETA is authored text, never a countdown. It holds until a source-backed update arrives; do not decrement it because time passed. If it has gone stale, age or qualify it ("ETA 8 min, as of 2:10 PM"). |
| `screen` | declaration `scene` (not patchable per step) | Choose a scene that matches the story and its time, for example `person-at-door-night` only for a night story. Stock scenes: `person-at-door-night`, `person-through-door`, `doorbell-run-away`, `doorbell-runners`, `package-drop`, `kitchen-fire`, `static-noise` (test pattern). If none fits, omit the screen. |
| `security` | step `scene` (optional clip override), `detail`, `note` | Time can be written in `detail` or `note` text. |
| `homemap` | none | No day/night field. Time shows through subject positions, device states and captions. |
| `cost` | `messages`, `note` when the workload scenario changes | `period` is an authored cost label, not a clock. Elapsed story time does not accrue usage or prorate fixed charges. Keep all entries on the same volume and billing period; see `cookbook/messaging-cost.md`. |
| `log`, `table`, `state` | authored text | If you print timestamps, keep them consistent with the clock. |

Clock rule per path: story time never goes backward. The date changes by
itself after midnight. Choose the format once in `storyTime.clock` and
`.date`, and write the same time in the caption.

Freshness rule: whenever the story time moves, recompute `detail` for every
device-app card that shows a report time or age. If a report is overdue by the
source's rule, also set `status: "stale"` (cached) or `"error"` (unavailable)
as the source supports. Never leave "Updated just now" on a card three hours
later.

## Icon-bearing elements

Icons are chosen by the author. **A value never changes an icon by itself** on
these elements. Patch the icon at the same step the state appears, and restore
it when the state clears.

| Element | Where the icon goes | Default | Restore |
|---|---|---|---|
| Device app card | `fields[].icon` (default); `initial.<field>.icon`; step `panels.<id>.<field>.icon` | battery card: `battery`; text card: none | `icon: null` restores the declared/default icon |
| Home camera, hub, sensor | panel `devices[].icon`; `initial.<device>` or step patch as an object: `{"<device>": {"icon": "camera-off"}}` | `camera`, `router`, `gear` | `{"<device>": {"icon": null}}` |
| Home subject | `subjects[].icon`; step `{"<subject>": {"icon": "car"}}` | person avatar | `icon: null`; an icon-only patch does not show a hidden subject |
| Home entry door | no icon (geometric artwork) | | use `open` / `closed` / `alert` states |
| Diagram node | `nodes.<id>.icon` (static for the whole diagram) | `gear` | per-step change is a `tone`, not an icon |

Icons that the renderer computes for you (do not try to patch them; patch the
underlying value instead):
- `battery` panel: the main icon is `battery-charging` whenever
  `trend: "charging"`, even in the low or critical zone (the zone still shows
  through its color); otherwise `battery-low` in the low/critical zone. A
  snowflake is added when `cold: true`.
- `thermo` panel: shows `hot` in warn/crit zones and `cold` in cold zones.
- `security` panel: sensor icon comes from the sensor `kind`; alarm styling
  comes from the sensor `alarm` value and panel `status`.
- `dispatch` panel: responder icon comes from the responder `kind`.

Home devices also have a separate `thermal` attribute (`normal`, `warm`,
`hot`, `cold`, `freezing`) that draws heat or frost. It is independent of the
icon and of operation state: set it for hot/cold stories, and set
`thermal: "normal"` when the device recovers.

## State to icon mapping (library IDs that exist)

| State in the story | Icon ID | Restore when |
|---|---|---|
| Battery normal / full | `battery`, `battery-full` | |
| Low battery | `battery-low` | charged above the low threshold |
| Charging | `battery-charging` | charging stops |
| Wired / solar power | `plug`, `solar` | power source changes |
| Hot | `hot` (also Home `thermal: "hot"`) | temperature back in range |
| Cold / freezing | `cold`, `snowflake` (also Home `thermal`) | temperature back in range |
| Normal temperature | `temperature`, `thermo` | |
| Connection lost (Wi-Fi) | `wifi-off` (normal: `wifi`) | reconnect is evidenced |
| Cloud unreachable | `cloud-off` (normal: `cloud`) | reconnect is evidenced |
| Signal | `signal`, `antenna` | |
| Camera off / unavailable | `camera-off` (normal: `camera`) | camera back on |
| Recording saved | `recorded` | |
| Armed / disarmed | `armed`, `disarmed` | mode changes |
| Alarm raised / triggered | `alarm`, `triggered`, `siren` | alarm cleared or acknowledged per source |
| Motion / detection | `motion`, `detection` | |
| Door / lock | `door`, `lock` | |
| Smoke / water leak | `smoke`, `water` | |
| Person / vehicle / package | `person`, `car`, `package` | |
| Microphone muted | `microphone-muted` (normal: `microphone`) | |

Complete ID list, by category (from `docs/shared-icons.md`):
Software `terminal gear db server chip`; Connectivity `cloud antenna router
wifi wifi-off cloud-off signal`; Security `shield key lock alarm armed disarmed
triggered door motion smoke water sensor`; Temperature `thermo temperature hot
cold snowflake`; Home `pump package phone house doorbell bulb car person`;
Video `camera monitor camera-off`; Audio `speaker microphone microphone-muted
recorded chime siren detection headset`; Power `battery battery-full
battery-low battery-charging voltage voltage-normal voltage-high voltage-low
voltage-off plug solar`; Dispatch `police fire medical
security`. Do not use any other ID.

## Checklist per step (use for worksheet section E)

- [ ] Step `time` set if story time passes (panels follow it); none for a beat within the same minute.
- [ ] Freshness `detail` recomputed on every card that shows an age.
- [ ] A reported card value changed only if this step lights the report.
- [ ] At a state change, every carried card value (recording, thermal,
      connection) is still true, or rewritten.
- [ ] Battery: drift is automatic; `trend` patched where charging starts or stops, `drain` for an operation the source costs, `charge` only at an anchor.
- [ ] Temperature considered (holds unless there is a cause).
- [ ] Every icon whose state changed at this step is patched; every icon whose
      state cleared is restored.
- [ ] Home subjects are where the caption says they are.
- [ ] Notifications: added only when the source says one is sent and delivered.

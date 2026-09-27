# Recipe — battery / charge level with a low-battery event

Widget: `battery` — a charge level where LOW is bad. Declare the thresholds
once (`low`, `crit`, both inclusive at-or-below); each step patches `charge`
and optionally `trend` / `source` / `note` / `cold`. The engine computes the
zone (NOMINAL / LOW / CRITICAL) and colors the readout, the battery-glyph
fill, and the zone chip; a sparkline tracks the charge across every step.
`label` overrides only the chip text (e.g. `"PRESERVE"`).

Use `gauge` instead only for a level with no bad direction (current draw in
mA, storage %) — `gauge` has no thresholds.

Complete working spec:

```json
{
  "page": {
    "title": "Recipe — battery level",
    "skin": "aurora",
    "lanes": {
      "DEV": {"color": "#FFB454"},
      "NET": {"color": "#38E1FF"}
    },
    "blocks": [
      {
        "heading": "Battery drain — recording to low-battery push to recharge",
        "accent": "green",
        "text": [
          "The battery drains under encoder load; the low-power chip samples the fuel gauge, publishes a low-battery event at the 20 percent line, enters preservation mode at 10 percent, and recovers on the solar panel the next morning."
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Device"}},
          "nodes": {
            "lp":     {"title": "LP Chip", "sub": "fuel gauge · mqtt", "icon": "chip", "tint": "dev", "group": "device"},
            "soc":    {"title": "SoC", "sub": "camera · encoder", "icon": "chip", "tint": "dev", "group": "device"},
            "broker": {"title": "Broker", "sub": "MQTT", "icon": "antenna", "tint": "mqtt"},
            "phone":  {"title": "Phone", "sub": "companion app", "icon": "phone", "tint": "cmd"}
          },
          "rows": [
            [["lp", "soc"], "broker", "phone"]
          ],
          "edges": [
            {"from": "lp", "to": "broker", "kind": "mqtt", "label": "PUB battery"},
            {"from": "broker", "to": "phone", "kind": "mqtt", "label": "notify"}
          ],
          "panels": [
            {"id": "batt", "type": "battery", "title": "Battery", "low": 20, "crit": 10,
             "initial": {"charge": 86, "source": "cells", "trend": "idle", "note": "~41 days left"}},
            {"id": "mode", "type": "state", "title": "SoC — mode",
             "states": ["IDLE", "RECORDING", "PRESERVE"],
             "colors": {"IDLE": "#55627A", "RECORDING": "#FF6B5E", "PRESERVE": "#A78BFA"},
             "initial": {"state": "IDLE"}}
          ],
          "steps": [
            {"nodes": ["soc"], "lane": "DEV",
             "text": "Recording starts — encoder load drains the battery",
             "panels": {"mode": {"state": "RECORDING"},
                        "batt": {"charge": 71, "trend": "draining", "note": "~19 days at this rate"}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "Long session on a cold night — charging would be limited anyway",
             "panels": {"batt": {"charge": 43, "cold": true, "note": "cold: charge limited"}}},
            {"nodes": ["lp"], "lane": "DEV",
             "text": "LP chip samples the fuel gauge — the 20 percent line is crossed",
             "panels": {"batt": {"charge": 19, "note": "low-battery event armed"}}},
            {"edge": "lp->broker", "lane": "NET",
             "text": "Low-battery event published over MQTT"},
            {"edge": "broker->phone", "lane": "NET",
             "text": "The resident is notified"},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "10 percent — recording stops; the device enters preservation mode",
             "panels": {"mode": {"state": "PRESERVE"},
                        "batt": {"charge": 9, "label": "PRESERVE", "note": "alerts only"}}},
            {"nodes": ["lp"], "lane": "DEV",
             "text": "Morning sun — the solar panel takes over and the pack recovers",
             "panels": {"batt": {"charge": 24, "trend": "charging", "source": "solar",
                                 "cold": false, "label": null, "note": "full by afternoon"}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- Values steer the story exactly like `thermo`: cross `low` on the event
  step, reach `crit` on the preservation step, and give the recovery step a
  rising value with `"trend": "charging"` (shows the bolt) so the sparkline
  draws the full arc.
- `"label": null` returns the chip to the computed zone caption.
- `source` renders as a badge (SOLAR / WIRED / POE / CELLS); `cold: true`
  shows a snowflake for temperature-limited charging.
- Two-year AA-cell architectures: patch `note` with the drain forecast per
  step ("~700 days left" → "~640 days") — the note row is fixed-height and
  never reflows the panel.

## Drain from story time instead of typing every charge

When the story happens over hours (an overnight camera, a weekend away),
declare the diagram's `storyTime` and give steps a `time`. The battery then
drains by elapsed hours × `drainPerHour`, charges by × `chargePerHour` while
its trend is `charging`, and each `drain` patch subtracts a one-time cost.
Phone, device-app and app-screens clocks follow the same step time. Type a
`charge` only to anchor a known reading. A device app's battery card is a
*report*: patch its value on the step that delivers the report with
`"reportedAt": "now"`, and the card shows "Updated just now", "Updated 10 h
ago" and so on by itself on every later step. See [story time](../docs/step-time.md).

Ask for the story's span first (start, and end or duration), then the
device's drain and charge rates. Rates must come from the source or the user.
The built-in 1 and 20 %/h are placeholders, not device facts: if you use them
or any estimate, say so in the ledger and on the page, as this recipe does.

Complete working spec:

```json
{
  "page": {
    "title": "Recipe — battery drain from story time",
    "skin": "pastel",
    "sections": [
      {
        "heading": "A weekend away on one charge",
        "text": ["The camera starts Friday evening at 72 percent, drains 0.6 percent an hour, and spends extra charge on each recorded clip.", "Drain and charge rates are illustrative estimates, not measured device behavior."],
        "diagram": {
          "view": "step",
          "storyTime": {"start": "2026-10-02T18:00", "span": "2d", "clock": "12h", "date": "short"},
          "deviceDefaults": {"battery": {"drainPerHour": 0.6, "chargePerHour": 8}},
          "nodes": {
            "cam": {"title": "Driveway camera", "sub": "battery", "icon": "camera", "tint": "dev"},
            "phone": {"title": "Phone", "sub": "home app", "icon": "phone", "tint": "cmd"}
          },
          "rows": [["cam", "phone"]],
          "edges": [{"from": "cam", "to": "phone", "kind": "https", "label": "alert"}],
          "panels": [
            {"id": "batt", "type": "battery", "title": "Camera battery", "low": 20, "crit": 10,
             "initial": {"charge": 72, "source": "cells", "trend": "idle"}},
            {"id": "phone", "type": "phone", "title": "Phone"},
            {"id": "app", "type": "deviceapp", "title": "Home app", "device": "Driveway camera",
             "fields": [{"id": "battery", "label": "Battery", "kind": "battery"}],
             "initial": {"battery": {"value": 72, "status": "ready", "reportedAt": "now"}}}
          ],
          "steps": [
            {"nodes": ["cam"], "text": "Friday 6 PM: the house is empty."},
            {"time": "+14h", "edge": "cam->phone", "text": "Saturday 8 AM: a delivery; the clip costs 2 percent.",
             "panels": {"batt": {"drain": 2}, "app": {"battery": {"value": 62, "status": "ready", "reportedAt": "now"}}}},
            {"time": "+1d", "nodes": ["cam"], "text": "Sunday 8 AM: the fuel gauge reports 49 percent.",
             "panels": {"batt": {"charge": 49, "note": "gauge reading"}, "app": {"battery": {"value": 49, "status": "ready", "reportedAt": "now"}}}},
            {"time": "18:00", "nodes": ["cam"], "text": "Sunday 6 PM: the owners return."}
          ]
        }
      }
    ]
  }
}
```

- The phone never gets a `clock` or `date`; it shows Fri, Oct 2 · 6:00, then
  Sat · 8:00, Sun · 8:00 and Sun · 6:00 from the step times.
- Charge: 72 → 72 − 14 × 0.6 − 2 = 61.6 (shows 62%) → anchored 49 → 49 − 10 ×
  0.6 = 43.
- The app's battery card is patched only where a report arrives. It reads
  72% · Updated just now on Friday, 62% · Updated just now on Saturday, 49% ·
  Updated just now on Sunday morning and 49% · Updated 10 h ago on Sunday
  evening. No step types that text.
- `drainPerHour: 0` on a panel (for wired or PoE power) keeps it flat.

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

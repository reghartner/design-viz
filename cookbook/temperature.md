# Recipe — device temperature vs warning / shutdown thresholds

Widget: `thermo`. Declare the scale and thresholds ONCE on the panel; each
step patches only `value`. The engine computes the zone — green NOMINAL below
`warn`, amber WARNING at/above `warn`, red CRITICAL at/above `crit` — and a
sparkline plots every step's value, revealed up to the current step.

Key facts:

- `label` replaces only the zone-chip text (e.g. `"SOC OFF"` while the chip is
  powered down); it can never change the computed zone.
- Patch `"label": null` to return to the computed zone caption.
- All of `min` / `max` / `warn` / `crit` / `value` must be FINITE numbers; a
  JSON overflow literal like `1e400` is ignored with a validator warning and
  the value renders as NO DATA.
- A step with no finite value shows a dash and leaves a GAP in the sparkline
  (the line does not bridge it).

Complete working spec:

```json
{
  "page": {
    "title": "Recipe — device temperature",
    "skin": "aurora",
    "lanes": {
      "DEV": {"color": "#FFB454"},
      "NET": {"color": "#38E1FF"}
    },
    "blocks": [
      {
        "heading": "Die temperature — warn, shutdown, recover",
        "accent": "amber",
        "text": [
          "A high-power chip heats while it works. The author patches only the per-step value; the engine colors the readout, fill bar, and zone chip from the declared thresholds."
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Device"}},
          "nodes": {
            "lp":     {"title": "LP Chip", "sub": "always-on · mqtt", "icon": "chip", "tint": "dev", "group": "device"},
            "soc":    {"title": "SoC", "sub": "camera · encoder", "icon": "chip", "tint": "dev", "group": "device"},
            "broker": {"title": "Broker", "sub": "MQTT", "icon": "antenna", "tint": "mqtt"}
          },
          "rows": [
            [["lp", "soc"], "broker"]
          ],
          "edges": [
            {"from": "lp", "to": "broker", "kind": "mqtt", "label": "PUB status"}
          ],
          "panels": [
            {"id": "die", "type": "thermo", "title": "SoC — die temp",
             "unit": "°C", "min": 20, "max": 110, "warn": 75, "crit": 95,
             "initial": {"value": 31, "label": "SOC OFF"}},
            {"id": "pwr", "type": "state", "title": "SoC — power",
             "states": ["OFF", "ENCODING", "THROTTLED", "SHUTDOWN"],
             "colors": {"OFF": "#55627A", "ENCODING": "#38E1FF",
                        "THROTTLED": "#FFB454", "SHUTDOWN": "#FF6B5E"},
             "initial": {"state": "OFF"}}
          ],
          "steps": [
            {"nodes": ["soc"], "lane": "DEV",
             "text": "SoC wakes and starts encoding",
             "panels": {"pwr": {"state": "ENCODING"}, "die": {"value": 48, "label": null}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "Sustained encode — the die keeps warming",
             "panels": {"die": {"value": 68}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "75 °C warning crossed — firmware throttles the encoder",
             "panels": {"pwr": {"state": "THROTTLED"}, "die": {"value": 83}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "95 °C critical — the SoC powers itself off",
             "panels": {"pwr": {"state": "SHUTDOWN"}, "die": {"value": 96, "label": "SOC OFF"}}},
            {"edge": "lp->broker", "lane": "NET",
             "text": "The always-on chip reports the shutdown over MQTT",
             "panels": {"die": {"value": 88}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "Cooling toward re-arm — ready to wake again",
             "panels": {"pwr": {"state": "OFF"}, "die": {"value": 58}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- Different unit (°F, mA, RPM): set `unit`; the widget is generic
  value-vs-thresholds — but its zones treat HIGH as bad. For a level where LOW
  is bad (battery), see `battery-level.md`.
- Values steer the story: cross `warn` on the throttle step, reach `crit`
  exactly on the shutdown step, and give the recovery steps falling values so
  the sparkline draws the full arc.

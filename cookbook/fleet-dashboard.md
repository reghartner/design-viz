# Recipe — fleet grid: staged firmware rollout across cameras

Widget: `tiles` — one tile per device (or per rollout cohort), each with a
state chip from a declared vocabulary and a fixed-height sub-line. Patch PER
TILE ID (like `leds`): a patch replaces that tile's `{state, sub}`. A tile
starts DIMMED until its first patch — dim means "no claim yet".

Complete working spec (canary → wave → fleet, with a failure and rollback):

```json
{
  "page": {
    "title": "Recipe — staged rollout",
    "skin": "aurora",
    "lanes": {
      "OTA": {"color": "#A78BFA"},
      "OPS": {"color": "#38E1FF"}
    },
    "blocks": [
      {
        "heading": "Firmware 2.2 rolls out — canary first, rollback on a fault",
        "accent": "violet",
        "text": [
          "The console updates one canary camera, watches its health gate, expands to a wave, hits a fault on one unit, pauses the rollout, and rolls the failed unit back — the grid is the whole story."
        ],
        "diagram": {
          "view": "step",
          "nodes": {
            "rel":  {"title": "Release Svc", "sub": "fw registry", "icon": "cloud", "tint": "cmd"},
            "nvr":  {"title": "Console", "sub": "staging + health", "icon": "server", "tint": "data"},
            "fleet":{"title": "Camera Fleet", "sub": "6 devices", "icon": "chip", "tint": "dev"}
          },
          "rows": [
            ["rel", "nvr", "fleet"]
          ],
          "edges": [
            {"from": "rel", "to": "nvr", "kind": "https", "label": "fw 2.2"},
            {"from": "nvr", "to": "fleet", "kind": "int", "label": "stage+install"},
            {"from": "fleet", "to": "nvr", "kind": "int", "ret": true, "label": "health"}
          ],
          "panels": [
            {"id": "grid", "type": "tiles", "title": "Fleet — fw state",
             "tiles": [
               {"id": "c1", "label": "Front"}, {"id": "c2", "label": "Drive"},
               {"id": "c3", "label": "Yard"},  {"id": "c4", "label": "Side"},
               {"id": "c5", "label": "Garage"},{"id": "c6", "label": "Back"}
             ],
             "states": ["V2.1", "STAGING", "UPDATING", "V2.2", "FAULT", "ROLLED BACK"],
             "colors": {"V2.1": "#55627A", "STAGING": "#38E1FF", "UPDATING": "#A78BFA",
                        "V2.2": "#4ADE80", "FAULT": "#FF6B5E", "ROLLED BACK": "#FFB454"},
             "initial": {"c1": {"state": "V2.1"}, "c2": {"state": "V2.1"},
                         "c3": {"state": "V2.1"}, "c4": {"state": "V2.1"},
                         "c5": {"state": "V2.1"}, "c6": {"state": "V2.1"}}},
            {"id": "phase", "type": "state", "title": "Rollout phase",
             "states": ["IDLE", "CANARY", "WAVE 1", "PAUSED", "ROLLBACK"],
             "colors": {"CANARY": "#38E1FF", "WAVE 1": "#A78BFA",
                        "PAUSED": "#FFB454", "ROLLBACK": "#FF6B5E"},
             "initial": {"state": "IDLE"}}
          ],
          "steps": [
            {"edge": "rel->nvr", "lane": "OTA",
             "text": "Console pulls firmware 2.2 and verifies its signature"},
            {"edge": "nvr->fleet", "lane": "OTA",
             "text": "Canary: one camera stages and installs",
             "panels": {"phase": {"state": "CANARY"},
                        "grid": {"c1": {"state": "UPDATING", "sub": "canary"}}}},
            {"edge": "fleet->nvr", "lane": "OPS",
             "text": "Canary healthy for the observation window — gate passes",
             "panels": {"grid": {"c1": {"state": "V2.2", "sub": "healthy 30 min"}}}},
            {"nodes": ["nvr", "fleet"], "lane": "OTA",
             "text": "Wave 1: three more cameras update in parallel",
             "panels": {"phase": {"state": "WAVE 1"},
                        "grid": {"c2": {"state": "UPDATING", "sub": "wave 1"},
                                 "c3": {"state": "UPDATING", "sub": "wave 1"},
                                 "c4": {"state": "UPDATING", "sub": "wave 1"}}}},
            {"nodes": ["fleet"], "lane": "OPS",
             "text": "Two complete; one fails its post-install health check",
             "panels": {"grid": {"c2": {"state": "V2.2"}, "c3": {"state": "V2.2"},
                                 "c4": {"state": "FAULT", "sub": "boot loop"}}}},
            {"nodes": ["nvr"], "lane": "OPS",
             "text": "Fault trips the gate — rollout pauses before the last cohort",
             "panels": {"phase": {"state": "PAUSED"},
                        "grid": {"c5": {"state": "V2.1", "sub": "held"},
                                 "c6": {"state": "V2.1", "sub": "held"}}}},
            {"nodes": ["nvr", "fleet"], "lane": "OTA",
             "text": "Failed camera rolls back to 2.1 from its recovery slot",
             "panels": {"phase": {"state": "ROLLBACK"},
                        "grid": {"c4": {"state": "ROLLED BACK", "sub": "recovery slot"}}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- Health dashboard variant: states `ONLINE / WEAK / OFFLINE / PRIVACY`, sub =
  battery % or RSSI; patch only what changed each step.
- Walk test variant: states `UNTESTED / TESTING / PASS / FAIL`; the dimmed
  start state reads naturally as "not yet exercised".
- Keep the vocabulary small (≤6 states) — the grid is read at a glance; the
  step captions carry the nuance.

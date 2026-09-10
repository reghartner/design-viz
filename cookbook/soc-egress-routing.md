# Recipe — SoC egress: persistent connection OR MQTT via the LP chip

Pattern: two outbound paths exist and a step chooses exactly one. The direct
path (persistent socket, its own protocol color) works only while the SoC is
awake; the fallback path relays through the always-on LP chip over MQTT.
Lanes tag which path each step took, so the step bar itself shows the routing
decision.

Complete working spec:

```json
{
  "page": {
    "title": "Recipe — SoC egress routing",
    "skin": "aurora",
    "protocols": {
      "ws": {"label": "WebSocket (persistent)", "color": "#4ADE80"}
    },
    "lanes": {
      "LIVE":  {"color": "#4ADE80"},
      "STORE": {"color": "#A78BFA"}
    },
    "blocks": [
      {
        "heading": "Two ways out — the step picks one",
        "accent": "violet",
        "bullets": [
          "Direct socket: only while the SoC is awake and the connection is up",
          "Fallback: hand the event to the LP chip, which always holds an MQTT session",
          "Never both for the same payload — each step routes one way and its lane tag names the choice"
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Device"}},
          "nodes": {
            "lp":     {"title": "LP Chip", "sub": "owns the MQTT session", "icon": "chip", "tint": "dev", "group": "device"},
            "soc":    {"title": "SoC", "sub": "camera · encoder", "icon": "chip", "tint": "dev", "group": "device"},
            "broker": {"title": "Broker", "sub": "MQTT", "icon": "antenna", "tint": "mqtt"},
            "cloud":  {"title": "Cloud", "sub": "media + events", "icon": "cloud", "tint": "cmd"}
          },
          "rows": [
            [["lp", "soc"], "broker"],
            ["cloud"]
          ],
          "edges": [
            {"from": "soc", "to": "cloud", "kind": "ws", "label": "live socket"},
            {"from": "soc", "to": "lp", "kind": "int"},
            {"from": "lp", "to": "broker", "kind": "mqtt", "label": "PUB events"},
            {"from": "broker", "to": "cloud", "kind": "mqtt", "label": "deliver"}
          ],
          "panels": [
            {"id": "pwr", "type": "state", "title": "SoC — power",
             "states": ["AWAKE", "SLEEPING"],
             "colors": {"AWAKE": "#4ADE80", "SLEEPING": "#55627A"},
             "initial": {"state": "AWAKE"}}
          ],
          "steps": [
            {"nodes": ["soc"], "lane": "LIVE",
             "text": "A frame batch is ready — two egress paths exist"},
            {"edge": "soc->cloud", "lane": "LIVE",
             "text": "Awake with the socket up: send direct over the persistent connection"},
            {"nodes": ["soc"], "lane": "STORE",
             "text": "Socket down (or about to sleep) — fall back to store-and-forward",
             "panels": {"pwr": {"state": "SLEEPING"}}},
            {"edges": ["soc->lp", "lp->broker", "broker->cloud"], "lane": "STORE",
             "packets": [{"edge": "soc->lp"}, {"edge": "lp->broker", "delay": 0.45},
                         {"edge": "broker->cloud", "delay": 0.9}],
             "text": "The event rides the LP chip's MQTT session instead"}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- The fallback beat is ONE step with a three-packet chain — a relay, not three
  events. The coin lands on `soc->lp` (first in `edges`), which no other step
  uses.
- `cloud` sits alone on row 2, so the socket edge and the broker's delivery
  edge cross one row gap — well under the corridor-crowding lint (fires at 5
  crossings per gap).
- Retry-after-reconnect story: add a step where `pwr` returns to AWAKE and the
  socket carries traffic again — make it edgeless (`"nodes": ["soc", "cloud"]`)
  rather than re-listing `soc->cloud`, or the two step coins share that edge's
  midpoint and the lint names the step pair.

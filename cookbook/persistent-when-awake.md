# Recipe — traffic that exists only while the SoC is awake (persistent connection)

Pattern: a persistent connection (socket) is declared as its OWN protocol so
the legend and edge styling distinguish it from MQTT. The RULE — "this edge
carries traffic only while the SoC is awake" — is not an engine feature; it is
enforced by the STEPS: the socket edge appears only in steps where the state
panel shows the SoC awake, and the narration says why. The always-on MQTT path
via the LP chip exists in every power state.

Complete working spec:

```json
{
  "page": {
    "title": "Recipe — persistent connection while awake",
    "skin": "aurora",
    "protocols": {
      "ws": {"label": "WebSocket (persistent)", "color": "#4ADE80"}
    },
    "lanes": {
      "NET": {"color": "#38E1FF"},
      "DEV": {"color": "#FFB454"}
    },
    "blocks": [
      {
        "heading": "The socket lives only while the SoC is awake",
        "accent": "green",
        "bullets": [
          "The WebSocket edge is patched into steps ONLY when the state panel shows the SoC awake — the spec's steps are the enforcement of the rule",
          "The MQTT path through the LP chip exists in every power state; it is the device's only voice while the SoC sleeps"
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Device"}},
          "nodes": {
            "lp":    {"title": "LP Chip", "sub": "always-on · mqtt", "icon": "chip", "tint": "dev", "group": "device"},
            "soc":   {"title": "SoC", "sub": "camera · encoder", "icon": "chip", "tint": "dev", "group": "device"},
            "cloud": {"title": "Cloud", "sub": "media + events", "icon": "cloud", "tint": "cmd"}
          },
          "rows": [
            [["lp", "soc"], "cloud"]
          ],
          "edges": [
            {"from": "soc", "to": "cloud", "kind": "ws", "label": "live socket"},
            {"from": "lp", "to": "cloud", "kind": "mqtt", "label": "PUB events"}
          ],
          "panels": [
            {"id": "pwr", "type": "state", "title": "SoC — power",
             "states": ["OFF", "AWAKE"],
             "colors": {"OFF": "#55627A", "AWAKE": "#4ADE80"},
             "initial": {"state": "OFF"}}
          ],
          "steps": [
            {"edge": "lp->cloud", "lane": "NET",
             "text": "SoC asleep — only the LP chip talks (heartbeat over MQTT)"},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "SoC wakes",
             "panels": {"pwr": {"state": "AWAKE"}}},
            {"edge": "soc->cloud", "lane": "NET",
             "text": "Socket opens — the persistent connection exists only from here"},
            {"nodes": ["soc", "cloud"], "lane": "NET",
             "text": "Frames and control ride the socket while it is up (ambient view animates the flow)"},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "SoC sleeps — the socket closes; anything further rides MQTT again",
             "panels": {"pwr": {"state": "OFF"}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- Step 4 is EDGELESS on purpose: re-listing `soc->cloud` would put a second
  step coin on the same edge midpoint (lint). Lighting the two nodes and
  narrating "still riding the socket" reads correctly; the ambient view
  animates the edge continuously anyway.
- To argue a FAILURE ("command arrived while the socket was down"), follow
  this recipe with `wake-message.md` — the mailbox is what bridges the gap.

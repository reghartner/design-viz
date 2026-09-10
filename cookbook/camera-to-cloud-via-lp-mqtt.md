# Recipe — messages FROM the camera that ride the LP chip over MQTT

Pattern: the SoC (camera) never owns the MQTT session — the always-on LP chip
does. An outbound event therefore takes two hops inside one story beat:
SoC → LP over the inter-chip link, then LP → broker over MQTT. Model the beat
as ONE step with an ordered packet chain so the viewer sees a relay, not two
unrelated messages.

Complete working spec:

```json
{
  "page": {
    "title": "Recipe — camera events via the LP chip",
    "skin": "aurora",
    "lanes": {
      "DEV": {"color": "#FFB454"},
      "NET": {"color": "#38E1FF"}
    },
    "blocks": [
      {
        "heading": "SoC event out through the LP chip's MQTT session",
        "accent": "blue",
        "text": [
          "The SoC hands its event across the inter-chip link; the LP chip publishes it on the MQTT session it always holds. One step, two staggered packets — a relay."
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Device"}},
          "nodes": {
            "lp":     {"title": "LP Chip", "sub": "owns the MQTT session", "icon": "chip", "tint": "dev", "group": "device"},
            "soc":    {"title": "SoC", "sub": "camera · encoder", "icon": "chip", "tint": "dev", "group": "device"},
            "broker": {"title": "Broker", "sub": "MQTT", "icon": "antenna", "tint": "mqtt"},
            "cloud":  {"title": "Cloud", "sub": "event intake", "icon": "cloud", "tint": "cmd"}
          },
          "rows": [
            [["lp", "soc"], "broker", "cloud"]
          ],
          "edges": [
            {"from": "soc", "to": "lp", "kind": "int"},
            {"from": "lp", "to": "broker", "kind": "mqtt", "label": "PUB clip.meta"},
            {"from": "broker", "to": "cloud", "kind": "mqtt", "label": "deliver"}
          ],
          "panels": [
            {"id": "log", "type": "log", "title": "Event log",
             "tags": {"DEV": "#FFB454", "NET": "#38E1FF"}}
          ],
          "steps": [
            {"nodes": ["soc"], "lane": "DEV",
             "text": "SoC finishes a clip and builds the metadata event",
             "panels": {"log": {"log": [{"tag": "DEV", "text": "clip 00:14 ready"}]}}},
            {"edge": "soc->lp", "lane": "DEV",
             "text": "Event crosses the inter-chip link to the LP chip",
             "panels": {"log": {"log": [{"tag": "DEV", "text": "IPC → lp: clip.meta"}]}}},
            {"edges": ["lp->broker", "broker->cloud"], "lane": "NET",
             "packets": [{"edge": "lp->broker"}, {"edge": "broker->cloud", "delay": 0.45}],
             "text": "LP publishes on its MQTT session; the broker delivers",
             "panels": {"log": {"log": [{"tag": "NET", "text": "PUB evt/clip.meta"}]}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- `packets` sets the FIRING ORDER and stagger inside a multi-edge step; the
  step's coin lands on the FIRST edge in `edges`. When another step already
  coins that edge, reorder `edges` and keep the true order in `packets`
  (see `soc-egress-routing.md` for that exact move).
- The stacked-chip edge (`soc->lp`) stays unlabeled — too short for a label
  (lint); the caption and the log line carry the meaning.

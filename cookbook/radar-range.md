# Recipe — radar range view: distance-gated alerts and a visit path

Widget: `radar` — a top-down range view. Declare the sensor, wedge
(`facing`/`spread`, same degree convention as `pir`: 0 right, 90 down, 180
left, 270 up, y grows DOWNWARD), `range`, an alert `threshold` distance, and
optional zone polygons. Each step patches only `subject`; the engine computes
distance, threshold alert, zone occupancy, and the dotted track of every
prior position.

`pir` vs `radar`: `pir` argues a binary cone trip (in the cone or not);
`radar` argues DISTANCE and PATH (how close, along what route). A
radar-wakes-camera story often pairs both: `radar` panel for the approach,
then the camera pipeline.

Complete working spec (distance-gated doorbell alert with a visit path):

```json
{
  "page": {
    "title": "Recipe — radar range gating",
    "skin": "aurora",
    "lanes": {
      "DEV": {"color": "#FFB454"},
      "NET": {"color": "#38E1FF"}
    },
    "blocks": [
      {
        "heading": "Alert only inside 8 ft — and keep the visit path",
        "accent": "amber",
        "text": [
          "The radar tracks an approach long before the camera wakes. Sidewalk traffic stays outside the threshold arc and never alerts; the alert fires only when the subject crosses it, and the dotted track in the panel is the path map attached to the notification."
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Doorbell"}},
          "nodes": {
            "rdr":    {"title": "Radar", "sub": "60 GHz · tracking", "icon": "antenna", "tint": "dev", "group": "device"},
            "soc":    {"title": "SoC", "sub": "camera · encoder", "icon": "chip", "tint": "dev", "group": "device"},
            "cloud":  {"title": "Cloud", "sub": "events + push", "icon": "cloud", "tint": "cmd"},
            "phone":  {"title": "Phone", "sub": "companion app", "icon": "phone", "tint": "cmd"}
          },
          "rows": [
            [["rdr", "soc"], "cloud", "phone"]
          ],
          "edges": [
            {"from": "rdr", "to": "soc", "kind": "int"},
            {"from": "soc", "to": "cloud", "kind": "https", "label": "event + path"},
            {"from": "cloud", "to": "phone", "kind": "https", "label": "push"}
          ],
          "panels": [
            {"id": "rng", "type": "radar", "title": "Radar — approach (plan)",
             "sensor": {"x": 160, "y": 168}, "facing": 270, "spread": 120,
             "range": 150, "threshold": 80, "rings": 3,
             "zones": [{"id": "walk", "label": "sidewalk",
                        "points": [[10, 20], [310, 20], [310, 52], [10, 52]]}],
             "initial": {"subject": {"x": 40, "y": 36}}},
            {"id": "cam", "type": "state", "title": "Camera",
             "states": ["ASLEEP", "WAKING", "RECORDING"],
             "colors": {"ASLEEP": "#55627A", "WAKING": "#FFB454", "RECORDING": "#FF6B5E"},
             "initial": {"state": "ASLEEP"}}
          ],
          "steps": [
            {"nodes": ["rdr"], "lane": "DEV",
             "text": "Passer-by on the sidewalk — tracked, outside the threshold, no alert"},
            {"nodes": ["rdr"], "lane": "DEV",
             "text": "Someone turns up the walkway — still outside 8 ft",
             "panels": {"rng": {"subject": {"x": 120, "y": 70}}}},
            {"edge": "rdr->soc", "lane": "DEV",
             "text": "Threshold crossed — the radar wakes the camera before the visitor arrives",
             "panels": {"rng": {"subject": {"x": 150, "y": 112},
                                "banner": "INSIDE 8 FT — WAKE CAMERA"},
                        "cam": {"state": "WAKING"}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "Camera up and recording as the visitor reaches the door",
             "panels": {"rng": {"subject": {"x": 158, "y": 140}, "banner": ""},
                        "cam": {"state": "RECORDING"}}},
            {"edges": ["soc->cloud", "cloud->phone"], "lane": "NET",
             "packets": [{"edge": "soc->cloud"}, {"edge": "cloud->phone", "delay": 0.45}],
             "text": "Event uploads with the visit path; the push renders the track"}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- Geometry verification works like `pir` (see `motion-detection.md`): run
  `radarModel` in a Node vm with your planned subject points and read
  `alert` / `occupied` before injecting — never assert the alert yourself.
- Room presence (mmWave sensor): `spread: 360` draws full rings; zones are
  the room regions (bed, desk, door); step the subject through them and let
  occupancy light the zones. No threshold needed — omit it.
- The track dedupes a parked subject and breaks where a step has no
  `subject` — a person leaving and returning reads correctly.

# Recipe — Radar range, an authored alert, and a visit path

Widget: `radar` — a top-down sensing view. Declare the sensor, `facing`,
`spread`, `range`, an optional reference `threshold`, and zone polygons.
Directions are degrees clockwise from +x: 0 right, 90 down, 180 left,
270 up; y increases downward.

The engine computes distance, zone occupancy and the dotted subject track.
**Alert state is authored:** start with `initial.alert:false`, set `alert:true`
on the source's alarm beat and `alert:false` when it clears. Sparse patches
carry alert state along the selected path. Threshold crossings, wedge entry,
zone occupancy and subject removal never change it automatically.

This illustrative doorbell sequence uses an 8 ft reference arc and an authored
wake event. Replace its measurements and event timing with the source's facts.
The final beat clears the alert while the subject remains near the door.

Complete working spec (explicit alert transitions with distance context):

```json
{
  "page": {
    "title": "Recipe — Radar alert and visit path",
    "skin": "aurora",
    "lanes": {
      "DEV": {"color": "#FFB454"},
      "NET": {"color": "#38E1FF"}
    },
    "blocks": [
      {
        "heading": "An authored alert near the door — and the visit path",
        "accent": "amber",
        "text": [
          "Illustrative sequence: Radar shows distance and the subject track. The spec authors the alarm when the sensor reports an event, then clears it after handling. The 8 ft arc supplies distance context; it does not trigger the alarm."
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
             "scale": {"pxPerUnit": 10, "unit": "ft"},
             "range": 15, "threshold": 8, "rings": [4, 8, 12],
             "zones": [{"id": "walk", "label": "sidewalk",
                        "points": [[10, 20], [310, 20], [310, 52], [10, 52]]}],
             "initial": {"subject": {"x": 40, "y": 36}, "alert": false}},
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
             "panels": {"rng": {"subject": {"x": 120, "y": 70}, "alert": false}}},
            {"edge": "rdr->soc", "lane": "DEV",
             "text": "Sensor reports an alarm — the authored alert wakes the camera",
             "panels": {"rng": {"subject": {"x": 150, "y": 112}, "alert": true,
                                "banner": "ALARM REPORTED — WAKE CAMERA"},
                        "cam": {"state": "WAKING"}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "Camera up and recording as the visitor reaches the door",
             "panels": {"rng": {"subject": {"x": 158, "y": 140}, "banner": ""},
                        "cam": {"state": "RECORDING"}}},
            {"edges": ["soc->cloud", "cloud->phone"], "lane": "NET",
             "packets": [{"edge": "soc->cloud"}, {"edge": "cloud->phone", "delay": 0.45}],
             "text": "Event uploads with the visit path; the push renders the track"},
            {"nodes": ["rdr"], "lane": "DEV",
             "text": "Event handled — clear the alert while the visitor remains nearby",
             "panels": {"rng": {"alert": false}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- Run `radarModel` through the assembled source loader as shown in
  [motion detection](motion-detection.md). Check `dist` and `occupied` for the
  planned geometry, and check `alert` against the separately authored event.
- Room presence: `spread:360` draws full rings. Use room zones and subject
  positions to show computed occupancy. Occupancy does not set an alarm;
  keep `alert:false` unless the source establishes an alert event.
- An omitted `subject` patch carries the previous position. Use `subject:null`
  to hide it and break the track; explicitly clear the alert when appropriate.
- Preserve hardware names from the source. A Radar visualization does not
  establish which sensing technology or real-world policy produced an event.

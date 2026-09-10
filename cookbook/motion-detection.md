# Recipe — motion detection: a sensor cone, an approach, a trip

Widget: `pir`. You declare the sensor mount point, the cone (facing / spread /
range), and per-step subject positions; the ENGINE computes tripped vs clear
from that geometry and colors the subject and the status pill. Never assert
the trip — place the points so the geometry produces it.

## Geometry rules (the part agents get wrong)

- The frame is **320 × 180**, and **y grows DOWNWARD** (screen coordinates).
  "Up" means a SMALLER y.
- `cone.facing` is degrees CLOCKWISE from +x: **0 = right, 90 = down,
  180 = left, 270 = up.**
- `cone.spread` is the FULL cone angle (half on each side of facing);
  `cone.range` is its reach in frame pixels.
- Tripped = subject within `range` AND within `spread / 2` of the facing
  direction. So a subject can be clear two ways: too far (outside range) or
  off to the side (outside the angle).
- Whole cone visible ("zoomed out"): the GUARANTEED rule is `range` no larger
  than the distance from the sensor to the NEAREST frame edge — the cone lies
  inside a circle of that radius, so it fits for any facing and spread. A
  larger `range` can still fit (the guaranteed rule is conservative), but a
  ray at the cone's side angle can exit a nearer edge even when the facing
  direction has room — so verify it EXACTLY by testing the cone's own arc
  points (the snippet below prints the arc bounds). Plan view with the sensor
  at bottom-center facing up: sensor `{160,146}`, `facing 270`, `range 130`
  fits by the exact check (arc spans x 89–231, y 16–146). Elevation view with
  the sensor at right-mid facing left (`{298,78}`, `facing 175`, `range 250`)
  deliberately runs past the frame edge — use it when the argument is about
  direction, not reach.
- The widget animates by itself: the subject glides between step positions,
  a beam sweeps the cone, and the first clear→tripped transition fires a
  one-shot flash/ripple. You only move the subject.

## Verify the choreography AND the cone fit before injecting

Prints tripped/clear for each planned subject point, then the cone's bounding
box (rounded for display) and a WHOLE CONE VISIBLE / CONE EXITS THE FRAME
verdict computed on the UNROUNDED coordinates — trust the verdict, not the
rounded numbers. The verdict is exact for the drawn polygon's GEOMETRY: the
engine renders the cone as a polygon over these same sampled points
(`conePoints`), and a polygon's bounds are determined by its vertices — the
ideal circular arc between two samples is never drawn. One caveat: the
outline is a 1.5 px stroke centered on the path, and at a sharp vertex its
default miter join can spike farther than half the stroke width — the SVG
default miter limit of 4 caps the spike at 3 px (miter limit × stroke width
÷ 2); beyond that the join is beveled. So keep the reported bounds at least
3 px inside 0–320 / 0–180 if a clipped outline would matter — the example
above (x 89–231, y 16–146) does.

```
node -e "
const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('src/validator.js','utf8')+'\n'+fs.readFileSync('src/engine.js','utf8')+';__x={pirModel};';
const sb={console};vm.runInNewContext(code,sb);
const cone={sensor:{x:160,y:146},cone:{facing:270,spread:66,range:130}};
[[30,30],[60,40],[135,70]].forEach(p=>
  console.log(p, sb.__x.pirModel(cone,{subject:{x:p[0],y:p[1]}}).tripped?'TRIPPED':'clear'));
const pts=sb.__x.pirModel(cone,{}).conePoints;
const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
const visible=xs.every(x=>x>=0&&x<=320)&&ys.every(y=>y>=0&&y<=180);
console.log('cone bounds x', Math.min(...xs).toFixed(0), '-', Math.max(...xs).toFixed(0),
            ' y', Math.min(...ys).toFixed(0), '-', Math.max(...ys).toFixed(0),
            visible?'— WHOLE CONE VISIBLE':'— CONE EXITS THE FRAME');"
```

Complete working spec (plan view, approach from the top-left):

```json
{
  "page": {
    "title": "Recipe — motion detection",
    "skin": "aurora",
    "lanes": {
      "DEV": {"color": "#FFB454"},
      "NET": {"color": "#38E1FF"}
    },
    "blocks": [
      {
        "heading": "PIR cone — approach, trip, wake",
        "accent": "cyan",
        "text": [
          "Plan view: the sensor sits at the door (bottom center) facing up the walkway. The subject is clear by RANGE on the first two steps and inside the cone on the third — the engine computes the trip."
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Device"}},
          "nodes": {
            "lp":     {"title": "LP Chip", "sub": "PIR · mqtt", "icon": "chip", "tint": "dev", "group": "device"},
            "soc":    {"title": "SoC", "sub": "camera", "icon": "chip", "tint": "dev", "group": "device"},
            "broker": {"title": "Broker", "sub": "MQTT", "icon": "antenna", "tint": "mqtt"}
          },
          "rows": [
            [["lp", "soc"], "broker"]
          ],
          "edges": [
            {"from": "lp", "to": "soc", "kind": "int"},
            {"from": "lp", "to": "broker", "kind": "mqtt", "label": "PUB motion"}
          ],
          "panels": [
            {"id": "fov", "type": "pir", "title": "PIR — field of view (plan)",
             "sensor": {"x": 160, "y": 146},
             "cone": {"facing": 270, "spread": 66, "range": 130},
             "path": [[30, 30], [60, 40], [135, 70]],
             "initial": {"subject": {"x": 30, "y": 30}}}
          ],
          "steps": [
            {"nodes": ["lp"], "lane": "DEV",
             "text": "Someone at the street — outside sensor range"},
            {"nodes": ["lp"], "lane": "DEV",
             "text": "Coming up the walk — still outside range",
             "panels": {"fov": {"subject": {"x": 60, "y": 40}}}},
            {"nodes": ["lp"], "lane": "DEV",
             "text": "Inside the cone — the PIR trips",
             "panels": {"fov": {"subject": {"x": 135, "y": 70},
                                "banner": "MOTION DETECTED"}}},
            {"edge": "lp->soc", "lane": "DEV",
             "text": "LP chip raises the wake line to the SoC",
             "panels": {"fov": {"banner": ""}}},
            {"edge": "lp->broker", "lane": "NET",
             "text": "Motion event published over MQTT"}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- Miss story ("the side approach never wakes it"): route the subject points
  outside the angle instead — same cone, subject sliding past at a wide angle;
  the status pill stays IR CLEAR the whole way.
- Camera ZONES (armed / ignored / masked regions of a frame) are a different
  widget: `zoneframe` — see its entry in `contract/authoring-contract.md`.
- Remove the subject entirely with `"subject": null` (the dot disappears).

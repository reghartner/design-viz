# Recipe — motion detection with a Radar sensing view

Widget: `radar`. Declare the sensor position, viewing wedge and per-step subject
positions to show an approach. Author the detection event with `alert:true` and
clear it with `alert:false`. The engine computes distance and zone occupancy;
it never turns proximity, wedge entry or occupancy into an alert.

Radar is the visualization type. Preserve the source's actual hardware names,
including PIR sensors when present; choosing this panel does not establish that
the device measures range. This example uses schematic coordinates and an
illustrative motion event, not measured sensor performance.

## Existing PIR specs

The `pir` panel type has been removed; migrate saved specs explicitly:

- Change `type:"pir"` to `type:"radar"`; preserve `sensor` and lift
  `cone.facing`, `cone.spread` and `cone.range` to top-level fields.
- For omitted legacy fields, write the old defaults explicitly:
  `sensor:{x:298,y:78}`, `facing:180`, `spread:66`, `range:250` (unscaled pixels).
- Replace `tripped` with explicit `alert:true` or `alert:false` at the intended
  initial state or step. Review old geometry-driven events and author their alert
  transitions; the Radar panel never infers them.
- Remove declared `path` artwork and use the track generated from subject history.

See the [Radar contract](../contract/authoring-contract.md#panels--synchronized-inspector-widgets)
for the complete field and state rules. There is no automatic runtime migration.

## Geometry and event rules

- The frame is **320 × 180**, with **y increasing downward**.
- `facing` is degrees clockwise from +x: **0 right, 90 down, 180 left, 270 up**.
  `spread` is the full wedge angle; `range` is its reach. These are top-level
  panel fields.
- Without `scale`, distances are frame pixels. For sourced physical dimensions,
  declare `scale:{pxPerUnit,unit}` and use that unit for `range`, `threshold`,
  ring distances and polar subject positions. Cartesian `{x,y}` stays in pixels.
- `threshold` draws a reference arc. Moving it or crossing it never changes
  `alert`. Zone occupancy is a point-in-polygon result, independent of alert state.
- Omitted alert state starts false. Explicit `initial.alert` and step patches
  carry along the selected path; author `alert:false` at the clearing beat.
  A subject leaving the frame or becoming `null` does not clear the alert.
- The subject glides between positions, with a dotted track from its folded
  history and a ripple on a clear-to-alert transition. A step with folded
  `subject:null` breaks the track; merely omitting the patch carries its position.
- Check the wedge and all subject positions in the built preview. With a scaled
  view, the drawn reach is `range * pxPerUnit`; leave room for labels and strokes.

## Check geometry separately from the authored event

Load the assembled validator and engine through the source loader. Panel models
live in their type modules, so reading the two raw files alone is incomplete.
Run this from the repository root:

```sh
node <<'JS'
const vm=require('node:vm');
const {readSource}=require('./tools/source-loader.cjs');
const context={};
vm.runInNewContext(readSource('validator.js')+'\n'+readSource('engine.js'),context);
const panel={sensor:{x:160,y:146},facing:270,spread:66,range:130,
  zones:[{id:'walk',points:[[110,60],[200,60],[200,160],[110,160]]}]};
for(const state of [
  {subject:{x:30,y:30},alert:false},
  {subject:{x:60,y:40},alert:false},
  {subject:{x:135,y:70},alert:true},
  {subject:{x:135,y:70},alert:false}
]) {
  const model=context.radarModel(panel,state);
  console.log({distance:model.dist,occupied:model.occupied,authoredAlert:model.alert});
}
JS
```

The last two states have the same geometry and different authored alerts.
Verify each decision against the source or mark it as illustrative.

Complete working spec:

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
        "heading": "Sensing view — approach, event, wake",
        "accent": "cyan",
        "text": [
          "Illustrative sequence: the sensor sits at the door facing up the walkway. Subject positions show the approach; an explicit motion event sets the alert and wakes the camera. Geometry does not decide the alert."
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Device"}},
          "nodes": {
            "lp": {"title": "LP Chip", "sub": "PIR sensor input", "icon": "chip", "tint": "dev", "group": "device"},
            "soc": {"title": "SoC", "sub": "camera", "icon": "chip", "tint": "dev", "group": "device"},
            "broker": {"title": "Broker", "sub": "MQTT", "icon": "antenna", "tint": "mqtt"}
          },
          "rows": [[["lp", "soc"], "broker"]],
          "edges": [
            {"from": "lp", "to": "soc", "kind": "int"},
            {"from": "lp", "to": "broker", "kind": "mqtt", "label": "PUB motion"}
          ],
          "panels": [
            {"id": "fov", "type": "radar", "title": "Sensing view — approach",
             "sensor": {"x": 160, "y": 146},
             "facing": 270, "spread": 66, "range": 130,
             "zones": [{"id": "walk", "label": "walkway",
                        "points": [[110, 60], [200, 60], [200, 160], [110, 160]]}],
             "initial": {"subject": {"x": 30, "y": 30}, "alert": false}}
          ],
          "steps": [
            {"nodes": ["lp"], "lane": "DEV",
             "text": "Someone at the street — no motion event"},
            {"nodes": ["lp"], "lane": "DEV",
             "text": "Coming up the walk — no motion event yet",
             "panels": {"fov": {"subject": {"x": 60, "y": 40}, "alert": false}}},
            {"nodes": ["lp"], "lane": "DEV",
             "text": "The sensor reports motion — author the alert at this beat",
             "panels": {"fov": {"subject": {"x": 135, "y": 70}, "alert": true,
                                "banner": "MOTION DETECTED"}}},
            {"edge": "lp->soc", "lane": "DEV",
             "text": "LP chip raises the wake line to the SoC",
             "panels": {"fov": {"banner": ""}}},
            {"edge": "lp->broker", "lane": "NET",
             "text": "Motion event published over MQTT"},
            {"nodes": ["lp"], "lane": "DEV",
             "text": "Event handled — clear the alert while the walkway remains occupied",
             "panels": {"fov": {"alert": false}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- For an approach that never triggers an event, keep `alert:false` on that path.
  Subject placement alone neither proves nor suppresses a real detection.
- Camera-frame armed, ignored and masked regions use `zoneframe`; its `verdict`
  is authored separately. See the authoring contract.
- `subject:null` hides the dot and breaks the history track. Patch `alert:false`
  separately if the source says the alarm clears at that moment.

# Recipe — start recording before the scene event

Camera status and the action in the image are independent. `mode` describes
the camera; `scenePlayback` gates the illustrative animation. Start a quiet
recording, then trigger the action in a later step. No schema-version flag
or real video asset is needed.

```json
{
  "page": {
    "title": "Record first, capture the event later",
    "skin": "pastel",
    "sections": [{
      "heading": "Doorbell event",
      "text": ["An illustrative doorbell clip. These SVG animations are not real footage or measured event timing."],
      "diagram": {
        "view": "step", "primaryPanel": "clip",
        "nodes": {
          "camera": {"title": "Doorbell", "icon": "doorbell"},
          "store": {"title": "Clip store", "icon": "cloud"}
        },
        "rows": [["camera", "store"]],
        "edges": [{"from": "camera", "to": "store", "kind": "https", "label": "save clip"}],
        "panels": [{
          "id": "clip", "type": "screen", "title": "Front door camera",
          "scene": "doorbell-runners",
          "initial": {"mode": "off", "scenePlayback": "waiting"}
        }],
        "steps": [
          {"id": "standby", "nodes": ["camera"], "text": "The camera is in standby."},
          {"id": "record", "nodes": ["camera"], "text": "Recording begins on an empty porch.", "panels": {"clip": {"mode": "rec"}}},
          {"id": "run", "nodes": ["camera"], "text": "Two people run away while recording continues.", "panels": {"clip": {"scenePlayback": "playing"}}},
          {"id": "save", "edge": "camera->store", "text": "Store the captured event clip.", "panels": {"clip": {"mode": "save", "banner": "CLIP SAVED"}}}
        ]
      }
    }]
  }
}
```

## Choose the clip

All stock scenes render in color, independently of the page skin:

| `scene` | Illustration |
|---|---|
| `person-at-door-night` | A visitor approaching a porch under warm night lighting |
| `person-through-door` | A person walking through an opening door |
| `doorbell-run-away` | One person sprinting from the porch toward the sidewalk |
| `doorbell-runners` | Two runners receding from the doorbell and splitting directions |
| `package-drop` | A courier delivering a cardboard package |
| `kitchen-fire` | Flames, smoke, and reflected light around a stove |
| `static-noise` | A color test pattern with boot interference |

In the workbench, select the screen panel and choose **Screen scene**.
**Replay clip** replays only its inline preview, even if the story camera is
off. Scene selection is a panel declaration, shared by all steps and paths.

## Timing rules

- `off` is standby; `boot` shows the static pattern; `live`, `rec`, and
  `save` show the chosen scene. `rec` adds REC; `save` adds the banner.
- `scenePlayback:"waiting"` shows the quiet setting: no visitor, runners,
  delivered parcel, or fire. It leaves REC running. The static pattern has
  no person/event to hide and remains a signal placeholder.
- `scenePlayback:"playing"` starts the event. Both fields carry through
  the selected path independently, so later steps only patch what changed.
  Omission defaults to playing, preserving older specs.
- Waiting resets the event; returning to playing replays it. Additional
  playing steps, banner edits, and LIVE → REC → SAVE keep the same clip
  running. OFF/BOOT or changing the scene creates a fresh clip.
- In the step patch inspector, **Scene event → Before event / Play event**
  edits this field; **Inherit** removes only the current override.
- Reduced motion/print show static poses. The fire normally loops; entry,
  delivery, and running clips play once. These illustrative durations do
  not establish system latency. There is no recorded-media playback mode.

Run the [cookbook build loop](README.md#the-loop-every-recipe-ends-here),
then choose step 2 and confirm an empty porch with REC. Step 3 should start
the run while recording continues. Return to 2, then 3, to replay. For
several examples, load **starters… → screen clips**.

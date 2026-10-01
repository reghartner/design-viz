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
| `raccoon-at-night` | A masked, ring-tailed raccoon crossing a night porch and sniffing the mat |
| `static-noise` | A color test pattern with boot interference |

In the workbench, select the screen panel and choose **Screen scene**.
**Replay clip** replays only its inline preview, even if the story camera is
off. The declared scene is shared by all steps and paths. When one camera
records different events, keep one screen and patch a per-state `scene`
override: `{"mode":"rec","scene":"raccoon-at-night"}`, later
`{"mode":"rec","scene":null}` to return to the declared clip. In the step
inspector this is **Scene override**; **Use declared scene** writes `null`.

## Play a saved clip

`mode:"playing"` means someone is playing back a recorded clip (for example
in a phone app). It shows the scene with a **PLAYING** chip and uses `banner`,
when set, as the clip title:

```json
{"panels": {"clip": {"mode": "playing", "banner": "Package clip, 8:12 AM"}}}
```

It is not live view, and it is a different control from
`scenePlayback:"playing"` (**Scene event → Play event**), which only starts
the illustrated action. Put `off` (STANDBY) between recording and playback
when nothing is being recorded or watched; the clip then restarts for playback.

`playing`, a per-state `scene`, and `raccoon-at-night` need Flowview 0.2.0.
Workbench Save/Export and `node tools/compatibility.js --stamp` record
`minVersion: "0.2.0"` and the features `media.screen-playing`,
`media.screen-scene-override` and `media.scene-raccoon-at-night`. Older
installed viewers then show an upgrade notice instead of silently showing
STANDBY or the declared clip. Stories using only the older modes and scenes
keep their 0.1.0 minimum.

## Timing rules

- `off` is standby; `boot` shows the static pattern; `active`, `live`, `rec`,
  `save`, and `playing` show the chosen scene. `active` means the camera is on without
  livestreaming or recording, with plain white ACTIVE text and no colored
  badge/dot. `live` adds LIVE; `rec` adds REC; `save` adds the banner;
  `playing` adds PLAYING.
  For a quiet camera before recording begins, use
  `{"panels":{"clip":{"mode":"active","scenePlayback":"waiting"}}}`.
- `scenePlayback:"waiting"` shows the quiet setting: no visitor, runners,
  delivered parcel, raccoon, or fire. It leaves REC running. The static pattern has
  no person/event to hide and remains a signal placeholder.
- `scenePlayback:"playing"` starts the event. Both fields carry through
  the selected path independently, so later steps only patch what changed.
  Omission defaults to playing, preserving older specs.
- Waiting resets the event; returning to playing replays it. Additional
  playing steps, banner edits, and ACTIVE → LIVE → REC → SAVE → PLAYING keep the
  same clip running. OFF/BOOT or changing the scene creates a fresh clip.
- In the step patch inspector, **Scene event → Before event / Play event**
  edits this field; **Inherit** removes only the current override.
- Reduced motion/print show static poses. The fire normally loops; entry,
  delivery, raccoon, and running clips play once. These illustrative durations
  do not establish system latency or real clip length. `mode:"playing"` marks
  playback of a recorded clip; the artwork is still an illustration.

Run the [cookbook build loop](README.md#the-loop-every-recipe-ends-here),
then choose step 2 and confirm an empty porch with REC. Step 3 should start
the run while recording continues. Return to 2, then 3, to replay. For
several examples, use **Open file** with
[`src/starters/screen-clips.json`](../src/starters/screen-clips.json).

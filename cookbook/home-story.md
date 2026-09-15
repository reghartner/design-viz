# Recipe — a home map as the centerpiece

Use `diagram.primaryPanel` to make the place and people the main view. The
live **Home / Data flow** switch lets the reader follow the same path and
step from either perspective. A centerpiece is a presentation choice, not
a different diagram or schema version.

This fictional home story places a visitor, shows a detection, then opens
the door. Geometry is illustration in a 320×180 frame, not physical units.
The taller rendered tile automatically maps that geometry; keep spec positions
in 320×180 and let the editor convert drag/tap placement back into that frame.

```json
{
  "page": {
    "title": "A visitor comes inside",
    "skin": "pastel",
    "sections": [{
      "heading": "At the front door",
      "diagram": {
        "view": "step", "primaryPanel": "home",
        "nodes": {
          "doorbell": {"title": "Doorbell", "icon": "doorbell"},
          "hub": {"title": "Home hub", "icon": "house"}
        },
        "rows": [["doorbell", "hub"]],
        "edges": [{"from": "doorbell", "to": "hub", "kind": "mqtt", "label": "detection"}],
        "panels": [{
          "id": "home", "type": "homemap", "title": "The home",
          "rooms": [
            {"label": "PORCH", "x": 10, "y": 10, "w": 80, "h": 160},
            {"label": "ENTRY", "x": 90, "y": 10, "w": 100, "h": 160},
            {"label": "LIVING ROOM", "x": 190, "y": 10, "w": 120, "h": 160}
          ],
          "devices": [
            {"id": "cam", "kind": "camera", "label": "Porch cam", "x": 45, "y": 42, "facing": 80, "spread": 60, "range": 70},
            {"id": "door", "kind": "entry", "label": "Front door", "x": 100, "y": 80},
            {"id": "hub", "kind": "hub", "label": "Home hub", "x": 240, "y": 60}
          ],
          "subjects": [{"id": "visitor", "label": "Visitor", "x": 40, "y": 130}],
          "initial": {"cam": "scan", "door": "closed", "hub": "idle", "visitor": null}
        }],
        "steps": [
          {"id": "quiet", "nodes": ["doorbell"], "text": "The porch is quiet. The camera scans."},
          {"id": "approach", "edge": "doorbell->hub", "text": "A visitor approaches; the camera reports detection.", "panels": {"home": {"cam": "detect", "hub": "rx", "visitor": {"x": 65, "y": 110}, "signals": [{"from": "cam", "to": "hub"}]}}},
          {"id": "inside", "nodes": ["hub"], "text": "The door opens and the visitor enters while the camera records.", "panels": {"home": {"cam": "rec", "door": "open", "visitor": {"x": 130, "y": 105}}}}
        ]
      }
    }]
  }
}
```

## Editing and inheritance

In the panel inspector, **Presentation → Centerpiece** sets `primaryPanel`;
**Sidebar** defaults to the data view. Existing homemaps already get the
live view switch. A reader's switch is temporary and does not edit the spec.

Select a step or a device/person to open the step placement map:

- Drag a subject, tap with **Place Visitor**, or enter x/y. This patches
  that subject's position at the selected step. `null` hides the subject;
  omitted values inherit. A shared step still edits every referencing path.
- Drag device markers/labels or room borders/labels to change their shared
  declaration coordinates for ALL steps and paths. Moving a room does not
  move its contents. Use the declaration tables for precise coordinates.
- Device-state selectors offer **Inherit**, which removes that step's
  override. Subject positions and device states carry until changed.
- `signals:[{from,to}]` uses home DEVICE IDs and lasts for one step only.
  It is authored evidence, not a simulated connection or sensor decision.

Device state chips such as “scan” are intentionally absent; icons and motion
show the activity. Subject names are hidden by default and remain available
on hover/in editing controls. Add `showSubjectLabels:true` to the panel to
show them. Device and room labels stay visible.

For a cramped workbench, use **Focus workspace**, the draggable divider,
**Expand editor**, and the **Inspect / Steps / JSON** panes. Supporting panels
stack below the main diagram when its usable section width is 1000px or
less. These controls do not require layout fields in the spec.

Run the [cookbook build loop](README.md#the-loop-every-recipe-ends-here).
Check direct jumps to all three beats and switch Home / Data flow at the
entry step. For failures on this same map, combine this with the
[alternate-path recipe](alternate-paths.md), or load `src/starters/homemap-story.json`.
Full [Home editing guide](../docs/homemap-workbench.md) and
[workspace guide](../docs/workbench-workspace.md).

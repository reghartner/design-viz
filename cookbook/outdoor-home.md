# A home, its grounds, and a working door

Use `homemap` for both inside and outside. The house outline is independent
of the map frame. Outdoor rectangles go in `rooms` with `kind:"outdoor"`;
indoor rectangles omit kind or use `"room"`. Outdoor areas draw behind the
house, and indoor activity does not tint them.

Two complete examples are available in the workbench starter gallery:

- **whole home & outdoors** — [source](../src/starters/whole-home-outdoors.json):
  a centered house, garden and driveway cameras, perimeter and indoor sensors,
  front/back doors, and a visitor approaching from outside.
- **across the front door** — [source](../src/starters/front-door-threshold.json):
  outside on the left, inside on the right; Welcome in opens the door and moves
  the visitor inside, while Leave outside keeps it closed and leaves a parcel.

Use the first layout for perimeter coverage and the second for entry stories.
They are fictional demonstrations; adapt their device states to the supplied
design rather than treating them as product behavior.

## Minimal threshold story

```json
{
  "page": {
    "title": "A visitor crosses the threshold",
    "skin": "pastel",
    "sections": [{
      "heading": "Outside to inside",
      "text": ["Fictional example: the resident opens a door for a visitor."],
      "diagram": {
        "view": "step",
        "primaryPanel": "home",
        "nodes": {"door": {"title": "Front door", "icon": "lock"}},
        "rows": [["door"]],
        "panels": [{
          "id": "home", "type": "homemap", "title": "At the door",
          "outline": {"x": 164, "y": 10, "w": 150, "h": 160},
          "rooms": [
            {"label": "OUTSIDE · PORCH", "kind": "outdoor", "x": 6, "y": 10, "w": 151, "h": 160},
            {"label": "INSIDE · ENTRY", "x": 167, "y": 13, "w": 144, "h": 154}
          ],
          "devices": [{"id": "door", "kind": "entry", "display": "door", "label": "Front door", "x": 164, "y": 108, "facing": 270, "doorWidth": 30, "doorSwing": 90}],
          "subjects": [{"id": "visitor", "label": "Visitor", "x": 110, "y": 92}],
          "initial": {"door": "closed"}
        }],
        "steps": [
          {"id": "wait", "nodes": ["door"], "text": "The visitor waits outside the closed door."},
          {"id": "open", "nodes": ["door"], "text": "The door opens inward.", "panels": {"home": {"door": "open"}}},
          {"id": "enter", "nodes": ["door"], "text": "The visitor crosses into the entry while the door stays open.", "panels": {"home": {"visitor": {"x": 230, "y": 92}}}},
          {"id": "close", "nodes": ["door"], "text": "The door closes behind the visitor.", "panels": {"home": {"door": "closed"}}}
        ]
      }
    }]
  }
}
```

Door x/y marks the hinge. `facing` follows camera angles (clockwise from +x),
but defaults to 0 for doors. Width defaults to 24 and clamps to 8–48;
`doorSwing` defaults to +90, with a signed magnitude of 15–135. Positive swings
clockwise. A facing of 270 with swing +90 opens to the right. Place the hinge
on the desired wall; the renderer draws the opening, jambs, leaf and arc.
`alert` uses the closed pose. Omit display or use `"marker"` for a small entry
icon. Door geometry is shared; state patches carry through the selected path.

Use **Edit layout** to change Width/Height, Left/Top, room kind, and door
geometry. Its shared drag map works even without steps: drag devices, rooms,
doors and starting people; use the House grip to move the outline and square
corners to resize it or rooms. Hidden starting people appear faded and remain
hidden after moving. Existing step overrides are preserved.
Outline changes do not scale room or device coordinates. Blank
Left/Top centers that axis. In a step's placement map, dragging a door edits
its shared hinge position; dragging a person patches just that step.
Use distinct step IDs at the first different outcome; see
[alternate paths](alternate-paths.md). Doors do not run collision checks,
block camera cones, infer motion, or open automatically for approaching people.

No version flag is needed. Rebuild older self-contained HTML with the current
template. Reduced motion, paused jumps and print retain the final door pose.

## Validate and render

```sh
node tools/validate.js my.spec.json
python3 tools/inject.py my.spec.json template/flowview.html out.html
open out.html
```

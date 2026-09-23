# Recipe — visual adjustments ("can you move that up and to the right a little?")

The operator gives feedback in screen terms; the spec has a small, fixed set
of knobs. This file maps the feedback to the knob. Two facts first:

1. **The only editable surface is the spec JSON.** Built HTML pages are
   generated — after any edit, re-run:
   `node tools/validate.js my.spec.json` then
   `python3 tools/inject.py my.spec.json template/flowview.html out.html`.
2. **In every pixel coordinate in this system, y grows DOWNWARD.** "Up" is a
   smaller y; "up and to the right" = negative `dy`, positive `dx`.

## Phrase → knob

| Operator says | Knob (spec field) | Notes |
|---|---|---|
| "move that floating node up / right a little" | `floats[i].dx` / `floats[i].dy` (px) | "a little" ≈ 20–40 px; up = negative `dy` |
| "move this box left of that one" | reorder ids inside the `rows` array | row nodes have NO free x/y — columns are computed, evenly spaced across x 110–885 |
| "put it on the row below" | move the id between `rows` arrays | every row renders LEFT-TO-RIGHT in its authored order; other rows keep their horizontal order |
| "those two chips should read as one device" | make them one stacked slot: `["lp", "soc"]` inside a row, plus a `groups` boundary | stacked cards share a column |
| "that label is sitting on the line / hanging off" | shorten the label, or nudge with `edges[i].labelDx` / `labelDy` (px) | budget ≈ 6.4 px per character vs the edge's length; the lint prints both numbers |
| "curve that arrow / it cuts through a box" | `edges[i].bend` | positive/negative bows the path to either side |
| "two step numbers are on top of each other" | give the steps distinct FIRST edges in `edges`; keep true firing order with explicit `packets` | the coin lands on the first edge's midpoint |
| "zoom the sensing wedge out — I can't see all of it" | Radar `range`, or `scale.pxPerUnit` when using physical units | keep sourced range unchanged; adjust display scale/placement and inspect wedge fit in the 320×180 frame |
| "have the sensor face up instead of left" | Radar `facing` | degrees clockwise from +x: 0 right, 90 down, 180 left, 270 up |
| "the alert should happen one step later" | Radar step `alert:false`, then `alert:true` at the intended beat | preserve the source event timing; subject movement and geometric occupancy do not trigger alerts |
| "make the warning kick in sooner" | thermo `warn` / `crit` | zones are computed at render; also move the step values so the crossing lands on the intended step |
| "put the temperature panel above the state panel" | order of the `panels` array | render order = array order |
| "show the failure beside the happy path on this same diagram" | `diagram.paths` with ordered step IDs | share the prefix; the first DIFFERING beat needs a different ID; see `alternate-paths.md` |
| "editing the alternate also changed the happy path" | **Make independent here**, or copy the step under a fresh ID and replace only that path's reference | shared IDs deliberately share one body; aligned columns do not imply shared content |
| "copy these happy-path steps into the alternate" | **Steps → Reuse steps…** | copy by default; share only intentionally; inspect the resulting destination panel state |
| "show a communication that doesn't happen" | `steps[i].failures` with `"from->to"` keys | `dropped` = attempted but lost; `blocked` = never sent; declared edge required; a timeout alone proves neither |
| "make the home map the main view" | `diagram.primaryPanel:"home"` (use the panel's ID) | **Presentation → Centerpiece**; reader can switch Home / Data flow live |
| "move a home device / room / person" | device/room declaration x/y; subject's per-step `{x,y}` patch | 320×180 frame; device/room drags change all steps; subject moves follow the selected step |
| "remove the subject names" | omit `homemap.showSubjectLabels` or set it to false | names are hidden by default; `true` opts in; state chips are already omitted |
| "start recording before the person moves / fire starts" | screen patch `mode:"rec",scenePlayback:"waiting"`, then later `scenePlayback:"playing"` | mode and scene phase inherit separately; see `camera-events.md` |
| "make the old video scenes color" | rebuild with the current template | all stock clips are color automatically; existing scene tokens still work |
| "make a dense trace readable / fit the whole diagram" | **Auto / Fit width / Readable** on routed diagrams; `routing:"lanes"` for track routing | no zoom/schema flag; lanes support flat rows of 1–5 cards, no floats or self-loops |
| "the editor is squeezing the diagram" | drag the workspace divider; use **Expand editor** or **Focus workspace** | editor preferences, not spec fields; panels stack below when section width is at most 1000px |
| "make the proposal tab stand out" | `tabs[i].highlight`: `true`, an accent name, or `"#RRGGBB"` | |
| "more space between rows / bigger boxes" | no arbitrary row-gap/card-size field | engine computes sizing; lane routing expands gaps for its reserved tracks; do not invent a pixel-gap field |

## Working method for any adjustment

1. Find the element's declaration in the spec (search the label text the
   operator used — titles and labels are verbatim in the JSON).
2. Apply the smallest knob from the table. Prefer structure changes (row
   order, stacking) over pixel nudges; pixel nudges exist only where the table
   lists them (float/label offsets, bends, or map/sensor coordinates).
3. Re-validate. The lint is layout-aware — it will name label overflows,
   crowded corridors, and coin collisions with the numbers that justify the
   fix.
4. Re-inject and reload. For Radar geometry changes, use the model check in
   `motion-detection.md` to verify distance and occupancy, then inspect wedge
   fit. Check the separately authored alert transitions against the source;
   moving a sensor or subject does not change them automatically.
5. If no row of the table fits the request, check
   `contract/authoring-contract.md` for the field; if the knob truly does not
   exist, report that it is engine-level (a change to `src/`, not to the
   spec) — do not approximate with the wrong knob.

## Worked example

Request: "move the RECORDING_UPDATE float up a little so it clears the
bottom row."

```
"floats": [ {"id": "rec_upd", "side": "below", "dy": -60} ]
```

`side: "below"` floats sit under the last row; `dy: -60` raises the float
60 px into the inter-row gap. Validate; the float-overlap spacing is
recomputed automatically (`dx` shifts sideways the same way).

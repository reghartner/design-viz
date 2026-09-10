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
| "put it on the row below" | move the id between `rows` arrays | odd-numbered rows render RIGHT-TO-LEFT (serpentine flow) — position accordingly |
| "those two chips should read as one device" | make them one stacked slot: `["lp", "soc"]` inside a row, plus a `groups` boundary | stacked cards share a column |
| "that label is sitting on the line / hanging off" | shorten the label, or nudge with `edges[i].labelDx` / `labelDy` (px) | budget ≈ 6.4 px per character vs the edge's length; the lint prints both numbers |
| "curve that arrow / it cuts through a box" | `edges[i].bend` | positive/negative bows the path to either side |
| "two step numbers are on top of each other" | give the steps distinct FIRST edges in `edges`; keep true firing order with explicit `packets` | the coin lands on the first edge's midpoint |
| "zoom the sensor cone out — I can't see all of it" | `cone.range` (px in the 320×180 frame) | guaranteed fit when `range` ≤ distance from sensor to the NEAREST frame edge (any facing/spread); a larger range may still fit — verify with the arc-bounds snippet in `motion-detection.md` |
| "have the sensor face up instead of left" | `cone.facing` | degrees clockwise from +x: 0 right, 90 down, 180 left, 270 up |
| "the person should trip it one step later" | move the per-step `subject` points | verify with the pirModel snippet in `motion-detection.md` — never assert `tripped` |
| "make the warning kick in sooner" | thermo `warn` / `crit` | zones are computed at render; also move the step values so the crossing lands on the intended step |
| "put the temperature panel above the state panel" | order of the `panels` array | render order = array order |
| "make the proposal tab stand out" | `tabs[i].highlight`: `true`, an accent name, or `"#RRGGBB"` | |
| "more space between rows / bigger boxes" | **not spec-adjustable** | row gap (140 px), card size (54 px tall), and board width (1180 px) are engine constants — say so instead of guessing |

## Working method for any adjustment

1. Find the element's declaration in the spec (search the label text the
   operator used — titles and labels are verbatim in the JSON).
2. Apply the smallest knob from the table. Prefer structure changes (row
   order, stacking) over pixel nudges; pixel nudges exist only where the table
   lists them (`floats.dx/dy`, `labelDx`, `bend`, pir coordinates).
3. Re-validate. The lint is layout-aware — it will name label overflows,
   crowded corridors, and coin collisions with the numbers that justify the
   fix.
4. Re-inject and reload. For a pir geometry change, run the verification
   snippet BEFORE injecting: the engine computes tripped/clear, so a moved
   sensor can silently change the story.
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

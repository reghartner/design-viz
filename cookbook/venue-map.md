# Venue map — sections that fill step by step

Use the **Venue map** panel (`type:"seatmap"`) when the story is *where in the
building* something happens: a presale fills the lower bowl, a group hold
appears and later converts, a promo lifts the upper deck, a tier is repriced.
Every number is authored per step; the panel folds sparse patches into complete
state and never forecasts. The complete teaching page is
[`examples/sports/venue-map.spec.json`](../examples/sports/venue-map.spec.json)
(two paths: **Sells out** and **Soft demand → upper tier repriced**).

## Two ways to get a map

| You have… | Do this | Result |
|---|---|---|
| a list of sections (spreadsheet, seating guide) | write a CSV `id,level,zone,capacity[,label]` and run the importer | `geometry:"bowl"` — a generic rink with one ring per level, sections placed by zone |
| the venue's own SVG seating chart | run the importer on the SVG | `geometry:"paths"` — every section keeps its real outline |
| nothing yet | start from the picker template (two rings × eight zoned sections) | a small bowl to edit by hand |

```sh
node tools/seatmap-import.mjs sections.csv --capacity-total 17250 --out sections.json
node tools/seatmap-import.mjs chart.svg --level-map "1:100 level,2:200 level,3:300 level" --out sections.json
```

The importer prints a report on stderr (rings, sections, capacities, every
skipped element with its reason) and writes a declaration fragment
`{geometry, rings, sections, …}`. Paste the fragment's fields into your panel
next to `id`, `type`, `title` and `initial`. The fragment is plain data: you can
edit ids, labels, zones and capacities afterwards, and the validator names any
field it cannot accept.

### What the CSV import infers

- One ring per distinct `level` value, in file order (inside → out). `level`
  becomes the ring label; the ring id is its slug (`100 level` → `100-level`).
- `bowl:"rink"` and sections in file order with their `zone`; the panel places
  them (next section). No `slot`/`span` is written, so the CSV order and zones
  are the whole placement input. The report names sections whose zone is not
  recognised.
- Blank capacities are filled from `--capacity-total` as an even split across
  the blank rows (remainder on the first rows) and the fragment carries
  `"capacityNote": "illustrative even split"`. Without the flag they become 1
  and the note says so. **Either way the capacities are not venue data**; say
  so on the page, as the example does.
- Nothing else is inferred: no prices, no sold counts, no tiers, no geometry
  beyond the generic `rink` bowl (switch `bowl` to `oval`, `rectangle` or
  `pitch` by hand).

### What the SVG import infers

- A section is a `<path>`, `<polygon>`, `<rect>` or `<circle>` whose `id` or
  `data-section` looks like a section id (up to three letters, one to four
  digits, an optional trailing letter: `101`, `201A`, `U12`). Decorative shapes
  with other ids are listed as skipped; shapes without an id are ignored.
- Shapes are converted to path commands, `translate`/`scale`/`matrix`
  transforms on the element and its ancestors are applied, and all coordinates
  are normalised preserving aspect so that the chart's longer side is 1000
  units (both axes stay inside the panel's 0–1000 range; the emitted `viewBox`
  takes the scaled width and height, each at least 100). `rotate`, `skewX`,
  `skewY` and arcs under a rotating matrix fail loudly for that element and
  appear in the report; fix the chart or redraw that section.
- The panel accepts at most 2,000 characters per path. An overlong straight-edged
  path (`M`/`L`/`Z`, including compound sections with holes or splits) is
  simplified by dropping its least significant vertices, every subpath and
  closure kept, and the report lists each simplified section with the points
  removed; an overlong path that uses curves (`C`/`Q`/`A`) is skipped with a
  reason instead, so redraw it with fewer commands.
- Rings: an ancestor `<g id>` named in `--level-map` wins; otherwise the leading
  digits of the id are the ring (`101` → `1`, `201A` → `2`, `1203` → `12`),
  which is how most arena charts number. The map's labels name the rings
  (`"1:100 level"`); unmapped rings are labelled `Level N`. Edit the JSON if the
  inference is wrong.
- Capacities come from `data-capacity` where present; others follow the CSV
  rule (`--capacity-total` split or 1). `data-zone` and `data-label` are kept.
- `<style>` and `<script>` are ignored, external references are never
  followed, no script runs, and the output is refused above 512 KiB.
- Every emitted path passes the panel's strict tokenizer (absolute
  `M L H V C S Q T A Z`, finite numbers inside 0–1000), so an imported chart can
  never inject markup into the page.

## How zones drive placement

Every bowl outline has eight regions, clockwise from the left end: **left
end**, corner, **top sideline**, corner, **right end**, corner, **bottom
sideline**, corner. The panel walks each ring's sections in declaration order
and reads the section's `zone` as a kind: `sideline` (also `club`, `bench`,
`centre`), `corner`, or `end` (also `goal`). Each section goes to the next
region of its kind; sections that match the first region after the walk has
passed it (the `118–121` that follow the last corner) join the first region
ahead of its leading sections, so `118, 119, 120, 121, 101` share the left end
in that order. Every region is split evenly among its sections; a region that
receives none (the 300 level has no left-end sections) gives half its arc to
each neighbour, so its corner groups stretch around the end. On a rink the
sidelines are straight runs, so sideline sections keep straight edges and the
corner and end sections take the curves. Rings may have different counts and
asymmetric sides: the seed's 100 level has 3 sideline sections on top
(`103–105`) and 4 club sections below (`113–116`).

The seed bowl therefore reads like the public seating guides: `101` at the
left end beside the top corner `102`, `103–105` along the top sideline with
the `home bench` landmark, `107–111` on the right end, `113–116` on the bottom
sideline and `118–121` back on the left end. Zone placement, not slots, is why
`201A/201B/202/203` share one corner. If a ring has no recognised zones it is
split evenly from the start region; a ring whose sections carry an authored
`slot` is placed by slots instead (`ringSlots`, `span`).

### Fixing numbering direction for another venue

Public guides describe where sections sit (ends, sidelines, benches) more often
than which way the numbers run, so check one against the render:

- `direction:"clockwise"` (default) walks left end → top sideline → right end
  → bottom sideline. `direction:"counterclockwise"` mirrors the bowl top to
  bottom, so the walk goes left end → bottom sideline → right end → top
  sideline while the first sections stay on the left end.
- `startAt:"end"` (default) begins the walk in the left end; `startAt:"sideline"`
  begins it on the top sideline for venues whose numbering starts at centre
  ice or midfield.
- To put the bench on a particular sideline, choose the direction that places
  the bench sections' sideline on top, then author the `home bench` landmark
  there; a landmark pill that would cover a section label slides toward the
  field until it is clear.

Combine the two fields to match any guide: for a venue numbered counterclockwise
from a sideline, declare `"direction":"counterclockwise","startAt":"sideline"`.

## Telling the story

Patch only what changed. The four maps (`sold`, `held`, `price`, `tierOf`)
merge key by key; `null` on a key forgets that section, `null` on the field
clears the map. `mode` picks the colouring rule (`sold`, `held`, `price`,
`tier`, `revenue`), `highlight` outlines up to eight sections and pulses once
when the set changes, `note` explains the beat. Holds count against capacity
but never against sold; revenue is Σ sold × price where price is known and the
totals say "where price known" until every section is priced.

```json
{
  "page": {
    "title": "Venue map — a small bowl",
    "skin": "aurora",
    "blocks": [{
      "heading": "Presale, hold, convert",
      "text": ["A fictional 16-section bowl. Section ids, capacities, prices and sales are illustrative."],
      "diagram": {
        "view": "step",
        "nodes": {
          "crm": {"title": "Fan CRM", "sub": "presale list", "icon": "person", "tint": "data"},
          "tix": {"title": "Ticketing", "sub": "inventory · holds", "icon": "server", "tint": "cmd"}
        },
        "rows": [["crm", "tix"]],
        "edges": [{"from": "crm", "to": "tix", "kind": "https", "label": "presale codes"}],
        "panels": [{
          "id": "map", "type": "seatmap", "title": "Venue map · illustrative", "bowl": "rink", "currency": "USD",
          "rings": [{"id": "lower", "label": "Lower"}, {"id": "upper", "label": "Upper"}],
          "sections": [
            {"id": "101", "ring": "lower", "capacity": 400, "zone": "end"},
            {"id": "102", "ring": "lower", "capacity": 400, "zone": "corner"},
            {"id": "103", "ring": "lower", "capacity": 400, "zone": "sideline"},
            {"id": "104", "ring": "lower", "capacity": 400, "zone": "corner"},
            {"id": "105", "ring": "lower", "capacity": 400, "zone": "end"},
            {"id": "106", "ring": "lower", "capacity": 400, "zone": "corner"},
            {"id": "107", "ring": "lower", "capacity": 400, "zone": "sideline"},
            {"id": "108", "ring": "lower", "capacity": 400, "zone": "corner"},
            {"id": "201", "ring": "upper", "capacity": 600, "zone": "end"},
            {"id": "202", "ring": "upper", "capacity": 600, "zone": "corner"},
            {"id": "203", "ring": "upper", "capacity": 600, "zone": "sideline"},
            {"id": "204", "ring": "upper", "capacity": 600, "zone": "corner"},
            {"id": "205", "ring": "upper", "capacity": 600, "zone": "end"},
            {"id": "206", "ring": "upper", "capacity": 600, "zone": "corner"},
            {"id": "207", "ring": "upper", "capacity": 600, "zone": "sideline"},
            {"id": "208", "ring": "upper", "capacity": 600, "zone": "corner"}
          ],
          "landmarks": [{"id": "bench", "label": "home bench", "x": 420, "y": 322}],
          "initial": {
            "price": {"101": 95, "102": 95, "103": 120, "104": 95, "105": 95, "106": 95, "107": 120, "108": 95, "201": 40, "202": 40, "203": 48, "204": 40, "205": 40, "206": 40, "207": 48, "208": 40},
            "note": "Before the presale. Prices are fictional."
          }
        }],
        "steps": [
          {"id": "presale", "edge": "crm->tix", "text": "Presale fills the lower bowl.",
           "panels": {"map": {"sold": {"101": 300, "102": 340, "103": 390, "104": 330, "105": 280, "106": 320, "107": 395, "108": 310}, "highlight": ["103", "107"]}}},
          {"id": "hold", "nodes": ["tix"], "text": "A 600-seat group hold appears upstairs. Hatched seats are held, not sold.",
           "panels": {"map": {"held": {"205": {"count": 300, "label": "School night", "until": "T-7d"}, "204": {"count": 300, "label": "School night", "until": "T-7d"}}, "highlight": ["204", "205"]}}},
          {"id": "convert", "nodes": ["tix"], "text": "The hold converts: held seats become sold.",
           "panels": {"map": {"held": {"204": null, "205": null}, "sold": {"204": 300, "205": 300}, "highlight": null, "mode": "revenue", "note": "Revenue mode: fill = sold × price per section."}}}
        ]
      }
    }]
  }
}
```

Desktop authoring only: the panel is edited in the workbench inspector
(**Sections**, **Price tiers**, **Landmarks** rows; **Sold by section** and the
other maps as JSON objects) and read anywhere. See the `seatmap` bullet in the
[authoring contract](../contract/authoring-contract.md) for every limit.

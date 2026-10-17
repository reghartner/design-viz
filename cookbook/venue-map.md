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
| a list of sections (spreadsheet, seating guide) | write a CSV `id,level,zone,capacity[,label]` and run the importer | `geometry:"bowl"` — a generic oval with one ring per level |
| the venue's own SVG seating chart | run the importer on the SVG | `geometry:"paths"` — every section keeps its real outline |
| nothing yet | start from the picker template (two rings × eight slots) | a small bowl to edit by hand |

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
- `ringSlots` is the largest level's section count (capped at 32). Each level's
  sections walk clockwise around the ring in file order with an even fractional
  `slot`/`span`, so rings with fewer sections get wider wedges and a level with
  more than 32 sections shares slots by `span`.
- Blank capacities are filled from `--capacity-total` as an even split across
  the blank rows (remainder on the first rows) and the fragment carries
  `"capacityNote": "illustrative even split"`. Without the flag they become 1
  and the note says so. **Either way the capacities are not venue data**; say
  so on the page, as the example does.
- Nothing else is inferred: no prices, no sold counts, no tiers, no geometry
  beyond the generic `oval` bowl (switch `bowl` to `horseshoe`, `rectangle` or
  `pitch` by hand).

### What the SVG import infers

- A section is a `<path>`, `<polygon>`, `<rect>` or `<circle>` whose `id` or
  `data-section` looks like a section id (up to three letters, one to four
  digits, an optional trailing letter: `101`, `201A`, `U12`). Decorative shapes
  with other ids are listed as skipped; shapes without an id are ignored.
- Shapes are converted to path commands, `translate`/`scale`/`matrix`
  transforms on the element and its ancestors are applied, and all coordinates
  are normalised to a 1000-wide viewBox preserving aspect. `rotate`, `skewX`,
  `skewY` and arcs under a rotating matrix fail loudly for that element and
  appear in the report; fix the chart or redraw that section.
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
          "id": "map", "type": "seatmap", "title": "Venue map · illustrative", "bowl": "oval", "ringSlots": 8, "currency": "USD",
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
          "landmarks": [{"id": "bench", "label": "home bench", "x": 500, "y": 290}],
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

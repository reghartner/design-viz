# Optional sports package

This package contains the `seatmap` venue panel, the UBS Arena library entry,
seating-chart import support, the venue-map recipe, and a complete example.
It is omitted from the default viewer, workbench, validator, gallery, and
offline authoring kit. Season of seats also uses the generic core `grid` and
`funnel` panels without loading science or biology content.

Enable it for a company build in `company/company.json`:

```json
{
  "version": 1,
  "packages": ["sports"]
}
```

Then run `python3 tools/build.py`. For a local preview, run
`python3 tools/build.py --package sports`. The generated viewer, editor,
validator, and offline authoring kit use the same package selection. Rebuild
with the intended selection before exporting a page; the repository validator
CLI reads the current selection directly.

The [venue-map recipe](cookbook/venue-map.md) explains the panel and how to
import a seating chart. Company venues go in `company/panels/venues/` and are
loaded only when this package is enabled. Authoring and editing these
documents is desktop only.

The [Season of seats](diagrams/season-of-seats/README.md) is a 14-chapter,
173-step teaching story that uses the venue map throughout the ticketing
season. It includes the authored spec and a source review. Public facts are
cited in the story; operational flows and uncited figures are illustrative.

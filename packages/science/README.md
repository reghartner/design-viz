# Optional science package

This package contains physics and biology teaching panels: `wavefield`,
`forcebody`, `rnacopy`, four sequence panels (`sequence`, `frames`, `reads`,
`locus`), and the `strandscene` and `cellscene` mechanism panels. Its
sequencing stories also use the generic core `funnel` and `grid` panels. It
contains three editable starters, complete examples, recipes, and panel
contracts. The default build excludes the science-specific material from the
viewer, workbench templates, example gallery, and offline authoring kit.

Enable it for a company build in `company/company.json`:

```json
{
  "version": 1,
  "packages": ["science"]
}
```

Then run `python3 tools/build.py`. For a local preview, run
`python3 tools/build.py --package science`. The viewer, editor, validator,
and offline authoring kit all use the same package selection. A build in the
same checkout replaces the previous generated outputs, so rebuild with the
intended selection before exporting or browsing generated HTML. The repository
validator CLI reads the current selection directly.

Use the [physics recipe](cookbook/physics-panels.md),
[general cell-scene recipe](cookbook/cell-scenes.md),
[copy-gate recipe](cookbook/viral-copy-gate.md), or
[sequence recipe](cookbook/sequence-panels.md) for complete stories and panel
selection. Authoring and editing these documents is desktop only.

The [cell journey](diagrams/biology/cell-journey/README.md) is a longer desktop
biology showcase: 13 lessons covering replication through sequencing, with a
section-by-section science review and editable spec.

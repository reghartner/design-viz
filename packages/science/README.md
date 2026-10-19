# Optional science package

This package contains biology teaching panels: `rnacopy`, `nspstory`, four sequence
panels (`sequence`, `frames`, `reads`, `locus`), and the `strandscene` and
`cellscene` mechanism panels. Its stories also use the generic core `funnel`
and `grid` panels. It contains built-in RNA-copying and NSP15-evidence starters, other
editable source examples, recipes, and panel
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

Use the [general cell-scene recipe](cookbook/cell-scenes.md),
[copy-gate recipe](cookbook/viral-copy-gate.md), or
[sequence recipe](cookbook/sequence-panels.md) for complete stories and panel
selection. Authoring and editing these documents is desktop only.

The [NSP15 story recipe](cookbook/nsp15-story.md) describes four SVG lessons for
the Bianco et al. preprint, with decorative motion and complete print stills.

The [cell journey](diagrams/biology/cell-journey/README.md) is a longer desktop
biology showcase: 13 lessons covering replication through sequencing, with a
section-by-section science review and editable spec.

# Optional science package

This package contains physics and biology teaching panels: `wavefield`,
`forcebody`, `rnacopy`, six sequence panels (`sequence`, `frames`, `reads`,
`locus`, `funnel`, `grid`), and the `strandscene` and `cellscene` mechanism
panels. It also contains three editable starters, complete examples, recipes,
and panel contracts. The default build excludes these from the viewer,
workbench templates, example gallery, and offline authoring kit.

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
intended selection before exporting or testing.

Use the [physics recipe](cookbook/physics-panels.md),
[biology recipe](cookbook/viral-copy-gate.md), or
[sequence recipe](cookbook/sequence-panels.md) for complete stories and panel
selection. Authoring and editing these documents is desktop only.

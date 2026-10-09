# Focused authoring packets

Select the task's panels and features before writing a spec, or infer them from
an existing spec. Read the emitted packet instead of the broad contract and
complete example. Full documentation stays in the offline authoring kit and is
available on demand; this optimizes the reading assignment, not kit access.

```sh
python3 tools/authoring-packet.py --panel state --feature steps --out packet.md
python3 tools/authoring-packet.py --panel deviceapp --panel screen --feature paths --feature layouts --out packet.md
python3 tools/authoring-packet.py --spec story.spec.json --mode edit --out packet.md
```

Repeat `--panel` and `--feature`; unknown names fail. Panel names are listed by
`python3 tools/widget_doc.py --list`. Features: `steps`, `time`, `paths`,
`layouts`, `explore`, `icons`, `audio`, `visibility`, `contracts`, `reveals`, `groups`,
`delta`, `bindings`, `topology`, `drilldowns`. Explicit selections **union** with
spec inference; they never silently narrow an existing spec. Inference uses
canonical sections, including tabs and bare diagrams. Review its reported
selection when the source requires a feature the spec does not yet contain.
Topology imports/exports are recognized without resolving or changing them.

The generator uses `widget_doc.load_sections` for selected panel contracts and
extracts other rules from their maintained headings. It includes common spec,
evidence, approval and delivery rules. Panel selection brings shared icons,
visibility and sparse-patch rules; time-bearing panels bring story time. Paths,
time and visibility bring step rules. Layouts, bindings, topology and drilldowns
include their maintained owners. Reference/example routes stay on demand. Extracted Markdown links use VIZ-root
paths, preserving URL queries and anchors; the kit includes the small linked
example specs and topology providers so those routes work offline.

`--mode edit` preserves the scoped-edit exception and omits the new-story
question/inventory phases. An already fully specified edit does not require a
fresh worksheet or question batch. Existing folder-session approval and source
preservation rules still apply. No packet grants publication permission.

`packet.md.json` records explicit/inferred/final selection, source paths and
SHA-256 hashes, excerpt sizes and emitted characters/UTF-8 bytes. The comparison
baseline is the complete contract, compact skill, detailed workflow reference, worked example and cookbook
index, joined with blank lines. This measures **document size**, not observed
model tokens, cost, speed or quality savings. Output order and provenance are
deterministic for the same maintained sources and choices. Source files are
never rewritten. Without `--out`, Markdown is stdout and metadata is stderr.

Generate size measurements from `packet.md.json` for the current sources rather
than relying on a fixed historical table. The compact SKILL entry routes both new
and edited diagrams here before JSON; connected Workbench instructions do the
same after identity/protocol setup and source/candidate inspection. Full session
manuals and helper implementations are not prerequisite reading.

Packets include the maintained workflow's essential story/state/placement rules,
selected contracts, validation and explicit visible-beat evidence. New-story mode
also includes inventory, unresolved-question handling and the worksheet route.
Use `--mode new --spec ...` for a materially changed story. No mode re-asks source
facts or drops required icons, animation or richness to reduce reading context.
See [visibility evidence](visibility-evidence.md) for the authored ledger mapping,
value/icon and eligibility checks, honest N/A, and pending Workbench visual review.

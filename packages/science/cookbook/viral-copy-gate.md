# At the copy gate: one genome, two outcomes

Use this recipe to teach the dependency between RNA synthesis and downstream viral assembly without presenting a specific pathogen or intervention. The authored model is an illustrative enveloped positive-sense RNA virus in a eukaryotic cell.

[Complete editable spec](../diagrams/biology/copy-gate/copy-gate.spec.json) · [Starter](../starters/copy-gate.json)

## Build the causal story

Both paths share arrival, entry/uncoating, translation and a copy gate with one explicitly completed new RNA copy. At that gate one completed +RNA token sits in the separate tray, the cell wedge is labeled New RNA ×1, and the dashed complementary intermediate shows further synthesis underway. The baseline increases the completed pool to four. The alternate interrupts further synthesis and retains both the completed pre-fork copy and the incomplete complementary intermediate. Its later packaging and release of one symbolic particle are explicit illustrative assumptions; real replication–assembly coupling varies. Every beat changes visible scene state; captions explain why the next stage becomes possible or constrained.

Keep the whole-cell camera and close-up framing fixed across paths. Distinguish incoming RNA (pink pill), completed new RNA (cyan wedge labeled with the symbolic pool count), and spiky assembly/outside marks by label and shape as well as color. The assembly mark represents a labeled pool; outside marks each represent one symbolic particle. The close-up distinguishes the solid incoming +RNA, dashed complementary intermediate and separate completed +RNA tokens. Its pathway bridge explicitly connects incoming +RNA → complementary intermediate → new +RNA; the stop square and status label identify interruption without relying on color. Organelles unrelated to this cytoplasmic copying path are omitted.

## Author the fields

| Surface | Fields | Guidance |
| --- | --- | --- |
| `cellscene` declaration | `compartments`, `items`, `initial`, `legendMode`, `labelMode` | Declare stable compartment/item identities once. Assign explicit shapes, short labels, and fixed positions. Eight items is the panel limit. Use `legendMode: "visible"` to explain only entities currently shown, and `labelMode: "readable"` for larger scene labels and a caption below the scene. |
| Cell beat | `items`, `highlight`, `labels`, `caption` | Patch counts, positions and states deliberately. Hidden items use both `count: 0` and `state: "hidden"`. Keep `zoom: null` across the comparison. |
| `rnacopy` declaration | `label`, `initial` | Label the inset as a conceptual atlas: active site, completed-copy tray and an explicit two-round pathway bridge. It omits sequence and molecular detail. |
| Copy beat | `status` | Choose `ready`, `copying`, `paused`, `interrupted` or `complete`. Status does not infer extent, position or output. |
| Copy beat | `position`, `progress` | Independent authored fractions from 0 to 1: clamp position along the incoming ribbon and complementary-intermediate extent. These are diagram controls, not biological parameters or elapsed time. |
| Copy beat | `copies` | Whole number 0–12, shown numerically and as separate +RNA tokens in the completed-copy tray. This recipe uses cumulative completed-copy counts: one before the fork and four on the baseline. Never interpret differences as yield, efficacy or a rate. |
| Prose | `caption`, `note` | Explain the causal change and claim boundary. Use `null` to clear prose; omitted fields carry. |
| Branching | `steps[].id`, `paths[].steps` | Reference the same four shared IDs in both paths. The alternate begins from the same fold state at the copy gate. |
| Desktop composition | `sectionLayout.default` | Place the full path/step controls above the heroes. Give the RNA close-up 14 of 24 columns and cell context 10, with the full stage board below. Editing is desktop-only. |

The schematic is incoming +RNA → complementary RNA intermediate → new +RNA. The dashed complementary intermediate is not a completed +RNA genome. Its extent and the tray’s completed-copy count are independent authored states; neither implies kinetics or automatically produces the other. The cell and close-up both declare the shared pre-fork copy. The alternate assembly beat assigns that new copy to a particle while the cumulative tray count stays at one and the incomplete intermediate persists, leaving the incoming genome in place; it does not silently assume repackaging the incoming genome. Packaging and output remain illustrative assumptions, not yield or efficacy estimates. No named pathogen, real sequence, experimental procedure, agent, dose or quantitative efficacy belongs in this recipe's teaching story.

## Evidence and alternatives

The page's source/claim-limit ledger links the primary [translation/replication study](https://genesdev.cshlp.org/content/12/15/2293.full) and [RNA polymerase structural study](https://www.sciencedirect.com/science/article/pii/S0092867420306292), with an [accessible primary article copy](https://pmc.ncbi.nlm.nih.gov/articles/PMC7242921/). The first study concerns a specific non-enveloped virus, so it does not support this composite's envelope or entry route. The second supports polymerase/RNA engagement, not the effectiveness of this hypothetical interruption. Entry, envelope acquisition, assembly location and release are explicitly compressed; these routes vary among viruses.

Ranked alternatives are included in the ledger: copy-gate comparison first for the translation-versus-copying lesson; an entry-gate comparison second for membrane entry; an assembly-gate comparison third when packaging is the teaching objective.

## Validate and export

```sh
node tools/validate.js packages/science/diagrams/biology/copy-gate/copy-gate.spec.json packages/science/starters/copy-gate.json
python3 tools/page_build.py packages/science/diagrams/biology/copy-gate/copy-gate.spec.json
```

Require zero warnings. Inspect all seven beats on both paths at desktop width, especially path switching after the final baseline beat. Rebuild the adjacent HTML and manifest after edits, and keep the starter an exact copy of the complete spec. Generated HTML is the deliverable; the spec remains the editable source.

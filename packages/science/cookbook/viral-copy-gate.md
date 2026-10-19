# From viral RNA copying to sequencing evidence

Use this recipe for one desktop teaching page about an unnamed enveloped positive-sense RNA virus. Act one is a conceptual copying fork. Act two changes the question: what can an illustrative RNA-seq readout actually support? The page is a teaching synthesis, with no sequence, wet-lab procedure, named intervention, measured result, or efficacy estimate.

[Complete editable spec](../diagrams/biology/copy-gate/copy-gate.spec.json) · [Starter](../starters/copy-gate.json)

## Act one: follow the +RNA

Both paths share arrival, entry, translation and a copy gate with one symbolic completed new +RNA. The close-up distinguishes incoming +RNA, a complementary intermediate, and completed +RNA tokens. The dashed strand at the active site is a separate illustrative synthesis event. It does **not** imply that each new +RNA requires a newly made complementary template; a complementary template can support further +RNA synthesis.

The baseline increases the authored completed-copy pool. The alternate interrupts further synthesis after the shared copy. Its later assembly and release use that pre-fork copy under an explicit teaching assumption. Replication–assembly coupling varies; token counts and outside particles are neither biological yield nor intervention efficacy.

Keep whole-cell and close-up framing fixed across paths. Use shape and text as well as color: incoming RNA is a pill, the new RNA pool is a labeled wedge, and assembly/outside particles are separately labeled spiky marks. The pathway bridge names incoming +RNA → complementary intermediate → new +RNA. The diagram omits sequence, molecular structure, cofactors, host responses, membrane organization and real time.

| Surface | Authoring cue |
| --- | --- |
| `cellscene` | Declare stable compartment and item IDs. Patch `items`, `highlight`, `labels` and `caption` for each beat; hide items with both `count: 0` and `state: "hidden"`. |
| `rnacopy` | Patch `status`, `position`, `progress`, `copies`, `caption` and `note`. Position and progress are independent drawing fractions; `copies` is a symbolic completed-token count. |
| Branching | Reuse the same four shared step IDs in both `paths[].steps`, so the fork starts from the same folded state. |
| Desktop layout | Put the path and step controls above the two hero panels, then the stage board below. Check every step at 1280 and 1440 px; document editing is desktop-only. |

## Act two: read the RNA-seq evidence

The `rna-evidence` section has seven linear steps: observe fragments, separate assignable and viral matches, map regions, inspect orientation, question an uneven window, bound the claim, and record the interpretation. It uses three synchronized but different views:

| Panel | What it adds | Limit to state aloud |
| --- | --- | --- |
| `funnel` | Nested illustrative fragment sets keep the denominator visible. | The 100 → 72 → 24 → 15 values are invented teaching marks, not read yield or filtering thresholds. |
| `locus` | An anonymous three-region strip answers *where* reads map. | Its positions are drawing coordinates, not a named genome or biological scale. |
| `grid` | A strand-by-window heatmap is the close view of relative read support. | Values are invented signal units, not molecule counts. Strand orientation is available only when the library preserves strand information; real interpretation requires controls and biological context. |

The page intentionally uses a coverage grid instead of a `reads` panel because the latter requires nucleotide letters. A read match supports the presence of matching RNA in sampled material. One read set does not directly establish when RNA was made, ongoing replication, infectious particles, or intervention efficacy. Keep observations, supported interpretations and open questions separate in the final ledger.

## Sources and claim boundaries

The [positive-strand RNA study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9479745/) discusses the established complementary-intermediate model while examining RNA properties across several viruses. [Fabozzi et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC6096831/) demonstrate strand-specific dual RNA-seq in influenza A, a **negative-sense** virus; the measurement concept transfers, not its virus biology or findings. [Alexandersen et al.](https://www.nature.com/articles/s41467-020-19883-7) show a context-specific limit: detected SARS-CoV-2 genomic and subgenomic RNA in clinical samples did not by itself indicate active replication. None of these papers supplies the diagram's invented counts or hypothetical interruption outcome.

## Validate and export

Select the science package, then validate both editable copies and rebuild the adjacent standalone export:

```sh
python3 tools/build.py --no-config --package science
FLOWVIEW_PACKAGES=science FLOWVIEW_COMPANY_IDENTITY=off node tools/validate.js packages/science/diagrams/biology/copy-gate/copy-gate.spec.json packages/science/starters/copy-gate.json
FLOWVIEW_PACKAGES=science FLOWVIEW_COMPANY_IDENTITY=off python3 tools/page_build.py packages/science/diagrams/biology/copy-gate/copy-gate.spec.json
```

Require zero errors and warnings. Inspect both act-one paths and every RNA-seq step at desktop widths, including all step controls and panel content. Keep the starter an exact copy of the complete spec.

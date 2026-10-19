# NSP15 evidence lessons

`nspstory` is a purpose-built panel for the public Bianco et al. preprint,
DOI [10.64898/2026.08.15.744938](https://doi.org/10.64898/2026.08.15.744938).
It draws sequence-free explanations, not mechanistic simulations.

Choose `scene: "reporter" | "dilution" | "origin" | "evidence"` in setup.
Author `initial: {"phase": 0}` and patch `phase` through 0, 1, 2, 3 in
successive steps. `caption` accepts text or null; `enterOnce` supports the
same state fields. Sparse patches carry state and path/seek behavior uses
the ordinary panel fold. Invalid phases warn and retain the prior state.

- Reporter: arrival → rare GFP restoration → newly infected descendants →
  sequence check. Cells fluoresce; the virus particle does not.
- Dilution: mixed positive culture → illustrative one/multiple/zero founders →
  follow and sequence-check → reporter selection boundary. Shapes represent
  lineages. The scene supplies no protocol, probability, or guarantee of purity.
- Origin: tandem → distal match → inferred origin → proposed fragment transfer.
  The moving fragment is explicitly proposed; incorporation is unresolved.
- Evidence: all → distal → tandem → median size. Bars use the published
  HCoV-OC43 rounded cpm on one linear scale. Animation contracts the inactive
  comparison bar from the WT length; it is a comparison, not a time series.
  Exact terminal rates remain labeled. The ≥11 nt mapped subsets do not
  partition the ≥2 nt total. This panel is specific to this paper's numbers.

All animations are finite. Reduced motion and print render the complete,
labeled final frame. No scripts, requests, sequences, timers, or experimental
parameters are supplied by a spec. Authoring acceptance is desktop only.

The editable example is
`packages/science/diagrams/biology/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json`;
its starter is byte-identical. Build with
`FLOWVIEW_COMPANY_IDENTITY=off python3 tools/build.py --package science --no-config`,
then `FLOWVIEW_PACKAGES=science FLOWVIEW_COMPANY_IDENTITY=off python3 tools/page_build.py <spec>`.
Run the example's `check-desktop.mjs` for all-step desktop, motion and print checks.

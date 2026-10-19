# NSP15 evidence lessons

`nspstory` is a purpose-built panel for the public Bianco et al. preprint,
DOI [10.64898/2026.08.15.744938](https://doi.org/10.64898/2026.08.15.744938).
It draws sequence-free explanations, not mechanistic simulations.

Choose `scene: "reporter" | "dilution" | "origin" | "evidence"` in setup.
Author `initial: {"phase": 0}` and patch `phase` through 0, 1, 2, 3 in
successive steps. `caption` accepts text or null; `enterOnce` supports the
same state fields. Sparse patches carry state and path/seek behavior uses
the ordinary panel fold. Invalid phases warn and retain the prior state.

In the example, rich conceptual scenes are titled **Illustrative** and sit
beside compact **Evidence** or **Evidence / limits** panels. Keep raw counts,
source notes, assay selection, and confirmation caveats in those factual
panels; do not turn them into atmospheric artwork or repeat the whole step
narrative there.

Decorative atmosphere is an explicit setup choice: `ambient` enables it,
`ambientIntensity` accepts `quiet | medium | lively`, and `ambientTempo`
accepts `slow | normal | fast`. These settings visibly change only decorative
background rings, particles, and field drift; they never move evidence bars,
well outcomes, or the proposed source-to-recipient transit, and never replay a
teaching beat. Reduced motion and print suppress the drift regardless of the
authored setting.

The dilution and origin reader stages expose those settings as persistent
presentation controls: **Quiet / Glow / Bloom** map to
`quiet / medium / lively`, and **Gentle / Normal / Brisk** map to
`slow / normal / fast`. Play, pause, and replay act on presentation motion only;
the authored phase, symbolic identities, well outcomes, evidence, and claim
limits do not change. **Evidence + scene limits** opens a compact disclosure on
the stage, while the Evidence panel immediately below retains the raw source
reading.

- Reporter: arrival → rare GFP restoration → newly infected descendants →
  sequence check. Cells fluoresce; the virus particle does not.
- Dilution: dense mixed culture → one finite fan into nine illustrative wells →
  candidate follow and sequence-check → reporter selection boundary. Every
  well is labeled empty, mixed, or candidate; shapes represent lineages. A
  single-looking candidate is not proof. The scene supplies no protocol,
  counts, probability, or guarantee of purity.
- Origin: matching source + recipient insertion → distal relationship → inferred
  origin → proposed fragment transit. Solid marks carry the observed sequence
  relationship; the source boundary is conceptual, the connector is dashed,
  and the amber `PROPOSED / NOT OBSERVED` badge remains visible. The one moving
  fragment is explicitly illustrative; incorporation is unresolved.
- Evidence: all → distal → tandem → median size. Bars use the published
  HCoV-OC43 rounded cpm on one linear scale. Every bar keeps its published
  width and label at every animation sample; only the current comparison
  emphasis moves. The ≥11 nt mapped subsets do not
  partition the ≥2 nt total. This panel is specific to this paper's numbers.

All animations are finite and phase-specific; later teaching phases do not
replay earlier arrival, reveal, separation, or transfer beats. Reduced motion
shows the selected frame immediately. Print replaces it with a deterministic,
complete lesson summary independent of the selected phase. No scripts,
requests, sequences, timers, or experimental parameters are supplied by a
spec. Authoring acceptance is desktop only.

The editable example is
`packages/science/diagrams/biology/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json`;
its starter is byte-identical. Build with
`FLOWVIEW_COMPANY_IDENTITY=off python3 tools/build.py --package science --no-config`,
then `FLOWVIEW_PACKAGES=science FLOWVIEW_COMPANY_IDENTITY=off python3 tools/page_build.py <spec>`.
Run the example's `check-desktop.mjs` for all-step desktop, motion and print checks.

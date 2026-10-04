# Large auto-arrange architecture baselines

This set keeps four realistic architecture graphs large enough to expose layout
tradeoffs that the smaller shape baselines do not. The saved arrangement is an
unpolished machine result: tall freight flow, crossings, shared-edge weaving and
wide service fans are intentional evaluation signals for a later auto-arrange
pass.

## Files and regeneration

- `graph-input.spec.json` is the neutral source. Every diagram has one row,
  stable node and edge identities, five role tints, and no groups, coordinates,
  ports, curve controls, label offsets or other edge geometry.
- `auto-arranged.spec.json` is generated from that source. Its positions and any
  retained native curve controls come only from the current production
  `autoArrangeCandidates` + `autoArrangeDiagram` pipeline. Attachments remain
  automatic: no output edge has `fromPort` or `toPort`.
- Run `node examples/auto-arrange-large-baselines/generate.cjs` from any
  directory to regenerate the output, validate both specs, check stable node and
  edge identities, and print metrics. The generator fails if any section takes
  20 seconds or more, overlaps cards, or routes through an unrelated card.

`generate.cjs` overwrites `auto-arranged.spec.json`. Regenerate before editing,
then use the workbench's **Open file** action to open the arranged file. Drag
cards and curve handles until the layout expresses the intended target. Use
**Save** and choose a separate filename so the reproducible machine result stays
available. Preserve section IDs, node IDs and edge endpoints in the edited file;
the generator deliberately contains no human target coordinates.

## Saved output metrics

These are the exact production scores stored in the current generated output.
Occupied dimensions include cards and sampled routes, and exclude labels and the
viewer's minimum canvas width. Incident crossings are intersections between
routes that share an endpoint; ordinary crossings exclude those pairs.

| Section ID | Diagram | Nodes | Edges | Planarity | Crossings | Incident crossings | Overlaps | Card hits | Occupied width × height | Aspect |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `incident-response` | 01 · Incident response | 24 | 33 | Planar | 0 | 4 | 0 | 0 | 2460 × 1784 | 1.38 |
| `regional-billing` | 02 · Regional billing | 32 | 48 | Nonplanar (K3,3) | 11 | 7 | 0 | 0 | 2855 × 2054 | 1.39 |
| `freight-operations` | 03 · Freight operations | 40 | 50 | Planar | 1 | 2 | 0 | 0 | 717 × 2480 | 0.29 |
| `data-platform` | 04 · Data platform | 48 | 60 | Planar | 5 | 4 | 0 | 0 | 1849 × 2132 | 0.87 |

On the final deterministic-regeneration run, candidate generation took 1.65 s,
0.48 s, 0.59 s and 0.83 s respectively. All remain well inside the workbench's
20 second worker deadline.

## Topology intent

The three planar graphs are planar as graph topologies, even though the saved
layout still crosses routes in the freight and data-platform cases. Incident
response is a chain of fan-outs and joins with the legacy and recovery feedback
paths embeddable around the outside. Freight operations attaches tender,
tracking, customs and warehouse branches to a long lifecycle spine. The data
platform attaches ingestion, stream, batch, governance and serving branches to
shared spines, with replay and cost feedback on the outer face.

Regional billing is the deliberate exception. Each node in
`us-ingress`, `eu-ingress`, `apac-ingress` connects to each node in
`tax-engine`, `fx-engine`, `fraud-engine`. Those nine edges form a clear K3,3
subgraph, so at least one crossing is mathematically unavoidable. The other
connections retain legacy invoice writes, shared ledgers, payment retries,
direct coupling and a long export path instead of simplifying the graph around
that core.

Across the set, `dev`, `mqtt`, `cmd`, `auth` and `data` mark role categories.
They are node tints only; no enclosing group boxes influence layout. The four
systems intentionally vary in depth and silhouette, from a wide incident fan to
the narrow freight lifecycle and the deeper platform mesh.

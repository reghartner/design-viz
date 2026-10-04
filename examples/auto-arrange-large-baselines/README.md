# Large auto-arrange architecture baselines

This set keeps four realistic architecture graphs large enough to expose layout
tradeoffs that the smaller shape baselines do not. The saved arrangement is a
reproducible machine result. A bounded cleanup shares nearby rank coordinates
and straightens safe one-link branches. Tall freight flow, remaining crossings
and wide service fans still expose tradeoffs for future layout work.

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
| `regional-billing` | 02 · Regional billing | 32 | 48 | Nonplanar (K3,3) | 11 | 2 | 0 | 0 | 2855 × 2054 | 1.39 |
| `freight-operations` | 03 · Freight operations | 40 | 50 | Planar | 1 | 0 | 0 | 0 | 694 × 2480 | 0.28 |
| `data-platform` | 04 · Data platform | 48 | 60 | Planar | 5 | 3 | 0 | 0 | 1819 × 2132 | 0.85 |

On a local regeneration run, candidate generation took 1.08 s,
0.74 s, 0.78 s and 1.20 s respectively. All remain well inside the workbench's
20 second worker deadline.

## Alignment cleanup

The cleanup applies only to ungrouped graphs above the 20-node grid-search
range. It tries evenly spaced rank lines, then smaller line/card changes when a
whole-axis move is unsafe. It preserves already aligned leaves and tries row or
column projections and clear cardinal slots for both source and sink leaves.
An adjacent node may move to meet a crowded leaf when that is safe. No graph
names, roles, node IDs or example coordinates participate in the algorithm.

Every accepted move has zero card overlaps and unrelated-card hits, no increase
in ordinary or incident crossings, and no increase in occupied diagonal. Total
center distance can grow by at most 3% over the selected layout. Natural curves
are tried first; existing native curves are retained only when needed to make a
rank adjustment safe. Full geometry checks are capped at 240 and scaled down by
node × edge count. The six smaller approved baselines remain byte-identical.

| Section | Diagonal degree-1 nodes before → after | Distinct x coordinates before → after | Distinct y coordinates before → after |
| --- | ---: | ---: | ---: |
| Incident response | 1/3 → 0/3 | 15 → 11 | 16 → 16 |
| Regional billing | 6/6 → 0/6 | 32 → 18 | 32 → 23 |
| Freight operations | 5/7 → 1/7 | 22 → 13 | 22 → 22 |
| Data platform | 9/12 → 3/12 | 32 → 27 | 19 → 19 |

Coordinates within 0.1 px count as one line. Lower counts show more shared rows
and columns; they do not claim a perfect grid. Incident, freight and data retain
their regular 116 px row spacing. Billing gains shared rows and columns while
retaining safe irregular positions in its dense core. Ordinary crossings stay
at 0, 11, 1 and 5; incident crossings fall from 4, 7, 2 and 4 to 4, 2, 0 and 3.

The remaining diagonal leaves are `booking-portal` in freight and `orders-db`,
`iot-gateway`, and `mobile-events` in data. All tested local straightening proposals
for these four leaves fail card clearance: freight slots overlap existing cards,
and the data slots overlap or leave only 3–24 px between cards (below the 54 px
branch-placement clearance). These crowded source rows retain their safe placement. All four outputs were visually checked in the
rendered viewer; the cleanup preserves the broader graph silhouettes.

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

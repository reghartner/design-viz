# Large auto-arrange architecture baselines

This set keeps four realistic architecture graphs large enough to expose layout
tradeoffs that the smaller shape baselines do not. The saved arrangement is a
reproducible machine result. A bounded cleanup shares nearby rank coordinates
and straightens safe one-link branches. A second pass composes local motifs
from topology, then removes surplus spacing. Remaining crossings and wide
service fans still expose tradeoffs for future layout work.

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
| `incident-response` | 01 · Incident response | 24 | 33 | Planar | 0 | 4 | 0 | 0 | 1998 × 1784 | 1.12 |
| `regional-billing` | 02 · Regional billing | 32 | 48 | Nonplanar (K3,3) | 11 | 2 | 0 | 0 | 2855 × 1853 | 1.54 |
| `freight-operations` | 03 · Freight operations | 40 | 50 | Planar | 1 | 0 | 0 | 0 | 1711 × 1506 | 1.14 |
| `data-platform` | 04 · Data platform | 48 | 60 | Planar | 2 | 0 | 0 | 0 | 1833 × 1714 | 1.07 |

On a local regeneration run, candidate generation took 1.96 s,
1.69 s, 6.12 s and 5.94 s respectively. All remain well inside the workbench's
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

## Motif composition

The additional candidate pass detects maximal degree-two corridors and shared
input/output sets using adjacency alone. These cover chains, split/rejoin
branches, fans, shared sides of dense meshes, and corridors returning around
feedback loops. No names, roles, tints, reference files or target coordinates
participate in detection or placement. Corridors and fan sets longer than six
nodes are partitioned into deterministic windows of at most six nodes, sharing
one boundary node so every local corridor edge and fan attachment remains
represented. Candidate counts grow linearly; the routing-attempt cap is unchanged.

A motif is a shared-rank scaffold rather than a fixed rectangle. Candidate
scaffolds can overlap at endpoints; full-graph layout expands their spacing and
places other branches in the gaps. Freight's driver/yard/dock/scan corridor and
status/ETA/exception/operations corridor become horizontal. Customs, warehouse
and delivery branches occupy the surrounding interior. This changes structure
instead of widening an otherwise unchanged tall graph with empty margins.

The deterministic search accepts up to five successive scaffold additions,
with at most 240 routing attempts, scaled down by node × edge count. Every
accepted layout has zero card overlaps and unrelated-card hits. Ordinary and
incident crossings cannot increase as a better shape is selected. The search
allows up to 3% extra occupied diagonal and 15% extra center distance while
looking for a better aspect; all four saved outputs have smaller occupied
diagonals than before. Natural-route simplification also preserves incident
crossings, retaining native curves where necessary. Ports remain automatic.

After composition, a bounded set of scale candidates removes surplus gaps.
Each must retain at least 54 px card clearance and pass the same final-path
safety checks. Compression never increases center distance or either crossing
count, and cannot worsen the source shape penalty. A source already within
square-to-16:9 remains within that preferred aspect band. The six approved small outputs remain byte-identical.

| Section | Before → after occupied dimensions | Before → after center distance | Before → after occupied diagonal | Before → after crossings (ordinary / incident) |
| --- | --- | ---: | ---: | --- |
| Incident response | 2460 × 1784 → 1998 × 1784 | 13,777 → 11,802 | 3,039 → 2,679 | 0 / 4 → 0 / 4 |
| Regional billing | 2855 × 2054 → 2855 × 1853 | 18,064 → 17,271 | 3,517 → 3,403 | 11 / 2 → 11 / 2 |
| Freight operations | 694 × 2480 → 1711 × 1506 | 12,546 → 13,403 | 2,575 → 2,279 | 1 / 0 → 1 / 0 |
| Data platform | 1819 × 2132 → 1833 × 1714 | 20,335 → 14,625 | 2,803 → 2,510 | 5 / 3 → 2 / 0 |

Freight trades about 7% more total link distance and a larger occupied area for
a square composition with 39% less height and 11% less occupied diagonal.
Incident and billing improve through safe compaction; their tested motif
rearrangements did not pass the crossing/shape gates. They remain less compact
than the separately saved human reference. Data gains a shorter, clearer
composition with fewer crossings. Retained native-curve counts are 2, 0, 7 and
7 respectively. All four outputs were visually inspected in the rendered viewer.

Real ungrouped 80-node/144-edge ladder and layered stress graphs completed in
2.92 s and 7.74 s respectively, with zero overlaps and unrelated-card hits.
The full 80-node/160-edge layered regression completed in 9.81 s with the same
safety checks after long-motif windowing was added.
The search is bounded, not an exhaustive embedding solver: dense cores and
long feedback structures may retain irregular spacing or a tall silhouette. Freight's
remaining ordinary crossing is carrier-portal → dispatch-board against
carrier-api → retry-queue. The tender fan also retains close parallel curves;
zero incident intersections does not imply generous route-to-route clearance.

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
systems intentionally vary in depth and silhouette, from the incident fan to
the composed freight lifecycle and the deeper platform mesh.

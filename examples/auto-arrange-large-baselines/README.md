# Large auto-arrange architecture baselines

This set keeps four realistic architecture graphs large enough to expose layout
tradeoffs that the smaller shape baselines do not. The saved arrangement is a
reproducible machine result. A bounded cleanup shares nearby rank coordinates
and straightens safe one-link branches. A second pass composes local motifs
from topology, then removes surplus spacing. A final bounded search composes
those placements onto shared graph-wide columns and rows when actual routes
remain safe. Remaining crossings still expose tradeoffs for future layout work.

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
| `incident-response` | 01 · Incident response | 24 | 33 | Planar | 0 | 0 | 0 | 0 | 796 × 926 | 0.86 |
| `regional-billing` | 02 · Regional billing | 32 | 48 | Nonplanar (K3,3) | 10 | 0 | 0 | 0 | 1170 × 926 | 1.26 |
| `freight-operations` | 03 · Freight operations | 40 | 50 | Planar | 1 | 0 | 0 | 0 | 1725 × 1506 | 1.15 |
| `data-platform` | 04 · Data platform | 48 | 60 | Planar | 2 | 0 | 0 | 0 | 1811 × 1714 | 1.06 |

On a local regeneration run, candidate generation took 9.67 s,
9.38 s, 8.88 s and 13.65 s respectively. All remain well inside the workbench's
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
Data gains a shorter, clearer composition with fewer crossings. The motif-stage
metrics above precede the final graph-wide lattice search described below.

## Shared graph-wide columns and rows

The final pass runs after motif composition, so a subsequent motif layout cannot
undo its shared axes. It applies to ungrouped graphs with 21–48 nodes and at most
80 edges. Twenty deterministic grid proposals preserve the composed layout's
relative positions, resolve occupied cells, and use at least 204 px horizontal
and 116 px vertical center spacing. Nearby motifs can share rows and columns;
their spacing is no longer independently preserved as a fixed rectangle.

Natural routes are tried first, followed by full fixed-position spline routing
and safe natural-route simplification. When rounding introduces crossings, a
bounded repair tries moving or swapping crossing endpoints on those same axes.
At most two seeds and two repair passes share a cap of 160 proposals, further
reduced by node × edge count. No reference file, node name, role or tint is read.

A published grid must have zero overlaps and unrelated-card hits, preserve both
original crossing ceilings and the preferred aspect band, reduce occupied area
by at least 2%, and never increase occupied diagonal. Center distance may grow
by at most 5% when footprint improves; both accepted examples instead shorten
substantially. Among safe grids, smaller occupied area wins, then shorter links.
Temporary repair candidates never bypass the final safety gates.

If both-axis compaction fails, a column-only fallback preserves the composed
rows and rounds every x coordinate onto the same 204 px lattice. Three phase
shifts supply bounded alternatives. Actual geometry checks try retained native
control offsets and full rerouting; a single repair round can move crossing
endpoints by one or two columns along their existing row. Both searches share
one attempt counter, with a separately capped reserve of at most 80 additional
proposals scaled by node × edge count (at most 240 combined). A fallback must cut
column count by at least 40%, use at most twice the rounded-up square root of
node count, retain 54 px card clearance, and preserve both crossing ceilings
and shape. The explicit alignment tradeoff permits at most 3% extra area and
occupied diagonal and 5% extra center distance. Unsafe attempts retain the
previous safe layout.

| Section | Before → after columns / rows | Before → after occupied area | Before → after center distance | Before → after crossings (ordinary / incident) |
| --- | --- | ---: | ---: | --- |
| Incident response | 11 / 16 → 6 / 10 | 3,564,432 → 1,310,305 | 11,802 → 8,777 | 0 / 4 → 0 / 1 |
| Regional billing | 18 / 23 → 7 / 10 | 5,289,154 → 1,494,912 | 17,271 → 10,796 | 11 / 2 → 10 / 2 |
| Freight operations | 25 / 15 → 8 / 15 | 2,576,157 → 2,597,612 | 13,403 → 13,795 | 1 / 0 → 1 / 0 |
| Data platform | 30 / 17 → 9 / 17 | 3,142,495 → 3,104,098 | 14,625 → 15,016 | 2 / 0 → 2 / 0 |

Column and row counts use distinct node-center coordinates. All four outputs
now use regular graph-wide columns with at least 54 px card clearance. Freight
and data retain their useful composed rows. Freight's column alignment costs
0.8% area and 2.9% center distance; data saves 1.2% area for 2.7% extra center
distance. The six approved small outputs remain byte-identical.

Retained native-curve counts are 3, 11, 7 and 11 respectively, with automatic
attachments throughout. Removing all retained controls at the new incident and
billing positions produces one and seven unrelated-card hits respectively;
these curves are required for the accepted placement. All four outputs were
visually inspected in the rendered viewer. Billing's top dense mesh still has
crossed arrows: its ten ordinary crossings exceed the separate human reference's
seven, even though its area and link distance are smaller. The reference remains
read-only and does not participate in generation.

## Direction-free terminal folding

Arrow direction does not constrain final placement. The existing downward-flow
small searches remain reproducible initial candidates; unresolved small layouts
also run the same folded/grid searches without forward penalties or upward-edge
rejection, accepting fully natural alternatives only when they improve actual
geometry. Graphviz's top-to-bottom ranks likewise supply a starting placement,
not an acceptance rule.

After the shared-axis pass, a bounded search on ungrouped 21–48-node graphs
finds terminal corridors using unique undirected neighbors. Corridors of two to
four nodes can start in any free existing grid cell and continue up, down, left
or right. This permits a terminal chain to fill space above its fixed branch
anchor. All coordinates reuse existing columns and rows. The search checks at
most 12,000 cheap proposals per pass and 64 fully routed proposals total, scaled
down by node × edge count, across two passes. Per-pass allocation leaves room
for a second corridor to use space released by the first.

Every accepted fold preserves zero overlaps/card hits, at least 54 px card
clearance, both crossing counts and the preferred aspect band. Occupied diagonal
cannot grow; center distance is bounded by 3% over the original pre-fold layout.
The allowance stays anchored to that original layout across both passes, so a
short intermediate result does not exclude a safer, smaller final arrangement.

At this intermediate stage, incident's recovery/postmortem/knowledge/archive tail points upward in the
left column, while its source corridor fills an existing top row. This removes
three rows: 6 columns × 10 rows becomes 6 × 7, occupied height 1088 → 749, and
area 1,310,305 → 902,059 (31.2% smaller). Center distance rises from 8,777 to
8,973 (2.23%), with ordinary/incident crossings unchanged at 0/1. The shared-axis
table above describes the preceding stage. Billing, freight and data retain
their preceding arrangements byte-identically because no direction-free fold
passed all improvement and safety gates. All six small baselines remain exact.

## Connected motif geometry

A final topology-only search can translate a weakly attached connected block
and rotate its terminal corridor together. It detects components separated by
one or two links, treats terminal paths as movable local motifs, and protects
source fans and block hubs from later individual-node moves. A short input
corridor can share a horizontal row beside its hub; a separate terminal input
uses the side opposite the hub's outgoing connections. Connected row/column
pairs can also move together, relocating one obstructing card into a nearby
free slot when necessary. These are geometry operators, without graph IDs,
labels, tints, reference files or target coordinates in their conditions.

Private intermediate candidates may make room before another move improves
routing. Published results always have zero overlaps/unrelated-card hits,
at least 54 px clearance, automatic ports, no increase in either crossing
count, the preferred aspect band (with the bounded local exception below), and
populated contiguous shared columns. Nodes with two neighbors cannot be pushed farther outside their
neighbors' bounding box merely to widen the picture. Up to 3% extra occupied
area requires at least 2% shorter links. Larger area trades, capped at 50%,
require a strict crossing reduction and at least 5% shorter links.

Six rounds share at most 144 routed proposals; deterministic work scaling
reduces the budget with node-count squared × edge count. Each round constructs
at most 4,000 cheap proposals from at most 24 connected blocks. At most 24
finishing proposals try actual outer-branch positions with row pitches of
116, 104 or 98 px; 32 further proposals revisit nearby free slots using sampled
route length. Those budgets scale down by the same graph-size rule. Both
stages retain the card-clearance floor and re-score actual viewer curves.
Natural paths are preferred, with native curves retained only as required for
safe automatic routing. Graphs above 48 nodes or 80 edges skip this pass.

| Section | Before → after columns / rows | Before → after occupied area | Before → after center distance | Before → after crossings (ordinary / incident) |
| --- | --- | ---: | ---: | --- |
| Incident response | 6 / 7 → 5 / 10 | 902,059 → 926,301 | 8,973 → 6,938 | 0 / 1 → 0 / 0 |
| Regional billing | 7 / 10 → 6 / 10 | 1,494,912 → 1,083,420 | 10,796 → 9,780 | 10 / 2 → 10 / 0 |
| Freight operations | unchanged | unchanged | unchanged | 1 / 0 → 1 / 0 |
| Data platform | unchanged | unchanged | unchanged | 2 / 0 → 2 / 0 |

Incident trades 2.69% extra area for 22.69% shorter links and no intersections.
Total sampled route length falls from 6,887 to 4,853 px (29.5%); center
distance and routed length remain separate measurements. Its source chain sits beside the input hub, the separate input is above it,
and the terminal chain shares a bottom row below the response block. The two
middle linked pairs align with neighboring columns; the connector and vendor
use the available interior slots. Billing removes its two incident crossings
and 27.53% of its area while shortening links by 9.41%. Freight/data remain
byte-identical, and all six approved small outputs remain exact.

### Local branch refinement

Final polishing includes adjacent diagonal grid cells for branching nodes.
A topology-only penalty measures center rays less than 30 degrees apart at a
shared hub; it favors separating near-parallel branches. This is a placement
proxy, not a claim of curve clearance. Every shortlisted position is rerouted
and checked with actual sampled viewer paths. The existing 32-proposal budget
is unchanged; up to six passes can consume checks left over by short queues.
No additional global search is added.

A preferred card silhouette may give up exactly one populated global column.
Its card width may shrink by no more than one column pitch, and its shortfall
from square must fit within that same pitch; card height cannot grow. The
landscape limit remains 16:9. This uses card bounds rather than a fixed aspect
cutoff influenced by incidental route bows. The trade also requires at least
15% less pre-polish occupied area, at least 2% shorter center distance, and
strictly shorter sampled routes. Neither occupied width nor
height may increase. Both crossing counts, card
clearance and the shared grid remain protected. For equal crossing counts, fan separation may trade at most 1% sampled route
length per move; sampled routes cannot exceed the pre-polish total. Proposal
selection permits at most 1.5% extra center distance. This prevents
keeping a remote branch solely to fill out a square silhouette.

For incident response this moves the outer two-link branch inward, puts the
three-link connector diagonally into the free slot below its incoming hub,
and lowers the side feedback hub to share the connector's row. These match the
three requested relative moves without using names or target coordinates.

| Metric | Before local refinement | After |
| --- | ---: | ---: |
| Shared columns / rows | 5 / 10 | 4 / 10 |
| Occupied width × height | 1000.3 × 926 | 796.3 × 926 |
| Occupied area | 926,301 | 737,397 (−20.39%) |
| Center distance | 6,937.55 | 6,540.66 (−5.72%) |
| Sampled route length | 4,853.42 | 4,510.15 (−7.07%) |
| Ordinary / incident crossings | 0 / 0 | 0 / 0 |
| Retained native curves | 5 | 3 |

Minimum card clearance is 54 px. Billing, freight and data remain byte-identical
to the preceding stage, as do all six approved small baselines. The lower
response core is still a K4 mesh; its skipping and feedback edges need bowed
paths around intervening cards. Zero intersections does not guarantee generous
separation between nearby parallel curves.

All seven nonempty subsets of the three retained incident controls were tested
against actual viewer paths. Naturalizing Incident command → Remediation runner
or Vendor escalation → Recovery checks crosses the retained Recovery checks →
Incident command path. Naturalizing that recovery feedback hits the Remediation
runner card. Every subset therefore adds a crossing or card hit; three stored
curves remain necessary. Shared automatic endpoints still occur at input and
join cards, with their paths diverging after the port. No fixed ports or label
offsets are stored.

Real ungrouped 80-node/144-edge ladder and layered stress graphs completed in
2.92 s and 7.74 s respectively, with zero overlaps and unrelated-card hits.
The full 80-node/160-edge layered regression completed in 9.29 s with the same
safety checks after adding the final global-lattice pass (which skips graphs
above its 48-node bound).
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

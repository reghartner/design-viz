# Auto-arrange shape baselines

This fixed graph set compares auto-arranged output with a human placement
target. The fictional systems have architectural connections, no playback
steps and no authored route hints. The three larger cases include a legacy
monolith, direct coupling and back edges so they are less tidy than pure DAGs.

- Open [the auto-arranged page](auto-arranged.spec.json) in the workbench with
  **Open file**. Each numbered section is a separate diagram. Drag cards and
  curve handles to show the layout you want, then **Save** the edited JSON.
- [Graph input](graph-input.spec.json) has the same nodes, color categories and edges with
  neutral row placement. Re-run Auto arrange to compare algorithm changes.
  Keep section IDs, node IDs and edge endpoints stable in the human target.
- Run `node examples/auto-arrange-baselines/generate.cjs` from the repository
  root to regenerate the saved result and print metrics. The script uses
  `autoArrangeCandidates` and `autoArrangeDiagram`, exactly as the workbench
  does, and validates both specs. No output position or route is hand-authored.

| Section | Nodes | Edges | Shape | Crossings | Occupied width × height | Ratio |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| 01 Webhook delivery | 6 | 5 | 3+3 snake, second row reversed | 0 | 720 × 328 | 2.20 |
| 02 Document approval | 9 | 10 | Three-way fork and join, terminal sink tucked beside its parent | 0 | 1284 × 804 | 1.60 |
| 03 Telemetry pipeline | 13 | 17 | Three signal lanes, legacy observability, bypass and configuration feedback | 0 | 1275 × 804 | 1.59 |
| 04 Order fulfillment | 16 | 20 | Deep spine, legacy commerce, reservation retry and manual order updates | 0 | 1005 × 834 | 1.21 |
| 05 Media platform | 20 | 24 | Five node colors without group boxes, legacy publishing, direct catalog write and upload retry | 0 | 1290 × 992 | 1.30 |
| 06 Subscription matrix | 6 | 9 | Complete 3-by-3 bipartite graph (K₃,₃) | 1 | 729 × 504 | 1.45 |

All saved layouts have zero overlapping cards or groups and zero routes through
unrelated cards according to `autoArrangeScore`. Dimensions enclose cards,
groups and sampled routes, excluding labels and the viewer's minimum canvas
width. The simple chain balances its rows within the four-card limit and
alternates reading direction, using 285-unit horizontal and 284-unit vertical center spacing rather than
adding empty space to reach a screen ratio. Its 2.20 ratio is intentional.
The five other layouts fall between square and 16:9 landscape.

The approval layout preserves its fork and join positions, moving only the
terminal Archive card beside Publisher. Small ungrouped diagrams (at most
12 nodes and 24 edges) get at most one such refinement after structural layout
selection. It must preserve card clearance and pass rerouting, collision and
crossing checks; occupied diagonal then takes precedence over edge length
when crossings and shape tie. The telemetry and fulfillment cases also receive the bounded alignment pass
described below; the ungrouped media example receives local grid alignment.

Sections 01–05 retain zero-crossing layouts even with the added coupling.
Section 06 is intentionally nonplanar: each of three event streams connects to
each of three consumers, so at least one crossing is unavoidable. The bounded
search finds one crossing pair in this fixture, reaching that lower bound.

All saved edges use automatic attachments, with no `fromPort` or `toPort`.
All six cases use natural automatic curves throughout, with no saved curve
controls. Automatic
routes use the viewer's avoidance and have no saved label nudges. Moving cards
updates their routes and attachment sides; retained native curves remain
editable. Length tie-breaking uses straight center-to-center distances;
drawn routes still determine collision, crossing and occupied-bounds checks.

Telemetry uses four columns spaced 375 units apart and six rows spaced 152
units apart. Logs and Alerts share the router's row; logs storage, traces,
metrics and metrics storage share the next row. These assignments come from
a deterministic grid search using topology and shared viewer geometry. The
manual reference supplied only the intended shape; no IDs or coordinates from
that file are special-cased. Fulfillment uses four 285-unit columns and six 158-unit rows. Its source chain
folds across the first row, followed by checkout/cart and the parallel payment,
risk and inventory branches. Order, Events and Warehouse share the fourth row;
Carrier, Notify, Analytics and Ops share the fifth; Mail occupies the sixth.
Warehouse/Carrier and Notify/Mail stay in their respective columns. Both
diagrams have zero overlaps, card hits and crossings, and all their connections
use natural curves.

Fulfillment's compact candidate reduces straight connection length from 6069
to 4176 and occupied geometry from 1206 × 972 to 1005 × 834. Compared with the
partial manual reference, the three processing branches run in the opposite
column order and Carrier sits below Warehouse. This alternative needs no
native route controls; the compact reference-style branch ordering needs a
shaped lookup curve. Neither semantic node names nor reference coordinates
participate in candidate generation.

Media platform uses node colors instead of group membership or enclosing boxes.
Its 20 nodes and 24 connections retain their identities, titles, icons and labels.
The pastel skin displays the five supported tint categories as follows:

| Former group | Category | Node tint | Color |
| --- | --- | --- | --- |
| sources | Sources | `dev` | Green |
| ingest | Ingestion | `cmd` | Blue |
| process | Processing | `auth` | Amber |
| data | Output stores | `data` | Purple |
| delivery | Delivery | `mqtt` | Pink |

The media grid occupies 1290 × 992 with 7,945 units of center-to-center
connection length. It has five columns spaced 285 units apart and seven
rows spaced 158 units apart, including an empty row for route clearance. The
three processing branches and their stores each share a row. Near publication,
one delivery sink shares its row and three are below it, reducing the number
of curves leaving the same side. This layout has zero ordinary crossings and
zero intersections between curves sharing a source or destination, beyond
their common endpoint. All 24 edges use natural curves.

The local alignment pass prioritizes fewer shared centers and regular gaps, checks
safety before accepting a grid, and keeps source/sink positions in that grid.
Only recognizable ranked, ungrouped diagrams with at most 24 nodes and 48
edges enter the bounded search. A second bounded search can fold a deep single-source
unary entrance and swap nodes across a smaller grid; it is limited to 20 nodes
and 32 edges, 240,000 cheap geometry estimates, and four fully checked finalists.
The single-source folding pass leaves the multi-source telemetry and media
diagrams unchanged, along with cases 01, 02 and 06. An expanded footprint is accepted only for improved
alignment within the footprint guards, never merely to reach a screen ratio.

Shape preference never overrides collision safety or fewer crossing pairs.
Graphviz's target-ratio candidates can add whitespace, and labels, symmetry,
alignment and the overall silhouette still need human judgment. These files
are algorithm output for that comparison, not manually polished target layouts.

A final optional grid search runs only when the selected layout still has
crossings or native curve controls. It lets all nodes move, including sources
and sinks, while strongly preferring the selected layout's forward flow and
shared branch ranks. This is a soft preference: feedback and an occasional
local forward edge can point upward when that clears the fan-out. At most 20 nodes and 32
edges enter 12 deterministic runs of 20,000 cell moves, followed by at most four
full viewer checks. Cached automatic curves use a coarse crossing estimate
during search; the final safety check uses full sampled geometry and automatic
avoidance. A candidate must have no overlaps or card hits, no added ordinary or incident crossings,
no worse shape or occupied diagonal, and shorter center distances. This pass
changes only canonical winners 05 and 06 here; winners 01–04 remain unchanged before final spacing expansion. The
matrix winner remains unchanged before final spacing expansion; its published geometry is 729 × 504 with 3,258 units of center distance.
The search uses topology and previous layout geometry, never node names,
titles, tints, section IDs, or reference positions. It skips larger stress graphs.

The incident-crossing metric also inspects curves sharing a source or
destination, because they can weave beyond a common automatic attachment.
The former media proposal had three such crossings despite scoring zero
ordinary crossings; the current output and latest human target both have zero.
The grid search penalizes both kinds. This pass deliberately preserves the
approved cases 01–04; it does not reopen an already natural layout solely for
incident crossings, so case 04 retains its two existing incident crossings.

Incident crossings use the same sampled-path test as ordinary crossings. A
proper intersection requires the segments to pass across each other, so a
shared endpoint alone is excluded. Collinear shared segments and near-parallel
bundling are not counted by this metric. The clearer fan trades some local
flow order and a longer upload-to-metadata connection along the left side for
fewer crowded routes around publication.

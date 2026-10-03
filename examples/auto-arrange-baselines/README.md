# Auto-arrange shape baselines

This fixed graph set compares auto-arranged output with a human placement
target. The fictional systems have architectural connections, no playback
steps and no authored route hints. The three larger cases include a legacy
monolith, direct coupling and back edges so they are less tidy than pure DAGs.

- Open [the auto-arranged page](auto-arranged.spec.json) in the workbench with
  **Open file**. Each numbered section is a separate diagram. Drag cards and
  curve handles to show the layout you want, then **Save** the edited JSON.
- [Graph input](graph-input.spec.json) has the same nodes, groups and edges with
  neutral row placement. Re-run Auto arrange to compare algorithm changes.
  Keep section IDs, node IDs and edge endpoints stable in the human target.
- Run `node examples/auto-arrange-baselines/generate.cjs` from the repository
  root to regenerate the saved result and print metrics. The script uses
  `autoArrangeCandidates` and `autoArrangeDiagram`, exactly as the workbench
  does, and validates both specs. No output position or route is hand-authored.

| Section | Nodes | Edges | Shape | Crossings | Occupied width × height | Ratio |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| 01 Webhook delivery | 6 | 5 | 3+3 snake, second row reversed | 0 | 558 × 248 | 2.25 |
| 02 Document approval | 9 | 10 | Three-way fork and join, terminal sink tucked beside its parent | 0 | 962 × 624 | 1.54 |
| 03 Telemetry pipeline | 13 | 17 | Three signal lanes, legacy observability, bypass and configuration feedback | 0 | 870 × 624 | 1.39 |
| 04 Order fulfillment | 16 | 20 | Deep spine, legacy commerce, reservation retry and manual order updates | 0 | 1206 × 972 | 1.24 |
| 05 Media platform | 20 | 24 | Five groups, legacy publishing, direct catalog write and upload retry | 0 | 1307 × 1162 | 1.12 |
| 06 Subscription matrix | 6 | 9 | Complete 3-by-3 bipartite graph (K₃,₃) | 3 | 667 × 511 | 1.31 |

All saved layouts have zero overlapping cards or groups and zero routes through
unrelated cards according to `autoArrangeScore`. Dimensions enclose cards,
groups and sampled routes, excluding labels and the viewer's minimum canvas
width. The simple chain balances its rows within the four-card limit and
alternates reading direction, using equal 204-unit center spacing rather than
adding empty space to reach a screen ratio. Its 2.25 ratio is intentional.
The five other layouts fall between square and 16:9 landscape.

The approval layout preserves its fork and join positions, moving only the
terminal Archive card beside Publisher. Small ungrouped diagrams (at most
12 nodes and 24 edges) get at most one such refinement after structural layout
selection. It must preserve card clearance and pass rerouting, collision and
crossing checks; occupied diagonal then takes precedence over edge length
when crossings and shape tie. The telemetry and fulfillment cases also receive the bounded alignment pass
described below; the grouped media example retains its geometry.

Sections 01–05 retain zero-crossing layouts even with the added coupling.
Section 06 is intentionally nonplanar: each of three event streams connects to
each of three consumers, so at least one crossing is unavoidable. The bounded
search currently finds three crossing pairs; it does not promise the optimum.

All saved edges use automatic attachments, with no `fromPort` or `toPort`.
Cases 01–04 and 06 use natural automatic curves throughout; case 05 retains
three native curves. Removing any retained
curve would cause an unrelated-card hit or increase crossings. Automatic
routes use the viewer's avoidance and have no saved label nudges. Moving cards
updates their routes and attachment sides; retained native curves remain
editable. Length tie-breaking uses straight center-to-center distances;
drawn routes still determine collision, crossing and occupied-bounds checks.

Telemetry uses four columns spaced 240 units apart and six rows spaced 116
units apart. Logs and Alerts share the router's row; logs storage, traces,
metrics and metrics storage share the next row. These assignments come from
a deterministic grid search using topology and shared viewer geometry. The
manual reference supplied only the intended shape; no IDs or coordinates from
that file are special-cased. Fulfillment uses five 264-unit columns and nine
116-unit rows, with an unused internal row removed. Both have zero overlaps,
card hits and crossings, and all their connections use natural curves.

The alignment pass prioritizes fewer shared centers and regular gaps, checks
safety before accepting a grid, and keeps source/sink positions in that grid.
Only recognizable ranked, ungrouped diagrams with at most 24 nodes and 48
edges enter the bounded search. The grouped and nonplanar examples retain
their prior placement. An expanded footprint is accepted only for improved
alignment within the footprint guards, never merely to reach a screen ratio.

Shape preference never overrides collision safety or fewer crossing pairs.
Graphviz's target-ratio candidates can add whitespace, and labels, symmetry,
alignment and the overall silhouette still need human judgment. These files
are algorithm output for that comparison, not manually polished target layouts.

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
| 03 Telemetry pipeline | 13 | 17 | Three signal lanes, legacy observability, bypass and configuration feedback | 0 | 746 × 624 | 1.20 |
| 04 Order fulfillment | 16 | 20 | Deep spine, legacy commerce, reservation retry and manual order updates | 0 | 1411 × 1088 | 1.30 |
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
when crossings and shape tie. The three larger systems retain their existing
shape preference and geometry.

Sections 01–05 retain zero-crossing layouts even with the added coupling.
Section 06 is intentionally nonplanar: each of three event streams connects to
each of three consumers, so at least one crossing is unavoidable. The bounded
search currently finds three crossing pairs; it does not promise the optimum.

All saved edges use automatic attachments, with no `fromPort` or `toPort`.
Cases 01, 02 and 06 use natural automatic curves throughout. Cases 03 and 04
retain one native curve each; case 05 retains three. Removing any retained
curve would cause an unrelated-card hit or increase crossings. Automatic
routes use the viewer's avoidance and have no saved label nudges. Moving cards
updates their routes and attachment sides; retained native curves remain
editable. Node positions and footprint metrics are unchanged by this route
simplification. Length tie-breaking uses straight center-to-center distances;
drawn routes still determine collision, crossing and occupied-bounds checks.

Shape preference never overrides collision safety or fewer crossing pairs.
Graphviz's target-ratio candidates can add whitespace, and labels, symmetry,
alignment and the overall silhouette still need human judgment. These files
are algorithm output for that comparison, not manually polished target layouts.

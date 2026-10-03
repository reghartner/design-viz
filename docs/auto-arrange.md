# Auto arrange

The workbench's **Auto arrange** button acts on the active diagram. Its dialog
warns that placement and edge settings will be replaced. Cancel leaves the
source untouched. Successful arrangement is one Undo entry; drag cards and
curve handles afterward to refine it. The diagram canvas fits the result;
this changes the current viewport, not saved camera settings.

Groups, nesting, node definitions, connection order and identity, labels,
steps, paths, panels, named views and other sections are preserved. Rows and
floats become ordinary positioned floats. Old routing, ports, bends, curve
points and label nudges are discarded. Connections use the viewer's natural
automatic curves and label placement wherever safe. Only necessary native
cubic routes and their computed label nudges are retained. Arranged edges
never save `fromPort` or `toPort`; shared geometry updates their attachment
sides when nodes move. Only diagrams with retained curves need the
`layout.cubic-curves` capability.

Directed chains, including grouped chains, use at most four cards per row and reverse each
successive row, so a six-card chain reads left to right across three cards, then
right to left across three. Chains of up to 12 cards use 204 logical units
between centers in both directions; they do not add empty space to reach a
screen aspect ratio. Longer chains balance rows toward a 3:2 occupied
footprint without reducing the minimum card gap, and also expand
column spacing once minimum row clearance determines their height. Detection follows edge
topology rather than node or edge declaration order. Cycles, forks and disconnected graphs use the
general candidate search. The snake is accepted only after collision and route
checks, including every resulting group box. A snake that would overlap groups
is rejected and the clustered search remains available.

Grouped graphs compare global clustered Graphviz dot candidates in top to
bottom and left to right directions. Graphs with at most 24 nodes and 48 edges also
try both directions with a 3:2 target footprint. Larger or denser graphs keep
the ordinary candidate budget so extra routing and scoring do not exhaust the
worker deadline. The target candidates expand spacing on the short axis and reroute the native
splines; they do not compress cards. Ungrouped graphs also compare two
deterministic WebCola stress layouts with Graphviz nop2 spline routing.
External Graphviz labels preserve the graph's ranks while leaving room for
labels. Candidate generation keeps at least 48 logical units between final card
rectangles; layered ranks receive additional clearance for their connections.

Candidate scoring uses final viewer geometry, including automatic avoidance, attachments
and nested group boxes: reject overlapping cards/groups and routes through unrelated cards,
then minimize nonincident crossing pairs. Disjoint route bounding boxes skip
segment intersection checks, keeping disconnected graphs inexpensive to score.
Among candidates with equal crossing counts, prefer an occupied footprint
from square through 16:9 landscape. All
ratios inside that range are equally preferred; ratios outside it are ranked
by logarithmic distance to the nearest limit. Total straight-line, center-to-center
edge distance and occupied area break ties. Each edge contributes its Euclidean endpoint distance, including parallel
edges; self edges contribute zero. Curve arc length does not affect this score.
Sampled curves still determine card hits, crossings and occupied bounds.
The footprint encloses cards, groups and sampled routes,
excluding the viewer's minimum-width canvas and label boxes.

After choosing the structural layout, ungrouped diagrams with at most 12 nodes
and 24 edges may receive one local compaction attempt. A terminal sink with
exactly one incident edge can move beside its neighbor if the new position
shrinks the card footprint and keeps the card gap. The rest of the selected
layout stays in place, preserving the spacing of forks and joins. The candidate
is rerouted and must pass the same card/group and route safety checks. It
compares crossings first, then shape, then occupied diagonal
(`hypot(width, height)`) before edge distance for this local comparison. Blocked or unsafe tucks leave the structural layout
unchanged. Larger or denser diagrams receive no extra attempt.

After structural selection and any leaf refinement, routing starts with an
all-automatic candidate. If it clears unrelated cards and does not increase
nonincident crossings, all native controls are removed. Otherwise, automatic
routes replace native routes individually in edge order whenever that change
clears cards and stays within the chosen layout's crossing count. The pass
repeats until no further individual replacement is safe. Every retained curve
therefore prevents a card hit or an increase beyond that crossing budget.
Automatic edges have no saved controls or label nudges; retained curves stay
editable. This step preserves all node positions.

Checks use the viewer's shared automatic avoidance, so a safe automatic bow
can avoid a card without saved controls. Path samples and native/automatic
crossing pairs are cached; each pair has at most four combinations. The final
layout receives one full score after selection, rather than one per edge.
No additional Graphviz routing is needed for this step.

Long chains prioritize the four-card row limit and minimum clearance when those
constraints prevent the target footprint.

The bounded search does not promise an optimal, crossing-free or in-range
result. In particular, fewer crossings win even when that requires a less
compact shape, and target spacing can introduce whitespace. There are at most
eight attempts for small diagrams (a snake, six general candidates and one
local leaf refinement). Successful snakes return immediately. Above
24 nodes or 48 edges, there are at most five attempts (a snake plus two layered
and, for ungrouped graphs, two stress candidates); grouped graphs use only
the two layered attempts plus a snake attempt when they form a directed path. The supported limit remains 80 nodes and 160 edges
per diagram. A worker has a 20-second deadline and is terminated on
cancellation, source changes, section changes, project retirement or builder
teardown. Failure never changes
the source. Freshness is checked again before the atomic session transaction.
Positions and any retained native paths are stored in the spec, so opening or
exporting never reruns Graphviz or WebCola. Moving nodes updates natural routes
and deforms retained curves through the shared viewer geometry.

## Distribution and maintenance

The workbench embeds Viz.js 3.31.0 (1,329,882 bytes) and WebCola 3.4.0
(79,814 bytes), plus shared geometry and worker code. They are initialized only
when needed, in a Blob worker. Offline/file workbenches require no CDN or npm.
A host CSP must permit `worker-src blob:` and WebAssembly compilation in the
worker; a blocked worker reports an error and leaves the spec unchanged.
Viewers, backend packages and standalone exports contain no layout engines.

`src/source-bundles.json` inventories worker sources and notices;
`tools/source-loader.cjs` embeds them with HTML-safe string escaping. Every
workbench includes MIT notices for Viz.js, WebCola and Expat, and Graphviz's
EPL-2.0 license plus its corresponding source/build URLs. The vendored bundle
and notices are pinned in `src/workbench/vendor/manifest.json`.

Run `python3 tools/vendor-auto-arrange.py` to verify the committed checksums.
`--refresh` downloads integrity-checked, pinned npm archives and reimports the
same browser bundles; normal builds are network-free. Build with
`python3 tools/build.py`. Never commit its ignored generated HTML/runtime files.

`tests/auto-arrange.test.js` includes the approved 20-node/36-edge/6-group
fixture: at most ten nonincident crossing pairs, no node/group overlap and no route
through an unrelated card. Browser contracts inspect the actual SVG, native
control and card dragging, cancellation, one Undo/Redo, reload and export.

## Shape baselines

`examples/auto-arrange-baselines/graph-input.spec.json` contains six importable
comparison diagrams: a chain, a fork/join, three larger systems with legacy
monoliths and direct/back couplings, and a deliberately nonplanar K₃,₃.
Run `node examples/auto-arrange-baselines/generate.cjs` to reproduce
`auto-arranged.spec.json` using the production algorithm and print occupied
geometry/crossing metrics. The focused tests verify these outputs exactly,
including the compact 3+3 snake, a terminal-leaf tuck that preserves its fork,
semantic preservation and collision safety. The short chain deliberately
exceeds 16:9; the five remaining baselines stay between square and 16:9.

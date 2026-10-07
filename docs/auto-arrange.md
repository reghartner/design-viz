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

After every search and refinement pass chooses its winner, Auto arrange expands
that placement without changing its relative geometry. It applies one affine
scale per screen axis about the top-left node center. A regular occupied-line
pitch is reused when every interval is a whole multiple; otherwise calibration
uses the normal 204-unit horizontal and 98-unit vertical pitch. The published
pitch leaves 2.5 times the former horizontal rectangle gap and 1.5 times the
former vertical gap. Shared rows, shared columns, empty grid slots, symmetry and
node ordering are therefore preserved. Regular whitespace wider than three
normal gaps is treated as aspect padding or empty lattice space and uses the
normal pitch for calibration, so the expansion does not magnify an existing
landscape-balancing margin. Existing native curve offsets scale with
the same axes, then the normal route simplifier removes any controls it can.
Fixed-position `nop2` routing is only a fallback and cannot move the expanded
nodes. Both routes must preserve the winner's overlap, card-hit, ordinary-crossing
and shared-endpoint-crossing ceilings; attachments remain automatic.

After choosing the structural layout, ungrouped diagrams with at most 12 nodes
and 24 edges may receive one local compaction attempt. A terminal sink with
exactly one incident edge can move beside its neighbor if the new position
shrinks the card footprint and keeps the card gap. The rest of the selected
layout stays in place, preserving the spacing of forks and joins. The candidate
is rerouted and must pass the same card/group and route safety checks. It
compares crossings first, then shape, then occupied diagonal
(`hypot(width, height)`) before edge distance for this local comparison. Blocked or unsafe tucks leave the structural layout
unchanged. Larger or denser diagrams receive no extra attempt.

Ranked ungrouped diagrams with at most 24 nodes and 48 edges also receive a
bounded alignment pass when nearby card centers use scattered coordinates.
It merges nearby centers into rows and columns, infers consistent gaps from
the existing spacing, and searches nearby empty grid cells. Sources and sinks
keep their grid positions while intermediate cards can share rows despite
having different graph depths. Empty grid lines are closed, so occupied rows
and columns have equal gaps. The objective checks card/group overlap, unrelated
card hits and crossings first, then balances straight connection distance with
a penalty for diagonal connections. This supports staggered processing/storage
rows without hardcoded node identities or preserved Graphviz ranks.

An aligned result must use no more distinct row/column centers and keep the
chosen layout's crossing budget. Its occupied diagonal may grow by at most
25%. A layout already within square–16:9 stays in that range unless the new
layout uses at least 10% less area and no greater diagonal. Alignment can
therefore add room for a cleaner grid, but never expands a graph just to meet
an aspect ratio. A safe automatic grid needs no additional routing. Otherwise,
one native routing attempt must pass the same safety and footprint checks;
failure preserves the original layout. Grouped layouts and force layouts
without recognizable ranks retain their placement.

The search runs at most eight passes and 900 geometry evaluations, with the
evaluation cap reduced by the product of node and edge counts. Diagrams above
24 nodes or 48 edges receive no alignment work. This keeps the 80-node worker
budget unchanged.

Deep ungrouped graphs can receive a second compact-grid candidate after
alignment. This pass requires 8–20 nodes, at most 32 edges, one source, and a
unary entrance of at least three cards that fits across the grid. It only runs
when the existing rank count exceeds the compact grid by at least two rows.
The entrance folds left to right across the first row; the remaining nodes
can swap cells on a regular grid with 204-unit columns and 120-unit rows.
The grid has `ceil(sqrt(nodeCount))` columns and room for roughly one empty
cell per two cards. Forward connections retain their downstream order, and
parallel two-hop fork/join branches share a processing row. Feedback edges
remain free to travel upward.

Twelve deterministic seeded searches each try 20,000 cell moves or swaps.
Cached straight-segment/card and segment-pair geometry provides the cheap
search objective; it also penalizes diagonal connections and reversed forward
links. These estimates never authorize the final layout. At most four
finalists receive the full viewer score, with native rerouting only when the
automatic candidate is unsafe. Acceptance requires no overlaps or unrelated
card hits, no crossing increase, shorter total center distance, no greater
occupied diagonal, and the existing aspect guard. Failed or unsafe routing
preserves the selected layout. The normal natural-route simplifier then removes
any unnecessary native controls. Small, already compact, multi-source, grouped
and larger diagrams keep their prior behavior.

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
thirteen routing attempts for small diagrams (a snake, six general candidates,
one local leaf refinement, one optional aligned-grid reroute and up to four
compact-grid finalists). Successful snakes return immediately. Above
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

## Headless authoring

Write semantic nodes, edges, panels and steps, then run one command:

```sh
node tools/arrange-spec.cjs --section 0 draft.spec.json arranged.spec.json
```

The command arranges nodes and measures native panels and step captions before
packing them into a 24-column Standard layout. No placeholder rectangles are
needed. Use `rows:[[]]` and unpositioned floats for a new graph. Existing geometry
is protected; `--rearrange` is only for an explicitly requested rearrangement.
Repeat `--section` for each new diagram in a mixed page; use `--all` only when all
are new. A one-diagram input needs no selector. Input/output must be different
files (including symlinks and hard links). All selected diagrams must succeed
before one atomic output write; errors preserve both files.

**One-time setup** (checkout or downloaded authoring kit):

```sh
node tools/arrange/setup.cjs
```

This explicitly installs locked `playwright-core` 1.63.0 and its pinned Chromium
headless shell. Arrangement never downloads dependencies or falls back to an
ambient browser. Builds package the native renderer, styles, icons and fonts;
a source-free kit does not need `src/`, a running Workbench, or browser tools.
In a checkout, setup also generates both required runtimes from current sources;
rerun setup after renderer source changes. Source-free kits keep their bundled runtimes.
The command reports measurements, not visual QA or a Workbench button click.

`--width` is the host viewport width (800–1920 pixels; default 1200).
`--profile default|backstage|confluence` selects the arrangement profile.
The page skin is used, defaulting to pastel when absent. Every native path/step
and ambient state is measured; zero-step diagrams get no detached controls.
The generic solver uses panel-owned sizing contracts, measured content, graph
bounds and narrative depth. It packs small panels together and places controls
near relevant evidence. It is a deterministic heuristic, not a learned model.
Final checks reopen the native default camera without capture-only zoom/fit.
The arranger saves a measured `diagram.graphFrame` around complete graph content,
including groups, routes, labels and step decorations. This framing survives
reopening and exports; unmarked diagrams keep the legacy drawing area. The
sizing target is 10px graph labels and the hard admission floor is 8px, matching
the reviewed experiments. Difficult graphs can still fail with a precise error.
Framing is shared graph geometry like node positions; explicitly rearranging a
diagram may change graph framing in sibling profiles, whose tile arrays remain
unchanged.
Controls may require scrolling in a tall document; diagnostics report their
position in an isolated section’s initial 1000px viewport, not the absolute
scroll position of a section within a multi-section document. Native scrollable panel content
remains scrollable. Hidden clipping or unreadable graph labels fails explicitly.

The initial adapter supports Standard diagrams with at most 24 panels, 100 steps
and 20 paths (at most 200 rendered path/step states). Selected named views, Explore, explicitly attached controls,
legacy 12-column sibling profiles, external media assets and content that cannot
fit the bounded geometry are unsupported with an actionable error. Embed media
as data URLs, or preserve the existing diagram. Unselected sections and their
views remain unchanged. Existing explicit 24-column sibling profiles are
preserved; graph positions remain shared across profiles. The tool changes
arrangement geometry while preserving semantic content, state and declarations.
It also refreshes system-owned compatibility metadata through the standard
stamping helper, retaining prior requirements; a bare diagram is wrapped in a
page so older hosts can read its required capabilities. Malformed compatibility
metadata fails before any write.
Native fitting stops after at most eight passes rather than emitting partial
or clipped output. This does not add a new Workbench action.

The old `tools/auto-arrange-spec.cjs` remains available for graph-only API/CLI
compatibility. The authoring workflow above uses `arrange-spec.cjs` exclusively.

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
aligned telemetry and fulfillment grids, semantic preservation and collision
safety. The short chain deliberately
exceeds 16:9; the five remaining baselines stay between square and 16:9.

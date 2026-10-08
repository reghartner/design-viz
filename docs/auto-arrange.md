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
node tools/compose-page-layout.cjs --section 0 draft.spec.json arranged.spec.json
```

The command composes the complete page diagram: nodes, panels and step controls
in a 24-column Standard layout. Write semantic content, `rows:[[]]` and
unpositioned floats; do not author placeholder panel rectangles. Existing
geometry is protected; use `--rearrange` only for an explicitly requested
rearrangement. Repeat `--section` for selected new diagrams in a mixed page.
Input/output must be distinct files, including symlinks and hard links. All
selected diagrams must succeed before one atomic output write. Validate and
state-walk the result, then submit the full spec for paired Workbench preview.

**No setup, browser, npm install or browser download is needed.** The command
runs directly with Node in a source checkout or an exported authoring kit.
The checkout compiles trusted repository sources in memory; the kit includes
the backend and panel layout descriptors statically. Browser tests are only a
development check, never part of the authoring command.

`--width` selects an estimated host viewport (800–1920px, default 1200).
`--profile default|backstage|confluence` selects the arrangement profile.
The solver retains the reviewed packing and control-placement heuristics; it is
not a statistically learned model. Panel-owned size/aspect contracts are combined
with deterministic type-specific content and text-wrap estimates. The real
path/state folders supply ambient and every path step, including inherited and
transient state. Controls reserve the longest wrapped caption at each candidate width, transport
and chip rows, and the native shared-path track geometry. Track sizing uses the
same pure path graph and row packer as the viewer.
Small indicators can share rows; content-dense tables, logs and reports receive
larger widths/heights. Native scrollable content retains a bounded viewport,
reported separately from its estimated full content height. Camera estimates
include the video aspect ratio and separate audio direction, status, caption,
source and reason rows. Phone notification cards keep their native three-card
and two-line limits; allocating a larger tile cannot reveal clamped text or
enlarge the fixed 178px frame. Device-app portraits fit both body dimensions up
to a native 330px cap. Diagnostics expose these internal limits separately from
tile fit; they are not readability guarantees.

**Sizes are estimates, not pixel verification or visual QA.** Font metrics,
responsive chrome, embedded media and complex widgets can differ from these
conservative models. Diagnostics identify estimated dimensions and scrolling.
The saved `graphFrame` uses pure node/group/routing bounds with conservative
label/step-marker allowances. Graph height follows the native width-scaled SVG aspect ratio at each candidate
width, with a conservative legend/chrome allowance. An over-height width
candidate is skipped without discarding narrower candidates. The model targets
10px graph labels with an 8px
estimated floor; it does not claim a measured native minimum. Controls may
require scrolling; their reported position is an estimated isolated section,
not the section's position in a complete document. `--width` models an isolated
host with 80px total horizontal inset and the native 1000px minimum design grid;
the enclosing document's skin width cap, embed overrides, nested padding and
later host resizing can change the rendered width. It does not apply a global
document cap, because standalone and embedded hosts can override one. Review the rendered result
when a visual review is available.

### Repairing a rendered layout

The composed layout is the starting point. If the user supplies the host
viewport, pass it with `--width`; otherwise keep the default rather than
inventing a presentation width. A later report of clipping or unreadable
content authorizes a scoped repair to the candidate, including affected tile
sizes. Preserve semantics and unrelated sections. Use `--rearrange` only when
the requested repair needs structural node placement, and limit it to the
selected section.

Use the rendered preview, or the user's specific preview feedback when the
agent has no browser, to diagnose the constraint before changing geometry:

- Changing the host width can change the graph's rendered height while saved
  grid-row heights remain fixed.
- A camera or other aspect-ratio panel needs height for both its media and
  status chrome.
- Enlarging a tile does not enlarge a phone or other widget whose interior has
  its own maximum width. Keep a bounded repair to geometry and composition, or
  make the important evidence readable elsewhere in the existing composition.
  Changing the panel type requires support from the source or request and the
  full paired authoring workflow.

Treat calculated sizes as estimates. Do not present guessed pixels as visual
verification, copy dimensions from a benchmark fixture, or ask the user to
finish a repair that can be made and reviewed through the candidate workflow.

Supported scope is Standard diagrams with at most 24 panels, 100 steps and
20 paths (200 path/step states). Selected named views, Explore, attached controls,
legacy 12-column sibling profiles and content beyond bounded geometry fail with
an error. Image sizing reads embedded raster dimensions without fetching URLs.
Unknown panel types fail; registered extensions use their size contract plus a
conservative content fallback. Unselected sections remain unchanged. Explicit
24-column sibling tile arrays remain unchanged; node positions and framing are
shared graph geometry across profiles. Semantic content/state/declaration order
are preserved. Only system-owned compatibility metadata is refreshed, retaining
prior requirements; bare diagrams become a page wrapper. Errors write nothing.

For graph-only tasks, the lighter `tools/auto-arrange-spec.cjs` remains unchanged.
The complete authoring workflow uses `compose-page-layout.cjs`.

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

# Automatic graph arrangement

Workbench **Auto arrange** replaces the active diagram's node positions and
connection geometry in one Undo action. The same deterministic arranger runs
in the graph CLI, page composer, backend and exported authoring kit.

It reads topology and card dimensions, starts with graph-distance stress, then
searches a lattice with four seeded restarts. Each restart uses
`min(64000, max(16000, 1300 × nodeCount))` annealing iterations, bounding
the work for larger graphs. Candidate selection balances
neighbor distance, shared axes, footprint and connection crossings. A cubic
router selects ports and routes around cards, using channel detours when
needed. There is no prescribed global flow direction or fixed row shape.
Cycles, disconnected components, self-loops and parallel/reverse edges are
supported. Identical topology, identifiers and options produce the same result;
node/edge serialization order does not change placement (parallel edges keep
their original ordering).

Groups are placement constraints. The arranger recursively places each group's
members and nested groups, then places those containers with the same search.
Native container padding and title strips separate siblings and unrelated
cards. Existing group IDs, membership, parent links and empty-group metadata
are preserved. Invalid parent links receive the same tolerance as the viewer.
Routes may cross group boundaries; the native 20px group title strips are
routing obstacles. Edge labels and step markers are not router obstacles. Nested or dense grouped graphs can use considerably more space.

The result uses `rows:[[]]`, positioned `floats`, explicit `fromPort`/`toPort`,
editable native `curveControls`, and a new `graphFrame`. Old bends, through
points, endpoint/label nudges and lane routing are replaced. Semantic node and
edge data, IDs, edge order, groups, steps, paths, panels, named views and other
sections are preserved. Existing float metadata also survives. Graph geometry
is shared by named views; Auto arrange does not repack panel rectangles.

Drag cards or curve handles to refine the result, or use the inspector's
position/port controls. The selected ports stay pinned when moving cards;
choose automatic attachment or Reset curve when appropriate. Undo restores the
complete previous source, including its previous frame and routes.

The public limit is **80 nodes and 160 connections per diagram**. The worker
has a **20-second deadline**; a timeout, blocked local worker, invalid result or
routing failure leaves the source unchanged. Cancel, source edits, a section
switch, project replacement and editor teardown retire pending calculations.
The workbench commits only to the exact source/project/section that started it.
Large graphs can reach the deadline on slower hardware; split a complex story
into meaningful diagram sections if it cannot finish. The CLI uses the same
bounded search without the UI deadline.

Arrangement is a starting point for visual review. It does not guarantee zero
crossings, optimal compactness, label clearance or readability at every zoom.
Card avoidance uses sampled curves. Labels, step markers, group titles and
panel content need rendered inspection; shorten labels or make scoped manual
position, route and label refinements where needed. Do not turn a particular
reference layout into a mandatory shape for other topology.

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
and chip rows, the separate mode strip, and the native shared-path track geometry.
Code evidence links and runtime condition chips reserve their own
wrapping rows using their visible labels; URLs and code anchors do not count as
caption prose. Track sizing uses the same pure path graph and row packer as the viewer.
Small indicators can share rows; content-dense tables, logs and reports receive
larger widths/heights. Native scrollable content retains a bounded viewport,
reported separately from its estimated full content height. Camera estimates
include the video aspect ratio and separate audio direction, status, caption,
source and reason rows. Phone notification cards keep their native three-card
and two-line limits; allocating a larger tile cannot reveal clamped text or
enlarge the 220px native frame. Device-app portraits fit both body dimensions up
to a native 330px cap. Automatic composition reserves that native content width
plus estimated panel padding, using a panel-owned composition hint. Manual small
tiles remain supported. This can make the page taller or move neighboring tiles;
it does not consolidate cards, reveal clamped text, or remove internal scrolling.
Diagnostics report estimated logical/rendered frame width, host scale, and
metadata/detail font sizes. At narrow hosts the entire design grid still scales
down, so a full logical frame does not guarantee native physical text size.
Document padding and embed overrides can change these estimates. Diagnostics
expose these internal limits separately from tile fit; they are not readability guarantees.

`diagrams[].warnings` reports supported concerns as spec-derived estimates:
graph labels below the 10 CSS px target, panel text below the 8 CSS px estimated
floor, and step controls below the isolated section's estimated 1000 CSS px
initial viewport. Each warning names its target, actual estimate, threshold,
units, and a scoped remedy. These records still require rendered review. A
controls warning means normal page scrolling may be needed; it does not claim
clipping. Native font roles warn only when their content is visible in at least
one reachable folded state. Hidden tiles, hidden or empty fields, and intentionally
bounded panel scrolling do not warn. An empty warning list is not visual approval.

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
later host resizing can change the rendered width. Diagnostics report the single
target width: composing at 1200px does not establish fit when rendered at 1440px.
Native Auto scales the graph with available width, while saved tile row heights
stay fixed; it does not automatically fit the saved tile height. Recompose for
the actual host width or inspect and repair the saved layout after resizing.
The viewer’s separate Fit diagram action fits both viewport dimensions. The
composer does not apply a global document cap, because standalone and embedded
hosts can override one. Review the rendered result when a visual review is available.

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

For graph-only tasks, use the lighter `tools/auto-arrange-spec.cjs`. Both CLIs
compile the current shared arranger sources in a checkout, ignoring generated
build artifacts, and use the bundled backend in an exported authoring kit.
The complete authoring workflow uses `compose-page-layout.cjs`.

## Distribution and validation

The production implementation lives in `src/core/arrange/`: placement, routing,
topology orchestration and recursive group placement. The adapter in
`src/workbench/auto-arrange-core.js` serves the embedded worker and backend.
`src/source-bundles.json` declares these same sources for every runtime;
`tools/source-loader.cjs` embeds the worker with HTML-safe escaping.
The workbench needs permission for Blob workers (`worker-src blob:`), with no
WebAssembly, external engine, network request or runtime package installation.
Standalone viewers only render saved geometry and do not run arrangement.

Build with `python3 tools/build.py`; generated HTML/runtime files stay ignored.
Run the Node arrangement/CLI/composer suites and the built-workbench browser
contracts in `tools/browser-tests/tests/auto-arrange.spec.mjs`. The approved
reference fingerprints in `tests/fixtures/arrange-approved.json` record the
historical revision and source hashes used for exact geometry parity.
Native geometry checks cover cards, group containment, header space and routes;
browser contracts cover real worker output, edit handles, cancel, stale jobs,
Undo/Redo, reload/export and deadline behavior.

Development capture and independent geometry audit helpers live in
`tools/arrange-validation/`. They require the repository browser-test tooling
for captures; ordinary authoring does not. Existing example generator commands
use the current shared production arranger. Committed example captures may
represent the historical revision identified in their own documentation.

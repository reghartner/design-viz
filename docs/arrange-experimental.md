# Experimental graph arranger

This is an independent, offline arrangement experiment. Its core consumes graph
connections and rectangular card dimensions. It produces new positions and native
cubic routes, without consuming authored positions or reference geometry. It does
not change the workbench's production arranger or its defaults.

## Run

Node 18 or newer is required. Arrangement and tests have no package dependencies.
From the repository root:

```sh
node tools/arrange-experimental/cli.cjs input.spec.json output.spec.json --report report.json
node --test tests/arrange-experimental.test.js
node tools/arrange-experimental/audit.cjs output.spec.json
```

The CLI accepts `--seed`, `--restarts`, and `--iterations`. It writes a complete
arranged JSON spec and prints a JSON metrics array to stderr. `--report` also
writes those metrics to a file. Output paths' parent directories must exist.
Errors produce a nonzero exit status. Input, output, and report must be distinct
files; in-place output is rejected. Before any write, the CLI checks resolved
paths, existing symlinks/hard links, and real parent paths for new destinations.
New destinations differing only by case or Unicode normalization are rejected
conservatively. A rejected collision leaves existing files unchanged and creates
neither destination. No external executable or service is used.

A batch runner accepts a directory of files ending in `.spec.json`:

```sh
node tools/arrange-experimental/benchmark.cjs input-directory output-directory
node tools/arrange-experimental/audit.cjs output-directory
```

`benchmark.json` includes the Node version, platform, architecture, and per-graph
in-process runtimes. The supplied `render.cjs` uses the actual native renderer and
the repository's Playwright installation. With the browser-test dependencies and
Chromium already installed, it renders the first `page.blocks` diagram into the
same 1200 by 840 CSS-pixel comparison frame used during this experiment:

```sh
node tools/arrange-experimental/render.cjs output.spec.json output.png "Experimental" "Native renderer"
```

It writes a PNG plus `.capture.json` with measured card bounds and throws if cards
are clipped. The renderer is an optional verification tool; the arranger itself
does not import the viewer, source loader, browser, or any existing arranger.

## API and data contract

```js
const { arrangeGraph, arrangeDiagram, arrangeSpec } =
  require('./tools/arrange-experimental/index.cjs');

const layout = arrangeGraph({
  nodes: [
    { id: 'a', width: 150, height: 44 },
    { id: 'b', width: 210, height: 70 },
  ],
  edges: [{ from: 'a', to: 'b' }],
});
// layout.positions: [{ id, x, y, width, height }], where x/y are centers
// layout.edges: [{ fromPort, toPort, curveControls }], in input edge order
// layout.frame: { x, y, w, h }
// layout.metrics: objective, route measurements, restart, and timings

const { diagram, metrics } = arrangeDiagram(rawDiagram);
const { spec, reports } = arrangeSpec(rawSpec);
```

Inputs are not mutated. `arrangeGraph` ignores extra node/edge properties,
including positions. It requires unique nonempty string node IDs, finite positive
card dimensions no greater than 2000, and valid edge endpoints. Dimensions default
to 150 by 44. The experiment accepts at most 200 nodes and 600 edges; those limits
are validation bounds, not an interactive performance guarantee.

The Flowview adapter uses 150 by 44 cards because the native viewer assigns those
dimensions to freely positioned floats. It retains the node dictionary, edge
array order, edge IDs/endpoints, labels, kinds, semantic metadata, panels, paths,
steps, and other document content. It replaces the following drawing state:

- `rows` becomes `[[]]`, and every node gets one positioned float.
- Float `id`, `side`, `x`, and `y` are set; `dx`, `dy`, and `noSpread` are removed.
  Unknown float metadata is carried over by node ID.
- Edge ports and cubic controls are regenerated. `curvePoints`, `bend`,
  `labelDx`, and `labelDy` are removed because they describe the old drawing.
- `graphFrame` is regenerated. Incompatible `routing: "lanes"` is removed.

`arrangeSpec` supports bare diagrams, bare pages, wrapped `page` documents,
`blocks` or legacy `sections`, and each tab's `sections`. It follows the native
viewer's preference for `blocks` when both collections exist. It deliberately
does not traverse arbitrary metadata, embedded examples, or node details.

The synchronous options are:

| Option | Default | Meaning |
| --- | --- | --- |
| `seed` | 71 | Deterministic 32-bit random seed |
| `restarts` | 4 | Independent lattice searches, 1–12 |
| `iterations` | max(16000, node count × 1300) | Proposals per restart |
| `aspectRatio` | 1.45 | Soft preference for physical width/height |
| `columnGap` | 76 | Space beyond the largest card width |
| `rowGap` | 88 | Space beyond the largest card height |

Node IDs provide stable ordering and tie breaking. Node declaration order and
edge order do not affect ordinary distinct-edge arrangements. Parallel edges
retain their input order for assigning distinct ports. Relabeling IDs can change
tie breaks. Timings vary; geometry is deterministic for identical inputs/options
on the tested runtime. Repeatedly arranging the returned drawing produces the
same geometry.

## Design

The aesthetic references were 15 actual-renderer images of Chuck's manual
arrangements, spanning 11 topologies. The four Media images are successive
revisions, and the two Incident images are different revisions of one graph.
Those revisions were treated as history, not independent training examples.
All 15 images were inspected. Their useful common properties were local aligned
sequences, nearby related cards, generous gaps, and folds that keep a long flow
within a readable frame. No reference coordinates, graph-specific rules, trained
weights, or reference lookup appear in the implementation.

`placement.cjs` begins with undirected shortest-path distances and a directed DFS
order. The DFS identifies feedback edges; it does not reverse or remove any
output edge. Graph-distance stress relaxation supplies starting coordinates, with
a small depth bias that orients the graph. Four independently seeded starts use
slightly different lattice widths. Greedy assignment places high-degree nodes
first into distinct lattice cells.

A deterministic simulated-annealing search moves a node to a nearby/free cell or
swaps two occupied cells. The lattice guarantees card separation. Its energy
charges for connection length, nonaxial connections, upward forward edges,
straight-line crossings, and straight-line intersections with other cards. It
rewards straight degree-two sequences and penalizes an unnecessarily large or
poorly proportioned bounding rectangle. Upward and sideways edges remain legal;
there is no global rank constraint. The search has no access to titles, icons,
groups, protocols, or saved geometry.

For reproducibility, the placement energy is explicit in `score`: each link costs
`1.7d + 0.32d²`; a diagonal adds `1.25 + 0.25 min(|dx|, |dy|)`; upward nonfeedback
links add `1.4 min(3, -dy)`. Each straight card obstruction costs 22 and each
proper straight crossing costs 13. An axial degree-two node gets a 1.1 credit.
The footprint costs `0.42wh + 1.4n log((w × strideRatio / h) / aspectRatio)²`.
Distances here use lattice units. These are independently chosen engineering
weights, not a fitted model of the reference coordinates.

Only energy terms affected by a move are recomputed. A focused test compares
move/swap deltas against complete energy recomputation. This removed most runtime
without changing the objective.

`routing.cjs` generates center-port cubic candidates, then horizontal/vertical
channel detours with rounded corners. If every candidate intersects a card, an
independent A* search finds a path on the expanded card-boundary grid. It charges
for bends and uses direction as part of the state. Native cubic controls are
stored relative to the endpoint centers, following Flowview's serialization
contract. Self-loops consider all corners; parallel and reverse edge pairs get
different port offsets.

Three coordinate-descent passes choose routes against the other chosen curves.
Card intrusion dominates route cost; length, crossings, bends, and shared axial
stretches also count. Each placement restart is actually routed before selection:
its final score adds 13 per sampled curve crossing, shared axial length/22, and
100000 per sampled card intrusion to its placement energy. This prevents a good
straight-line score alone from choosing a poor curved drawing.

The reusable implementation is split into `index.cjs` (validation and adaptation),
`placement.cjs` (topology and search), and `routing.cjs` (curves and detours).
`cli.cjs`, `benchmark.cjs`, `audit.cjs`, and `render.cjs` are small operational tools.

## Verification and observed results

On 2026-10-12, all 25 focused tests passed. They cover mutation/identity/metadata
preservation, independence from saved geometry and presentation, deterministic
ordering, native curve decoding, mixed card dimensions, cycles, self-loops,
parallel edges, disconnected/empty graphs, malformed input, incremental energy,
native document traversal, the CLI round trip, and 13 CLI collision regressions.
The collision cases assert nonzero exit, unchanged existing bytes, and no new
output/report for direct aliases, relative paths, case/Unicode variants, file and
directory symlinks, dangling symlinks, and hard links. The CLI fix does not change
placement, routing, or the benchmark geometry reported below.

The final 13-graph benchmark below ran on Node v26.0.0, Darwin x64, using the default
options. Runtime is the measured in-process arrangement time, excluding file I/O
and rendering. These are single-run observations, not percentile claims.

| Graph | Nodes | Edges | Runtime (ms) | Sampled curve crossings |
| --- | ---: | ---: | ---: | ---: |
| Webhook delivery | 6 | 5 | 101 | 0 |
| Document approval | 9 | 10 | 310 | 0 |
| Telemetry pipeline | 13 | 17 | 410 | 0 |
| Order fulfillment | 16 | 20 | 603 | 0 |
| Equipment lending | 18 | 23 | 880 | 0 |
| Media platform | 20 | 24 | 884 | 2 |
| Incident response | 24 | 33 | 1505 | 0 |
| Signage distribution | 26 | 33 | 1507 | 0 |
| Regional billing | 32 | 48 | 2814 | 8 |
| Research compute federation | 34 | 46 | 2857 | 7 |
| Freight operations | 40 | 50 | 3433 | 3 |
| Data platform | 48 | 60 | 5261 | 3 |
| Subscription matrix | 6 | 9 | 202 | 1 |

Total arrangement time was 20.8 seconds. Every graph had zero detected card
intrusions. The independent audit decoded the serialized native controls and
sampled each cubic at 501 points: it found zero card overlaps, zero curve entry
into card interiors, and zero routes outside their saved frames. The native
browser capture found zero clipped cards. All 13 final PNGs were visually
inspected; numeric route scores alone were not used as visual verification.

The renders show usable compact local chains and branch clusters. Incident and
Telemetry have especially clear local connectivity. Media, Freight, and the two
dense platform graphs still need visual judgment: some long detours and close
parallel curves remain. Regional billing has approximately 56 layout units of
charged shared axial route length even after the overlap penalty. The experiment
does not claim to reproduce the manual arrangements or surpass another arranger.

## Limitations

- The method is a bounded heuristic. It cannot guarantee an optimal planar
  embedding, minimum crossings, or one consistent reading direction.
- Curves are sampled for collision and crossing costs; these counts are not
  exact algebraic proofs. The independent native audit uses a different, denser
  sampler. Short shared endpoint stretches are intentionally tolerated.
- Node/edge labels, group boundaries/titles, and other decorations are not search
  obstacles. Their semantic data is retained, but group membership is not a
  placement constraint. The native adapter keeps its normal fixed card size.
- The largest supplied input has 48 nodes. Larger/dense graphs are bounded by the
  API limit but are not performance-qualified. The synchronous API is suitable
  for the CLI experiment, not direct use on a UI thread.
- The search starts anew after topology changes; incremental visual stability is
  not provided. Custom dimensions belong to `arrangeGraph`; the Flowview adapter
  intentionally uses the renderer's fixed float-card geometry.
- The optional screenshot utility targets the first `page.blocks` diagram in a
  supplied extract, while arrangement and audit support whole documents.

Generated evidence belongs in `tools/arrange-experimental/artifacts/`, which is
ignored by Git. The implementation imports no reference packet, old heuristic,
production arranger, vendor layout engine, or previous evaluation.

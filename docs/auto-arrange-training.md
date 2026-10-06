# Offline arranger preference experiment

For Standard panel placement comparisons, see [Panel placement preference rounds](panel-placement-training.md). The shared review server selects panel labels only when `reviewMode` is `panel-layout`; node rounds retain Tie.


This tool evaluates four recorded human A/B choices and fits a small constrained
pairwise model. It does not change the production arranger or install weights in
any shipped runtime. The corpus is preference evidence, not a set of optimal
coordinates. Generated layouts and the separate unlabeled probes are never
training labels.

## Run

No npm installation, network access, browser, Graphviz service or external data
folder is required for the normal evaluation:

```sh
node --test tests/auto-arrange-training.test.js
node tools/arrange-training/run.cjs --output /tmp/arrange-evaluation
```

Load another **trusted repository checkout** explicitly to test a pending engine:

```sh
node tools/arrange-training/run.cjs \
  --engine-root /path/to/trusted/design-viz \
  --output /tmp/arrange-experiment \
  --arrange tests/fixtures/auto-arrange-training/round2-input.spec.json
ARRANGE_ENGINE_ROOT=/path/to/trusted/design-viz \
  node --test tests/auto-arrange-training.test.js
```

`--engine-root` executes trusted source through this repository's source loader;
it is not a sandbox for an arbitrary checkout. The report records the engine Git
commit, tracked dirty flag, source bundle digest, physical source hashes, loader
hash, trainer/core hashes and Node version. A dirty or unversioned checkout can
be measured, but its bundle digest must be preserved to reproduce it. The first
frozen comparison used pending PR #346's commit
`6fa9616245a02e7abdb85d1ffacf8762537a2f5a`; the ordinary main checkout remains a
valid default. The pending engine is not vendored or merged by this tool.

`--arrange` separately invokes the production arranger in a fresh subprocess for
each supplied diagram block, with a 30-second hard deadline. It then applies the
bounded contraction experiment. It writes `experiment-before.spec.json`,
`experiment-after.spec.json`, and `training-report.json`. Before means a fresh
production arrangement of the supplied topology; it is not the human winner.
Failed blocks retain their original input in both specs and have an explicit
`arranger-failed` record. Do not display those unchanged raw blocks as successful
arranger output. The report includes per-stage runtime and baseline failure.
Experiments on unlabeled inputs measure safety and structural utility only.

## Portable evidence

`tests/fixtures/auto-arrange-training/corpus.json` selects an exact block from
each frozen candidate source. Every candidate and human evidence record has a
SHA-256 digest. Loading verifies those bytes, displayed choice, graph identity,
source agent mapping, declared block ID, node IDs/group membership, group tree,
and directed edge multiset (including parallel edge multiplicity). The same node
and edge topology must appear in A and B. Historical absolute paths remain in the
original evidence JSON as inert provenance; evaluation only opens checked-in
relative files.

| Graph | Displayed choice | Selected source |
| --- | --- | --- |
| Equipment lending, 18 nodes | B | Agent b |
| Signage distribution, 26 nodes | B | Agent a (presentation rotated) |
| Research compute federation, 34 nodes | A | Agent a |
| Media platform, 20 nodes | A | Topology candidate |

The first three labels preserve the exact user message `B b a`; the older media
label preserves `I favor A`. Media's original combined files include other graph
blocks only to make the original file hashes independently verifiable. Only the
declared 20-node media block enters evaluation or training. The synthetic UI
verification choice export is absent from this corpus.

## Measurement and safety

The loader uses the engine's actual `layout`, automatic edge adjustments,
avoidance, lane routing when applicable, `edgePath`, and `samplePathD` functions.
Only topology and geometry fields are passed into measurement; labels, titles,
icons, tint and human labels cannot become features. Node IDs are lookup keys,
not numeric or textual model inputs.

Measurement keeps separate card/group overlaps, paths hitting unrelated cards,
ordinary crossing edge pairs, and crossing pairs that share an endpoint. Nested
group containment is allowed. Crossing detection uses strict intersections of
sampled segments, so tangencies/coincident runs are not counted and this is not
an exact continuous-curve proof. A crossing pair is counted once even if its
paths intersect multiple times. Positions and sampled paths must be finite and
within ten million logical units; the engine's 80-node/160-edge limit applies.
Manual route settings (ports, bends, offsets, or curve controls) are counted
separately. Rendered path length is a diagnostic, never the edge-distance cost.

The reported learned choice excludes candidates with any overlap or unrelated
card hit. If neither candidate is safe, the choice is `neither-safe`. Raw geometry
margins remain visible for analysis. Crossings are reported separately; they are
not added to the preference loss. The transformation additionally rejects every
new ordinary or shared-endpoint crossing pair, even if total crossings decrease.
It requires minimum card clearance of at least the smaller of the baseline's
clearance and the loaded engine's normal `AUTO_ARRANGE_CARD_GAP` (54 units in the
first evaluated versions).

## Fixed feature definitions

All features are costs (lower is better), independent of labels and direction of
flow. Let `u = hypot(150,44)`, the standard card diagonal. Footprint includes card
rectangles, group rectangles and sampled viewer paths, excluding canvas margins.

| Feature | Definition |
| --- | --- |
| `crowDistance` | Mean straight-line distance between connected card centers, divided by `u`; self-edge contributes zero |
| `footprint` | `log(1 + occupied area / (node count × 150 × 44))` |
| `neighborhoodSpan` | Mean bounding-box diagonal of each node plus its directly adjacent nodes, divided by `u` |
| `axisWaste` | Fraction of edges whose endpoints share neither exact x nor exact y (tolerance 1e-6) |
| `elongation` | `max(0, abs(log(width/height)) - log(3))`; either orientation within 3:1 is unpenalized |

There is no fixed 16:9 target, downward-flow term, route-length substitution,
fixture-specific score branch, or stored preferred coordinates in the algorithm.
Corpus coordinate files are immutable evaluation examples. The wide aspect
range is a predeclared soft feature, not an acceptance rule. Reflection invariance
is tested on natural symmetric synthetic paths; arbitrary manually authored
control points must themselves be reflected to retain their shape.

## Fitting and evaluation

For each training pair, form `loser features - winner features`. Each dimension
is divided by its fitting-pair RMS difference, floored at 0.1. Minimize mean
logistic pairwise loss plus `0.2 / 2 × sum(weight²)` using 1,200 deterministic
projected gradient steps of size 0.08, starting at zero; each weight is constrained
to `[0,4]`. Hyperparameters and features are fixed, without a search using
leave-one-out outcomes. All-zero pair differences fail explicitly; incompatible
nonnegative directions can return an explicit zero-weight status.

The report gives weights, scales, individual measurements, raw margins, learned
choices and current-engine choices. Positive human margin means the model assigns
lower cost to the chosen human candidate. Current-engine ranking calls its
`autoArrangeScore` and default `autoArrangeCompare` when available; older main
uses its documented crossings/engine-length/area comparator. This comparison is
of the engine's candidate ordering, not its complete later search/cleanup policy.
Its score can intentionally differ from the independent unchanged-viewer-path
measurement because the engine first rebuilds its candidate diagram.

Each leave-one-graph-out fold refits weights **and scales** on the other three
pairs. Fit IDs are recorded; a regression test alters both the held-out label and
features and checks that the corresponding fitted model is unchanged. Report
training fit and leave-one-out separately. Four labels underdetermine weights;
even four correct withheld predictions do not establish generalization, validate
each term causally, or justify deploying these weights. In particular, previous
human requests to expand a crowded graph caution against universal area
minimization. Crossing structure inside a dense graph cannot be summarized as a
universal shortest-edge or most-aligned objective.

## Bounded transformation

The initial experiment evaluates 12 global contractions: factors 0.94, 0.88,
0.80 and 0.70, each applied to x, y, or both around the original centroid. Every
exact shared row/column remains shared, and ordering is retained. Proposals
always start from the baseline, use automatic ports/natural routes and remove
manual routing controls. Original geometry is the fallback. Safety, clearance,
no-new-crossing-pair checks, and a strictly smaller learned cost are required.
Nodes, labels, edge order, steps, paths, panels and other nongeometric content
are preserved. This is a spacing experiment, not motif folding. Unchanged output
is valid; a lower learned score is not a new human preference judgment.

## Focused verification

The test file covers original evidence and the rotated signage label, hash and
topology failures, rename/metadata/translation/reflection invariance, crow-flies
vs drawn length, manual-route reporting, independent ordinary/incident crossings,
unrelated card hits and group overlaps, safe fallback, finite bounds, synthetic
contraction opportunity, clearance, content preservation, determinism, bounded
proposal count, invalid/untrainable fitting and held-out-label/feature isolation.
No generated synthetic example is labeled as a human preference.

## Click-to-submit comparison server

Run the dependency-free LAN server separately from the existing workbench:

```sh
python3 tools/arrange-training/serve.py \
  --dataset /path/to/comparison-dataset \
  --submissions /path/to/human-submissions \
  --host 0.0.0.0 --port 8770
```

Open `http://<this-computer-local-IP>:8770/` on desktop or phone. Choose A, B, Tie
(equally good), or Neither (both need work). Each graph has one radio group with
no default vote. Image clicks and Enlarge controls only open the diagram; they
never select a preference. Full-size zoom permits scrolling on a phone. Native keyboard focus and radio-group navigation remain available; there are no
global letter shortcuts that could vote on an offscreen graph.

The sticky bar shows selection count and whether choices are an **unsent local
draft** or **saved to the server**. Submit is a JSON POST followed by a durable
write; downloading a backup is separate and does not submit. Partial choices are
allowed. Local drafts survive reload on the same browser/origin. Moving to a
different device or using another hostname/IP has separate browser storage.
Network/server failures retain the draft and give a retry/backup message.

### Dataset manifest

Place `manifest.json` in the explicit dataset directory:

```json
{
  "version": 1,
  "datasetId": "arrange-round-3",
  "datasetVersion": "2026-10-05-v1",
  "title": "Round 3 layout comparisons",
  "pairs": [{
    "id": "pair-01", "title": "Example graph", "batch": 1,
    "nodeCount": 18, "edgeCount": 22,
    "A": {"id": "candidate-01-a", "sha256": "<64 lowercase hexadecimal characters>",
          "spec": "public/pair-01-a.spec.json", "png": "public/pair-01-a.png"},
    "B": {"id": "candidate-01-b", "sha256": "<64 lowercase hexadecimal characters>",
          "spec": "public/pair-01-b.spec.json", "png": "public/pair-01-b.png"}
  }]
}
```

Hashes refer to exact spec file bytes. Capture A and B with an equal canvas and
rendering scale; the page renders each image at equal card width. The manifest
can contain 1–36 ready pairs, with at most 12 per batch, so the first batch can
launch before later batches finish. IDs/version accept letters, digits, `_`,
`-`, and `.`; asset paths are relative and cannot escape the dataset. Only declared
PNG/spec assets are served. The server verifies hashes and freezes bytes at
startup. Restart after editing/extending the manifest. Every POST must match the
current manifest hash. After refresh, unchanged candidate mappings recover their
draft choices; altered mappings are cleared with a notice. Dataset-provided
strings are displayed as text, never executable markup.

### Durable evidence and revisions

Each accepted submission creates an immutable `submission-<UUID>.json` containing
`source: "human-comparison-ui"`, `datasetPurpose: "human-review"`, dataset ID/version,
manifest SHA-256, browser reviewer ID, server UTC timestamp, submission ID,
previous submission ID, revision number and the selected pair records. Every
pair record includes its displayed choice and both displayed candidate IDs/spec
hashes. Tie and Neither remain distinct labels. The server does not turn these
into A/B labels, retrain a model or wake an agent automatically.

A submission is a snapshot of that browser's currently selected choices, including
selections in other batches. Within the same dataset ID/version, manifest hash
and browser reviewer ID, use the greatest revision as the latest snapshot; earlier
records remain evidence and must not be counted as independent votes. Multiple
server processes are not intended to share a submission directory: filenames are
collision-safe, but revision ordering is defined by the one server's lock. After
a manifest grows, preserve prior records and use the newer manifest's matching
candidate identities when importing; do not blindly combine duplicate votes.
Browser reviewer IDs support revision linkage, not identity authentication.

Files are written to unique temporary files, flushed and fsynced, published with
an atomic non-overwriting hard link, and the directory is fsynced before success
is returned. A save that completed while its response was lost can be retried:
the prior evidence is preserved. The submission directory is never served.
Requests have a 128 KiB body bound and must use same-origin JSON POSTs; no wildcard
CORS is enabled. This is a local/LAN review tool, not an authenticated public
internet service.

Tests use manifest `datasetPurpose: "synthetic-test"`, which produces
`source: "synthetic-comparison-test"`, temporary dataset/submission directories,
and no live labels. Run:

```sh
python3 tests/auto-arrange-review-server.test.py
```

HTTP tests cover 36 pairs in three batches, page/assets, exact candidate
provenance, partial submissions, immutable revisions, Tie/Neither, stale and
malformed identities, traversal, origin/host checks, payload bounds, failed writes,
fsync failures and startup source-hash verification. Browser acceptance should
also select choices, reload to verify draft restoration, enlarge without voting,
submit and verify the saved receipt, then revise and verify prior evidence remains.

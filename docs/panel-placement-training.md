# Panel placement preference rounds

The offline panel corpus creates **48 fictional scenarios** with actual Flowview
panels: **36 review pairs in three batches of 12**, plus **12 held-out scenarios**.
Each batch mixes four first, four second and four third scenario variants, all
three host widths, and all three graph roles. It is a source of comparison inputs,
not human preference evidence. No algorithm has been fitted to these examples.

## Generate and review

Run from the repository root, after installing the locked browser tooling:

```sh
npm ci --prefix tools/browser-tests
npm exec --prefix tools/browser-tests -- playwright install chromium
node tools/panel-placement/generate.mjs --output .local/panel-placement/round-1 --seed round-1
python3 tools/arrange-training/serve.py \
  --dataset .local/panel-placement/round-1/review \
  --submissions .local/panel-placement/round-1/human-submissions \
  --port 8771
```

Open `http://127.0.0.1:8771`. Choose **A**, **B**, **Both acceptable**, or
**Neither acceptable**. Both says that both candidates are acceptable; Neither
says neither is acceptable. Neither label is converted to a preferred winner.
A reason is optional (500 characters maximum). Partial submissions are welcome.
Draft choices and reasons survive reload; each submit creates an immutable
revision. Clearing a previously submitted reason creates a changed draft.
Download backup preserves the current choices and reasons separately.

Generation refuses a populated output directory. For a new round, use a new
output directory **and seed**, preserving previous previews, manifests and
submissions. Human submissions must be outside the served review root. The
server creates that directory only when a person submits. Never use a real
human submission directory for automated tests.

`--limit N` produces a smoke dataset, not a complete round. Only the pinned
Playwright dependency and its Chromium are used; there is no ambient browser
fallback. Sources are loaded using `tools/source-loader.cjs`, without importing
or trusting stale generated HTML. Optional visual QA contact sheets require
Pillow:

```sh
python3 tools/panel-placement/montage.py .local/panel-placement/round-1
python3 tools/panel-placement/montage.py .local/panel-placement/round-1 \
  --ids residential-3,security-3,video-3,ingestion-3,api-3,health-3,capacity-3,warehouse-3,hardware-3,distributed-3,experience-3,overview-3
```

## Coverage

Every panel has a nonempty authored declaration and concrete example state.
Scenario goals describe an operational decision. Detailed rows, status checks,
logs, budget values, notifications and replica observations vary with the case.
Specialized scene renderers use their real fictional picker scenes with scenario
context. The reference image is a deterministic illustrated operations screen.

| Domain | Panel families | Review panel counts | Held-out panel count |
| --- | --- | --- | --- |
| Residential | homemap, screen, phone, battery, deviceapp, appscreens | 3, 5, 6 | 4 |
| Security | radar, security, dispatch, zoneframe | 3, 4, 6 | 5 |
| Video | screen, buffer, inflight, log | 2, 4, 7 | 6 |
| Ingestion | queue, replicas, table, checks | 2, 5, 8 | 4 |
| API | trace, waterfall, data-contract, timeline | 1, 4, 6 | 5 |
| Device health | thermo, signal, gauge, battery, leds | 1, 3, 7 | 4 |
| Capacity | cost, budget, gauge, table | 2, 3, 5 | 6 |
| Warehouse | homemap, state, tiles, dispatch | 2, 4, 6 | 7 |
| Hardware | xray, leds, signal, buffer | 1, 4, 8 | 3 |
| Distributed systems | orbit, inflight, replicas, timeline | 2, 5, 7 | 8 |
| Customer experience | appscreens, image, phone, deviceapp | 1, 3, 5 | 4 |
| Operations overview | checks, cost, table, state, tiles | 2, 4, 8 | 6 |

All **32 panel types** appear. Widths are **800, 1000 and 1440 CSS pixels**;
host targets are default, Backstage and Confluence. Diagram roles are dominant,
secondary and hidden. Four graph shapes contain 3, 6, 8 and 12 nodes. Existing
Viz/auto-arrange helpers produce frozen node coordinates and routes before
candidate creation; A/B always has the same graph geometry.

Candidate families include independent main/rail stacks, equal columns, a
summary-first composition, diagram with a rail, and full-width evidence stacks.
Portrait devices use narrow tiles. Odd column spans are deliberate. Single-panel
cases may compare width/height instead of grouping. The seeded shuffle hides
family names from the review UI. Methods remain in the private capture report.

## Identity, rendering and provenance

The only permitted A/B differences are `x`, `y`, `w`, `h` in the active
24-column Standard layout. Deep canonical comparison covers everything else:
panels and their order, labels, content, images, steps, controls attachment,
hidden flags, graph nodes/routes and named view. Each spec passes the production
validator. Every visible panel must actually render, have content and match its
expected ID. Rendered panel text must match between candidates. Geometry checks
reject overlap, noninteger/out-of-bounds rectangles and duplicate/missing tiles.

Captures use the actual native renderer, bundled fonts, the pastel skin,
fixed UTC date, reduced motion and disabled CSS transitions/animations. The
same checkpoint is rendered for both candidates. Each pair has equal pixel
width, scale and canvas height; shorter layouts receive blank canvas padding
below the document. The preview UI scales both images equally and offers full
size enlargement. Individual panel DOM/CSS is never stretched to hide clipping.
If a panel needs more height, its saved candidate rectangle grows and is packed
again before capture. Unresolved outer clipping and capture errors are fatal.
Repeated captures must settle to identical PNG hashes before publication.

`corpus.json`, `provenance.json` and `capture-report.json` stay outside the served
root. The report records nested scrolling/overflow for visual QA. The manifest
records spec/PNG SHA-256 hashes and semantic content hash. Renderer provenance
includes source, CSS, harness, generator, workbench/Viz digests, commit and dirty
state, browser/Node versions, DPR, locale, time, seed and corpus hash. Saved votes
bind the manifest digest and both candidate spec **and PNG** hashes. Server
startup freezes the exact verified bytes and independently checks semantic
identity, bounds, overlap, split, metadata and image dimensions.

Holdout specs and images live under `holdout/`, outside `review/`. They are absent
from the public manifest, and the server rejects holdout records. Inspecting
holdout captures for render failures is quality assurance; do not use preference
labels from them to tune candidates or fit the algorithm.

### Limits

These are frozen screenshots, not interactive host integration tests. A bounded
inner scroller, collapsed trace details or small labels can require enlargement;
not every possible interactive state is pictured. The native renderer receives
the target host profile but does not launch the full host application. Stock
scene artwork is illustrative, and the cases are not production telemetry.
Pixel hashes identify the exact delivered evidence; another OS/font rasterizer
may produce different hashes even with equivalent geometry. Keep the frozen
round alongside submissions.

## Validation and next iteration

```sh
node --test tests/panel-placement.test.js
python3 tests/test_panel_placement_review.py
python3 tests/auto-arrange-review-server.test.py
npm test --prefix tools/browser-tests -- \
  --config playwright.review.config.mjs panel-placement-review.spec.mjs
```

The browser tests create separate temporary `synthetic-test` datasets and test
Both/Neither, reasons, cleared reasons, drafts, backups and durable revisions at
390px and 1440px. Node-mode Tie behavior remains covered. Synthetic records use
`synthetic-comparison-test`, never `human-comparison`.

After genuine choices arrive, inspect acceptance and failure reasons by content
family, graph role, width and panel count. Preserve Both/Neither as acceptance
labels. Propose a scoring change from the review data, evaluate it on the sealed
12 scenarios, then create a fresh round with a new identity. Do not report a
preference improvement, winner or learned score before human evidence exists.

## Focused round two: sizing and step controls

Round two consumes the frozen round-one manifest, exact candidate specs/images,
and the submitted human feedback file. The initial feedback contains 12 choices
(five A/B preferences and seven Neither choices). The resulting size priors are
**provisional heuristics informed by those choices and notes**, not statistically
learned preferences. Round one and its 12 held-out cases remain unchanged.

```sh
node tools/panel-placement/generate-round-two.mjs \
  --round-one .local/panel-placement/round-1 \
  --feedback .local/panel-placement/round-1/human-submissions/submission-cfe6ea80-7f5d-4542-96d5-1ff853376864.json \
  --output .local/panel-placement/round-2 --seed round-2
python3 tools/arrange-training/serve.py \
  --dataset .local/panel-placement/round-2/review \
  --submissions .local/panel-placement/round-2/human-submissions \
  --port 8772
node --test tests/panel-placement-round-two.test.js tests/panel-placement.test.js
```

The new loader verifies the submission's manifest identity and candidate hashes,
then checks both original PNGs/specs and full semantic equality before using any
case. The new provenance includes the source manifest and real submission hashes
and the source candidate identity for each pair. It never writes to the source
round or creates new feedback. Tests use isolated synthetic protocol fixtures.

| Experiment | Cases | Held fixed within each A/B pair |
| --- | --- | --- |
| Panel sizing (six) | residential-3, overview-3, capacity-3, video-2, health-2, experience-2 | Control placement policy, all content and node positions |
| Step controls (six) | warehouse-1, hardware-2, ingestion-3, security-1, api-1, distributed-1 | Panel widths/heights, all content and node positions |

Compact state indicators start small. Actual row counts, verbose content and
measured native overflow override those priors. A two-dimensional packer fills
available gaps. The small video screen shares a row with the other compact video
panels. Narrow graphs use their **actual frozen node bounds**, rather than the
minimum-width SVG canvas, to identify a column suited to stacked neighboring
panels. Controls are a first-class band above or below the primary group, ahead
of secondary reports. Control attachments and hidden state stay unchanged.

### Honest viewport and readability measurements

Captures still use a **1000px full-page browser viewport**, including document
headings. The native Fit/Zoom controls and board scrolling frame frozen nodes
without rewriting node positions, edges or saved content. This is a deterministic
capture-time camera policy, **not authored camera state** in the exported specs.
The report records each candidate's camera width, scroll offsets, scale, node
rectangles and measured label size so that distinction stays explicit.

The capture gate requires every node to be contained, graph labels at least 8px,
real panels without unresolved outer overflow, and fully unclipped controls that
can be reached after scrolling. Labels of 10px or larger are preferred; smaller
native graph or panel secondary text is disclosed in readability notes. Frozen
800px host profiles can still produce small native secondary labels. Use the
full-size preview to inspect them; no font or panel CSS is stretched for capture.

Initial viewport visibility is a separate objective from structural validity.
Above-group controls must be in the initial viewport. The **warehouse under-group
alternative** is a measured exception: its readable 12-node diagram plus the
native document heading cannot fit with controls below the complete group within
1000px. Its actual control position and `inInitialViewport: false` are retained,
and the review page discloses the scrolling tradeoff. The alternative above-group
placement remains initially visible. This exception does not shrink labels or
change the meaning of the viewport budget.

`capture-report.json` records packing waste, unused panel height, control position,
clipping/overflow, readability notes and a diagnostic penalty. The penalty is not
a fitted model or a human preference probability. `viewport/*.png` shows the
actual first 1000px, with hashes in the report; these QA images are outside the
served review root. Full comparison PNG/spec hashes remain in the manifest.
The review page names the experiment axis while keeping candidate methods hidden.

## Round 3: panel sizing contracts

The third round uses the second round's 12 genuine choices: eight explicit
preferences, one **Both**, and three **Neither**. The three Neither cases remain
unaccepted. An A/B vote selects that exact round-two spec as the reference;
Both and Neither use A deterministically, with the original acceptance status
recorded privately. Both real submission files and their manifests/spec/PNG
identities are verified before generation. No votes are synthesized or converted
into training winners.

`PanelRegistry.layout.sectionSizing` is an opt-in sizing contract owned by each
panel module. It describes native CSS pixel min/preferred/max widths, whether a
body can grow, a body aspect or intrinsic/content height policy, and selectors
for measuring the actual body and ancillary content. It does not change the
current editor, presets, renderer, or saved geometry. The experimental solver
is its only consumer. Seventeen types declare contracts; the remaining types
use their existing `large` and `canvasSizing` capabilities with conservative
content-fit defaults. Actual row counts can increase a compact status panel's
width, and native render measurements determine its height.

The solver uses no scenario IDs, domain metadata, manually assigned coordinates,
or scenario dimension arrays. It considers graph-side and full-width groups,
compact packing of tall panels with shorter neighbors, and controls above or
below the primary group before secondary details. Flexible bodies share residual
row width up to their declared maxima; fixed-aspect bodies retain their width.
The deterministic diagnostic objective includes total height, unused grid cells,
aspect rounding waste, growth, control scroll distance and proximity to relevant
panels. Current-step panel patches indicate relevance when present; otherwise
compact primary evidence is the declared prominence heuristic. This is still an
experimental heuristic, not a statistically fitted preference probability.

A body aspect excludes title, borders and padding. Capture measures these
separately, uses the Device app's actual `.da-phone` bounds, and calculates Home
map SVG content bounds from `viewBox` and native `preserveAspectRatio` fitting.
This catches interior letterboxing that measuring the full outer SVG misses.
Ancillary audio/caption content is measured separately from aspect-fitted bodies.
Native measurements are cached by panel width, so wrapped content measured at one width cannot create a height cycle at another. Native content overflow adds monotone minimum constraints. Calibration stops
within eight iterations, and cycles or infeasible bounds produce an explicit
unsupported result. It never stretches DOM elements outside the saved tile.

```sh
node tools/panel-placement/generate-round-three.mjs \
  --round-one .local/panel-placement/round-1 \
  --round-two .local/panel-placement/round-2 \
  --feedback-one .local/panel-placement/round-1/human-submissions/submission-cfe6ea80-7f5d-4542-96d5-1ff853376864.json \
  --feedback-two .local/panel-placement/round-2/human-submissions/submission-8dff7ef0-9e37-4c97-9c35-a496b9696ff0.json \
  --output .local/panel-placement/round-3
python3 tools/panel-placement/montage.py .local/panel-placement/round-3
python3 tools/arrange-training/serve.py \
  --dataset .local/panel-placement/round-3/review \
  --submissions .local/panel-placement/round-3/human-submissions --port 8773
```

The generator refuses populated output directories. Public review contains only
the same 12 reviewed cases. The 12 frozen holdouts are processed separately into
private `holdout/` and `holdout-report.json`; unsupported cases stay explicit.
The review server cannot serve these files. Structural holdout checks do not
establish preference generalization. No placement button is shipped.

Each public pair keeps exactly the same frozen content, nodes, state, attachment
and visibility. The reference spec bytes are checked against round two. Native
Fit/Zoom/scroll is replayed using the same deterministic framing policy; reference
camera deltas are recorded. Camera state is capture-time state, not a saved spec
edit. Captures record actual body whitespace, overflow, label size, controls
reachability and their position in the original 1000px viewport. The screenshots
use explicit page-coordinate clips at (0,0), with equal pair dimensions; document
title text and bounds must match. Padding below a shorter candidate is intentional.
The old reference PNG may differ because the new pair's common canvas height is
different; hashes identify the exact new pixels. All node positions remain frozen.
Small native text and scrolling are reported rather than hidden by changing the
viewport budget or renderer. Source/style/harness/contract/generator hashes and
both feedback chains are included in provenance.

Focused verification:

```sh
node --test tests/panel-sizing-contracts.test.js tests/panel-modules.test.js tests/panel-placement*.test.js
npm test --prefix tools/browser-tests -- --config playwright.review.config.mjs panel-sizing-contracts.spec.mjs panel-placement-review.spec.mjs
python3 tools/build.py
```

The browser test authors a separate synthetic fixture; it does not submit to a
human dataset. The review tests also use isolated temporary submission stores.

## Round four: control bands and mixed-height packing

Round four uses the 12 genuine choices in the third submission as another small
heuristic-design signal. They are not fitted probabilities. Seven new-solver
wins remain recorded; the next public set revisits only five unresolved or
corrected cases (overview, security, health, hardware and API). It adds seven
previously unjudged round-one public cases, greedily selected for new panel types,
widths, panel counts, density, graph role and host profile. Seeded hash ties make
selection independent of manifest order. Private holdouts are never eligible.

Follow-up references preserve the exact round-three selected spec bytes. Neither
uses deterministic A and explicitly records `referenceAccepted: false`. Fresh
references are generated with the frozen v1 solver/calibrator at commit
`c6487653`; they have no human approval. Both real choices and baseline method
names stay in private reports. The public page identifies only follow-up versus
new case. All three feedback and manifest hashes are recorded in provenance.

`solver-v2.cjs` consumes native geometry, panel-owned contracts, measured content
and frozen graph bounds. It has no scenario-name or audience branches. It tries
minimum/preferred widths and several deterministic packing orders. Bottom-left
packing can reuse column cavities beneath a shallow graph; compatible row peers
share spare width without stretching fixed-aspect surfaces. The objective adds:

- Compression below a content-sensitive preferred width for verbose panels.
- Deep empty-column cost and internal graph blank-width cost. Graph occupancy is
  estimated from frozen node aspect and available camera height, not the full
  outer tile; native capture still checks actual node containment and labels.
- Control bands at full-row boundaries and sufficiently wide column cavities.
  A solid adjoining edge, current-step panel relevance, content on both sides,
  scroll distance and narrow-control wrapping all affect the score.

This can place controls above a short group with a ragged lower edge or between
primary and detailed evidence in a long composition. It does not universally
prefer above or below. If the best layout repeats a follow-up reference, the
solver chooses the next generic candidate differing by at least six aggregate
coordinate/span units; the private metadata records that exclusion rule.

`calibrate-v2.cjs` retains bounded width-keyed native measurements and eight-pass
termination. Wrapped controls include the native mode-selector chrome, with
height constraints keyed by control width. A narrow wrapped bar must not inflate
an unrelated full-width bar. Infeasible or nonconvergent cases are explicitly
unsupported; fresh selection can continue to the next deterministically ranked
case and records every skip. Holdout failures remain in the private QA report.

```sh
node tools/panel-placement/generate-round-four.mjs \
  --round-one .local/panel-placement/round-1 \
  --round-two .local/panel-placement/round-2 \
  --round-three .local/panel-placement/round-3 \
  --feedback-one .local/panel-placement/round-1/human-submissions/submission-cfe6ea80-7f5d-4542-96d5-1ff853376864.json \
  --feedback-two .local/panel-placement/round-2/human-submissions/submission-8dff7ef0-9e37-4c97-9c35-a496b9696ff0.json \
  --feedback-three .local/panel-placement/round-3/human-submissions/submission-d17aa82e-fc2f-45eb-bdac-cacaded04fc2.json \
  --output .local/panel-placement/round-4
python3 tools/panel-placement/montage.py .local/panel-placement/round-4
python3 tools/arrange-training/serve.py \
  --dataset .local/panel-placement/round-4/review \
  --submissions .local/panel-placement/round-4/human-submissions --port 8774
```

Choose a new empty output directory for every regeneration. Old rounds, PNGs,
human submissions and v1 source are not rewritten. Provenance computes actual
Git dirty status and pins renderer/style and v1 source hashes. Baseline camera
deltas are measured; camera framing follows the same native policy on both sides.
Each PNG must match the complete root dimensions and contain the document title
and all visible tiles. Decoded pixels in its first 150 rows must equal the origin
viewport screenshot and the other candidate. Repeated full PNG hashes must
settle. This supplements DOM bounds checks; a header-display false alarm during
round-three inspection was disproven by identical decoded pixels, and no votes
were discarded as confounded.

Capture reports include actual graph internal whitespace, panel-body whitespace,
content overflow, minimum native graph label size and controls reachability in
the original 1000px viewport. A structurally valid long page may require scrolling;
viewport diagnostics disclose this rather than redefining the viewport or hiding
content. Public pairs use equal image dimensions, leaving padding outside the
shorter composition. Private holdouts provide structural checks only, not evidence
of preference generalization. No production placement button is enabled.

Focused verification (all synthetic submissions remain in temporary test stores):

```sh
node --test tests/panel-control-bands.test.js tests/panel-sizing-contracts.test.js tests/panel-placement*.test.js
python3 -m unittest discover -s tests -p test_panel_placement_review.py
npm test --prefix tools/browser-tests -- --config playwright.review.config.mjs panel-control-bands.spec.mjs panel-sizing-contracts.spec.mjs panel-placement-review.spec.mjs
```

For this round's explicit center-controls feedback, the experiment selects the
best valid **generic interior-band** candidate. This is an experimental policy
constraint, not the unconstrained solver default. Its private
`experimentalSelection` records the feedback hash, selection rule, default policy,
layout hash and objective metrics. Other cases and private holdouts use the
unconstrained objective. The comparison therefore tests the stated central-controls
hypothesis without inserting hand-authored geometry or labeling it the default.

## Round five: step narrative and independent control placement

Round five reads the latest round-four submission revision and validates its
predecessor chain. Revision two replaces revision one's choice snapshot; the two
files are not counted as two independent sets of votes. `feedback-chain.cjs` is a
new manifest-driven reader: it binds every choice to both spec/PNG hashes, verifies
source semantics, rejects duplicate/unknown IDs and stale revisions, and retains
Both as acceptance without a winner. Neither remains unaccepted, including a
note expressing a partial preference. Historical loaders and evidence stay frozen.
Scenario metadata is rebuilt from a whitelist; inherited old feedback hashes do
not masquerade as current per-pair provenance.

`solver-v3.cjs` separates panel packing from control placement. Generic packing
candidates come from pinned v2 and are ranked with control-placement costs removed.
The second pass considers solid edges, distance to relevant evidence, scroll cost,
content above/below, and **measured narrative depth** at candidate widths. It can
place a short bar beside content or a larger explanation across a full row. It
removes empty whole rows left by old controls before reinserting a band. Fixed
packing experiments retain panel/graph widths, heights, horizontal positions and
source order; per-tile vertical movement is recorded. Neither solver takes a
corpus scenario name or human-vote label as a geometry input.

The native narrative is `.termbar .stepline .step-text`, inside the detached step
controls tile. The mode selector, transport and step chips share that tile. These
fixtures use native **Step** mode with the full caption visible; there is no
collapsed/expanded-caption toggle in this state. Section overview prose is not
used as a proxy for caption depth. `capture-v3.mjs` probes every authored step at
each candidate control width, measuring native text fragments, line count, needed
height including chrome, button bounds and overflow. It restores snapshot five
and the same native graph framing policy before the screenshot. No renderer CSS,
font sizes or saved node coordinates are changed to force a fit.

New candidates must contain every caption and button at every relevant step.
Historical baseline admissibility is separate: exact chosen specs are never
silently resized to pass a new worst-step gate. Any such limitation is recorded
as `historicalNarrativeLimitations`; screenshot-state controls still must pass the
existing visible/unclipped/reachable checks. Native miniature text and necessary
page scrolling remain limitations reported in the capture metrics.

The 12 public pairs contain:

- Six follow-ups: security, hardware, API trace, experience, distributed and
  overview. Security permits generic repacking; the other five isolate controls
  on the selected frozen packing. Explicit top/interior requests are documented
  policy constraints, not claimed as unconstrained default choices.
- Two matched short/long request-trace narratives. They derive from frozen API
  panels and node geometry; only `diagram.steps[].text` changes **between** those
  two experiments. The long fixture displays its longest caption at snapshot five,
  so the visible comparison actually shows the tested depth. A and B within each
  pair have identical text and semantics.
  Both reference and proposed controls are fitted algorithmically. Private
  metadata records source hash, changed fields and text hashes; neither synthetic
  content variant is described as historic human evidence.
- Four deterministically coverage-ranked, previously unjudged public cases.
  Their reference uses pinned v2 at `cd06692c7885a7e6a52a0af92dd7986d981a4117`.
  Private holdouts remain excluded from selection and serving.

The API Both choice uses deterministic A without declaring it the winner. The
experience Neither choice uses unaccepted A for its partial packing preference,
then tests the generic interior control policy represented by B. Experiment
constraints, source-reference approval status and methods stay in private reports.
The public page gives neutral packing/narrative context. This remains a provisional
heuristic evaluation, not a statistically learned preference model.

```sh
node tools/panel-placement/generate-round-five.mjs \
  --round-one .local/panel-placement/round-1 \
  --round-two .local/panel-placement/round-2 \
  --round-three .local/panel-placement/round-3 \
  --round-four .local/panel-placement/round-4 \
  --feedback-one .local/panel-placement/round-1/human-submissions/submission-cfe6ea80-7f5d-4542-96d5-1ff853376864.json \
  --feedback-two .local/panel-placement/round-2/human-submissions/submission-8dff7ef0-9e37-4c97-9c35-a496b9696ff0.json \
  --feedback-three .local/panel-placement/round-3/human-submissions/submission-d17aa82e-fc2f-45eb-bdac-cacaded04fc2.json \
  --feedback-four .local/panel-placement/round-4/human-submissions/submission-72643992-175f-4e5a-911c-67b25507a7c8.json \
  --output .local/panel-placement/round-5
python3 tools/panel-placement/montage.py .local/panel-placement/round-5
python3 tools/arrange-training/serve.py \
  --dataset .local/panel-placement/round-5/review \
  --submissions .local/panel-placement/round-5/human-submissions --port 8775
```

All four feedback chains, source/renderer/solver hashes and actual Git status are
recorded. Full-page images retain equal pair dimensions, original heading pixels
and entire tiles; 1000px viewport captures remain separate. Repeated image hashes
must settle. Twelve private holdouts exercise structural and all-step narrative
checks, without any claim about human preference generalization. Existing rounds
and servers are not regenerated. Output directories must be new and empty.

Focused checks:

```sh
node --test tests/panel-step-context.test.js tests/panel-control-bands.test.js tests/panel-sizing-contracts.test.js tests/panel-placement*.test.js
python3 -m unittest discover -s tests -p test_panel_placement_review.py
npm test --prefix tools/browser-tests -- --config playwright.review.config.mjs panel-step-context.spec.mjs panel-control-bands.spec.mjs panel-sizing-contracts.spec.mjs panel-placement-review.spec.mjs
```

Tests use synthetic temporary datasets/submission stores. No test submits choices
to a human review server. The native test makes step three longer than screenshot
step six, ensuring fitting does not merely validate the displayed snapshot.

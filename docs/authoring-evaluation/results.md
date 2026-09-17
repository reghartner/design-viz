# Authoring instruction trials — September 17, 2026

Seven GPT-5.5 low authoring runs across three rounds tested the existing and
revised `hld-to-page` instructions. The final webhook run corrected several
earlier defects but still mislabeled configuration as a wire contract; the other
cases exposed unsupported communications or misleading visual state. These trials justify better instructions and a semantic
review gate, **not unattended acceptance or a claim of parity between models**.

The user also requested a GPT-5.6-sol medium review. That independent review
found instruction gaps and four concrete defects in the separate, richer
[two-perspective seed](../../cookbook/two-perspectives.md). Those were repaired, and SOL confirmed no remaining actionable skill/seed
findings. SOL had no browser surface; the parent supplied visual QA. The seed is reviewed teaching material, not an unassisted low-model trial.

## Method and limits

- Inputs: fictional [doorbell](cases/doorbell.md), [webhook](cases/webhook.md),
  and held-out [checkout](cases/checkout.md) cases. Each specifies supported
  communications, known outcomes, uncertainty, and facts that are not supplied.
- Each author received the source, its round's skill, repository/tools access,
  an isolated output directory, and authorization for presentation choices.
  Authors were not given the grading findings or other trial outputs.
- Round 1 used the original skill from repository commit
  `3cedce5365962fb1204b26f6791083ca7d54621a`. Later rounds used successive local
  revisions described below. Round 3's webhook run used the latest instructions
  after the other round-3 cases had exposed additional gaps.
- All authors used GPT-5.5 with low reasoning. Some ran as delegated agents;
  round-2 webhook and round-3 doorbell/webhook used fresh CLI sessions. Those CLI
  sessions could not launch a browser and reported that limitation honestly.
  The coordinating agent subsequently rendered their unchanged outputs outside
  that sandbox. Browser-access differences confound comparisons of autonomy.
- Parent review read the sources and raw specs, inspected branch state and
  screenshots, and exercised every path endpoint at 1440px plus narrow 390px
  layouts. This endpoint audit is less exhaustive than the separate seed's
  every-beat audit. Screenshots and tool scripts remained scratch artifacts.
- The seven original specs are retained under [artifacts](artifacts/manifest.json)
  with SHA-256 hashes. They are **evaluation evidence with known defects**, not
  recommended starters. Even their source URLs, captions and provenance can be
  wrong. Do not copy their claims into new diagrams.

This is a small qualitative tuning exercise: no repeated seeds, blinded graders,
statistical confidence, latency/cost comparison, or complete instruction-version
archive. Two cases were reused for tuning. Checkout was a single held-out case.
Scores are the coordinating agent's judgment, not a model benchmark.

## Rubric

Each dimension scores 0–4: absent/unusable, material defects, mixed, minor issues,
or meets this case's requirements. Totals are out of 24; a material unsupported
communication, outcome, or evidence claim requires revision regardless of total.

| Dimension | What earns credit |
|---|---|
| F — Source fidelity | Correct actors, mechanisms, provenance and uncertainty; no invented network hop or wire contract |
| B — Branches and coverage | Complete source flow, shared prefix, distinct first divergence and honest endpoints |
| C — Causality and state | Effects follow supported causes; independent path folding; no stale success/error or inferred receipt |
| R — Richness and meaningful motion | Coordinated physical movement, recording/event timing, handoffs and outcomes where supported; useful software transitions count equally |
| V — Readability and visual checks | Usable wide/narrow controls and labels, coherent rendered widgets, inspected branches |
| A — Auditable handoff | Storyboard/ledger, real build, traceable output, honest limits and reproducible checks |

Richness does not mean a widget quota. A webhook need not have a Home panel. A
Home story should show meaningful changes in place, people and experience;
decorative motion, an invented relay, or movement at the wrong beat earns no
credit. V includes parent-assisted inspection where noted; it does not imply
the author itself completed that inspection.

## Results

| Round / artifact | F | B | C | R | V | A | Total | Disposition |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 [Doorbell](artifacts/round1-doorbell.spec.json) | 1 | 4 | 1 | 3 | 3 | 1 | 13 | Revise: timeout depicted as blocked send; wrong empty-phone implication |
| 1 [Webhook](artifacts/round1-webhook.spec.json) | 1 | 4 | 2 | 2 | 3 | 2 | 14 | Revise: invented operator transport/provenance; stale recovery alert |
| 2 [Doorbell](artifacts/round2-doorbell.spec.json) | 2 | 4 | 3 | 2 | 3 | 3 | 17 | Revise: unsupported Home relay, wrong signal destination and entry position |
| 2 [Webhook](artifacts/round2-webhook.spec.json) | 1 | 4 | 2 | 2 | 3 | 3 | 15 | Revise: SQL shown as internal; autoplay and recovery-state defects |
| 3 [Doorbell](artifacts/round3-doorbell.spec.json) | 1 | 4 | 2 | 3 | 3 | 3 | 16 | Revise: timeout shown as response and send treated as receipt |
| 3 [Checkout](artifacts/round3-checkout.spec.json) | 2 | 4 | 2 | 3 | 2 | 3 | 16 | Revise: UI error given unsupported response cause; tiny mobile graph |
| 3 [Webhook](artifacts/round3-webhook.spec.json) | 2 | 4 | 4 | 3 | 3 | 4 | 20 | Revise: configuration/mechanism facts presented as wire-contract fields |

### Round 1: baseline

Doorbell separated recording from the person event and shared the right lead-in.
However, `timeout_unknown` marked `camera->upload` as `blocked` despite an already
sent request and unknown remote outcome. Its phone widget still said no
notifications while the caption said notification status was unknown. Caption
checks missed that contradiction. It ran the validator and injector instead of
the prescribed page builder, leaving the normal manifest handoff incomplete.

Webhook preserved applied-once state and branch sharing. It invented an
operator-to-sender internal edge, derived a GitHub source URL from a local file
path, added unsupported wire-field names, and left Sender alert-colored after
successful recovery. Its real page build passed: validation could not detect
these semantic errors.

### Round 2: storyboard and evidence guidance

The first rewrite added a short intent/evidence/storyboard/build/delivery workflow,
focused reference files, explicit unknown-versus-absent rules, path folding and
meaningful Home motion. Instructions emphasized inspecting widgets themselves
and clearing carried error state.

Doorbell fixed the timeout break and unknown-notification representation, but
added an unsupported physical “Camera uplink” hub. Its notification signal went
back toward the camera, and its subject was still outside the house at the beat
claiming entry; movement inside occurred during the next upload beat. This is why
richness must be graded for meaning and spatial continuity, not animation count.

Webhook still used internal edges for SQL and operator intervention, opted into
autoplay without a request, and retained warning tones after recovery. Its build
passed and it honestly disclosed blocked browser execution. More instructions
did not yield uniformly better semantics.

### Round 3: reverse auditing and held-out incident

SOL's instruction review clarified how to preserve a known communication when
its transport is unspecified, how local-source updates avoid fabricated source
URLs, and how to identify conversational input. Subsequent guidance checked Home
marker roles, signal endpoints and inside/outside positions. Before the last
webhook run, a reverse audit explicitly required evidence for every edge kind,
marker, contract and URL, and distinguished animated scenes from autoplay.
The final review also clarified that factual configuration values must not be
presented as wire fields unless the source establishes a payload schema.

Doorbell fixed the entry location and wrong notification signal. It nevertheless
added `api->camera` at `camera_timeout`: a local timeout became a delivered
response. A check labeled “Upload API received request” passed with only “Request
sent” evidence. The unknown cloud-result text was otherwise retained.

Checkout correctly grouped concurrent starts and retained unknown Inventory and
Orders outcomes in the partial incident trace. It then activated
`checkout->browser` for a generic UI error, although no backend response was
observed. Its “Browser outcome observed” check failed even though an error was
observed, conflating an undesirable outcome with missing evidence. Its entire
graph was also too small to read comfortably on mobile.

The last webhook run declared SQL explicitly, removed the invented operator
network edge, opened paused, cleared the recovered Sender tone, and preserved
one application across retry. Retry/query beats used focused nodes and explicit
captions/logs, avoiding overlapping repeated step coins. Its final check label,
“Retry eligibility resolved,” remains meaningful when the detail changes from
permission to the single retry having been used. However, SOL’s review of the
report caught an additional artifact defect: a card titled “On the wire: webhook
event” lists retry limit, transport and ledger access as fields, although the
source defines no payload schema. A note about the missing key field does not
undo that misleading title/structure. An explanatory table would be faithful.
This remains the strongest trial but also requires revision. Its narrow table
wraps field names awkwardly; visual verification required parent assistance.

### Final instruction changes and independent seed review

After those trials, the skill explicitly distinguishes a local timeout from a
response packet, a browser error from a backend response, and sent from received.
It requires neutral visual health when service health is unobserved. These last
changes have **not** had another low-model trial; their effectiveness remains to
be tested on new cases.

SOL also reviewed the separate two-audience seed and caught a missing attempted
write before its 503 response, night-scene lighting absent from the fictional
source, a carried dequeue animation at the 429 beat, and a camera coverage cone
that missed the visitor. The seed now depicts the attempted write and response,
declares night lighting, clears the transient queue state before requeue, and
covers the visitor's recorded positions. The story-planning reference now calls
out transitional queue state, camera coverage and scene-lighting consistency.

## Reviewed seed and verification

The [seed recipe](../../cookbook/two-perspectives.md) links its authored source,
ledger, executable spec and built page. One registry covers 11 components, 18
happy-path steps, an 11-step storage-rejection path and a 14-step delayed-push
path. “Resident story” emphasizes people, place and outcomes; “Data flow” exposes
the detailed service topology. Both retain the complete flow and selected beat.

- Real `page_build.py`: zero errors and zero warnings.
- Five `tests/authoring-seed.test.js` tests exercise real validation/state folding:
  shared views, quiet recording/event separation and camera coverage, notification
  causality, local media survival, and held delivery with correct transient state.
- Browser checks walk all 43 path beats at 1600px and 390px (86 visits), switching
  story → data flow → story at each beat and comparing captions, subjects, camera,
  phone, experience, checkpoints and queue. They also check failure endpoints,
  no stale notifications, no page overflow, visible captions without vertical
  scrolling inside the controls tile, quiet REC, animation and reduced
  motion. Wide/narrow screenshots were inspected; connector label offsets were
  corrected after visual review. A later mobile screenshot exposed a too-short
  controls tile; it now reserves nine rows, and caption fit is checked at every beat.

Rebuild and run the committed checks from the repository root:

```sh
python3 tools/page_build.py docs/diagrams/doorbell-perspectives/doorbell-perspectives.spec.json --root "$PWD/docs/diagrams/doorbell-perspectives"
node --test tests/authoring-seed.test.js
python3 -m unittest discover -s tests -p 'test_cookbook.py'
python3 -m unittest discover -s tests -p 'test_widget_doc.py'
```

For future instruction changes, use fresh cases and repeat the same evidence,
branch, motion and viewport checks. Retain raw outputs, grade semantic defects
even when validation passes, and keep review mandatory for ambiguous traces,
failure causality or claims of canonical company behavior.

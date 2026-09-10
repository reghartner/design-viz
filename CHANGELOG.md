# Changelog

## Safety recipes: cross-region failover + event-store replication (2026-09-05)

- Two backend safety scenarios join the atlas as HLD + generated page:
  `hearthline-failover` (a monitored alarm surviving the loss of a region:
  journal-first acknowledgment, connect-driven watermark reconciliation
  with a hello/hello-ack exchange, panel retention as the durability
  anchor, tickets keyed by a stable incident id so delivery is
  at-least-once with an exactly-once ticket effect, epoch fencing against
  split brain, gap-free failback) and `halovista-mirrorline` (a replicated
  event store: quorum writes with a 14 ms budget, read-your-writes
  routing, an election that keeps writes BLOCKED until a new sync replica
  reaches parity, fenced-tail rewind on rejoin, RPO 0 for acknowledged
  records).
- Externally Codex-reviewed to NO MAJORS across five cycles; the loop
  removed two unsound protocol lessons (an ack-before-replication
  durability claim; a quorum-violating write resume), an event/incident
  key confusion, a directionally impossible wire exchange, and a diagram
  that drew the ack the wrong way. The shipped recipes teach the corrected
  models consistently across HLD prose, wire contracts, plan tables,
  specs, and rendered pages.


## IoT visualization atlas (2026-09-05)

- **Five new inspector widgets** (each Codex-reviewed across a 4-cycle loop
  to NO MAJORS): `battery` (charge where LOW is bad: glyph, source/trend/
  cold/forecast row, per-step sparkline), `buffer` (segmented strip with
  cumulative `mark` range paints, wholesale-reset semantics, fold-time
  compaction), `radar` (wedge/full-circle distance rings, threshold alerts,
  sector or polygon zones with computed occupancy, engine-derived visit
  track, POLAR authoring via `scale` so specs write real units), `signal`
  (per-link health rows: ok/weak/retrying/lost/jammed, transport tags),
  `tiles` (fleet grid with a declared state vocabulary).
- **Research + fictional universe**: `docs/research/` carries the device
  catalog (27 vendors, 159 use cases), a sourced 2026 market scan, and the
  use-case-to-widget matrix. `docs/hlds/` carries ten fictional-product
  HLDs (radar doorbell, mmWave presence sensor, cloud ecosystem, offline-
  buffer cam, local AI hub, AA-battery cam, PoE NVR fleet, off-grid solar
  cam, monitored alarm, Matter hub-camera), each ending in a mechanical
  "Visualization plan" a cheap agent converts with at most documented
  field-name translation to the shipped widget contracts.
- **Ten new example pages** under `examples/<family>/`, each generated from
  its HLD by a page agent through `tools/page_build.py` (validate with 0
  errors/0 warnings, inject, manifest update — file-locked for parallel
  agents) following `cookbook/hld-to-page.md` (since superseded by the
  `.claude/skills/hld-to-page/SKILL.md` skill). Browsing surface:
  `tools/build_index.py` generates `examples/index.html` from
  `examples/manifest.json` (13 pages); `tests/test_index.py` gates
  completeness and drift.
- **Cookbook grew four recipes** (recording buffers, radar range, link
  health, fleet dashboard) and the page-conversion runbook.
- **Validator hardening driven by agent feedback**: duplicate from→to edge
  declarations warn (the engine keys edges by that string), unknown
  per-link signal fields warn (caught three `rssi` slips), radar patches
  fully checked, degenerate sectors rejected, message texts aligned to
  exact model behavior.


## Panels stop restarting animations on every step (2026-09-05)

- **Unchanged-markup skip.** `renderPanelBody` now compares the widget's new
  markup against what the host already shows and leaves the DOM alone when
  identical — so a step that does not patch a panel no longer restarts its
  animations or timers (viewfinder walk-in, REC timecode, pir sweep/pings,
  LED pulses all continue across steps).
- **Viewfinder surgical mode swap.** A `screen` panel transition between two
  scene-showing modes (live / rec / save) swaps only the mode class and the
  overlay chips and keeps the scene subtree, so the walker's animation state
  survives live→rec→save instead of replaying the walk-in three times.
  Off/boot transitions still rebuild (different scene subtree, and the
  walk-in replay there is the intended narrative).
- **Zoneframe pattern id is per-host** (was per-render), so identical
  zoneframe markup is recognized as identical. Render-level tests cover the
  skip and the surgical swap.

## Agent cookbook (2026-09-05)

- **New `cookbook/` directory** — task-shaped recipes for authoring agents,
  one file per common request: `temperature.md` (thermo thresholds),
  `battery-level.md` (gauge drain + low event; documents why thermo's
  high-is-bad zones do not fit a battery), `motion-detection.md` (pir
  geometry rules — y-down coordinates, facing table, full-cone-fit rule, a
  pre-inject verification snippet), `wake-message.md` (mailbox + wake line),
  `persistent-when-awake.md` (socket edge only in awake steps),
  `camera-to-cloud-via-lp-mqtt.md` (two-hop relay in one packet-chained
  step), `soc-egress-routing.md` (persistent OR MQTT, lane-tagged choice),
  and `adjustments.md` — a phrase-to-knob table mapping visual feedback
  ("move that up and to the right a little") to the exact spec field, with
  the non-adjustable engine constants named so an agent says so instead of
  guessing.
- **Drift gate**: `tests/test_cookbook.py` extracts every ```json fence in
  `cookbook/` and requires the real validator CLI to report 0 errors and
  0 warnings — recipes cannot drift from the engine or teach a linted
  pattern.
- Checklist step 7 in `contract/authoring-contract.md` (added earlier today)
  now has its worked counterparts; the contract points at the cookbook, and
  README documents the directory.
- **Review hardening (external Codex review, 6 cycles to NO MAJORS).** The
  cone-visibility guidance was corrected twice (nearest-edge guarantee +
  exact arc-point check instead of a facing-direction rule; explicit
  visible/exits verdict computed on unrounded coordinates) and its stroke
  caveat settled at the provable worst case (default miter limit caps join
  spikes at 3 px — keep bounds 3 px inside the frame). The cookbook drift
  gate was split so its node-independent checks run even without node. One
  reviewer finding (sampled arc points vs the ideal arc) was disputed with
  render-level evidence and WITHDRAWN — the engine draws the polygon from
  those same points.

## New `thermo` panel + animated `pir` widget (2026-09-05)

- **`thermo` inspector panel.** A temperature readout against declared
  warning / critical-shutdown thresholds: numeric readout + zone chip, a
  threshold track (shaded warn/crit bands, tick marks, a value fill that
  animates between steps), and a per-step history sparkline that plots every
  step's folded value faintly and reveals the bright line up to the current
  step. The engine COMPUTES the zone (NOMINAL / WARNING / CRITICAL) from the
  value; `label` overrides only the chip text (e.g. "HP CORE OFF"). Pure
  `thermoModel` (node-tested), themed for both skins, validator checks
  (non-numeric fields, max<=min, warn>crit), authoring-contract entry.
  `renderPanelBody` now receives the panel's full folded state array + step
  index so the sparkline can track the whole timeline.
- **`pir` widget animation.** The subject dot now GLIDES from its previous
  position on a step change (with a fading ghost + dashed trail), a sweep
  beam scans the cone, the sensor emits ping rings, the cone breathes while
  clear, and a clear→tripped transition fires one-shot cues (cone flash,
  ripple at the subject, status-pill blink) — gated so they do NOT replay on
  every step while already tripped. All motion suppressed under
  prefers-reduced-motion (the engine also skips emitting the ambient
  elements).
- **Review hardening (external Codex review, 4 cycles to NO MAJORS).**
  (1) pir one-shot trip cues fire only when the previous render was
  explicitly clear — a panel whose first render is already tripped no longer
  flashes. (2) Non-finite numbers (JSON `1e400` → Infinity) are treated as
  absent everywhere in the thermo path — model thresholds and value, the
  sparkline history, and new validator warnings on non-finite
  min/max/warn/crit, `initial.value`, and per-step patched `value` — so NaN
  can never reach an SVG/CSS attribute. (3) The thermo sparkline breaks into
  segments at a no-data step instead of drawing a line across the gap
  (render-level test via a stub host).
- **Doorbell example: new "Thermal envelope" section** exercising both — a
  PIR walk-up wakes Vision HP, the die climbs through the 75 °C warn line
  (throttle) to 95 °C critical (chip powers off mid-stream), and Sentry LP,
  still on the network, publishes the thermal event and the resident push
  while the hot chip is off; recovery below re-arm.

## Float placement: direction-aware edges + dx/dy nudge (2026-09-05)

- **Direction-aware float edges.** An edge between a float and a row node now
  attaches on the side each node faces vertically: a float *below* its partner
  connects to the partner's BOTTOM (previously it always looped to the top), a
  float above connects to the top. Fixes return arrows (e.g. an Aperture float
  feeding a RECORDING_UPDATE back up to REM) routing behind the target tile.
- **Float `dx` / `dy` nudge.** A float spec accepts optional `dx`/`dy` (px) to
  shift it from its auto position — a negative `dy` raises a below float pinned
  under a tall last row up into the inter-row gap. Manual override in the spirit
  of `bend` / `labelDx`.

## New `pir` panel: IR/PIR sensor field-of-view cone (2026-09-05)

- **`pir` inspector panel.** A mounted IR/PIR sensor projects a field-of-view
  cone over a 320×180 frame; a subject dot is tested against it and the engine
  COMPUTES tripped vs clear (coloring the subject and a status pill) rather than
  relying on the author to assert it. Declared with `sensor`, `cone`
  (`facing`/`spread`/`range`), and an optional `path`; patched per step via
  `subject`, `banner`, `status`, and an optional `tripped` override. Purpose:
  line-of-sight / wake-on-motion arguments — showing an approach that misses the
  cone (no wake) versus one that trips it. Pure `pirModel` (node-tested),
  render branch, CSS, and authoring-contract entry.

## Inline markup + nested bullets + board scroll fix (2026-09-04)

- **Inline markup** in `text`, `bullets`, and a contract card's `note`: a small
  escape-first (XSS-safe) subset — `**bold**`, `*italic*`, `` `code` ``, and
  `[label](https://url)` links (http/https only). Italics use `*` not `_`, so
  `snake_case` identifiers are left alone.
- **Nested bullets.** A bullet item may be a string or `{text, sub:[...items]}`;
  `sub` renders as an indented child list and may recurse. Lets a page mirror
  the layered bullet structure of the source design doc.
- **Bulleting-style guidance** added to the authoring contract: reproduce the
  source doc's bullets (many specific, nested sub-points, bold the subject,
  italicize emphasis, inline code and permalinks) instead of flattening to
  prose.
- **Board scrollbar fix.** A diagram sharing its row with a panel column no
  longer shows a spurious horizontal scrollbar: the 980px svg min-width is
  dropped in the `haspanels` layout so the diagram scales to the narrower
  board column instead of overflowing it.

## Tab highlight + queue fixed-height + brighter permalinks (2026-09-04)

- **Tab highlight.** A tab may set `"highlight": true` (or a named accent /
  `#RRGGBB`) to stand out in the tab bar with a leading dot and an accented
  border/label. Intended for marking a subset of tabs, e.g. a proposal versus
  the current state. Default highlight color is violet.
- **Queue widget fixed height.** The `queue` panel now reserves a constant
  height across all four states: the directional-context row (from/to) and the
  waiting-on reason line are always emitted (populated only in the relevant
  state) and clamped, so the reason length and state transitions no longer
  reflow the panel column or the step bar below it.
- **Brighter permalinks.** Node `↗` and contract-field `↗` links render in the
  accent color instead of muted grey, so authored permalinks read as present
  at a glance.

## Queue widget — directional context + waiting-on reason (2026-09-04)

- The `queue` panel gains three optional per-step string fields that make the
  handoff explicit in the widget itself: `from` (arrival context, rendered
  under the in-arrow during `enqueue`), `to` (departure context, rendered
  under the out-arrow during `dequeue`), and `reason` (a waiting-on line
  rendered while `held`; patch it alone on later held steps to narrate
  progress). Non-string values warn with field paths and are ignored; all
  three are carried like other patch fields and only the state-relevant one
  renders. Reduced motion renders the context statically; print shows the
  held label plus the reason. Demonstrated in the doorbell example (the
  Sentry LP mailbox now says where the stream command came from, why it is
  waiting, and that Vision HP takes it) and minimally in the workbench demo.

## Edge routing — straight-drop preference + node-avoidance pass (2026-09-04)

- **Straight-drop preference** — a cross-row edge whose endpoint x-centers
  align within 40px renders as a straight vertical drop; within 96px it gets
  a minimal vertical-tangent S. This intercepts x-aligned serpentine wrap
  edges too, so a wrap junction whose columns line up (the atlas Doorbell
  Moment's Pulse Events → Herald Push) drops straight instead of looping
  around the page margin. Genuinely offset pairs keep their curved routes.
- **Node-avoidance pass** — after layout and the parallel-edge offsets, every
  edge path is sampled against every foreign node card (3px margin); an
  intersecting edge tries a bounded, deterministic candidate set of sideways
  detours (left/up first at each magnitude, magnitudes ascending) and keeps
  the first clean one, else the best-scoring one. Fixed five real
  edge-through-card crossings in the shipped examples; labels re-place off
  the final routed paths. Engine-owned behavior — zero new spec vocabulary;
  author `bend`/`labelDx`/`labelDy` still win where set.
- Workbench in-page reference and demo caught up with the authoring
  capabilities wave: the schema table and agent-contract block now cover the
  `queue` panel and the message-contract card, and the demo spec renders one
  of each (a Relay queue holding the pump command, and the command-publish
  envelope with a hot `version` row and per-field permalinks).

## Authoring capabilities — queue panel, message-contract card, field permalinks (2026-09-04)

- **`queue` panel type** — a mailbox widget showing a message enqueued →
  held → dequeued (a low-power chip holding a command while a bigger chip
  boots). States `empty | enqueue | held | dequeue`, `label` carried across
  steps; CSS-driven animation gated by reduced motion; the held label prints
  statically (the only widget shown in print). Unknown state tokens fall back
  to `empty` with a validator warning. Demonstrated in
  `examples/doorbell/doorbell.spec.json`: the Sentry LP mailbox holds
  "STREAM cmd" across Vision HP's wake and boot steps.
- **Section `contract` card** — an "on the wire" field table on any section:
  `{title?, source?, fields:[{k, v?, g?, hot?, link?}], note?}`. Keys and
  values render monospace; `hot: true` rows are emphasized; the title reuses
  the section "source ↗" chip. Malformed cards degrade with warnings, never
  errors. Demonstrated in the doorbell spec (motion event) and the cumulus
  v2 spec (command publish).
- **Field-level permalinks** — every contract-card row (and the card itself)
  takes an optional `link`/`source` URL, rendered as the small ↗ affordance
  nodes and steps already have (new tab, `rel=noopener`); non-string links
  are ignored with a warning. Contract-card links are hidden in print like
  the other link affordances.

## DX wave — validator CLI, lint rules, contract version, adjacent-file specs (2026-09-04)

- **`tools/validate.js`** — validator + lint CLI (`node tools/validate.js
  [--quiet] <spec.json>...`): errors, warnings, and lint findings with field
  paths; exit 1 on errors. Loads the shipped `src/validator.js` +
  `src/engine.js`, so CLI and in-page results cannot drift. This closes the
  authoring agent's emit → validate → fix loop without a browser.
- **Lint rules** (advisory, surfaced by the CLI and the workbench, never
  errors): edge label longer than its edge can carry; >4 edges crossing one
  row corridor; two steps sharing a first edge (coin collision); declared but
  unused protocols; diagrams with 3+ rows.
- **Contract version** — the authoring contract is version **1**; specs may
  declare `page.contract: "1"`. Policy: the engine warns (never blocks) when
  a spec declares a different MAJOR version; additive schema changes keep the
  major, breaking changes bump it and the engine keeps rendering older majors
  best-effort with the warning as the signal to re-emit the spec.
- **Adjacent-file specs** — an http(s)-served template page still holding the
  built-in demo (marker `__demo`) accepts `?spec=relative/path.json`;
  `file://` cannot fetch, so injection remains the default distribution mode.
- **CI/node parity** — the node test job uses the `tests/*.test.js` glob
  (a bare directory argument behaves differently across node majors); the
  same invocation is documented in the README, and CI now also runs the
  validator CLI over all four example specs.
- Planned, not built: the spec-version diff view (two specs → visual
  before/after).

## Widgets wave — waterfall, orbit, zoneframe, xray + Atlas v2 (2026-09-04)

Four new inspector-panel widget types (schema additions, documented in the
authoring contract):
- **`waterfall`** — latency spans on one shared Gantt scale with a running
  total; patched via `{reveal, highlight, total}`. Declared `spans:[{id,
  label, ms}]`.
- **`orbit`** — a state machine on a ring; the current state enlarges,
  colors, and pulses (pulse disabled under reduced motion); patched via
  `{state, via}`. Declared `states:[...]` + optional per-state `colors`.
- **`zoneframe`** — a 320×180 camera frame with armed / ignored /
  masked-crosshatch zone polygons, a subject dot, and a verdict banner
  (`alert` / `suppress` / `never-captured`); patched via `{zones, subject,
  verdict}`. A `zones` patch replaces the zones state array wholesale.
- **`xray`** — nested encryption envelopes, outermost first; open layers draw
  dashed/unlocked and a footer states whether the payload is readable at the
  current hop; patched via `{hop, layers}`. A `layers` patch replaces the
  layers state array wholesale.

Validator: the four types join `PANEL_TYPES`; each warns (with field paths)
when its declaration is missing spans/states/zones/layers, and zoneframe
checks per-zone point counts.

Atlas v2 (`examples/doorbell-atlas/`): declares `page.lanes` (NET/DEV/CAM);
tab 1 gains the 640 ms latency waterfall revealed step by step; tab 2 gains
the live-view screen widget (off → boot → live); tab 3 gains the zoneframe
with a walking subject, a masked-window blackout, and an alert verdict; the
E2EE section gains the xray who-can-decrypt panel; new tab 7 "Offline &
Recovery" covers local-only operation (chime over 915 MHz, 72 h flash ring)
and the reconnect/backfill flow, with orbit connectivity dials tracking
ONLINE → DEGRADED → OFFLINE → RECOVERING → ONLINE.

## Wave 2 — deep links, presenter mode, print view, layout auto-cleanup (2026-09-04)

Viewer features (no authoring changes required):
- **Deep links** — the flowview page mirrors its state in the URL hash
  (`#t=<tab-slug>&m=<step|ambient>&s=<step id or number>`), read on load and
  written with `replaceState` on every tab/step/mode change. The step part
  addresses the first stepper of the active tab. Workbench pages skip deep
  links (the editor re-renders freely).
- **Stable step ids** — optional `steps[n].id` (e.g. `"ota.3"`), shown subtly
  on the caption line and addressable via `s=` in deep links. Duplicate ids
  warn with a field path.
- **Presenter mode** — a PRESENT button (flowview pages) enters fullscreen
  with enlarged captions; ArrowLeft/ArrowRight step, Space plays/pauses,
  digits 1–9 switch tabs, Esc exits.
- **Print stylesheet** — printing forces a light ground on either skin, stops
  all animation, hides controls, shows every tab, hides the panel column, and
  prints each board's step captions as a numbered list beneath it.

Layout auto-cleanup (specs need no manual nudges in the normal case):
- **Label collision pass** — after render, labels are measured (getBBox) and
  greedily nudged off nodes, step coins, sampled edge paths, and each other.
  Author-nudged labels (`labelDx`/`labelDy`) are treated as fixed.
- **Parallel-edge auto-offset** — edges sharing a node side fan their attach
  points apart; forward/return edges between the same node pair bow apart
  with opposite bends; same-row edges skipping over intermediate slots arc
  above the row. An author-set `bend` disables the auto bend for that edge.
- **Float spread + `side:"below"`** — floats sharing a side are spread apart
  automatically; floats may render below the last row.
- The engine-owned doorbell example spec dropped all 6 of its manual nudge
  fields; a geometry acceptance test (estimated text metrics) asserts the
  nudge-free doorbell, cumulus v2, and atlas specs resolve without label
  collisions.

Infrastructure: node test invocation pinned to `tests/engine.test.js` (newer
node globs would try the python files); 15 new node tests (36 total).

## Wave 1 — single-source engine, tests + CI, inspector panels (2026-09-04)

Engine / schema (all additive; existing specs render unchanged):
- **Edgeless steps** — a step may carry `nodes:[...]` and/or panel patches
  instead of `edge`/`edges`; it lights nodes directly (a boot, a state change
  with no message). Steps with nothing to show warn instead of vanishing.
- **Step lanes** — `page.lanes` declares lane colors; `steps[n].lane` shows a
  colored pill on the caption line (NET / DEV / CAM).
- **Ordered packet chains** — multi-edge steps fire their packet dots in list
  order with a 450 ms stagger, so a two-hop delivery reads as two hops.
- **Containment groups** — `diagram.groups` + `nodes.<id>.group` draw a
  dashed, titled boundary around member nodes; an edge between members of one
  stack column renders as a straight vertical interconnect (interrupt line).
- **Inspector panels** — `diagram.panels` declares synchronized widgets beside
  the board: `state` (enum readout + chip rail), `leds` (on/off/tx/rx dots),
  `gauge` (numeric bar), `log` (appending event lines), `screen` (viewfinder
  with off/boot/live/rec/save modes, blinking REC + timecode, save banner).
  Steps carry SPARSE `panels` patches; the engine folds them into complete
  per-step state at load, so any step jump is consistent. `log` patches
  append; `enterOnce` applies only at its own step.
- **Stock scenes** — `person-at-door-night`, `package-drop`, `static-noise`
  for the screen widget.

Build / infrastructure:
- **Single-sourced engine** — the engine now lives once in `src/` and
  `tools/build.py` assembles both committed single-file pages
  (`template/flowview.html`, `workbench/flowspec.html`). The two previously
  divergent engine copies are unified.
- **Tests** — `tests/test_inject.py` (injection anchoring incl. the
  comment-trap regression, title-from-spec, `</script` refusal),
  `tests/test_build.py` (determinism, one spec block, shared engine chunk
  identical across outputs), `tests/engine.test.js` (validator against the
  example specs and seeded failures, layout math, panel folding) — 11 python
  + 21 node tests, zero dependencies.
- **CI** — `.github/workflows/ci.yml`: python tests, node tests, and an
  examples-build job that rebuilds from src (fails if committed outputs
  drift) and injects both example specs.

Example:
- `examples/doorbell/doorbell.spec.json` — the northstar acceptance gate:
  the two-chip doorbell (containment group + WAKE_INT interconnect), five
  synchronized panels (wake-state machine, board LEDs, power gauge,
  viewfinder hitting the REC moment, event log), 12 lanes-tagged steps, new
  `rtp` protocol in the legend — all from pure JSON, rendered to
  `examples/doorbell/doorbell-from-spec.html` by `tools/inject.py`.

## Atlas v1 (2026-09-04)

- `examples/doorbell-atlas/` — six-tab Doorbell Feature Atlas page authored
  as a spec against the pre-wave-1 engine (PR #1).

## Initial import (2026-09-04)

- Template, injection tool, authoring contract, workbench, Cumulus end-to-end
  example, hand-built mockups.

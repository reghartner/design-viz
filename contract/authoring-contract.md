# Flowspec authoring contract

You are producing a **flowspec**: one JSON document that a rendering template
("Flowview") turns into an interactive technical-documentation page — a page
title, tabbed groups of content, accent-colored sections with prose and bullets,
and animated SVG data-flow diagrams. Every diagram renders in two modes from the
same data: an **ambient** view (all edges animate continuously, packet dots
travel the paths) and a **step click-through** (one numbered step lit at a time,
with a caption bar and playback controls). You author the flow once; both modes
come from it.

Your typical input is a high-level design document (prose, permalinks, mermaid
diagrams). Your job is to translate it into this JSON.

**Contract version: 1.** Optionally declare it as `"contract": "1"` inside
`page`; an engine implementing a different major version warns instead of
guessing silently.

## Output rules

- Output **only** the JSON object. No markdown fences, no commentary, no
  trailing text.
- Valid strict JSON: double-quoted keys and strings, no comments, no trailing
  commas.
- Never include coordinates, pixel sizes, or HTML. All layout is computed.
- Never place the character sequence `</script` inside any string value (the
  JSON is embedded in an HTML script block). If a URL or text ever needs it,
  write `<\/script` instead.
- Unknown fields are ignored by the renderer, never fatal — but emit only the
  fields defined here unless instructed otherwise.

## Top-level shape

```json
{
  "page": {
    "title": "Page title",
    "contract": "1",
    "skin": "aurora",
    "generatedFrom": {"url": "https://confluence.example.com/...", "label": "Doorbell HLD", "version": "v12", "at": "09-07-2026 14:30"},
    "protocols": { "kindName": { "label": "Legend label", "color": "#RRGGBB" } },
    "lanes": { "NET": { "color": "#38E1FF", "label": "NET" } },
    "blocks": [
      { "...a section object (see below)..." : "" },
      { "tabs": [ { "label": "Tab name", "sections": [ "...section objects..." ] } ] }
    ]
  }
}
```

- `title` — page heading. Required in practice; short.
- `generatedFrom` — optional page provenance, shown as one quiet line directly
  under the title and included in print. It usually identifies a Confluence
  page and its version. `url` is required for the line to render; `http`/`https`
  values become a new-tab link, while other values render the label as literal
  text. `label` is optional link text and defaults to `source document`.
  `version` and `at` are optional strings rendered verbatim, separated with
  middle dots when present. The timestamp convention is `month-day-year hh:mm`
  (for example, `09-07-2026 14:30`); it is documented but not enforced beyond
  requiring a string.
- `skin` — optional page default. One of `"aurora"` (dark, default),
  `"daylight"` (light, print-friendly), `"editorial"`, `"terminal"`,
  `"pastel"`, or `"blueprint"`. On load, a valid `dv_skin` cookie overrides
  this field; otherwise this field wins; otherwise the page uses `"aurora"`.
  A consuming site can then switch live with `window.dvSetSkin(name)`; it does
  not change the cookie. Omit `skin` unless the request says otherwise.
- `protocols` — optional; only needed to ADD edge kinds beyond the built-ins
  (see "Edge kinds"). `color` is one hex string, or
  `{"aurora": "#..", "daylight": "#.."}` for per-skin colors.
- `lanes` — optional. Declares step lanes (which layer is acting: network,
  device, camera...). A step tagged `"lane": "NET"` shows a colored pill on
  its caption line during click-through playback. Keys are short uppercase
  tokens; `label` defaults to the key.
- `blocks` — ordered page content. Each entry is either a **section object**
  (rendered directly) or a **tabs container** `{"tabs":[...]}`. Tabs group
  related sections; readers switch with a tab bar. Use tabs when the page has
  more than ~2 diagrams, or to pair a diagram with its guided walkthrough.
  A tab may set `"highlight": true` to stand out in the tab bar (a leading
  dot plus an accented border/label): use it to distinguish a subset of tabs,
  such as a proposal from the current state. `highlight` also accepts a named
  accent token or `#RRGGBB` to set the highlight color (default violet).
- Accepted alternates (for simple output): `"sections": [...]` instead of
  `"blocks"` when there are no tabs; or a bare diagram object (just
  `nodes` + `rows` + `edges`...) which is auto-wrapped in a one-section page.

## Section object

One accent-colored bounding box on the page:

```json
{
  "heading": "Section heading",
  "accent": "green",
  "source": "https://docs.example.com/hld#anchor",
  "text": ["First paragraph.", "Second paragraph."],
  "bullets": ["Key point one", "Key point two"],
  "collapsed": true,
  "diagram": { "...diagram object (see below)..." : "" }
}
```

- `heading` — optional but recommended.
- `accent` — optional. One of: `green blue violet amber pink cyan red slate`,
  or a `#RRGGBB` hex. Omitted accents cycle green → blue → violet → amber.
- `source` — optional permalink to the design-doc section this content came
  from. Renders as a small "source ↗" chip beside the heading (new tab).
- `text` — optional. A string or an array of paragraph strings. Shown above
  the diagram. Supports inline markup (see below).
- `bullets` — optional array of bullet items. Each item is either a **string**,
  or an object `{"text": "...", "sub": [ ...items ], "revealAt": 1,
  "hideAt": 3}` whose `sub` list renders as an indented child list. Nesting
  may recurse. Items support inline markup. Reveal fields are optional; see
  "fragment-level reveals" below.
- `collapsed` — optional boolean. `true` starts this section's text and bullets
  collapsed; the heading, source chip, contract card, and diagram stay visible.
  Omit it for the expanded default. Viewers can still override either authored
  default, and copy links preserve that presentation choice.
- `contract` — optional message-contract card (next subsection).
- `diagram` — optional. A section may be prose-only, but usually carries one.

**Inline markup** (in `text`, `bullets`, and a contract card's `note`): a small,
safe subset, escaped first so it can never inject HTML.
- `**bold**` → bold, `*italic*` → italic, `` `code` `` → monospace.
  Italics use `*`, not `_`, so `snake_case` identifiers are left alone.
- `[label](https://url)` → an underlined link (new tab). Only `http`/`https`
  URLs become links; anything else renders as literal text.

**Bulleting style — match the source document.** A design doc (HLD) usually
carries its argument as layered bullets, not prose paragraphs. Reproduce that
structure rather than flattening it:
- Prefer **many specific bullets** over a few long ones, and lift the source's
  sub-points into nested `sub` lists (one parent claim, its supporting points
  under it) instead of comma-stringing them into one line.
- **Bold** the key term or the subject each bullet is about (a message field, a
  component, a state, "Goal:", "Alarm Event Recordings:"), and *italicize* the
  words that carry the emphasis (*every* state, *never*, *unchanged*).
- Put `code`/identifiers and permalinks inline where the source cites them, so a
  bullet reads like the doc it came from.

### message-contract card

`"contract": {...}` on a section renders a compact "on the wire" field table
between the prose and the diagram — for the payload or envelope the section's
flow moves:

```json
"contract": {
  "title": "On the wire: motion event (MQTT)",
  "source": "https://docs.example.com/wire.md#motion-event",
  "fields": [
    {"k": "type", "v": "\"motion\"", "g": "logical type; the broker maps it to a topic"},
    {"k": "eventId", "v": "0x1A2B3C4D", "g": "the dedup key", "hot": true,
     "link": "https://docs.example.com/src/mqtt.c#L61"},
    {"k": "ttl", "v": "30s", "g": "broker message-expiry", "delta": "changed"}
  ],
  "note": "Optional footer sentence shown under the table."
}
```

- `title` — optional card heading (rendered uppercase, like panel titles;
  defaults to "On the wire" when a `source` is given).
- `source` — optional permalink for the whole card; renders the same
  "source ↗" chip sections use (new tab).
- `fields` — required array of rows. Per row: `k` (REQUIRED — the field
  name, monospace), `v` (optional — an example value, monospace), `g`
  (optional — a plain-language gloss), `hot: true` (optional — visually
  emphasizes the row; use it for the one or two fields the argument hinges
  on), `link` (optional — a per-field permalink rendered as a small ↗ beside
  the key, new tab), `delta` (optional — `added`, `removed`, or `changed`;
  renders a green, red, or amber badge respectively, and a removed row is
  struck through), plus optional `revealAt` / `hideAt` step indices. Delta is
  intended to be **written by tooling** that compares spec versions, but is
  also hand-authorable. A row without `k` is skipped with a warning; a
  non-string `link` is ignored with a warning.
- `note` — optional footer sentence.

### fragment-level reveals

Object-form section bullet items, contract-card field rows, and diagram edge
objects accept `"revealAt": <step index>` and optional `"hideAt": <step
index>`. Indices are **zero-based** and bind to the `steps` array of the
diagram in that same section:

- Before `revealAt`, a bullet or contract row uses `visibility:hidden`: it is
  invisible but keeps its exact layout space. An edge is fully undrawn,
  including its halo, label, step coin, and packet dots.
- At `revealAt` and later the fragment renders normally. At `hideAt` and later
  it hides again. `hideAt` may be used without `revealAt` to show a fragment
  from the beginning and then remove it.
- Reveals bind **only in step mode**. Ambient mode always shows every fragment,
  as does a section without an active step player. Jumping or folding to any
  step recomputes visibility from the target index; it never depends on the
  route used to reach that step.
- The validator warns and ignores non-integer or negative indices; it also
  warns when `hideAt <= revealAt`, `revealAt` is outside the diagram's step
  count, or reveal fields appear in a section with no diagram steps.

## Diagram object

```json
{
  "view": "ambient",
  "nodes": {
    "api": { "title": "Nimbus API", "sub": "api gateway", "icon": "cloud",
             "tint": "cmd", "link": "https://docs.example.com/hld#api" }
  },
  "rows": [ ["console", "api", "dispatch", "registry"],
            ["broker", ["deviceA", "deviceB", "deviceC"]] ],
  "floats": [ { "id": "auth", "side": "above" } ],
  "edges": [
    { "from": "console", "to": "api", "kind": "https", "label": "POST /commands" },
    { "from": "deviceB", "to": "broker", "kind": "mqtt", "ret": true,
      "label": "PUBACK" }
  ],
  "steps": [
    { "edge": "console->api", "text": "Operator sends the command",
      "link": "https://docs.example.com/hld#step1" },
    { "edges": ["broker->deviceA", "broker->deviceB"], "text": "Fan-out to subscribers" }
  ]
}
```

### view

How the board opens. `"ambient"` (default — live animation, with an
AMBIENT/STEP toggle whenever `steps` exist), `"step"` (opens as the
click-through at step 1, paused by default), or `"ambient-only"` (no toggle; use
for boards without a meaningful sequence). One diagram spec always supports
both modes — repeating the same diagram in another tab with `"view": "step"`
gives readers a guided version at zero extra authoring cost.

### autoplay

Optional boolean on `diagram`, default `false`. Set `"autoplay": true` to
advance every three seconds when step view opens, including when the reader
chooses STEP from ambient mode. Applies to every path in the diagram. It does
not select step view itself; pair it with `"view": "step"` to play on page load.

The controls visibly show **Playing · 3s / step**, **Paused**, or **Finished**,
with labeled Play / Pause / Replay actions. Choosing a step, an arrow, or a
path pauses advancement. Switching diagram tabs resumes only if the sequence
was playing when hidden; a manual pause persists. Leaving the browser tab pauses
until Play is pressed. A deep link to a specific step opens paused.

Reduced motion disables automatic advancement and explains the disabled Play
button; arrows and step chips still work. A one-step path also has no automatic
playback. Pausing advancement does not freeze animations inside the current step.
Workbench and Confluence configuration previews always start paused; published
standalone pages and the Confluence viewer respect the authored setting.

In the workbench, use **Steps → Playback settings** to choose the opening view
and toggle **Autoplay when opened**. Existing specs with no `autoplay` field now
open paused in the current renderer. To retain their earlier automatic behavior,
add `"autoplay": true`. No schema version flag is required; rebuild older
self-contained HTML exports to use the updated controls.

### nodes

Map of node id → card. Ids are short lowercase tokens (letters/digits), used in
`rows`, `floats`, `edges`, `steps`. Fields, all optional except that a card
with no `title` shows its id:

- `title` — display name, ~16 characters max (the card is fixed-width).
- `sub` — one-line detail under the title (a role, a topic, a port). Monospace;
  ~20 characters max.
- `icon` — one of: `terminal cloud shield gear db antenna thermo pump router
  package key server chip phone`. Default `gear`. Pick the closest metaphor
  (db = storage, antenna = broker/radio, chip = embedded device, key = signing,
  shield = auth, server = backend service, terminal = console/UI).
- `tint` — icon-chip color role, one of: `cmd auth data mqtt dev`. Default
  `cmd`. Convention: `cmd` = main-path services, `auth` = auth/signing,
  `data` = stores, `mqtt` = brokers, `dev` = end devices.
- `link` — optional permalink URL for this component (from the design doc).
  Renders a small clickable ↗ on the card corner (new tab).
- `group` — optional containment-boundary membership (see "groups").

### groups — containment boundaries

Declare `"groups": {"doorbell": {"title": "Doorbell unit"}}` at the diagram
level and tag member nodes with `"group": "doorbell"`. The engine draws a
dashed, titled boundary box around all members — a device that holds two
chips, a VPC around services. Rules:

- Place group members ADJACENTLY — one stack column works best (the boundary
  is a bounding box over member positions, not a layout constraint).
- An edge between two members of the same stack column draws as a straight
  vertical interconnect (an interrupt line between chips).

Set a group's `parent` to another declared group key to nest it inside that
group. The outer box wraps its direct member nodes and child boxes; each box
keeps its own dashed border, title, and optional icon. A node names only its
innermost group. Keep members of one nested family adjacent in rows: the same
bounding-box rule applies at every level.

```json
"groups": {
  "house":  {"title": "Home", "icon": "house"},
  "living": {"title": "Living room", "parent": "house"},
  "garage": {"title": "Garage", "icon": "car", "parent": "house"}
},
"nodes": {
  "cam": {"title": "Camera", "group": "living"},
  "tv":  {"title": "TV",     "group": "living"},
  "car": {"title": "EV",     "group": "garage"},
  "hub": {"title": "Hub",    "group": "house"}
}
```

### rows — layout by flow order (no coordinates)

Optional `diagram.routing: "lanes"` routes connectors along reserved tracks
between rows and channels around cards. It spreads ports and scores crossings
and coincident segments; dense graphs can still cross, with visual breaks at
intersections. Supports 1–5 unstacked cards per row, no floats or self-loops.
Unsupported layouts fall back to curves with a warning. Authored edge bends
are ignored in lanes mode; label offsets remain available. Omit routing or use
`"curves"` for existing behavior. Honeycomb imports generate dependency rows
(at most four cards per row), retaining service cycles and all relationships.
Their row order describes dependencies, not elapsed time. A **Readable size**
button enlarges the board for horizontal scrolling; **Fit width** restores it.

`rows` is an array of rows; each row is an array of slots **in flow order**.
The engine computes all positions:

- A slot is a node id, or an **array of node ids = a stack**: one column whose
  members stack vertically. Use a stack for fan-out targets (the devices a
  broker publishes to).
- Even-index rows lay out left→right; odd-index rows right→left. This makes a
  serpentine: a long sequence reads row 1 across, wraps down, and continues.
- The **wrap edge** (from the last slot of one row to the first slot of the
  next) is detected automatically and drawn as a large curve around the row
  edge. Just declare the edge normally.
- Keep 3–5 slots per row. Split a sequence longer than ~5 hops onto more
  rows — two or three rows are both normal shapes, and the serpentine
  keeps the reading order. The crowding signal to watch is the
  edges-crossing-a-corridor lint, not the row count.
  Stacks of 2–4 members work well.

### floats — branch nodes

Nodes that sit off the rows: an auth service a request round-trips to, a
signing service, a terminal alarm state. `{"id": "auth", "side": "above"}`
draws it above the first row; `"side": "below"` draws it under the last row.
Do not also place the id in `rows`. The engine positions each float
horizontally between the nodes its edges touch, and floats sharing a side are
spread apart automatically so they cannot overlap.

Optional `dx` / `dy` (numbers, px) manually nudge a float from its computed
spot — a below float pinned under a tall last row can be raised into the
inter-row gap with a negative `dy` (and shifted with `dx`). Like `bend` /
`labelDx`, set these only to fix a specific rendered placement.

An edge between a float and a row node attaches on the side each faces
vertically: a float below its partner connects to the partner's bottom, a
float above connects to its top. An arrow into a float lands at the center
of the float's facing edge; when a card sits in the way of every centered
route, that arrow attaches at the float's near corner instead so the path
can route around the card.

### edges

Directed arrows between placed nodes:

- `from`, `to` — node ids. Required.
- `kind` — the **protocol** of the hop (see "Edge kinds"). Default `int`.
- `ret` — `true` marks a response/acknowledgment: drawn as a fine dash in the
  protocol's color (a request/response pair is a normal edge one way and a
  `ret` edge back).
- `label` — optional short text on the edge. Protocol verbs and topics read
  best: `POST /commands`, `PUBLISH cmd/site-4/pump-7`, `verify JWT`. Keep
  under ~28 characters.
- `bend` (number, px), `labelDx`, `labelDy` (numbers, px) — optional manual
  overrides. The engine de-crowds automatically: edges sharing a node side fan
  their attach points apart, a forward/return pair between the same two nodes
  bows apart, same-row edges that skip over a node arc above the row, and
  labels are nudged off nodes, step coins, paths, and each other after
  measuring. **Omit these fields**; set them only when a rendered page still
  shows a collision (an author-set value wins and switches that label/edge out
  of the automatic pass).
- `revealAt`, `hideAt` — optional zero-based fragment reveal indices; see
  "fragment-level reveals". A hidden edge is fully undrawn in step mode.

### Edge kinds (protocols) and the legend

Line style is keyed to protocol, not position: every MQTT edge draws the same
everywhere. A legend is generated automatically from the kinds you use. The
built-in kinds:

| kind     | legend label   | meaning                                        |
|----------|----------------|------------------------------------------------|
| `https`  | HTTPS          | external HTTP/HTTPS calls                      |
| `int`    | service call   | internal service-to-service call               |
| `mqtt`   | MQTT           | pub/sub broker traffic                         |
| `sqs`    | SQS            | Amazon SQS queue send/receive                  |
| `rmq`    | RabbitMQ       | RabbitMQ (AMQP) queue/exchange traffic         |
| `pulsar` | Pulsar         | Apache Pulsar topic traffic                    |
| `tls`    | TLS            | a raw/persistent TLS channel (not plain HTTPS) |
| `ws`     | WebSocket      | WebSocket connection traffic                   |

Pick the kind that names the ACTUAL mechanism: a message on an Amazon SQS
queue is `sqs`, never a generic `int`; a long-lived TLS control channel is
`tls`; `https` stays for request/response HTTP calls. To use a protocol not
listed (gRPC, Kafka, NATS...), declare it in `page.protocols`, e.g.
`"grpc": {"label": "gRPC", "color": "#7BD88F"}`, then use `"kind": "grpc"`
on edges. Undeclared kinds fall back to `int` with a warning.

### panels — synchronized inspector widgets

`"panels": [...]` at the diagram level declares inspector widgets rendered in
a column beside the board and driven by the same steps (the "different
perspectives" of one timeline). Types:

- `state` — a state-machine readout plus a chip rail:
  `{"id":"hp","type":"state","title":"...","states":["OFF","BOOT","RUN"],
  "colors":{"RUN":"#38E1FF"},"initial":{"state":"OFF"}}`. Patched via
  `{"state": "<value>"}`.
- `leds` — indicator dots: `{"id":"leds","type":"leds","leds":[{"id":"radio",
  "label":"RADIO"}],"initial":{"radio":"on"}}`. Patch values per led id:
  `on` `off` `tx` `rx` (tx/rx pulse).
- `gauge` — numeric bar: `{"id":"pw","type":"gauge","unit":"mA","max":400,
  "initial":{"value":2}}`. Patched via `{"value": <number>}`.
- `replicas` — aligned positions for replicas, event consumers or device/cloud
  copies. Declare 1–8 unique string ids:
  `{"id":"copies","type":"replicas","unit":"records","replicas":[
  {"id":"primary","label":"Primary"},{"id":"remote","label":"Remote"}],
  "initial":{"reference":{"series":"orders/applied/history-a","position":104},
  "replicas":{"primary":{"series":"orders/applied/history-a","position":104,
  "role":"primary","status":"online","lagMs":0,"observedAt":"example t=0"},
  "remote":{"series":"orders/applied/history-a","position":101,"status":"unknown"}}}}`.
  Patch `reference` (object or null), `replicas` (map or null), and optional
  `note` text. These fields replace WHOLE previous objects/maps; omitted
  replica ids in a new map become unknown. Omit a field to carry it forward;
  `enterOnce` is current-step only. Null resets to unknown, never zero.
  Each record supports `position` (non-negative safe integer or null),
  `series` (non-empty string identity or null), `role` (text),
  `status` (`online|offline|unknown`), `lagMs` (finite non-negative number or
  null), and `observedAt` (text label describing the observation time).
  Positions compare ONLY when both position/series pairs are known and their
  series strings match exactly. Name the same history, partition, branch and
  position meaning; received and applied cursors must not be mixed silently.
  Different series keep their numeric labels but do not enter the ruler.
  The ruler's range is the minimum/maximum comparable position plus reference
  at this step; equal-only positions sit at its center. It is a position
  window, not a percentage of data replicated. `unit` defaults to `positions`.
  Numeric distance is reported separately from supplied milliseconds of lag.
  Missing lag stays unknown even at the reference; lag is not a catch-up
  estimate. Availability and observation time remain independent. Equality
  proves neither commit nor read safety nor quorum. Use `checks` for explicitly
  sourced read/write policy outcomes. This panel does not elect a leader,
  simulate consensus, compare opaque LSN/version strings, or infer freshness.
  See [replication recipe](../cookbook/replica-positions.md).
- `table` — a data snapshot for database records, cache entries, payloads,
  or desired/reported device state. Declare 1–4 columns with unique string
  ids: `{"id":"data","type":"table","title":"Order record",
  "columns":[{"id":"key","label":"Field"},{"id":"value","label":"Value"}],
  "initial":{"rows":[]}}`. Patch `{"rows":[{"id":"status",
  "cells":{"key":"status","value":"accepted"},"status":"changed"}],
  "note":"Committed before publication"}`. Each row needs a unique string
  `id` and `cells` keyed by column id; cell values are strings, numbers,
  booleans, or null. Missing cells show an em dash; explicit null shows
  `null`. Row status is `neutral` (default), `added`, `changed`, or `removed`;
  removed rows stay visible with a strike-through. Badges are AUTHOR-DECLARED,
  not a computed diff. Every `rows` patch REPLACES the full snapshot; use
  `[]` to clear it. At most 12 rows render; larger inputs warn. The table
  scrolls inside its card. Optional `note` persists until replaced/cleared.
- `checks` — authored decisions and invariants for authorization, idempotency,
  rollout gates, or hardware interlocks: `{"id":"gate","type":"checks",
  "checks":[{"id":"scope","label":"Caller authorized"}],
  "initial":{"results":{"scope":{"status":"pending"}}}}`. Declare 1–12
  checks with unique string ids. Patch `{"results":{"scope":{"status":"pass",
  "detail":"Required scope present"}},"note":"Proceed to storage"}`.
  Status is `pending` (default), `pass`, `fail`, `warn`, or `skip`; detail is
  optional supporting text. The summary counts only explicit passes. This
  displays the source's stated outcome; it DOES NOT execute rules or verify
  the design. A `results` patch REPLACES the entire result map; omitted ids
  become pending. No patch preserves the previous map. Use `{}` to reset.
- `budget` — upper-bound comparisons for latency, memory, queue depth, power,
  bytes, or cost: `{"id":"limits","type":"budget","metrics":[
  {"id":"ram","label":"Staging memory","unit":"KiB","max":64,"warn":48}],
  "initial":{"values":{"ram":null}}}`. Declare 1–6 metrics with unique
  string ids and a finite positive `max`; optional `warn` is an ABSOLUTE
  threshold in the same unit, from zero through max. Patch
  `{"values":{"ram":52},"note":"Image staged"}`. Values must be finite,
  non-negative numbers, or null for no data. Missing values show NO DATA,
  never zero. At warn: NEAR LIMIT; at max: AT LIMIT; above max: OVER LIMIT.
  Bars saturate at 100% while the actual value and excess remain visible.
  Without `warn`, no warning threshold is inferred. A `values` patch
  REPLACES the full map; include every metric known at this step. Missing
  limits show NO LIMIT. Only upper-bound resource usage is supported; do
  not use for lower-bound availability targets. Limits and values must come
  from the source; label fictional/illustrative examples explicitly.
- `log` — appending monospace event lines: `{"id":"log","type":"log",
  "tags":{"NET":"#38E1FF"}}`. Patched via
  `{"log":[{"tag":"NET","text":"line"}]}` — log patches APPEND. Log panels
  ALWAYS render at the BOTTOM of the panel column regardless of declaration
  order, and the body is fixed-height (scrolls internally, newest lines kept
  in view) — the one growing widget can never shift the widgets or step
  controls around it.
- `queue` — a mailbox slot showing a message enqueued, held, then dequeued
  (e.g. a low-power chip holding a command in its mailbox while a bigger chip
  boots): `{"id":"mbx","type":"queue","title":"Sentry LP — mailbox",
  "initial":{"state":"empty"}}`. Patched via
  `{"state":"empty|enqueue|held|dequeue", "label":"STREAM cmd",
  "from":"Relay · MQTT", "to":"→ Vision HP",
  "reason":"holding for Vision HP — booting"}` — `enqueue` animates the
  labeled message arriving in the slot, `held` shows it resting (subtle
  pulse; the state to carry across several steps), `dequeue` animates it
  leaving toward its consumer, `empty` shows the empty slot. The three
  optional context strings make the handoff explicit in the widget itself:
  `from` renders under the arrival arrow during `enqueue` (where the message
  came from), `to` renders under the departure arrow during `dequeue` (who
  takes it), and `reason` renders as a waiting-on line while `held` — patch
  `reason` alone on later held steps to narrate progress (e.g. "wake IRQ
  raised", then "booting"). Set `label` once at `enqueue`; all four are
  carried until changed, and only the state-relevant context renders. An
  unknown state token falls back to `empty` and a non-string `from`/`to`/
  `reason` is ignored (both with validator warnings). Under reduced motion
  the message and its context labels render statically; in print the held
  state shows the label and the reason line.
- `screen` — a camera viewfinder: `{"id":"cam","type":"screen",
  "scene":"person-at-door-night","initial":{"mode":"off"}}`. Patched via
  `{"mode":"off|boot|live|rec|save", "banner":"<save-banner text>"}`. Stock
  scenes: `person-at-door-night`, `person-through-door`, `doorbell-run-away`,
  `doorbell-runners`, `package-drop`, `kitchen-fire`, `static-noise`. `rec` shows
  a blinking REC dot; `save` shows the banner. All stock scenes use full-color
  artwork under every skin; `static-noise` uses a color test pattern with
  interference during boot. Existing scene names work without a new field;
  rebuild older exported HTML with the current template to update its artwork. Scenes
  animate while shown: `person-at-door-night` walks a figure in;
  `package-drop` plays a delivery (courier walks in carrying a box, the
  package lands, the courier leaves; reduced motion shows the delivered
  package only). `person-through-door` plays a 6.8-second entry: a person
  approaches, the door swings open, they cross the threshold, and it closes.
  `doorbell-run-away` shows one person sprinting away from a wide-angle doorbell
  camera, shrinking down the front path and turning along the sidewalk.
  `doorbell-runners` shows two people in different colors, with staggered
  strides, splitting left and right at the sidewalk. Both are one-shot clips
  lasting about eight seconds; the porch stays empty afterward. Reduced motion
  and print show a mid-run still. The Screen scene picker previews both clips.
  `kitchen-fire` loops layered flames, rising smoke, embers, and reflected
  light around a stove. These are simulated SVG clips, with no video assets
  or external requests. Reduced motion and print hold a readable still of
  the entry or fire. LIVE → REC → SAVE preserves the same clip's animation;
  returning from OFF/BOOT restarts it. A different scene replaces the clip.
  Scene timing is independent of recording: patch `scenePlayback:"waiting"`
  to show the quiet setting before an event (empty doorway or porch, no delivered
  package, or a kitchen without fire/smoke). Set `mode:"rec"` in that same
  step or earlier; the REC indicator runs while the scene waits. In a later
  step, patch only `scenePlayback:"playing"` to start the clip while recording
  continues. Both fields carry along the selected path. For example:
  `{"panels":{"cam":{"mode":"rec","scenePlayback":"waiting"}}}` then
  `{"panels":{"cam":{"scenePlayback":"playing"}}}`.
  Omitted `scenePlayback` defaults to `playing`, preserving existing specs.
  `waiting` resets the event; returning to `playing` starts it again. Further
  playing steps and mode/banner changes keep the current clip running.
  Direct jumps into a waiting step show the quiet scene; direct jumps into
  a playing step start the event if the scene was not already playing.
  OFF and BOOT keep their usual presentation regardless of scene playback.
  In the workbench, select a screen panel and choose **Screen scene**. The
  inline preview and **Replay clip** work even when the story camera is OFF;
  replay affects only that preview. In the step's screen patch editor, use
  **Scene event → Before event / Play event** independently of **mode**.
  **Inherit** removes only this step's override. Try **starters… → screen clips**
  for a recording that starts at step 3 and captures the event at step 4.
- `trace` — observed service internals and wall-time coverage:
  `{"id":"inside","type":"trace","title":"Inside the service",
  "spans":[{"id":"request","service":"api","name":"handle request",
  "startMs":0,"ms":100},{"id":"parse","parentId":"request",
  "service":"api","name":"parse input","startMs":5,"ms":20}],
  "initial":{"selected":"request"}}`. Accepts 1–200 spans with unique
  string IDs, required `service` and `name`, finite non-negative `startMs`
  and `ms`, optional `parentId` and `error:true`. All offsets share an origin.
  Patch `{"selected":"<span id>"}` to inspect a span; sparse selection and
  `enterOnce` use normal panel folding. A missing/null selection defaults to
  the earliest span; an unknown ID shows **Timing unavailable**.
  The selected span shows inclusive duration, the union of clipped direct-child
  intervals (child-covered time), and the uncovered remainder. Do not label
  that remainder CPU time: it can include local work, waiting, or missing
  instrumentation. The service's coverage is also a union, not the sum of
  nested span durations. Internal rows preserve their offsets, IDs, parent
  relationships and recorded errors; direct children distinguish same-service
  operations from other services. When steps select spans, the service picker
  and operation buttons navigate to the first corresponding step and update
  the board and other panels. An unselectable authored row remains read-only.
  Invalid/duplicate/cyclic span data refuses timing calculations. Missing
  parents and out-of-parent intervals remain inspectable with visible notices.
  Clipping affects coverage only; original timing rows remain unchanged.
  Focused imports also record `page.traceImport` provenance: trace ID,
  source/included span counts, focus kind/value, omitted counts, boundary spans,
  view timing offset and bounded ancestor breadcrumbs. Its visible section
  bullets explain the same cut. Focus retains every exported descendant of
  included spans; see [the trace import guide](../docs/trace-import.md) for
  local preview, focus and source recovery. Omitted spans are not embedded in
  the saved spec; this metadata does not assert source completeness.
- `waterfall` — latency spans on one shared scale (a timing budget):
  `{"id":"lat","type":"waterfall","title":"Latency budget",
  "spans":[{"id":"irq","label":"IRQ + wake","ms":70}, ...],
  "initial":{"reveal":0}}`. Patched via `{"reveal": <spans shown>,
  "highlight": "<span id>", "total": "<override label, e.g. 640 ms p95>"}`.
  Spans draw Gantt-style: each starts where the previous ended; the total line
  shows the revealed sum unless `total` overrides it.
  For traces and concurrent work, each span may carry `startMs` (finite,
  non-negative milliseconds from a shared origin) and `error:true` (a
  recorded error, shown with an exclamation mark). Explicit offsets preserve
  nesting and overlap. A span without `startMs` starts at the preceding
  span's end. When any offset is present, the total is the furthest revealed
  end time, labeled **elapsed extent**, NEVER the sum of nested durations.
  All spans use the furthest overall end as the scale. Long offset-based
  waterfalls scroll inside the panel; hover a row for full name, offset,
  and duration. `highlight` selects a span without hiding the rest.
- `orbit` — a state machine on a ring: `{"id":"conn","type":"orbit",
  "states":["ONLINE","OFFLINE"],"colors":{"ONLINE":"#4ADE80"},
  "initial":{"state":"ONLINE"}}`. Patched via `{"state":"<value>",
  "via":"<transition label>"}` — the current state enlarges and pulses; `via`
  prints under the center readout.
- `zoneframe` — a camera frame (320×180 coordinate space) with zone polygons
  and a subject dot: `{"id":"yard","type":"zoneframe","zones":[{"id":"walk",
  "label":"walkway","state":"armed","points":[[128,150],[148,98],[176,98],
  [198,150]]}, ...]}`. Zone states: `armed` (green), `ignored` (gray dashed),
  `masked` (crosshatch). Patched via `{"zones":[{"id":"walk",
  "state":"ignored"}], "subject":{"x":150,"y":140},
  "verdict":"alert|suppress|never-captured"}` — `verdict` renders a banner
  across the frame. NOTE: a `zones` patch REPLACES the whole zones state
  array (list only the zones you set; unlisted zones revert to their declared
  state).
- `pir` — an IR/PIR sensor's field-of-view cone with a subject, for
  line-of-sight / wake-on-motion arguments (does an approach trip the sensor?):
  `{"id":"los","type":"pir","title":"IR line of sight","sensor":{"x":298,"y":78},
  "cone":{"facing":175,"spread":66,"range":250},"path":[[285,176],[285,92]],
  "initial":{"subject":{"x":285,"y":170}}}`. The frame is 320×180. `sensor` is
  the mount point (default right-mid). `cone.facing` is degrees measured
  clockwise from +x in screen space (y down): 0=right, 90=down, 180=left,
  270=up; `spread` is the full cone angle in degrees; `range` is its reach.
  Optional `path` draws a faint dashed walkway. Patched via `{"subject":{"x":..,
  "y":..}, "banner":"...", "status":"...", "tripped":true|false}`. The engine
  COMPUTES whether the subject falls inside the cone and colors it and the
  status pill (amber "IR TRIPPED" vs gray "IR CLEAR") accordingly — move the
  subject across steps to animate an approach. `status` overrides the pill
  text; `banner` renders a message across the ground strip; `tripped` forces
  the computed result when you need to assert it. Use it to show an approach
  from the side that never enters the cone, or one that trips it. The widget
  is animated: the subject GLIDES from its previous position on a step change
  (leaving a fading trail), a sweep beam scans the cone, the sensor emits
  ping rings, and the moment the subject first trips the cone flashes and a
  ripple fires at the subject (one-shot on the clear→tripped transition, not
  on every step while tripped). All motion is suppressed under
  prefers-reduced-motion.
- `thermo` — a temperature readout against warning / critical-shutdown
  thresholds, with a per-step history sparkline:
  `{"id":"die","type":"thermo","title":"Vision HP — die temp","unit":"°C",
  "min":20,"max":110,"warn":75,"crit":95,"initial":{"value":28}}`. Patched via
  `{"value": <number>, "label":"<zone-chip override, e.g. HP CORE OFF>"}`.
  The engine COMPUTES the zone from the value against the thresholds — green
  NOMINAL below `warn`, amber WARNING at/above `warn`, red CRITICAL at/above
  `crit` (both inclusive; reversed thresholds are swapped with a validator
  warning) — and colors the readout, the fill bar, and the zone chip
  accordingly; `label` replaces only the chip text, never the computed zone.
  The bar shades the warn/crit bands and marks both thresholds with ticks and
  scale numbers. A sparkline plots EVERY step's folded `value` as a faint
  frame and reveals the bright line + dots up to the current step, so
  clicking through steps tells the thermal story and any step jump renders
  consistently; the fill bar and numeric readout animate between steps
  (static under reduced motion). Omit `value` to render a dash (`NO DATA`).
  Use it to argue a thermal envelope: one chip climbs through `warn`
  (throttle), hits `crit` (powers down mid-task), and cools back below
  re-arm while the always-on chip keeps the device talking — pair it with a
  `state` panel for the power state and a `queue` panel for what waits.
- `battery` — a charge level where LOW is bad (the inverse of `thermo`'s
  zones), with a battery glyph and a per-step history sparkline:
  `{"id":"batt","type":"battery","title":"Perch — battery","low":20,
  "crit":10,"initial":{"charge":86,"source":"cells"}}`. Patched via
  `{"charge": <0–100>, "trend":"charging|draining|idle",
  "source":"solar|wired|poe|cells", "cold":true|false,
  "note":"<forecast text, e.g. ~34 days left>", "label":"<zone-chip
  override>"}`. The engine COMPUTES the zone — green NOMINAL above `low`,
  amber LOW at/below `low`, red CRITICAL at/below `crit` (both inclusive;
  `crit` above `low` is swapped with a validator warning) — and colors the
  readout, the glyph fill, and the zone chip; `label` replaces only the chip
  text (e.g. `"PRESERVE"` in preservation mode). `charging` shows a bolt,
  `cold: true` a snowflake (cold-limited charging); `source`/`trend`/`note`
  render on a fixed-height context row, so patching them never reflows the
  panel. Charge clamps to 0–100; non-finite numbers are ignored with a
  validator warning and render as NO DATA; a no-data step leaves a gap in
  the sparkline. Use it to argue an energy budget: solar input vs event
  load, a two-year drain forecast, or a cold snap limiting charge.
- `buffer` — a segmented buffer strip for pre-roll rings, store-and-forward
  queues, and storage rotation: `{"id":"ring","type":"buffer","title":
  "Pre-roll ring","segments":12,"capacity":"6 s"}`. Patched via
  `{"cells":["buffered","buffered","protected","uploading","uploaded",
  "dropped", ...], "head": <write index>, "note":"<one-line caption>"}`.
  `segments` (2–48, default 12) is declared once; a `cells` patch REPLACES
  the whole array (like `zones`) — list every cell you set, missing tail
  cells render `empty`, unknown tokens fall back to `empty` with a validator
  warning. `head` draws a pulsing write marker over that cell (out-of-range
  hides it, with a warning). Instead of retyping `cells`, a patch may PAINT
  ranges: `"mark": [[i0, i1, "state"], ...]` applies inclusive index ranges
  over the current cells, and mark ops ACCUMULATE across steps (folded like
  `log`, so any step jump replays the full paint history); `"label"` is an
  accepted alias for `note`. Prefer `mark` for progressive stories, `cells`
  for a wholesale reset. The footer summary ("3 buffered · 1 protected")
  is COMPUTED from the cells; `capacity` prints beside it; `note` is a
  fixed-height caption line. Cell colors: `buffered` cyan, `protected`
  amber, `uploading` violet (pulses), `uploaded` dimmed green, `dropped`
  red. Use it to argue: a ring buffer wrapping (advance `head` per step and
  flip old cells to `overwritten`-equivalent `empty`), an offline
  store-and-forward that back-fills (`buffered` → `uploading` → `uploaded`
  after reconnect), or rotation sparing `protected` events.
- `radar` — a top-down range view for radar/mmWave arguments: distance
  rings inside a wedge, an alert-threshold arc, named zone polygons, and a
  tracked subject: `{"id":"rng","type":"radar","title":"Radar — approach",
  "sensor":{"x":160,"y":168},"facing":270,"spread":120,"range":150,
  "threshold":80,"rings":3,"zones":[{"id":"porch","label":"porch",
  "points":[[120,100],[200,100],[200,160],[120,160]]}]}`. The frame is
  320×180 (y down); `facing`/`spread` follow the `pir` convention (degrees
  clockwise from +x; `spread` ≥ 360 draws full circles). Patched via
  `{"subject":{"x":..,"y":..}, "banner":"...", "status":"...",
  "alert":true|false, "threshold": <re-tuned alert distance, same units as
  the declaration>}`. The engine COMPUTES the subject's distance, whether
  it is inside `threshold` (amber RANGE ALERT pill vs gray CLEAR; `alert`
  forces it), and which zones contain the subject (point-in-polygon —
  occupied zones light up). POLAR AUTHORING: declare
  `"scale":{"pxPerUnit":18,"unit":"m"}` and write real units instead of
  pixels — `range`, `threshold`, and a `rings` ARRAY (e.g. `[1,2,3,4]`) are
  then unit distances, a zone may be an annular sector
  `{"id":"desk","r":[1.0,2.4],"deg":[190,230]}`, and a subject may be
  `{"r":1.8,"deg":210}` (same clockwise-from-+x degrees); the engine
  converts everything to frame pixels at the model boundary. Pick
  `pxPerUnit` so `range × pxPerUnit` fits the frame from the sensor
  position. The subject's positions across steps draw an
  engine-derived dotted track (revealed up to the current step; a step with
  no subject breaks it; a parked subject adds nothing), and the subject
  GLIDES between steps with a one-shot ripple on the clear→alert
  transition. Use it for: distance-gated alerting (nearer than N), a visit
  path map, multi-zone room presence, or approach-before-camera-wake
  sequencing — pair with `pir` when the argument is a binary cone trip
  instead of distance.
- `homemap` — a 320×180 top-down home with independently patched devices.
  Set `diagram.primaryPanel` to this panel's id (for example `"home"`) to
  make it the centerpiece: a large map, playback directly underneath, other
  panels alongside or below, and a collapsed **Data flow** disclosure below.
  This optional presentation works with any declared panel; missing/unknown
  ids retain the normal layout. Renaming or deleting a panel in the workbench
  updates the reference. No schema-version opt-in is required.
  Published pages and the workbench offer **Home / Data flow** to switch the
  main view live while retaining the selected path, step, widget state, and
  playback. This control also appears for a sidebar homemap without
  `primaryPanel`; it uses the first homemap. An explicit centerpiece takes
  precedence (other widget types use their title instead of Home). The spec
  sets the opening layout; switching does not mutate it. The timeline follows
  the main view, and secondary panels stack below it on narrow screens.
  With a saved `diagram.sectionLayout`, the custom arrangement replaces the
  Home choice. Set `diagram.layoutName` to a nonempty string of up to 40
  characters to name that view (default **Layout**); **Data flow** remains the
  second choice. Hide/Show data flow is a temporary reader control within the
  arrangement and keeps panels and step controls visible. See
  [section layouts](../docs/section-layouts.md) for the tile/profile contract.
  Example panel:
  `{"id":"home","type":"homemap","outline":{"w":300,"h":164},
  "devices":[{"id":"cam","kind":"camera","label":"Porch cam",
  "x":46,"y":40,"facing":35,"spread":80,"range":70},
  {"id":"door","kind":"entry","label":"Front door","x":160,"y":158},
  {"id":"hub","kind":"hub","label":"Hub","x":160,"y":92}],
  "initial":{"cam":"scan","door":"closed","hub":"idle"}}`.
  The rounded outline defaults to 300×160. Optional `outline.x` and `outline.y`
  position its top-left corner; each omitted axis centers independently. Size
  clamps to w:20–320 and h:20–180, and position clamps to keep the house in the
  frame. Non-finite x/y warns and centers that axis. Resizing the outline does
  not move rooms or devices. Device coordinates are frame pixels (x right, y down).
  Camera `facing` is degrees clockwise from
  +x and defaults toward frame center; `spread` defaults to 80 (clamped
  10–180), `range` to 70 (clamped 20–160). Kinds and states: camera
  `scan` (default), `sleep`, `detect`, `rec` (sweep stays live and a red recording light blinks), `off`; entry `closed` (default),
  `open`, `alert`; sensor `ok` (default), `warn`, `alert`, `off`; hub
  `idle` (default), `rx`, `tx` (loops a small outgoing-transmission wave while the state holds), `alert`. Sensors accept an `icon` from the shared
  icon set (default/fallback `gear`). Devices have a marker and label;
  state is conveyed by its appearance and animation, with name/state text in
  its hover title instead of a visible state chip. Optional `rooms:[{label,x,y,w,h}]` adds named rectangular
  areas behind the devices. Room coordinates use the same frame; rectangles
  must have positive size and fit inside 320×180, otherwise they warn and are
  ignored. Optional room `kind:"outdoor"` draws a green area with a dashed
  boundary beneath the house outline; omitted/`"room"` draws an indoor room
  above it. Outdoor areas can span the whole plot, including behind the house.
  Objects strictly inside the house outline do not tint outdoor areas; objects
  on its exterior threshold still count outside. Unknown kinds warn and render
  as rooms. Rooms are presentation boundaries, not simulated physical walls.
  Their lighting reflects contained devices/visible subjects: `alert`/`detect`
  takes priority over `warn`, then occupancy, then quiet. This appearance does
  not change any device state. Shared room boundaries belong to the room on
  the right/bottom; the outer frame edges are inclusive.
  For a floor-plan door, declare an entry device with `display:"door"`.
  Its x/y is the hinge; `facing` is the closed leaf direction, clockwise from
  +x (default 0). `doorWidth` defaults to 24 (clamped 8–48). `doorSwing`
  defaults to 90; signed angles from -135 to -15 or 15 to 135 are accepted,
  with positive clockwise. Invalid/non-finite swing warns and uses 90.
  Example: `{"id":"front-door","kind":"entry","display":"door",
  "x":164,"y":108,"facing":270,"doorWidth":30,"doorSwing":90}`.
  This places a vertical closed door that swings inward to the right. The
  renderer draws the wall opening, jambs, hinge, leaf, handle and swing arc;
  place the hinge on the desired outline/room wall. Patch its ID to `open`,
  `closed`, or `alert` using ordinary entry states (`alert` stays physically
  closed). Geometry is shared across all paths; state follows the selected
  path. Omitted/`"marker"` display preserves the existing entry icon. `door`
  on other device kinds warns and uses a marker. Door geometry scales with
  the taller floor plan while labels stay upright. Doors do not simulate
  collisions, locks, or camera occlusion; author subject movement explicitly.
  Patch DEVICE IDS directly: `{"cam":"detect","signals":[{"from":"cam",
  "to":"hub"}]}`. Device states carry across steps; `signals` belongs
  only to its authored step and never carries. Static dashed direction arrows
  remain visible on paused step jumps and with reduced motion. Animated step
  paints add looping packets between declared endpoints, staggered by 250ms.
  Ambient mode uses `initial`, with scanning/detecting camera sweeps and
  no signal dots. Camera transitions into `detect` and entry transitions
  into `alert` and sensors entering `warn`/`alert` ripple once; a hub entering
  `rx` briefly glows. Entry devices swing between open and closed; active
  devices have breathing halos and local signal paths have flowing dashes.
  Reduced motion and print suppress all motion while keeping final device
  states, room tints, and signal direction readable. Invalid kinds,
  non-finite positions, and duplicate ids are ignored; unknown states use
  the kind default with a warning. `signals` is the sole reserved device
  id. Unlike the general folding rules below, homemap treats `log`, `mark`,
  and `enterOnce` as ordinary device ids. Optional `subjects` declares moving
  actors: `[{"id":"walker","label":"Visitor","icon":"gear","x":20,"y":150}]`.
  Each subject needs a unique nonempty id distinct from device ids and
  `signals`, plus finite starting `x`/`y` in the same 320×180 frame (clamped
  to its bounds). Subject names default to the id and remain available in hover
  titles and editor controls. Their visible labels are hidden by default; set
  `showSubjectLabels: true` on the panel to display them (`false` or omission
  keeps them hidden; other types warn and keep labels hidden). Omit `icon` for a person avatar,
  or use a shared icon token (unknown icons warn and fall back to `gear`).
  `initial` and step patches address subject ids with objects:
  `{"walker":{"x":120,"y":60}}`; `{"walker":null}` hides the subject.
  Positions and hidden state carry across steps; invalid subject patches
  warn and are ignored. Visible subjects glide from the previous position
  on animated steps, with their optional label/icon and a short fading trail. Reappearing after
  hiding starts at the new position without a glide; reduced motion disables
  glides. Invalid subject declarations warn and are ignored.
  The workbench's **Home at this step** editor appears for every homemap even
  without a patch. It reads the selected path's inherited state, writes only
  the changed field, supports device state selectors, subject drag/tap placement
  and coordinates, hide/show/inherit, and device-to-device signals. Resetting
  to Inherit removes that field from this step. Shared source steps affect
  every path that references them. Dragging a device or room border/label in
  the placement map updates its declaration coordinates across all steps/paths,
  without changing any step patch or room occupants. Moves stay in the frame
  and commit as one undo action; Escape cancels. See [the editing guide](../docs/homemap-workbench.md).
- `signal` — link health for 1–6 named radio/wired links:
  `{"id":"net","type":"signal","links":[{"id":"wifi","label":"WiFi",
  "transport":"wifi"},{"id":"cell","label":"Cellular","transport":
  "cellular"}],"initial":{"wifi":{"state":"ok","bars":4}}}`. Transports:
  `wifi` `subghz` `thread` `zigbee` `zwave` `cellular` `poe` `ethernet`
  `ble` (renders as the row's tag). Patched PER LINK ID, like `leds`:
  `{"wifi":{"state":"ok|weak|retrying|lost|jammed", "bars":0–4,
  "note":"-79 dBm"}}` — a link patch replaces that link's whole status
  object; an unpatched link reads `ok` with no bars. Row color follows the
  state (green / amber / violet pulsing / red; `jammed` blinks the chip —
  distinct from `lost` because it is an active-denial claim). Use it for:
  wifi-drop-to-cellular failover, sub-GHz supervision and retries, mesh
  re-parenting, jamming detection raised over a surviving path.
- `tiles` — a device-fleet grid, one tile per device or rollout cohort:
  `{"id":"fleet","type":"tiles","title":"Cameras","tiles":[{"id":"front",
  "label":"Front Door"},{"id":"yard","label":"Yard"}],
  "states":["ONLINE","OFFLINE","UPDATING"],"colors":{"ONLINE":"#4ADE80",
  "UPDATING":"#A78BFA"},"initial":{"front":{"state":"ONLINE",
  "sub":"fw 2.1"}}}`. Up to 12 tiles. Patched PER TILE ID (like `leds`):
  `{"front":{"state":"UPDATING","sub":"fw 2.1 → 2.2"}}` — a tile patch
  replaces that tile's `{state, sub}`. The `states` list is the vocabulary:
  a state outside it renders the tile DIMMED with a dash (validator warns);
  when NO `states` list is declared, any state string is accepted and
  colors come only from the `colors` map,
  and an unpatched tile starts dimmed until its first patch — dim = "no
  claim yet", useful for devices not yet enrolled. `sub` is a fixed-height
  one-liner (battery %, firmware version, cohort name). Use it for:
  multi-camera health dashboards, staged firmware rollouts (tiles as
  cohorts: canary → wave → fleet), walk-test progress, coordinated-mode
  partial application.
- `inflight` — concurrent operations/messages as horizontal bars on one shared
  zero-based step axis: `{"id":"ops","type":"inflight","title":"In
  flight","lanes":[{"id":"a","label":"plan upload"}]}`. Declare 1–8
  unique lanes. Patch per step with `{"start":[{"lane":"a","label":"seq
  4182"}], "end":["a"], "mark":[{"lane":"a","state":"failed"}]}`.
  `start` opens a new bar in that lane at the current step; `end` closes its
  open bar; `mark` recolors the open bar with `ok`, `retry`, or `failed`
  (`ok` is the default). Operations in one patch are applied in that order:
  start, end, mark. Starting an already-open lane closes its current bar at
  that step and restarts it (with a validator warning); ending a lane with no
  open bar warns and is ignored. Unknown lane ids and state tokens also warn.
  The complete bar history is folded before rendering, so step jumps are
  consistent. Bars still open on the last step render open-ended. Because all
  lanes share the same axis, simultaneous bars visibly overlap horizontally.
- `timeline` — the passing of wall-clock time (minutes to hours) with periodic
  cadence beats and event dots: `{"id":"hb","type":"timeline","title":"Heartbeat
  — 6h window","span":"6h","cadence":{"every":"30m","label":"heartbeat"},
  "initial":{"now":"0m"}}`. Times read `"2h"`, `"90m"`, `"1h30m"`, `"45s"`, or
  a bare number of minutes. `span` is the whole axis; `cadence` draws a hollow
  beat dot at every interval (filled once the cursor passes it); declared
  `events` (`[{"at":"1h30m","label":"missed","kind":"ok|alert|info"}]`) and
  event patches draw dots above the axis. Steps patch `{"now":"2h30m"}` to
  sweep the cursor and `{"events":[...]}` to APPEND events (accumulating like
  log lines, so any step jump is consistent). To CONTRAST several rhythms
  whose cadences differ by orders of magnitude, declare `lanes` instead of
  `cadence`: `"lanes":[{"id":"ka","label":"MQTT keepalive","every":"30s"},
  {"id":"hb","label":"heartbeat","every":"1h"},{"id":"ota","label":"OTA
  check","every":"1d"}]` (max 4). Every lane shares one wall-clock axis and
  auto-picks a density regime — individual dots, a true-spacing tick comb, a
  solid band, or an empty row with a "next in …" promise — with a per-lane
  count badge, so a 30-second rhythm and a daily rhythm read at a glance.
  Steps may then also patch `{"miss":[{"lane":"hb","at":"3h"}]}` (appends) to
  flag an expected beat that never arrived (red marker on that lane), and
  events may carry `"lane":"hb"` to sit on a lane's row.
- `phone` — a small generic smartphone frame for flows that end by notifying
  a resident's phone: `{"id":"resident","type":"phone","title":"Resident
  phone","initial":{"clock":"9:41"}}`. `clock` is optional status-bar time
  text; it must be a string and is rendered verbatim. Patch with `{"notify":
  {"app":"Homestead","title":"Front entry","text":"A visitor was
  detected."}}` to push ONE notification, or make `notify` an array of those
  objects to push several in one step. `app` is required; `title` and `text`
  are optional strings. Entries in one array keep authored order, ahead of
  every earlier step. Notifications ACCUMULATE newest-step-first; patch
  `{"clear":true}` to dismiss the complete stack. If `clear` and `notify`
  share a patch, the clear happens first and the new entries remain. The
  rendered lock-screen-style stack shows at most three truncated cards and a
  `+N more` line for the rest. Its unread-count badge is COMPUTED from the
  complete stack size — never author a badge or count. With no notifications,
  the frame stays visible with a subtle `no notifications` placeholder. The
  stack is a pure fold of the target step, so deep links and non-adjacent jumps
  render the complete result immediately. On an adjacent step, only the newest
  card may enter once; unchanged markup uses the steady baseline and does not
  replay it. Reduced motion disables the entry, and print shows the folded
  frame statically. Bad notification shapes, non-string `clock`, `clear` values
  other than `true`, and unknown phone fields warn and are ignored.
- `xray` — nested encryption envelopes for who-can-read-what arguments:
  `{"id":"who","type":"xray","layers":[{"id":"tls","label":"TLS 1.3",
  "holder":"each hop"},{"id":"e2ee","label":"E2EE envelope","holder":"owner's
  phones"}]}` — outermost layer first. Patched via `{"hop":"<node title>",
  "layers":[{"id":"tls","open":true},{"id":"e2ee","open":false}]}` — open
  layers draw unlocked/dashed; the footer states whether the payload is
  readable at this hop (readable = every layer open). NOTE: a `layers` patch
  REPLACES the whole layers state array; unlisted layers revert to sealed.

Patches are SPARSE — a step carries only what changed. The engine folds
patches into complete per-step state at load time, so jumping to any step is
always consistent. An `"enterOnce": {...}` sub-object inside a patch applies
only at its own step and is not carried forward.

### steps — the narrative (powers BOTH modes)

An ordered array walking the flow. Each step:

- `edge`: `"from->to"` (matching an edge's `from`/`to` ids exactly), **or**
  `edges`: an array of such keys for hops that happen together (a fan-out, a
  request+response round trip). Multi-edge steps fire their packets in list
  order, staggered — a two-hop delivery reads as two hops.
- `failures` — optional map of existing edge keys to communication outcomes:
  `{"broker->device":"dropped","api->worker":"blocked"}`. `dropped` means a
  send was attempted but never arrived: a packet stops at an orange break
  and fades. `blocked` means **not sent**: a stop marker appears near the
  source and no packet launches. Both keep a static marker with reduced
  motion, and add a text description beneath the caption. The source is
  focused; the destination is only focused if named in `nodes` or reached
  by another successful hop. The failure overrides `edge`/`edges` and
  explicit `packets` on the same key. Other hops can still deliver.
  This effect is **current-step only**, with no carry-forward; author it
  again to retain the broken edge on another beat. Ambient and printed
  diagrams show base topology; printed step captions include the failure.
  A failures-only step is valid. Unknown keys or modes are errors. Use
  this for known non-delivery, not a received request that returned an
  application error. See [Failed communications](../docs/failed-communications.md).
- `nodes` — optional array of node ids to light directly. A step may be
  **edgeless** (no `edge`/`edges` at all): a device booting, a state change
  with no message. Give it `nodes`, `tone`, and/or `panels`.
- `tone` — optional sparse node-state patch keyed by node id. For example,
  turn the gateway red when the timeout fires with
  `{"tone": {"gateway": "alert"}}`. Values are semantic tokens, never raw
  colors: `alert` means failed/danger (red), `warn` means at risk/degraded
  (amber), `ok` means healthy/recovered (green), and `dim` means inactive or
  deliberately de-emphasized. `null` or the explicit `base` token clears a
  node back to its authored `tint`/base card appearance. Tone patches fold
  forward across steps exactly like panel patches, so a deep link or
  non-adjacent jump gets the complete state for that beat; later patches may
  change or clear any carried tone. Ambient mode and print always show base
  node appearance. Row nodes and `floats` both support tones.

  A tone is a **narrative claim**, not decoration: apply `alert`/`warn` only
  when the source document says something goes wrong or degrades at that
  beat, and apply `ok` only when it says the node recovers or is healthy.
- `panels` — optional sparse panel patches for this step (see "panels"):
  `{"panels": {"hp": {"state": "BOOT"}, "cam": {"mode": "live"}}}`.
- `lane` — optional lane tag (declare colors in `page.lanes`).
- `text` — one-line caption for the step (shown during click-through
  playback). Required in practice.
- `id` — optional stable step id, e.g. `"ota.3"`. Shown subtly on the caption
  line and addressable in deep links (`#d=ota-rollout&m=step&s=ota.3`), so meeting
  feedback can name a step unambiguously. Keep ids unique within a diagram.
- `link` — optional permalink for this step; a "source ↗" link appears on the
  caption line while the step is active.

Steps produce: the numbered coin badges on the diagram (edge-bearing steps
only), the ambient packet-dot schedule, the click-through playback (lit
edges/nodes, captions, 3-second auto-advance with prev/pause/next controls),
the folded per-step node tones, and the per-step panel states. Number the hops
in the order a reader should understand them. Every diagram that tells a
sequence should have steps; a pure topology diagram may omit them (then use
`"view": "ambient-only"`).

Reserved per-step fields you may see but should only emit if asked: `sticky`,
`packets`. Stable `id` values are required for steps referenced by paths.

### paths — alternate outcomes on the same board

Optional `diagram.paths` is a nonempty array of
`{id, label?, color?, steps:["step-id", ...]}`. Its first entry is the default
path. When present, `diagram.steps` is a shared registry: each path references
its complete ordered sequence by stable step ID. Each path needs a unique
nonempty `id`, at least one step, and no repeated step IDs. Every reference
must resolve to exactly one registry step. Use separate step bodies for
repeated operations such as retry attempts. `label` defaults to “Happy path”
for the first path and the path ID for others; `color` is optional hex, with
cyan/orange/purple/pink/green defaults.

For example, declare steps `accept`, `auth`, `queue`, `deliver`, `ack`, `lost`.
Use paths `{"id":"happy","label":"Happy path","steps":["accept","auth","queue","deliver","ack"]}`
and `{"id":"drop","label":"Dropped signal","color":"#fb923c","steps":["accept","auth","queue","lost"]}`.
Below the transport controls, each path has a colored chip on the left and
a row of steps on the right. Step numbers align in shared columns. The
primary row shows all its steps. An alternate shows its earlier shared beats
as shadows at 35% opacity, using each beat's earlier path color. Its full-strength
steps begin immediately after the longest common prefix with an earlier path,
at the first differing step, and end at its own last step; space after the
ending stays blank. Every beat in the common prefix is shared, including its
last beat. A path ending inside that prefix has only shared shadows.
Shared shadows are clickable and become fully opaque when current or keyboard
focused. No shared prefix means column 1. Clicking a path chip always selects
step 1 of that path, including its shared lead-in, and pauses playback; clicking a number
selects that path and step. Rows stay in place when switching. Both routes
use the same nodes, edges, rows and panels. Path colors identify choices;
protocol colors retain their meaning on edges.

The workbench inspector names all paths referencing a shared step before its
editing controls. Edits to that shared body affect those paths; edits to a
distinct branch step leave the aligned base-path step unchanged.

The selected path supplies numbered coins, packet scheduling, playback,
node-tone folding and panel-state folding from initial values. Another path’s
patches cannot leak into it. Each path ends at its own final step; playback
stops there and Play replays from the start. Reveal/hide indices are zero-based
positions in the selected sequence. Print uses the selected path. With fewer
than two paths, no path label or branch choices appear. Omit `paths` to retain
legacy playback; `ambient-only` omits path controls. This additive feature
requires a current renderer, without a schema-version flag.

Editing a shared step affects every referencing path; deleting one must prune
all references. Removing a path may leave unused registry steps, which never
play while explicit paths exist. Author paths only for supported outcomes in
the source document; distinguish observed trace evidence from hypothetical
failure scenarios. See [the full example and editor workflow](../docs/alternate-paths.md).

## Validation behavior

Errors (block rendering — never emit these):
- a row/float/edge referencing a node id not defined in `nodes`;
- missing `nodes` or missing/empty `rows` in a diagram;
- no sections/blocks at all.

Errors also include: a `panels` entry without an `id`; two panels sharing an
`id`.

Warnings (rendered anyway, logged): unknown `icon`, `tint`, `kind`, `accent`,
`view`, `skin`, panel `type`, or `scene` (each falls back to its default); a
node defined but never placed; a step referencing a non-existent edge
(skipped); a step with no edges, nodes, or panel patches; a step patching an
undeclared panel id (ignored); an undeclared `lane`; a node `group` not in
`diagram.groups` (untitled boundary); non-string `link`/`source` values
(ignored). A non-object step `tone`, unknown tone token (valid: `alert`,
`warn`, `ok`, `dim`, `base`, or `null` to clear), or unknown tone node id also
warns and is ignored.

Lint findings (advisory, from `tools/validate.js` and the workbench; never
block rendering): an edge label longer than its edge can carry; more than 4
edges crossing one row corridor; two steps sharing the same first edge (their
step coins collide); a protocol declared in `page.protocols` that no edge
uses. Fix these in the spec rather than shipping
them — they are exactly the defects an author without a browser cannot see.
A `page.contract` declaring a major version other than 1 also warns.

## Viewer features you get for free

You do not author these, but they shape what ids are worth writing:

- **Deep links and copy-link icons.** The rendered page mirrors navigation in
  the URL hash with `history.replaceState` and places a tiny copy-link icon (a
  chain-link glyph, no text) on every tab, stepped-diagram caption bar, and
  contract card. The canonical
  parameter order is `b`, `t`, `d`, `m`, `s`, `c`, `r`, `x`, `e`; fields are
  optional and compose, so a single fragment may restore a tab, a later
  diagram's folded step state, a highlighted contract row, and prose collapse
  choices. The most specific supplied
  target controls scrolling: row, then contract card, then diagram, then tab.
  When an embedding site registers a link base through the host channel, copied
  links follow that site's URL scheme and navigation fragments mirror to it.
  This has no authoring impact; the site owns the integration policy and URL.
  Canonical forms and selectors are:

  - `#t=<tab-label-slug>` selects a tab in the first tab block. For the uncommon
    page with multiple tab blocks, `#b=<1-based-tab-block>&t=<tab-label-slug>`
    selects a tab in a later block.
  - `d=<section-ref>&m=<ambient|step>[&p=<path-id>][&s=<step-id-or-1-based-number>]` selects
    any stepped diagram, opens its containing tab, and restores its mode and
    folded step state. `p` chooses a declared path; absent `p` uses the default.
  - `c=<section-ref>[&r=<1-based-rendered-field-row>]` targets a message-contract
    card and optionally focuses and highlights one rendered row. It does not
    reset diagram mode or step state.
  - `x=<section-ref>[,<section-ref>...]` forces those sections' prose collapsed;
    `e=<section-ref>[,<section-ref>...]` forces prose expanded, including an
    override of authored `collapsed: true`. Absent entries use authored
    defaults. Emitted fragments include only sections whose current state
    differs from that default, in rendered section order.
  - A composed example is
    `#t=overview&d=delivery-flow&m=step&s=ack&c=delivery-flow&r=2&x=background&e=appendix`.

  A `<section-ref>` is the section heading lowercased, with each run of
  characters other than ASCII `a`–`z` and `0`–`9` replaced by `-` and
  leading/trailing hyphens removed. References are unique across the whole
  rendered document; collisions receive document-order suffixes (`flow`,
  `flow-2`, `flow-3`). An empty slug becomes `section`, and a numeric-only
  heading is prefixed with `section-` so it cannot collide with legacy numeric
  addressing. A section with no heading uses its 1-based rendered section
  number as the canonical fallback. Copy chips and address-bar updates always
  emit these canonical section refs.

  Accepted legacy input remains: a numeric `d`, `c`, or item within `x`/`e`
  selects the corresponding 1-based rendered section; `t` may be a 1-based tab
  index; and
  `#m=...&s=...` / `#t=...&m=...&s=...` retain their historical meaning of the
  first stepped diagram on a tabless page or in the selected tab of the first
  tab block. Step ids may still fall back to 1-based step numbers. Thus an old
  `#d=4&m=step&s=ota.3` link remains valid, while newly emitted links use the
  heading slug. Write `steps[n].id` values people can say out loud.
- **Presenter mode.** A PRESENT button goes fullscreen; arrow keys step,
  space plays/pauses, digits 1–9 switch tabs, Esc exits.
- **Adjacent-file specs.** An http(s)-served template page still holding the
  built-in demo accepts `?spec=relative/path.json` and fetches the spec from
  the adjacent file (`file://` pages cannot fetch; injection covers those).
- **Print.** Printing forces a light ground, stops animation, shows every
  tab, and lists each board's numbered step captions beneath it, so a handout
  carries the narrative that the animation carries on screen.

## Translating a design doc — checklist

Task-shaped worked recipes (complete, validator-clean specs to copy) live in
`cookbook/` — including `cookbook/adjustments.md`, the phrase-to-knob table
for visual feedback like "move that up and to the right a little". This
contract stays the authority; a recipe shows the working subset for one task.

1. Components/services → `nodes` (id, short title, sub = role/topic/port,
   closest icon, tint by role). Attach the doc's permalink for each component
   as `link`.
2. Calls/messages between them → `edges` with the right protocol `kind`;
   responses/acks get `ret: true`.
3. The main scenario → `steps` in narrative order, captions in plain language,
   permalinks as `link` where the doc has them.
4. Group into `sections` (one flow per section, accent per topic, `source` =
   the doc section's permalink; carry 1–2 sentences of the doc's prose into
   `text` and key constraints into `bullets`).
5. More than two flows, or a requested walkthrough → wrap sections in `tabs`.
   A guided tab = the same diagram object plus `"view": "step"`.
6. A device with internal structure (chips, radio, sensors) → a `groups`
   boundary around its member nodes, plus `panels` showing its internal state
   patched per step. Tag steps with `lanes` (NET / DEV / CAM) so readers
   track which layer acts.
7. Pick each panel by the ARGUMENT the section makes, not by decoration —
   every widget exists to carry one kind of claim:

   | The design doc argues about… | Widget |
   |---|---|
   | a component's lifecycle / current mode | `state` (readout + chip rail) or `orbit` (state ring) |
   | indicator lights, radio TX/RX activity | `leds` |
   | a numeric level (power draw, load, backlog) | `gauge` |
   | temperature against warning / shutdown thresholds | `thermo` |
   | battery / charge level (LOW is bad), energy budget | `battery` |
   | a pre-roll ring, store-and-forward queue, or storage rotation | `buffer` |
   | distance-gated alerts, visit paths, room presence (radar/mmWave) | `radar` |
   | link health: wifi / cellular / mesh state, failover, jamming | `signal` |
   | a fleet of devices or rollout cohorts, each with a state | `tiles` |
   | an ordered event stream (firmware log, audit trail) | `log` |
   | what a camera sees at each step | `screen` |
   | a latency / timing budget across spans | `waterfall` |
   | replica or consumer positions, lag, and incomparable histories | `replicas` |
   | which regions of a frame are armed / ignored / masked | `zoneframe` |
   | line of sight / wake-on-motion (does an approach trip a sensor?) | `pir` |
   | who can decrypt a payload at which hop | `xray` |
   | a message parked between producer and consumer | `queue` |
   | concurrent operations overlapping on one step axis | `inflight` |
   | a push notification reaching a resident's phone | `phone` |

   One to four panels per diagram; each panel must be patched by at least one
   step or it is dead weight.

## Complete example

```json
{
  "page": {
    "title": "Order pipeline",
    "blocks": [
      {
        "tabs": [
          {
            "label": "Checkout flow",
            "sections": [
              {
                "heading": "Checkout",
                "accent": "green",
                "source": "https://docs.example.com/hld#checkout",
                "text": ["A checkout request is authorized, persisted, then fanned out to fulfillment workers over the message bus."],
                "bullets": ["Auth is a side branch — orders never pass through it"],
                "diagram": {
                  "nodes": {
                    "web":    {"title": "Web App", "sub": "storefront", "icon": "terminal", "tint": "cmd"},
                    "api":    {"title": "Orders API", "sub": "gateway", "icon": "cloud", "tint": "cmd",
                               "link": "https://docs.example.com/hld#orders-api"},
                    "auth":   {"title": "Auth", "sub": "tokens", "icon": "shield", "tint": "auth"},
                    "svc":    {"title": "Order Svc", "sub": "core logic", "icon": "gear", "tint": "cmd"},
                    "db":     {"title": "Orders DB", "sub": "postgres", "icon": "db", "tint": "data"},
                    "bus":    {"title": "Message Bus", "sub": "orders.* topics", "icon": "antenna", "tint": "mqtt"},
                    "pick":   {"title": "Picking", "sub": "orders.pick", "icon": "package", "tint": "dev"},
                    "invoice":{"title": "Invoicing", "sub": "orders.invoice", "icon": "server", "tint": "dev"}
                  },
                  "rows": [
                    ["web", "api", "svc", "db"],
                    ["bus", ["pick", "invoice"]]
                  ],
                  "floats": [ {"id": "auth", "side": "above"} ],
                  "edges": [
                    {"from": "web", "to": "api", "kind": "https", "label": "POST /orders"},
                    {"from": "api", "to": "auth", "kind": "int", "label": "verify"},
                    {"from": "auth", "to": "svc", "kind": "int", "ret": true, "label": "ok"},
                    {"from": "api", "to": "svc", "kind": "int", "label": "create"},
                    {"from": "svc", "to": "db", "kind": "int", "label": "insert"},
                    {"from": "db", "to": "bus", "kind": "mqtt", "label": "PUBLISH orders.created"},
                    {"from": "bus", "to": "pick", "kind": "mqtt", "label": "SUBSCRIBE orders.*"},
                    {"from": "bus", "to": "invoice", "kind": "mqtt"},
                    {"from": "pick", "to": "bus", "kind": "mqtt", "ret": true, "label": "ack"}
                  ],
                  "panels": [
                    {"id": "ord", "type": "state", "title": "Order Svc — order state",
                     "states": ["NEW", "AUTHORIZED", "PERSISTED", "FANNED_OUT"],
                     "colors": {"FANNED_OUT": "#4ADE80"},
                     "initial": {"state": "NEW"}},
                    {"id": "lag", "type": "gauge", "title": "Bus backlog", "unit": "msgs", "max": 50,
                     "initial": {"value": 0}}
                  ],
                  "steps": [
                    {"edge": "web->api", "text": "Customer submits the order"},
                    {"edges": ["api->auth", "auth->svc"], "text": "Session verified, order accepted",
                     "panels": {"ord": {"state": "AUTHORIZED"}}},
                    {"edge": "api->svc", "text": "Order handed to the service"},
                    {"edge": "svc->db", "text": "Order persisted",
                     "link": "https://docs.example.com/hld#persistence",
                     "panels": {"ord": {"state": "PERSISTED"}}},
                    {"edge": "db->bus", "text": "Created event published",
                     "panels": {"lag": {"value": 1}}},
                    {"edges": ["bus->pick", "bus->invoice"], "text": "Fan-out to fulfillment workers",
                     "panels": {"ord": {"state": "FANNED_OUT"}}},
                    {"edge": "pick->bus", "text": "Picking acknowledges",
                     "panels": {"lag": {"value": 0}}}
                  ]
                }
              }
            ]
          },
          {
            "label": "Guided walkthrough",
            "sections": [
              {
                "heading": "Checkout, step by step",
                "accent": "violet",
                "text": ["The same diagram, opened as a click-through."],
                "diagram": { "COPY the diagram object above verbatim and add": "\"view\": \"step\"" }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

(In real output, the second tab's `diagram` is a full literal copy of the first
diagram object with `"view": "step"` added — JSON has no references; the
placeholder line above is illustrative only and must not appear in output.)

## Connected company evidence

Optional `page.canon`, node `binding`, and node/step `codeRefs` are documented in
[the canonical flow contract](../docs/canon.md). These preserve HLD provenance
and carry portable snapshots, not runtime API calls or an assertion of correctness.

Optional step `traceMatch` selectors, `conditions`, `diagram.referenceTrace`, and
`diagram.incidents` are also defined there. These fields preserve measured
provenance and distinguish unknown telemetry from a failed communication.
See the [incident recipe](../cookbook/canonical-incidents.md) for independent
alternate steps and the reference approval workflow.

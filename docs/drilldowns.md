# Domain drilldowns

Start with the [doorbell domain example](../src/starters/domain-drilldown.json).
Open it with **Open file** in the workbench. The initial view follows Doorbell
→ Connectivity → Recording → Apps / Notify. Connectivity opens a focused
detail, Recording expands its implementation in context, and Cloud handoff
inside Connectivity opens a second level containing a mailbox and uplink.

The example is a fictional design, not telemetry or a product specification.
Its normal outcome produces a stored clip and one notification. Separate
paths show an uplink drop, a received storage rejection, and a dropped push.
Open the affected domain at those steps to see the matching child outcome.

## Model a domain as an ordinary section

Every detail flow is a normal section with a normal diagram: nodes, rows,
edges, panels, steps, and optional alternate paths. Give each target section
a document-wide unique `id`, starting with an ASCII letter and containing only
letters, digits, underscores, periods, or hyphens: `/^[a-zA-Z][\w.-]*$/`.
Keep the ID stable when the section heading changes.

Set `detailOnly: true` on sections that should appear only when opened as a
detail. This hides them from the initial reader view; it does not remove their
content or create another file. A target can also be an ordinary visible
section. Do not put a second diagram inside a node or duplicate a child flow
inside each parent that references it.

In the workbench, create the child as a section and author its diagram as
usual. In the section inspector, set **Stable section ID** and **Detail only**.
Select the parent node, open **Domain detail**, choose **Local section**, and
set the target, open mode, optional entry path/step, and boundary nodes. Enter
per-parent-step targets in the mapping JSON field, then choose **Apply detail**.
**Remove detail** removes the node's reference; the child section remains
available for other nodes. Approved spec and URL destinations are also offered
in the same inspector. The JSON below is the equivalent authoring shape.

To start a new inner flow, select a node without a detail and choose **Create
detail flow**. The workbench adds a detail-only section with a stable ID and
one starter node, links it from the selected node in focus mode, and opens the
new section inspector. One **Undo** restores the exact previous source.

To extract an existing flow, Shift-click at least two nodes in the same
section and choose **Create domain from selected nodes**. The selected nodes
and internal edges move into a new detail-only section with their IDs intact.
A new domain card replaces them in the overview; incoming and outgoing edges
reconnect to its boundary nodes. Affected parent steps activate the domain and
map to child step copies, preserving internal failures, tones, packets, and
code references. The whole extraction is one **Undo** action.

Extraction supports ordinary rows and linear timelines with at most one
distinct input node and one distinct output node. It refuses multiple boundary
endpoints, panel declarations or patches, runtime conditions, alternate paths,
authored layouts, routing or centerpiece settings, selected floats, and nodes
that already have details. It also refuses selected nodes used as another
detail's boundary ports, internal edge `revealAt`/`hideAt` windows, failures
across the extraction boundary, and duplicate or invalid step IDs. The error
explains the unsupported case and leaves the source unchanged. Use **Create
detail flow** and assign references explicitly for those flows.

Attach `detail` to the parent node:

```json
{
  "title": "Connectivity",
  "detail": {
    "section": "connectivity",
    "mode": "focus",
    "path": "happy",
    "step": "accept",
    "ports": {"in": "eventin", "out": "eventout"}
  }
}
```

This is a node fragment. Its target section is an ordinary section such as:

```json
{
  "id": "connectivity",
  "detailOnly": true,
  "heading": "Connectivity",
  "diagram": {
    "view": "step",
    "nodes": {
      "eventin": {"title": "Event in", "sub": "from Doorbell"},
      "relay": {"title": "Relay"},
      "eventout": {"title": "Event out", "sub": "to Recording"}
    },
    "rows": [["eventin", "relay", "eventout"]],
    "edges": [
      {"from": "eventin", "to": "relay", "kind": "int"},
      {"from": "relay", "to": "eventout", "kind": "int"}
    ],
    "steps": [
      {"id": "accept", "edge": "eventin->relay", "text": "Accept the event."},
      {"id": "release", "edge": "relay->eventout", "text": "Release the accepted event."}
    ],
    "paths": [{"id": "happy", "steps": ["accept", "release"]}]
  }
}
```

## Choose the reader action

| Mode | Purpose |
|---|---|
| `focus` | Open the child flow as the reader's current level. Breadcrumbs return to its parent and preserve the parent's reading position. |
| `expand` | Show a child's internals within the parent diagram, using the declared boundary ports for surrounding edges. Collapse returns to the domain card. |
| `link` | Navigate to a local target section, an approved external spec, or an ordinary URL. |

Use the explicit detail controls on a node. Keep the domain title descriptive
and let its action communicate that it opens detail. A normal node `link` still
represents a source-document permalink; `detail` represents the reader's next
level of explanation. Avoid cyclic detail references.

Focus is useful when the child needs its own panels and alternate timelines.
Expansion is useful when the question is how neighboring domains connect to
the child's entry and exit. Expansion retains the overview's steps and panels;
use **Explore** in its expanded controls to enter the child's own timeline and
panels at the mapped beat. Child details can themselves contain detail nodes;
the example's Connectivity → Cloud handoff → mailbox makes this concrete.

## Map a parent beat to a child beat

`path` and `step` select the default child entry. Use child path and step IDs,
never displayed step numbers. A `stepMap` overrides that entry for specific
parent steps:

```json
{
  "section": "connectivity",
  "mode": "focus",
  "path": "happy",
  "step": "accept",
  "stepMap": {
    "handoff": {"path": "happy", "step": "queued"},
    "online": {"path": "happy", "step": "released"},
    "offline": {"path": "link-lost", "step": "lost"}
  },
  "ports": {"in": "eventin", "out": "eventout"}
}
```

The keys are IDs in the parent diagram's step registry. Each mapped `step`
must exist in the child, and must belong to the chosen child `path` when a
path is specified. Omit `stepMap` when the child should always open at its
default entry. For an unmapped parent beat, the declared default remains the
entry point; nothing infers a match from similar captions or ordinal positions.

A mapping chooses a reading position. It does not execute the child, simulate
delivery, or derive the parent's state from child playback. Write the child
timeline so folding to its mapped beat includes all necessary earlier state
changes. Review that mapping when a step ID or path membership changes.

Alternate paths retain their [existing rules](alternate-paths.md): one shared
step registry, identical shared beats referenced by the same ID, and a fresh
ID at each differing outcome. Panel state starts from the selected path's
initial values and folds only that path. A parent failure should map to a
child failure path explicitly; opening the child at a happy ending would
contradict the parent's story. The example provides this correspondence:

| Parent section / beat | Child section / path / beat | Visible result |
|---|---|---|
| Doorbell / `online` | Connectivity / `happy` / `released` | Cloud acceptance confirmed |
| Doorbell / `offline` | Connectivity / `link-lost` / `lost` | Event retained; no Recording handoff |
| Connectivity / `lost` | Cloud handoff / `link-lost` / `lost` | Mailbox held; actual MQTT send dropped |
| Doorbell / `saved` | Recording / `happy` / `publish` | Stored and indexed before clip-ready |
| Doorbell / `storage-failed` | Recording / `storage-rejected` / `rejected` | Received HTTP error; no clip-ready |
| Doorbell / `push-failed` | Apps / `push-lost` / `lost` | Clip exists; phone has no notification |

## Make expansion boundaries explicit

`ports.in` and `ports.out` name **child node IDs**. They do not name parent
nodes, edge IDs, or port objects. The renderer reroutes a parent edge entering
the domain card to the child's `in` node, and an outgoing parent edge from the
child's `out` node. Internal edges retain their own authored meaning.

Label boundary nodes in the child itself: “Event in · from Doorbell” and
“Event out · to Recording” remain understandable in both focus and expansion.
Choose actual child entry/exit nodes. One declared input and output are shared
by all entering and leaving parent edges; this does not encode a separate
mapping for every edge or expose typed message contracts automatically.

An outer edge often represents a coarser handoff than the internal edges. In
the example, the dropped MQTT send lives inside Cloud handoff, while the
outer Connectivity → Recording edge is blocked because no accepted event is
emitted. Storage's HTTP 503 is a **received response**, not dropped traffic.
Use step-local `failures` only for established non-delivery, and author queue,
status, tone, and notification state separately.

## Link another approved spec or a URL

An external spec reference uses its host-approved identifier and optional
content revision. External spec detail uses `mode: "link"`:

```json
{
  "spec": "doorbell-connectivity",
  "revision": "approved-content-revision",
  "section": "connectivity",
  "mode": "link",
  "url": "https://docs.example.com/doorbell/connectivity"
}
```

These values illustrate the shape. Replace them with real approved identities
and a real fallback URL. A content revision identifies a snapshot; it is not
the Flowview renderer version. The Backstage loader requires a pinned revision.

The renderer does not fetch arbitrary spec URLs. A consuming host injects an
approved loader through `NativeViewerOptions.loadDetail`:

```ts
loadDetail?: (
  target: {spec: string; revision?: string; section?: string},
  signal: AbortSignal
) => Promise<unknown>;
```

The host owns authentication, authorization, revision resolution, and payload
loading. The renderer receives the returned spec; it does not obtain another
domain's data on its own. A host without a loader uses the supplied URL fallback
or reports that the detail is unavailable. A plain web destination needs only:

```json
{"url": "https://docs.example.com/doorbell", "mode": "link"}
```

URL detail is ordinary navigation, with no imported child timeline or boundary
expansion. Use HTTPS destinations. A section ID points into the loaded spec;
it must not be resolved accidentally against a same-named local section.

## Compatibility and verification

This is additive to `page.contract: "1"`. The renderer capability is
`flow.drilldown`; changing the contract major or adding detail fields cannot
upgrade an older embedded viewer. Stamp the actual required release and
features with the compatibility tool, preserving any existing requirements:

```sh
node tools/compatibility.js --stamp input.spec.json > versioned.spec.json
node tools/validate.js versioned.spec.json
```

Use different input and output files. See [runtime compatibility](runtime-compatibility.md)
for host upgrade behavior. Rebuild previously generated HTML with a renderer
that supports this capability. No spec-version switch enables drilldowns in
an old export.

Walk the normal and failure paths, opening each mapped detail at the relevant
beat. Return through breadcrumbs and check the parent position; expand and
collapse Recording and check both outer handoffs. Open nested Cloud handoff at
Connectivity's failed beat and inspect the **held mailbox**, not just its
caption. Switch from a notified ending to every failed ending and verify no
success notification leaks across paths. Check the intended embed width, and
test external loading in the actual host that provides its loader.

Expanded domains initially use **Readable** size; the mouse scroll arrows and slider
keep large internal flows accessible. **Fit width** remains available. Expanding
nested components inside an already expanded domain requires opening that domain
with **Explore** first. Focused drilldown can continue through multiple levels.

Standalone links include the drill trail and step positions and support browser
Back/Forward. Native hosts can save `onDetailNavigate` state and pass it back as
`navigate({section, drilldown: state})`; the renderer leaves host history alone.
External restoration goes through the same approved-spec loader and cancels on
navigation or destruction. Stable section IDs retain unambiguous old heading links;
IDs that would redirect an old link to another section are rejected.

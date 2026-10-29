# Shared topology imports

A provider owns reusable structure; each consumer owns its narrative. Imports
are validated against the complete approved snapshot at build time, then resolved
in memory when a reader or editor opens them. The fetched provider closure is
frozen for that session: no polling or automatic reconciliation. Repository
agents refresh saved worktree providers with the connected consumer helper
`folder-agent.py refresh-sources --source-repo /provider-repo` (desktop **File → Use local source repository…** fallback). Consumers need no Canon membership; see [local repository authoring](local-repository-authoring.md).
Cloud-attached projects keep their saved cloud provider snapshots and cannot
refresh from local files, even when a folder is connected.
Reopening a diagram from the library pins the newly deployed revision; a plain
reload resumes the draft with its frozen context. The picker's **Use the latest
published library** adopts a later index only while every frozen provider keeps
its revision.
Black-box `handoff` and detail navigation remain separate contracts.

In the provider's diagram, declare an export with explicit stable node IDs and
edge identities (Flowview edges are keyed by `from->to`, not a separate edge ID):

```json
"topologyExports": {
  "core": {"nodes":["api","store"], "edges":["api->store"]}
}
```

Export names are unique across all diagrams/sections of that provider spec.
An edge export must include both endpoints. Every exported node must have exactly
one base `rows` or `floats` placement. An export may consist entirely of floats.
A consumer
imports by the provider's canon ID and export name:

```json
"topologyImports": [{"spec":"platform", "export":"core", "as":"platform"}],
"nodes": {"client":{"title":"Client"}},
"rows": [["client"]],
"edges": [{"from":"client","to":"platform::api"}],
"steps": [{"id":"persist","edge":"platform::api->platform::store","text":"Persist order"}]
```

`as` and export names use letters, digits, dots, dashes and underscores and start
with a letter or digit. The reserved namespace is `as::`; local nodes cannot
occupy it. Edge keys naturally become `as::from->as::to`. Different imports in
one diagram require distinct namespaces. Nested imports are allowed; cycles
are rejected. Stable attachment aliases/ports are not part of this version.

Consumers can merge multiple exports from the **same provider diagram section**
into one namespace:

```json
{"spec":"platform", "export":["entry","persistence"], "as":"platform",
 "nodeOverrides":{"api":{"title":"Checkout API","sub":"Consumer wording","style":"moss"}},
 "edgeOverrides":{"api->store":{"label":"Save order"}}}
```

The array must be nonempty and contain unique export names. Shared nodes and
connections are included once. Array imports also include provider connections
whose endpoints both belong to the union, including connections spanning exports.
A scalar export keeps its declared edge boundary unchanged. Exports from different
sections cannot be merged: use separate imports and namespaces instead.
Optional `nodes`/`edges` subsets select from that union; explicit `edges: []` still
selects no connections, and an explicit edge list remains exact. Reducing `nodes`
without reducing incident edges is an endpoint-closure error, just as for scalar
imports. Source IDs, namespace paths, groups and protocol meanings stay stable.

Consumers can select a **subset inside a named export** with optional `nodes` and
`edges` arrays of provider-local stable IDs/edge keys:

```json
{"spec":"platform", "export":"core", "as":"api", "nodes":["api"], "edges":[]}
```

Each omitted array means the full corresponding export array. `nodes` must select
at least one node; `edges: []` deliberately selects no connections. Both arrays
must contain unique strings and may not reach outside the named export. Every
selected edge requires both selected endpoints: removing a node does not silently
remove its connections. Export order determines layout, not selection order.
Groups/ancestors and protocols follow selected objects automatically. A removed
or renamed explicitly selected identity fails resolution even if no step uses it.
New unselected identities do not expand a pinned subset; omission follows the
provider's full export on explicit reopen. Narrative edge selection is separate:
importing three edges and firing only two is still supported.

Exports include selected nodes and edges, their catalog/code metadata, and the
group ancestry required by those nodes. Group IDs and parent references receive
the same namespace. Custom edge protocol definitions follow the export. An
identical consumer definition is reused; a different definition with the same ID
receives a stable import-scoped ID in the derived snapshot and imported edges are
rewritten to it. Authored JSON and built-in protocols are never overwritten.
Node link, handoff, and detail fields
are copied verbatim; they are not rewritten into topology imports. Keep any
local navigation destination valid in the consumer, or use an explicit external
handoff destination. Provider steps, paths, panels, reveal/hide step indices,
and named layout alternatives do not cross the export boundary.

Each import is **one floating child block**, never extra parent rows. The resolver
first lays out the selected provider fragment in isolation: selected row columns
and stacks retain their order; unselected slots/empty rows are filtered out.
Native floats (automatic side/nudges or explicit coordinates) resolve against
that fragment's own exported edges. All resulting node centers then translate
together into the parent as absolute floats. Their relative center spacing and
edge metadata are preserved; cards use the renderer's normal float dimensions,
not the provider's row/stack card dimensions. This is not a frozen screenshot.

Optional consumer-owned placement lives only on the import:

```json
{"spec":"platform", "export":"core", "as":"platform", "position":{"x":260,"y":200}}
```

`position.x/y` are diagram units: the minimum node-center X and Y of the block.
Both must be finite numbers in `[-100000,100000]`; translated member coordinates
must also fit that range. Unknown placement fields fail validation. Without a
position, blocks start at X=110 below existing parent nodes/floats, in declaration
order. Dragging the reference handle moves **all** imported nodes and their
incident edge previews and saves a position on that import. Dragging one imported
node saves a consumer-owned position override for that member. Imported nodes can
also move in one selected group with other imported nodes or local free nodes;
every movable member receives the same delta while locked local members stay put.
Each completed drag is one Undo/Redo, and provider structure stays read-only.
Escape, blur, invalid placement, a source change or a provider-context change
during drag cancels without writing. Saved positions survive provider layout
updates on explicit reload/reopen; the internal geometry is freshly derived
around the same origin.

An import-only parent may omit nodes/rows/edges. Its derived layout uses an empty
row scaffold `[[]]` for renderer compatibility; imported IDs never enter rows.
Local connecting endpoints must still be placed. Other layout settings remain
consumer-owned.

## Compatibility and publication

A consumer can choose which imported edges its own story fires. For example,
exporting `dispatcher->push`, `dispatcher->email` and `dispatcher->sms` under
`notify` makes all three available. The parent can fire just push and SMS together:

```json
{"id":"notify-customer", "edges":["notify::dispatcher->notify::push", "notify::dispatcher->notify::sms"]}
```

Or use separate local steps, each with an `edge` field naming one of those keys.
The email edge remains in the imported topology without participating in either
step. Any two can be selected; removing or renaming either referenced identity
in the provider fails the complete build. These are narrative references to
edges: a structural edge's `from` and `to` still connect **nodes**, never another
edge or an arbitrary point on it. Child steps/paths are not imported.

The complete snapshot must resolve before validation, indexing or publishing.
Missing providers/exports, malformed declarations, cycles, collisions, broken
export closure/placement and dangling materialized references stop the build.
A consumer edge targeting a removed exported node or a step/failure referencing
a removed exported edge is an error naming consumer, namespace, provider,
export and missing identity. Renaming an ID is removal plus addition. Adding
unreferenced nodes or changing labels is non-breaking; updating the export's
selection to include additions is explicit. Do not silently retarget consumers.

`FlowCanon.materializeTopology(specs)` is pure and deterministic. Specs require
unique derived `page.canon.id` metadata. The backend package exposes the same
implementation as `materializeCanonSpecs`; call `materializeCanonSpec(raw,entry)`
first to derive each source's membership. Fetch all sources at one approved SHA.
The backend's `prepareCanonSnapshot(authoredSpecs, {authorize})` validates and
resolves in memory, indexes only consumers whose entire provider closure is
authorized, and exposes `loadSpec(id)` for a derived viewer value and
`loadWorkspace(id)` for `{source, topologyContext}`. Cache this adapter only by
approved revision **and authorization scope**. Never combine provider revisions
or allow a consumer to bypass a provider's authorization.

The publisher writes only a version-3 metadata index, atomically after full-batch
validation. Each entry points to authored JSON and includes its SHA256 revision
(of `JSON.stringify` after applying index membership). No flattened spec files
or provenance artifacts are published. Docker copies authored `diagrams/` into
the final nginx image; the build validates, nginx serves, and the browser fetches
the selected consumer and its provider closure on open. There is no Node service.
Deploy sources and index together. A source/index revision mismatch fails closed
before rendering or changing a draft; reload after a deployment switch. Legacy
v1 embedded libraries and v2 snapshot URLs remain readable.

Derived values remove declarations and contain `topologyProvenance` solely in
memory for read-only inspector cues. They are not saveable authored documents.
Build tooling and evidence baselines preserve imports/exports in source files.

## Authoring in Workbench

To publish a selection as a provider export, Shift/Ctrl/Cmd-click at least two
nodes and/or connections in one diagram section. The **multi-select Inspector →
Shared topology export** summarizes node IDs and connection keys. Enter a name
and **Create export**. It requires at least one node and both endpoint nodes for
each selected connection; node-only exports are valid. A single node never offers
export creation. Export names follow the token rule above and must be unique
across every section of the provider spec.

The export selector lists declarations in the selected section. Choose one to
inspect its existing membership, then **Update export** replaces that membership
with the canvas selection. Editing the name also renames the declaration in that
same transaction. **Remove export** removes only the chosen declaration. Create,
update/rename and remove each produce one exact Undo/Redo action and never change
nodes, connections, placements, imports, or narrative. Mixed selections offer
only export authoring; homogeneous selections retain their usual bulk controls.
Source/project/selection changes invalidate held export controls.

Local authored exports work in ordinary/offline Workbench without a deployed
catalog. Re-exporting imported identities uses the session's frozen topology
context; without it the editor asks you to open the authored spec from Canon.
The full candidate is resolved and validated in memory, including dependent
imports already in that context. An incompatible rename/removal fails atomically.

Agents use `planTopologyExport(text, raw, targets, options, context)` in
`src/workbench/commands/topology.js`. Targets are `{section, kind:'node', id}` or
`{section, kind:'edge', key:'from->to'}`; a supplied edge `index` must still match
that key in the resolved diagram. Options are `{action:'create', name}`, or
`{action:'update', existingName, name}`, or `{action:'remove', existingName}`.
The planner requires the same multi-selection and changes only topologyExports.
Pass the frozen authored context for imported topology; omit it for local exports.
Callers must reject stale source/project/selection before accepting the plan.

In a deployed Canon v3 editor, choose **Add to diagram → Referenced topology**.
Search by provider name, ID or owner, then choose its page section and named
exports (⌘/Ctrl-click selects more than one). Their union and connecting provider
edges are offered. All start selected;
uncheck unwanted objects, keeping both endpoints of each selected connection.
Closure errors and namespace collisions disable insertion and explain what to
fix. Choose a destination diagram section and a unique namespace. **Add reference**
inserts one authored import in one Undo transaction, selects its first node, and
previews the floating child immediately. Select-all uses the full-export shorthand;
a partial selection writes explicit `nodes`/`edges`. No position is written until
you drag the child. Escape/Cancel, stale source, failed fetches, revision mismatch
or invalid imports leave source and history unchanged.

The dialog deliberately loads a chosen provider and its dependencies from the
same v3 index/revision lock the session pinned when referenced topology was
first needed (Canon entry, opening this dialog, an agent proposal, a paste or a
typed reference). It never refreshes existing providers, and it adopts a later
index only through the guarded **Use the latest published library** action
described above (offered after a revision mismatch; succeeds only while every
frozen provider keeps its revision). Browsing caches successful fetches for this
session; successful insertion, opening a diagram file, pasting or typing a
reference, opening an agent folder, or a committed agent review extends persisted
provider context. Undo
removes the import but retains the frozen cache for Redo. Recovery carries that
context and catalog; JSON downloads contain authored references, while offline HTML
exports contain a reader snapshot without provider context. Resolved JSON
snapshots opened in desktop Workbench allow Tracking edits on the consumer
document while keeping imported structure fixed. Offline, legacy v1/v2 and backend
sessions without a v3 authored-source catalog show an unavailable explanation,
without guessing network paths. When a chosen provider was republished after the
session pinned the library, the picker offers **Use the latest published
library**: it re-reads this site's index and adopts it only if every provider
already frozen in the session keeps its revision; otherwise reopen the diagram.

Agent and UI authoring use the same contract. The headless
`planAddTopologyImport(text, raw, sectionIndex, reference, context)` in
`src/workbench/commands/topology.js` returns a surgical source plan after resolving
the complete candidate with `FlowTopology.resolveSource`. It accepts the same
subset and placement fields, never writes provider hardcopy, and reports invalid
closure/collisions before publication. UI applies this plan through the normal
session transaction; agents can author equivalent reference JSON and validate
the complete approved batch using the Canon publisher. In a connected Workbench folder session,
submitting an agent proposal loads missing providers and their dependencies from
the same pinned catalog before validation. The review renders against this staged
context; only **Commit** publishes the provider context and authored spec/ledger
pair. Stop, disconnect, project changes, and changed proposals retire pending
loads without changing the document or its frozen context. Genuine merge conflicts
and unavailable or revision-mismatched providers still block the update.
The optional localhost helper uses the same pinned-provider preparation before
its automatic acceptance, retaining its exact-current-revision requirement and
one Undo transaction. It does not merge stale proposals or open a review dialog.

A brand-new or local draft uses the same picker. On a deployed site the picker
pins this site's v3 index when it opens; there is no connect step. The pin is
retained even if you close the picker without adding a reference. Diagrams whose
index entry lists no topology export are not offered, nor is the document's own
canon ID; an index published before export names existed still lists every
diagram. The Workbench gives the
draft a session-only consumer identity for resolution; browser recovery retains
it, but it is never written into the document. A site without a published
library (404, a version 1 or 2 index, or an offline `file://` editor) explains
that referenced topology is unavailable there; local exports still work. Local
provider files are deliberately unsupported. Agent proposals that add a
reference pin the same index during review, so an agent never receives an
instruction that only a human at the UI could follow.

Opening or pasting a local JSON file from Welcome, **File → open…**, typing a
reference into the JSON source, or opening/resuming an agent diagram folder, also
prepares its topology context without requiring a Canon visit. It reuses an
applicable frozen snapshot, including a complete backend snapshot without a
catalog. If new providers need a catalog and none is pinned, it pins this site's
approved v3 catalog while retaining all frozen provider bytes. Missing providers
are acquired from the pinned catalog and their full dependency closure
is verified before opening the source or initializing the folder. A different
consumer receives private temporary membership while retaining the approved
provider snapshots. Catalog addresses and provider context
embedded in local files are never used to authorize acquisition. Invalid providers,
changed saved files, cancelled setup and changed drafts prevent publication.
File reads and provider loading also retire on another file selection, navigation,
or editor destruction. Ordinary import-free files require no repository request.

Open the published consumer and choose **Edit in Workbench**. The local copy
renders imported topology and exposes ordinary steps, paths, failures and panels.
The provenance label names the frozen session; imported node/edge/group inspectors
identify their provider and omit structural controls. The source editor, Save,
JSON Download, recovery and Undo baseline retain the authored consumer's imports,
without imported hardcopy or generated provenance. Each preview resolves local
edits against the same frozen provider sources. Broken references are rejected
before builder transactions write source or add Undo. Raw invalid text remains
repairable while the last valid preview stays visible.

Consumer narrative and consumer-owned connections remain editable, including
connections from or to imported nodes and between imported nodes. Alt/Option-click
a source node (or choose **Connect from this node** in its Inspector), then click
the destination. The connection Inspector’s **from** and **to** lists include
imported nodes; changing an endpoint also retargets the consumer’s story references
in the same Undo action. Only the consumer connection is saved. Provider-owned
connection endpoints and protocol semantics remain read-only; their display labels
and layout can be customized locally. Edit shared structure in the provider. Drag an
imported node to rearrange just that node; drag the reference’s **⋯** handle to
move the whole block with its custom arrangement (a nested handle moves the
containing direct reference). Click the handle for reference
actions. **Reset node arrangement** in the Inspector or reference menu restores
the provider arrangement while preserving the block position. Each drag or reset
is one Undo action; Escape cancels an active drag.

The authored import stores optional `nodePositions`, keyed by provider-relative
exported node identity, such as `"nodePositions":{"api":{"x":0,"y":180}}`.
These are node centers relative to the import’s `position`, not displacements
from the provider layout. The first node drag also saves the current import
origin. Nodes without a saved center keep their provider-derived arrangement.
Moving the whole block changes only `position`. Provider refreshes retain saved
centers by stable identity; removed or deselected identities are validation
errors, so remove their saved entries when changing an import’s subset. Nested
identities use the full relative path (for example `inner::api`) on the direct
consumer import. Coordinates and resulting absolute centers must be finite and
between -100000 and 100000. Resolved JSON snapshots keep imported geometry and
structure fixed; open the authored consumer with its provider context to arrange
nodes. Snapshot Tracking fields remain editable in the consumer document.
In the imported node Inspector, **Inherited code references (read only)** shows
provider evidence. **Additional code references JSON** edits an array appended
after those references for this flow. Remove entries or use `[]` to remove local
additions. They are stored as `nodeCodeRefs: {"api": [codeReference, ...]}` on the
consumer import. Both inherited and appended entries obey the existing code
reference validation, including immutable revision SHAs and identity conflicts.

Imported edge labels, curve points and endpoint attachment handles can be dragged
on the desktop canvas. **Reset imported connection layout** restores provider
label position and routing while preserving any local display label. These edits use `edgeOverrides`, keyed by provider-relative
edge identity, for example `"edgeOverrides":{"api->store":{"labelDx":24}}`.
Allowed fields are `label` (display text), `labelDx`, `labelDy`, `curvePoints`, `curveControls`,
`bend`, `fromPort` and `toPort`. Numeric offsets
are finite and within ±100000; port offsets are between 0 and 1.
Ports and curves use their normal validated shapes. A field set to `null`
suppresses its inherited value (for example, a new through-point curve clears
inherited cubic controls); an omitted field inherits the provider value. Removing
the whole edge override restores provider presentation. The Inspector has separate
resets for display label and connection layout; each preserves the other. Semantic
endpoints, kind and other structure cannot be overridden.

`nodeOverrides` stores consumer presentation on stable provider-relative node
IDs. Allowed fields are `title`, `sub` (the existing subtitle field), `style`,
`tint`, `hidden`, and `presentation: "baseline"`. Titles/subtitles are strings;
style and tint use the normal supported tokens; hidden is a boolean. An omitted
field inherits the provider value; `null` suppresses it. **Reset node presentation**
removes that node's overlay and restores provider values. Hidden nodes retain
identity, geometry and narrative references; readers hide the card and incident
connections, while the desktop editor shows a faint selectable card for recovery.
The Inspector exposes display name/subtitle, style/tint and hidden controls. Source
identity, groups, binding, code references, icons, navigation and semantic fields
cannot be overridden through this map. Existing `nodeCodeRefs` remains the separate
additive evidence contract. Optional import-level `presentation: "baseline"`
copies baseline presentation metadata onto imported nodes and connections; a
node-level presentation override can suppress it. Imported baseline nodes and
connections fade in Ambient, Step and print, and remain readable when focused.
An explicit connection baseline takes precedence over its review status. Hidden
members stay hidden in readers and exports; the editor keeps a faint selectable
card for restoration. The convenience does not modify providers. See
[design reviews](design-review.md) for statuses, verdicts and path comparisons.

All override maps use full provider-relative paths for nested members on the direct
import: `inner::api` or `inner::api->inner::store`. Keys must remain selected and
exported, just like `nodePositions`; removed or deselected keys fail validation.
On provider refresh, inherited references update before the retained additions;
only explicitly overridden edge fields mask updated provider geometry. Frozen
session recovery, saved JSON and reopening preserve authored overlays; resolved
and offline views include the effective merged values. Materialized snapshots
opened as JSON without authored imports allow Tracking edits while keeping
imported structure and presentation protected. Each edit or reset has one Undo/Redo;
Escape, source changes and provider-context changes cancel held gestures.

Workbench draws a light labeled boundary around each direct and nested referenced
set; this editor-only cue is not persisted or shown on published pages. Selecting
any imported node, connection, or group exposes **Remove referenced topology**.
Removal deletes the one authored import in one Undo action only when consumer
connections, story references, registered panel references, and re-exports no
longer depend on it. Blockers are listed and never cascade-deleted.
Opening from Canon must load/validate the entire
closure before replacing a current draft. Recovery stores that authored closure
as auxiliary session context.

Workbench **File → export…** writes two different artifacts from the same stamped
source revision. The `.spec.json` retains authored imports and exports, without
materialized hardcopy or generated provenance. The `.html` is a read-only,
page-only snapshot: the current session resolves the consumer before export,
then removes `topologyImports`, `topologyExports`, and `topologyProvenance` from
every diagram in the HTML copy. Visible imported nodes and edges remain in that
copy, but provider documents and the `flowview-topology` context block do not.
The HTML opens offline and cannot pick up later provider changes.

Local export-only providers need no Canon context to export. Imported consumers
need the valid frozen closure already loaded in Workbench from the repository/
Canon source; export never discovers or fetches providers. Missing or broken
references stop export before either file is written. Keep the authored JSON
for editing and reopen Canon to obtain a later approved provider revision.
Maintained Canon/reference-backed diagrams use complete Canon validation and
Workbench. For a standalone local build, `tools/page_build.py <spec.json>
--resolve-imports <folder-or-registry>` derives membership and resolves the
complete registered import closure before validation and injection, preserving
authored references. See [local repository authoring](local-repository-authoring.md)
for the build command and desktop folder-opening workflow.

The earlier generated-snapshot/copy-changes-back workflow is superseded: **do not
edit or publish a flattened snapshot as source**. Review and commit the authored consumer
directly, preserving `topologyImports`. Provider changes require a rebuild and
explicit reload/reopen, or **Refresh local sources** for a repository project;
an already-open consumer never updates automatically.

## Executable example

[`examples/canon/topology`](../examples/canon/topology/registry.json) includes a
platform provider, default-floating checkout consumer, explicitly positioned
`checkout-positioned` consumer, node-only `checkout-subset` consumer, merged-export `checkout-shared` re-exporting
its imported platform identities, and `checkout-nested` consuming that re-export
with an additional presentation overlay:

```sh
python3 tools/build.py
node tools/validate.js examples/canon/topology/platform.json examples/canon/topology/checkout-shared.json examples/canon/topology/checkout-nested.json
node tools/canon/library.mjs --registry examples/canon/topology/registry.json --out .local/topology/diagrams.json
node --test tests/canon-topology.test.js
```

For central canon, enroll both folders in root `canon.json`; its folder-derived
IDs replace the legacy example registry's IDs. For local validation, pass the
authored consumer and its complete provider closure to `tools/validate.js` in one
invocation. It resolves that batch in memory, reports results against the original
filenames, and never writes a flattened source. The Canon publisher remains the
authority for validating and resolving the centrally enrolled source snapshot.

## Delivery tracking on canonical topology

Keep the architecture in Canon and place delivery annotations on the consumer's
imports. For example, the canonical provider exports its two components and their
connection:

```json
{
  "page": {
    "title": "Canonical service",
    "canon": {"version": 1, "id": "service", "kind": "canonical", "owner": "group:default/platform"},
    "sections": [{"id": "architecture", "diagram": {
      "nodes": {"api": {"title": "API"}, "store": {"title": "Store"}},
      "rows": [["api", "store"]],
      "edges": [{"from": "api", "to": "store", "label": "Persist"}],
      "topologyExports": {"core": {"nodes": ["api", "store"], "edges": ["api->store"]}}
    }}]
  }
}
```

The delivery board imports that structure without copying nodes or edges:

```json
{
  "page": {
    "title": "Service delivery",
    "canon": {"version": 1, "id": "service-delivery", "kind": "design", "owner": "group:default/platform"},
    "tracking": {"jira": {"site": "https://acme.atlassian.net", "epic": "API-100"}},
    "sections": [{"id": "delivery", "diagram": {
      "nodes": {}, "rows": [[]],
      "topologyImports": [{
        "spec": "service", "export": "core", "as": "canon",
        "nodeTracking": {"api": {"tickets": ["https://acme.atlassian.net/browse/API-101"], "prs": ["https://github.com/acme/api/pull/2"]}},
        "edgeTracking": {"api->store": {"tickets": ["API-102"]}}
      }],
      "steps": [{"id": "persist", "edge": "canon::api->canon::store", "text": "Persist data"}],
      "panels": [{"id": "delivery-status", "type": "live-status", "title": "Delivery status"}]
    }}]
  }
}
```

Open the authored consumer with its approved providers. In the desktop Inspector,
select an imported node or connection and use **Add ticket** or **Add PR**.
Inherited references are displayed read-only. Removal applies only to consumer
additions; each edit has one Undo/Redo. Duplicate additions do nothing.

`nodeTracking` and `edgeTracking` values accept `tickets` and `prs` arrays and
optional `existsWhen: "tickets-done"`. Existence requires all resolved tickets to
be Done, including inherited and local tickets. Provider-authored rules survive
imports and remain read-only in the consumer. A consumer may add or remove its
own rule using desktop Inspect → Tracking; reference edits and layout resets
preserve it. No valid resolved tickets warns and ignores the rule. See
[planned availability](live-status.md#planned-nodes-and-connections).
Jira keys or browse URLs, and PR URLs, follow the [tracking parser](live-status.md#fields); invalid
entries, unknown fields, and missing/deselected identities fail validation.
Nested imports use complete provider-relative keys such as `inner::api` and
`inner::api->inner::store`. The resolver appends local references after inherited
ones and deduplicates tickets by Jira key in order, retaining the first authored
reference and its browse URL when present. Provider refreshes preserve
local additions, including when a provider later adopts the same reference;
removing the local copy still leaves that inherited reference.

Tracking is independent of `nodeOverrides`, `nodePositions`, `nodeCodeRefs` and
`edgeOverrides`, so presentation and layout resets preserve it. Saved authoring
JSON retains only imports and overlays. Session recovery retains the approved
provider closure; offline HTML freezes the resolved effective values. A resolved
JSON snapshot carrying `topologyProvenance`, without its authored import, also
exposes desktop Inspect → Tracking:
**Missing work**, tickets, PRs and ticket-gated availability edit the frozen
consumer document directly and survive Undo/Redo, save and reload. These edits
never update the original provider. Imported structure, presentation, identities
and provenance remain protected. Text boxes do not expose Missing work or
availability. Connections expose Missing work and render as broken while Live
is enabled. Authored imports still
use their additive overlays and keep provider-inherited tracking read-only.

The live-status provider receives the resolved, distinct ticket keys and PR URLs.
Imported nodes, connections and consumer steps receive the same state colors,
dependency presentation and readiness calculations as locally authored carriers.
A repeated key counts once in ticket totals but each carrier contributes to
carrier coverage; board coverage buttons focus the imported node or connection.
Reader node menus and node/edge ticket popovers expose the merged links.

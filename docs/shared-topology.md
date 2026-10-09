# Shared topology imports

A provider owns reusable structure; each consumer owns its narrative. Imports
are validated against the complete approved snapshot at build time, then resolved
in memory when a reader or editor opens them. The fetched provider closure is
frozen for that session: no polling, live refresh, or automatic reconciliation.
Reloading/reopening can pick up a newly deployed revision.
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
order. Dragging any imported node moves **all** nodes and incident edge previews
and saves a position on that import, with one Undo/Redo. Internal structure stays
read-only. Escape, blur, invalid placement or a source change during drag cancels
without writing. Saved positions survive provider layout updates on explicit
reload/reopen; the internal geometry is freshly derived around the same origin.

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
export. Only that export's nodes and connections are offered. All start selected;
uncheck unwanted objects, keeping both endpoints of each selected connection.
Closure errors and namespace collisions disable insertion and explain what to
fix. Choose a destination diagram section and a unique namespace. **Add reference**
inserts one authored import in one Undo transaction, selects its first node, and
previews the floating child immediately. Select-all uses the full-export shorthand;
a partial selection writes explicit `nodes`/`edges`. No position is written until
you drag the child. Escape/Cancel, stale source, failed fetches, revision mismatch
or invalid imports leave source and history unchanged.

The dialog deliberately loads a chosen provider and its dependencies from the
same v3 index/revision lock captured on Canon entry. It never reloads that index
or refreshes existing providers. Browsing caches successful fetches for this
session; successful insertion, opening a diagram file or agent folder, or an explicitly
committed agent review extends persisted provider context. Undo
removes the import but retains the frozen cache for Redo. Recovery carries that
context and catalog; JSON downloads contain authored references, while offline HTML
exports contain a read-only page snapshot without provider context. Offline, legacy v1/v2 and backend
sessions without a v3 authored-source catalog show an unavailable explanation,
without guessing network paths. Reopen Canon to use a later deployment.

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

A brand-new or local draft uses the same picker. Choose **Connect repository
catalog** to explicitly pin the deployed v3 index, then browse approved providers
normally. The connection is retained even if you close the picker without adding
a reference, and a previously blocked agent proposal is checked again against it.
The Workbench gives the draft a session-only consumer identity for
resolution; browser recovery retains it, but it is never written into the
document. Local provider files are deliberately unsupported.

Opening a local JSON file from Welcome or **File → open…**, or opening/resuming
an agent diagram folder, also prepares its topology context,
without requiring a Canon visit or a separate picker connection. It reuses an
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
connections remain read-only. Edit shared structure in the provider; drag any
imported node to place its whole block.
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
Workbench. Reserve `tools/page_build.py` for explicitly requested standalone
workflows with ordinary local specs; it does not resolve authored topology.

The earlier generated-snapshot/copy-changes-back workflow is superseded: **do not
edit or publish a flattened snapshot as source**. Review and commit the authored consumer
directly, preserving `topologyImports`. Provider changes require a rebuild and
explicit reload/reopen; an already-open consumer never updates automatically.

## Executable example

[`examples/canon/topology`](../examples/canon/topology/registry.json) includes a
platform provider, default-floating checkout consumer, explicitly positioned
`checkout-positioned` consumer, and node-only `checkout-subset` consumer:

```sh
python3 tools/build.py
node tools/canon/library.mjs --registry examples/canon/topology/registry.json --out .local/topology/diagrams.json
node --test tests/canon-topology.test.js
```

For central canon, enroll both folders in root `canon.json`; its folder-derived
IDs replace the legacy example registry's IDs. Standalone `tools/validate.js`
intentionally rejects unresolved declarations: validate the materialized output,
or run the canon publisher to validate and resolve the complete source snapshot.

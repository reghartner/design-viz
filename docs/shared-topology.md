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
one base `rows` or `floats` placement. An export may consist entirely of floats;
the complete materialized consumer must still have valid `rows`. A consumer
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

Exports include selected nodes and edges, their catalog/code metadata, and the
group ancestry required by those nodes. Group IDs and parent references receive
the same namespace. Custom edge protocol definitions follow the export;
conflicting consumer definitions fail. Node link, handoff, and detail fields
are copied verbatim; they are not rewritten into topology imports. Keep any
local navigation destination valid in the consumer, or use an explicit external
handoff destination. Provider steps, paths, panels, reveal/hide step indices,
and named layout alternatives do not cross the export boundary.

Placement preserves the provider's selected base row order, columns and stack
order, filtering out unselected slots and empty rows. Selected rows append after
the consumer's own rows in import declaration order. Floats retain their side,
nudges or absolute coordinates; their automatic anchoring uses the materialized
graph. This is relative placement, not a frozen screenshot. Authors should use
row-based exports for reusable blocks; explicit float coordinates remain in the
consumer's coordinate system. Consumers may omit nodes/rows/edges if imports
supply them. Other layout settings remain consumer-owned.

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

Open the published consumer and choose **Edit in Workbench**. The local copy
renders imported topology and exposes ordinary steps, paths, failures and panels.
The provenance label names the frozen session; imported node/edge/group inspectors
identify their provider and omit structural controls. The source editor, Save,
JSON Download, recovery and Undo baseline retain the authored consumer's imports,
without imported hardcopy or generated provenance. Each preview resolves local
edits against the same frozen provider sources. Broken references are rejected
before builder transactions write source or add Undo. Raw invalid text remains
repairable while the last valid preview stays visible.

Consumer narrative and local node-to-imported-node edges remain editable. Edit
shared structure in the provider. Opening from Canon must load/validate the entire
closure before replacing a current draft. Recovery stores that authored closure
as auxiliary session context. Offline HTML export embeds the authored consumer
and frozen authored provider context, resolving only in memory on open.

The earlier generated-snapshot/copy-changes-back workflow is superseded: **do not
edit or download a flattened snapshot**. Review and commit the authored consumer
directly, preserving `topologyImports`. Provider changes require a rebuild and
explicit reload/reopen; an already-open consumer never updates automatically.

## Executable example

[`examples/canon/topology`](../examples/canon/topology/registry.json) includes a
platform provider and checkout consumer with successful and blocked-storage paths:

```sh
python3 tools/build.py
node tools/canon/library.mjs --registry examples/canon/topology/registry.json --out .local/topology/diagrams.json
node --test tests/canon-topology.test.js
```

For central canon, enroll both folders in root `canon.json`; its folder-derived
IDs replace the legacy example registry's IDs. Standalone `tools/validate.js`
intentionally rejects unresolved declarations: validate the materialized output,
or run the canon publisher to validate and resolve the complete source snapshot.

# Shared topology imports

A provider owns reusable structure; each consumer owns its narrative. Imports
resolve at canon build time from the complete approved snapshot. Renderers never
fetch providers, reconcile revisions, or update an open editor automatically.
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
one base `rows` or `floats` placement; at least one must be row-placed. A consumer
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
first to derive each source's membership. Fetch all sources at one approved SHA,
materialize the entire snapshot, then apply viewer authorization to the results.
An authorized consumer includes the provider content that it embeds; make this
part of your repository review/access policy. Index and serve those same results.

The publisher creates ordinary self-contained JSON under
`<index filename>.specs/<content SHA256>.json` and switches the index atomically
only after every file passes. Existing content-addressed files remain available
for readers holding an old index. Deploy this directory with the index; do not
delete old files during a live index switch. Failed validation leaves the prior
published snapshot intact. Raw source files stay unchanged. `buildLibrary` and
`buildLibraryFromDirectory` return proposed indexes without writing artifacts;
use `publishLibrary` or its CLI to install the files and index together.

Materialization removes source declarations and writes `topologyProvenance`
on consumers (version, provider/export/namespace and imported identity lists).
Materializing such a snapshot again is idempotent, with no provider refresh.
Never mix source declarations with this generated provenance. To refresh,
rebuild the original authored sources. Evidence baseline tools likewise update
the original providers, preserving imports instead of flattening them.

## Authoring in Workbench

Open the published consumer and choose **Edit in Workbench**. The local copy
renders imported topology and exposes ordinary steps, paths, failures and panels.
The provenance label names the snapshot; imported node/edge/group inspectors
identify their provider and omit structural controls. Builder transactions reject
changes to imported structure or placement before writing source or adding Undo
history. Consumer narrative and local connecting edges remain editable.

Raw JSON editing is an explicit escape hatch, not an access-control boundary.
There is no live update/reconciliation UI. Downloaded JSON is a materialized local
snapshot; copy reviewed narrative changes back to the consumer source, preserving
its `topologyImports`, and rebuild canon. Edit shared structure in the provider.

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

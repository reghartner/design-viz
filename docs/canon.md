# Canonical flows and connected evidence

Ordinary HLD specs remain valid and work offline. Connected specs add optional
metadata. Canonical promotion is a human review, not an inference from Backstage.
`examples/canon/` is a fictional central repository, catalog and source history.

## Authoring contract, version 1

`page.canon` identifies a story:
`{"version":1,"id":"doorbell","kind":"canonical","owner":"group:default/home-team"}`.
Use `kind:"design"` for proposed HLD stories. Preserve `page.generatedFrom` and
section `source` links. Code-referenced steps must have stable IDs.

Nodes may have `binding` containing `entityRef`, `label`, `owner`, `catalogUrl`,
`telemetry:{serviceName}`, and optional `api` with `entityRef`, `title`,
`definitionUrl`, `operationId`, `method`, `path`, and `endpoints` keyed by
environment. These are metadata and links; the viewer never invokes an API.
Snapshots travel with exports; catalog IDs remain the durable identities.

In the workbench, expand **Company repository**, paste a version-1 catalog JSON
(see `examples/canon/catalog.json`) and choose **Load catalog**. Select a node:
**Company service**, **Service API**, and **API operation** constrain choices to
the selected service. Labels and narrative remain authored. Binding JSON is
editable without a catalog. A hosted repository can initialize the controls
through the same-origin `/api/canon/context` adapter.

Nodes and steps may contain `codeRefs` arrays:

```json
{
  "id":"recording.create",
  "repository":"https://github.com/example/recording",
  "path":"src/recording.js",
  "revision":"1111111111111111111111111111111111111111",
  "anchor":{"start":"// flow:create:start","end":"// flow:create:end"},
  "startLine":12,
  "endLine":29,
  "purpose":"Recording is stored before notification"
}
```

The SHA is illustrative: use the immutable revision actually reviewed. Anchors
are unique literal lines (ignoring surrounding whitespace), inclusive at both
ends. They may be existing declarations/comments or explicit markers. Missing,
duplicate or reversed anchors require repair; anchors are never executed or
treated as regexes. Line numbers are navigation hints at the pinned revision.
IDs must consistently identify the same location and baseline within a spec.

Use the step inspector's **Code and trace evidence** disclosure to edit reference
arrays. Viewers show code links for the selected step, catalog links on bound
nodes, and a **Services, APIs and source code** disclosure above the diagram.
Unsafe or credential-bearing URLs do not become evidence links.

See `docs/canon-build-plan.md` for the drift/incident workflow. Missing telemetry
is unknown, not a failure. Agent suggestions require review before publication.

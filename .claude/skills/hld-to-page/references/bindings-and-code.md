# Backstage bindings and code references

Use this workflow for every diagram with nodes, at every audience level. Treat
each node separately: determine whether a Backstage binding applies, whether
code or documentation applies, and record the evidence or gap. Audience changes
what appears in the story, not whether references behind nodes are discovered.
They drive the reader's
node menu (Backstage, API and source links), the Backstage **Diagrams** tab,
and code-drift scanning. Field definitions: `docs/canon.md` (relative to VIZ).

## Discover before asking

1. Preserve supplied bindings, codeRefs and links. For a bounded cosmetic edit,
   verify the affected nodes and do not turn the task into whole-document
   enrichment. New or changed nodes or behavior require discovery.
2. Check and read every relevant available authorized source for the depicted
   nodes before asking: the request, source and ledger; the project's approved catalog (normally
   `workbench/catalog.json`); supplied repositories, checkouts and source links;
   and authorized catalog or repository integrations available in the session.
   Fetch reachable supplied sources rather than treating their URL as evidence.
   The fictional `examples/canon/` fixtures demonstrate the format and are never
   company evidence.
3. For every node, assess binding, implementation code and documentation
   independently. For each, record the sources checked and one result: verified
   reference; `not applicable` with a reason; or an honest gap with retrieval
   attempts. Documentation can complement code, but cannot replace a missing
   implementation reference when code applies. People, devices and aggregate
   nodes usually have no catalog binding, but may still have applicable code or
   documentation links. Never invent a service identity for an aggregate node.
4. If an Engineering or Mixed diagram still lacks a needed source or access,
   ask where the approved catalog or repository can be accessed, in plain
   language. Do not ask the operator to manufacture a SHA or anchor. For a
   Story diagram, do not interrogate a business reader about technical
   locations; record the per-node gap for engineer follow-up. A story with no
   diagram nodes needs no catalog or repository question.

## Rule: verified identities only

- Copy `entityRef`, `owner`, `catalogUrl`, API fields and repository URLs
  exactly from a verified approved catalog, the operator, or the inspected checkout
  (`git -C <checkout> remote get-url origin`, `git -C <checkout> rev-parse HEAD`).
- Never build an entityRef or URL from a node title. Never guess a GitHub URL
  from a local path. Never shorten or invent a SHA.
- Copy supplied code references exactly, including their `id`; never rename or
  normalize them.
- A service node absent from every applicable catalog checked stays **unbound**.
  Record the checked sources in worksheet section H and a ledger gap such as
  `unbound: not found in <approved catalog>`.
- Devices, people, phones, third-party services and aggregate nodes are usually
  not catalog services. Record why binding is inapplicable, then evaluate their
  code and documentation separately.

## `node.binding`

Catalog entries look like this (version 1 snapshot):
`services[] = {entityRef, title, owner, catalogUrl, telemetry:{serviceName}, apis:[{entityRef, title, definitionUrl, endpoints:{<env>: url}, operations:[{operationId, method, path}]}]}`

Map one service to a node binding. `api` is optional in the contract
(`docs/canon.md`). Include it, with the one operation (`operationId`,
`method`, `path`) the diagram's main step for that node uses, when the
catalog lists that operation. Never invent an operation to fill the block:

```json
"binding": {
  "entityRef": "component:default/recording-service",
  "label": "Recording service",
  "owner": "group:default/home-team",
  "catalogUrl": "http://localhost:8766/catalog/default/component/recording-service",
  "telemetry": {"serviceName": "recording-service"},
  "api": {
    "entityRef": "api:default/recording-service",
    "title": "Recording service API",
    "definitionUrl": "http://localhost:8766/apis/recording-service",
    "endpoints": {"development": "https://recording-service.example.test"},
    "operationId": "createRecording",
    "method": "POST",
    "path": "/recordings"
  }
}
```

Include only fields the catalog supplies. `label` is the catalog title. The
binding is metadata; the viewer never calls the API. Keep the node's `title`
as authored (short, fits the card).

## `codeRefs` on nodes and steps

```json
"codeRefs": [{
  "id": "recording-service.createRecording",
  "label": "createRecording",
  "repository": "https://github.com/fictional-home/doorbell-services",
  "path": "src/recording-service.js",
  "revision": "1111111111111111111111111111111111111111",
  "anchor": {"start": "// flow:createRecording:start", "end": "// flow:createRecording:end"},
  "startLine": 2,
  "endLine": 6,
  "purpose": "Recording service accepts the request and begins the recording workflow."
}]
```

- `revision` is the full immutable commit SHA (40 to 64 hex characters) from an
  inspected supplied repository/checkout or the operator.
- `anchor.start` and `anchor.end` are literal lines that each occur exactly once
  in that file at that revision (surrounding whitespace ignored), start before
  end. Existing function declarations or comments work. Check uniqueness:
  `git -C <checkout> show <sha>:<path> | grep -cF '<anchor line>'` must print 1.
- `startLine`/`endLine` are the inclusive line numbers of the anchored block at
  that revision.
- `purpose` says in one sentence what this code does in the story.
- `id` names one location; reuse the same `id` only for the same location and
  revision.
- Put each `codeRefs` entry on the **node** that owns the code, always, even
  when that code never runs in this story (an offline rule the story never
  triggers still explains the node). Put it on a **step** only when that code
  runs in that step: the step's edges or tone involve the owning node, and the
  code's `purpose` matches the beat (an upload handler is not on a read step;
  an offline rule is not on an outage shorter than its threshold). A reference
  on steps only is incomplete. Steps with codeRefs need stable `id`s.
- Only reference code you (or the operator) actually located. If the source
  names a behavior but no code was found, record `code: not located` plus the
  repositories, links or integrations attempted in section H.

## Ledger rows

Add a ledger row for every node's binding/code applicability and evidence or
gap. Bound nodes point to `nodes.<id>.binding`; unbound services name the
approved catalogs checked; inapplicable nodes say why. Add a `service`-class
row for each codeRef with its path, lines and SHA.

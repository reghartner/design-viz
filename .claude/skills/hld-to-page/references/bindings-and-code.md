# Backstage bindings and code references

Bindings and code references are required whenever the operator supplies a
catalog or a code location. At engineering level, ask for both in Phase 2
if they are missing. At story and mixed level, do not ask: use what was
supplied or can be found, leave bindings and code references out where there
is none, and record the gap under "Decisions I made" in the ledger. They drive the reader's
node menu (Backstage, API and source links), the Backstage **Diagrams** tab,
and code-drift scanning. Field definitions: `docs/canon.md` (relative to VIZ).
The fictional example catalog is `examples/canon/catalog.json`; the example
spec that uses it is `examples/canon/specs/doorbell.json`.

## Rule: supplied identities only

- Copy `entityRef`, `owner`, `catalogUrl`, API fields and repository URLs
  exactly from the supplied catalog, the operator, or the supplied checkout
  (`git -C <checkout> remote get-url origin`, `git -C <checkout> rev-parse HEAD`).
- Never build an entityRef or URL from a node title. Never guess a GitHub URL
  from a local path. Never shorten or invent a SHA.
- A service node that is not in the catalog stays **unbound**. Record it in
  worksheet section H and as a ledger row: `unbound: not in supplied catalog`.
- Devices, people, phones and third-party services are usually not catalog
  services. Write `not a catalog service` in section H.
- If no catalog was supplied and the operator did not answer, bind nothing and
  record the gap for each service node.

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

- `revision` is the full immutable commit SHA (40 to 64 hex characters) from the supplied checkout or
  the operator.
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
  names a behavior but no code was found, record `code: not located` in section H.

## Ledger rows

Add one `service` ledger row per bound node (`covered @ nodes.<id>.binding`)
and per unbound service (`out-of-scope: unbound, not in supplied catalog`).
Add a `service`-class row for each codeRef with its path, lines and SHA.

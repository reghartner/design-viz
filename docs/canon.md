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

## Run the simulated company repository

From the design-viz root:

```sh
python3 tools/build.py
node apps/backstage-mock/server.mjs
```

Open `http://localhost:8766/` (or this machine's LAN address from a phone). The
portal loads the fictional registry, hosts the existing workbench with catalog
pickers, and displays code drift reviews. **Scan for code drift** reveals a
recording timeout change. Repeating a scan reuses the review. Enter a reason and
choose **No behavioral impact**, **Record regression ticket**, or **Update spec**.
The latter opens a draft with the new pinned code reference; edit the narrative
and **Company repository → Propose spec update**, then approve it in the portal.

Decisions and proposed specs persist in gitignored `.local/canon/state.json`.
The checked-in fictional fixtures remain unchanged. Regression tickets are local
simulations with a reason, not real team tickets. This server is a development
adapter with fictional data and no company authentication; do not point it at
private production data. Real deployment supplies authenticated backend routes
and permission checks, while the browser/editor contract stays the same.

The registry is version 1 with `diagrams:[{id,path,title}]`; paths are relative to
its file, must stay beneath it, and IDs must match `page.canon.id`. Add further
specs to the registry to include them in drift scans. Central ownership is kept
in the spec and catalog. Local mutations are serialized and stale proposals are
rejected instead of overwriting newer revisions.

## Drift CLI and GitHub integration

```sh
node tools/canon/cli.mjs scan --registry examples/canon/registry.json --state /tmp/canon-state.json --out /tmp/canon-report.md
node tools/canon/cli.mjs decide --registry examples/canon/registry.json --state /tmp/canon-state.json --review REVIEW_ID --disposition no-impact --reason 'Reviewed refactor; behavior unchanged'
```

The scanner reads source text and unique anchors. It never executes repository
code. Identical anchored content after unrelated line movement is ignored;
missing source or anchors produces a repair review. All affected diagrams and
steps are listed. Acceptance updates only the exact reviewed reference revision;
regressions preserve the expected spec and retain a linked issue. Bare closure is
not a disposition. A separate scan cursor/review identity avoids repeated reports.

`.github/workflows/canon-drift.yml` is disabled until the repository variable
`FLOWVIEW_CANON_ENABLED=true` is set. Before enabling it, set `FLOWVIEW_REGISTRY`
to the company registry path and supply `FLOWVIEW_SOURCE_TOKEN` with read access
to the watched repositories (prefer a company installation-token integration).
`GITHUB_TOKEN` needs contents and PR write access to the central spec repository.
The weekday schedule is 06:23 UTC; workflow dispatch also runs a scan.

The company runner opens one bot PR per changed reference scope with the code
comparison and all affected steps. Label a review `flowview/no-impact` and close
it to record acceptance. Alternatively label `flowview/regression`, add
`Regression ticket: https://...` to its body, and close it to retain expected
behavior and record the outstanding issue. Exactly one disposition is required.
The actor must have repository write/maintain/admin permission. Closed reviews
without a disposition never advance the baseline. A moved source or changed
scope requires a new review. Intended behavior changes go through a normal spec
PR. Baseline acceptance writes specs and `.flowview/drift-state.json` atomically
in one Git commit. Branch protection is respected: if bot commits are disallowed,
company integration must route that commit through its protected-branch process.

The workflow always checks out the trusted default branch, never a PR head.
Watched code and report content remain data. PR creation/deduplication and the
source adapter are tested against an HTTP GitHub double; no real GitHub scans or
company PRs are created by the local demo.

`tools/canon/backstage.mjs` is the read-only company catalog adapter. It paginates
Backstage's catalog and maps components, ownership, provided APIs and resolved
OpenAPI JSON operations into the same snapshot shape as the mock. YAML API
contracts need conversion in the company adapter; unsupported contracts remain
linked with a visible warning. `flowview.io/telemetry-service` maps a catalog
component to its trace service name when they differ. Credentials stay server-side.

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

## Reference traces and incident alternates

The portal's **Trace evidence** controls accept pasted JSON or a local JSON file.
Load the fictional **Happy reference**, preview the mapping, supply a reason,
and **Approve reference mapping**. Then load **Recording service · HTTP 500**,
**Database latency**, **Queue buildup + backpressure**, **Missing database span**,
or **Explicit delivery failure** and **Compare incident**. Choose the orange
path in the embedded viewer. Download its portable spec, or **Propose incident
as alternate** and review the proposed spec before making it canonical.

The reference approval persists an explicit local review, sanitized operational
span metadata, and the reviewed selectors. The comparison is a separate overlay;
it never edits the stored canonical flow. The last 20 comparison results persist
in local state. Physical actions and customer outcomes after a divergence need
human review; an observed server span alone does not prove a phone displayed an
alert. The shared prefix is the authored baseline, not independent verification
of uninstrumented actions. The viewer's **Trace evidence and comparison limits**
disclosure carries these qualifications into standalone and Forge exports.

Steps bind evidence with optional `traceMatch`:

```json
{
  "id":"persist",
  "traceMatch":{
    "serviceName":"clip-store",
    "operation":"INSERT clip",
    "nodeId":"database",
    "parentStepId":"upload",
    "role":"database",
    "maxDurationMs":150
  }
}
```

Matching uses exact service and operation names. Optional `namespace` and
`attributes` disambiguate services/calls. `parentStepId` requires an ancestor or
same-trace span-link relationship, including async consumers. `occurrence:1`
selects the first of fully timed, non-overlapping calls; concurrent calls require
an explicit attribute or parent selector. `repeat:"attempts"` groups calls only
when distinct numeric `retry.attempt` values and a common parent establish an
attempt group. It cannot be combined with `occurrence`. A span cannot silently
satisfy two authored steps. Missing or ambiguous matches remain visible.

Budgets are authored expectations, not inferred SLOs. `maxDurationMs` compares
individual observed durations. `maxQueueDepth` uses `messaging.queue.depth` or
`queue.depth`; absent measurements remain unknown. `panelId` can name a declared
`queue` panel: measured buildup adds a held-state patch labeled **Last measured**.
`messaging.message.age_ms` supplies oldest age. `flow.backpressure:true` and
`flow.delivery_failed:true` are explicit instrumentation adapters; they are never
inferred from a missing span. A received HTTP error animates the observed call;
only explicit failed delivery creates a broken edge.

Input accepts a nonempty span array, `{spans:[...]}`, or Honeycomb `{events:[...]}`
with event `data`. Fields are `trace.trace_id`, `trace.span_id`, `trace.parent_id`,
`service.name`, `name`, `duration_ms`, ISO `timestamp`/event `time`, and `error`.
Aliases are `traceId`, `spanId`/`id`, `parentId`, `serviceName`, `operation`,
`durationMs`, and numeric `startMs` **in milliseconds**. The importer preserves
same-trace `links:[{traceId,spanId}]`. OTLP resourceSpans and opaque Honeycomb
query result bundles need conversion to this shape; unsupported input fails
visibly rather than guessing duration units. One import contains exactly one
trace, at most 10,000 spans and (through the portal) 2 MB of JSON.

Only identity/timing/error fields and these operational attributes are retained:
`service.namespace`, `service.version`, `deployment.environment.name` (or legacy
`deployment.environment`), `http.response.status_code`/`http.status_code`,
`db.system`/`db.system.name`, `messaging.queue.depth`/`queue.depth`,
`messaging.message.age_ms`, `flow.backpressure`, `flow.delivery_failed`,
`retry.attempt`, and `flow.step.id`. Bodies, headers and other arbitrary attributes
are dropped. Span operation names and source URLs still need the company's
normal data handling policy. Environment mismatches block comparison; missing
environment and service version changes are reported. Changed selectors or budgets
require reference reapproval. Unmatched spans are reported and never assigned
invented nodes, outcomes or root causes.

`diagram.referenceTrace` holds the approved mapping and reference.
`diagram.incidents` holds portable comparison provenance. Generated divergent
steps have unique IDs, `evidence`, and `conditions`. Conditions accept
`service-error`, `delivery-failed`, `slow`, `database-slow`, `queue-buildup`,
`backpressure`, `retry`, `unknown`, and `ambiguous`, plus a readable `label`,
optional `nodeId`, and measured values/span IDs. The renderer shows semantic icons,
per-step diagnostics, and node animations with a reduced-motion alternative.
These controls are under **Code and trace evidence** in the step inspector.

For agent workflows:

```sh
node tools/canon/trace-cli.mjs preview --spec examples/canon/specs/doorbell.json --trace examples/canon/traces/happy.json
node tools/canon/trace-cli.mjs reference --spec examples/canon/specs/doorbell.json --trace examples/canon/traces/happy.json --reason 'Reviewed fixture mapping' --out /tmp/doorbell-reference.json
node tools/canon/trace-cli.mjs compare --spec /tmp/doorbell-reference.json --trace examples/canon/traces/backpressure.json --out /tmp/doorbell-incident.json
```

These commands write proposed files; committing a reference or incident into the
central repository remains a reviewed change. See the
[company integration handoff](backstage-integration.md) and
[doorbell incident cookbook](../cookbook/canonical-incidents.md).

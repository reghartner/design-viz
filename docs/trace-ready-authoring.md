# Make an existing diagram Trace-ready

Use this workflow to align an accepted diagram with actual spans, preserving its
story and placement. Run commands from the repository root or the source-free
kit's **VIZ** directory. Editing and visual verification are desktop-only.
Create a unique output directory once per author session, then keep using that
shell's `TRACE_CHECK_DIR` for the commands below. Never reuse another author's
temporary spec or reports. Keep this directory out of authored deliverables and
retain its path with your validation evidence. Source specs and trace inputs remain unchanged.

```sh
TRACE_CHECK_DIR="$(mktemp -d "${PWD}/.trace-check.XXXXXX")"
python3 tools/authoring-packet.py --feature traces --mode edit --out "$TRACE_CHECK_DIR/trace-packet.md"
```

## 1. Inspect the source and evidence before editing

Read the existing spec, its ledger, selected section and paths, and any imported
providers/registry. Record stable section, node, edge and step IDs. Preserve
layout, labels, story order, existing selectors and unrelated bindings. Do not
regenerate the diagram from the trace or replace it with a service-name graph.
A display name is never a join key.

Obtain representative actual span JSON using authorized evidence or a supplied
export. A trace URL is provenance, not data or permission to fetch. Inspect each
span's trace ID, span ID, parent/link IDs, exact service and operation strings,
timing units, retained attributes, and reported completeness. Use one trace per
mapper input. Supported input is a span array, `{spans:[...]}`, or Honeycomb
`{events:[...]}` with event `data`; see [input fields](canon.md#reference-traces-and-incident-alternates).
OTLP resourceSpans require conversion; do not guess units. Record an evidence
ledger row for each intended mapping: source section → step → node/edge → exact
service/operation → distinguishing parent/attribute → representative span IDs.
Keep missing evidence as a gap. Do not invent budgets, protocols or outcomes.

## 2. Attach exact selectors to existing steps

**Clicking or navigating steps never selects or fetches a trace**. In the
existing step that represents the observed operation, add `traceMatch`,
preserving the step's ID, narrative and delivered `edge` or
`edges`. `nodeId` names an existing stable node in this source section, normally
the receiving node for that operation. It is not a provider service-name guess.
`traceMatch` on a node or edge is ignored (warns). To time a node or
connection in every story, declare its spans under `trace.spans`; steps without
`traceMatch` inherit them and `traceScope` narrows ([declared spans](provider-traces.md#trace-spans-declared-on-nodes-and-connections-1290),
[example](../examples/trace-ready/declared.spec.json)).

The Trace view shows a span's exact service and operation ([details](live-status.md#direct-trace-loading)).

```json
{
  "id": "persist",
  "text": "Write record",
  "edge": "api->store",
  "traceMatch": {
    "serviceName": "record-store",
    "operation": "INSERT record",
    "nodeId": "store",
    "parentStepId": "receive",
    "attributes": {"db.system": "postgresql"}
  }
}
```

Copy exact, case-sensitive values from evidence. Attribute value types must also
match (a number is not a string). `parentStepId` names another authored step on
the same path whose matched span is an ancestor or reachable same-trace link;
it is not a raw parent span ID. That parent must map uniquely. Optional
`namespace` matches `service.namespace`. Only operational attributes retained by
the [normalizer](canon.md) can disambiguate: `service.namespace`,
`service.version`, `deployment.environment.name` / `deployment.environment`,
`http.response.status_code` / `http.status_code`, `db.system` / `db.system.name`,
`messaging.queue.depth` / `queue.depth`, `messaging.message.age_ms`,
`flow.backpressure`, `flow.delivery_failed`, `retry.attempt`, and `flow.step.id`.
Other tags, payload fields and request IDs are dropped (profiles may keep
[`allowedAttributes`](provider-traces.md#allowed-match-attributes)); do not write
selectors against them. Prefer stable instrumentation meaning to timings.

`occurrence:1` is only for serial, fully timed calls; `repeat:"attempts"` needs
distinct `retry.attempt` values and one parent; never combine them. One span
matching two steps is ambiguous. Do not silence ambiguity by renaming nodes,
taking the first span or inventing attributes; report what instrumentation is
missing ([more](provider-traces.md#duplicate-calls-and-retries)).

Only uniquely matched delivered edges receive operation-duration annotations.
Multiple steps claiming the same edge cannot supply one exact edge duration.
These durations are not network latency. Add `maxDurationMs` or `maxQueueDepth`
only from an explicit existing requirement or user-approved budget, with its
source in the ledger. Missing spans mean **not observed / outcome unknown**;
errors require actual error evidence, and failed delivery/backpressure require
explicit instrumentation. A normal trace is not proof every branch succeeds.

## 3. Apply the same rules to imported nodes

Include local, direct, nested, shared-topology and asynchronously loaded detail
nodes. Never flatten imports into the saved candidate. Follow
[shared topology](shared-topology.md) to edit the correct authored provider or
supported consumer overlay. Provider-local `traceMatch.nodeId` references are
remapped by topology resolution; consumer steps targeting imported nodes use
the exact resolved namespace such as `outer::shared::store`. Retain registry
identity, import aliases and provenance; do not strip prefixes or join identical
node/step IDs across sections. Async details must be inspected and validated in
their selected source section, then checked after load and replacement in the UI.

`--resolve-imports` resolves imports in memory; the authored file is never
written (use the actual candidate, and its registry or repository folder):

```sh
node tools/canon/trace-cli.mjs preview --spec /path/to/candidate.spec.json --resolve-imports /path/to/registry.json --trace /path/to/request.json --section 0 --out "$TRACE_CHECK_DIR/trace-mapping.json"
```

## 4. Validate mapping before enabling a provider

This fictional example, bundled in the repository **and portable kit**,
demonstrates mapping only. The read-only preview command writes a report, not a
spec:

```sh
node tools/validate.js examples/trace-ready/existing.spec.json
node tools/canon/trace-cli.mjs preview --spec examples/trace-ready/existing.spec.json --trace examples/trace-ready/normal.json --out "$TRACE_CHECK_DIR/normal-mapping.json"
node tools/canon/trace-cli.mjs preview --spec examples/trace-ready/existing.spec.json --trace examples/trace-ready/partial.json --out "$TRACE_CHECK_DIR/partial-mapping.json"
node tools/canon/trace-cli.mjs preview --spec examples/trace-ready/existing.spec.json --trace examples/trace-ready/ambiguous.json --out "$TRACE_CHECK_DIR/ambiguous-mapping.json"
```

Inspect `mapping.steps`: normal maps `receive` and `persist`; partial leaves
`persist` missing with an unknown condition; ambiguous leaves `persist` ambiguous.
Inspect `mapping.unmatched`, `mapping.warnings` and span IDs too. Exit zero means
the preview ran, **not** that all mappings succeeded. `eligible` and `reason`
concern optional canonical reference approval, not permission to show a Trace
overlay. Ordinary Status Trace mode requires no `referenceTrace` or reference
approval. The `reference` and `compare` CLI commands are a separate optional
[canonical incident workflow](../cookbook/canonical-incidents.md); do not run
them merely to align an existing diagram.

CLI `preview --section N` selects a zero-based diagram section and checks its
first path (or all steps if no paths). For each additional path, run the same
production matcher read-only with its exact ID, one uniquely named report each:

```sh
node --input-type=module - "$TRACE_CHECK_DIR/trace-resolved.spec.json" /path/to/request.json 0 PATH_ID > "$TRACE_CHECK_DIR/path-mapping.json" <<'JS'
import fs from 'node:fs';
import C from './tools/canon/core.cjs';
import {normalizeTrace, mapTrace} from './tools/canon/traces.mjs';
const [specFile, traceFile, section, pathId] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const d = C.sections(spec)[Number(section)].diagram;
if (!d.paths?.some(p => p.id === pathId)) throw Error('Unknown path');
console.log(JSON.stringify(mapTrace(d, normalizeTrace(JSON.parse(fs.readFileSync(traceFile, 'utf8'))), pathId), null, 2));
JS
```

Retain reports for a representative normal request, partial evidence and repeated
or ambiguous calls. If actual examples are unavailable, label synthetic boundary
fixtures explicitly; they test mapping behavior, not production health.

## 5. Bind retrieval separately, then inspect the desktop viewer

`traceMatch` explains how a returned trace maps. It does **not** retrieve traces.
For live retrieval, separately author a verified carrier `telemetry.signals`
query and page `tracking.telemetry` provider configuration according to
[provider traces](provider-traces.md). For example, an explicitly verified
Honeycomb signal for the fictional service could be:

```json
{"telemetry":{"kind":"call","signals":{"trace":{"honeycomb":{
  "query_spec":{"filters":[{"column":"service.name","op":"=","value":"request-api"}]},
  "raw_row_columns":["trace.trace_id","error"],"results_limit":20
}}}}}
```

This fragment belongs on an existing carrier; it is not a complete connection.
Use real verified environment/dataset values and authorized provider capabilities,
never derive them from node names. Exported evidence alone can be validated offline; it does not automatically
populate the Status Trace list. Runtime host-preloaded evidence needs the validated
provider envelope, not an arbitrary exported JSON file. Live timelines have a
200-span display limit; offline mapper input has a different 10,000-span bound.

Use the existing `live-status` panel (add one only if the requested document needs
it, preserving authored layout). Choose **Trace**, explicitly enable retrieval
when permitted, choose a returned candidate/source, and inspect the mapped route.
Verify switching candidates changes real node/edge evidence while stepping keeps
the same trace selected. Confirm Jira mode restores its cues, partial/ambiguous
operations remain unknown, and imported/detail nodes behave equivalently. Provider
refusal, page/host opt-outs, history, telemetry off and closed/replaced details
must not retain stale overlays. No provider access: report offline mapping results
and the unverified live check honestly.

## 6. Update and hand off

Re-run the same reports when instrumentation, paths, imports or selectors change.
Preserve stable IDs and placement; change only mappings supported by new evidence,
recording before/after span identities, unresolved gaps and budget provenance in
the ledger. Do not auto-accept renamed operations or rewrite narrative outcomes
from missing spans. If the document already uses an approved canonical reference,
selector/budget changes require that optional workflow's reference reapproval.
Deliver the candidate spec/ledger and report paths through the existing desktop
review workflow.

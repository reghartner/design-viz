# Runtime provider exemplars (#946)

For explicit ID/link retrieval without search or bindings, use [direct trace connection profiles](trace-connections.md). The query-candidate contract below remains unchanged.

This runtime contract supplies #947 with trace evidence. It adds no caption, card,
packet UI, authoring fields, save writes, or numerical Proof classification.
Document editing remains desktop-only. Local, direct/nested imported, and actual
asynchronously loaded carriers use the same controller binding walk.

## Explicit bindings and discovery

An existing `signals.<name>.tempo` value is the exact authored TraceQL string.
An existing opaque Honeycomb value can express native raw-sample intent:

```json
{
  "honeycomb": {
    "query_spec": {"filters": [{"column":"service.name","op":"=","value":"event-ingest"}]},
    "raw_row_columns": ["trace.trace_id", "error"],
    "results_limit": 20
  }
}
```

A scalar Honeycomb calculation body still goes only to the scalar adapter.
A wrapper goes only to the exemplar adapter. Within each carrier, the **first
explicit trace signal in authored key order** wins, even across providers. No
query, service binding, join, trace ID, or provider UI path is inferred.

Hosted `listTools` supplies tool metadata. After the viewer turns Metrics on,
the runtime requests the selected connector's scoped permission and calls
`describeTool(server, tool)` for its search/detail schemas. No permission prompt
or schema request blocks the initial paint. Denial hides that source without
retrying; off, environment changes and destruction retire pending work. Legacy
hosts may still supply schemas in the list. Each schema must declare supported
argument types and required fields. Honeycomb `query_spec` may be an object or JSON string, as declared by the
actual schema; expected-type-plus-null unions are supported. Honeycomb dataset
is optional when the schema permits omission. Raw columns and limit are top-level. The page window (24h default)
accepts `6h`, `-6h` or `now-6h` (surrounding whitespace ignored). These
lookbacks normalize internally to `6h`. Honeycomb receives signed `-6h` in
hosted `query_spec.from` and `get_trace.from`, as in the scalar adapter. Other
providers retain their conventions: Tempo uses the same six-hour RFC3339 bounds. Both search and
detail use that window for local and imported carriers. The authored spelling
is preserved; unsupported future offsets, zero and date expressions warn and
use the default `24h`. `get_trace` uses
`environment_slug`, returned `trace_id`, `from`, and `view_mode: full` only if
supported. `run_query` completes results; there is no invented polling contract.

Tempo uses native `search_tempo_traces(datasourceUid, query, start, end, limit,
spss)` and `get_tempo_trace(datasourceUid, trace_id, start, end)` with paired RFC3339
bounds. Trace-only bindings discover these two tools without requiring numeric
jobs or tools. Missing tools leave trace-only Metrics unavailable. Page/host false
suppresses discovery and data calls. Metrics remains default off and independent
of Jira Live.

## The #947 API

```js
const snapshot = ctl.telemetry.snapshot();
const exemplar = snapshot.map[carrierId]?.exemplars?.[0];
// Render only. This read never fetches a trace.
const spans = exemplar?.spans; // tracePreview / tracePanelData compatible
// In an explicit user gesture only; candidate must come from this envelope:
const comparison = exemplar?.candidates.find(c =>
  c.status === 'passing' && c.traceId !== exemplar.traceId);
if (comparison) {
  await ctl.telemetry.chooseExemplar(
    carrierId, exemplar.selectionToken, comparison.traceId);
}
```

Before exposing that optional action, use the synchronous read-only
`ctl.telemetry.canChooseExemplar(carrierId, selectionToken, traceId)`. It checks
the live session, actual candidate, current tools/handler and adapter token
without querying. Host adapters that offer selection supply both
`chooseExemplar` and a read-only `canChooseExemplar` callback; without the latter
the alternative control stays hidden. The action still revalidates tools and
token/epoch ownership when clicked.

`TelemetryExemplar` in `src/native/mount.d.ts` is the serializable shape:

- `version: 1`, `provider: honeycomb | tempo`, actual `traceId`, selected signal
  name, opaque `selectionToken`, honest `selectionReason`, `observedAt`, and
  original observation `range: {from,to}`.
- `completeness: complete | partial | unknown`, bounded `warnings`, optional
  actual provider-returned safe UI `url`.
- Up to 20 actual `candidates`: `traceId`, optional `time`/`durationMs`/`url`, and
  observed `status: passing | failing | unknown`. Honeycomb explicit raw-row
  `error: false/true` supports passing/failing; Tempo search has no guaranteed
  trace status and remains unknown. Never call absence of observed errors passing.
- Up to 200 normalized `spans`: `{id,parentId,service,name,startMs,ms,error,time}`,
  plus allowlisted operational `attributes`, bounded `events` and `links`.
  Secret/payload/message/stack attributes are not retained. Matching is exact;
  attributes outside `TELEMETRY_TRACE_ATTRS` are intentionally unsupported.

`observedAt` is the retrieval receipt time, **not the trace's age**. Use the
selected candidate's `time`, or the earliest selected span's `time`, for trace age.

The bounded attribute union includes the canonical importer’s `retry.attempt`,
`flow.delivery_failed`, `flow.backpressure`, `flow.step.id`, queue depth/message age,
`db.system.name`, namespace/version, and deployment environment keys. Native Tempo
service resources (or structured `resource.*` attributes) supply only the explicit
namespace/version/deployment context keys, with span attributes taking precedence.
This supports existing explicit `traceMatch.attributes` and `repeat: attempts`
mappings; it does not infer a mapping or retain arbitrary resource attributes.
Honeycomb's verified formatted table lacks retry/queue/deployment fields, so these
remain unavailable for Honeycomb. The inspected official CI tables contain
`span_event` annotations but no populated link rows. The docs describe link target
IDs without establishing formatted row ownership; link rows therefore produce an
explicit relationship-mapping limitation, never inferred parent/link evidence.

The span start offset is relative to the minimum returned start. Honeycomb exact
integer nanoseconds are subtracted as BigInt **before** converting to milliseconds.
Absolute span `time` values are normalized to ISO milliseconds by the providers;
relative `startMs` and `ms` retain finer precision. Validation leaves these values
unchanged and requires all spans to admit a common origin within one millisecond:
for each span, the interval `[time - startMs, time - startMs + 1ms)` must intersect
all the others. Epoch differences are taken as BigInt before Number conversion.
This is a compatibility bound at the normalized timestamps' precision, not a claim
that their discarded fractions are known. Exact equality would reject the recorded
Honeycomb fixture and legitimate sub-millisecond Tempo spans. Contradictory clocks
are rejected even when each timestamp and relative offset is individually valid.
The relative end `startMs + ms` still cannot exceed 24h; a displayed absolute
endpoint may differ by less than 1ms due to timestamp precision, never by days.
Rounded raw sample durations do not drive packets or precise timing. Honeycomb
selects the latest timestamp among returned matches (or first if timestamps are
absent); Tempo selects the slowest among returned matches. Neither is a global
claim. Alternatives are never synthesized or fetched speculatively.

The envelope is validated again by `telemetrySample`, survives mixed-provider
composition, and cannot change numeric signal values or classification. Duplicate
span IDs, cycles, malformed timing and conflicting candidate duplicates fail.
Missing parents warn. Honeycomb's synthetic `missing-root` row (start 0, written
when the root span was not stored) is dropped before the timeline base is chosen;
the trace is partial with a root-not-stored warning, and spans whose parent is
absent render as roots. More than 200 spans yields no timeline and a partial/limited
warning; no silent truncation. Input is capped at 1 MiB, 10,000 table rows,
20 candidates, 32 events/links per span, and a 24h span-timeline extent. Native
Honeycomb annotation/log/link rows are excluded from timed spans with a warning.
Collapsed nodes, visible/total discrepancies, partial metadata and unknown
completeness remain explicit. Grafana partial messages are bounded with URLs
removed; text links are retained when structured spans omit them.

## Lifetime and failure behavior

One search and one initial detail retrieval per carrier are cached for the Metrics
session. Polls revalidate tools but do not refetch cached search/detail data. The
original range stays visible; it does not slide forward while cached. The cache
identity includes full carrier binding and telemetry config, provider contract,
and controller generation, including identical authored bindings from a replacement
async detail load. An explicit alternative retrieves at most one detail
per actual candidate and reuses it on subsequent selections. Last selection wins.

Off, rebinding/import replacement, tool removal, account change, and destroy
invalidate caches and late replies. Old selection tokens cannot act on a new
adapter. Historical projection never borrows live exemplars or candidates; the
selection API rejects while Over time is active. Embedded numeric history also
strips exemplars and total descriptors; no historical trace contract is defined. Slider movement, paint, panel
reads and caption reads never query. Trace failures preserve numeric peers;
scalar failures preserve trace evidence. Numeric `observedAt`, `retrievedAt`, raw
bucket-start series, and valid explicit `aggregate` descriptors stay on their own
signals through composition. Trace receipt time never dates numeric Activity or
authorizes a total. Account changes retire all providers.

## Evidence and limits

See `tests/fixtures/provider-traces/README.md` for official pinned provenance.
Honeycomb accepts only the recorded exact table and metadata; the shape of raw
`trace_result_json` is unverified and intentionally unsupported. Raw signed URLs
are never fetched by the trace adapter, persisted, returned, or used as UI links.
The existing bounded scalar raw JSON / official signed-result fetch path remains
unchanged. Grafana native source/tests are pinned, not a live account assertion.
No authenticated account connector was available; the public hosted tools/list
probe returned 401. No live account query or deployment was performed.

The local Honeycomb mock samples the existing `traceFor` story through a narrow
native raw wrapper. Its exact scalar structured transport remains mock-specific;
its trace metadata now uses native lines rather than its old single JSON line.
See its README for every mock transport distinction. Grafana's existing mock
service/span shape already matches the pinned current native shape.

For step-by-step setup on an existing local or imported diagram, follow
[Trace-ready authoring](trace-ready-authoring.md).

## Allowed match attributes

A [direct trace connection profile](trace-connections.md) may list
`allowedAttributes`: span attribute names it retains from loaded traces and
permits in `traceMatch.attributes`, in addition to the built-in operational list
in [Trace-ready authoring](trace-ready-authoring.md). It takes effect for Tempo
(`tempo-v1`) profiles. Add it next to the other profile fields:

```json
"allowedAttributes": ["device.model"]
```

With that profile, this step maps only the message-consumer span for device
model X:

```json
{
  "id": "consume-x",
  "text": "This is the message for device model X",
  "edge": "broker->consumer",
  "traceMatch": {
    "serviceName": "telemetry-consumer",
    "operation": "consume device.report",
    "nodeId": "consumer",
    "attributes": {"device.model": "X"}
  }
}
```

Honeycomb `get_trace` does not return span attributes (verified on a real trace,
company report 2026-11-07). It returns the 19 fixed table columns only. Its linked
raw JSON resource (`honeycomb://trace/<pk>/json`) holds only `duration_ms`, `name`,
`service.name`, `span.kind`, `trace.parent_id`, `trace.span_id`, `trace.trace_id`
and internal IDs, and its input schema has no column parameter. An attribute
present in Honeycomb `run_query` raw rows (`messaging.rabbitmq.routing_key`) was
absent from `get_trace`. So on a Honeycomb profile neither `allowedAttributes` nor
the built-in attribute list can match today. The one exception is
`http.status_code`, which comes from the fixed `http_status` column as text.

- `allowedAttributes` must be an array of at most 32 non-empty attribute names
  (letters, digits, `_ . : / -`, starting with a letter). A malformed entry fails
  with its field path, for example `allowedAttributes[1]`. Credential-shaped names
  are rejected: names containing token, secret, password, passwd, credential,
  authorization, cookie, header, bearer, private key, access key or api key, and
  names with an `auth`, `pwd`, `jwt` or `session` part.
- Values match exactly, with the same rules as built-in attributes. Tempo keeps the
  span attribute value and its type.
- Validation accepts an attribute that any connection for the page lists, also
  while `tracking.telemetry.enabled` is `false`. Without such a profile it rejects
  the attribute as before (`traceMatch.attributes: use supported operational
  attributes only`). A trace loaded through a profile that does not list it does
  not carry it, so the step shows Not observed.
- Validation warns (it does not fail) when only Honeycomb connections list an
  attribute that a step uses, because Honeycomb `get_trace` does not return span
  attributes. It also warns when such an attribute has a number or boolean value,
  which a Honeycomb text cell never matches.
- A board entry that references a company profile inherits its `allowedAttributes`
  and cannot change them; an inline board profile may declare its own.

## Inspect a request in Status

The existing **Status** panel has **Jira** and **Trace** views. Jira is the default.
Choose Trace, then **Enable traces** (or the existing connector approval action)
to retrieve the page's explicit trace bindings. Host and page opt-outs still apply.
Trace replaces the Jira body and owns the diagram annotations while selected;
returning to Jira restores its existing status and scalar telemetry presentation.
There is no separate Metrics view.

Returned candidates are grouped by source section and carrier. The source selector
shows one group at a time; the Trace count deduplicates trace IDs across sources. Choosing one is
an explicit cached-provider action. Step navigation never chooses or fetches a
trace. One selected request stays selected as the path is inspected; mapping is
recomputed only against that exact source section's current path. Duplicate
carrier IDs across source diagrams are excluded because the telemetry map cannot
prove their source. Imported and asynchronously loaded diagrams use the same rules.

Author `traceMatch` on each relevant step using exact `serviceName`, `operation`,
`nodeId`, and parent/link or attribute context as needed. Existing canonical
Doorbell selectors demonstrate duration and queue budgets. Service display names
are never guessed into joins. Only uniquely matched delivered edges receive
operation-duration annotations; these are not inferred network latency. Missing,
ambiguous, unmapped and incomplete evidence remain unknown, never passing or failing
by absence. Provider errors, budget violations and supplied queue/backpressure
conditions are shown separately. An unavailable or over-200-span timeline retains
its identity and warnings without asserting missing operations.

### traceMatch alternatives

When the same logical operation is recorded by different root spans depending on
the path it took, `traceMatch` may be an array of alternatives instead of
duplicating the step. Each entry is a complete selector with the
[selector rules](trace-ready-authoring.md#2-attach-exact-selectors-to-existing-steps).
For example, one message is consumed through RabbitMQ or through Pulsar, and
each transport's consumer span has its own operation name:

```json
{
  "id": "consume-stats",
  "text": "Consume camera stats",
  "edge": "camera->stats",
  "traceMatch": [
    {"serviceName": "stats-consumer", "operation": "camera_stats_message process", "nodeId": "stats"},
    {"serviceName": "stats-consumer", "operation": "persistent://stats/camera process", "nodeId": "stats"}
  ]
}
```

Alternatives are tried in order and the first one that matches maps the step;
its own `nodeId`, budgets and `panelId` then apply. If none matches, the step
shows the first ambiguous result, so a selector that needs refinement stays
visible; otherwise it shows the last alternative's **not observed** result. A
child step's `parentStepId` refers to whichever alternative of the parent step
matched. On a path that does not contain an alternative's `parentStepId` step,
that alternative is skipped, so a child shared by two paths can name each path's
parent; if every alternative is skipped the step is **not observed**. (A single
object whose parent step is not on the path is still an error.) The array must
not be empty; validation reports an invalid entry with its index, for example
`traceMatch[1].occurrence`. Alternatives do not make two spans in one trace
acceptable: the matched alternative still needs one unique span (or a
`repeat:"attempts"` group). The alternative is chosen per step before the check
that one span maps to only one step, so if the chosen alternative's span is also
claimed by another step, the step becomes ambiguous and later alternatives are
not tried.

The panel has one bounded waterfall and a **Show on diagram** toggle. All canvas
annotations are runtime-only, with no layout/spec persistence. Pin stores evidence
in this session's Jira Activity. Historical Over time, telemetry off, rebinding,
provider/account/environment changes, closed or replaced async detail, and destroy
retire invalid selected evidence. Returning from history requires explicit selection.

For a reproducible desktop example using the real renderer, canonical diagram and
existing normal/slow/error/partial/backpressure fixtures:

```sh
python3 tools/build.py
node tools/status-trace-demo.mjs
python3 -m http.server 8775 --directory .local/status-trace-demo
```

Open `http://localhost:8775/status-trace.html`, choose Trace, and enable traces.
This is labeled fixture replay without an external authenticated account. Only
transport IDs and an absolute fixture clock are adapted for the runtime envelope;
the canonical selectors, relationships, timings and budgets are preserved.

Honeycomb receives signed relative `from` values such as `-24h` for both tools.
The adapter drops legacy `timestamp` entries from outgoing `raw_row_columns`
without changing the authored query: Honeycomb always returns that column.
The Status panel’s Trace mode supersedes the former step-owned trace disclosure
and fallback rail. Selecting or navigating steps never opens or selects a trace.

## Honeycomb lookback

The Load trace form says under the trace ID field which time window a load
would send:

- "Looks back 2h; change under Lookback." for a signed lookback: the
  **Trace start** value in the **Lookback (optional)** section when one is set,
  otherwise the profile's `time.defaultLookback`.
- "Uses the time set under Lookback." when Trace start is an absolute
  timestamp (or not yet a valid lookback).
- "Uses the time range in the pasted link." when the pasted link carries a
  start or end and the request can be sent as given, with Trace start and
  Trace end filling only what the link leaves out. A time control that repeats
  a field the link supplies is rejected when loading.
- "This link's time range cannot be used with this connection; paste the trace
  ID alone." when the link's time cannot be sent as given: for example
  absolute link bounds on a connection whose `time.encoding` is `relative`
  (such as the Honeycomb profile in [trace connections](trace-connections.md)),
  or a start-only or end-only link that the time controls do not complete.

When `get_trace` answers with only a Metadata block whose `navigation_hints`
starts with `no spans found` and no span table, the panel opens the Lookback
section once for that result and reports, using the window that was sent:

- "Trace not found in the last 2h. Try a longer lookback under Lookback."
- "Trace not found between <from> and <to>. Try a wider range under
  Lookback." for absolute Trace start and Trace end.
- "Trace not found in the time range of the pasted link. Paste the trace ID
  alone, then set Lookback." for link bounds.
- A trace loaded from a log line says the provider may not have kept it
  (sampling) and offers the next log line instead; see [Find a trace from a log
  line](live-status.md#find-a-trace-from-a-log-line).

This provider answer is the only response reported as not found; errors,
unknown shapes and a span table that is present but lacks a required column
(`Unsupported trace table header.`) are not.

`time.defaultLookback` replaces the trace tool's own default whenever no start
is given: Load trace always sends a start. In the November 2026 company report,
Honeycomb `get_trace` looked back 7 days when called without `from` and
accepted at least `-7d`. A profile with the `2h` example therefore finds only
traces from the last 2 hours, where the tool alone would also find older ones.
Choose `defaultLookback` for the age of the traces people paste.

Largest useful lookback: this repo can verify that `from` is a signed duration
of at most four digits and a unit (`s`, `m`, `h`, `d`, `w`), and the November
2026 company report observed `from: -7d` returning a trace about 5 h old that
`-2h` did not return. This repo cannot verify the longest `from` Honeycomb
accepts or how long an account retains trace data; both depend on the account.
Use the shortest lookback that covers the trace's age.

## Load trace environment

The Load trace **Connection environment** dropdown starts at the connection
environment that matches the board **Environment**: the exact id first, then the
id or label ignoring case, then a common alias (`prd`/`prod`/`production`,
`stg`/`stage`/`staging`, `dev`/`development`, `qa`). With no single match it
starts empty, or at the only environment when the connection has one. It follows
later board Environment changes until the reader picks a connection environment;
that pick is kept. Picking a different connection starts matching again.

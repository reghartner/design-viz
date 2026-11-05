# Runtime provider exemplars (#946)

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
    "raw_row_columns": ["trace.trace_id", "timestamp", "error"],
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
lookbacks normalize to `6h` for hosted `query_spec.from`, as in the scalar
adapter, and to the same six-hour RFC3339 bounds for Tempo. Both search and
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
Missing parents warn. More than 200 spans yields no timeline and a partial/limited
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

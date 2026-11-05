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

The current `tools/list` must declare each argument's supported type and required
fields. Honeycomb `query_spec` may be an object or JSON string, as declared by the
actual schema. Raw columns and limit are top-level. The page window (24h default)
sets hosted `query_spec.from`, as in the scalar adapter. `get_trace` uses
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

The span start offset is relative to the minimum returned start. Honeycomb exact
integer nanoseconds are subtracted as BigInt **before** converting to milliseconds.
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
and controller generation. An explicit alternative retrieves at most one detail
per actual candidate and reuses it on subsequent selections. Last selection wins.

Off, rebinding/import replacement, tool removal, account change, and destroy
invalidate caches and late replies. Old selection tokens cannot act on a new
adapter. Historical projection never borrows live exemplars or candidates; the
selection API rejects while Over time is active. Slider movement, paint, panel
reads and caption reads never query. Trace failures preserve numeric peers;
scalar failures preserve trace evidence. Account changes retire all providers.

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

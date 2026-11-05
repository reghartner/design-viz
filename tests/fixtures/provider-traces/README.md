# Provider evidence provenance

No live account queries were made. These files contain no signed download URLs.

- `honeycomb-trace.txt`: redacted actual get_trace output from official Honeycomb agent-skill CI run 38212733085 (2026-10-12), pinned repository commit `6bb09279fc3fb69abf113228be939dbb929e34f1`. Full exact-nanosecond table and operational metadata retained; signed URL replaced with a non-URL marker.
- `honeycomb-candidates.txt`: actual successful top-level raw_row_columns/results_limit run_query response from that same official CI report. Signed URL redacted. Columns unrelated to selection have been removed from the portable fixture; retained candidate IDs, timestamps and durations are unchanged. Rounded durations are intentionally NOT consumed as precise timing.
- `grafana-source-test.json`: projection of the pinned official Grafana `testTraceData` / `TestTempoGetTrace` source fixture into the native JSON shape asserted by those tests, NOT a recorded account response. Exception message/stack omitted. Source: https://github.com/grafana/mcp-grafana/blob/a57860b54b4ef452cf906549664bfbd2519c0aad/tools/tempo_unit_test.go and tools/tempo_trace_view_test.go, tools/tempo_ds_query.go.

Honeycomb source: https://github.com/honeycombio/agent-skill/actions/runs/38212733085 . The unredacted official CI artifact is intentionally not included. Hosted unauthenticated tools/list returned 401 during lead research; runtime authenticated schemas remain authoritative. Raw trace_result_json shape is unverified and unsupported.

All mutations in telemetry-traces.test.js (cycles, duplicates, oversized tables, IDs, statuses, links, partial flags and schemas) are explicitly synthetic negative or boundary variants. The actual checked-in mock handlers use the existing fictional shared story and are not official provider evidence.

Operational-attribute coverage uses explicitly synthetic retry/queue/deployment
variants of the Grafana source fixture. Resource placement follows pinned
`tempo_ds_query.go`: text `services[].resource`, structured span attributes prefixed
with `resource.`. The runtime allowlist includes the exact operational keys in
`tools/canon/traces.mjs`; tests exercise that importer and mapper directly.
A bounded inspection of the official Honeycomb CI artifact found five trace tables
and twelve annotation rows, all `span_event`, with no populated link targets.
The pinned `trace-exploration.md` documents link target fields but does not establish
formatted-table owner semantics. The synthetic link-row test therefore asserts an
explicit mapping limitation rather than inventing a link relationship.

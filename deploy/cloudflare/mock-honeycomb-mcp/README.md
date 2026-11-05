# Mock Honeycomb MCP

A dependency-free Cloudflare Worker for exercising Flowview telemetry without a
Honeycomb account. It exposes the Honeycomb tool names `run_query`,
`get_query_results` and `get_trace` over fictional connected-doorbell data. It
is a public, read-only mock with no credentials, Honeycomb connection, external
fetches or account data. No live Honeycomb connector was available when this
contract was implemented or tested.

The Worker reads the `days[].telemetry` blocks from the shared 12-day
[timeline](../../../examples/live-status/live-status.timeline.json) through the
[mock Grafana story module](../mock-grafana-mcp/story.mjs). The Atlassian,
GitHub, Grafana and Honeycomb mocks therefore tell the same story. It does not
copy, interpolate or independently model that timeline.

## Deploy and connect

Use Node 22 or later with Wrangler 4. From the repository root:

1. Run `npx -y wrangler@4 login` once on your machine.
2. Supply your own Worker name in `FLOWVIEW_CF_WORKER`. Keep the tracked
   `mock-honeycomb-mcp` placeholder unchanged.
3. Deploy manually (no npm install or separate build):

   ```sh
   npx -y wrangler@4 deploy -c deploy/cloudflare/mock-honeycomb-mcp/wrangler.jsonc --name "$FLOWVIEW_CF_WORKER"
   ```

The connector URL is `https://<worker>.<subdomain>.workers.dev/mcp`; `/healthz`
returns `ok`. Deployment is never part of the test workflow. Do not commit an
actual Worker name, deployed URL, account ID, token, `local.env`, `.dev.vars`,
`.wrangler/` or `.cloudflare/` state. Follow the parent
[deployment rules](../README.md).

To use a deployment in claude.ai, open Settings → Connectors → Add custom
connector, paste the `/mcp` URL, choose **No sign-in**, and use an unambiguous
display name such as **Mock-honeycomb**. No Honeycomb OAuth or account is
involved. A production artifact should use a real authenticated Honeycomb
connector instead of this public fixture server.

The endpoint uses stateless Streamable HTTP: JSON-RPC over `POST /mcp`, batch
requests, JSON responses, and HTTP 202 for notifications. `GET /mcp` is 405
because there is no SSE stream. CORS allows browser requests. The optional
Workers Rate Limiting binding `RL` allows 60 requests per 60 seconds per client
IP and returns HTTP 429 plus `Retry-After: 60` when denied. This is an abuse
brake, not an authentication boundary.

## Story clock and scenarios

- `?scenario=story` (default) selects the rotating shared story.
- `?scenario=story&day=9` pins zero-based Day 10; out-of-range numbers clamp.
- `?scenario=all-todo`, `?scenario=all-done`, and unknown scenarios are silent.

With no day pin, one story day passes per minute from `DEPLOYED_AT`, looping
after twelve days. An invalid or absent value uses the fixed epoch
`2026-10-20T09:00:00Z`. Use the same `DEPLOYED_AT` for all story mocks. Story
day `i` ends at midnight after calendar date `2026-10-20 + i`; queries never
borrow samples from a later story day. A window is limited to all 288 story
hours.

## Mock dataset vocabulary

The only environment and dataset are:

| field | value |
|---|---|
| `environment_slug` | `flowview-demo` |
| `dataset_slug` | `doorbell` |

Each non-null timeline cell is one hourly measurement row with exactly these
conceptual columns:

| column | meaning |
|---|---|
| `flowview.carrier` | node id, or `from->to` for an edge |
| `flowview.signal` | the authored signal name (`rate`, `errors`, `p95`, `lag`, and so on) |
| `flowview.value` | that cell's finite numeric value in its authored unit |

A numeric `0` is a measured row. `null` is a missing measurement and is not
coerced to zero: **Missing is not zero.** Every query must contain exactly one equality filter for
`flowview.carrier` and one for `flowview.signal`; the mock never guesses from a
metric name or label. An unknown carrier, signal, filter, calculation, field or
query shape is an explicit tool error.

## `run_query` subset and result transport

The verified current native top-level arguments are
`{environment_slug, dataset_slug, query_spec}`. The mock accepts an object
`query_spec` with:

- `calculations`: one to five of `AVG`, `SUM`, `MIN`, `MAX` over
  `flowview.value`, or `COUNT`;
- `filters`: exactly the carrier and signal filters described above;
- `from`: a signed relative duration (`-24h`), `now`, or an RFC3339 instant;
- optional `to` (`now` or RFC3339), `granularity: 3600`, and an
  empty `breakdowns` array.

`COUNT` is the number of hourly measurement rows. It is not a request, span,
user or traffic count. `SUM` sums hourly measurements, and `AVG` is their
arithmetic mean. The mock does not serve percentile, heatmap, rate,
concurrency, formula, order, arbitrary breakdown or raw-event queries. In
particular it does not manufacture aggregate percentiles from hourly p95 cells.

The hosted Honeycomb MCP normally returns formatted Markdown plus metadata and
a signed, time-limited `query_result_json` URL for exact raw results. This mock
cannot issue a Honeycomb-signed URL and does not fabricate one. Instead,
`run_query` returns the documented raw JSON fields directly in MCP
`structuredContent`, and repeats the same JSON in a text block prefixed
**MOCK Honeycomb raw query result JSON**. That mock-only transport contains
`results`, `series`, `header`, `info`, `template`, `total_by_aggregate`,
`other_by_aggregate`, and `total_by_aggregate_series`. Each `series[].data.time`
is the ISO start of its hourly bucket. Missing cells produce no row; measured
zero cells produce rows whose values are zero.

`run_query` is complete in one response. Clients must not invent an asynchronous
poll when the exact result is already present.

## `get_query_results` limitation

Honeycomb's public tools reference says `get_query_results` accepts a query URL,
query-run primary key, or query ID, but neither that page nor the pinned public
CI evidence publishes the current input field names. This mock advertises the
tool so connector discovery sees the native surface, but every call fails closed
with a tool error explaining that its input schema is unverified. It does not
invent parameter names, opaque IDs, signed URLs, or a polling requirement.

## `get_trace`

The verified arguments served here are
`{environment_slug, trace_id, from, view_mode?}`. `from` uses the same relative
or RFC3339 spelling as query windows; `view_mode` is `auto` (default) or `full`.
The trace ID must identify an exemplar already produced by the shared Grafana
story module in the selected story window. Unknown IDs, future IDs and IDs from
silent scenarios are explicit errors—no trace is invented.

The text response uses the recorded native table columns in this order:
`span_id`, `parent_id`, `start_unix_ns`, `duration_ns`, `kind`, `status_code`,
`error`, `http_status`, `service`, `route`, `name`. Nanoseconds are derived with
integer arithmetic from the shared story's millisecond fixture values. Metadata
includes `total_spans`, `visible_spans`, `collapsed_nodes`, `trace_id`,
`trace_link`, `view_mode` and `mean_sample_rate`. `trace_link` is `null` because
there is no Honeycomb UI object to link to. There is deliberately no invented
raw-trace JSON envelope or signed trace-result URL.

The shared trace builder emits one event-path exemplar for each observed hour.
Healthy exemplars can reach the notification consumer; after the Day 10
firmware deployment, failing exemplars stop at event ingest. No exemplar ever
contains a push span, matching the Done-but-unproven push edge.

## Sources, assumptions and local check

Tool names and behavior were checked against Honeycomb's official MCP tools
reference on 2026-11-05. Argument and response field names come from the
official `honeycombio/agent-skill` repository at commit `6bb09279` and a
passing public Honeycomb CI
report from 2026-10-12. Those are documentation and recorded public fixture
evidence, not a live `tools/list` or account query. The public sources disagree
on whether `query_spec` may be serialized in some clients; the passing runtime
record used an object, which this mock requires. `get_query_results` remains
unserved for the reason above.

Run the focused Node test from the repository root:

```sh
node --test tests/mock-honeycomb-mcp.test.js
```

The test exercises the pure handler and the real Worker `fetch` entry point
using built-in `Request` and `Response`; it does not install Wrangler, deploy,
connect an account, or read external data.

### Provider exemplar adapter subset (#946)

`run_query` also accepts the verified top-level `raw_row_columns` and
`results_limit` wrapper. For this small mock subset, `query_spec` contains only
`from`, optional `to`, and exactly `service.name = event-ingest`. Columns are
`trace.trace_id` (required), `error`, and `duration_ms` (`timestamp` is always returned and must not be requested); limits are
1–20. Returned IDs and status come from the existing shared `traceFor` story.
Unsupported raw filters/columns/calculations fail closed. Rounded sample duration
is not precise span timing. The runtime selects the latest returned timestamp,
then fetches that actual ID. No new trace or timeline is fabricated.

Scalar results retain the mock-only exact `structuredContent` raw JSON transport.
Raw candidates now use the recorded native `# Raw Rows` Markdown table. Trace
metadata now uses native `  key: value` lines instead of the earlier mock-only
single JSON metadata line. Mock `trace_link: null` remains intentional: no live
provider URL is invented. The mock-only cursor `MOCK_MORE_MATCHES` merely reports
limited candidates; pagination is unsupported. No deployment accompanies this change.

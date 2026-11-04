# Mock Grafana MCP

A dependency-free Cloudflare Worker that stands in for a viewer's Grafana MCP
connector when exercising Flowview telemetry (PROVEN vs DONE, epic #948)
without a Grafana account. It serves fictional production telemetry for the
connected-doorbell story through seven Grafana MCP tool names:
`list_datasources`, `query_prometheus`, `query_loki_logs`, `search_tempo_traces`,
`get_tempo_trace`, `get_annotations` and `generate_deeplink`. It is a public,
read-only mock, with no credentials and no Grafana connection. Document editing
remains desktop-only.

The telemetry is the `days[].telemetry` block of the shared 12-day
[timeline](../../../examples/live-status/live-status.timeline.json), the file
the [mock Atlassian MCP](../mock-atlassian-mcp/README.md) and
[mock GitHub MCP](../mock-github-mcp/README.md) serve and the page's
`#live=demo` replay plays. Jira status, pull requests and production traffic
therefore agree day by day. Wrangler bundles the JSON into the Worker.

## Deploy

Use Node 22 or later with Wrangler 4. From the repository root:

1. Run `npx -y wrangler@4 login` once on your machine.
2. Supply your own Worker name in the shell variable `FLOWVIEW_CF_WORKER`.
   Keep the tracked config's `mock-grafana-mcp` placeholder unchanged.
3. Deploy (no npm install or separate build required):

   ```sh
   npx -y wrangler@4 deploy -c deploy/cloudflare/mock-grafana-mcp/wrangler.jsonc --name "$FLOWVIEW_CF_WORKER"
   ```

The connector URL is `https://<worker>.<subdomain>.workers.dev/mcp`. Check
`/healthz` for `ok`. The story clock is the one the other mocks use: one story
day per minute from `DEPLOYED_AT` (fixed epoch `2026-10-20T09:00:00Z` without a
valid value), looping after twelve days. Deploy all three mocks with the same
`DEPLOYED_AT` to keep them on the same day; supply it with
`--var "DEPLOYED_AT:<ISO timestamp>"` during deployment or in the Cloudflare
dashboard.

Deployment is a manual step. Follow the
[existing deployment convention](../README.md): never commit an actual Worker
name, account ID, deployed address, login token, `local.env` or `.wrangler/`
cache. This folder's reviewed sources are allowlisted by the parent
`.gitignore`; local settings and caches stay ignored. Do not force-add them.

## Abuse guard

The endpoint is public and unauthenticated by design (claude.ai custom
connector with **No sign-in**). `wrangler.jsonc` declares a Workers Rate
Limiting binding (`ratelimits`, binding name `RL`, 60 requests per 60 s, in its
own namespace, separate from the Jira mock's). The Worker calls
`env.RL.limit({ key })` with the client's `cf-connecting-ip` for every POST to
`/mcp`. A denied request returns HTTP `429` with `Retry-After: 60` and a
JSON-RPC error (`code: -32000`). `/`, `/healthz` and CORS preflights are not
counted. Cloudflare enforces the limit approximately and per location, so treat
it as a brake, not a hard cap. Deployments whose config omits the binding keep
working without a limit.

## Connect from claude.ai

Open Settings → Connectors → Add custom connector → URL, paste the `/mcp` URL,
choose Authentication **No sign-in**, and give it a name such as
**Mock-grafana**. Publish a telemetry board with the `mcp` capability declaring
that exact display name beside the Jira one (see `docs/live-status.md`,
"Production metrics from Grafana"). The Grafana adapter (#943,
`src/viewer/telemetry-claude.js`) picks the connector by the tools it offers, not by
name, so the mock may carry any name. No Grafana account or OAuth is
involved. The real server is [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana).

The endpoint uses stateless Streamable HTTP: JSON-RPC over `POST /mcp`, single
requests or batches, JSON responses, and 202 for notifications. `GET /mcp` is
405 because there is no SSE stream. CORS allows browser calls; no session ID is
required. `initialize` echoes the client's protocol version, defaulting to
`2025-06-18`. This mock implements tools only, with no resources or prompts.

## Scenarios and the story clock

Append these queries to `/mcp` when adding a connector:

- `?scenario=story` (default): the telemetry of the current story day.
- `?scenario=story&day=9`: pin a zero-based day (`day=9` is "Day 10"); values
  clamp to the timeline.
- `?scenario=all-todo` and `?scenario=all-done`: silent. Every query returns no
  data; datasources are still listed.

Story day index `i` is the calendar day 2026-10-20 + `i`. Its "now" is the
following midnight UTC, so `now-24h` to `now` on a day is exactly that day, and
nothing after "now" exists yet. Relative times such as `now-1h` or `now-2h45m`
resolve on the story clock. Absolute RFC3339 times are story times: a window
computed from the browser clock finds no data, so adapters should send relative
times, which the real server accepts too. Every timestamp in a result is a story
time, so it lines up with the Jira mock's `updated` stamps.

## The shared timeline

Each day of `examples/live-status/live-status.timeline.json` carries a
`days[].telemetry` block:

```json
{
  "start": "2026-10-29T00:00:00Z",
  "stepSeconds": 3600,
  "carriers": {
    "mcu->ingest": {
      "rate": {"unit": "req/h", "values": [null, "... 24 hourly values ..."]},
      "errors": {"unit": "req/h", "values": ["..."]},
      "p95": {"unit": "ms", "values": ["..."]}
    }
  },
  "annotations": [{"id": 5, "time": "2026-10-29T16:00:00Z", "text": "firmware 2.4.1 rollout", "tags": ["deploy", "firmware"]}]
}
```

Carriers are keyed as the proof engine keys them: a node id (`ingest`,
`notify`) or `from->to` for an edge. Their signal names and units match the
example spec's `telemetry` bindings. `values[k]` is the signal for the hour
from `start + k` hours to `start + k + 1` hours; `null` is an hour without a
sample, which the mock serves as no data. The mock reads every series and
annotation from this block and models nothing itself. Every signal a binding
queries answers from that carrier's own entry. Change one carrier's series and
only that carrier's answers change. Both the event edge and the ingest node
count `http_server_requests_total`, so its series are signed sums of the two
entries:

| request series | value |
|---|---|
| `route="/v1/events", code="200"` | event edge `rate` minus `errors` |
| `route="/v1/events", code="503"` | event edge `errors` |
| `route="other", code="200"` | ingest node `rate` minus `errors`, minus the event edge's `rate` minus `errors` |
| `route="other", code="503"` | ingest node `errors` minus the event edge's `errors` |

The edge's queries match `route="/v1/events"` and sum back to the edge's own
entry; the node's queries match every route and sum back to the node's own
entry. In the story the node's totals equal the edge's, so the `route="other"`
series are 0. The one thing not stored is the exemplar traces. The mock builds
them from the event edge, route and notify entries (see `search_tempo_traces`).
`tools/inject.py` checks the block's shape when it embeds the timeline. The demo replay hands each day's
block to the page as a telemetry map, with `null` read as 0, as a connector
reports a query that matched nothing.

## The story

A carrier starts carrying traffic two hours after its last ticket turns Done on
the timeline (merge at 09:00 UTC, deploy annotation at 10:00, traffic from
11:00), and never before an upstream carrier flows. Rates follow a daily curve
that peaks at 16:00 UTC. The numbers were generated once from a model of this
story and now live in the timeline; edit the timeline to change the story.

| day | what the telemetry shows |
|---|---|
| Day 1–8 | silent: nothing is Done |
| Day 9 | HW-124 Done: `press` and `ring` flow (about 1,200 presses per hour at peak) |
| Day 10 | FW-45, BE-67, BE-68 and UX-89 Done: `event`, `route` and the ingest and notify services flow; the **firmware 2.4.1** deploy annotation at 16:00 UTC degrades the event edge (error ratio about 0.2 % before, about 4 % after; p95 about 180 ms before, about 410 ms after) |
| Day 11 | the route queue lags from 18:00 UTC (lag 600 rising to 2,400 messages, age 90–270 s) until 03:00 the next morning, with a `notify-consumers rebalance` annotation; consumption drops to 60 % |
| Day 12 | the queue has recovered (lag about 40, age about 3 s); the event edge is still degraded; the **push** edge is still silent although BE-68 and UX-89 are Done |

The push edge never carries traffic: the notification service consumes events
(`event consumed` log lines) but never logs `push sent` or `push failed`. That
is the DONE · UNPROVEN case.

## Recognized signals

The mock recognizes expressions; it does not evaluate PromQL or LogQL. A query
picks the fixture series whose metric (or Loki stream and line phrase) and
label matchers match its single selector, and an outer `sum`, `max`, `min`,
`avg` or `count` combines them (`sum` when there is none). Values are the
fixture's numbers in the unit of the expressions below, whatever range,
multiplier or `by` grouping the query writes. Write the bindings as listed. An
unknown metric, stream or label returns empty data with `hints`, as a real
server does for a missing metric. An expression with two selectors, such as a
ratio, returns empty data with a `warnings` entry.

Datasources: `prom-main` (Prometheus), `loki-main` (Loki), `tempo-main` (Tempo).

| carrier | signal | source | expression |
|---|---|---|---|
| edge button → mcu (press) | rate | Prometheus | `sum(rate(button_press_total{device="doorbell"}[5m]))*3600` |
| edge mcu → chime (ring) | rate | Prometheus | `sum(rate(chime_ring_total{device="doorbell"}[5m]))*3600` |
| edge mcu → ingest (event) | rate | Prometheus | `sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events"}[5m]))*3600` |
| | errors | Prometheus | `sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600` |
| | p95 (ms) | Prometheus | `histogram_quantile(0.95, sum by (le)(rate(http_server_request_duration_seconds_bucket{service="event-ingest",route="/v1/events"}[5m])))*1000` |
| edge ingest → notify (route) | in | Prometheus | `sum(rate(kafka_server_brokertopicmetrics_messagesin_total{topic="device-events"}[5m]))*3600` |
| | lag (messages) | Prometheus | `max(kafka_consumergroup_lag{topic="device-events",group="notify-consumers"})` |
| | age (s) | Prometheus | `max(kafka_consumergroup_lag_seconds{topic="device-events",group="notify-consumers"})` |
| edge notify → app (push) | rate | Loki | `sum(rate({app="notify"} \|= "push sent" [5m]))*3600` |
| | errors | Loki | `sum(rate({app="notify"} \|= "push failed" [5m]))*3600` |
| | p95 (ms) | Prometheus | `histogram_quantile(0.95, sum by (le)(rate(push_latency_seconds_bucket{app="notify"}[5m])))*1000` |
| node ingest | rate, errors | Prometheus | the event expressions without the `route` matcher |
| node notify | rate | Loki | `sum(rate({app="notify"} \|= "event consumed" [5m]))*3600` |

Request series carry the labels `service`, `route` (`/v1/events` or `other`) and
`code` (`200` or `503`).
Histograms are served only as `histogram_quantile(0.95, ...)` over a `_bucket`
metric. A LogQL query without a range function, such as `{app="notify"}`,
returns log lines.

## Tools

Parameter names were read from the grafana/mcp-grafana source (`tools/*.go` at
commit a57860b5, 2026-11-04), not a captured `tools/list` from a running
server. Each signature below lists every parameter the real tool declares;
required names are bare and optional names end in `?`. The served
`inputSchema` declares exactly these names. Unknown argument names are tool
errors, as on the real server.

- `list_datasources {type?, name?, limit?, offset?}` returns
  `{datasources: [{id, uid, name, type, isDefault}], total, hasMore}`.
- `query_prometheus {datasourceUid, expr, startTime?, endTime, stepSeconds?, queryType?, projectName?}`:
  `queryType` is `range` (default; needs `startTime` and `stepSeconds`) or
  `instant` (evaluated at `endTime`). `projectName` (Cloud Monitoring only) is
  accepted and ignored. Returns `{data, hints?, warnings?, exploreUrl}`
  where `data` is a Prometheus matrix (`[{metric, values: [[seconds, "value"]]}]`)
  or vector (`[{metric, value: [seconds, "value"]}]`). More than 11,000 points
  per series is an error, as in Prometheus.
- `query_loki_logs {datasourceUid, logql, startRfc3339?, endRfc3339?, limit?, direction?, queryType?, stepSeconds?, format?}`:
  the window defaults to `now-1h` to `now`. Metric queries return
  `data: [{values: [{timestamp: "seconds.mmm", value}], labels}]` (range) or
  `[{timestamp, value, labels}]` (instant). Log queries return
  `[{timestamp: "<nanoseconds>", line, labels}]`, newest first unless
  `direction: "forward"`, `limit` 10 by default and at most 100, with
  `metadata.linesReturned` and `metadata.resultsTruncated`. `format` accepts
  `full`; `compact` is a tool error because the mock does not group streams.
- `search_tempo_traces {datasourceUid, query, start?, end?, limit?, spss?}`
  returns `{traces: [{traceID, rootServiceName, rootTraceName, startTimeMs, durationMs, spanSets: [{spans}]}]}`,
  newest first, from the past hour by default. The mock keeps one exemplar
  trace per story hour on the event path: while the hour's event error ratio is
  at most 1 % it reaches the notify consumer after the queue age; above that (from
  the firmware 2.4.1 deploy on) it is a 503 that stops at ingest. No trace ever has a push span. TraceQL conditions understood
  on one span: `resource.service.name`, `name`, `status = error|ok` and
  `duration > 300ms`; other conditions are ignored. Metrics queries
  (`| rate()`) are errors, as on the real server.
- `get_tempo_trace {datasourceUid, trace_id, start?, end?, focus_span_id?}`
  returns `{traceId, services: [{serviceName, resource, spans: [{spanId, parentSpanId?, name, kind, startTimeMs, durationMs, status, attributes}]}]}`.
  `start` and `end` go together. `focus_span_id` must be 16 hex characters and
  otherwise does not change the result. A trace not recorded by the story's
  "now" is an error.
- `get_annotations {from?, to?, limit?, alertUid?, dashboardUid?, panelId?, userId?, type?, tags?, matchAny?}`
  (`from` and `to` in epoch ms) returns `{Payload: [{id, time, timeEnd, text, tags, ...}]}`,
  newest first. The annotations are organization-wide deploy markers (`deploy`
  plus `hardware`, `firmware` or `backend`) and one `incident` marker, so an
  `alertUid`, `dashboardUid`, `panelId`, `userId` or `type: "alert"` filter
  returns none.
- `generate_deeplink {resourceType, dashboardUid?, provisioningPreview?, datasourceUid?, panelId?, queries?, queryParams?, timeRange?, shorten?}`
  returns the URL as plain text on the fictional Grafana at
  `https://acme.grafana.net`: `/d/<uid>` for dashboards, `?viewPanel=<id>` for
  panels, and `/explore?panes=...&schemaVersion=1` for Explore. `shorten` is
  accepted and ignored, as in the real server's read-only mode, so the full URL
  comes back. `provisioningPreview` on a dashboard or panel link is a tool error
  because the mock has no provisioning repository.

`query_sql` is not served (it is disabled by default on the real server too).

## Fidelity and local checks

Result envelopes follow the real server: every tool answers one text block of
JSON (a bare URL for `generate_deeplink`); only `query_prometheus` also sends
`structuredContent`, so adapters should parse the text. Tool failures (bad
arguments, wrong datasource, unknown trace) are results with `isError: true`
and a message, not JSON-RPC errors; an unknown tool name is JSON-RPC error
-32602. These points remain unverified against a running connector: the exact
error texts, the annotation envelope (`Payload`, from the Grafana OpenAPI
client the server marshals), the span `kind` and `status` spellings, and
whether claude.ai forwards `structuredContent`. Rate limits of a real Grafana
are not simulated.

Run `node --test tests/mock-grafana-mcp.test.js` from the root. The pure
`handleMcp(request, env)` in `mcp.mjs` uses no Cloudflare APIs: `env.now`
supplies epoch milliseconds, `env.scenario` and `env.day` supply selection, and
`env.DEPLOYED_AT` supplies the clock origin. An optional `env.timeline`
replaces the shared timeline for tests. `story.mjs` maps each served metric
series to its timeline signals, reads the values and annotations, and builds the
exemplar traces.

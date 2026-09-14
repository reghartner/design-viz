# Honeycomb trace → Flow Spec

Turn one observed request into an editable design visualization. The first
version imports event JSON locally in the workbench or through a Node CLI.
It does not fetch trace URLs or connect to an account.

## Human workflow

1. In Honeycomb, filter Events to the desired `trace.trace_id`, include all
   needed span fields, and download JSON. Honeycomb documents JSON downloads
   from Events and a 1,000-row export limit. A downloaded set may still be a
   partial trace. [Honeycomb Events export](https://docs.honeycomb.io/investigate/analyze/explore-events)
2. Open `workbench/flowspec.html`, choose **import trace…**, and paste the
   event array or use **open trace JSON…**. A `{events:[...]}` or
   `{spans:[...]}` wrapper also works. Event envelopes with a `data` object
   and outer `time` are supported. Aggregated query results are not spans.
3. Enter a trace ID if the input contains multiple traces. Optionally paste
   the original Honeycomb URL for source links. It is stored as a link;
   conversion never visits it.
4. Expand **Custom field names** if the dataset uses alternate column names.
   For example, `{"service":"app.service","timestamp":"start_time"}`.
5. Choose **Build diagram**. Invalid input keeps the existing spec intact;
   a successful import replaces it in one builder undo step. Use the numbered
   step chips to inspect each span, edit the story, then save/export normally.

For an immediate example, choose **starters… → Honeycomb trace**. Its six
fictional spans include overlapping identity/inventory work and a recorded
payment error. The trace lasts 300 ms even though its span durations sum to
565 ms. The raw input is `examples/traces/checkout.events.json`.

## Input contract

| Mapping key | Default field | Meaning |
|---|---|---|
| `traceId` | `trace.trace_id` | Required non-empty string |
| `spanId` | `trace.span_id` | Required unique string within the trace |
| `parentId` | `trace.parent_id` | Optional string; absent, empty, null, or all-zero means root |
| `service` | `service.name` | Required service name; never inferred from an operation |
| `name` | `name` | Required operation name |
| `timestamp` | `timestamp` | ISO timestamp with timezone or numeric Unix seconds; outer `time` also supported |
| `duration` | `duration_ms` | Finite non-negative number of milliseconds |
| `error` | `error` | Boolean true or string `"true"` marks an error |

Honeycomb also documents configurable tracing columns, so field names cannot
be assumed universal. [Dataset definitions](https://docs.honeycomb.io/api/dataset-definitions/get-all-dataset-definitions)

`otel.status_code` of `2`, `"ERROR"`, or `"STATUS_CODE_ERROR"` also marks a
recorded error. Other values remain unflagged; absence is not a success claim.
Known `meta.annotation_type` values `span_event`, `link`, and `log` are excluded
with a count. Arbitrary attributes, payloads, and log bodies are not copied
into the diagram. Names and explicitly selected fields are preserved, so
review the generated spec before sharing it.

## What the diagram means

- **Nodes:** services actually present in the input.
- **Arrows:** parent/child span relationships across services. They do not
  assert HTTP, gRPC, a retry, or even a network hop. Same-service spans remain
  in the timeline and step list without inventing another service.
- **Waterfall:** actual start offsets and durations on one scale. The extent
  is the maximum end minus the earliest start, not a sum of overlapping work.
  Parent/child intervals remain unchanged when async work or clock skew makes
  them disagree; a warning calls this out.
- **Steps:** inspection order by start timestamp, not a synthetic replay of
  start and completion events. All timing bars remain visible; the selected
  span is highlighted and its ID, parent, name, and duration appear in a table.
- **Completeness:** missing parents and unusual root counts appear as visible
  bullets. No missing service or span is fabricated. An export can omit whole
  branches without leaving detectable missing parents, so no import proves
  that the trace is complete.

Duplicate span IDs, cycles, missing required fields, ambiguous trace selection,
and invalid timing fail before replacing the editor. Initial bounds are 200
spans and 30 services per diagram, 10,000 input events, and 10 MB input in the
workbench. Larger traces are refused with guidance to focus the export; there
is no silent truncation. Direct OTLP `resourceSpans` envelopes are not supported
yet; export Honeycomb events or flatten to the documented field shape.

## Complex service layouts

Imports place upstream services before their downstream dependencies. Service
cycles are grouped at the same dependency level; large levels wrap into rows
of at most four cards. Neighbour ordering reduces avoidable crossings. The
result is ordinary `rows` data you can edit, with `routing: "lanes"` enabled.
Row position represents dependency order, not timestamp order or duration.

Lane routing spreads attachment ports, reserves horizontal tracks between
rows, and chooses vertical channels that clear every card. Tracks expand the
row gaps when needed. Routes prefer shorter paths with fewer crossings and
coincident segments; a background break separates remaining crossings.
Dense or non-planar graphs can still cross. Numbered coins and authored edge
labels can still crowd a dense view. Step selection highlights the relevant
relationship; the complete graph remains available for context.

Choose **starters… → complex trace** for a fictional request with shared
dependencies and a service cycle. Long service labels are abbreviated on
cards, with the complete name in the card tooltip and span details.

`routing: "curves"` (or omitting routing) restores the existing renderer.
Lane routing supports one to five unstacked cards per row, without floats or
self-loops. Unsupported edited layouts fall back to curves with a validation
warning. Lane routing ignores authored edge bends; label offsets still work.

## Agent workflow

```sh
node tools/trace2spec.js events.json -o request.spec.json \
  --trace-id TRACE_ID --source-url 'https://ui.honeycomb.io/your-trace'
node tools/validate.js request.spec.json
python3 tools/page_build.py request.spec.json --root ./visualizations
```

`--title` overrides the page title; `--fields mapping.json` accepts the same
field-name overrides as the workbench. Without `-o`, strict spec JSON goes to
stdout; import warnings and statistics go to stderr. The CLI and workbench
execute the same pure converter, `src/trace-import.js`.

When enriching a trace, keep observation and explanation distinguishable.
Do not infer a retry just because two spans share a name, call the longest
span a bottleneck without considering nesting, or treat one request as the
whole system design. Preserve span IDs and the source link. Review visible
completeness warnings before converting observations into design claims.

## Next slices

1. Map spans/services onto nodes in an existing HLD and report unexpected or
   unobserved paths; an unobserved path is not proof that it is unused.
2. Add subtree selection and service grouping for large traces, with explicit
   counts and breadcrumbs for folded spans.
3. Add a Honeycomb account adapter. Honeycomb documents a hosted MCP
   `get_trace` tool, which is a promising agent path for URL-based imports.
   No such connector is installed or used by this implementation.
   [Honeycomb MCP concepts](https://docs.honeycomb.io/integrations/mcp/concepts)

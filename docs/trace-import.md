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
5. Choose **Preview trace**. Review source/selection counts, extent, completeness
   warnings and subtree sizes. Preview leaves the existing document intact.
6. To focus, search for a span and choose its row, or set **Import scope** to
   a subtree/service and enter an exact ID/name. A focus includes all exported
   descendants. Re-preview after editing inputs or scope; stale previews cannot
   be built. **Clear focus** returns to all source spans while the export is loaded.
7. Choose **Build diagram**. Invalid input keeps the existing spec intact;
   a successful import replaces it in one builder undo step. Use the numbered
   step chips to inspect each span, edit the story, then save/export normally.

For an immediate example, choose **Start new project → A trace, explained**
from welcome. Its six fictional spans include overlapping identity/inventory
work and a recorded
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
- **Inside the service:** select a service or operation to jump to its span.
  Inclusive duration is its recorded wall time. Child-covered time is the
  union of direct-child intervals clipped to the parent; overlapping children
  count once. Uncovered time is the remainder. It can include local work,
  waiting or missing instrumentation, and is not a CPU measurement. Service
  span coverage also uses an interval union, so nested spans are not added.
- **Completeness:** missing parents and unusual root counts appear as visible
  bullets. No missing service or span is fabricated. An export can omit whole
  branches without leaving detectable missing parents, so no import proves
  that the trace is complete.

Duplicate span IDs, cycles, missing required fields, ambiguous trace selection,
and invalid timing fail before replacing the editor. Preview accepts up to
10,000 input events; a built diagram is bounded to 200 selected spans and 30
selected services. The workbench accepts at most 10 MB. Larger selections stay
previewable and require a narrower explicit focus; there is no silent
truncation. Direct OTLP `resourceSpans` envelopes are not supported
yet; export Honeycomb events or flatten to the documented field shape.

## Focus without losing timing context

A subtree includes its root span and every exported descendant. A service
focus includes every span attributed to that service and every descendant,
including other services. This preserves all exported direct children of
every included span, so focusing does not inflate its uncovered time by
discarding child intervals. A service that contains most of the trace may
still exceed the diagram limit; choose a narrower subtree in that case.

Search examines the full selected-trace export by span ID, service, operation
and recorded error, using all typed words. It shows at most 25 matching rows
with the total match count and each subtree's span count. Service-name
autocomplete suggests the first 100 services; exact names beyond those
suggestions still work. Long ancestor breadcrumbs show the nearest eight
ancestors and indicate omitted earlier ancestors.

Focused diagrams retain original span/parent IDs and stable source-derived
service IDs. Parents outside the focus are reported, not reparented or drawn
as invented service nodes. All offsets are rebased to the earliest included
span; durations and relative timing remain unchanged. `start_ms` in the details
is the view offset; `trace_start_ms` retains the offset in the source export.
Visible bullets disclose the timing origin and omitted counts. The generated
`page.traceImport` metadata records the focus, included/source counts, boundary
span count, view offset and bounded ancestor breadcrumbs.

The import form retains the raw input in memory so **Clear focus** can restore
the selection. Raw input and omitted spans are not copied into the saved spec
or autosaved draft. After a reload, reopen the original export to broaden a
saved focused diagram. Source completeness warnings still apply to every focus.

## Complex service layouts

Imports place upstream services before their downstream dependencies. Service
cycles are grouped at the same dependency level; large levels wrap into rows
of at most four cards. Neighbour ordering reduces avoidable crossings. The
result is ordinary `rows` data you can edit, with `routing: "lanes"` enabled.
Row position represents dependency order. Slots within each row render left to
right. Position does not represent timestamp order or duration.

Lane routing spreads attachment ports, reserves horizontal tracks between
rows, and chooses vertical channels that clear every card. Tracks expand the
row gaps when needed. Routes prefer shorter paths with fewer crossings and
coincident segments; a background break separates remaining crossings.
Dense or non-planar graphs can still cross. Numbered coins and authored edge
labels can still crowd a dense view. Step selection highlights the relevant
relationship; the complete graph remains available for context.

Use **Open file** with
[`src/starters/complex-trace.json`](../src/starters/complex-trace.json)
for a fictional request with shared dependencies and a service cycle. Long service labels are abbreviated on
cards, with the complete name in the card tooltip and span details.

The diagram's **View** controls select **Auto**, **Fit width** or **Readable**.
Auto uses the designed 1180-pixel board width when the diagram column is at
most 640 pixels wide; on wider columns it fits. Readable always keeps that
minimum width, while Fit width shows the whole graph at the available width.
These are viewing controls, not changes to the imported spec or row layout.

For a regular mouse, use the **Scroll** arrows or drag/click the position slider
below the view choices. They appear only when the board overflows, including in
Auto mode on narrow columns, and stay synchronized with native scrolling.
You can also Tab to the slider or named diagram region and use the arrow keys.
The legend and view controls stay in sight while you
pan. A newly overflowing board starts horizontally centered; later resizes
and tab visits preserve an existing pan. In the workbench, a uniquely matched
section retains its view choice through normal edits and skin changes. A
rebuilt board starts with a fresh pan position; reload resets its choice to
Auto. Printed diagrams fit the page and omit the view controls.

`routing: "curves"` (or omitting routing) restores the existing renderer.
Lane routing supports one to five unstacked cards per row, without floats or
self-loops. Unsupported edited layouts fall back to curves with a validation
warning. Lane routing ignores authored edge bends; label offsets still work.

## Service timing panel

The `trace` panel keeps normalized span IDs, parent IDs, service and operation
names, start offsets and durations. Its `selected` step state follows the
selected span. Service operations share one offset scale; nested intervals
remain visible. Expand direct children to see same-service versus other-service
operations. A blue segment marks child-covered time; hatching marks uncovered
time, with numeric values and text definitions alongside.

For the six-span checkout example, the root lasts 300 ms. Its child intervals
cover 235 ms after combining overlap, leaving 65 ms uncovered. The same-service
cache operation remains visible inside checkout. The union of checkout’s spans
is 300 ms, not the 305 ms sum of its root and cache span.

An export can omit child spans without a detectable missing-parent warning,
so uncovered time is an instrumentation-dependent remainder. It is not proof
of blocking, CPU execution, critical-path membership, or a bottleneck. Skewed
and async child intervals are clipped only for the coverage calculation;
their original timing rows remain unchanged. Invalid timing, duplicate IDs,
cycles or an unknown selected span show **Timing unavailable**.

## Agent workflow

```sh
node tools/trace2spec.js events.json -o request.spec.json \
  --trace-id TRACE_ID --source-url 'https://ui.honeycomb.io/your-trace'
node tools/validate.js request.spec.json
python3 tools/page_build.py request.spec.json --root ./visualizations

# Inspect a large export before building; stdout is a bounded JSON summary.
node tools/trace2spec.js events.json --preview
node tools/trace2spec.js events.json --root-span SPAN_ID --preview
node tools/trace2spec.js events.json --root-span SPAN_ID -o focused.spec.json
node tools/trace2spec.js events.json --service 'payments' -o payments.spec.json
```

`--title` overrides the page title; `--fields mapping.json` accepts the same
field-name overrides as the workbench. Without `-o`, strict spec JSON goes to
stdout; import warnings and statistics go to stderr. The CLI and workbench
execute the same pure converter, `src/trace-import.js`.

`--root-span` and `--service` are mutually exclusive. `--preview` emits source
and selection counts, focus metadata, warnings and `canBuild`; an oversized
selection is a successful analysis with `canBuild:false`. Invalid inputs still
fail. Preview refuses `-o` to avoid overwriting a spec with summary data.

When enriching a trace, keep observation and explanation distinguishable.
Do not infer a retry just because two spans share a name, call the longest
span a bottleneck without considering nesting, or treat one request as the
whole system design. Preserve span IDs and the source link. Review visible
completeness warnings before converting observations into design claims.

## Next slices

1. Map spans/services onto nodes in an existing HLD and report unexpected or
   unobserved paths; an unobserved path is not proof that it is unused.
2. Add focused exploration of an already imported diagram, with explicit
   boundary context and original-source recovery when broadening a saved view.
3. Add a Honeycomb account adapter. Honeycomb documents a hosted MCP
   `get_trace` tool, which is a promising agent path for URL-based imports.
   No such connector is installed or used by this implementation.
   [Honeycomb MCP concepts](https://docs.honeycomb.io/integrations/mcp/concepts)

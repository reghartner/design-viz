# Direct trace connection profiles

Status → Trace → **Load trace** retrieves one exact trace ID, independently of
Metrics, trace search, carrier bindings and query candidates. **Verify trace
connection** uses the same production path and displays the exact connector/tool,
environment, bounded arguments (configured literals/context are redacted), request
acceptance, returned ID match, span count and completeness. Both are explicit
reader actions. Changing an input never fetches. Clear/cancel, connection,
environment, mapping diagram, document identity and remount changes retire old
requests; late responses cannot replace current evidence. Schema/detail requests
time out after 30 seconds. Connection or environment changes clear the pasted
ID/link and times; mapping diagram changes keep them. The environment starts
at the board's match ([rules](provider-traces.md#load-trace-environment)).
An authenticated host account change retires the shared telemetry session,
retracts direct and numeric evidence, and requires reopening the viewer.

The result stays in this viewing session. No board edits, metrics, numeric proof,
trace history or new traceMatch rules are created. Choose a mapping diagram when
several exist. Exact source-section identity includes nested sections and loaded
details; imported nodes receive the same authored mappings as local nodes. An
unmapped trace can still show its waterfall. Missing evidence remains unknown.

## Company agent handoff

Fill `company/company.json.traceConnections` (versioned profile map) using the
company's authenticated, currently discovered MCP schema. The exact server label
and tool name are required; a public tool schema is not evidence of the connected
schema. Never put credentials, authorization headers, signed URLs, arbitrary
JavaScript, response transforms or arbitrary URL fetch instructions in a profile.
All configuration ships to readers and portable kits.

This example uses the observed Honeycomb `get_trace` signed lookback shape. Names
are placeholders, not deployment defaults. Confirm that the connected tool
actually declares the chosen `team_slug`/`from` arguments before using it.

```json
{
  "version": 1,
  "traceConnections": {
    "operations": {
      "version": 1,
      "label": "Company Honeycomb",
      "provider": "honeycomb",
      "server": "Exact connected Honeycomb server label",
      "tool": "get_trace",
      "readOnly": true,
      "adapter": "honeycomb-table-v1",
      "arguments": {
        "traceId": "trace_id",
        "start": "from",
        "environment": "environment_slug",
        "context": {"team": "team_slug"}
      },
      "time": {"encoding": "relative", "type": "string", "defaultLookback": "2h"},
      "literals": {"view_mode": "full"},
      "environments": {
        "production": {"label": "Production", "value": "prod-slug", "context": {"team": "company-team"}},
        "staging": {"label": "Staging", "value": "stage-slug", "context": {"team": "company-team"}}
      },
      "links": [{
        "origin": "https://ui.honeycomb.io",
        "path": "/{team}/environments/{environment}/trace",
        "query": {"traceId": "trace_id", "start": "trace_start_ts", "end": "trace_end_ts"},
        "timeEncoding": "unix-seconds"
      }]
    }
  }
}
```

Company profiles are inherited by every board built with that company
configuration. They grant no permission and never make a call before the reader
clicks Load/Verify. A board may optionally narrow or override those defaults:

```json
{"tracking":{"telemetry":{"traceConnections":{
  "operations":{"profile":"operations","environments":{"production":{}}}
}}}}
```

Omitting `traceConnections` inherits all configured company profiles. An explicit
map selects only its entries; `"traceConnections": {}` disables direct loading for
that board. Omitting `environments` in an entry enables all environments declared
in that profile. An
environment subset can override its declared `label`, `value`, `context` and
`literals`; board `label` and existing top-level `literals` may also be overridden.
Overrides cannot introduce literal/context keys or change server, tool, argument
mapping or adapter. Alternatively a board may contain a full inline v1 profile
instead of a company reference. Readers can choose only the resolved company/board
connections. `tracking.telemetry.enabled:false` and host `telemetry:false` win.
Optional `allowedAttributes`:
[provider traces](provider-traces.md#allowed-match-attributes).

## Absolute bounds and supported links

A pasted URL is parsed locally, never fetched. Origin and literal path must match
one configured descriptor. `{name}` captures a whole path segment. `query` maps
normalized field names to exact URL parameter names. Permitted normalized fields
are `traceId`, `start`, `end`, `environment` and declared `arguments.context` keys.
Environment/context values must match the selected configured environment;
unselected ambiguous environments require a choice. Link team names never become
unconfigured tool arguments. Duplicate or unknown parameters, repeated/conflicting
fields, ambiguous descriptors, credentials and fragments are rejected.

Relative-only connections reject absolute link bounds with an explicit message.
They never silently substitute “last two hours” for an older trace. If discovery
and a probe establish that the connected detail tool supports absolute `from` and
`to` strings, this complete **illustrative** profile enables those bounds:

```json
{
  "version": 1,
  "label": "Honeycomb absolute detail",
  "provider": "honeycomb",
  "server": "Exact connected Honeycomb server label",
  "tool": "get_trace",
  "readOnly": true,
  "adapter": "honeycomb-table-v1",
  "arguments": {"traceId":"trace_id","start":"from","end":"to","environment":"environment_slug","context":{"team":"team_slug"}},
  "time": {"encoding":"iso8601","type":"string","defaultLookback":"2h"},
  "literals": {"view_mode":"full"},
  "environments": {"production":{"value":"prod-slug","context":{"team":"company-team"}}},
  "links": [{"origin":"https://ui.honeycomb.io","path":"/{team}/environments/{environment}/trace","query":{"traceId":"trace_id","start":"trace_start_ts","end":"trace_end_ts"},"timeEncoding":"unix-seconds"}]
}
```

Numeric timestamps require explicit `unix-seconds` or `unix-milliseconds` and
`type:"number"` (or `"string"` if the tool accepts decimal strings). Conversion preserves nanosecond
precision; values that cannot be represented exactly as a declared number fail.
Raw-ID time controls accept a signed lookback such as `-2h`, or paired UTC ISO
timestamps. A time-bearing link and explicit time controls cannot be combined.

## Verification and evidence record

1. Record the exact connected server/tool, discovery date, tool annotations and
   complete input schema (no secrets). Probe a known exact ID with the minimum
   required fields and a bounded time window. Do not infer arguments from prose.
2. Choose a registered adapter: `honeycomb-table-v1` for the verified formatted
   table/metadata response, or `tempo-v1` for the verified Tempo response. See
   [provider provenance and limits](provider-traces.md). Raw `trace_result_json`
   and other unverified shapes are not supported.
3. Record sanitized response-shape evidence, expected returned ID, span count,
   completeness flags, time units and which link patterns were actually checked.
   Distinguish a synthetic fixture from a recorded authenticated response. The
   November 5 agent probe established signed `from:-2h` and `view_mode:full` with
   formatted payload text; it did not establish published-page download access.
4. Validate the board with `node tools/validate.js board.spec.json`, build the
   configured artifacts, and click **Verify trace connection** in the actual
   host. Save the safe report and permission/download outcome with the handoff.
   Request acceptance alone does not establish ID match or a complete trace.
5. Exercise raw ID, recognized link, wrong environment, older absolute bounds,
   denied permission, absent ID, malformed response and cancellation. An error is
   never converted to “not found”, zero spans or a successful empty observation.

Profile validation rejects unknown configuration fields, excessive profiles/maps,
reserved keys and credential-shaped literals. Request validation honors required
fields, nullable type/anyOf/oneOf unions, allOf, enum/const, scalar/array bounds and
additionalProperties. Unsupported schema constraints fail at the schema stage.
Tool metadata explicitly marking write/destructive capability is rejected.
Custom detail aliases require positive `readOnlyHint:true`; profile `readOnly:true`
cannot override tool metadata. Permissions remain host-owned and are requested
only from the Load/Verify gesture. Responses retain parser warnings and the
200-span display limit; unknown shapes are explicit errors.

## Native and packaging contract

Native mounts contain no MCP transport. Hosts may implement
`telemetry.directTrace.describe(request, signal)` and
`telemetry.directTrace.call(request, args, signal)` as declared in
[`src/native/mount.d.ts`](https://github.com/reghartner/design-viz/blob/main/src/native/mount.d.ts). The host must authorize that
exact configured connection using its own read-only policy, return current tool
metadata/schema, and return the original provider response. The viewer uses the
same validation and decoder as portable artifacts. Without those callbacks the
UI honestly reports unavailable; it does not fall back to arbitrary networking.

Company profiles compile through source-loader into standalone, workbench, native
and backend assemblies. Source-free kits retain reduced company agent context and
the compiled resolver. Injection declares only resolved exact detail tools,
including a detail-only connection with no search signal. The `traces` authoring
packet includes this contract and company context. `--no-config` removes company
defaults; inline board profiles remain authored configuration.

### Focus a span and its authored step

Selecting a waterfall span pauses the owning diagram. A unique authored mapping
selects its exact source step, including a step hidden by the current View or on
an alternate path. A shared step keeps the current path when that path contains
it. When more than one authored operation or path can own the span, choose the
step explicitly in the panel. Concurrent/ambiguous selector results also require
this choice; the viewer never picks the first match. Unmapped spans stay available
for inspection and do not change the current step.

The focused operation has exterior cyan corner brackets and a **Trace** label.
Its uniquely authored delivered edge receives a cyan floating outline with a
transparent gap around the original line. Curves, protocol dashes, status colors
and arrows retain their original geometry and ink. Failure/availability breaks
remain broken; focus never paints a continuous delivery over a hidden line.
Work-status borders, including dotted red Missing work, retain their own ink.
All applicable nodes use this treatment, including imported and nested topology
and loaded detail diagrams. The selected span lives in the controller, so every
Status panel agrees with the diagram. A mapping without an explicit `nodeId` can
select its authored step and its unique delivered edge. Multiple eligible edges
or duplicate endpoints have no edge focus; the viewer never guesses an edge.
Millisecond annotations use larger, compact numbers; exact provider values remain
in accessible labels and tooltips without changing the trace evidence. Larger
labels stay within the existing SVG clip: edge timings can switch sides of an
extreme curve, and bottom-node timings retain stroke padding. These transient
placements do not change the diagram frame or camera on routine repaint.

**Clear trace focus** removes the brackets, edge outline and span selection without restarting
playback or changing the chosen step. Whole-request annotations remain available.
Changing the trace, environment, connection, mapping source, historical context,
or source mount expires focus. Old panel callbacks cannot navigate a replacement
diagram. Routine repainting updates the existing panel without scrolling it.

Desktop CI scenes in `trace-span-focus.spec.mjs` capture local and nested imported
Missing work borders beside selected steps, a filtered alternate, and explicit
ambiguity choices. They also exercise native sibling isolation, keyboard
selection, reduced motion, repeated repaint, history and retired callbacks.

Revision scenes also cover curved local and nested imported edge outlines,
baseline/status ink, exact loaded-source ownership, edge-only and ambiguous
mappings, compact long timings, and overlay cleanup across native mounts.

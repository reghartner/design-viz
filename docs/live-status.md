# Live ticket status

Live ticket references connect a diagram's implementation work to Jira without
copying changing status into the authored spec. Hardware, firmware, UX and backend
work can be tracked on the nodes and the interactions between them.


### Planned nodes and connections

Set `"existsWhen": "tickets-done"` on a node or edge when its tickets create
something that does not exist yet. In desktop Workbench, select the carrier and
use **Inspect → Tracking → Exists when tickets are complete**. Leave this off
for tickets improving an existing component or connection. Unchecking removes
the optional field; Undo/Redo and project export preserve it.

Availability requires **every valid attached Jira ticket** to have explicit
`state: "done"`. Missing entries, unknown states, `missing`, Todo, In Progress
and Testing keep it unavailable. PR state never decides existence. No valid tickets means
the rule warns and is ignored; invalid `existsWhen` values also warn and are
ignored. Text boxes do not support the rule. Jira states, counts, rollups and
dependency waiting remain unchanged.

While Live is on, an unavailable connection shows a communication break and
stops packet animation. An unavailable node keeps its readable title and subtitle.
Todo, unknown and partial-Done evidence show a neutral dashed **reserved space**
with a box placeholder and a bounded ticket summary. If no attached ticket has a
known unfinished state, the label is **AWAITING JIRA STATUS**: absent or unknown
evidence alone does not claim the node is unbuilt. This includes Done plus
unknown evidence. Known Todo uses **NOT BUILT YET**. Blocked
or missing evidence uses the same reservation in rose. An actual In Progress
rollup shows a blue **blueprint frame** with light hatching and its original icon.
Every ticket explicitly Done makes the node **green**, using the
live Done fill and outline, with all construction decoration removed.
A fixed 32px footer is reserved in gated-node geometry, including stacks and floats,
so status updates never move the diagram. The original content and controls stay
in their body area. Long ticket summaries abbreviate; the popover retains every
causing ticket. Every connection touching an unavailable node also breaks, even
without its own tickets. Its accessible name and ticket popover say
**Awaiting Jira status** for an awaiting cause or **Not built yet** for a known
unfinished cause, list the relevant tickets, and retain the actual Jira state.
Mixed edge/endpoint causes each retain their own explanation. Neither wording
changes the all-Done availability rule or packet suppression. Labels, unlabeled break glyphs and node cards retain keyboard access;
there are no extra canvas status badges beyond the reserved-space explanation.
All-Done evidence restores green live Done appearance and traffic, unless another endpoint or the edge itself still
has an unfinished existence rule.

The rule applies while awaiting the first status response and to partial or
empty responses. Live off, explicit `clear()` and controller destruction restore
authored visuals. A later response or re-enabling Live reapplies the rule.
Navigation and rebuilt diagrams use the current evidence.

Provider-authored rules survive topology imports. Consumer `nodeTracking` and
`edgeTracking` overlays may add `existsWhen: "tickets-done"`; it evaluates all
resolved tickets, inherited and local. A provider rule remains read-only in the
consumer and cannot be disabled there. Removing a consumer rule restores provider
behavior and preserves all other tracking. Resolved JSON snapshots opened in
Workbench expose the same desktop Tracking controls: edits affect that consumer
snapshot, including its availability rule, while imported structure and the
original provider stay unchanged.
The separate `flow.ticket-availability` capability lets older viewers report
unsupported behavior. See the runnable
[planned availability example](../examples/ticket-availability/ticket-availability.spec.json).

## Fields

Any diagram node or edge can carry these optional references:

```json
{
  "tickets": ["HW-123", "FW-45"],
  "prs": ["https://github.com/acme/firmware/pull/88"]
}
```

`tickets` accepts Jira keys matching `^[A-Z][A-Z0-9_]+-[0-9]+$` or absolute
HTTP(S) browse URLs such as `https://acme.atlassian.net/browse/HW-123`.
Self-hosted context paths (for example `/jira/browse/HW-123`), query strings and
fragments are supported. The final path must be `/browse/KEY`; other paths,
credentials, whitespace, backslashes, malformed escapes and dot segments are
rejected. Keys are case sensitive and authored strings are not trimmed. `prs` accepts absolute HTTP(S) URL strings using
the same URL normalization as delta links. Invalid entries warn individually
and are ignored. Non-array fields warn once and are ignored, including explicit
null. The shared `trackingRefs(obj)` parser returns valid, deduplicated references
in authored order without modifying the source. Ticket URLs normalize to keys
for lookup and deduplication, so a key and a URL for the same issue count once.
Authored browse URLs remain available as clickable links when neither the page
Jira site nor runtime issue metadata supplies a link. Import merges retain the
first reference per key, inherited before local; when URLs disagree, the first
reference wins. Host names are not restricted to Atlassian Cloud.

Place the optional Jira site on the page, beside `title`, `contract` and `flowview`:

```json
{
  "page": {
    "title": "Connected doorbell delivery",
    "tracking": {"jira": {"site": "https://acme.atlassian.net", "epic": "DOOR-100"}}
  }
}
```

This is a metadata excerpt; a complete page also needs sections or blocks.
`tracking` must be an object and a present `tracking.jira.site` must be an
absolute HTTP(S) URL string. Invalid values warn and are ignored; tracking
validation never turns them into errors.

`tracking.jira.epic` accepts one Jira key or an array of keys using the same
pattern as `tickets`. `trackingEpics(page)` returns valid keys once, in authored
order. Invalid entries warn individually; an invalid field type warns once.
The **Parent** control keeps this existing `epic` storage field for compatibility;
there is no new authored initiative field. Each key may name an Epic or Initiative.
Jira issue-type metadata determines the kind (`hierarchyLevel` first, standard
Epic/Initiative names as a fallback). An Epic includes its work items; an Initiative
includes its child Epics and their work items. “Stories” in this board means those
ordinary work items, including Tasks and Bugs. Containers never count as stories.
This is a bounded two-level hierarchy, not arbitrary project-tree traversal.
Assigning a story to a node or edge is an authoring step, or, on a board published
in two files, an Edit-mode change saved from the board itself (see "Edit mode on the
shared board" below).

`tracking.jira.exclude` is an optional array of Jira story keys, for example
`"exclude": ["DOOR-108", "DOOR-109"]`. `trackingExclusions(page)` returns valid
keys once in authored order. Invalid entries warn and are ignored; a non-array
value warns once and is ignored. The source stays intact through normalization
and export. This list removes inherited parent membership only.

The board's counted stories are the distinct union of:

1. Parent-sourced stories, minus that source page's exclusions.
2. Tickets manually attached to nodes or edges, including tickets outside the
   configured parents and tickets without parent metadata.
3. Dependency stories displayed because they are upstream of an included story,
   including transitive upstream evidence and dependencies outside the initiative.

Manual attachments and needed dependencies add an excluded story back. All
three contributions deduplicate by Jira key; Epic and Initiative containers
never count. A missing-status ticket still counts in the denominator and shows
**No status**; it is never done. Done counts only entries with `state: "done"`.
The same set drives story progress, state counts, blockers, waiting, outside-scope
counts and the on-diagram fraction. Dependency rows count even when they have no
diagram carrier. The carriers-done ring, carrier paint and diagram readiness keep
their existing carrier-based meaning. Waiting counts and chains include only
displayed story dependents; hidden containers and unrelated/excluded-only
dependents cannot add a phantom wait. A displayed story still retains its
direct upstream container evidence when such a link exists.

Loaded approved detail pages apply their own parent exclusions before their
stories join the board. One page cannot exclude another page's intentional
inclusion. Dependency traversal starts from the included parent/manual stories;
a chain belonging only to excluded stories does not reintroduce itself.

`tracking.github` bounds pull-request discovery through the viewer's GitHub
connector (see "Pull requests from GitHub"): `{"repos": ["acme/firmware"]}` or
`{"org": "acme"}`. `repos` is an array of `owner/repo` names; `org` is one
organization name. `trackingGithubScope(page)` returns `{repos, org}` with valid
entries once, in authored order; `repos` wins when both are present. Invalid
entries warn individually (`tracking.github.repos[1]: use an array of owner/repo
names — ignored`), a wrong type warns once, and nothing here is ever an error.
Without a scope, discovery searches only the repositories of the authored
GitHub `prs` URLs.
Two optional fields describe delivery dependencies (see [Dependencies](#dependencies)):

```json
{
  "tracking": {
    "jira": {"site": "https://acme.atlassian.net", "epic": "DOOR-100", "dependencyLinks": ["is blocked by", "depends on"]},
    "dependencies": [{"ticket": "UX-89", "on": "BE-68", "reason": "needs the push payload contract"}]
  }
}
```

`tracking.jira.dependencyLinks` lists the Jira link descriptions, as shown on
the dependent issue's side, that mean “waits on”; the default is `is blocked by`
and `depends on`. `tracking.dependencies` holds authored ticket → ticket pairs
(`ticket` waits on `on`, with an optional `reason`). `trackingDependencies(page)`
returns valid pairs once, in authored order; `trackingDependencyLinks(page)`
returns the lower-cased descriptions or the defaults. Malformed entries, a
self-dependency and non-array fields warn individually and are ignored; a
dependency on a key the status map never reports paints as a missing upstream
(red waiting), in the same spirit as MISSING.

### Telemetry bindings

Jira says whether the work is done. Production telemetry says whether the
finished hop carries real traffic without errors (PROVEN rather than only DONE).
A node or edge opts in with a `telemetry` object that names its own signals.
Nothing is inferred from node ids, titles or service names. A carrier without
`telemetry` is **unbound**: it gets no metrics overlay and no proof verdict. The
spec stores queries and limits only, never results.

A `call` edge with a PromQL rate, an error ratio and a latency limit:

```json
{
  "from": "notify", "to": "app", "label": "push", "tickets": ["BE-68"],
  "telemetry": {
    "kind": "call",
    "signals": {
      "rate":   {"grafana": "sum(rate(push_sent_total{app=\"notify\"}[5m]))*3600", "unit": "req/h"},
      "errors": {"grafana": "sum(rate(push_failed_total{app=\"notify\"}[5m]))*3600", "unit": "req/h"},
      "p95":    {"grafana": "histogram_quantile(0.95, sum by (le)(rate(push_latency_seconds_bucket{app=\"notify\"}[5m])))*1000", "unit": "ms"}
    },
    "proof": {"rate": {"min": 10}, "errors": {"maxRatioOf": "rate", "max": 0.01}, "p95": {"max": 500}},
    "links": {"dashboard": "https://acme.grafana.net/d/notify/push"}
  }
}
```

A `queue` node that counts queued events from Loki and reads consumer lag and age
from Prometheus:

```json
{
  "nodes": {
    "device-events": {
      "title": "device-events", "sub": "Kafka topic", "tickets": ["BE-67"],
      "telemetry": {
        "kind": "queue",
        "signals": {
          "in":  {"loki": "sum(count_over_time({app=\"ingest\"} |= \"event queued\" [5m]))", "unit": "msgs"},
          "lag": {"grafana": "max(kafka_consumergroup_lag{topic=\"device-events\",group=\"notify-consumers\"})", "unit": "msgs"},
          "age": {"grafana": "max(kafka_consumergroup_lag_seconds{topic=\"device-events\",group=\"notify-consumers\"})", "unit": "s"}
        },
        "proof": {"in": {"min": 1}, "lag": {"max": 500}, "age": {"max": 60}}
      }
    }
  }
}
```

| field | value |
|---|---|
| `kind` | Required. `call`, `queue`, `service`, `log-event` or `device`. |
| `signals` | Required. Named signals such as `rate`, `errors`, `p95`, `in`, `lag`, `age`. Names start with a letter and use letters, digits, `-` and `_`. Each signal has exactly one source key and an optional `unit` text. |
| `signals.<name>.grafana` | A PromQL query string. |
| `signals.<name>.loki` | A LogQL metric query string. A query with `$__range`, such as `sum(count_over_time({app="x"} \|= "y" [$__range]))`, reports one total for the whole window; see [Loki window totals](#loki-window-totals). |
| `signals.<name>.tempo` | A TraceQL query string, used for exemplar traces. |
| `signals.<name>.sql` | A SQL query string for a Grafana SQL datasource, such as a data lake. |
| `signals.<name>.honeycomb` | A Honeycomb query object, kept as authored. |
| `signals.<name>.missingMeansZero` | Optional boolean on `grafana` and `loki` signals. `false` shows a successful empty result as unobserved instead of 0; see [Empty Loki and Prometheus results](#empty-loki-and-prometheus-results). |
| `signals.<name>.role` | Optional `"error"`: an error signal, such as a dead-letter queue depth. When it is outside its `proof` limit (any `min`, `max` or `maxRatioOf`) the metric card border is red (state `error`, #1201), outranking every other card state, the popup verdict names the error signal as outside its limit, and the Proof box shows a red `error` chip and arc. Those carriers leave whichever Proof bucket their verdict put them in (degraded, unproven or unclassified), so a quiet dead-letter queue with messages counts as error. Any other value is a validation warning and is ignored. Without the field the signal behaves as before. |
| `signals.<name>.window` | Optional span of the signal's value, a duration in the page `window` form (`"1h"`, `"7d"`, `"now-7d"`). A display label only; the query is unchanged. See [Signal span](#signal-span). |
| `proof` | Optional per-signal limits: `min`, `max` (finite numbers) and `maxRatioOf`. With `maxRatioOf: "<other signal>"`, `max` is the highest allowed ratio of this signal to the other one, so `"errors": {"maxRatioOf": "rate", "max": 0.01}` means at most 1 % errors. `maxRatioOf` needs `max` and another signal of the same binding. `min` stays an absolute floor. |
| `links` | Optional authored link-outs: `dashboard` and `query`, absolute HTTP(S) URLs. |
| `card` | Optional edge card: `side` (`right`, `left`, `above`, `below`), `offset` (pixels, -1000 to 1000), `title` (1–120 plain-text characters shown instead of the edge label) and `width` (pixels, 140 to 480; default 240). |

Shared settings live on the page beside the Jira settings, in
`tracking.telemetry`:

```json
{
  "tracking": {
    "jira": {"site": "https://acme.atlassian.net", "epic": "DOOR-100"},
    "telemetry": {
      "grafana": {"prometheus": "prom-main", "loki": "loki-main", "tempo": "tempo-main", "sql": "lake"},
      "honeycomb": {"environment": "prod", "dataset": "doorbell-prod"},
      "window": "1h",
      "refreshMs": 300000,
      "templates": {
        "kafka-topic": {
          "kind": "queue",
          "params": ["topic", "group"],
          "signals": {
            "in":  {"grafana": "sum(rate(kafka_server_brokertopicmetrics_messagesin_total{topic=\"$topic\"}[5m]))*3600", "unit": "msg/h"},
            "lag": {"grafana": "max(kafka_consumergroup_lag{topic=\"${topic}\",group=\"$group\"})", "unit": "msgs"}
          },
          "proof": {"in": {"min": 10}, "lag": {"max": 500}},
          "links": {"dashboard": "https://acme.grafana.net/d/kafka?var-topic=$topic"}
        }
      }
    }
  }
}
```

`enabled` is an optional boolean, default `true`. Set
`tracking.telemetry.enabled: false` on the consuming page to disable telemetry
throughout its local, imported (including nested), and loaded-detail carriers.
Bindings, templates and placement remain authored and editable. The disabled page
has no Metrics controls, telemetry discovery, queries, timers, cards or cues.
Malformed values warn and use the backward-compatible `true` default. This flag
permits availability; it never turns Metrics on. Jira Live remains independent.

`grafana` holds datasource UIDs for `prometheus`, `loki`, `tempo`, `sql` and
`cloudwatch`, plus an optional CloudWatch `accountId` shared default.
`honeycomb` holds `environment` and `dataset`. `window` is the observation
window, a duration such as `30m`, `1h` or `7d`; the default is `24h`, the previous
24 hours (Chuck, 2026-11-04). Positive integer units `s`, `m`, `h`, `d` and
`w` accept a bare duration or relative lookback: `6h`, `-6h` and `now-6h`
all query the previous six hours. Surrounding whitespace is ignored. The internal
canonical duration is `6h`; Honeycomb receives signed `from: "-6h"` for scalar
queries and trace search/detail. Other providers keep their existing conventions
(for example Grafana relative starts use `now-6h`, and Tempo uses RFC3339 bounds).
Parsing never rewrites authored source.
The desktop Metrics window editor keeps the entered spelling (trimmed), with one
Undo/Redo per edit. Future offsets (`+6h`), zero, fractional durations and date
expressions are unsupported: authored invalid values warn and use `24h`, while
the editor refuses invalid edits. This shared window applies to metrics and
native trace search/detail for all local and imported carriers. `refreshMs`
is the refresh interval; values under five minutes use 300000 (with a warning)
and an absent value means five minutes. `templates` are named signal sets
authored on the page; the repository ships none.

A carrier applies a template with `"use"` plus a value for every declared
parameter:

```json
{
  "from": "ingest", "to": "notify", "label": "route",
  "telemetry": {"use": "kafka-topic", "topic": "device-events", "group": "notify-consumers", "proof": {"lag": {"max": 100}}, "card": {"side": "below"}}
}
```

Expansion is pure string substitution: each `$param` or `${param}` placeholder
named in `params` is replaced with the carrier's string value, in one pass. Write
`${topic}_total` when an identifier character follows the placeholder. Other
`$` text, such as Grafana's `$__rate_interval`, stays as authored. The carrier's
own `kind` and `card` replace the template's; its `signals`, `proof` and `links`
lay over the template's entry by entry, so the example above keeps both signals
and tightens only the `lag` limit. Parameter names start with a letter, use
letters, digits and `_`, and cannot be `kind`, `signals`, `proof`, `links`,
`card`, `use` or `params`.

`trackingTelemetry(page)` returns `{grafana, honeycomb, window, refreshMs,
templates}` with defaults when the field is absent. `carrierTelemetry(obj,
templates)` returns `null` for an unbound carrier, otherwise `{kind, signals:
{<name>: {source, query, unit}}, proof, links, card}`, with `unit` and `card`
`null` when not authored and `templates` taken from `trackingTelemetry(page)`.
Both parsers drop invalid entries and report each one through an optional
`invalid(path, message)` callback; neither throws or modifies the spec. The
validator reports the same problems as warnings, never errors: a malformed
signal or limit is ignored on its own, and a binding without a valid `kind` or
any valid signal leaves the carrier unbound. Text boxes never carry telemetry.
Bindings alone never ask for a live-status panel (#1345), so a canon page that declares
signals builds without one; a board still needs the panel to show its metrics.

Imported Canon topology accepts the same field in
`topologyImports[].nodeTracking` and `edgeTracking`. A consumer binding marked
`"extends": true` merges with the provider's binding (#1266): `signals` adds new
signals or changes only the named fields of inherited ones (`null` removes a
field), `hide` lists inherited signals to leave out together with their limits and
any ratio limit based on them, `proof`, `links` and `card` change only the named
fields, and `kind` replaces the inherited kind when set. For example
`{"extends": true, "signals": {"lag": {"grafana": "max(lag)"}}, "hide": ["errors"]}`.
Later provider changes still reach the consumer unless hidden or changed there. A
signal entry that names a source replaces the inherited source, so a signal always
has one. The validator warns at the overlay when such an entry leaves out or changes part of
the provider's query (Honeycomb calculations, filters or breakdowns, CloudWatch
dimensions, Logs logGroups), naming the signal, the carrier and each inherited item; a full
restatement, a string query or a source switch is a note, because later provider
changes to that query no longer reach this board (#1345). Hiding every signal leaves the carrier unbound in this document. A hide for
a signal the provider no longer has is kept in case it returns. A consumer binding
without `extends` replaces the provider's binding as a whole, as before; the
Workbench writes `extends` on every imported carrier, also before its provider has a
binding. It stores a kind only when it differs from the provider's, so provider kind
changes keep flowing; if the provider later removes its whole binding, the editor
reports the missing kind and **Set kind here** stores one in one step. A provider binding that uses one of the provider page's templates is
expanded with those templates before it reaches the consumer. When the provider
cannot expand it (an unknown template or a missing parameter), the binding is
dropped and the imported carrier is unbound, even if the consumer defines a
template with the same name. Validating the resolved consumer warns at that
carrier and names the provider path. Ticket edits in
the Workbench or on the shared board keep the consumer binding as authored.

## Telemetry environments

Telemetry profiles are opt-in. Documents without them keep their shared
configuration and do not substitute `$env` or automatically query production.
In desktop **Status board settings → Environments**, add
`qa`, `stg`, and `prd` (or other ids), choose **Default environment**, and set
per-environment Grafana UIDs/base URL and Honeycomb environment/dataset values. Each
control is one Undo step; export preserves the authored profiles. Removing the
default selects the first remaining profile; removing the last restores shared
settings. Blank profile fields inherit the shared value.

```json
{
  "tracking": {"telemetry": {
    "grafana": {"prometheus": "prom-$env", "loki": "logs"},
    "honeycomb": {"environment": "observability", "dataset": "events-$env"},
    "environment": "qa",
    "environments": {
      "qa": {},
      "stg": {"grafana": {"prometheus": "staging-prom"}},
      "prd": {"honeycomb": {"environment": "production"}}
    }
  }}
}
```

Ids start with a letter and contain only letters, digits, hyphens and
underscores. Invalid entries warn and are ignored. An absent or invalid default
uses the first valid profile in document order; no valid profiles means shared
settings. Deployment ids and Honeycomb environment slugs are separate values.

The **Env** selector in Live status changes only this reader session;
it never writes the default into the document. Metrics starts off. Selecting
while off makes no data queries. Switching while on aborts old requests, clears
live/history evidence, proof/activity observations, trace candidates and source
caches, then refreshes the selected environment. Late results cannot replace
its evidence. Selecting while Over time is open reloads that environment's
history; unsupported history stays unobserved. Legacy embedded timeline metrics
have no environment identity, so configured profiles do not reuse them.

`$env` and `${env}` are replaced literally in signal query strings, nested
Honeycomb string values, binding links, and Grafana/Honeycomb config strings.
Use them as quoted label/filter values or safe resource-name suffixes; this is
literal substitution, not a query-language builder. Object keys are unchanged.
Grafana `$__interval`/`$__rate_interval` and other placeholders stay intact.
Template parameters expand first, so an existing declared `env` parameter
continues to use its carrier's value. The consuming reader's environment applies
to all local, imported/nested and loaded-detail bindings after provider template
expansion; imported source documents are never edited.

Hosts can read `ctl.telemetry.environment()` and `config()`, or call
`setEnvironment(id)` (false for invalid/unchanged/unavailable-by-policy choices).
Snapshots include `environment` and `environments`. Providers receive an optional
fourth context argument `{environment, config}`; history receives that context
as its fifth argument. `environmentChanged(id, config)` lets a custom provider
synchronously invalidate its own caches before the next request. Custom
providers must honor request cancellation and key any external caches by
environment. Built-in Grafana and Honeycomb adapters support selected-window history.

When gathering metrics for a feature board, start from scoped Jira tickets and
linked PR diffs. Inventory the new queues, topics, pipes, routes, jobs and
instrumentation, then map each candidate to its ticket/PR, exact new resource,
carrier, query/datasource and deployed environment. Prefer indicators proving
that feature path, including its throughput, lag/backlog and errors. Avoid
service-wide dashboard crawls or generic CPU/uptime/request rates unless they
directly prove the feature or supporting context was requested. Name missing
instrumentation as an evidence gap. Telemetry-only boards use supplied resource
and code evidence without inventing tickets. See
[Metrics authoring](../.claude/skills/live-status-board/metrics.md).

## Workbench

Select a node or connection on the desktop canvas and open **Inspect → Tracking**,
just below the change details. In **Add ticket**, enter a Jira key such as `HW-123`
or a full browse URL such as `https://acme.atlassian.net/browse/HW-123` and press
Enter. Keys are case sensitive; surrounding input whitespace is trimmed. URLs
are stored in normalized URL form, retaining their context path, query and fragment.
In **Add PR**, paste an absolute HTTP(S) URL and press Enter. Duplicate references
are ignored. Each list keeps its order; use its numbered **Remove ticket** or
**Remove PR** button to remove an entry. Each add or removal has one Undo/Redo,
and Export project keeps the references in its JSON.

Board-level settings live in one desktop area, **Status board settings**. Open
it from the **Board settings** button at the top of Inspect (shown with or
without a selection), from **Find objects → Board settings**, from the
link in **Document settings**, or from a Live status panel's Inspect form. It has
five collapsible sections: **Jira**, **Metrics**, **Traces**, **Environments**
and **Log searches**. Sections start closed, with a short status in each
header; Metrics starts open when the page has a `tracking.telemetry` block. A
section with validator warnings starts open and its header counts them, and
each section lists the warnings for its own `tracking` paths. **Jira** (#1237) also
edits `tracking.dependencies` (rows of **Ticket**, **Waits on** and an optional
**Reason**, with Move up, Move down and Remove; **New dependency** plus **Add
dependency** or Enter adds one; keys are upper-cased, and a self-dependency or a
repeated pair is refused), `tracking.jira.dependencyLinks` (**"Waits on" link
names**: the defaults are listed while unset; **Add link name** keeps them and adds
the name; **Use default link names** removes the key) and `tracking.staleDays`
(**No activity after (days)**: in-progress tickets only; empty uses 7). Each edit is one Undo step, entries the
form cannot read stay as written, and a validator warning sits under the field it
names. The Jira header counts the dependencies.
**Traces** (#1239) edits `tracking.telemetry.traceConnections`
([trace connections](trace-connections.md)): each company profile of the build is
**Inherited** (no board map), **Use** or **Disable**; the first Use or Disable lists every
profile the board inherits (none on a board without traces, where Disable is not offered and
the profile reads **Not used**), so only that one changes, and **Inherit all company profiles** removes
the key. A used profile takes a **board label** and an environment subset (checkboxes;
all checked writes no `environments`) with per-environment **label**, **value** and
**context** overrides. A used profile shows the company `allowedAttributes` read only and
the board's additions as rows (Chuck 2026-11-12: the connection allows both lists); an
inline profile's list is rows too. Each row has **Remove**, and an **Add allowed
attribute** field adds one (Enter adds); a company name or a secret-like name is refused.
Inline profiles otherwise live in **Advanced JSON** (the whole map; empty removes the
key). **Readers can choose** lists the resolved connections. An edit the resolver would
reject is refused with its message; each edit is one Undo step, and a warning sits in
the group of the connection it names. The header names what readers get: "Not set", "Inherits N company
profiles", "Not used (no traces)", "N connections", "None" or "Off" (Allow metrics off).
**Log searches** (#1233) edits `tracking.telemetry.lookups`: **Offer log searches
in the Trace view** adds or removes the block (`{}` offers only the typed LogQL
box), each search is a fold titled by its id with its label, query, suggested
values (one per line), Loki datasource UID and trace and span ID field names, plus
Move up, Move down and Remove. **New log search** takes a label and a query (the id
is made from the label unless typed, accents dropped, and shown before saving) and
keeps typed text while the form refreshes; Enter in the label adds it, opens the new
search and moves focus to its label. After Move, focus stays on a usable Move
button; after Remove, on the next search. While searches exist, the Offer checkbox
says under it that they must be removed first. Each edit is one Undo step, and a validator warning sits under the
field it names, such as "has suggested values but no $value slot" under the query.
The header reads "Not set", "Typed query only" or the number of searches. On a document that is not yet a
status board, **Make this a status board** adds what is missing (a page wrapper
for a bare diagram, an empty `tracking` block and a Live status panel) as one
Undo step.

In **Status board settings → Jira**, edit
**Jira site**, **Parent**, **Exclude story** and **GitHub scope**. Enter an Epic or Initiative key in Parent and press Enter; use
**Remove parent 1**, **Remove parent 2**, and so on to remove keys. Enter a story
key in **Exclude story** and press Enter; **Remove excluded story 1** removes it
from the exclusion list. Duplicates and invalid entries create no history. In **GitHub scope**,
enter `owner/repo` names separated by commas, or `org:name`, and press Enter;
an empty value removes `tracking.github`. Each change has one Undo/Redo, and
Export project preserves parent keys in `tracking.jira.epic`, exclusions in
`tracking.jira.exclude`, and the GitHub scope in `tracking.github`. These authoring
controls are desktop-only.

When the document has tickets, **Demo live status** beside **Preview** supplies
sample states in sorted ticket order. It starts off when a project opens, except
from the built-in **Epic status board** template (**Start new project → Delivery
status**), which opens with it on. It stays preview-only across ordinary edits and
skin changes; it never saves status to the spec or contacts Jira.

This offline preview treats the configured parent as a direct Epic: an opaque
Jira key alone cannot establish its type. Automatic initiative detection requires
Jira metadata. A standalone demo timeline or host provider can supply the runtime
hierarchy metadata below to preview an initiative without contacting Jira.
Live colors require a viewer with the live-status overlay and a status provider.
PRs stay icons; the demo timeline supplies their GitHub detail.

An agent's snapshot of the board's real Jira status and metrics (`tools/live-snapshot.js`, #1265)
is a second preview choice. Load it with **File → Load snapshot…**; a `<board>.snapshot.json`
beside a board opened with **Choose working folder…** is offered too. A **Snapshot from <time>**
checkbox then sits beside **Demo live status**: checked after Load snapshot, unchecked when only
offered, and checking one turns the other off; unchecking Snapshot brings back what was on before it
(Demo live status, Preview metrics layout). While it is on, the Epic status connection line
reads "Snapshot from <time>" (with the year when it is not this year, and the time zone; a pale blue
dot), and **Preview metrics layout** is off. When the board allows metrics and the snapshot holds
signals for its carriers, the Metrics line reads "Metrics: snapshot from <time>" and the Metrics
overlay is on with the snapshot's values. Like the
demo it is preview state only: it is never saved to the spec, exported or published (Download and
Copy SVG, which copy the preview, are refused while it shows), and opening
another project forgets it. A status line under the File actions says what loaded (tickets with a
state, then `unknown` tickets when there are any, carriers with metrics), whether it is showing, how many of the board's tickets the snapshot holds a
state for (an `unknown` ticket does not count; a warning when none, since they would all show as missing), and how many errors the agent's run
recorded with the first one. A file that is not a snapshot, or larger than 8 MB, is refused there
with its reason.

### Trace spans on a node or connection

Select a node or connection and open **Inspect → Tracking → Trace spans** (desktop) to edit
its declared spans (`trace.spans`, see [provider traces](provider-traces.md#trace-spans-declared-on-nodes-and-connections-1290)).
Each span shows **Name**, **Service**, **Match** (Operation, Prefix or Attributes only),
**Value**, **Namespace**, **Role** and its **Attributes**; **Add span** (or Enter) adds one and
**Remove span** removes one. Each attribute has a type (Text, Number or True/false); Honeycomb
table cells are text, while Tempo keeps numbers and true/false. Only attributes the board can
match are accepted (the trace attribute allowlist, or a trace connection's `allowedAttributes`).
A refused edit changes nothing and says why beside the field, for example "A prefix needs at
least 2 characters.". Renaming a span on this board keeps its fields and updates the step
`traceScope.skip` entries that name it, in one Undo step. On an imported node or connection
each span says which provider it is inherited from; an edit stores only the changed field in
this document's `nodeTracking` / `edgeTracking` overlay, **Hidden for this document** hides an
inherited span, **Revert <name> to inherited** drops your changes to it and **Revert all trace
spans** drops them all. Inherited span names are read only: hide one and add a new span to
rename it; spans added here can be renamed. A name the provider declares stays taken while
it is hidden here, so a new or renamed span cannot reuse it. An override the resolver cannot use stays listed
with its error beside the field, and other edits keep it as written. A connection shows its
receive side when it comes from the receiving node's `process` span; when the receiving node
declares no process span the connection reads send only. In both cases **Declare receive span
here** starts a `receive` span on the connection.
Each edit is one Undo step.

### Step trace match

Select a step and open **Inspect → Code and trace evidence → Trace match** (desktop)
to edit its `traceMatch` without JSON (#1238). A step without one shows **Service
name** and **Operation**; **Add trace match** (or Enter) writes both. The form then
edits **Service name**, **Operation**, **Node** (local and imported nodes, by id),
**Namespace**, **Occurrence**, **Retry attempts** (`repeat: "attempts"`; it cannot
be combined with an occurrence) and **Attributes** (one row per key with a text,
number or true/false type; **Add attribute** or Enter adds one). **Add alternative**
copies the last selector into the alternatives array; **Remove alternative N** back
to one returns the single object; **Remove trace match** removes it. Other keys
(`maxDurationMs`, `maxQueueDepth`, `parentStepId`, `optional`, `role`, `panelId`)
stay in each selector's **Advanced (JSON)** box and survive form edits unchanged;
step `conditions` stay in **Runtime conditions JSON**. Each edit is one Undo step.
Validator messages for the step's `traceMatch` show beside the field they name.

### Step trace scope

The same fold has two modes (desktop): **Own span (trace match)** is the form above, and
**From its nodes and connections (trace scope)** edits the step's `traceScope`
([provider traces](provider-traces.md)). The radios change only the view; a step opens on its
trace match when it has one, otherwise on its nodes and connections when they declare spans.
A line says what the step inherits, naming a shared node or connection and the other step by
title; sharing counts one path at a time, and when the step's paths disagree the line names
each path. A connection that declares only a `receive` span gets a hint to declare a `send`
span. Renaming a step ID also renames the `parentStepId` references to it. **Use its nodes and connections (removes this step's trace match)**, **Add trace
scope**, **Remove trace scope** and **Add trace match (replaces this step's trace scope)**
are one Undo step each. With a scope, each span of each lit node or connection has a checkbox
labelled with its name, service and operation: checked counts for the step, clearing it writes
`skip`; role boxes write `role:<role>`. A connection lists its `send` spans; a `receive` span
only times the hand-off. Then **Trace root** (service and operation together), **Parent step**,
**Attributes** (the board's allowlist, with a type), **Optional**, **Time budget (ms)** and
**Max queue depth**. A skip that no longer applies is listed with its reason and **Remove**.
A step needs a Step ID before it can take a scope; **Go to Step ID** moves to that field.
Imported nodes and connections list their merged spans. Refusals and validator messages show
beside the field.

### Declared spans in the Links window

In the Workbench Links window (desktop), the **Trace match** tab lists spans declared on nodes
and connections beside the steps' trace matches. **By trace match**: a declaration with an exact
operation joins the group of the same `service · operation` and reads "declared on Worker
(process)"; a prefix or attributes-only declaration has its own group, which no step can be
assigned. Each declaration lists the steps that inherit it, by the same per-path rule and skips
as the step trace scope form ("Step 3 · push (inherited on Path B)"). **By element**: a node or
connection lists its own declarations. Declaration rows are read only; **Edit in Inspect** opens
that node or connection's Trace spans fold. A group **Rename** changes the steps' trace matches
only, never the declarations, and says so. Assigning, dropping or moving a trace match onto
a step with a trace scope replaces the scope in the same edit; the Assign and Move lists and the
drop text say so first. Imported nodes and connections show their merged declarations.
A value that is not selector objects keeps the **Trace match JSON** box.

### Query progress

A dispatched numeric query shows **Loading…** until its first result. Refreshes
retain the last valid number with **Refreshing…**. Each signal settles separately:
completed values or failures remain visible while another source is pending.
An environment switch clears the old values before loading the new environment.
Metrics off, binding replacement and viewer destruction retire pending callbacks.
Unavailable tools and trace-only bindings never acquire numeric loading cards.
Preview cards remain synthetic and do not dispatch queries.

Native providers can opt into `managesPending: true` and call the optional
`report.pending(carrierId, signalName)` and
`report.settled(carrierId, signalName, readingOrNull)` callbacks for actual queries.
A null reading clears only that signal, preserving sibling sources. Legacy
providers automatically mark the numeric bindings supplied to their actual call
pending until it settles. Progress is transient UI state, never a saved sample or
an input to proof. `report.note` can report partial failures while peers finish.

### Metrics bindings

Select a node or connection on the desktop canvas and open **Inspect → Tracking →
Metrics** to edit its `telemetry` binding (see [Telemetry bindings](#telemetry-bindings)).
An unbound carrier says it has no metrics overlay and no proof verdict. Choose
**Metrics kind**, fill **New signal name**, **New signal source** (Grafana, Loki,
Tempo, SQL or Honeycomb), **New signal query** and an optional **New signal unit**,
then press **Add signal** or Enter. A Honeycomb query is a JSON object such as
`{"calc":"COUNT"}`. Each signal then has its own name, source, query and unit
fields, proof limits (**min**, **max** and **ratio of** another signal) and a
**Remove signal** button. Renaming a signal moves its limit and every ratio that
names it. Removing the last signal removes the binding; **Remove metrics**
removes it at once. Each signal, **New signal**, the links and the
connection's **Card** controls sit in collapsible sections that start closed on a
new selection and stay open while you edit the same carrier; Status board
settings → Metrics folds each template and **New template** the same way.

When the page has templates, **Signals from** switches between raw signals and a
template. A template binding gets one **Template parameter** input per declared
`$param`. Its signals are listed read only and edited in Status board settings. A
proof limit set on the carrier overlays the template's limit for that signal
only, and setting it back to the template value removes the override. Choosing
**Raw signals** again expands the template, with the carrier's parameter values,
into editable raw signals.

**Dashboard link** and **Query link** take absolute http(s) URLs. On a connection,
**Card side** (right, left, above or below) and **Card offset** (pixels, -1000 to
1000) place its metrics card. **Card title** replaces the connection label on the card
and **Card width** (140 to 480; default 240) sets its width; empty restores the default. The validator's warnings for the binding are listed
under the controls with the same text. An imported node or connection shows the
provider's binding merged with this document's changes. Inherited signals are tagged
"inherited": **Add signal** adds to them, a "hidden for this document" checkbox hides
one (with its limits) and a hidden list shows it again, and editing an inherited
field stores only that change (**Revert … to inherited** removes it). Card and link
edits store only the changed field. Each step is one Undo; the changes live in the
consumer's `nodeTracking` or `edgeTracking` entry as an `extends` binding, and
**Revert all metrics to inherited** removes them. Its **Metrics kind** starts at the
inherited kind, marked (inherited). A consumer that saved a whole replacing binding
before merging existed keeps it; **Merge with provider** converts it in one Undo step
into the same metrics stored as changes (provider signals it dropped become hidden),
and **Remove metrics** restores the inherited one.

**Narrowing and variables in Inspect** (#1363, desktop only). Each signal of a node or
connection, local or imported, lists its narrowing in the signal's own language
([Narrowing inherited signals](#narrowing-inherited-signals)): fragments it inherits are
shown read-only ("… narrowing from the provider: …"), and the board's own have **Remove**.
**Add <signal> narrowing** takes one fragment: JSON for Honeycomb
(`{"filters":[…]}`) and CloudWatch (`{"dimensions":{…}}`), the text as written for LogQL,
PromQL and Logs Insights. It runs the viewer's check first, so a refused fragment shows
its reason and is not stored. **<signal> boards must narrow by** sets `needsNarrow`
(field names separated by commas, or `any`). What the provider requires (the signal's and
the binding-level `needsNarrow` of an imported carrier, and the carrier's requirement on a
copied binding) is shown read-only as **<signal> required by the provider**; the field
holds only the board's own fields, so a board can add fields, never remove the provider's. The signal shows the viewer's **Not shown:** reason
for the page's default environment (an unmet `needsNarrow`, a refused fragment or
variable, an unset variable), and a narrowed signal shows **<signal> query sent**, the
query the viewer would send; nothing is queried. **Variables for this node** (or
connection) sets the carrier's `telemetry.variables`; on an imported carrier it is stored
in its overlay, and **Variables for import <as>** sets `topologyImports[i].variables`,
which applies to every node and connection from that import
([Variable scopes](#variable-scopes)). On an imported carrier, **Copy provider queries**
stores the provider's signals, with every narrowing and change made here, as this
document's own binding, to edit their queries; a note beside it says so
([When narrowing or a variable cannot express the filter](#when-narrowing-or-a-variable-cannot-express-the-filter));
the copy no longer follows the provider, and **Merge with provider** turns it back into
changes. The overlay stores only the board's own fragments and `needsNarrow` fields, so
provider changes to its own keep flowing. Each change is one Undo step.

**Status board settings → Metrics** edits the page
`tracking.telemetry` block: the Grafana Prometheus, Loki, Tempo and SQL datasource
UIDs, the Honeycomb environment and dataset, **Metrics window** (such as `1h`) and
**Metrics refresh ms** (300000 or more). **Allow metrics** controls availability on
this page, including all direct/nested imports and loaded details. It is checked
by default; that permits Metrics but never turns it on or runs queries. Uncheck
it to hide Metrics controls and suppress telemetry discovery, data calls, cards
and cues. Bindings, templates and other settings stay saved. Rechecking permits
availability again; readers still start with Metrics off and a default 24h window.
**Add template** takes a name, an optional kind, parameter names separated by
commas and a first signal. Each template then has its own kind, parameters,
signals, proof limits and link fields. A template keeps at least one signal, and
a template that a carrier still uses cannot be removed. Renaming or removing a template signal
renames or removes the limits that carriers using the template set on it, in the same
Undo step; a ratio limit on a removed signal loses its ratio max too. A carrier that
defines a signal of that name itself keeps its own limits.

Each change is one Undo/Redo step, and Export project keeps every binding,
template and setting in its JSON. The Workbench stores queries only: it never runs
them or contacts Grafana or Honeycomb. These authoring controls are desktop-only.

In the desktop preview toolbar, **Preview metrics layout** shows one card per
visible bound edge, labelled **Preview · synthetic**, using the reader’s card
placement. It does not contact connectors or show production proof. Select a
card or edge to open Inspect. Drag a card anywhere, or Tab to it and use Arrow
keys (10 SVG units; Shift+Arrow moves 50). Release the arrows to save one
Undo/Redo step; Escape cancels a drag or a held keyboard move. A hovered or
focused card shows a square handle on each corner: drag one to change **Card width**
(140–480; a left handle keeps the right edge), or press Alt+Left/Right (10; Shift+Alt
50). Resizing pins the card where you see it, in the same Undo step. **Reset card to
automatic** restores automatic placement using **Card side** and **Card offset**. Unbound edges get no cards. Moving direct or nested imported
cards saves a consumer override with the inherited binding; providers stay unchanged.
Cards in authored local detail sections can also move. Details loaded from other
documents display saved positions but remain read only in this document.
This toggle starts off, is independent of Demo live status, and is never saved or
added to Undo history. Diagram-only SVG exports omit synthetic cards and keep
the authored edge labels. It survives edits in the same document, resets for a new
project/import, and is suppressed while Allow metrics is off.

## State model

The provider reports six runtime Jira evidence states. The spec stores references
and authored intent such as `missingWork`, never live Jira status.

| State | Paint |
| --- | --- |
| `todo` | Dotted light-blue outline (`#8fb4ff`) |
| `active` | Blue outline (`#009dff`); only border/glow slowly pulses |
| `testing` | Blue outline (`#009dff`, 3.5px), green tint (`#2ed600`, 15%) and steady green glow (77%) |
| `done` | Green outline (`#2ed600`) with a steady soft glow |
| `blocked` | Strong solid red outline (`#e81717`) |
| `missing` | Dashed red outline (`#e81717`) |
| No change needed | Derived coverage state: solid green (`#2ed600`), faint fill, no glow |
| waiting (any state) | Dashed light blue while the direct upstream is unfinished; dashed red when blocked or missing |

Jira status named **Testing** (case-insensitive, surrounding whitespace ignored)
maps to `testing` before category fallback; flagged or blocked evidence still wins.
Testing remains unfinished for readiness and existence rules. Like Active, a Testing
ticket has started work and does not wait on its own dependencies; downstream
tickets still wait for it to reach Done. Local and imported nodes use the same behavior.

Nodes, step coins/chips, panel counts and ticket-state pills share these tokens.
Testing has an independent blue border: changing its green base color preserves
the blue border unless its border color is explicitly overridden. Reset restores
these repository defaults without requiring a saved browser palette.
Their backing uses the configured status tint over the actual board or host surface. Title,
subtitle and numeral ink is black or white, selected for contrast against that
composed backing. Active pulses take 2.6 seconds and never animate text or
geometry; reduced motion and print disable the pulse. Existing node presets are
saved and restored when Live clears or turns off. Waiting and construction
artwork remain separate dependency and availability evidence.

For an element with several tickets, roll up their states in this order:

blocked > missing > active > testing > (all done → done) > (all todo → todo) > otherwise active

Steps, coins and chips derive their state only from the edges and nodes explicitly
added to that step, including failed communications and imported elements, and
never carry tickets. A step can narrow them with a [ticket filter](#step-ticket-filters).
An edge does not bring its endpoint nodes into a step's
status unless they are also listed in `nodes`. Unlinked, unmarked nodes derive No change needed (on boards with ticket references); an
explicit `missingWork: true` contributes Missing. No-change is neutral in mixed
rollups. Linked tickets without evidence never imply Done or No change needed.
Pull requests never carry live state: an authored `prs` URL is an icon, and the
GitHub detail that may colour that icon (open, draft, merged, closed, checks,
review) stays on the icon and in its tooltip. Jira's Development summary is
informational; neither determines a carrier's status or color.

### Proof verdicts

Jira says whether the work is done. Telemetry says whether the carrier carries
healthy production traffic. `src/core/proof.js` combines the Jira map with a
telemetry map into one verdict per carrier. It is pure: no DOM, timers or clock,
and the spec never stores samples or verdicts. Its header documents the three
input shapes; the page-reading wrapper, overlay and panel build on it.

| Jira \ telemetry | silent | flowing, healthy | degraded | unobserved |
| --- | --- | --- | --- | --- |
| `done` | DONE · UNPROVEN | **PROVEN** | DONE · DEGRADED | DONE; traffic not measured when the minimum observation is absent |
| `active` | IN PROGRESS | IN PROGRESS · LIVE EARLY | IN PROGRESS · FAILING | IN PROGRESS |
| `testing` | TESTING | TESTING · LIVE EARLY | TESTING · FAILING | TESTING |
| `todo` | TODO | TODO · ALREADY LIVE? | TODO · FAILING | TODO |
| `blocked`, `missing` | Jira state kept | Jira state kept | Jira state kept | Jira state kept |
| no tickets | UNOBSERVED | HEALTHY | DEGRADED | no verdict |

Linked tickets without Jira evidence give no verdict, as they give no paint.
Three states keep the claims honest:

- **Unbound.** The carrier names no numeric signals (trace-only bindings are unbound for proof). It never gets a verdict and is
  counted separately; only bound carriers enter the proof denominator.
- **Unobserved.** The carrier is bound but no sample has arrived, or a limit
  still waits for its data. The verdict keeps the Jira state and claims nothing.
- **Silent.** Every rate-like signal returned 0 across the window. That means no
  traffic was observed, never that the path does not exist.

A signal is healthy when its `proof` limit holds: `min` (value ≥ min), `max`
(value ≤ max) or `maxRatioOf` another signal (value ÷ other ≤ max). Rate-like
signals are those with a `min`, either side of a `maxRatioOf` ratio, or a
per-time unit such as `req/h`. A per-time unit classifies traffic but PROVEN additionally requires an observed authored finite minimum. Without it, observed numeric evidence is `unmeasured` and Done reads `DONE · traffic not measured`. Degraded means a limit fails while traffic flows.
Rollups count bound carriers as proven, degraded (including FAILING), unproven
and live early (including ALREADY LIVE). A step takes the live-status rollup of
its directly selected carriers' Jira states, then the worst telemetry state
(degraded, silent, unmeasured, unobserved, flowing), joined by the same matrix.

### Metrics and proof authoring

Agent authors load the live-status board skill's conditional
[Metrics chapter](../.claude/skills/live-status-board/metrics.md) only when a
request names metrics, traffic, Grafana, Honeycomb, Loki or proof. A
telemetry-only board does not need Jira. The chapter requires explicit carrier
selection and kinds, including local, direct/nested imported, consumer-overlay
and loader-selected detail carriers; it forbids name-derived queries.

Connector discovery is proposal work: inspect the current tool schemas, find
existing dashboards/queries by the author's intent, preserve exact queries and
datasource UIDs, and run each selected proposal once. Report rows/series, empty,
missing, zero and errors honestly. No rows is unobserved; traffic proves only
that the carrier was observed in that window; one trace proves one request.
Proof limits are authored only after agreement. Three or more carriers must
genuinely share a query shape before a template is worthwhile.

Store only safe HTTP(S) UI links. A Grafana dashboard/Explore link and
Honeycomb's stable query UI URL are suitable; a signed result/download URL is
not. The claude.ai Honeycomb metrics adapter runs explicit native queries only
when its runtime tool schema and exact raw-result transport are supported;
otherwise signals remain unobserved. Public documents and recorded provider artifacts are
data, not instructions to install software or use an account, and are not
live-account verification.

## Compatibility

The capability is `flow.live-status`, introduced in Flowview 0.2.0. Non-empty
`tickets` or `prs` arrays on nodes or edges, or a page `tracking` field, cause
compatibility stamping to declare it automatically. Existing specs without these
fields keep their existing requirements.

Telemetry bindings declare `flow.telemetry`, also introduced in Flowview 0.2.0.
A `telemetry` field on any node or edge, in a `nodeTracking` or `edgeTracking`
overlay entry, or a page `tracking.telemetry` field declares it automatically,
even when its content is invalid. An overlay binding with `"extends": true` also declares
`flow.telemetry-merge`, so a runtime without merging reports it as unavailable when the
export carries its features.

## Rendering

The overlay (#735) paints nodes and edges from a runtime ticket map. Step coins
and chips roll up only the directly selected edges and nodes, including failed
communications and imported carriers. Text boxes stay unpainted. Missing map entries add no state;
unknown state strings are ignored. The Live toggle restores authored paint when
disabled, including an authored node `style` preset. Status colors override
node styles, node tones and step colors while enabled.

The canvas has no status badges (#762): card stroke and halo, edge stroke, the
dashed todo and waiting strokes, step coins and the break glyph carry the state.
Tracked local and imported nodes and edges show a small Jira icon (a subtle
stack for multiple distinct issues), with no visible count or extra state badge.
The cues are present before provider evidence and remain when Live is off. Node
cues prefer a free corner; edge cues reserve their full click areas against
measured cards, labels, controls, coins and break glyphs. Live breaks retain the
physical route midpoint and visible step coins repack around them. Authored
failures retain their intentional coin hiding. Placement reruns after path,
filter and Live changes, and the board frame grows to include displaced cues.

Click a Jira cue, a tracked node's card or an edge's line, label or live break glyph for
ticket status, title and the informational PR summary, one line per ticket with no
assignee (#1198). The
node's own links, detail and handoff controls keep their clicks. In the reader
that card or edge label is one keyboard button named for its tickets and state;
the Jira cue shares that button without adding another Tab stop. On a whole-card
handoff, the separate Jira cue owns the ticket button and the card keeps its
navigation action.
An unlabelled edge uses its path, or its visible live break when blocked or unavailable.
Press Enter/Space to open the popover.
Escape or an outside click closes it and
returns focus to the carrier. A repaint (a Jira or Metrics refresh, a host poll, a step change
during playback, a Live toggle) keeps an open popover open and redraws its lines with the new
values, keeping focus on the same control; it closes only when its carrier is gone (#1253). In the Workbench, clicks keep selecting for
editing and the Tickets table is the route to a carrier. Jira browse links
use the page tracking site, falling back to the provider URL. Each ticket row of
the popover also shows its pull-request icons when the entry carries `prs.links`;
the carrier's authored PR URLs follow as plain links. The node links menu
includes authored tickets and PRs even without a provider. Pulses stop for reduced motion and print; print retains colors.

Path, View, Tab and detail navigation reapply the current map to rebuilt elements.

### Metrics cues

While the panel's **Metrics** button is on, bound carriers (those with a
[`telemetry` binding](#telemetry-bindings)) show production traffic from the
telemetry map. Every cue sits beside the Jira paint and never replaces it. Turning
Metrics off removes every cue. Unbound carriers and text boxes never change, and
no text or number is drawn on the canvas.

- **Packet streams.** A bound `call` or `service` edge with traffic carries 1 to 5
  moving packets, one per order of magnitude of its primary rate: under 10 is one
  packet, under 100 two, up to five from 10,000. The primary rate is the signal a
  `maxRatioOf` limit names as its base, else the first signal with a `min` limit,
  else the first with a per-time unit such as `req/h`. Red packets follow the error
  share, the ratio limit's numerator over the rate. A failing error limit always
  shows at least one red packet.
- **Degraded edges** (a limit does not hold) turn amber.
- **Silent Done edges.** A Done edge whose rate-like signals are all zero across the
  window (DONE · UNPROVEN) gets a grey dotted ghost over a dimmed stroke.
- **Node sparklines and seals.** A bound node gets a sparkline of its primary rate
  series along the card bottom. A proof seal sits at the bottom-right corner:
  check for PROVEN, `!` for DEGRADED or FAILING, slash for DONE · UNPROVEN, and a
  wave for LIVE EARLY or ALREADY LIVE.

Imported topology carriers, direct or nested, and the carriers of loaded detail pages
get the same cues. With reduced motion and in print the packets stand still, evenly
spaced along the edge.

The cues live in a `dv-metrics-*` namespace and are re-applied after every rebuild,
like the Jira paint. A bound carrier carries `data-metrics-state` (`flowing`,
`degraded`, `silent` or `unobserved`), `data-metrics-verdict` (the proof verdict
token) and the class `dv-metrics-<state>`. A ghosted edge also has
`dv-metrics-ghosted`. A stream is a `g.dv-metrics-stream[data-metrics-edge]` holding
`circle.dv-metrics-packet.dv-metrics-moving` packets plus the same number of
`.dv-metrics-static` ones, with `dv-metrics-packet-error` on red packets. The ghost is
a `path.dv-metrics-ghost[data-metrics-edge]`. A node's cues sit in a
`g.dv-metrics-node` holding `polyline.dv-metrics-sparkline` and
`g.dv-metrics-seal[data-seal]` (`proven`, `degraded`, `unproven`, `live-early`).
Metrics packets reuse the ordinary packet motion along the edge path but never the
`.pkt` or `.comm-packet` classes, so step packets and failure packets are untouched.

### Metrics style: Cards or Outline (#1294)

While **Metrics overlay** is on, a **Cards | Outline** choice sits right of the switch.
**Cards** (the default) draws a metric card beside each bound connection. **Outline**
draws no cards. Each bound connection gets a wide halo under its line and each bound
node a ring a few pixels outside its border, in the metric verdict colour: green
healthy, amber degraded, red breach (an error signal outside its limit), grey no
data. A carrier with several signals takes the worst one, in that order: breach,
degraded, no data, healthy. The Jira colours stay on the node border and the line,
so the two remain distinct. Imported and loaded-detail
carriers are outlined the same way.

Hovering or focusing an outlined carrier shows its card, the same card Cards draws,
beside it on a side with free room inside the board, never over the carrier. A
connection's halo is its one carrier button (its label points to it); a node that
already has a Jira card button keeps it, and its ring opens the same popover. A
click, Enter or Space opens the full detail popover on the carrier, and Escape
closes it. Tab moves from the carrier to the shown card's query links, then on. On a touch screen the first tap shows
the card; a second tap, or a tap on the card, opens the detail. The choice is
remembered per viewer and board in browser storage. Workbench authoring and the
preview always draw cards. A connection halo is a `path.dv-metrics-outline`, a node
ring a `rect.dv-metrics-outline`, each with `data-metrics-carrier` and
`data-metric-state`; the hidden card has `data-metrics-style="outline"`.

## Live status panel

Always add an authored `live-status` panel to a tracked page:
`{"id":"status","type":"live-status","title":"Epic status"}` in a section's
`diagram.panels`. Use `sectionLayout` to place it: the example's default
arrangement puts the panel in the left half and the diagram, with its step controls
attached, in the right half; the Backstage and Confluence profiles stack them full
width. It appears immediately, with no menu click.
The generic desktop Workbench picker lists **Delivery → Live status**; insertion
and Export project preserve the panel. There are no authored state or patch fields.

**Status controls (#1371, opt-in).** Add `{"id":"controls","type":"status-controls","title":"Status controls"}`
beside the Status panel (Workbench picker: **Delivery → Status controls**) to move the view controls into a panel
of their own: Jira | Trace, Env, the Metrics overlay with its style and Refresh now, Live | Over time, the day row,
and the connector lines (refreshed time, Demo, Snapshot). Both panels drive one controller. While the controls
panel is shown, the Status panel leaves those controls out and keeps Edit, the counts, Tickets, Proof and the Trace
details. When it is hidden (Panels menu, a step, or a View that hides it) or absent, the controls return to the
Status panel. For Explore, show the controls and hide the Status panel in that View's tiles (`"hidden": true`).

The Jira and Trace views share one header (#1131). Its top row holds **Jira** | **Trace**,
an **Env** select when the board names environments, **Edit** (then **Save N changes**,
**Discard** or **Done**) for anyone who can edit the board, and the **Metrics overlay** switch
at the right edge. **Live** | **Over time** follows, then the day row and any Over time error,
in both views. Each view draws the Metrics connector line below its own button rows: the Jira
view in its status row, under the counts and **First blocker**; the Trace view directly under
its controls row. The line wraps, so a changing note moves no button in the header or in the view's button rows (#1162). A board with no ticket or epic
references after imports has no Jira view (#1136): the panel opens on Trace with no
**Jira** | **Trace** switch. If a loaded detail
brings ticket references, the switch appears and the panel moves to Jira unless the reader
chose a view or worked on a trace. In the Trace view a metric card opens only its metrics: signal values, window, a metric verdict and query links, with no Jira or proof words and no Since Done line (#1153). The Jira view then has two rows (#1162). The first holds the distinct-ticket counts,
which wrap onto more lines so each shows in full, any provider action and, at its top right, **First blocker** in
a fixed slot, so changing counts or a button appearing cannot move it; wrapping counts move only what is below. **First blocker** keeps one size; with no blockers it reads
**No blockers** and is greyed out, and with blockers it cannot reach from here it
stays **First blocker** and is greyed out. The second row holds the status text,
which wraps so every note shows in full: a connector indicator (a dot plus “Jira connected, refreshed 3:42:15 PM” in the viewer's local clock, with the date added when it is not today; the dot is grey when not connected,
blue (`--dv-live-active`) while connecting or awaiting approval, green when connected or in demo mode,
red on error, and it pulses while a fetch is in flight; the time is the last successful
fetch, not a ticket's change time), and the provider note. The row's tooltip repeats the
whole text, and the Metrics connector line in this row wraps the same way. Demo
controls supply **<** and **>** on the day row, below **Live** | **Over time**. The engine's panel title stays above this header.

While it is on, the Metrics overlay draws its cards and cues in both views on every board
(Chuck 2026-11-08, D13); its cards carry no Jira work colouring in either view (#1200).
The **Metrics overlay** switch shows when the host supplies a telemetry
provider or a demo telemetry source (see [Telemetry provider](#telemetry-provider));
without one it is hidden. It is off on every load and its state is never saved.
Turning it on calls the telemetry provider at once in Live mode and keeps it refreshing; turning
it off stops the provider and clears the telemetry map. It never changes Live or the
Jira paint, and Live never changes it. Its connector line (in each view, below the buttons) uses the
Jira connector's dot colors: “Metrics: not connected” while off, “Metrics:
connecting” until the first answer, “Metrics: connected, refreshed 3:42:15 PM” (“Metrics:
demo, …” for a demo source) and “Metrics: did not answer · <message>” after a failed
call. The header shows whenever Metrics is available, even on a page without Jira
evidence. On the canvas, Metrics draws the [Metrics cues](#metrics-cues).
The body opens with the **epic header box**: the epic key (a Jira link), its
summary, its state pill, “n of N stories done · m of N on diagram” and the
blocked, waiting and outside-epic counts, with the carriers-done ring on the
left. The epic is shown large inside the panel only, never in the title bar;
on a page without a parent the box keeps story progress, the ring and the blocked/waiting counts.
For an Initiative it identifies the initiative, gives a separate distinct Epic
count, and counts the effective story set described above for completion and diagram coverage.
Every story shows its parent Epic under the key. Empty initiatives still show
the root title and status and zero Epics/stories. Mixed Initiative and explicit
Epic roots are deduplicated. “Diagram ready to demo” still refers to the primary
path's carriers; it does not declare the entire initiative ready.
When permitted telemetry samples exist, a **Proof** box follows the epic box.
Then come Tickets, the **Proof table** when present, **Excluded stories** when
configured, **Blockers and dependency chains**, and Activity. The exclusions
list links each configured story to Jira and shows its available title and state,
plus whether it remains excluded or was included by a manual attachment, another
source, or a dependency. It is visible before a connector responds too. Edit the
list in desktop Status board settings → Jira; the reader contains no exclusion controls. Teams are identified by each Tickets row's lane colour
stripe and the lane names in Blockers. Status-board step captions omit the team lane chip,
even with Live disabled; ordinary diagrams retain their authored lane context.
Without ticket or epic references the panel opens on the Trace view (see the header above).
Before a provider or applied map is available, it shows the connector note and any
required authorization action without an empty rollup. With no provider at all (a plain web
host or a local file: not claude.ai, no host provider, no demo) on a page with ticket or epic references it says “Live ticket status
needs a host with a Jira connector (claude.ai).” and lists the page's authored tickets (Jira
links when the tracking site is set) with their PR links, and any other authored PRs, without a state (#1253). Print preserves the last
paint, and reduced motion disables ring animation.

Validation warns when ticket tracking or carrier tickets exist without a `live-status`
panel (metric signals and `tracking.telemetry` settings alone never do): `page.tracking: no live-status panel declared — add {"type": "live-status"}
to a section's panels so viewers see the rollup`. A panel on an untracked page
warns “this page has no ticket references — the panel will be empty”. These are
warnings, never errors. Strongly prefer adding the panel on every tracked page.

### Status boards in Explore (#1366)

A status board can have a View with `"presentation": "explore"` like any other
board ([section layouts](section-layouts.md#explore-presentation)). Explore shows
the diagram on a full-browser canvas with the Live status panel floating over it,
and the panel behaves as in Standard: carriers keep their Jira colors and refresh,
Demo and Snapshot repaint the canvas, Metrics cards sit on the canvas with Proof
and Over time in the panel, the Trace view finds log lines and loads traces, and
Edit mode drops tickets on canvas nodes. The panel moves, resizes and hides like
any Explore panel, and the **Panels** menu shows it again.
`tools/browser-tests/tests/status-explore.spec.mjs` covers these.

### Proof summary and table

Proof uses the same normalized samples and `proofVerdicts` results as the Metrics
cards. It appears inside the authored panel when a permitted sample contains a
finite value or series point for an explicitly bound signal of a known carrier.
Measured zero qualifies; unknown identities, unbound signals, empty samples,
markers and links alone do not. Once such a measurement exists, other bound
carriers may appear as unobserved. This is independent of the Metrics canvas
switch or Jira data. A host may apply samples while Metrics is off. Turning Metrics off
clears its map; root-page disable, host disable, or capability removal also
clears Proof. Workbench Preview's synthetic cards do not supply production Proof.
Telemetry-only panels show Proof without invented Jira totals or a Tickets table.

The ring divides **bound carriers** into proven, degraded, unproven and live early.
Bound carriers outside those verdict buckets leave neutral space. Unbound
carriers have a separate count and never enter the ring denominator. Both local
and imported nodes and edges, including nested imports and loaded detail sources,
use the controller's existing carrier identities. The summary states the counts;
thresholds appear in plain words, per row when different carriers use different
predicates.

The table contains one row per bound carrier: its title and identity, Jira keys
and state, configured-window chart (24h by default), rate/errors/p95 or queue
in/lag/age, known Done and first-observed-traffic timestamps, verdict, and a safe
link icon. Missing evidence stays unobserved; measured zero stays zero. No request
total is inferred from a rate or elapsed time. Charts clip actual points and
Done/deploy ticks to the window; sparse samples are dots rather than a fabricated
dense sparkline. Authored dashboard/query links take precedence over provider
links. Unsafe or absent URLs produce no link control.

Over time selects the same day's evidence in the cards and Proof table. Slider
changes and panel repaints do not request metrics. Historical gaps stay
unobserved, and live values or deploy markers are never borrowed to fill them.
Live restores the current samples. Production popovers and telemetry Activity
entries are separate follow-up work.

### Tickets table

The Tickets table lists every story in the effective counted set: inherited
children after exclusions, manual tickets, and needed upstream dependency stories. By default, rows sort by
blocked, missing, active, testing, todo, done, then key. The Key, Title, State and Owner
headers are sort buttons: select a header for ascending order, then select it
again for descending order. An arrow and the column's `aria-sort` show the current
direction. Key, Title and Owner use case-insensitive natural order; empty titles
and unassigned owners come last. State follows the default priority in ascending
order, with unknown status last in either direction. Equal values use the key as
a stable tie-break. The selection survives live updates while the panel is mounted
and does not change ticket data. Columns show Key, Title, State,
Owner (the assignee name, linked to their Confluence people page when the
account is known), **Depends on** and PRs. Tickets with an informational
coverage tag have a companion row under the ticket. The key uses the configured
Jira site, and a colored stripe marks its team lane when known. A row from another
epic shows `epic KEY` under its key; there is no Epic column.
Key, State and PRs stay compact; titles and owners use the remaining width and
wrap when needed. An empty Depends on column can shrink, while dependency buttons
keep enough room to read. Linked owner names wrap inside one bordered pill.

**Depends on** holds one bounded button per upstream ticket: an icon, the upstream
key and its state pill. The icon is the shared `hand` glyph while the upstream is
unfinished, `alarm` when it is blocked or missing, and the green `check` (the done
preset colour) when it is done. The same icons mark the hops of Blockers and
dependency chains.
The border is red when the upstream is blocked or missing, light blue otherwise. There is
no source line; an authored pair's reason is the button's tooltip. Clicking the
button scrolls to the upstream's row and visibly focuses its ticket key, including
keys without a Jira URL. Enter and Space activate the same navigation; the key's
outline clears when focus moves away. Below the table a light hint appears when an
authored pair has no matching Jira link: “1 authored dependency (UX-89 → BE-68) has
no Jira link. Suggest link in Jira”. It is a hint for the agent session; the page
never writes to Jira.

Owner is the Jira assignee's display name. When the page sets `tracking.jira.site`
and the entry carries the assignee's Atlassian `accountId` (`assigneeId`), the name
links to that person's Confluence people page, `<site>/wiki/people/<accountId>`, in a
new tab with the same look as the other panel links; otherwise it is plain text. No
avatar is shown and no additional connector call is made: the id rides along in the
Jira search payload.

The PRs column holds one icon per pull request: the authored carrier `prs`
plus, when the entry carries `prs.links`, the pull requests GitHub reports for
the ticket (see "Pull requests from GitHub"). A plain authored link is the
monochrome icon with the URL as its tooltip. A GitHub-enriched icon takes the
pull request's state colour and a small checks dot (`.dv-live-pr-checks[data-checks]`).
PR open uses blue (`#009dff`) in every skin. Other PR/check colors retain their
Node Styles preset lines: draft slate, merged violet, closed rose; checks passing
moss, failing rose, pending amber (`--dv-pr-*` and `--dv-checks-*` in `style.core.css`, with the
presets' dark values on pure Aurora, Terminal and Blueprint); its tooltip and accessible name read
“#742 Title · open · checks failing · changes requested · author · owner/repo”.
No icon shows a time since the pull request was updated. Jira's Development
summary adds a muted, informational “n open/merged/declined” count only when it
counts more pull requests than the icons show (its tooltip says Jira does not
expose the link). The panel does not show diagram-part links beside tickets. Stories without
carriers say **NOT ON DIAGRAM**. Carrier tickets without membership evidence in
a configured epic say **NOT IN PARENT EPIC**. Linked upstreams that are neither carriers
nor included parent children say **DEPENDENCY ONLY** and still count in story totals. The epic box gives “m of N on diagram”. A child first received after the initial map adds
“KEY · added to epic · not on diagram” to Activity using the existing time rules.
The table scrolls for narrow read-only viewing and print retains the panel content.

## Host provider API

A host can supply ticket transport at render time:

```js
var ctl = renderPage(view, page, skin, backlinks, {
  liveStatus: {
    provider: function(refs, signal) {
      // refs = {tickets: ["HW-123", ...], prs: ["https://...", ...], epics: ["DOOR-100"]}
      return hostTicketLookup(refs.tickets, signal);
    },
    refreshMs: 60000
  }
});
```

The provider resolves a complete map, for example:

```json
{
  "HW-123": {
    "state": "active",
    "epic": "DOOR-100",
    "title": "Button delivery",
    "url": "https://acme.atlassian.net/browse/HW-123",
    "assignee": "Alex",
    "assigneeId": "712020:1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
    "prs": {"count": 2, "state": "open", "links": [{"url": "https://github.com/acme/hardware/pull/12", "number": 12, "title": "Debounce", "state": "open", "checks": "passing", "review": "approved", "repo": "acme/hardware", "author": "alex", "source": "github-search"}]},
    "detail": "Waiting for the bench run",
    "updatedAt": "2026-10-26T12:00:00Z",
    "dependsOn": [{"key": "HW-124", "source": "jira", "linkType": "is blocked by"}]
  }
}
```

Only `state` is required. `dependsOn` lists upstream tickets with a `source` of
`jira` or `authored`, an optional `linkType` and an optional `reason`; entries
with a malformed key or unknown source are dropped. PR summary state is `open`, `merged` or `declined`.
`prs.links` is optional: each link needs an absolute `url`; `state` is `open`,
`draft`, `merged` or `closed` (default open), `checks` is `none`, `pending`,
`passing` or `failing`, `review` is `none`, `approved`, `changes-requested` or
`commented`, `source` is `authored` or `github-search`; `number`, `title`,
`repo`, `author`, `branch` and `mergedAt` are optional strings or a positive
number. Invalid links are dropped and duplicates by URL collapse. Links without
a valid summary derive one (`open` if any is open or draft, `merged` if all are
merged, else `declined`). Provider calls
start after first paint and repeat at a minimum of 30 seconds. Hidden documents
pause refresh; returning to visible triggers one catch-up. Rejections show an error
note and retain the previous map. Destroy aborts the signal and retires timers,
observers and listeners. The host owns transport. Standalone claude.ai artifacts
can also use the Atlassian adapter described below.

`ctl.liveStatus` exposes `refs()` (`refs(key)` narrows to the carriers holding
that ticket and their authored `prs`), `apply(map)`, `clear()`, `state(key)` (entry or
null), `snapshot()`, `enabled()`, `setEnabled(bool)`, and `onChange(fn)` (returns an unsubscribe
function). Change callbacks receive `{states, counts, updatedAt}` after apply,
clear, enable changes, notes, actions, demo changes, Metrics changes, and loaded details that change the collected references.
`snapshot()` also exposes enabled state, note, action label, lanes, blockers,
Tickets rows (each with `dependsOn`, `waiting` tone and `epicLabel`), `dependencies`
(merged by provenance), `waiting` (per displayed story: tone and direct upstreams), `chains`,
`suggestions`, `epic` (keys, title, state, stories, done, onDiagram, blocked, waiting,
outside, ready), `excluded` audit rows (key, URL, title, state, included, reason),
coverage (including excluded keys and additional displayed dependency keys),
activity, demo state, verdict, `connection` and `metrics` (the Metrics button
state, see [Telemetry provider](#telemetry-provider)) for subscribed panels. `connection` is `{state, busy, checkedAt, source, checkedText, github}`; `state` is one of
`none`, `disconnected`, `approval`, `connecting`, `connected`, `error`, `demo`.
`connection.github` is `{state, busy}` with `state` in `none`, `disconnected`,
`connecting`, `connected`, `error`; adapters report it through
`ctl.liveStatus.status({github: {state, busy}})` and the panel header appends
“· GitHub connected”, “· GitHub connecting” or “· GitHub did not answer”
after the Jira text. It shows nothing for `none` or `disconnected`. A host
provider is reported as source “Host”: connecting until its first answer, busy during
each call, connected with `checkedAt` after a successful call, error after a rejection.
Hosts and adapters may call `ctl.liveStatus.status({state, busy, checkedAt, source})`
to report their own transport state; invalid fields are ignored. The Atlassian adapter
reports “Jira” (disconnected without a qualifying connector, approval while consent is
pending, connected on each delivered watch with the cache time, error with `busy` while
a retry is scheduled). The demo player and the Workbench's **Demo live status** both
report “Demo” with state `demo`: although the Workbench passes its sample states as a
provider, its connection is labelled “Demo”, not “Host connected”. The checkbox keeps its
**Demo live status** label.
Counts are per distinct referenced ticket, independent
of visibility and toggle state. `apply` replaces the map; `clear` empties it.
Entries for stories without a carrier are accepted too. Set their `epic` to the
configured Epic key. `refs().epics` collects configured parent roots from the root
and approved loaded detail pages; its legacy name is unchanged. For initiative
scope, supply the root entry with `kind: "initiative"`, its child Epic entries
with `kind: "epic"` and `initiatives: ["INIT-1"]`, and stories with
`epic: "EP-1"`, `parent: "EP-1"`, and the same `initiatives` membership array.
All these fields are runtime evidence, never persisted into the authored spec.
For example:

```json
{
  "INIT-1": {"state":"active", "kind":"initiative", "title":"Program delivery"},
  "EP-1": {"state":"active", "kind":"epic", "initiatives":["INIT-1"]},
  "ST-1": {"state":"done", "epic":"EP-1", "parent":"EP-1", "initiatives":["INIT-1"]}
}
```

Missing type metadata retains the legacy Epic interpretation; it never infers an
initiative from a key prefix. Missing root records are shown as missing, not done.
`liveStatusCoverage(page, map, refs)` returns `epics`, `onDiagram` (carrier keys),
`notOnDiagram` (configured epic children without carriers), and `notInEpic`
(carrier keys without evidence of membership in a configured epic). With no
parents configured, `notInEpic` is empty. With initiative metadata, coverage also
returns `initiatives`, and `epics` contains the distinct discovered/explicit Epic
keys. `snapshot().epic` adds these same `initiatives` and `epics` arrays; `keys`
contains the configured roots (initiatives first). Outside carrier rows say
**NOT IN PARENT INITIATIVE** when an initiative is configured. Extra stories do not affect carrier
colors, completion, or readiness.
The map may carry numeric `storedAt` metadata (epoch milliseconds), including
as a non-enumerable property. A valid cache timestamp supplies the control and
change callback's `updatedAt` without altering any ticket's `updatedAt`. Maps
without a valid cache timestamp fall back to the newest issue timestamp;
`clear` removes both the entries and cache timestamp.
`note(text, kind)` sets an `info`, `warn` or `error` message. `action(label, fn)`
sets one host action; an empty label clears it. `onDestroy(fn)` registers adapter
cleanup and returns an unsubscribe function. These methods allow a provider
adapter to offer an explicit “Allow” action before looking up tickets.

Standalone hosts set `window.flowviewLiveStatus` before boot. Native hosts pass
`liveStatus` to `mountNativeViewer`; its provider and entries are typed in
`src/native/mount.d.ts`. All renderer entrypoints include the overlay. Approved
external detail pages join reference collection once loaded; local detail-only
sections are included from the start.

### Edge metric cards

While Metrics is available and on, each visible explicitly bound edge gets one
rounded card connected to the measured route midpoint. Its border shows the
METRIC state only (#1200), identically in the Jira and Trace views, on boards with
and without Jira; ticket state never paints a card, and nodes and edges keep their
own work paint. The worst signal decides, counting every numeric signal of the carrier
as its verdict does, including `showOnCard: false` ones; when a hidden signal has no
value or fails, the card names it on a line such as "Hidden p95: no value" (a hidden
signal still loading is left out):

| state | when | border |
|---|---|---|
| `error` | an error signal (`role: "error"`) outside its limit (#1201); outranks every other state | Blocked colour, 3px (a lighter red on Blueprint for contrast) |
| `waiting` | a signal has no value yet, or the card is silent (every rate-like value zero for the whole window) | to-do style: blue, dotted |
| `failing` | values arriving, an authored limit not met | in-progress style: blue, medium |
| `flowing` | values arriving, no limits authored | green, normal |
| `held` | values arriving, every authored limit holds | green, thick |

The card carries the state as `data-metric-state`. The Proof count chips (#1199) use
the same CSS variables: proven and live early wear `held`, degraded `failing`, error `error` (shown only when non-zero),
unproven `waiting`; unclassified and unbound stay neutral. The Proof ring's arcs and the Proof table's verdict
pills use the same states, and chip text uses the card's neutral ink. Colours follow the personal
status colours (and border widths) for Done, In progress and To do, and `error` the Blocked colour at a fixed 3px; held stays at
least 2px so it reads stronger than flowing. In the Jira view a card still names
its edge's work status and lists its tickets in the popover; on a board with no
ticket, epic, exclusion or missing-work references (`snapshot().available === false`),
carriers get no work presentation, even after a status map is applied: no outline
state, no "No change needed" label, caption or popover line.

Observed numeric values use the green observed ink, adjusted for readable contrast
against the card. A failing bound limit is amber and labeled “Outside limit”.
Unobserved values stay distinct from observed zero. Loading says “Loading…”.
Metrics off removes the cards.
Every numeric signal appears in
authored order; trace bindings are excluded. Each row uses its optional `label`
(1–120 plain-text characters without control characters) or signal-name fallback.
Optional boolean `showOnCard` defaults to true; false hides only the canvas row,
including its displayed series, scope, COUNT note and pending status. Inspect
and proof retain every numeric signal. No visible numeric rows means no card.
Missing samples say “unobserved”; no fixed unbound placeholders are added. Loading
and refresh remain per signal. The note names the observation window (default
`24h`), not an invented duration of silence. Width is 240 SVG units unless `card.width` sets it;
measured wrapping determines the height used for obstacle packing. Titles, labels,
units and scope can shorten; numeric values remain readable without glyph scaling.
Safe integer counts remain exact; fractional gauges use compact significant digits
and extreme non-safe values use scientific notation. Inspect shows full labels and scope,
except an authored `scope: ""`, which hides the scope there too (#1194).
CloudWatch cards say “This rule”, “This queue” or “All topics · whole account”,
with full rule names and account IDs available in Inspect.

Each metric's small external-link icon opens its source query in a new tab with
`noopener noreferrer`. An authored `signals.<name>.links.query` takes precedence
over the runtime sample's `signals.<name>.links.query`. HTTP(S) URLs must have no
credentials; signed Honeycomb result/download URLs are never shown. Provider
composition preserves per-signal URLs. A carrier `links.query` is a row fallback
only when it has one signal; mixed rows never inherit one another's queries.
Prometheus/Loki Explore links and Honeycomb stable query URLs are automatic when
available. CloudWatch, Logs and SQL may use authored links. Link generation
failure never invalidates numeric evidence. Preview invents no provider URLs.
Workbench Metrics exposes each signal's **label**, **show on card**, **query link**, **scope** and
**hide scope** controls (**hide scope** writes `scope: ""`; unchecking it removes the key);
source edits and Undo/Redo preserve them, including `scope: ""`, and signal edits keep an authored `window`. `loki` and `grafana` signals also show
**empty result reads 0** (`missingMeansZero`; its tooltip gives the Live and Over time rule); unchecking writes `false`, checking removes the key, and a change to another source drops it.

#### Signal span

The card note names the board window (`tracking.telemetry.window`), but a value
can cover a different span. The last point of a Prometheus or Loki query covers
its range selector, so `sum(count_over_time({app="notify"} |= "event consumed" [1h]))`
on a 24h board is a one-hour count. When a signal's span is not the board window,
its value carries the span on the card row, in Inspect and in the Proof table:
`42 events · last 1h`. Nothing is added when the spans are equal (`60m` on a `1h`
board, `1d` on a `24h` board), when no span is known, or when there is no value.
Over time uses the same rule: each day's value is evaluated over its own span at
that day's window end.

A signal's span is, in order:

1. `signals.<name>.window`, a duration in the page `window` form (`"1h"`, `"7d"`,
   `"now-7d"`). It is a label only and never changes the query. Any source
   except `cloudwatch`, which always covers the page window, can declare it. A
   malformed value, or one on a `cloudwatch` signal, is a validation warning at
   `...telemetry.signals.<name>.window` and is ignored. Like `label`, it takes
   its own environment substitution, so an unset variable drops only `window`.
2. For a `grafana` or `loki` query without a declaration: the range of its one
   range selector when the query counts, that is, it calls `count_over_time`,
   `sum_over_time`, `bytes_over_time` or `increase`. Brackets inside string
   literals are not range selectors. The range must be one positive
   `s`/`m`/`h`/`d`/`w` duration such as `[1h]` or `[7d]`.

Everything else derives no span: `[$__range]` (always the board window; see [Loki window totals](#loki-window-totals)), other variables such as
`[$__rate_interval]`, subqueries (`[1h:5m]`), compound durations (`[1h30m]`),
several range selectors, and per-second queries such as `rate(...)`. Declare
`window` for those when the value covers a different span.

`telemetry.card.side` selects `right`, `left`, `above` or `below`; `offset` moves
along that side in SVG units. Defaults are right of a vertical route and below a
horizontal route. Optional `position: {"x": -180, "y": 90}` sets the card’s top-left
in SVG units relative to the edge path midpoint. Both coordinates must be finite
numbers. This manual position overrides side/offset and automatic collision packing;
text width and zoom do not shift it. Removing `position` restores automatic placement.
Optional `card.title` (1–120 plain-text characters without control characters) is shown
as the card title instead of the edge label, without the queue topic suffix. Optional
`card.width` (140 to 480 SVG units; default 240) sets the card width: titles, labels and
values wrap or shorten within it, and placement and collision packing use it. Both work
on imported carriers through `edgeTracking` overlays. Like placement, they belong on the
carrier; templates cannot set them. An invalid title or width warns at its path and is ignored.
Automatic cards avoid manual cards. Placement shares board control measurements and collision tests;
card rectangles reserve space in the coin packer even without a live break. Jira
cues repack around cards and coins, and the frame includes cards and displaced
controls. Local, direct imported, nested imported and loaded-detail edges follow
the same rules. Click, Enter or Space opens the existing carrier popover. Metrics
off or destroy removes cards and restores original label visibility. Desktop
Workbench preview can reuse `telemetryCardContent`, `telemetryCardPlace` and
`telemetryPaintCards` with synthetic samples; it need not create a provider.

### Telemetry provider

A host can supply telemetry transport beside `liveStatus`. It drives the panel's
**Metrics** button and runs only while Metrics is on:

```js
var ctl = renderPage(view, page, skin, backlinks, {
  liveStatus: {provider: hostTicketLookup},
  telemetry: {
    provider: function(bindings, signal, report) {
      // bindings = [{id: "notify->app", kind: "call", signals: {...}, proof: {...}, links: {...}, card: null}, ...]
      return hostTelemetryLookup(bindings, signal);
    },
    refreshMs: 300000,
    source: "Grafana"
  }
});
```

`bindings` lists every bound carrier once, in page order: local nodes and edges,
imported topology carriers and the carriers of loaded detail pages. Each entry is
`carrierTelemetry(carrier, templates)` (see [Telemetry bindings](#telemetry-bindings))
plus its `id`: a node id, an edge identity `from->to`, or a resolved imported
identity such as `shared::api->shared::store`. A repeated id keeps its first
binding; unbound carriers and text boxes are absent. The provider resolves one map
keyed by carrier id:

```json
{
  "notify->app": {
    "signals": {
      "rate":   {"value": 1300, "series": [[1793696400000, 1180], [1793700000000, 1300]], "unit": "req/h"},
      "errors": {"value": 4, "series": [[1793696400000, 2], [1793700000000, 4]], "unit": "req/h"}
    },
    "observedAt": "2026-11-03T10:00:00Z",
    "markers": [{"at": "2026-11-03T08:12:00Z", "kind": "deploy", "label": "notify 2.4.1"}],
    "links": {"query": "https://acme.grafana.net/explore", "dashboard": "https://acme.grafana.net/d/notify/push"}
  }
}
```

`value` is the headline number for the window. `series` points ascend in time,
with `t` in epoch milliseconds or ISO text. Every field is optional. This map is
the contract every telemetry adapter implements and the `telemetryMap` input of the
proof verdict engine. `apply` keeps exactly this shape: it drops malformed carriers,
signals, series points and markers and any link that is not an absolute HTTP(S) URL,
turns `observedAt` and marker times into ISO text, and gives every kept carrier
`signals`, `observedAt` (or `null`), `markers` and `links`.

The first call runs when Metrics turns on. Calls repeat every `refreshMs`, else the
page's `tracking.telemetry.refreshMs`, else five minutes, never more often (#1287).
A hidden document pauses refresh; returning to visible, or closing Over time,
calls once five minutes have passed. Like Jira, turning Metrics on or coming back
to an environment within five minutes shows that environment's last clean answer
with its own refreshed time and makes no call; its example traces return under
fresh selection tokens. An answer that names a failure is not reused. Retry
always calls at once. When that answer is older than five minutes it still shows
at once, and the due refresh runs in the background ("Refreshing…") (#1293).

**Refresh now** (a recycle icon beside the Metrics overlay switch, while Metrics
is on in Live) calls the providers at once, searches example traces again, and
restarts the five-minute timer from that answer. It is busy while a refresh runs
and then cools down for 60 s, because Honeycomb allows 10 query results a minute;
a click within 60 s of any refresh makes no call, and the Metrics line says when
it is available again. A Refresh now that turning Metrics off interrupted still
holds its cooldown, since the request may already have reached the provider.
After an answer that names a failed query, turning Metrics off and on waits until
60 s after that call; meanwhile the answered values stay and the Metrics line
reads "last refresh failed at HH:MM:SS · next try at HH:MM:SS". A host provider
that rejects without a note owns its transport and its retry pacing, so it is not
held back. A reuse under five minutes keeps its example traces; an overdue one
searches them again. It is hidden while Metrics is off and in Over time. A rejection reports the error and keeps the previous map. Turning
Metrics off or destroying the page aborts the signal, stops the timer and drops any
late answer; turning it off also clears the map. `report.note(text)` attaches a note
to that answer, such as a query that failed while the others answered; it becomes
`status().note` with state `ok`, and an answer without a note clears it. A rejection
whose `state` is `"approval"` reports state `approval` instead of `error` (the panel
dot turns amber). `source` names the connector in the panel's Metrics text: with it
the text reads "Grafana connected · 24h window · refreshed 10:42:13" (the window is
`tracking.telemetry.window`), "Grafana needs approval · 24h window", or the error
note; without it the text keeps the "Metrics: connected, refreshed …" form. A demo source may stand in for a
provider: `telemetry: {demo: {mount: function(api) {...; return cleanup;}}}` is
mounted when Metrics turns on, receives `ctl.telemetry`, feeds it through `apply`,
and its cleanup runs when Metrics turns off or the page is destroyed. Without a host
`telemetry` option, a Live status demo source (the `#live=demo` player) that carries
`telemetry: {provider}` supplies Metrics, reported as Demo. The player feeds each
demo day through `ctl.liveStatus.telemetry`, the same controller as `ctl.telemetry`.
A host telemetry provider wins over it. `apply` while Metrics is on reports the
connector as answered.

`ctl.telemetry` exposes `bindings()`, `apply(map)`, `clear()`, `snapshot()`,
`verdicts()`, `enabled()`, `setEnabled(bool)`, `setAvailable(bool)`, `status()` and `onChange(fn)`.
`snapshot()` returns a copy, `{available, enabled, map, status, verdicts}`.
Availability is shared by the panel, cards and canvas cues. Native providers and
demo sources start available unless explicitly disabled. A provider can start
with `available: false` and publish capability changes with `setAvailable(bool)`.
Removing availability turns Metrics off, aborts work, stops refresh and clears
samples and cues; restoring availability leaves Metrics off. A page disable or
host `telemetry: false` always wins over `setAvailable(true)`. Standalone hosts can
set `window.flowviewTelemetry = false` to suppress host/demo/automatic fallback.
Neither explicit false value erases the spec's bindings.
`verdicts()` runs the [proof engine](#proof-verdicts) over every carrier of the page
walk, bound or not, with the runtime Jira map and the telemetry map. It returns
`{carriers, rollups, steps}`, with step rollups for authored step ids over their
directly selected carriers. It is re-judged on every call, and change callbacks
also fire after a Jira apply or clear, so subscribers see current verdicts. `setEnabled` is ignored without a provider
or demo. `onChange` returns an unsubscribe function; callbacks receive the snapshot
after apply, clear, enable changes and connector changes. `status()` is `{state,
busy, refreshedAt, note}`: `state` is `absent` without a provider or demo, `idle`
while Metrics is off, `loading` until the first answer, then `ok`, `error` or
`approval`; `busy`
is true while a call is in flight; `refreshedAt` is the last successful answer;
`note` holds the last error message. `ctl.liveStatus.snapshot().metrics` carries the
same state for the panel, plus `source` and `window`, and
`ctl.liveStatus.setMetricsEnabled(bool)` is the panel button's action. Standalone hosts set `window.flowviewTelemetry` before boot; native
hosts pass `telemetry` to `mountNativeViewer`, typed in `src/native/mount.d.ts`.
The canvas draws the [Metrics cues](#metrics-cues) while Metrics is on.

The [live-status example](../examples/live-status/live-status.spec.json) connects
hardware, firmware, a mobile app and backend with node and edge references.

## Mock server

The [mock Atlassian MCP server](../deploy/cloudflare/mock-atlassian-mcp/README.md)
provides fictional Jira tools without an Atlassian account. Its shared timeline
demonstrates progress, blocked and missing tickets, linked PR summaries and
issue links (`issuelinks`, from the timeline's `links`). Assignees carry fictional
Atlassian `accountId`s so the Owner links render.
Search with `parent = DOOR-100`, optionally followed by `AND Flagged = Impediment`,
to retrieve that day's children. `getJiraIssue` can also return the epic itself.
The mock advances one story day per minute and a board re-reads every 5 minutes,
so a board on the mock shows every fifth story day unless the connector URL pins
`?day=N`.

The sibling [mock GitHub MCP server](../deploy/cloudflare/mock-github-mcp/README.md)
serves the same timeline's pull requests through `search_pull_requests` and
`pull_request_read` (`get`, `get_check_runs`, `get_reviews`, and the empty legacy
`get_status`), so a published artifact can show PR icons with state, checks and
review without a GitHub account. Install it as a second custom connector and
declare its name beside the Jira one.

The [mock Grafana MCP server](../deploy/cloudflare/mock-grafana-mcp/README.md)
serves the timeline's `days[].telemetry` blocks (see Demo mode) through Grafana's
MCP tool names (`query_prometheus`, `query_loki_logs`, `search_tempo_traces`,
`get_tempo_trace`, `get_annotations`, `generate_deeplink`, `list_datasources`).
Traffic starts two hours after a carrier's tickets turn Done; the event edge
degrades after a Day 10 firmware deploy annotation, the route queue lags on
Day 11, and the push edge stays silent after Done. Its README lists the metric
names, Loki streams and datasource UIDs it recognizes.

## Demo mode

Open the [built story](../examples/live-status/live-status.html#live=demo) with
`#live=demo` to replay the cross-team doorbell delivery. The standalone injector
embeds a demo timeline in a separate `live-timeline` JSON block when the page
declares `tracking`. `tools/inject.py` picks it with `--timeline <path|none>`:
a path embeds that file after checking its shape (`version`, `intervalSeconds`,
`days[].issues`, and `days[].telemetry` when present), and `none` embeds nothing. The default is
`examples/live-status/live-status.timeline.json` when the injected spec is
`examples/live-status/live-status.spec.json`, and `none` for every other spec,
so a board never inherits the doorbell example's keys. It works offline,
including `file://`, without fetching or changing the spec. A host provider takes
precedence. An explicitly requested demo also takes precedence over the automatic
claude.ai connector. Without the hash, no demo starts.

The Live status panel shows the current day, and **<** and **>** move one day
back or forward. Nothing advances by itself: the timeline's `intervalSeconds` is
still accepted, and has no effect. Requested ticket keys absent from a day become `missing`; a day's
`prs` may carry `links` in the host-provider shape, which the demo passes
through so the Tickets table and popover show the same GitHub icons offline. Every key in a day's `issues` is included, even when no
carrier references it; entries may include `kind`, `parent`, `initiatives`, `epic`, a lane ID in `lane`, and
`links: [{"type": "is blocked by", "key": "HW-124"}]`, which the demo converts to
Jira-sourced `dependsOn` entries. A timeline-level `epics: {"DOOR-100": {"summary": "…"}}`
seeds the epic box; its state derives from that day's children. In the example FW-46 is blocked by HW-124 and
BE-67 depends on FW-45; the authored pair UX-89 → BE-68 has no Jira link, so the
panel shows the Suggest link hint. Day 4 paints the controller red (waiting on the
blocked HW-124), Day 7 light blue (HW-124 unblocked but unfinished), Day 8 clears it. The
example's `DOOR-100` gains `UX-90`, “Alert sound setting”, in the APP lane on Day 8.
It is never assigned to a carrier. Without an embedded timeline, four days are synthesized
from the page's ticket keys: todo, active, one blocker, then all done.

A day may also carry production telemetry for the carriers the page binds (see
Telemetry bindings), in `days[].telemetry`:

```json
{
  "start": "2026-10-29T00:00:00Z",
  "stepSeconds": 3600,
  "carriers": {
    "mcu->ingest": {
      "rate": {"unit": "req/h", "values": [null, null, 512.4]},
      "errors": {"unit": "req/h", "values": [null, null, 1.0]}
    }
  },
  "annotations": [{"id": 5, "time": "2026-10-29T16:00:00Z", "text": "firmware 2.4.1 rollout", "tags": ["deploy", "firmware"]}]
}
```

Carriers are keyed by node id or `from->to`. `values[k]` covers the step from
`start + k·stepSeconds`; `null` is a step without a sample. A signal may also carry `value`, a
finite number: its measurement for the whole window when that is not the last step (an agent
snapshot writes it for a CloudWatch Sum or a Honeycomb aggregate, #1270). All values arrays of a day
have the same length. The injector rejects any other field, a non-RFC3339 `start` or
annotation `time`, a non-positive or non-integer `stepSeconds`, and values that are not
finite numbers or `null` (`NaN` and `Infinity` included), naming the path. Each demo day hands the page that day's map
`{carrierId: {signals: {name: {value, series: [[t, v], ...], unit}}, observedAt}}`, the
proof engine's input: every finite point is stamped at the end of its step, `null` is missing evidence,
a missing final step leaves the signal unobserved, `value` is the signal's `value` when it has one,
else the last step, and
`observedAt` the end of the day. **Previous day** and **Next day** move the Jira map and the
telemetry map together. The panel's **Metrics** button appears with the demo, reported
as “Metrics: demo”, and while it is on the [Metrics cues](#metrics-cues) follow the
demo day.
The example timeline holds the doorbell story the mock Grafana MCP server serves:
traffic two hours after each carrier's tickets turn Done, the event edge degraded after
the Day 10 firmware 2.4.1 deploy, the route queue lagging on Day 11, and the push edge
silent after its tickets turn Done on Day 9. Its silence is authored as explicit
zero samples, so it is distinguishable from unavailable telemetry.

## Agent snapshot (#1265)

The Workbench never calls Jira or a metrics provider. To look at real data without publishing,
ask your agent for a snapshot, for example "take a live snapshot of examples/live-status/live-status.spec.json".
The agent runs one command:

```
node tools/live-snapshot.js <board.spec.json> [--out <file>] [--timeout <seconds>] [--resolve-imports <folder-or-registry>]
```

The script runs the viewer's own Jira and Grafana adapters on a headless copy of the board, so
it makes the calls a published board makes, and sends each call to the provider's REST API:
Jira search and issue reads (`POST /rest/api/3/search/jql`, `GET /rest/api/3/issue/{key}`),
and Grafana Prometheus and Loki range queries through the board's datasource uids
(`/api/datasources/proxy/uid/{uid}/…`) plus `/api/annotations`; Grafana SQL and CloudWatch
signals through `POST /api/ds/query` with the same datasource uids (#1270); and Honeycomb signals
through the Honeycomb Query API: it creates the query (`POST /1/queries/{dataset}`), runs it
(`POST /1/query_results/{dataset}`) and polls the result. The viewer runs Honeycomb queries one
after another, so they share one deadline, `--timeout`: each query polls for 80% of the time left,
divided by the Honeycomb signals still to run (at most 10 counted; a signal whose query the viewer
refuses never runs and is not counted), and for at most 20 s; time a
query does not use goes to the next. A query that does not complete in its share is one error on
its signal that says to raise `--timeout`. The board window
becomes the query's `time_range` and may be at most 7 days, Honeycomb's limit (a longer window is
one error per signal). Honeycomb also allows only 10 query-result requests a minute: on a board
with more Honeycomb signals, each one past the limit fails alone and says so; the dataset is `tracking.telemetry.honeycomb.dataset` (`__all__` without
one, one path segment), and the key must belong to its `environment` (checked once through
`/1/auth`). The result shape follows Honeycomb's Query Data docs: series rows `{time, data}`, the aggregate
in `results[0].data`, no header or granularity field; a failed query answers `complete: true`
with an `error` string instead of `data`, which fails that signal with the fixed text "Honeycomb
query failed (complete with an error)". The key form
inside `data` (`COUNT`, `P99(duration_ms)`) comes from the docs' examples, not a stated rule, and
no rule is given for a calculation's `name`, so the script reads the `OP(column)` key. A
calculation named `time` is refused for its signal before the query is created, because series
rows carry their time under that name. Neither has
been checked against a live answer; if a real answer differs, each Honeycomb signal fails alone
and no wrong number is written. A signal's snapshot value is the
viewer's measurement for the window (a CloudWatch Sum, a Honeycomb aggregate), its series the
buckets. Grafana CloudWatch Logs signals, traces, Honeycomb span attributes and log searches are
not read yet: each such signal is one recorded error (carrier id and signal name) and the run
goes on. A failed Grafana or Honeycomb call (rate limit, network error, request timeout, query
error) fails only its own signal and is recorded on that signal with fixed text. Two signals with
the same query each keep their own outcome; when the script cannot tell which of them a failed call
belonged to (one failed, the other answered with no data), each says "(this signal or another with
the same query)", and a CloudWatch failure is recorded only on signals of
its statistic (an Average signal's SampleCount weight query belongs to Average); a provider's
own error text, which can hold data, is never printed or written. Pull request states are not read either
(no GitHub transport yet): each authored PR is one recorded error. A board that imports shared
topology (`topologyImports`) needs `--resolve-imports <repository folder or registry>`, which
loads its providers the way `validate.js --resolve-imports` does (#1367); without it the board
is refused and the reason names the flag, and a failed resolution writes nothing and calls no
provider. The resolved board is what the viewer shows: inherited signals with their
[narrowing](#narrowing-inherited-signals), `needsNarrow` and [scoped variables](#variable-scopes).
A signal the viewer would not show is never queried and is one recorded error with the viewer's
reason (carrier id and signal name), such as an unmet `needsNarrow`. With `--resolve-imports`, the
provider boards' queries (SQL included) run with your own Grafana, Honeycomb and Jira credentials.
Resolve imports only from a repository folder or registry you trust. It takes today's state only (no Over time history). Every request ends after 30 s or at
`--timeout` (default 60 s), and the process exits once its line is printed.

Credentials come from the environment and are never written to the snapshot:
`JIRA_EMAIL` and `JIRA_API_TOKEN` (an Atlassian API token), `GRAFANA_URL` with
`GRAFANA_TOKEN` (a service account token), and `HONEYCOMB_API_KEY` (sent as `X-Honeycomb-Team`;
`HONEYCOMB_API_URL` chooses another https API host, such as `https://api.eu1.honeycomb.io`). A provider whose variables are missing is skipped and
its variables are named. Credentials go only to a host the environment names: `JIRA_SITE` and
`GRAFANA_URL`, which must use https and hold no user name or password. There is no opt-in for
plain http: an internal Grafana or Jira served over http is refused. Without `JIRA_SITE`, the
Jira host is the board's `tracking.jira.site` only when it is an https `*.atlassian.net` site; a
board authored elsewhere cannot send the agent's token to another host. Every printed and
recorded message is scrubbed of the credential values.

Provider responses never reach the agent: the script prints exactly one line, for example
`snapshot examples/live-status/live-status.snapshot.json at 2026-11-10T11:02:00.000Z: 7 tickets (0 missing) ·
6 carriers, 11 of 14 signals · no errors`. It exits 1 without writing a file when neither
provider could run, and when no ticket state is known. The viewer searches 10 ticket keys at a
time and names a ticket only when a search covering it answered (a key search naming it, or an
epic-children search returning it); a ticket such a search did not return is missing. On a board
with epics it shows nothing until every search answered. Without epics it shows the searches that
answered, so one failed search leaves its tickets with no state: they are **unknown**, never
missing. The script writes each with state `unknown`, which the readers show as no status, counts
them in its line (`12 tickets (1 missing, 2 unknown)`) and records one Jira error naming them. With
no state at all every ticket is unknown, and a snapshot showing them all as missing would be
wrong. A missing variable is named only for a provider the board uses (Grafana
for grafana, loki, sql, cloudwatch or cloudwatchLogs signals; Honeycomb for honeycomb signals). A
rate-limited Jira call (HTTP 429) is retried once after its Retry-After (at most
10 s) and recorded only if it still fails; a datasource uid that is not one path segment is refused.

The snapshot is written next to the board as `<board>.snapshot.json` (`--out` chooses another
path). `*.snapshot.json` is ignored by git, so real ticket titles, assignees and metric values
are never committed, and the file is never part of a published board. Inside a git work tree the
script writes only a path git ignores (`git check-ignore`); any other path is refused before a
provider is called. Its format is one day of
the [demo story](#demo-mode) plus `snapshotAt` and the recorded `errors`:
`{"version": 1, "kind": "flowview-live-snapshot", "snapshotAt", "board", "epics", "days": [{"label":
"Snapshot from …", "issues": {…}, "telemetry": {"start", "stepSeconds", "carriers"}}], "errors": [{"source",
"tool", "message"}], "narrowed": {"<carrier>": {"<signal>": [<fragment>, …]}}}`; `narrowed`, present only
when a shown signal was narrowed, lists the fragments each one applied, as written (never a provider
answer). A ticket Jira did not return is left out of `issues`, so the board shows
it as missing; a ticket no answered search covered has state `unknown`.

REST credentials and this script are the zero-token route: no provider response reaches the
agent. An agent with only MCP connectors cannot avoid that, because every tool result enters its
context. Its low-token recipe: one `getAccessibleAtlassianResources`, one
`searchJiraIssuesUsingJql` for `key in (<the board's tickets>) OR parent in (<its epics>)` asking
only for `summary, status, assignee, updated, issuelinks, parent, issuetype` (one more page per
100 issues), the same search with `AND Flagged = Impediment` added (the viewer reads a flagged
ticket as blocked), and one Grafana query per bound signal over the board's window. For a board
with seven tickets, one epic and 14 signals that is 17 calls; the agent then writes the file in
the format above.

## Over time

Over time lets a reader move through past days on a board. It overlays each
ticket's status for the chosen day on the current diagram. The diagram is not a
historical version: its structure, the list of stories, titles, owners, PR icons
and dependency links all stay as of today. Authors set nothing, and no spec field
is involved.

**Using it.** **Live** and **Over time** are the two modes, side by side at the
start of the Live status panel's header. The selected one is filled: blue for
Live, amber for Over time. Over time appears once ticket status has loaded and a
history source exists. Clicking it loads history, shows progress on the button,
then adds a thin amber-tinted slider row to the panel. Clicking **Live** returns
to today; while Live is already selected, clicking it turns colors off as it
always has, and Over time turns them back on. The slider moves one whole day at a
time by pointer or arrow keys, Home and End jump to the first and last day, and
**<** and **>** on the same row step one day. The row's heading shows the
selected day in large type; on a day dated today it reads **TODAY** with the date
beside it. TODAY shows only when the selected day's date is today; any other day,
including the shipped demo's past dates, shows its label. Each day repaints
nodes and edges (local and imported), step coins and captions, lane rollups,
panel counts, the progress ring, blockers, the Tickets table State column and
planned-node treatment.

**Day range and day status.** The first day is the day the oldest ticket was
created. The last day is today while any ticket is open, or the day the last
ticket reached Done once all are Done. A day's status is the ticket's status at
the end of that day in the viewer's local time. A day with no change keeps the
previous day's status. Blocked uses the same rule as the live board: flagged as
an impediment, or a status name containing "block". Parents roll up from their
children, so they need no history calls. The last day is exactly the live map.

**Before a ticket existed.** A ticket with no status on a day shows as Missing on
that day: its node or edge wears the Missing paint, the Tickets table says missing,
and its popover says "No ticket on this day". An uncolored carrier would hide the gap.
It is not a blocker: it stays out of the blocked count and the blockers list, First
blocker cannot reach it, Play does not stop at it, and a ticket that depends on it waits with a grey tone. It
keeps its title and row and stays in the total, so the total is the same on every day.
This covers a ticket not created yet and a ticket missing today, which has no history.

**While a past day shows.** Live refresh keeps running but does not change the
display. Returning to **Live** applies the newest live status as a normal refresh,
including anything that changed meanwhile. Moving the slider adds nothing to
Activity, causes no change pulse and shows no "no activity N d" mark. The Edit
button is disabled with a stated reason, also while history loads ("Editing is off while
history loads."), Over time is disabled while Edit mode is active, and the saved spec never
changes. A load that ends while Edit mode is on shows no past day and says why. While history
loads, **Over time** reads "Loading history n of N…" and keeps keyboard focus; when the day
shows, focus moves to the day slider (#1253).

**History source and call cost.** Only a click loads history, as one batch of
one-shot `callTool` calls. Nothing polls, and no history call happens at page load
or on a refresh. Each ticket costs one `getJiraIssue` call with `expand: "changelog"`,
which returns its created time, current status and changelog. A changelog names
statuses but not their categories, so any status no tracked ticket holds gets one
`searchJiraIssuesUsingJql` lookup for `status = <id>`. The cost is about
one call per ticket plus one per unknown status, at most six at once, so a 100-ticket
board costs about 100 calls on a first click for each viewer. Each result is cached for 7 days for
that viewer and artifact. A later click reads the cache and calls Jira again only for
a ticket whose live `updated` time is newer than its cached result. The runtime cache
is best-effort and size-bounded, and an older claude.ai shell keeps results for less
time or not at all, so a repeat click can cost the full batch.

If any call fails, or a ticket's changelog holds fewer entries than its `total`, the
board stays on today, the panel says history could not load, and the button can be
clicked again. A partial history is never shown. A status no ticket anywhere holds,
such as one retired from a workflow, follows the live board's rule for an unknown
category: To Do, unless its name contains "block".

**Where it appears.** A claude.ai board needs a connector that offers
`getJiraIssue` and a page that declares it, so a board published earlier must be
republished to get it. On `#live=demo` the button uses the
embedded timeline's days, or the four synthesized days, with no network calls.
The slider and **<** and **>** share one current day: the buttons carry on from
the slider's day, and Live returns to the day the buttons reached. There the timeline's
last day supplies titles and the story list, so the total stays the same. There
is no button on host-provider pages or in Workbench preview.

**Boards without Jira.** A board with Metrics and no ticket, epic, exclusion or
missing-work reference, after imports, still shows **Live** and **Over time**. There Over time
lists the last 7 local days ending today, built with no calls. With the Metrics
overlay off nothing is fetched; with it on, each day's metrics window is fetched
when the day is first shown, and a past day already loaded is not fetched again.
A click on the selected **Live** changes nothing there. If a loaded detail gives the
board a ticket, Over time ends and the board returns to Live.

The `getJiraIssue` reply shape was checked with one real call on a live Atlassian
connector: the issue sits in `issues.nodes[0]`, and a plain top-level REST issue is
also accepted. A ticket with a very long changelog has not been tested. Past-day
Blocked from Flagged assumes Flagged changes appear in the changelog.

**Selected day window.** `ctl.liveStatus.snapshot().overTime.window` is the selected
day's time range for trace and log searches, `{from, to, label}`, or null in Live. `from` is
the local midnight that starts the day's `key`; `to` is the next local midnight,
so a DST day covers 23 or 25 hours, and today ends now. Both are
UTC RFC3339 strings; `label` reads like `Nov 6 00:00–24:00 local`. It does not
need Metrics. A day without a `YYYY-MM-DD` key has no window. Load trace and
Verify search this day ([Honeycomb lookback](provider-traces.md#honeycomb-lookback)).

## Dependencies

Edge direction is data flow and infers nothing about delivery. A dependency is
ticket → ticket, never carrier → carrier, and comes from two sources merged as a
union with provenance:

1. **Jira issue links.** The adapter requests `issuelinks` with the other fields
   (no extra calls). A link counts when the description shown on the dependent
   issue's side (`type.inward` for `inwardIssue`, `type.outward` for
   `outwardIssue`) is one of `tracking.jira.dependencyLinks`, default
   `is blocked by` and `depends on`. The linked issue's key, summary and status
   come from the link payload, so an upstream outside the epic and the diagram
   gets a state without another fetch. The entry gains
   `dependsOn: [{key, source: "jira", linkType}]`. The epic itself is seeded the
   same way from a child's `parent` payload (summary and status) for the epic box.
2. **Authored pairs** in `page.tracking.dependencies`, tagged `source: "authored"`
   with their `reason`. Loaded detail pages contribute their own pairs.

`liveStatusDependencies(pages, map)` merges both into `{ticket: [{key, sources,
linkType?, reason?}]}`. X waits on Y while Y is not done, unless X itself is
already active, testing or done: then the link is listed but X is not waiting. A blocked
or missing X still waits: the panel, the chains and the popover record it, while
its carrier keeps its own blocked or missing paint on the canvas as the stronger
state (solid blocked red or dashed missing red, without the waiting stroke). The tone comes from the
**direct** upstream: an unfinished Y paints X
light blue with the raised-hand icon in the panel; a blocked or missing Y
(including a key the map never reports) paints X red (rose) with the alarm icon.
Chains propagate naturally, each hop taking its tone from its own upstream.
`liveStatusTicketWaiting(dependencies, map)` returns `{ticket: {tone, on: [{key,
state, tone}]}}`; an empty map is no evidence and nothing waits.

A carrier waits when any of its tickets waits; red wins over grey.
`liveStatusCarrierWaiting(diagram, map, waiting)` returns `{carrierId: {tone,
keys}}`. Waiting nodes and edges acquire `dv-live-waiting`,
`data-dv-live-waiting-on` (comma-separated upstream keys) and
`data-dv-live-waiting-tone` (`grey` or `red`) while retaining their own
`dv-live-<state>` class; the node preset is slate or rose accordingly. The canvas
shows only the dashed stroke in the waiting tone: no text, badge or icon. The
carrier's accessible name says “waiting on KEY, KEY” and its popover lists
“Waiting on KEY · state” per direct upstream followed by the chain(s) the
carrier's tickets sit in (“HW-124 holds FW-46”). Applying a new map, clearing it
or turning Live off removes stale waiting evidence. Print keeps the colors.

`liveStatusDependencyChains(waiting)` returns one chain per path from a root
upstream through each waiting hop; **Blockers and dependency chains** renders each
chain as a row of the same bounded buttons with “holds” between hops. Downstream
counts on blocker rows count carriers and steps whose tickets wait, directly or
through a chain, on that key.

## Blocked edges

Blocked edges reuse the communication **Not sent** break glyph, without canvas
text, in both Ambient and Step mode: the edge already names its ends and a text
label would sit on the edge label, its step coin or a node card. The break's
title and accessible name keep the full sentence with the blocking keys. The break lasts until the live state
changes or Live is disabled. Without an existence rule, missing edges keep their
red stroke without a communication break. Todo edges use a dashed light-blue stroke
and hide packet dots; active, testing and done edges retain ordinary packet animation.
An unavailable edge or endpoint adds a break and stops packets regardless of
Jira state, as described under [planned availability](#planned-nodes-and-connections). Authored step failures
keep their own lifecycle, and reduced-motion behavior is unchanged.

## Publishing as a claude.ai artifact

Build the standalone HTML with `python3 tools/build.py`, then inject your spec
with `tools/inject.py`. When publishing with the Artifact tool, declare the
viewer's connector by its **exact display name** as shown in claude.ai
Settings → Connectors, together with the two Jira tools and the comments
capability. For Atlassian's own connector that is:

```js
capabilities: {mcp: {servers: [{server: "Atlassian", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql", "getJiraIssue"]}]}, comments: {"composer_only": true, "customAnchors": true}}
```

For a custom connector (for example the mock server installed as
`Mock-atlassian`) put that name in `server` instead. The name is free, with one
rule: do not name a custom connector **Atlassian MCP**. That is the display
name of Atlassian's directory connector on claude.ai, so a declaration or a
connector under that name resolves to the directory connector and asks the
viewer for an Atlassian login.

The adapter does not match connectors by name. From the connectors the
manifest exposes it takes any one that offers both
`getAccessibleAtlassianResources` and `searchJiraIssuesUsingJql`, preferring
**Atlassian MCP**, then **Atlassian**, then the first other qualifying
connector. It then selects the resource matching `page.tracking.jira.site`
(or the first resource when no site is specified), and watches batches of ten
keys every 5 minutes. A second Flagged Impediment query detects blockers.
Configured parent roots also get a key lookup watch for title, status and issue
type, including when they have no children. Each parent gets a `parent = KEY`
watch and a `parent = KEY AND Flagged = Impediment` watch. The fields requested
are summary, status, assignee, updated, issuelinks, parent and issuetype, in pages
of ten. For an Initiative, only child Epics expand into another pair of watches;
for an Epic, ordinary child work items become stories. The adapter follows
`pageInfo.hasNextPage`/`endCursor` or `nextPageToken` at every level, including
Flagged pages. Shared or explicitly configured Epics reuse the same watches.
When approved details add/remove roots or membership changes, watches follow
current reachability and retire branches that no remaining root reaches.

Initial publication waits for root metadata. Tracked parent publication (Epic or
Initiative) waits for complete root, Epic, story and Flagged evidence; failed, incomplete or superseded
page chains retain the last complete map. Child containers and cycles cannot
inflate story totals. A failed refresh uses the same notices and bounded retry
rules. Destroy retires subscriptions, scheduled retries and late responses.
Jira status determines colors;
Development PR summaries, when returned, are informational. All tool calls go
through `window.claude.use("mcp")`; the artifact never fetches Jira directly.

Clicking **Over time** adds `getJiraIssue` calls and status lookups; see
[Over time](#over-time). A connector without `getJiraIssue` still paints live status.

Without the connector, viewers see “Add the Atlassian connector in claude.ai
Settings → Connectors to see live ticket status.” If approval is needed, the
**Allow Jira** button makes one explicit retry. Account and policy errors clear
status; temporary failures keep the last evidence and permit one delayed retry
per refresh. Switching accounts retires the adapter. The Live toggle hides
colors while watches continue, and turning it back on applies the latest data.
Without the claude.ai runtime or MCP capability, or without ticket or epic references,
the adapter is inert. An existing `window.flowviewLiveStatus` host provider takes
precedence. Document editing remains desktop-only.

Jira tool shapes follow public documentation; they have not been captured from a
real connector. See the [mock server README](../deploy/cloudflare/mock-atlassian-mcp/README.md)
for setup, fictional scenarios, result envelopes and known fidelity limits.
The mock can be installed as a custom connector under any name except
**Atlassian MCP** to try the artifact without an Atlassian account; declare
that name when publishing. Pull-request detail comes from a second, optional
GitHub connector described next; declare it as a second `servers` entry:

```js
capabilities: {mcp: {servers: [
  {server: "Atlassian", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql", "getJiraIssue"]},
  {server: "GitHub", tools: ["search_pull_requests", "pull_request_read"]}
]}, comments: {"composer_only": true, "customAnchors": true}}
```

Without the GitHub entry, or when the viewer has no such connector, the page
behaves as before: authored PR links stay plain icons, Jira's Development count
stays, and the header's connection line says nothing about GitHub.

### Production metrics from Grafana

A board whose nodes or edges bind `grafana`, `loki`, `sql` or `cloudwatch` signals (see
[Telemetry bindings](#telemetry-bindings)) reads them through the viewer's Grafana
connector when it is published as a claude.ai artifact (#943,
`src/viewer/telemetry-claude.js`). An existing `window.flowviewTelemetry` host
provider takes precedence, and demo mode (`#live=demo`) does not use it. Declare
the connector as one more `servers` entry, by its exact display name:

```js
capabilities: {mcp: {servers: [
  {server: "Atlassian", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"]},
  {server: "Grafana", tools: ["query_prometheus", "query_loki_logs"]}
]}, comments: {"composer_only": true, "customAnchors": true}}
```

Add `"query_cloudwatch"` only for bound CloudWatch metric signals and `"query_cloudwatch_logs"` only for bound Logs signals.
A board with Load trace log lookups (`tracking.telemetry.lookups`, [Find a trace from a log line](#find-a-trace-from-a-log-line)) also declares `"query_loki_logs"`.
Add `"query_sql"` to the Grafana tools only when the page has `sql` signals and the
server enables that tool; it is off by default in
[grafana/mcp-grafana](https://github.com/grafana/mcp-grafana), the real server,
which the viewer adds as a custom connector. The
[mock Grafana MCP](../deploy/cloudflare/mock-grafana-mcp/README.md) serves the
doorbell story without a Grafana account. `tools/inject.py` adds the Grafana entry
to the embedded agent guide's declaration when the page has such signals. That
includes imported carriers: when the page being injected into already carries a
`flowview-topology` context block, the imports are resolved as the runtime
resolves them (exported, selected carriers only; a consumer overlay replaces the
provider binding; provider templates expand). A snapshot resolved before
injection (`tools/page_build.py --resolve-imports`) carries those bindings itself.

The adapter qualifies connectors by the bound signals: `query_prometheus` for
`grafana`, `query_loki_logs` for `loki`, `query_sql` for `sql`, and `query_cloudwatch` for `cloudwatch` and `query_cloudwatch_logs` for `cloudwatchLogs`, preferring a
qualifying connector named **Grafana**. Missing required query tools appear as a
visible diagnostic. `generate_deeplink` and `get_annotations` are optional;
declare these extras only when offered and needed. The generated declaration is
a minimum; preserve previously verified offered optional tools when
republishing. The trace adapter searches only each carrier's first trace signal,
with its search/detail pair. When that signal is `tempo`, the page also declares
`search_tempo_traces` and `get_tempo_trace` on Grafana; when it is a Honeycomb
example-trace wrapper (`query_spec`), `get_trace` follows `run_query` (#1139).
Discovery uses `claude.use('mcp')` and `listTools()` metadata, without data calls
or permission prompts. Page/host disable suppresses discovery. Late results after
retirement are dropped; each refresh rechecks required tools.

No data tool is called while Metrics is off. Turning Metrics on runs the first refresh,
and claude.ai asks the viewer to allow the connector while that first call waits.
If approval is still needed, the Metrics text reads "Grafana needs approval" and the
panel shows **Allow Grafana**, which makes the same call once and restarts Metrics.
Until then no further call is made. An authorization answer (reconnect, not
allowed) also clears the map and stops calls until Metrics is
turned on again. Missing or removed capabilities hide Metrics entirely. Refreshes follow the [telemetry provider](#telemetry-provider)
loop: at most every five minutes (the page's `refreshMs` when longer), paused while the
document is hidden, aborted when Metrics turns off. The connector line reads
"Grafana connected · 24h window · refreshed 10:42:13". Each refresh makes these
calls:

| tool | how often | input |
|---|---|---|
| `get_annotations` | when offered, once per refresh, first and alone | `{type: "annotation", limit: 100}` |
| `query_prometheus` | once per refresh for each `grafana` signal | `{datasourceUid, expr, startTime, endTime, stepSeconds, queryType: "range"}` (relative in Live; absolute in Over time) |
| `query_loki_logs` | once per refresh for each `loki` signal | `{datasourceUid, logql, startRfc3339, endRfc3339, queryType: "range", stepSeconds}` (relative in Live; absolute in Over time); a query with `$__range` sends `{datasourceUid, logql, endRfc3339, queryType: "instant"}` instead ([Loki window totals](#loki-window-totals)) |
| `query_sql` | at most once an hour for each `sql` signal; the value is reused in between | `{datasourceUid, query}` |
| `query_cloudwatch` | once per signal/window, plus paired SampleCount for Average; [window statistics and series](#cloudwatch-signals) | `{datasourceUid, namespace, metricName, region, accountId, dimensions, statistic, period, start, end}` |
| `generate_deeplink` | when offered, once per signal per page load, unless the signal authors `links.query` | `{resourceType: "explore", datasourceUid, queries: [{refId, expr}], timeRange: {from: "now-24h", to: "now"}}` |

Authored `signals.<name>.links.query` wins; otherwise a safe `exploreUrl` in the query reply
wins over the optional deeplink tool. Without either, an Explore URL can be built
from the same refresh's returned Explore origin, then optional
`tracking.telemetry.grafana.baseUrl`
(including an environment override). If none is evidenced, no link is shown.
Credentials and non-HTTP(S) URLs are rejected. Loki panes carry the exact LogQL,
datasource UID and window in Grafana's documented [external Explore URL
format](https://grafana.com/docs/grafana-cloud/learn-and-build/visualizations/explore/get-started-with-explore/#generate-explore-urls-from-external-tools).
No datasource backend address is treated as the Grafana UI origin. Both `deploy`
and `deployment` annotation tags produce deploy markers.

`datasourceUid` is the viewed page's `tracking.telemetry.grafana.prometheus`,
`.loki`, `.sql` or `.cloudwatch`, also for imported carriers. The window is
`tracking.telemetry.window` (default `24h`). Times are relative, so the server's
clock decides "now". `stepSeconds` divides the window into about 240 points, at
least 60 seconds. Each metric row links to its exact PromQL or LogQL query. `tempo` signals (exemplar traces) and
`honeycomb` signals are not run by this adapter.

PromQL and LogQL query series become ascending `[epoch ms, number]` points. Several series
are added point by point, so write one aggregated series per signal. `NaN`
samples are dropped. `value` is the last point. A PromQL or LogQL query that matched nothing is
`value: 0` with no points, unless the signal sets `missingMeansZero: false`. CloudWatch empty results stay unobserved; see
[CloudWatch signals](#cloudwatch-signals). `unit` is the authored one. A `sql` signal's value is
the first number of the first returned row. `observedAt` is the newest point of
the refresh. A Loki query with `$__range` is the exception: see [Loki window
totals](#loki-window-totals). Every carrier carries the window's annotations as markers `{at, kind,
label}`: kind `deploy` when tagged deploy, else `incident`, else the first tag.
Links are the authored `dashboard` and `query`, with the Explore link standing in
for a missing `query`.

#### Empty Loki and Prometheus results

A `loki` or `grafana` signal may set `missingMeansZero`, a boolean with the same
name as the CloudWatch query field. Absent or `true` keeps the default: a
successful empty Loki result of a recognized count/rate query is `value: 0`, and
an empty Prometheus result is `value: 0` in Live and unobserved in an Over time
day. `missingMeansZero: false` makes a successful empty result unobserved, with
"<carrier> <signal>: no numeric observation" in the Metrics text, in Live and in
Over time, also for a `[$__range]` window total. Use it for logs that exist only in some environments, such as debug
logs written only in test, so a missing log stream does not read as 0. A
non-empty result is unchanged, and a failed query never becomes 0: a Prometheus or
Loki result with a non-success `status` or an `error` is a failed query. Validation
warns at `signals.<name>.missingMeansZero` and ignores the field when it is not
a boolean, or when the signal is `tempo`, `sql`, `honeycomb`, `cloudwatch` (whose
`missingMeansZero` goes inside the `cloudwatch` query) or `cloudwatchLogs`.

A query that fails on its own (`tool_error`, such as a PromQL parse error, or a
missing datasource UID) leaves the other carriers fresh and keeps that signal's
previous sample; the Metrics text adds "1 Grafana query failed: mcu->ingest p95:
<message>". Any other failure keeps the previous map and shows its note, such as
"Grafana did not answer". `user_changed` stops the adapter. Nothing is written
back to the spec.

Tool argument names and result shapes follow grafana/mcp-grafana's source as the
mock mirrors it; they are unverified against a live Grafana server, and
`query_sql`'s result shape is the least certain. Confirm with the connector's tool
list before relying on a parameter name.

#### Loki window totals

A daily count needs the whole window, not the last step of a range query. Write
the LogQL range as `[$__range]`:

```
sum(count_over_time({app="notify"} |= "event consumed" [$__range]))
```

The adapter replaces every `$__range` with the signal window in whole seconds
(Live: `tracking.telemetry.window`, default `24h`, so `86400s`; Over time: the
selected day's page window, which ends at the day's end and has the same length,
so `$__range` is always the page window) and sends ONE instant query, `queryType: "instant"`, at
the window end (`endRfc3339: "now"` in Live, the window's absolute end in Over
time), with no `startRfc3339` or `stepSeconds`. The signal's `value` is that one
result (several series are added), with no series. Loki scans the window once;
a range query with a 24-hour log range at 240 steps scans it about 240 times. An
empty result follows the empty rules above: zero for a recognized count/rate
query, otherwise unobserved, and unobserved with `missingMeansZero: false`
([Empty Loki and Prometheus results](#empty-loki-and-prometheus-results)). `$__range_s` and `$__range_ms` are not substituted.
Queries without `$__range` keep the range call and its last point. Use
`[$__range]` for daily counts so Loki cards match 24-hour Prometheus cards.

### Two-file publish: `index.html` + `flowspec.json`

A board that will save its own edits from inside the artifact (#825) is
published as two files. `python3 tools/inject.py <spec.json>
template/flowview.html <dir>/index.html --two-file` writes the page and, beside
it, `flowspec.json` holding the spec text verbatim (outer whitespace stripped,
one trailing newline; never re-serialized). The page carries a marker line
after its `flowspec` block, `<meta name="dv-spec-file" content="flowspec.json">`,
so the standalone boot fetches `flowspec.json` relative to the page and renders
that file; the inline block is kept as the fallback. When the file cannot load
for any reason (an HTTP error status, a network or `file://` fetch failure,
malformed JSON) the page boots from the inline copy and shows a large,
persistent warning above the page (Chuck 2026-10-30): "This board couldn't
load its latest version. You're seeing the copy saved when the page was
published; changes saved since then are not shown." Its **Copy error** button
copies diagnostics for an agent (what failed, the file name, page title,
`page.flowview.authoredWith` and the build version, the time, and the hint that
the page booted from its inline block); when the clipboard is unavailable the
text appears in a read-only field instead. Code sees the state as
`ctl.sourceFallback()` → `{reason: "http" | "network" | "parse", detail}`,
null when the file loaded (#828 disables Save while it is set). The
fetched spec passes the same workspace-handoff check as the inline one
(`verifyWorkspaceHandoff` in `src/boot.flowview.js`) before boot; a failed
check shows the handoff error and never boots the fetched spec, and never falls
back to the inline copy. Whichever text boots is kept verbatim and exposed as
`ctl.sourceText()` (for the inline path, the block's text content); the board's
Edit mode splices its changes into that text.

Publish both files with the Artifact tool: `index.html` as `file_path` and
`flowspec.json` through `files`. Later edits change only `flowspec.json`, but
the publish call always needs the page: read the artifact's `index.html` (read
action with `path`) to a local file, then publish with `url`, that saved page
as `file_path` unchanged, and the edited `flowspec.json` in `files`. The page
HTML is never regenerated and comments survive (verified on claude.ai,
2026-10-30: a publish with `url` and `files` but no `file_path` is refused;
with the read-back page the stored capabilities carried forward and the edited
title showed). Re-injecting a two-file page without
`--two-file` drops the marker, as it replaces a stale guide. For a Jira- or
telemetry-editable page published this way the declaration adds the artifact
and user capabilities the board's Edit mode needs. Those edit capabilities do
not grant Jira permission: telemetry-only pages omit the Jira server. Single-
file pages keep their existing declaration, and pages with neither Jira nor
telemetry stay comments-only:

```js
capabilities: {mcp: {servers: [{server: "Atlassian", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql", "getJiraIssue"]}]},
  comments: {"composer_only": true, "customAnchors": true}, artifact: {}, user: {scopes: ["profile"]}}
```

### Edit mode on the shared board (#828)

On a two-file board opened on claude.ai, people with edit access to the artifact
(`user.canEdit()` true and `claude.use("artifact")` available) see **Edit** in the
Live status panel header. Viewers and commenters keep a read-only board. In Edit
mode:

- **Assign:** drag a Tickets row onto a node or an edge (its line, label or Jira
  cue). Dragging only adds: a ticket already on other carriers stays there, and a
  drop on a carrier that already holds the key changes nothing. Drag only; there
  is no keyboard path and no Undo (desktop only).
- **Remove:** the carrier's ticket popover shows **Remove** for tickets authored on
  that carrier. Tickets the popover lists because of an availability rule, and
  provider-inherited tickets on imported carriers, have none. A move is add +
  remove. Removing a ticket added in this session (or adding back one removed, which puts
  it back where it was) cancels that pending change when the carrier's tickets are then as
  they were; otherwise both changes stay recorded (#1253). A ticket authored as a Jira
  browse URL is removed like one authored as a key.
- **Clear Missing work** (#855): a node or edge marked `missingWork: true` shows
  **Clear Missing work** in its popover. Clicking it removes the marker (one
  pending change) and the carrier repaints from its tickets alone. A drop that
  adds a ticket to a marked carrier opens that carrier's popover asking "Does
  EX-1 cover the missing work?" with **Clear Missing work** and **Keep**; Keep,
  Escape, × or a click outside leave the marker. Nothing clears automatically,
  and the board never sets a marker (that stays a Workbench step). A marker an
  imported carrier inherits from its source diagram (the provider sets it, even
  if the consumer overlay repeats it) shows "Missing work comes from the source
  diagram "<spec>" and must be cleared there." instead, with no Clear and no
  post-drop question.
- **Map a span to a step** (#1078): Edit, Save, Discard and Done also show in the
  Trace view. With a loaded trace, a focused span that no step maps offers **Map
  this span to a step**: pick one of the diagram's steps that has no `traceMatch`
  yet (a drag or the chooser can also replace one, #1177), and that step gets `traceMatch: {"serviceName": …, "operation": …}` with the
  span's exact service and operation. Steps are page-local, so the step itself is
  written even when it draws on an imported node or edge. The board re-renders
  with the loaded trace and the focused span kept, and the span then maps to the
  step. A step that already has a `traceMatch` is not offered; edit it in the
  Workbench ([Step trace match](#step-trace-match)).
- Imported nodes and edges write the consumer overlay
  (`topologyImports[].nodeTracking` / `edgeTracking`, as the Workbench does); the
  provider spec never changes.
- After the first change the header shows **Save N changes** and **Discard**.
  Discard drops every pending change and shows the last loaded spec. Leaving the
  page with pending changes raises the browser's leave-page warning.
- **Keyboard focus** (#1253): each edit control hands focus to the control that replaces
  it: Edit to Done, Done to Edit, Save and Discard to Edit once the board re-renders (Save
  keeps focus while it saves). After Remove or Clear Missing work in a popover, focus goes to
  that carrier in the re-rendered board, or to **Save N changes** when the carrier is no longer
  a button (an edge without tickets). Focus moves only while it is still on the pressed control
  or nowhere; a reader who moved on keeps their place. A read-only answer moves focus to its
  notice. A repaint redraws the post-drop question in place and does not take focus back.
- **Save** appends one `page.editHistory` entry (`at`, `by: {id, name}` from
  `user.me()`, one change per operation with the carrier's path, identity and
  display label; the newest 200 entries are kept) and publishes only
  `flowspec.json` (`artifact.publish({"flowspec.json": {content, contentType:
  "application/json"}})`). Each change is spliced into the authored text, so every
  other line of the file stays as written.
- **Another editor saved first** (`conflict`): the runtime reloads the view to
  the winning version and the page replays the pending changes onto it by each
  carrier's identity (section id or heading, edge endpoints and label, the import's
  provider reference), never by position. A change whose carrier is gone, or was
  not unique when it was made (two identical unlabeled parallel edges), is dropped
  and listed as "could not be (carrier moved, removed or ambiguous)". A change whose carrier
  is there but cannot take it is named with its own reason: a clear whose carrier no longer
  has a Missing work marker set on this board, a span mapping whose step their version maps
  to another span or gave a trace scope (or changed the one the mapping replaced), a declared span whose key their version uses for a different span
  ("drop the span again to declare it; it gets a new name"), a ticket the provider of an imported node or
  connection now carries. Each such change is its own sentence. A declared span their version
  already has, under any key, counts as already there. A change
  the winning version already has is named as already there. Nothing is published until the
  editor saves again, and the notice ends with “Save again.” only while a change is pending.
- A read-only answer (`not_writer`, `not_granted`, `capability_disabled`,
  `not_declared`) hides the edit controls and says the board is read-only here.
- While the page shows the "couldn't load its latest version" warning (booted from
  the inline copy), Edit is disabled with that reason: saving the old copy would
  overwrite newer changes and their history.

### Agents and board edits (#974)

Board edits change only the artifact's `flowspec.json`. An agent that keeps its own copy
of the spec (a repository file or a working copy) brings them in before it changes
anything, with `tools/board-sync.js`. Board edits can only add a ticket to a node or edge,
remove one, clear a Missing work marker, map a trace span to a step that has no
`traceMatch` (#1078), or declare a trace span on a node or connection (#1290), so folding
them in is mechanical; the agent asks the author only about a real conflict.

1. Read the artifact's current `flowspec.json` (Artifact tool, read action with `path`)
   and save it, for example as `live.json`.
2. `node tools/board-sync.js pull <local.json> live.json` lists the board edits the local
   copy does not have, one line each
   (`2026-11-03 14:02 UTC  Bo: DOOR-104 moved from Door API to Cloud sync`), and writes
   them into the local file: the tickets and Missing work markers on the nodes and edges
   those edits touched, the `traceMatch` of each step a board edit mapped (found by
   section and step id; a local step that already maps the same service and operation
   keeps its own; the mapping removes the step's `traceScope` when the local scope is the
   one the board's mapping replaced), each span the board declared on a node or connection
   (found as tickets are, so a locally relabeled connection still matches; the consumer
   overlay for an imported one; a local span that is the same in every field, service,
   operation or prefix, role, namespace and attributes, under that key or another, is kept), plus their
   `page.editHistory` entries. Every other line stays as
   written and changes made only in the local copy are kept. Tell the author the listed
   lines.
   - Exit 2, nothing written: a conflict. The same ticket was placed differently on the
     board and in the local copy, or a board edit added a ticket to a node or edge the
     local copy no longer has. (A board edit that removed a ticket from, or cleared the
     marker of, a node or edge the local copy deleted needs no question: both sides agree
     the ticket is not there.) A board edit that mapped a span to a step is a conflict
     when the local step maps a different span, has a trace scope the board's mapping did
     not replace, or was deleted. A board edit that declared a span is a conflict when the
     local node or connection declares something else under the same key, hides that key,
     or no longer exists (for an imported one, also when its import is gone or renamed).
     Ask the author, then rerun with `--resolve KEY=live` (keep the board's
     placement) or `--resolve KEY=local` (keep the local one, after placing the ticket
     where the author says). For a step, KEY is `step:<step id>`; for a declared span,
     `span:<carrier>/<span key>` (the node id, or `from->to` for a connection, so quote it:
     `--resolve 'span:api->worker/send=live'`; plain `span:<span key>` works only while the
     board's new declarations use that key on one node or connection).
   - Exit 3, nothing written: the live board was republished by an agent from another
     copy, so its structure may differ. Start again from `live.json`: copy it over the
     local file and redo the requested change. If the local file has changes of its own
     that were never published, ask the author before replacing it.
3. Make the requested change in the local file.
4. `node tools/board-sync.js log <local.json> live.json --by "<author name>"` appends one
   agent entry: `"source": "agent"`, a counted one-line `summary` ("Added 5 nodes, moved
   5 tickets"; `--summary "<one line>"` replaces it) and the ticket changes. It refuses
   with exit 2 when the change alters where a ticket sits (moves it, removes it, adds it
   anywhere, or deletes the node or edge holding it) and a board edit saved after the
   newest agent entry added, moved or removed that ticket; the message names who made the
   board edit, when, and what it did. It also refuses when the change maps a different
   span to a step, removes its `traceMatch` or deletes the step, and a board edit saved
   after the newest agent entry mapped that step (KEY `step:<step id>`), or when it removes
   or changes a span such an edit declared on a node or connection, or deletes that node or
   connection (KEY `'span:<carrier>/<span key>'`); the summary counts added, changed and
   removed step mappings and span declarations. Ask the
   author and rerun with `--confirm KEY` once they agree. Board edits older than the
   newest agent entry were already in front of the author and need no question
   (Chuck 2026-11-04). Exit 3: pull first.
5. Validate the local file (`node tools/validate.js <local.json>`) after logging, so the
   file you publish, agent entry included, has no errors.
6. Republish to the same URL with the edited file as `flowspec.json` (above). If the
   publish is refused because the artifact changed after the read, someone saved in the
   meantime: read `flowspec.json` again, repeat step 2, validate again, then publish; do
   not log a second time, the agent entry is already in the local file.

An agent without a checkout follows the same rules from the page's agent guide while it
edits the live `flowspec.json` directly: it tells the author which board edits were saved
after the newest agent entry, asks before overriding one of them, and appends the agent
entry itself.

## Pull requests from GitHub

Jira cannot return pull-request URLs (its Development field carries counts and
state only), so PR links, state, checks and review come from the viewer's
GitHub connector (#756). claude.ai has no GitHub MCP connector in its directory;
the viewer adds a **custom connector** pointing at GitHub's remote MCP server
`https://api.githubcopilot.com/mcp/` with OAuth sign-in (the base URL; the
`/readonly` and `/x/pull_requests/readonly` variants may fail OAuth discovery).
Its display name is free; declare that exact name in `capabilities.mcp.servers`
as shown above. The adapter never matches the connector by name: from the
listed connectors it takes any that offers both `search_pull_requests` and
`pull_request_read`, preferring one named **GitHub**, then the first qualifying
one. Both tools are `readOnlyHint: true`, so `watchTool` polls them every 5 minutes.

Shapes captured on 2026-10-27 from a real claude.ai custom connector (46 tools):

- `search_pull_requests {query, owner?, repo?, fields[], sort, order, page, perPage}`
  returns `{total_count, incomplete_results, search_type, items[]}`; items carry
  `number`, `state` (`open` | `closed`), `title`, `html_url`, `repository_url`,
  `user{login}`, `draft`, `created_at`, `updated_at`, `closed_at` and
  `pull_request{html_url, merged_at?}`. Merged means `pull_request.merged_at`
  is present. The adapter sends one search per ticket key and scope:
  `"KEY" in:title,body repo:owner/repo` (one query per repository in
  `tracking.github.repos`), `"KEY" in:title,body org:name` when only `org` is
  set, or the authored PRs' repositories when no scope is set; `fields` is
  `number, title, state, html_url, user, pull_request, repository_url, draft`
  and `perPage` is 20. Without a scope and without authored GitHub URLs there is
  no search.
- `pull_request_read {method, owner, repo, pullNumber}`: `get` returns the trimmed
  pull request `{number, title, state, draft, merged, mergeable_state, html_url,
  user, labels, head{ref, sha, repo}, base, additions, deletions, changed_files,
  commits, created_at, updated_at, closed_at?, merged_at?, merged_by?}`; one
  `get` watch per authored GitHub PR URL. `get_check_runs` returns
  `{check_runs[]{name, status, conclusion, html_url}}` and is the source of CI
  state: `get_status` is the legacy commit-status API and Actions-only
  repositories report `{state: "pending", total_count: 0}` there, so it is not
  called. `get_reviews` returns reviews with `state` in `APPROVED`,
  `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED`, `PENDING`. Checks and reviews
  are fetched only for open and draft pull requests.
- Rate limits arrive as `tool_error` whose message contains “rate limit
  exceeded” (search allows about 30 requests a minute). The adapter retries once
  after 1–3 s per refresh, keeps the evidence it already has, and never writes
  the panel note; the header's GitHub state reads “GitHub did not answer” until
  the next successful answer. Policy and account answers (`blocked_by_policy`,
  `not_in_manifest`, `server_not_connected`, `needs_reauth`) retire GitHub
  enrichment and leave Jira evidence untouched.

Roll-ups: a pull request is `merged` when `merged_at` or `merged` is set, else
`draft` when open and draft, else `open` or `closed`. Checks are `failing` if
any run concluded `failure`, `timed_out`, `action_required`, `startup_failure`
or `cancelled`; else `pending` if any run is not completed; else `passing`;
`none` without runs. Review is the latest decision per reviewer: any
`CHANGES_REQUESTED` → `changes-requested`, else any `APPROVED` → `approved`,
else `commented` when only comments exist, else `none`; a `DISMISSED` review
withdraws that reviewer's decision.

At most ten GitHub watches are subscribed at a time; a longer queue rotates in
5-minute cohorts so every ticket is eventually searched, which also keeps
automatic polling under the search rate limit. Pull-request reads (`get`,
`get_check_runs`, `get_reviews`) go to the front of the queue. Each ticket's
links merge authored URLs first (source `authored`, enriched by their `get`
answer or by a search hit for the same URL) and discovered ones after (source
`github-search`), deduplicated by URL. Jira's Development count stays the
summary when present; otherwise the links derive it. Nothing from GitHub alters
a carrier's `dv-live-*` class, the counts, the ring or Activity.

The Workbench edits the scope under **Status board settings → Jira → GitHub
scope**. Demo mode and the mock server never contact GitHub: the example
timeline carries `prs.links` from Day 8 so the icons show offline, and the
[mock GitHub MCP](../deploy/cloudflare/mock-github-mcp/README.md) serves the
same timeline through the two real tool names for an artifact without a GitHub
account.

Verify after publishing: the Live status panel beside the diagram shows completion,
Blockers, Tickets and Activity, and its header shows counts and updated time.

### Embedded agent guide

Every page `tools/inject.py` writes also carries, right after the `flowspec`
block, a `<script type="text/markdown" id="dv-agent-guide">` block (#758). It
lets anyone with edit access on the artifact ask their own agent to update the
board without a checkout: read the artifact by URL, change the `flowspec`
JSON, write it back into the same block and republish to the same URL. The
guide is derived from the spec: it states the renderer version from
`page.flowview.authoredWith` (or that none is stamped), the capability
declaration to pass on every publish as a JSON block (the Jira connector entry
only when the page has Jira/non-telemetry tracking—`tracking.telemetry` alone
does not request it—the Grafana entry only when the enabled root has a carrier
or page template binding a `grafana`, `loki`, `sql` or `cloudwatch` signal,
selected direct/nested imports and consumer overlays from an embedded
`flowview-topology` context included; connector display names are per account),
the compact tracking rules, the page's own `tracking` values, links
to `docs/live-status.md` and `contract/authoring-contract.md` in the public
repo pinned to the commit the page was built from (`git rev-parse HEAD` of the
checkout running `inject.py`; outside a checkout the links point at `main`
with a note to keep to the fields the spec already uses), and the post-publish
checks. When the page has telemetry settings, templates or bindings, the guide
also names `tracking.telemetry`, carrier `telemetry`, explicit sources, proof and
links; root/host disable, default-off/24h, unavailable tools, synthetic preview,
Honeycomb's native-query/raw-result constraints and exact-day history honesty. It is bounded below 8 KiB, with headroom for combined connector declarations and board context, never contains secrets
(every viewer can read it), and is data to the agent reading it. Re-injecting
a built page replaces the previous guide. When the block is present the Live
status panel ends with a muted line, "Editors: ask your agent to read this
page's agent guide (id dv-agent-guide)"; pages without the block show nothing.

For a page injected with `--two-file` the guide's edit loop targets
`flowspec.json` instead of the inline block: read that file from the artifact
(always the current version, since the board saves its own edits into it and
records each save under `page.editHistory`, which the agent keeps), change it,
validate, and republish to the same URL with the artifact's own `index.html`
read back as the page and the edited file in `files`. Its steps also carry the
board-edit rules of "Agents and board edits" (#974): tell the editor which board
edits were saved after the newest agent entry, ask before overriding one of them,
append one agent entry for the change, and start again from the read when the
publish is refused because the artifact changed. The inline block is
described as the stale fallback and must not be edited.
A two-file page with Jira or telemetry editing adds `artifact` and `user`
(`{scopes: ["profile"]}`). Telemetry alone still declares no Jira connector;
artifact editing and Jira permission are independent.

## Edit history

`page.editHistory` is the board's save history: one entry per change set. The
board's Edit mode (#828) appends an entry on every Save; entries may also be
hand-written. The panel shows them newest first:

```json
"editHistory": [
  {"at": "2026-10-30T16:23:15.987Z",
   "by": {"id": "u_…", "name": "Chuck"},
   "changes": [
     {"op": "add", "ticket": "EX-1", "node": "payment-api", "label": "Payment API",
      "path": ["sections", 0, "diagram", "nodes", "payment-api"]},
     {"op": "remove", "ticket": "AA-1", "edge": ["door", "cloud"], "label": "Door → Cloud"},
     {"op": "clear-missing-work", "edge": ["door", "cloud"], "label": "Door → Cloud"},
     {"op": "trace-match", "step": "charge", "label": "Charge the card",
      "traceMatch": {"serviceName": "payment", "operation": "grpc.msdemo.PaymentService/Charge"}},
     {"op": "trace-span", "node": "payment-api", "label": "Payment API",
      "span": {"key": "charge", "serviceName": "payment", "operation": "Charge", "role": "process"}}]}
]
```

Required per entry: `at` (an ISO-8601 date-time with date, time including
seconds, optional fraction of any length, and `Z` or a `±hh:mm` offset, such as
`2026-10-30T16:23:15.987Z`; impossible calendar dates are rejected) and a
non-empty `changes` array
whose items carry `op` (`"add"` or `"remove"`), `ticket` (a Jira key) and the
carrier (`node` id, or `edge: [from, to]`). A `"clear-missing-work"` change
records a Missing work marker cleared in Edit mode (#855): it carries only the
carrier (and the optional `path` and `label`), never a `ticket`. A `"trace-match"`
change records a span mapped to a step in Edit mode (#1078): it carries `step` (the
step id) and `traceMatch` (`serviceName` and `operation` strings, plus the resulting `nodeId` when the step has one after the mapping), the optional
`path` and `label` (the step text), `replaces` (the `serviceName`, `operation` and any `nodeId` it
replaced, #1180) when it replaced a mapping, `replacesScope` (the step's `traceScope` object the
mapping removed, #1290) when it replaced a trace scope, and no `ticket`, `node` or `edge`; the panel
reads it as "payment · grpc.msdemo.PaymentService/Charge mapped to step Charge the
card", with "(replaced <service> · <operation>)" after a replacement. `board-sync pull`
sets a step's newest board mapping where the local step still equals the `replaces` of
its oldest fresh mapping (no `traceMatch` when that one was a first mapping), keeps a
local step that already names the newest span, and asks on anything else. `nodeId` merges the same way, separately from the span: its base
is the first `replaces.nodeId` among the step's fresh changes (none after a first mapping,
or once a change sets a `nodeId` its `replaces` lacks; an older engine's change without
any `nodeId` is skipped). Local equals the base: pull takes the board's `nodeId`. The
board equals the base, or local equals the board: pull keeps the local one, also when the
span changes. Both differ: it asks. It never writes a `nodeId` whose node is missing from
the local copy; it asks instead. A `"trace-span"` change (#1290) records a span declared on a
node or connection in Edit mode: it carries the carrier (`node` id or `edge: [from, to]`, the
optional `path` and `label`) and `span` (`key`, `serviceName`, `operation` and `role`
strings), and no `ticket` or `step`; the panel reads it as "charge (payment · Charge)
declared on Payment API". `--resolve step:<id>=live` takes the board's span and
`nodeId` and keeps the step's other `traceMatch` fields. Optional: `by` (`id` and `name`
strings, either may be empty), each change's `path` (array) and `label` (the
carrier's display name at save time, so history stays readable after a rename).
Validation follows the warning-only policy of the other tracking fields: a
malformed entry warns and is ignored, a non-array warns once, and more than 200
entries warn once with only the newest 200 used (Edit mode trims to 200 on
save).

An agent's change to the board is one agent entry (#974), written by
`node tools/board-sync.js log` (see "Agents and board edits" above):

```json
{"at": "2026-11-04T15:00:00.000Z", "by": {"name": "Chuck"}, "source": "agent",
 "summary": "Added 5 nodes, moved 5 tickets",
 "changes": [{"op": "remove", "ticket": "DOOR-104", "node": "door-api", "label": "Door API"},
             {"op": "add", "ticket": "DOOR-104", "node": "cloud-sync", "label": "Cloud sync"}]}
```

`"source": "agent"` and `summary` require each other: `summary` is one line of 1–200
characters, and any other `source` is malformed. An agent entry's `changes` lists only its
ticket changes and may be empty (a change to structure or text alone). Its row reads
editor, an agent tag, the time and the summary, with no change count; it expands to its
ticket changes when it has any and does not expand otherwise. Agent entries also mark where
an agent last brought the board in line: board edits saved after the newest one are the
ones an agent asks about before overriding.

The **Edit history** panel shows those entries. Add it to the diagram's panels
after the Live status panel and place it below the board in every host profile:

```json
{"id": "history", "type": "edit-history", "title": "Edit history"}
```

In a section with an explicit `sectionLayout`, add a full-width tile for it to
each profile (`{"panel": "history", "x": 0, "y": <below the other tiles>, "w": 24, "h": 8}`);
a profile that does not name the panel does not show it. Each row reads
editor · time · "N changes" · the first change ("EX-1 added to Payment API",
or "Missing work cleared from Door → Cloud");
clicking a row expands one line per change with the ticket key, its live title
when the connector has answered, the operation and the carrier label (stored
`label`, else the node id or `from → to`); a cleared marker's line has no ticket. The editor name is the viewer's live
claude.ai profile name for `by.id` when it resolves, else the stored `by.name`,
else "Someone". Everyone sees the panel; nobody edits it, on desktop or in
read-only viewing. It has no authored state: `initial` and step patches warn
and are ignored. Without entries it reads "No edits yet." A board without the
panel keeps its `editHistory` field; the history is shown once the author adds
the declaration above.
## Story mode

Step captions append the shared Proof verdict after the existing Jira suffix and
ticket links. The verdict is the worst of the step's directly selected carriers;
headline numbers come from the primary carrier (the first direct carrier in the
existing edge-then-node walk). The calculation is scoped to this source section
and selected path, so duplicate step IDs in imported sections cannot collide.
With Jira Live off, numeric evidence can still show its telemetry-only verdict.

Trace evidence now lives in the existing Status panel's **Trace** view, beside
**Jira**. It never opens a card over the diagram when stepping. Choose Trace and
turn on **Metrics overlay** to retrieve explicit trace bindings, then select an actual
returned candidate. The selected request stays independent of step navigation;
path changes remap that same request within its exact source section.

The compact view shows one waterfall, candidate identity and observation time,
provider completeness, mapping coverage, operation durations/budgets and recorded
errors or queue/backpressure conditions. Unknown and unobserved operations never
imply failure or success. Canvas node IDs and uniquely mapped edges come from
explicit `traceMatch`, including imported nodes. No display-name joins are used.
**Show on diagram** controls runtime annotations; Jira/scalar cues return when
switching back to Jira. No document layout or authored timing is changed.

The shown trace (loaded or picked) goes in a reserved space above the search
(#1230); before a load the space is a one-line hint, "Load a trace to show it
here". The search (Load trace, log search, the load report and **Clear loaded
trace**) stays open below it, so another line or ID can be loaded at once; the
reader can collapse it to one line naming the connection and environment
("Fixture Honeycomb · Production · Change trace"), and it reopens when no trace is
shown. A load error sits by what was clicked: a log line's report (with **Try the
next log line**) directly under that line's row, a Load trace or Verify error
directly under those buttons. Enter in **Trace ID or link**, **Trace start** or
**Trace end** runs Load trace (a held key does not repeat it, nor does Enter while a
Load runs). Typing in those fields keeps the shown trace and its span focus. A Load
that fails, or **Cancel request** while it runs, brings the shown trace back with its
span focus; only a successful Load or **Clear loaded trace** replaces it (#1252). The request card (#1173) is one line: "8413cd87a9f1 · partial ·
Nov 9 07:19 · 55 spans · 6/7 steps matched". Warning flags (partial, unknown completeness, limit reached) come right after the
trace ID, and the line wraps rather than clipping (#1186). It holds Returned traces and the request details. Each line opens with
one click, and an opened section stays open until the shown trace changes. A
select with one choice (connection, environment, mapping diagram, a single log
lookup) is not drawn; its value still applies. The help sentence is the Load
trace summary's tooltip, and **Show on diagram** appears once a trace is shown.

Stage 2 (#1186) finishes the layout. **Show on diagram** (a toggle) and **Open
trace** are icons at the right end of the request line, outside its summary, with
those accessible names. The request card also holds **Pin as evidence**, **Source
and limitations** and **All operation mappings**. A header row, "Spans · 55 · click
a span to focus it on the diagram", sits above the span list. The list has no
scroll bar of its own: it is as tall as its spans (#1280). In a section layout the
Live status tile grows with it, so the page scrolls instead. A focused span's detail
(duration, service, operation, the matched step or the step choices, **Clear trace
focus**) opens directly under its row. A span the reader focuses (a row, a step
choice, or the log line it was loaded from) is scrolled into view by the least page
scroll. A focus nobody asked for, such as the failed span focused when a trace loads
or a focus kept across an Edit-mode change, never scrolls the page.

Each annotated node or uniquely matched edge gets one label from its rows: one row per
step on the current path whose `traceMatch` names it (#1154). Connection timing (#1196):
for a step with `edge` or `edges`, `traceMatch.nodeId` names the receiving node, and the
connection timed is the step's one delivered connection into that node. A `nodeId` at the
sending end times the node but no connection; `node tools/validate.js` warns and names the
receiving node to use. One row shows its time,
for example `16.1 ms`. When the step's
[traceMatch alternatives](provider-traces.md#tracematch-alternatives) matched, the label
names the alternative: `Matched: stats-consumer persistent://stats/camer… · 16.1 ms` (the
service and operation are cut to 40 characters on the canvas; the title has the full name).
The label's title lists the other alternatives as *not in this trace*, or as *in this trace,
not matched* when a span with that service and operation is present; they never count as
unknown. Several rows read `N operations`, then `K unknown` for mapped operations missing
from the trace, `K ambiguous` for ambiguous mappings, then the time. Time: the time covers
each matched span from start to end (overlaps counted once); the title says so. When more than
one matched span maps to the node or edge, the label shows the wall-clock time they cover
together (the union of their intervals, so nested or overlapping spans count once) and the
count: `16.1 ms across 2 spans`. A board that keeps one step per transport reads
`2 operations · 1 unknown · 16.1 ms` (the other transport's step is missing); make them one
step with alternatives.

**Declared spans (#1290).** A node that declares trace spans (`trace.spans`, see
[provider traces](provider-traces.md#trace-spans-declared-on-nodes-and-connections-1290))
is annotated from a loaded trace even when no step lights it: one row whose label is the
union time of its matched spans (`45 ms across 5 spans`) and whose title lists each
declaration, for example `Declared spans: process 40 ms; find (database) 10 ms across 2 spans;
audit (database): not in this trace; region (cache): attribute cache.region not recorded`.
A span that a step also maps counts once. A declared node with no span in the trace shows no
label. Imported nodes use the consumer's merged declarations. A board whose only mapping is
declarations is trace-ready: company trace profiles apply and nothing calls the provider
before **Load trace**.

A declared connection reads the **hand-off**: the time from the start of its `send` span to
the start of the span that receives it (`9 ms`; several read `8 ms across 2 hand-offs`). The
receiving span is the connection's own `receive` declaration, or else the receiving node's
`process` spans; it is the earliest one that descends from the send (parent or link), or the
only one whose parent is not in the trace and that starts after the send (the title says so).
The receiver's own work counts on its node, not on the connection. Without a receiver the
label reads `send only · 2 ms` (the send span's own time); a connection that declares
`receive` and has no send in the trace reads `receive seen · send not in trace`. A queue node
in the middle is not crossed: each connection is timed on its own. On a declared connection a
step `traceMatch` row moves into the label's title with its time, budget and conditions
(`Step charge, grpc.msdemo.PaymentService/Charge: 23.559238 ms`, the step's raw duration), and the label keeps the step's
warning or error colour; undeclared connections keep the step time. A receiver that starts
before its send (clock skew) counts as 0 ms and the title says so.

Steps that inherit declared spans (`traceScope`, see
[provider traces](provider-traces.md#trace-spans-declared-on-nodes-and-connections-1290)) count
in the coverage line like `traceMatch` steps. A step of another flow reads `Not this flow` and
is left out, like a missing optional step; the line ends with the carriers timed from their
declarations (`· 3 nodes and 2 connections timed`; a connection that only reads "receive seen · send not in trace" has no time and is not counted). A step left without a mapping because its
declared carriers are shared gets a plain hint below the line, for example `Step “Worker”:
Worker is also part of step “Reply”, so this step shows no trace spans of its own.` A step of
another flow paints nothing on the board. **Map this span** onto a step with a `traceScope`
replaces the scope, and the chooser and the button say so before the click; so does the
Workbench **Add trace match** button. Undo of that mapping brings the scope back. An edge step on a
connection that declares only `receive` owns no span and reads `Not observed`, while the
connection itself reads `receive seen · send not in trace`.

A step that may be absent from a trace (for example, its operation runs in a different
trace) can carry `traceMatch.optional: true`; with alternatives, set it on every
alternative ([canon rules](canon.md#reference-traces-and-incident-alternates)). A step whose
`parentStepId` names an optional step must be marked optional too, or it reads unknown when
the parent is absent; even then, if its own span is present while the parent's mapping is
missing or ambiguous, it stays unknown, since the span cannot be attributed. A span is present
when it matches the selector's service, operation, namespace and attributes. When an optional
step has no span of its own in the loaded trace, the label is built from the other rows as if that row were not
there: a node named by one matched step and one missing optional step reads
`Matched: … · 16.1 ms`, or only the time for a single selector. The title lists it as
*optional, not in this trace: service operation*, it never makes the node unknown, and a
node whose only row is a missing optional step gets no label. The coverage line leaves it
out and adds the count: `1/2 steps matched · 1 optional not in this trace · 0 spans
unmatched` (with any steps without a `traceMatch` also named, below). Edge labels and titles carry matched rows only, so a missing step, optional or
not, never adds to an edge and an edge title does not list a missing optional step. A
matched optional step reads like any matched step; an ambiguous one still counts as
ambiguous. Local, imported and drill-down steps follow the same rules. A trace that lacks
an optional step can still be approved as the reference trace; a missing step without
`optional` still blocks approval.

The `N/M steps matched` count, in the request card's one-line summary and in its coverage
line, counts only steps on the current path that have a `traceMatch`, less optional steps
missing from the trace (#1193). Steps without a `traceMatch` are not still to match: the
coverage line names them, `· 4 steps without a trace mapping`, and the summary keeps only
the ratio.

With the Metrics overlay on, the trace labels are drawn first and the metric cards are then
placed clear of them, the same way cards avoid node cards (#1163). The labels never move for
cards; a card moves farther from its edge instead, and the diagram frame grows to fit it.
The exception is a label clamped at the frame edge, which moves out once the frame grows.
Text is laid out again at each board scale. When a scale change leaves a label meeting a card or
a leader line, the board paints again and the cards are placed clear of it.
A card's leader line has a gap where it would cross a trace label, also while a card is
dragged in the Workbench.
A card with an authored `card.position` keeps that position.

Trace highlight levels (#1185) add marks without changing any node or edge colour: corner
brackets outside a node card or text node, and an outline that follows the edge's own path. With
a span focused, its step's carriers are *current* (solid brackets with the Trace tag, a wide
outline, time label 2px larger in a darker ink); carriers of its descendant spans are *below*
(dotted brackets and outline in the span's colour); carriers of its ancestor spans are *above*
(dotted brackets and outline in grey); other carriers in the trace get no marks and a smaller,
fainter time label. With no span focused every carrier in the trace has the dotted *below* marks. An edge whose delivery is
drawn broken, or a step that delivers on several edges, gets no outline. Mark colours follow each
span's result: error red, warning amber, observed cyan, unknown grey. When a trace is first shown
and it has an error span whose step mapping is unique, the earliest such span is focused, as if the
reader clicked it; a focus the reader cleared stays cleared, also after an edit. An error span with
several possible steps is not focused and the request summary reads `error in <service>
<operation>: pick a step to focus it`; when no step maps an error span it reads `error in <service>
<operation> (not on this diagram)`. The note follows the warning flags, before the date (#1186).
A loaded trace can grow the diagram frame so node time labels stay below their cards.
A trace label never sits on a connection label (#1195): it moves down, then sideways (a node's label only while it
stays within its card), to a clear spot,
or, if there is none, gets an opaque plate behind it. Connection labels never move. When the board scale
changes, unplated labels are checked again; a plated label is not, and its plate is padded to cover the
slightly wider text.

**Open trace** requires a safe provider UI URL. **Pin as evidence** adds a
deduplicated in-memory Jira Activity entry, without posting externally. Trace
selection uses the existing cached provider API; rendering and stepping never
fetch alternatives. Telemetry off, invalidated bindings, closed/replaced detail,
provider/account/environment changes, history and destroy retire stale evidence.
Historical Over time never borrows live traces.

See [provider traces](provider-traces.md#inspect-a-request-in-status) for setup,
limits and the reproducible canonical Doorbell example. Build with
`python3 tools/build.py`, then run `node tools/status-trace-demo.mjs` and serve
`.local/status-trace-demo`. The example uses the real panel and SVG renderer with
normal, slow, error, partial and backpressure fixtures; no live account is needed.

Live evidence follows the story's nodes and edges. Diagrams with a Live status
panel omit the team lane chip from their step captions. In Step mode, each Jira
ticket appears on its own line immediately below the authored step text, with
its state beside the key: **To do**, **In progress**, **Testing**, **Done**, **Blocked**,
**Missing**, or **No status** before evidence arrives or when a key has no runtime
entry. Ticket keys are deduplicated across nodes explicitly added to the step
and the step's selected edges, including failed communications. Selecting a
delivered edge still highlights both endpoints; a failed communication keeps
its source highlighted. Neither adds endpoint-node tickets to the list. Add
an endpoint to the step's `nodes` to include its tickets. Other steps in the
same team and unmapped epic stories do not add tickets to this list. Authored
references appear even before live status arrives. Keys link to the page's Jira
site, or a safe runtime ticket URL when no site is configured; without either
they remain plain text.
The list updates with step/path navigation and new evidence, and disappears in
Ambient mode or when Live is disabled. The Live status panel keeps its overall
progress, Tickets team stripes and Blockers team names.

In Step mode, the caption ends with **BLOCKED · KEY · detail**, **MISSING · KEY**,
**IN PROGRESS · n tickets**, **TESTING · n tickets**, **TODO · n tickets**, or **DONE**. Coverage adds
**NO CHANGE NEEDED** and **MISSING WORK · unlinked work remains**. Incomplete
provider evidence shows **AWAITING TICKET STATUS**. Captions update on step
changes and new evidence.
Captions, step/coin states, playback blockers and First blocker focus follow
the same directly selected carriers as the visible ticket list. Lane rollups,
page-wide counts, readiness and dependency summaries retain their broader
coverage of selected edge endpoints.

Playback pauses on the first blocked or missing beat, including the first beat
when starting or replaying, and focuses the first blocking carrier.
Manual next/previous retain their existing navigation behavior. A todo step whose carriers wait adds “· waiting on KEY” to its caption. The small
`stepper.onBeforeAdvance(fn)` hook returns an unsubscribe function; `fn` receives
the selected source step index after it is painted, before automatic playback
continues. Returning `false` invokes the ordinary pause path. It runs only for
automatic playback (including its initial beat), never manual navigation.
**First blocker** jumps through `stepper.jumpSource` to the earliest blocker in
the current path, enters Step mode and focuses that carrier; it hides when none exist.

Changed ticket states update appearance without scaling or moving the carrier.
The Live status panel beside the diagram shows a completion ring, blocker
links, affected lanes and downstream carrier/step counts, and **Activity**.
Activity records the latest 20 transitions, newest received first; the initial
map and identical states add nothing. Times use the ticket's `updatedAt`, then
the map's `storedAt`. If neither exists, the entry says “time unavailable”; cached
evidence never acquires an invented current timestamp. The panel remains visible in print.

The completion ring counts done carriers against all tracked carriers. A carrier
is done only when all its tickets are done. **Ready to demo** requires every
tracked carrier involved in the primary path (the first path, or all steps when
there are no explicit paths) to be done. Alternate-only work does not prevent
readiness; the epic box then shows “Ready to demo” in its counts line. Missing
tickets say “not found in Jira (deleted, renamed, or no permission)”. Downstream
counts come from the same dependency waiting as the canvas, counting each affected
carrier and authored step once per blocking key.

Set `tracking.staleDays` to a positive number (default **7**) to mark active work
whose `updatedAt` is strictly older than that many days. The carrier gets
`dv-live-stale` and its popover says “no activity N d”; the rollup color is unchanged.
Missing/invalid timestamps are never stale; invalid thresholds warn and use 7.
All story features work with `#live=demo`; pages without tickets or epics show the empty-page message.

### Step ticket filters

A node can carry many stories while a step is about a few of them. The step's
`ticketFilter` lists the Jira keys it shows, chosen from the tickets the step
lights: those on the nodes and edges it lights directly (imported carriers
included, with their merged provider and `nodeTracking` tickets) and, for a lit
node whose `detail` is a section of the same page, the tickets of that section's
nodes and edges, recursively. Tickets that exist only in a remote detail
(`detail.spec`) are not filterable, so the set is the same in the viewer,
validator and Workbench and does not change when the remote detail loads.

```json
{"id":"pair","text":"Pair the doorbell","nodes":["firmware"],"ticketFilter":["FW-45"]}
```

With a filter, the step's coin and chip state, its caption (including the ticket
count and "waiting on"), its ticket list, playback pauses, First blocker, its place
in a blocker's downstream step count and the step's proof verdict (in the caption
and in `verdicts().steps`) use only the listed tickets. A carrier's `missingWork`
and unavailable detail stay on that carrier. Node and edge colors, carrier
verdicts, the Tickets table, lane rollups, readiness and coverage still use every
ticket. Without `ticketFilter` a step shows every ticket on its lit carriers. The
capability is `flow.step-ticket-filter`.

An empty or non-array filter, or an entry that is not a Jira key, is a validation
error with its field path. Tickets churn, so a key the step does not light
(endpoint nodes of its edges count only when they are in `nodes`) is a warning
with its field path and is ignored; when no listed key is lit, the step shows
every ticket. A provider dropping a filtered ticket therefore never stops a
consumer from resolving. In the desktop Workbench, the step's Inspect lists the
lit tickets as **Tickets on this step** checkboxes, and every box checked removes
the filter. Removing a hop or node from the step drops every key the step no
longer lights. Deleting a node or edge, or removing a ticket from a carrier
(local, or an imported carrier's consumer overlay), drops the removed keys from
every step filter on the page that no longer lights them, in the same Undo step.
Board Edit mode on the live board does not change step filters; a ticket it
removes is ignored by the filter as above.

## Delivery boards over imported Canon topology

A delivery board can reference a canonical diagram and own only tracking:
`topologyImports[].nodeTracking` maps provider node IDs to tracking fields
(`tickets`, `prs`, `missingWork`, `existsWhen`, `telemetry`);
`edgeTracking` maps provider `from->to` identities to the same shape. Add these
references through the desktop imported-selection Inspector. Inherited references
stay read-only; local additions can be removed, undone and redone. The maps use
strict validation and full provider-relative identities, including nested paths.
`telemetry` content is the exception: like every telemetry binding it only warns
(see "Telemetry bindings").
They do not change provider structure or presentation/geometry overrides.

The resolver merges inherited and consumer references before rendering, so the
same live-status provider discovers all imported tickets and PRs. The live-status
panel, carrier colors, steps, dependencies, readiness, coverage navigation and
reader ticket menus/popovers all use those merged values. Distinct ticket totals
count repeated references once, while carrier coverage counts every tracked
node/edge. A consumer needs only an import, page tracking settings, a live-status
panel and its own steps; it need not copy any topology.

See [the canonical provider and tracking-only consumer example](shared-topology.md#delivery-tracking-on-canonical-topology).

## Status appearance and uncovered work

Nodes, step markers, step controls and ticket-status pills share status-tinted
backing with high-contrast ink chosen against their host surface. Todo is dotted
light blue; active has a slowly pulsing blue outline/glow; done has a steady green glow;
blocked is solid red; missing is dashed red. Only the outline/glow animates, and
reduced-motion and print disable that animation. Selection remains separate.

In desktop **Inspect → Tracking**, **Missing work** saves `missingWork: true` on a
node or connection. This is authored coverage intent, not a Jira status. For example:

```json
{"title":"Audit logging","tickets":["AUDIT-42"],"missingWork":true}
```

The marker says additional unlinked work remains, even if AUDIT-42 is Done. Clear
it when that work is covered: here, or on a shared board in Edit mode
(**Clear Missing work**, see "Edit mode on the shared board"). Blocked ticket evidence takes precedence over the
marker; the marker takes precedence over active, testing, done and todo. It participates
in step appearance and readiness without inventing a ticket or increasing Jira counts.

The Live status header shows a separate **Missing work** count with the shared
missing-work appearance. It counts marked node and connection occurrences across
local and imported diagrams, nested sections and loaded details; text boxes do
not count. It appears even without tickets or a connector and hides when no
markers remain. The count stays separate from the `missing` Jira-ticket total.
Missing work appears first; in narrow desktop panels the counts wrap onto more
lines, so every count shows in full (#1162).
Turning Live off or clearing live paint removes its styling along with the
diagram's styling; the authored marker count remains until the markers are cleared.

A marked connection shows a broken line with the communication-break glyph and
stops packet traffic while Live is enabled, including when every linked ticket
is Done or no tickets/provider exist. Its label or break glyph opens the Missing
work explanation and any attached Jira links; unlabeled breaks are keyboard
buttons. Clearing the marker removes that live break unless blocked evidence or
availability still requires it. Disabling/clearing Live restores the authored
connection and any independently authored communication failure. Local,
imported, nested and resolved-snapshot connections follow the same behavior;
a provider-inherited marker stays read-only in authored import overlays.

With Live status data applied on a board with ticket references, nodes with no linked
tickets and no missing-work marker automatically show **No change needed** (green, faint fill, solid outline, no
glow). This state is neutral in mixed step rollups: done plus no-change stays
done. Linked tickets without provider evidence remain unknown. Text boxes stay
inert. Clear, disable and destroy restore authored paint. Existing ticket-gated
availability still requires every linked ticket to be confirmed Done.

## Personal status colors

Open **Appearance → Status colors…** in the desktop Workbench, or open the
built `workbench/status-colors.html` page on the same site as your viewers.
The page previews the production renderer with local and genuinely imported
nodes. It offers color pickers and six-digit hex fields for To do, Active,
Done, Blocked, Missing work and Unchanged, plus PR states and check results.
Expand a status’s **border, fill & glow** controls to set independent border
color, border width (0–8 px), background fill tint (0–100%) and glow strength
(0–200% of normal). The base color remains the fill/accent color; borders follow
it unless the repository default fixes a border color (Unchanged uses `#2ed600`)
or a personal override is set. Border settings affect node cards, pills and
coins, including imported nodes. Edge paths retain their existing status colors
and widths; dependency waiting outlines retain their evidence color and dash
pattern. A zero-width border hides
the outline without disabling a separately enabled glow.

The repository ships these defaults for all local and imported nodes, pills and coins:

| Status | Border width | Fill tint | Glow strength |
| --- | --- | --- | --- |
| To do | 3 px, dotted | 15% | 0% |
| Active | 2 px | 15% | 100% |
| Done | 3.5 px | 14% | 153% |
| Blocked | 3 px on node cards; 2 px on pills/coins | 15% | 183% |
| Missing work | 2 px, dashed | 15% | 130% |
| Unchanged | 1 px, fixed green border | 3% | 0% |

Active pulses when motion is allowed; other enabled glows stay steady.
Reduced motion and print disable animations. Text ink is recalculated against
the actual fill tint and host surface. These defaults work without browser storage
or saving a palette; syncing the source repository carries them into a fork.

PR means pull request: open is ready for review, draft is work in progress,
merged is included in its target branch, and closed ended without merging.
The small GitHub check dots show passing, failing or pending automated checks;
no dot means no result is available.
Waiting indicators inherit To do and Blocked. The broken-edge icon is always
red (`#b42338`), including authored failures and unavailable connections; edge
segments retain their independent status color.

Edits, **Reset all**, per-setting reset and JSON import change only the preview
until **Save defaults**. Save stores explicit overrides in
`localStorage["flowview.status-colors.v1"]`; an empty palette removes that key.
Untouched values retain the built-in CSS defaults, including skin-specific
draft/merged/closed PR and check colors. Reset reveals these repository defaults;
existing personal overrides take precedence. JSON export includes only overrides,
with a versioned envelope:

```json
{"version":1,"colors":{"live-active":"#1666c7","pr-open":"#539a43"}}
```

Supported names are `live-todo`, `live-active`, `live-testing`, `live-done`, `live-blocked`,
`live-missing`, `live-unchanged`, `pr-open`, `pr-draft`, `pr-merged`, `pr-closed`,
`checks-passing`, `checks-failing` and `checks-pending`. Imports reject unknown
fields, unknown names and values other than `#RRGGBB` without replacing the
preview. Appearance edits use the version 2 envelope below. All appearance
fields are optional; numbers must be finite and within their stated bounds.
An invalid field rejects the entire import atomically. Legacy version 1 saved
palettes and imports remain supported, and loading never rewrites storage.
Adding an appearance override upgrades the draft to version 2 while retaining
its existing colors. Resetting a field removes its override; saving an empty
palette removes the storage key.

```json
{"version":2,"colors":{"live-active":"#1666c7"},"appearance":{"live-active":{"borderColor":"#103c72","borderWidth":3,"fillStrength":25,"glowStrength":75}}}
```

Only the seven `live-*` status names are supported in `appearance`; PR/check
settings remain color-only. Storage errors are reported; the preview remains exportable.

Preferences apply to updated standalone, Workbench, Forge and native viewers
on the same origin in this browser, including open tabs and sibling native
mounts. Each viewer scopes overrides to its own view and releases listeners on
destroy. They do not modify the document, another site's viewer, an older
exported runtime, or another browser. File URLs have browser-dependent storage
isolation; use the hosted page for shared defaults, or transfer JSON to another
hosted palette page. Preview skin changes are not saved document settings.

### Over time with Metrics

Metrics is off on load and independent of Jira mode. Built-in adapters fetch
only the selected date's numeric observation window when Over time is opened or
Metrics is enabled there. Today always fetches; it never borrows the live map.
The date key identifies the local calendar day, and `at` is its following local
midnight (including 23h/25h DST transitions). Today clamps that future endpoint
to now; other future calendar days stay unobserved without a query. Past dates,
including the last date of a closed board, keep their exact endpoint. The page
window extends backward from that endpoint, independent of local-day length.

Built-ins opt into `historyMode: 'window'`. The history range includes one exact
`endpoints` item plus `window: {from, to}`. The returned carrier map contains
ordinary complete observations: scalar, inner series, units, per-signal links,
provenance, measurement `observedAt` and receipt `retrievedAt`. Query bounds stay
in separate `window` metadata; unknown measurement time remains null. Past
successful windows cache for seven days by binding, environment and provider
identity. Today is refreshed when revisited. Selecting a new uncached date loads
that window, with per-signal Loading and healthy partial results visible.
All historical tool calls share the six-call Jira/telemetry budget, including
Average weights, Logs trends and grouped queries; no outer task holds a slot
while awaiting its own queued child. Traces are excluded from numeric history.

Prometheus/Loki query their authored expressions over the selected window;
a range step is not an aggregate rewrite. A Loki query with `$__range` is one
instant query at the selected day's window end with `$__range` set to that
window ([Loki window totals](#loki-window-totals)), so its Over time value covers
the selected day's page window (the whole day at the default 24h window), not the
last hour of the day. CloudWatch preserves period statistics
and computes a trustworthy headline. Logs retain an independent authoritative
total. Honeycomb sends hosted absolute string `query_spec.from`/`to` and evaluates
one calculation directly: daily percentiles, averages and distinct counts are
never summed. Structured series remain intact; the published formatted Results
fallback retains its rounding warning and unknown as-of without invented points.
SQL passes absolute `start`/`end` only for queries containing `$__timeFilter(...)` in query code (not a comment or quoted example)
or both `$__from` and `$__to`; unscoped queries receive a per-signal historical
unavailable note. The conservative guard ignores dollar-quoted strings, quoted identifiers and dialect comments; unterminated syntax or ambiguous backslash quoting stays unavailable. No timestamp column or historical table semantics are guessed.

The following endpoint-only contract remains the default for custom providers.
It preserves batch loading, exact endpoint projection and slider-without-fetch
behavior. Embedded demo observations also remain local and query-free.

A host may supply `telemetry.history(bindings, {from, to, endpoints}, signal, report)` beside
`provider` (or as `provider.history`). `from` and `to` are inclusive absolute
RFC3339 evaluation endpoints. The optional `endpoints: [{key?, at}]` array gives
the exact instants needed, including irregular local-day spacing; the controller
always supplies it. Older direct adapter callers without it request an evenly
spaced daily grid starting at `from`. The result has the ordinary carrier map
shape, with each signal's `series: [[endpoint, value], ...]` (an explicit `YYYY-MM-DD`
day key is also accepted and resolves through that day's explicit `at` metadata). `value` alone is
never historical evidence. Optional `report.note(text)` reports partial failures
and keeps the batch retryable. `historyKey` (a string or function) includes any
mutable provider/account/datasource configuration in the cache identity.

Only a sample at the selected endpoint counts. Missing endpoints, unsupported
sources, retention gaps and a live-only provider give unobserved evidence, never
last-known values or an invented zero. Explicit numeric zero remains observed.
The same proof engine judges every local, imported, nested-import and loaded-detail
carrier. Opening a detail is an explicit reader action: once its actual loader
selection mounts, new bindings automatically join the selected historical day.
Completed peers and unrelated pending batches are retained. Closing a detail
removes its historical bindings and cancels its pending batch; reopening the same
bindings can reuse their cache. Layout, polling paints and slider movement do not
start queries. Changed queries on the same carrier ID never reuse stale samples.

The controller retains live samples separately while showing history, pauses
new telemetry polls, and holds any already-pending refresh or host `apply()`.
Returning Live restores the newest held map and resumes refresh. Turning Metrics
off, losing capability or destroying the controller aborts pending history and
drops late completions; root page/host disable also covers imported/detail pages.
Jira Live and Over time remain independent.

History shares Jira's seven-day cache policy and a single six-call queue. The
controller's front cache is isolated to that viewer/artifact instance and keyed
by each full binding, provider configuration and datasource identity. Coverage
tracks exact `{key, at}` endpoints, rather than a presumed 24-hour interval.
Bindings needing the same endpoints are batched together. Repeat clicks reuse
covered days; a longer range fetches only the new tail, starting at the next
requested instant even when DST makes it 23 or 25 hours after the prior endpoint. Entries expire
seven days after the original batch (tail fetches do not extend their lifetime).
The MCP namespace also caches exact range calls per viewer and artifact. A new
controller starts with an empty front cache; exact MCP calls can still be reused.
Partial-error and aborted batches never extend cached coverage.

Direct legacy Grafana history callers without `range.window` retain exact
endpoint Prometheus/Loki queries with `stepSeconds: 86400`, split only across DST
discontinuities. Each endpoint covers the previous 24 hours, so a Loki `$__range`
there becomes `86400s`. Their endpoint samples/cache contract is unchanged. Built-in
selected-window behavior above uses useful inner series instead.

### Honeycomb metrics and mixed connectors (#946, metrics leg)

Standalone artifacts use one automatic telemetry coordinator. Grafana and
Honeycomb can bind different signals on the same local, imported, nested or
loader-selected detail carrier. Each source owns its errors and caches; a
missing/denied source does not hide a healthy peer. An account change from either
connector retires **all** mixed data. Explicit host providers/demos take precedence.
Root `tracking.telemetry.enabled:false` and host `flowviewTelemetry=false` prevent
metadata discovery and data calls. Metrics starts off, with the default `24h`
window, independently of Jira Live. Discovery alone never runs a query.

Declare `{"server":"Honeycomb","tools":["run_query"]}` in the existing `mcp`
capability alongside Grafana if both are bound (plus `get_trace` for an
example-trace wrapper, which `tools/inject.py` adds). Connector names vary per account;
selection requires offered tools and the runtime `inputSchema`. The supported
schema declares `environment_slug` as a string and `query_spec` as an object or JSON string.
`dataset_slug` may be optional and nullable; omit it when no dataset is authored.
Type unions of the expected type plus `null` are accepted, including calculation
columns. Unsupported schemas fail closed. No new SDK
namespace, authored field or mandatory asynchronous polling contract is assumed.

Root `honeycomb.environment` and optional `honeycomb.dataset` supply those slug arguments.
Hosted `listTools()` contains metadata only. A listed `run_query` makes Metrics
eligible; only turning Metrics on requests `claude.use('permissions')` followed by
`permissions.request(['mcp:'+actualServerName])`. The built-in permissions
capability is never declared. After a `granted` result, `mcp.describeTool(server,
'run_query')` supplies the input schema; description itself never prompts. Denied,
unavailable or null permissions hide that source without retrying or nagging.
The initial page paint never waits for a human permission response. Turning
Metrics off, switching environments or destroying the controller retires pending
permission/description work before any query can run. Trace search/detail tools
use the same permission-first description path. Legacy hosts already supplying
schemas in `listTools` retain their existing call authorization flow.
Each signal holds a native query object, for example:

```json
{"honeycomb":{"calculations":[{"op":"P95","column":"duration_ms"}],"filters":[{"column":"service.name","op":"=","value":"author-selected-service"}]},"unit":"ms"}
```

Use one scalar COUNT/SUM/AVG/MIN/MAX/COUNT_DISTINCT/CONCURRENCY or supported
percentile calculation per signal, without breakdowns or formulas. Preserve
explicit filter expressions and calculation names. The page window replaces
conflicting time selectors with hosted MCP `query_spec.from` (for example `-24h`),
using the signed duration required by the hosted connector; it does not substitute REST `time_range`. Schema constraints that
the adapter cannot honor yield an unobserved signal and a note. Never generate
queries from carrier names or sum percentiles. COUNT counts spans/events, **not
automatically requests**; units remain authored, and missing/empty results are
unobserved rather than invented zeroes.

`run_query` returns computed results. Its formatted Markdown/ASCII may be rounded.
The adapter first reads the provider's
`query_result_json` metadata and downloads exact `results[].data` and
`series[].data` numbers; `header` aliases identify calculation keys. A single
finite aggregate row is required (including explicit zero); ambiguous groups,
nulls and malformed results are unobserved. Series timestamps are bucket starts;
the aggregate is the whole-window headline. Each signal's runtime `observedAt`
is the latest returned bucket start plus valid `info.granularity_seconds` (the
end of that observed bucket), or its latest actual start if width is unavailable.
It does not assert complete coverage of the requested window. Without time-series
points, measurement as-of is unknown (`null`). Runtime `retrievedAt` separately
records client receipt time. These are normalized runtime fields, not invented
native response fields or authored bindings.

If the raw download is unavailable (including published-page CSP/CORS blocking),
the adapter can read the **first data row** of the single matching column in
`# Results`. The card and Proof KPI label say **formatted text; may be rounded**.
This fallback has no time series or measurement timestamp (`observedAt: null`);
receipt time is separate. Invalid/conflicting structured data, downloaded invalid
JSON, cancellation and tool errors never trigger fallback. Empty or nonnumeric
first rows remain unobserved. No additional network permissions are requested.

Live Proof charts use the primary signal's `observedAt`. The mixed-provider coordinator gives
legacy adapter signals their own latest point as-of (or their source's carrier
time for aggregate-only samples or an explicit total descriptor) before combining sources. Direct host samples
without signal as-of keep the existing carrier-time clipping policy. An explicit unknown signal as-of stays unknown.
The mixed carrier timestamp is a newest-observation summary, never authority to
clip a different signal's series. Historical charts still use the selected exact
day endpoint. Actual bucket starts remain unchanged for Since Done evidence;
no points or Done events are shifted to the client clock.
No implicit rate conversion is performed.

For hosted results, only HTTPS `mcp.honeycomb.io/query_results/<token>` retrieval is supported, with
credentials omitted, no referrer, redirects rejected, a 15-second timeout and a
1 MiB streamed response cap. Abort follows Metrics off, destruction and binding
changes. A CSP/CORS or response transport failure may use the labeled scalar fallback; no alternate endpoint
or EU host is guessed. Signed URLs are never stored in the spec, runtime map,
notes or UI links. An authored safe link takes priority over the returned
`query_url` on `ui.honeycomb.io`.

The local mock returns exact raw JSON in MCP `structuredContent`; a namespace
may expose this as an object `payload`. The adapter accepts these explicit raw
objects after bounded deep JSON validation (1 MiB UTF-8, 24 levels, 50,000 nodes),
then applies the same aggregate/series checks as downloaded results. Invalid,
oversized or conflicting raw objects stay unobserved; text tables are never a
fallback for invalid or conflicting raw objects. This mock-only transport is not a claim about hosted Honeycomb output.
Mock COUNT counts hourly measurement rows, not requests or spans.

While visible and Metrics is on, the controller refreshes no faster than once a
minute: one `run_query` and at most one raw download per Honeycomb signal. Consent
uses the shared Allow action without replacing Jira/Grafana's pending action.
Paint does not query. Selecting an uncached historical window queries Honeycomb directly; Today refreshes when revisited. Trace/exemplar retrieval is a separate #947-coordinated leg;
this metrics implementation does not complete all of #946 or fabricate trace IDs.

Evidence: [official tools reference](https://docs.honeycomb.io/integrations/mcp/tools),
[official agent-skill CI run 38212733085](https://github.com/honeycombio/agent-skill/actions/runs/38212733085)
at `6bb09279fc3fb69abf113228be939dbb929e34f1`. The test fixture preserves the
redacted recorded metadata envelope; numeric raw fixtures follow the official
result-interpretation schema and are explicitly synthetic. End-to-end mock tests
call the actual mock `tools/list` and `handleMcp` implementations over the shared
timeline; they verify the recorded `from` field and clearly labelled structured
transport. No live Grafana or
Honeycomb account was available for validation; artifact-specific CSP/CORS and
current authenticated connector metadata remain deployment checks.

Provider trace retrieval and the runtime-only #947 selection API are documented in
[provider-traces.md](provider-traces.md). Existing scalar calculation bodies keep
their exact-result contract; explicit native raw wrappers are trace intent.

### Production and telemetry Activity

A carrier's existing Work status popover includes Production when the permitted
telemetry map has measured evidence. It uses the same configured window, actual points,
deploy markers and safe authored-first link as the panel. Since #1202 it reads exactly like
the Trace view's metrics popup: one verdict line with the metric state and its explanation
(no Jira state, proof words, Done marker or Since Done line); failed limits name their
signal, measured value and limit. Missing values stay unobserved; measured zero stays zero.
Jira state belongs to the popover's Tickets: one row per ticket (#1198) with the key, the
title on one line (the full title in its tooltip), any PRs or staleness, and the status chip
at the right; a ticket detail takes a second line and the owner is not shown. The Proof
table's Since Done column keeps known Done and first observed traffic times in local time
(for example "Nov 5, 7:00 AM"), plus explicitly measured totals when their interval
matches Done as described below; window rates are not lifetime totals. Local,
imported and asynchronously loaded detail carriers use their carrier identity and
own binding scope. Refreshes and day selection update an open Production block
without replacing its focused link or close control.

Mixed telemetry Activity uses each signal's measurement as-of, with a separate
replay watermark per signal; newer peer or receipt times cannot date an older
signal's event or suppress its next accepted observation. Ratio thresholds watch
both bound inputs; a crossing uses the latest actual as-of among changed values,
not an unchanged newer input. Missing inputs remain unobserved; older or
conflicting same-time inputs cannot generate crossings. Legacy host signals
without their own as-of retain carrier-time behavior. First-traffic facts supplied
by the proof engine span all rate-like signals and retain their actual point
timestamp; a peer's traffic is not attributed to a silent primary signal.

Activity combines Jira changes and typed telemetry observations in timestamp
order, newest first, with 20 entries total. Telemetry records first observed
positive traffic after a known Done time, a measured threshold crossing, and
silent whole-hour milestones after Done while no traffic has been observed.
Unknown timestamps say “time unavailable.” A paint, Jira-only refresh, or historical
day selection cannot generate telemetry Activity. New live observations held during
history are consumed once on Return Live. Binding replacement/removal retires the
old scope; clearing or disabling telemetry removes its events and Production while
preserving Jira Activity and the selected Over time day. No queries originate from
Evidence rendering or link preparation; selecting an uncached history window may query.

Initial host telemetry preload remains accepted before the first Metrics decision. An explicit Metrics off (including off before the first enable), capability removal, or destroy retracts evidence and rejects late `apply()` callbacks. Capability recovery stays off; an intentional enable accepts fresh observations. `clear()` retracts the current map without disabling a current session, so provider recovery can still supply its next observation.

A host/provider can explicitly supply a measured long-window total on a runtime
signal result (this is **not an authored spec field**):

```json
{"observedAt":"2026-11-04T12:00:00Z","signals":{"rate":{"value":1200,"unit":"events","aggregate":{"kind":"total","from":"2026-11-04T11:00:00Z","to":"2026-11-04T12:00:00Z"}}}}
```

`aggregate` declares that the signal's original `value` is a measured total over
that exact interval. Normalization requires a finite nonnegative value no larger
than `Number.MAX_SAFE_INTEGER`, valid `from < to`, and an explicit valid
signal `observedAt >= to` (carrier `observedAt` for legacy samples without a signal
as-of). An explicit unknown signal as-of cannot borrow a peer's time. Invalid metadata is dropped without discarding a valid
ordinary headline. Proof's Since Done column shows the named bound
signal's total only when `from` exactly equals the actual Done timestamp (the popover's
Production block has no Since Done line, #1202). It
retains the original measurement value and unit, including zero, and displays the
through timestamp alongside the existing Done/first-traffic facts. Changing Done
removes a mismatched total. History endpoint projection drops aggregate metadata;
this version does not display totals in historical views, including embedded days.

Current standard MCP adapters do not invent long-window queries or total
semantics. Ordinary values, rates, series sums, and first-traffic measurements are
never reconstructed into since-Done counts. A composing host/provider must retain
each descriptor with its own signal and observation bounds, without borrowing a
peer signal's value or timestamp. No account validation is implied by host/mock
contract tests.

### CloudWatch signals

CloudWatch uses a structured `cloudwatch` signal alongside the other sources, on
all local/imported nodes and edges. See the [CloudWatch authoring example](../.claude/skills/live-status-board/metrics.md#cloudwatch-window-totals).
Required query fields are `namespace`, `metric`, `region`, `accountId`,
`dimensions` (string values, preserving case), and `statistic` (`Sum`, `Maximum`, `Minimum`, `Average`, `SampleCount`). The datasource UID is
`tracking.telemetry.grafana.cloudwatch`. Shared or environment-profile
`grafana.accountId` replaces `$account` / `${account}`; an explicit signal account
remains literal. Existing `$env` substitution applies to nested dimension values.

The artifact requests `query_cloudwatch` only for bound CloudWatch signals.
Tool discovery diagnoses a missing query tool before any data call.
Each request uses one absolute start/end pair for the page window. The default
period is 300 seconds for windows up to 6h and 3600 seconds for 24h/48h;
longer windows choose bounded coarser periods. Optional positive integer `period`
uses regular CloudWatch multiples of 60 seconds, at least 300 seconds for data
15–63 days old and 3600 seconds beyond 63 days. Invalid periods, more than 1440
points, or starts beyond 455-day retention are diagnosed before querying.
Returned timestamps are sorted and must lie within the requested window, allowing
the first rounded boundary bucket. Boundary buckets can cover a partial window;
the headline and graph use the same returned buckets, without prorating.
`Sum` and `SampleCount` sum bucket values; `Maximum`/`Minimum` take their extrema.
`Average` weights each bucket by its underlying SampleCount from a paired query
with exactly the same range/period. Missing, invalid or mismatched weights leave
Average unobserved, never the last bucket or an unweighted mean. Tool summaries
such as `statistics.avg` and `statistics.count` are not underlying sample weights.
Actual series remain timestamp-spaced, including isolated points and gaps.
Empty arrays normally mean no data points yet; `missingMeansZero: true` opts only
successful empty results into zero. Malformed/error results never become zero.

Argument names match the [upstream CloudWatch tool](https://github.com/grafana/mcp-grafana/blob/main/tools/cloudwatch.go).
User verification on 2026-11-05 reported that the us-east-1 monitoring datasource
requires a linked account ID (staging `646998985045`); omitting it returned empty
arrays with hints. Repository checks replay the response and make no live calls.

### Company AWS account defaults

A fork can define account aliases once in `company/company.json`:

```json
{
  "version": 1,
  "awsAccounts": {
    "qa": {"iot": "000000000001", "queue": "000000000002"},
    "stg": {"iot": "111111111111", "queue": "222222222222"},
    "prd": {"iot": "333333333333", "queue": "444444444444"}
  }
}
```

These synthetic IDs illustrate the shape; use your own 12-digit **strings**.
The registry supplies defaults for existing `${iot}` / `${queue}` references in
any signal string, such as CloudWatch `accountId`, dimensions, Logs ARNs and
PromQL. Precedence is company selected-environment defaults, then board shared
`tracking.telemetry.variables`, then `environments.<id>.variables`.

The board still declares its own environment profiles and default. The registry
never adds choices or chooses an environment. An absent alias in the selected
environment does not fall back to another environment; that signal remains
unobserved with a variable diagnostic. Other valid signals can still refresh.
Template parameters expand first, then the environment pass runs once; inserted
values are not recursively expanded. `$env`, `$account` and literal `$aws`
retain their existing behavior.

Builds compile these defaults into portable viewers, native modules and validators;
readers never fetch company configuration and switching environments does not
edit the document. Rebuild after changing the registry. `--no-config` or
`FLOWVIEW_COMPANY_IDENTITY=off` omits it. CONNECT instructions, focused authoring
packets and offline kits carry the same environment/alias mapping. Account IDs
are public configuration context in exported artifacts, not credentials.
Environment IDs start with a letter and allow letters, digits, `_` and `-`;
aliases allow letters, digits and `_`, starting with a letter. `env`, `account`,
`constructor`, `prototype` and `__proto__` are reserved. Arrays, numeric IDs,
unknown company fields and malformed entries fail the build with their field path.

### Narrowing inherited signals

A board that imports a canon diagram can narrow a metric signal it inherits without
restating the provider's query (#1344, #1348, #1354). It writes the narrowing in the
provider's own query language under the signal's `narrow`, keyed by the signal's source,
in the import's `nodeTracking` or `edgeTracking` `extends` overlay (a local signal may
carry `narrow` too). Flowview appends it to the query when the query is built and never
translates, escapes or reorders it:

| Source | `narrow` value | Applied as |
|---|---|---|
| `honeycomb` | `{"filters": [{"column": "event_code", "op": "=", "value": "FULL_CHARGE"}]}` (one fragment or a list) | filters appended after the provider's; `calculations`, `havings`, `orders` and `breakdowns` stay |
| `cloudwatch` | `{"dimensions": {"NotificationType": "FULL_CHARGE"}}` | dimensions added to the query's (CloudWatch matches the whole dimension set, so the metric must be published with that dimension) |
| `loki` | one LogQL stage, or a list (below) | each stage at the end of every log pipeline: after the selector's stages, before an inherited `unwrap` stage, a `[range]`, a closing `)` or the end; every leg of a ratio |
| `grafana` (PromQL) | matcher text (below) | into every vector selector: inside its `{…}` after a comma, or as `{…}` after a bare metric name; `by`, `without`, `on`, `ignoring`, `group_left` and `group_right` lists are skipped |
| `cloudwatchLogs` | one Logs Insights `filter` command, or a list (below) | a `filter` command before the first `stats`, or at the end; also into `breakdown.query` and `trend.query` (a failure there stops only that query) |

```json
"nodeTracking": {"dcf": {"telemetry": {"extends": true, "signals": {
  "received": {"narrow": {"honeycomb": {"filters": [{"column": "event_code", "op": "=", "value": "FULL_CHARGE"}]}}},
  "sent":     {"narrow": {"loki": ["| json", "| event_code=\"FULL_CHARGE\""]}},
  "dropped":  {"narrow": {"loki": "|= \"FULL_CHARGE\""}},
  "notified": {"narrow": {"grafana": "type=\"full_charge\""}},
  "warned":   {"narrow": {"cloudwatchLogs": "filter messageType = \"FULL_CHARGE\""}}}}}}
```

A Honeycomb filter is `{column, op, value}` with `op` one of `=`, `!=`, `>`, `>=`, `<`,
`<=`, `starts-with`, `does-not-start-with`, `ends-with`, `does-not-end-with`,
`contains`, `does-not-contain`, `exists`, `does-not-exist` (no value), `in` and
`not-in` (a list of values). Fragments may use `${name}` variables; they are filled in
before the narrowing is applied, and a text fragment is checked again afterwards ("After
its variables were filled in, … is not valid").

**Text fragments are checked, never trusted.** Strings are masked first, so structure is
read only outside them; anything that is not exactly one appended stage or matcher
fails closed:
- LogQL: one line filter (`|=`, `!=`, `|~`, `!~`, with `or` chains of strings), one label
  filter expression (`| a="x"`, `| a=~"x|y" and b!="z"`, number comparisons,
  parentheses) or one parser (`| json`, `| logfmt`, `| unpack`, `| regexp "…"`,
  `| pattern "…"`). Refused: a second `|`, `{ } [ ]`, `#`, a newline, unbalanced quotes
  or parentheses, and `line_format`, `label_format`, `unwrap`, `drop`, `keep`,
  `decolorize`, `distinct`, which change what is counted.
- PromQL: `label op "value"` joined by commas, with `=`, `!=`, `=~` or `!~`; anything
  else (a `}`, `or`, `unless`, a trailing comma, an unquoted value) is refused.
- Logs Insights: one `filter` command; a `|`, `#` or newline is refused, and so is any
  `/` outside a quoted string: no regex literal and no division ("a Logs Insights
  narrowing may not contain / (use like "text" or a quoted string)"). A `\` is refused
  too, so the check never depends on how Logs Insights reads escapes (use the other
  quote kind). `like "text"` works, but pins nothing.
- In the provider's Logs Insights query, a `/regex/` is read only after `parse` and its
  field at the start of a command, or after `like`, `not like` or `=~` that follow an
  operand; any other `/` is a division. The provider's text is kept as written: the
  filter is spliced in at one point. Before that point only `fields`, `filter`,
  `filterIndex`, `parse`, `sort`, `unmask`, `unnest` and `SOURCE` may appear; any
  other command (`limit`, `dedup`, `pattern`, `diff` …) is not shown, named in the
  reason; so is a regex after `like` or `=~` that Flowview cannot read.

- **Merge.** Fragments accumulate in order: the provider's, then each importing level's
  (an identical fragment once). The provider's query stays literal, so its later
  changes still reach the board, narrowed. Nested imports and the same canon imported
  twice narrow each level and each import on its own.
- **No widening.** A board cannot remove a narrowing or a `needsNarrow` the provider set;
  `null` for either is ignored with a warning at the overlay.
- **`needsNarrow`** on a provider signal (`["event_code"]`, or `true`) says every board
  must narrow it. It is met when a fragment pins each field to chosen values: a
  Honeycomb filter with `=` or `in` and a value, a CloudWatch dimension, a PromQL or
  LogQL label `=` with a value, or a Logs Insights `field = value` or `field in [...]`
  in a top-level `and` chain (no parentheses or function calls). A text fragment with
  `or` (or `not`) pins nothing. A LogQL `|=` line filter meets `true` when every
  alternative is non-empty (`|= "x" or ""` matches every line). A filter that
  only tests the field (`exists`, `!=`, `not-in`, `does-not-exist`, `contains` …) still
  counts every value, so it does not count. `true` needs one pinning filter. Lists join
  across levels, so a re-exporter can require more, never less. A replacing binding
  (no `extends`) keeps the provider carrier's requirement on every signal it writes, so
  a restated query is not shown unless it narrows too, also a signal a `use` template
  writes (the requirement is kept on the binding); the validator warns at the overlay,
  naming those signals. A signal an `extends` overlay adds to such a carrier keeps the same
  requirement, with the same warning: `needsNarrow` belongs to the canon carrier.
  `needsNarrow` can also be written on a binding (`telemetry.needsNarrow`), where it
  applies to every signal of that binding, also those a template writes. A replacing
  binding's own value can only add to the carrier's; `false`, `[]` or anything else is
  ignored with a warning.
- **Fail closed.** The signal is not queried and reads unobserved, with the reason in
  Proof ("Not shown: …") and the Metrics note, when: `needsNarrow` is unmet; a fragment is in another source's
  language (also after a source switch); a fragment is malformed; the Honeycomb query
  combines its filters with `OR`; a CloudWatch dimension is set to two values; the
  source is Grafana SQL or Tempo (write a `${name}` placeholder in the provider's query
  instead); the signal is a Honeycomb trace search (`query_spec`); or a text fragment
  cannot be placed: no stream or vector selector, unbalanced strings or brackets, a `#`
  comment, a token Flowview does not recognise, a PromQL `$var` outside a string or
  range, a LogQL line filter after an inherited `line_format`, a LogQL label filter after
  an inherited `drop`, `keep` or `label_format`, or a Logs Insights command other than
  `fields`, `filter`, `filterIndex`, `parse`, `sort`, `unmask`, `unnest` or `SOURCE`
  before the insertion point. PromQL keywords (`BY`, `OR`, `Inf` …) are read in any
  case.
- **Validator.** A fragment fault as written warns where it is written, on any page. An
  unmet `needsNarrow`, an `OR` query, a dimension conflict or a fragment that cannot be
  placed warns only on a page with a live-status panel, so a canon page that asks boards to narrow still builds.
- **Display.** Proof names the applied fragments ("Narrowed: event_code = FULL_CHARGE").
  No link opens an unnarrowed query: a board that narrows an inherited signal does not
  get the provider's signal-level or carrier-level `links.query` unless it sets its
  own; a narrowed signal's card never falls back to the carrier's query link; and a
  signal that is not shown loses its query links. The text view prints "Not shown:
  <reason>" in place of that signal's query. A carrier's `links.dashboard` stays: it
  opens the provider's own dashboard, which is not narrowed.
- Pages need `flow.telemetry-narrow`.

### Variable scopes

A `${name}` in a signal is filled from the nearest scope that sets it (#1344, #1357):

1. the carrier: `telemetry.variables` on a node or connection, local, provider, or in an
   import's `nodeTracking` / `edgeTracking` overlay (with or without `extends`);
2. the import: `topologyImports[i].variables`, for every node and connection of that import;
3. the environment profile: `tracking.telemetry.environments.<id>.variables`;
4. the board: `tracking.telemetry.variables`;
5. company AWS account defaults.

```json
"topologyImports": [
  {"spec": "dcf-canon", "export": "core", "as": "fc", "variables": {"code": "FULL_CHARGE"}},
  {"spec": "dcf-canon", "export": "core", "as": "et", "variables": {"code": "EARLY"}}]
```

The same canon imported twice reads one value per import. Names follow the board's
rules (`env` and `account` are reserved; values are non-empty strings). Scoped values are
literal, never expanded, and the same in every environment.

- **Set once.** Across nesting levels the value nearest the provider is kept: a provider
  carrier's own value, then each importing level's. A different value set further out is
  ignored with a warning where it is written ("${code} is already set to "MIDDLE" nearer
  the provider; this value is ignored"). A provider page's board-level variables do not
  travel with an import.
- **Never escaping or widening.** A scoped value is filled into the provider's query only
  where it cannot change its meaning. Otherwise the signal is not shown: "Variable
  ${code} from this import or carrier cannot be filled in safely here (…), so the signal
  is not shown. Use another value, or copy the provider's query and edit it."
  - **One allowlist, everywhere.** A value may hold only letters, digits and `_ . @ :`,
    with `-` only between two of those (never first or last, never `--`). A space is
    allowed only inside a string of a query the scan can read. So no value holds a quote,
    `\`, a bracket, a brace, `<`, `>`, `%`, `*`, `|`, `#`, `/` or `$`, and none can end a
    string, a template or a comment in any of the five languages.
  - **Regexes.** Inside a regex (`=~`, `!~`, `|~`, a Logs `/regex/`, a `label_replace`
    string argument in PromQL or LogQL other than a matcher in its selector, a LogQL
    `regexp` or `pattern` string) a value may not hold `.`.
  - **SQL patterns.** If a SQL query uses `LIKE`, `ILIKE`, `SIMILAR`, `~`, `REGEXP`,
    `RLIKE`, `PATINDEX`, a `regexp_…` function or `substring … from` anywhere, no value in
    it may hold `_` or `.`, wherever it sits. A value such as `full_charge` needs a query
    compared with `=` only.
  - **Bare values are numbers.** Outside a string a value takes only a number or a
    duration (`200`, `0.25`, `1.5e3`, `5m`, `1h30m`, `250ms`), in every language and every
    position: comparisons (including PromQL `> bool …` and Logs Insights `in [ … ]`),
    arithmetic, function arguments, `IN ( … )`, `BETWEEN`, `LIMIT`, `OFFSET`. A field name
    there would compare or count a field instead of a literal. A name is filled in only:
    - inside a PromQL or LogQL `by ( … )` or `without ( … )` label list (any case), which
      only changes grouping; the name holds only letters, digits and `_` and does not start
      with a digit;
    - as a TraceQL `status` value (`error`, `ok` or `unset`) or `kind` value
      (`unspecified`, `internal`, `server`, `client`, `producer` or `consumer`).

    A SQL `IS` (or `IS NOT`) also takes `NULL`, `TRUE` or `FALSE`. A SQL table name (after
    `FROM` or `JOIN`) and a PromQL vector-matching label list (`on`, `ignoring`,
    `group_left`, `group_right`) never take a name, because a broader table or a label
    neither side carries would count more than the provider meant: "a table name cannot
    come from a telemetry variable", "a vector-matching label cannot come from a telemetry
    variable".
  - **Ranges.** Inside a PromQL or LogQL `[range]` a value may not hold `:` (it would make
    a subquery).
  - **Comments and strings.** The scan skips the provider's comments (SQL `--` and block
    comments; `#` in PromQL, LogQL and Logs Insights). A placeholder inside one is refused.
    A placeholder in a string that never closes is refused in every language. TraceQL
    strings are `"…"` and `` `…` `` only.
  - **SQL the scan cannot read.** A SQL query with any of these refuses every scoped
    value, naming the form: a string that never closes, a `[bracket]` identifier,
    `q'…'` quoting, triple quotes, a `--` not followed by a space or line end, a `#`,
    `$$` or `$tag$` quoting, a nested or unclosed block comment, a backslash before a
    quote, `UESCAPE`.
  - A narrowing fragment that uses a scoped value takes the same rules and is checked
    again after it is filled in. Board-wide and profile variables keep their meaning.
- **SQL and Tempo.** A provider that wants boards to choose a value writes a `${name}`
  placeholder in its query (in a string for SQL: `WHERE code = '${code}'`); the import
  sets it. This is the route for sources that cannot be narrowed.
- **Unset.** An unset variable keeps the signal from being sent: "Set telemetry variable
  ${code} for this import, this node or connection, or the active environment." On a page
  with a live-status panel the validator checks every environment profile and warns at
  the signal, naming the environments without a value and where to set it.
- Pages need `flow.telemetry-scoped-variables`.

### When narrowing or a variable cannot express the filter

If a narrowing fragment or a scoped variable is refused (the signal shows "Not shown: …")
or cannot express the filter the board needs, copy the provider's query into a replacing
binding for that carrier (a `telemetry` overlay without `extends`) and edit the copy there
(#1360). Two things follow:
- The copy no longer follows the provider: later changes to the provider's query, signals
  or limits do not reach this board.
- A provider `needsNarrow` still applies to every signal the copy writes, so the copy is
  shown only when its own `narrow` pins those fields (see
  [Narrowing inherited signals](#narrowing-inherited-signals)). Editing the copied query
  text does not meet it.
- The copy still receives the import's and the provider's scoped variables, so replace a
  refused `${name}` placeholder with the literal value in the copy rather than keeping it.

The reasons name this way out where copying helps:
- the provider's query cannot take the narrowing (a LogQL `drop`, `keep`, `label_format`
  or `line_format`, a Logs Insights command before `stats`, no stream selector, and the
  like) or a Honeycomb query combines its filters with OR: "… Copy the provider's query
  and edit it.", or, with `needsNarrow`, "… Copy the provider's query and edit it, keeping
  a narrowing that pins what the provider requires.";
- a malformed narrowing on a signal without `needsNarrow`: "… Change the narrowing, or
  copy the provider's query and edit it.";
- a refused scoped variable: "… Use another value, or copy the provider's query and edit
  it."

A malformed narrowing under `needsNarrow` and an unmet `needsNarrow` do not, because a
copy must still carry a valid narrowing that pins. The SQL and Tempo "cannot be narrowed"
reason keeps its own route: a provider `${name}` placeholder that the import sets.

### Named environment variables and counting scope

Put shared string defaults in `tracking.telemetry.variables`, with per-profile
`environments.<id>.variables` overrides. `${iotAccount}` and `${queueAccount}`
can appear in **any signal string value**: Logs ARNs/query/region, metric
dimensions/account, PromQL, LogQL, SQL, Honeycomb filters, Tempo, `unit` and
`scope`. `$account` / `${account}` still uses effective `grafana.accountId`;
`$env` / `${env}` uses the selected deployment. `account` and `env` are reserved
variable names. `$__interval`, `$__rate_interval` and literal `$aws` stay intact.

Template parameters expand first (declared parameters win their original
template occurrences); parameter values may intentionally contain environment
references. Then one environment pass resolves shared variables overridden by
the active profile, consistently for local and imported templates. Carrier
signal overrides use that same environment pass. Arbitrary environment names
require `${name}`; only legacy `$env` and `$account` also accept bare syntax.
Inserted environment-variable values are literal and never recursively expanded.
Unknown `${name}` blocks the affected query with a configuration reason. When
only an optional Logs `breakdown` is affected, the scalar still refreshes; a
missing variable in the scalar or shared signal fields blocks the whole signal.
Never interpolate user secrets; profiles and queries are shipped in the artifact.
The source and authored default environment stay unchanged when readers switch.
The desktop editor's shared/profile variables JSON and structured query controls
round-trip with one Undo/Redo per edit.

A signal may author `scope: "topic $aws/rules/camera_message_power_state · account ${iotAccount}"`.
Scope is displayed on the card and in Proof and uses the active environment.
Without explicit scope, CloudWatch `RuleName` means “this rule only”, `QueueName`
means “queue only”, and AWS/IoT PublishIn.AuthError / Connect.AuthError with only
account/protocol dimensions mean “all topics / whole account” / “all connections /
whole account”. Other dimensions, edge titles and arbitrary Logs query text never
establish topic scope. Use `unit: "refused publishes"` to read “15 refused publishes”
with the card’s “24h window” context.

Metric tiles in the card popup (Jira and Trace views, #1194) are one row per metric:
the bold label, the metric's graph, and one small line `<scope>: <value>`, for example
`orders-queue: 1,240 msgs/day`. The primary signal's row holds the popup's main chart
(with its Done and deploy markers); every other metric with a series gets its own small
graph. The tile scope is the authored `scope` as written, else the CloudWatch queue or
rule name, or “All topics · whole account” / “All connections · whole account”; it never
carries the account ID. A tile does not repeat the scope of the tile just before it. An
authored empty scope (`"scope": ""`, or **hide scope** in the Workbench Metrics editor)
hides the scope everywhere: tile, card, Proof predicate and Inspect. A scope of only
spaces is ignored with a validator warning. An absent scope keeps the generated text.

### CloudWatch Logs Insights

A `cloudwatchLogs` signal is a structured object with `logGroups` (nonempty
strings), `query`, `region`, optional `valueField` and optional `breakdown`. It uses the same
`tracking.telemetry.grafana.cloudwatch` datasource UID as metric queries.
Use full log-group ARNs for linked source accounts, and don't mix ARNs and names.
The artifact declares `query_cloudwatch_logs` only when a local/imported/template
Logs signal exists. Each refresh sends `{datasourceUid, region, logGroups,
queryString, start, end, limit: 100}` using the page window (`now-24h` to `now`).

The first row's named field, or first column when no field is specified, must be
numeric. No arbitrary numeric-cell scanning. A Complete response with empty
`logs` and `totalFound: 0` is a successful empty count, zero. With any row,
`totalFound` is never the aggregate: it may describe matched input records.
Failed/running/timeout queries, missing groups/permissions/fields, or malformed
results are unobserved with a one-line reason. Failed refreshes clear old Logs
and metric values. Generic empty-result hints alone do not invalidate Complete
zero. Hosted `payload`, raw MCP `structuredContent`, and JSON text wrappers are
supported; error wrappers never become observations.

The [Grafana Logs tool source](https://github.com/grafana/mcp-grafana/blob/main/tools/cloudwatch_logs.go)
returns `{logs: []map[string]string, totalFound, status, hints?}` and polls for
completion. Repository tests replay this contract; no live connector/account
verification is claimed. Live and selected-day history use the same bounded series contracts.

See the validated [device → IoT → queue example](../examples/cloudwatch-log-signals/cloudwatch-log-signals.spec.json).
The queue name `camera_message_power_state_${env}` is illustrative: replace it with the real queue name before querying. No queue metric was live verified here.
Its exact-topic filter uses AWS's documented `topicName`, with eventType
`Publish-In`, status `Failure`, and supplied reason `AUTHORIZATION_FAILURE`.
[IoT log schema](https://docs.aws.amazon.com/iot/latest/developerguide/cwl-format.html).
Staging IoT is `646998985045`, staging queue is `551960222585`; production IoT
is `139648982912`. Production `970642438387` is an **SNS** account and is not
used as SQS. QA accounts and production SQS were not supplied: those variable
values are deliberately absent, so affected signals remain unobserved until
configured, with no wrong-account call.


### Grouped log details and text extraction

An optional `cloudwatchLogs.breakdown` requests a second, authored Logs Insights
query. The scalar query remains the authoritative total on the card and in Proof.
For example, scalar 15 and returned device counts 12 + 2 still display total 15.
Neither grouped-row sums nor connector `totalFound` replace that total.

The illustrative AWS IoT recipe below uses the documented JSON `clientId` field,
which is a client identifier, not necessarily a unique physical device. Keep the
same exact-topic/failure filter in the scalar and grouped queries. No production
device-ID format or live account result has been verified.

```json
{
  "query": "filter eventType = \"Publish-In\" and status = \"Failure\" and reason = \"AUTHORIZATION_FAILURE\" and topicName = \"$aws/rules/camera_message_power_state\" | stats count() as n, latest(reason) as sampleReason by clientId | sort n desc | limit 20",
  "labelField": "clientId",
  "valueField": "n",
  "title": "Publish failures by client",
  "labelTitle": "Client ID",
  "valueTitle": "Failures",
  "columns": [{"field": "sampleReason", "label": "Latest reason"}],
  "limit": 20
}
```

Place that object under `cloudwatchLogs.breakdown`. It inherits the signal's
log groups, region and datasource, including environment variables. Both calls
use one absolute ISO start/end pair anchored at refresh start, with the selected
page window (including aliases such as `now-6h`). An eligible count query also receives an independent trend call; all calls use the same absolute bounds. The details
call follows scalar success in the same bounded provider task; it introduces no
additional polling. Scalar failure skips details. Details failure clears old rows
and displays a one-line error while retaining a successfully read scalar. Missing
variables only inside `breakdown` skip that optional query and show its
configuration error while the scalar still refreshes. Missing variables in the
scalar query or shared fields block the whole signal.
Environment changes, Metrics off and controller destruction retire both calls.

For a **synthetic** line `device_id=cam-123 issue=publish_failed`, an explicit
text-extraction recipe is:

```text
filter @message like /issue=publish_failed/
| parse @message /device_id=(?<deviceId>[^ ]+)/
| stats count() as n, latest(@message) as sampleMessage by deviceId
| sort n desc
| limit 20
```

Choose `labelField: "deviceId"`, `valueField: "n"`, and optionally
`columns: [{"field":"sampleMessage","label":"Latest sample"}]`. The scalar
query uses the same issue filter followed by `stats count() as n`. Adapt the
extraction to an actual log sample; it is not an automatic parser or a claim about
the user's production format. To filter one known device, author an explicit
`filter deviceId = "cam-123"` after `parse` in both queries. AWS documents
[parse and named captures](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-Parse.html)
and [stats grouping](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-Stats.html).

The schema requires nonempty `query`, `labelField`, `valueField`. Optional
`title`, `labelTitle`, `valueTitle` customize headings. `columns` selects at most
four text fields as `{field,label}`; raw log rows are never dumped by default.
Field names and headings are at most 80 characters. `limit` defaults to 20 and
must be an integer from 1 to 100; it bounds the connector request and displayed
rows. Displayed labels and text cells are capped at 500 characters with a visible
shortening notice. Counts must be finite and nonnegative; numeric strings and
zero are accepted. Missing/blank group labels or missing/invalid counts reject
the details visibly instead of hiding rows. Missing optional text cells show
`(missing)`; non-text cells reject the details. All text uses textContent.

The existing **Live status** panel shows default-collapsed Log details sections
identified by carrier and signal, including local/imported nodes and edges and
loaded details. Tables scroll within 280 pixels. Expansion and keyboard focus
survive ordinary refreshes in the same view; environment/binding/page changes
and Metrics off clear their identity and state. With no authored Live status
panel, the scalar card still works; add `{ "type": "live-status" }` to see details.
The UI reports displayed rows, actual returned rows and the configured display
limit. Even fewer rows than the limit do not prove complete group coverage:
the authored query may have its own smaller limit. Empty Complete details mean
no grouped rows returned, not a failed query or necessarily a zero scalar.
Latest reason/sample columns are representative text, not a most-frequent cause.
Details do not create successful-traffic animation or a measured aggregate.

Native hosts can supply `signals[name].breakdown` with `status: "complete"`,
`range: {from,to}`, `limit`, `returnedRows`, and `rows: [{label,value,cells}]`, or
`status: "error", error`. Native normalization applies the same bounds and rejects
malformed details while preserving a valid scalar. `returnedRows` means rows
actually returned, never input records matched or a total group count. This is
runtime evidence; it is not saved into the document. Desktop structured query
editing preserves the authored breakdown through Undo/Redo.

### Evidence eligibility and empty observations

PROVEN requires a bound numeric signal with an observed finite value and an
authored finite `proof.<signal>.min`, with applicable limits holding. Per-time
units classify traffic for silence and timing; they do not supply that minimum.
Done carriers lacking this measured minimum read **DONE · traffic not measured**;
observed silence and explicit failing thresholds retain their own diagnostics.
An arbitrary event count or errors=0 alone cannot prove traffic or imply LIVE EARLY.
Tempo and Honeycomb `query_spec` bindings are trace evidence: they never create
numeric cards, preview values or proof, including imported/loaded carriers.
Inspect headings use the active environment key (for example **STG Evidence**),
or **Evidence** when no environment is selected.

Successful empty CloudWatch `values` and `timestamps` mean **no data points yet**,
not a failed query. Optional query boolean `missingMeansZero: true` opts only
that successful empty shape into zero; absent/false stays unobserved. Errors,
timeouts and malformed results never become zero. A real numeric zero remains
observed. For live Loki, successful empty numeric count/rate queries become zero
only for recognized `count_over_time`/`rate` log-range expressions and `sum`
wrappers (including by/without grouping), with a duration or `[$__range]` as the
range. Raw logs, arbitrary expressions and
misleading function names inside strings remain unobserved. Daily history keeps
its existing contract. Honeycomb COUNT caveats belong to Honeycomb evidence only.
A `loki` or `grafana` signal with `missingMeansZero: false` keeps every successful
empty result unobserved ([Empty Loki and Prometheus results](#empty-loki-and-prometheus-results)).

Named numeric rows, compact scope and per-signal source links follow the [edge metric card contract](#edge-metric-cards); their display does not change proof eligibility.

Optional signal labels and query URLs have their own environment substitution.
An unresolved variable drops only that display field (label falls back to the
signal name); missing variables in the actual metric query still block it.

### Logs trends

The scalar query remains the authoritative headline; neither bucket sums nor
`totalFound` replace it. A plain terminal `stats count() as n` after only
`filter`/`parse` stages receives an automatic bucketed companion query. Other
pipelines are left untouched. Automatic bins use valid minutes/hours/days (never
`bin(300s)`, which AWS caps at 60 seconds), with at most 1000 returned rows.
Use `trend: false` to disable it, or explicitly author:

```json
{"trend":{"query":"filter status = 'Failure' | stats count() as n by bin(5m) as t","timeField":"t","valueField":"n","binSeconds":300}}
```

`binSeconds` is optional for explicit trends; when supplied it permits the first
bucket to start at the preceding bin boundary. All other timestamps must lie in
the requested window. No missing buckets are filled with zero. Exactly 1000 rows
is labeled potentially truncated; the independent scalar remains authoritative.
Scalar, trend and optional device breakdown share one anchored range. Trend or
breakdown failures clear their own old evidence while retaining a successful
scalar. Variables used only in either optional query cannot block the total.

### Domain summaries

A node with a detail target summarizes its own Jira tickets and Missing work plus
all descendant nodes and connections. Local detail-only sections participate even
before they are opened. Direct and nested imported nodes participate identically;
text boxes are excluded. Shared targets and ticket keys are deduplicated within
each summary. Existing status precedence applies, and an unknown ticket cannot
make a domain look Done. Missing work stays visible when tickets are all Done.

The domain popover explicitly describes its summary. External targets contribute
only after the detail controller has approved and loaded that exact spec/revision;
status traversal performs no fetch. Unloaded targets, URL-only targets, depth limits,
and recursive links retain unknown completion evidence. Explicit domain references
in steps use the same summary for their status and ticket caption. An ordinary edge
reference does not silently include its endpoint domains.

Summaries add no carriers or tickets to board totals, do not change telemetry
bindings, and do not make child work control the parent's `existsWhen` availability.
Live off restores the authored node appearance. Ticket editing and Missing work
clearing still address the original carrier; descendant work is edited at its source.

### Direct trace loading

Status → Trace can load one exact trace ID or a supported provider link using an inherited company or board [trace connection profile](trace-connections.md). Load/Verify are read-only session actions independent of Metrics polling. Imported and local nodes share authored traceMatch mapping behavior; choose the exact mapping diagram when several are available.

Selecting a span in the loaded trace shows its exact **Service** and **Operation** (#1078), the strings a step's `traceMatch.serviceName` and `traceMatch.operation` must match; copy them from there. A span that no step maps says "No authored step maps this span. Add a traceMatch to a step to map this span." and links to [Make an existing diagram Trace-ready](trace-ready-authoring.md). On a shared board in Edit mode, that span also offers **Map this span to a step**, which writes the two values to a step that has no `traceMatch` yet ([Edit mode](#edit-mode-on-the-shared-board-828)); add `nodeId`, `parentStepId` or `attributes` in the Workbench when one span name is not enough.

**Map a span by drag, chooser or dropdown (#1177).** In Edit mode (desktop) a span row in the waterfall drags onto a step (its step button or coin), which maps that step, or onto a node or edge. A carrier named by exactly one step that has no `traceMatch` maps that step; otherwise a chooser lists the carrier's steps, marking those already mapped ("mapped, replaces"), and the reader picks one or presses Esc. Drop targets highlight during the drag. The **Step to map** dropdown preselects nothing, lists only steps without a `traceMatch`, and its button reads "Map to step: <step>". A mapping from a drop on a node, directly or by a chooser pick after it, also writes `nodeId` for that node when the step names only that node (no `edge` or `edges`), so the node lights up at once. Mapping a step that already has a single `traceMatch` replaces its `serviceName` and `operation`, sets `nodeId` to the dropped node under that same rule and otherwise keeps the existing one, and keeps its other fields (`parentStepId`, `attributes`, `maxDurationMs`, `optional`), without a confirm; Undo covers it, and the change records the replaced pair as `replaces` (#1180). A step whose `traceMatch` is an alternatives array is shown disabled ("has alternatives; edit in Inspect"). Only the trace's own section takes a drop. The chooser names the dragged span; Esc or Cancel returns focus to the span row. After every mapping the panel says "Mapped <service> · <operation> to step <step>." with **Undo**, which takes back the latest pending mapping (one click each, newest first) until the next Save. Each mapping is one `trace-match` change on Save; an undone one leaves none. The re-render after a mapping, or any other Edit-mode change, keeps the loaded trace and the picked example trace (the pick stays selected), the selected span and its focus, and returns focus to the dragged span row. When live evidence for the picked carrier arrives with the same trace it takes over the pick; with another trace (a fresh default) it is listed beside the pick, marked "(your pick)", until the reader selects something else. A step button whose `traceMatch` is an alternatives array takes no drop and says "Has alternatives; edit in Inspect". When the mapped step keeps a `parentStepId`, `attributes`, `namespace` or `occurrence` that leaves the span missing, the note says nothing lights (`nodeId` only picks the node to annotate). **Declare on this node or connection (#1290).** A drop on a node or connection that maps a step at once leaves the "Mapped … to step …" note with a role select (a node: process, database, cache, call or work; a connection: send or receive) and **Declare on <title> instead**, which swaps the pending mapping for a declaration (`trace.spans.<key>` with the span's service, exact operation and the role; one pending change, and its Undo brings the mapping back). Where the chooser opens (several steps, or none), **Declare on <title>** is one of its choices. The key is a slug of the operation's last meaningful segment (`charge` for `grpc.msdemo.PaymentService/Charge`, `insert-orders` for `INSERT orders`), unique on that node or connection (a provider span this board hides keeps its name). A span the node or connection already declares under another key (same service, operation and role) is refused beside the button: "Already declared as <key> on <title>." An imported node or connection gets the span in this board's `nodeTracking` / `edgeTracking` overlay. The note then reads "Declared <key> (<service> · <operation>) on <title>." with Undo. A mapping that replaced the step's trace scope says "…; its trace scope was replaced."

### A loaded trace sets the day

A loaded trace is one request with its own start time, the earliest span's (#1145, D5). The request card
says "Started Nov 6 12:00 local". Loading it moves the view to that local day: Over time on that day, or
Live when it is today, also from Over time on today. Opening Over time for it (on a Jira-free board, the
local 7-day list) is part of the Load click;
when the history arrives, the view goes to the day of the trace loaded then, and stays in Live if there is
none (unless the reader clicked Over time) or it is from today. A history that arrives during a second
Load waits for it, so it loads once; if that Load fails or is cleared, the reader's own Over time click
still opens, and otherwise the history is dropped. When the day list has no such day, the view stays and the Load trace section says
"This trace is from Nov 3, which Over time does not list." A board where Over time cannot open stays in Live.
The reader moving the view to another day, or back to Live from a past day, clears the trace without a
call, and the section says "Cleared trace 8413cd87a9f1 (Nov 6): the view moved to Nov 7." until the next
view change. The reader's own Over time on today keeps a trace from today. The typed trace ID stays, and
log results stay across a move the loaded trace itself causes. Ticket colours on nodes follow the day
shown (D14). Opening a drill-down keeps the loaded trace; it is cleared when its mapping diagram goes away.
Example traces stay Live-only (D7): Over time retires one the reader chose with the same note; one the
reader never picked is not selected (#1164) and leaves without a note. A day change never says "Trace selection expired".

### Find a trace from a log line

Sometimes the field that tells requests apart is not on any span. A company's
camera model, for example, is never a span attribute, and Honeycomb `get_trace`
returns fixed columns without span attributes. The model is on a Loki debug log
line as structured metadata, next to the line's trace and span IDs:

```
line: "Handling camera stats message"
labels: {env: "stg", k8s_namespace_name: "<ns>", severity_text: "DEBUG"}
structuredMetadata: {cameraModel: "arch", deviceId: "<id>", trace_id: "1e4cef70fde7bde26ca79f1e74c05bcb", span_id: "b4be3d5412c33b2e"}
```

**Load trace** ([Direct trace loading](#direct-trace-loading)) can find such a line and load its trace (#1099). The board author
names lookups in `tracking.telemetry.lookups`:

```json
"tracking": {"telemetry": {
  "grafana": {"loki": "loki-uid"},
  "lookups": {
    "camera-model": {
      "label": "Camera model",
      "query": "{env=\"$env\"} |= \"Handling camera stats message\" | cameraModel=\"$value\"",
      "values": ["arch", "wren"]
    }
  }
}}
```

| field | meaning |
|---|---|
| `label` | required; the name of the lookup's search box and of its value field (1–80 characters) |
| `query` | required; a LogQL log query (at most 2000 characters). `$value` or `${value}` is where the reader's value goes; a query without it runs as written |
| `values` | optional suggested values (1–50) the reader can pick; the query must then have a `$value` slot |
| `datasource` | optional Loki datasource UID; default `tracking.telemetry.grafana.loki` of the active environment |
| `fields` | optional `{traceId, spanId}` field names; default `trace_id` and `span_id` |

The reader opens Status → Trace → **Load trace**, chooses a connection and
environment, then uses **Find a trace from a log line** (#1349). One **Log search**
dropdown lists the lookups by label in authored order, then **Type a LogQL query**.
Only the selected search shows: a value field (with the suggested `values` to pick
from) when the query has a `$value` slot, and its **Find log lines** button
(accessible name "Find log lines for <label>"); Enter in the value field runs Find.
Type a LogQL query shows a query box instead (Ctrl+Enter or Cmd+Enter runs it), and
`lookups: {}` offers only that box, with no dropdown. Each search keeps its own value
and its own last results while the page is open; switching away drops a running
Find. The results and a load error sit directly under the search (#1230); typing in
a search clears its results only. Each Find makes one `query_loki_logs` call to the Grafana connector that offers that
tool (the one `loki` signals use, preferring a connector named Grafana):

```json
{"datasourceUid": "loki-uid", "logql": "{env=\"stg\"} |= \"Handling camera stats message\" | cameraModel=\"arch\"\n| trace_id =~ \"[0-9a-fA-F]{16,32}\"",
 "startRfc3339": "now-2h", "endRfc3339": "now", "limit": 10, "direction": "backward", "queryType": "range"}
```

- Without that connector the search says so and offers **Check again** (#1252). It
  looks again on Check again, when the Trace view is entered again, and at most
  every 30 seconds on a repaint, so a connector added in claude.ai is found without
  a reload; a failed listing is retried the same way. A look that still finds none
  says "Still not found (checked 10:42:13)." with the local time.
- `$env`, `${variable}` and `$account` expand as in signals, from the board's
  active Environment. A missing variable stops the Find with its name.
- The window is the Load trace lookback: the **Trace start** control, else the
  connection's `defaultLookback`. A relative lookback stays relative (`now-2h` to
  `now`), so Grafana's clock decides now; absolute start and end pass unchanged.
- In Over time Find searches the selected day (#1141): the whole local calendar
  day, to now for today (`snapshot().overTime.window`). The section names it,
  for example "Loki · Nov 6 00:00–24:00 local", and an empty result says "No
  log lines with a trace ID on Nov 6. Clear "Only lines with a trace ID" to see
  every line." (unchecked: "No matching log lines on Nov 6."). A Trace start or
  end typed under Lookback still
  wins. Changing the day clears the results without a call; the typed value
  stays. A move that a loaded trace causes keeps them (#1145). Live is unchanged.
- A value cannot contain quotes, backticks, backslashes or control characters,
  so it cannot leave the LogQL string it is placed in. The typed box is limited
  to 2000 characters. LogQL cannot write; the call is bounded by the window and
  10 lines. A Find with no answer after 30 seconds stops with a timeout message.
- **Only lines with a trace ID** (#1158) is checked by default. Find then adds
  a label filter on the lookup's `fields.traceId` (`trace_id` for a typed
  query) on a new line at the end of the query, so a trailing `#` comment
  cannot hide it: `| trace_id =~ "[0-9a-fA-F]{16,32}"`, the
  16 to 32 hex rule the list applies, so Loki's 10 lines have a trace ID. A
  metric query, or a field name that is not a LogQL label name, is sent as
  written. A returned line without a valid trace ID is not listed. An empty
  result says, for example, "No log lines with a trace ID in the last 2h. Clear
  "Only lines with a trace ID" to see every line." Unchecked, Find sends the
  query as written and lists every line. Changing the checkbox clears the
  results without a call. It is reader state; nothing is written to the board.
- The result lists up to 10 lines, newest first: time (local, with seconds; the
  UTC time is its tooltip, #1252), the value (or the
  line text for a typed query), and the trace ID. The IDs are read from the
  line's structured metadata, then parsed labels, then stream labels, because
  Loki before 3.0 reports every label as a stream label. Unchecked, a line without the
  trace ID field says "This log line has no trace_id" (with the configured
  field name) and has no Load button. A metric query returns no lines and says so.
- **Load** on a line loads that trace ID through the selected connection and
  searches the line's time ± 1 h (#1145; see [Honeycomb lookback](provider-traces.md#honeycomb-lookback)),
  then focuses the line's span ID in the waterfall and the diagram. A span ID
  that is not in the trace is reported, and the trace stays loaded. The list
  says "Loading a trace moves the view to its date." when Over time can open.
- A log line's trace may never have been kept by the provider (sampling)
  (#1124). When it is not found, the report says "Trace not found. The provider
  may not have kept this trace (sampling). Try the next log line." and offers
  **Try the next log line**, which loads the next listed line that has a trace
  ID. The lookback hint ("The log line is older than the last 2h; try a longer
  lookback under Lookback.") is added, and Lookback opens, only when a typed
  Trace start or end leaves the line outside the window. A pasted ID or link
  keeps the lookback text.
- Lookups need the Grafana connector. When no connector offers
  `query_loki_logs`, or in a host without one (native mounts), the lookup
  controls are disabled with a message and the rest of Load trace is unchanged.
  Discovery reads tool metadata only, once, when the Trace view first shows.
- The disabled note names the cause (#1125): board telemetry off (`enabled:
  false`), host telemetry off, a closed view, or an Over time day without a
  date ("Log lookups need a dated Over time day; this day has none."). On a host
  without a logs connector, the connector note wins over board telemetry off and
  an undated day.

The result shape follows grafana/mcp-grafana `tools/loki.go`
(`QueryLokiLogsResult` with `format` full, read 2026-11-07): `data` is a list of
`{timestamp: "<unix ns>", line, labels, structuredMetadata?, parsed?}`. The mock
Grafana server returns the same shape without structured metadata. It is not
verified against a live Grafana server.

`tools/inject.py` declares `query_loki_logs` on the Grafana connector for a board
with `lookups` and a trace connection. Spec validation drops a malformed lookup
and names its field, for example
`tracking.telemetry.lookups.camera-model.query: has suggested values but no $value slot`.

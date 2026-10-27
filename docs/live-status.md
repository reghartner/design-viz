# Live ticket status

Live ticket references connect a diagram's implementation work to Jira without
copying changing status into the authored spec. Hardware, firmware, UX and backend
work can be tracked on the nodes and the interactions between them.

## Fields

Any diagram node or edge can carry these optional references:

```json
{
  "tickets": ["HW-123", "FW-45"],
  "prs": ["https://github.com/acme/firmware/pull/88"]
}
```

`tickets` accepts strings matching `^[A-Z][A-Z0-9_]+-[0-9]+$`; keys are case
sensitive and are not trimmed. `prs` accepts absolute HTTP(S) URL strings using
the same URL normalization as delta links. Invalid entries warn individually
and are ignored. Non-array fields warn once and are ignored, including explicit
null. The shared `trackingRefs(obj)` parser returns valid, deduplicated references
in authored order without modifying the source.

Place the optional Jira site on the page, beside `title`, `contract` and `flowview`:

```json
{
  "page": {
    "title": "Connected doorbell delivery",
    "tracking": {"jira": {"site": "https://acme.atlassian.net"}}
  }
}
```

This is a metadata excerpt; a complete page also needs sections or blocks.
`tracking` must be an object and a present `tracking.jira.site` must be an
absolute HTTP(S) URL string. Invalid values warn and are ignored; tracking
validation never turns them into errors.

## Workbench

Select a node or connection on the desktop canvas and open **Inspect → Tracking**,
just below the change details. In **Add ticket**, enter a Jira key such as `HW-123`
and press Enter. Keys are case sensitive; surrounding whitespace is trimmed.
In **Add PR**, paste an absolute HTTP(S) URL and press Enter. Duplicate references
are ignored. Each list keeps its order; use its numbered **Remove ticket** or
**Remove PR** button to remove an entry. Each add or removal has one Undo/Redo,
and Export project keeps the references in its JSON.

When the document has tickets, **Demo live status** beside **Preview** supplies
sample states in sorted ticket order. It starts off and stays preview-only across
ordinary edits and skin changes; it never saves status to the spec or contacts Jira.
Live colors require a viewer with the live-status overlay and a status provider.
PRs remain plain links.

## State model

The planned overlay uses these runtime states. The spec never stores status.

| State | Paint |
| --- | --- |
| `todo` | Grey |
| `active` | Amber, slow pulse |
| `done` | Green |
| `blocked` | Red pulse |
| `missing` | Red pulse + hatched badge |

For an element with several tickets, roll up their states in this order:

blocked > missing > active > (all done → done) > (all todo → todo) > otherwise active

Steps, coins and chips derive their state from the edges and nodes they involve
and never carry tickets. Live status color comes from Jira status only.
Authored `prs` are plain links and never carry live state. A Jira-linked PR
summary from Jira's Development field is informational; it does not determine
status or color.

## Compatibility

The capability is `flow.live-status`, introduced in Flowview 0.2.0. Non-empty
`tickets` or `prs` arrays on nodes or edges, or a page `tracking` field, cause
compatibility stamping to declare it automatically. Existing specs without these
fields keep their existing requirements.

## Rendering

The overlay (#735) paints nodes and edges from a runtime ticket map. Step coins
and chips roll up the involved edges and endpoint/explicit nodes, including failed
communications. Text boxes stay unpainted. Missing map entries add no state;
unknown state strings are ignored. The Live toggle restores authored paint when
disabled. Status colors override node tones and step colors while enabled.

Each painted node or edge has a keyboard-accessible badge. Click it, or press
Enter/Space, for ticket status, title, assignee and the informational PR summary.
Escape or an outside click closes the popover and returns focus. Jira browse links
use the page tracking site, falling back to the provider URL. Authored PR URLs
remain plain links. The node links menu includes authored tickets and PRs even
without a provider. Pulses stop for reduced motion and print; print retains colors.

The reader Live control shows counts of distinct referenced tickets and the newest
provider timestamp. With no provider or applied map, it stays hidden. Pages without
ticket references get no Live control markup. Path, View, Tab and detail navigation
reapply the current map to rebuilt elements.

## Host provider API

A host can supply ticket transport at render time:

```js
var ctl = renderPage(view, page, skin, backlinks, {
  liveStatus: {
    provider: function(refs, signal) {
      // refs = {tickets: ["HW-123", ...], prs: ["https://...", ...]}
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
    "title": "Button delivery",
    "url": "https://acme.atlassian.net/browse/HW-123",
    "assignee": "Alex",
    "prs": {"count": 2, "state": "open"},
    "detail": "Waiting for the bench run",
    "updatedAt": "2026-10-26T12:00:00Z"
  }
}
```

Only `state` is required; PR summary state is `open` or `merged`. Provider calls
start after first paint and repeat at a minimum of 30 seconds. Hidden documents
pause refresh; returning to visible triggers one catch-up. Rejections show an error
note and retain the previous map. Destroy aborts the signal and retires timers,
observers and listeners. The host owns transport. Standalone claude.ai artifacts
can also use the Atlassian adapter described below.

`ctl.liveStatus` exposes `refs()`, `apply(map)`, `clear()`, `state(key)` (entry or
null), `enabled()`, `setEnabled(bool)`, and `onChange(fn)` (returns an unsubscribe
function). Change callbacks receive `{states, counts, updatedAt}` after apply,
clear and enable changes. Counts are per distinct referenced ticket, independent
of visibility and toggle state. `apply` replaces the map; `clear` empties it.
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

The [live-status example](../examples/live-status/live-status.spec.json) connects
hardware, firmware, a mobile app and backend with node and edge references.

## Mock server

The [mock Atlassian MCP server](../deploy/cloudflare/mock-atlassian-mcp/README.md)
provides fictional Jira tools without an Atlassian account. Its shared timeline
demonstrates progress, blocked and missing tickets, and linked PR summaries.

## Publishing as a claude.ai artifact

Build the standalone HTML with `python3 tools/build.py`, then inject your spec
with `tools/inject.py`. When publishing with the Artifact tool, include this
exact declaration:

```js
capabilities: {mcp: {servers: [{server: "Atlassian MCP", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"]}, {server: "Atlassian", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"]}]}, comments: {"composer_only": true, "customAnchors": true}}
```

With an enabled **Atlassian MCP** or **Atlassian** connector, viewers see Jira
status on referenced nodes and edges. The adapter prefers Atlassian MCP, selects
the resource matching `page.tracking.jira.site` (or the first resource when no
site is specified), and watches batches of ten keys every 60 seconds. A second
Flagged Impediment query detects blockers. Jira status determines colors;
Development PR summaries, when returned, are informational. All tool calls go
through `window.claude.use("mcp")`; the artifact never fetches Jira directly.

Without the connector, viewers see “Add the Atlassian connector in claude.ai
Settings → Connectors to see live ticket status.” If approval is needed, the
**Allow Jira** button makes one explicit retry. Account and policy errors clear
status; temporary failures keep the last evidence and permit one delayed retry
per refresh. Switching accounts retires the adapter. The Live toggle hides
colors while watches continue, and turning it back on applies the latest data.
Without the claude.ai runtime or MCP capability, or without ticket references,
the adapter is inert. An existing `window.flowviewLiveStatus` host provider takes
precedence. Document editing remains desktop-only.

Tool shapes follow public documentation; they have not been captured from a
real connector. See the [mock server README](../deploy/cloudflare/mock-atlassian-mcp/README.md)
for setup, fictional scenarios, result envelopes and known fidelity limits.
The mock can be installed as **Atlassian MCP** to try the artifact without an
Atlassian account. No GitHub connector is used.

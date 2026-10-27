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
observers and listeners. No Jira adapter or network transport is built in.

`ctl.liveStatus` exposes `refs()`, `apply(map)`, `clear()`, `state(key)` (entry or
null), `enabled()`, `setEnabled(bool)`, and `onChange(fn)` (returns an unsubscribe
function). Change callbacks receive `{states, counts, updatedAt}` after apply,
clear and enable changes. Counts are per distinct referenced ticket, independent
of visibility and toggle state. `apply` replaces the map; `clear` empties it.
`note(text, kind)` sets an `info`, `warn` or `error` message. `action(label, fn)`
sets one host action; an empty label clears it. These methods allow a provider
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

## Demo mode

Open the [built story](../examples/live-status/live-status.html#live=demo) with
`#live=demo` to replay the cross-team doorbell delivery. The standalone injector
embeds `examples/live-status/live-status.timeline.json` in a separate
`live-timeline` JSON block when the page declares `tracking`. It works offline,
including `file://`, without fetching or changing the spec. A host provider takes
precedence. Without the hash, no demo starts.

The Live control shows the current day and offers **Pause/Play** and **Next day**.
Days advance at the timeline's `intervalSeconds` (6 seconds by default), ending
on the final day. Reduced motion uses manual advancement only. Hidden pages pause
the timer. Requested ticket keys absent from a day become `missing`; linked PRs
remain informational. Without an embedded timeline, four days are synthesized
from the page's ticket keys: todo, active, one blocker, then all done.

## Blocker propagation

A node or edge rolled up to `blocked` or `missing` propagates its blocking ticket
keys forward along directed edges. An edge starts at its target node. Reached
nodes and edges acquire `dv-live-waiting` and `data-dv-live-waiting-on` with the
comma-separated keys, while retaining their own `dv-live-<state>` class. Carriers
whose own state is done, blocked or missing never become waiting; traversal still
continues through them. Cycles terminate and multiple blockers combine their keys.

Waiting uses a dashed red-grey stroke, an ellipsis badge and a **waiting on** tag;
the badge popover lists the blocking keys. Applying a new map, clearing it or
turning Live off removes stale waiting evidence. Print keeps the colors.

## Blocked edges

Blocked edges reuse the communication **Not sent** break, labelled with their
blocking keys, in both Ambient and Step mode. The break lasts until the live state
changes or Live is disabled. Missing edges retain their missing badge without a
communication break. Todo edges use a dashed grey stroke and hide packet dots;
active and done edges retain ordinary packet animation. Authored step failures
keep their own lifecycle, and reduced-motion behavior is unchanged.

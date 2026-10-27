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
Linking an epic automatically includes its child stories in the Tickets table.
Assigning a story to a node or edge remains an authoring step.

## Workbench

Select a node or connection on the desktop canvas and open **Inspect → Tracking**,
just below the change details. In **Add ticket**, enter a Jira key such as `HW-123`
and press Enter. Keys are case sensitive; surrounding whitespace is trimmed.
In **Add PR**, paste an absolute HTTP(S) URL and press Enter. Duplicate references
are ignored. Each list keeps its order; use its numbered **Remove ticket** or
**Remove PR** button to remove an entry. Each add or removal has one Undo/Redo,
and Export project keeps the references in its JSON.

With no node selected, open **Inspect → Document settings → Tracking** to edit
**Jira site** and **Epic**. Enter a key in Epic and press Enter; use **Remove epic
1**, **Remove epic 2**, and so on to remove keys. Each change has one Undo/Redo,
and Export project preserves the epic references. These authoring controls are
desktop-only.

When the document has tickets, **Demo live status** beside **Preview** supplies
sample states in sorted ticket order. It starts off and stays preview-only across
ordinary edits and skin changes; it never saves status to the spec or contacts Jira.
Live colors require a viewer with the live-status overlay and a status provider.
PRs remain plain links.

## State model

The overlay uses these runtime states. The spec never stores status.

| State | Paint |
| --- | --- |
| `todo` | Slate preset |
| `active` | Ember preset (orange), slow pulse |
| `done` | Moss preset |
| `blocked` | Rose preset, pulse |
| `missing` | Rose preset with a dotted outline, pulse; the popover, caption and Tickets table say missing |
| waiting (any state) | Slate preset, dashed |

Live paint has no palette of its own: it uses the Node Styles presets
(see `docs/node-styles.md`). A painted node wears `node-styled ns-<preset>`, so its
card takes the preset's background, line and ink in the current skin, including
the dark variants on Aurora, Terminal and Blueprint. Edge strokes, halos, the
break glyph, step coins and chips, lane pills and the panel's count and state
pills use the same preset line colours through `--dv-live-<state>`. Numerals and
pill text use `--dv-live-on`, chosen by the engine's step-colour contrast rule
(black or white, whichever contrasts more); it is black on every live fill.

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
disabled, including an authored node `style` preset. Status colors override
node styles, node tones and step colors while enabled.

The canvas has no status badges (#762): card stroke and halo, edge stroke, the
dashed todo and waiting strokes, step coins and the break glyph carry the state.
Click a painted node's card or an edge's label (the edge itself when it has no
label) for ticket status, title, assignee and the informational PR summary. The
node's own links, detail and handoff controls keep their clicks. In the reader
that card or label is a keyboard button named for its tickets and state; press
Enter/Space to open the popover. Escape or an outside click closes it and
returns focus to the carrier. In the Workbench, clicks keep selecting for
editing and the Tickets table is the route to a carrier. Jira browse links
use the page tracking site, falling back to the provider URL. Authored PR URLs
remain plain links. The node links menu includes authored tickets and PRs even
without a provider. Pulses stop for reduced motion and print; print retains colors.

Path, View, Tab and detail navigation reapply the current map to rebuilt elements.

## Live status panel

Always add an authored `live-status` panel to a tracked page:
`{"id":"status","type":"live-status","title":"Epic status"}` in a section's
`diagram.panels`. Use `sectionLayout` to place it: the example's default
arrangement puts the panel in the left half and the diagram, with its step controls
attached, in the right half; the Backstage and Confluence profiles stack them full
width. It appears immediately, with no menu click.
The generic desktop Workbench picker lists **Delivery → Live status**; insertion
and Export project preserve the panel. There are no authored state or patch fields.

The panel header holds **Live**, distinct-ticket counts, a connector indicator
(a dot plus “Jira connected, refreshed 12s ago”; the dot is grey when not connected,
amber while connecting or awaiting approval, green when connected or in demo mode,
red on error, and it pulses while a fetch is in flight; the time is the last successful
fetch, not a ticket's change time), provider note and action, **First blocker**, and
demo **Play/Pause** and **Next day** when demo controls are supplied. The engine's panel title stays above this header.
The body shows completion and verdict, Blockers, Tickets, then Activity. Lane
progress is not listed in the panel; it stays on the step lane pills, the lane colour
stripe of each Tickets row and the lane names in Blockers.
Without ticket references or epics it says “This page has no ticket references.”
Before a provider or applied map is available, it shows the connector note and any
required authorization action without an empty rollup. Print preserves the last
paint, and reduced motion disables ring animation.

Validation warns when tracking or carrier tickets exist without a `live-status`
panel: `page.tracking: no live-status panel declared — add {"type": "live-status"}
to a section's panels so viewers see the rollup`. A panel on an untracked page
warns “this page has no ticket references — the panel will be empty”. These are
warnings, never errors. Strongly prefer adding the panel on every tracked page.

### Tickets table

Below Blockers, the Tickets table lists each distinct carrier ticket and every returned child of a linked
epic. Rows sort by blocked, missing, active, todo, done, then key. Columns show
Key, Title, State, Owner, and PRs. Under each ticket a second
row holds its coverage as a left-aligned row of chips. The key uses the configured
Jira site, and a colored stripe marks its team lane when known.

Owner is the Jira assignee's display name. When the page sets `tracking.jira.site`
and the entry carries the assignee's Atlassian `accountId` (`assigneeId`), the name
links to that person's Confluence people page, `<site>/wiki/people/<accountId>`, in a
new tab with the same look as the other panel links; otherwise it is plain text. No
avatar is shown and no additional connector call is made: the id rides along in the
Jira search payload.

PR links come only from authored carrier `prs`, rendered as icons; Jira's
Development summary adds a muted, informational “n open/merged/declined” count
without inventing URLs (its tooltip says Jira does not expose the link). Coverage
chips name the story's carriers, open their containing section or detail when
needed, and focus the carrier itself through the existing detail navigation. If
no authored route is available, the button is disabled with a title naming the
detail page. Stories without
carriers say **NOT ON DIAGRAM**. Carrier tickets without membership evidence in
a configured epic say **NOT IN EPIC**. The verdict also gives “n of N epic
stories on diagram”. A child first received after the initial map adds
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
    "prs": {"count": 2, "state": "open"},
    "detail": "Waiting for the bench run",
    "updatedAt": "2026-10-26T12:00:00Z"
  }
}
```

Only `state` is required; PR summary state is `open`, `merged` or `declined`. Provider calls
start after first paint and repeat at a minimum of 30 seconds. Hidden documents
pause refresh; returning to visible triggers one catch-up. Rejections show an error
note and retain the previous map. Destroy aborts the signal and retires timers,
observers and listeners. The host owns transport. Standalone claude.ai artifacts
can also use the Atlassian adapter described below.

`ctl.liveStatus` exposes `refs()`, `apply(map)`, `clear()`, `state(key)` (entry or
null), `snapshot()`, `enabled()`, `setEnabled(bool)`, and `onChange(fn)` (returns an unsubscribe
function). Change callbacks receive `{states, counts, updatedAt}` after apply,
clear, enable changes, notes, actions, demo changes, and loaded details that change the collected references.
`snapshot()` also exposes enabled state, note, action label, lanes, blockers,
Tickets rows, coverage, activity, demo state, verdict and `connection` for subscribed
panels. `connection` is `{state, busy, checkedAt, source, checkedText}`; `state` is one of
`none`, `disconnected`, `approval`, `connecting`, `connected`, `error`, `demo`. A host
provider is reported as source “Host”: connecting until its first answer, busy during
each call, connected with `checkedAt` after a successful call, error after a rejection.
Hosts and adapters may call `ctl.liveStatus.status({state, busy, checkedAt, source})`
to report their own transport state; invalid fields are ignored. The Atlassian adapter
reports “Jira” (disconnected without a qualifying connector, approval while consent is
pending, connected on each delivered watch with the cache time, error with `busy` while
a retry is scheduled); the demo player reports “Demo”.
Counts are per distinct referenced ticket, independent
of visibility and toggle state. `apply` replaces the map; `clear` empties it.
Entries for stories without a carrier are accepted too. Set their `epic` to the
configured parent key. `refs().epics` collects the root and loaded detail pages.
`liveStatusCoverage(page, map, refs)` returns `epics`, `onDiagram` (carrier keys),
`notOnDiagram` (configured epic children without carriers), and `notInEpic`
(carrier keys without evidence of membership in a configured epic). With no
epics configured, `notInEpic` is empty. Extra stories do not affect carrier
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

The [live-status example](../examples/live-status/live-status.spec.json) connects
hardware, firmware, a mobile app and backend with node and edge references.

## Mock server

The [mock Atlassian MCP server](../deploy/cloudflare/mock-atlassian-mcp/README.md)
provides fictional Jira tools without an Atlassian account. Its shared timeline
demonstrates progress, blocked and missing tickets, and linked PR summaries.
Assignees carry fictional Atlassian `accountId`s so the Owner links render.
Search with `parent = DOOR-100`, optionally followed by `AND Flagged = Impediment`,
to retrieve that day's children. `getJiraIssue` can also return the epic itself.

## Demo mode

Open the [built story](../examples/live-status/live-status.html#live=demo) with
`#live=demo` to replay the cross-team doorbell delivery. The standalone injector
embeds a demo timeline in a separate `live-timeline` JSON block when the page
declares `tracking`. `tools/inject.py` picks it with `--timeline <path|none>`:
a path embeds that file after checking its shape (`version`, `intervalSeconds`,
`days[].issues`), and `none` embeds nothing. The default is
`examples/live-status/live-status.timeline.json` when the injected spec is
`examples/live-status/live-status.spec.json`, and `none` for every other spec,
so a board never inherits the doorbell example's keys. It works offline,
including `file://`, without fetching or changing the spec. A host provider takes
precedence. An explicitly requested demo also takes precedence over the automatic
claude.ai connector. Without the hash, no demo starts.

The Live status panel header shows the current day and offers **Pause/Play** and **Next day**.
Days advance at the timeline's `intervalSeconds` (6 seconds by default), ending
on the final day. Reduced motion uses manual advancement only. Hidden pages pause
the timer. Requested ticket keys absent from a day become `missing`; linked PRs
remain informational. Every key in a day's `issues` is included, even when no
carrier references it; entries may include `epic` and a lane ID in `lane`. The
example's `DOOR-100` gains `UX-90`, “Alert sound setting”, in the APP lane on Day 8.
It is never assigned to a carrier. Without an embedded timeline, four days are synthesized
from the page's ticket keys: todo, active, one blocker, then all done.

## Blocker propagation

A node or edge rolled up to `blocked` or `missing` propagates its blocking ticket
keys forward along directed edges. An edge starts at its target node. Reached
nodes and edges acquire `dv-live-waiting` and `data-dv-live-waiting-on` with the
comma-separated keys, while retaining their own `dv-live-<state>` class. Carriers
whose own state is done, blocked or missing never become waiting; traversal still
continues through them. Cycles terminate and multiple blockers combine their keys.

Waiting uses the slate preset with a dashed stroke, and the halo turns slate too; the canvas carries no **waiting on** text.
The carrier's accessible name and popover list the blocking keys. Applying a new map, clearing it or
turning Live off removes stale waiting evidence. Print keeps the colors.

## Blocked edges

Blocked edges reuse the communication **Not sent** break glyph, without canvas
text, in both Ambient and Step mode: the edge already names its ends and a text
label would sit on the edge label, its step coin or a node card. The break's
title and accessible name keep the full sentence with the blocking keys. The break lasts until the live state
changes or Live is disabled. Missing edges keep their red stroke without a
communication break. Todo edges use a dashed grey stroke and hide packet dots;
active and done edges retain ordinary packet animation. Authored step failures
keep their own lifecycle, and reduced-motion behavior is unchanged.

## Publishing as a claude.ai artifact

Build the standalone HTML with `python3 tools/build.py`, then inject your spec
with `tools/inject.py`. When publishing with the Artifact tool, declare the
viewer's connector by its **exact display name** as shown in claude.ai
Settings → Connectors, together with the two Jira tools and the comments
capability. For Atlassian's own connector that is:

```js
capabilities: {mcp: {servers: [{server: "Atlassian", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"]}]}, comments: {"composer_only": true, "customAnchors": true}}
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
keys every 60 seconds. A second Flagged Impediment query detects blockers. Each configured epic also gets a
`parent = KEY` watch and a `parent = KEY AND Flagged = Impediment` watch, requesting
summary, status, assignee, updated and issuetype in pages of ten. The adapter
follows `pageInfo.hasNextPage`/`endCursor` or `nextPageToken` until exhausted and
tags the returned children with their epic key. When an approved detail page
loads, new ticket and epic references get their own watches; reopening that
detail reuses the existing watches. Epic query errors retain prior
carrier evidence and use the same notices and bounded retry rules.
Jira status determines colors;
Development PR summaries, when returned, are informational. All tool calls go
through `window.claude.use("mcp")`; the artifact never fetches Jira directly.

Without the connector, viewers see “Add the Atlassian connector in claude.ai
Settings → Connectors to see live ticket status.” If approval is needed, the
**Allow Jira** button makes one explicit retry. Account and policy errors clear
status; temporary failures keep the last evidence and permit one delayed retry
per refresh. Switching accounts retires the adapter. The Live toggle hides
colors while watches continue, and turning it back on applies the latest data.
Without the claude.ai runtime or MCP capability, or without ticket or epic references,
the adapter is inert. An existing `window.flowviewLiveStatus` host provider takes
precedence. Document editing remains desktop-only.

Tool shapes follow public documentation; they have not been captured from a
real connector. See the [mock server README](../deploy/cloudflare/mock-atlassian-mcp/README.md)
for setup, fictional scenarios, result envelopes and known fidelity limits.
The mock can be installed as a custom connector under any name except
**Atlassian MCP** to try the artifact without an Atlassian account; declare
that name when publishing. No GitHub connector is used.

Verify after publishing: the Live status panel beside the diagram shows completion,
Blockers, Tickets and Activity, and its header shows counts and updated time.

## Story mode

Live evidence follows the story's nodes and edges. Team lane pills show **n/N done**, the worst ticket state, and a hover/focus title listing each ticket and
state. Tickets are deduplicated across every step in that lane, including edge
endpoints and failed communications. The Live status panel does not repeat these
lanes; lane evidence stays on the step pills, the lane colour stripe of each
Tickets row and the lane names in Blockers.

In Step mode, the caption ends with **BLOCKED · KEY · detail**, **MISSING · KEY**,
**IN PROGRESS · n tickets**, **TODO · n tickets**, or **DONE**. Untracked steps
have no live caption. Captions update on step changes and new evidence.

Playback pauses on the first blocked or missing beat, including the first beat
when starting or replaying, and focuses the first blocking carrier.
Manual next/previous retain their existing navigation behavior. The small
`stepper.onBeforeAdvance(fn)` hook returns an unsubscribe function; `fn` receives
the selected source step index after it is painted, before automatic playback
continues. Returning `false` invokes the ordinary pause path. It runs only for
automatic playback (including its initial beat), never manual navigation.
**First blocker** jumps through `stepper.jumpSource` to the earliest blocker in
the current path, enters Step mode and focuses that carrier; it hides when none exist.

Changed ticket states produce one carrier pulse (none with reduced motion).
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
readiness. Otherwise the verdict gives distinct blocking/missing tickets and
waiting carriers. Missing tickets say “not found in Jira (deleted, renamed, or no
permission)”. Downstream counts come from the same waiting propagation as the
canvas, counting each affected carrier and authored step once per blocking key.

Set `tracking.staleDays` to a positive number (default **7**) to mark active work
whose `updatedAt` is strictly older than that many days. The carrier gets
`dv-live-stale` and its popover says “no activity N d”; the rollup color is unchanged.
Missing/invalid timestamps are never stale; invalid thresholds warn and use 7.
All story features work with `#live=demo`; pages without tickets or epics show the empty-page message.

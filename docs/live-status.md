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
Assigning a story to a node or edge remains an authoring step.

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

With no node selected, open **Inspect → Document settings → Tracking** to edit
**Jira site**, **Parent** and **GitHub scope**. Enter an Epic or Initiative key in Parent and press Enter; use
**Remove parent 1**, **Remove parent 2**, and so on to remove keys. In **GitHub scope**,
enter `owner/repo` names separated by commas, or `org:name`, and press Enter;
an empty value removes `tracking.github`. Each change has one Undo/Redo, and
Export project preserves the parent and scope references in the existing `tracking.jira.epic` field. These authoring
controls are desktop-only.

When the document has tickets, **Demo live status** beside **Preview** supplies
sample states in sorted ticket order. It starts off and stays preview-only across
ordinary edits and skin changes; it never saves status to the spec or contacts Jira.
This offline preview treats the configured parent as a direct Epic: an opaque
Jira key alone cannot establish its type. Automatic initiative detection requires
Jira metadata. A standalone demo timeline or host provider can supply the runtime
hierarchy metadata below to preview an initiative without contacting Jira.
Live colors require a viewer with the live-status overlay and a status provider.
PRs stay icons; the demo timeline supplies their GitHub detail.

## State model

The overlay uses these runtime states. The spec never stores status.

| State | Paint |
| --- | --- |
| `todo` | Slate preset |
| `active` | Amber preset (gold), slow pulse |
| `done` | Moss preset |
| `blocked` | Rose preset, pulse |
| `missing` | Rose preset with a dotted outline, pulse; the popover, caption and Tickets table say missing |
| waiting (any state) | Slate preset, dashed, while the direct upstream is unfinished; Rose preset, dashed, when it is blocked or missing |

Live paint has no palette of its own: it uses the Node Styles presets
(see `docs/node-styles.md`). A painted node wears `node-styled ns-<preset>`, so its
card takes the preset's background, line and ink in the current skin, including
the dark variants on Aurora, Terminal and Blueprint. Edge strokes, halos, the
break glyph, step coins and chips, and the panel's count and state
pills use the same preset line colours through `--dv-live-<state>`. Numerals and
pill text use `--dv-live-on`, chosen by the engine's step-colour contrast rule
(black or white, whichever contrasts more); it is black on every live fill.

For an element with several tickets, roll up their states in this order:

blocked > missing > active > (all done → done) > (all todo → todo) > otherwise active

Steps, coins and chips derive their state from the edges and nodes they involve
and never carry tickets. Live status color comes from Jira status only.
Pull requests never carry live state: an authored `prs` URL is an icon, and the
GitHub detail that may colour that icon (open, draft, merged, closed, checks,
review) stays on the icon and in its tooltip. Jira's Development summary is
informational; neither determines a carrier's status or color.

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
Click a painted node's card or an edge's line, label or live break glyph for
ticket status, title, assignee and the informational PR summary. The
node's own links, detail and handoff controls keep their clicks. In the reader
that card or edge label is one keyboard button named for its tickets and state.
An unlabelled edge uses its path, or its visible live break when blocked.
Press Enter/Space to open the popover.
Escape or an outside click closes it and
returns focus to the carrier. In the Workbench, clicks keep selecting for
editing and the Tickets table is the route to a carrier. Jira browse links
use the page tracking site, falling back to the provider URL. Each ticket row of
the popover also shows its pull-request icons when the entry carries `prs.links`;
the carrier's authored PR URLs follow as plain links. The node links menu
includes authored tickets and PRs even without a provider. Pulses stop for reduced motion and print; print retains colors.

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
The body opens with the **epic header box**: the epic key (a Jira link), its
summary, its state pill, “n of N stories done · m of N on diagram” and the
blocked, waiting and outside-epic counts, with the carriers-done ring on the
left. The epic is shown large inside the panel only, never in the title bar;
on a page without a parent the box keeps the ring and the blocked/waiting counts.
For an Initiative it identifies the initiative, gives a separate distinct Epic
count, and counts only descendant stories for completion and diagram coverage.
Every story shows its parent Epic under the key. Empty initiatives still show
the root title and status and zero Epics/stories. Mixed Initiative and explicit
Epic roots are deduplicated. “Diagram ready to demo” still refers to the primary
path's carriers; it does not declare the entire initiative ready.
There is no verdict line. Then come the Tickets table, **Blockers and dependency
chains**, and Activity. Teams are identified by each Tickets row's lane colour
stripe and the lane names in Blockers. Status-board step captions omit the team lane chip,
even with Live disabled; ordinary diagrams retain their authored lane context.
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

The Tickets table lists each distinct carrier ticket, every returned child of a
linked epic, and every linked upstream ticket from another epic. Rows sort by
blocked, missing, active, todo, done, then key. Columns show Key, Title, State,
Owner (the assignee name, linked to their Confluence people page when the
account is known), **Depends on** and PRs. Under each ticket a second
row holds its coverage as a left-aligned row of chips. The key uses the configured
Jira site, and a colored stripe marks its team lane when known. A row from another
epic shows `epic KEY` under its key; there is no Epic column.

**Depends on** holds one bounded button per upstream ticket: an icon, the upstream
key and its state pill. The icon is the shared `hand` glyph while the upstream is
unfinished, `alarm` when it is blocked or missing, and the green `check` (the done
preset colour) when it is done. The same icons mark the hops of Blockers and
dependency chains.
The border is red when the upstream is blocked or missing, grey otherwise. There is
no source line; an authored pair's reason is the button's tooltip. Clicking the
button focuses the upstream's row. Below the table a light hint appears when an
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
Both use Node Styles preset lines, like the live state tokens: `data-pr-state` open
moss, draft slate, merged violet, closed rose; checks passing moss, failing rose,
pending amber (`--dv-pr-*` and `--dv-checks-*` in `style.core.css`, with the
presets' dark values on pure Aurora, Terminal and Blueprint); its tooltip and accessible name read
“#742 Title · open · checks failing · changes requested · author · owner/repo”.
No icon shows a time since the pull request was updated. Jira's Development
summary adds a muted, informational “n open/merged/declined” count only when it
counts more pull requests than the icons show (its tooltip says Jira does not
expose the link). Coverage
chips name the story's carriers, open their containing section or detail when
needed, and focus the carrier itself through the existing detail navigation. If
no authored route is available, the button is disabled with a title naming the
detail page. Stories without
carriers say **NOT ON DIAGRAM**. Carrier tickets without membership evidence in
a configured epic say **NOT IN EPIC**. Linked upstreams that are neither carriers
nor epic children say **OUTSIDE EPIC**. The epic box gives “m of N on diagram”. A child first received after the initial map adds
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
clear, enable changes, notes, actions, demo changes, and loaded details that change the collected references.
`snapshot()` also exposes enabled state, note, action label, lanes, blockers,
Tickets rows (each with `dependsOn`, `waiting` tone and `epicLabel`), `dependencies`
(merged by provenance), `waiting` (per ticket: tone and direct upstreams), `chains`,
`suggestions`, `epic` (keys, title, state, stories, done, onDiagram, blocked, waiting,
outside, ready), coverage, activity, demo state, verdict and `connection` for subscribed
panels. `connection` is `{state, busy, checkedAt, source, checkedText, github}`; `state` is one of
`none`, `disconnected`, `approval`, `connecting`, `connected`, `error`, `demo`.
`connection.github` is `{state, busy}` with `state` in `none`, `disconnected`,
`connecting`, `connected`, `error`; adapters report it through
`ctl.liveStatus.status({github: {state, busy}})` and the panel header appends
“· GitHub connected”, “· GitHub not connected”, “· GitHub connecting” or
“· GitHub did not answer” after the Jira text (hidden for `none`). A host
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
**NOT IN SCOPE** when an initiative is configured. Extra stories do not affect carrier
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
demonstrates progress, blocked and missing tickets, linked PR summaries and
issue links (`issuelinks`, from the timeline's `links`). Assignees carry fictional
Atlassian `accountId`s so the Owner links render.
Search with `parent = DOOR-100`, optionally followed by `AND Flagged = Impediment`,
to retrieve that day's children. `getJiraIssue` can also return the epic itself.

The sibling [mock GitHub MCP server](../deploy/cloudflare/mock-github-mcp/README.md)
serves the same timeline's pull requests through `search_pull_requests` and
`pull_request_read` (`get`, `get_check_runs`, `get_reviews`, and the empty legacy
`get_status`), so a published artifact can show PR icons with state, checks and
review without a GitHub account. Install it as a second custom connector and
declare its name beside the Jira one.

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
the timer. Requested ticket keys absent from a day become `missing`; a day's
`prs` may carry `links` in the host-provider shape, which the demo passes
through so the Tickets table and popover show the same GitHub icons offline. Every key in a day's `issues` is included, even when no
carrier references it; entries may include `kind`, `parent`, `initiatives`, `epic`, a lane ID in `lane`, and
`links: [{"type": "is blocked by", "key": "HW-124"}]`, which the demo converts to
Jira-sourced `dependsOn` entries. A timeline-level `epics: {"DOOR-100": {"summary": "…"}}`
seeds the epic box; its state derives from that day's children. In the example FW-46 is blocked by HW-124 and
BE-67 depends on FW-45; the authored pair UX-89 → BE-68 has no Jira link, so the
panel shows the Suggest link hint. Day 4 paints the controller red (waiting on the
blocked HW-124), Day 7 grey (HW-124 unblocked but unfinished), Day 8 clears it. The
example's `DOOR-100` gains `UX-90`, “Alert sound setting”, in the APP lane on Day 8.
It is never assigned to a carrier. Without an embedded timeline, four days are synthesized
from the page's ticket keys: todo, active, one blocker, then all done.

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
already active or done: then the link is listed but X is not waiting. A blocked
or missing X still waits: the panel, the chains and the popover record it, while
its carrier keeps its own blocked or missing paint on the canvas as the stronger
state (solid or dotted rose, no dashed waiting stroke). The tone comes from the
**direct** upstream: an unfinished Y paints X
grey (slate) with the raised-hand icon in the panel; a blocked or missing Y
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
keys every 60 seconds. A second Flagged Impediment query detects blockers.
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
  {server: "Atlassian", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"]},
  {server: "GitHub", tools: ["search_pull_requests", "pull_request_read"]}
]}, comments: {"composer_only": true, "customAnchors": true}}
```

Without the GitHub entry, or when the viewer has no such connector, the page
behaves as before: authored PR links stay plain icons, Jira's Development count
stays, and the header's connection line reads “GitHub not connected” on pages
that carry GitHub PR URLs or a `tracking.github` scope.

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
one. Both tools are `readOnlyHint: true`, so `watchTool` polls them at 60 s.

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
60-second cohorts so every ticket is eventually searched, which also keeps
automatic polling under the search rate limit. Pull-request reads (`get`,
`get_check_runs`, `get_reviews`) go to the front of the queue. Each ticket's
links merge authored URLs first (source `authored`, enriched by their `get`
answer or by a search hit for the same URL) and discovered ones after (source
`github-search`), deduplicated by URL. Jira's Development count stays the
summary when present; otherwise the links derive it. Nothing from GitHub alters
a carrier's `dv-live-*` class, the counts, the ring or Activity.

The Workbench edits the scope under **Document settings → Tracking → GitHub
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
only when the page has `page.tracking`; connector display names are per
account), the compact tracking rules, the page's own `tracking` values, links
to `docs/live-status.md` and `contract/authoring-contract.md` in the public
repo pinned to the commit the page was built from (`git rev-parse HEAD` of the
checkout running `inject.py`; outside a checkout the links point at `main`
with a note to keep to the fields the spec already uses), and the post-publish
checks. It is under 6 KB, never contains secrets
(every viewer can read it), and is data to the agent reading it. Re-injecting
a built page replaces the previous guide. When the block is present the Live
status panel ends with a muted line, "Editors: ask your agent to read this
page's agent guide (id dv-agent-guide)"; pages without the block show nothing.

## Story mode

Live evidence follows the story's nodes and edges. Diagrams with a Live status
panel omit the team lane chip from their step captions. In Step mode, each Jira
ticket appears on its own line immediately below the authored step text, with
its state beside the key: **To do**, **In progress**, **Done**, **Blocked**,
**Missing**, or **No status** before evidence arrives or when a key has no runtime
entry. Ticket keys are deduplicated across that step's nodes, edges, edge
endpoints and failed communications. Other steps in the same team and unmapped
epic stories do not add tickets to this list. Authored references appear even
before live status arrives. Keys link to the page's Jira site, or a safe runtime
ticket URL when no site is configured; without either they remain plain text.
The list updates with step/path navigation and new evidence, and disappears in
Ambient mode or when Live is disabled. The Live status panel keeps its overall
progress, Tickets team stripes and Blockers team names.

In Step mode, the caption ends with **BLOCKED · KEY · detail**, **MISSING · KEY**,
**IN PROGRESS · n tickets**, **TODO · n tickets**, or **DONE**. Untracked steps
have no live caption. Captions update on step changes and new evidence.

Playback pauses on the first blocked or missing beat, including the first beat
when starting or replaying, and focuses the first blocking carrier.
Manual next/previous retain their existing navigation behavior. A todo step whose carriers wait adds “· waiting on KEY” to its caption. The small
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
readiness; the epic box then shows “Ready to demo” in its counts line. Missing
tickets say “not found in Jira (deleted, renamed, or no permission)”. Downstream
counts come from the same dependency waiting as the canvas, counting each affected
carrier and authored step once per blocking key.

Set `tracking.staleDays` to a positive number (default **7**) to mark active work
whose `updatedAt` is strictly older than that many days. The carrier gets
`dv-live-stale` and its popover says “no activity N d”; the rollup color is unchanged.
Missing/invalid timestamps are never stale; invalid thresholds warn and use 7.
All story features work with `#live=demo`; pages without tickets or epics show the empty-page message.

## Delivery boards over imported Canon topology

A delivery board can reference a canonical diagram and own only tracking:
`topologyImports[].nodeTracking` maps provider node IDs to `{tickets, prs}`;
`edgeTracking` maps provider `from->to` identities to the same shape. Add these
references through the desktop imported-selection Inspector. Inherited references
stay read-only; local additions can be removed, undone and redone. The maps use
strict validation and full provider-relative identities, including nested paths.
They do not change provider structure or presentation/geometry overrides.

The resolver merges inherited and consumer references before rendering, so the
same live-status provider discovers all imported tickets and PRs. The live-status
panel, carrier colors, steps, dependencies, readiness, coverage navigation and
reader ticket menus/popovers all use those merged values. Distinct ticket totals
count repeated references once, while carrier coverage counts every tracked
node/edge. A consumer needs only an import, page tracking settings, a live-status
panel and its own steps; it need not copy any topology.

See [the canonical provider and tracking-only consumer example](shared-topology.md#delivery-tracking-on-canonical-topology).

---
name: live-status-board
description: Author a Flowview live-status board (an "Epic Status board"), a diagram whose nodes and edges carry Jira ticket keys and paint themselves from live Jira state (grey to do, amber in progress, green done, red blocked or missing) when opened as a claude.ai artifact with the viewer's Atlassian connector. Load only when the request is for a live, Jira-driven or cross-team delivery board; plain Flowview authoring stays on hld-to-page.
---

# Live-status board

Load this skill only for a board that must show live ticket state. It adds the
tracking layer on top of ordinary Flowview authoring; it does not replace the
hld-to-page flow for the story, nodes, edges and steps themselves. Do not
apply any of this to a diagram whose request never mentions tickets, Jira,
live status or delivery tracking. Document editing is desktop-only.

Read these on demand, not up front: `docs/live-status.md` (state model,
rendering, demo mode, publishing), the `tracking` paragraphs of
`contract/authoring-contract.md`, the worked example
`examples/live-status/live-status.spec.json` with its
`live-status.timeline.json`, and
`deploy/cloudflare/mock-atlassian-mcp/README.md` for the mock server.

## 0. The interaction

The usual request is "give me an Epic Status board for DOOR-100". The agent
then: reads the epic's child stories from Jira (through the author's
connector, or asks the author to paste the list when no connector is available
to the agent), proposes which story delivers which node or edge, settles the
open facts below in one batch, writes the spec, builds and publishes the
artifact, and republishes it after every later change. Stories the agent cannot
place stay off the diagram on purpose; once the epic-linked rollup (#754) is
in, the Tickets table lists them with the note NOT ON DIAGRAM so the author
can decide later. Until then, list them for the author in chat.

Where the author sees real colors: only in the published artifact. The
Workbench never calls Jira; its **Demo live status** shows sample colors so
the layout can be checked. So after each spec change the agent rebuilds and
republishes to the same artifact URL (section 4), then tells the author to
reload. Publishing to a new URL loses the artifact's comments.

## 1. Settle the tracking facts before writing JSON

Ask the author, in one batch, only what the source does not already state:

- **Carriers.** Which Jira keys deliver each node and each edge. A node is a
  thing a team builds; an edge is an integration between two of them. Edges
  often carry the cross-team ticket. Steps, coins and chips never carry
  tickets; they derive their state from the nodes and edges they involve.
- **Teams.** Which `lanes` exist and which step belongs to which lane. Lane
  pills roll up "n/N done" per team.
- **Blocked.** The overlay marks a ticket blocked when Jira has it Flagged
  (JQL `Flagged = Impediment`) or its status name contains "block". Confirm
  the team uses one of those; otherwise blockers will not show.
- **Jira site.** The absolute site URL for `page.tracking.jira.site`, used to
  pick the right Atlassian resource and to link keys.
- **Stale threshold.** `tracking.staleDays` (default 7): active work not
  updated for longer gets a stale ring without changing its color.
- **PR links.** Pull-request URLs the author wants shown. They are plain
  links; live PR state comes only from what Jira already links to the ticket
  (Development field count and open/merged/declined), never from GitHub.

## 2. Author the spec

Write the diagram as usual, then add, per node or edge, `"tickets": ["HW-123"]`
and optionally `"prs": ["https://..."]`. Keys must match
`^[A-Z][A-Z0-9_]+-[0-9]+$` exactly (case sensitive). Put
`"tracking": {"jira": {"site": "https://<site>.atlassian.net"}, "staleDays": 7}`
on `page` beside `title`, and list `flow.live-status` under
`page.flowview.features`. The spec stores keys only, never status.

Rules of thumb that make the board readable:

- One to three keys per carrier. A carrier with many keys rolls up to its
  worst state and the popover becomes a long list.
- Put the integration ticket on the edge, the component ticket on the node,
  so a blocked integration shows as a red broken edge (the "Not sent" break
  labelled with the key) while the nodes stay their own color.
- Downstream carriers of a blocked or missing one become "waiting on KEY"
  automatically along directed edges. Point the edges in delivery order or
  the propagation runs the wrong way.
- Every key you reference must exist in Jira, or it paints red as MISSING.
  That is the intended signal for a typo or a deleted ticket, so do not add
  placeholder keys.

Validate with `node tools/validate.js <spec.json>`; tracking problems are
warnings, never errors. In the Workbench the same fields live under
**Inspect → Tracking** on a selected node or connection, and **Demo live
status** beside Preview paints sample colors without touching Jira.

## 3. Demo timeline (optional)

For a board that must tell a story without a connector, write
`<name>.timeline.json` shaped like the example: `version`, `intervalSeconds`,
and `days[]`, each with `label`, `note` and `issues` keyed by ticket with
`state` (todo | active | blocked | done), `summary`, `assignee`, `updated`,
`flagged`, `statusName` and `prs: {count, state}`. Include at least one
blocked day and one day where a key is absent, so the board shows both
failure colors. Open the built page with `#live=demo` to replay it.

Known limit: `tools/inject.py` embeds only the example timeline
(`examples/live-status/live-status.timeline.json`) whenever the page has
`tracking`. For a different board, after injecting, replace the contents of
the `<script type="application/json" id="live-timeline">` block in the output
HTML with your own timeline JSON, or delete that block so the page synthesizes
four days (todo, active, one blocker, all done) from its own keys. Keys from
the example timeline will otherwise show as MISSING on your board.

## 4. Publish as a claude.ai artifact

Publish only when asked. Steps:

1. `python3 tools/build.py`, then
   `python3 tools/inject.py <spec.json> template/flowview.html <out.html>`.
2. claude.ai never forwards a URL `#fragment` to the artifact, so a first-run
   tour would start for every viewer. In the artifact copy only, add before
   the boot script: `<script>if(!location.hash)location.hash="#tour=0";</script>`.
   Use `#live=demo&tour=0` instead for a demo-only copy.
3. Find the viewer's Jira connector name in claude.ai Settings → Connectors
   and declare it exactly:
   `capabilities: {mcp: {servers: [{server: "<display name>", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"]}]}, comments: {"composer_only": true, "customAnchors": true}}`.
   Atlassian's own connector is named **Atlassian**. A custom connector (for
   example the mock server) uses whatever name the viewer gave it. Never use
   **Atlassian MCP** for a custom connector or in the declaration unless the
   viewer really has Atlassian's directory connector of that name: it
   resolves to that directory connector and asks for an Atlassian login.
4. The provider picks the connector by the tools it offers, so one declared
   name is enough. A viewer without a qualifying connector sees "Add the
   Atlassian connector in claude.ai Settings → Connectors".

What the viewer sees on first open: a dialog "This artifact uses connectors"
listing the connector with a toggle and Continue. After Continue the Live chip
may read "Jira did not answer; retrying" for a few seconds on a cold start;
the retry is automatic. Then the chip shows the done count and "updated just
now".

Republishing: pass the artifact's existing URL (or the same file path in the
same session) so the link stays stable. Do this after every accepted spec
change; the author is working in the Workbench and sees no live state there.

## 5. Verify after publishing

Open the artifact in a browser and check, in this order:

- Live chip present with a count, not a note.
- **details** opens the Live status panel: carriers done ring, Teams lanes
  with n/N, Blockers, Activity.
- Network: two or more `api/frame/mcp/call` requests with status 200.
- One node or edge popover lists its keys with state and assignee.
- Screenshot for the author.

With the mock server, the story clock advances one story day per minute from
`DEPLOYED_AT` and loops; pin a day with `?day=N` on the connector URL when a
fixed state is needed for a screenshot.

## Out of scope here

Renderer changes, provider changes, the Confluence/Forge provider (#739) and
the Tickets table panel section (#752) are implementation work, not authoring.
Never modify the renderer to make a board pass.

---
name: live-status-board
description: Author a Flowview live-status board (an "Epic Status board"), a diagram whose nodes and edges carry Jira ticket keys and paint themselves from live Jira state (grey to do, amber in progress, green done, red blocked or missing) when opened as a claude.ai artifact with the viewer's Atlassian connector. Load only when the request explicitly asks for live Jira status, an Epic Status board, or ticket tracking on the diagram; a delivery or cross-team diagram without that ask, and all plain Flowview authoring, stays on hld-to-page.
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
open facts below in one batch, writes the spec, and asks the author to
authorize publishing. With that authorization it builds and publishes the
artifact and republishes it after every later accepted change; without it, it
delivers the spec (and built HTML only when standalone output was explicitly
requested). Stories the agent cannot place stay
off the diagram on purpose: the panel's Tickets table lists every child of the
linked epic and tags the unplaced ones NOT ON DIAGRAM, so the author can decide
later. Mention them in the hand-over message as well.

Where the author sees real colors: only in the published artifact. The
Workbench never calls Jira; its **Demo live status** shows sample colors so
the layout can be checked. So, once publishing is authorized, after each spec
change the agent rebuilds and republishes to the same artifact URL (section
4), then tells the author to reload. A publish that creates a new artifact loses the old one's comments.

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
- **PR links.** Pull-request URLs the author wants shown as icons in the PRs
  column and the carrier popover. With the viewer's GitHub connector the icons
  take the pull request's state, checks and review (tooltip and colour, inside
  the panel only); without it they stay plain icons and Jira's Development
  count (open or merged; other states are dropped) is the only PR evidence.
- **GitHub scope.** `tracking.github`: `{"repos": ["owner/repo", ...]}` or
  `{"org": "name"}`. Pull requests are discovered by searching each ticket key
  in titles and bodies within that scope; without it only the authored PRs'
  repositories are searched. Ask which repositories carry the epic's work.

## 2. Author the spec

Write the diagram as usual, then add, per node or edge, `"tickets": ["HW-123"]`
and optionally `"prs": ["https://..."]`. Keys must match
`^[A-Z][A-Z0-9_]+-[0-9]+$` exactly (case sensitive). Put
`"tracking": {"jira": {"site": "https://<site>.atlassian.net"}, "github": {"repos": ["acme/firmware"]}, "staleDays": 7}`
on `page` beside `title` (omit `github` when no repositories are known), and list `flow.live-status` under
`page.flowview.features`. The spec stores keys only, never status.

### Always add the Live status panel

Add this to the diagram so the rollup is visible on open. The default profile
puts the panel in the left half and the diagram, with its step controls attached,
in the right half; narrow hosts stack them. The header owns Live and demo
controls; no reader menu is needed. Use all three host profiles.

```json
{
  "panels": [{"id":"status", "type":"live-status", "title":"Epic status"}],
  "sectionLayout": {"columns":24,
    "default": [
      {"panel":"status","x":0,"y":0,"w":12,"h":27},
      {"x":12,"y":0,"w":12,"h":21},
      {"controls":"steps","attachTo":"diagram","x":12,"y":30,"w":12,"h":5}
    ],
    "backstage": [
      {"x":0,"y":0,"w":24,"h":10},
      {"controls":"steps","x":0,"y":10,"w":24,"h":6},
      {"panel":"status","x":0,"y":16,"w":24,"h":16}
    ],
    "confluence": [
      {"x":0,"y":0,"w":24,"h":10},
      {"controls":"steps","x":0,"y":10,"w":24,"h":6},
      {"panel":"status","x":0,"y":16,"w":24,"h":16}
    ]
  }
}
```

Rules of thumb that make the board readable:

- One to three keys per carrier. A carrier with many keys rolls up to its
  worst state and the popover becomes a long list.
- Put the integration ticket on the edge, the component ticket on the node,
  so a blocked integration shows as a rose broken edge (the engine's break
  glyph, with no text on the canvas; the blocking key is in the glyph's
  accessible name and in the carrier's popover) while the nodes keep their own
  color.
- Arrows are data flow, nothing more. Waiting comes from ticket dependencies
  (section 2b), never from edge direction.
- Every key you reference must exist in Jira, or it paints red as MISSING.
  That is the intended signal for a typo or a deleted ticket, so do not add
  placeholder keys.

Validate with `node tools/validate.js <spec.json>`; tracking problems are
warnings, never errors. In the Workbench the same fields live under
**Inspect → Tracking** on a selected node or connection, and **Demo live
status** beside Preview paints sample colors without touching Jira.

## 2b. Dependencies

Waiting is dependency evidence: ticket X waits while an upstream ticket Y is not
done (grey, raised hand) or is blocked or missing (red, alarm); a done upstream
shows a green check. Two sources merge:
Jira issue links (default types `is blocked by` and `depends on`, configurable as
`tracking.jira.dependencyLinks`) and authored pairs in `tracking.dependencies`.

1. Pull the Jira links for every key on the board (through the author's
   connector, or ask for them) and present them: "FW-46 is blocked by HW-124".
2. Infer delivery dependencies from the design source, each with a reason and a
   citation: an API consumer waits on its provider, a contract lands before its
   consumer, firmware lands before the app feature that needs it.
   Never from arrows.
3. The author confirms. Write `tracking.dependencies` for the inferred pairs
   only, for example
   `{"ticket": "UX-89", "on": "BE-68", "reason": "needs the push payload contract"}`;
   Jira-linked pairs stay live and need no spec entry.
4. Offer, lightly, to create the missing Jira links from the confirmed inferred
   pairs. That happens in the agent session with explicit authorization each
   time; the page itself only shows the "Suggest link in Jira" hint and never
   writes to Jira.

## 3. Demo timeline (optional)

For a board that must tell a story without a connector, write
`<name>.timeline.json` shaped like the example: `version`, `intervalSeconds`,
and `days[]`, each with `label`, `note` and `issues` keyed by ticket with
`state` (todo | active | blocked | done), `summary`, `assignee`, `updated`,
`flagged`, `statusName`, `prs: {count, state}` and optional
`links: [{"type": "is blocked by", "key": "HW-124"}]` for Jira issue links; from the
day a PR opens, add `prs.links` in the host-provider shape (`url`, `number`, `title`,
`state`, `checks`, `review`, `repo`, `author`, `source`) so the icons show offline.
Include at least one blocked day and one day where a key is absent, so the
board shows both failure colors, and link a todo ticket to the blocked one so
the red waiting stroke appears. Open the built page with `#live=demo` to replay it.

Embed it at inject time:
`python3 tools/inject.py <spec.json> template/flowview.html <out.html> --timeline <name>.timeline.json`.
The injector checks the file's shape (`version`, `intervalSeconds`,
`days[].issues`) and fails loud on a mismatch. Without the flag, only the
example spec (`examples/live-status/live-status.spec.json`) gets the example
timeline; every other spec gets none, so `#live=demo` synthesizes four days
(todo, active, one blocker, all done) from the board's own keys. Pass
`--timeline none` to force that synthesized replay for the example too. Keys
from a timeline that does not match the board show as MISSING, so never embed
another board's timeline.

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
   For pull-request detail add the viewer's GitHub custom connector (GitHub's
   remote MCP server `https://api.githubcopilot.com/mcp/`, OAuth) as a second
   entry under its exact display name, for example
   `{server: "GitHub", tools: ["search_pull_requests", "pull_request_read"]}`.
   Without it the board still works; PR icons stay plain and the header says
   "GitHub not connected" when the page has GitHub links or a scope.
4. The built page carries an agent guide block
   (`<script type="text/markdown" id="dv-agent-guide">`, written by
   `tools/inject.py`) with this edit loop, the declaration above as JSON, the
   tracking rules and the page's `authoredWith` version. Any editor of the
   artifact can later ask their own agent to read the page and apply a change
   without this repo; the Live status panel's last line tells them so. Keep
   the block in the artifact copy and do not add secrets to the spec or the
   HTML: every viewer can read both.
5. With the connector-selection change from #750 the provider picks the
   connector by the tools it offers, so one declared name is enough. On a
   build without that change the provider accepts only the display names
   **Atlassian MCP** and **Atlassian**; check `src/viewer/live-status-claude.js`
   for a `qualified` list before relying on a custom name. A viewer without a
   qualifying connector sees "Add the Atlassian connector in claude.ai
   Settings → Connectors".

What the viewer sees on first open: a dialog "This artifact uses connectors"
listing the connector with a toggle and Continue. After Continue the Live status panel header
may read "Jira did not answer; retrying" for a few seconds on a cold start;
the retry is automatic. Then the header's connector indicator reads
"Jira connected, refreshed just now", the state counts fill in, and the body's
ring shows carriers done.

Republishing: pass the artifact's existing URL as `url` on the publish call,
after reading that artifact with the Artifact tool's read action in the
current conversation; a publish without `url` creates a new artifact with a
new link and none of the old comments. The same steps are in the page's
embedded agent guide, so an editor's agent that has only the artifact URL can
run this loop too. Do this after every accepted spec
change the author has authorized publishing for; the author is working in
the Workbench and sees no live state there.

## 5. Verify after publishing

Open the artifact in a browser and check, in this order:

- The Live status panel beside the diagram shows the epic header box with the
  carriers done ring, the Tickets table with its Depends on buttons, Blockers
  and dependency chains, and Activity without a click.
- Its header shows Live, counts and updated time; demo controls appear only in demo mode.
  With a GitHub connector the connection line ends "· GitHub connected" and the
  PRs column icons are coloured with a tooltip (state, checks, review, author,
  repository).
- Network: two or more `api/frame/mcp/call` requests with status 200.
- Clicking one node card or edge label opens its popover, listing the keys with state and assignee. The canvas has no status badges.
- Screenshot for the author.

With the mock server, the story clock advances one story day per minute from
`DEPLOYED_AT` and loops; pin a day with `?day=N` on the connector URL when a
fixed state is needed for a screenshot.

## Out of scope here

Renderer changes, provider changes, the Confluence/Forge provider (#739) and
the Tickets table panel section (#752) are implementation work, not authoring.
Never modify the renderer to make a board pass.

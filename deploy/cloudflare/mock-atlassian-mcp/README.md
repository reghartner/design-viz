# Mock Atlassian MCP

A dependency-free Cloudflare Worker for exercising Flowview live ticket status
without an Atlassian account. It serves fictional Jira data using the three
Atlassian tool names: `getAccessibleAtlassianResources`,
`searchJiraIssuesUsingJql`, and `getJiraIssue`. It is a public, read-only mock,
with no credentials or Jira connection. Document editing remains desktop-only.

## Deploy

Use Node 22 or later with Wrangler 4. From the repository root:

1. Run `npx -y wrangler@4 login` once on your machine.
2. Supply your own Worker name in the shell variable `FLOWVIEW_CF_WORKER`.
   Keep the tracked config's `mock-atlassian-mcp` placeholder unchanged.
3. Deploy (no npm install or separate build required):

   ```sh
   npx -y wrangler@4 deploy -c deploy/cloudflare/mock-atlassian-mcp/wrangler.jsonc --name "$FLOWVIEW_CF_WORKER"
   ```

The connector URL is `https://<worker>.<subdomain>.workers.dev/mcp`.
Check `/healthz` for `ok`. To restart the story clock, set `DEPLOYED_AT` to an
ISO timestamp in the Worker's environment through the Cloudflare dashboard and
redeploy there, or supply `--var "DEPLOYED_AT:<ISO timestamp>"` during deployment.
Without a valid value the fixed epoch is `2026-10-20T09:00:00Z`; it does not
automatically reset on deploy.

Follow the [existing deployment convention](../README.md): never commit an
actual Worker name, account ID, deployed address, login token, `local.env` or
`.wrangler/` cache. This folder's reviewed sources are allowlisted by the parent
`.gitignore`; local settings and caches stay ignored. Do not force-add them.

## Connect from claude.ai

Open Settings → Connectors → Add custom connector → URL, paste the `/mcp` URL,
choose Authentication **No sign-in**, and name it exactly **Atlassian MCP**.
Enable the connector in the conversation using the live-status artifact. The
artifact needs the `mcp` capability. No Atlassian account or OAuth is involved.

The endpoint uses stateless Streamable HTTP: JSON-RPC over `POST /mcp`, single
requests or batches, JSON responses, and 202 for notifications. `GET /mcp` is
405 because there is no SSE stream. CORS allows browser calls; no session ID is
required. `initialize` echoes the client's protocol version, defaulting to
`2025-06-18`. This mock implements tools only, with no resources or prompts.

## Scenarios

Append these queries to `/mcp` when adding a connector:

- `?scenario=story` (default): hardware starts, firmware follows, a hardware
  blocker stalls delivery, UX and backend progress, the blocker clears, PRs
  open and merge, and all seven tickets finish.
- `?scenario=story&day=3`: pin a zero-based day; values clamp to the timeline.
- `?scenario=all-todo`: every example ticket is To Do.
- `?scenario=all-done`: every example ticket is Done.

Unknown scenario names select `all-todo`. Without `day`, the story advances one
day per minute: `floor((now - DEPLOYED_AT) / 60000) mod days.length`. The shared
[timeline](../../../examples/live-status/live-status.timeline.json) is imported
directly as JSON at bundle time. Its `intervalSeconds: 6` is for the page's demo
playback; the server intentionally uses a minute. One day temporarily renames
`UX-89` to `UX-90`, so querying the original key demonstrates missing status.
The fixed scenarios live in `fixtures/` and do not rotate.

Supported JQL clauses, case-insensitive and joined by `AND` in any order:
`key in (HW-123, "FW-45")`, `Flagged = Impediment`,
`statusCategory = "In Progress"` (also `new`, `indeterminate`, `done`, `To Do`,
`Done`), and `project = HW`. Unsupported syntax returns an empty list. Limits
default to 50 and cap at 100; `nextPageToken` is ignored and results always
report no next page. `fields` is ignored; `customFields` is returned even when
a fields array omits `customFields` and `*all`. Cloud IDs are accepted but do
not select a real tenant. Unknown issue keys return error -32602.

## Fidelity and local checks

Result shapes follow public documentation and community reports,
not a captured `tools/list`. These specific points remain unverified against a real connector:

- The compact-view node shape and whether it changes for a `fields` projection.
- The `customFields` keying: this mock uses display names `Flagged` and
  `Development`; a real connector may expose IDs or another representation.
- Development field survival through the connector's transformation, including
  the embedded JSON string used for linked PR summaries.

The mock returns `issues: {nodes, webUrl}` plus `pageInfo` for search, and
`data: {appliedContentFormat: "markdown", id, key, fields}` for single issues.
Blocked means an in-progress category plus a Flagged Impediment; PR summaries
never determine status. Assignees, priorities and issue types are fictional.

Run `node --test tests/mock-atlassian-mcp.test.js` from the root. The pure
`handleMcp(request, env)` uses no Cloudflare APIs: `env.now` supplies epoch
milliseconds, `env.scenario` and `env.day` supply selection, and
`env.DEPLOYED_AT` supplies the clock origin. An optional `env.timeline` supports
test fixtures. The Worker supplies the current time and URL selection; without
an injected time the pure handler uses the fixed epoch for deterministic tests.

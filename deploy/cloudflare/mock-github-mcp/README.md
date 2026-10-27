# Mock GitHub MCP

A dependency-free Cloudflare Worker that stands in for the viewer's GitHub
connector when exercising Flowview live ticket status (#756) without a GitHub
account. It serves the pull requests of the shared story timeline through the two
tool names the live-status adapter calls on GitHub's remote MCP server:
`search_pull_requests` and `pull_request_read`. It is a public, read-only mock
with no credentials and no GitHub connection. Document editing remains
desktop-only.

## Deploy

Use Node 22 or later with Wrangler 4. From the repository root:

1. Run `npx -y wrangler@4 login` once on your machine.
2. Supply your own Worker name in the shell variable `FLOWVIEW_CF_WORKER`.
   Keep the tracked config's `mock-github-mcp` placeholder unchanged.
3. Deploy (no npm install or separate build required):

   ```sh
   npx -y wrangler@4 deploy -c deploy/cloudflare/mock-github-mcp/wrangler.jsonc --name "$FLOWVIEW_CF_WORKER"
   ```

The connector URL is `https://<worker>.<subdomain>.workers.dev/mcp`. Check
`/healthz` for `ok`. The story clock is the one the
[mock Atlassian MCP](../mock-atlassian-mcp/README.md) uses: one story day per
minute from `DEPLOYED_AT` (fixed epoch `2026-10-20T09:00:00Z` without a valid
value), so deploy both mocks with the same `DEPLOYED_AT` to keep Jira state and
pull requests on the same day.

Follow the [existing deployment convention](../README.md): never commit an
actual Worker name, account ID, deployed address, login token, `local.env` or
`.wrangler/` cache. This folder's reviewed sources are allowlisted by the parent
`.gitignore`; local settings and caches stay ignored. Do not force-add them.

## Connect from claude.ai

Open Settings → Connectors → Add custom connector → URL, paste the `/mcp` URL,
choose Authentication **No sign-in**, and give it a name such as
**Mock-github**. Publish the live-status artifact with the `mcp` capability
declaring that exact display name as a second server beside the Jira one, with
`tools: ["search_pull_requests", "pull_request_read"]` (see `docs/live-status.md`,
"Pull requests from GitHub"); the adapter picks the connector by the tools it
offers, not by name. No GitHub account or OAuth is involved. The real connector
is GitHub's remote MCP server at `https://api.githubcopilot.com/mcp/` with OAuth.

The endpoint uses stateless Streamable HTTP: JSON-RPC over `POST /mcp`, single
requests or batches, JSON responses, and 202 for notifications. `GET /mcp` is
405 because there is no SSE stream. CORS allows browser calls; no session ID is
required. `initialize` echoes the client's protocol version, defaulting to
`2025-06-18`. This mock implements tools only, with no resources or prompts.

## Scenarios

Append these queries to `/mcp` when adding a connector:

- `?scenario=story` (default): the pull requests of the current story day, from
  the day reviews open (Day 8) through the final merge.
- `?scenario=story&day=7`: pin a zero-based day; values clamp to the timeline.
- `?scenario=all-todo` and `?scenario=all-done`: no pull requests.

The pull requests are the `prs.links` entries of the shared
[timeline](../../../examples/live-status/live-status.timeline.json), imported
directly as JSON at bundle time. Each carries its ticket key in the title or is
authored on the carrier (`acme/firmware#88`, `acme/backend#91`), so a search for
`"FW-45" in:title,body repo:acme/firmware` finds it.

## Tools

- `search_pull_requests {query, owner?, repo?, fields?, sort?, order?, page?, perPage?}`
  returns `{total_count, incomplete_results, search_type: "lexical", items[]}`.
  The query grammar is small: quoted or bare terms must all appear in the ticket
  key plus title; `repo:owner/repo` (repeatable) and `org:name` scope the results;
  `is:`, `in:`, `state:` and `type:` qualifiers are accepted and ignored. `fields`
  is ignored; the full item is always returned. `perPage` defaults to 30 and caps
  at 100.
- `pull_request_read {method, owner, repo, pullNumber}`: `get` returns the
  trimmed pull request; `get_check_runs` returns `{total_count, check_runs[]}`
  derived from the link's `checks` (failing: one `failure` run; pending: one
  `in_progress` run; passing: all `success`; none: empty); `get_reviews` returns
  one review in the link's `review` state (`APPROVED`, `CHANGES_REQUESTED`,
  `COMMENTED`) or an empty list; `get_status` returns the empty legacy
  commit-status envelope `{state: "pending", total_count: 0, statuses: []}`, as a
  real Actions-only repository does. Other methods return error -32602, as do
  unknown pull requests (`Not Found`).

## Fidelity and local checks

Result shapes follow the schemas captured on 2026-10-27 from a real claude.ai
custom connector (`docs/live-status.md`, "Pull requests from GitHub"); the
`fields` projection, labels, counts and SHA values are placeholders. Rate limits
are not simulated: the real connector answers `tool_error` with “rate limit
exceeded” after about 30 searches a minute.

Run `node --test tests/mock-github-mcp.test.js` from the root. The pure
`handleMcp(request, env)` uses no Cloudflare APIs: `env.now` supplies epoch
milliseconds, `env.scenario` and `env.day` supply selection, and
`env.DEPLOYED_AT` supplies the clock origin. An optional `env.timeline` supports
test fixtures. The Worker supplies the current time and URL selection; without
an injected time the pure handler uses the fixed epoch for deterministic tests.

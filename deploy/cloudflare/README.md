# Standalone workbench on Cloudflare Workers

Hosts the workbench editor as static files with a login gate, for people who
only create and edit diagrams with a local agent. No server code runs. It
excludes the Backstage catalog, the Canon diagram library and imported
topology; `deploy/workbench/` is the full image for those. The page is
whatever `tools/build.py` produces in the checkout: a company fork's
`company/` overlay and `workbench/site.json` are built in as usual.

Cost: Cloudflare Workers Free plan serves static assets without charge and has
hard caps instead of overage billing. Cloudflare Access on the Zero Trust Free
plan covers 50 users; onboarding asks for a payment method but charges nothing
on that plan. Check Cloudflare's pricing pages before relying on either figure.

## What gets uploaded

`deploy.sh` runs `python3 tools/build.py`, assembles `deploy/cloudflare/site/`,
generates `deploy/cloudflare/.generated/wrangler.jsonc`, and uploads with Wrangler:

| Published path | Source | Purpose |
| --- | --- | --- |
| `/workbench/flowspec.html` | `workbench/flowspec.html` | the editor |
| `/workbench/diagrams.json` | generated, always empty | library index; its presence makes Browse show nothing rather than the bundled fictional example. `canon.json` is ignored |
| `/workbench/starters.json` | `workbench/starters.example.json` | welcome-page starter projects |
| `/template/flowview.html` | `template/flowview.html` | fetched by Export project |
| `/_redirects` | generated | `/` redirects to the editor |
| `/_headers` | generated | `Cache-Control: no-cache` so redeploys show at once |

The generated config sets `html_handling: "none"` so `/workbench/flowspec.html` is
served at its exact path; the editor fetches `starters.json`, `diagrams.json`
and `../template/flowview.html` relative to that URL. The built-in starter
projects are embedded in `flowspec.html`, so `src/starters/` is not uploaded. There is no
`workbench/catalog.json`, so **From service catalog** reports no catalog.

## Nothing account-specific is committed

Only `README.md`, `deploy.sh` and `local.env.example` in this folder are tracked;
`.gitignore` excludes everything else here, and `tests/cloudflare-deploy.test.js`
fails if another file in this folder is tracked or if a Worker name or
`workers.dev` address appears in them. The Worker name lives in the gitignored
`local.env` (or the `FLOWVIEW_CF_WORKER` environment variable). Wrangler keeps
its login token in your user profile, outside the repository. Do not paste the
deployed address, account ID or Access team name into commits, PRs or docs.

## First deploy

1. Node 22 or later (Wrangler 4 requires it) and Python 3. Run `npx wrangler login`
   once per machine (opens a browser).
2. `cp deploy/cloudflare/local.env.example deploy/cloudflare/local.env` and set
   `FLOWVIEW_CF_WORKER` to a Worker name of your choice.
3. `sh deploy/cloudflare/deploy.sh`. Wrangler creates the Worker on first upload
   and prints its `*.workers.dev` URL.
4. Gate it: Cloudflare dashboard → Workers & Pages → the Worker →
   **Protect this Worker behind Access** → choose **Cloudflare account** (not
   **Email domain**, which admits every address at that domain). Zero Trust
   onboarding runs first if the account has none; pick the Free plan.
5. Add people: Zero Trust → Access → Applications → the Worker's application →
   Policies → Include → **Emails** → list addresses. They sign in with a
   one-time PIN sent to that email.

Verify from outside: `curl -sI https://<worker>.workers.dev/workbench/flowspec.html`
must answer `302` to a `cloudflareaccess.com` URL.

## Redeploy

Run `sh deploy/cloudflare/deploy.sh` again. Wrangler uploads only changed files.

## Agent editing

The hosted page never contacts an agent. **Build with my agent → Work in your
agent** opens a folder on the visitor's own machine through the browser's
directory picker (Chrome or Edge); the visitor pastes the generated setup into
Claude Code on that machine. See [diagram folders](../../docs/folder-agent-session.md).

## Do not

- Do not run `wrangler pages project create` or `wrangler init` in the repository
  root. They write a `wrangler.jsonc` there that can point at a repository folder,
  edit `.gitignore`, and publish that folder. The root `.gitignore` excludes
  those files, but the upload itself is not undone.
- Do not add `canon.json` diagram folders expecting them to appear: this script
  always uploads an empty library index and no `diagrams/` files. Use
  `deploy/workbench/` for a published library.

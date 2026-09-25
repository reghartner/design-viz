# Automated GitHub drift scans

The central spec repository runs `.github/workflows/canon-drift.yml` every weekday
at **08:23 America/New_York**, including daylight saving changes. Scans run in
GitHub Actions without the mock portal or a laptop running. **Actions →
canonical-flow-drift → Run workflow** starts one immediately; select **dry_run**
to produce evidence without any GitHub writes. GitHub schedules can start late
under load; this is a review cadence, not a real-time monitor.

The workflow scans trusted default-branch specs against the current default
branch of every referenced source repository. It reads immutable source blobs
through the API and compares the anchored regions. It does not run watched code,
run an agent, or decide whether a change alters behavior.

## Enable the sample in this repository

`examples/canon/github/registry.json` watches the three real sample functions in
`examples/canon/doorbell-app/src/`. Its spec links to real reviewed GitHub commits.
This is separate from `examples/canon/registry.json`, whose repositories and SHAs
are fictional fixtures for the local portal.

From an authenticated checkout of `reghartner/design-viz`:

```sh
gh variable set FLOWVIEW_REGISTRY --body examples/canon/github/registry.json
gh variable set FLOWVIEW_CANON_ENABLED --body true
gh workflow run canon-drift.yml --ref main -f dry_run=true
```

Then run with `-f dry_run=false` to allow review PRs. Both modes also write a
Markdown report and JSON evidence. No extra source secret is needed when the
watched app and central specs are in this same repository.

For PR creation, **Settings → Actions → General → Workflow permissions → Allow
GitHub Actions to create and approve pull requests** must be enabled. The
workflow asks for contents/PR write permissions explicitly; the repository's
default workflow permission can stay read-only. It never approves PRs itself.
Create these disposition labels once (or choose equivalent colors):

```sh
gh label create flowview/no-impact --color 238636 --description 'Reviewed source change preserves the canonical behavior'
gh label create flowview/regression --color D93F0B --description 'Preserve canon and track a behavioral regression with an issue'
```

The sample spec initially pins the earlier app revision. A comment-only change
inside `receiveButton` supplies the first real drift review without changing the
app's behavior. That review is deliberately left for a maintainer; a scan must
not silently approve its own findings. After acceptance, later scans are clean
until another referenced region changes. The separate local rehearsal still
exercises the deliberately broken timeout without publishing broken sample code.

## Connect private company repositories

For the maintained diagram library, set `FLOWVIEW_REGISTRY=canon.json`. This is
the same root membership file used by Backstage and the nginx workbench; its
folder entries replace a separate production registry. The runner accepts that
format and derives compatibility IDs from folder names. The sample registry
above is only a rehearsal. Enroll at least one diagram before enabling scans;
the workflow rejects an empty registry.

Copy the runner, its dependencies, workflow and a real spec registry into the
central repository (or keep an equivalent tooling checkout there). Set
`FLOWVIEW_REGISTRY` to that registry. Source URLs and pinned SHAs must refer to
actual reviewed company code, not the sample repository. The current adapter
supports one GitHub/GHES host and each source repository's default branch.

Prefer a GitHub App installed on the explicit watched repositories with
**Contents: read** permission. The workflow mints a fresh installation token for
each run and revokes it afterward. Configure:

| Setting | Kind | Value |
| --- | --- | --- |
| `FLOWVIEW_CANON_ENABLED` | Repository variable | `true` |
| `FLOWVIEW_REGISTRY` | Repository variable | Path to the checked-in registry |
| `FLOWVIEW_SOURCE_APP_CLIENT_ID` | Repository variable | Source-reading GitHub App client ID |
| `FLOWVIEW_SOURCE_OWNER` | Repository variable | Organization/owner; defaults to the central repository owner |
| `FLOWVIEW_SOURCE_REPOSITORIES` | Repository variable | Explicit comma/newline-separated repository names for that installation |
| `FLOWVIEW_SOURCE_APP_PRIVATE_KEY` | Repository secret | App private key |

The source token is read-only. The central repository's `GITHUB_TOKEN` creates
reports and records authorized review decisions. Do not grant the source-reading
App write access just to make central review PRs work. An existing company token
broker can instead provide `FLOWVIEW_SOURCE_TOKEN`; without either source-token
configuration, the runner falls back to `GITHUB_TOKEN` (normally scoped to the
central repository). Never check credentials into a registry or spec.

The GitHub App action and timezone-aware schedule need a compatible Actions
platform. Company GHES installations may need supported action versions or a UTC
schedule. Installing/configuring the company App is the remaining company-side
integration, not something the mock portal can do.

### Read-only source checkouts

For an explicit CI checkout obtained with a repository-scoped SSH deploy key,
set `FLOWVIEW_LOCAL_SOURCES` to a trusted, default-branch JSON manifest:

```json
{"version":1,"repositories":{"https://github.com/company/service":".local/source"}}
```

The workflow must fetch the intended default branch and complete Git history
before scanning. This adapter reads HEAD and pinned blobs using Git object reads;
it never executes watched code. Only listed repositories are readable. The same
mapping is needed for decision jobs to verify exact reviewed evidence. GitHub's
normal repository token still writes review PRs and authorized decisions in the
designs repository. This avoids storing a broad personal cross-repository token.
Checkout directories and manifests must not come from PR payloads.

## Read the results and record a decision

Each run has a summary with the number of diagrams, code references, findings
and links to existing/new review PRs. Download the `flowview-drift-…` artifact
for `report.md` and `report.json`; artifacts retain source excerpts for 30 days
under the repository's access rules. A clean scan explicitly says no referenced
code changed. Source access failures or missing/ambiguous anchors make the run
fail with repair evidence, rather than appearing clean.

One PR is opened per changed reference scope, with every affected diagram and
step. Repeated scans reuse it, including when someone has closed it without a
disposition. A recorded regression stays visible without generating another PR.
An interrupted PR creation can reuse its already-created branch on retry.

- **No impact:** a maintainer labels the report `flowview/no-impact` and closes it.
  The decision job pins the exact reviewed source revision and records the audit
  decision. The runner never accepts whatever source HEAD happens to be later.
- **Regression:** label `flowview/regression`, put a line such as
  `Regression ticket: https://tracker.example/issues/123` in the body, and close.
  The decision is recorded while the expected spec remains unchanged.
- **Intentional behavior change:** update the affected spec and its reviewed
  source pin in an ordinary reviewed PR. Report closure/merge alone is not approval.

Closed, labeled and edited review events are handled automatically. This lets a
maintainer add a missing ticket after closing and retry the decision. Repeated
identical decision events do not create another acceptance commit. Both labels,
unprivileged actors, stale evidence and changed default-branch revisions fail
without accepting a baseline. A review must be a same-repository bot PR with the
expected branch and evidence marker. The workflow never checks out its head.

Acceptance writes specs and `.flowview/drift-state.json` in one non-forced commit.
If branch protection disallows bot commits, the decision job fails and leaves
canon unchanged; the company integration must route that commit through its
approved protected-branch process. A report PR created with `GITHUB_TOKEN` does
not automatically trigger other PR workflows; do not depend on that event for
required company checks. These are evidence-only reports, not executable changes.

To pause scanning and decision jobs:

```sh
gh variable set FLOWVIEW_CANON_ENABLED --body false
```

To recover a failed run, fix the reported configuration/source/permission issue
and rerun it from Actions. A default-branch race needs a fresh workflow dispatch
so checkout sees the newest commit. Schedule/dispatch share a concurrency group
with decisions. Do not enable an unrelated bot's auto-merge rule for drift reports.

## Validation and references

HTTP adapter tests cover report-only/clean/error scans, credential separation,
PR recovery/deduplication, review permission gates, repeated decision events,
stale reviews and regression preservation. The live sample watches real GitHub
source. The local app rehearsal separately proves the harmless and broken app
outcomes; a text scan by itself never proves behavior.

GitHub documents [scheduled workflows and timezones](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[installation-token configuration](https://github.com/actions/create-github-app-token),
and [repository workflow permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#setting-the-permissions-of-the-github_token).

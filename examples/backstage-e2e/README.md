# Portable Backstage / GitHub rehearsal

This public package recreates the complete fictional company test from a clean
Flowview checkout. It does not clone the original private rehearsal repositories
or reuse their history, credentials, commit pins, or evidence PRs.

The creator generates **two ordinary local Git repositories** with configurable
names: a mock company containing executable service code and real Backstage,
and a designer containing approved specs, the external editor, catalog snapshot,
read API and GitHub workflows. Neither setup nor CI merges PRs automatically.

This is the existing **reference proxy-adapter rehearsal**, not the company
hosting topology. The company uses one Flowview fork named `backstage-diagrams`,
serves only the static workbench there, and has its Backstage plugin pull specs
from GitHub. This rehearsal verifies native rendering and drift; the company
GitHub loader needs separate integration acceptance. See the
[current handoff](../../docs/backstage-integration.md#github-source-integration-status).

## 1. Create and run locally

Requirements: Node **24**, npm, Git, macOS or Linux, npm registry access, and the
native build tools needed by Backstage's SQLite dependency. Google Chrome is
needed for the optional browser test. The larger Backstage install takes several
minutes. No GitHub credentials or hosted sandbox are needed for local playback.

From a clean checkout of this public repository:

```sh
node examples/backstage-e2e/create.mjs \
  --out ../flowview-rehearsal \
  --owner YOUR_GITHUB_OWNER
cd ../flowview-rehearsal/backstage-designer-mock
node scripts/install-backstage.mjs
node scripts/start.mjs ../backstage-designer
```

Choose your actual GitHub owner up front so catalog annotations and source links
will work after publishing. Optional `--mock-repo NAME` and `--designer-repo NAME`
avoid collisions with existing repositories. The output directory must be new.
On a setup failure the partial output stays available for diagnosis; retry with
a new directory after correcting the error.

Open [Recording service → Diagrams](http://localhost:3000/catalog/home/component/recording-service/diagrams)
and click **Enter** for Guest sign-in. The
[workbench](http://localhost:7020/workbench/flowspec.html?canon=doorbell) is external.
The launcher also runs real Backstage's API on 7007 and the catalog fixture on
7010. These ports must be free. Stop all child services with Ctrl-C.

The creator:

1. Copies only the package's selected fictional source files and initializes a
   new source history with a healthy 500 ms recording deadline.
2. Copies the actual tracked Flowview runtime/plugin from this checkout and
   records its exact commit. Local dependencies and private files are excluded.
3. Starts the mock on a temporary port and makes an authenticated Catalog API
   GET using the production importer. Three services and three APIs seed the editor.
4. Authors a happy/timeout diagram from those identities and pins its code anchors
   to the new source commit. These are fresh pins, not copied demo SHAs.
5. Records the designer package source and generates ignored local credentials/CSP
   configuration, then creates separate refactor and timeout experiment branches.
   Source `main` remains healthy. Creation does not install the Backstage host.

The real Backstage host is the official create-app 0.9.2 scaffold with a committed
host dependency lockfile and selected plugins. It ingests the mock repository's
catalog/OpenAPI files through real processors. The install script builds and packs
`@flowview/backstage-plugin` from the designer, then installs that tarball in the
app. Its `/new-frontend` entry renders approved specs through the reference
authenticated proxy. This is development Guest
auth with fictional data; company SSO and production hosting are separate work.
No plugin source is copied into the host. The separate generated designer exists
for this fictional rehearsal; the company publishes from its existing Flowview
fork and does not need an additional source repository.

The fixture lockfile pins the host dependencies before the local package exists.
`install-backstage.mjs` names the tarball by its SHA-256 digest, updates the app
manifest, and deliberately runs Yarn with `--no-immutable` to resolve that local
archive. Repeat the installer after a reviewed runtime change. Review the app
manifest and lockfile diff; changed package bytes get a new file locator even at
the same version. Tarballs stay under ignored `sandbox/backstage/.local/`.
Keep the staged archive when running a later `yarn install --immutable`; a fresh
clone needs setup and the installer to rebuild its local package first.

## 2. Verify locally

The generated mock README contains all commands. With its launcher running:

```sh
npm test
node scripts/check-real-catalog.mjs ../backstage-designer
cd sandbox/backstage
node .yarn/releases/yarn-4.13.0.cjs tsc
node .yarn/releases/yarn-4.13.0.cjs playwright test --config playwright.flowview.config.ts
```

The catalog check compares the fixture and the **real** Backstage backend with
the approved workbench snapshot, including API operations. The browser test covers
service and API diagram tabs, happy/timeout playback, and API/code/editor links.
The generated designer also has read API tests and an nginx build/smoke CI job.

To test the package generator itself from the public checkout:

```sh
node --test examples/backstage-e2e/tests/*.test.mjs
```

That test generates fresh repositories, seeds over HTTP, runs their contracts,
and checks that the real scanner detects both experiments while main stays healthy.
It makes npm requests but creates no GitHub repositories, PRs, or review decisions.

## 3. Publish your two generated repositories

Run these commands from `flowview-rehearsal`. Install/authenticate GitHub CLI first.
Use the same owner and names you gave the creator. The commands below create
private repos; change both `--private` flags to `--public` to publish the fictional
test repos. Publishing this package itself does not change any existing repo's
visibility. Nothing here needs access to our original private test repos.

```sh
REHEARSAL_OWNER=YOUR_GITHUB_OWNER
MOCK_REPO=backstage-designer-mock
DESIGNER_REPO=backstage-designer

gh repo create "$REHEARSAL_OWNER/$MOCK_REPO" --private --source "$MOCK_REPO" --remote origin --push
gh repo create "$REHEARSAL_OWNER/$DESIGNER_REPO" --private --source "$DESIGNER_REPO" --remote origin --push
gh repo edit "$REHEARSAL_OWNER/$MOCK_REPO" --default-branch main
gh repo edit "$REHEARSAL_OWNER/$DESIGNER_REPO" --default-branch main
git -C "$MOCK_REPO" push origin codex/rehearsal-refactor codex/rehearsal-timeout
```

These are bootstrap commits to **new** repositories. Future changes use PRs for
human review. The timeout branch intentionally fails source contract CI; do not
merge it into main just to complete the rehearsal.

Configure the designer to read the source repository with a **read-only** deploy
key, including when rehearsing private repositories. Do not use a personal token:

```sh
mkdir -p "$DESIGNER_REPO/.local"
ssh-keygen -t ed25519 -N '' -C flowview-rehearsal-read-only -f "$DESIGNER_REPO/.local/mock-read-key"
gh repo deploy-key add "$DESIGNER_REPO/.local/mock-read-key.pub" \
  --repo "$REHEARSAL_OWNER/$MOCK_REPO" --title flowview-rehearsal-read-only
gh secret set MOCK_SOURCE_SSH_KEY --repo "$REHEARSAL_OWNER/$DESIGNER_REPO" \
  < "$DESIGNER_REPO/.local/mock-read-key"
```

In the designer's **Settings → Actions → General → Workflow permissions**, enable
**Allow GitHub Actions to create and approve pull requests** if your organization
allows it. The workflow requests its needed write permissions explicitly; it
opens PRs but does not approve or merge them. Organization policy may require a
GitHub App identity instead. Keep auto-merge disabled. See the
[GitHub workflow permissions reference](https://docs.github.com/en/rest/actions/permissions#set-default-workflow-permissions-for-a-repository).

The generated designer workflows run daily at **08:17** (catalog) and **08:23**
(drift), America/New_York. Scheduled runs read source main; experiments require
manual selection. GitHub may require scheduled workflows to be enabled in a fork.

## 4. Exercise the actual GitHub loop

From the generated workspace, using the variables above:

```sh
gh workflow run catalog-sync.yml --repo "$REHEARSAL_OWNER/$DESIGNER_REPO"
gh workflow run drift.yml --repo "$REHEARSAL_OWNER/$DESIGNER_REPO" -f source_ref=main -f dry_run=true
gh workflow run drift.yml --repo "$REHEARSAL_OWNER/$DESIGNER_REPO" -f source_ref=codex/rehearsal-refactor -f dry_run=false
gh workflow run drift.yml --repo "$REHEARSAL_OWNER/$DESIGNER_REPO" -f source_ref=codex/rehearsal-timeout -f dry_run=false
```

Expect a clean baseline and two distinct evidence PRs, each naming the doorbell
diagram's recording step and exact source diff. Refactor preserves behavior;
timeout breaks normal 120 ms storage and suppresses recording/notification.
Run the unchanged contract tests on each source branch for behavioral evidence.
The scanner itself only reads Git objects. Repeated scans reuse the report PR.

For the catalog loop, change a fictional API operation or service title through
a mock repo PR, merge it **manually**, and rerun catalog sync. Review and manually
merge its catalog-only PR; the next nginx image build includes that snapshot.
Catalog sync never rewrites authored code references or diagram steps.

Do not close or label findings as harmless merely to clear the test queue.
Experimental findings are compared with main again at disposition time, so they
cannot be accepted against unrelated source. For an intentional human decision,
use the [drift review guide](../../docs/github-drift-automation.md). Plain closure
never accepts a new baseline. No automatic decision is part of this package.

## What is public, and what stays local

The public package contains selected fictional source, the mock API, real
Backstage scaffold/lockfile, portable setup, sample authoring logic, tests and
workflow templates. The runtime is copied from the checked-out public commit.
No complete live repository history or private run artifacts are copied.

Generated credentials, deploy private keys, packed tarballs, installed dependencies,
screenshots, local configuration and run evidence are ignored. Do not force-add them. The
Backstage scaffold retains its Apache-2.0 license; Flowview carries its own license.
The mock is a tested subset of the real Catalog API, not a full implementation.
For company deployment, replace the fixture with a reachable Backstage backend
and catalog-read identity; keep source-code references as an authoring concern.

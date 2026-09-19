# Company designer repository

Generated for `__DESIGNER_REPOSITORY__`, using fictional source in
`__MOCK_REPOSITORY__`. This repository owns the diagram specs, service catalog
snapshot, external workbench, read API and GitHub automation.

Flowview engine/plugin source remains in the public Flowview repository.
`.flowview/runtime.json` records the exact copied runtime commit. Upgrade by
running `node scripts/vendor-flowview.mjs PATH_TO_CLEAN_FLOWVIEW_CHECKOUT` and
reviewing the resulting PR. The service catalog is preserved by runtime upgrades.

The real Backstage host is in the mock repository. It copies `apps/backstage`
from this checkout, reads approved specs through the authenticated proxy, and
links to the external workbench. See the mock README for setup and browser tests.

## Catalog and source workflows

Catalog sync runs daily at 08:17 America/New_York. It checks out the mock with
the read-only `MOCK_SOURCE_SSH_KEY`, starts its HTTP API inside the runner, and
uses the same `--backstage` importer as a real company backend. Changes to
`workbench/catalog.json` open a PR. Merge it manually, then rebuild the nginx
image to serve the new choices. The workflow does not deploy or merge itself.

The mock checkout/start is only a test fixture. For a company, replace it with
`FLOWVIEW_BACKSTAGE_BACKEND_URL`, `FLOWVIEW_BACKSTAGE_APP_URL` and a secret
`FLOWVIEW_BACKSTAGE_TOKEN`; the runner must reach the real backend.

Source drift runs daily at 08:23 America/New_York against mock `main`. Manual
dispatch can choose the refactor or timeout experiment branch. It reads Git
objects and opens evidence PRs naming the affected diagram steps; it never runs
the watched service code. Repeated scans reuse a report. Main is not changed by
scanning experiments. Plain closure never accepts a new source baseline.

GitHub setup, permissions and experiment commands are in the public package's
`examples/backstage-e2e/README.md`. A human must review all generated PRs. For an
intentional no-impact decision, follow the upstream drift automation guide;
do not accept experiment evidence against unrelated main-branch source.

The example `scripts/author-demo.mjs` was run once during creation to pin actual
source anchors. Running it again resets authored pins; never schedule it as
catalog sync. Catalog seeding does not touch source references or diagram specs.

## Checks and image

`npm test` verifies the read API's access, entity associations and revision checks.
CI also builds `deploy/workbench/Dockerfile` and checks that nginx serves the
committed editor and catalog bytes. This image serves static authoring assets;
company API authorization belongs in a separate backend.

The GitHub setup uses GITHUB_TOKEN to open PRs. GitHub does not trigger ordinary
PR workflows for those bot-created events; catalog sync validates before opening
its PR. A company can use a GitHub App identity when independent PR checks are
required. No auto-merge is configured.

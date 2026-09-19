# Fictional company and real Backstage sandbox

Generated for `__MOCK_REPOSITORY__` and sibling `__DESIGNER_REPOSITORY__`.
All service code, catalogs and API definitions are fictional. Node 24 is required.

## Start locally

The public package creator has already installed the small catalog dependencies,
seeded the workbench through an authenticated HTTP GET, generated local test
credentials, and copied the real Flowview plugin from the designer checkout.
Install the larger Backstage workspace, then start all four services:

```sh
node scripts/install-backstage.mjs
node scripts/start.mjs ../__DESIGNER_NAME__
```

Open http://localhost:3000/catalog/home/component/recording-service/diagrams and
click **Enter** for Guest sign-in. The API entity also has a Diagrams tab.
The external editor is http://localhost:7020/workbench/flowspec.html?canon=doorbell.
Ports 7007 and 7010 serve real Backstage and the catalog fixture respectively.
Stop the launcher with Ctrl-C to stop its child services.

After fresh clones, run `npm ci` here and
`npm ci --prefix tools/catalog-sync --ignore-scripts` in the designer repository,
then `node scripts/setup-sandbox.mjs ../__DESIGNER_NAME__` here before installing
Backstage. Setup copies the designer's actual plugin and configures its exact
renderer CSP hash. Repeat setup after a reviewed runtime upgrade.

## Verify

```sh
npm test
# While the launcher is running:
node scripts/check-real-catalog.mjs ../__DESIGNER_NAME__
cd sandbox/backstage
node .yarn/releases/yarn-4.13.0.cjs tsc
node .yarn/releases/yarn-4.13.0.cjs playwright test --config playwright.flowview.config.ts
node .yarn/releases/yarn-4.13.0.cjs workspace app build
node .yarn/releases/yarn-4.13.0.cjs build:backend
```

The browser test uses installed Google Chrome. It checks service/API discovery,
happy/timeout playback and links to the editor, APIs and pinned GitHub source.
Screenshots and generated credentials stay in ignored `.local/` directories.
The mock implements the consumed subset of Backstage's Catalog API: authenticated
GET by-query/by-name, pagination, filters, fields and resolved OpenAPI definitions.
The real Backstage app ingests the same files through its own catalog processors.

## Drift experiments

The creator made three local branches: `main` (500 ms baseline),
`codex/rehearsal-refactor` (same behavior), and `codex/rehearsal-timeout`
(50 ms regression, based on the refactor). Main stays healthy. The timeout
branch deliberately fails the unchanged source contract tests.

Publish these branches using the package's GitHub guide. Select them explicitly
in the designer's manual drift workflow to create reports without changing main.
No setup script merges branches or approves drift findings. Each report needs a
human disposition. Code references are authored separately from catalog seeding.

This is a local development sandbox: Guest auth, fictional data, an in-memory
catalog, and an illustrative read API. It does not configure company SSO or
production authorization. OpenAPI endpoints under `example.test` are descriptive
contracts; the executable sample uses in-memory function calls.

The Backstage workspace was derived from the official `@backstage/create-app`
0.9.2 scaffold, with pinned dependencies and unnecessary example plugins removed.
Its upstream source is Apache-2.0 licensed; see `sandbox/backstage/LICENSE`.

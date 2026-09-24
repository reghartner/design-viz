# Bundle company service choices with the editor

The designs repository keeps an approved `workbench/catalog.json`. A GitHub job
reads the processed Backstage catalog API or the same repository catalog files
used by Backstage, opens or updates a PR
when the exported choices change, and leaves review/merge to your normal process.
After merge, your existing editor image build copies that file into nginx. Every
fresh workbench launch loads it automatically, including **Start new project**.
The static editor never needs to contact Backstage. API mode contacts Backstage
only from CI; repository mode does not contact it at all.

## Start a graph from the catalog

Choose **From service catalog** on the homepage (also available in **Start new
project**), or **Add to diagram → Services from catalog** in an
existing project. Search by service title, entity reference or owner. Check a
subset, or use **Select shown** to select the current search results. Selection
persists when you change the search. **Clear** removes the full selection.

**Create connections** is optional. The preview counts new nodes, reused service
nodes and new edges before you confirm. The picker reads the same approved
`catalog.json` as the inspector. With no bundled catalog, expand **Use a catalog
JSON snapshot**, paste a version-1 snapshot, and click **Load snapshot**. This
session import also supplies the inspector dropdowns; it does not update the
repository or survive a reload. Bad imports preserve the current catalog.

- New nodes carry the exact service binding and catalog title. Choose a specific
  API/operation later in the inspector; the picker does not guess an operation.
- Connections use `dependsOn` component references and `consumesApis` references
  joined to selected providers' `apis[].entityRef`. Arrows point from dependent
  to dependency, or API consumer to provider. Only selected endpoints participate;
  unselected dependencies and resource entities are not automatically added.
- One edge per directed pair: an explicit dependency takes precedence over an
  API-use label. Self-relations and existing edges are skipped. Catalog relations
  describe structure, including build-time dependencies; they are not proof of a
  runtime call, protocol, timing, or execution sequence. No steps are synthesized.
  Generated connections have their own **Catalog relationship** legend; existing
  protocol definitions are preserved.
- Existing nodes with matching service identities are reused without overwriting
  authored content or positions. New nodes append in rows of up to four cards,
  left to right in dependency order. Cycles retain every selected node and edge.
  Other sections, panels, steps, and layouts remain intact. The whole insertion
  is one Undo/Redo action.
- An older snapshot with no dependency data can still seed nodes. Rerun catalog
  sync to include relationships available in Backstage or the repository files.
  A diagram is a saved starting point, not a live subscription to the catalog.

Example snapshot (fictional services):

```json
{
  "version": 1,
  "source": "Example company",
  "services": [
    {
      "entityRef": "component:default/doorbell-gateway",
      "title": "Doorbell gateway",
      "dependsOn": ["component:default/recording"],
      "consumesApis": ["api:default/recording"],
      "apis": []
    },
    {
      "entityRef": "component:default/recording",
      "title": "Recording service",
      "apis": [{"entityRef": "api:default/recording", "title": "Recording API"}]
    }
  ]
}
```

Snapshot relation arrays are optional and contain fully qualified entity refs.
The exporter qualifies shorthand references relative to the source entity's
namespace and keeps `dependsOn` / `consumesApi` relations as well as their
descriptor fields. See Backstage's
[relation semantics](https://backstage.io/docs/features/software-catalog/well-known-relations/).

## Seed from the processed Backstage API

Prefer API mode when a runner can reach the company Backstage backend. It uses
`GET /api/catalog/entities/by-query`, paginates Component and API entities, and
exports the final entity identities and `providesApi`, `dependsOn`, and
`consumesApi` relationships. OpenAPI
JSON and YAML definitions are normalized for operation pickers. It does not fetch
API server URLs, follow arbitrary definition references, or execute service code.

Set `FLOWVIEW_CATALOG_SOURCE=backstage`, `FLOWVIEW_BACKSTAGE_BACKEND_URL` (backend
base URL), `FLOWVIEW_BACKSTAGE_APP_URL` (public UI base URL), and secret
`FLOWVIEW_BACKSTAGE_TOKEN`. Configure a machine identity with catalog read access
and a runner able to reach the backend. Repository-source credentials and the
source list are unused in this mode; PR credentials are still required.

```sh
npm ci --prefix tools/catalog-sync --ignore-scripts
node tools/canon/catalog-sync.mjs --backstage \
  --output workbench/catalog.json --report /tmp/catalog-sync.md
```

HTTP failures, repeated pagination cursors, duplicate entities, malformed OpenAPI,
and unresolved path/operation references stop the export. Missing API entities
and other conversion warnings also block normal publication. The last approved
snapshot remains available after a failed sync. Empty exports need explicit
approval via the existing manual override. Endpoint/operation choices can only
reflect metadata actually present in Backstage. Non-OpenAPI API identities link
to their catalog pages; operation extraction currently supports OpenAPI only.

Service/API identity is **seeding**. Code anchors and reviewed source revisions
are a separate **authoring** concern and are never inferred by this sync.

See Backstage's [Catalog API](https://backstage.io/docs/features/software-catalog/software-catalog-api/)
and [machine authentication](https://backstage.io/docs/auth/service-to-service-auth/).

## Repository source list

Copy `.flowview/catalog-sources.example.json` to `.flowview/catalog-sources.json`
in the company designs repository and replace its example values:

```json
{
  "version": 1,
  "backstageAppUrl": "https://backstage.company.example",
  "sources": [
    {"repository": "company/doorbell-services", "paths": ["catalog-info.yaml"]},
    {"repository": "company/shared-apis", "ref": "main", "paths": ["catalog/apis.yaml"]}
  ]
}
```

An omitted `ref` uses that repository’s default branch. Each run resolves every
ref to one immutable commit before reading its files. `backstageAppUrl` is used
to construct links; it is never fetched. For GitHub Enterprise, set `githubUrl`
in the manifest and `FLOWVIEW_CATALOG_GITHUB_API_URL` in repository variables.

Use the same explicit sources and refs as the company Backstage configuration.
This is a declared subset of catalog ingestion, not a second running Backstage:
company processors that synthesize or rename entities need equivalent mapping
before export. Adding a source repository requires updating this list and the
source token’s access. Being in the same GitHub organization alone grants no access.

Supported input:

- JSON or YAML entity documents, including multi-document YAML.
- Component identities, namespace, title, owner, `providesApis`, `dependsOn`,
  `consumesApis`, and the optional
  `flowview.io/telemetry-service` annotation.
- API entities with inline OpenAPI JSON/YAML or repository `$text`, `$json`, and
  `$yaml` substitutions. Operations with `operationId` and declared server URLs
  become dropdown choices and links.
- Location `target` / `targets`, resolved relative to the descriptor. GitHub
  `blob/<ref>/...` targets can refer to another explicitly listed repository/ref.

No arbitrary remote URLs, repository scripts, environment substitutions, or
custom YAML tags are executed. Bundle external OpenAPI `$ref` dependencies and
resolve path/operation `$ref` values before syncing. Schema-local references are
allowed. Missing files, unreadable repositories, cycles, duplicate identities,
invalid data, empty catalogs, and conversion warnings fail the ordinary run
without replacing the approved snapshot. Manual overrides for an intentional
empty catalog or accepted metadata warnings are available in workflow dispatch.
Limits are 500 files, 2 MB per file, and 50 MB in one run.

## Enable the GitHub job

Install `.github/workflows/catalog-sync.yml`, `tools/catalog-sync/`, and
`tools/canon/` from the pinned Flowview release in the designs repository.

Configure:

| Setting | Value |
| --- | --- |
| Variable `FLOWVIEW_CATALOG_SYNC_ENABLED` | `true` |
| Secret `FLOWVIEW_CATALOG_SOURCE_TOKEN` | Read-only Contents access to all listed source repositories |
| Secret `FLOWVIEW_CATALOG_PR_TOKEN` | Bot token with Contents and Pull requests write access to the designs repository |
| Optional variable `FLOWVIEW_CATALOG_SOURCES` | Manifest path; default `.flowview/catalog-sources.json` |
| Optional variable `FLOWVIEW_CATALOG_GITHUB_API_URL` | GitHub API base; default `https://api.github.com` |
| Optional variable `FLOWVIEW_CATALOG_RUNNER` | Runner label able to reach the company GitHub host; default `ubuntu-latest` |

Fresh GitHub App tokens can replace either long-lived token:

- Source reads: `FLOWVIEW_SOURCE_APP_CLIENT_ID`, secret
  `FLOWVIEW_SOURCE_APP_PRIVATE_KEY`, `FLOWVIEW_SOURCE_OWNER`, and
  `FLOWVIEW_SOURCE_REPOSITORIES` (the explicit list of source repository names).
  Only Contents read permission is requested.
- PR writes: `FLOWVIEW_CATALOG_APP_CLIENT_ID` and secret
  `FLOWVIEW_CATALOG_APP_PRIVATE_KEY`. The installation token is scoped to the
  current designs repository with Contents and Pull requests write permission.

The workflow deliberately uses a bot/App identity for normal PR CI rather than
depending on the default Actions token’s workflow-trigger behavior. See
[GitHub’s trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

It runs daily at 8:17 a.m. America/New_York (including weekends), manually, or on
a `flowview-catalog-changed` repository-dispatch event sent to the designs
repository. A source-repository
workflow can send that event after catalog/API changes merge; daily runs also
catch changes without requiring modifications to every service workflow. Dispatch
payloads never choose the checkout, host, files, or output path.

Exports sort services, APIs, operations, and object keys. Unrelated source commits,
ordering changes, and repeated runs produce no new snapshot diff. Changes update
one bot-maintained `flowview/catalog-sync` branch/PR, restricted to
`workbench/catalog.json`. Corrections belong in source repositories; do not edit
the bot branch. The job does not auto-merge or deploy. Review removed services and
changed API operations, then let the normal merge deployment publish the image.
Keep company catalogs in the company designs repository, not the public fork.

## Editor image

The reference image copies the committed catalog alongside the generated editor.
It also discovers specs with `page.canon` under `docs/diagrams/` and generates
the canon library during the image build; no separate publishing command or
registry entry is needed. See [canon library publishing](workbench-canon-library.md).

```sh
docker build -f deploy/workbench/Dockerfile -t flowview-workbench .
docker run --rm -p 8080:80 flowview-workbench
```

Open `http://localhost:8080/`. The image contains the generated workbench/viewer
and starter assets and serves catalog JSON with revalidation. Place it behind the
company’s existing authentication. Connect your normal main-branch image build
and deployment to catalog PR merges; the reference files do not configure your
registry or production deployment. Preserve the designs-owned catalog when
updating HTML/assets from a newer Flowview release.

The workbench requests `catalog.json` relative to its own page, so it also works
under a hosting path prefix. The loaded catalog populates **Company service**,
**Service API**, and **API operation** in node inspectors. Existing specs are never
rewritten by a catalog refresh. Selecting a service fills its catalog name into a
missing or blank node title, preserving any existing name. Undo restores both the
binding and title together. API/operation changes do not rename the node.
A removed service can remain in an older spec’s
binding until an author explicitly updates it.

Manual **File → Company repository → Load catalog** overrides the bundled snapshot for
the session. A valid bundled snapshot takes precedence over a legacy live
`?canon=…` context catalog. The empty, unconfigured file shipped by Flowview allows
that legacy fallback; it contains no sample company services. Catalog arrival
does not change the current project, undo history, or the spec/review revision.
Static files provide choices only: existing spec/proposal routes still need the
company backend if used, and the reference nginx config does not proxy them.

## Local rehearsal

No company credentials or network are required for the fake source repositories:

```sh
npm ci --prefix tools/catalog-sync --ignore-scripts
node tools/canon/catalog-sync.mjs \
  --sources examples/canon/catalog-sources/sources.json \
  --local-root examples/canon/catalog-sources/repositories \
  --output /tmp/flowview-catalog.json --report /tmp/flowview-catalog.md
npm test --prefix tools/catalog-sync
```

Run twice to see `Catalog unchanged`. In a temporary copy of the fake repository,
change the recording API operation or remove the notification component and rerun:
the report names the changed/removed service. The tests exercise these changes,
failed reads, stable identity, pinned GitHub reads and data-only imports. Company
acceptance still requires actual source-token permissions, a bot-created PR with
passing checks, and the merged nginx deployment serving the approved snapshot.

Input contracts follow Backstage’s [descriptor format](https://backstage.io/docs/features/software-catalog/descriptor-format/)
and [repository-backed catalog](https://backstage.io/docs/features/software-catalog/).

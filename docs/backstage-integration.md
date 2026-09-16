# Company integration handoff: canonical flows

The local implementation runs without a Backstage, Honeycomb or Confluence sandbox.
It includes the portable spec contract, renderer/editor, a fictional company portal,
a paginated Backstage adapter, GitHub drift runner, and deterministic trace mapping.
The mock portal is not an installed Backstage plugin and supplies no company auth.
The final integration belongs in the company's Backstage/GitHub environment.

Walk through the [interactive lifecycle guide](diagrams/backstage/backstage.html) for catalog authoring,
service discovery, GitHub scans, human decisions, refusal gates and trace evidence.
The guide distinguishes portable implementation from company deployment.

## Boundaries and authority

- **Central Git repository:** authoritative specs, registry, reviewed source pins,
  reference traces and audit decisions. Keep HLD provenance and canonical ownership
  explicit. Suggested layouts are `registry.json`, `specs/`, and `.flowview/`.
- **Backstage:** service/API identities, owners, catalog links and declared endpoints.
  It supplies authoring choices; it does not approve diagram behavior.
- **Honeycomb exports:** observed runtime evidence, mapped to authored steps.
  No Honeycomb credentials or live API calls are required for the initial workflow.
- **Flowview:** portable presentation and reviewed proposals. The same spec works
  in the local viewer, existing workbench, and manual Confluence JSON export.

## Mount the company experience

Host the generated `template/flowview.html`, `workbench/flowspec.html`, and portal
assets behind company authentication. Install the [Flowview entity plugin](../apps/backstage/README.md)
for a **Diagrams** tab on Component and API pages, or mount the mock portal as a
development preview. `tools/canon/entity-diagrams.mjs` derives associations from
`nodes.*.binding.entityRef` and explicit API bindings across every section/tab.
The tab lists canonical flows and HLD designs with links to relevant happy and
alternate steps, and refreshes automatically. No per-service annotation or
manually maintained list is needed. Company installation, authenticated proxy
configuration and per-viewer diagram visibility are described in the plugin guide.

Replace `apps/backstage-mock/server.mjs` with an authenticated backend adapter;
reuse the data-only modules in `tools/canon/`. The mock's serialized local JSON
store intentionally stands in for Git proposals and durable review records.
Do not promote that no-auth development server into the company environment.

The browser contract is same-origin `/api/canon/`:

| Route | Contract |
| --- | --- |
| GET `catalog` | Version-1 snapshot from `fetchBackstageCatalog` |
| GET `registry` | Diagram IDs, titles, owners, revision tokens, section metadata, reviews |
| GET `context?id=…&review=…` | `{catalog,spec,revision,simulated:false}`; optional review draft |
| GET `entity-diagrams?entityRef=…` | Version-1 derived associations for a full entity reference, with diagram/section/path/step links |
| GET `services` | Mock catalog services with derived diagram counts |
| GET `specs/:id` | Current approved spec |
| POST `proposals` | `{id,spec,baseRevision,review?}` → proposal/PR ID |
| POST `scan` | Queue/report a source scan under an authorized service identity |
| POST `decisions` | Explicit disposition, reason, authenticated actor, issue URL |
| POST `reference-preview` | `{id,section,trace}` → sanitized trace, mapping, eligibility |
| POST `reference-approve` | Same input plus base revision and reason; propose a Git review |
| POST `compare` | `{id,section,trace,label?}` → isolated incident overlay and evidence |
| GET `incidents/:id/spec` | Portable incident spec |

The local `reference-approve` button acts as an explicit reviewer decision in its
simulated repository. The company adapter must obtain the actual user's identity
and apply the repository's review policy; browser-supplied actor/owner values are
not authorization. Keep reference mappings attached to the spec revision that was
reviewed, and reject stale proposals. Use durable storage with the company's
retention/access rules for uploaded operational evidence and incident artifacts.

## Connect the catalog

`fetchBackstageCatalog({backendUrl,appUrl,token})` in
`tools/canon/backstage.mjs` calls the catalog's paginated entities API and maps
Components, ownership, provided APIs, resolved OpenAPI JSON operations and server
URLs. `backendUrl` is the Backstage backend origin/base; `appUrl` is the frontend
base. The token stays on the server. Cache the result as appropriate and surface
adapter warnings; a failed refresh must not silently erase saved bindings.

The optional component annotation `flowview.io/telemetry-service` overrides the
trace service name. Namespaces and explicit step selectors resolve collisions.
Convert OpenAPI YAML and external `$ref` definitions using the company's existing
API pipeline before calling the converter; this adapter never executes schemas or
follows arbitrary referenced URLs. Endpoint links describe environments; viewers
never send requests to those APIs.

## Connect code review automation

Follow [GitHub drift automation](github-drift-automation.md) to configure
`FLOWVIEW_REGISTRY`, source access, and opt-in `FLOWVIEW_CANON_ENABLED`. The
weekday 08:23 America/New_York cadence is in `.github/workflows/canon-drift.yml`.
The workflow supports freshly minted read-only GitHub App source tokens,
manual report-only runs, saved artifacts and summaries. Central writes use a
separate `GITHUB_TOKEN`. Configure the bot and branch protection
so explicit baseline acceptance either writes its atomic commit or routes that
commit through the company's protected-branch review process.

The current runner supports one configured GitHub/GHES host. It never checks out
source service repositories or executes their code. It checks the live actor's
repository permission and explicit decision labels. A closed PR without a decision
leaves the expected spec unchanged. A plain report merge is not behavioral approval.
No-impact acceptance pins the reviewed source commit, not whatever HEAD happens to
be later. Human-authored spec changes stay authoritative after baseline updates.

Regression disposition requires a linked issue. The mock supplies local simulated
tickets; the company adapter should create or select the team's issue through its
authorized integration. Intended changes and agent suggestions are ordinary spec
PRs. Scan evidence alone cannot establish a regression's root cause.

## Acceptance in the company environment

1. Load real catalog snapshots; verify a known service, API operation, endpoint,
   owner and telemetry name against Backstage.
2. Bind a non-sensitive diagram to two source repositories; change one referenced
   function and one unrelated function. Verify exactly the affected code is reported.
3. Close without a label, accept a no-impact refactor, record a regression, and
   submit an intended behavior update. Verify pins/audit/expected behavior after
   each disposition, including a concurrent source/default-branch change.
4. Map a sanitized happy trace, approve it, then import partial/error/latency/queue
   traces. Verify branch position, independent IDs, unknown outcomes and links.
5. Run the app's permission checks for readers, authors and reviewers, then exercise
   the embedded Backstage route and manual Confluence export on a phone/desktop.

Local validation covers core algorithms, HTTP adapter doubles, persistence,
renderer regression suites and browser interaction. It does not establish company
SSO, GitHub branch-policy compatibility, Honeycomb export conventions or an installed
Backstage plugin; those are the final integration checks.

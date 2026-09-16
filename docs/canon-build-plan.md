# Connected flow specifications: implementation plan

Authorized scope: a central spec repository and hosted builder, Backstage service/API
bindings, code references and drift review, reference traces and incident alternates,
and semantic failure visuals. Real company integrations are replaced by explicit
local fixtures until the company agent supplies credentials and host configuration.

## Delivery sequence

1. Connected specification contract, service/API picker, source navigation and
   fictional doorbell repository/catalog fixtures. Preserve ordinary HLD specs.
2. Drift scanner, durable reviewed baselines, report/PR dispositions, central
   repository workbench and local Backstage/GitHub adapter. GitHub automation is
   opt-in and must never accept a plain closed PR as a reviewed baseline.
3. Reference-trace mapping, incident alternate generation, evidence-aware fault
   rendering and a complete local rehearsal from code change to reviewed diagram.

## Acceptance

- Existing examples remain valid and retain their rendering and editing behavior.
- Service bindings preserve portable display snapshots and stable catalog IDs.
- References include repository, immutable revision, file and relocatable anchors;
  missing or ambiguous references fail visibly rather than advancing baselines.
- The reverse index identifies every affected diagram and stable step ID.
- No-impact acceptance advances only reviewed references; regression decisions
  preserve expected behavior and remain linked to an unresolved issue.
- Duplicate scans do not create duplicate reviews. Persist decisions across restarts.
- Trace comparison preserves authored stories, supports parallel/repeated operations,
  and never treats missing telemetry as proof of an outage or queue backlog.
- Incident alternates share only the unchanged prefix and have independent divergent
  steps. Canonical specs change only through explicit reviewed updates.
- Runtime data and code are treated as data, never executed by the scanner.
- Local portal labels all catalog, traces and GitHub reviews as simulated.

## Company handoff

Connect authenticated catalog/repository providers, select repository access and
review policy, deploy the portal/plugin behind company authentication, and enable
the scheduled workflow. Cloud installation and real service calls are outside local
verification. The renderer, editor and local workflow must run without a sandbox.

## Delivered locally

All three stages are implemented: connected authoring, durable drift review with
GitHub/Backstage adapters, and approved trace mappings with isolated incident
alternates. Fictional fixtures exercise the complete doorbell flow. See
`docs/canon.md` to rehearse it and `docs/backstage-integration.md` for the company
agent's remaining authentication, hosting, repository policy and installation work.

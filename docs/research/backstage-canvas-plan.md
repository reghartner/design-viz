# Backstage canvas and Claude workbench integration

Work on `codex/claude-folder-session`; do not merge.

1. Keep the curated native viewer on the entity page. Add an explicit full-window
   Explore action owned by the React host, with the same loaded renderer, section,
   named view and source step. Restore the inline view on return. Clean up modal,
   focus, renderer and revision state on entity changes and unmount.
2. Carry diagram ID, spec digest, entity and current navigation to the existing
   standalone/workbench destinations. The receiving workbench checks the digest
   before opening a draft, applies the navigation, and opens the Agent panel for
   Build with Claude. No automatic folder access, agent startup or publication.
   Build now opens directly after verification, preserving the prior draft in
   durable browser recovery storage before replacement.
3. Regenerate the bundled native renderer; verify package types/tests, native
   browser behavior and the complete hosted-workbench handoff using fictional
   fixtures. Build a local plugin preview for inspection. Company SSO/GitHub and
   installed-host acceptance remain company integration checks.

A dedicated editor route inside Backstage remains a later packaging decision.
This increment reuses the hosted editor and adds native expanded reading.

## Delivered and verified

- Host-owned full-window canvas, same native renderer instance and loaded spec,
  floating tools, Escape/Back to entity, active-tab selection and lifecycle cleanup.
- Checked external viewer/editor links with root section, view, path and step.
  Build with Claude opens the checked story directly, opens Agent and its centered
  setup guide, and leaves pairing and publication explicit. Static library and legacy canon reads
  are covered, including refreshing the legacy link.
- Native bundle, workbench and standalone artifacts rebuilt. Local actual-plugin
  preview is served at `http://localhost:8766/backstage-preview/index.html`.
- Backstage strict TypeScript and 42 tests pass. Packed consumer checks pass on
  Node 24: ESM/CJS, declarations, renderer, backend, and optional host adapters.
- Root suite: 1,299 tests, 1,298 passing and one pre-existing skip. The last native
  navigation/canon changes also pass the 30 focused root tests. Python build/kit:
  12 passing checks.
- 28 distinct focused browser contracts pass across runs: 14 Backstage/native/
  navigation, five Canon/tour, and nine folder-agent/editor checks. Three editor
  geometry checks were first invoked with the generic host viewport, then passed
  with their required 1440 × 1000 folder-agent configuration. Final Backstage
  handoff tests include the legacy refresh and a noninitial source step.
- Inspected screenshots of the actual native canvas and the editor Agent panel.
  A local real-plugin → workbench → Agent smoke check reported no page or HTTP
  errors. Claude itself was not driven; file exchange browser tests simulate
  agent replies, preserving the user's visible pairing boundary.

No merge or company deployment. Production adoption requires the company to
upgrade its pinned package, deploy the matching workbench, and verify its real
GitHub loaders/SSO. Root story navigation transfers; drill-down frames do not yet.

## Streamlined opening and connection

The accepted clickable mockup is implemented: Build is a primary welcome action
and sits beside the Backstage story title. It opens the canvas in one click. The
centered guide covers the exact working folder, the complete copyable connection
instructions, waiting for the listener, folder mismatch recovery, cancellation,
and manual connection later. An active listener closes the guide and focuses the
floating chat. Reopening that connected chat does not repeat setup. Leaving the
project still follows the existing disconnect policy.

Earlier drafts and their baselines survive direct Build and reload; Home offers
their recovery. An archive write failure stops the handoff before replacement.
Story revision checks still fail before any draft writes.

Verified: 42 plugin tests and TypeScript checks; root Node suite; 12 Backstage and
welcome browser contracts; all 10 folder-agent browser contracts across the main
run and focused rerun. The folder tests use real files and the Python listener
with a picker adapter and simulated agent output, not a driven Claude session.
An additional smoke run through the actual localhost:8766 mock Backstage plugin
opened the guide directly without page or HTTP errors. Desktop and 390px layouts
were inspected. No merge or deployment.

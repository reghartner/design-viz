# Integrations

Read only the matching host paragraph and its linked repo guide. Shared renderer
changes also take the viewer route. Verify current platform documentation when
changing a host API rather than inferring it from the mock.

- **Forge / Confluence:** `docs/confluence-integration.md` describes config fields,
  save/cancel, payload bounds, entry points and company acceptance. Follow JSON
  from export through saved config and reload; input errors must preserve source.
  Check sizing in the host wrapper, not just the standalone template. The current
  app is a viewer with off-platform editing and manual JSON import. Any deliberate
  change to that boundary needs matching architecture/handoff updates. Run
  `tests/confluence.test.js`; in `apps/confluence`, run `npm ci` if needed and
  `npm run verify` using the Node version in CI. Forge production and app tests
  use the same named `forge` module exports; its artifact-only resource checker
  verifies copied scripts/styles/fonts with upstream reads denied. Preserve the
  explicit nine-weight font profile and local-resource policy. See
  `docs/build-entrypoints.md`.
- **Backstage / catalog / mock:** read the affected section of
  `docs/backstage-integration.md`; plugin work also uses `apps/backstage/README.md`.
  Check fully qualified entity identity, per-viewer visibility, authenticated
  fetch/proxy, pagination, stale requests and safe links. API links must not
  accidentally invoke service operations. The mock's browser-supplied actor is
  not company authorization. Run the relevant catalog/entity tests; plugin work
  also runs `npm run verify` in `apps/backstage` after installing dependencies.

  The native host uses the trusted static `mountNativeViewer` artifact with inert
  spec data. Read `docs/native-viewer.md` for ShadowRoot/event/font ownership.
  Verify two mounts, revision races, hidden alternate jumps and cleanup; do not
  restore an iframe, remote code, runtime compilation or a frame CSP hash. Native
  style isolation is not a security sandbox. Run the copied-plugin check as well
  as package verification; portable tests must not import upstream source files.

The required `tools/browser-tests` suite exercises the actual native React
component and a copied normal Forge resource using a pinned downloaded Chromium.
Keep its strict error/network assertions and baseline resource accounting. The
existing full Backstage rehearsal remains separate; do not recreate that host
sandbox inside the thin required suite.

Report local evidence separately from installed-host acceptance. Company-side
deployment cannot be claimed from a simulated bridge or unauthenticated portal.

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
  `npm run verify` using the Node version in CI.
- **Backstage / catalog / mock:** read the affected section of
  `docs/backstage-integration.md`; plugin work also uses `apps/backstage/README.md`.
  Check fully qualified entity identity, per-viewer visibility, authenticated
  fetch/proxy, pagination, stale requests and safe links. API links must not
  accidentally invoke service operations. The mock's browser-supplied actor is
  not company authorization. Run the relevant catalog/entity tests; plugin work
  also runs `npm run verify` in `apps/backstage` after installing dependencies.

Report local evidence separately from installed-host acceptance. Company-side
deployment cannot be claimed from a simulated bridge or unauthenticated portal.

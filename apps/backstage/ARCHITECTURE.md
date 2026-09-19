# Backstage plugin maintenance

This package is a read-only host adapter. It discovers associated diagrams and
loads revision-pinned JSON through Backstage's authenticated proxy. The external
workbench owns editing; the bundled Flowview runtime owns rendering.

## Handwritten modules

| Responsibility | Location |
| --- | --- |
| Backstage registration and entity/config adapters | `src/plugin.tsx`, `src/EntityFlowviewContent.tsx` |
| Public API facade, preserved for consumers | `src/api.ts` |
| Wire contracts, response validation, proxy clients | `src/api/` |
| Association refresh, request cancellation, stale results | `src/hooks/useEntityDiagrams.ts` |
| Spec loading, frame channel, timeout, pause and cleanup | `src/hooks/useInlineViewer.ts` |
| Selection and service/step presentation | `src/FlowviewEntityDiagrams.tsx` |
| Loading, compatibility, error and frame presentation | `src/InlineFlowview.tsx` |
| Safe explicit evidence links | `src/components/EvidenceLink.tsx` |
| Host navigation target type | `src/viewer/protocol.ts` |
| Renderer-side navigation, link protection and sizing | `viewer/frame.js` |

Keep request ownership in the hooks. Every request has an abort controller; every
timer, observer, listener and MessagePort has paired cleanup. The entity ID scopes
association results. The diagram ID and published revision scope both a rendered
viewer and its service-step target. Refreshing a revision discards that target.

## Frame contract

The parent sends one `flowview:init` message containing JSON, an optional target,
and a private MessagePort to its own sandboxed frame. It sends no credentials.
Subsequent commands use that port: `navigate` and `pause`. Responses are `rendered`,
`size`, `error`, `navigation-error`, and `navigated`. The host clamps reported height
and ignores messages from disconnected channels. A failed jump leaves a valid
diagram visible. A service-step jump previews the exact source step even if the
current layout hides it, including a wholly hidden alternate path.

`src/generated/` is committed build output. Do not hand-edit it. The source build
embeds the runtime, CSS, SVG icons and fonts, and computes the exact script CSP
hash. A company build uses the artifact without reading the upstream `src/` tree.
Changing `viewer/frame.js` also requires `npm run build:viewer` and a host CSP
hash update. See the README for the current sandbox and inherited CSP contract.

## Verification boundaries

`npm run verify` works with only this package and its installed dependencies. It
covers strict types, API validation, refresh/cancellation, selection by revision,
frame messaging, recoverable navigation and artifact/hash consistency.

From the upstream repository, also run:

```sh
npm run check:viewer --prefix apps/backstage
node --test tests/canon-bundle.test.mjs
node tools/verify-backstage-copy.mjs
```

The backend test uses the plugin's installed esbuild dependency and Node 24 to
check CJS/ESM bundles with filesystem access restricted to their output directory.
It belongs upstream because the Canon backend and its fixtures are not part of
this frontend package. The copy check installs only the plugin in a temporary
directory and runs the documented verification there.

CI does not boot the entire Backstage app. The public rehearsal's documented
installed-host browser check is an additional integration gate; company SSO,
authorization and deployment policies require validation in the company host.

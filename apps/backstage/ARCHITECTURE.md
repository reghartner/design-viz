# Backstage plugin maintenance

The root package is a React rendering library with injected association/spec
loaders. The optional reference adapter reads revision-pinned JSON through
Backstage's authenticated proxy; company loaders read approved GitHub specs. The external
workbench owns editing; the bundled Flowview runtime owns rendering.

## Handwritten modules

| Responsibility | Location |
| --- | --- |
| Backstage registration and entity/config adapters | `src/plugin.tsx`, `src/EntityFlowviewContent.tsx` |
| Stable root exports and optional adapter entries | `src/index.ts`, `src/reference-proxy.ts`, `src/new-frontend.ts` |
| Bundled backend indexing boundary | `src/backend.ts`, `../../tools/canon/entity-diagrams.mjs` |
| Package JS/declaration bundles | `build.mjs`, `package.json` exports |
| Wire contracts, response validation, proxy clients | `src/api/` |
| Association refresh, request cancellation, stale results | `src/hooks/useEntityDiagrams.ts` |
| Spec loading, native mount, pause and cleanup | `src/hooks/useInlineViewer.ts` |
| Selection and service/step presentation | `src/FlowviewEntityDiagrams.tsx` |
| Loading, compatibility, error and native host presentation | `src/InlineFlowview.tsx` |
| Safe explicit evidence links | `src/components/EvidenceLink.tsx` |
| Host navigation target type | `src/viewer/protocol.ts` |
| Portable renderer artifact and declarations | `src/generated/nativeViewer.js`, `nativeViewer.d.ts` |
| Upstream native ownership, navigation and link protection | `../../src/native/` |

Keep request ownership in the hooks. Every request has an abort controller; every
timer, observer, listener has paired cleanup. The entity ID scopes
association results. The diagram ID and published revision scope both a rendered
viewer and its service-step target. Refreshing a revision discards that target.

## Native mount contract

The hook passes original inert JSON into the trusted static `mountNativeViewer`
export. The returned handle supports `navigate`, `pause` and idempotent `destroy`.
The host uses normal document layout for sizing. A failed jump leaves a valid
diagram visible. Exact step jumps use shared core identity/source lookup and
preview the raw source step before applying any path-only visibility gate. The
active named view is retained, including for a wholly hidden alternate path.

The request object scopes loaded data to ID, revision, loader and retry attempt.
Only the current request can mount; cleanup aborts reads, destroys the native
handle and disconnects host visibility observers. Late reads and retired mount
callbacks cannot update the active host.

`src/generated/` is committed build output. Do not hand-edit it. The source build
uses `tools/native-viewer-build.mjs` to combine the shared named `native`
entrypoint and asset inventory with `src/native/` into one ESM artifact. The
adapter owns CSS scoping, namespaced fonts and instance mount/environment code.
The named `compatibility` entrypoint supplies the checker and its panel metadata.
Source order, exports and font profiles are described in the upstream
[build guide](../../docs/build-entrypoints.md). Company
releases compile these artifacts into `dist` without reading the upstream `src/` tree. Changes to
shared source or native ownership require `npm run build:viewer` upstream.
ShadowRoot isolation and the host script/style/font/image policy are documented
in the README; there is no frame channel or generated script hash.

## Verification boundaries

`npm run verify` runs from the company fork with installed development dependencies. It
covers strict types, API validation, refresh/cancellation, selection by revision,
native lifecycle, recoverable exact navigation, inert/unsafe assets and static
artifact boundaries. Root tests cover real entity-index → shared core → native
mount navigation; portable plugin tests also render the actual compiled artifact.

From the upstream repository, also run:

```sh
npm run check:viewer --prefix apps/backstage
node --test tests/canon-bundle.test.mjs
npm run build --prefix apps/backstage
node tools/verify-backstage-package.mjs --skip-build
```

The backend test uses the plugin's installed esbuild dependency and Node 24 to
check CJS/ESM bundles with filesystem access restricted to their output directory.
The packed-consumer check installs a real tarball into an isolated temporary
consumer with no Backstage packages. It checks public exports, custom-loader
rendering, backend bundles and downstream declaration bundling without `allowJs`.
The distributed package contains built JS, flattened declarations and licenses,
not source to lint or an install-time build. Optional adapter entry points retain
external Backstage peers; the core graph must never import them. Keep exported
wire, loader and native/backend types stable under package SemVer.

CI does not boot the entire Backstage app. The public rehearsal's documented
installed-host browser check is an additional integration gate; company SSO,
authorization and deployment policies require validation in the company host.

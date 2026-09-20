# Flowview entity diagrams for Backstage

This source workspace plugin adds a **Diagrams** tab to Component and API entity
pages. It discovers published diagrams from explicit spec bindings; no per-service
list, catalog annotation, or manual Backstage link maintenance is required.

The tab renders the selected diagram inline with playback, alternate paths, Home,
panels and node evidence links. Service step buttons jump inside that viewer.
It also shows canonical/design status, owner and design-document links. **Edit in
workbench** opens the external editor in a new tab. The list refreshes every
60 seconds while visible, on focus, and on demand. Changing services cancels old
requests. Failed refreshes retain the last result with a visible warning.

The company fork publishes internal Flowview releases; this Backstage app pins
its dependency and upgrades through its own PR/release process. Specs can declare
`page.flowview.minVersion` and feature requirements. The viewer shows an upgrade
notice with installed/required versions and missing features, keeping the notice
visible even if rendering fails. Unsupported spec contract majors block rendering.
See [release compatibility](../../docs/runtime-compatibility.md) for authoring,
the exported host-independent checker, and the company release checklist.

Walk through the [interactive lifecycle guide](../../docs/diagrams/backstage/backstage.html) for catalog authoring,
service discovery, GitHub scans, human decisions, refusal gates and trace evidence.
The guide distinguishes portable implementation from company deployment.

## Try the mock

To try the actual React plugin against fictional data, run `npm ci` and
`npm run preview:build` in this directory, then start the mock server below and
open `http://localhost:8766/backstage-preview/index.html`. This local shell runs
with a host CSP permitting bundled scripts and embedded assets. It is a
plugin preview, not proof of company authentication or an installed Backstage app.

Run `node apps/backstage-mock/server.mjs` from the repository root and open:

- `http://localhost:8766/#services`
- `http://localhost:8766/catalog/default/component/recording-service`

The mock has the same association API and demonstrates the service experience;
it is not a running Backstage installation. The package below is the actual
Backstage frontend integration, ready for the company agent to install.

## Install in the company Backstage app

Copy this directory into your Backstage workspace as `plugins/flowview`, or bring
it into that workspace through your normal internal package process. Keep
`tools/canon/entity-diagrams.mjs` and its dependencies in the central repository
backend, including the committed `tools/canon/generated-runtime.cjs`. Its static
import makes the shared runtime available to production bundlers without a
runtime `src/` directory; see [backend production packaging](../../docs/backstage-integration.md#backend-production-packaging)
for the company image acceptance check. Align the Backstage dependency versions
with the host app's release;
this package is typechecked against the versions pinned in `package-lock.json`.
It is private source code, not a published npm package.

Add `@flowview/backstage-plugin` as a dependency of the frontend app workspace.
For a Yarn workspace, its package dependency can use `"workspace:^"`.

For the new frontend system, include the default plugin in the app's features:

```tsx
import flowviewPlugin from '@flowview/backstage-plugin';

const app = createApp({
  features: [/* your existing features, */ flowviewPlugin],
});
```

This registers the tab for Component and API entities automatically, including
entities that currently have zero diagrams. Keep the empty tab: it explains how
a service becomes associated instead of suggesting that the integration is absent.

For an app that still defines `EntityLayout` routes explicitly, use the named
component on the service/API entity page:

```tsx
import {EntityFlowviewContent} from '@flowview/backstage-plugin';

<EntityLayout.Route path="/diagrams" title="Diagrams">
  <EntityFlowviewContent />
</EntityLayout.Route>
```

The component gets the entity from Backstage's `useEntity`; it does not guess
identity from display names. It uses `FetchApi` and discovers the proxy base on
each request. The optional frontend `flowview.proxyPath` defaults to `/flowview`.
`config.d.ts` declares that path's frontend visibility; it contains no credentials.

## Connect the read API

Enable the normal authenticated Backstage proxy backend, and configure a read-only
route to the company's authenticated central repository API:

```yaml
proxy:
  endpoints:
    '/flowview':
      target: 'https://flowview.internal.example/api/canon'
      credentials: require
      allowedMethods: ['GET']
      headers:
        Authorization: 'Bearer ${FLOWVIEW_PROXY_TOKEN}'
```

The token is a backend secret. Use your company's identity-forwarding adapter
instead if diagram visibility varies by user. Requiring a Backstage login is not
a substitute for diagram-level authorization. Authoring/viewer URLs must also
have the company's normal access controls. Do not point a production proxy at
the no-auth mock server.

Expose these GET endpoints from the company adapter:

```
/api/canon/entity-diagrams?entityRef=component%3Adefault%2Frecording-service
/api/canon/specs/doorbell?revision=<opaque-published-revision>
```

After obtaining the published specs the requesting viewer can read:

```js
import {buildEntityDiagramIndex, diagramsForEntity}
  from './tools/canon/entity-diagrams.mjs';

const index = buildEntityDiagramIndex(authorizedPublishedSpecs, {
  publicBaseUrl: 'https://flowview.internal.example',
});
const result = diagramsForEntity(index, requestedEntityRef);
// Return result as JSON with the company's normal read authorization.
```

Use an absolute, externally reachable `publicBaseUrl` (including any deployment
path prefix). It supplies the viewer, builder and spec URLs; diagrams cannot
choose the upstream proxy target. Mount those routes at the same base path, or
adapt URL generation in the company backend to its existing hosted builder.
The frontend only activates HTTP(S) evidence links without embedded credentials.

The result is version 1 with `entityRef`, a content `revision`, and `diagrams`.
Each entry has `id`, `title`, `kind`, `owner`, `revision`, `viewerUrl`, `editUrl`,
optional `designDocument`, and `sections`. Sections contain matched `nodes`,
a `url`, and paths with numbered, linked steps. Empty results are HTTP 200 with
an empty array; an invalid/unavailable index must be an error, not an empty list.
`src/api.ts` contains the frontend contract and response checks.

The spec route must apply the same per-viewer authorization as the association
list. Return the requested approved revision, or HTTP 409 when it is no longer
available. Do not silently return a newer spec: the service step index belongs to
the listed revision. The response is the original JSON spec with matching
`page.canon.id`, at most 2 MiB UTF-8. Selection changes cancel pending reads and
remove the old viewer. Read/render failures show an explicit retry; a stale
revision asks the reader to refresh diagrams.

## Rendering and browser policy

The plugin uses Backstage `FetchApi` through the authenticated backend proxy to
read revision-pinned JSON, then passes that inert data to `mountNativeViewer`.
The statically compiled renderer mounts inside a dedicated ShadowRoot. It loads
no hosted viewer, remote script or stylesheet, and uses no runtime `eval` or
`Function` compilation. Fonts and SVG symbols ship in the package; authored
images must be embedded PNG, JPEG or WebP. Evidence links open HTTP(S) destinations
in a new tab only on an explicit click. The renderer has no request transport.
Playback starts paused and pauses when hidden or outside the viewport.

Shadow DOM provides DOM/style ownership, **not a security sandbox**. This pinned
package is trusted JavaScript with the host app's permissions. The host loads it
through its normal bundler and script policy. Merge required inline-style,
`font-src data:` and `img-src data:` support with the existing host CSP. No
Flowview iframe permission, exact script hash, or blanket inline-script/eval
permission is required. The former `viewerScriptCsp` export is removed; remove
that hash from the host's integration configuration when upgrading. Verify the
installed company's CSP and SSO separately; local browser checks do not establish
company acceptance.

Each mount owns its DOM, IDs, skin, navigation, timers, observers and listeners.
Its namespaced fonts are shared by live mounts in the same document and released
after the last mount is destroyed. Sibling viewers keep independent controls,
focus and path state. No body classes, styles, location hash or host globals are
patched. Content takes its natural height in the host layout. Stale revisions,
failed reads and unmounts retire the old instance; a failed navigation leaves a
valid diagram available for another jump.

`src/generated/nativeViewer.js`, its declarations, compatibility checker and
`FONT-LICENSES.txt` travel with the plugin. Company builds do not need this
repository's source tree. Runtime maintainers run `npm run build:viewer` here;
CI checks freshness with `npm run check:viewer`. The artifact includes the shared
engine, validation, styles, icons and licensed Latin fonts selected by the shared
named `native` entrypoint. The adapter retains mount/environment and CSS/font
ownership; see the upstream [build guide](../../docs/build-entrypoints.md).
Workbench boot code is excluded. The reusable `mountNativeViewer(host, spec, options)` export returns
`navigate`, `pause`, `destroy`, `root` and validation `warnings`; call `destroy()`
before reusing the dedicated host. See the upstream
[native renderer guide](../../docs/native-viewer.md) for implementation ownership.

Refresh the repository provider when approved Git changes land, or read its current
snapshot per request. Cache by published revision and authorization scope if
needed. Never share an all-diagram index with a viewer who can only read a subset.
The mock rereads the registry on requests and derives the index after applying
approved local decisions; unapproved proposals never appear.

## Association rules

- `nodes.*.binding.entityRef` associates a diagram with a catalog service.
- `nodes.*.binding.api.entityRef` also associates it with that explicit API.
- Fully qualified kind/namespace/name is compared case-insensitively. The same
  name in another namespace or kind is a different entity.
- Every section/tab is indexed. Multiple matching nodes/sections become one
  diagram entry. Nodes without steps still associate the diagram.
- Matching steps include explicit node focus, edge endpoints (including failed
  sends), tones, conditions, and `traceMatch.nodeId`. Links preserve each path's
  actual step number, including shared steps and independent alternate steps.
- Viewer routing helpers generate section/step references, so prose sections,
  duplicate headings and alternate timelines cannot shift links off by one.
- Display names, source-repository URLs and telemetry names do not create inferred
  associations. Removed/rebound nodes remove the old service association.

## Maintenance

See [module ownership and verification boundaries](ARCHITECTURE.md) before changing
request lifecycle, selection, or the native mount boundary. The upstream
[panel module guide](../../docs/panel-modularity.md) describes the complete
single-file panel contract, shared lifecycle, authoring hooks and build discovery.

## Verify

```sh
npm ci --no-fund --no-audit
npm run verify
```

CI typechecks against real Backstage packages and tests rendering, automatic
refresh/error states, request cancellation, link safety and the authenticated
proxy client, revision-pinned reads, native mount cleanup, exact hidden-step
navigation, SVG links and static artifact boundaries. Root Node tests cover indexing, alternate links and registry/review
updates. Company SSO, authorization and mounting the tab in the company's actual
Backstage app remain the final integration checks.

References: [entity-content extensions](https://backstage.io/docs/frontend-system/building-plugins/#plugin-specific-extensions),
[authenticated proxy configuration](https://backstage.io/docs/plugins/proxying/).

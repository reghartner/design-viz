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
with a restrictive parent CSP including the exact viewer script hash. It is a
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

The plugin parent uses Backstage `FetchApi` through the authenticated backend
proxy to read JSON. It passes that data over a private transferred `MessagePort`
to a bundled `srcDoc` iframe. The frame never loads a hosted Flowview URL, obtains
credentials, calls a service API, or fetches fonts/scripts/specs. Its sandbox omits
`allow-same-origin`; its own CSP includes `connect-src 'none'`. Explicit HTTP(S)
evidence links open separate tabs. Playback starts paused, pauses when hidden,
and the frame reports content height to the parent.

**Parent CSP still applies to `srcDoc`.** In the company Backstage backend policy,
allow the generated exact script hash exported as `viewerScriptCsp` from this
package (also in `src/generated/viewerDocument.ts`), inline styles, `font-src data:`,
`img-src data:` and the local frame. Merge these sources with the existing host
policy; do not replace its other directives or enable blanket inline scripts.
If the host uses `script-src-elem`, it must also allow the hash. Refresh the hash
when upgrading the bundled viewer. A blocked script reports a startup error
after ten seconds. Verify the installed host's CSP, links and SSO separately.

`src/generated/viewerDocument.ts` and `FONT-LICENSES.txt` travel with the plugin,
so company builds do not need this repository's source tree. To update the shared
runtime here, run `npm run build:viewer`; CI checks freshness with
`npm run check:viewer`. This snapshot includes the shared engine, validation,
styles, icons and licensed Latin fonts. No workbench code is included.

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

## Verify

```sh
npm ci --no-fund --no-audit
npm run verify
```

CI typechecks against real Backstage packages and tests rendering, automatic
refresh/error states, request cancellation, link safety and the authenticated
proxy client, revision-pinned reads, private frame messages, SVG links and CSP hash
integrity. Root Node tests cover indexing, alternate links and registry/review
updates. Company SSO, authorization and mounting the tab in the company's actual
Backstage app remain the final integration checks.

References: [entity-content extensions](https://backstage.io/docs/frontend-system/building-plugins/#plugin-specific-extensions),
[authenticated proxy configuration](https://backstage.io/docs/plugins/proxying/).

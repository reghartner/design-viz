# Flowview entity diagrams for Backstage

**Company source: GitHub.** The company fork `backstage-diagrams` contains the
engine, editor and specs, and hosts the static workbench with no APIs. The
Backstage plugin pulls diagram specs from that GitHub repository; the Backstage
app separately pins and ships its renderer dependency.

**Public package:** `@flowview/backstage-plugin` exports the React rendering core
and its stable loader contracts. The company agent supplies GitHub-backed
`loadDiagrams` and `loadSpec` functions for `FlowviewEntityDiagrams`. The optional
`/reference-proxy` adapter wires the mock/proxy transport. The mock and existing
local screenshots test native rendering through the reference adapter, not
the company GitHub loader. See the [company source handoff](../../docs/backstage-integration.md#github-source-integration-status).

This package supplies a **Diagrams** tab to Component and API entity
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

Walk through the [current platform presentation](../../docs/diagrams/platform/index.html)
for the GitHub-backed company topology. The [earlier lifecycle guide](../../docs/diagrams/backstage/backstage.html)
retains the reference adapter's read-API topology.

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
Backstage frontend integration; the company agent connects its GitHub source.

## Install in the company Backstage app

Install a released version from your company registry in the existing Backstage
frontend workspace:

```sh
yarn workspace app add @flowview/backstage-plugin@1.0.0
```

The company fork `backstage-diagrams` owns the package source in `apps/backstage`,
the workbench, and the diagram specs. It publishes the package to the approved
registry; publishing does not require another source repository. The existing
Backstage app repository pins and upgrades that dependency through its own PR.
Configure the `@flowview` registry/authentication in your normal package-manager
configuration. This repository's build does not publish to any registry.

The package ships prebuilt JavaScript and bundled declarations. Consumers do not
compile or lint Flowview source, enable `allowJs`, or edit files in the installed
package. Both ESM and CommonJS entry points have matching declaration exports.

| Import | Public surface |
| --- | --- |
| `@flowview/backstage-plugin` | `FlowviewEntityDiagrams`, wire/load types, `ViewerTarget`, `parseEntityDiagrams`, `SPEC_MAX_BYTES`, native mount/types and `FlowviewCompatibility` |
| `@flowview/backstage-plugin/reference-proxy` | Optional `EntityFlowviewContent`, `createDiagramLoader`, `createSpecLoader` |
| `@flowview/backstage-plugin/new-frontend` | Optional default/named `flowviewPlugin` registering the reference-proxy tab |
| `@flowview/backstage-plugin/backend` | `buildEntityDiagramIndex`, `diagramsForEntity` and index/options types |

The root import has no Backstage dependency or proxy transport. React is the
required frontend peer. Backstage peers are optional; install the peers needed by
the adapter you choose and align them with the host's Backstage release. Only the
`/new-frontend` entry requires the new frontend registration API. Its default
plugin deliberately uses the reference proxy, so the company GitHub integration
should register its own entity content using the core component.

### Company GitHub loaders

Register a component such as this on your company entity page:

```tsx
import {useEntity} from '@backstage/plugin-catalog-react';
import {stringifyEntityRef} from '@backstage/catalog-model';
import {
  FlowviewEntityDiagrams, parseEntityDiagrams, SPEC_MAX_BYTES,
  type DiagramLoader, type SpecLoader,
} from '@flowview/backstage-plugin';
import {githubSource} from './companyGitHubSource'; // Company-owned authenticated adapter.

const loadDiagrams: DiagramLoader = async (entityRef, signal) =>
  parseEntityDiagrams(await githubSource.associations(entityRef, signal), entityRef);

const loadSpec: SpecLoader = async (diagram, signal) => {
  const {text, revision} = await githubSource.approvedSpec(diagram.id, signal);
  if (revision !== diagram.revision) throw new Error('Diagram changed; refresh diagrams.');
  if (new TextEncoder().encode(text).length > SPEC_MAX_BYTES)
    throw new Error('Diagram exceeds the 2 MiB viewer limit.');
  const spec = JSON.parse(text);
  if (spec?.page?.canon?.id !== diagram.id) throw new Error('Unexpected diagram.');
  return spec;
};

export function CompanyDiagrams() {
  const {entity} = useEntity();
  return <FlowviewEntityDiagrams
    entityRef={stringifyEntityRef(entity).toLowerCase()}
    loadDiagrams={loadDiagrams} loadSpec={loadSpec} refreshMs={60000}
  />;
}
```

`companyGitHubSource` is your integration, not a shipped client. Keep loader
identities stable, forward each `AbortSignal`, and resolve list and spec from the
same approved snapshot. A diagram's `revision` is the spec digest from the index,
not necessarily a Git commit SHA; the company adapter maps it to its pinned Git
snapshot and verifies that digest. Fail a missing/unauthorized/stale read instead
of returning an empty list or a different revision. The renderer accepts inert
JSON and performs its own spec validation; it never obtains GitHub credentials.

In the new frontend system, return `<CompanyDiagrams />` from your
`EntityContentBlueprint` loader and register that extension with your existing
app. A route-based host can mount the same component in its entity route. Neither
requires modifications inside the package. Keep an empty Diagrams tab visible so
users can discover how to associate a service.

### Central canon membership

Root `canon.json` in the company diagrams repository is the shared authority for
Backstage and the nginx workbench. Its `diagrams` entries reference folders such
as `{"folder":"diagrams/doorbell","owner":"group:default/home-team"}`.
A spec's own `page.canon` cannot enroll it or override the central ID/owner.

The company GitHub source adapter reads that manifest, then the listed JSON and
HTML files at the **same approved Git SHA**. Use the pure `/backend` helpers:

```ts
import {parseCanonManifest, materializeCanonSpec, buildEntityDiagramIndex}
  from '@flowview/backstage-plugin/backend';

const entries = parseCanonManifest(manifestJson);
// Read entry.path and verify entry.html exist at the pinned SHA through your
// authenticated GitHub adapter. Authorize each entry for this requesting viewer.
const specs = authorizedEntries.map(entry =>
  materializeCanonSpec(specJsonByPath[entry.path], entry));
const index = buildEntityDiagramIndex(specs, {diagramUrls});
```

The example's `authorizedEntries`, `specJsonByPath` and `diagramUrls` come from
your company adapter. Return the same materialized spec from `loadSpec`, with
its indexed digest; keep raw authored JSON unchanged. Existing node bindings
still determine which service/API entity lists the diagram. Refresh manifest
membership along with specs so removed entries disappear. Missing or invalid
listed files must fail the snapshot, rather than publishing a partial list.
These helpers do not fetch files or grant authorization.

For a local checkout, `tools/canon/library.mjs` also exports
`loadCanonDiagrams(file, {authorize, ...indexOptions})`. The standard nginx build
uses the same rules to generate `workbench/diagrams.json`. Its existing
`?diagram=<id>` URLs remain read-only; the reader offers **Edit in Workbench**.
The legacy `?canon=<id>` backend-review route is unchanged.

### Links to another diagram

A node's `handoff` opens another document through an ordinary link. Supply the
optional `resolveDiagramLink` prop to `FlowviewEntityDiagrams` to map its logical
reference to your company's viewer route. The same option is available to
`mountNativeViewer`; `DiagramHandoffReference` and `NativeViewerOptions` are
exported from the root package.

```tsx
import type {DiagramHandoffReference} from '@flowview/backstage-plugin';

// Use your existing approved document routes; this callback performs no reads.
const resolveDiagramLink = (reference: DiagramHandoffReference) => {
  if (!reference.spec) return undefined;
  const url = new URL(encodeURIComponent(reference.spec), 'https://designs.example.test/diagrams/');
  if (reference.revision) url.searchParams.set('revision', reference.revision);
  if (reference.section) url.hash = new URLSearchParams({section: reference.section}).toString();
  return url.href;
};

// Add to the company component above:
// <FlowviewEntityDiagrams ... resolveDiagramLink={resolveDiagramLink} />
```

`DiagramHandoffReference` has optional `spec`, `revision`, `section` and `url`
strings. Authored handoffs require `spec` or `url`; `revision` and `section`
require `spec`. The host owns the route and how its destination interprets the
revision and section. Return the complete absolute HTTP(S) URL, including any
fragment, with no embedded credentials. The callback is synchronous. An absent
callback, `null`/`undefined`, an unsafe result or an exception falls back to the
authored `url`; without a usable URL, the viewer shows the destination as
unavailable. Valid links open a new tab with `noopener noreferrer`.

This callback only supplies a link: handoffs never call `loadSpec` or `loadDetail`,
fetch the destination, or replace the current diagram. Keep the callback identity
stable between renders (for example, declare it outside the component or use
`useCallback`). Changing it rebuilds the viewer from the loaded spec and reapplies
the selected service/step target without another source request. The internal
`InlineFlowview` and `useInlineViewer` layers forward the same optional resolver;
no Backstage API or reference proxy is required.

## Reference proxy adapter

Import the optional reference wiring independently:

```tsx
import {EntityFlowviewContent} from '@flowview/backstage-plugin/reference-proxy';
// Or register the complete reference tab in a new-frontend app:
import flowviewPlugin from '@flowview/backstage-plugin/new-frontend';
```

`EntityFlowviewContent` gets the entity from `useEntity` and discovery/fetch/config
from Backstage's core plugin API. It discovers the proxy URL on each request.
The optional frontend `flowview.proxyPath` defaults to `/flowview`; `config.d.ts`
declares its frontend visibility and contains no credentials.

The following configuration documents the API-based reference adapter
and local rehearsal. It is not the GitHub-backed company architecture, and does
not require `backstage-diagrams` to host a read API. For deployments deliberately
using this adapter, configure a read-only Backstage proxy route:

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

This reference adapter expects these GET endpoints:

```
/api/canon/entity-diagrams?entityRef=component%3Adefault%2Frecording-service
/api/canon/specs/doorbell?revision=<opaque-published-revision>
```

After obtaining the published specs the requesting viewer can read:

```js
import {buildEntityDiagramIndex, diagramsForEntity}
  from '@flowview/backstage-plugin/backend';

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
The root package exports the wire-contract types and `parseEntityDiagrams`.

The spec route must apply the same per-viewer authorization as the association
list. Return the requested approved revision, or HTTP 409 when it is no longer
available. Do not silently return a newer spec: the service step index belongs to
the listed revision. The response is the original JSON spec with matching
`page.canon.id`, at most 2 MiB UTF-8. Selection changes cancel pending reads and
remove the old viewer. Read/render failures show an explicit retry; a stale
revision asks the reader to refresh diagrams.

## Indexing specs fetched from GitHub

Install the same package version in your existing Backstage backend workspace and
import only `/backend`. Supply the approved specs that the requesting reader can
access; the module performs no source-control requests or authentication. It
contains the statically bundled validation/routing runtime and needs no `tools/`,
`src/`, `fs`, `vm`, or runtime source lookup in the deployed image.

```ts
import {buildEntityDiagramIndex, diagramsForEntity}
  from '@flowview/backstage-plugin/backend';

const index = buildEntityDiagramIndex(authorizedSpecs, {
  diagramUrls: ({id, revision}) => ({
    viewerUrl: `https://designs.example.test/approved/${id}.html?v=${revision}`,
    editUrl: 'https://designs.example.test/workbench/flowspec.html',
  }),
});
const result = diagramsForEntity(index, 'component:default/recording-service');
```

Use your actual hosted viewer/editor routes. `diagramUrls` configures links only;
it does not fetch or publish those pages. Viewer URLs must be HTTP(S), have no
credentials or fragment, and receive generated section/path/step fragments from
the shared router. Edit URLs must be credential-free HTTP(S). Without this option,
`publicBaseUrl` retains the reference adapter's `/api/canon` link convention.
Cache the index by both approved snapshot and authorization scope.

## Rendering and browser policy

The source loader passes inert JSON to `mountNativeViewer`. The company loader
reads GitHub; the current reference loader uses the authenticated backend proxy.
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

The generated native viewer and compatibility checker are compiled into `dist`;
bundled declarations, `LICENSE` and `FONT-LICENSES.txt` travel with the package. Company builds do not need this
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
npm run build
node ../../tools/verify-backstage-package.mjs --skip-build
```

CI typechecks against real Backstage packages and tests rendering, automatic
refresh/error states, request cancellation, link safety and the authenticated
proxy client, revision-pinned reads, native mount cleanup, exact hidden-step
navigation, SVG links and static artifact boundaries. Root Node tests cover indexing, alternate links and registry/review
updates. Company SSO, authorization and mounting the tab in the company's actual
Backstage app remain the final integration checks.

## Release and public API policy

Package version 1.0.0 establishes the stable import paths and the loader, wire,
native-viewer and backend contracts documented above. Removing/renaming an export,
changing a loader signature, or requiring new wire fields needs a major version.
Additive optional fields/exports use a minor version; compatible fixes use a patch.
The bundled renderer's `FlowviewCompatibility.version` and spec feature metadata
remain distinct from package SemVer: check them to explain renderer upgrades.

From a clean reviewed company-fork checkout:

```sh
npm ci --prefix apps/backstage --no-fund --no-audit
npm run verify --prefix apps/backstage
npm run build --prefix apps/backstage
node tools/verify-backstage-package.mjs --skip-build
npm pack ./apps/backstage
# Publish the resulting, reviewed .tgz to your configured company registry:
# npm publish ./flowview-backstage-plugin-1.0.0.tgz --registry https://REGISTRY
```

For an explicit package path, run `npm pack ./apps/backstage` from the repository
root. CI uploads the built tarball as `backstage-plugin-package`; it does not
publish it. Test the installed company backend image and host CSP/SSO before the
company app release. Upgrade the package version through a normal dependency PR;
new specs can be read from GitHub independently.

References: [entity-content extensions](https://backstage.io/docs/frontend-system/building-plugins/#plugin-specific-extensions),
[authenticated proxy configuration](https://backstage.io/docs/plugins/proxying/).

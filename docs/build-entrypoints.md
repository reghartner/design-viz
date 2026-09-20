# Source assembly and build assets

`src/source-bundles.json` owns the named build entrypoints, deliberate module
exports and asset selections. `tools/source-loader.cjs` is the only physical
source expansion and substitution implementation. Python calls its CLI; host
builders and Node tests call the same API. Assembly runs during development and
packaging. Deployed pages and packages contain static code and local assets,
without a source checkout, runtime filesystem reads or source evaluation.

## Entrypoints and host boundaries

| Name | Composition and consumer |
| --- | --- |
| `standalone` | Shared compatibility, Canon, validator/core/panels and engine, followed by explicit viewer boot; Python fills the offline HTML skeleton |
| `workbench` | Shared viewer and all editor bundles, followed by explicit workbench boot; Python adds the existing curated templates and skeleton |
| `backend` | Compatibility, Canon, validator/core/panels and `core/backend.js`; exports the existing Canon default facade plus `compatibility`, `validateSpec` and `viewerRouting` |
| `native` | Shared viewer definitions without boot; the native adapter adds its instance environment, mount lifecycle, scoped styles and namespaced fonts |
| `forge` | Shared viewer definitions plus Confluence helpers; the declared exports are the production `flowview-core` module used by the Forge app and its tests |
| `compatibility` | Compatibility definitions and the `FlowviewCompatibility` module export used by the copied Backstage package |

The backend never includes the engine or initializes a DOM renderer.
`core/backend.js` owns its small public facade; it is not part of the shared
validator bundle. The original `tools/canon/core.cjs` import remains compatible.
Native `src/native/` environment and mount code, CSS scoping and Backstage package
declarations remain adapter responsibilities in `tools/native-viewer-build.mjs`
and `apps/backstage/build-viewer.mjs`. Forge bundling, bridge integration, resource
HTML and local font-file emission remain in `apps/confluence/build.mjs`.

These are build contracts, not a new public export of every private renderer or
editor helper. The manifest's `exports` mapping defines each module's public
names and local bindings. Build-time verification rejects missing bindings.
Keep test-only access in a VM context; do not add exports just to expose private
functions to a test.

## Source API

Logical bundle arrays still contain physical files and sorted `directory/*.js`
globs. They do not recursively expand other logical bundles. Named entrypoints
list those logical bundles or physical leaves in declaration order. Duplicate
physical files, missing inputs, empty globs and unknown entrypoints fail the
build. Each physical source is normalized to LF and trimmed at its end once.

```js
const loader = require('../tools/source-loader.cjs');
const entry = loader.entrypoint('workbench');
entry.records; // ordered {file, source}, including the explicit boot record
entry.body;    // assembled definitions, excluding boot
entry.source;  // complete assembly, including boot
loader.moduleSource('forge', 'esm');
loader.moduleSource('backend', 'cjs');
loader.entrypointAssets('native');
```

`readSource(name)` retains the logical/physical fragment API for focused tests
and tools. `composeSources(names)` adds the same source-file comments used by
named assembly. Complete UI/core harnesses use the relevant named `body` or
`source`; pure command tests continue to load only their required leaves.
Tests of emitted HTML assert that the declared complete assembly occurs once,
rather than finding a private function or cutting code between neighboring
comments. An explicit boot boundary allows headless definition tests without
running browser startup.

Compatibility metadata is substituted when the expanded physical input is
`compatibility.js`, including through a differently named logical bundle. Panel
registration supplies that metadata; there is no second panel feature list.
The source marker must exist. Registration runs trusted repository definitions
in a build-time VM with no DOM, process, filesystem or network capability; spec
data and boot code never execute there.

The CLI provides `--entrypoint NAME`, `--entry-assets NAME`,
`--module NAME esm|cjs`, `--sources SOURCES...`, `--files SOURCE`,
`--font-css PROFILE`, `--assets` and `--styles STYLESHEET`. Structured modes emit
JSON. `tools/build.py` retains its `entrypoint`, `entrypoint_assets`, `js_bundle`
and source/style adapters by delegating to these commands.

## Assets and distribution policies

The manifest selects ordered page/core/workbench styles and the common SVG icon
sprite. **Page CSS stays raw.** Core and workbench styles receive their registry
style contributions in their existing order. Appending panel CSS to page CSS
would duplicate it when page and core are combined.

`src/fonts/manifest.json` records each font's family, weight, WOFF2 file, license,
profiles and, where applicable, Fontsource import. The `all` profile contains the
existing 22 weights for portable and native viewers. The `forge` profile retains
its existing nine weights: IBM Plex Sans 400/500/600, IBM Plex Mono
400/500/600/700 and Sora 600/700. This inventory does not expand Forge's shipped
font policy. Forge imports its selected locked Fontsource CSS and emits local
WOFF/WOFF2 assets; portable HTML embeds WOFF2 data URLs, and the native adapter
owns its namespaced font lifetime. Each selected font carries its license.

`entrypointAssets()` returns ordered style records, the icon sprite, selected
font records with embedded data and deduplicated license text. The host decides
how to package those assets. Keep the current license ordering and font selection
when changing a wrapper; identical input should produce identical output.

## Verification

`tests/source-loader.test.js` covers physical alias substitution, sorted expansion,
boot separation, CLI/API agreement, export failures, duplicate inputs, DOM-free
backend parity and the asset profiles. `tests/test_build.py` checks complete
declared source in the emitted pages. Forge tests consume the production named
exports. Its artifact-only `resource-contract.mjs` verifies a copied production
resource's local scripts, styles and font URLs without upstream source access;
the copy test also verifies font inventory and license text.

Run `python3 tools/build.py`, the matching shared Node/Python suites,
`npm run build:viewer --prefix apps/backstage` and
`npm run verify --prefix apps/confluence` when changing assembly. Check Backstage
freshness with `npm run check:viewer --prefix apps/backstage`; upstream CJS/ESM
backend and isolated plugin-copy checks verify source-unavailable distribution.
Keep emitted-content assertions alongside source-level tests. Required pinned
browser CI is a separate follow-up; local browser probes do not establish company
host or CSP acceptance.

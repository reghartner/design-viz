# Source assembly and build assets

`src/source-bundles.json` owns the named build entrypoints, deliberate module
exports and asset selections. `tools/source-loader.cjs` is the only physical
source expansion and substitution implementation. Python calls its CLI; host
builders and Node tests call the same API. Assembly runs during development and
packaging. Deployed pages and packages contain static code and local assets,
without a source checkout, runtime filesystem reads or source evaluation. The
validator bundle includes `src/company-brand.config.js` exactly once before
`src/icons/brand.js`, so standalone, workbench, native, Backstage, Forge and
Confluence renderers receive the same offline global company brand. Rebrand all
targets by editing that config object; do not add host-specific runtime fetches
or generated copies.

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
and source/style adapters by delegating to these commands. After writing the
backend runtime, it reads root `canon.json`, validates the listed `diagrams/<name>`
folders, and validates the listed specs with that runtime and publishes a metadata-only
`workbench/diagrams.json` index pointing to those source files.
The snapshot is ignored by Git; missing JSON/HTML, invalid specs, duplicate
folders, and escaping paths fail publication while preserving the prior snapshot.

## Assets and distribution policies

The manifest selects ordered page/core/workbench styles and the common SVG icon
sprite. **Page and tour CSS stay raw.** The standalone and workbench readers share `style.tour.css`; native/Forge mounts do not include tour chrome. Core and workbench styles receive their registry
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

## Build outputs and distribution

Generated entrypoints and runtime bundles are ignored local build outputs. Commit
sources, declarations and license inputs, never the generated copies. This replaces
the former policy requiring committed runtime JavaScript. Authored pages under
`diagrams/`, `docs/diagrams/` and `examples/` retain their own export workflow.

| Ignored output | Authored inputs / generator |
| --- | --- |
| `tools/canon/generated-runtime.cjs` | Named `backend` in `src/source-bundles.json`, including `src/core/backend.js`; `tools/build.py` through the source loader |
| `apps/backstage/src/generated/nativeViewer.js` | Named `native`, shared styles/icons/fonts, `src/native/environment.js` and `src/native/mount.js`; `tools/native-viewer-build.mjs` and `apps/backstage/build-viewer.mjs` |
| `apps/backstage/src/generated/compatibility.js` | Named `compatibility`, `src/compatibility.js` and registry-derived panel/icon metadata; `apps/backstage/build-viewer.mjs` |
| `apps/backstage/src/generated/nativeViewer.d.ts` | Exact copy of authored `src/native/mount.d.ts` |
| `apps/backstage/src/generated/compatibility.d.ts` | Exact copy of authored `src/compatibility.d.ts` |
| `apps/backstage/src/generated/FONT-LICENSES.txt` | License files selected by `src/fonts/manifest.json` through the named native asset profile |
| `template/flowview.html`, `workbench/flowspec.html`, `workbench/diagrams.json` | Shared manifest, HTML skeletons, authoring kit and Canon inputs; `tools/build.py` |

Use Node 24 and Python 3.10+ from a clean checkout:

```sh
# Shared CLIs, mock servers, drift tools, Node/Python tests and portable HTML:
python3 tools/build.py
node --test tests/*.test.js
python3 -m unittest discover -s tests -v

# Backend alone, when HTML is unnecessary (no npm dependencies):
python3 tools/build.py --runtime-only

# Backstage: check/test/verify/build/pack generate their inputs automatically.
npm ci --prefix apps/backstage --no-fund --no-audit
npm run verify --prefix apps/backstage
npm run check:viewer --prefix apps/backstage
npm run build --prefix apps/backstage
node --test tests/canon-bundle.test.mjs
node tools/verify-backstage-package.mjs --skip-build
npm pack ./apps/backstage

# Forge and the required browser fixtures build their own inputs:
npm ci --prefix apps/confluence --no-fund --no-audit
npm run verify --prefix apps/confluence
# Install the locked runner/browser as described in tools/browser-tests/README.md.
npm test --prefix tools/browser-tests
```

The normal HTML build reads company-owned `workbench/site.json` when present.
Use `--config PATH` for config outside a replaced vendor tree; spec paths resolve
from that config's directory. `--no-config` intentionally builds the upstream
sample. Config errors fail before HTML is overwritten; `--runtime-only` does not
read site config. See [homepage configuration](homepage-example.md) for schema,
input ownership and deployment. Reapply the configured build after running
upstream tests, which build their default fixtures with `--no-config`.

`build:viewer` emits native artifacts only; `build:runtime` emits native and backend
artifacts. `check:viewer` now deletes the known generated outputs and compares two
fresh builds byte for byte, including declarations, licenses, HTML and the backend.
It is a development/CI command, never an installed-consumer hook. Do not run this
check concurrently with tests or other builds in the same checkout.
`node tools/check-generated.mjs --tracking-only` rejects tracked files anywhere in
the generated directory, the backend runtime and the portable HTML/index paths.
`tools/page_build.py` generates missing template/backend inputs before validation.
Direct validator, compatibility, state-walk and Canon commands use the static backend;
run `python3 tools/build.py` after checkout/update first. Downloaded kits are prebuilt.
Builds leave tracked files unchanged. After updating an older branch, remove any
staged generated files and rebuild; merge authored source changes instead of bundles.
GitHub source ZIPs contain source and require these build commands.

CI already provides the two distribution formats needed here; no registry
publication or new archive format is required. Choose a successful **ci** run for
the desired commit in GitHub Actions, then download and extract its artifacts, or:

```sh
gh run download RUN_ID --name flowview-html --dir flowview-html
gh run download RUN_ID --name backstage-plugin-package --dir backstage-package
# In the consumer workspace, install the downloaded .tgz (no build scripts):
npm install --ignore-scripts /absolute/path/to/backstage-package/flowview-backstage-plugin-1.1.0.tgz
```

**flowview-html** contains the standalone viewer/workbench, adjacent catalog, Canon
metadata, diagram folders, starter assets and the project `LICENSE`. Open `workbench/flowspec.html` for
offline authoring, or serve the extracted root (for example,
`python3 -m http.server --directory flowview-html 8000`) to fetch catalog/Canon
files. HTML already embeds fonts, licenses and the folder-agent kit. The kit's
validators and state walker load its static backend without source assembly.
HTML artifacts are retained for 30 days.

**backstage-plugin-package** contains the prebuilt npm tarball: ESM/CJS exports,
flattened declarations, project/font licenses and the static renderer/backend.
React is a consumer peer; optional Backstage adapters need their documented host
peers. Install the tarball and follow the [plugin integration guide](../apps/backstage/README.md).
The portable Backstage rehearsal likewise builds the package before copying it;
its host installer repacks prebuilt files without upstream sources or build tools.

`deploy/workbench/Dockerfile` builds from the company fork's source in a Node +
Python stage, then copies only the web assets into nginx. No local build is
required before `docker build`. The Backstage rehearsal builds HTML in a
temporary directory from the pinned checkout's tracked source, ignoring local
HTML. Its runtime-only package uses `Dockerfile.prebuilt`, installed as its
ordinary Dockerfile by the packager; company source forks use the default
source-building Dockerfile.

## Verification

CI rebuilds the HTML for Python, Node, browser and example checks. Build
determinism compares two fresh builds. The image smoke test verifies its served
workbench includes the launch screen and agent kit, and compares the served
viewer and catalog with the checkout's build outputs.

CI generates backend/native JavaScript before any consumer imports it and checks
two builds from absent outputs. The build also regenerates ignored
`workbench/diagrams.json` and fails if Canon index generation fails. Distribution
checks install with scripts disabled and execute with upstream source reads denied.

`tests/source-loader.test.js` covers physical alias substitution, sorted expansion,
boot separation, CLI/API agreement, export failures, duplicate inputs, DOM-free
backend parity and the asset profiles. `tests/test_build.py` checks complete
declared source in the emitted pages. Forge tests consume the production named
exports. Its artifact-only `resource-contract.mjs` verifies a copied production
resource's local scripts, styles and font URLs without upstream source access;
the copy test also verifies font inventory and license text.

Run `python3 tools/build.py`, the matching shared Node/Python suites,
`npm run build:viewer --prefix apps/backstage` and
`npm run verify --prefix apps/confluence` when changing assembly. Check generation/determinism with `npm run check:viewer --prefix apps/backstage`; upstream CJS/ESM
backend and isolated plugin-copy checks verify source-unavailable distribution.
Keep emitted-content assertions alongside source-level tests. The required
[browser contracts](../tools/browser-tests/README.md) use a pinned downloaded
Chromium across offline HTML, workbench/lifetime, native React and copied Forge
resources. Its CI job must pass alongside package distribution and pure checks. These
fixtures do not establish company host or CSP acceptance.

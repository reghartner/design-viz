# Company forks: the `company/` overlay

A company fork usually integrates upstream design-viz by applying the upstream
source diff (for example with `git apply --3way`) and rebuilding. Any
upstream-owned file the fork edits eventually conflicts. To avoid that, keep
every fork customization in files that upstream never ships or edits.

## Fork-owned paths

| Path | Owner | Notes |
|---|---|---|
| `company/**` except `company/README.md` | Fork | Upstream ships only `company/README.md` in this directory and never adds or edits other files here. Do not edit the README; add files beside it. Includes `company/company.json` (name, repository, brand, package identity). |
| `workbench/site.json` | Fork | Optional company landing page; upstream ships only `workbench/site.example.json`. See [the workbench landing](homepage-example.md). |
| `canon.json`, `diagrams/**` | Fork | Company diagram membership and diagram folders. |
| Everything else | Upstream | Avoid edits; each one is a future integration conflict. |

All discovery below is automatic. Upstream keeps no list that a fork must
extend, and an absent or empty overlay adds nothing: builds, tests and
generated outputs are unchanged.

## Panels and helper modules

- `company/panels/types/<type>.js` — one complete panel definition, written
  exactly like an upstream `src/panels/types/<type>.js` (see
  [adding a panel](panel-modularity.md)). Company types are bundled after the
  upstream types.
- `company/panels/<helper>.js` — shared helper modules used by company panel
  types. Helpers are bundled after the shared panel primitives
  (`src/panels/shared.js` and the other `src/panels/*.js` files) and before
  every panel type, in file-name order.

`src/source-bundles.json` lists these directories as optional globs
(`@company/panels/*.js`, `@company/panels/types/*.js`), and
`tools/source-loader.cjs` resolves them to this checkout's `company/` folder.
Every output that includes the validator therefore includes company panels:
`template/flowview.html`, `workbench/flowspec.html`,
`tools/canon/generated-runtime.cjs` (used by `tools/validate.js`), the
Backstage and Confluence viewers and the native viewer. Assembled bundles label
these files `/* ---- company/panels/... ---- */`. A company type with the same
name as an upstream type fails the build.

## Custom icons

Place trusted JavaScript modules in `company/icons/*.js`. They are discovered in
file-name order and run before the shared `FlowIcons` library freezes. No
manifest or upstream source edit is needed. For example, `company/icons/acme.js`:

```js
defineIcon({
  id: 'acme-beacon', label: 'Acme beacon', category: 'Acme equipment', tone: 'teal',
  svg: shapes.path('M3 20 12 2 21 20 12 15Z', 'wash') +
       shapes.detail(shapes.path('M12 7v5M8 20h8'))
});
```

Each file has its own strict function scope with `defineIcon(definition)` and a
frozen `shapes` object. Files may define multiple icons. Use deterministic,
self-contained code without DOM, network, process or filesystem access: modules
also execute during build-time validation. These modules have the same trust as
company panel code; their wrapper is not a security sandbox. Do not paste
untrusted SVG or document data into them, and do not depend on private library
variables or another module's locals.

Every definition requires exactly `id`, `label`, `category`, `tone`, and `svg`:

- `id`: 1–80 lowercase letters, digits or hyphens, beginning with a letter.
  Use a company prefix to reduce future upstream collisions. Reusing any
  upstream or company ID fails the build with the offending module path.
- `label` and `category`: nonempty plain text, at most 80 characters. The
  desktop picker uses these for search and category filtering.
- `tone`: one of `neutral`, `blue`, `teal`, `green`, `amber`, `red`, or `violet`.
- `svg`: code-owned inner SVG geometry in a 24 × 24 view box. Use balanced
  `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, and `polygon`
  elements with quoted attributes. Only groups may contain other elements.
  The build rejects wrappers, symbols, IDs, references, entities, scripts,
  event handlers, inline `style`, malformed markup and unknown palette tokens.
  Normal geometry attributes such as `transform`, `fill-rule`, `opacity` and
  stroke settings are supported. This structural check is not a sanitizer or
  a path-data validator; fork maintainers still review the trusted code and
  confirm that its geometry renders correctly.

Helpers return SVG strings: `path(d, fill?)`, `rect(x,y,w,h,r,fill?)`,
`circle(x,y,r,fill?)`, `detail(svg)` (accent stroke), and `solid(svg)` (no
stroke). Optional fills are `primary`, `accent`, or `wash`; omit fill for an
outline. Custom inner SVG may use `$primary`, `$accent`, and `$wash` paint
tokens. The shared renderer replaces these with its palette/CSS colors and
supports tone overrides and monochrome rendering.

Run `python3 tools/build.py` and rebuild any viewer package you distribute.
The same assembled library supplies validation, compatibility IDs, sprites,
node/group icons, shared panels, brand choices, the desktop picker, standalone
HTML, the offline kit and native ShadowRoot viewers. Authored JSON stores only
IDs, such as `"icon":"acme-beacon"`; it cannot register icons or inject SVG.
A reader using a build without that icon retains the existing unknown-ID
fallback. Distribute a viewer built from the same fork when sharing the JSON.
`--no-config` and `FLOWVIEW_COMPANY_IDENTITY=off` disable identity settings,
**not** structural extensions such as icons and panels.

`node tools/source-loader.cjs --company-icons` lists validated custom metadata.
The shared-icons section in generated authoring packets and the offline kit's
contract includes these IDs automatically. For direct source-contract reading,
use that command as well; the upstream Markdown file remains unchanged.
`tests/company-icons.test.js` and the desktop browser `company-icons.spec.mjs`
copy the real modules from `tests/fixtures/company-icons/` into scratch forks,
build them and assert distinctive paths through saved exports and viewers.

## Contract fragments

Write one Markdown file per panel or topic in `company/contract/*.md`. Fragments
are appended to `contract/authoring-contract.md`, in file-name order, under a
`## Company contract additions` heading, wherever the contract is read by
tools: `tools/widget_doc.py`, `tools/authoring-packet.py` and the folder-agent
kit bundled into the workbench. Relative links in a fragment are rewritten so
they still resolve from `contract/`.

Document a panel under its own `### panels` heading with one bullet per type,
in the same form the contract uses:

```markdown
### panels — company additions

- `ticket-board` — closed tickets out of a fixed total. Declaration:
  `{"id":"tickets","type":"ticket-board","total":10,"initial":{"done":0}}`.
  Continuation lines are indented.
```

`python3 tools/widget_doc.py ticket-board` then prints that block with the
shared panel intro and patch rules, and `--list` includes the type. A type
documented twice fails. Agents that read `contract/authoring-contract.md`
directly in a fork must also read `company/contract/*.md`; the contract says so.

## Examples

Put each example in its own folder, `company/examples/<name>/`. Every example
folder is bundled into the offline folder-agent kit. By default the kit takes
its `*.md` and `*.json` files (in the folder and below). To choose other files,
add a `.agent-kit` file to the folder that lists file globs, one per line (`#`
starts a comment); the globs then replace the default for that folder and its
subfolders. When markers are nested, the nearest marker above a file decides,
and a marker whose globs select no files fails the build. The kit is a text
bundle, so a selected file that is not UTF-8 text fails the build with its
path. Every `*.spec.json` under
`company/examples/` must validate without errors in the normal Node test suite
(`tests/company-overlay.test.js`). The workbench image build copies `company/`
too (`deploy/workbench/Dockerfile`).

Upstream examples join the kit the same way without a list: a folder under
`examples/` that holds a `.agent-kit` file is bundled, using its globs, with the
same nearest-marker and no-match rules.

## Tests

- `company/tests/*.test.js` (or `*.test.cjs`) run inside the normal
  `node --test tests/*.test.js` run, through `tests/company-overlay.test.js`.
  Use CommonJS and `node:test`; resolve repository files from `__dirname`
  (`../../tools/source-loader.cjs`).
- `company/tests/test_*.py` run inside the normal
  `python3 -m unittest discover -s tests` run, through
  `tests/test_company_overlay.py`.

Upstream tests that enumerate panel types (for example
`tests/panel-modules.test.js` and `tests/test_widget_doc.py`) include company
panel types, so a company panel must meet the same contracts as an upstream one,
including a contract fragment for each type.

## Release notes

Keep fork release notes in `company/CHANGELOG.md`. Do not add entries to
upstream's `CHANGELOG.md`; every upstream entry would conflict with them.

## Company identity

Put the fork's name, repository and brand in `company/company.json`. The build
reads it through `tools/source-loader.cjs` (`node tools/source-loader.cjs
--company` prints the validated values) and fails with the field to fix when a
value is invalid. Every field except `version` is optional.

```json
{
  "version": 1,
  "companyName": "Acme",
  "repository": "https://github.com/acme/design-viz",
  "revision": "main",
  "brand": "brand.json",
  "backstage": {
    "baseUrl": "https://backstage.acme.example"
  },
  "package": {
    "repositoryUrl": "git+https://github.com/acme/design-viz.git",
    "registry": "https://npm.acme.example/"
  }
}
```

| Field | Used for | Without it |
|---|---|---|
| `companyName` | The workbench labels **Company repository** (File menu), its unavailable-catalog error, the imported snapshot origin and **Company service** (node inspector, onboarding tour, user guide) become **Acme repository** and **Acme service**. | "Company" |
| `repository` | The header GitHub link, the welcome form's repository field, the **Read the authoring skill** link, the repository-root example in its validation message, and the reader-tour guide link in the inspector. An `https://` repository root; a trailing `.git` is removed. | `https://github.com/reghartner/design-viz` (the example message keeps `https://github.com/your-team/design-viz`) |
| `revision` | The branch in the authoring-skill and tour-guide links and the welcome form's revision field. | `main` |
| `brand` | A brand file path inside `company/`, relative to `company.json`, with `companyName`, `logo`, `primaryColor` and `secondaryColor` (the fields of `src/company-brand.config.js`). `logo` is a 1–4 character monogram, a PNG/JPEG/WebP data URI, or a relative path (inside `company/`) to a PNG/JPEG/WebP file of up to 512 KiB that the build embeds. The brand's `companyName` defaults to the top-level `companyName`. Every viewer, the workbench and the validator runtime use it as the global brand. | The placeholders in `src/company-brand.config.js` |
| `package` | Backstage package identity; see below. | Upstream `package.json` values |
| `backstage.baseUrl` | Public Backstage UI base URL included in copied Workbench connection instructions and focused authoring packets, including the offline folder-agent kit. | No company Backstage context |

The values replace marked text at build time: sources mark each literal with
`/*@company:name*/`, `/*@company:repository*/` or
`/*@company:example-repository*/`, and `src/workbench.skel.html` uses
`{{COMPANY_REPOSITORY}}`, `{{COMPANY_REVISION}}` and `{{COMPANY_SKILL_URL}}`.
Without `company.json`, the build emits the upstream text, so the generated
viewer, workbench and runtime are byte-identical to a build without this
feature. `python3 tools/build.py --no-config` ignores `company.json` as well as
`workbench/site.json`; the browser contracts build that way and set
`FLOWVIEW_COMPANY_IDENTITY=off` so they keep asserting upstream labels.

## Backstage context for agents

Set `backstage.baseUrl` to your company's public Backstage UI address, such as
`https://backstage.acme.example` or `https://portal.acme.example/developer`.
Rebuild with `python3 tools/build.py` to include it in the Workbench and its
downloaded authoring kit. Repository-local `tools/authoring-packet.py` reads the
current config when it generates a packet.

The URL must be absolute HTTP or HTTPS, without credentials, a query string,
fragment, whitespace or control characters. Deployment subpaths are preserved;
trailing slashes are removed. If `backstage` is present, it must contain
`baseUrl` and no other fields. Omit `backstage` when it is not needed.

Agents receive this value as link context. It is not a catalog entity identity,
an API endpoint or an authentication setting, and does not grant access.
Explicit entity references and source URLs remain authoritative. Use a
non-secret URL suitable for inclusion in generated Workbench files and prompts.
The offline kit exports only this normalized context in
`tools/company-agent-context.json`, without copying `company.json`, brand assets
or package settings. Packet metadata records it as `companyContext`.

`python3 tools/build.py --no-config` omits this context from the generated
Workbench and kit. `FLOWVIEW_COMPANY_IDENTITY=off` also disables it for direct
packet generation, including generation from a previously exported kit.

## Package identity

`node tools/backstage-pack.mjs pack|publish [npm options]` packs or publishes
`apps/backstage` with the fork's identity, without editing
`apps/backstage/package.json`:

- `repository.url`: `FLOWVIEW_PACKAGE_REPOSITORY_URL`, else
  `package.repositoryUrl`, else `git+<repository>.git` from `company.json`.
- `publishConfig.registry`: `FLOWVIEW_PACKAGE_REGISTRY`, else
  `package.registry`.

npm always runs with `apps/backstage` as its working directory, so that
folder's `.npmrc` (for example registry authentication) applies in both modes.
With neither value the command runs `npm pack` or `npm publish` for the package
with the same options. With a value it builds once (unless `--ignore-scripts`),
copies exactly the files npm would pack into a staging folder with the adjusted
`package.json`, and runs `npm pack|publish <staging folder> --ignore-scripts`.
A relative `--pack-destination` resolves from the current directory, which is
also the default. The CI `backstage-plugin` job packs the release this way.

## Verifying a fork

`tests/company-overlay-fixture.test.js` builds a copy of the checkout with the
fixture overlay in `tests/fixtures/company-overlay/` (a panel type with a helper
module, a contract fragment, an example folder, Node and Python tests and a
release note). It checks that the build, validation, the folder-agent kit,
`widget_doc`, authoring packets and both test runners pick the overlay up while
every upstream-owned file stays byte-identical. Copy that fixture as a starting
point for a real overlay. `tests/company-identity.test.js` does the same for a
`company.json` with a name, repository and brand, and
`tests/backstage-pack.test.js` for package identity.

### Internal diagram site

Set `"site":{"baseUrl":"https://diagrams.example.com/team/flowspec.html"}`
in `company/company.json` once. The base may include a deployment subpath; it
must be an absolute HTTP(S) URL without credentials, query, or fragment.
Use the actual viewer entry URL; use a directory URL only when its index serves
the viewer. Flowview appends `?diagram=<existing-id>` and supported section/view/path/step
fragments. Builds include this default in the shared runtime and agent context;
Workbench HTML snapshots also save it in `page.documentLinks.siteBaseUrl`.
Do not use a transient artifact sandbox URL as a persistent destination.

### Automatic desktop panel contracts

Every discovered `company/panels/types/*.js` runs through
`tests/company-panel-contracts.test.js` and
`tools/browser-tests/tests/company-panel-contracts.spec.mjs`. No upstream type
list or browser-spec edit is needed when a fork adds a panel. Discovery uses the
checkout's source loader, including company helpers and icons. These files are
picked up by the normal Node suite and required, sharded Chromium CI suite.
An empty overlay is supported; scratch forks still run responsive, scrolling,
SVG fixed-aspect and content-fit positive probes, and deliberately frozen,
clipped and horizontal-only negative probes. Scratch forks never write to the
checkout's `company/` or replace its build outputs.

Supply a valid `authoring.template`, or at least one matching declaration in
`company/examples/**/*.spec.json`. If both exist, both are exercised. Missing
samples fail with the panel type, source file and repair guidance. Use useful
starting content: a blank sample cannot demonstrate visible sizing. Examples
retain their diagram context and patches, while browser contracts replace their
layout with controlled, visible, unlocked allocations. Each sample and placement
is a separate browser test, so larger forks remain shardable.

Run the focused contracts from the repository root:

```sh
node --test tests/company-panel-contracts.test.js
npm test --prefix tools/browser-tests -- company-panel-contracts.spec.mjs
```

Install the locked browser/host dependencies and matching Chromium first as
shown in [browser test setup](../tools/browser-tests/README.md). The browser
command rebuilds the actual workbench and uses the existing strict console,
page-error and network audit. It uses desktop viewports (1440 and 1100 CSS pixels
wide); document editing on phones is outside this contract.

The Node checks cover DOM-free registration, presence of a renderer, valid
samples, deterministic and nonmutating validation/folding, empty-story snapshots
and supported `canvasSizing` values. Optional validators/folders remain optional;
the normal shared defaults are exercised. Browser checks cover renderer-owned
content width response, measured Standard tile/card height shrink/grow, Explore pointer resizing,
independent horizontal/vertical pointer and keyboard movement, and reachable
scroll offsets. Declared canvas policies also run **On canvas**, where those
policies actually apply. Fixed-aspect visuals retain their proportions and fitted
cards follow intrinsic height and any declared cap.

These are structural regression checks, not a universal visual-quality proof.
They inspect initial rendered states, not every animation frame, skin, authored
state or custom editor. The width oracle measures direct renderer-owned children
of `.pbody`; individual labels and icons may stay fixed, and fixed intrinsic
content may use a responsive scroll wrapper. Intentional screen-reader-only
captions, `aria-hidden` decoration and ellipsis are excluded from clipping
failures, including overflow those decorative descendants contribute to a clipping ancestor. The fixed-aspect check uses `layout.sectionSizing.contentSelector` when
provided, otherwise the first SVG/image/canvas/video or direct content child.
Keep focused panel-specific tests for artwork, meaningful internal targets,
custom interactions and lifecycle cleanup beyond these measurable invariants.
See [panel contract troubleshooting](panel-modularity.md#automatic-fork-contract-troubleshooting)
for common repairs.

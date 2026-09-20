# Shared pure core

The viewer, editor, validation CLI and backend share plain JavaScript fragments
under `src/core/`. `src/source-bundles.json` includes each leaf once in the logical
`validator.js` bundle. Navigation and document helpers share the same outer scope;
a document helper can call `sectionReferences()` in both browser and backend builds.
The logical `engine.js` bundle adds the DOM renderer and player only.

Use `readSource('validator.js')` from `tools/source-loader.cjs` in Node tools and VM
tests. Add `readSource('engine.js')` only when rendering or playback is needed.
Reading the physical validator file skips its dependencies. The manifest is a
flat list of physical files, with deterministic panel discovery; entries do not
recursively expand other logical bundles. Panel registration stays DOM-free.

| Source owner | Responsibility and call-time dependencies |
| --- | --- |
| `core/document.js` | Guarded normalization, blocks and all-section records; uses navigation for canonical references |
| `core/navigation.js` | Hash grammar, section/tab/step references and route resolution; link-base canonicalization uses `URL` |
| `core/paths.js` | Step patches, path projection and exact source-step lookup; uses shared `isHex()` and navigation `stepIndexOf()` |
| `core/section-layout.js` | Named views, host profiles, tile placement and visibility; uses path projection and registered panel capabilities |
| `core/state.js` | Node-tone folding and panel-state dispatch; uses shared `TONE_SET`, step patches and the panel registry |
| `core/geometry.js` | Diagram layout, edge routing and collision calculations; uses shared `clamp()` |
| `validator.js` | Shared constants, validation rules and advisory lint |
| `panels/shared.js` and `panels/types/*.js` | Shared panel behavior and each type's validation, folding, rendering and editor facets |

Dependencies are used when functions run, after assembly and panel registration.
Do not eagerly call layout or state helpers while loading a leaf. Panel folds stay
in their panel modules; `foldPanelStates()` selects the registered fold or the
shared fallback. Fold a `diagramForPath()` projection to keep another path's
carried state out of the result.

## Section identities

`sectionRecords(page)` accepts a normalized page and returns every section in
rendering order, including prose and inactive tabs. Each record contains:

| Field | Meaning |
| --- | --- |
| `section` | The original section object; no clone or mutation |
| `path` | Source address relative to the normalized page, such as `blocks[4].tabs[1].sections[0]` |
| `blockIndex` | Zero-based source block index |
| `number` | One-based rendered section number, including prose |
| `reference` | Canonical heading reference, including duplicate/numeric/empty-heading rules |
| `tabBlock` | One-based tabs-block route ordinal, or `null` for a direct section |
| `tab` | Zero-based tab index, or `null` for a direct section |
| `tabLabel` | Tab label including the existing fallback, or `null` |

An empty tabs block still occupies a tab-block route ordinal. A source block index
is not a tab-block ordinal: renderer button IDs retain the raw block index.
`renderPage()`, entity-diagram indexing, Backstage source-section lookup and
Confluence section selection all use these records. Confluence retains its numeric
section selector and tab-prefixed labels.

Canon's `sections()` intentionally returns only diagram-bearing sections for
evidence and trace operations. Keep its ordering separate from viewer numbering.
The editor's `specSectionPaths()` still addresses raw authored JSON, including
wrappers and bare diagrams; do not replace those addresses with normalized-page
record paths.

## Exact source-step lookup

`resolveSourceStep(diagram, pathId, stepRef)` resolves the complete named path
using the existing collision-safe ID/position rules. It returns `null` for an
unknown path. Otherwise it returns `{path, pathIndex, sourceIndex}`; an unknown or
absent step reference produces `-1` for both indices while retaining the path.
The caller supplies the current/default path ID when no explicit path was given.

`pathIndex` is a zero-based position within that path. `sourceIndex` is a zero-based
index in the authored `diagram.steps` registry. Neither is a position in a named
view's filtered playback stops. The lookup does not apply view filters or change
the selected path, and it does not mutate the diagram.

For an exact host jump, pass the returned source index and path ID directly to
`jumpSource()`. Selecting the path first may refuse a wholly hidden alternate and
prevent its exact preview. The host retains tab activation, scrolling and its
recoverable errors. A path-only request still calls `selectPath()` and reports the
existing refusal if the view has no visible stops.

## Static backend facade

`tools/canon/core.cjs` statically imports the generated backend runtime. Run
`python3 tools/build.py` after shared source changes and commit its generated
output. Production bundles need no source checkout, runtime filesystem reads or
VM evaluation. Creating the cached `viewerRouting()` facade never initializes the
DOM renderer.

The original `viewerRouting()` entrypoints remain available: `blocksOf`,
`sectionReferences`, `buildHash`, `diagramPathList`, `stepKeys`, `stepFailures` and
`stepReference`. The facade also exposes `normalize`, `sectionRecords`, `parseHash`,
`diagramForPath`, `resolveSourceStep`, `diagramLayoutViews`, `sectionLayoutItems`,
`foldNodeTones`, `foldPanelStates`, `layout` and `lintPage`. Existing browser/editor
callers retain the same named functions in their assembled scope. Validation
continues through the backend's `validateSpec()` entrypoint.

When changing these boundaries, run the document/navigation/geometry, identity,
path, section-layout and playback regressions, plus shared Node/Python tests.
Keep temporary source-tree fixtures, portable outputs and host assets current.
The CJS/ESM backend bundle tests restrict filesystem access to the deployed bundle;
the root Canon entity suite follows a real entity-index link through the shared
core and Backstage frame to a hidden alternate's original source step. Plugin
unit tests stay self-contained so the documented standalone copy can verify
without the upstream tools or fixtures.

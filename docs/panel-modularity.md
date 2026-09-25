# Adding a panel

Each panel type has one authored JavaScript file in `src/panels/types/`. It owns
validation, state rules, presentation, editor metadata and custom controls,
picker examples, styles, layout capabilities, reference paths and release metadata.
All built-in types use this contract. There is no central panel allowlist,
picker table, import list or compatibility entry to update.

Add a panel definition and its tests, then rebuild generated artifacts. A new
kind of shared control or animation may still require a shared API change.
Panel code is trusted repository code shipped in a Flowview release; specs cannot
load JavaScript, register plugins, or fetch a newer renderer.

## Definition and examples

Use `PanelRegistry.define(type, definition)` in the new file. `extend` adds
non-overlapping facets and rejects duplicate facets; built-ins use it to keep
longer files organized. Registration must not access the DOM, start timers or
fetch anything. Helper functions and editor factories run later.

See the complete executable [extension fixture](../tests/fixtures/panel-extension.js),
[Gauge](../src/panels/types/gauge.js) for simple rendering/editor metadata,
[Home Map](../src/panels/types/homemap.js) for custom editing and rich state, or
[Device app](../src/panels/types/deviceapp.js) for declared node references.

| Facet | Purpose |
| --- | --- |
| `label`, `since` | Compatibility feature name and actual first supported release |
| `validateDeclaration(panel, path, warnings, errors, diagram)` | Validate configuration and initial state; optionally return per-instance validation context |
| `validatePatch(patch, path, panel, warnings, context)` | Validate step patches using that instance's context |
| `fold(panel, steps)` | Optional pure specialized folder returning absolute snapshots, including an initial snapshot for an empty story |
| `render(host, panel, state, skin, states, stepIndex, animate)` | Describe presentation of an already-folded snapshot |
| `presentation` | Shared traits: `growing`, `ambientInitial`, `historyRequiresSteps` |
| `authoring` | Template, setup/step fields, picker description/example, provenance and custom editor hooks |
| `layout` | Default focus, focus label, control attachment, large sizing and preferred height |
| `references` | Paths such as `{nodes: ['sources.*.node']}` for rename, deletion and cross-spec paste |
| `styles`, `editorStyles` | Panel-only CSS; shared themes and reusable primitives remain shared |

`layout` supports `focusByDefault`, `focusLabel`, `attachControls`, `large`,
`height`, `supporting` and `fallbackHeight`. A preferred size never overrides a
saved size or hidden choice. `fallbackHeight` is used when appending a panel to
an existing layout.

Reference paths visit own properties; `*` visits array elements or object values.
The shared remapper mutates a caller-owned clone. Missing mappings preserve a
reference, mapped null deletes it, and cross-spec paste removes references absent
from the destination. The Home-element clipboard format and queue trace evidence
contract remain explicit domain features, not panel registration rules.

## Shared behavior

`src/panels/shared.js` owns state accumulation/reset/transient helpers and the
presentation lifecycle: unchanged-DOM reuse, easing, reduced motion, cancellation,
settling, mounting and teardown. Prefer `foldCommonPanelStates` to copying its
logic. It accepts append and acceptance policies for specialized histories.
The default folder carries ordinary fields from `initial` through sparse patches.
Folders must not mutate input or recover state from the DOM. Path selection and
step filtering remain in the player: alternates have independent carried state,
and skipped playback stops still contribute state.

`src/panels/notifications.js` owns notification validation, folding and card
markup shared by Phone and Device app. Both consume absolute snapshots: `notify`
adds cards and `clear` removes their notification history without clearing other
panel values. Keep notification behavior in this helper rather than duplicating
it in each phone surface.

The render result supports `html`, `baseline`, `level`, `glide`, `pulse`,
`enterBars`, `bars`, `transient`, `settle`, `patch` and `mounted`. These describe
work for the shared lifecycle, not separate animation loops. Camera screens use
`patch` to preserve an animated scene while changing overlays. Read
[Screen](../src/panels/types/screen.js) before adding surgical DOM updates.

The editor generates ordinary controls from `setupFields` and `patchFields`.
`expandPatchFields(panel)` adds fields derived from configuration. The picker
clones `template` and passes a fresh `{panel, state, states, step}` to
`example(sample, context)`; previews must not mutate insertion defaults.

For custom controls, `authoring.editor(context)` returns hooks such as
`setupRows`, `setupField`, `stepControl`, `clickTarget` and `decoratePreview`.
It is created once per editor/type. The context supplies live source/selection
reads, shared controls, `commit` for a field and `transact` for a mutation planner.
Use those commands so a gesture is one Undo/Redo operation and selection is
restored consistently. Do not implement another history stack or JSON writer.
Home uses shared row controls with decorations for its draggable elements.

Custom editor controls register events through `context.listen(target, type,
callback, options)` and resource cancellation through
`context.onFormRetire(cleanup)`. Both belong to the currently rendered inspector
form: replacing/retiring that form removes listeners and cancels pointer capture,
preview motion or other resources. Retained event callbacks stay inert. Cleanup
must not commit edits or return focus; the owner attempts all cleanups before
reporting a thrown cleanup error. Shared `context.controls` already follows this
lifetime. The per-type editor factory may retain expansion preferences, but must
not retain retired form DOM.

`context.selectClipboard(target)` selects an authored Home subelement;
`context.clearClipboard()` clears that selection when choosing an outline or
another non-copyable element. Access clipboard state through this context rather
than referencing the builder initializer's private variables. Panel editing stays
registry-dispatched; do not add type switches to the interaction owner.

## Styles and assembly

Use a CSS string for a new panel, with a unique class prefix and shared skin
variables such as `--dink`, `--dtext` and `--dfaint`. Include print and reduced
motion behavior when needed. Migrated built-ins use ordered CSS blocks to retain
the historical cascade against shared rules; new panels normally need no ordering
metadata. Shared styles contain matching type-independent order markers. Do not
duplicate rules between modules.

`src/source-bundles.json` discovers `panels/types/*.js` deterministically. The
validator bundle includes DOM-free definitions; the viewer adds the engine and
the workbench adds generic editing code. Named entrypoints order these bundles
and select shared assets and deliberate exports. `tools/source-loader.cjs` owns
physical expansion and substitution; Python consumes its CLI, and host builders
use its API. See [build entrypoints](build-entrypoints.md). Use `readSource('validator.js')` from
`tools/source-loader.cjs` for headless tools/tests; it assembles the registry,
validator, pure core leaves, shared helpers and type definitions. Geometry lives in
`core/geometry.js` and uses the validator's existing `clamp()` helper at call time.
It is included once, after the validator helpers and before panel definitions,
so `layout`, routing, collision helpers and `lintPage` work without the renderer.
The validation CLI uses this headless assembly. Document, navigation, path,
section-layout and state helpers share its outer scope, each declared once.
Add `readSource('engine.js')` when player/renderer helpers are needed. The navigation
leaf can also load alone for pure reference/hash operations (link-base
canonicalization needs `URL`). See [shared core](shared-core.md) for ownership,
section records and the exact source-step lookup.
Reading raw bundle files directly skips their manifest dependencies.
Feature metadata and CSS are collected at build time for
standalone, workbench, Backstage and Forge. Metadata substitution follows the
physical `compatibility.js` file even through a logical alias. Core and workbench
CSS include ordered registry contributions; page CSS remains raw so combining
page and core does not duplicate panel styles.

The logical `builder.workbench.js` bundle loads source-edit, raw-target and command
leaves before the generic builder. Pure layout/reuse/clipboard planners share
those source owners with their satellite controllers. Use assembled source for editor and
cross-family tests; [workbench modules](workbench-modules.md) describes the pure
command test surface, clipboard bundle and source-preservation contract.

Radar's module keeps geometry and alert state separate: the model computes
distance and occupancy, while authored `alert` booleans fold through the shared
state helper. No geometric test sets the alert. The old PIR panel is removed;
convert old declarations and events explicitly as described in the authoring
contract rather than adding a runtime alias or inferred alarm rule.

The packaged backend contains generated code and has no runtime source-file or
VM dependency. Its cached `viewerRouting()` facade exposes the shared pure core
from the validator scope, including navigation; it never initializes the DOM
renderer. Backstage's standalone compatibility checker contains generated
feature metadata, not a second handwritten list. Company release and upgrade PR
boundaries are unchanged. Rebuild the native artifact when upgrading Backstage;
its trusted static code mounts within an owned ShadowRoot. Panel CSS root selectors
are scoped at build time, and timers/observers use the explicit instance environment.
See [native ownership](native-viewer.md); no generated script hash is required.

## Verification and release

Use the project's Node version and locked app dependencies:

```sh
python3 tools/build.py
node --test tests/*.test.js
python3 -m unittest discover -s tests -v
npm run build:viewer --prefix apps/backstage
npm run verify --prefix apps/backstage
node --test tests/canon-bundle.test.mjs
npm run verify --prefix apps/confluence
```

`tests/panel-extension.test.js` copies the source tree, adds exactly one panel
file, and verifies validation, folding, alternate isolation, editing, references,
picker discovery, rendering, CSS, compatibility and a real portable build. It
checks that no existing source file changed. Separate editor tests exercise
custom controls through the real editor's shared Undo/Redo commands.

For a new panel, add focused tests and an authored example, document its fields in
the authoring contract, and browser-check its controls, layouts, motion and print
presentation. Rebuild and commit generated assets. Documentation, tests and
output are expected additions; existing implementation files should need no new
panel-specific branches or registration entries.


Panels can set `authoring.initialFields: true` to reuse their typed patch fields
(including dynamic fields) for the panel inspector's **Starting state**. This
writes `panel.initial`, separately from step patches. `editor.patchField` receives
an optional third argument `{initial: true}` for context-specific labels. The
shared inspector owns transactions, unknown-field preservation, and Undo/Redo;
panels should not duplicate that machinery.

`authoring.notifications: true` opts a panel into the shared notification
composer for `notify` and its clear-before-add control. It reuses the inspector
transaction/lifetime and the renderer's existing notification object contract.

`authoring.transientFields` lists top-level fields whose runtime supports
`enterOnce`. The shared step inspector exposes duration only for these fields;
Starting state is unchanged. Camera declares mode, scenePlayback, banner, reason,
audio and spotlight; Phone declares audio only. Object fields are complete
snapshots. When both locations are authored, editing the temporary value leaves
the carried value intact; an explicit duration choice collapses the pair to the
current temporary value. The planner preserves unknown siblings and refuses
malformed transient containers instead of repairing them implicitly.

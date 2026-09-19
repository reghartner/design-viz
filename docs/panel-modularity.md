# Panel modules: proposed incremental architecture

Status: design proposal, not an implemented panel extension API. Existing specs
and releases keep their current behavior while modules are extracted in separately
reviewable changes.

## Why splitting engine.js is insufficient

The current renderer is about 6,000 lines; the workbench builder is about 7,000.
The 28 panel types have definitions in several places:

| Concern | Current owner |
| --- | --- |
| Type list, normalization, validation and state folding | `src/validator.js` |
| Models, markup, animation, cleanup and panel placement | `src/engine.js` |
| Templates, setup fields, step fields and custom inspectors | `src/builder.workbench.js` |
| Picker descriptions and preview examples | `src/panel-picker.workbench.js` |
| Styles | `src/style.core.css` |
| Version requirements and feature names | `src/compatibility.js` |

The extension unit should own all of these panel-specific concerns. Moving only
the rendering switch into smaller files would leave the same coordination burden.

## Proposed source structure

```text
src/panels/
  sdk/                     shared contract and safe UI/animation helpers
  gauge/
    manifest.json          type, release, label, description, category, capabilities
    state.js               normalize, validate, initial state, fold step patch
    view.js                create/update/destroy renderer
    editor.js              setup/step fields; optional custom inspector
    style.css              styles scoped to this panel type
    example.spec.json      picker preview and executable example
    tests/                 state, lifecycle, authoring and visual expectations
  phone/...
src/runtime/               page composition, graph, routing, steps, layout
```

Use plain source modules first; adopting TypeScript across the engine is a separate
choice. Define/check the extension contract with types or JSDoc and runtime build
validation. Do not require a wholesale framework rewrite to add boundaries.

Build tooling discovers panel folders deterministically and generates the registry.
It rejects duplicate IDs, incomplete definitions, unscoped styles and incompatible
contract versions. The manifest generates picker/type lists, capability/version
entries and documentation metadata. A contributor adds an ordinary new panel's
folder and tests; no hand-maintained central switch or import list is required.

These are reviewed build-time modules shipped in a Flowview release. A diagram
spec remains data and cannot name a remote script, import arbitrary code, or
register a runtime plugin. Backstage keeps its pinned company release and existing
upgrade warning behavior.

## Contracts to settle before extraction

- **State:** normalization and validation remain pure and usable in Node. A reducer
  receives the declaration, prior state and step patch. It returns the next snapshot
  without touching the DOM. Existing replace/append/reset and transient-event
  semantics must survive arbitrary jumps, shared steps and alternate paths.
- **View:** `create(host, declaration, context)` returns `update(snapshot, transition)`
  and `destroy()`. Transitions distinguish narrative movement from a refresh or
  resize. Shared helpers own cancellation, reduced motion, hidden-view pausing,
  SVG IDs, escaping and explicit evidence links. Presentation state cannot become
  the source of truth for step state.
- **Editor:** declarative setup and step fields cover common panels. Complex
  inspectors receive narrow commands for changing declarations/patches, selection,
  undo and drag operations. They do not reach into arbitrary builder globals.
- **Layout:** declare sizing/aspect and supported placements. The layout runtime
  positions panels and couples step controls; a panel cannot rewrite sibling layout.
- **Compatibility:** preserve every existing `panel.<type>` identity and its original
  release version. Moving code is not a new spec feature. Unknown-panel placeholders
  and upgrade notices keep working.
- **Delivery:** one source manifest feeds the standalone viewer, workbench, Backstage,
  Forge and Node runtime builds. Node entry points include pure state/validation;
  routing helpers are separate from DOM rendering. No deployment-time source reads.

## Migration sequence and gates

1. Establish the shared build manifest and contract using a small panel such as
   gauge. Replace its central branches with registry adapters while legacy panels
   continue working. Build and verify every host and production backend bundle.
2. Move the gauge's state, view, inspector, styles, picker metadata and example into
   its folder. Compare state and visible output before/after, including alternate
   jumps, reduced motion, hide/show and teardown.
3. Add a disposable test panel using only a new folder. Prove build discovery,
   validation, picker preview, editing, state patches, feature reporting and rendering
   without modifying existing sources. This is the acceptance test for extensibility.
4. Migrate an animated panel such as phone to exercise notifications, time-based
   transitions and lifecycle cleanup. Improve the shared SDK only where that real
   case needs it. Then migrate families of simpler panels in bounded PRs.
5. Move Home last: its physical geometry, cameras, doors, subject motion and direct
   manipulation need focused behavioral and visual coverage. Split graph routing,
   page composition and playback independently after panel ownership is established.

Keep the exported single-file HTML format. Modular source can still compile to
self-contained HTML and the pinned Backstage snapshot with its generated CSP hash.
Check custom layouts, attached controls, hidden steps, alternate paths, arbitrary
navigation, export/GIF capture and Forge sizing as migration acceptance surfaces.

An ordinary panel should need no edits to existing source. A genuinely new shared
capability may still require an explicit SDK change; the goal is to make that
exception visible rather than hiding dependencies behind global access.

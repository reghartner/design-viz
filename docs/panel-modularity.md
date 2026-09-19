# Panel modules and shared presentation code

The renderer extraction is implemented. All 28 panel types have one source file
under `src/panels/types/`. Each owns its presentation model, markup, and specific
interaction hooks. Screen also owns the stock camera scenes. The common panel
lifecycle is implemented once in `src/panels/shared.js`.

```text
src/panels/
  shared.js            registration, DOM reuse, motion, cleanup, panel containers
  types/
    gauge.js           gauge model/markup and level-animation description
    thermo.js          thermal model/markup; uses the same level animation
    battery.js         battery model/markup; uses the same level animation
    screen.js          scenes and the scene-preserving overlay update
    homemap.js         physical scene model/markup and door-specific settling
    ...                one file for each of the 28 existing panel types
src/engine.js          graph, geometry, page composition, layouts and playback
src/source-bundles.json
```

The extraction preserves spec fields, feature versions, folded snapshots, and
single-file exports. **This is not yet a complete authoring plugin API.** Schema
validation/state folding remain in `validator.js`; templates/inspector fields
remain in `builder.workbench.js`; picker metadata, CSS and compatibility entries
also retain their existing owners. Moving those is the next stage, not a promise
that an entirely new public panel type currently needs only one file.

## Renderer contract

`PanelViews.register(type, render, options)` rejects duplicate IDs. `render` receives
`host, panel, state, skin, states, stepIdx, animate` and returns a presentation
result. `state` is already folded, absolute state. Renderers must not derive story
state from the previous DOM or start their own copies of shared animation code.

| Result field | Shared behavior |
| --- | --- |
| `html` | Target markup; unchanged markup preserves the existing DOM |
| `baseline` | Steady markup for comparison when the painted HTML has transient cues |
| `level` | Fill width and numeric readout; shared settling, easing and cancellation |
| `glide` | One or several subject transforms released after painting |
| `pulse` | Brief emphasis after a state change |
| `enterBars` | One-shot emphasis for newly revealed rows |
| `bars` | Matching duration bars grow from prior visual widths |
| `transient` | Selector for temporary nodes removed when settling |
| `settle` | Additional panel-specific cleanup on an immediate jump |
| `patch` | Optional surgical DOM update; return true when no rebuild is needed |
| `mounted` | Bind panel-specific interactions after changed markup is installed |

Options declare shared container behavior: `growing` places accumulating panels
last; `ambientInitial` renders initial state outside step mode;
`historyRequiresSteps` avoids showing step history in an ambient-only diagram.
See [gauge](../src/panels/types/gauge.js), [phone](../src/panels/types/phone.js), and
[screen](../src/panels/types/screen.js) for simple, transient, and surgical examples.

Shared code owns requestAnimationFrame/timer cancellation. A settled jump or panel
teardown invalidates pending releases so an earlier animation cannot overwrite a
new target. Pure models remain callable by the existing workbench and tests;
these modules use the existing browser-fragment scope, not remote imports.

## One assembly manifest for every host

`src/source-bundles.json` expands the `engine.js` source entry into shared panel
code, alphabetically discovered `panels/types/*.js`, and the engine. There is no
per-panel handwritten import list. Python's page builder and the Node build/test
loader read that same manifest. Backstage and Forge consume it too.

Adding a **renderer implementation** means adding its file. A test creates a new
renderer file in an isolated source tree and verifies discovery plus common DOM
reuse without changing the manifest or shared code. Another test ensures every
existing supported type has exactly one renderer. Existing model, state, scene,
layout and playback tests continue to exercise the assembled source.

Assembly happens only during builds/tests. The shipped HTML, pinned Backstage
viewer and `generated-runtime.cjs` contain the expanded source; production backend
bundles do not read sibling source files. Changing renderer code regenerates the
Backstage script hash, so its host CSP must be updated when upgrading the artifact.

```sh
python3 tools/build.py
node --test tests/*.test.js
python3 -m unittest discover -s tests -v
npm run build:viewer --prefix apps/backstage
npm run verify --prefix apps/backstage
node --test tests/canon-bundle.test.mjs
npm run verify --prefix apps/confluence
```

Use Node 24 and install each app's locked dependencies first. Compare representative
browser scenes before and after extraction; pure-function tests cannot establish
visual parity. Tests include immediate/animated jumps, alternate state isolation,
DOM preservation, reduced motion, pending-release cancellation and teardown.

## Remaining separation

Move declaration/step-field metadata and picker examples into the corresponding
panel definition, with common inspector field rendering. Then introduce a pure
state/validation registration layer so Node scanners do not need view modules for
schema work. Preserve shared reducers for append/reset/transient behavior rather
than copying them into each panel. Extract genuinely repeated presentation pieces
(such as history plots) into common helpers when migrating those responsibilities.
Keep common themes/layout rules shared; do not create 28 independent panel engines.

A new public panel should eventually need only its definition and tests, while a
new shared capability may require an explicit common API change. No spec may load
remote code. Company releases and Backstage's pinned upgrade cycle remain intact.

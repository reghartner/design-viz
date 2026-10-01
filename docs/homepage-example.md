# Put your own diagram on the homepage

Use an exported Flowview **JSON spec** as the source. The homepage renders it with the real viewer; it is not a screenshot or an embedded link to a published diagram.

**The current example is shared with the tour.** Replacing `src/starters/onboarding.json` changes the homepage, expanded example, reader introduction, and agent/manual practice story. The editing exercises refer to particular nodes, steps, and panels. An unrelated diagram is therefore not a safe one-file replacement today.

For an existing company diagram, the recommended change is to give the homepage and reader introduction their own spec while keeping the editing exercises on the fictional sample. The wiring below is a small implementation task; a separate `WORKBENCH_LANDING` input does not exist yet.

## Prepare the company example

1. Open the diagram in the workbench and download its JSON. Choose a concise section that works at card size; keep a clear first state and a few meaningful steps. An alternate path and local child diagram give the reader tour more features to demonstrate.
2. Use a `page.sections` wrapper with the featured diagram in `page.sections[0]`, or update the homepage layout code to address your actual wrapper. The current homepage code directly accesses that first section; an arbitrary `page.blocks`/tabbed document needs adaptation.
3. Include the panels you want visible together. Home map, App screens, and Device app are the current selection, not a requirement of the renderer. Keep panel IDs consistent with the homepage grid.
4. Embed screen images and any other media as data URLs. The expanded example and reader tour block network requests, so remote media URLs and remote child-diagram dependencies will not work there. Use local sections for drill-downs.

The JSON and embedded images ship inside the downloadable workbench HTML, so choose an example suitable for the audience that receives that file.

## Recommended: company example on the homepage and reader tour

Keep `src/starters/onboarding.json` for the agent/manual practice chapters. Add your exported JSON at `src/starters/landing-example.json` and make these changes:

| File | Change |
| --- | --- |
| `tools/build.py` | Beside `WORKBENCH_ONBOARDING`, add a `WORKBENCH_LANDING` mapping that reads the new file, parses it as JSON, serializes it with `json.dumps`, and escapes `<` exactly as the existing mapping does. |
| `src/workbench.skel.html` | Beside the existing sample constant, add `var WORKBENCH_LANDING = {{WORKBENCH_LANDING}};`. Update the example card's title, example label, and footer to describe your diagram. |
| `tools/browser-tests/fixtures/build-editor.py` | Supply the same new mapping to `build.fill`. The lifecycle fixture also builds this skeleton. |
| `src/workbench/onboarding.js` | In `initWorkbenchOnboarding`, clone `WORKBENCH_LANDING` instead of `WORKBENCH_ONBOARDING` for the homepage. In `initWorkbenchPractice`, use the new spec for the `viewer` and `example` chapters only, as shown below. |
| `src/workbench/onboarding.css` | Check the compact stage dimensions and hidden-section selectors against the new diagram. The current CSS hides `#section-event-detail`; replace that selector if your local detail section has a different ID. |

In `initWorkbenchPractice`, choose the source before cloning it:

```js
var exampleSpec = chapter === 'viewer' || chapter === 'example'
  ? WORKBENCH_LANDING
  : WORKBENCH_ONBOARDING;
var sample = JSON.parse(JSON.stringify(exampleSpec)), workspace = opts.workspace;
```

Leave `createWorkbenchPracticeAgent(WORKBENCH_ONBOARDING)` in boot unchanged: its proposed update belongs to the editing exercise. Keep the existing tour engine, history keys, chapter transitions, and practice isolation.

The homepage currently overrides the first diagram's `sectionLayout` on its cloned spec to fit four tiles plus step controls. Edit that grid in `initWorkbenchOnboarding` to use your panel IDs and proportions. Its diagram-only tile has no `panel` property; panel tiles reference IDs; playback uses `{controls: 'steps', ...}`. The expanded example uses the source spec's own layout, so check both layouts. Both read-only render calls currently select `pastel`; change those explicit skin arguments if your example needs another skin.

The compact stage is authored at 1100 × 900 and scaled to the card. If changing those dimensions, update both `sizeExample()` in JavaScript and `#welcome-example-stage` in CSS. Check that the step controls remain visible and that extra sections do not spill into the card.

## Alternative: use your story throughout every chapter

Replace `src/starters/onboarding.json` directly, then reconcile the exercises in `src/workbench/onboarding.js`. A content refresh can preserve the existing IDs while changing labels, images, captions, and state. A different topology needs the code and tests updated to match.

These are the current anchors, not requirements for all Flowview diagrams:

| Current identity | Where it matters |
| --- | --- |
| First section `visitor` | Homepage layout, practice navigation, and all manual selections use section index 0. |
| Nodes `camera`, `hub`, `cloud`, `phone` | Row/alignment exercises, selected agent context, sample proposal, and story edges. `cloud` also demonstrates service binding and nesting. |
| Panels `home`, `app`, `device` | Homepage grid. The panel-edit lesson opens the `app` controls. |
| Steps `detect`, `offline`; paths `happy`, `offline` | Selected-step and alternate-path exercises. The default selected step also assumes raw index 1. |
| Local child section `event-detail` | The node's detail link and the homepage's hidden-detail CSS selector. |
| Sample service/API bindings | `workbenchTourCatalog()` supplies the matching fictional catalog for the Company service/API dropdowns. |

Also update the example card copy, lesson narration, illustrative agent conversation, simulated proposal/ledger, and fixture-specific test assertions. Keep the catalog demonstration fictional or explicitly authored for practice; it must not fetch your live catalog. Nesting stays a diagram feature.

## Build and verify

Run from the repository root (use `onboarding.json` in the validation command if replacing the shared sample):

```sh
node tools/validate.js src/starters/landing-example.json
python3 tools/build.py
node --test tests/*.test.js
```

After installing the pinned browser dependencies described in `tools/browser-tests/README.md`:

```sh
cd tools/browser-tests
npx playwright test --config playwright.editor.config.mjs tests/workbench-onboarding.spec.mjs tests/welcome-navigation.spec.mjs
```

Extend the spec-validation test to cover the new file. Update assertions tied to the old example, such as its diagram count, panel labels, or alternate-step caption. Preserve the tests for expanded-state continuity, viewer history, real-draft/clipboard isolation, selected-step editing, and Commit/Undo.

Serve the repository with `python3 -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765/workbench/flowspec.html`. Check the compact card at a laptop width, expand it after selecting a different step/path, and replay **1. Explore a diagram**. Continue through the agent/manual chapters to confirm the practice sample still works.

Commit the JSON, source, and test changes. `workbench/flowspec.html` and `template/flowview.html` are generated outputs; do not edit or commit them.

## Prompt to give an agent

> Put the Flowview JSON at **[path to my exported diagram]** on the homepage and in its expanded example/reader introduction. Read `docs/homepage-example.md` first. Create the separate landing-example input described there, preserving the fictional agent/manual practice sample and the single canonical copy/paste-first agent setup. Adapt the compact layout, panel IDs, section visibility, and card copy to my diagram. Keep the expanded example on the same selected step/path and retain the existing tour history and sandbox protections. Embed the required images; use local drill-down sections. Update both production and browser-fixture build mappings, add validation for the new spec, adjust only fixture-specific expectations, and run the listed checks. Show me the compact and expanded result. Do not change the app's tour engine or replace the editing exercises merely to make the new homepage example fit.

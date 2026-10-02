# Put your own diagram on the homepage

Own the landing page in **company config and an exported Flowview JSON spec**. `python3 tools/build.py` embeds them in the portable workbench HTML. Rebuilding after an upstream update reapplies the company example without patches to upstream source or generated HTML.

The company example appears on the homepage, in its expanded view, and in the reader introduction. Agent and manual editing exercises always use the fictional `src/starters/onboarding.json` sample. The existing copy/paste-first agent setup and tour history are shared across both.

## Company fork: automatic configuration

From your company fork root:

```sh
mkdir -p diagrams/company
# Save your exported JSON as diagrams/company/story.spec.json first.
cp workbench/site.example.json workbench/site.json
python3 tools/build.py
```

Edit `workbench/site.json` to describe the example:

```json
{
  "version": 1,
  "landing": {
    "spec": "../diagrams/company/story.spec.json",
    "title": "Our architecture",
    "label": "Company example",
    "footer": "Explore the story, then expand for a closer look."
  }
}
```

Commit `workbench/site.json` and your spec in the company repository. Upstream tracks only `workbench/site.example.json`; it does not ship or rewrite your `site.json`. Ordinary builds automatically discover `workbench/site.json` relative to the Flowview source root, regardless of the current working directory. The existing `deploy/workbench/Dockerfile` copies `workbench/` and `diagrams/`, so this placement also works for its normal image build without modifying the Dockerfile.

`version` must be the integer `1`. `landing.spec` is required and resolves relative to the config file, including for external config files. Optional `title`, `label`, and `footer` are plain text, never HTML; they default to “Company diagram”, “Company example”, and an empty footer. An empty label or footer is hidden. Unknown fields, unsupported versions, missing files, malformed JSON, and spec validation errors fail the build before it overwrites HTML. A missing *automatic* config keeps the built-in example; an explicitly supplied missing config is an error.

The builder only reads config and spec. It never injects changes into either source file. Generated `workbench/flowspec.html` and `template/flowview.html` remain ignored outputs; don't edit or commit them.

## Vendored source or a mirror that deletes files

Keep config and spec **outside the directory replaced by your sync**. A vendor copy or `rsync --delete` can remove company files inside that directory even when upstream doesn't track them. For this structure:

```text
company-repo/
  flowview-site/site.json
  flowview-site/story.spec.json
  vendor/flowview/tools/build.py
```

Use `"spec": "story.spec.json"` in `flowview-site/site.json`. From `company-repo/`, run:

```sh
python3 vendor/flowview/tools/build.py --config flowview-site/site.json
```

Add that exact configured build step to your company update/deploy script after replacing `vendor/flowview/`. Commit the external config, spec, and build script. The generated workbench is `vendor/flowview/workbench/flowspec.html`. Absolute `--config` paths work from any directory; relative CLI paths resolve from the invoking directory, while `landing.spec` always resolves from its config directory.

The stock Dockerfile's build context covers its source tree. External config outside that context needs your company packaging step to copy config/spec into the image build context, or a company Dockerfile that includes those inputs and runs `build.py --config` at their container paths. For the stock image, use the in-tree placement above.

## Author the example

- Use a bare diagram, a page object, or a `page` wrapper with sections/blocks. The first diagram section that is not `detailOnly` is featured on the compact card. Other sections remain available to local drill-downs and the expanded reader, without spilling into the card. For a tabbed document, the featured diagram's tab is selected on the compact card and on expansion.
- Save the desired opening Chapter with **Make opening chapter** in the workbench. The spec owns its layout, Standard or Explore mode, panels, and default Chapter. The expanded example and reader introduction honor its authored skin; the compact homepage card keeps the stock pastel presentation. The landing config adds no duplicate layout settings and the builder does not rewrite the spec.
- Expansion preserves the selected Chapter, path, and step. The compact stage renders at a logical width of 1100 pixels, then scales to fit the card; its height follows the authored view instead of cropping it to a fixed ratio.
- Embed images and media as data URLs. The expanded example and reader introduction run in an opaque-origin sandbox that blocks network requests; remote media and external child diagrams are unavailable there. Use local detail sections.

The complete spec and embedded media ship inside the downloadable HTML. Choose a company story appropriate for everyone receiving that file.

## Migrate an existing manual injection

1. Save the company landing JSON as a company-owned spec file. If it only exists in an old generated page, recover that JSON before rebuilding.
2. Create the config above and move your card title, label and footer into it.
3. Retire the company patches to `tools/build.py`, the skeleton, onboarding code/CSS, and `src/starters/onboarding.json`; use the current upstream versions. Keep the fictional exercise sample intact.
4. Run your configured build after each upstream update. Deploy its output instead of applying another injection patch. Compare the saved config and spec in Git to confirm the build left them unchanged.

## Verify

After building with your config, serve the source root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/workbench/flowspec.html`. Check desktop and phone widths, the saved default Chapter, and local child details. The compact card uses pastel; expansion and the reader introduction use the authored skin. Select another Chapter/path/step and expand. Replay **1. Explore a diagram**, then switch to agent/manual practice and confirm it uses the fictional story.

For upstream development, `python3 tools/build.py --no-config` deliberately ignores company config. Default build tests and browser fixtures use this mode; browser contracts also build a separate temporary company configuration. These tests can leave the default sample in the generated output. **Run your configured production build again after testing**, then deploy that result.

Focused checks from the Flowview root:

```sh
python3 -m unittest discover -s tests -p 'test_site_config.py' -v
python3 -m unittest discover -s tests -p 'test_build.py' -v
node --test tests/workbench-onboarding.test.js
# Install the pinned browser dependencies per tools/browser-tests/README.md first.
cd tools/browser-tests
npx playwright test --config playwright.editor.config.mjs tests/workbench-onboarding.spec.mjs tests/welcome-navigation.spec.mjs
```

## Prompt to give an agent

> Configure our Flowview landing page using the JSON at **[path to my exported diagram]**. Read `docs/homepage-example.md`. Determine which directory our upstream sync replaces. Keep a version-1 config and the company spec in company-owned paths that survive that sync; use `workbench/site.json` for a normal fork or an external `--config` path for a replaced vendor tree. Set our title, label, and footer in config. Add the configured build to our update/deploy process. Preserve the spec's opening Chapter, layout, Explore support, and local detail sections. Keep the compact card pastel and honor the authored skin in the expanded reader. Keep agent/manual exercises fictional and the canonical copy/paste-first setup intact. Migrate any old injection patches to config. Build, verify compact and expanded state continuity plus reader/practice separation, and show desktop and narrow screenshots. Commit company inputs and build wiring, not generated HTML. After any upstream tests, rebuild with our config before deployment.

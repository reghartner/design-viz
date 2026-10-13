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

`src/source-bundles.json` lists both directories as optional globs
(`@company/panels/*.js`, `@company/panels/types/*.js`), and
`tools/source-loader.cjs` resolves them to this checkout's `company/` folder.
Every output that includes the validator therefore includes company panels:
`template/flowview.html`, `workbench/flowspec.html`,
`tools/canon/generated-runtime.cjs` (used by `tools/validate.js`), the
Backstage and Confluence viewers and the native viewer. Assembled bundles label
these files `/* ---- company/panels/... ---- */`. A company type with the same
name as an upstream type fails the build.

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

The values replace marked text at build time: sources mark each literal with
`/*@company:name*/`, `/*@company:repository*/` or
`/*@company:example-repository*/`, and `src/workbench.skel.html` uses
`{{COMPANY_REPOSITORY}}`, `{{COMPANY_REVISION}}` and `{{COMPANY_SKILL_URL}}`.
Without `company.json`, the build emits the upstream text, so the generated
viewer, workbench and runtime are byte-identical to a build without this
feature. `python3 tools/build.py --no-config` ignores `company.json` as well as
`workbench/site.json`; the browser contracts build that way and set
`FLOWVIEW_COMPANY_IDENTITY=off` so they keep asserting upstream labels.

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

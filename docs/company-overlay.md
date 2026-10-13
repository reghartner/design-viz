# Company forks: the `company/` overlay

A company fork usually integrates upstream design-viz by applying the upstream
source diff (for example with `git apply --3way`) and rebuilding. Any
upstream-owned file the fork edits eventually conflicts. To avoid that, keep
every fork customization in files that upstream never ships or edits.

## Fork-owned paths

| Path | Owner | Notes |
|---|---|---|
| `company/**` except `company/README.md` | Fork | Upstream ships only `company/README.md` in this directory and never adds or edits other files here. Do not edit the README; add files beside it. |
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

Put each example in its own folder, `company/examples/<name>/`. Every `*.md` and
`*.json` file in it is bundled into the offline folder-agent kit, and every
`*.spec.json` must validate without errors in the normal Node test suite
(`tests/company-overlay.test.js`). The workbench image build copies `company/`
too (`deploy/workbench/Dockerfile`).

Upstream examples join the kit the same way without a list: a folder under
`examples/` that holds a `.agent-kit` file is bundled, using the file globs
listed in that file, one per line (`#` starts a comment).

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

## Verifying a fork

`tests/company-overlay-fixture.test.js` builds a copy of the checkout with the
fixture overlay in `tests/fixtures/company-overlay/` (a panel type with a helper
module, a contract fragment, an example folder, Node and Python tests and a
release note). It checks that the build, validation, the folder-agent kit,
`widget_doc`, authoring packets and both test runners pick the overlay up while
every upstream-owned file stays byte-identical. Copy that fixture as a starting
point for a real overlay.

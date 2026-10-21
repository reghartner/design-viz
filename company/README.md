# Company overlay

This directory belongs to company forks. Upstream design-viz ships only this
README here and never adds or edits other files under `company/`, so a fork's
files in this directory never conflict when it integrates upstream changes.
Do not edit this README in a fork; add your own files beside it.

Everything below is discovered automatically. No upstream list needs an edit.

| Path | What it does |
|---|---|
| `company/icons/*.js` | Trusted custom icons registered with `defineIcon` and `shapes`, bundled into the frozen shared library, validator, picker and all viewers. See [custom icons](../docs/company-overlay.md#custom-icons). |
| `company/panels/*.js` | Shared helper modules for company panels. Bundled before every panel type. |
| `company/panels/types/*.js` | Company panel types, one `PanelRegistry.define(...)` per file, bundled after the upstream types into every viewer, the workbench and the validator. |
| `company/contract/*.md` | Authoring-contract fragments, one per panel or topic, appended in file-name order to `contract/authoring-contract.md` for agents, `tools/widget_doc.py`, authoring packets and the folder-agent kit. Document a panel under a `### panels` heading with one ``- `type` `` bullet. |
| `company/examples/<name>/` | Example folders, bundled into the folder-agent kit: their `*.md` and `*.json` files, or the globs listed in a `.agent-kit` file in the folder. Every `*.spec.json` must validate in the normal test suite. |
| `company/tests/*.test.js` | Node tests, run by `node --test tests/*.test.js` through `tests/company-overlay.test.js`. |
| `company/tests/test_*.py` | Python tests, run by `python3 -m unittest discover -s tests` through `tests/test_company_overlay.py`. |
| `company/CHANGELOG.md` | The fork's release notes. Keep upstream's `CHANGELOG.md` unedited. |
| `company/company.json` | The fork's name, repository, revision, brand file, Backstage UI base URL, internal site base URL and package identity, used for workbench links and labels, the global brand, agent packets and `tools/backstage-pack.mjs`. |

See [docs/company-overlay.md](../docs/company-overlay.md) for details.

# Local repositories with shared topology

A consumer keeps its `topologyImports` in authored JSON. Local builds and the
desktop Workbench resolve those references from the repository you explicitly
select. They do not require a deployed Canon library.

## Build and validate

Run the existing positional spec command with a repository context:

```sh
python3 tools/page_build.py diagrams/team/checkout/checkout.spec.json --resolve-imports .
```

The folder must contain `canon.json`. Its registered `diagrams/...` folders derive
each diagram's ID and owner, so source specs do not need hand-written `page.canon`.
An explicit registry JSON file is also accepted (for example
`--resolve-imports examples/canon/registry.json`); legacy registries use their
`diagrams[].id` and `path` fields and require matching source `page.canon.id`.
The positional spec must be a member of the selected registry. Paths are resolved
against your current working directory, including when the tool lives elsewhere.

The command rebuilds the current template and backend (`build.py --template-only`), derives membership,
reads the complete transitive import closure, materializes and validates it,
and only then injects HTML and updates the output manifest. Missing IDs, missing
exports, dependency cycles and invalid providers stop the operation before page
or manifest output. Unrelated registered diagrams are not loaded. Authored files,
source copies and diff baselines retain the original references; only the HTML
receives resolved topology. Existing destination, `--root`, warning and
`--diff-prev` options remain available.

For a validation-only check after building the runtime:

```sh
python3 tools/build.py
node tools/validate.js --resolve-imports . diagrams/team/checkout/checkout.spec.json
```

Without `--resolve-imports`, both commands retain their existing behavior.
Standalone validation can also receive an explicit batch of already identified
provider and consumer specs as positional files.

Company branding comes from `company/company.json` and its `brand` path. If
`company/brand.json` exists but default branding is active, builds print a warning
with the configuration fix. A normal page build detects a template made with
stale branding and rebuilds it before injection. `--no-config` and
`FLOWVIEW_COMPANY_IDENTITY=off` deliberately use the sample brand and still warn
when a company brand file exists.

## Open a local consumer in Workbench

In desktop Chrome or Edge over HTTPS (or localhost), use **File → Choose working folder…**
and choose the repository root containing `canon.json`. Select a registered
diagram from the list. The agent folder connection can use the same repository
root selection. The actual working destination is that diagram's nested folder,
including its existing spec and coverage ledger.

The Workbench reads registered providers through the granted root directory
handle and freezes the complete import closure in the session. No local path is
sent to a server, and no deployed library is used as a fallback. Authored import
references remain in the JSON. Local presentation and imported-node positions
remain editable, with normal Undo/Redo, autosave and browser draft recovery.
Provider edits on disk do not alter an already-open or recovered session; reopen
the repository root to load them. A new import outside the frozen closure also
requires reopening the root after updating the authored source on disk.

Browsers cannot discover a selected folder's parent. Selecting a nested consumer
folder that needs providers therefore shows an instruction to select the root
containing `canon.json`. Ordinary folders and valid empty registries remain compatible. A folder with
imports can reuse providers already frozen in the current session; otherwise
select the repository root. Malformed or unsupported registry files remain errors,
and browser registry files are limited to 4 MiB. Cancelled or superseded folder reads cannot replace a
newer document or initialize its folder metadata.

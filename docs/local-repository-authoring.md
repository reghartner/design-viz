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
handle and freezes the complete import closure in the session. Absolute filesystem
paths and directory handles are never sent to a server. Saving a snapshot online
includes bounded provenance: the registered relative source path, root display
label and snapshot time. No deployed library is used as a fallback. Authored import
references remain in the JSON. Local presentation and imported-node positions
remain editable, with normal Undo/Redo, autosave and browser draft recovery.
For a repository project, save provider edits in that worktree, then choose
**File → Refresh local sources**. This reads the current consumer draft's direct
and transitive imports, including newly added dependencies, without replacing
its exact text, coverage ledger, tracking, presentation or layout overlays.
The consumer does not need to be saved or merged first. One Undo/Redo restores
the accepted before/after provider snapshots without rereading or writing files;
earlier consumer history remains available. No provider changes means no new
history entry or render.

Refresh validates the entire closure and verifies registry/provider bytes again
before publishing. Invalid or missing providers, removed referenced identities,
or orphan overlays retain the last valid preview and snapshot with an error
naming the consumer/import/provider. Repair unfinished consumer JSON before
refreshing. Finish canvas/inspector actions and close proposal reviews first.
Provider edits never update the session automatically.

Browser recovery retains the last accepted snapshot offline. **Reconnect local
sources…** explicitly grants a root for the next refresh; it does not reopen the
consumer from disk. The File panel shows the selected root label, relative
consumer path, snapshot time and refresh result. Grant numbers distinguish
selections only within this browser session. A matching folder name cannot prove
that a root is the same worktree; the browser does not know its absolute path,
Git branch, or merge status. Snapshots from before source-path provenance was
recorded require reopening through **Choose working folder…** once.

Cloud projects use their saved cloud provider snapshot. Local source refresh is
unavailable while a cloud project is attached, even when a repository folder is
also connected. Saving a repository project online keeps its current provider
snapshot and provenance; it does not create a live link to files on disk or to
other cloud projects. Cloud-to-cloud provider acquisition is separate work.

Browsers cannot discover a selected folder's parent. Select the repository root
to resolve local providers. Ordinary folders and valid empty registries remain
compatible: imports reuse providers already frozen in the current session, or
use this Workbench's deployed Canon when no context exists. Failed deployed
lookups also explain how to select the local root containing `canon.json`.
An incomplete frozen local context never substitutes deployed providers.
Malformed or unsupported registry files remain errors,
and browser registry files are limited to 4 MiB. Cancelled or superseded folder reads cannot replace a
newer document or initialize its folder metadata.

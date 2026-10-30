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
The consumer may live anywhere and need not belong to the registry. Only providers need registration; auxiliary consumer membership never changes authored JSON. Paths are resolved
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

## Open a consumer and choose its providers

Open the consumer normally in desktop Chrome or Edge over HTTPS (or localhost),
using **Open working file…**, **Choose working folder…**, or the agent connection.
The consumer can live outside the provider repository and need not be in Canon.
Unpublished imports that cannot resolve from the deployed library remain open as
repairable source. Select local providers to render them; no successful deployed
lookup is required. Missing provider IDs or new consumer-requested exports, absent
catalogs and legacy catalogs allow this repairable opening. Malformed catalogs or
providers, published revision mismatches and invalid import declarations reject
the open and retain the current draft. An unresolved replacement keeps the last
valid preview marked stale and saves the previous draft in **Earlier drafts**.

For an agent-connected consumer, save a complete batch of authorized provider
edits, then run the **consumer's** generated helper with an absolute source root:

```sh
python3 <consumer>/.flowview-agent/folder-agent.py refresh-sources --source-repo /absolute/provider-worktree
```

The provider repository must contain `canon.json`. The helper reads only the
current consumer draft's direct/transitive provider closure, compares registry
and provider bytes again, and sends bounded raw snapshots through the existing
folder bridge. Workbench independently validates registry identity, closure,
exports, overlays and syntax before accepting. No provider code runs. No `begin`,
spec/ledger proposal, browser picker or per-refresh confirmation is needed.
A provider helper targets that provider; a separate unconnected consumer must
first establish its own folder-agent connection.

Subsequent `refresh-sources` commands reuse this helper's selected repository.
Use `--source-repo` again to switch or reconnect. The absolute path is retained
only in `.flowview-agent/local-sources-selection.json`; do not commit that private
helper metadata. It is excluded from browser recovery, exported documents and
cloud snapshots. The browser stores a source-selection identity, display label,
relative provider paths, SHA-256 hashes and capture time. These describe a local
preview, not a Git branch, absolute worktree identity or published availability.
Provider updates must deploy with the consumer or before it.

The human alternative is **File → Use local source repository…**, selecting the
provider repository independently of the consumer file/folder. This grants read
access without reopening the consumer or changing its working-file destination.
**Refresh local sources** repeats the selected browser grant. A helper-selected
source can be refreshed by the helper; the browser requires its own explicit
selection to read it directly. Existing registered root-based folder opening
remains supported.

**File → Use site library** leaves the local source repository. The draft's
imports then resolve from this site's published diagram library, and the
topology importer lists that library's providers. The switch is one Undo step
and is kept in browser recovery. If the document imports a provider the site
library does not publish, the switch is refused and the local snapshot stays in
use. A document without imports simply drops the local snapshot.

Wait for the matching `applied` or `unchanged` receipt and `currentRevision` before
claiming an agent refresh succeeded. `state.json.localSources` reports bounded
consumer/source provenance, snapshot capability and availability. Busy/rejected
outcomes exit nonzero: finish a gesture or proposal review, repair the reported
provider or consumer error, then retry. On timeout, bring the consumer tab to the
front and inspect its state. Receipt retries never reapply an accepted snapshot.

Refresh preserves the exact current consumer text, including unsaved valid
edits, coverage ledger, imported/local tracking, presentation and layout. One
Undo/Redo restores captured provider snapshots without reading or writing provider
files; earlier consumer history survives. Unchanged content from the same source
adds no render/history. An explicit source switch records its provenance even
when content is identical. Undo to a different source selection requires explicit
reselection before another refresh, preventing silent worktree mixing.

Invalid, missing, changing or oversized providers, removed identities and orphan
overlays retain the last valid snapshot/preview. Local selection never falls back
to deployed providers. Provider files and the registry are individually limited
to 4 MiB; the bridge snapshot is limited to 8 MiB and 499 providers. New source,
project, connection, cloud attachment or cancelled requests invalidate pending
reads. Browser recovery retains accepted snapshots offline; reselect a root or
use the helper to reconnect. A matching directory label proves no filesystem
identity. No watcher or refresh on every filesystem save is needed.

Cloud-attached projects use their saved cloud provider snapshots and reject local
refresh even with a connected folder. Saving a repository preview online keeps
its bounded provenance and frozen providers; it creates no live filesystem or
cloud-project import link. Cloud-to-cloud provider acquisition is separate work.

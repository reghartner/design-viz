# Browse canon diagrams in the workbench

Choose **Canon diagrams** on the welcome page. Each card opens a **read-only**
viewer. Readers can walk the steps, select an alternate, switch views, drill
into detail, and follow service/code links without opening the editor. Browser
Back and Forward navigate between the library, reader, and workbench; reloading
a reader restores its selected diagram from the published snapshot.

**Edit in Workbench** opens a local editable copy through the normal import
transaction. A single Undo restores the previous project. Browsing alone never
replaces a current project, draft, or its history. Returning to a reader displays
the published version, not unsaved editor changes. Use **Continue** on welcome
or **Back to project** in the header to return to the current local project.

Editing does not write to GitHub or approve a canonical change. Save JSON and
submit changes through the company's repository review process. The separate
legacy `?canon=…` review adapter continues to open its explicit editor workflow.

## Link directly to a diagram

Every published diagram has a read-only URL using its stable `page.canon.id`:

```text
https://your-diagrams-site/workbench/flowspec.html?diagram=doorbell
```

Open **Canon diagrams → a diagram → Copy link**. The library cards are also
normal links: right-click to copy one or open it in a new tab. Adjust the path
above if your deployment gives the workbench a different address. These links
work before Backstage is integrated, using only the static site's published
`diagrams.json`. They open directly in fresh tabs, survive reloads, and support
browser Back/Forward. Reading never replaces a saved local draft.

The ID, rather than the source filename, identifies the diagram, so moving its
JSON within `docs/diagrams/` preserves its link. The link opens the latest
published version; changing/removing the ID makes an old link unavailable.
Unknown IDs or a missing published snapshot show an error with Retry.

**Copy link** shares the document at its initial view/step, not the current
playback position. Use a hosted standalone export for step/view/embed links.
The bundled fictional demo remains available from the library when no snapshot
exists, but has no public Copy link. Direct `?diagram=…` links never substitute
that demo for missing published content. `?diagram=…` is the read-only route;
`?canon=…` remains the separate legacy backend editing route.

## Publish by saving a spec

Save the diagram JSON anywhere under **`docs/diagrams/`**, keeping its existing
folder and filename. Add `page.canon` to opt that document into the library:

```json
{
  "version": 1,
  "id": "doorbell",
  "kind": "canonical",
  "owner": "group:default/home-team"
}
```

This is the value of the existing page's `canon` property, not a replacement
spec. Use a stable, unique ID and the actual owning team's Backstage reference.
`kind:"canonical"` means human-reviewed current behavior; `kind:"design"`
publishes an explicitly proposed design. Saving metadata does not grant approval.
Specs without a `page.canon` property are not published. Other JSON such as
per-folder `manifest.json` files is not a second registration mechanism.

Commit the spec through your normal review process. Both standard builds
**automatically discover** the marked documents and generate
`workbench/diagrams.json`:

```sh
python3 tools/build.py
```

```sh
docker build -f deploy/workbench/Dockerfile -t flowview-workbench .
```

The Python build uses the freshly generated runtime to validate the documents.
The Docker build has a Node build stage that reads `docs/diagrams/` and the
shipped `tools/canon/` runtime, then copies the generated snapshot into nginx
beside `flowspec.html`. It replaces any stale snapshot in the build context.
The final nginx image needs no Node process, API, browser GitHub token or live
Backstage connection. Connect the company's normal reviewed-merge deployment
so saving and merging the spec is the only per-document publishing step.

No `registry.json` entry or hand-edited `diagrams.json` is required. The snapshot
is ignored by Git and contains complete specs, preserving code references and
their pinned revisions. Rebuilding picks up edits, file additions and removals;
removing `page.canon` removes the document from the next snapshot. An empty set
produces a valid empty library, replacing any previous entries.

Discovery reads regular `.json` files recursively in deterministic path order;
symlinks are not followed. Malformed JSON, invalid marked specs/metadata,
duplicate canon IDs, a missing source directory, or a snapshot over 30 MB fails
the build. Errors name the offending files. Validation completes before the
snapshot is replaced, so failure preserves the last successful snapshot.

For a custom build pipeline or source directory, run the publisher directly:

```sh
node tools/canon/library.mjs --diagrams docs/diagrams --out workbench/diagrams.json
```

Running it with no arguments uses those same defaults relative to the current
working directory. Output must be outside the scanned source directory. The
explicit `--registry registry.json --out workbench/diagrams.json` mode remains
available for integrations that intentionally curate a list. Existing drift
scanner registry configuration is separate from this automatic site build.

The browser fetches `diagrams.json` on first library entry with `cache: no-cache`;
nginx serves it with revalidation too. Reload the page after deployment to receive
the latest snapshot. The publisher and reader limit the snapshot to 30 MB.

A missing `diagrams.json` (HTTP 404) uses the explicitly labeled bundled
**fictional example**. Downloaded `file:` workbenches use that example too.
A valid empty snapshot shows an empty company library. Invalid data or other
HTTP errors show an error and Retry, never a silent fallback to example data.
Metadata is displayed as text; the viewer applies its normal spec validation
and safe-link rules.

The snapshot contains full diagram content and evidence links. Publish only
specs intended for everyone who can access that static deployment; its host
provides access control. Read-only describes the browsing UI, not a security
boundary against someone who can download the files. A library snapshot does
not replace the Backstage plugin's own source/authorization integration.

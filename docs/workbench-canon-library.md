# Browse canon diagrams in the workbench

Choose **Canon diagrams** on the welcome page. Each card opens a **read-only**
viewer. Readers can walk the steps, select an alternate, switch views, drill
into detail, and follow service/code links without opening the editor. Browser
Back and Forward navigate between the library, reader, and workbench; reloading
a reader restores its selected diagram from the published index and its selected spec.

**Edit in Workbench** opens a local editable copy through the normal import
transaction, with a fresh Undo/Redo history. The previous project is kept in
**Earlier drafts**. Browsing alone never
replaces a current project, draft, or its history. Returning to a reader displays
the published version, not unsaved editor changes. Use **Continue** on welcome
or **Back to project** in the header to return to the current local project.

Editing does not write to GitHub or approve a canonical change. Save JSON and
submit changes through the company's repository review process. The separate
legacy `?canon=…` review adapter continues to open its explicit editor workflow.

## Link directly to a diagram

Every published diagram has a read-only URL using its stable folder-derived ID:

```text
https://your-diagrams-site/workbench/flowspec.html?diagram=doorbell
```

Open **Canon diagrams → a diagram → Copy link**. The library cards are also
normal links: right-click to copy one or open it in a new tab. Adjust the path
above if your deployment gives the workbench a different address. These links
work before Backstage is integrated, using the static site's published
`diagrams.json` index and the referenced JSON spec files. They open directly in fresh tabs, survive reloads, and support
browser Back/Forward. Reading never replaces a saved local draft.

The folder name supplies the ID. Keep it stable after publishing links. The link
opens the latest published version; renaming the folder or removing its canon
entry makes an old link unavailable.
Unknown IDs or a missing published snapshot show an error with Retry.

**Copy link** shares the document at its initial view/step, not the current
playback position. Use a hosted standalone export for step/view/embed links.
The bundled fictional demo remains available from the library when no snapshot
exists, but has no public Copy link. Direct `?diagram=…` links never substitute
that demo for missing published content. `?diagram=…` is the read-only route;
`?canon=…` remains the separate legacy backend editing route.

## Publish through root canon.json

Root [`canon.json`](../canon.json) is the shared authority for the nginx site and
Backstage. Add a folder entry to promote a diagram; remove it to remove canon
membership. Per-spec `page.canon` flags do not enroll a document. For example:

```json
{
  "version": 1,
  "diagrams": [
    {"folder": "diagrams/doorbell", "owner": "group:default/home-team"}
  ]
}
```

Each folder contains `<folder-name>.spec.json` and `<folder-name>.html`. The
folder name supplies the stable ID. Use the actual owning team's entity reference.
Both files must exist. See the [folder conventions](../diagrams/README.md).
The provider derives compatibility `page.canon` metadata in memory, preserving
the authored JSON and its evidence. The central entry controls ID, owner and
canonical status even when the source spec carries older metadata.

Review membership and content changes through the normal repository process.
Both standard builds generate a lightweight `workbench/diagrams.json` index:

```sh
python3 tools/build.py
docker build -f deploy/workbench/Dockerfile -t flowview-workbench .
```

The Python build validates against its freshly generated runtime. Docker's Node
build stage reads root `canon.json` and its listed folders; nginx receives the
resulting index beside `flowspec.html` and serves the original `diagrams/` files. The final image needs no Node process,
API, browser GitHub token or live Backstage connection. The read-only library,
direct links, Back/Forward and explicit **Edit in Workbench** behavior are unchanged.

`diagrams.json` is a generated, gitignored index, not another hand-maintained
membership file. Its version 2 entries contain `id`, `title`, `canon` membership,
`counts` (nodes, steps, panels), and a relative `specUrl`. They contain no diagram
rows, steps, panels, or embedded specs. For example:

```json
{
  "version": 2,
  "diagrams": [{
    "id": "doorbell",
    "title": "Doorbell delivery",
    "canon": {"version": 1, "id": "doorbell", "kind": "canonical", "owner": "group:default/home-team"},
    "counts": {"nodes": 12, "steps": 8, "panels": 3},
    "specUrl": "../diagrams/doorbell/doorbell.spec.json"
  }]
}
```

The browser loads the index for library cards, then fetches only the selected
spec for reading or editing. Membership from the index is applied in memory,
just as in the Backstage provider; the source file remains unchanged. Existing
version 1 embedded libraries remain readable, including the offline demo.

An empty `canon.json` list creates a valid empty index.
Missing files, malformed metadata, duplicate folders, invalid specs, escaping
paths, a spec over 30 MB, or an index over 30 MB fail publication and preserve the prior index.
Output cannot overwrite the source manifest or anything under `diagrams/`.

Run the publisher directly from the repository root:

```sh
node tools/canon/library.mjs --out workbench/diagrams.json
```

Spec URLs are relative to the output index's directory. Generate the index at
its final location relative to the served source tree, and deploy both the index
and the referenced files together. The supplied nginx Dockerfile does this.
For a custom deployment, copying only `flowspec.html` and `diagrams.json` is
insufficient; retain the referenced spec paths too.

No arguments defaults to root `canon.json`. `--registry canon.json` selects an
explicit central file for a different checkout. Explicit legacy `--registry`
and `--diagrams` modes remain for older integrations and rehearsals; neither
is used by the standard builds. Merely setting `page.canon` under `docs/diagrams/`
no longer publishes it. Existing files are left in place for manual migration.

Backstage's company adapter reads the same manifest and listed specs at one
approved Git revision. The `/backend` package exports `parseCanonManifest` and
`materializeCanonSpec`, sharing the publisher's rules without assuming a filesystem
or fetching from GitHub. Apply per-viewer authorization before building the entity
index. See the [Backstage guide](../apps/backstage/README.md#central-canon-membership).

The browser fetches `diagrams.json` on first library entry with `cache: no-cache`,
and fetches a spec on first open with the same cache policy. Both routes are
revalidated by nginx. A loaded spec is reused for Back/Forward navigation in that
page session. Reload after deployment to receive the latest index and content;
Retry re-fetches both after a failed read. Each index/spec response is limited to
30 MB. Spec URLs must be relative, resolve to the same origin, and cannot redirect.
Missing or invalid selected specs show an error without changing the user's draft.
The local agent-session helper also serves the specs named by its published index.

A missing `diagrams.json` (HTTP 404) uses the explicitly labeled bundled
**fictional example**. Downloaded `file:` workbenches use that example too.
A valid empty snapshot shows an empty company library. Invalid data or other
HTTP errors show an error and Retry, never a silent fallback to example data.
Metadata is displayed as text; the viewer applies its normal spec validation
and safe-link rules.

The index and referenced specs together publish full diagram content and evidence
links. Publish only specs intended for everyone who can access that static deployment; its host
provides access control. Read-only describes the browsing UI, not a security
boundary against someone who can download the files. The static library does
not replace the Backstage plugin's own source/authorization integration.

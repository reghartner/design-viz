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

Each folder contains the required `<folder-name>.spec.json`; the folder name
supplies the stable ID. Use the actual owning team's entity reference. A matching
HTML export is optional because the library loads and renders the JSON spec. See
the [folder conventions](../diagrams/README.md).
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
resulting index beside `flowspec.html` and serves authored JSON from `diagrams/`.
Full-batch topology resolution is validation-only, in memory; no flattened files
are written. The final image needs no Node process,
API, browser GitHub token or live Backstage connection. The read-only library,
direct links, Back/Forward and explicit **Edit in Workbench** behavior are unchanged.

`diagrams.json` is generated and gitignored, not another hand-maintained
membership file. Its version 3 entries contain `id`, `title`, `canon` membership,
`counts` (resolved nodes, steps, panels), a relative authored `specUrl`, and a
`revision` SHA256 of the membership-adjusted authored JSON. They contain no diagram
rows, steps, panels, or embedded specs. For example:

```json
{
  "version": 3,
  "diagrams": [{
    "id": "doorbell",
    "title": "Doorbell delivery",
    "canon": {"version": 1, "id": "doorbell", "kind": "canonical", "owner": "group:default/home-team"},
    "counts": {"nodes": 12, "steps": 8, "panels": 3},
    "specUrl": "../diagrams/doorbell/doorbell.spec.json",
    "revision": "<64-character-source-sha256>"
  }]
}
```

The browser loads the index for library cards, then fetches only the selected
authored spec and its provider closure for reading or editing. It verifies source
revisions and resolves [shared topology](shared-topology.md) in memory. Edit in
Workbench keeps authored imports in the source, saves and recovery; only preview
uses the derived value. The dependency closure stays frozen until reload/reopen,
with absolutely no live provider updates. Existing version 1 embedded libraries
and legacy version 2 snapshot URLs remain readable, including the offline demo.

An empty `canon.json` list creates a valid empty index.
Missing files, malformed metadata, duplicate folders, invalid specs, escaping
paths, incompatible topology imports, a source/materialized spec over 30 MB, or
an index over 30 MB fail publication and preserve the prior index. Only the index
is written, atomically after validation; authored sources are never overwritten.
Output cannot overwrite the source manifest or anything under `diagrams/`.

Run the publisher directly from the repository root:

```sh
node tools/canon/library.mjs --out workbench/diagrams.json
```

Spec URLs are relative to the output index's directory. Generate the index at
its final served location, and deploy the index and authored source tree together.
The supplied nginx Dockerfiles do this. A mixed index/source deployment fails
revision checks before replacing a draft; reload after the deployment completes.
For a custom deployment, copying only `flowspec.html` and `diagrams.json` is
insufficient; retain the referenced spec paths too.

No arguments defaults to root `canon.json`. `--registry canon.json` selects an
explicit central file for a different checkout. Explicit legacy `--registry`
and `--diagrams` modes remain for older integrations and rehearsals; neither
is used by the standard builds. Merely setting `page.canon` under `docs/diagrams/`
no longer publishes it. Existing files are left in place for manual migration.

Backstage's company adapter reads the same manifest and listed specs at one
approved Git revision. The `/backend` package exports `parseCanonManifest`,
`materializeCanonSpec` and `prepareCanonSnapshot`, sharing resolution rules without
assuming a filesystem or fetching from GitHub. The snapshot adapter authorizes
consumers and every provider dependency before exposing index, viewer or workspace
values. See the [Backstage guide](../apps/backstage/README.md#central-canon-membership).

The browser fetches `diagrams.json` on library/reader entry with `cache: no-cache`,
and fetches the required sources on open with the same cache policy. Both routes
are revalidated by nginx. An open viewer/editor holds its frozen source closure;
Back/Forward reopening, explicit reopen or reload can obtain a new deployment.
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

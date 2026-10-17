# Browse canon diagrams in the workbench

Choose **Browse diagrams** on the welcome page. The visual grid introduces each
story with a static image of its authored opening view,
its title, authored explanation, team, and topics. Switch to **List** for compact
scanning. Diagram titles and previews are ordinary links, including Open in new
tab. Each opens a **read-only** viewer. Readers can walk the steps, select an alternate, switch views, drill
into detail, and follow service/code links without opening the editor. Browser
Back and Forward navigate between the library, reader, and workbench; reloading
a reader restores its selected diagram from the published index and its selected spec.
Returning from a reader keeps the search, filters, and Grid/List choice for the
current page session.

Cards with Backstage-tagged nodes show **Services:** and one row of service
chips in both Grid and List. Services are ranked by connected-edge count, highest
first; ties use the label, then the full catalog reference. A right fade appears
only when the complete list does not fit. Hover over the row or focus its
**Services:** button to reveal every service; Escape dismisses the list. Clicking
any chip sets the Service filter to that exact Backstage identity, preserving the
other filters. Equal service labels include their catalog references to distinguish
them. Nodes without a `binding.entityRef` never appear in this row; their titles
remain keyword-searchable. The Service menu uses exact catalog identities when
service summaries are available; older indexes retain node-title filters. A
legacy title option that duplicates a catalog label is marked **(node title)**.

**Recently viewed** keeps the last six successful published reads in this browser,
scoped to the site's library URL. It deduplicates visits, removes diagrams no
longer published, and follows the same active filters as the collection. Failed
reads and the bundled fictional demo do not enter history. **Clear history**
removes the local list; nothing is sent to a server. With browser storage blocked,
the list lasts only for the current page session.

**Edit in Workbench** opens a local editable copy at the chapter, view, playback
mode, path, and step currently shown in the reader through the normal import
transaction, with a fresh Undo/Redo history. Browser Back returns to the same reader position.
If a published update removes that position, the reader and copy use the
document's authored opening state. The previous project is kept in
**Earlier drafts**. Browsing alone never
replaces a current project, draft, or its history. Returning to a reader displays
the published version, not unsaved editor changes. Use **Continue** on welcome
or **Back to project** in the header to return to the current local project.

Editing does not write to GitHub or approve a canonical change. Export the project (JSON, HTML, ledger and README) and
submit changes through the company's repository review process. The separate
legacy `?canon=…` review adapter continues to open its explicit editor workflow.

## Link directly to a diagram

Every published diagram has a read-only URL using its stable folder-derived ID:

```text
https://your-diagrams-site/workbench/flowspec.html?diagram=doorbell
```

Open **Browse diagrams → a diagram → Copy link**. The library cards are also
normal links: right-click to copy one or open it in a new tab. Adjust the path
above if your deployment gives the workbench a different address. These links
work before Backstage is integrated, using the static site's published
`diagrams.json` index and the referenced JSON spec files. They open directly in fresh tabs, survive reloads, and support
browser Back/Forward. Reading never replaces a saved local draft.

The leaf folder name supplies the ID. Namespace folders do not appear in public
IDs, so every leaf ID must be unique across the manifest. Keep it stable after publishing links. The link
opens the latest published version; renaming the folder or removing its canon
entry makes an old link unavailable.
An unknown ID (or any value that is not a published ID) returns to the home page
with a message naming it. A missing published snapshot shows an error with Retry.

The toolbar **Copy link** shares the document at its authored opening state.
The chain-link controls beside tabs, chapters, steps, and contract cards keep
the same `?diagram=…` document route and add the current composed reader state;
those links open directly at that target and survive reloads. A chapter link in
the hosted reader is a normal chapter target. Use a hosted standalone export
when you specifically need its chrome-free `#embed=…` mode.
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
    {"folder": "diagrams/home/doorbell", "owner": "group:default/home-team"}
  ]
}
```

Every path segment below `diagrams/` must be kebab-case. Each leaf folder
contains the required `<leaf-name>.spec.json`; the leaf name supplies the stable
ID and must be globally unique even when diagrams use different namespaces. Use
the actual owning team's entity reference. A matching HTML export is optional
because the library loads and renders the JSON spec. See
the [folder conventions](../diagrams/README.md).
The provider derives compatibility `page.canon` metadata in memory, preserving
the authored JSON and its evidence. The central entry controls ID, owner and
canonical status even when the source spec carries older metadata.

Review membership and content changes through the normal repository process.
The lightweight Python build generates `workbench/diagrams.json` without installing a browser. Production Docker and CI artifact publication also generate static screenshots:

```sh
python3 tools/build.py
docker build -f deploy/workbench/Dockerfile -t flowview-workbench .
```

The Python build validates against its freshly generated runtime. Docker's build-only Node/Chromium
stage reads root `canon.json` and its listed folders; nginx receives the
resulting index beside `flowspec.html` and serves authored JSON from `diagrams/`.
Full-batch topology is resolved in memory for validation and screenshots; no
flattened source files are written. The final image needs no Node process,
API, browser GitHub token or live Backstage connection. The read-only library,
direct links, Back/Forward and explicit **Edit in Workbench** behavior are unchanged.

Service summaries are calculated from the resolved diagrams, including imported
topology. They deduplicate by `binding.entityRef`; the label uses `binding.label`,
then node title, then the reference. When repeated nodes use different labels,
the first section and lexically first node ID supply the label. Each edge counts
once for each service incident to it within its section: a self-loop or an edge
between two nodes bound to the same service counts once. Counts add across
sections. Browse uses only these compact summaries and never fetches a diagram
or provider to populate the row or filter. Older v2/v3 indexes without summaries
keep title search/filtering and show no service row; embedded v1 specs can derive
the summaries locally. Invalid optional records are ignored without preventing
browsing.

`diagrams.json` is generated and gitignored, not another hand-maintained
membership file. Its version 3 entries contain `id`, `title`, the optional
author-owned `description` and `tags` (copied from the spec's `page.description`
and `page.tags` when present), `canon` membership,
`counts` (resolved nodes, steps, panels), `services` (the distinct resolved node
titles, used by **Search diagrams**), optional `boundServices` records
(`entityRef`, `label`, `edgeCount`), a relative authored `specUrl`, and a
`revision` SHA256 of the membership-adjusted authored JSON. They contain no authored diagram
rows, steps, panel state, or embedded specs. An optional `preview` contains only
a same-origin PNG path, source revision and fixed image dimensions. For example:

```json
{
  "version": 3,
  "diagrams": [{
    "id": "doorbell",
    "title": "Doorbell delivery",
    "description": "How a doorbell press reaches the homeowner's phone",
    "tags": ["doorbell", "notifications"],
    "canon": {"version": 1, "id": "doorbell", "kind": "canonical", "owner": "group:default/home-team"},
    "counts": {"nodes": 12, "steps": 8, "panels": 3},
    "services": ["Doorbell", "Event gateway", "Clip store"],
    "specUrl": "../diagrams/home/doorbell/doorbell.spec.json",
    "revision": "<64-character-source-sha256>"
  }]
}
```

**Search diagrams** filters the cards as you type, case-insensitively, by title,
ID, description, tags, owner and `services`; it never fetches specs. Cards show the
description under the title and each tag as a keyboard-operable topic filter.
**Team**, **Service**, and **Topic** selections combine with search; the count
shows matching diagrams out of the full collection. Remove an active-filter chip
or choose **Clear all** to reset. Team names are humanized for display, with
non-default namespaces shown; hover for the raw owner identity, which remains
searchable. Grid and List use the same ordering and results. Indexes without
`services`, `description` or `tags` still load and filter on the other fields.
Authors set description and tags in **Inspect → Document settings**; they live in
the spec, not in `canon.json`, which still controls only membership, ID and owner.
Generate images after the normal build with the locked browser tooling:

```sh
npm ci --prefix tools/browser-tests
(cd tools/browser-tests && npx playwright install --with-deps chromium)
node tools/canon/library.mjs --registry canon.json --out workbench/diagrams.json --thumbnails
```

The optional `--thumbnails` stage uses the production renderer, styles, fonts and
company panels in pinned Chromium. It captures the first diagram section within
the authored opening View, skipping introductory prose and inactive tabs; a
prose-only opening View is captured as prose. The default layout, initial path,
step and panel visibility are preserved. Playback and motion are frozen. The
selected visual composition (without reader toolbars or introductory prose) is
fitted into a 960 × 600 PNG (at most 750 KB); sections
larger than 2400 × 6000 fail clearly rather than publishing a cropped image.
Capture is limited to 30 seconds per document, 100 sections, and at most 1,000
nodes / 3,000 edges per section.
Panels-only stories show their actual panels. Sources are never rewritten.

Capture allows embedded data and local PNG/JPEG/WebP/SVG files beneath the source
registry directory (or `--diagrams` directory), resolved relative to each source
file. Symlinks escaping that root, remote resources and non-image requests are
blocked. Unsupported or failed resources fail publication. Keep images local.
The publisher stages all images under `workbench/library-thumbnails/`, installs
a content-addressed immutable batch, then atomically replaces the index. Failure
leaves the previous index/assets usable. Old batches can be removed after readers
using older indexes have expired; do not delete them during rolling publication.
Only static assets reach nginx; Chromium and npm dependencies remain in the build
stage. CI's downloadable site artifact includes this thumbnail directory.

`preview.version: 1` contains `url`, matching authored `revision`, `width: 960`,
and `height: 600`. Browse accepts only the publisher's relative content-addressed
PNG paths, loads images lazily, and never fetches specs for cards or filters.
Missing/malformed metadata and failed images show **Preview unavailable** in the
same reserved card area. Older v1/v2/v3 indexes remain readable. The lightweight
Python build omits thumbnails and remains suitable for unit tests and runtime
regeneration; production publication must invoke the explicit image stage.

The browser loads the index for library cards, then fetches only the selected
authored spec and its provider closure for reading or editing. It verifies source
revisions and resolves [shared topology](shared-topology.md) in memory. Edit in
Workbench keeps authored imports in the source, saves and recovery; only preview
uses the derived value. The dependency closure stays frozen until reload/reopen,
with absolutely no live provider updates. In the editor, **Add to diagram →
Referenced topology** can explicitly acquire a new provider closure from that
same frozen v3 index, with revision verification; it cannot refresh existing
providers. Selection is bounded by named exports and may narrow their nodes and
edges. Only the authored import is inserted; recovery retains the extended frozen
context. Offline/legacy sessions without a v3 catalog cannot browse providers.
See [shared topology authoring](shared-topology.md#authoring-in-workbench).
Existing version 1 embedded libraries
and legacy version 2 snapshot URLs remain readable, including the offline demo.

An empty `canon.json` list creates a valid empty index.
Missing files, malformed metadata, duplicate folders, invalid specs, escaping
paths, incompatible topology imports, a source or in-memory resolved spec over 30 MB, or
an index over 30 MB fail publication and preserve the prior index. Lightweight
publication writes only the index; `--thumbnails` also writes generated images.
The index is replaced atomically after validation and capture; authored sources
are never overwritten.
Output cannot overwrite the source manifest or anything under `diagrams/`.

Run lightweight metadata publication directly from the repository root (add
`--thumbnails` for production image publication):

```sh
node tools/canon/library.mjs --out workbench/diagrams.json
```

Spec URLs are relative to the output index's directory. Generate the index at
its final served location, and deploy the index and authored source tree together.
The supplied nginx Dockerfiles recursively copy and serve the complete
`diagrams/` tree, including namespace folders. A mixed index/source deployment fails
revision checks before replacing a draft; reload after the deployment completes.
For a custom deployment, copying only `flowspec.html` and `diagrams.json` is
insufficient; retain the referenced spec paths and `library-thumbnails/` directory
too. The source-based Dockerfile is the production image path; the runtime-only
`Dockerfile.prebuilt` rehearsal still regenerates a metadata-only index.

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

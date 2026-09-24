# Browse canon diagrams in the workbench

Choose **Canon diagrams** on the welcome page. Each card opens a **read-only**
viewer. Readers can walk the steps, select an alternate, switch views, drill
into detail, and follow service/code links without opening the editor. Browser
Back and Forward navigate between the library, reader, and workbench; reloading
a reader restores its selected diagram from the published snapshot.

**Edit in Workbench** opens a local editable copy through the normal import
transaction. A single Undo restores the previous project. Browsing alone never
replaces a current project, draft, or its history. Returning to a reader displays
the published version, not unsaved editor changes. The reader uses local browser
history; use a hosted standalone export when you need shareable step/embed links. Use **Continue** on welcome
or **Back to project** in the header to return to the current local project.

Editing does not write to GitHub or approve a canonical change. Save JSON and
submit changes through the company's repository review process. The separate
legacy `?canon=…` review adapter continues to open its explicit editor workflow.

## Ship a static company library

Publish the same reviewed registry used for associations and drift scans:

```sh
node tools/canon/library.mjs --registry registry.json --out workbench/diagrams.json
```

The registry uses the existing version-1 `{diagrams:[{id,path,title}]}` shape.
Paths resolve relative to the registry. Each spec must validate and its
`page.canon.id` must match the registry ID. The publisher validates the complete
set before writing, preserves the spec and code-reference revisions, and writes
its output atomically. It does not change or promote any source spec.

Deploy `diagrams.json` beside `flowspec.html`. The existing
`deploy/workbench/Dockerfile` copies the entire workbench folder, so the snapshot
travels in that nginx image. Regenerate it as part of the repository's reviewed
build/release process whenever approved specs change. No API, browser GitHub
token, or live call to Backstage is needed for browsing.

The snapshot is a JSON object, not the service catalog or the registry itself:

```json
{
  "version": 1,
  "diagrams": [
    {
      "id": "doorbell",
      "title": "Doorbell recording",
      "spec": {
        "page": {
          "title": "Doorbell recording",
          "canon": {"version": 1, "id": "doorbell", "kind": "canonical"},
          "blocks": []
        }
      }
    }
  ]
}
```

Use the publisher to include the real complete specs rather than constructing
this snapshot manually. The browser loads it on first library entry with
`cache: no-cache`; reload the page to receive a newly deployed snapshot. The
publisher and reader limit the snapshot to 30 MB.

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

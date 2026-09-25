# Diagrams

This is the home for maintained diagrams. Keep each diagram in its own
descriptively named, kebab-case folder, with its authored JSON and generated HTML
side by side:

```text
diagrams/
  service-checkout/
    service-checkout.spec.json
    service-checkout.html
    manifest.json
    service-checkout.ledger.md  # optional source/coverage notes
    assets/                    # optional supporting files
```

One folder represents one diagram page; that page can contain multiple related
sections or views. The JSON spec is the source of truth. Edit it and regenerate
the HTML, keeping both in version control. `manifest.json` is maintained by the
build command. Demos and test fixtures belong in `examples/`.

From the repository root, build a diagram beside its source:

```sh
python3 tools/page_build.py diagrams/service-checkout/service-checkout.spec.json
```

Replace `service-checkout` with the actual folder and spec name. The command
validates the spec, writes the adjacent HTML, and updates the folder's manifest.
Fix validation findings before publishing. When renderer sources have changed,
first run `python3 tools/build.py` to refresh the template.

## Moving an existing diagram

Move its JSON, HTML, manifest, ledger and assets together into one folder here.
Update references to its previous path, including documentation links, tests,
workbench starter entries in `tools/build.py`, and any registry entry. Check
relative links inside the spec and supporting files. Rebuild the workbench when
starter entries change, and regenerate the diagram HTML when its spec changes.

Existing diagrams have not been moved as part of creating this directory.

## Promoting a diagram to canon

The root [`canon.json`](../canon.json) is the single authority for canon.
Add a folder to its `diagrams` array to promote it; remove that entry to remove
it from canon. Backstage and the nginx-hosted workbench use this same file.
A folder's presence under `diagrams/`, or a `page.canon.kind` flag in its JSON,
does not enroll it.

For example, after creating the files above:

```json
{
  "version": 1,
  "diagrams": [
    {
      "folder": "diagrams/service-checkout",
      "owner": "group:default/checkout-team"
    }
  ]
}
```

Use the actual owning entity reference. Each entry references one immediate
subfolder of `diagrams/`. The folder name supplies the stable diagram ID and
filenames: `<folder-name>.spec.json` and `<folder-name>.html`. Both files must
exist. Keep IDs stable once diagrams have links or reviewed evidence.

Review changes to `canon.json` alongside the diagram's story and evidence.
The JSON spec remains the source of diagram content; `canon.json` owns membership
and ownership. Providers derive `page.canon` compatibility metadata at read time,
so authors do not have to stamp a second approval flag into every spec.
Node service/API bindings and reviewed code references remain in the spec.
The per-folder build `manifest.json` is unrelated to canon membership.

The central list starts empty while existing diagrams are moved manually.
The nginx image bundles `canon.json` and `diagrams/`; rebuild/redeploy after
changing them. Its existing canon library opens a selected diagram read-only; **Edit in
Workbench** explicitly imports a local editable copy. Saving a draft does not
publish it or change membership. Backstage's GitHub adapter uses the `/backend`
package's `parseCanonManifest` and `materializeCanonSpec` helpers at one approved
revision. Checkout-based adapters can use `loadCanonDiagrams` from
`tools/canon/library.mjs` with per-viewer authorization. See the [Backstage integration guide](../apps/backstage/README.md).

For drift scans, use `--registry canon.json` or set `FLOWVIEW_REGISTRY=canon.json`.
Legacy `examples/canon/*registry.json` files remain isolated rehearsal fixtures;
they do not add anything to the shared canon.

See the [canonical flow guide](../docs/canon.md) for evidence and drift workflows,
and the [GitHub automation setup](../docs/github-drift-automation.md) for scans.

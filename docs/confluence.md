# Confluence viewer and manual handoff

Edit diagrams in the existing Flowview workbench or with the HLD-to-page skill.
Confluence hosts the interactive renderer and a small import form. It does not
contain the diagram editor. No workbench action connects to or publishes to
Confluence.

## Export or copy

In the workbench's file actions, choose:

- **Export for Confluence**: download `<title>.confluence.json`.
- **Copy JSON for Confluence**: put the same JSON on the clipboard. A selectable
  text field remains available when the Clipboard API is unavailable, including
  some phone browsers and LAN HTTP connections.

Both validate the current editor text, including edits not yet rendered. They
produce compact, ordinary Flowview spec JSON, preserving all authored fields,
paths, panels and trace data. They do not produce HTML, ADF, or Confluence wiki
markup. These files can also be reopened with the normal workbench **open…**.
They do not mark the workbench's source as saved or change its undo history.

For agents, from the repository root:

```sh
node tools/confluence-export.js my.spec.json -o my.confluence.json
```

Omit `-o` to write the identical JSON to stdout. Invalid inputs leave an existing
output file untouched. Exports do not sanitize or redact narrative/trace content;
review that content before sharing it, just as for a standalone page.

## Import in Confluence

After the company installs the Forge app:

1. Insert **Flowview** with Confluence's `/` macro menu.
2. Choose the exported file, or paste the copied JSON.
3. Preview. Optionally select one section, a starting Home/Data flow view, or a skin.
4. Save the snapshot, then publish the Confluence page.

Readers can use playback, alternate paths, Home/Data switching, board sizing and
the panels. Playback starts paused unless the imported diagram explicitly sets
`autoplay: true`. Play / Pause labels and the adjacent status show whether steps
are advancing; the import configuration preview always starts paused.
The snapshot is stored in the macro's
configuration, rather than fetched from a workstation, remote URL or mutable
attachment. Importing a replacement is explicit. Cancel does not submit changes.

The snapshot limit is **128 KiB of compact UTF-8 JSON**. This is this app's
supported bound, not a claim about Forge's maximum configuration size. Raw input
is capped at 2 MiB before parsing. Oversized data is rejected rather than
truncated; split large stories externally. The integration agent must verify
actual save limits on the company's site before rollout.

The original spec is retained even when the macro displays one section or uses
a presentation override. The selection applies only to rendering. A full-spec
export therefore includes any sections hidden by that selection.

## Build and verification

The app is in [`apps/confluence`](../apps/confluence). Its build reads the same
`src/validator.js`, `src/engine.js`, and `src/confluence.js` used by this repository;
there is no copied renderer fork. Runtime files and the primary fonts are bundled
under one Forge Custom UI resource. Other skin-specific fonts use their existing
fallbacks. The app has no remote endpoints, API scopes, app storage, external font
requests, analytics, or direct Honeycomb connection.

```sh
cd apps/confluence
npm ci
npm run verify
npm run preview:build
```

Use Node 24 for the Forge toolchain. Serve the repository with the existing local
server, or run `python3 -m http.server 8765 --directory ../..` from the app folder.
Open `/apps/confluence/preview/index.html?configure=1` for local import/preview.
The yellow banner identifies the simulated Confluence bridge. Saving there only
writes a local preview snapshot and navigates to its read-only view.

`static/viewer` is the production build; `preview` is a separate local test build.
Both are generated and ignored by git. The manifest points only to the production
resource. Do not deploy the preview folder.

Local verification covers the shared exporter, renderer, import/save/cancel
behavior through a simulated bridge, and the manifest against Atlassian's schema.
It is not evidence of a successful Confluence installation. Registration, real
bridge behavior, site permissions, page history and copy behavior must be verified
inside the company. Follow the [integration handoff](confluence-integration.md).

## Current boundaries

- Ordinary source links open through Forge's router. Absolute HTTP(S) URLs and
  `/wiki/` links are supported; repository-relative file links are disabled.
- Standalone deep-link copy buttons are hidden in this host because their iframe
  URLs would not be useful Confluence page links.
- The Home map uses a pixel height cap in this host to avoid feedback between
  content auto-sizing and iframe-relative viewport units.
- PDF/Word export and native Confluence mobile-app support are not implemented.
  Test mobile web in the target site; use the standalone viewer when needed.
- A snapshot freezes its JSON, not the renderer software. New app deployments
  can improve how older snapshots render; preserve schema compatibility.

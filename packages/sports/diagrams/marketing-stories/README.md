# Islanders marketing stories

These are authored Flowview examples, not product features or live integrations.
Document authoring is desktop-only; phone frames depict the fan experience.

The active Canon document is now `islanders-marketing`, with one native tab per
story. The three standalone Canon entries are retired, not deleted. Edit the
combined document for review; reconcile later user exports before rebuilding it.

Each sibling story folder owns:

- story.source.json: narrative, nodes, edge meaning and native paths.
- screens.source.html: focused fan and marketer mockups.
- layout.source.json: production-arranged geometry followed by scoped manual layout refinement.
- Ledger and visibility files: source evidence and assertions. Retired standalone
  specs live only in `diagrams/friends/<story>/` to avoid duplicating embedded
  media in the offline authoring kit; the combined spec is the active example.

This folder owns shared screen styling and capture/readback helpers. Official imagery
comes from group-night/assets and member-campaign/assets; logo from sports/assets.
Provenance and limits are in the ledgers and asset provenance files.

From the repository root:

    python3 tools/build.py
    node packages/sports/diagrams/marketing-stories/build-preview.mjs
    node packages/sports/diagrams/marketing-stories/check-preview.mjs
    node packages/sports/diagrams/islanders-marketing/build-document.mjs
    node tools/canon/library.mjs --registry canon.json --out workbench/diagrams.json --thumbnails
    node packages/sports/diagrams/marketing-stories/check-canon.mjs

The builder accepts group-night or fan-event-rsvp to rebuild one story. It captures
local HTML only, checks image decoding/overflow/size limits, regenerates native specs,
and mirrors spec/ledger pairs into the already-authorized local Canon folders.
No campaign, payment, sponsor transfer, remote deployment or browser UI is launched.
If layout.source.json exists, it is preserved. Initial new topology is composed with
the production page arranger; later geometry edits should be explicit and reviewed.
The ignored .local folders contain desktop QA captures and standalone viewing previews.
Rendered images are selected by native steps and paths; they are not live forms.

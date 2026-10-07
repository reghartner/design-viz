# Flowview, shown in Flowview

An interactive product walkthrough for a live demo. Open
[flowview-product-tour.html](flowview-product-tour.html) to present it, or load
[flowview-product-tour.spec.json](flowview-product-tour.spec.json) in the
Workbench to show how the same story is authored. The HTML is a portable reader
export made from the spec on the current mainline.

Use the six tabs in order. Advance the story steps in each tab, then click the
arrow-shaped **Next** card to hand off to the following tab. The **Views** tab
also has two Chapters: switch between **Standard story** and **Explore canvas**
to demonstrate the actual viewing modes on one shared diagram. In **Review**,
switch between **Approve** and **Needs work** to show the correction loop.
The other tabs open in **Tour canvas**, an Explore Chapter that keeps the full
auto-arranged graph, supporting panel, and step controls in view.
On a fresh browser, dismiss Flowview's built-in first-visit walkthrough with
**Skip** before presenting. **PRESENT** gives the diagram more room.

The **Claude Code · separate window** log panel is an illustrative transcript,
not a live agent session. For a live authoring demo, open the spec in the
Workbench, choose **Agent → New Connection**, and select this folder. The
matching [coverage ledger](flowview-product-tour.ledger.md) lets Claude work
from the same reviewed pair. Use **Copy & paste** to keep the real conversation
in Claude Code while Flowview handles preview and **Commit update**. Any live
update should be reviewed before acceptance.

The story describes the product workflow rather than claiming measured latency
or model quality. Pilot capture is optional and off by default; dollar cost is
collected separately.

To regenerate the portable HTML after editing the spec:

```sh
python3 tools/build.py
python3 tools/inject.py examples/flowview-product-tour/flowview-product-tour.spec.json template/flowview.html examples/flowview-product-tour/flowview-product-tour.html
```

Validate the edited spec with:

```sh
node tools/validate.js examples/flowview-product-tour/flowview-product-tour.spec.json
```

The six node layouts were produced with the production
`tools/auto-arrange-spec.cjs --all` command from an unpositioned draft. If you
change topology, run that tool with distinct input and output paths, then
review the result before regenerating HTML.

Five embedded **On screen** image panels show the real Flowview interface:
conversation mode on **Start**, folder selection on **Claude**, the update
preview on **Review**, and the two reader modes on **Views**. They are stored as
PNG data URLs inside the spec, so the exported HTML works without an asset server.
Original captures are in [screenshots](screenshots/). The Claude conversation
contains only illustrative conversational lines; file-status lines were removed.

Screenshot provenance (2026-10-07): Chromium/Playwright captured this checkout’s
built `workbench/flowspec.html` and portable reader. Setup images are focused
crops of the actual connection dialog. The review image uses the production
review dialog and renderer with a seeded checkout proposal (payment declined →
keep cart/retry); it is a UI demonstration, not evidence of an agent run. No
approval was committed. Reader captures show the tour before adding the image
panels, avoiding screenshots nested inside themselves. Source images are static
references; use the live Chapter controls to demonstrate interaction.

In Explore, screenshot panels lead the right column at 37% of the viewport;
conversation/check/summary panels follow them. Start, Claude, and Review keep
Section notes closed initially because their step captions carry the narration.
The review capture uses the actual responsive dialog at 700 × 570 so its
Current/Proposed and Commit/Discard controls remain readable at presentation size.
For automated visual checks, await each visible image’s `decode()` before capture.

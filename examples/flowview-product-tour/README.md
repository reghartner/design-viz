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

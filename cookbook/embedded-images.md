# Embedded screenshots and illustrations

Use an `image` panel to show an actual interface beside its flow: for example,
Backstage's Diagrams tab beside the steps that load a reviewed spec and open its
code/API links. Keep the explanation in readable diagram labels and captions;
a thumbnail is context, not the only place important facts appear.

In the workbench, add an **image** panel, select it, and choose **Image file** in
the inspector. Upload PNG, JPEG or WebP (512 KiB max, at most 4096 × 4096 pixels),
then describe it in **alt**, add a caption and optionally an HTTP(S) reference
link. Upload, replacement and removal each use one undoable edit. A pending
upload is discarded if you change the source or selection before it finishes.
The shared image stays the same on every step and alternate path. Arrange and
resize its panel using the existing section layout controls.

For an agent, encode the file directly into a panel's `src` value; do not invent
base64 or substitute a remote image URL. A short Python example (not a full spec):

```python
import base64
from pathlib import Path
capture = Path("backstage-preview.jpg")
panel = {
    "id": "ui", "type": "image", "title": "Backstage preview",
    "src": "data:image/jpeg;base64," + base64.b64encode(capture.read_bytes()).decode("ascii"),
    "alt": "Service page with its interactive Flowview diagram and source links",
    "caption": "Actual plugin in the local fixture host; fictional service data."
}
```

Capture or use an authorized image, inspect it, record its provenance in the
ledger, and label simulated data clearly. Use a tight crop or modest JPEG quality
when taking the screenshot, so it remains useful at panel size. Images and their
alt/caption text travel in JSON, HTML, Backstage and Confluence exports without
network image loads. Remote images, SVG and executable HTML are not supported.

The existing **128 KiB whole-spec limit** still applies to manual Confluence
snapshots, including base64 (about 4/3 of the image bytes). Export reports an
oversized spec rather than dropping the image. Hosted standalone HTML and the
Backstage read API are separate paths; the latter accepts specs up to 2 MiB.
Company Forge acceptance should include checking data images under the installed
resource policy; local rendering alone is not proof of deployment.

See the complete [Backstage lifecycle spec](../docs/diagrams/backstage/backstage.spec.json)
and its [ledger](../docs/diagrams/backstage/backstage.ledger.md) for a real capture
used in a source-grounded architecture story. Run the normal build and browser
inspection loop after embedding or replacing an image.

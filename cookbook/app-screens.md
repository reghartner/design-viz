# Product screens alongside a system story

Use **App screens** for real app screens exported from Figma, or screenshots
from an existing product. The panel owns a reusable collection of images;
steps select a screen by ID. It works in the standalone page and the native
Backstage viewer without a Figma login or image requests during playback.

## Author in the workbench

1. Export the desired Figma frames as PNG or JPEG. WebP screenshots also work.
2. Choose **Add to diagram → Panel → App screens**.
3. In its inspector, use **Upload app screens** to select one or several files.
   The first import selects its first screen as the starting screen. File names
   become editable names; stable IDs remain unchanged when names are edited.
4. Expand a screen to edit its name, image description, caption or optional
   design reference link. **Replace image** keeps its ID and step selections.
5. Set **Starting screen**, **Frame** (Phone or None), and **Transition** (Cut
   or Crossfade). The first screen with recorded dimensions sets the viewport
   proportions. Other images fit inside it without cropping or stretching.
6. Select a story step. Under **Panel changes**, choose **App screen**.
   **Inherit previous screen** leaves the previous selection in place;
   **No screen** explicitly clears the display until another step selects one.

Each upload batch, replacement, removal and field edit uses one Undo entry.
Removing a screen clears its selections from all step bodies, including alternate
paths; those steps inherit instead. If it was the starting screen, the next
remaining screen becomes the start. Undo restores the images and references.
An upload that finishes after source or selection changes cannot replace newer work.

Playback recomputes the selected path from its initial state. Backward jumps
restore the earlier screen; failure screens cannot leak into the success path.
Skipped playback stops still contribute their screen changes. Crossfade runs
on forward adjacent transitions; seeks, paused settling and reduced motion
show the final screen immediately. Repeated selections keep the same image DOM.

## Storage and source

Up to 32 screens fit in one panel. Each image accepts up to 512 KiB of PNG,
JPEG or WebP, and uploads accept dimensions up to 4096 × 4096. The image bytes
are embedded once per screen, with steps referencing IDs. This first version
does not fetch Figma, remote images or SVG. Export smaller frames if needed.
The Backstage read API's existing 2 MiB spec limit still applies to the combined
base64 payload. This is independent of the smaller manual Confluence snapshot
limit; prioritize the hosted story and native Backstage experience.

Use descriptive alt text and readable step captions. Keep the original Figma
frame link on each screen when available, and record capture provenance in the
story ledger. Screen changes are authored story facts; an image does not infer
backend calls or implement the buttons pictured inside it.

The [complete example](../examples/app-screens/app-screens.spec.json) includes
Home, Connecting, Live view and Connection failed screens, a shared lead-in,
and success/failure paths. These are **fictional interface samples**, rendered
from [local HTML](../examples/app-screens/fixtures/source-screens.html), not Figma exports
or observed product behavior. Replace them with authorized product screens.

```sh
node tools/validate.js examples/app-screens/app-screens.spec.json
python3 tools/inject.py examples/app-screens/app-screens.spec.json template/flowview.html /tmp/app-screens.html
```

The authoring shape (fragment, not a complete spec) is:

```
{"id":"product","type":"appscreens","title":"Product experience",
 "screens":[{"id":"home","label":"Home","alt":"Home with the camera list",
             "src":"data:image/png;base64,...","width":390,"height":844}],
 "frame":"phone","transition":"crossfade","initial":{"screen":"home"}}

{"text":"Open Home","panels":{"product":{"screen":"home"}}}
```

Encode actual image bytes; never invent base64. For a temporary selection use
`enterOnce: {screen: "home"}` in the panel's step patch. Unknown IDs warn and
leave the carried selection intact. The effective-state inspector links valid
screen selections back to their source.

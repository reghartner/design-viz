# Homemap stories in the workbench

Start with **starters… → home story** for a visitor-at-the-door scene with an internet-outage alternate.

## Make the map the centerpiece

Click the homemap's title and choose **Presentation → Centerpiece**. This writes
`diagram.primaryPanel: "home"` (using your panel's ID). The map gets the main
space, with Ambient/Step controls above and its timeline below. Other panels
appear beside it when space permits and below on narrower screens. Expand
**Data flow** to inspect the supporting service diagram. Choose **Sidebar** to
return to the standard layout. Existing diagrams keep their current layout.

Room rectangles are optional: use the homemap panel's **rooms** table to add
labels and x/y/w/h values inside the 320×180 frame. Devices and people use that
same coordinate space at every display size. Device state text and static signal
arrows keep the map readable without motion or hover.

## Tweak one step

1. Select a numbered step, or click a device/person in the main map. The inspector
   opens **The home · at this step**, including a placement map.
2. Pick a device state. **Inherit · …** shows the value arriving from the previous
   step on this path (or initial/default state at step 1). Choosing Inherit removes
   just this step's override.
3. Drag a person in the inspector map, or choose **Place Visitor** and tap a point.
   Keyboard users can enter x and y. A movement writes one position as one undo
   action. Escape cancels placement or an in-progress drag. Use **Hidden** to remove
   a person and **Show at this position** to bring them back. **Inherit** restores
   the incoming position or hidden state.
4. Choose **Signal from** and **Signal to**, then **Add signal**. Remove it with the
   adjacent button. Signals last for this step only; device states and positions
   carry until changed.
5. Use Next/Previous or choose a path to continue editing. Manual transport keeps
   the step inspector on the selected beat. Undo restores the previous source.

Edits are sparse: changing the door does not freeze the camera or person. A step
shared by multiple paths is still one shared source entry, so editing it changes
all paths that reference it. Unique alternate steps leave the happy path intact.
The placement controls refuse to write if the source changed since the inspector
was opened; reselect the step after manual JSON changes.

Published pages keep playback and the Data flow disclosure. Editing controls are
workbench-only. The map supports all six skins, phones, exported HTML and embeds;
the primary panel is retained in print.

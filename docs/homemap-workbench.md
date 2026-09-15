# Homemap stories in the workbench

Start with **starters… → home story** for a visitor-at-the-door scene with an internet-outage alternate.

## Make the map the centerpiece

Use **Home / Data flow** above a diagram to switch its focus live. Home gives
the map the main space; Data flow gives that space to the service diagram and
places the map beside it (below on narrow screens). The timeline follows the
main view. Your selected path, step, device state, playback, and diagram sizing
stay intact. In Home view, you can also expand **Data flow** below for a quick
look at the supporting diagram.

To choose the default when a page opens, click the homemap's title in the
workbench and choose **Presentation → Centerpiece**. This writes
`diagram.primaryPanel: "home"` (using your panel's ID). **Sidebar** defaults
to Data flow. Existing homemaps automatically get the live switch; they keep
their authored opening layout. With multiple homemaps, the declared centerpiece
is preferred, otherwise the first homemap is used. An explicitly featured panel
of another type uses its title in place of Home.

Switching is a reading preference for the current page, not a spec edit or undo
entry. Workbench edits and skin changes retain it. A full page reload uses the
authored default again; changing Presentation in the inspector takes precedence
over the current reading preference.

Room rectangles are optional: use the homemap panel's **rooms** table to add
labels and x/y/w/h values inside the 320×180 frame. Devices and people use that
same coordinate space at every display size. Device states use icons, color, and
animation instead of text chips; hover a device to read its name and current state.
Static signal arrows remain visible while paused or with reduced motion.

The map's visual treatment is automatic: device icons, softly
raised room walls, camera sweeps, breathing activity halos, swinging doors, and
people with a short fading movement trail. Rooms tint to reflect their current
contents: an alert/detection takes priority over a warning, then a visible person.
These tints describe the authored scene; they do not trigger device states or
simulate sensing. A subject without an `icon` uses a person avatar.

Subject names are hidden on the map by default, including existing specs. Names
remain available on hover and in the editing controls. To show them, select the
homemap panel and set **Show subject labels → Shown** in the inspector. This writes
`showSubjectLabels: true` on the panel; **Hidden (default)** removes the override.
Device and room labels remain visible.

No schema version change is needed. Reduced motion and print show
the final state without animation. The inspector's placement map stays steady
while you edit, and the main map previews the activity.

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

You can also drag any device marker or its label in the inspector's placement
map. Camera coverage and signal endpoints follow the device while you drag.
Drag a room's border or label to move its rectangle; its contents keep their
positions. Device and room moves edit the shared layout for **all steps and
paths**, while subject moves belong to the selected step. Items stay inside the
320×180 frame. Each completed drag is one undo action; Escape or a cancelled
pointer gesture restores the original layout. For precise keyboard edits, use
the panel's **devices** and **rooms** coordinate tables.

Edits are sparse: changing the door does not freeze the camera or person. A step
shared by multiple paths is still one shared source entry, so editing it changes
all paths that reference it. Unique alternate steps leave the happy path intact.
The placement controls refuse to write if the source changed since the inspector
was opened; reselect the step after manual JSON changes.

Published pages keep playback, the live view switch, and the Data flow disclosure. Editing controls are
workbench-only. The map supports all six skins, phones, exported HTML and embeds;
the primary panel is retained in print.

# Homemap stories in the workbench

Start with **starters… → home story** for a visitor-at-the-door scene with an internet-outage alternate.
For the grounds around a house, choose **whole home & outdoors**. For a porch
and entry separated by a working door, choose **across the front door**.

## Make the map the centerpiece

Use **Home / Data flow** above a diagram to switch its focus live. Home gives
the map the main space; Data flow gives that space to the service diagram and
places the map beside it (below on narrow screens). The timeline follows the
main view. Your selected path, step, device state, playback, and diagram sizing
stay intact. In Home view, you can also expand **Data flow** below for a quick
look at the supporting diagram.

Home view keeps the map as large as its height limit allows (70% of the
viewport height; 560px in the content-sized Confluence iframe). Its width
follows the map's aspect ratio, with room for the card padding and borders.
Supporting panels fill the remaining horizontal space and arrange into columns
when there is room. Narrow pages stack them below the centered map and shrink
the map to fit. A home without supporting panels stays centered at the same
height-based size. This is automatic; no spec setting or schema update is needed.

To choose the default when a page opens, click **Edit layout** on the homemap
in the workbench and choose **Presentation → Centerpiece**. This writes
`diagram.primaryPanel: "home"` (using your panel's ID). **Sidebar** defaults
to Data flow. Existing homemaps automatically get the live switch; they keep
their authored opening layout. With multiple homemaps, the declared centerpiece
is preferred, otherwise the first homemap is used. An explicitly featured panel
of another type uses its title in place of Home.

Switching is a reading preference for the current page, not a spec edit or undo
entry. Workbench edits and skin changes retain it. A full page reload uses the
authored default again; changing Presentation in the inspector takes precedence
over the current reading preference.

## Edit the shared layout

Use **Edit layout** in the map header from either ambient or step view. The
inspector opens the homemap panel's shared settings, including the **outline**
fields **Width**, **Height**, **Left (auto)** and **Top (auto)**, the **rooms**
table, **devices**, and starting **subjects**. Outline fields use large inputs
in two columns. Press Enter, Tab, or click away to save; each edit can be undone.
**Rooms**, **Devices**, and **Subjects** start collapsed with item counts.
Expand a group to see compact named rows, then expand the element you want to
edit. New items open automatically. Open/closed choices survive field edits,
dragging and inspector reselection during the current workbench session;
they are viewing preferences and do not change the spec or create undo entries.
These settings apply to every step and path. In ambient mode, clicking a room,
device, or person also selects this layout inspector. Once it is selected, map
clicks keep that context until you select a step or **Edit home at current step**.

The step inspector also has **Edit shared home layout**, so you can move directly
between a beat's animation/state controls and the shared floor plan. Selecting
the layout does not change the chosen path, step, or view.

The **Shared layout · drag to arrange** map works without a step or timeline.
Drag a room border/label, device, door, or person to move it. Drag the **House**
grip to move the outline; square bottom-right corners resize the house and
rooms. Each completed drag is one undo action; Escape or pointer cancellation
restores the previous geometry. Rooms and the outline move independently of
their contents. Coordinate tables remain available for keyboard editing.

This map shows initial device states and starting subject positions. Subjects
that start hidden appear faded only in the layout editor, so they can still be
positioned. Moving one preserves its hidden state. If a subject has an explicit
initial position, its declaration and initial coordinates move together.
Existing per-step position overrides remain unchanged.

Room rectangles are optional: use the homemap panel's **rooms** table to add
labels and x/y/w/h values inside the 320×180 frame. Devices and people use that
same coordinate space at every display size. Device states use icons, color, and
animation instead of text chips; hover a device to read its name and current state.
Static signal arrows remain visible while paused or with reduced motion.

### Include outside and place the house

In **rooms**, set **kind → outdoor** for a yard, driveway, garden, or porch.
Outdoor rectangles use a green dashed treatment and sit beneath the house.
You can cover the whole 320×180 plot with one outdoor rectangle, then use a
smaller centered house, or place a narrow house on the right for a half-outside
view. Normal rooms use **kind → room** or leave kind blank.

**Width/Height** change the house outline only (20–320 wide, 20–180 tall).
**Left/Top** set its top-left position; leave either blank to center that axis.
The renderer keeps the house inside the frame. Rooms, devices, and subjects
keep their own coordinates when you resize or move the outline. An indoor
person or sensor does not tint the outdoor area behind the house.

### Add doors to walls

Add a **devices** row with **kind → entry** and **display → door**. Set x/y
at the hinge on an outline or room wall. **facing** points along the closed
leaf: 0 right, 90 down, 180 left, 270 up. **doorWidth** sets its length (default
24; 8–48). **doorSwing** sets its opening angle (default 90; positive clockwise,
negative counterclockwise, magnitude 15–135). For the left wall of a house,
facing 270 with swing 90 opens inward to the right.

Select a step and change the door's state to **open**, **closed**, or **alert**.
The leaf swings on open/closed transitions, and the arc shows its opening side.
Alert colors the closed door. Drag the door or label in the placement map to
move its hinge, just like another device. Leave display blank or choose
**marker** to retain the small entry icon used by existing specs. Doors and
room boundaries are visual; move visitors explicitly in their step patches.

The Home tile uses a taller display with more vertical space between items and
smaller device/room labels. Devices and people keep their original proportions.
Specs and coordinate controls still use 320×180; the renderer and drag controls
map between those coordinates and the taller view automatically. Do not rescale
existing positions or add a new schema field. The centerpiece still caps its
height relative to the viewport, with the step controls directly beneath it.

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

1. Select a numbered step, or click a device/person while in step view (unless
   the shared layout inspector is selected). The inspector
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

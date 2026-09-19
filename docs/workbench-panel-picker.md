# Choose a panel visually

Open **Insert & import → + panel** to browse the panel library. Every supported
panel type has a thumbnail drawn by the same renderer as the diagram. Search by
name or purpose, or choose a category to narrow the gallery.

Select a card to see a larger preview and a short explanation of when to use it.
The gallery scrolls independently of the selected panel. **Add panel** inserts
that selection into the section named in the footer, then opens its inspector.
Click a section in the diagram before opening the picker to change the destination.

The previews use illustrative values. The added panel starts from its existing,
simple editable template; sample notifications, measurements, or events are not
copied from the preview. Use the inspector to configure its content and the step
editor to change it over time. Previews use your diagram’s skin, including the
default Pastel skin. Thumbnails fit the complete sample; selecting a card shows
a larger version.

Selecting, searching, and changing categories do not edit the source. Cancel,
the close button, and Escape dismiss the picker and return focus to **+ panel**.
A single Undo removes the addition; Redo restores it. Keyboard focus stays inside
the dialog, and underlying editor shortcuts do not edit the diagram while it is open.

Fix invalid source or validation errors before adding a panel. Finish **ADD TO
STEP** or connection mode first. If the source, rendered diagram, or destination
changes while the picker is open, Add is disabled; close and reopen it to use the
current destination.

## Implementation and verification

Each file in `src/panels/types/` supplies its catalog entry, template and preview
example through the [panel definition](panel-modularity.md).
`src/panel-picker.workbench.js` discovers them from the registry. The builder
supplies the destination and commits through the existing `planAddPanel` /
insertion history. Examples are cloned independently of each panel's template;
`PANEL_TEMPLATES` is a compatibility view of those registered defaults.

Each preview calls `renderPanelBody` once with animation disabled and keeps a
DOM clone. Cloning drops renderer listeners and state; internal SVG IDs and their
references are remapped while external icon sprite references stay intact.
Previews are inert and CSS animations are paused. No playback controller, frame
loop, global renderer listener, or timer is created. Closing the picker removes
its preview DOM and disconnects its resize observer; filtering replaces the old
card snapshots.

`node --test tests/panel-picker.test.js tests/builder.test.js` covers catalog
completeness, valid sample configuration, sample/default isolation, destination
freshness, and insertion behavior. Browser verification should additionally cover
card geometry and scrolling, all previews, selection without source changes,
Add/Undo/Redo, focus and Escape, stale edits, edit modes, and the supported skins.

# Choose a panel visually

Open **Add to diagram → Panel** to browse the panel library. Every supported
panel type has a thumbnail drawn by the same renderer as the diagram. Search by
name or purpose, or choose a category to narrow the gallery.

Select a card to see a larger preview and a short explanation of when to use it.
The gallery scrolls independently of the selected panel. **Add panel** inserts
that selection into the section named in the footer, then opens its inspector.
Choose the **Into** section beneath **Add to diagram**, or click a section in the
preview before opening the picker to change the destination.

The previews use illustrative values. The added panel starts from its existing,
simple editable template; sample notifications, measurements, or events are not
copied from the preview. Use the inspector to configure its content and the step
editor to change it over time. Previews use your diagram’s skin, including the
default Pastel skin. Thumbnails fit the complete sample; selecting a card shows
a larger version.

Selecting, searching, and changing categories do not edit the source. Cancel,
the close button, and Escape dismiss the picker and return focus to **Add to diagram**.
A single Undo removes the addition; Redo restores it. Keyboard focus stays inside
the dialog, and underlying editor shortcuts do not edit the diagram while it is open.

Fix invalid source or validation errors before adding a panel. Finish **ADD TO
STEP** or connection mode first. If the source, rendered diagram, or destination
changes while the picker is open, Add is disabled; close and reopen it to use the
current destination.

Choose **Software & data → Data contract** for one field per row with custom
columns. Inspect provides **Add field**, **Add column**, names, ordering and
widths; use **Centerpiece** for a wide contract. **Starting state → Field
highlights** sets the opening colors. To emphasize fields at another step,
select that step, use **ADD TO STEP**, click the contract panel and finish
adding. Its **Field highlights** controls offer preset or custom colors,
optional explanatory labels, **Clear all highlights**, and **Carry forward**
or **This step only** duration. Undo restores the edit, including removed
fields and their highlights. **Data table** remains available for record
snapshots; its **Columns → Width (px)** controls stabilize column widths.

Choose **Software & data → Cost breakdown / comparison** for one operation or
up to six entries. The default shows a single operation with three component
amounts and percentage shares. Set **Workload unit** to `operation`, starting
**Workload volume** to `1` and **Cost period** to `per operation`; use zero rates
and enter each component’s amount as **Fixed cost per period**. Add or remove
**Operations / routes** and their **Components & cost lines** together.
Exactly two entries show baseline/alternative differences and break-even volume.
In Inspect, set **Display density** to **Auto**, **Compact** or **Expanded**.
Auto uses horizontal bars at panel widths up to 520 px; Compact keeps that layout
at any width. **Following route** can highlight any declared entry. Expand
**Rates, assumptions & tradeoffs** for rates and exclusions. The
[cost recipe](../cookbook/messaging-cost.md) includes the runnable single-operation
example and the **Messaging cost tradeoffs** template’s original two views.

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

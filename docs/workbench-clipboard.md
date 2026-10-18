# Copy, paste and duplicate objects

## Add a diagram to an existing canvas

Choose **Add → Add / Paste diagram** (also available in Inspect), drop a
Flowview `.json`, Mermaid `.mmd`, `.mermaid`, `.md`, `.txt`, or draw.io
`.drawio`/`.xml` file onto the active Diagram or Explore canvas, or paste an
unambiguous Flowview document, Mermaid diagram or draw.io XML outside text fields.
The preview names the destination,
offers a source section chooser when the document contains multiple diagrams,
and reports node, group, and connection counts before **Add diagram**.

This merges the graph only: nodes, groups, internal connections, and their
protocol meanings get independent IDs. Source rows/stacks and floats become a
positioned block at the drop point (or beside existing content), preserving
their relative centers. Existing nodes and locked pins do not move. Panels,
timelines, prose, and named views are not merged. The new nodes are selected;
one Undo restores the exact previous source.

Files and pasted input are limited to 2 MiB. Markdown Mermaid fences work.
Flowcharts retain directions, labels, groups, and all supported connections;
shape/style conversion warnings appear before confirmation. The
[Mermaid import subset](workbench-user-guide.md) documents supported syntax and
parser limits. Imported flowcharts add no timeline events.
draw.io pages may be compressed or plain XML. The source chooser selects one
page to add; all retained labels, groups and directed connections are previewed
with conversion warnings. Pending XML decoding disables Add and is cancelled
when input or destination changes. Its aggregate decoding cap is 8 MiB; see
the [user guide](workbench-user-guide.md) for the supported XML subset and limits.
Conditional/loop blocks that omit connections, colliding Mermaid participant
IDs, unresolved local references, shared topology, and local section/timeline
dependencies are refused with an explanation before any edit. Export a resolved
standalone graph or convert local navigation to external links first. Changing
the destination source, section, or project retires the pending preview.
Cancel, invalid input, and stale reads leave the source and history unchanged.
Native text editing, image paste/drop, object clipboard actions below, and
whole-project File import retain their own behavior.

The editor toolbar has **Copy**, **Paste into Section…**, and **Duplicate**.
Copy and Duplicate enable only when the selection supports that action. A
single story step supports Duplicate; use **Reuse steps…** to copy it elsewhere.
Paste remains available without a selection and names its destination section.
The panel inspector also keeps whole-panel actions when a Home element is
selected. Objects can be pasted into another section, another spec opened in
this editor, or another browser tab.

## Home layout elements

1. Choose **Edit layout** on the Home map.
2. Select a device, door, subject or room in the shared placement map. Use
   **Copy element** or **Duplicate element** above it. The expanded Rooms,
   Devices and Subjects items also have their own **Copy** and **Duplicate**.
3. To paste elsewhere, select the destination Home panel and choose **Paste…**.

Copies get new IDs (checked against both devices and subjects) and a small
position offset inside the 320×180 map. Door geometry, icons and custom fields
are retained. A subject's initial hidden state or position, and a device's
initial state, travel with it. Step overrides and signals involving other
devices stay with the original. Copy the whole Home panel to include its
complete layout and initial signal connections.

In shared-layout/ambient context, selecting an element in the main map also
makes it the object clipboard selection. Step context still selects the beat;
use **Edit shared home layout** to copy layout elements. The house outline
travels with a whole-panel copy.

## What gets copied

| Selection | Paste behavior |
|---|---|
| One or more nodes from one diagram | Fresh node/group IDs; retains rows, stacks, floating placement, group ancestry, bindings and source links. Includes only edges between copied nodes. |
| One or more panels from one diagram | Fresh panel IDs; includes definitions and initial state. Existing steps and the destination's authored View selection are unchanged. |
| Home device, door, subject or room | Independent element in the selected Home panel, with a small offset. Existing device/subject count limits apply. |
| Section | Complete independent section after the destination section, including nodes, panels, steps, alternates, failure paths and prose. Internal IDs remain scoped to the new diagram. |

Copied protocol definitions and section lane definitions come along. Name
conflicts receive new names, with the copied references updated. Source and
destination diagrams keep their respective meanings. The destination page's
skin applies.
Pasting into a bare-diagram spec adds a page wrapper so shared protocol and
lane definitions can be represented correctly; Undo restores the original shape.

Panel copies do not copy a frozen view of the currently highlighted step.
Copy the section to preserve its whole animation sequence, or use
[Reuse steps](workbench-step-reuse.md) to copy/share steps between paths.
Standalone edges and mixed object selections are not clipboard payloads;
select their endpoint nodes together to carry their connections.

## Keyboard and phones

- **⌘/Ctrl C** copies the selected object when focus is outside a text field.
- **⌘/Ctrl V** pastes a Flowview object into the selected section/Home panel.
- **⌘/Ctrl D** duplicates the selection. Existing single-node, section and step
  duplication behavior is retained.
- Each paste/duplicate is one **Undo** action. **Redo** restores it.
- Text inputs, JSON editing and selected prose retain native clipboard behavior.

**Paste…** initially shows the most recently copied object in this editor.
Choose **Read system clipboard** to bring in a copy from another tab, or paste
into the dialog's text box using the keyboard or the phone's Paste command.
If browser clipboard writing is unavailable, Copy shows selectable text for
manual copying. This also works on LAN HTTP pages without Clipboard API access.
The in-editor clipboard lasts until the page reloads; it is not stored in the spec.

The destination is named in the dialog. If its source changes while the dialog
is open, reopen Paste before applying. Invalid payloads/destinations make no
changes. Clipboard envelopes support up to 2 MiB of UTF-8 text. These envelopes
are editor interchange data, not a new Flowview spec/schema version.

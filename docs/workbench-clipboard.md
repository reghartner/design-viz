# Copy, paste and duplicate objects

The editor footer has **Copy**, **Paste…**, and **Duplicate** beside Undo/Redo.
The node, panel and section inspectors also expose Copy; panels now have
**Duplicate panel**. Objects can be pasted into another section, another spec
opened in this editor, or another browser tab.

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
| One or more panels from one diagram | Fresh panel IDs; includes definitions and initial state. Existing steps and the destination's centerpiece selection are unchanged. |
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

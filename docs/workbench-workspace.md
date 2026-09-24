# Workbench space and focus

For a captioned, searchable list with duplicate and reorder controls, see
[Story steps](workbench-steps.md).

Click-through previews start paused. Use **Play** to run a story; switching
tabs, selecting an element, or focusing the inspector or JSON source pauses
playback. Selecting the already displayed step also pauses it. Pausing does
not replace panel contents or disturb a focused control.

Render, skin changes and inspector edits dispose the previous playback before
building a paused preview. The current view and beat follow a uniquely matched
section across property edits, Undo/Redo, and skin/host preview changes. Steps
match by a unique `id`, or by their complete unchanged content when they have no
ID. Removed or ambiguous matches keep the rendered default; changing the authored
playback mode resets playback. New projects start at their authored defaults.
Selected-step edits use
the builder's existing selection tracking. No playback state enters the JSON,
undo history or saved layout. Standalone published pages retain autoplay.

Reordering rows, inspector edits, Render and Undo/Redo keep the page's current
scroll position while the preview rebuilds. In Focus workspace, the preview's
own scroll position is retained instead. If an edit shortens the document past
that position, scrolling stops at the new bottom. Opening or importing a different
project keeps its normal navigation behavior.

A failed JSON/validation render leaves the previous preview visible while you
repair the source. A renderer failure after replacement begins instead reports
an error and retires that unusable preview; accepted source and Undo history
remain available. The Steps Path selector can inspect an alternate even when the
current named view hides every step on that route. Editing and rerendering keep
that exact authored step without changing the view's selected subset.

Prose and step-text fields support backticks for inline code and triple-backtick
fences for multiline code blocks. Enter real newlines in the text field; JSON
source uses `\n`. Code remains literal, preserves indentation, and scrolls within
its block. Node/edge labels and panel values remain plain text. See
[prose markup](../contract/authoring-contract.md#section-object) for syntax and examples.

Use **File → Workspace preferences → Focus workspace** to hide the introduction and
reference material. On a desktop, the preview scrolls beside a viewport-sized
editor. **Exit focus** returns to the normal page and its previous scroll
position. Focus mode lasts only until you exit or reload.

**Add to diagram**, **Undo**, **Redo**, **User guide**, and **Save** share the
project toolbar above the workspace. The
**Into** selector names the destination section, including its tab when applicable.
Selecting a section in the preview updates this selector; choosing a destination
here opens its tab and selects that section without switching editor tools.

Each card in **Add to diagram** opens its next step immediately. **Node** opens
presets; click a preset to add it and customize it in the inspector. **All additions**
returns to the menu without inserting anything. **Connection** starts choosing a
source and target in the selected section. **Step** immediately appends to that
section's selected timeline. **Panel** opens the visual library, and **Services
from catalog** opens the service picker. Those pickers let you preview or configure
your selection before adding. **Contracts & page structure** adds a contract,
section or tab block directly. Each addition is one Undo. Escape closes the chooser
and returns focus to **Add to diagram**. If the source or destination changes while
it is open, reopen it before adding.

For quick connections, **Alt/Option-click a source node**, release the modifier,
then **click its destination**. The source and eligible targets highlight, and a
preview arrow follows the pointer. You can also select a node and use **Connect
from this node** at the top of its inspector. The new edge opens in the inspector
for its label, protocol and entry/exit ports; one Undo removes the addition.

Connections stay within one section. The source itself and existing ordinary
`from->to` edges are excluded from target highlighting. Escape, the on-canvas
**Cancel** button, a background click, focus loss, source changes or re-rendering
cancel without changing the spec. Render handwritten JSON edits before starting.
Ctrl/Cmd/Shift-click still control multiselect; ordinary drags still move nodes.
Finish **ADD TO STEP** before using the quick connection shortcut.

The tool rail is on the far left, with its editor immediately beside it and
the diagram preview on the right. One workspace fills the editor at a time:

- **Inspect** edits the selected element. Choose an element in the preview,
  then Inspect to see its fields. When already inspecting, selecting another
  element updates its fields. The path beneath the title opens it in JSON.
- **Steps** provides the searchable story list and path controls. Selecting a
  beat stays in this workspace; **Inspect selected step** opens its fields.
- **Outline** finds nodes, panels, steps, and sections across the document.
  **⌘/Ctrl K** opens it and focuses search. Selecting a result stays in the
  outline; **Inspect selection** opens the selected object's fields.
- **JSON** gives the source the full pane, with **Render** and **Diff** below.
  Validation links and explicit source jumps open it automatically. Raw edits
  require Render before using builder actions.
- **File** contains open/export actions, Mermaid and trace imports, Company
  repository/catalog controls, and Workspace preferences.

Tab into the rail, then use Up/Down or Home/End to switch tools. Changing tools
retains existing forms, disclosure state, scroll positions, and source drafts.
Ordinary canvas selections do not leave Steps, Outline, JSON, or File. Explicit
creation and inspection actions can open the relevant controls. Object clipboard
actions stay with Inspect; Save and Undo/Redo remain available in the top toolbar.

At widths of 800 pixels and up, drag the vertical divider's visible handle to
change editor width. The divider is also keyboard accessible:

- Tab to the divider. Left/right moves the editor boundary. Shift uses larger
  increments.
- Home and End choose the minimum and maximum sizes.
- Double-click the divider for a balanced split. **File → Workspace preferences → Reset editor width** restores the
  default 440-pixel editor width and keeps the selected tool.

The editor stays between 320 and 1100 pixels wide, with at least 300 pixels
reserved for the preview. Drag right to widen it or left to shrink it. Resizing
does not rerender the preview or change the selected step, path, or view. Wide
step inspectors place narrative controls beside panel changes; individual panel
controls stay collapsible. Wide Home inspectors put the map beside its device,
person, and signal controls. Narrow inspectors stack them. Fields stay within
the editor even when service/API choices or field values are long.

Preview panels move below the diagram when its section has 1000 pixels or
less of usable width. This follows the space left by the editor and section
padding, even on a wide desktop. The diagram (or Home in Home view) then gets
the full row; supporting widgets wrap underneath. All six skins use this
behavior in the workbench, standalone pages and embeds.

Editor width and selected tool persist in this browser when local storage is
available. Widths from the earlier layout are carried forward; the former
inspector/JSON height split is no longer used. Focus mode is temporary.
Resizing the window clamps the displayed editor width without losing its saved size.
These preferences are independent of the spec, drafts and undo history.
Cancelling a pointer drag or moving focus out of the window restores the size
from before that drag.

At smaller widths, including phones, the preview and editor stack vertically
and the divider disappears. The five tools remain available beside the editor. Focus mode still hides reference material. The JSON
textarea keeps native text editing and vertical resizing where the browser
supports it. This is a browser layout, not an operating-system fullscreen mode.

All row diagrams have their own **Auto / Fit width / Readable** controls,
including default curved edges, explicit `routing:"curves"`, and lane routing.
Auto uses full-size labels on narrow diagram columns with horizontal scrolling;
Fit width shows the whole graph. When a diagram overflows, **Scroll** buttons and
a draggable slider appear beneath its view choices. Click the arrows or drag/click
the slider to pan with a regular mouse; trackpad and native scrolling stay in sync.
Tab to the slider for keyboard positioning, or to the diagram region to pan with arrow
keys. Phone gutters and larger view buttons leave more room for the content.
The choice belongs to each diagram and follows the same unique-section match
as preview playback, even for diagrams without steps. It survives normal
edits, Render and skin changes, independently of whether a step can be matched.
It is not saved in JSON, drafts, undo or local storage; reloading resets to
Auto. See [trace viewing](trace-import.md) for sizing and pan behavior.

For saved panel/diagram placement within a section, use
[section arrangements and host previews](section-layouts.md). These layouts are
spec content and have their own per-section reset, separate from editor sizing.

Contract blocks have their own width and editing controls: see
[adding, sizing and arranging contract blocks](contract-blocks.md).

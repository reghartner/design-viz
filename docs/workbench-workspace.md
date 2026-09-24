# Workbench space and focus

For a captioned, searchable list with duplicate and reorder controls, see
[Story steps](workbench-steps.md).

Click-through previews start paused. Use **Play** to run a story; switching
tabs, selecting an element, or focusing the inspector or JSON source pauses
playback. Selecting the already displayed step also pauses it. Pausing does
not replace panel contents or disturb a focused control.

Render, skin changes and inspector edits dispose the previous playback before
building a paused preview. Within the same page title, a unique section with
the same heading, tab label, node IDs and default view retains its preview mode
and current beat. Steps match by a unique `id`, or by their complete unchanged
content when they have no ID. Removed or ambiguous matches keep the rendered
default; changed node sets or default views reset too. Selected-step edits use
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

Use **Focus workspace** above the skin controls to hide the introduction and
reference material. On a desktop, the preview scrolls beside a viewport-sized
editor. **Exit focus** returns to the normal page and its previous scroll
position. Focus mode lasts only until you exit or reload.

**Add to diagram** stays at the top of the editor, above all three tools. The
**Into** selector names the destination section, including its tab when applicable.
Selecting a section in the preview updates this selector; choosing a destination
here opens its tab and selects that section without switching editor tools.

Choose **Node**, **Connection**, **Step**, or **Panel**, then use the explicit
button to continue. Nodes offer presets; connections ask you to click a source and
target in the chosen section; steps append to that section's selected timeline;
panels open the visual library. **Page structure** inside the chooser adds a
section or tab block. Each addition is one Undo. Escape closes the chooser and
returns focus to **Add to diagram**. If the source or destination changes while it
is open, reopen it before adding.

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

The editor has three tools, with one visible at a time:

- **Inspect** edits the selected element. Selecting something in the preview
  opens this pane. Click the path beneath its title to open that element in
  JSON. With no selection, it shows a short starting hint.
- **Steps** provides the searchable story list and path controls. Selecting a
  beat stays in this pane; **Inspect selected step** opens its fields.
- **JSON** gives the source the full pane. Validation links and explicit source
  jumps open it automatically. Raw edits still require **Render** before using
  builder actions.

Tab into the tool bar, then use Left/Right or Home/End to switch tools. Changing
tools retains the existing forms and source textarea, including uncommitted
source text and its selection. **Import** and **Document outline**
remain collapsible above the active tool. Undo/redo and file actions stay
visible below it. Selecting a tool or a preview element closes those utilities
to make room; an active import or diff can still be closed using its own controls.

At widths of 800 pixels and up, drag the vertical divider's visible handle to
change editor width. The divider is also keyboard accessible:

- Tab to the divider. Left/right moves the editor boundary. Shift uses larger
  increments.
- Home and End choose the minimum and maximum sizes.
- Double-click the divider for a balanced split. **Reset layout** restores the
  default 440-pixel editor width and keeps the selected tool.

The editor stays between 320 and 1100 pixels wide, with at least 300 pixels
reserved for the preview. **Expand editor** moves the editor to the left and
keeps a 320-pixel live preview on the right. It also enters Focus workspace.
**Return to split** restores the previous width and focus setting. Expansion
does not render the preview again or change the selected step, path or view.
Wide home-step inspectors place the map beside its device, person and signal
controls. Narrow inspectors stack them.
Inspector fields stay within the editor column even when service/API choices
or field values are long. Use **Expand editor** when you want more space to read
and edit those values.

Preview panels move below the diagram when its section has 1000 pixels or
less of usable width. This follows the space left by the editor and section
padding, even on a wide desktop. The diagram (or Home in Home view) then gets
the full row; supporting widgets wrap underneath. All six skins use this
behavior in the workbench, standalone pages and embeds.

Editor width and selected tool persist in this browser when local storage is
available. Widths from the earlier layout are carried forward; the former
inspector/JSON height split is no longer used. Focus and expansion are temporary.
Resizing the window clamps the displayed editor width without losing its saved size.
These preferences are independent of the spec, drafts and undo history.
Cancelling a pointer drag or moving focus out of the window restores the size
from before that drag.

At smaller widths, including phones, the preview and editor stack vertically
and the divider and Expand editor control disappear. The three tools remain
available. Focus mode still hides reference material. The JSON
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

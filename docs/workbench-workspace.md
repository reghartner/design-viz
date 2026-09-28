# Workbench canvas and floating tools

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

Reordering rows, inspector edits, Render and Undo/Redo keep Page preview's
scroll position while it rebuilds. If an edit shortens the document past
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

The diagram is the full browser canvas. Its nodes and connections pan and zoom
without a surrounding document card. Select a **Section** in the top toolbar;
its view choices, playback and data panels float over the canvas. Use **Pan**
(or hold Space), zoom, and **Fit diagram** to navigate. In an **Explore** view,
moving or resizing a data panel or the step controls saves that view's floating defaults in the
source, so the placement survives HTML export. In a **Standard** view, those
same canvas gestures adjust temporary editor geometry without changing the
authored arrangement or JSON.

Both kinds of panel moves/resizes join the same **Undo**/**Redo** history as
story edits, one entry per completed drag or arrow-key adjustment. Temporary
geometry Undo restores the panel without moving the camera or reopening closed
tools. Opening or closing a tool does not add history entries.
A movement that hits an edge
without changing the panel leaves Undo/Redo unchanged. Dragging or resizing a
panel moves keyboard focus to its handle, so the next keyboard Undo targets the
panel. Loading another file or resuming a folder starts fresh history; recover
the previous story through **Earlier drafts**.
Camera and panel state follow matched sections through source edits; new projects
start fresh. Local drill-down panels keep their own geometry through preview
refreshes; undoing a closed detail’s geometry does not reopen it. Each named view
retains its own camera for the session.

Choose a named view above the graph to work on it. The adjacent **Presentation**
control saves **Standard** or **Explore** for that view. Keep
both kinds in one story: open **View options → Duplicate view**, give the copy
a **View name**, save it with **Rename view** or Enter, and choose its
presentation independently. Changing a legacy or automatic view to Explore
creates its named view in one Undo operation.

**Make default** saves the selected view as the opening choice for a fresh
published page; it then reads **Default view**. Merely selecting another view
does not edit the source or change that default. Presentation, name, duplication
and default changes use the normal source Undo/Redo history. The Diagram canvas
remains the full editor canvas while you choose the reader presentation.

**Canvas appearance → Page preview** shows prose, contract cards and the authored
page arrangement. Use it to arrange/export curated Home-centric views or simulate
host widths. **Diagram canvas** returns to the working canvas. Explore panel and
step-control placement can be saved from either surface. Page preview also lets
you arrange the saved Explore framing. It retains the view
settings under **Arrange section**; the compact canvas view controls are hidden
there to avoid duplicate controls.

**Add to diagram**, **Undo**, **Redo**, **User guide**, and **Save** share the
project toolbar above the workspace. The
**Section** selector names the destination section, including its tab when applicable.
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

The left rail opens independent **Agent**, **Inspect**, **Steps**, **Outline**,
**JSON**, and **File** windows. Multiple windows can stay open. Drag a header to
move it, drag its corner to resize, or use arrow keys on those handles (Shift
moves farther). Close a window with × and reopen it from the rail. Existing
forms, drafts, selection and disclosure state remain intact.

**Hide tools** clears editor windows; **Show tools** restores them. Data-panel
visibility uses the diagram's **Panels** menu. **File → Workspace preferences →
Reset panel layout** restores initial positions and sizes. Geometry and open
windows persist in this browser; resizing the browser keeps their handles on
screen. Escape, pointer cancellation and losing window focus cancel a drag.
Use **⌘/Ctrl Z** to undo and **⌘/Ctrl Shift Z** (or **Ctrl Y**) to redo while
working on the canvas or panel handles. Text fields keep their native text undo.
Temporary geometry history ends when a different project is opened or the page
reloads; saved editor-window positions still return on reload.

The Agent window names the current selection and the view/path/step context.
Each sent message retains a receipt of that exact context. A persistent Claude
indicator shows waiting, working, quiet or finished even while Agent is closed.
The selection pill also opens Agent. The entire story is shared; selection is
focus, not a limit on the data sent.

**⌘/Ctrl K** opens Outline and focuses search. Explicit inspection opens Inspect;
Save, Undo/Redo and Add remain in the top toolbar. Wide Inspect windows place
story and panel fields side by side; narrower windows stack them.

In Page preview, All row diagrams have their own **Auto / Fit width / Readable** controls,
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

Published standalone pages open an Explore view across the full browser or iframe,
with floating data panels, playback and view choices. Switching to a curated
standard/Home view restores its authored page layout. **Back to page** reveals
the surrounding document. Browser fullscreen remains a separate explicit action.

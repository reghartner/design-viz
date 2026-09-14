# Workbench space and focus

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

Use **Focus workspace** above the skin controls to hide the introduction and
reference material. On a desktop, the preview scrolls beside a viewport-sized
editor. **Exit focus** returns to the normal page and its previous scroll
position. Focus mode lasts only until you exit or reload.

At widths above 1180 pixels, drag the vertical divider to change editor width.
Select anything in the diagram to open its inspector. When both the inspector
and JSON source are open, drag their horizontal divider to share the height.
Collapse **JSON source** to give a long inspector the available space, or
collapse **insert** to make more room for either pane.

Both dividers are keyboard accessible:

- Tab to the divider. Left/right moves the editor boundary; up/down changes
  the inspector's share. Shift uses larger increments.
- Home and End choose the minimum and maximum sizes.
- Double-click a divider to reset it, or use **Reset layout** for both.

The editor stays between 340 and 900 pixels wide, with at least 560 pixels
reserved for the preview on desktop. Inspector share ranges from 20% to 80%;
minimum pane heights still apply, so a short viewport can constrain the split.
Large import forms and validation messages can make the editor column scroll.

Dimensions persist in this browser when local storage is available. Resizing
the window clamps the displayed editor width without losing its saved size.
These preferences are independent of the spec, drafts and undo history.
Cancelling a pointer drag or moving focus out of the window restores the size
from before that drag.

At smaller widths, including phones, the preview and editor stack vertically
and dividers disappear. Focus mode still hides reference material. The JSON
textarea keeps native text editing and vertical resizing where the browser
supports it. This is a browser layout, not an operating-system fullscreen mode.

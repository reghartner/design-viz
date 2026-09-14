# Workbench space and focus

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

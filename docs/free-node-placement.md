# Free node placement and edge entry/exit

New nodes use **Free placement** by default, including nodes created from the
catalog and in new sections or detail flows. Individual additions and catalog
nodes start in available positions on a four-column grid. Free nodes keep their
saved centers when connections change.
Rows keep their automatic spacing and left-to-right ordering. To make an existing
row node independent, select it and choose **float → Free placement** in the inspector.
Drag it anywhere in the diagram, including over a row or another node. A float
drag saves a position; it never swaps cards or inserts the node into a row.
Dragging an automatic **above/below** float also pins it at the dropped position.
The ghost and connected-edge previews show the proposed placement before release.

Shift-click floating nodes in the same section, or hold **Alt/Option** and drag
from empty diagram space to marquee them in either Standard or Explore. Choose
**Align horizontal** or **Align vertical** in Inspect, or right-click a selected
node and use the object menu. Horizontal sets every selected center to the first
selected node's Y in Inspect; the object menu uses the right-clicked node as its
anchor. Vertical alignment follows the same rule for X. Automatic floats become
pinned.
Drag any selected node to move the whole selection together, with or without
Shift held. Spacing and selection are retained, so you can align a row and then
move it. A modifier-click without dragging still adds or removes a node.
Alignment and each group drag take one Undo action. Select **Free placement**
first for nodes that currently use rows; selections spanning sections cannot be
aligned or dragged together.

- **Float X / Float Y** set the node center precisely in diagram units. They are
  independent of Auto, Fit width and Readable sizing. X increases rightward; Y
  increases downward. Negative coordinates are supported. The canvas expands
  around outlying nodes and explicit edge routes.
- **Auto above / Auto below** release the pin and restore automatic placement.
- **in rows** returns a float to a new final row. Row nodes keep their existing
  row/slot insertion and swap gestures.
- Each completed move is one Undo/Redo action. Escape, losing window focus,
  source changes, or retiring the builder cancel a pending move.
- Placement is shared by all steps and named views. Steps still control story
  focus/state; moving a node does not rewrite steps, edges or service bindings.

Fixed placement is optional in the existing floats list:

```json
"floats": [
  {"id":"identity","side":"above","x":590,"y":45},
  {"id":"analytics","side":"below","x":1240,"y":330}
]
```

Use finite X/Y values between -100000 and 100000. Supply both. They take precedence
over `dx`/`dy`; dragging clears those nudges. Keep the existing `side` when pinning
an automatic float: it preserves reserved space above the rows. New free nodes
use `below`. A fully free diagram retains an empty row placeholder, `rows:[[]]`.
Pinned cards stay where authored, including any overlaps; arrange them visibly.

## Choose where an edge meets a node

Select an edge, then use **Exit side** and **Entry side** independently:
**Auto**, **top**, **right**, **bottom**, or **left**. A selected side exposes
**position (%)**. At 0% the port is at the left/top of its side; at 100% it is
at the right/bottom. 50% is the center.

```json
{
  "from":"gateway",
  "to":"identity",
  "fromPort":{"side":"top","offset":0.35},
  "toPort":{"side":"bottom","offset":0.35},
  "label":"check device"
}
```

The JSON offset is a fraction from 0 to 1, defaulting to 0.5. Set either selector
to Auto to remove that port. With both Auto, normal routing applies. A pinned edge
uses a curve even in a lane diagram; other lane edges and the row grid are
preserved. Ports stay anchored during avoidance/bend adjustments, and labels,
packets and step highlights follow the resulting path. Pinning does not guarantee
that a path avoids every other card; drag the arrow to add smooth through-points (`curvePoints`) and use label nudges for crowded routes. Manual curves override avoidance and can be reset in Inspect.
Float layouts use curve routing, as reported by validation when lanes are requested.

The feature is shared by standalone HTML, native Backstage and Forge viewers.
Exports advertise `layout.free-nodes` and `layout.edge-ports` compatibility
capabilities so an older renderer can flag an incomplete display.

Open [the example spec](../examples/free-placement/free-placement.spec.json) in
the workbench to try a doorbell flow with a row, two pinned services, and distinct
authorization request/response ports.

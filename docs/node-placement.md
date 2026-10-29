# Node placement

For an ordinary node addition, add its semantic edges and an unpositioned
`{id:"new-id",side:"below",noSpread:true}` float. Workbench automatically places
new nodes near their connections **before paired preview**, then saves those
same coordinates on acceptance. Missing slots and new `0,0` placeholders are
also handled; existing nodes and explicit nonzero positions remain authored.
No coordinate work, second command, or placement caveat is needed for additions.
To deliberately place selected existing nodes, run
`node tools/place-nodes.cjs --section 0 --node ID --node OTHER input.json output.json`
and propose the output. Use different files and an output that does not exist.
The desktop **Place optimally** node menu uses the same local heuristic. It
preserves unrelated centers, routes and saved panel/view layouts. Imported
nodes require resolved topology context (`--context`) and write consumer
placement overrides only. This is local collision avoidance, not a claim of a
globally optimal layout. Whole-page composition retains its explicit rearrange
rules; see [arrangement](auto-arrange.md).


Select nodes in one desktop diagram section, then right-click **Place optimally**.
Keyboard: focus a node, press **Shift+F10** or the **Menu key**, and choose the action.
Only unlocked selected nodes move. One Undo restores the entire operation.

The planner considers connections, groups, text/card bounds and saved canvas
panel rectangles. Search is deterministic and bounded to 200 selected nodes,
2000 diagram nodes and 10000 edges. It does not optimize edge crossings or
change custom routes. Named views share graph placement. Existing group
containers may change size as their selected members move.

Authored rows and explicit nonzero points in new diagrams are preserved. New
`0,0` placeholders are placed even alongside explicit points. Existing nodes
at `0,0` and an explicit canvas point remain exact. Imported placement requires an approved frozen topology
context file; use `--context topology.json` with the CLI. Run `--help` for usage.

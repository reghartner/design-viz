# Recipe — a domain overview with details

Use a few domain cards to explain the end-to-end story, then let readers open
the implementation of a domain without losing their place. The complete,
fictional [doorbell seed](../src/starters/domain-drilldown.json) includes:

- Doorbell → Connectivity → Recording → Apps / Notify as the initial view.
- Focused Connectivity detail and a nested Cloud handoff mailbox.
- Recording expansion with labeled input and output nodes.
- Happy, uplink-lost, storage-rejected, and push-lost paths, mapped to the
  matching detail beats.
- Queue, status, and phone panels that distinguish retained work, a stored
  clip, and an actually received notification.

Copy the seed and replace its fictional actors, transports, and outcomes with
the supplied design. Keep targets as ordinary sections with stable IDs;
`detailOnly: true` hides them initially. Nodes reference them with `detail`.
Use `focus` for an independent reading level, `expand` for boundary routing,
and `link` for a navigational destination. Ports refer to child node IDs.

Read [the drilldown contract and guide](../docs/drilldowns.md) for the field
shapes, step mapping, approved external loading, and compatibility stamping.
Retain the [alternate-path rules](alternate-paths.md): identical beats can
share an ID; a differing outcome needs a different ID. Mapping a parent beat
into a child selects an authored state, not a simulation or automatic retry.

Run the [cookbook build loop](README.md#the-loop-every-recipe-ends-here), then
inspect each mapped happy and failed beat. Return through breadcrumbs, try
expansion and collapse, and open the nested mailbox on the uplink-loss path.
Check that held work stays held and a failed notification never inherits the
happy path's phone content. Test an external loader in its actual host if used.

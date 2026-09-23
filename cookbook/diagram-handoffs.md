# Continue in another document

Use a handoff when this diagram ends at another process's boundary and that
process has its own document. Use `detail` with `mode:"focus"` for a local
zoom into a domain. Use `link` for ordinary source evidence.

```json
{
  "page": {
    "title": "Continue to notification delivery",
    "sections": [{
      "heading": "Notification handoff",
      "diagram": {
        "nodes": {
          "event": {"title": "Event bus", "icon": "antenna"},
          "push": {
            "title": "Push notification",
            "tint": "cmd",
            "handoff": {
              "spec": "notification-delivery",
              "section": "delivery",
              "url": "https://diagrams.example.com/notifications.html#d=delivery"
            }
          }
        },
        "rows": [["event", "push"]],
        "edges": [{"from": "event", "to": "push", "kind": "int"}],
        "steps": [{"edge": "event->push", "text": "The notification consumer accepts the event."}]
      }
    }]
  }
}
```

The `push` node renders an arrow-shaped endpoint labeled **Open diagram**.
Put it in `rows` or `floats`, and use it in `edges` and `steps` like any node.
For an event fan-out, put the three consumer endpoints in one stacked slot:
`[["event", "bus", ["push", "lake", "action"]]]`. Author actual transport
edges and outcomes; the links themselves do not imply delivery or ordering.

The destination requires an absolute HTTP(S) `url` or a stable external `spec`
ID. `revision` and `section` are optional selectors requiring `spec`; they
belong to the other document and are not rewritten when local sections change.
Revisions identify content snapshots, not renderer versions. Use an approved
revision when the host requires one. A URL must include its complete route and
any desired hash; the renderer does not append section selectors to it.

A native host can provide `resolveDiagramLink(reference)` to map the spec ID,
revision and section to an authorized destination URL. Resolution is synchronous
and does not fetch a spec. An invalid, absent or failing resolver uses `url` as
the fallback. Spec-only destinations without a resolver display **Destination
unavailable**. They do not silently open a different diagram. The reader gets
a real new-tab link with keyboard and standard browser link behavior.

In the workbench, select a node → **Diagram handoff**, enter its destination,
and choose **Apply handoff**. **Remove handoff** restores an ordinary card.
The body selects the node for editing; its arrow tip previews the destination.
A handoff and a domain detail cannot coexist on the same node. Keep titles
short; long titles are truncated with the full title and `sub` in the tooltip.
The handoff caption replaces the usual subtitle/icon to emphasize continuation.

To move an existing selection into its own document, Shift-click two or more
nodes, choose **Create domain from selected nodes**, and select **Separate
document**. Review the preview, download the destination JSON, then apply the
handoff. Branches and playback stay in the overview; the new destination gets
its own independently authored steps. The download does not publish the spec or
create a reachable URL. See [independent extraction](../docs/drilldowns.md#extract-an-independent-diagram).

Start from [the four-document example](../examples/diagram-handoffs/README.md).
Replace its fictional destinations with real links before publishing. Test
every endpoint, including in the intended embedded host, and confirm the
destination explains the same accepted event or process boundary. Exported
specs advertise `flow.handoff` for compatibility checks.

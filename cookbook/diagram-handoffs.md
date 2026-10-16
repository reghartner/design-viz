# Continue to another diagram

Use a handoff when this diagram ends at another process’s boundary. The next
process can live on another tab in this spec or in a separate document. Use `detail` with `mode:"focus"` for a local
zoom into a domain. Use `link` for ordinary source evidence.

## Continue within this spec

Give the destination diagram section a stable `id`, then select the source node
→ **Diagram handoff → Handoff destination → This spec**. Choose **Destination
section** and **Apply handoff**. The picker includes the destination tab label.
This complete example hands off from the Orders tab to the Delivery tab:

```json
{
  "page": {
    "title": "Order to delivery",
    "blocks": [{
      "tabs": [
        {
          "label": "Orders",
          "sections": [{
            "id": "orders",
            "heading": "Order intake",
            "diagram": {
              "nodes": {
                "order": {"title": "Order accepted"},
                "next": {"title": "Delivery", "handoff": {"localSection": "delivery"}}
              },
              "rows": [["order", "next"]],
              "edges": [{"from": "order", "to": "next"}],
              "steps": [{"edge": "order->next", "text": "Continue to delivery."}]
            }
          }]
        },
        {
          "label": "Delivery",
          "sections": [{
            "id": "delivery",
            "heading": "Delivery pipeline",
            "diagram": {
              "nodes": {
                "queue": {"title": "Queue"},
                "dispatch": {"title": "Dispatch"}
              },
              "rows": [["queue", "dispatch"]],
              "edges": [{"from": "queue", "to": "dispatch"}],
              "steps": [{"edge": "queue->dispatch", "text": "Dispatch the queued order."}]
            }
          }]
        }
      ]
    }]
  }
}
```

Clicking **Continue →** switches to the destination section’s tab in the current
viewer. It uses the existing diagram and retains that diagram’s current view,
path and step. Playback pauses. **Back to …** returns to the source reading
position; a reciprocal handoff node can lead back as well. Enter and Space
activate the node. In the editor, the body selects the node and the arrow tip
previews navigation. Standalone browser Back/Forward also follows handoffs.

Targets must be different, ordinary diagram sections, not `detailOnly` sections.
A handoff inside a local detail may return to its ordinary overview. Local
handoffs use `localSection` alone; do not combine it with external fields.
Tab labels can change freely. Editor section renames and moves update references;
deleting the target removes the handoff in the same undoable edit. The return
trail belongs to the current viewer session and resets when the spec rerenders.
Exported specs advertise `flow.local-handoff` in addition to `flow.handoff`.

Try [the reciprocal two-tab example](../examples/tab-handoffs/tab-handoffs.spec.json).

## Continue in a separate document

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
              "siteBaseUrl": "https://diagrams.example.com/view.html",
              "claudeUrl": "https://claude.ai/artifact/notification-delivery"
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

The destination requires a stable external `spec` ID. Add known `siteBaseUrl`
and `claudeUrl` destinations, plus a matching `claudeArtifactId` if stored.
Optional `revision`, `section`, `view`, `path` and `step` address the other
document. Revisions identify content snapshots, not renderer versions. A site
base is the viewer entry URL, with no query or fragment; the renderer adds
`?diagram=<spec>` and supported selectors. Claude URLs remain unchanged.

Migration: `handoff.url` is removed and rejected, including alongside `spec`.
Replace `{url:"https://old.example/orders.html"}` with
`{spec:"orders",siteBaseUrl:"https://internal.example/team/view.html"}` using
the actual configured viewer entry URL, and add the target's saved `claudeUrl`
when known. Do not reinterpret an arbitrary old page URL as a site base.

The node action follows the current host: the target’s saved Claude artifact URL
in Claude, the published diagram route on the website, and the existing approved
spec loader inside Backstage. If that host cannot open the target, the reader
chooses from available destination links; it never silently switches hosts.
Claude URLs retain their own query/fragment without appending diagram selectors.
Backstage has a Back action that restores the paused parent diagram. Unpinned
IDs outside its association list require a company metadata resolver; see
[Backstage handoffs](../apps/backstage/README.md#diagram-handoffs-in-200).

Host context is runtime configuration, not authored JSON. A standalone integration
can set `window.flowviewHandoffHost` before boot; native callers use `handoffHost`.
Reader Contents **Open on internal site** and **Open in Claude** always open the
explicit destination. Local continuations and external detail drill-downs are
separate behaviors. An unknown runtime host offers available destinations for
deliberate selection.

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

## Persistent destinations and source diagrams

Set the existing **Diagram ID** and paste the **Claude artifact share
URL** in desktop **Document settings**. Claude links may use `/artifact/<id>`,
`/code/artifact/<id>`, `/artifacts/<id>`, or `/public/artifacts/<id>` on `claude.ai`;
legacy `claude.site/artifacts/<id>` links also work. Registered documents keep the ID from
repository membership. Ordinary documents can save an ID without joining Canon.
Set the internal site base once in `company/company.json` as
`"site":{"baseUrl":"https://diagrams.example.com/team/flowspec.html"}`.

A cross-document `handoff` or external `detail` can carry `spec`, `revision`,
`section`, `view`, `path`, `step`, `siteBaseUrl`, `claudeUrl`, and
`claudeArtifactId`. Only external `detail` retains a fallback `url`; handoffs
require `spec` and reject `url`. Known destinations travel
with the reference. The published reader resolves catalog IDs to its local
`?diagram=` route. Its detail loader validates the catalog revision and renders
the target interactively with Back navigation; it never fetches a reference URL
as a spec. Native Backstage retains its approved, pinned-revision loader.

Reader **Contents** exposes available **Open on internal site** and **Open in
Claude** links and copy buttons. Cross-document node links expose alternatives.
Imported nodes expose **Open source diagram**, including nested providers.
HTML snapshots retain these inert source references as `diagram.sourceDiagrams`
while removing topology declarations, edit provenance and provider source context.
Website links carry supported section/view/path/step fragments. Claude links use
the actual artifact URL unchanged; this does not enable live native
Claude embedding. Missing destinations produce no placeholder links.

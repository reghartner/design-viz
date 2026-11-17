# Track unlinked work on a shared node

Use named missing-work items when one node or connection participates in several
steps and only some steps need additional work. Desktop authoring applies equally
to local and imported nodes and edges.

```json
{
  "nodes": {
    "mcu": {
      "title": "MCU",
      "tickets": ["EX-1"],
      "missingWork": [{"id": "MISSING-1", "title": "Set thermal issue bits"}]
    }
  },
  "rows": [["mcu"]],
  "steps": [
    {"id": "set-bits", "nodes": ["mcu"], "text": "Set thermal bits", "ticketFilter": ["MISSING-1"]},
    {"id": "report", "nodes": ["mcu"], "text": "Report existing state", "ticketFilter": ["EX-1"]}
  ]
}
```

The first step shows Missing work; the second excludes that marker. Without a
filter both work items participate. In desktop Workbench, Inspect the step and
use **Tickets on this step** to choose its tickets and named placeholders.

Adding EX-2 to MCU asks **Does EX-2 cover: Set thermal issue bits?** Choose
**Clear** to replace MISSING-1 with EX-2 in every filter and remove the placeholder,
or **Keep** to attach EX-2 while retaining it. Multiple placeholders offer a
chooser; one Clear removes one item. One Undo restores the entire replacement.

The Tickets table lists placeholders without a Jira key. Placeholder IDs are not
Jira tickets, even if they look like `MISSING-1`. Keep IDs unique across the document
and distinct from actual Jira keys; use nonempty titles. Boolean `missingWork:true`
remains one unnamed item, included without a filter and omitted by explicit filters.

For imports, author `nodeTracking` or `edgeTracking` in the consumer. Omission
inherits the provider's missing work; an explicit value overrides it. `false` or
`[]` suppresses it. Covering one item stores the remaining effective items without
modifying the provider. Undo restores inheritance.

See [Live status](../docs/live-status.md#step-ticket-filters) for stale-filter behavior,
status precedence, provider lookups, counts and board editing.

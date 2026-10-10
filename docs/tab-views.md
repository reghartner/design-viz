# Tabs, Views, and sections

A section owns its diagram, nodes, edges, panels, prose, and steps. A Tab stores
its sections once and defines any number of **Views** over that content. Each
View has an ordered subset of section references and one presentation:

- **Standard** stacks its member sections in the authored order.
- **Explore** shows one member section at a time, including its prose and one
  active playback group. The section controls list only that View’s members.

The document’s navigation stays at the top of the browser or contained viewer:
**Tabs → Views → Sections**. The same navigation element remains in place across
presentation changes. Backstage expansion enlarges the container and preserves
the selected View’s presentation. Workbench navigation sits below app chrome.

```json
{
  "label": "Product",
  "defaultView": "overview",
  "views": [
    {"id": "overview", "name": "Standard A + C", "presentation": "standard", "sections": ["a", "c"]},
    {"id": "engineering", "name": "Explore B + C", "presentation": "explore", "sections": ["b", "c"]},
    {"id": "focus", "name": "Explore A", "presentation": "explore", "sections": ["a"]}
  ],
  "sections": [
    {"id": "a", "heading": "Section A", "diagram": {"nodes": {"service": {}}, "rows": [["service"]]}},
    {"id": "b", "heading": "Section B", "text": ["Section B notes"]},
    {"id": "c", "heading": "Section C", "text": ["Section C notes"]}
  ]
}
```

The runnable [example](../examples/tab-views/tab-views.spec.json) adds diagram
playback and nested domain drilldown. Editing Section C changes its content in
both Views that reference it. There is no Tab-owned node registry.

View IDs are unique within their Tab, begin with a letter, and contain up to 64
letters, digits, underscores, or hyphens. Names are nonempty and at most 80
characters. `presentation` is required. `sections` is a nonempty ordered list
of unique section IDs in that Tab. `defaultView`, if supplied, must name a View;
otherwise the first View opens. Invalid membership, malformed lists, duplicate
IDs, and missing defaults fail validation before rendering.

`detailOnly` sections and sections referenced by local node `detail.section`
actions are domain definitions. They are excluded from normal stacks and View
membership, including in Workbench; nodes and breadcrumbs open and close their
drilldown. The explicit editor command for editing a detail remains available.

A member can use `{ "section": "a", "layout": "technical" }` to select an
arrangement from that section’s `diagram.layouts`. Omitted `layout` uses the
section’s default arrangement. Section arrangements own panel geometry,
visibility, path/step filtering and Explore camera defaults. They never add
other sections to a View. A View’s presentation overrides its members’ legacy
arrangement presentation. Two Views may deliberately reference the same
arrangement; their content remains shared either way.

In Workbench, open **View** to create, duplicate, rename or delete Views, change
**View presentation**, select **Sections in this View**, order them with **Move
… up**, and choose **Make opening View**. Every action is one Undo/Redo operation.
**Independent section arrangement** copies only the selected section’s arrangement
and points this View to it in one transaction. **Arrange selected section…**
opens geometry, visibility and path/step controls. Camera commands appear when
the section has a saved arrangement. Source changes invalidate stale controls.

Adding a section includes it in the active canonical View. Duplicating a section
includes the copy after the original in every View that contained the original.
Renaming a section ID repairs references; deleting a section removes its
references and drops empty Views, repairing the default. The editor refuses to
delete the last member of every View until another member exists. These repairs
share the same Undo operation as the section action. Moving content in the
section registry preserves the explicit View order.

Standalone links use `d=<section ID>&v=<View ID>`. A destination section excluded
from that View is routed to an eligible View, never displayed under the unrelated
View. Native `navigate({section, view})` rejects a mismatched explicit pair;
omitting `view` deliberately chooses an eligible View if needed. Native snapshots
report the canonical View ID. Back/Forward retain View and member selection.

## Existing documents and migration

Loading old documents never rewrites source. Direct sections form an implicit
Tab; new untabbed authoring may use `page.views` and `page.defaultView`. Bare
diagrams remain readable, and their first explicit View edit wraps the exact
original diagram source in a section.

Legacy `diagram.layouts[].presentation`, `defaultLayout`, host profiles,
geometry and filters remain intact. Runtime compatibility Views preserve those
arrangements independently: an Explore arrangement includes only its own section.
A default Standard compatibility View stacks eligible Standard sections. Automatic
Home/Data flow choices remain available. The first View-authoring action adds
stable section IDs and canonical Views using source splices, retaining every
existing section and arrangement. It creates one Undo entry. The experimental
`tab.presentation` field is not authoritative and does not override legacy
mixed presentations. New files should use the canonical View contract.

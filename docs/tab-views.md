# Tabs, Views, and sections

A section owns its diagram, nodes, edges, panels, prose, and steps. A Tab stores
its sections once and defines any number of **Views** over that content. Each
View has an ordered subset of section references and one presentation:

- **Standard** stacks its member sections in the authored order.
- **Explore** shows one member section at a time, including its prose and one
  active playback group. Contents lists only that View’s members under it.

The reader keeps a stable two-row header: a **Contents · N sections** toggle, active Tab label, visible View choices
and utilities above centered **‹ Section n of m ›** controls. The count, section number, and ‹ › controls use every navigable section in document order, including the page’s own sections, and stay stable when a View changes, reorders, or omits sections. Sections shared by multiple Views count once; drilldown-only sections do not count. Paging preserves the current View when it contains the target section and otherwise selects a View that contains the target.
The numbered rail continues to identify top-level Contents entries.
View choices remain available when Contents is closed; on narrow screens they
wrap within the first header bar. Arrow keys move between View choices, and
Enter or Space selects one. The collapsible **Contents** sidebar lists **Tabs → Views → Sections**, with every Tab and View expanded when the page opens; full section titles appear
under Standard Views and under expanded Explore Views. In Standard, a section title scrolls through the intact stack;
in Explore it selects only the current View’s ordered members. Desktop Contents
pushes the canvas; on phones it overlays it with a scrim and closes after a choice.
With Contents closed on desktop, a 44px rail at the left shows one numbered marker per part
(the current one filled) and an n/m count; Contents numbers its entries to match. Resting the
mouse on the rail for a moment shows Contents over the page without moving it, with only the
current part expanded; it closes when the mouse leaves or on Escape. A marker click (or Enter)
goes to that part and leaves Contents closed, with focus kept on the marker; the overlay’s **Pin**
and the Contents toggle pin it open. Phones have no rail.
Escape closes an open menu first, then Contents, returning focus to its trigger.
The tree scrolls independently of its pinned theme footer. Zoom is separate from
Section navigation; phones use the percentage menu at left and Fit at right. In
Explore, the Zoom menu also retains Auto, Fit width, and Readable diagram sizing.

The theme picker offers Aurora, Pastel, Blueprint, Terminal, Rose, Lavender, and
Opus Lilac (`lilac`). A company build can add its own themes. Changes affect the live reader without rebuilding its
sections or editing the source. Daylight and Editorial remain supported in saved
specs, cookies and host APIs and remain correctly labeled when loaded, but are
not offered as new choices. Lavender and Opus Lilac bundle Lora locally; the
restricted Forge font profile retains its existing local font fallback.

A valid `?theme=lavender` (or another supported skin) overrides cookies and
document defaults at boot. Canonical diagram links retain only that valid theme
alongside the diagram ID. Choosing a theme during the session updates an existing
valid theme query, so reload and sharing agree; it does not write a cookie.

Backstage expansion enlarges the container and preserves the selected View’s
presentation. Workbench retains its authoring navigation below app chrome, with
compact Tab/View selectors and a horizontally scrollable section strip when
needed. Its read-only page preview uses Contents.

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

## Comments on claude.ai artifacts

Inactive Tabs and Views are hidden, so the claude.ai shell's default comment
anchoring cannot show which Tab a comment is on and cannot "Go to" a comment
on a hidden Tab or View. When publishing a standalone Flowview page as a
claude.ai artifact, declare
`capabilities: {comments: {"composer_only": true, "customAnchors": true}}`.
The page then places comment pins itself (`src/viewer/artifact-comments.js`):

- New comments are labelled Tab first (`Tab: … › View: … › section › excerpt`)
  and anchored by the shell's own positional path for the clicked element.
- A comment on the step caption is saved against the numbered step button of
  the step shown at that moment; its label keeps the caption text and its pin
  sits on that button.
- Only rendered subjects are pinned: threads on hidden Tabs or Views, and step
  threads while the diagram is in Ambient mode, are listed unplaced.
- "Go to" selects the thread's Tab and View through the normal navigation (URL
  included), expands collapsed prose, and for a step button puts the diagram
  in Step mode on that step before scrolling to it.
- Document navigation (Tab, View and Contents controls) and the stepper's
  controls (numbered step buttons, previous/play/next, Ambient/Step, path
  choices) keep working while comment mode is on.

Without that declaration — and in saved files, Backstage and Confluence, where
`window.claude` is absent — the module is inert and the shell's default
anchoring is used.

## Existing documents and migration

Loading old documents never rewrites source. Direct sections form an implicit
Tab; new untabbed authoring may use `page.views` and `page.defaultView`. Bare
diagrams remain readable, and their first explicit View edit wraps the exact
original diagram source in a section.

Legacy `diagram.layouts[].presentation`, `defaultLayout`, host profiles,
geometry and filters remain intact. Runtime compatibility Views preserve those
arrangements independently: an Explore arrangement includes only its own section.
A default Standard compatibility View stacks eligible Standard sections. Panels never generate choices. For older automatic Home/Data flow
presentations, use the [offline conversion](panel-view-migration.md). The first View-authoring action adds
stable section IDs and canonical Views using source splices, retaining every
existing section and arrangement. It creates one Undo entry. The experimental
`tab.presentation` field is not authoritative and does not override legacy
mixed presentations. New files should use the canonical View contract.

A lone `diagram.sectionLayout` is default geometry, never a View definition.
Saving Arrange does not add Layout/Data flow choices. Named `diagram.layouts`
remain selectable; explicit canonical Views determine their own names and count.
Legacy `v=layout` and `v=flow` links first honor an exact authored View ID,
then an existing legacy arrangement choice. Otherwise they select the opening
View if it contains the addressed section, or the first View that does. Links
and navigation snapshots use the actual View ID or authored named-arrangement ID. An exact authored ID belonging
to a different section is rejected by normal destination validation. Existing
`{section,layout:"layout"}` (and the old `"default"` alias) members remain accepted for default geometry.

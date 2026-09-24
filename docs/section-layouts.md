# Arrange a section and preview its host

Open the workbench and select **Responsive**, **Backstage**, or **Confluence**
above the preview. Host previews use adjustable content widths (1080 and 760
pixels initially). They simulate available space; they do not connect to a host
or reproduce its navigation, theme, permissions, or enclosing macro. Horizontal
scrolling lets you inspect a preview wider than your editor split.

In a section, choose **Arrange section**. Each panel, the data-flow diagram, and any detached step controls
get a grab bar and a lower-right resize handle. Drag either handle to snap to
a twelve-column grid. Overlapping tiles move down to remain visible. Click
**Done arranging** to see the reader view. Diagram nodes and Home elements
retain their existing separate editing controls. Drag **Step controls** to put
play/pause, alternate-path chips, step buttons, and the caption beside the Home
map or elsewhere in the section. They move as one live group.
When the caption sits beside the controls, the control groups stay aligned to
the top as text wraps onto more lines. Narrow layouts still put the caption below.

**Step controls** can be **Attached to Data flow**, **Attached to** a Home map,
or **Detached**. Attached controls share their host's outline and move/resize
with it. Arrange section preserves that coupling; it no longer detaches controls
automatically. New arrangements attach to the primary Home map when present,
otherwise to Data flow. To drag the controls separately, choose **Detached**.
While attached, drag the **↕** handle at the bottom of the controls, use Up/Down
on that handle, or set **Attached controls height** (grid rows) and choose
**Apply controls height**. The host grows or shrinks by the same amount, keeping
the visualization's allotted height. The combined tile is limited to 40 rows.
Long captions scroll inside the saved controls height instead of moving the
bar upward or shrinking the visualization. Data-flow controls follow the drawing
directly; unused tile space stays below the combined drawing and controls.
Optimize preserves this controls height as well as the attachment.
If the attachment panel is hidden, the controls use their saved detached
position so navigation remains reachable. Optimize preserves the attachment
and hidden set. Sections without steps, or with `view:"ambient-only"`, have no
controls tile. In Ambient mode a detached tile prompts you to choose Step.

- A completed move or resize is one **Undo** / **Redo** operation. Escape,
  pointer cancellation, losing focus, or resizing the window cancels a drag.
  The source is unchanged until release. Render manual JSON edits before arranging.
- Tab to a grab bar and use arrow keys to move; Shift + arrows resize. Arrow
  keys on the resize handle resize directly.
- Choose an element in the arrangement controls and edit **Column**, **Row**,
  **Width**, and **Height** for precise placement or phone editing. Column and
  Row are displayed starting at 1. Width is in columns; height is in grid rows.
- **Optimize layout** saves a starting arrangement for the selected target.
  It arranges only visible elements and preserves hidden panels and Data flow
  in that layout/profile. Hidden tiles retain their saved size and position and
  reserve no space; if all supporting panels are hidden, the main tile fills the row.
  Responsive and Backstage use an eight-column main tile with supporting
  panels in four columns; without supporting panels, main tiles fill the row.
  Confluence gives the diagram and Home a full row,
  with smaller panels paired below. A declared centerpiece comes first.
- **Reset layout** removes only the selected target's arrangement. The default
  arrangement applies if one exists; otherwise the existing Home/Data flow
  presentation returns. This differs from the workspace's editor-split reset.

Layouts are saved in the spec and survive JSON, HTML and Confluence export.
The selected preview host and width are temporary workspace state. At section
widths of 640 pixels or less, tiles stack in reading order; use the numeric
controls or widen the preview to drag. Maps fit their tiles; dense panels scroll
internally. Diagram Auto / Fit width / Readable controls remain available.
Saved named views appear as the complete set of view buttons. All views reuse
the live widgets and preserve the selected alternate, step and playback state
when included in the destination view. Legacy single arrangements still have
an automatic **Data flow** choice; sections without saved arrangements retain
Home / Data flow until Arrange section converts them into named views.

Choose **Rename view** beside **Arrange section** to name the selected view, for example
**Front door** or **Home**. Names are up to 40 characters and apply across that layout's host profiles. A legacy single view
stores its name as `diagram.layoutName`; clearing it restores **Layout**. Named
views store it in `layouts[].name` and require a nonempty name. Renaming is one undoable edit and survives JSON/HTML export.

In the named layout, **Hide data flow** hides only the diagram. Panels and step
controls remain available, including controls in an older combined tile.
Rows occupied only by the diagram are reclaimed; panels sharing its rows keep
their dimensions and columns. **Show data flow** restores the exact saved
arrangement. This visibility choice is temporary: it survives view switches
and workbench edits, but does not rewrite the spec. Arrange section returns the diagram to its authored visibility. Hidden elements
remain selectable in **Layout element**, so they can be shown or swapped without
removing their declarations.

## Multiple named layouts of one story

Use **Open file** with
[`src/starters/named-layouts.json`](../src/starters/named-layouts.json)
to try **Home story** and **Service flow**.
Home story shows a shorter resident-facing sequence with controls attached to
Home; Service flow includes every technical stop and attaches controls to the
diagram. Both share the same step definitions, panels and execution paths.

To build that from an existing arrangement:

1. Choose **Arrange section**, then **Duplicate view**. The copy becomes the
   active view. Give it a **View name**, such as **Service flow**. The name
   field is first in the controls; **Rename view** also opens and focuses it.
2. Select **Data flow** in **Layout element**, choose your Home panel in
   **Swap places with**, then click **Swap places**. Position, size and visibility
   exchange; other elements keep their places unless a collision needs packing.
3. In **Visible elements**, uncheck **Home** (or its authored title) to hide the
   Home panel in this view. Every panel and **Data flow** has its own checkbox;
   the checklist names the selected layout. These checkboxes are independent of
   the **Layout element** dropdown, which selects what to move, size or swap.
   To replace a visible Home with a hidden diagram directly, hide the diagram
   in the original layout before duplicating and swapping.
4. Choose **Make default** for the view that should open on a fresh page, then
   **Done arranging**. Readers switch using the named buttons above the section.

Each layout owns its Responsive, Backstage and Confluence profiles. Duplication
copies all profiles independently; swapping, moving, sizing and visibility edit
only the selected host profile in the active layout. Repeat a swap in other
explicit host profiles as needed. Step controls stay available, attached or detached; they cannot be hidden or
swapped with a panel. All authoring
operations support Undo/Redo. **Delete view** removes the arrangement, never
its panels, diagram or steps. Deleting the default selects the first remaining
layout; deleting the last named layout restores the automatic presentation.

**Reset layout** removes the active host profile. A named layout with no profiles
left receives an automatic Responsive arrangement. **Optimize layout** preserves
visibility and rearranges only visible elements in that profile.

Arrange section, Optimize, or the first duplication converts an older
`sectionLayout` / `layoutName` pair into named views as one undoable edit. Existing specs keep working unchanged.
Reader view switches do not write JSON or create undo entries. The workbench
retains the active named view or Home / Data flow choice across property edits,
Undo/Redo, and skin/host preview changes. Renaming nodes, sections, the page, or
the primary panel does not change that choice. Opening another project uses its
authored default; deleting the selected view falls back to the remaining default.

## Link to or capture a particular view

Use the view's stable `layouts[].id`, not its display name, in the HTML fragment:

```text
page.html#d=front-door&v=home-story
page.html#d=front-door&v=service-flow&m=step&p=offline&s=offline
page.html?layout=confluence#d=front-door&v=home-story
page.html#embed=front-door&v=service-flow
```

`d` is the section ID (or its heading-derived reference). `v` selects its view;
`m`, `p` and `s` still select playback mode, path and step. The `layout` query
parameter selects a host profile within that view, such as Confluence or
Backstage. It does not select a view. `embed` hides the surrounding page and
can target its view even when the section has no steps.

Changing a view updates the page URL. The step's **Copy link** and the
section's **Copy embed link** retain the selected view. Reload and browser
Back/Forward between links restore it. A missing or unknown view ID uses the
authored default. The view is applied before the step, so a hidden stop advances
to the next included stop, or the final included stop if there is no next;
an excluded path uses an available path. Earlier state still folds normally.

For older specs without named views, `v=home` selects the Home/panel focus and
`v=flow` selects Data flow. A legacy single `sectionLayout` accepts `v=layout`
(or `v=home`, canonicalized to `layout`) and `v=flow`. A plain diagram has only
`flow`. Named IDs take precedence: a named view with ID `home` is that view,
not a request for a legacy Home presentation.

The GIF exporter uses the same IDs:

```sh
python3 tools/export_gif.py page.html --section 1 --view home-story --out home.gif
python3 tools/export_gif.py page.html --section 1 --view service-flow --out services.gif
```

An explicit view exports its visible stops, visiting paths in authored order;
shared stops are captured once, on their first containing path. Each frame
still folds that path's earlier state. Hidden steps and paths without visible
stops do not produce frames. Without `--view`, the existing default-view export
behavior remains. Invalid view IDs fail with the available choices. Rebuild old
HTML first: the exporter rejects a page that cannot confirm the requested view,
rather than capturing its default silently. See [GIF options](../README.md#exporting-a-gif).

These link selectors require a newly generated standalone HTML page. They do
not change the Backstage plugin's public navigation API.

## Steps shown in each view

Under **Arrange section**, expand **Steps shown in this view** and check the
stops its audience needs. **Show all steps** clears the filter and includes
future steps automatically. Selecting a subset stores stable step IDs, assigning
IDs to anonymous steps as part of the same undoable edit. At least one step must
remain selected; a path with no selected steps is disabled in that view.

Skipped stops still execute in the story: panel state and node tones are folded
through the full selected path. Navigation, playback, captions and the printed
step list show only selected stops, in path order. Alternate paths fold their
own state independently. Switching views retains the current step when included;
otherwise it selects the next included stop, or the last if there is no next.
If the entire path is excluded, it selects the first available path. Step links
and editor references retain the original step identity.

The editor's Steps inspector can temporarily preview a hidden step for editing;
the playback status says **Previewing a hidden step**. Arrows, Play or clicking
the view button return to its saved selection. This does not change the spec.

Named views are the complete set of view buttons; there is no additional automatic
Data flow mode. Name any view **Data flow** and choose the diagram, panels and
attachment it should show. **Make default** chooses the view that opens first.
Older specs without named views keep their automatic Home/Data flow behavior.

## Spec contract

A diagram can declare one legacy `sectionLayout`, or a `layouts` array of named
arrangements. No schema-version switch is needed. Omitting both preserves the
existing presentation.

```json
"sectionLayout": {
  "default": [
    {"panel":"home", "x":0, "y":0, "w":8, "h":12},
    {"panel":"phone", "x":8, "y":0, "w":4, "h":12},
    {"controls":"steps", "x":0, "y":12, "w":12, "h":6},
    {"x":0, "y":18, "w":12, "h":12}
  ],
  "confluence": [
    {"panel":"home", "x":0, "y":0, "w":12, "h":12},
    {"controls":"steps", "x":0, "y":12, "w":12, "h":6},
    {"x":0, "y":18, "w":12, "h":12},
    {"panel":"phone", "x":0, "y":30, "w":6, "h":12}
  ]
}
```

A tile without `panel` or `controls` is the data-flow diagram. `panel` names a
declared panel ID; `controls:"steps"` identifies the step-controls tile. Add
`attachTo:"diagram"` or `attachTo:"panel:home"` (using a Home map ID) to dock it.
Its saved x/y/w/h remain the fallback when detached or its host is hidden. While
attached, `h` also sets the controls height (`h * 40 - 8` pixels), inside the
host's total height; it reserves no separate grid space. Allow enough host height
for both the visualization and controls. An undersized host scrolls. Legacy
combined tiles with no controls entry reserve 4 rows, or 6 with alternate paths.
Omit `attachTo` for a detached tile. Do not
combine `panel` and `controls` on one tile. Omitting the controls tile preserves
the previous combined diagram-and-controls presentation. A saved controls
position is ignored while no steps are available and reused if steps return.
`x` and `y` are zero-based grid positions;
`w` and `h` are integer spans. There are twelve columns, with `x + w <= 12`,
`y` from 0 to 500, and `h` from 3 to 40. Rows are 32 pixels with an 8-pixel gap.
These are presentation coordinates, not story evidence or Home coordinates.
Unknown, duplicate, or malformed tiles produce validation warnings. The viewer
ignores invalid tiles and appends unspecified/new panels and the diagram, so
content does not silently disappear. Collisions are packed downward. Panel
rename/delete operations update all saved layouts.

Profiles are `default`, `backstage`, and `confluence`. A host uses its profile
when present, otherwise `default`, otherwise the existing layout. Editing an
inherited layout saves an independent profile; it does not alter the fallback.

The Forge app automatically selects `confluence` for both configuration and
published viewing. Its updated app bundle must be deployed by the company
integrator. The Backstage association index adds `layout=backstage` to viewer
and editor URLs. The plugin also renders an inline bundled viewer with the
`backstage` profile selected. Standalone viewers accept `?layout=backstage`
or `?layout=confluence` (append with `&` if the URL already has a query).
The width control is for preview only; actual iframe/page width belongs to
Confluence or Backstage. Check the installed host after deployment.

### Named-layout fields

```json
"defaultLayout": "home-story",
"layouts": [
  {"id":"home-story", "name":"Home story", "sectionLayout":{"default":[
    {"panel":"home","x":0,"y":0,"w":8,"h":12},
    {"x":0,"y":18,"w":8,"h":12,"hidden":true},
    {"controls":"steps","x":0,"y":12,"w":8,"h":6},
    {"panel":"phone","x":8,"y":0,"w":4,"h":12}
  ]}},
  {"id":"service-flow", "name":"Service flow", "sectionLayout":{"default":[
    {"x":0,"y":0,"w":8,"h":12},
    {"panel":"home","x":0,"y":18,"w":8,"h":12,"hidden":true},
    {"controls":"steps","x":0,"y":12,"w":8,"h":6},
    {"panel":"phone","x":8,"y":0,"w":4,"h":12}
  ]}}
]
```

Layout IDs are unique within the diagram, begin with a letter and contain at
most 64 letters, digits, underscores or hyphens. Names are nonempty, at most
40 characters. `defaultLayout` is a layout ID; when omitted the first valid
layout opens. Valid named layouts take precedence over legacy layout fields.
Each uses the same host-profile and tile contract as `sectionLayout` above.
When a named view lacks both the requested host and a default profile, it uses
an automatic arrangement for that host. Invalid entries warn and are ignored.

A diagram or panel tile may declare `hidden:true`. It retains its geometry and
live widget state but does not occupy grid space or push other tiles down.
Step-control tiles cannot be hidden. Unspecified/new elements are still appended
visibly; omission never means hidden. In a legacy combined diagram/controls tile,
hiding the diagram keeps its live controls visible. Use an explicit controls tile with `attachTo` in new coupled layouts. Panel rename/delete updates every view and host profile.

Named layouts require the updated viewer bundle: re-export standalone HTML or
update the Backstage/Forge app. Backstage's native renderer is rebuilt with the
plugin; its host uses the normal bundled-script and embedded-asset policy.

Optional `layouts[].steps` is a nonempty list of unique existing step IDs. Omit
it for all steps; list order does not reorder the story. The selection belongs
to the view across all host profiles. For example:

```json
{"id":"resident", "name":"Resident story",
 "steps":["quiet","notify","inside","offline","leave"],
 "sectionLayout":{"default":[
   {"panel":"home","x":0,"y":0,"w":8,"h":18},
   {"controls":"steps","attachTo":"panel:home","x":0,"y":18,"w":8,"h":6},
   {"x":0,"y":0,"w":8,"h":12,"hidden":true}
 ]}}
```

Deleting a selected step updates all view selections; the editor prevents deleting
the only selected step in a view until another is selected. Panel rename updates
attachments across profiles; deleting a Home map detaches its controls.

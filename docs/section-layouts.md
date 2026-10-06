# Arrange a section and preview its host

Each named **Chapter** has one saved **Viewing mode**: **Standard** preserves the
authored tile arrangement; **Explore** gives the graph a full-height workspace
with independently placed panels and step controls that default to viewport-pinned
**Floating** placement. Each Explore Chapter can instead choose **On canvas**
for controls that move and zoom with the graph. Omitted Viewing mode settings
use Standard, so existing diagrams keep their presentation.

In the workbench, select a section and a Chapter using the
buttons above the graph. **Viewing mode** chooses Standard or Explore for
that Chapter; **Make opening chapter** saves which Chapter opens on a fresh page. The saved
choice reads **Opening chapter**. Selecting a different Chapter to inspect it does not
change the saved default or write JSON. Expand **Chapter**, enter a **Chapter
name**, and choose **Rename chapter** (or press Enter) to save it; **Duplicate chapter**
creates a separate copy. These controls let you keep a curated Standard Chapter
and an Explore Chapter of the same story side by side.

The editor and exported HTML honor the same selected Chapter: Standard uses the curated page; Explore fills the browser. A small screen icon identifies Explore on chapter and tab chips. Tabs and Chapters stay visible in either mode. **Chapter → Viewing mode** changes the selected chapter in one undoable source transaction. **Chapter → Arrange chapter and saved visibility…** opens the detailed arrangement editor; chapter name, duplication, deletion and opening-choice commands have one owner in the Chapter popover.

For a host preview, select **Responsive**, **Backstage**, or **Confluence** in
**Preview → Open page preview**. Host previews use adjustable content widths (1080 and 760
pixels initially). They simulate available space; they do not connect to a host
or reproduce its navigation, theme, permissions, or enclosing macro. Horizontal
scrolling lets you inspect a preview wider than your editor split.

To arrange a Standard view, choose **Chapter → Arrange chapter and saved visibility…**, then choose **Arrangement profile**: **Responsive**, **Backstage**, or **Confluence**. The editor displays and edits that profile independently of **Preview host**. Editing an inherited arrangement creates that profile without changing its fallback. Each panel, the data-flow diagram, and any detached step controls
get a grab bar and a lower-right resize handle. Drag either handle to snap to
a twelve-column grid. Overlapping tiles move down to remain visible. Click
**Hide arrangement controls** tucks away the fields while you drag tiles. Choose **Done arranging** to finish. Diagram nodes and Home elements
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
bar upward or shrinking the visualization. The data-flow viewport fills the
space above attached controls. Increasing the tile height reveals more of a
tall diagram; saved tile sizes are not limited by the automatic viewport cap.
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
- **Optimize layout** saves a starting arrangement for the selected arrangement profile.
  It arranges only visible elements and preserves hidden panels and Data flow
  in that layout/profile. Hidden tiles retain their saved size and position and
  reserve no space; if all supporting panels are hidden, the main tile fills the row.
  Responsive and Backstage use an eight-column main tile with supporting
  panels in four columns; without supporting panels, main tiles fill the row.
  Confluence gives the diagram and Home a full row,
  with smaller panels paired below. A declared centerpiece comes first.
- **Reset layout** removes only the selected host arrangement. The default
  arrangement applies if one exists; otherwise the existing Home/Data flow
  presentation returns. This differs from the workspace's editor-split reset.

Layouts are saved in the spec and survive JSON, HTML and Confluence export.
The selected arrangement profile, preview host and preview width are temporary workspace state. Profile selection writes no source; each arrangement edit is one Undo operation. Explore floating geometry, camera, and notes defaults remain shared across profiles; its tile visibility follows the selected profile.

Standard arrangements use a 1000-pixel reference canvas. Below that available
section width, the entire arrangement scales down uniformly, preserving tile
positions, proportions, gaps, and attached controls. Wider sections retain the
full-size row heights and fill the available width. Chapter navigation stays at
normal size. This applies to the arrangement editor, page previews, and exported
HTML; Explore keeps its independent canvas behavior and printing uses a readable
stack. Maps fit their tiles; dense panels scroll internally. Diagram Auto / Fit
width / Readable controls remain available.
Saved Chapters appear as the complete set of Chapter buttons. All Chapters reuse
the live widgets and preserve the selected alternate, step and playback state
when included in the destination view. Legacy single arrangements still have
an automatic **Data flow** choice; sections without saved arrangements retain
Home / Data flow until you create named Chapters.

On the canvas, use **Chapter → Chapter name**, then **Rename chapter** or Enter
to name the selected Chapter, for example **Front door** or **Home**. The separate page preview is read-only.
Names are up to 40 characters
and apply across that layout's host profiles. A legacy single view
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

## Multiple Chapters in one story

Use **Open file** with
[`src/starters/named-layouts.json`](../src/starters/named-layouts.json)
to try **Home story** and **Service flow**.
Home story opens in Standard with a shorter resident-facing sequence and controls
attached to Home. Service flow uses Explore for every technical stop, with the
graph filling the workspace, panels floating at its edges, and the default
Floating playback pinned in view. Its Step controls placement can also be On canvas. Both share the same step definitions, panels and execution paths.

To build that from an existing arrangement:

1. Select the existing Chapter and choose **Chapter →
   Duplicate chapter**. The copy becomes active. Open **Chapter** again and
   give it a **Chapter name**, such as **Service flow**, then choose **Rename chapter**.
2. Choose **Viewing mode → Explore** for the engineering copy, leaving
   the original in **Standard**. Each Chapter keeps its own presentation across
   every host profile; changing it is one Undo/Redo operation.
3. Select whichever Chapter should open for readers and choose **Make opening chapter**.
   Switching Chapters afterward does not change this saved opening choice.
4. To customize the curated arrangement, select its Standard Chapter and choose
   **Arrange section**. Select **Data
   flow** in **Layout element**, choose your Home panel in
   **Swap places with**, then click **Swap places**. Position, size and visibility
   exchange; other elements keep their places unless a collision needs packing.
5. In **Visible elements**, uncheck **Home** (or its authored title) to hide the
   Home panel in this view. Every panel and **Data flow** has its own checkbox;
   the checklist names the selected layout. These checkboxes are independent of
   the **Layout element** dropdown, which selects what to move, size or swap.
   To replace a visible Home with a hidden diagram directly, hide the diagram
   in the original layout before duplicating and swapping.
   Choose **Done arranging** when finished. Readers switch using the named
   buttons above the section.

Each layout owns its Responsive, Backstage and Confluence profiles. Duplication
copies its Viewing mode, path and step selections, and all profiles independently;
swapping, moving, sizing and visibility edit
the selected arrangement profile in the active layout. Sibling profiles remain unchanged. Step controls stay available, attached or detached; they cannot be hidden or
swapped with a panel. All authoring
operations support Undo/Redo. **Delete chapter** removes the arrangement, never
its panels, diagram or steps. Deleting the default selects the first remaining
layout; deleting the last named layout restores the automatic presentation.

**Reset layout** removes the selected host profile. A named layout with no profiles
left receives an automatic Responsive arrangement. **Optimize layout** preserves
visibility and rearranges only visible elements in that profile.

Arrange section, Optimize, the first duplication, or selecting **Explore** on
the canvas converts an older `sectionLayout` / `layoutName` pair into named
views as one undoable edit. A diagram without a saved arrangement can also
become an Explore view directly; there is no separate setup step. Existing
specs keep working unchanged until edited.
Reader view switches do not write JSON or create undo entries. The workbench
retains the active named view or Home / Data flow choice across property edits,
Undo/Redo, and skin/host preview changes. Renaming nodes, sections, the page, or
the primary panel does not change that choice. Opening another project uses its
authored default; deleting the selected view falls back to the remaining default.

## Explore presentation

Select the Chapter and choose **Viewing mode → Explore**. The editor opens the same
full-browser presentation used by exported HTML. Move and resize its panels
there to save their floating defaults. Chapter mode remains authoritative while arranging. **Preview → Open page preview** provides a separate reader without changing the editor.
**Legend** beside the panel controls shows the diagram's protocol colors,
line samples and response/ack key. It works in the editor, exported viewers and
agent update previews. Press Escape to close it; opening it does not edit the story.
The data-flow graph becomes the full-height workspace. Hold **Ctrl** or **Cmd** while scrolling over the graph to zoom; trackpad pinch uses the same gesture. Plain scrolling pans the graph. Each supporting panel
starts in a stack at the right edge. Drag its header to move it, drag the corner
to resize it, or use its **Hide** button. Tab to a header or resize handle and
use arrow keys; hold Shift for larger changes. Escape cancels a drag. Step
controls default to **Floating**, pinned to the viewport. Choose **Panels →
Step controls → On canvas**, or **Placement** in their inspector, to move and
zoom them with the graph. Each Chapter remembers both placements separately;
switching back restores its Floating geometry. Select on-canvas controls to
reveal their handles. Playback and step markers share the top row, with the caption below. Move the controls using the
small grip on the left; resize their corner. Drag empty canvas to pan, including
a quarter-screen beyond each edge to uncover content behind panels. The workspace
height follows the viewport and does not depend on page scroll. Content-sized
Forge macros use a fixed 760px workspace to avoid iframe sizing feedback; their
in-page expansion uses 1000px. Other content-sized hosts can set the pixel CSS
variables `--explore-height` and `--explore-expanded-height` on their viewer. The same live
widgets, selected path and step continue across Standard/Explore switches.

A section’s paragraphs and nested bullets appear together in one **Section notes**
window. The graph itself remains the full Explore canvas; notes contain only prose,
never a nested diagram or section card. Formatting, links and step-aware bullet
reveals stay live. Move, resize, stack, zoom and temporarily hide notes with the
same controls as panels. Standard restores the original prose in the document,
including its previous collapsed state. The section’s `collapsed` default affects
Standard prose only. Empty sections create no notes window. Adding the first paragraph or bullet in
the workbench creates it immediately and keeps Explore open. Adding prose also
restores notes hidden temporarily with the window’s Hide button; it does not
change saved visibility defaults. Selecting empty space inside the workbench notes window
selects only Section notes. Deleting that selection removes the section’s `text`
and `bullets`, preserving its diagram, layouts and containing section; Undo
restores the notes.

Use **Panels · N** to choose which available panels to show. Panels hidden by
the authored view or the current step are identified in that menu. **Hide
panels** clears the graph; **Restore panels** brings the available panels back.
**Stack at edge** puts them at full size in a column along the right side, adding
more columns to the left when the first one is full. Dragging a panel always
releases it for free placement, including at the top and right edges. A panel
without a saved rectangle opens at a compact width chosen by panel type and a
height that follows its rendered content; these automatic panels wrap into right-edge
columns as the lane fills. Exceptionally tall automatic content is capped at the
usable lane height and scrolls inside its panel. When the view has no saved
panel, notes or step-control rectangles and no saved panel scale, this automatic
stack uses 80% scale on desktop stages through 1280px wide and grows smoothly
to 100% at 1440px. Section notes remain at 100% independently. Stages narrower
than 800px retain 100% so the compact playback controls remain readable. An authored or manually resized
panel taller than the available stack lane stays full-size and top-aligned, with
the next panel starting a column to its left. **Expand**
opens a larger view, using browser fullscreen when available and an expanded
in-page view otherwise; **Exit expanded view** returns to the page.

Panel positions, sizes and temporary visibility while reading are workspace
state remembered independently for each view while the viewer is mounted.
They do not rewrite the authored diagram or create Undo entries. Explore uses
the selected host profile's saved visibility, while its floating positions and
sizes are independent of the profile's grid geometry.
In the workbench's full-browser **Explore** view, panel and
step-control moves/resizes save its floating defaults, with one Undo/Redo action
per gesture. Those positions and sizes survive JSON and HTML export.
Panning, zooming and fitting this full-browser canvas are temporary navigation;
they do not change the saved opening camera or add Undo entries. Standard
shows its authored tiles on the page and has no floating canvas panels. See
[workspace controls](workbench-workspace.md).
Use **Chapter → Use current camera as opening view** to save current pan and zoom, or **Reset opening camera** to restore automatic framing. Each command uses one Undo entry. Panel and control moves/resizes save independently; temporary camera gestures never enter a later panel save. **Chapter → Arrange chapter and saved visibility…** exposes element visibility, paths and steps. **Optimize layout** and **Reset layout** restore automatic stacking and sizing while respecting hidden panels.
Temporary Hide/Restore actions never change saved visibility; use **Visible
elements** for that. **Section notes** has its own saved visibility checkbox in
Explore. Reset and Optimize preserve that visibility while clearing its position
and size. Defaults are shared across host profiles and scale to the
available viewport. Duplicating a view preserves its defaults. Returning a view to **Standard** restores its authored arrangement.

Keep Standard as the default for a business presentation and add an Explore
Chapter for engineering inspection. The Viewing mode setting belongs to the named
view, never to a Responsive, Backstage or Confluence profile. Duplicating the
view preserves the setting; changing the preview host does not change it.

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

## Paths shown in each view

Under **Arrange section**, expand **Paths shown in this view** and check the
outcomes its audience needs. **Show all paths** clears the filter and includes
future paths automatically. A selected path keeps its full authored sequence;
combine this with **Steps shown in this view** when the audience also needs fewer
playback stops. At least one path must remain selected, and a view-specific step
selection must include a step reachable through one of its selected paths.

Hidden paths remain in `diagram.paths`, share the same step registry, and retain
their state definitions. They are absent from the view's path controls, playback,
print step list, deep-link fallback and GIF frames. A path-only link to a hidden path falls back
to an available path. Exact workbench and detail-step navigation may temporarily
preview a hidden path without changing the saved filter. Switching views retains
the selected path when it remains available; otherwise it opens the first
available selected path.

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
the playback status says **Previewing a hidden step**. Exact navigation can also
preview a path excluded from the view. Arrows, Play or clicking
the view button return to its saved selection. This does not change the spec.

Chapters are the complete set of buttons; there is no additional automatic
Data flow mode. Name any Chapter **Data flow** and choose the diagram, panels and
attachment it should show. **Make opening chapter** chooses the Chapter that opens first.
Older specs without named layouts keep their automatic Home/Data flow behavior.

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
  {"id":"home-story", "name":"Home story", "presentation":"standard", "paths":["happy"], "sectionLayout":{"default":[
    {"panel":"home","x":0,"y":0,"w":8,"h":12},
    {"x":0,"y":18,"w":8,"h":12,"hidden":true},
    {"controls":"steps","x":0,"y":12,"w":8,"h":6},
    {"panel":"phone","x":8,"y":0,"w":4,"h":12}
  ]}},
  {"id":"service-flow", "name":"Service flow", "presentation":"explore", "sectionLayout":{"default":[
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
Optional `layouts[].presentation` is `"standard"` or `"explore"`; omission means
`"standard"`. It applies across the view's host profiles. Invalid values warn
and fall back to Standard without dropping the view. Legacy single arrangements
always use Standard. Explore uses the same story, widgets and saved visibility;
its reader panel movement and sizing do not alter tile coordinates.
Optional `layouts[].exploreLayout` saves floating defaults separately from the
grid. Positions and dimensions use fractions of the Explore viewport. Panel
width/height and control height describe their size at 100% content scale;
control width is its horizontal span and does not change with content scale.
Optional `overlayScale`
(0.5–1.25) scales floating panels and step controls together,
independently of diagram zoom. The **Panels & controls** minus/plus buttons
change this scale; clicking its percentage saves an explicit 100% reset. A layout
with saved panel, notes or controls geometry and no `overlayScale` uses 100% for
backward compatibility. A pristine layout with neither geometry nor an explicit
scale responds to desktop stage width: 80% from 800px through 1280px,
increasing smoothly to 100% at 1440px. Narrower stages retain 100% so the
compact playback controls remain readable. The first drag or resize saves the effective scale with the new
geometry, so the window does not jump in size. Panel headers and
drag/resize targets remain usable. Right-docked panels stay at the edge. Step
controls shrink vertically while keeping their width: automatic bars fill the
available space; manually sized bars retain their chosen span. Camera
`x`/`y` describe its center as fractions of the SVG viewBox width/height, and
`zoom` is the rendered scale (0.15–4). Omitted entries use automatic placement.
An omitted panel rectangle uses the panel type's compact width, a height based
on rendered content, and the wrapped right-edge columns described above. The
renderer clamps windows to the available viewport and practical minimum sizes.
Invalid optional entries warn and fall back independently.

```json
"exploreLayout": {
  "overlayScale": 0.75,
  "prosePlacement": "floating",
  "panels": [
    {"panel":"outcome", "x":0.72, "y":0.02, "w":0.26, "h":0.3, "stacked":true}
  ],
  "prose": {"x":0.04, "y":0.12, "w":0.3, "h":0.38, "stacked":false},
  "controls": {"x":0.02, "y":0.83, "w":0.68, "h":0.14},
  "steps": {"textPosition":"right"},
  "camera": {"zoom":1.2, "x":0.5, "y":0.45}
}
```

Explore's **Panels** menu shows a **Placement** control for each named panel:
**Floating** keeps it anchored to the viewport; **On canvas** moves and scales
it with the graph. A chapter can mix both. **Default placement** sets the fallback
for panels without an individual override.
Changing that default preserves existing per-panel overrides.

`exploreLayout.panelPlacements` is an array of `{panel, placement}` overrides.
Each `panel` must be a unique existing ID and `placement` must be `"floating"`
or `"canvas"`. Omitted entries use the legacy `exploreLayout.panelPlacement`,
which still accepts `"floating"` or `"canvas"` and defaults to Floating.
Section notes have their own **Placement for Section notes** selector in Panels.
`exploreLayout.prosePlacement` accepts `"floating"` or `"canvas"`. For older files
that omit it, notes open at the saved `panelPlacement` (Floating if omitted).
The first placement edit preserves that initial notes placement explicitly,
so changing the default or any individual panel cannot move notes. Workbench
changes save with one Undo/Redo operation; reader changes stay in the session.
Notes keep separate floating `prose` and graph-unit `canvas.prose` rectangles.
Drag the notes header or resize its corner in either placement; select canvas
notes first to reveal these handles. Floating notes use 16px body text at 100%
scale, independently of the Panels & controls size setting. Canvas notes use
fluid logical body text: 26px at a 1280px browser width, decreasing smoothly to
19px at 1920px, clamped to that range. New canvas rectangles start 440 graph units
wide with a height fitted to the content. Unsaved notes keep fitting through
browser resizing until moved, resized, or saved as an authored rectangle.
Saved rectangles retain their dimensions. Canvas
notes move and scale with diagram zoom; manual zoom-out makes their text smaller.
Saved placement declares `layout.explore-prose-placement`.

The **Step controls** placement selector in Panels, also available in the step
controls inspector, independently saves `exploreLayout.controlsPlacement` as
`"floating"` (the default) or `"canvas"`. Existing files keep floating playback.
`exploreLayout.controls` retains its viewport-fraction rectangle;
`exploreLayout.canvas.controls` stores a separate `{x,y,w,h}` graph rectangle
with the same coordinate bounds as canvas panels. Both survive placement changes,
chapter changes, preview rebuilds and host-profile changes. Missing canvas geometry
starts below the diagram and switching to it fits the canvas to reveal it.

On-canvas controls pan and zoom with the diagram and participate in Fit canvas.
They do not reserve a viewport overlay area. Click or focus the controls to reveal
move and resize handles; both handles accept arrow keys and Shift for larger moves.
Playback remains usable in either placement. Workbench placement, drag and resize
save one Undo action apiece; reader changes remain temporary. Canvas controls use
graph zoom for sizing; the panel-size control applies to floating content.
In Workbench, Alt marquee and the object menu support selecting, inspecting and
fitting canvas controls. Duplicate, delete, group movement and alignment remain
limited to nodes and panels; use the controls' handles for movement and resizing.
Saved placement or canvas-control geometry advertises the
`layout.explore-controls-placement` compatibility capability.

Floating rectangles remain in `exploreLayout.panels`. Independent
`exploreLayout.canvas.panels` and `.prose` rectangles use graph units measured
from the upper-left of the SVG viewBox. Coordinates may be negative; all values
must be finite and within ±10000, with positive `w` and `h`. Toggling a panel
preserves both rectangles, visibility, and the current step/path. The whole
canvas window scales with diagram zoom, including its header and contents.
Floating panels retain their responsive or authored `overlayScale`; optional
`canvas.controlsScale` (0.5–1.25) independently preserves floating playback sizing
when canvas objects are present. With mixed panel placement and floating playback,
**Floating panels & controls** sizes both together. With all panels on canvas and
playback floating, **Controls** changes playback only. With playback on canvas,
**Floating panels** sizes the remaining floating panels.

**Fit canvas** includes the diagram and currently visible on-canvas objects,
and reserves space for visible floating panels and fixed playback. Hidden
objects are excluded. The normal zoom floor is 15%; canvas objects extend it
as needed to recover distant objects. Canvas-capable layouts can save camera
zoom down to 0.001 and SVG-relative centers within ±10000. Ctrl/Command-wheel
or trackpad pinch keeps the graph point under the pointer stable. Drag a header
to move a window or its corner to resize; focused handles accept arrow keys
(Shift for larger increments).

```json
"exploreLayout": {
  "panelPlacement": "floating",
  "panelPlacements": [{"panel":"outcome","placement":"canvas"}],
  "panels": [{"panel":"home","x":0.72,"y":0.04,"w":0.25,"h":0.4}],
  "canvas": {
    "panels": [{"panel":"outcome","x":1200,"y":40,"w":320,"h":240}]
  }
}
```

Missing canvas rectangles start beside the diagram. Reader changes last only
for the session. In the Workbench, switching placement or completing a move/resize
is one Undo/Redo action and is included in exports. Panel rename/delete updates
placements and both arrangements; duplicate chapter copies them. Overrides
advertise `layout.explore-panel-placement` compatibility. Saved canvas geometry
also advertises `layout.explore-canvas`, even while dormant. Notes visibility
remains in `exploreLayout.prose.hidden`; panel visibility remains in the chapter's
grid items.

`exploreLayout.steps.textPosition` places the current-step caption `below`,
`above`, `left` or `right` of the path controls; omission means `below`. In the
workbench, click the Explore caption or empty step-control surface to open its
inspector. Path tracks remain scrollable when they exceed the saved window.

`exploreLayout.prose` configures the single notes window for that section.
Optional `hidden:true` saves visibility for this named view across host profiles;
it can be used alone. If supplying geometry, include all four `x/y/w/h` viewport
fractions, with positive width and height. Width and height are at 100% content
scale. Optional `stacked:true` docks it at the edge. Omitting the object uses the
automatic stack. It does not create prose or copy it into `diagram.panels`: content
continues to live in the section’s `text` and `bullets`. A prose-only section
without a diagram remains normal page content.

Readers can move these windows and change framing for their own session without
rewriting the spec. Only the workbench connects the renderer's authoring callback
to source edits. The `layout.explore-defaults` capability identifies specs that
need a viewer supporting saved defaults. `layout.explore-scale` identifies saved
overlay scaling. `layout.explore-prose` identifies sections with prose and an
Explore view, or any saved notes defaults. Workbench scale changes save to the selected Explore view with
one Undo action per click; reader scale changes last only for that viewing session.

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

Optional `layouts[].paths` is a nonempty list of unique existing path IDs. Omit
it for all paths; list order does not reorder path controls. The selection belongs
to the view across all host profiles. The workbench prevents an edit from leaving
a view without a reachable selected path and step.

Optional `layouts[].steps` is a nonempty list of unique existing step IDs. Omit
it for all steps; list order does not reorder the story. The selection belongs
to the view across all host profiles. For example:

```json
{"id":"resident", "name":"Resident story",
 "paths":["happy"],
 "steps":["quiet","notify","inside"],
 "sectionLayout":{"default":[
   {"panel":"home","x":0,"y":0,"w":8,"h":18},
   {"controls":"steps","attachTo":"panel:home","x":0,"y":18,"w":8,"h":6},
   {"x":0,"y":0,"w":8,"h":12,"hidden":true}
 ]}}
```

Deleting a selected step updates all view selections; the editor prevents deleting
the only selected step or path in a view until another is selected. Panel rename updates
attachments across profiles; deleting a Home map detaches its controls.

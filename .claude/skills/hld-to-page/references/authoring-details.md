# Spec mechanics and presentation

Read the sections relevant to the chosen widgets and delivery surface. Paths in
this file are relative to VIZ. The contract and executable examples remain the
schema authority; this reference collects non-obvious authoring decisions.

### Route current storytelling requests before proposing a layout

These capabilities already exist. Load the matching recipe/guide, not every row:

| The source or operator needs… | Read |
|---|---|
| Highlight changed nodes, edges, or steps with optional click details | `docs/delta-markers.md`; keep `delta: true`, add plain `deltaText` and HTTP(S) `deltaLinks: [{label?, url}]` |
| Confluence-ready JSON or an exported file for the Forge viewer | `docs/confluence.md`; company deployment agents also read `docs/confluence-integration.md` |
| Happy and failure outcomes on the SAME diagram; aligned alternate timelines | `cookbook/alternate-paths.md`, `docs/alternate-paths.md` |
| Domain cards that open focused internals; a child flow matching the current outcome | `cookbook/domain-drilldowns.md`, `docs/drilldowns.md`; stable section IDs, `detailOnly`, `node.detail`, explicit `stepMap` and `mode:"focus"` |
| A send that never arrives, or a communication that is never sent | `docs/failed-communications.md` (also demonstrated in the alternate-path recipe) |
| Multiple message contracts, request/response tables side by side or stacked, payload previews on active wires | `docs/contract-blocks.md`; use `section.contracts`, stable block IDs and widths 4/6/8/12; optional `wires: [{step, edge, path?}]` binds a contract to a stable step and active edge |
| Inline backticks or fenced code in descriptions, bullets, notes or step captions | `contract/authoring-contract.md` → Prose markup; labels inside nodes and panels stay plain |
| Copy/share steps across paths, converge after translation, continue an ending, or detach a shared step | `docs/workbench-step-reuse.md`; `docs/alternate-paths.md` for shared middle blocks and endings (reuse consecutive IDs, not copies; paths can split and rejoin again) |
| Copy/paste Home elements, panels, nodes or sections between diagrams | `docs/workbench-clipboard.md`; copies are independent, with fresh IDs where scopes overlap |
| Open a step view paused or playing; clarify Play / Pause state | `contract/authoring-contract.md` → `view` and `autoplay` |
| A large home map, live Home / Data flow switching, or per-step placement | `cookbook/home-story.md`, `docs/homemap-workbench.md` |
| Outside grounds, a centered whole house, a porch/entry split, or doors in walls | `cookbook/outdoor-home.md`, `docs/homemap-workbench.md` |
| Camera recording before an event, color clips, doorbell runners, fire, or delivery | `cookbook/camera-events.md` plus `tools/widget_doc.py screen` |
| Device app data tiles with notifications, optional provenance and partial refresh | `cookbook/device-app-sources.md`; `deviceapp` supports `notify`/`clear` alongside fields; omit sources or use `showSources:false` for just the phone |
| Sensing geometry, motion events, range, or room presence | `cookbook/motion-detection.md`, `cookbook/radar-range.md`; Radar alerts are authored separately from geometry |
| Honeycomb trace JSON, readable service rows, or a service's internal wall time | `docs/trace-import.md`; `src/starters/honeycomb-trace.json` / `src/starters/complex-trace.json` |
| Starting a project, importing spec JSON, templates, or copyable agent prompts | `docs/workbench-welcome.md`; the welcome screen replaces the old Starters gallery |
| Adding workbench nodes, connections, steps or panels; choosing an insertion destination | `docs/workbench-workspace.md` → Add to diagram and Alt/Option-click quick connections; `docs/workbench-panel-picker.md` for the visual library |
| Company service/API choices, repository catalog sync, or nginx-bundled service references | `docs/workbench-catalog-sync.md`; use the approved `workbench/catalog.json` identities, never infer bindings from display labels |
| Left editor rail (Inspect, Steps, Outline, JSON, File), resizing, focus, or diagram fit controls | `docs/workbench-workspace.md`; global Add/Undo/Redo/Save are in the project toolbar; catalog and import/export controls are in File |
| Database/payload state, checks, budgets, retry/circuit behavior, replicas, or rollout decisions | Matching recipes in `cookbook/README.md` and the corresponding widget docs |
| Compare messaging routes, engineering components and costs at one workload | `cookbook/messaging-cost.md`, `python3 tools/widget_doc.py cost`; use its stacked bars and Auto/Compact/Expanded density controls |

Paths, failed communications, centerpiece views, scene-event controls, and
fit controls need no schema-version flag. An old self-contained HTML page
must be rebuilt with a current template to gain new rendering behavior;
adding a made-up version or zoom field to its spec cannot update its engine.

For domain drilldowns, author child flows as ordinary sections and attach
`detail` to the parent node. Preserve section IDs when headings change; use
`detailOnly:true` to hide details from the initial reader view and Explore Story
selector. Readers open them through the domain node and return with the breadcrumb. Map failures
to explicit child paths and steps. Author only `mode:"focus"` for local details.
Inline expansion is removed: never emit `mode:"expand"` or `detail.ports`.
When reusing an older seed, replace its expansion modes with `focus` and omit
ports. A mapping selects a reading position; it does not
run a simulation or derive the parent outcome. External specs use approved
host identities and an injected loader, never renderer-side URL fetching.
Stamp the `flow.drilldown` capability with the compatibility tool.
Focused drilldowns automatically display an ancestor overview map highlighting
the entered domain. Use clear domain titles for its location trail; do not add
a duplicate panel or copy of the overview to simulate this context map.

Step views now open paused unless `diagram.autoplay` is strictly `true`.
For an automatically playing story use `view:"step", autoplay:true`; do not
assume `view:"step"` starts playback by itself. The workbench exposes this in
Steps → Playback settings and keeps its editing preview paused. Published
Confluence snapshots honor the same setting; configuration previews stay paused.

In the workbench, **Edit layout** on a homemap opens shared size/room/device
settings from either view. Ambient map clicks select this layout inspector;
step markers select per-step controls unless the layout is already selected.
Use **Edit shared home layout** / **Edit home at current step** to switch scope.
The shared inspector has its own drag map, available without steps: drag rooms,
devices, doors and starting subjects; use the House grip to move the outline
and square corners to resize it or rooms. Faded subjects stay initially hidden.
These edits preserve all per-step overrides; numeric fields remain available.
Rooms, Devices and Subjects are collapsible groups with individually collapsible
named elements. Expand a group and an element for its fields; new items open
automatically. Disclosure state is an editor preference, never a spec field.
For outside scenes use room `kind:"outdoor"` and position the house with
`outline:{x,y,w,h}` (omitted x/y centers). For architectural doors use entry
`display:"door"`, hinge x/y, `facing`, `doorWidth`, and signed `doorSwing`;
ordinary `open`/`closed`/`alert` patches control the leaf on each path. Existing
entry markers remain unchanged. These are presentation geometry, so explicitly
author subject movement and sensor states. The outdoor recipe includes both
starter layouts; do not invent a separate doors array or schema version.

**Choose the main view.** A `homemap` or other panel can be the centerpiece
with `diagram.primaryPanel: "<panel-id>"`. Existing homemaps support live
Home / Data flow switching while retaining the selected step and path.
Home view maximizes the map up to its height limit (70vh; 560px in Confluence)
and derives its width from the aspect ratio. Supporting panels fill surplus
horizontal space in responsive columns, or sit below on narrow pages.
No additional spec setting is required.
Home device states use animation instead of state chips; subject labels
are hidden unless `showSubjectLabels:true` is declared on the panel. Map
device/room coordinates are shared layout; subject positions are sparse
step patches. Device and room dragging in the step inspector changes all
paths, while subject dragging edits the selected step. These are authoring
coordinates in the 320×180 frame, not physical dimensions or sensor evidence.

**Arrange for the delivery surface.** For independently positioned/resized
panels and data-flow diagrams, use `diagram.sectionLayout` with `default`,
`backstage`, and/or `confluence` profiles. Read `docs/section-layouts.md` for the
12-column tile contract and a complete example. Use `{controls:"steps",x,y,w,h}`
for an independent playback/path/caption tile;
omitting it keeps controls attached to the diagram. Arrange section preserves
existing combined controls; choosing Detached separates them. The workbench's Arrange section
and Optimize layout controls author these profiles; its host/width preview is
temporary. Forge selects Confluence automatically; catalog viewer links select
Backstage. Missing profiles fall back to default, then the existing layout.
Every row diagram has **Auto / Fit width / Readable** viewing controls, including
curved edges. Do not enable lane routing just to expose sizing; these choices
do not modify the spec or routing. Auto scales smoothly with column width;
Readable keeps labels larger. Regular views also support background drag-to-pan,
−/+ and Ctrl/⌘-wheel zoom, and Fit diagram. These are temporary viewing controls.
Overflowing diagrams show mouse-friendly
**Scroll** arrows and a draggable position slider under the view choices;
no spec field enables them. See `docs/workbench-workspace.md`.
Use `diagram.layouts:[{id,name,sectionLayout}]` for several named views of one
story; `defaultLayout` selects the opening ID. Set `layouts[].presentation` to
`"standard"` or `"explore"` (omitted means Standard). Use a default Standard view
for business storytelling and an Explore view for engineering inspection:
Explore fills the workspace with the graph, floats independent draggable,
resizable, hideable panels at its edges, and defaults step controls to viewport-pinned
Floating placement. Each chapter can choose On canvas in Panels or the controls
inspector. Save `exploreLayout.controlsPlacement` as `"floating"` (default) or
`"canvas"`. Preserve the Floating viewport-fraction rectangle in
`exploreLayout.controls` and the separate `{x,y,w,h}` graph rectangle in
`exploreLayout.canvas.controls` (finite values within ±10000, positive sizes).
On-canvas controls move and zoom with the graph; select them for move/resize
handles. Fit canvas includes them without reserving viewport overlay space. A section’s
paragraphs and nested bullets become one **Section notes** window using the same
controls; only prose floats there, never the diagram or an entire section card.
Keep content in `section.text`/`bullets`, not fake diagram panels. Optional
`exploreLayout.prose` saves `x/y/w/h` viewport fractions together, plus `stacked`
and `hidden` booleans; `{hidden:true}` can stand alone. Use independent
`exploreLayout.prosePlacement` (`"floating"` or `"canvas"`) and retain the separate
`canvas.prose` graph rectangle. Older files initially inherit `panelPlacement`;
placement edits preserve that initial notes placement. Floating notes use 16px
text at 100% scale, unaffected by panel sizing; resize their own window.
Canvas notes use fluid 19–26px logical text across desktop browser widths and a
new 440-unit-wide content-sized rectangle.
They move and scale with diagram zoom; zooming out makes their text smaller.
**Visible elements → Section notes** saves visibility per view;
the window’s Hide button is temporary. Adding the first paragraph or bullet in
the workbench creates notes and keeps Explore open; later additions restore
temporarily hidden notes without changing saved visibility. Standard restores the prose and its prior
collapse state; `section.collapsed` does not hide Explore notes. The setting
belongs to the named view across every host profile. It does not duplicate
story state. In the editor, **View type** beside the view buttons
selects Standard/Explore, and **Make default** chooses which view opens in the
built HTML. **View options** renames or duplicates the current view. These are
saved authoring settings; the editor and exported HTML display the same type:
Standard uses the curated page, and Explore fills the browser. **Back to page**
reveals the surrounding document and contained Explore view; **Open Explore**
returns to the full-browser view. Navigation does not change the saved type;
selecting another view or section follows its type again. The same **View type**
dropdown stays in the shared view header on both surfaces; **Arrange section**
provides the contained-view arrangement controls. In an Explore view, panel and
step-control moves and resizes save to `layouts[].exploreLayout` from either
editor surface, with one Undo action per gesture. Full-browser panning, zooming
and fitting remain temporary. Use **Back to page** to author the opening camera
through pans and zoom changes in the contained Explore view. Floating windows use viewport fractions; canvas controls use graph coordinates. `camera` uses
`zoom` plus center `x`/`y` as fractions of the SVG viewBox. Duplicate view keeps
these defaults. **Panels & controls** has a separate zoom for the floating content.
Use `exploreLayout.overlayScale` from 0.5 to 1.25 (default 1); panel width/height
and Floating control height are 100% dimensions. Floating control width retains its chosen span
at every scale. This scales floating panel bodies and Floating step typography together
without changing the diagram camera. Workbench adjustments save with Undo;
click the percentage to reset to 100%. Reader overrides and temporary Hide panels remain session-only.
See `docs/section-layouts.md` for the contract and an example.
Duplicate view and Swap places
can replace Home with the diagram while retaining supporting panels and controls.
Use explicit tile `hidden:true` for per-view visibility; all views share one set
of steps and paths. Optional `layouts[].paths:[IDs]` limits a view to selected
outcomes without duplicating the diagram, panels, or step registry. Omit it for
all paths. The workbench's **Visible elements** checklist names the
selected layout and provides a separate checkbox for Data flow and each panel.
**Optimize layout** preserves hidden tiles and arranges only visible elements
in the selected view/host profile. Add `attachTo:"diagram"` or
`attachTo:"panel:<homemap ID>"` to a controls tile to share that host's outline;
omit for detached controls. The controls tile's `h` reserves its height inside
the host; size the host for both the visualization and controls. Long captions
scroll without moving that boundary. In Arrange section, resize the attached
controls with their ↕ handle or **Attached controls height**; Optimize retains it.
Optional `layouts[].steps:[IDs]` selects playback
stops while retaining full-path state folding, so a business view can skip
technical detail. The workbench exposes **Steps shown in this view** and
**Step controls** attachment. See `src/starters/named-layouts.json`. Saved arrangements
have only their named view buttons; Data flow can be an ordinary named view. For a legacy single layout, optional `diagram.layoutName` names the arrangement
(1–40 characters; default Layout), shared across host profiles. Readers can
Hide/Show data flow within that arrangement while keeping panels and playback.
Visibility is temporary and does not remove diagram tiles from the spec.
Preserve panel IDs and story state; tile geometry is not evidence. Do not change
Home coordinates, steps or paths to fit a host. Verify the intended desktop/embed
width in preview, and the real installed host separately when available. Phone
layouts are optional unless the user requests mobile support.

**Facts vs authoring geometry.** Story numbers — anything the reader sees
or that drives a computed outcome: durations, thresholds, counts,
capacities, temperatures, stated geometry like a 130° field of view — go in
VERBATIM with a ledger row. Where a widget takes real units, enter them in
the HLD's units (radar `scale:{pxPerUnit,unit}`; sector zones in real
units; polygon `points` stay pixels — prefer sectors when the HLD gives
real geometry). Cartesian subject positions and polygon points remain in
pixels; draw them proportionally and put any sourced physical figure verbatim
in visible text. Never type feet into a pixel field. Authoring geometry is what
the HLD does NOT state (pixel placement, sensor origin, subject paths): choose
it to represent the source faithfully. Geometric occupancy is not evidence
that a real sensor detected a person or raised an alarm. Never invent business identifiers,
sequence numbers, or finer breakdowns than the document gives. Internal
node/panel/step/path IDs are authoring references: choose stable, unique
ones without presenting them as identifiers from the source system.

**Distinguish geometry from authored decisions.** Radar computes distance and
zone occupancy. Its `alert` is manual state: default false, explicitly true
at the alarm beat and false at the clearing beat, with normal sparse-state
inheritance on each path. Threshold arcs, wedge entry, occupied zones and
subject removal never change it automatically. Thermo/battery bands compute
from sourced values and limits. `zoneframe.verdict` is authored as well; check
its scene and decision against the source. Preserve factual PIR hardware
labels when present, but use the supported Radar panel for the sensing view.

**Prose restates, never derives.** Step text and bullets may carry what
edges can't (acks, repeats, relay hops) — that is legitimate and
load-bearing. But copy the actor and the number from the HLD sentence; no
new arithmetic, no new attributions.

**Communication/playback rules and remaining limits** (report any workarounds):

- One addressable edge per `from->to` pair — a second message between the
  same pair in the same direction lives in step text or a log line. A
  return message is its own opposite-direction edge with `"ret": true`.
- Failed sends use `step.failures:{"from->to":"dropped"|"blocked"}` on an
  existing edge: dropped means attempted but not delivered; blocked means
  not sent. A received error response or timeout alone does not prove loss.
  Failures are step-local; repeat them on a later beat if the break should
  remain. Focus, node tones, and panel outcomes are authored separately.
- `screen.mode` describes the camera (`off|boot|active|live|rec|save`), while
  `scenePlayback:"waiting"|"playing"` controls the simulated event separately.
  Use `active` for a camera that is on without livestreaming or recording:
  the scene stays visible with white ACTIVE text and no colored badge/dot.
  Record with `mode:"rec",scenePlayback:"waiting"`, then patch only
  `scenePlayback:"playing"` when the action happens. Both carry along the
  selected path; omission defaults to playing for existing specs. Stock
  color clips are illustrative SVG animations, not footage or measured
  event durations. There is no separate recorded-media playback mode;
  describe a saved clip with `save` + banner or step text. See the camera recipe.
- Buffers: `mark` only cells the story has written (the `head` shows the
  write position); `dropped` (red) exactly when data was LOST, `empty` for
  mere reuse. Every threshold a panel declares (`warn`/`low`/`crit`) is
  exercised by some step, or its non-exercise is a deliberate ledger row
  with the normal covered/out-of-scope disposition.
- Pick 0-based index language and keep it; when the HLD's unit differs from
  the widget's cells, state the conversion once in a caption or bullet.
- Step hygiene: every step carries an edge, nodes, a patch, or `failures`.
  Several steps may start with the same edge (a repeated heartbeat, a retry);
  each gets its own numbered circle. Keep `edges` in true firing order; an
  overflowing edge label gets shortened, not nudged.

## Graph placement and connection schema

For ordinary new-diagram authoring, follow SKILL rule 12: use unpositioned
floats and automatic connections, then run the production Auto Arrange CLI or
use the Workbench button. The fields below document existing specs and explicit
user-directed layout work. Do not introduce them merely to improve appearance.

For an existing diagram, append a raw float
`{id:"<new-node-id>",side:"below",noSpread:true}` plus its semantic edges.
`noSpread` keeps this unpositioned insertion outside existing automatic float
spacing and lane routing, so established node positions and routes stay stable.
Do not add X/Y, ports or route fields. Tell the user that Workbench **Auto
arrange** can replace the whole diagram layout if they want. The Workbench
**Add to diagram → Node** action uses the same marker with a product-chosen
position.

Existing `rows` arrays are in visual left-to-right order. A stack occupies one
slot, with its members in top-to-bottom order. Each row retains its authored
horizontal order when other rows are added, moved, or removed. Cross-row edges
follow their endpoint positions; steps and edges define the story order.

### Manual node placement and edge ports

Use `floats:[{id,side:"below",x:430,y:220}]` for freely placed cards. X/Y are
the center in diagram units, not screen pixels; Y increases downward. Fixed
positions override automatic placement and nudges. Preserve an existing float's
side when pinning it so the row headroom stays stable. All-free diagrams use
`rows:[[]]`. Row layout and order remain automatic. Do not duplicate placement
of one node in both rows and floats.

Only when the user explicitly requests manual routing, use optional
`edges[].fromPort` / `toPort` objects to pin exit/entry:
`{side:"right",offset:0.25}`. Offset is 0–1 along the side, starting at its left
or top. These edges use curves, including in lane diagrams; other edges retain
their routing. Neither pinning nor manual placement guarantees no overlaps.
Inspect the rendered result and use bends/label nudges if needed. Workbench
controls are **float → Free placement**, **Float X/Y**, and **Exit / Entry side**
with **position (%)**. See `docs/free-node-placement.md` and the executable
`examples/free-placement/free-placement.spec.json` example.
Shift-select floats in one section and use **Align horizontal** (same Y) or
**Align vertical** (same X), anchored to the first selected node. Drag any member
to move the selection together; each alignment or group drag is one Undo action.
Row nodes must first be switched to Free placement. In Workbench Explore,
Alt/Option-drag empty canvas to select intersecting nodes, canvas panels and
on-canvas step controls. Step controls support Inspect and Fit selection; use
their own handles for movement and resizing. Delete, Duplicate and alignment
remain node/panel actions.
Right-click a selected member for Inspect, Delete, Duplicate, or alignment.
Mixed alignment uses visible centers (horizontal = same Y, vertical = same X),
anchored to the first selection; each edit is one Undo action. Floating panels,
prose and Floating playback controls are excluded from marquee selection.

## Human handoff in the workbench

Inspector actions sit above the form; paragraph and bullet structure actions
precede their text. Muted disclosure headers start closed on a fresh selection
and retain the user's choice during edits. Expand **Starting state**, a step's
panel group, **Diagram handoff**, or **Domain detail** before editing it.
Handoff/detail Apply and extraction Download/Apply/Cancel stay at their group
top; ordinary fields auto-commit. Explicitly selecting or creating a Home
element reveals its own editor. List Add stays above the items, with each
item's remove and reorder controls kept local.

Panel inspectors use **Change panel type…** to open the visual library and an
explicit replacement review. Replacement seeds the registered template and
instantiate hook, preserves ID/title/visibility, diagram layouts and centerpiece,
and keeps branding only for compatible types. Old type-specific setup, including
unknown imported keys, is listed and discarded. All state overrides for that
panel are removed from registry steps and legacy `patch` aliases on every path;
`panelVisibility`, other panels, captions and path membership survive. Controls
attached to a panel that cannot host them become detached with their geometry
intact. The review offers original diagram JSON for backup; one Undo restores
the full change. Treat replacement as a new panel-state authoring task.

Camera and Device App have typed **Starting state** controls in the panel
inspector. Set defaults there and authored changes on steps; keep advanced
initial fields intact. Phone and Device App also offer a shared notification
composer for initial and per-step messages; clear runs before add.

Checks, Budget, Table and Log have typed starting/step collection composers.
Checks `results`, Budget `values` and Table `rows` replace the complete field
snapshot; omitted inner entries do not carry independently. Empty table rows
clear the table. Log `log` appends events at that step; `[]` adds nothing rather
than clearing history. Inherit removes the whole step field. Typed table cells
preserve scalar types and unknown fields. Keep advanced imported shapes intact.

Inflight, Timeline, X-ray, Buffer and App screens also have typed state controls,
but their arrays do not share one fold rule. Inflight has no Starting state:
`start`, `end` and `mark` are operations on the selected step. Timeline `events`
and `miss` append. X-ray `layers` and Buffer `cells` are complete snapshots;
Buffer `mark` appends ordered range paints until a later cells snapshot resets
the base. App screens keeps its upload and per-step chooser, with explicit
default / no-screen / set choices for the starting screen. Leave unsupported or
ambiguous imported shapes in Advanced JSON rather than rewriting them.

Camera fields and Phone audio expose carry-forward / this-step-only duration
and Inherit. Audio is a whole snapshot, not per-property inheritance. Imported
carry + `enterOnce` pairs retain both assignments during ordinary value edits;
an explicit duration choice keeps the temporary value and replaces the pair.

Whole panels use declaration `visible:false` and step
`panelVisibility:{id:false|true}`. The inspector exposes Starting visibility and
per-step Show / Hide / Inherit. Visibility carries along each path, including
skipped stops; hidden panels keep space and receive state updates.
Layout-hidden panels stay hidden; ambient shows all included panels. Do not
confuse this with Device App card visibility.

Local drilldowns expose parent-event → child-path/event rows and a saved-target
preview. Mapping omissions inherit detail defaults; explicit null suppresses an
inherited default. Imported numeric child positions retain their type until
edited.

Humans can start section prose with **Add to diagram → Paragraph** or
**Bullet point**, using the **Section** selector to choose the destination. These append to `text`
or `bullets`, work without a diagram, select the new item, and open page preview
when Explore hides prose. Empty section inspectors offer **Add an introduction**
and **Add first point**. Insertions focus and select the placeholder text for
replacement. Paragraphs support add before/after, move up/down,
and deletion. Existing string `text` becomes an array when another paragraph
is added. Nested bullets support siblings/subpoints, indent/outdent, reorder
and deletion of complete subtrees. Each structural action has one Undo/Redo.
Clicking empty space in the Explore notes window selects Section notes; deleting
it removes only `text` and `bullets`, preserving the section and diagram. Use the
window’s × button for temporary hiding instead of changing the authored content.
Prose formatting buttons write the existing safe emphasis, HTTP(S) link,
inline-code and fenced-code syntax. Bare diagrams need a page section before
they can hold prose. Step captions and other prose fields also accept typed
Markdown bullets: start each line with `- `, `* `, or `+ `, indent child bullets
by two spaces, and end a list with a blank line. Encode newlines as `\n` in JSON.
Keep one beat’s bullet details inside its `text`; section points with independent
reveal timing belong in the structured `bullets` / `sub` fields.

Fragment inspectors expose **Visibility by path position** for edges, bullets,
and contract rows. The UI is one-based; `revealAt` / `hideAt` remain zero-based
positions in each full selected path, including stops hidden by a view. Show is
inclusive, Hide starts at its bound, and ambient shows all fragments.

Connections expose all built-in protocols and custom name/color creation; story
lanes use the same document-wide vocabulary controls. See the workbench User
guide → Visual panels.

### Publishing the workbench Canon library

Root `canon.json` selects published diagram folders and ownership. Save authored
JSON and generated HTML together under `diagrams/<id>/`, then run the normal
build. It validates the sources and generates `workbench/diagrams.json` as a
metadata-only index with relative spec URLs. Never edit that generated index or
copy diagram bodies into it. Deploy the source spec paths alongside the index;
the workbench fetches a spec when a reader opens it. See
`docs/workbench-canon-library.md` for direct links and deployment details.

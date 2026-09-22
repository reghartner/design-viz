# Spec mechanics and presentation

Read the sections relevant to the chosen widgets and delivery surface. Paths in
this file are relative to VIZ. The contract and executable examples remain the
schema authority; this reference collects non-obvious authoring decisions.

### Route current storytelling requests before proposing a layout

These capabilities already exist. Load the matching recipe/guide, not every row:

| The source or operator needs… | Read |
|---|---|
| Confluence-ready JSON or an exported file for the Forge viewer | `docs/confluence.md`; company deployment agents also read `docs/confluence-integration.md` |
| Happy and failure outcomes on the SAME diagram; aligned alternate timelines | `cookbook/alternate-paths.md`, `docs/alternate-paths.md` |
| Domain cards that open or expand internals; a child flow matching the current outcome | `cookbook/domain-drilldowns.md`, `docs/drilldowns.md`; stable section IDs, `detailOnly`, `node.detail`, explicit `stepMap` and child boundary nodes |
| A send that never arrives, or a communication that is never sent | `docs/failed-communications.md` (also demonstrated in the alternate-path recipe) |
| Copy/share steps across paths, continue a happy ending, or detach a shared step | `docs/workbench-step-reuse.md` |
| Copy/paste Home elements, panels, nodes or sections between diagrams | `docs/workbench-clipboard.md`; copies are independent, with fresh IDs where scopes overlap |
| Open a step view paused or playing; clarify Play / Pause state | `contract/authoring-contract.md` → `view` and `autoplay` |
| A large home map, live Home / Data flow switching, or per-step placement | `cookbook/home-story.md`, `docs/homemap-workbench.md` |
| Outside grounds, a centered whole house, a porch/entry split, or doors in walls | `cookbook/outdoor-home.md`, `docs/homemap-workbench.md` |
| Camera recording before an event, color clips, doorbell runners, fire, or delivery | `cookbook/camera-events.md` plus `tools/widget_doc.py screen` |
| Phone app battery/charging/camera fields with backend provenance and partial refresh | `cookbook/device-app-sources.md`; use `deviceapp`, source IDs and independent per-field states |
| Sensing geometry, motion events, range, or room presence | `cookbook/motion-detection.md`, `cookbook/radar-range.md`; Radar alerts are authored separately from geometry |
| Honeycomb trace JSON, readable service rows, or a service's internal wall time | `docs/trace-import.md`; `src/starters/honeycomb-trace.json` / `src/starters/complex-trace.json` |
| Starting a project, importing spec JSON, templates, or copyable agent prompts | `docs/workbench-welcome.md`; the welcome screen replaces the old Starters gallery |
| Choosing a workbench panel from visual previews, explicit Add, or insertion destination | `docs/workbench-panel-picker.md` |
| Company service/API choices, repository catalog sync, or nginx-bundled service references | `docs/workbench-catalog-sync.md`; use the approved `workbench/catalog.json` identities, never infer bindings from display labels |
| A crowded editor, resizing, focus, or diagram fit controls | `docs/workbench-workspace.md` |
| Database/payload state, checks, budgets, retry/circuit behavior, replicas, or rollout decisions | Matching recipes in `cookbook/README.md` and the corresponding widget docs |

Paths, failed communications, centerpiece views, scene-event controls, and
fit controls need no schema-version flag. An old self-contained HTML page
must be rebuilt with a current template to gain new rendering behavior;
adding a made-up version or zoom field to its spec cannot update its engine.

For domain drilldowns, author child flows as ordinary sections and attach
`detail` to the parent node. Preserve section IDs when headings change; use
`detailOnly:true` to hide details from the initial reader view. Map failures
to explicit child paths and steps, and label the child nodes referenced by
`ports.in` / `ports.out`. A mapping selects a reading position; it does not
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
do not modify the spec or routing. Overflowing diagrams show mouse-friendly
**Scroll** arrows and a draggable position slider under the view choices;
no spec field enables them. See `docs/workbench-workspace.md`.
Use `diagram.layouts:[{id,name,sectionLayout}]` for several named views of one
story; `defaultLayout` selects the opening ID. Duplicate view and Swap places
can replace Home with the diagram while retaining supporting panels and controls.
Use explicit tile `hidden:true` for per-view visibility; all views share one set
of steps and paths. The workbench's **Visible elements** checklist names the
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
- Step hygiene: every step carries an edge, nodes, a patch, or `failures`;
  two edge-bearing steps must never share the same FIRST edge (reorder each step's `edges` list —
  true firing order is preserved with `packets`); an overflowing edge
  label gets shortened, not nudged.

# The human guide

Choose **Add → Text** for a plain canvas text box in Diagram or Explore. Double-click
the text, or focus it and press Enter, to edit using the normal text caret,
selection and clipboard. Enter inserts a newline, Ctrl/Command+Enter saves,
Escape cancels, and clicking away saves. Select a text box for the compact
font, size, Bold and Italic toolbar beside it; Inspect can stay closed. Formatting
applies to the whole box. While typing, toolbar controls keep your caret and
selection; text and formatting save together as one Undo, or Escape cancels both.
Tab from the text reaches the toolbar. Inspect offers the same formatting plus
underline, text color, alignment and width. Drag the box
to move it or its selected bottom-right corner to resize. Text wraps and the
box grows vertically so all lines remain visible. Each edit or gesture has one
Undo. Copy, duplicate, save and reopen preserve the text and formatting.
Text boxes allow up to 12,000 characters, 200 wrapped lines and 8,000 units of
height. A rejected edit leaves the saved source intact; shorten the text, reduce
the font size or widen the box. Clearing Color restores the theme color.

The workspace chapter explains top inspector actions, collapsed muted section
headers, same-selection expansion retention, and group-scoped Apply controls.

Open **User guide** in the workbench header or workspace toolbar. It is available
from welcome, during editing, and in Focus workspace. The guide ships inside
`workbench/flowspec.html`, including downloaded/offline copies and company nginx
installations. No separate documentation service is required.

When the build's site config names an examples gallery (`"examples"` in
`workbench/site.json`; see [Put your own diagram on the homepage](homepage-example.md)),
Welcome and **Start new project** also offer **Browse the examples gallery**, which
opens it in a new tab. Builds without that setting do not show the link.

During editing, **Help → Keyboard shortcuts** opens the compact key reference;
press **?** outside a text field to open it directly. Canvas keys include
**⌘/Ctrl A** for every visible node in the active section (including referenced
read-only nodes), **F** for Fit diagram, **Shift F** for Fit selection, and
**F2** to open Inspect and focus the selected object’s first editable field.
**⌘/Ctrl K** opens Find objects, and **⌘/Ctrl Shift Z** redoes an undone
action. Existing copy, paste, duplicate, delete, nudge, object-menu,
pan, and quick-connect keys are listed there too. These navigation and selection
actions do not edit the JSON or add Undo history.

Start with **Your first diagram** for a complete walkthrough. The chapter list
then covers the workspace, rows and free placement, quick connections, step
playback, alternate paths, panels, Home editing, named views, catalogs and code
evidence, copying, sharing, and working with an agent. The **Alternate outcomes**
chapter illustrates a shared prefix, independent failure/recovery beats, and a
shared suffix, and explains when to make a step independent. **Steps & playback**
explains story time: the section's start and formats, each step's time,
battery drain rates, and device-app report times whose "Updated … ago" text the
cards compute (see [story time](step-time.md)).

**Find your way** covers **Inspect → Document settings** for the saved title,
description and tags (shown on published library cards and matched by
**Search diagrams**), skin and source line, the preview-only **Canvas appearance** controls, and
**Initially collapse prose** for section paragraphs and bullets. Document edits
use the same Save/Export and Undo path as other inspector fields.

**Open file** and **File → Open working file…** make the selected file your
working document. Valid ordinary edits and Undo/Redo autosave to that actual file;
browser recovery also keeps the exact source, including unfinished JSON. The
header identifies the filename and file save state. **File** reports browser
recovery separately, so successful browser recovery never means a disk save succeeded.

**File → Choose working folder…** opens the matching spec and coverage ledger,
or creates a pair from the current draft in an empty folder. It requires no agent
connection or setup instructions. Existing ledger bytes are preserved. The folder
uses the same editor lease, paired write journal and conflict checks as an agent
connection. Agent acceptance, Undo and Redo save the reviewed spec/ledger pair;
pending or declined proposals leave the accepted files unchanged. Selecting only
a file cannot grant access to its sibling ledger: choose the folder to save both.

Invalid or incomplete JSON pauses disk writes and preserves the last valid file.
Browser recovery still saves the unfinished text. Repairing the source resumes
file saves. Permission/write failures show **File save failed**; **Retry file save**
requests access again. External file changes detected before a write commits stop
saving; reopen the destination to review its current contents.
New, imported and pasted documents start browser-only. Home/Continue retains a
standalone working association; an agent connection that disconnects must be
reopened. Reload recovers the browser draft without claiming a writable file;
reopen the file/folder explicitly. Reopening loads disk contents and preserves the
outgoing browser draft in Earlier drafts.

Writable access requires a supporting desktop browser and secure context. Other
browsers explicitly show **Browser only**; Export project still downloads a copy.
The save status is a read-only badge beside **Add**, not a button; hover it for
how to choose a working file. **Home** keeps the draft (its tooltip says so).
The dotted frame tagged **Adding here** marks the section that **Add** fills.
Exporting into the active working folder verifies and preserves the exact working
JSON/ledger bytes, then updates HTML and README. HTML is a snapshot updated only
by Export. If the working draft changes during export, retry the complete export.
File writes already inside the browser's final close cannot be recalled. Subsequent
writes wait for those operations, and project changes retire queued/staged writes.
There is no guaranteed file flush on tab close; wait for **File saved** before leaving.
Flowview requests an exclusive browser writer, blocking competing browser writes
where supported. Older browsers may ignore that option; byte comparisons still
run before writing and immediately before close. These checks cannot prevent an
operating-system editor from changing the file between the last check and commit:
the file API has no atomic compare-and-swap, and that race can overwrite an outside
edit. Avoid editing the same file simultaneously in another application.

The toolbar **Export** menu is the one complete list of exports: **Export
project**, **Download SVG**, and **Copy SVG**. The File workspace has no separate export buttons; its
**All exports in the Export menu** button opens that menu. **Export project** saves
matching `.spec.json`, `.html` and `.ledger.md` files plus `README.md` to a chosen
folder, or downloads one ZIP with the same four files when no folder picker is
available. Keep JSON and Markdown ledger together for future editing;
commit JSON, HTML and ledger together. README is a fourth support file. A missing
ledger is exported as an explicitly unverified placeholder, never invented evidence.

Select the exported diagram folder from File or the Agent workspace to reopen its JSON
and ledger together. Matching filenames allow discovery without connection
metadata. Flowview recreates that metadata when needed; `.flowview-agent`,
sessions, requests, transcripts, leases and recovery journals are excluded from
export, and the working folder's metadata is preserved. The HTML includes
imported topology for offline viewing; JSON retains authored references.
Export needs valid JSON and the viewer template served beside the workbench.
After an error, retry the complete export. To preserve unfinished JSON, copy the
text from the JSON workspace into a repair file.

Download/Copy SVG exports only the active section's rendered diagram graph. It
preserves the live View, step visibility and skin, embeds the styles and icon
symbols it needs, and excludes prose, panels, playback controls and editing
chrome. Embedded raster images are omitted; use the HTML in Export project when image nodes must
remain visible. Copy uses `image/svg+xml` when the browser permits it and
otherwise opens the same standalone SVG as selected text for manual copy. Invalid
source may keep the last usable preview; the export message calls that out
explicitly.

Drop a Flowview `.spec.json`/`.json`, Mermaid `.mmd`/`.mermaid`, Markdown
file containing a Mermaid sequence or flowchart, or draw.io `.drawio`/`.xml`
onto Welcome or the open Workbench. The File panel's
**import Flowview / Mermaid / draw.io…** button provides the same keyboard route.
Flowview inspects the bounded local file in your browser and shows its detected
type and a short summary before anything changes. Choose **Import** once to
continue, or **Cancel**/Escape to leave the current document and Undo history
untouched. In an open Workbench, one Undo restores the entire pre-import source.

Mermaid browser import accepts `sequenceDiagram` and a bounded static
`flowchart`/`graph` subset. The first Mermaid fence in Markdown wins. Flowcharts
support `TD`/`TB`/`BT`/`LR`/`RL`, case-sensitive alphanumeric/underscore/hyphen IDs,
implicit nodes, plain or double-quoted labels, solid directed `-->` links,
`-->|label|` and `-- label -->` labels, chains, `&` branches, and nested
`subgraph ID [Title]` / `end` groups. Later explicit node labels win. Cycles and
self-loops are retained; placement follows the declared direction between
acyclic components. Static imports have no invented timeline or network
protocol: their legend says **Connection**.

Rectangle, rounded, stadium, subroutine, cylinder, circle/double-circle,
diamond, hexagon, parallelogram and trapezoid delimiters become native cards.
The preview explains native layout/arrow appearance and warns when shapes change or `style`, `classDef`, `class`,
`linkStyle`, or `:::class` styling is omitted. It never executes Mermaid,
scripts, HTML, click handlers, or network requests. Frontmatter/directives,
HTML/Markdown labels, entity escapes (use literal quoted characters), subgraph
directions/endpoints, nodes assigned to multiple groups, parallel links with
the same ordered endpoints, non-solid or non-directed arrows, and other
advanced syntax are refused before editing. Unsupported input is not partially
imported. Labels are single-line, at most 500 characters; a flowchart allows
200 nodes, 500 connections, 32 groups, 16 nesting levels, and 2,000 statements.
Whole-file/inline import allows 4 MiB; additive import allows 2 MiB.
These additions apply to the browser; `tools/mermaid2spec.py` remains
sequence-only.

Desktop draw.io browser import accepts a bare `mxGraphModel` or an `mxfile` containing
plain XML, compressed pages, or both. All pages become sections in a whole-file
import; **Add / Paste diagram** lets you select one source page to add to the
current canvas. Compressed pages decode locally using raw DEFLATE; a browser
without that capability asks for uncompressed XML instead.

Explicit labels, directed connections, ordinary group/swimlane hierarchy,
visible layers, and node centers (including parent offsets) are retained.
Source-only arrows reverse the native connection. Native cards and routing
replace shapes, sizes, formatting and style; the preview explains the
conversion before confirmation. Text-only shapes become labeled cards.
Basic HTML formatting (`b`, `strong`, `i`, `em`, `u`, `s`, `span`, `font`, `div`,
`p`, `br`) becomes inert plain text. User-object metadata, notes, and links
are omitted with a warning. No resource, script or hyperlink is loaded or run.

The importer rejects hidden/collapsed content, relative vertices and ports,
complex/custom containers or shapes, group/edge endpoints, separate child
edge-label cells, dangling or parallel connections, undirected/bidirectional
arrows, and semantic markers such as crow's feet, diamonds or circles.
It also rejects images, custom stencils/libraries, background images,
rotated/flipped geometry, dynamic placeholders, math, custom stylesheets,
DOCTYPE/entities, active HTML, and embedded `.drawio.png`/SVG/PDF carriers.
Export plain supported shapes and put connection labels on the edge itself
before importing. Unsupported content is refused as a whole, never silently
partially imported.

The existing 4 MiB whole-file and 2 MiB additive limits apply. Decoding is bounded
before buffering: all pages together may use at most 8 MiB of inflated
URI-encoded bytes plus plain XML bytes. Limits also include 20 pages, 1,000
cells, 500 nodes, 1,000 connections, 64 groups, 32 parent levels, 1,000-character
labels, and coordinates within ±100,000 after parent offsets. Changing the
input, source, project or destination, or closing the additive preview, retires
pending decoding and preserves the current source.

Both keeps the stamped authored JSON and creates a separate
read-only HTML snapshot of the current page. Shared topology stays referenced
in JSON; the HTML contains the visible resolved nodes and edges with no provider
context or topology declarations/provenance. Local providers can export offline
once the viewer template is available. Imported consumers require their approved
frozen providers already loaded in Workbench; **Import Flowview / Mermaid / draw.io…**, opening an agent
diagram folder, or opening from Canon acquires them from the approved catalog.
The exported HTML then opens without those sources and never refreshes itself.

**Work with an agent** walks through the Recommended copy/paste and Beta Monitor
choices, opening or creating a diagram folder, pasting setup, choosing message
context, previewing the proposed diagram and ledger, and preparing the accepted
pair for a Git commit. It explains conflict feedback and ledger reconciliation
after a merge. The standalone brief and older automatically applied local-session
route have separate disclosures so their instructions do not interrupt this flow.
**How this works · Agent walkthrough** on the workflow choices and folder setup
opens this chapter directly. Closing it returns focus to the originating control,
including when the folder setup dialog is still open underneath.

Choose a chapter to jump within the guide. **Close** or Escape returns to your
previous work. Reading does not change the spec, selection, undo history, or
welcome navigation. Browser Find and normal text copying remain available.

Workbench Standard and Explore views support Alt/Option-drag marquee selection
of nodes and a shared right-click action menu. Explore also includes on-canvas
panels and step controls. The Nodes & connections chapter explains mixed
selection, keyboard focus and graph-unit nudging, alignment centers, equal-gap
distribution, Fit selection, Free placement, position locks, and Undo. A node's
right-click menu locks or unlocks its position; selected-node menus name the bulk
actions explicitly. Locked members stay selected and fixed during a mixed drag,
with a local lock cue instead of an Inspector error.

In Explore, **Panels → Placement for Section notes** chooses **Floating** or
**On canvas** independently of other panels and step controls. Notes retain a
separate position and size for each placement. Select canvas notes to reveal
their move and resize handles. Floating notes use 16px body text and remain at
100% when you resize panels with **Panels & controls**. Use the notes corner to
resize their window. Workbench changes save with Undo/Redo; reader changes are
temporary. Older files preserve their initial notes placement when you change
other placements.

The **Layouts & audiences** guide describes Tab-owned Views and their section
subsets. Standard stacks members; Explore shows one at a time. The View popover
owns membership, presentation and naming; arrangement controls remain section-owned.
See [Tabs, Views, and sections](tab-views.md).

## Maintaining the guide

The single content source is `src/workbench/human-guide.html`; its small dialog
controller is `src/human-guide.workbench.js`. Edit the source and run
`python3 tools/build.py`. Do not edit the generated workbench directly.
Keep the human-facing steps and control names aligned with the real UI when
changing authoring behavior. This guide complements the agent authoring skill
and the detailed feature docs; it should not become a schema reference.
An opener with `data-open-human-guide="hg-agent"` targets that chapter; an empty
attribute opens the guide at its existing reading position. Keep agent authoring
instructions here; the [reader tour](tour.md) runs only on read-only diagrams.

The [canon library guide](workbench-canon-library.md) explains how a company
ships its reviewed diagrams beside the editor.

To send someone straight to one published diagram, add `?diagram=<diagram ID>`
to the Workbench address, for example `flowspec.html?diagram=doorbell`. **Copy
link** in **Browse diagrams** produces the same URL. It opens that published
diagram read-only, with **Edit in Workbench →** to start a local editable copy.
The ID must match exactly. Any other value, such as an unknown ID, a web address
or a file path, returns to the home page with a message naming it; nothing is
fetched or opened for it.

On desktop, right-click blank diagram or Explore canvas space to open **Add** at the pointer. **Text** inserts a box there and starts editing; **Node…** opens the presets, and **Panel…** opens the existing panel library. Canvas panels appear at the chosen point; Standard panels use the section layout. **Connection** starts the two-node connection gesture and **Step** adds to the current path. Escape or clicking elsewhere dismisses the menu. Cancelling a picker adds nothing; each insertion is one Undo action. Changing the source, project, section or view retires the pending destination. The toolbar **Add** remains available.

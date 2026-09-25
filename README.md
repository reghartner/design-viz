# design-viz

Turn a written design document into an animated, meeting-ready visual page — without anyone
hand-writing HTML. An agent (or a person) emits one declarative JSON spec; a self-contained
HTML template renders it as a full documentation page: titled sections with prose and bullets
in colored bounding boxes, tab groups, and animated flow diagrams that each offer two views
of the same time-aware data — an ambient always-animating view and a guided step-through
(click-through) view.

Maintained diagrams belong in [`diagrams/`](diagrams/README.md), one subfolder
per diagram page with its JSON spec and generated HTML together. The directory
guide covers building and moving existing diagrams. Root [`canon.json`](canon.json)
is the shared canon membership list for Backstage and the nginx workbench.

## Connected company flows

For the complete reproducible integration, use the
[portable Backstage/GitHub rehearsal](examples/backstage-e2e/README.md). It creates
fresh mock-company and designer repositories, seeds the workbench through a real
HTTP GET, runs an actual Backstage app with the Flowview plugin, and includes
daily catalog/drift workflows plus harmless and breaking source experiments.
Repository names are configurable; no access to private demo repos is needed.
All resulting PRs are left for human review and manual merge.

Run `node apps/backstage-mock/server.mjs` and open port 8766 for a fictional central
repository with catalog-seeded editing, code drift reviews, approved reference
traces, and incident alternates. No company sandbox is needed. See the
[canonical flow guide](docs/canon.md), [doorbell recipe](cookbook/canonical-incidents.md),
and [Backstage/company handoff](docs/backstage-integration.md). The
[runnable sample app](examples/canon/doorbell-app/README.md) rehearses harmless and
breaking source changes against actual local Git commits and fixed contract tests.
For unattended GitHub scans, use the [automation setup](docs/github-drift-automation.md):
weekday runs, report-only previews, saved evidence, and human-reviewed drift PRs.
The [Backstage entity plugin](apps/backstage/README.md) renders related diagrams
inside service/API pages, with in-place step jumps and external editing. Its
native renderer owns a ShadowRoot and makes no background network requests;
the Backstage host reads specs through the authenticated proxy. The plugin guide includes a local preview.

The [presentation edition](docs/diagrams/platform/index.html) covers the current
platform in eight guided chapters, with real local Backstage screenshots,
slide-ready diagram images and a [suggested talk track](docs/diagrams/platform/README.md).
It separates ownership, catalog-seeded authoring, native viewing, code drift,
human review, trace evidence, shared releases and the end-to-end rehearsal.

The [detailed system walkthrough](docs/diagrams/backstage/backstage.html) includes
**Deployment** and **Inline viewer** tabs: repository ownership, external editing,
authenticated reads, native mount ownership and stale-revision handling, alongside
the existing GitHub drift and trace flows. Its embedded screenshot shows the
actual plugin with local fictional data.

[Embedded image panels](cookbook/embedded-images.md) store small PNG/JPEG/WebP
captures inside the spec, with alt text, captions and optional reference links.
Add an **image** panel in the workbench and upload its **Image file**; placement,
resizing, copy/paste and Undo use the existing editor controls.

[App screens](cookbook/app-screens.md) turn manually exported Figma screens into
a reusable collection. Upload images once, choose a starting screen, and select
screens in each step's inspector. A phone frame and cut/crossfade transitions
keep the product experience beside its system flow in standalone and Backstage
viewers. The [example](examples/app-screens/app-screens.spec.json) includes four
illustrative screens with connected/offline paths.


## The pipeline

For agents, start with the [HLD-to-page skill](.claude/skills/hld-to-page/SKILL.md)
and its [cookbook index](cookbook/README.md). They include complete recipes for
[alternate timelines](cookbook/alternate-paths.md), [Home-centered stories](cookbook/home-story.md),
and [camera recording/event timing](cookbook/camera-events.md).

For a larger seed, use [one flow, two perspectives](cookbook/two-perspectives.md):
an 11-component doorbell design with an 18-step happy path, two alternate
endings, and synchronized engineering and resident-story views. Its source,
storyboard, coverage ledger and spec are provided together for authoring agents.
The skill now plans evidence and state before JSON; the
[authoring trials](docs/authoring-evaluation/results.md) record the smaller-model
tests, observed failures, instruction changes, and remaining review needs.

The [thermal-protection example](cookbook/thermal-protection.md) adds hot/cold
Home effects, independent camera shutdown and charging, temperature limits on
both ends, and explicit unavailable-video explanations. Open it from the
workbench's **Open file** using [the thermal spec](docs/diagrams/thermal-doorbell/thermal-doorbell.spec.json).

For repository PRs, use the [PR-handling skill](.claude/skills/design-viz-pr/SKILL.md).
It starts with the diff and loads only the review guidance for the affected surfaces.

**[Confluence viewer](docs/confluence.md):** keep editing in the workbench, then
use **Export for Confluence** or **Copy JSON for Confluence** for manual import
into the Forge macro. The viewer retains playback, alternate paths and panels.
The company's agent can finish deployment using the
[Forge integration handoff](docs/confluence-integration.md).

**[Alternate paths](docs/alternate-paths.md):** show a happy path and failure
outcomes on one diagram. Colored path rows align their step numbers beneath the transport controls; playback
and panel state follow the selected sequence and stop at its own ending.
Open the [alternate paths example](src/starters/alternate-paths.json), or fork a beat in the **Steps** tab.

**[Failed communications](docs/failed-communications.md):** show a packet
dropped in transit or a communication that was never sent, using broken
edges on the same diagram. Choose an outcome with each step's **Delivery** control.

**New: [Honeycomb trace → diagram](docs/trace-import.md).** In the workbench,
choose **import trace…**, paste or open event JSON, and **Build diagram**.
The result is a service board, an offset-aware waterfall, and a step for each
span. No account connection is required. **Start new project → A trace, explained** opens
a fictional trace example. Agents use `node tools/trace2spec.js`.

Every `rows` array renders its slots left to right. Stack members render top to
bottom within one slot.

All row diagrams offer **Auto**, **Fit width** and **Readable** views, with
curved edges or lane routing. In a narrow diagram column, Auto keeps labels
legible and lets you scroll sideways; Fit width shows the complete graph.
These controls also work in published pages; no routing setting is required.

**Broader design panels:** `table` shows data snapshots, `checks` shows
authored decisions and invariants, and `budget` compares resource usage with
explicit limits. Open the [software & IoT example](src/starters/software-systems.json) for both domains.
Use the [retries & circuits example](src/starters/resilience.json) for retry success, deadline admission,
and circuit recovery; the [recipe](cookbook/retries-and-circuits.md) explains
how to adapt their authored policies and timing.
The [replica positions example](src/starters/replication.json) compares applied positions against a session
token while keeping reported lag, offline state and unrelated histories
distinct. Its [recipe](cookbook/replica-positions.md) also covers device/cloud
configuration copies.
The [rollout decisions example](src/starters/rollout.json) separates configured traffic, sampled health,
firmware trial boots and persistent confirmation. Its
[recipe](cookbook/rollout-decisions.md) covers promotion, holds, traffic rollback
and missing device reports.
The workbench's **document outline** (⌘/Ctrl K) searches sections, hidden tabs,
nodes, groups, edges, panels, and steps and opens the matching inspector.
See the [ranked feature roadmap](docs/feature-roadmap.md) for the next additions.

The [visual panel library](docs/workbench-panel-picker.md) opens from **Add to diagram → Panel → Browse panels**:
browse actual panel previews, select a type, and confirm with **Add panel**.

[Repository catalog sync](docs/workbench-catalog-sync.md) reads company catalog/API
files from GitHub, proposes an updated service catalog, and bundles the approved
snapshot with the nginx editor. New projects load those dropdown choices automatically.
Use **From service catalog** on the homepage or **Add to diagram → Services from
catalog** to select services and optionally create their declared dependency edges.
See [catalog graph seeding](docs/workbench-catalog-sync.md#start-a-graph-from-the-catalog).

The [effective-state inspector](docs/workbench-state-inspector.md) explains
the panel values at a selected step, including inherited and transient values,
with links to their authored JSON and read-only snapshots.
Use [workspace focus and the resizable editor](docs/workbench-workspace.md) for
more room: drag the divider or **Expand editor** beside a compact live preview.
**Inspect / Steps / JSON** each get a dedicated pane. Width and selected tool
persist locally; phones use a stacked layout.
[Section arrangements and host previews](docs/section-layouts.md) let you drag and
resize panels and diagrams, with separate layouts for Backstage and Confluence.

The [story-step editor](docs/workbench-steps.md) adds caption search, hidden-tab
jumps, duplication, appending and reordering through the same undo history.
[Reuse steps](docs/workbench-step-reuse.md) copies or shares beats between
paths, previews their resulting state, and can detach a shared step in place
or remove just one path's occurrence.
The [object clipboard](docs/workbench-clipboard.md) copies Home elements, panels,
nodes and whole sections between diagrams. It includes mobile controls,
⌘/Ctrl C/V/D, fresh IDs, and one-step Undo.

```
design doc (prose / permalinks / mermaid)
        │
        ▼   an LLM agent, given only contract/authoring-contract.md
  page spec (JSON — no coordinates, no HTML)
        │
        ▼   tools/inject.py spec.json template/flowview.html out.html
  standalone HTML page (share, publish, present)
```

Feedback loop: meeting feedback goes back to the agent as plain English, the agent edits the
JSON, re-inject, republish. The spec is data, so revisions diff cleanly in git.

## How this was built

Everything here — content and tooling — came out of an agent-driven loop:

1. **Research fanout.** AI agents gathered the IoT device offerings of 27 companies
   (`docs/research/iot-device-catalog.md`), focusing on dual-chip devices that maintain an
   active internet connection, with industry-standard solutions as the baseline.
2. **Fictional HLDs.** Agents drafted twelve fake high-level design documents
   (`docs/hlds/`) against those feature sets. Every company, service, and product name in
   them is invented. Each draft went through human and agent review passes for realism and
   internal contradictions.

   One concrete example of how that grounding works: the doorbell page
   (`examples/doorbell/`, expanded in `examples/doorbell-atlas/`) is a composite of two
   real designs, built only from public information. Its hardware architecture — a
   low-power chip that stays connected on microamps handling Wi-Fi, MQTT, and the PIR
   sensor, waking a separate camera/encoder chip over an interrupt line for seconds per
   visit — follows Blink's publicly documented dual-chip battery design. Its cloud
   architecture — motion events over an MQTT broker, video never touching the broker,
   clips uploaded over HTTPS and linked back to the originating event — follows Ring's
   event-versus-media split. The radar-presence sibling (`examples/chime-radar/`)
   corresponds to the 24 GHz radar in Ring's Battery Doorbell Pro. No affiliation with
   either company; everything named in the documents is fictional.
3. **Widgets.** Agents built the inspector widgets needed to visualize those features —
   built-in panels ranging from state machines and gauges to a ring buffer, a radar
   sweep, a wall-clock heartbeat timeline, and a phone notification stack.
4. **Generator + contract.** The page generator was built around a strict authoring
   contract (`contract/authoring-contract.md`) and a written agent runbook
   (`.claude/skills/hld-to-page/SKILL.md`) for turning an HLD into a page.
5. **Authoring fanout.** Agents of all capability levels then attempted to follow the
   runbook and build pages from the fake HLDs (`examples/`), reporting every hiccup. Those
   reports fed back into the contract, the cookbook recipes, and the skill definition.

## Layout

| path | what it is |
|---|---|
| `src/panels/types/<type>.js` | One complete panel definition: validation, state rules, renderer, editor controls/metadata, picker example, styles, layout/reference capabilities and release metadata. Shared primitives stay in `src/panels/shared.js`; see [panel development](docs/panel-modularity.md). |
| `src/` + `tools/build.py` | The engine source of truth. `build.py` assembles both single-file pages and `tools/canon/generated-runtime.cjs` for Node backends from `src/`. CI rebuilds the viewer and workbench before testing; checked-in HTML does not need to match the latest engine byte for byte. Rebuild pages before distributing them. Packaged JavaScript and the generated Canon index must remain current. |
| `tests/` + `.github/workflows/ci.yml` | Python + Node unit tests (zero dependencies): injection anchoring, build determinism, spec validation, lint rules, layout math, panel-state folding, tool exports, and end-to-end CLI checks over seeded fixtures. CI runs them plus an examples-build and spec-validation check on every push and PR. |
| `tools/browser-tests/` | Required pinned-Chromium contracts for offline HTML, editor source/history and teardown, native React isolation, and copied Forge resources. [Commands and boundaries](tools/browser-tests/README.md). |
| `tools/validate.js` | Validator + lint CLI: `node tools/validate.js <spec.json>` prints errors, warnings, and lint findings with field paths; exit 1 on errors. `--quiet` for CI. Loads the same validator the pages ship, so CLI and in-page results cannot drift. |
| `template/flowview.html` | The render target (GENERATED — edit `src/`). Self-contained single file: layout engine, six skins, protocol-keyed legend, tabs, step player, containment groups, synchronized inspector panels (state machine, LEDs, gauge, log, camera screen), permalink affordances. Reads its spec from an embedded JSON block. |
| `tools/inject.py` | The injection step: `inject.py <spec.json> <template.html> <out.html>`. Validates the JSON, refuses unescaped `</script`, sets the page title from `page.title`, and discovers derived sibling links when the conventional output root already has `crossref.json`. |
| `tools/build_index.py` | Generates a root's `index.html` and `crossref.json` from `manifest.json` plus every named spec. The index groups pages by family and lists exact-title services shared by 2+ pages; the JSON catalog supplies derived per-page backlinks. |
| `tools/mermaid2spec.py` | Converts a mermaid `sequenceDiagram` (bare, or the first ```mermaid fence in markdown) into a deliberately bland skeleton spec: `python3 tools/mermaid2spec.py <input.(md\|mmd)> [-o out.json] [--title "..."]`. Enriching icons, tints, protocols, and prose stays the authoring LLM's job; unsupported mermaid constructs fail loud. |
| `contract/authoring-contract.md` | The complete authoring contract. Self-sufficient: hand this file plus a source document to any LLM and it can emit a valid spec with zero other context. |
| `cookbook/` | Task-shaped recipes for authoring agents: one file per common request (temperature thresholds, battery drain, Radar sensing geometry and authored alerts, wake-up mailbox, persistent-connection-while-awake, LP-chip MQTT relay, egress routing) plus `adjustments.md`, a phrase-to-knob table for visual feedback ("move that up and to the right"). Every ```json fence in it is a complete spec kept lint-clean by `tests/test_cookbook.py`. |
| `workbench/flowspec.html` | Interactive workbench: the same engine plus an editable JSON panel with a Render button, click-to-definition selection with per-element inspector forms (field edits, id renames with reference rewrite, deletes with reference pruning, step reorder, undo), snippet INSERT buttons, schema reference, and known-limits notes. For hand-tuning specs. |
| `examples/cumulus/` | End-to-end proof. `cumulus-hld.md` is a realistic fixture design doc (mermaid + prose-only flow + facts buried in paragraphs). `cumulus-page.spec.json` was generated from it by GPT-5.6 given only the contract; `cumulus-page.spec.v2.json` applied three plain-English "meeting feedback" items. `cumulus-flow.html` is the rendered v2 output. |
| `mockups/` | The hand-built design explorations that defined the target: `flowline-mockups.html` (four visual treatments; mockup 04 "Aurora Combined" is the chosen direction), `device-lens.html` (click-through with a device-internals inspector), `doorbell-northstar.html` (the northstar: three synchronized panels — flow board, two-chip hardware view with wake states, camera viewfinder that visibly starts recording). |

Panel modules are discovered through `src/source-bundles.json`. For headless
Node tools or VM tests, load `readSource('validator.js')` from
`tools/source-loader.cjs`, then the assembled engine when needed; raw validator
and engine file reads omit the registered panel implementations.

## Regenerating the example

```
python3 tools/inject.py examples/cumulus/cumulus-page.spec.v2.json \
    template/flowview.html examples/cumulus/cumulus-flow.html
```

## Using this repo as a tool from another project

Company forks can publish internal engine releases, with the designs repo and
Backstage pinning releases independently. [Spec/runtime compatibility](docs/runtime-compatibility.md)
records the minimum renderer and required features, with upgrade notices in the
viewer. Workbench Save/Export stamps metadata; agents can use
`node tools/compatibility.js --stamp input.spec.json > versioned.spec.json`.

This repo is designed to be pulled in (cloned or vendored) and driven from a
consuming project. An agent converting a design document follows the full
runbook at `.claude/skills/hld-to-page/SKILL.md` — it establishes three
paths (the HLD, this checkout as read-only VIZ, and a caller-chosen output
directory OUT in the consuming project), walks a coverage ledger and an
operator-approved visualization proposal, then builds with:

    python3 <VIZ>/tools/page_build.py <spec.json> --root <OUT>

`--root` creates OUT if missing; `<name>.html`, the source-named spec copy,
and OUT's own `manifest.json` land flat in that directory — nothing is written
inside this repo. The page name comes from either `<name>.spec.json` or plain
`<name>.json`, and its manifest family defaults to `OUT`'s directory name.
Pass an explicit `<family>/<slug>` after the spec when a nested library is
wanted; that established mode still writes `<root>/<family>/<slug>.html` and
`<slug>.spec.json`. An explicit bare `<slug>` plus `--root` selects a different
flat output name. Both `<spec.json>` and `--root` may be given relative to
*your own* working directory — the tool anchors them to the directory you run
it from, and a symlinked spec or root keeps its alias name in the outputs and
the manifest family.
`python3 <VIZ>/tools/build_index.py --root <OUT> --title "..."` adds a
browsing index over everything in OUT plus an `OUT/crossref.json` service
catalog. Selective widget documentation comes
from `python3 <VIZ>/tools/widget_doc.py <types…>` so an agent loads only the
contract sections its document needs (`--list` prints the valid type names;
`--contract-card` prepends the shared message-contract-card section).

## Authoring workflow for an agent (the core loop)

1. Give the agent `contract/authoring-contract.md` and the source document —
   or better, the full skill runbook above.
2. The agent emits strict JSON only (page → blocks → sections/tabs → diagrams with nodes,
   rows, edges, steps). No coordinates, no HTML. Unknown fields are ignored; validation
   errors name the field and say what to fix.
3. Run `tools/page_build.py` (validate → inject → manifest, with `--root` for
   external output), or bare `tools/inject.py` for a one-off render. Every diagram with
   a `steps` array automatically has both the ambient view and the guided step-through;
   `view: "step"` opens a board in guided mode.

## Editing a page by hand (human loop)

Every rendered page has its spec JSON sitting next to it (usually
`<name>.spec.json`, with plain `<name>.json` also supported, beside
`<name>.html` — under `examples/<family>/` in this repo, or under your own
output directory if you built with `--root`). The HTML is generated; never
edit it. To change a page:

1. **Edit the spec.** Open the `.spec.json` in any editor. Common edits and
   where they live:
   - wording → section `text` / `bullets`, step `text`
   - a node's name/subtitle/link → `nodes.<id>.title` / `.sub` / `.link`
   - an arrow's label or protocol → the entry in `edges` (`label`, `kind`)
   - what a step shows → that entry in `steps` (its `edge`/`nodes` and the
     `panels` patch)
   - panel values (a temperature, a battery %) → the panel's `initial` or a
     step's `panels` patch
   - the source link under the title → `page.generatedFrom`
   The full field reference is `contract/authoring-contract.md`; for "move
   that label / too crowded" style tweaks, `cookbook/adjustments.md` maps
   plain-English complaints to the exact knob.
2. **Rebuild the page.** Same command that built it:

   ```
   python3 tools/page_build.py path/to/name.spec.json
   # add --root <your output dir> when output is separate from the source spec
   # optional nested layout: add <family>/<slug> (and --root when external)
   ```

   With no slug and no `--root`, `<name>.html` and `manifest.json` are updated
   in the spec's own directory; no redundant spec copy or subdirectory is
   created. It validates first and refuses on problems, printing each one with
   the JSON field path and what to fix — validator *warnings* also stop the
   build (`cookbook/adjustments.md` maps the common ones to spec knobs);
   `--allow-warnings` builds through them. `PAGE_BUILD OK` means the HTML and the
   manifest are updated. Descriptions/tags are kept from last time unless you
   pass `--desc` / `--tags` again. This repo's existing `examples/` library
   deliberately remains nested, so rebuild those pages with their explicit
   `<family>/<slug>` and then run `python3 tools/build_index.py` to refresh the
   index and cross-page service catalog.
3. **Look at it.** Open the rebuilt `.html` in a browser — no server needed.

### Cross-page catalog refresh loop

Cross-page identity starts with exact, case-sensitive node `title` strings;
node ids remain page-local. For service nodes, matching is unrestricted across
families: a title keeps that behavior when any occurrence has tint `cmd`,
`auth`, `data`, or `mqtt`, or has no tint. A title whose occurrences are all
`dev` is family-scoped instead. Its manifest family, the leading segment of a
`maker-product` family slug, and an explicit node `group` (when present)
identify its product family; cross-family device-title matches are dropped.
This keeps real components such as **Sentry LP** across the Doorbuzz pages and
**Sentry Panel** across Hearthline pages while treating a generic phone title
repeated by unrelated products as coincidence.

`tools/build_index.py` reads every spec
named by the target root's manifest, writes deterministic `crossref.json` in
this shape, and adds a **Shared services** section to the bottom of the index:

```json
{
  "services": {
    "Relay": [
      {"file": "cumulus/cumulus-flow.html", "family": "cumulus", "title": "Cumulus Command & OTA Paths"}
    ]
  }
}
```

Surviving all-`dev` records additionally carry generator-owned
`"scope": "family"` and a sorted `"families"` list. Consumers use those
fields to keep both index rows and per-page backlinks inside the matching
product family; authors never add them to a flowspec.

`page_build.py` keeps the catalog out of the authored spec: when
`<root>/crossref.json` exists, it writes only the current page's sibling links
to a second embedded JSON block named `flowbacklinks`. Nodes then expose a
small ↗ affordance whose popover says **also in:** and links to those sibling
pages. An author-declared node source link keeps its own ↗ beside it, and all
derived affordances are hidden in print.

The catalog intentionally reflects the last `build_index.py` run, so one-run
staleness is acceptable. For fully fresh links use this loop:

1. Build or update the pages with `page_build.py`.
2. Run `build_index.py` for that root.
3. Rebuild pages that need fresh backlinks.

Skipping step 3 simply leaves those pages one catalog run behind; no authoring
field or agent-authored cross-reference data is required.

For human authoring instructions, open **User guide** in the workbench header or
workspace toolbar. The [bundled guide](docs/workbench-user-guide.md) includes
a first-diagram walkthrough, alternate paths, shared steps, Home animation,
layouts, catalogs, and sharing. **Canon diagrams** on welcome opens the
[read-only repository library](docs/workbench-canon-library.md), with an explicit
**Edit in Workbench** handoff. Keep maintained JSON and HTML together under
`diagrams/<name>/`, and add the folder and owner to root `canon.json` after review.
The normal build and nginx image build publish that central list; per-spec flags
do not enroll a document. Use **Copy link** in the reader to share a
direct `?diagram=<canon-id>` URL before Backstage is connected.

Open `workbench/flowspec.html` to **Paste JSON**, **Open file**, or start a **New project**
from a curated template or a blank diagram. The [welcome guide](docs/workbench-welcome.md)
also covers saved drafts and copyable instructions for building with your agent.
Use **New / open** to return here from the editor; the previous project stays
available through Resume and Undo. Once open, tweak the live preview or use the
JSON pane and Render button, then save the result back to your `.spec.json`. Clicking
a rendered node, edge, edge label, step coin, panel widget, or section box
opens an **inspector form** for it, with a link to select its exact JSON:
every common field is an editable control (selects for icon, tint,
kind, edge endpoints, step edge and lane; text fields elsewhere) that writes
straight through to the JSON and re-renders on commit. Clearing an optional
field removes it from the spec. Renaming a node or panel **id** rewrites
every reference — rows, floats, edge endpoints, step `from->to` keys, step
node lists, panel patches. **delete** removes the element and prunes what
pointed at it (deleting a node also removes its edges and their step
references; steps legally survive as captions). Steps get **↑ earlier / ↓
later** reorder buttons. Every builder action pushes an **undo** snapshot
(the always-visible `undo` button below the editor, 30 deep). Selection maps the last
render onto the current editor text — re-render after hand-reordering
edits to keep the two aligned. **Add to diagram**, above the editor tabs, adds nodes, connections, steps and
panels. The **Into** selector beneath it chooses the destination section, including
sections inside tabs; clicking a section in the preview updates it too. Choose
**Node** for icon presets (Console, API, Auth, Store, Broker, Sensor, …), or **Panel**
for the visual panel library. Each addition uses an explicit button and is one
Undo. **Connection** asks you to click a source and target in the chosen section
(Esc cancels; duplicate `from->to` pairs are refused). For a shortcut,
**Alt/Option-click a node, then click its destination**, or select a node and use
**Connect from this node** in its inspector. A live arrow previews the connection
and eligible targets highlight. The new edge opens for label/protocol/port edits;
one Undo removes it. **Step** appends to its
selected timeline. **Page structure** inside the chooser adds sections or tabs. **Dragging an edge label** commits the movement as
`labelDx`/`labelDy` nudges — the hand-tuning chore for crowded corridors —
while a plain click still selects. Prose is selectable too: paragraphs,
bullets, and contract-card rows each open their own edit form with delete;
nodes and sections also get a **duplicate** button (the node copy lands
beside the original — same row, stack, or float). Keyboard: **Esc** clears
the selection or cancels connect mode; **Delete** removes the selected
element (only when focus is not in a form field or the editor). The editing
loop is durable: **open…** loads a `.spec.json` from disk (undoable),
**save** downloads the editor text as `<page-title-slug>.spec.json` (even
when it does not parse — unfinished work is still work), every edit
auto-saves a draft to browser storage, and after a reload a bar offers to
**restore** or **discard** the unsaved draft (restore is one undo step).

For [free node placement and explicit edge ports](docs/free-node-placement.md),
choose **float → Free placement**, then drag the node or edit **Float X/Y**.
Floating nodes can move anywhere; row nodes keep their reorder/swap behavior.
Edges expose **Exit / Entry side** and **position (%)**. Each drag is one Undo.
Try the [flexible service map](examples/free-placement/free-placement.spec.json).
**undo** has a matching **redo** (a new action clears the redo line; hand
edits in the editor are not snapshotted, but undo stashes the current text
on the redo side first, so nothing is discarded). **Validation findings
are clickable**: every error/warning in the message list selects the
offending JSON field in the editor (or its nearest existing parent when
the message names a field the text does not carry). **Steps are selectable
everywhere**: besides the numbered coins, every chip in the click-through
bar selects its step (and jumps playback there), and clicking the caption
line selects the step being shown — so steps that share a first hop or
have no edge at all are reachable too. **The step form
edits the whole step contract**: the caption, lane, and link sit above chip
rows for the step's hops, lit nodes, and panel patches — each chip removes
with one click (hop shapes normalize automatically between `edge`,
`edges`, and edgeless), clicking a panel chip opens that patch's JSON in a
mini editor, and the selected step's members carry distinct
markers on the board (dashed outlines on nodes and panels; edges brighten
their halo in the protocol color — no CSS filter, so every skin shows
it). **ADD TO STEP** turns board clicks into membership
toggles: while the mode is on, clicking any edge, node, or panel in the
section adds it to the step (or removes it if already there), each toggle
is one undo step, and Esc or DONE ends the mode. **Tabs are managed
in place**: clicking a tab button switches to it AND selects it — the
form edits its label and highlight, **+ tab** inserts a ready-made
sibling after it, arrows reorder it, delete removes it (the last tab of
a block is refused with instructions instead). **Hosted template
collections**: when the workbench is served from a web host, it fetches
`starters.json` from beside the page (same directory as
`workbench/flowspec.html`) and shows those entries in the welcome screen's
**Start new project** picker alongside the curated built-ins.
The file is a JSON array (or a `{"starters": [...]}` wrapper) of
`{"name": ..., "spec": {...}}` entries with an optional `desc`;
malformed entries are skipped and counted rather than hiding the rest.
Edit the file and reload the page to grow the collection — no rebuild.
See `workbench/starters.example.json` for the shape.

## Embedding one diagram in an iframe

To target a named view, use `#d=<section-ref>&v=<view-id>`; step and embed
links retain the selected view. For example,
`page.html#embed=front-door&v=home-story` embeds that Home arrangement.
See [view selectors](docs/section-layouts.md#link-to-or-capture-a-particular-view)
for legacy Home/Data flow aliases and their distinction from host profiles.

Any published page understands `#embed=<section-ref>` in its URL: it
renders ONLY that section's diagram, panels, and step controls — no page
title, tabs, prose, or contract card — sized for an iframe (Confluence,
wikis, dashboards). The ref is the section's heading slug (the same
vocabulary the deep-link `d=` selector and the `section-<slug>` element
ids use) or its 1-based rendered number. `&sk=<skin>` picks the skin for
the embed. A section living inside a tab is revealed automatically.

```html
<iframe src="https://host/path/page.html#embed=sleepy-device-delivery&sk=daylight"
        width="100%" height="620" style="border:0"></iframe>
```

The flag composes with the other hash fields and is read once at load;
everything else about the page (deep links, skins, the step player) works
unchanged without it.

For a **hosted HTML file embedded in Confluence**, export the page from the updated
workbench or regenerate it with `tools/page_build.py`, then replace the hosted
file. Exported HTML embeds its spec, runtime, icons, styles and licensed fonts for
every skin: after the document loads it needs no font CDN or spec fetch. Previously
exported files do not update automatically. An explicit `?spec=...` URL still asks
the standalone bootloader to load that external spec when no spec is embedded;
use an exported/injected page for a self-contained embed. The HTML host's own
login, CSP and iframe permissions remain deployment requirements.

## Validating a spec (the agent loop)

```
node tools/validate.js my-page.spec.json          # errors + warnings + lint, field paths
node tools/validate.js --quiet my-page.spec.json  # errors + summary only
```

An authoring agent's loop is: emit JSON → run the CLI → fix what it names → inject.
Lint findings are advisory layout heuristics (label longer than its edge, crowded
row corridors, two steps sharing a first edge, unused declared protocols, 3+ rows);
they never block rendering.

## Comparing spec revisions

`tools/spec_diff.py` reports the contract and diagram changes that matter in a
review, without treating a difference as an error:

```sh
python3 tools/spec_diff.py old.spec.json new.spec.json
python3 tools/spec_diff.py old.spec.json new.spec.json --annotate review.spec.json
python3 tools/spec_diff.py old.spec.json new.spec.json --quiet
```

Contract cards are matched by their full section-heading/card-title identity;
duplicate cards are disambiguated by shared row keys, and their rows are
matched by `k`. Annotation marks new rows `added`, changed `v`/`g` rows
`changed`, and inserts a copy of each disappeared old row with `removed` so the
rendered contract card shows the break. Step-count changes, panel/node IDs, and
`page.generatedFrom.version` are report-only. The input specs are never changed.

For the normal build loop, add `--diff-prev`:

```sh
python3 tools/page_build.py path/to/name.spec.json --diff-prev
```

In source-adjacent mode there is intentionally no prior destination copy: after
every successful build the tool records the built state in a hidden flat
`.<name>.page-build-prev.json` snapshot beside the page. That snapshot seeds the
next `--diff-prev`; a first-ever build has no comparison yet. Flat `--root` and
nested builds instead compare with the prior destination spec copy before
replacing it. The comparison prints after `PAGE_BUILD OK`, is advisory, and
never annotates the authored or copied spec.

## Comparing Confluence page versions

`tools/confluence_diff.py` fetches historical storage-format versions of one
page and prints a unified diff of stable, readable text. Set `CONFLUENCE_BASE`
to the site base and `CONFLUENCE_TOKEN` to an API or personal-access token. Set
`CONFLUENCE_EMAIL` as well for Cloud basic authentication; with a token alone,
the tool uses bearer authentication. A full Cloud page URL can supply the base
and page id itself.

```sh
CONFLUENCE_EMAIL=reader@example.test CONFLUENCE_TOKEN=example-api-token \
  python3 tools/confluence_diff.py \
  https://example.atlassian.net/wiki/spaces/WD/pages/123456/Widget-Design-Doc --list

CONFLUENCE_BASE=https://example.atlassian.net/wiki \
CONFLUENCE_EMAIL=reader@example.test CONFLUENCE_TOKEN=example-api-token \
  python3 tools/confluence_diff.py 123456 --versions 7 9 --out widget-design.diff
```

The default comparison uses the two newest versions. Agents should read the
diff output instead of loading both full documents; unchanged regions are
intentionally omitted. `--context N` widens the unchanged lines shown around
each change (default 3), and `--raw` diffs the storage XHTML verbatim instead
of the readable text extraction.

**No-credential file mode.** When another tool already fetched the two
versions — typically a Confluence MCP server available to the agent — save
each version to a file and diff the files instead; no environment variables,
tokens, or network involved:

```sh
# each file is either the raw storage XHTML or a saved JSON API/MCP response
# (body and version metadata are extracted from JSON automatically)
python3 tools/confluence_diff.py --files widget-v7.json widget-v9.json
```

`--versions A B` labels the sides when the files carry no version metadata.

## Surgically patching a Confluence page

`tools/confluence_patch.py` makes one exact substring replacement in Confluence
storage XHTML without parsing and re-serializing the document. Its trust model
is mechanical: the anchor must be unique, every write is followed by a
verification diff, and every live write prints an exact restore command.

Live mode fetches, patches, updates, and re-fetches the page:

```sh
CONFLUENCE_EMAIL=writer@example.test CONFLUENCE_TOKEN=example-api-token \
  python3 tools/confluence_patch.py \
  https://example.atlassian.net/wiki/spaces/WD/pages/123456/Widget-Design-Doc \
  --find-file widget-old-anchor.xhtml --replace-file widget-new-anchor.xhtml \
  --message "paired change WD-42"
```

Use file mode when an MCP tool supplied a saved JSON response or raw storage
XHTML. The output is only the patched storage XHTML, ready for that tool to
push:

```sh
python3 tools/confluence_patch.py --file widget-page.json \
  --out widget-page-patched.xhtml \
  --find "<p>Old widget rule</p>" --replace "<p>New widget rule</p>"
```

Add `--dry-run` in either mode to print the intended verification diff without
writing a file or sending a PUT:

```sh
python3 tools/confluence_patch.py --file widget-page.json \
  --out widget-page-patched.xhtml --find-file old.xhtml \
  --replace-file new.xhtml --dry-run
```

`--restore <version>` (live mode only, no find/replace) republishes that
historical version's body as a new version — the undo for a bad patch; every
live patch also prints the exact restore command for its own undo.

## Exporting a GIF

Export every step of the first stepped diagram, or select any stepped diagram
by its 1-based rendered section number:

```sh
python3 tools/export_gif.py built-page.html
python3 tools/export_gif.py built-page.html --section 2 --width 1280 \
    --delay-ms 1600 --out walkthrough.gif
python3 tools/export_gif.py built-page.html --section 2 --out gifs/
python3 tools/export_gif.py built-page.html --section 2 --view home-story --out home.gif
python3 tools/export_gif.py built-page.html --skin daylight --dim-alpha 0.35
python3 tools/export_gif.py built-page.html --chrome /path/to/chrome
```

The GIF lands beside the page by default, named after it — with the section
reference appended when `--section` picked one, so exporting several sections
of one page never overwrites. `--view` also appends `-view-<id>` to the derived
name so captures of different views remain separate. `--out` takes an exact `.gif` path, or a
directory (existing, or marked by a trailing `/`) to receive the derived
name.

The tool locates Chrome/Chromium from `--chrome`, `$CHROME`, or common macOS and
Linux install paths, opens each canonical heading-slug
`#d=delivery-flow&m=step&s=…` deep link headlessly, and captures one frame per
step clipped to the diagram itself — the board with its legend, the widget
panels, and the step bar — with a `--margin` background border (default 16 px).
Without `--view`, custom and named layouts use the page's authored default view: the Home map,
visible panels and attached or detached step controls are captured together
in their arranged positions. Hidden tiles stay hidden and do not enlarge the crop.
Use `--view <layouts[].id>` to select a named view, or `home`, `flow`, or
`layout` for the corresponding legacy presentation. An explicit view exports
its visible steps in authored path order, with shared stops once and alternate
stops on their own paths. Unknown views and older HTML that cannot apply the
selector fail clearly. See [view links and captures](docs/section-layouts.md#link-to-or-capture-a-particular-view).
Section headings, prose, and whatever follows the diagram stay out of frame,
and a diagram taller than the viewport is captured in full. `--width` still
sets the layout viewport width the page renders at, and `--scale` (default 2)
renders each CSS pixel as that many device pixels, so text in the GIF stays
sharp without changing the layout. `--skin <name>` renders with that theme
instead of the page's own default — the name is validated against the page's
skin list (`window.dvSkins`), so an unknown token fails with the valid names.
`--dim-alpha <0..1>` overrides the step-mode non-highlighted opacity with one
uniform value; it sets the page's `--dv-dim` CSS variable, which every dimmed
step-mode element (edges, labels, nodes, coins) reads in place of its
per-element default. The `--margin` background around the diagram is always
the theme's page ground color: section boxes tint their background with the
section accent, so without a repaint two sections of one page would export
with two different background colors — the exporter paints the captured
section with the rendered page ground before every frame. It uses Pillow when installed and otherwise
falls back to its bundled PNG reader and pure-Python GIF encoder, so the page
itself remains zero-dependency and the exporter works with bare Python 3.
Duplicate step ids or ids that collide with a positional fallback make the
exporter use collision-safe positional references for every frame in that
diagram; the success output calls out when this fallback was needed.
Animated GIF is the format that renders inline in Confluence.

The `--section` CLI selector remains the 1-based rendered section number, while
the generated `d` fragment uses that section's canonical heading slug (or the
rendered index when it has no heading), so later diagrams in the same tab are
exportable without ambiguity. Duplicate heading slugs gain document-order
suffixes (`flow`, `flow-2`, `flow-3`). The fallback GIF encoder uses a fixed
256-color palette and favors correctness over file size; install Pillow for
better color reduction and smaller output. The complete composable fragment
grammar and its backward-compatible legacy forms are documented under “Viewer
features you get for free” in `contract/authoring-contract.md`.

Running the test suites locally (same invocations CI uses):

```
python3 -m unittest discover -s tests -v
node --test tests/*.test.js
```

## Serving a spec without injection

An **http(s)-served** copy of `template/flowview.html` whose JSON block still holds
the built-in demo also accepts `?spec=relative/path.json` and fetches the spec from
the adjacent file. `file://` pages cannot fetch — for a page that opens anywhere,
injection (`tools/inject.py`) stays the distribution mode.

## Site integration: theming

Rendered pages read the `dv_skin` cookie on load, ahead of the spec's `skin`
default, and expose the six valid tokens as `window.dvSkins`. The consuming
site owns the picker and persistence; the engine never writes cookies or uses
`localStorage`. A same-origin host dropdown can be wired without hardcoding:

```js
const select = document.querySelector('#design-theme');
for (const skin of window.dvSkins) select.add(new Option(skin, skin));
select.addEventListener('change', () => {
  document.cookie = `dv_skin=${select.value}; Path=/; SameSite=Lax`;
  window.dvSetSkin(select.value);
});
```

When the page sits in an **iframe** (the shell cannot reach `window.dvSetSkin`
directly), post a message instead — every built page listens for it:

```js
frame.contentWindow.postMessage({ type: 'dv_skin', skin: select.value }, '*');
```

Unknown skin names are ignored; the message changes styling only, so no origin
check is applied on the receiving side.

## Site integration: deep links in a shell

An iframe shell can register its canonical page URL as the rendered page's link
base. Copy-link icons then compose the page fragment onto that shell URL, and
subsequent in-page navigation is mirrored back to the shell. The page sends no
fragment data until a valid `dv_linkbase` handshake, and replies only to the
origin that sent it.

This complete shell example restores the iframe from the flat fragment grammar,
registers `https://example.test/#p=<page>`, and keeps the shell address bar in
sync:

```html
<iframe id="design-page" title="Design page"></iframe>
<script>
const SHELL_ORIGIN = 'https://example.test';
const frame = document.querySelector('#design-page');

// Split #p=<page.html>&d=motion&s=3 into the iframe file and its own hash.
const shellParams = new URLSearchParams(location.hash.slice(1));
const page = shellParams.get('p') || 'overview.html';
shellParams.delete('p');
const iframeURL = new URL(page, SHELL_ORIGIN + '/');
const restoredFragment = shellParams.toString();
if (restoredFragment) iframeURL.hash = restoredFragment;
frame.src = iframeURL.href;

frame.addEventListener('load', () => {
  const linkBase = SHELL_ORIGIN + '/#p=' + encodeURIComponent(page);
  frame.contentWindow.postMessage(
    {type: 'dv_linkbase', base: linkBase},
    SHELL_ORIGIN
  );
});

window.addEventListener('message', event => {
  if (event.origin !== SHELL_ORIGIN || event.source !== frame.contentWindow)
    return;
  if (!event.data || event.data.type !== 'dv_fragment' ||
      typeof event.data.fragment !== 'string') return;
  const next = 'p=' + encodeURIComponent(page) +
    (event.data.fragment ? '&' + event.data.fragment : '');
  history.replaceState(null, '', '#' + next);
});
</script>
```

The skin channel can share this same `load` handler: send its `dv_skin` message
beside `dv_linkbase`. A same-origin integration may instead call
`frame.contentWindow.dvSetLinkBase(linkBase)`; invalid, relative, and non-HTTP(S)
bases are rejected.

## Known limits / next steps

- Layout auto-cleanup (label de-collision, parallel-edge offsets) is heuristic; the
  lint rules in `tools/validate.js` flag what it cannot save (labels far longer than
  their edge, heavily crowded corridors). Manual `bend` / `labelDx` / `labelDy`
  nudges remain available and documented.
- Two steps sharing the same first edge collide on step-number placement (lint
  warns; reorder one step's edges list).
- Group members must be placed adjacently (one stack column works best); the boundary is a
  bounding box, not a layout constraint.
- Spec comparison annotates contract rows for the existing delta badges; it does
  not produce a side-by-side whole-page visual diff.

`examples/doorbell/` is the northstar acceptance proof: the two-chip doorbell page —
containment group, WAKE_INT interconnect, five synchronized inspector panels including the
viewfinder REC moment — generated entirely from `doorbell.spec.json`.

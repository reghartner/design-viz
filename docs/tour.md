# Authoring the first-run guided tour

The standalone viewer and the workbench’s read-only Canon reader share a guided
tour that runs once per browser the first time a person opens a Flowview page. It dims the page, cuts bright
holes over real controls, and narrates. The built-in walkthrough finds a
suitable section and view for each lesson, including diagrams in other tabs.
It includes only features the page can demonstrate and numbers those lessons
consecutively. The chooser explains that the walkthrough is tailored to the
page; a diagram without alternate paths has no branching lessons.

A page-authored tour declares its own sequence, state and targets. The runtime
filters that sequence by persona and warns and passes through when a declared
control or state is missing, preserving authored numbering. It does not append
lessons or search other sections for a page-authored target. The tour runs in
the standalone viewer and Canon reader; it does not run in the editing workspace.

For agent authoring, the Workbench's **How this works · Agent walkthrough**
opens the **Work with an agent** chapter of the [User guide](workbench-user-guide.md).
It covers workflow choice, diagram folders, selected message context and explicit
review of spec/ledger updates. These editor actions do not belong in `page.tour`
or the built-in reader lessons, whose targets must exist in the read-only viewer.

Opening **Canon diagrams → View diagram** on the launch page offers the tour
on the first visit. Published `?diagram=<id>` links and the offline bundled
example behave the same way. Skip or finish once to dismiss automatic offers;
the **?** button replays it. Add `#tour=1` before opening a diagram to force it,
or `#tour=0` to suppress automatic opening. Leaving the reader, using browser
Back, or choosing **Edit in Workbench** disposes the tour without changing the
draft or marking an unfinished tour complete.

## New topics for returning readers

After the initial tour, a **New features to explore · N** button appears when
the current diagram can demonstrate built-in topics the reader has not seen.
It opens a short tour of those topics, followed by a closing card. It never
opens an overlay automatically. The **?** button and `#tour=1` still offer the
full available walkthrough. `#tour=0` and links to a specific viewer state
suppress the new-topic offer as well as automatic first-visit opening.

A topic is learned when its narration is displayed. Skipping, navigating away,
or choosing a different audience does not mark unvisited topics learned.
The UX transport lesson and engineering step-mode lesson share one topic.
Offers respect the reader’s last audience selection (UX, engineering, or both).
A different diagram can therefore introduce branching, drill-downs or Explore
without repeating familiar lessons.

History uses `localStorage["dv_tour_features_v1"]` and stores only topic IDs and
the audience choice. It is local to this browser and site; it does not sync
accounts or send telemetry. Local-file storage is browser-dependent. If storage
is denied, history survives Canon reader changes in the current page only.
Older readers with only the completion flag get an optional offer because their
individual learned topics are unknown. Custom `page.tour` sequences remain
independent and do not mark built-in topics learned.

## Editing a custom tour in the workbench

Open **Inspect → Document settings → Advanced: reader tour and compatibility**
and edit **Reader tour JSON**. The workbench validates JSON and the existing tour
contract before committing. Invalid text stays in the field for correction and
does not change source or Undo history. Leave the field or Tab out to commit a
valid tour as one Undo action. Clear it to restore the built-in walkthrough.
This area also shows read-only runtime, contract and feature requirements;
Save/Export manage compatibility metadata. Test the custom tour in a published
viewer or Canon reader, since tours do not run in the editing workspace.

## Where the config lives

- Built-in default: `src/tour.config.js` (`TOUR_DEFAULT_CONFIG`). Treat it as
  the worked template: copy it into your page spec and edit.
- Per-page config: a `"tour"` object inside the spec's page object
  (`page.tour`). A `"tour"` key at the spec's top level is ignored, with a
  console warning.
- A page config replaces the default **wholesale** — no merging. An unusable
  config (wrong `version`, no well-formed step) falls back to the built-in
  default and the validator prints warnings.

## The cutout contract

The dim is an SVG mask: one black rounded rect per hole on a white base.

- One geometry, one render path: each highlight is a single shape object
  `{x, y, width, height, rx}` that writes BOTH its mask hole and its ring
  rect (in the same SVG), so hole and ring are identical by construction.
  The ring's 2px stroke is centered on the hole edge (1px inside, 1px
  outside); the primary ring's glow is a blurred wider stroke on a third
  rect with the same shape. Primary holes use a 12px radius; secondary
  holes are pills (radius = half their height).
- The un-dimmed region is exactly the UNION of those rounded rects:
  overlapping or nested holes (▶ inside a ringed transport, a ringed toggle
  inside a revealed board, a trigger ring overlapping its menu) simply
  overlap in the mask. No pixel outside some ring's shape is un-dimmed.
- Clicks are blocked by a separate layer covering the complement of the
  union, decomposed into axis-aligned cells; every point inside a hole is
  clickable exactly once. For CLICKS ONLY, a hole's rounded corners count
  as its bounding rect — the visual is exact.
- Mask holes, rings, notes and click-blocker cells are all produced from
  that one highlight list in one pass, so no layer lags another.
- Card placement avoids EVERY ring and note, computed from the final
  layout before the card shows. Candidates, in order: bottom-left,
  bottom-right, top-left, top-right, bottom-centre, top-centre at a 44px
  margin, then the same six at 16px. First choice: the first candidate
  covering no ring and no note. Fallback: the candidate clear of the
  primary ring covering the least total area of secondary rings and notes
  (earliest wins a tie). Last resort (the primary spans every candidate): the one
  covering the least of it. The rule used is exposed as the card's
  `data-placement` (`clear` | `partial` | `covers-primary`).
- The narration card appears ONCE, in its final place: on every spot step
  it stays hidden from entry until the step's final target is placed, then
  appears with the rings. A click step's card waits through the ~600ms
  pre-click hold (the ⋯ ring shows) and appears beside the opened menu.
- Step changes are ONE movement: the page dims fully, the state is applied
  and the scroll settles under the dim, then the new spotlight is revealed.
  Nothing hops twice.
- Secondaries are all-or-nothing: after the step's scroll settles (which
  centers the PRIMARY target), a secondary whose padded rect is not fully
  inside the viewport gets no ring, no hole and no note. Deterministic and
  never a clipped sliver — if a secondary matters, author the page so it
  shares the screen with the primary, or give it its own step.

## Config shape (version 1)

```json
{
  "version": 1,
  "steps": [
    {
      "id": "mode-step",
      "kind": "spot",
      "personas": ["eng", "both"],
      "target": {"selector": ".step-transport", "within": "section"},
      "diagramState": {"section": "ring-flow", "mode": "step", "path": "@alt", "step": "@shared"},
      "offset": {"dx": 0, "dy": -4, "dw": 0, "dh": 8},
      "copy": {
        "heading": "One call at a time",
        "body": "Watch this sequence, then replay the example or try the controls.",
        "reducedMotionBody": "Use the ‹ › buttons to follow this sequence at your own pace."
      },
      "secondary": [{"target": {"selector": ".presentbtn", "within": "page"}, "note": "…"}],
      "reveal": [{"selector": ".board", "within": "section"}],
      "demo": {"advance": 2, "intervalMs": 1600}
    }
  ]
}
```

Per step:

- `id` — required, unique. Named in every console warning about the step.
- `kind` — `"spot"` (default), `"chooser"` (the persona question; first step
  only, extras dropped with a warning), `"done"` (closing card).
- `personas` — **explicit** track membership: any of `"ux"`, `"eng"`,
  `"both"`. Omitted = every track. `"both"` is its own track and sees only
  steps that list it (or list nobody) — the author decides its walk; nothing
  is inferred. The shipped default gives `both` the engineering mode pair
  and links plus the panels, Explore and Expand lessons. View choice and
  branching lessons are shared by all tracks.
- `target.selector` / `target.within` — the spotlit control, strictly scoped
  to `"section"` (default) or `"page"`. The first rendered match in that
  scope is used, rather than a hidden copy in an inactive layout. It is
  measured live when the step opens. An enclosing `details` disclosure is
  opened for the lesson and restored when the tour ends.
- `offset` — small pixel nudges `{dx, dy, dw, dh}` on the primary hole+ring.
- `diagramState` — the state this step needs, applied on entry: `section`,
  `view`, `presentation` (`"standard"`/`"explore"`), `mode`
  (`"step"`/`"ambient"`), `path` (id or `"@alt"` = second
  path), `step` (id; `"@fork"` = the last step of the first two paths'
  common opening, only when they then genuinely diverge (not when one is
  a prefix of, or identical to, the other); `"@shared"` = the last step the first
  two paths share anywhere; `"@rejoin"` = the second path's first own step
  that flows back into shared steps). **An unresolvable path/step token skips the step at entry**
  — same warning and pass-through as a missing target — so rejoin copy can
  never show over a path that does not rejoin. An explicit view or step ID that does not resolve also skips the lesson.
  `diagramVisible: true` temporarily reveals the graph, including an enclosing
  disclosure; leaving the tour restores its previous visibility.
  `view` names an authored view ID. For a portable lesson, `presentation`
  selects the first matching named view; an ordinary diagram without named
  views already uses Standard. An explicit `view` takes precedence. A
  requested presentation that is unavailable warns and skips the lesson.
  These are reader chapter selections; the tour never changes a chapter's
  authored Viewing mode setting. The underlying `view` field and IDs remain
  stable for existing specs and links.
- `copy` — `eyebrow` (omitted = automatic "TOUR · STEP n OF m"), `heading`,
  `body`; chooser adds `choices` (`{persona, label, sub}`) and `note`.
  Optional `reducedMotionBody` replaces `body` when reduced motion is on,
  including on controls and closing cards. Use it whenever normal copy
  promises animation or asks for ▶, which is disabled under reduced
  motion. An advance demo without this alternative receives the runtime's
  standard manual-step hint.
- `secondary` — extra ringed cutouts: one `{target, note}` or a list.
  **Every control the copy names carries a ring, and every ring sits on an
  un-dimmed cutout.**
- `reveal` — extra ring-less cutouts (`[{selector, within}]`): regions the
  step un-dims without pointing at them. Demo steps reveal the diagram so
  the viewer sees the cause react, not just the ringed control — the
  shipped mode pair, split, rejoin and panels steps all reveal `.board`.
- `demo` — a demonstrated behavior; exactly one of:
  - `advance` — playback: advances the stepper `advance` times (cap 30) on
    `intervalMs` (default 1800, min 400), starting from the path's first
    stop unless `diagramState.step` authored a start. Stops on any tour
    interaction or any click on the page through a hole. **Replay example**
    restarts the authored demonstration on the current lesson, so a reader
    can watch again after reading or trying a control. Under
    `prefers-reduced-motion` it never auto-advances: the transport is
    spotlit instead, the authored target becomes a secondary ring, and the
    copy points at the ‹ › step arrows (the engine disables ▶ there).
    Replay example is not offered under reduced motion; **Try controls**
    provides keyboard access to the highlighted manual controls.
  - `click` — a demonstrated action: the tour scrolls the control's node to
    center, settles, reveals it ringed, holds ~600ms (cause before effect),
    then dispatches a real click and spotlights the step's `target` (the
    opened menu — scope it `"section"`: the menu mounts in the diagram
    host). Leaving the step un-clicks via the control's own toggle, checked
    against THAT control's expanded state. Runs as authored under reduced
    motion. A click step must declare both `demo.click` and `target`.
    A drill-down trigger (`.detail-trigger`, the ⊞ button) works the same
    way: the tour presses it, the engine opens the focused detail flow, the
    tour scrolls that flow into view under the dim and rings its board and
    breadcrumb. Leaving the step returns to the parent level through the
    engine's own silent close — no history entry, no URL change.
  **Authoring rule:** use `demo.click` when the narration says the tour
  has opened or pressed something. For a reader exercise, ring the real
  control and explain the action and its way back; **Try controls** lets
  keyboard users take part. Do not describe an action as demonstrated
  when the tour only points at its button.

## Authoring a Standard and Explore chapter sequence

Teach chapter choice before controls. Named chapters can change the arrangement
and the visible step stops; they need not be called “Story” and “Data flow.”
Standard preserves the authored tiles. Explore puts the graph in a larger
workspace with movable panels and step controls that default to viewport-pinned
Floating placement. Each chapter can choose **Panels → Step controls → On canvas**
to move and zoom the controls with the graph. Authors save the choice as
`exploreLayout.controlsPlacement` (`"floating"` or `"canvas"`), preserving the
Floating rectangle in `exploreLayout.controls` and the separate graph rectangle
in `exploreLayout.canvas.controls`. Explore chapter buttons
carry an **EXPLORE** marker, and a document tab carries the same marker when
its primary diagram's current chapter uses Explore viewing mode. The marker's tooltip and
accessible description explain that the canvas can be panned and zoomed.
Both viewing modes present the same underlying story.

The built-in Explore pair declares `presentation: "explore"`. Its first
lesson highlights a visible floating panel and explains moving, resizing
and hiding it. If every panel is hidden, it points at the Panels menu
instead. The next lesson opens that menu and teaches recovery through
panel checkboxes and **Stack at edge**. It does not force hidden panels
back on. The Expand lesson then offers more room for the current section,
in Standard as well as Explore, with **Exit expanded view** as the way back.

A page-authored tour should use the actual view IDs and panel names. For
example, these two steps fit the named-layouts starter's `home-story` and
`service-flow` views; add them to your own complete `page.tour.steps` list:

```json
[
  {
    "id": "read-at-home",
    "diagramState": {"view": "home-story", "mode": "step"},
    "target": {"selector": ".diagram-view-choice", "within": "section"},
    "copy": {
      "heading": "Start with the resident's story",
      "body": "Home story uses the authored arrangement and a shorter set of stops. The same events still happen between those stops."
    }
  },
  {
    "id": "inspect-services",
    "diagramState": {"view": "service-flow", "mode": "step"},
    "target": {"selector": ".explore-panel-choices", "within": "section"},
    "secondary": [
      {"target": {"selector": ".explore-player", "within": "section"}, "note": "Step controls default to Floating, pinned to the viewport. Choose Panels → Step controls → On canvas to move and zoom them with the graph."}
    ],
    "copy": {
      "heading": "Inspect the service flow",
      "body": "Service flow uses Explore. This menu brings available panels back after you hide them; panels unavailable in this view or step are explained here."
    }
  }
]
```

Target `.pwidget[data-dv-panel]` for a live widget across presentations,
or `.explore-window:not([hidden])` when teaching its move/resize frame.
The old `.panelcol` shell can be empty and hidden after widgets move into
named layouts. For a particular panel in Explore, use its authored ID in
`[data-explore-panel="panel-id"]`. Panel menus and Expand are reader
controls; workbench actions such as Arrange section do not belong here.

## Copy rules for the shipped default (and good pages)

- The shipped default never names page-specific widgets ("the home", "the
  phone") — it says "the panels". A page-authored config SHOULD name
  its real widgets, paths and chips; that is the point of authoring.
- The branching split step anchors the row labels first ("each row is one
  scenario — its label names the path") before talking about splitting.
  Claims of clickability are true: spotlit chips really are clickable.
  A rejoin lesson describes the demonstrated paths meeting again; it must
  not claim every path shares a final sequence based on `@rejoin` alone.
- The mode pair is the lesson "map, then sequence": AMBIENT (everything lit
  at once) immediately before STEP (one call at a time). The ux track drops
  AMBIENT entirely — its controls step is play/pause/arrows only.
- The done card is a recap WITH a task: choose a numbered step and follow
  the story with playback or manual arrows. Engineering tracks also point
  to node source menus where available. Include the ?-replay line and a
  reduced-motion version that uses manual arrows. Pressing Done focuses
  the ▶ button (a step arrow under reduced motion) of the section the tour
  ran in, so trying it is one
  keystroke away; Skip and Esc instead return focus to wherever the reader
  was. Page-authored configs should name their real chips/paths here.

## Workbench onboarding

The workbench homepage uses the same renderer and `TOUR_DEFAULT_CONFIG` for its
diagram introduction, including persona choice and feature applicability. Its
**Take the tour** entry continues into agent and manual-editing chapters using
`wireTour`. Returning readers skip the introduction after explicitly completing
or skipping it. Closing the host alone does not mark the introduction complete;
the chapter bar always permits replay. Only actually shown reader topics enter
the existing browser-local feature history.

Workbench practice lives in an opaque-origin `sandbox="allow-scripts"` iframe,
created from a pristine shipped-document snapshot captured before draft or agent
recovery. A restrictive CSP blocks network requests. Practice draft persistence
uses a private in-memory store; the simulated agent transport reuses the actual
setup, review, apply and paired spec/ledger Undo code. Native clipboard events
are blocked, and agent copy actions write only to practice memory. Destroying
the iframe discards the practice session. The parent accepts only known progress
events from that exact iframe window and blocks editor shortcuts in tour chrome.

`src/starters/onboarding.json` owns the fixed fictional agent/manual exercise
sample. Company-owned `workbench/site.json` (or `build.py --config PATH`) selects
a separate homepage, expanded example and reader introduction spec. Without a
config, those surfaces use the same fictional sample. The portable viewer tour
discovers the configured diagram's applicable features. Agent/manual exercises
in `src/workbench/onboarding.js` retain their sample node and step identities.
Fullscreen and chapter switching belong to the host. Native dialogs retain their
own cancel handling before Escape can leave a chapter. These are host hooks,
not additions to the authored tour JSON schema.

Follow [Put your own diagram on the homepage](homepage-example.md) for the config
schema, update ownership, migration from injection patches, verification and an
agent prompt.

## Known limitations

- A drill-down into an EXTERNAL spec (host `loadDetail`) that was open
  before the tour is restored asynchronously; when it resolves, the engine
  rewrites the fragment once with the same state. Harmless and rare; local
  drill-downs restore synchronously.
- At a viewport edge, a ringed hole is inset 1px so its centered stroke
  stays fully visible — at most a 1px strip of the target at the screen
  edge stays dimmed. Hole and ring still share one geometry.

## What happens when a step cannot resolve

For a page-authored tour, entering a step applies its authored state first, then resolves its
controls. If the target, a click control, or a requested presentation or
path/step token is missing, the viewer warns with the step ID and the
unresolved control or state. A missing-target warning looks like:

    flowspec: tour step "<id>" target not found — check the tour config for this diagram

It then moves on in the walking direction (backwards too). The timeline keeps
the authored count. Fix the config; don't rely on the skip. `chooser` and
`done` steps always enter.

The built-in tour checks applicability before presenting its counter. It
prefers the previous lesson's section and view, then tries other sections and
views. Branching lessons require visible branch stops; panel demonstrations
start at a stop with a visible panel. Planning does not click source links or
open drill-downs. It restores the reader's tabs, views, path, disclosure state,
and workspace after each probe, keeping playback paused during the tour.
Expected omissions do not produce missing-target warnings. The original state
is restored when the tour finishes or is skipped.

## Authoring checklist (per diagram)

1. Build the page and open it in a browser.
2. Copy the default config into `page.tour` and edit: one step per thing
   worth showing, per persona track, in teaching order.
3. For every step, declare the state the control needs (`mode`, `path`,
   `view` or `presentation`, `section`) — what you clicked to see it is what
   the step declares. Prefer real view IDs in page-authored tours.
4. Selectors: prefer the engine's stable classes (`.step-transport`,
   `.path-timeline` (paths drawn as one packed timeline, because they
   rejoin) or `.path-matrix` (paths drawn as separate rows — they never
   rejoin, or never share a step at all; gate a split step with `@fork`), `.presentbtn`, `.nrefs-trigger`, `.node-link-menu`,
   `.detail-trigger`, `.detail-breadcrumb`,
   `.diagram-view-choice`, `.pwidget[data-dv-panel]`, `.mtoggle`, `.board`,
   `.termbar`, `.explore-window`, `.explore-player`, `.explore-panel-choices`,
   `.explore-stack`). Expand has the accessible label `Expand diagram view`,
   changing to `Exit expanded diagram view` while expanded.
5. Run `node tools/validate.js <spec>` — tour problems are warnings, never
   render blockers.
6. Walk the tour with `#tour=1`, every persona and reduced motion both on
   and off. Check keyboard access through Try controls, Replay example,
   hidden panels, and Expand/Exit. Watch the console for unresolved-target
   or state warnings; fix each one in a page-authored config.
7. Use `offset` last, for small pixel corrections only.

## Runtime behavior (fixed, not configurable)

- Shown once per browser (`localStorage["dv_tour_v1"]`, cookie fallback);
  replay via the `?` pill or `window.dvStartTour()`; `#tour=1` forces,
  `#tour=0` suppresses; deep-linked opens never auto-start; never wired on
  `#embed=` pages; printing hides it.
- Fragment writes are suppressed while the tour runs; the pre-tour snapshot
  (tabs, view, path, mode, step, playback, scroll, disclosures, open
  drill-downs and temporary reader workspace state) is restored
  field-by-field on Done/Skip — untouched diagrams are not driven at all.
  A drill-down open when the tour starts is closed
  so the tour walks the overview, then re-opened exactly on finish.
  Trying panel placement, visibility, zoom or section expansion during
  the tour does not overwrite the reader's pre-tour workspace. Browser fullscreen
  is requested again when restoring an expanded section; if the browser denies
  it, the section stays expanded within the page. The tour's
  controls remain reachable when a section enters browser fullscreen.
- Any internal error tears the overlay down, restores state, logs
  `flowspec: tour error` — fail-open, always.
- A small **Skip tour ✕** control sits fixed at the top LEFT for the
  whole tour (clear of PRESENT, which lives top right) — a mouse way out
  even while a click step holds its card. On narrow screens the step
  counter row is hidden (the card's eyebrow already carries the count); at
  any width, on a step where the counter would sit on a ring, it steps
  aside for that step.
- Keyboard: ← → navigate lessons while focus is on the tour's controls;
  Esc skips (hint hidden on the chooser). **Try controls** moves focus to
  a usable control in a highlighted region. Tab and Shift+Tab include
  highlighted controls as well as the tour buttons; arrow keys there keep
  their normal meaning, including moving or resizing a floating panel.
  The tour and presenter never both advance from one arrow key. While the
  tour's own ⋯ menu is open, moving focus onto the card keeps the menu open.
- Bundles that ship the page stylesheet without the tour fragment (the
  Backstage native viewer) carry the tour's CSS inert by design.

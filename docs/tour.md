# Authoring the first-run guided tour

The standalone viewer ships a guided tour that runs once per browser the
first time a person opens a Flowview page. It dims the page, cuts bright
holes over real controls, and narrates. **The tour is authored, not
detected:** the config is written per diagram by someone (or some agent) who
can see the rendered page. Each step declares the state it needs and the
controls it shows. The only automatic behaviors are persona filtering and a
warning-and-pass-through for steps whose declared control or state is
missing — an authoring bug the console surfaces, never something the tour
silently repairs.

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
- Mask holes, rings, notes and click-blocker cells are all produced from
  that one highlight list in one pass, so no layer lags another.
- The narration card appears ONCE, in its final place: on every spot step
  it stays hidden from entry until the step's final target is placed, then
  appears with the rings. A click step's card waits through the ~600ms
  pre-click hold (the ⋯ ring shows) and appears beside the opened menu.
- Step changes are ONE movement: the page dims fully, the state is applied
  and the scroll settles under the dim, then the new spotlight is revealed.
  Nothing hops twice.

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
      "copy": {"eyebrow": "TOUR · STEP 1 OF 4", "heading": "One call at a time", "body": "…"},
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
  and links plus the story and panels steps.
- `target.selector` / `target.within` — the spotlit control, strictly scoped
  to `"section"` (default) or `"page"`. Measured live when the step opens.
- `offset` — small pixel nudges `{dx, dy, dw, dh}` on the primary hole+ring.
- `diagramState` — the state this step needs, applied on entry: `section`,
  `view`, `mode` (`"step"`/`"ambient"`), `path` (id or `"@alt"` = second
  path), `step` (id; `"@fork"` = the last step of the first two paths'
  common opening — where they split; `"@shared"` = the last step the first
  two paths share anywhere; `"@rejoin"` = the second path's first own step
  that flows back into shared steps). **An unresolvable path/step token skips the step at entry**
  — same warning and pass-through as a missing target — so rejoin copy can
  never show over a path that does not rejoin. An explicit step id that
  does not resolve is softer: the step shows, the diagram stays put.
- `copy` — `eyebrow` (omitted = automatic "TOUR · STEP n OF m"), `heading`,
  `body`; chooser adds `choices` (`{persona, label, sub}`) and `note`.
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
    interaction or any click on the page through a hole. Under
    `prefers-reduced-motion` it never auto-advances: the transport is
    spotlit instead, the authored target becomes a secondary ring, and the
    copy points at the ‹ › step arrows (the engine disables ▶ there).
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
  **Authoring rule: if the copy tells the reader to open or press
  something, the tour demonstrates it.**

## Copy rules for the shipped default (and good pages)

- The shipped default never names page-specific widgets ("the home", "the
  phone") — it says "the side panels". A page-authored config SHOULD name
  its real widgets, paths and chips; that is the point of authoring.
- The branching split step anchors the row labels first ("each row is one
  scenario — its label names the path") before talking about splitting.
  Claims of clickability are true: spotlit chips really are clickable.
- The mode pair is the lesson "map, then sequence": AMBIENT (everything lit
  at once) immediately before STEP (one call at a time). The ux track drops
  AMBIENT entirely — its controls step is play/pause/arrows only.
- The done card is a recap WITH a task, chip-click first ("click any
  numbered chip…, then press ▶"; eng/both add "then open ⋯ on any node"),
  plus the ?-replay line. Pressing Done focuses the ▶ button (a step arrow
  under reduced motion) of the section the tour ran in, so trying it is one
  keystroke away; Skip and Esc instead return focus to wherever the reader
  was. Page-authored configs should name their real chips/paths here.

## Known limitations

- A drill-down into an EXTERNAL spec (host `loadDetail`) that was open
  before the tour is restored asynchronously; when it resolves, the engine
  rewrites the fragment once with the same state. Harmless and rare; local
  drill-downs restore synchronously.
- At a viewport edge, a ringed hole is inset 1px so its centered stroke
  stays fully visible — at most a 1px strip of the target at the screen
  edge stays dimmed. Hole and ring still share one geometry.

## What happens when a step cannot resolve

Entering a step applies its authored state first, then resolves its
controls. If the target, a click control, or a path/step token is missing,
the viewer prints

    flowspec: tour step "<id>" target not found — check the tour config for this diagram

and moves on in the walking direction (backwards too). The timeline keeps
the authored count. Fix the config; don't rely on the skip. `chooser` and
`done` steps always enter.

## Authoring checklist (per diagram)

1. Build the page and open it in a browser.
2. Copy the default config into `page.tour` and edit: one step per thing
   worth showing, per persona track, in teaching order.
3. For every step, declare the state the control needs (`mode`, `path`,
   `view`, `section`) — what you clicked to see it is what the step declares.
4. Selectors: prefer the engine's stable classes (`.step-transport`,
   `.path-timeline` (paths drawn as one packed timeline, because they
   rejoin) or `.path-matrix` (paths drawn as separate rows — they never
   rejoin, or never share a step at all; gate a split step with `@fork`), `.presentbtn`, `.nrefs-trigger`, `.node-link-menu`,
   `.detail-trigger`, `.detail-breadcrumb`,
   `.diagram-view-choice`, `.panelcol`, `.mtoggle`, `.board`, `.termbar`).
5. Run `node tools/validate.js <spec>` — tour problems are warnings, never
   render blockers.
6. Walk the tour with `#tour=1`, every persona, watching the console for
   `target not found` warnings; fix each one.
7. Use `offset` last, for small pixel corrections only.

## Runtime behavior (fixed, not configurable)

- Shown once per browser (`localStorage["dv_tour_v1"]`, cookie fallback);
  replay via the `?` pill or `window.dvStartTour()`; `#tour=1` forces,
  `#tour=0` suppresses; deep-linked opens never auto-start; never wired on
  `#embed=` pages; printing hides it.
- Fragment writes are suppressed while the tour runs; the pre-tour snapshot
  (tabs, view, path, mode, step, playback, scroll, disclosures, and an open
  drill-down) is restored field-by-field on Done/Skip — untouched diagrams
  are not driven at all. A drill-down open when the tour starts is closed
  so the tour walks the overview, then re-opened exactly on finish.
- Any internal error tears the overlay down, restores state, logs
  `flowspec: tour error` — fail-open, always.
- A small **Skip tour ✕** control sits fixed at the top right for the
  whole tour — a mouse way out even while a click step holds its card.
- Keyboard: ← → move, Esc skips (hint hidden on the chooser); the tour owns
  those keys; presenter mode never double-advances.
- Bundles that ship the page stylesheet without the tour fragment (the
  Backstage native viewer) carry the tour's CSS inert by design.

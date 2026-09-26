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

The scrim is one element whose holes are cut with an even-odd `clip-path`:

- Every hole is the SAME rectangle, padding and corner radius as its ring —
  hole and ring read as one shape. Primary holes use the ring's 12px radius;
  secondary holes are pills, matching their pill rings.
- Holes are genuinely un-dimmed AND pointer-transparent: the spotlit
  controls are clickable for real (chips in a spotlit timeline included).
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
  path), `step` (id, `"@shared"` = the last step the first two paths share,
  or `"@rejoin"` = the second path's first own step that flows back into
  shared steps). **An unresolvable path/step token skips the step at entry**
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
  shipped split, rejoin and panels steps all reveal `.board`.
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
  plus the ?-replay line. On close, focus lands on the ▶ transport button so
  trying it is one keystroke away. Page-authored configs should name their
  real chips/paths here.

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
   `.path-timeline`, `.presentbtn`, `.nrefs-trigger`, `.node-link-menu`,
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
  (tabs, view, path, mode, step, playback, scroll, disclosures) is restored
  field-by-field on Done/Skip — untouched diagrams are not driven at all.
- Any internal error tears the overlay down, restores state, logs
  `flowspec: tour error` — fail-open, always.
- Keyboard: ← → move, Esc skips (hint hidden on the chooser); the tour owns
  those keys; presenter mode never double-advances.
- Bundles that ship the page stylesheet without the tour fragment (the
  Backstage native viewer) carry the tour's CSS inert by design.

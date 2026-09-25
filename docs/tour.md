# Authoring the first-run guided tour

The standalone viewer ships a guided tour that runs once per browser the
first time a person opens a Flowview page. It masks the page, ring-lights one
real control at a time, and narrates. **The tour is authored, not detected:**
the config is written per diagram by someone (or some agent) who can see the
rendered page. Each step declares the state it needs and the control it
points at; the runtime applies that state on entry and draws the ring. The
only automatic behaviors are persona filtering and a warning-and-pass-through
for steps whose control is missing — an authoring bug the console surfaces,
never something the tour silently repairs.

## Where the config lives

- Built-in default: `src/tour.config.js` (`TOUR_DEFAULT_CONFIG`). Treat it as
  the worked template: copy it into your page spec and edit.
- Per-page config: a `"tour"` object inside the spec's page object
  (`page.tour`). A `"tour"` key at the spec's top level (next to `"page"`) is
  ignored, and the viewer prints a console warning saying so.
- A page config replaces the default **wholesale** — there is no merging. An
  unusable config (wrong `version`, no well-formed step) falls back to the
  built-in default and the validator prints warnings.

## Config shape (version 1)

```json
{
  "version": 1,
  "steps": [
    {
      "id": "controls",
      "kind": "spot",
      "personas": ["eng"],
      "target": {"selector": ".step-transport", "within": "section"},
      "diagramState": {"section": "ring-flow", "mode": "step", "path": "@alt", "step": "@shared"},
      "offset": {"dx": 0, "dy": -4, "dw": 0, "dh": 8},
      "copy": {"eyebrow": "TOUR · STEP 1 OF 4", "heading": "Play the story", "body": "…"},
      "secondary": {"target": {"selector": ".presentbtn", "within": "page"}, "note": "…"},
      "demo": {"advance": 3, "intervalMs": 1800}
    }
  ]
}
```

Per step:

- `id` — required, unique. Named in every console warning about the step.
- `kind` — `"spot"` (default: highlights a control), `"chooser"` (the persona
  question; no target), `"done"` (closing card; no target). A chooser must be
  the **first** step; later or extra choosers are dropped (the validator
  warns).
- `personas` — who sees the step: any of `"ux"`, `"eng"`. Omitted = everyone.
  The `"both"` choice always sees every step. This is the ONLY filtering the
  runtime does; author each persona's track deliberately.
- `target.selector` — a CSS selector into the rendered page. `target.within`
  is `"section"` (resolve only inside the step's section, the default) or
  `"page"`. The highlight rectangle is measured from the live element when
  the step opens.
- `offset` — small pixel nudges `{dx, dy, dw, dh}` applied after the
  standard 8px padding: the knob for per-diagram pixel corrections. The
  rectangle is clamped to the viewport.
- `diagramState` — the state this step needs on screen, applied when the
  step is entered: `section` (a section reference or id; omitted = the
  page's first diagram — entering also selects that section's tab), `view`
  (a named layout id), `mode` (`"step"` or `"ambient"`), `path` (a path id,
  or `"@alt"` = the second path), `step` (a step id, or `"@shared"` = the
  last step shared by the first two paths). Declare what you need: a step
  that spotlights the transport should say `"mode": "step"`, because an
  ambient diagram keeps its transport hidden until then. The tour drives
  the page's own controls; it never rewrites the URL.
- `copy` — `eyebrow` (omitted = automatic "TOUR · STEP n OF m"), `heading`,
  `body`. On a `chooser` step, `copy.choices` is a list of
  `{persona, label, sub}` objects and `copy.note` is the small print.
  Malformed entries are ignored (fallback button, validator warning).
- `secondary` — one extra thin-ring callout with its own `target` and
  `note`.
- `demo` — a playback demo: on entry the tour rewinds the section's stepper
  to its path's first visible stop, then advances it `advance` times
  (default 3, capped at 30), one step every `intervalMs` milliseconds
  (default 1800, minimum 400), so the spotlit panels visibly change. Any
  interaction stops it — the tour's controls, arrow keys, or any click on
  the page through the hole. Under `prefers-reduced-motion` it never
  auto-advances: the step spotlights the step transport instead, rings the
  configured target as its secondary callout, and tells the visitor to use
  the ‹ › step arrows (the engine disables ▶ under reduced motion).

## What happens when a step's control is missing

Entering a step applies its authored state first, then resolves the
selector. If the control is still missing or unrendered, the viewer prints

    flowspec: tour step "<id>" target not found — check the tour config for this diagram

and moves on to the next step in the walking direction (backwards too).
Viewers see a brief pass-through; the timeline keeps the authored count.
This is deliberately NOT adaptive: fix the config, don't rely on the skip.
An unresolvable `diagramState.path` token warns the same way and the step
still shows. `chooser` and `done` steps always enter.

## Authoring checklist (per diagram)

1. Build the page and open it in a browser.
2. Copy the default config into `page.tour` and edit: one step per thing
   worth showing, in the order a first-time reader should meet them. Write
   each persona's track (`personas`) deliberately.
3. For every step, note the state the control needs (`mode`, `path`,
   `view`, `section`) — what you had to click to see it is what the step
   must declare.
4. Selectors: prefer the engine's stable classes (`.step-transport`,
   `.path-timeline`, `.presentbtn`, `.nrefs-trigger`,
   `.diagram-view-choice`, `.panelcol`, `.mtoggle`, `.termbar`).
5. Run `node tools/validate.js <spec>` — tour problems are warnings
   (`page.tour...`), never render blockers.
6. Walk the tour with `#tour=1` on the URL, every persona. Watch the
   console for `target not found` warnings and fix each one (wrong
   selector, missing `diagramState`, wrong section reference).
7. Use `offset` last, for small pixel corrections only.

## Runtime behavior (fixed, not configurable)

- Shown once per browser: `localStorage["dv_tour_v1"]`, with a `dv_tour=1`
  cookie fallback when storage is denied. Replayable from the `?` pill next
  to PRESENT, or `window.dvStartTour()`.
- `#tour=1` forces the tour; `#tour=0` suppresses it. A page opened through
  a deep link (any targeting fragment) never auto-starts the tour — the `?`
  pill still offers it.
- While the tour runs, fragment writes are suppressed; the tour snapshots
  the diagram state it found (tabs, view, path, mode, step, playback,
  scroll) and restores exactly what it changed on Done/Skip — untouched
  diagrams are not driven at all, and a diagram that was auto-playing
  resumes. Disclosures the tour opened are closed again.
- Any internal error tears the overlay down, restores state, and logs
  `flowspec: tour error` — the page stays usable (fail-open).
- Never wired on pages loaded with an `#embed=` fragment. Printing hides
  the overlay and the `?` pill.
- Keyboard: ← → move, Esc skips (hint hidden on the chooser); the tour owns
  those keys while up — presenter mode never double-advances. The spotlit
  control stays clickable through the hole. The node-links step spotlights
  the node card; a menu the viewer opens paints above the scrim.
- Bundles that ship the page stylesheet without the tour fragment (the
  Backstage native viewer) carry the tour's CSS inert: no `.dv-tour` DOM
  exists there; one shared stylesheet beats a per-entrypoint fork.

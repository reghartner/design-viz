# The first-run guided tour, and how to retarget it

The standalone viewer ships a guided tour that runs once per browser the
first time a person opens a Flowview page. It masks the page, ring-lights one
real control at a time, and narrates. Everything it shows is driven by a JSON
config — **retargeting the tour to a different diagram is a config edit, not a
code change.** This document is the contract for the agent (or person) doing
that edit.

## Where the config lives

- Built-in default: `src/tour.config.js` (`TOUR_DEFAULT_CONFIG`). It ships in
  every built page and is written to skip gracefully, so it works on any spec.
- Per-page override: a `"tour"` object inside the spec's page object
  (`page.tour`). A `"tour"` key at the spec's top level (next to `"page"`) is
  ignored, and the viewer prints a console warning saying so.
- An override replaces the default **wholesale** — there is no merging. An
  unusable override (wrong `version`, no well-formed step) falls back to the
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

- `id` — required, unique.
- `kind` — `"spot"` (default: highlights a control), `"chooser"` (the persona
  question; no target), `"done"` (closing card; no target). A chooser must be
  the **first** step; later or extra choosers are dropped (the validator
  warns).
- `personas` — who sees the step: any of `"ux"`, `"eng"`. Omitted = everyone.
  The `"both"` choice always sees every step.
- `target.selector` — a CSS selector into the rendered page. `target.within`
  is `"section"` (the default) or `"page"`. Section scoping is **strict**:
  the selector is resolved only inside the step's section (see
  `diagramState.section`); it never falls back to a page-wide search. The
  highlight rectangle is measured from the live element at show time
  (`getBoundingClientRect`), so ordinary layout differences need no
  configuration at all.
- `offset` — small pixel nudges `{dx, dy, dw, dh}` applied to the measured
  rectangle after its standard 8px padding. This is the knob for per-company
  pixel-layout corrections. Keep values small; the rectangle is clamped to
  the viewport.
- `diagramState` — what the diagram should show while the step is up:
  `section` (a section reference; omitted = the page's first diagram),
  `view` (a named layout id), `mode` (`"step"` or `"ambient"`), `path` (a
  path id, or the token `"@alt"` = the second path), `step` (a step id, or
  the token `"@shared"` = the last step shared by the first two paths — the
  merge zone). The tour drives the page's own controls; it never rewrites
  the URL (see "Deep links and state", below).
- `copy` — `eyebrow` (omitted = automatic "TOUR · STEP n OF m"), `heading`,
  `body`. On a `chooser` step, `copy.choices` is a list of
  `{persona, label, sub}` objects and `copy.note` is the small print.
  Malformed `choices` entries are ignored; an empty or invalid list renders
  a single "Show me around" button (and the validator warns).
- `secondary` — one extra thin-ring callout with its own `target` and `note`
  (used by the default for the PRESENT button).
- `demo` — a playback demo: while the step is up, the tour advances the
  section's active stepper `advance` times (default 3, capped at 30), one
  step every `intervalMs` milliseconds (default 1800, minimum 400), so the
  spotlit panels visibly change. Any tour interaction (Back, Next, Skip,
  arrow keys) stops the demo immediately. Under `prefers-reduced-motion`
  the demo never auto-advances: the step instead spotlights the step
  transport (so the visitor presses the real ▶ themselves), rings the
  configured target as its secondary callout, and appends a sentence saying
  auto-play is off.

## The skip rule (why one config fits many pages)

A `spot` step is silently dropped, and the timeline renumbers, when:

- its `target.selector` matches nothing inside its section (or the page,
  for `within: "page"`), or
- the match is not rendered (zero-size / display-none) — with one exception:
  a target inside an inactive tab **of an explicitly named
  `diagramState.section`** is kept, and the tour selects that tab on entry, or
- `diagramState.section` names a section that does not exist, or
- `diagramState.path` names a missing path (`"@alt"` on a single-path
  diagram), or
- `diagramState.step` is `"@shared"` and the first two paths share no step, or
- the step declares a `demo` and its section has no stepper.

An explicit `diagramState.step` id that does not resolve is softer: the step
still shows, the diagram just stays where it is.

Every skip is logged to the console as
`flowspec: tour step "<id>" skipped — …` for config authors; viewers see
nothing. So: the default tour's branching step vanishes on unbranched pages,
its node-links step on pages without bindings, its story-view step on pages
without a view choice, and its panels demo on pages without a panel column.
`chooser` and `done` steps never skip.

## Deep links and state

- The tour never auto-starts when the page was opened through a deep link
  (a hash that targets a tab, diagram, step, path, view, contract card or
  collapse state). The reader came for that state; the `?` pill still offers
  the tour.
- While the tour runs, the page's fragment writes are suppressed; the tour's
  own driving of steppers (including demos) never changes the URL or
  history.
- The tour snapshots the diagram state it found (active tabs, each
  diagram's view, path, mode and step, scroll position) and restores it on
  Done and on Skip — including after a playback demo. Disclosures the tour
  opened are closed again.

## Failure posture

Any error inside the tour tears the overlay down, restores the page state,
and prints `flowspec: tour error — … — tour dismissed`. The page stays fully
usable (fail-open); the tour stays off until the next load or an explicit
replay. A malformed config never blocks rendering: `page.tour` problems are
validator **warnings**, and an unusable config falls back to the built-in
default.

## Retargeting checklist for a company page

1. Author the page spec as usual; check which controls exist (branching?
   bindings? named layouts? panels?).
2. Add `page.tour` only if the default flow or copy is wrong for the page —
   the default already adapts by skipping.
3. In an override, keep selectors to the engine's stable classes
   (`.step-transport`, `.path-timeline`, `.presentbtn`, `.nrefs-trigger`,
   `.diagram-view-choice`, `.panelcol`, `.mtoggle`, `.termbar`) and point
   `diagramState` at real section/path/step ids from the spec. Name
   `diagramState.section` explicitly for any step whose target lives in
   another tab.
4. Use `offset` last, for small pixel corrections only.
5. Run `node tools/validate.js <spec>` — tour problems appear as warnings
   (`page.tour...`), never errors.

## Runtime behavior (fixed, not configurable)

- Shown once per browser: `localStorage["dv_tour_v1"]`, with a `dv_tour=1`
  cookie fallback when storage is denied. Replayable from the `?` pill next
  to PRESENT, or `window.dvStartTour()`.
- `#tour=1` on the URL forces the tour; `#tour=0` suppresses it.
- Never wired on pages loaded with an `#embed=` fragment.
- Keyboard: ← → move, Esc skips; the spotlit control itself stays clickable
  through the hole. The node-links step spotlights the node card; a menu the
  viewer opens paints above the scrim (browser top layer).
- Under `prefers-reduced-motion` the ring's outer glow is reduced and demos
  never auto-advance.
- Printing hides the tour overlay and the `?` pill.

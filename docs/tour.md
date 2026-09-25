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
- Per-page override: a top-level `"tour"` object in the page spec
  (`page.tour`). An override replaces the default **wholesale** — there is no
  merging. An unusable override (wrong `version`, no well-formed step) falls
  back to the built-in default and the validator prints warnings.

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
      "secondary": {"target": {"selector": ".presentbtn", "within": "page"}, "note": "…"}
    }
  ]
}
```

Per step:

- `id` — required, unique.
- `kind` — `"spot"` (default: highlights a control), `"chooser"` (the persona
  question; no target), `"done"` (closing card; no target).
- `personas` — who sees the step: any of `"ux"`, `"eng"`. Omitted = everyone.
  The `"both"` choice always sees every step.
- `target.selector` — a CSS selector into the rendered page. `target.within`
  is `"section"` (resolve inside the step's section, the default) or
  `"page"`. The highlight rectangle is measured from the live element at
  show time (`getBoundingClientRect`), so ordinary layout differences need
  no configuration at all.
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
  the URL.
- `copy` — `eyebrow` (omitted = automatic "TOUR · STEP n OF m"), `heading`,
  `body`. On a `chooser` step, `copy.choices` is a list of
  `{persona, label, sub}` buttons and `copy.note` is the small print.
- `secondary` — one extra thin-ring callout with its own `target` and `note`
  (used by the default for the PRESENT button).

## The skip rule (why one config fits many pages)

A `spot` step is silently dropped, and the timeline renumbers, when:

- its `target.selector` matches nothing on the page, or
- `diagramState.section` names a section that does not exist, or
- `diagramState.path` names a missing path (`"@alt"` on a single-path
  diagram), or
- `diagramState.step` is `"@shared"` and the first two paths share no step.

An explicit `diagramState.step` id that does not resolve is softer: the step
still shows, the diagram just stays where it is.

So: the default tour's branching step vanishes on unbranched pages, its
node-links step vanishes on pages without bindings, and its story-view step
vanishes on pages without a view choice. `chooser` and `done` steps never
skip.

## Retargeting checklist for a company page

1. Author the page spec as usual; check which controls exist (branching?
   bindings? named layouts?).
2. Add `page.tour` only if the default flow or copy is wrong for the page —
   the default already adapts by skipping.
3. In an override, keep selectors to the engine's stable classes
   (`.step-transport`, `.path-matrix`, `.presentbtn`, `.nrefs-trigger`,
   `.diagram-view-choice`, `.mtoggle`, `.termbar`) and point `diagramState`
   at real section/path/step ids from the spec.
4. Use `offset` last, for small pixel corrections only.
5. Run `node tools/validate.js <spec>` — tour problems appear as warnings
   (`page.tour...`), never errors.

## Runtime behavior (fixed, not configurable)

- Shown once per browser: `localStorage["dv_tour_v1"]`, with a `dv_tour=1`
  cookie fallback when storage is denied. Replayable from the `?` pill next
  to PRESENT, or `window.dvStartTour()`.
- `#tour=1` on the URL forces the tour; `#tour=0` suppresses it.
- Never runs in `#embed=` views.
- Keyboard: ← → move, Esc skips; the spotlit control itself stays clickable.
- Honors `prefers-reduced-motion` (no glow pulse).

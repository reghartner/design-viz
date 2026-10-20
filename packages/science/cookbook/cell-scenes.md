# Teaching with a cell scene

Use `cellscene` to show where a cell event happens and which visible object
changes. It is an authored teaching cartoon: each position, count and event
comes from the spec. It does not calculate transport, reaction rates or growth.
For a complete multi-mechanism lesson, see [How a cell works, one step at a
time](../diagrams/biology/cell-journey/biology-teaching.spec.json). The
[copy-gate recipe](viral-copy-gate.md) covers a specialized RNA-copying example.

## Plan the scene

1. Name stable `compartments` such as `outside`, `cell`, `nucleus` or `vesicle`.
   Put them in a parent relationship only when the nesting matters to the
   explanation. Keep the scene to one cell, one nucleus and a few smaller
   compartments so labels stay readable.
2. Declare stable `items` with short labels, roles and starting compartments.
   Give each visible object a meaning in prose or the panel legend. Use
   `legendMode: "visible"` and `labelMode: "readable"` when the lesson has
   several entities.
3. Make each step change one causal beat. Patch `items` for a settled state;
   use `events` for a visible entrance, budding, fusion, division or signal.
   An event is a drawing instruction for that step, not a biological model.
4. Use `highlight`, `zoom`, `labels` and `caption` to direct attention. Keep a
   fixed camera across comparison steps unless the camera change itself helps
   explain the mechanism. Check every step and branch in the desktop preview.

For example, a simple transport beat can declare an `outside` compartment, a
`cell` compartment and an `ion` item that starts outside. A step can use
`{"events":[{"kind":"enter","item":"ion","to":"cell"}]}` to
illustrate crossing. That beat says *where the drawn ion ends up*; it does not
assert how many ions cross in a real cell or how fast they move.

## Authoring checks

- Use the focused `cellscene` contract for the exact role, shape, coordinate,
  event and patch limits. Ids stay stable across steps; an unknown target or
  invalid event is skipped with a validator warning.
- Write the mechanism and the limits of the drawing in the surrounding story.
  Label illustrative counts and use source links for factual claims.
- Run `node tools/validate.js <spec.json>` in the selected science checkout
  and require zero warnings. Then inspect the generated page at desktop width,
  including path switches, labels, legend, and the full step controls.

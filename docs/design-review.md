# Current and proposed design reviews

Open [the working example](../examples/design-review/design-review.spec.json) in
the desktop Workbench. Select **Proposed**, then expand **Compare with Today**.
The comparison shows both captions, their node/connection targets, verdicts and
decision references. Its highlighted row follows the selected step.

Nodes and connections accept `status: "proposed" | "open" | "decided"`.
The viewer automatically adds the used statuses to its legend. Nodes show a
named badge; connection labels include the symbol and status. Protocol colors
still describe transport, and per-step node tones still describe runtime state.
Use the **Review status** field in the node or connection inspector.

Set `presentation: "baseline"` on an existing node or connection to fade it in
Ambient, Step, every named View, and print. Connections between two baseline
nodes also fade, except connections marked Proposed or Open: new or unresolved
work stays prominent even between baseline nodes. An explicit connection
`presentation: "baseline"` always wins. Boundary connections to ordinary nodes
stay ordinary unless marked explicitly. A focused baseline remains readable but visually subdued.
This never hides topology or changes step membership. The inspector calls this
**Baseline context**. Imports can set the same presentation on their imported
context; see [shared topology](shared-topology.md).

## Compare two paths

Keep `diagram.steps` as the shared registry. Author ordinary explicit path
sequences, and set the current path's `basedOn` to the baseline path ID:

```json
"paths": [
  {"id":"today", "label":"Today", "steps":["press", "old-send", "old-save"]},
  {"id":"proposed", "label":"Proposed", "basedOn":"today", "steps":["press", "new-send", "new-save", "receipt"]}
]
```

Choose **Steps → Path settings → Compare with** in the Workbench. Comparison is
an optional reader disclosure. It aligns the full sequences by ordinal, before
any View filters. If one sequence ends sooner, its remaining cells say **No
step — path ended**. This is a comparison relation, not step inheritance: each
path retains its own order and folds only its own state patches from initial
values. Shared step IDs still refer to one body. Missing baselines and cycles
are validation errors; unchecked malformed inputs simply show no comparison.

A step can carry `verdict: "keep" | "replace" | "open"` and optional text
`ref: "decision 4"`. These render as a badge and plain reference in the active
caption, comparison and printed step list. They do not carry to the next step.
Use **Review verdict** and **Decision reference** in the step inspector.
Changing a shared step changes both paths. Use **Make independent here** when
the current path needs a different verdict, caption or patch. A base edit
appears in the comparison on the next render.

## Presentation and physical placement

**Playback settings → Show step IDs in captions** writes
`diagram.showStepIds: false` when unchecked. Published captions then omit stable
IDs; links and source navigation still work. Omission preserves visible IDs.

Floating cards with subtitles reserve enough height for two title lines and
the subtitle. Very long text still uses an ellipsis and a full-title tooltip.

Home device patches accept `{ "x": 190, "y": 60 }` alongside state, thermal,
spotlight, icon and audio fields. Coordinates carry along the selected path;
signals, camera coverage and other device effects use the effective position.
The editor accepts x 0–320 and y 0–180; raw out-of-frame coordinates produce a
warning and render clamped to that frame. Both coordinates are required together.
Drag a device in the step inspector to write one position patch with one Undo.
**Inherit position** removes only that step's x/y. Shared layout editing remains
available through **Edit shared home layout**. See [Home editing](homemap-workbench.md).

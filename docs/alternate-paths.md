# Alternate paths on one diagram

Use **starters… → alternate paths** in the workbench for a six-step happy
path and a four-step **Dropped signal** path on the same command diagram.
Both share steps 1–3; choices appear beneath step 3. Selecting a choice pauses
at that shared step. Next advances into the chosen outcome. The colored label,
step count, playback ending, highlighted hops, node tones and panel state all
follow that path. Chips retain their order when switching.

A path ends at its last referenced step. Next is disabled there; Play replays
from its first step. Returning to the happy path recomputes its state from the
same panel initial values. Success logs, notifications and state from a
previously selected outcome cannot carry over. Diagrams without paths retain
their existing playback behavior and show no path label. One explicit path
also hides the label and choices.

## Build a branch

1. Open **story steps**, choose the section and select the last shared beat.
2. Click **+ Alternate after selected step**. On the first fork the builder
   adds stable IDs to any unnamed steps and creates **Happy path** plus an
   orange **Dropped signal** path. The new path shares the prefix and gets
   one editable outcome step.
3. Edit its caption, node focus, tones and panel patches. Choose **Path label**
   and **Path color**, then **Update path**, to change its name and color.
4. Use **Append step**, **Duplicate**, and **Move up / Move down** to build its
   sequence. These change only the selected path's references. **+ step** in
   the main insertion toolbar also appends to the active path.

Shared steps have one body: changing a shared caption or patch updates every
path referencing it. Duplicate a step to make an independent copy. **Delete
step** removes the shared body and its references from all paths; the editor
refuses a deletion that would empty a path. **Remove alternate** removes only
that path, retaining its step bodies in JSON for reuse. The document outline
can still find unused bodies. Every structural edit uses one undo entry.

Ordinary edits and skin changes preserve the selected path and matching step.
Raw JSON edits must be rendered before the story list can change the source.
The effective-state inspector folds the selected path, with source links back
to the shared registry. Reveal/hide thresholds are positions within the selected
path; review them after reordering.

## Authoring shape

`diagram.paths` is optional. It contains named sequences of IDs from
`diagram.steps`, which becomes a shared registry. First path is the default.
This is an additive contract-1 feature; no schema version switch is needed.

```json
{
  "nodes": {"api": {}, "device": {}},
  "rows": [["api", "device"]],
  "edges": [{"from": "api", "to": "device"}],
  "view": "step",
  "steps": [
    {"id": "accept", "nodes": ["api"], "text": "Accept command"},
    {"id": "auth", "nodes": ["api"], "text": "Authorize operator"},
    {"id": "queue", "nodes": ["api"], "text": "Queue command"},
    {"id": "deliver", "edge": "api->device", "text": "Device receives command"},
    {"id": "apply", "nodes": ["device"], "text": "Device applies command"},
    {"id": "lost", "nodes": ["api"], "tone": {"device": "dim"}, "text": "Signal lost before delivery"}
  ],
  "paths": [
    {"id": "happy", "label": "Happy path", "color": "#38bdf8", "steps": ["accept", "auth", "queue", "deliver", "apply"]},
    {"id": "drop", "label": "Dropped signal", "color": "#fb923c", "steps": ["accept", "auth", "queue", "lost"]}
  ]
}
```

Each path requires a unique nonempty `id` and a nonempty array of step IDs.
References must resolve to unique existing steps; a path cannot repeat an ID.
Use distinct step bodies for retry attempts. Optional `label` defaults to
“Happy path” for the first path and the path ID for others. Optional `color`
accepts hex; defaults cycle cyan, orange, purple, pink and green.

The common prefix determines each branch point; paths with different first
steps are offered under **Start**. A later shared step is allowed, but its state
still comes from that path's complete preceding sequence. This models authored
outcomes, not executable conditions or a simulation of failure probabilities.
Nodes and edges stay in their declared layout; path colors identify choices
while edge colors continue to identify protocols. Print uses the selected
sequence. `ambient-only` omits the step controls; use `step` or `ambient` when
readers need to choose paths.

Copied links include the path: `#d=command-delivery&m=step&p=drop&s=lost`.
Links without `p` open the default path. Previously generated HTML must be
rebuilt with the updated engine to understand `paths`.

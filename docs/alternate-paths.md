# Alternate paths on one diagram

Use **Open file** with
[`src/starters/alternate-paths.json`](../src/starters/alternate-paths.json)
in the workbench for a six-step happy path and a four-step **Dropped signal**
path on the same command diagram.
The transport controls stay at the upper left. Below them, each path has a
colored chip on the left and a row of aligned step numbers on the right. Both
paths share steps 1–3. The alternate row shows all three as shadows at 35%
opacity in the happy-path color, then its distinct step 4 at full strength. Space after
its ending stays blank. Shared shadows are clickable and keep the alternate
selected; the current step and keyboard-focused shadow have full opacity.
Nested alternates inherit each shared beat's earlier path color. Selecting
the path chip pauses at step 1, including the shared lead-in; clicking a number
selects that path and step. Clicking the selected path chip also returns to
step 1. The colored chip,
step count, playback ending, highlighted hops, node tones and panel state all
follow that path. Chips retain their order when switching.

A path ends at its last referenced step. Next is disabled there; Play replays
from its first step. Returning to the happy path recomputes its state from the
same panel initial values. Success logs, notifications and state from a
previously selected outcome cannot carry over. Diagrams without paths retain
their existing playback behavior and show no path label. One explicit path
also hides the label and choices.

## Build a branch

1. Open the **Steps** tab, choose the section and select the last shared beat.
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
path referencing it. The inspector names those paths when a shared step is
selected. The first colored branch step is the first differing reference, so
editing its caption or patch leaves the aligned happy-path step untouched.
Use **Make independent here** to replace a shared step in this path with a
copy at the same position. **Reuse steps…** can copy or share selected steps
from another path, or continue with its remaining steps. Its destination
preview shows the resulting panel state before applying the change. See
[step reuse](workbench-step-reuse.md) for placement and sharing controls.
**Remove from this path** removes only the occurrence. **Delete from all
paths** removes the shared body and its references from all paths; the editor
refuses a deletion that would empty a path. **Remove alternate** removes only
that path, retaining its step bodies in JSON for reuse. The document outline
can still find unused bodies. Every structural edit uses one undo entry.

Ordinary edits and skin changes preserve the selected path and matching step.
Raw JSON edits must be rendered before the story list can change the source.
The effective-state inspector folds the selected path, with source links back
to the shared registry. Reveal/hide thresholds are positions within the selected
path; review them after reordering.

## Two inputs, one downstream process

Use distinct IDs for each input and its translation. Then reference the same
shared processing IDs in both paths:

```json
[
  {"id":"button", "label":"Button press", "steps":["press", "translate-press", "process", "persist", "notify"]},
  {"id":"motion", "label":"Motion event", "steps":["detect", "debounce", "translate-motion", "process", "persist", "notify"]}
]
```

The paths converge into one visible track for `process`, `persist`, and `notify`,
labeled **Shared ending** because both paths finish there. `process` is still
step 3 on Button press and step 4 on Motion event: the selected path supplies
the numbers and panel state. Clicking a shared circle keeps that path selected
when it participates. If it does not, the circle identifies the participating
path it will select. A path chip always starts its path at step 1.

In **Reuse steps…**, choose **Use shared steps** to reference existing IDs;
**Copy and customize** creates independent bodies. Rebuilding an existing spec
with shared IDs gives it the common track; there is no new schema field.
See the [two-input example](../examples/shared-downstream/shared-downstream.spec.json).

## Join, split, and join again

A shared block can sit in the middle of the story. Reuse consecutive IDs for
its common operations, then reference distinct IDs for the next different
outcomes. The paths can share another block later:

```json
[
  {"id":"normal", "label":"First attempt", "steps":["press", "record", "store", "index", "notify", "ready"]},
  {"id":"retry", "label":"After retry", "steps":["press", "record-failed", "record-retry", "store", "index", "notify-recovery", "ready"]},
  {"id":"offline", "label":"Device offline", "steps":["press", "offline"]}
]
```

Here `store` and `index` form **Shared steps**. The normal and retry paths then
split for their different notifications and rejoin at `ready`, their **Shared
ending**. A one-step middle block is labeled **Shared step**. The offline path
ends at `offline`; it has no connection to either later block. Different subsets
of paths may have their own shared blocks.

Sharing an operation preserves each path's incoming state. For example, a retry
flag remains set through `store` and `index` if those steps do not change it.
Editing either shared body updates every path referencing it. Do not reuse a
success or recovery step whose caption or patches are false for an incoming
path. See the [doorbell example](../examples/shared-downstream/shared-blocks.spec.json)
for carried state and log entries through both rejoins.

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
    {"id": "lost", "failures": {"api->device": "dropped"}, "tone": {"device": "dim"}, "text": "Signal lost before delivery"}
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

Paths with only a shared beginning keep the aligned rows described above.
The longest common prefix with an earlier declared path determines where each
row's colored branch begins. A path that ends within that prefix shows only
shared shadows, with no invented branch. Space after an ending stays blank.

When paths reuse later steps, consecutive shared IDs form common tracks with
connections showing where the participating paths join and split. The selected
path owns playback, numbering, captions and state throughout. A shared track
is **Shared ending** only when every participating path actually finishes there;
otherwise it is **Shared steps** or **Shared step**. Sharing does not add steps
to any path or change their order.

The full authored sequences determine blocks and endings. Hiding stops in a
view does not turn a downstream join into a shared beginning, combine operations
separated by hidden steps, or make a middle block into an ending. State still
includes that path's preceding hidden steps. When shared IDs occur in conflicting
orders across paths, their occurrences stay separate with individual sharing
cues so the timeline can preserve both sequences.

This models authored outcomes, not executable conditions or failure probabilities.
A step may set `color:"#RRGGBB"` to override its numbered markers without
creating a branch. This travels with its shared body and never changes the path
chip. Shared beginning shadows retain their opacity behavior. See
[step colors](step-colors.md).
Nodes and edges stay in their declared layout; path colors identify choices
while edge colors continue to identify protocols. Print uses the selected
sequence. `ambient-only` omits the step controls; use `step` or `ambient` when
readers need to choose paths.

Copied links include the path: `#d=command-delivery&m=step&p=drop&s=lost`.
Links without `p` open the default path. Previously generated HTML must be
rebuilt with the updated engine to understand `paths`.

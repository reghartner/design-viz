# Recipe — happy and failure timelines on the same diagram

Use `diagram.paths` when the same actors and connections have different
outcomes. Keep one node/edge layout and one `steps` registry. Each path is an
ordered list of stable step IDs. The first path is the default.

This fictional command flow shares steps 1–2. At visible step 3, the happy
path delivers the command, the orange alternate loses it, and the purple
alternate never sends it. Those are three DIFFERENT step bodies. Success
continues to step 4; each alternate ends at step 3.

```json
{
  "page": {
    "title": "One command, three outcomes",
    "skin": "pastel",
    "sections": [{
      "heading": "Command delivery",
      "text": ["A fictional command pipeline: choose an outcome on the same diagram."],
      "diagram": {
        "view": "step",
        "nodes": {
          "controller": {"title": "Controller", "icon": "chip"},
          "radio": {"title": "Radio", "icon": "antenna"},
          "device": {"title": "Device", "icon": "pump"}
        },
        "rows": [["controller", "radio", "device"]],
        "edges": [
          {"from": "controller", "to": "radio", "kind": "int", "label": "queue"},
          {"from": "radio", "to": "device", "kind": "mqtt", "label": "command"}
        ],
        "panels": [{
          "id": "result", "type": "state", "title": "Command result",
          "states": ["Waiting", "Queued", "Delivered", "Applied", "Lost", "Not sent"],
          "initial": {"state": "Waiting"}
        }],
        "steps": [
          {"id": "accept", "nodes": ["controller"], "text": "Accept the command."},
          {"id": "queue", "edge": "controller->radio", "text": "Queue it for transmission.", "panels": {"result": {"state": "Queued"}}},
          {"id": "deliver", "edge": "radio->device", "text": "The device receives the command.", "panels": {"result": {"state": "Delivered"}}},
          {"id": "apply", "nodes": ["device"], "text": "The device applies the command.", "panels": {"result": {"state": "Applied"}}},
          {"id": "lost", "failures": {"radio->device": "dropped"}, "tone": {"device": "dim"}, "text": "The attempted signal never reaches the device.", "panels": {"result": {"state": "Lost"}}},
          {"id": "blocked", "failures": {"radio->device": "blocked"}, "tone": {"device": "dim"}, "text": "Transmission is prevented; nothing is sent.", "panels": {"result": {"state": "Not sent"}}}
        ],
        "paths": [
          {"id": "happy", "label": "Happy path", "color": "#38BDF8", "steps": ["accept", "queue", "deliver", "apply"]},
          {"id": "drop", "label": "Dropped signal", "color": "#FB923C", "steps": ["accept", "queue", "lost"]},
          {"id": "stop", "label": "Not sent", "color": "#A78BFA", "steps": ["accept", "queue", "blocked"]}
        ]
      }
    }]
  }
}
```

## What the reader sees

- Transport controls stay above the path rows. Each chip is on the left;
  its numbered steps align with the other rows on the right.
- Shared prefix steps 1–2 appear at 35% opacity in alternate rows; their
  selected/focused state is fully visible. The first distinct beat, step 3,
  uses that alternate's color. Space after an early ending stays blank.
- Selecting a chip starts at step 1, including shared steps. Selecting a
  number goes directly to that path and beat. Controls end with that path.
- No alternates means no path chips. No schema-version flag is required;
  rebuild older exported HTML with the current template.

## Shared content versus independent content

Editing `queue` affects every path above because it is one shared body.
Editing `lost` does not change `deliver`: being aligned at column 3 does not
make them shared. Never reuse the happy-path ID for a differing outcome.
IDs must resolve, be unique in the registry, and occur at most once per path.
Repeated attempts need distinct step IDs.

Panel state folds from `initial` through the selected path only. A reused
ending inherits that path's prior patches; sharing a happy-path cleanup
step does not automatically restore happy-path state. Use a sparse reset
patch only if the story establishes that reset.

In **Steps**, select the last shared beat and choose **+ Alternate after
selected step**. **Reuse steps… → Copy and customize** gives new IDs;
**Use shared steps** intentionally reuses bodies. **Make independent here**
detaches one shared occurrence in place. **Continue from here** can reuse a
source ending; inspect **Destination preview** before applying it. See
[step reuse](../docs/workbench-step-reuse.md).

## Rejoin in the middle, then branch again

For common operations after a divergence, reference the same consecutive IDs:

| Path | Step IDs in order |
| --- | --- |
| First attempt | `press` → `record` → `store` → `index` → `notify` → `ready` |
| After retry | `press` → `record-failed` → `record-retry` → `store` → `index` → `notify-recovery` → `ready` |
| Device offline | `press` → `offline` |

- `store` and `index` appear once on a common track; connecting lines show the join.
  The retry has an extra stop before joining, so the numbers follow the selected
  path. Clicking a shared circle keeps that path if it participates; otherwise
  the circle identifies the participating path it will select.
- The paths split for `notify` and `notify-recovery`, then rejoin at `ready`.
  Both participating paths finish there. A shared middle track can also contain
  a single step. The timeline needs no extra labels or enclosing boxes.
- The offline path stops after `offline`; it never connects to either later
  block. Other subsets of paths can share their own runs.
- Editing `store` changes both paths. Its patch receives each path's own prior
  state, so an unchanged retry flag and earlier log entries remain distinct.

The [complete doorbell example](../examples/shared-downstream/shared-blocks.spec.json)
includes small state and log panels for checking those differences. Use shared
IDs only when the operation's caption and patches are truthful on every incoming
path. Common blocks are inferred from the full authored sequences; hidden stops
do not join separated runs or turn a middle block into an ending. Conflicting
shared orders retain separate occurrences with individual sharing cues.

## Failed communication is a separate claim

`failures` references an existing edge and lasts only for that step.
`dropped` animates an attempted send stopping at a break; `blocked` shows
that nothing was sent. Repeat the failure entry if a later beat must retain
the break. The failure effect does not set a panel result for you.
A received error response, timeout, or Honeycomb error span alone does not
establish non-delivery. See [failed communications](../docs/failed-communications.md).

Run the [cookbook build loop](README.md#the-loop-every-recipe-ends-here), then
visit step 1, every split and rejoin, and the ending of EVERY path. Switch from
Applied to Lost and verify success state does not carry over. At shared blocks,
check the selected path's numbers and retained state. Full [path contract and
editor guide](../docs/alternate-paths.md).

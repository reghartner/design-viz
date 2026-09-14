# Failed communications

Choose **starters… → alternate paths**, then step 4 on **Dropped signal**.
An orange packet travels partway from the broker toward the pump, stops at
a visible break, and fades. The remaining route is dim and disconnected;
the pump stays dim. The caption explicitly says **Dropped: Broker → Pump P-7**.
Switching to happy-path step 4 restores normal delivery on the same edge.

In the step inspector, each hop has a **Delivery** selector:

| Choice | Meaning | Appearance |
| --- | --- | --- |
| Delivered | Communication reaches its destination | Normal edge and packet |
| Dropped in transit | An attempted send never arrives | Partial orange route, gap and ×; packet stops and fades |
| Not sent | Communication is blocked or skipped before sending | Stop marker near the source; no packet |

**Add failed communication** adds an existing diagram edge to a step, starting
as Dropped in transit. Choose Not sent if appropriate. Removing the hop also
removes its outcome and any explicit packets for that hop. Edits support
undo and preserve the selected path and step.

## Spec

```json
{
  "id": "radio-lost",
  "text": "The signal is lost before the pump receives the command.",
  "failures": {"broker->device": "dropped"},
  "tone": {"device": "dim"}
}
```

The edge must already exist in `diagram.edges`. No duplicate edge or version
switch is needed; this is additive to contract 1. Use `"blocked"` for Not sent.
Failure entries alone are enough to give a step something to show. Existing
specs continue to behave as before.

Failures apply only to the current step. They do not fold forward like node
tones or panel state. Moving to another step, selecting another path, or
entering Ambient removes the effect. To keep a break visible while narrating
a later timeout, repeat its failure entry on that beat. Reduced motion keeps
the static break and explanatory text. Print shows the base diagram, with
failures named in the printed step list.

For mixed fan-out, keep successful hops in `edge` or `edges` and put failed
hops in `failures`. A failure wins if a key also appears in `edges` or the
advanced `packets` list. Only the failed sender is automatically focused;
explicit `nodes` or another successful hop can still focus that destination.
Panel results and node tones remain authored independently of this effect.

Use these outcomes only when the story establishes non-delivery. A server
returning an error still received a request, and a timeout alone does not
prove the request was lost. For those cases, show the delivered request and
narrate the response or uncertainty with captions, node tones and panels.
Honeycomb error spans are not automatically converted into broken edges.

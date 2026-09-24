# Storyboards that preserve causality

Use this for branches, concurrent operations, uncertain trace evidence, or
independent state dimensions. Keep the storyboard in the coverage ledger;
for an edit, revise only affected rows. This is an explanation of intended
behavior, not a new spec field or an executable simulator.

## State before presentation

List the state dimensions that matter to the audience. For a camera story,
physical activity, camera power/mode, local recording, cloud persistence,
and the resident's knowledge can differ. For a transaction, actual commit,
the client's knowledge of that commit, and retry eligibility can differ.

For each dimension, use the source-supported initial value. Avoid default
zero/empty/success when the source says unknown. Say whose knowledge a value
represents. Choose a widget capable of communicating that distinction; do not
turn an unknown measurement into a fabricated number.

Audit widget defaults as claims, too. “NO NOTIFICATIONS,” an empty database, a
red node, or a zero counter may contradict unknown evidence even when the caption
is correct. Use a state/table with an explicit Unknown value, or clearly label
a panel as confirmed observations only when its empty state has that meaning.
Separate actual operation state from the sender's knowledge of it. Clear carried
error tones when the source establishes recovery; omission retains the error.

| Step ID | Actor/action | Incoming state | State changes | Visible outcome | Evidence |
|---|---|---|---|---|---|
| ready | Camera is on | No recording | None | ACTIVE; quiet porch | Source says camera is on |
| record | Camera starts recording | Quiet porch | Recording on | REC; quiet porch | Source says recording starts before event |
| enter | Person enters | Recording on | Physical event begins | Person moves; REC remains | Source says entry occurs while recording |

These are illustrative rows, not default events to add to other designs.
`screen.mode:"rec"` with `scenePlayback:"waiting"` gives quiet recording;
patch only `scenePlayback:"playing"` when the event occurs. The animation's
duration is illustrative, never a measured latency or causal dependency.

## Branch decisions before step bodies

Write a path table with the shared prefix, first differing event, endpoint,
and remaining unknowns. One topology supports multiple outcomes:

| Path | Shared prefix | First different event | Endpoint |
|---|---|---|---|
| Success | accept, send | Receiver applies command | Confirmation received |
| Confirmed loss | accept, send | Delivery is confirmed lost | Sender times out; no application |
| Timeout only | accept, send | Sender's wait expires | Remote application unknown |

The loss path can claim no application only when the source establishes that
relationship. A timeout by itself cannot support the same claim.

- A path is an ordered list of step IDs, not a list of panel snapshots. Shared
  IDs mean shared bodies and edits. A differing caption, packet, patch, tone,
  or outcome makes a different step even at the same displayed column.
- A retry is a new event with a new ID even when it uses the same edge or payload.
- Panel and tone state fold from initial values through this path. Inspect the
  full state at its first distinct step and its end; sparse patches retain old
  values unless changed. A shared ending does not restore success automatically.
- Shared middle operations or cleanup can use the same consecutive IDs only
  when their bodies are truthful for each incoming state. Paths may split after
  a common track and rejoin later. Every participant must finish at a block for
  it to be a shared ending; an early-ending path never joins a later block it
  does not reference. Hidden stops retain their place in this classification.
  Do not reset uncertainty or mark recovery without evidence.
- End where the source ends. Do not add recovery, retries, compensation, or a
  user notification to provide narrative closure.

## Delivery and knowledge are different

| Evidence | Supported depiction | Unsupported inference |
|---|---|---|
| Attempted send confirmed lost | `failures:{edge:"dropped"}` | Receiver acted anyway |
| Send prevented | `failures:{edge:"blocked"}` | A packet was launched |
| HTTP 500 received | Delivered error response, error state | Broken request edge |
| Request timed out | Sender timed out; remote outcome unknown | Remote never received/applied it |
| Span absent in partial trace | That activity is unobserved | Activity did not happen |
| Queue depth not measured | Qualitative symptom if evidenced | A numeric depth or capacity |

Break markers are current-step effects; they do not set a panel's result.
If the next beat must still show a confirmed break, repeat the failure entry.
Do not keep animating a confirmed loss on a later successful retry.

A timeout is a local observation, not a response packet: use a node/state beat
unless the source explicitly reports a response. Similarly, a browser displaying
an error does not prove the backend sent one; the browser may have timed out.
Match check labels to their evidence: “request sent” cannot pass a check labeled
“request received.” Use neutral node appearance for unobserved service health;
an Unknown table/check detail must not be contradicted by an invented alert.
Check transitional beats as well as endpoints: a dequeued item stays absent until
an evidenced requeue. Clear a carried dequeue animation when the next beat only
observes an error; do not imply a second removal.

## Concurrency and causal prerequisites

Use a grouped beat for simultaneous starts or completions when the source
does not establish relative order. `edges` can depict multiple hops together,
but its visual stagger does not establish execution timing; say that when it
matters. Do not invent per-span durations to obtain a waterfall.

For “write only after A and B succeed,” make both successes prerequisites of
the write in the storyboard. In an incident, do not use that design rule to
fill gaps in partial evidence. Keep “expected not to write” separate from
“observed not to write.” A disagreement can be a defect to investigate.

## Checkable expectations

Before building, record a few source-grounded expectations for the hardest
beats. Examples: “recording remains on at the timeout,” “the retry does not
increment applications,” “the 500 branch never displays a success notification,”
or “cloud persistence remains unknown at the incident endpoint.”

After building, check these against folded spec state and rendered panels,
including switching from a successful endpoint to an alternate. The validator
cannot infer these business rules. A screenshot of step 1 does not verify them.

## Rich physical storytelling and two audiences

Plan a small motion table: `beat | physical change | camera/phone change |
service evidence | what remains unchanged`. Make motions legible: place subjects
on a plausible route, swing a door at entry, keep quiet recording visually quiet,
and show delivery only at the supported beat. Home `signals` are step-local and
use device IDs. Position, color and illustration timing are presentation choices;
invented sensor triggers, recordings, notifications and outcomes are not.

Home markers and signals also assert topology. Use source-backed components or
clearly labeled summaries of them; do not add a hub/relay merely to animate a
handoff. Check every signal's endpoint roles against the actual communication:
a resident notification must not animate toward a camera because that marker is
convenient. At a beat claiming completed entry, put the subject inside the actual
house/room boundary; motion at a later unrelated beat cannot repair that claim.
When a camera is meant to capture a subject, check the subject against its actual
coverage cone at each recorded position. The scene lighting and saved/live status
are claims too; keep them consistent with the authored source.

Review a beginning, a physical event, a handoff, and each distinct ending. Confirm
something meaningful changes at those beats without every widget flashing at
once. Check a reduced-motion still for the same essential meaning. Reward clear
physical continuity and coordinated state; do not reward animation count or
decorative widgets that add no information.

For engineering and business-story perspectives, use one shared step registry
and paths with `primaryPanel` or a named `sectionLayout` plus Data flow. Emphasize
service/dependency detail in Data flow, and people/place/outcomes in the story
layout. Both must cover the complete sequence and keep the selected step/path
when switching. Do not simplify the business story by silently dropping failure
beats. See `docs/section-layouts.md`; no parallel mutable copies of the story.
Optimize readability for desktop and the intended Backstage/Confluence content
area. Keep necessary engineering detail; fitting an entire dense flow on a phone
is not a default requirement. Test mobile only when it is part of the request.

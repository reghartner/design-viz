# Flowview product tour — coverage ledger

## Audience and question

A PM or engineer wants to turn a system story into a diagram that colleagues
can trust and find. The tour follows one fictional doorbell journey, from a
source conversation through human review to a service-page entry in Backstage.
Create and Reconnect are alternative entrances, not consecutive setup tasks.
Standard versus Explore is left to the presenter's separate live-diagram demo.

## Sources and limits

| Source | Supports | Does not establish |
|---|---|---|
| `examples/canon/specs/doorbell.json` | The fictional six-beat customer story and engineering route. | Production behavior or measured delivery. |
| `examples/canon/traces/happy.json` | Five service spans and the queue-to-notification link. | Physical press, resident-app receipt, playback, or failure. |
| `docs/folder-agent-session.md` and local Workbench captures | Folder setup, connection, registered requests, candidate review, paired acceptance, and reopening. | Replay of native Claude chat or automatic publication. |
| `apps/backstage/README.md`, `FlowviewEntityDiagrams.tsx`, `InlineFlowview.tsx`, and local captures | Explicit associations, inline viewer, section/step jumps, expansion and return. | Company SSO, production loaders, or this candidate's publication. |
| YOU/CLAUDE dialogue and correction illustration | An authored example of source clarification and human feedback. | A recorded agent run. |

The tour itself has no service binding or code reference. The canonical
fictional doorbell spec carries the association shown by the Backstage fixture.
No time, cost, adoption, or production-outcome claims are made.

## Story contract

1. Quiet porch.
2. Doorbell button event reaches the porch hub.
3. Recording service receives a recording request.
4. Clip metadata is stored.
5. A resident notification is queued.
6. Notification service sends the alert.

The business-story route defers service identities and delivery evidence to
engineering. The HLD route labels the chain as design intent. The trace route
identifies observed service spans while preserving authored customer context
where evidence stops. These distinctions survive the shorter captions.

Audience detail is independent of source. The tour uses Story for its business
example and Engineering for HLD and trace. Source choices belong to the tour;
they are not represented as additional Workbench controls.

## Panel and process plan

| Tab | Question answered | Layout and story |
|---|---|---|
| Create | What does the agent need before it can propose a useful diagram? | Five-node process map; source choices and caption at left; large Workbench capture at right; latest illustrative exchange under the caption. Eight beats per source. |
| Reconnect | How does a fresh conversation continue accepted work? | The same map and panel hierarchy; saved-folder recovery through a focused change request. Seven beats. |
| Review | Is the proposed story supported, and what happens if it is not? | Main route: proposal → human review → accepted files → repository review → Backstage. Side loop: human review → correction → revised draft → human review. Six first-creation beats and ten update beats. |
| Backstage | How does a teammate find the handoff relevant to their service? | Compact two-row navigation map above a caption and actual local fixture capture. Seven beats from association to service-page return. |

The full process remains visible in desktop layouts. Captions use 16px text;
conversation text uses 14px. The latest two log lines are displayed, retaining
the underlying accumulated log. Captures use `contain`, preserving their full
contents; wide composites retain both context and the magnified detail.
Narrow screens stack the controls, capture, and conversation above a horizontally
scrollable map. Short viewports may scroll the page; the text is not scaled down.

## Paths and decisions

**Create (8 per source):** landing action → audience detail → Copy & paste →
empty folder → setup paste and first Copy request → source question → agreed
scope → proposal ready. The source's answer now advances Claude → Proposed
draft. Repeated setup close-ups and the redundant draft recap were removed.
Initial conversation guidance is labeled NOTE; authored exchanges are explicitly
illustrative. The ready state hands off to Review / First creation.

**Reconnect (7):** existing Workbench → Reopen diagram folder → Continue
existing → restored files → copy fresh setup → new Claude conversation →
wording request and candidate. Stable six-step IDs, the engineering route, and
the accepted ledger remain the constraints. The final caption directs the
reader to Review / Update existing.

Local section handoffs open Review without selecting a path. First creation
is the initial Review path, but returning readers may retain their prior path;
the entry captions explicitly name the appropriate choice. No custom handoff
behavior or renderer change is introduced by this tour.

**First creation (6):** preview a representative source-neutral proposal →
compare the empty Current scaffold → inspect the six beats → read the ledger →
accept the pair → separate publication. Direct acceptance has its own edge;
it does not pass through the correction branch. The candidate is not claimed
to be the output of any particular illustrative source dialogue.

**Update existing (10):** inspect the first candidate's unqualified app-receipt
wording → compare Current → read its evidence boundary → discard → explain the
correction → open the fresh proposal → inspect corrected step 6 → compare the
revised ledger → accept → separate publication. The trace reaches only the
notification-service call; app receipt is authored design. Current remains the
same accepted pair between the discarded and revised proposals.

Commit update saves the reviewed spec and ledger locally and yields an Applied
receipt with Undo. Discard yields Not applied. Neither action publishes to Git.
Repository review is a conceptual hop rather than a fabricated product screen.

**Backstage (7):** Recording service / Diagrams → selected diagram's Data flow →
Where this service appears → section opening → step 3 recording request →
expanded viewer at step 3 → Back to entity. One associated spec is shown.
The story explains why the reader takes each action, not just the control name.

## Capture provenance and maintenance

The [README](README.md#screenshot-provenance) records the capture families and
fixture boundaries. Original PNGs and embedded image bytes are preserved.
The archive contains additional captures from the longer version; only screens
selected by the current paths are presented. Orange control outlines and the
full-window/detail composites are presentation aids, not native product styling.

Rebuild the template and runtime, validate the spec, regenerate the example
index/crossrefs, then run this example's build script. That script injects the
spec plus `presentation.css` and suppresses the unrelated first-visit viewer
tour. The ordinary renderer and other examples are unaffected.

Visual acceptance covers all 54 path/step states, source switching, backward
seeks, first-creation versus update boundaries, complete graphs, decoded images,
caption and dialogue fit, responsive stacking, and local section handoffs.

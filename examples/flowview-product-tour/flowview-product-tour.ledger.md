# Flowview system walkthrough — coverage ledger

## Operator decisions and source scope

No questions were needed for this revision. The user specified the story, audience,
and interaction: three purposeful chapters, actual setup and Backstage UI beats,
source-specific Claude dialogue, and one fictional doorbell throughline. The
presenter demonstrates an unrelated real diagram and Standard/Explore separately.
No Backstage links or code references are required inside this explanatory tour.
There is no time, latency, cost, adoption, or production outcome claim.

The source of truth for the example's six beats is
`examples/canon/specs/doorbell.json`; the example's observed spans come from
`examples/canon/traces/happy.json`. Product behavior is checked against
`docs/folder-agent-session.md`, `apps/backstage/README.md`,
`apps/backstage/src/FlowviewEntityDiagrams.tsx`,
`apps/backstage/src/InlineFlowview.tsx`, and the built Workbench. Actual local
screenshots show UI states, while YOU/CLAUDE messages and the human correction
are labeled illustrative. The local Backstage shell uses a fictional catalog and
reference adapter. It does not verify the company GitHub loader, SSO, or access
policy.

## Story and audience

A PM or engineer opens the real Workbench setup, chooses a detail level and
external Claude conversation, then selects a diagram folder. The viewer chooses
one of four source paths in this **tour**, not in Workbench. Each path shows the
questions and answers Claude needs to produce a grounded six-beat fictional
doorbell draft. A person compares the proposed diagram and ledger, requests a
specific correction, reviews the revised pair, and accepts it. Later, the same
folder is reopened for another change. After a separate repository publication,
the approved diagram appears on the Recording service Component page in
Backstage. The presenter follows the actual plugin UI from entity tab to
matching section, matching step, expanded canvas, and back to entity.

Takeaway: source material can differ, but the agent's proposal, human decision,
folder continuity, and Backstage service association remain explicit.

## Panel plan

| Chapter | Panel | Question answered | Best beat | Evidence mode |
|---|---|---|---|---|
| Build with Claude | `setup-screen` | What does the person actually click? | broad dialog → readable Story/Engineering selector → Copy & paste detail → empty-folder chooser | Actual Workbench captures; orange click outline on the broad view |
| Build with Claude | `agent` | What would a useful Claude exchange contain for this source? | source-specific question, clarification, six-beat draft | Explicitly illustrative YOU/CLAUDE messages; never a real transcript |
| Review and continue | `review-screen` | How does a correction become an accepted pair and a later continuation? | illustrative correction → actual Preview Agent Updates and focused ledger → applied receipt → actual resume choice → illustrative continuation | Actual Workbench captures and clearly labeled dialogue illustrations |
| Find and use in Backstage | `backstage-screen` | What changes after each action in the service page? | seven distinct screenshot states | Actual current plugin in local fictional fixture |

Every panel has one job; there is no generic explanation-only table. The graph
explains the process and the adjacent panel shows the matching UI or conversation.
All three chapters use a 33-row Standard layout: graph `h18` and step controls
`h15` on the left; changing visual evidence on the right. Build's right column
splits `h19/h14`. Review and Backstage use the full `h33` right column.
Focused landscape captures follow the broad UI views so key controls and
evidence remain legible at 1280×800.

## Starting materials and canonical route

The four Build paths share the Workbench setup and final proposal. The path
labels are Story, Existing flow, HLD, and Honeycomb trace. Story detail is the
demonstrated setup value; Mixed and Engineering are genuine detail choices, not
separate source buttons. Each path asks a source-specific clarifying question,
records the user's boundary, then drafts the canonical six beats:

1. Quiet porch.
2. Doorbell camera button event reaches porch hub.
3. Porch hub requests a recording from recording service.
4. Recording service persists clip metadata.
5. Recording service queues a resident notification.
6. Notification service sends the alert to the resident app.

The Story route leaves backend identities to engineer enrichment in the same
folder. The Existing flow route names supplied operations. The HLD route marks
an authored proposed design. The trace route identifies five observed spans:
`porch-hub POST /button`, `recording-service POST /recordings`, `clip-store
INSERT clip`, `notification-queue publish doorbell`, and
`notification-service POST /notifications`, including the queue-to-notification
span link. The trace alone does not prove the physical button press or app
receipt. No path claims clip playback or a failure outcome. No source is silently
converted into production proof.

## Paths and handoffs

Build has four native alternate paths with a shared opening beat, a path-specific actual focus-selector beat, three shared setup beats, three
source-specific dialogue beats, and two shared proposal/handoff beats. Review is
one deliberate correction, fresh preview, human approval, and same-folder resume
sequence. Backstage is one UI walk; each visible action switches its screenshot, including
the native inline viewer before the matching destinations.
The three chapters default to Standard. Build hands off to Review; Review hands
off to Backstage. The Backstage chapter ends on the entity page.

## Step × panel worksheet

`P` means an explicit panel patch. `H` means the prior state deliberately holds.
`D` means the Build dialogue appends new illustrative messages. Every step below
has a disposition for each panel present in its chapter. The graph focus names
the action, while the step caption states the source/evidence boundary.

| Step | Screenshot | Conversation or decision | Why a hold is valid |
|---|---|---|---|
| `build-open` | P: `context` | H: prior exchange/decision | Actual UI changes at this beat |
| `build-story-focus` | P: `story-focus` | H: prior exchange/decision | Actual UI changes at this beat |
| `build-flow-focus` | P: `engineering-focus` | H: prior exchange/decision | Actual UI changes at this beat |
| `build-hld-focus` | P: `engineering-focus` | H: prior exchange/decision | Actual UI changes at this beat |
| `build-trace-focus` | P: `engineering-focus` | H: prior exchange/decision | Actual UI changes at this beat |
| `build-connection` | P: `choice` | H: prior exchange/decision | Actual UI changes at this beat |
| `build-folder` | P: `folder` | H: prior exchange/decision | Actual UI changes at this beat |
| `build-paste` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-story-source` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-story-answer` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-story-draft` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-flow-source` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-flow-answer` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-flow-draft` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-hld-source` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-hld-answer` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-hld-draft` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-trace-source` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-trace-answer` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-trace-draft` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-propose` | H: same UI until next action | D: append YOU/CLAUDE turn | Dialogue changes with this beat |
| `build-next` | H: same UI until next action | H: prior exchange/decision | The visible UI/decision remains valid |
| `review-current` | P: `current` | — | Actual UI changes at this beat |
| `review-correct` | P: illustrative `correction-dialogue` | — | Dialogue makes the correction visible before a new proposal |
| `review-new-proposal` | P: `summary` | — | Actual UI changes at this beat |
| `review-compare-current` | P: `current` | — | Actual UI changes at this beat |
| `review-compare-proposed` | P: `proposed` | — | Actual UI changes at this beat |
| `review-ledger` | P: focused `ledger` | — | Actual UI changes at this beat |
| `review-approve` | P: applied `committed` receipt | — | Actual UI confirms acceptance |
| `review-resume` | P: `resume` | — | Actual UI changes at this beat |
| `review-reconnect` | P: illustrative `reconnect-dialogue` | — | Dialogue shows a new session reading the accepted pair |
| `review-next` | P: `resume` | — | Actual same-folder UI returns for the handoff |
| `backstage-entity` | P: `entity` | — | Actual UI changes at this beat |
| `backstage-inline` | P: `inline` | — | Actual UI changes at this beat |
| `backstage-where` | P: `where` | — | Actual UI changes at this beat |
| `backstage-section` | P: `section` | — | Actual UI changes at this beat |
| `backstage-step` | P: `step` | — | Actual UI changes at this beat |
| `backstage-expand` | P: `expanded` | — | Actual UI changes at this beat |
| `backstage-return` | P: `return` | — | Actual UI changes at this beat |

## Review semantics

The illustrative correction in Review clarifies the evidence boundary at
step 6: the authored resident-app outcome remains, while the Honeycomb trace
ends at the notification-service call. It does not change the canonical
six-beat service route. A corrected candidate must be compared
again; the earlier preview or approval does not carry forward. The accepted
spec and coverage ledger land together only after the human clicks Commit
update. That Workbench action is separate from a Git commit and from company
repository publication. Reopening the same folder restores accepted files and
Workbench history; a new Claude session needs current setup and project context.

## Backstage associations and viewer semantics

The fictional Recording service is explicitly bound as
`component:default/recording-service` in the canonical spec. Therefore its
Component page shows the approved diagram in its single Diagrams entity tab.
API entities require explicit API bindings; text mentions do not count. The
fixture contains one associated spec, so the tour shows the selected Diagram
control but does not claim a multi-spec dropdown click. The actual plugin code
supports choosing among multiple associated specs, with authored tabs inside
the selected viewer. The seven captures show: entity page, inline native viewer with Home/Data flow
authored tabs, expanded Where this service appears, section jump, matching recording-request step jump (step 3 of
6), expanded same viewer, and return to the entity page. The image switches at
every visible UI action. The installed Backstage renderer consumes approved
JSON; the company fork's static Workbench and authorized loaders are integration
responsibilities not verified by these local captures.

## Binding, code, time, and icon checks

The explanatory tour itself has no service bindings or code references, per the
user's stated exception. Its captions cite the separate canonical diagram's
explicit binding. No time, battery, thermal, outage, or icon-state progression
applies. Step edges reflect process transitions, not network hops. No playback,
failed delivery, recorded cost, or live Claude transcript is asserted.

## Verification and integration

- `node tools/validate.js examples/flowview-product-tour/flowview-product-tour.spec.json` must report zero errors and warnings.
- The portable HTML must be rebuilt after spec/CSS changes.
- Browser QA must inspect all four Build paths, the Review correction and resume,
  and every Backstage screenshot transition at 1280×800 and 1440×900 after image
  decode. Check readable dialogue, no clipped controls or images, and no stale
  screenshot relative to the caption.
- The Review captures show the fictional doorbell's Current and Proposed step 6
  and the changed ledger, matching the authored-versus-observed correction.

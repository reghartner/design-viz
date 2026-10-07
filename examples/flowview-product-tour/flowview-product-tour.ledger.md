# Flowview system walkthrough — coverage ledger

## Operator decisions and source scope

The tour has four tabs: **Build new with Claude**, **Reconnect existing folder**,
**Review and accept**, and **Find and use in Backstage**. Reconnect is an
alternative entry to the shared review gate. Build has three source routes:
Business story, HLD design, and Honeycomb trace. Those routes are controls in
this tour; the actual Workbench controls audience detail, conversation mode,
and the diagram folder.

One fictional doorbell example runs throughout. Its six beats come from
examples/canon/specs/doorbell.json; the observed service spans come from
examples/canon/traces/happy.json. Workbench behavior was checked against
workbench/flowspec.html and docs/folder-agent-session.md. Backstage behavior
was checked against apps/backstage/README.md,
apps/backstage/src/FlowviewEntityDiagrams.tsx, and
apps/backstage/src/InlineFlowview.tsx. Captured Workbench and local Backstage
screens show actual UI states. YOU/CLAUDE turns and the human correction are
marked illustrative, not presented as a recorded Claude transcript.

The presenter can demonstrate an unrelated real diagram and Standard/Explore
separately. This explanatory tour contains no service binding or code
reference; the separate canonical doorbell spec carries the binding. The
local fixtures do not verify company publication, the GitHub loader, SSO,
access policy, a production outcome, time, cost, or adoption.

## Story and audience

A PM or engineer clicks Build with my agent on the Flowview landing page,
then starts a new agent-backed diagram in Workbench, chooses
audience detail, selects Copy & paste, and chooses an empty folder. In the
illustrative Claude exchange, the agent asks what the chosen source proves
before drafting six fictional doorbell beats. An existing project can instead
be reopened through its saved folder, with fresh setup instructions for
Claude. Both entries reach Review. First creation compares the proposed
six-step diagram with an empty scaffold; Update existing compares the saved
step 6 with a corrected proposal. A person checks the ledger before
accepting either pair. After separate company
repository review and publication, the Recording service Diagrams page in
the local Backstage example shows where that service appears.

Takeaway: the source changes what Claude can claim. A human previews the
proposed spec and ledger, can later return to the same folder, and can
navigate a published service association in Backstage.

## Panel plan

| Tab | Panel | Question answered | Evidence |
|---|---|---|---|
| Build new | setup-screen | What does a new build require in Workbench? | Broad landing page with the actual Build with my agent button outlined, followed by the How are you starting? dialog with its detail selector outlined, Story/Engineering choice, later path-matched Copy & paste highlight, focused Copy & paste control, and empty-folder chooser. |
| Build new | agent | What must Claude ask and record for this source? | Clearly illustrative YOU/CLAUDE dialogue, with a six-beat doorbell proposal for each route. |
| Reconnect existing | update-screen | How does a saved project reopen? | Actual Workbench context, Reopen card, Continue existing choice, restored folder/setup, Copy instructions, and connected Agent state. |
| Reconnect existing | update-agent | How can Claude continue from the saved pair? | Illustrative dialogue that reads the spec and ledger, receives the formal request, and submits a wording-only candidate for review. |
| Review and accept | review-screen | What must a human check before accepting first creation or an existing update? | First creation: source-neutral proposal, empty Current scaffold, step-1 viewer, ledger, and receipt. Update existing: wording-only proposal, accepted Current and nonempty ledger, Discard, illustrative correction, fresh Current/Proposed and ledger comparison, then receipt. |
| Find and use in Backstage | backstage-screen | What changes after each service-page action? | Seven actual local plugin states from entity tab through inline viewer, links, jumps, expanded canvas, and return. |

All four tabs use the spec's Standard layout: graph in left h18, step controls
below in h15, changing evidence on the right. Build and Reconnect split the
right side into h19 UI and h14 dialogue. Review and Backstage give the right
panel h33. Broad UI captures establish location; focused captures make
controls and evidence readable at 1280×800.

## Starting materials and canonical route

Build has three native tour paths: **Business story**, **HLD design**, and
**Honeycomb trace**. The Workbench Story/Mixed/Engineering selector is
independent of those paths. This tour selects Story for the PM route and
Engineering for HLD and trace. The paths share setup and proposal beats,
while each source receives its own question, answer, and draft:

1. Quiet porch.
2. Doorbell camera button event reaches porch hub.
3. Porch hub requests a recording from recording service.
4. Recording service persists clip metadata.
5. Recording service queues a resident notification.
6. Notification service sends the alert to the resident app.

The business story leaves service identities and proof for engineering
enrichment. The HLD marks the route as authored design, not production
observation. The trace route identifies five observed spans: porch-hub
POST /button, recording-service POST /recordings, clip-store INSERT clip,
notification-queue publish doorbell, and notification-service
POST /notifications, including the queue-to-notification link. That trace
alone does not prove the physical button press, app receipt, clip playback,
or a failure outcome. The customer outcome stays labeled as authored context
where trace evidence stops.

## Paths and handoffs

**Build new:** a common landing-page opening highlights the actual Build with
my agent button. The next beat shows the How are you starting? dialog and
highlights its detail selector. Source-specific focus selection follows. The later Copy & paste
beat highlights that control in a broad Workbench view with Story selected
for business or Engineering selected for HLD and trace, followed by a focused
control view. Then come empty-folder setup, source-specific Claude questions,
and draft. The proposal hands directly to Review. A Workbench detail choice
does not switch the source route.

**Reconnect existing:** a separate seven-step entry tab. The disconnected
Agent card offers Reopen diagram folder. Setup selects Continue an existing
agent build and the prior folder. Workbench restores the accepted spec,
ledger, and its own history, then supplies fresh connection instructions. A
new Claude conversation reads those files, receives the copied change request,
and submits a wording-only candidate. The candidate pair hands to Review.
Old pending work is not replayed.

**Review and accept:** two native paths share the human gate. First creation
starts from an empty folder and inspects a representative, source-neutral
six-step proposal. Current state is an empty My story scaffold, not an
accepted doorbell baseline. Update existing starts with an accepted six-step
spec and nonempty ledger. A wording-only first proposal makes step 6 clearer
for business readers but leaves its app outcome ambiguous. The human views
the accepted Current state and ledger, discards that pending proposal, asks
for the trace boundary, and compares a fresh proposal with the same Current
baseline and a changed ledger. Both paths inspect the ledger before Commit
update.
The spec and ledger save together locally. Git commit and company repository
publication are separate, unpictured actions before Backstage.

**Backstage:** one local fictional Recording service walk. The diagram's
Data flow tab, Where this service appears links, section and step jumps,
expanded canvas, and Back to entity action have matching captures.

## Step × panel worksheet

P means an explicit panel patch. H means the prior state holds. D means
illustrative dialogue appended in the log panel. Each row covers the panels
present in that tab. A held screenshot does not imply a new UI action.

| Step | UI screenshot panel | Dialogue / decision panel | Why it changes or holds |
|---|---|---|---|
| build-open | P: landing | H: empty exchange | Broad Flowview landing page outlines the actual Build with my agent button. |
| build-setup-detail | P: context | H | Actual How are you starting? dialog outlines the detail selector clicked next. |
| build-story-focus | P: story-focus | H | Actual Story detail choice. |
| build-hld-focus | P: engineering-focus | H | Shared Engineering detail choice for HLD and Honeycomb trace; the source material is provided to Claude. |
| build-copy-broad-story | P: copy-broad-story | H | Broad Copy & paste highlight with Story still selected. |
| build-copy-broad-engineering | P: copy-broad-engineering | H | Broad Copy & paste highlight with Engineering still selected. |
| build-connection | P: choice | H | Focused actual Copy & paste control follows the broad view. |
| build-folder | P: folder | H | Actual new-folder chooser. |
| build-paste | H: folder | D: setup and source question | External Claude exchange begins. |
| build-story-source | H | D: PM source and boundary question | Source-specific dialogue. |
| build-story-answer | H | D: PM boundary and Claude response | Source-specific dialogue. |
| build-story-draft | H | D: six-beat PM draft | Source-specific dialogue. |
| build-hld-source | H | D: HLD source and question | Source-specific dialogue. |
| build-hld-answer | H | D: authored-design boundary | Source-specific dialogue. |
| build-hld-draft | H | D: six-beat HLD draft | Source-specific dialogue. |
| build-trace-source | H | D: observed spans and question | Source-specific dialogue. |
| build-trace-answer | H | D: observed/authored boundary | Source-specific dialogue. |
| build-trace-draft | H | D: trace-annotated six-beat draft | Source-specific dialogue. |
| build-propose | H | D: candidate pair ready | Shared proposal beat. |
| build-next | H | H | Text handoff directly to Review. |
| update-open | P: wide | H: empty exchange | Broad Workbench and disconnected Agent. |
| update-reopen-detail | P: reopen | H | Focused Reopen diagram folder control. |
| update-continue | P: continue | H | Continue existing and Select Diagram Folder. |
| update-restore | P: instructions | H | Restored folder and fresh setup header. |
| update-copy | P: copy-button | H | Copy connection instructions control. |
| update-paste | H: copy-button | D: Claude verifies folder | External conversation starts. |
| update-read | P: connected | D: accepted pair, formal request, candidate submitted | Actual connected Agent state accompanies the illustrative Claude handoff to Review. |
| review-first-proposal | P: first-preview | — | Actual source-neutral first proposal from empty folder. |
| review-first-current | P: first-current | — | Current is the zero-node My story scaffold, not an accepted doorbell. |
| review-first-inspect | P: first-step-one | — | Proposed step 1/6 and six-step controls visible. |
| review-first-ledger | P: first-ledger | — | First-candidate six beats, source check, and human-review requirement. |
| review-first-approve | P: first-applied | — | Actual applied receipt after first Commit update. |
| review-first-publish | P: first-applied | — | Receipt holds; company publication is unpictured. |
| review-first-next | P: first-applied | — | Receipt holds for Backstage handoff. |
| review-initial-proposal | P: update-initial | — | First wording-only Proposed state; 0 added, 1 modified, Discard visible. |
| review-initial-step | P: update-initial-step | — | Step 6 uses resident-facing wording without visible source boundary. |
| review-current | P: current | — | Accepted six-step Current baseline from the same folder. |
| review-current-ledger | P: update-current-ledger | — | Accepted nonempty ledger already separates authored outcome from trace observation. |
| review-discard | P: update-discarded | — | Actual Not applied receipt after Discard update; baseline files remain. |
| review-correct | P: correction-dialogue | — | Illustrative request for a new candidate with explicit trace boundary. |
| review-new-proposal | P: summary | — | Second actual Preview Agent Updates proposal in that folder. |
| review-compare-current | P: current-revised | — | Current still shows the accepted baseline because first proposal was discarded. |
| review-compare-proposed | P: proposed | — | Corrected step 6 labels authored app outcome and trace limit. |
| review-ledger | P: ledger | — | Changed ledger repeats authored outcome, evidence limit, and human review. |
| review-approve | P: committed | — | Same-folder Applied receipt after second Commit update. |
| review-publish | P: committed | — | Receipt holds; company publication is unpictured. |
| review-next | P: committed | — | Receipt holds for Backstage handoff. |
| backstage-entity | P: entity | — | Recording service Diagrams surface. |
| backstage-inline | P: inline | — | Data flow selected in native viewer. |
| backstage-where | P: where | — | Service appearance links expanded. |
| backstage-section | P: section | — | Section jump. |
| backstage-step | P: step | — | Recording request at STEP 3/6. |
| backstage-expand | P: expanded | — | Expanded canvas retains step and caption. |
| backstage-return | P: return | — | Back to entity restores initial surface. |

## Build capture provenance

The broad landing capture agent-landing-start-with-agent.png outlines the
actual Build with my agent button. The next Workbench capture
agent-setup-detail-selector-next.png outlines the Story detail dropdown
in the How are you starting? dialog. After the selected
detail is shown, agent-setup-copy-next.png outlines Copy & paste with Story
still selected; agent-setup-copy-engineering-next.png shows the same control
with Engineering selected for HLD and trace. The shared focused
agent-setup-copy-focused.png makes the conversation choice readable. These
are actual local Workbench states with an orange screenshot annotation around
the targeted control; no product UI code was changed for the annotation.

## Review semantics and provenance

For the square review and Backstage captures, the presentation uses wide
composites with the complete source window beside a magnified region from the
same capture. This preserves the modal footer and page context while making
the selected UI state legible; no second app state is implied.

The **First creation** captures came from actual Workbench new-agent setup and
a disk-backed empty folder. Before proposing, the saved My story scaffold had
zero nodes. A source-neutral display copy derived from the canonical
fictional six-step spec was submitted with a first-candidate ledger through
the real folder-agent helper. Proposed state showed 21 added and 2 modified;
Current state showed the empty scaffold. The focused viewer shows step 1/6,
and the ledger asks for source checking and human review. Its six-beat line
ends at a notification-service alert sent; it does not claim app receipt was
observed. After Commit update, the saved spec had six nodes and the ledger
was present. The Workbench showed an Applied receipt with Undo change. This
proves the local preview and acceptance UI. It does not claim Claude authored
the fixture or that every Build source produces identical technical detail.

The **Update existing** captures were made in one disk-backed Workbench
folder. The canonical six-step fictional spec and a nonempty accepted coverage
ledger were on disk before the update request. The folder was disconnected and
reopened through Continue an existing agent build. The first request proposed
a wording-only step-6 change and left that accepted ledger unchanged. Actual
Proposed and Current screens show one modified item; the Current ledger
explicitly records the authored HLD outcome and that the fictional happy
trace stops before app receipt. The human used Discard update; the Workbench
then displayed Not applied and left the accepted files intact. A second
request proposed a corrected step 6 and changed ledger, naming the resident
app alert as fictional design while limiting trace evidence to the
notification-service call. Actual Current, Proposed, focused ledger, and
Applied receipt screens all come from this same folder. The final saved spec
and ledger were checked on disk after Commit update. The YOU/CLAUDE exchange
is illustrative; the candidate files were seeded through the real local
folder-agent helper to exercise the Workbench review UI.

In both paths, Commit update accepts spec and ledger together in the local
folder. It is neither a Git commit nor company repository publication. The
actual receipts confirm Workbench acceptance; publication remains an
unpictured handoff.

## Reconnect evidence boundary

The images reconnect-workbench-wide.png, reconnect-start.png,
resume-folder.png, reconnect-instructions-header.png,
reconnect-copy-button.png, and reconnect-agent-focused.png came from the real
Workbench UI with a disk-backed local fictional doorbell fixture. They show
disconnection, reopening the same folder, fresh instructions, and a ready
Copy & paste Agent panel. The fixture provided a directory handle, so the OS
folder picker itself was not captured. Those images do not depict an accepted
edit. The same-folder Update Review sequence described above separately proves
that an accepted spec and nonempty ledger can be reopened and then updated.
Claude Code
keeps its own conversation; Workbench restores the files and its own history,
not an external Claude transcript. The reconnect dialogue is illustrative.

## Backstage associations and viewer semantics

The canonical fictional spec binds Recording service as
component:default/recording-service. Its Component page therefore shows the
associated diagram in the Diagrams entity tab. API entities require explicit
bindings of their own; text mentions do not count. The local fixture has one
associated spec. The tour shows the selected Diagram control but does not
claim a multiple-spec selection, an Overview-to-Diagrams click, or a company
catalog integration test. The native viewer has Home and Data flow tabs
inside the selected diagram. Where this service appears reveals matching
section and step links; the recording-request link lands at step 3 of 6.
Expand canvas retains the step and caption; Back to entity restores the
service page. The capture does not verify the company fork's GitHub loader,
SSO, or authorization policy.

## Binding, code, time, and icon checks

The explanatory tour has no bindings or code references. Its captions point
to the separate canonical spec's explicit binding. Step edges are process
transitions, not network hops. No playback, failed delivery, recorded cost,
live Claude transcript, battery state, or time progression is asserted.

## Verification and integration

- Validate the current spec with node tools/validate.js examples/flowview-product-tour/flowview-product-tour.spec.json; require zero errors and warnings.
- Rebuild portable HTML after spec or CSS changes. This ledger edit alone does not alter embedded tour content.
- Browser QA should inspect all three Build paths, alternate Reconnect entry, both Review paths, and every Backstage transition at 1280×800 and 1440×900 after image decode.
- Check that dialogue is not presented as a recorded transcript and no screenshot is credited with an OS picker or company publication.

# Flowview · from Claude to Backstage

Open [the interactive walkthrough](flowview-product-tour.html), or edit the
[spec](flowview-product-tour.spec.json) with its
[coverage ledger](flowview-product-tour.ledger.md).
This follows the presenter's separate live-diagram demo. It explains how a
fictional doorbell diagram is created or reopened, reviewed, and used; the presenter shows
Standard versus Explore on another diagram.

| Chapter | What the audience sees | Point of the chapter |
|---|---|---|
| Build new with Claude | The real new-diagram Workbench setup points to the detail dropdown, then shows Story or Engineering selected, the matching full dialog with Copy & paste highlighted, a focused Copy control, and an empty-folder choice. Three **tour paths** show illustrative YOU/CLAUDE conversations. | A business story, HLD, or Honeycomb trace can start a new six-beat doorbell project. The source path is separate from the Story/Mixed/Engineering audience choice. |
| Reconnect existing folder | The real Workbench recovery and Continue existing controls reopen a saved diagram folder before an illustrative Claude Code exchange updates the existing six-step story. | An existing flow may serve a business audience. Claude reads the accepted spec and ledger, preserves stable IDs, and proposes a revision. This is an alternative entry to Build new. |
| Review and accept | Two native paths: First creation compares the empty Current scaffold with a source-neutral first candidate; Update existing inspects the wording-only proposal, compares the accepted Current spec and ledger, discards that pending proposal, then reviews a new evidence-corrected proposal. | Both entry routes share the human preview gate, with a different starting state and a distinct actual Workbench sequence. |
| Find and use in Backstage | Seven actual plugin states: Recording service Diagrams page → native inline viewer → matching destinations → section → step 3 → expanded viewer → entity page. Broad screens are followed by focused UI details. | An explicitly bound service exposes the approved diagram on its own page; section/step jumps keep the selected diagram in context. |

All four chapters default to **Standard**. Build new and Reconnect existing
folder are alternative starting routes. Both handoffs open the Review chapter;
select **First creation** after Build new or **Update existing** after Reconnect.
Review defaults to First creation because local section handoffs do not select
a path. Build's three path labels switch the **illustrative source
conversation**, while its setup screen shows the actual Workbench controls:
Story/Mixed/Engineering detail, Copy & paste, and an empty-folder selection.
The First creation screenshots show a representative source-neutral candidate
and the actual review controls; they are not captures of the illustrative
Claude dialogue in any single Build path.
The existing-folder tab starts with the real recovery UI, not new-diagram setup.
Its Story audience example is independent of the already existing flow used as
source material. The YOU/CLAUDE conversations are illustrative, not captured
transcripts. Setup pastes appear as `[Pasted Flowview Setup Instructions]`.
In the Update existing Review path, the first wording proposal is discarded
before Claude submits a second proposal that clarifies the trace evidence
boundary. The accepted spec and ledger remain unchanged between those two
requests. The first candidate changes only resident-facing step wording; its
coverage ledger is unchanged. The second candidate changes the step wording
and ledger to state the authored outcome and trace limit together.

The fictional reference is
[`examples/canon/specs/doorbell.json`](../canon/specs/doorbell.json):
quiet porch → button event to porch hub → recording request → clip metadata
persisted → notification queued → notification service sends the resident
alert. The Honeycomb happy trace supports service spans for the hub, recording
service, clip store, queue, and notification service. Physical button press
and resident app receipt are authored context, not direct observations from
that trace. The tour does not claim playback or a failure outcome.

## Product boundaries shown in the tour

Workbench **Commit update** accepts the proposed spec and coverage ledger in
the local diagram folder; it is not a Git commit. A separate company repository
review publishes the approved pair. Reopening the same folder restores the
accepted files and Workbench history; an old Claude conversation is not
replayed automatically. A new conversation needs the current setup and project
context.

Backstage has **one Diagrams tab per Component/API entity**, not a new entity
tab for each spec. Its Diagram dropdown selects an associated spec; that spec
may have its own authored tabs and paths. Explicit service/API bindings create
the association. Mere text mentions do not. The local fixture shows one
associated spec, so it does not demonstrate opening a multi-spec dropdown.
**Where this service appears** provides matching section and step destinations.
The renderer is installed in the Backstage app; the approved JSON supplies
content. The company fork serves the static Workbench and uses authorized
GitHub loaders; the local fixture does not prove company login or loader setup.

## Screenshot provenance

PNG originals live in [screenshots](screenshots/) and are embedded as data URLs
in the spec and portable HTML. The new-build Workbench captures
(`agent-setup-detail-selector-next.png`, `agent-focus-story-landscape.png`,
`agent-focus-engineering-landscape.png`, `agent-setup-copy-next.png`,
`agent-setup-copy-engineering-next.png`, `agent-setup-copy-focused.png`, and
`select-folder.png`) came from the built Workbench on 2026-10-07. The broad
opening capture outlines the actual detail dropdown. Story and Engineering
paths then show their selected detail and matching broad Copy & paste choice
before a shared focused Copy image. The orange outlines are presentation
highlights on real controls. No folder permission was granted for these
new-build captures.
The existing-folder sequence starts with `reconnect-workbench-wide.png` (the
existing diagram and disconnected Agent panel in context, with a presentation
highlight on Reopen diagram folder), then `reconnect-start.png` (the focused
recovery card), `resume-folder.png` (Continue an existing agent build and folder picker),
`reconnect-instructions-header.png` (saved project filenames and fresh setup),
`reconnect-copy-button.png` (actual Copy connection instructions control), and
`reconnect-agent-focused.png` (connected Agent with Story detail and Copy request).
These came from a real local, disk-backed Workbench reconnect fixture. The
focused captures omit one-time connection IDs. The adjacent YOU/CLAUDE log is
illustrative; reconnecting does not replay an old Claude conversation.
The First creation Review path uses `first-create-neutral-preview.png`,
`first-create-neutral-empty-current.png`, `first-create-neutral-step-one.png`,
`first-create-neutral-ledger-focused.png`, and `first-create-neutral-receipt.png`, captured from a real
local Workbench first proposal after Start a new diagram with an agent in an
empty folder. The starting draft was `My story` with zero nodes; the proposal
adds a fictional doorbell story without attributing the candidate to one source path. The Update existing path uses
`update-initial-proposal.png`, `update-initial-step-six.png`,
`update-accepted-current-step.png`, `update-accepted-current-ledger.png`,
`update-revised-proposal.png`, `update-revised-current-step.png`,
`update-revised-proposed-step.png`, `update-revised-ledger.png`,
`update-initial-discarded-card.png`, and `update-revised-applied-card.png`
for actual Workbench first and second proposals, unchanged accepted Current
spec and ledger, changed ledger, and the distinct Not applied and Applied
receipts in one disk-backed folder.
`review-correction-illustrative.png` is a clearly labeled dialogue
illustration, not a Claude Code capture.
The request to Claude is illustrative, not a recorded Claude run. The proposed
revision separates an authored resident-app outcome from Honeycomb evidence
that stops at the notification-service call.

The Backstage sequence (`backstage-entity-diagrams.png`,
`backstage-inline-focused.png`, `backstage-jumps-focused.png`, `backstage-section-jump.png`,
`backstage-step-focused.png`, `backstage-expanded-focused.png`,
`backstage-back-to-entity.png`) came from the current React plugin in the
repository's local preview shell, using fictional catalog data and a reference
adapter. Each image corresponds to its displayed action. This is not a company
Backstage deployment. The current plugin code, rather than the single-spec
fixture, establishes multi-spec dropdown behavior.

## Regenerate and check

```sh
python3 tools/build.py
node tools/validate.js examples/flowview-product-tour/flowview-product-tour.spec.json
python3 examples/flowview-product-tour/build.py
```

The saved 24-column Standard layouts use the same 33-row height in all four
chapters: graph and step control on the left, changing UI evidence on the
right. Both entry routes divide the right column between actual Workbench UI
and illustrative Claude conversation; Review and Backstage give the changing
screenshot the full right column. Focused captures keep controls and evidence
readable at presentation size. Visual QA should inspect every Build source path,
each reconnect state, both Review paths, and every Backstage screenshot
transition at 1280×800 and 1440×900 after images decode.

The Reconnect graph was run through `tools/arrange-spec.cjs --width 1280` on a
temporary single-section copy without its named view. Its generated node
positions and graph frame were applied to the saved spec. The measured panel
and control tiles were enlarged into the tour's 33-row presentation grid so
screens and dialogue remain readable beside the diagram.

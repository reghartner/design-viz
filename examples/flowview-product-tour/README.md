# Flowview · from Claude to Backstage

Open [the interactive walkthrough](flowview-product-tour.html), or edit the
[spec](flowview-product-tour.spec.json) with its
[coverage ledger](flowview-product-tour.ledger.md).
This follows the presenter's separate live-diagram demo. It explains how a
fictional doorbell diagram is built, reviewed, and used; the presenter shows
Standard versus Explore on another diagram.

| Chapter | What the audience sees | Point of the chapter |
|---|---|---|
| Build with Claude | The real Workbench setup changes from the full dialog through a Story or Engineering detail example, Copy & paste, and folder selection. Four **tour paths** each reveal a detailed, explicitly illustrative YOU/CLAUDE conversation. | A business story, existing flow, HLD, or Honeycomb trace can start the same six-beat doorbell project. The source path is separate from the Story/Mixed/Engineering audience choice; this tour shows an existing flow presented in Story detail. |
| Review and continue | An illustrative YOU/CLAUDE correction, actual proposal comparison and ledger detail, the post-commit receipt, then same-folder continuation with a second illustrative exchange. | The person decides what lands; the spec and ledger persist together in the same folder. |
| Find and use in Backstage | Seven actual plugin states: Recording service Diagrams page → native inline viewer → matching destinations → section → step 3 → expanded viewer → entity page. Broad screens are followed by focused UI details. | An explicitly bound service exposes the approved diagram on its own page; section/step jumps keep the selected diagram in context. |

All three chapters default to **Standard**. Use the chapter tabs to move between
acts and the step control to play each act. Build's four path labels switch the
**illustrative source conversation**, while the setup screen shows the actual
Workbench controls: Story/Mixed/Engineering detail, Copy & paste, and folder
selection. An existing flow can serve a business audience; it does not require
Engineering detail. The conversation is not a transcript of a real Claude
session. Its setup paste is shown as `[Pasted Flowview Setup Instructions]`.

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
in the spec and portable HTML. The Workbench captures (`agent-setup-context.png`,
`agent-focus-story-landscape.png`, `agent-focus-engineering-landscape.png`,
`agent-conversation-choice-landscape.png`,
`select-folder.png`, `resume-folder.png`) came from the built
Workbench on 2026-10-07. Story and Engineering focus each have a readable
landscape detail after the broad setup view. The contextual setup capture has a capture-time orange
outline around Copy & paste. No folder permission was granted during capture.
The Review captures (`review-doorbell-current-step.png`,
`review-doorbell-update.png`, `review-doorbell-proposed-step.png`,
`review-doorbell-ledger-focused.png`, `review-doorbell-receipt-distinct.png`, and
`resume-folder.png`) show actual Workbench Current/Proposed/ledger,
post-commit confirmation, and resume UI for the fictional doorbell example.
For the receipt capture, only the local demo folder's persisted receipt message
was shortened after a real Commit update; the Workbench's Applied status,
validation, and Undo controls are unchanged.
`review-correction-illustrative.png` and `review-reconnect-illustrative.png`
are clearly labeled dialogue illustrations, not Claude Code captures.
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

The saved 24-column Standard layouts use the same 33-row height in all three
chapters: graph and step control on the left, changing UI evidence on the
right. Build divides the right column between the actual Workbench screen and
illustrative conversation; Review and Backstage give the changing screenshot
the full right column. Focused landscape captures keep controls and evidence
readable at presentation size. Visual
QA should inspect every Build source path and every Backstage screenshot
transition at 1280×800 and 1440×900 after images decode.

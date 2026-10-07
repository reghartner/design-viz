# Flowview system walkthrough — coverage ledger

## Operator decisions and source scope

No questions needed: the approved storyboard defines a mixed PM/engineer audience, an explanatory process sequence, and six tabs: Start → Claude → Review → Resume → Backstage → Render. The presenter demonstrates a real diagram and Standard/Explore separately. This tour explains how the system works. No Backstage bindings or code references are required inside this explanatory diagram (explicit user override). No clock, elapsed-duration, adoption, cost or quality claims are made.

Evidence: `docs/folder-agent-session.md`, `apps/backstage/README.md`, `apps/backstage/src/FlowviewEntityDiagrams.tsx`, `apps/backstage/src/plugin.tsx`, `apps/backstage/src/InlineFlowview.tsx`, `docs/diagrams/platform/README.md` and the platform spec. Current code verifies a single Diagrams entity tab on Component/API, a Diagram dropdown for multiple associated specs, and one selected inline viewer. Spec-authored tabs remain inside that selected viewer. They are not separate Backstage entity tabs.

## A. Story

A PM starts with an outcome and exceptions; an engineer can bring an existing flow, HLD, or trace evidence. Flowview prepares a shared diagram folder. Claude works in its external conversation and proposes the story and coverage ledger together. A human previews or requests corrections. Reopening the same folder restores the accepted project for another iteration. Repository review publishes approved diagrams. Backstage associates explicit service/API bindings with entity pages, selects one diagram from a dropdown, and renders its JSON with the plugin already installed in the Backstage app.

Most important moment: proposal versus human acceptance, shown by the real preview screenshot and authored checks. Required additional evidence: folder resume, entity Diagrams entry, diagram selection and inline controls. Never imply setup publishes, Workbench approval is a Git commit, a new conversation has old chat memory, a screenshot proves company GitHub integration, or each diagram becomes a separate Backstage tab.

## B. Panel plan

| Tab | Image question / best moment | Companion question / best moment | Must never imply |
|---|---|---|---|
| Start | Where is the conversation selected? / setup | Which input fits me? / four starting routes | Guaranteed generation quality |
| Claude | Where is the project stored? / choose folder | What happens in external Claude? / question and reply | Live transcript, FILE events |
| Review | Where do I compare and accept? / preview | Has the reviewer completed each gate? / approved or feedback | Automated certification |
| Resume | How do I reopen the existing project? / Continue existing | What persists versus reconnects? / restored pair | Automatic recovery of Claude chat |
| Backstage | Where is Diagrams and the selector? / entity page | How do publish and association become discoverable? / bindings | Company authentication proven by fixture |
| Render | How do inline viewer controls behave? / selected diagram | Which runtime/content boundary is active? / render and handoff | JSON delivering executable renderer code |

All image panels are reported static UI evidence. Companion states are authored explanations, not live telemetry. Standard/Explore comparison panels and generic sharing panels are removed because the presenter covers viewing modes separately.

## C. Paths

Review: Approve shares request/pair/preview and ends at accepted pair. Needs work shares that prefix, branches through feedback/revised pair/fresh preview, then rejoins human acceptance. Other tabs have one process path. Last Render step hands off back to Start. No automatic publication is part of the local approval path.

## D. Time

No temporal measurements apply. All steps are ordered process beats; no wall clock, battery, dates or rates are authored.

## E–F. Step × panel worksheet and coverage

Static image panels hold their screenshots; Render uses matched inline and expanded screenshots and switches only at render-expand. Backstage uses an App screens panel with no device frame: discovery holds until backstage-jump, which selects the real service jump screenshot; the final beat holds it. Every companion cell below is a patch (P) or a deliberate hold (H). Node/edge focus follows the named process hop; loops use explicit distinct correction beats.

| Step | Image | Companion |
|---|---|---|
| start-story | H: current genuine UI reference | H: accepted state / conversation remains valid |
| start-engineer | H: current genuine UI reference | P: starts; Or start from an existing engineering flow, an HLD, or a Honeycomb trace. Claude asks for missing details and keeps evidence distinct from assumptions. |
| start-artifacts | H: current genuine UI reference | P: starts; The draft becomes a Flowview spec plus a coverage ledger. The ledger records questions, decisions, evidence, and open work. |
| start-preview | H: current genuine UI reference | H: accepted state / conversation remains valid |
| start-next | H: current genuine UI reference | H: accepted state / conversation remains valid |
| create-choose | H: current genuine UI reference | H: accepted state / conversation remains valid |
| create-folder | H: current genuine UI reference | H: accepted state / conversation remains valid |
| create-paste | H: current genuine UI reference | P: agent; Paste the setup instructions into Claude Code. Claude verifies the exact folder, reads the packaged guidance, and works with normal file permissions. |
| create-draft | H: current genuine UI reference | P: agent; Claude turns the story into steps, nodes and edges, while recording assumptions and open questions in the ledger. This panel is illustrative, not a live transcript. |
| create-next | H: current genuine UI reference | P: agent; Click Next · Review to see the proposed change and the human approval gate. |
| review-request | H: current genuine UI reference | P: gate; A request captures the message, selected items, view, path, step, and detail level. Copy alone does not silently send it to Claude. |
| review-pair | H: current genuine UI reference | P: gate; Claude edits the seeded candidate spec and ledger. The accepted files remain untouched until a person approves the proposal. |
| review-preview | H: current genuine UI reference | P: gate; Preview Agent Updates renders the proposal. Compare Current and Proposed, inspect change highlights, and expand the coverage ledger when needed. |
| review-approve | H: current genuine UI reference | P: gate; Choose Commit update only after review. Flowview saves the spec and ledger together; one Undo can restore the prior pair. |
| review-feedback | H: current genuine UI reference | P: gate; If the proposal is wrong or conflicts with a newer edit, discard or copy feedback. Claude reconciles the current pair and submits a new proposal. |
| review-revise | H: current genuine UI reference | P: gate; Claude uses the feedback and latest accepted revision to prepare corrected candidates. The new proposal still needs a fresh human review. |
| review-preview-again | H: current genuine UI reference | P: gate; Review the corrected Current and Proposed states. An earlier approval cannot be reused after a change. |
| review-next | H: current genuine UI reference | H: accepted state / conversation remains valid |
| resume-folder | H: current genuine UI reference | P: continuity; Choose Continue an existing agent build, then select the SAME diagram folder used before. |
| resume-load | H: current genuine UI reference | P: continuity; Flowview restores the saved spec, coverage ledger and workbench history. An open draft is kept in Earlier drafts; old pending work is not replayed. |
| resume-connect | H: current genuine UI reference | P: continuity; Reconnect using Copy & paste. Continue the earlier Claude conversation when available; in a new session, provide the current setup and project context. |
| resume-request | H: current genuine UI reference | P: continuity; Describe the next change. Claude reads the current project, prepares candidates, and submits another proposal for human review. |
| resume-next | H: current genuine UI reference | H: accepted state / conversation remains valid |
| backstage-publish | H: current genuine UI reference | P: discovery; After local acceptance, publish the spec and ledger through the company repository review process. Workbench Commit update does not make a Git commit. |
| backstage-read | H: current genuine UI reference | P: discovery; The company Backstage integration reads the approved snapshot from GitHub. The company fork hosts the static Workbench; it does not host a diagram API. |
| backstage-bind | H: current genuine UI reference | P: discovery; Explicit service and API bindings associate a diagram with full catalog entity identities. The association index includes matching sections, paths and steps. |
| backstage-service | H: current genuine UI reference | P: discovery; Each explicitly bound service in the published diagram gets that diagram in the Diagrams entry on its OWN Component page. Explicit API bindings also associate it with that API entity page; a text mention alone does not. |
| backstage-tab | H: current genuine UI reference | P: discovery; Open that entity’s Diagrams tab. Its Diagram dropdown lists the published diagrams that entity participates in. Multiple matching nodes or sections collapse to one entry per diagram. |
| backstage-jump | P: switch to actual service jump controls | P: discovery; Open Where this service appears, then choose a section or a matching path/step button. The jump opens that exact point inside the selected diagram. |
| backstage-next | H: current genuine UI reference | H: accepted state / conversation remains valid |
| render-select | P: actual selected inline viewer capture | P: runtime; The Diagram dropdown chooses one associated spec. Switching diagrams selects another viewer instance; authored tabs inside a spec remain navigation within that selected diagram. |
| render-check | H: current genuine UI reference | P: runtime; The renderer already ships in the Backstage app. Compatibility checks compare the loaded spec requirements with that installed release; unsupported contract majors stop rendering. |
| render-inline | P: actual selected inline viewer capture | P: runtime; The native viewer renders inline: authored sections and tabs, panels, steps, alternate paths and saved evidence links. Diagram JSON provides content, not executable renderer code. |
| render-jump | H: current genuine UI reference | P: runtime; Where this service appears offers section and path/step buttons. Each button jumps within the same selected viewer. |
| render-expand | P: same-session expanded viewer capture | P: runtime; Expand canvas moves the SAME live viewer into a full-window modal. Back to entity or Escape returns it without another spec read or viewer mount. |
| render-edit | H: current genuine UI reference | P: runtime; Edit in Workbench and Build with Claude open the external editor with the diagram identity, digest, entity and reading position. Build opens a checked local draft and setup guide; folder permission and publication still require explicit actions. |
| render-next | H: current genuine UI reference | H: accepted state / conversation remains valid |

## G. Icons

Static role icons only. Focus follows the active beat; no physical or device state icon changes are claimed.

## H. Binding and code coverage

This explanatory tour deliberately has no `binding` or `codeRefs`, per user instruction. Product implementation sources above establish accuracy. Company GitHub loaders, SSO, access policy and deployment are integration responsibilities and are not verified by the local screenshot fixture. Drift detection, trace processing details and feature-release pipelines are out of this tour's scope.

## I. Checkable expectations

Six Standard defaults, six working local-section handoffs, Review corrections require fresh preview, no FILE log rows, no view comparison tab, actual Resume setup image, explicit Component/API entity-tab scope, Diagram dropdown distinction, native rendering and same-viewer expansion. Production Auto Arrange owns new Resume/Backstage/Render graph coordinates. At 1440×900 and 1280×800 all declared panel content must fit without an internal clipped viewport. Standard pages may scroll vertically. Images must decode before visual capture. Spec validator must report zero errors and warnings.


## Amendments and verification

- Additional user requirement: each **explicitly bound service** in a published diagram exposes that diagram through its own Component page; explicit API bindings do the same on API pages. Added a service-page node/beat and the Where this service appears jump node/beat. Mere text mentions do not associate. All sections/tabs are indexed; multiple matching nodes/sections collapse to one entry. Sources: apps/backstage/README.md association rules and FlowviewEntityDiagrams.tsx.
- New Resume/Backstage/Render topology was run through the production Auto Arrange CLI on sections 3, 4, 5. Backstage was arranged again after adding the service/jump topology. The first three diagrams retain prior arranged coordinates.
- Tiny fixed-width tiles ellipsized explanatory text. Replaced them with wrapping state tables. These snapshots are authored explanations, not live state monitoring. Graphs use full-width Standard tiles and enough vertical height for every node; evidence and controls follow below. Page scrolling is intentional.
- Captures: actual Workbench setup/Resume; production review with seeded checkout example; actual current React Backstage plugin in its local fixture shell with fictional data and reference adapter. No company login or company GitHub loader is proved. The new discovery capture shows the single Diagrams tab, associated-spec selector and selected title/actions. The additional actual service-jump capture shows matching section and step links. The expanded capture is the same live native viewer after clicking Expand canvas.
- Spec walk: no WARN findings. CHECK findings for unchanged static image panels are intentional: each is a persistent UI reference for the corresponding live process. The Backstage screenshot changes at the service-jump beat. No battery, time, icon or source-reference checks apply.
- Browser review: six tabs and Review's two terminal paths at 1440×900 and 1280×800, images decoded and transitions settled. Measured all displayed panels for internal overflow; measured all graph node bounds against their clipping ancestors. Evidence and metrics are in /tmp/flowview-system-tour-qa; the temporary path is reviewer evidence, not a runtime dependency.

Final results: validator 0 errors / 0 warnings; state walk no WARN findings; six
local handoffs and both Review paths passed. Twelve tab/viewport inspections
reported zero page errors and zero visible panel overflow. The table's intentional
1-pixel screen-reader caption (`.swcaption`, `clip-path:inset(50%)`) is excluded
from visual-overflow findings. All graph nodes fit their clipping ancestors at
both target widths. Evidence-panel widths are 717 px at 1440 and 630 px at 1280;
page scrolling preserves legibility instead of shrinking the entire system.


### Screenshot-state correction

The service-jump screenshot was recaptured as a 716×450 real viewport region,
including canonical owner/HLD context and every matching step button. It now
matches the discovery screen ratio without gray letterboxing or cropped text.
Render now starts with a genuine selected inline viewer capture (including its
title, native graph and playback), holds it through render-inline/render-jump,
and selects a same-session expanded capture only at render-expand. Both source
captures are 900×900. The screenshot panel height accommodates the larger
square image and complete provenance caption. No renderer or topology changed.

Focused visual evidence: /tmp/flowview-screen-transition-qa, at 1440×900 and
1280×800. Assertions compare displayed image identity at initial/inline/expanded
beats and confirm its viewport matches the source aspect ratio (no letterbox).

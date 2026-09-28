# Atlas feature review: Claude Build for business users and engineers

Reviewed 28 September 2026 in `codex/claude-folder-session`, draft [PR #249](https://github.com/reghartner/design-viz/pull/249). Baseline commit: `2126d6391bb80ddc440090e76a563d3cad37643a`, plus the root agent's in-progress canvas/detail fixes. This is an independent product/feature pass, not a replacement for the parallel code review or required CI. No product code changed; no merge performed.

**Recommendation:** use this for a facilitated pilot now, after the current regression work passes. Before inviting nontechnical users to succeed alone, prioritize the conversation layout, clear session recovery, and a portable story brief. The filesystem connection itself can remain. It is already an effective proof of the user's own agent working inside the editor.

The strongest product opportunity is **one story with two useful working perspectives**: business users explain people, decisions, and outcomes; engineers enrich those same moments with evidence and implementation. A technical-detail dropdown by itself does not complete that handoff.

## What I actually exercised

- Opened the built workbench in Chromium at 1440×900 and 1280×720.
- Used the real browser workbench, local disk files, bundled Python helper, and watcher. Only the folder picker/handles and Claude's authored responses were substituted. A temporary review folder was used; no actual user session was read or changed.
- Walked Welcome → Build with Claude → exact working-folder guide → inspectable instructions → copy → watcher connection → editor question and answer → proposal application → Engineering detail → File → reload.
- Inspected context receipts, activity, proposed-change acknowledgement, the source-level conflict/Undo implementation, persistence/resume behavior, and the updated authoring skill.
- Used the running mock Backstage React plugin at `http://localhost:8766/backstage-preview/index.html`: inline viewer → full-window Explore → Build with Claude → checked local draft at the same story position → connection guide.
- Selected evidence screenshots are preserved under `atlas-artifacts/` next to this report. The full temporary captures, observations, and diagnostic scripts remain in the reviewer’s local `.local/reviews/` directory.
- Built and visually checked an interactive [workspace concept](atlas-workspace-concept.html) at desktop and laptop sizes. Its Story / Engineering / Present controls, selection focus, brief, handoff dialog, and mock activity are demonstrative only.

**Limits:** this pass did not invoke live Claude, exercise native folder permission dialogs, establish Claude Monitor availability on another user's machine, evaluate model-generated story quality, or prove installed company Backstage/SSO integration. The scripted proposal used a known-valid starter to inspect the editing experience; it is not evidence that Claude produced the example customer brief correctly. No customer usability study has occurred.

## What is working well

1. **Entry is direct.** The main welcome action reaches the actual editor and a centered connection helper in one click. The Backstage action does the same for an existing story.
2. **Trust is inspectable.** The complete pairing copy is visible; the exact Claude working folder and created exchange folder are distinguished; recovery copy tells the agent to stop rather than search the user's disk. The instructions prohibit browser tools and describe normal permission prompts.
3. **The agent is usefully present in the editor.** The conversation, frozen context receipts, progress history, waiting/working/quiet states, and persistent toolbar indicator give considerably more confidence than a terminal-only integration.
4. **The technical foundation supports collaboration.** Identity checks, revision checks, local-edit deferral, validation, and one ordinary Undo per accepted replacement are good safeguards. Selection is honestly described as focus while the whole story is shared.
5. **The improved skill matters.** Questions first, audience-sensitive language, written assumptions/evidence, stable identities, and an explicit ledger are the right behavior for business-to-engineer work. The UI now needs to expose the useful outputs of that skill.
6. **The canvas direction is right.** Full-window exploration with movable tools, named views, panels, and playback can serve both audiences. Curated page output remains available.
7. **Backstage preserves context.** The tested handoff opened the checked story at the existing root view/path/step and required explicit folder pairing. It did not publish the local draft.

## Prioritized improvements

These priorities are about adoption. “Pilot blocker” below means a blocker for an **unassisted business-user pilot**, not a claim that each item should block the current engineering PR.

### P1 · Keep conversation and the next action usable after the first exchange

**Scenario:** a business user answers Claude's first question, reads the generated story, and tries to answer the next one.

**Evidence:** in the actual UI, after two user messages at 1440×900, the Agent panel's shared scrolling content pushed the composer and Send below its bottom. At 1280×720, the composer was outside the visible panel entirely until manually scrolling. The transcript, activity, connection controls, full context card, detail selector, and form are sequential content inside the same window. See `atlas-artifacts/08-generated.png`, `11-laptop.png`; `src/workbench.skel.html:145` and `src/style.workbench.css:261`.

**Impact:** the core interaction appears to disappear almost immediately. A user may assume the agent is done, frozen, or that replying requires returning to Claude.

**Recommendation:** fix the Agent window into a compact header, independently scrolling conversation, and an always-visible composer. Keep a concise focus chip by the composer; expand full sharing/context details on demand. Collapse old progress by turn. Keep a clear latest-answer/new-message affordance without forcing scroll away from an older message being read. Put permission/reconnect actions beside current status.

**Acceptance:** after 20 varied-length exchanges at 1280×720 and at 200% text zoom, users can see the focused target, type, send, and find the latest question without resizing a window. Test keyboard reachability as well as geometry.

### P1 · Make returning to the same story a first-class flow

**Scenario:** the browser reloads, the laptop sleeps, or the business user returns tomorrow.

**Evidence:** reload restored the diagram but the Agent panel became a fresh connection state, its visible conversation disappeared, and Engineering detail returned to Story. The existing conversation is recoverable, but the current instruction is to open `story.spec.json` first, open the connection guide, expand “Resume an existing exchange,” select the exchange subfolder rather than its parent, and paste fresh instructions. See `atlas-artifacts/12-reload.png`; `docs/folder-agent-session.md:142`; `src/workbench/folder-agent.js:120`.

**Impact:** users interpret a disconnected, empty chat as lost work. The first connection already taught them to select a different folder level, so resume reverses a freshly learned rule.

**Recommendation:** show a “Continue this Claude conversation” card with the last known story/session name, last contact, and one recovery action. Where browser permission allows, retain the directory handle and request access on an explicit gesture; provide a clear picker fallback. Do not reconnect silently or bypass identity/revision checks. Read the chosen session first and offer an explicit saved-story/current-draft choice if they differ; never overwrite a draft to make resume succeed. Preserve detail preference and unsent text. Clearly state that interrupted work is not automatically replayed.

**Acceptance:** a user who knows no protocol filenames can recover after reload, denied/revoked permission, folder mismatch, and sleep. They can distinguish a saved diagram from a live Claude connection.

### P1 · Promote the story ledger into the product and the handoff

**Scenario:** the business user sends the result to an engineer who did not participate in the conversation.

**Evidence:** the skill and pairing instructions require `story.ledger.md` with decisions, assumptions, source evidence, and engineering gaps. The browser client does not read or display that file. File explains that Save downloads current JSON and provides exports, but no visible handoff bundles the ledger or presents unresolved questions. This is an implementation observation, not evidence that Claude omitted the ledger. See `src/workbench/agent-chat.js:32`, `src/workbench.skel.html:159`, `.claude/skills/hld-to-page/SKILL.md:20`; `atlas-artifacts/10-file-handoff.png`.

**Impact:** the differentiating value of the improved skill stays in a file that the intended business user may never open. An engineer receives shapes and has to rediscover the intent. Chat history alone is too noisy to be the contract.

**Recommendation:** add a readable **Story brief & decisions** surface: audience, intended takeaway, agreed behavior, assumptions, questions, source list, and last checked revision. Initially render a deliberately constrained ledger representation, inertly, with provenance. Offer **Prepare engineering handoff** that packages the editable spec, viewable story, brief/ledger, source manifest, and change summary. The source manifest should identify references, not silently copy arbitrary local source files.

**Acceptance:** an engineer can explain the intended customer outcome, identify every unresolved decision, and locate supporting evidence without reading the original chat. The business author can review the same brief before sharing.

### P1 · Give a busy or blocked turn a visible escape route

**Scenario:** Claude is planning the wrong change, a permission prompt is waiting elsewhere, or the watcher expires.

**Evidence:** a pending request disables Send and only one request is accepted. There is no in-editor per-request Stop/Cancel or correction queue. Disconnect is inside connection details; the quiet-state text says Claude may be working or waiting for permission in its terminal. Monitor renewal is an instruction, not an editor control. See `src/workbench/agent-chat.js:83`, `:98`, `src/workbench/folder-agent.js:145`.

**Impact:** the user can see that something might be wrong but cannot express “stop, I meant the other path” in the interaction surface they were asked to use.

**Recommendation:** add **Stop accepting this turn** with protocol cancellation/identity checks so late proposals cannot land. Be explicit that this does not necessarily terminate Claude's computation; provide the exact instruction for interrupting it there. Distinguish watcher offline, waiting for model acknowledgement, no recent update, and reported permission-needed states. Offer a recover/renew instruction without discarding the diagram or draft message. A follow-up queue can come later.

**Acceptance:** cancellation races with a proposal and a final reply safely. The user can recover a stalled turn without creating a new story or losing their explanation.

### P2 · Make each applied change reviewable and attributable

**Scenario:** Claude changes several moments of a story; the author wants to understand what changed before presenting it.

**Evidence:** valid proposals automatically apply as whole-document replacements. The summary is shown through transient status and is then replaced by reply/status updates; a final answer may explain the change, but the UI has no durable change card, visual before/after, or per-turn change receipt. A global Undo is available and revision checks prevent stale overwrites. See `src/workbench/agent-session.js:21`–`:30` and `src/workbench/folder-agent.js:66`.

**Impact:** “the diagram moved” is weaker evidence than “Claude added the unavailable-time path and retained the main journey.” The existing correctness guards do not by themselves communicate the scope of change.

**Recommendation:** attach a persistent change card to the relevant turn: summary, changed sections/steps, validation status, **Show changes**, and **Undo change** where it is still safe. Highlight additions/changes on the canvas. For broad or destructive changes, an optional review-before-apply mode is useful; do not add mandatory approval friction to every small conversational edit. Clearly separate structural validation from human/visual approval.

**Acceptance:** after further conversation, a user can still find which turn made a visible change and understand whether undo would affect subsequent manual work.

### P2 · Use workspace presets to protect the giant canvas from its tools

**Scenario:** an author opens Agent and File/Inspect, then tries to switch audience view or play the story.

**Evidence:** at laptop size, concurrent floating windows covered the lower playback area and the named-view tabs on the canvas. The desktop screenshot also shows the Agent window over part of playback. `Hide tools`, close, move, and reset exist, but the user has to manage the collision. Page preview is under Canvas appearance rather than an obvious reading/presentation action. See `atlas-artifacts/08-generated.png`, `11-laptop.png`, `16-backstage-draft.png`.

**Recommendation:** retain movable windows, but provide sensible **Story**, **Engineering**, and **Present** workspace arrangements. Story opens Agent, a compact narrative/brief control, and playback; Engineering adds evidence/inspection on demand; Present hides editing tools and prioritizes the intended reading view. Keep main view/path/playback controls in reserved clear areas, and make **Fit** account for open panels. Do not reset a user's deliberate arrangement on every selection. Treat curated Page preview as an explicit output/reading mode.

**Acceptance:** the diagram, view selector, active path, and playback remain usable at 1280×720 with Agent plus one auxiliary tool open. Esc/keyboard users can restore a clean arrangement.

### P2 · Make local draft and published-story ownership visible in Backstage handoff

**Scenario:** an engineer starts from an approved service diagram, edits it, and presses Save expecting colleagues to see it.

**Evidence:** the mock handoff correctly opens a local draft and strips the one-time handoff fragment. The main editor chrome does not prominently identify the approved source, local draft status, or publication path. File says Save downloads JSON, and integration docs explain that repository review publishes it. See `atlas-artifacts/16-backstage-draft.png`; `apps/backstage/README.md:62`.

**Recommendation:** show **Local draft · Based on [approved story/revision]**, an identifiable saved state, and **Prepare review** / **Export change** as distinct from Save. Include source revision and intent in the handoff package. In a company deployment, route to the company's actual review mechanism; do not imply that the prototype publishes back to Backstage. Empty entity diagrams should have a clear story-creation path with that entity already in scope.

**Acceptance:** users can tell what is only on their machine, what is an approved shared artifact, and exactly what happens when they save or share.

### P2 · Put prerequisite checking before the user becomes invested

**Scenario:** a business stakeholder has a Claude web account but has never used Claude Code, Python, a project folder, or Monitor.

**Evidence:** first-run helper copy is much improved and explicitly distinguishes Claude Code from web chat. Browser support is checked only on folder selection; Python/Node and Monitor needs are in the instructions/docs. “I need help opening Claude Code” expands to a CLI command. The fully inspectable pairing prompt is long and implementation-heavy, which is appropriate for the agent but burdens human review.

**Recommendation:** for this local proof, state the supported setup plainly and offer a short facilitator checklist or approved launcher path before the demo. In the helper, separate a concise human-readable explanation of access/effects from the full exact copy. Add an inspectable preflight response from Claude that confirms tools/runtime availability and reports an actionable blocker through the connection flow. Preserve the full copy and ordinary permissions; do not hide auto-installation or broaden tool access. Support for an arbitrary Claude web session is a different product integration, not a wording change.

**Acceptance:** a fresh user knows whether this machine is ready before choosing folders repeatedly. Every unsupported prerequisite has a single next step or a clear supported-pilot boundary.

### P3 · Add evidence without replacing the business story

**Scenario:** an engineer switches to Engineering detail and begins adding service names, retries, contracts, and failure handling.

**Evidence:** `technicalLevel` is captured per request and the skill says to preserve the original story and identities. That is a good start. The current UI provides no explicit acceptance boundary between agreed customer behavior, assumptions, and implementation facts, and changing the dropdown does not itself create a separate engineering view.

**Recommendation:** expose two distinct concepts: **what I am viewing** and **how the next agent request should work**. Prefer engineering drilldowns or named views linked to stable story moments. Let engineers attach source references and mark support/conflicts; let business users approve changes to outcomes in plain language. Start with a small accepted-behavior checklist before attempting formal requirements management.

**Acceptance:** enriching the engineering view retains the original business path and its meaning. Contradictory evidence creates a visible unresolved question, not an unexplained rewrite.

### P3 · Evolve to semantic edits once the experience is dependable

A local change API is a useful next layer, especially for large stories and concurrent manual edits. Begin with a small set of validated operations such as update a node label, insert a story moment, update a panel state, add an alternate path, or replace one section. Use stable IDs, explicit preconditions, a transaction result, dry-run validation, and one Undo per accepted transaction. Reuse the existing editor mutation planners where appropriate. Keep full replacement as a bounded fallback.

Do not require a server merely to get these benefits: semantic operation envelopes can travel through the same files. This is separate from multi-user collaborative editing; it does not supply shared authorization or distributed conflict resolution by itself.

## Concrete first-session journeys

### Business author: explain the appointment story

1. Open the hosted workbench and select **Build with Claude**. See which local setup is required; connect through the visible copy/paste guide.
2. Describe the customer, the desired outcome, and one failure/recovery scenario in ordinary language. Use an example prompt if starting from nothing.
3. Answer a short plain-language question batch. Review the one-paragraph story brief and uncertain assumptions before expensive diagram elaboration.
4. Claude produces a small playable story. Its progress and the reply are visible beside the canvas. The form stays visible.
5. Select “Check availability” and ask what happens when the first choice is taken. Confirm the focus, see the alternate path and a durable change card, then play that path.
6. Correct one label manually while Claude works; confirm the resulting rebase/reconciliation in human terms. Undo one complete change if needed.
7. Choose **Prepare engineering handoff**. Review agreed behavior and unresolved questions, download a portable package, then reload and successfully resume the conversation.

**Pilot success measures:** time to first useful story; number of folder/terminal interventions; whether the author explains the generated outcome accurately; successful correction/Undo; successful next-day resume; and whether an engineer can continue without a verbal reconstruction of the meeting. Measure these in the pilot rather than assuming targets already proven.

### Engineer: add evidence without erasing intent

1. Open the handed-off package or an approved diagram in Backstage. Read the brief, source provenance, and unresolved questions.
2. Enter **Engineering** work and connect their own visible Claude session. Reuse the same story identity, not the previous person's agent credentials.
3. Supply a small bounded set of implementation sources. Resolve one engineering gap at a time, attaching evidence to the story moment it supports.
4. Add a service/drilldown view for availability checks and concurrency behavior while keeping the customer journey readable.
5. If code contradicts the promised customer experience, surface the conflict as a decision for product rather than silently changing the original outcome.
6. Review the semantic change summary, play normal and failure paths, inspect supporting evidence, and prepare the company's normal PR/review artifact. The UI states that publication has not happened yet.

## Suggested delivery order

1. **Finish current hardening:** regression suite, independent re-review, no merge without the user's authorization.
2. **Make a conversation survive real use:** fixed composer; recovery affordance; cancellation/stall handling; compact persistent change receipt. These yield the highest improvement without changing transport.
3. **Complete the business-to-engineer promise:** visible brief/ledger, evidence/gaps, portable handoff and explicit local-draft provenance.
4. **Refine creative-tool ergonomics:** workspace arrangements, clear reading/presentation modes, fit around panels, discoverable view/path navigation.
5. **Grow engineering capability:** semantic operations, evidence-backed validation, company review integration. Account provisioning/SSO is a later adoption layer after the local pilot proves the workflow.

## Mockup scope

[Open the interactive concept](atlas-workspace-concept.html). It demonstrates the fixed composer, short focus receipt, per-turn change card, Story/Engineering/Present arrangements, brief/decisions surface, and explicit local-draft handoff. Buttons do not contact an agent, upload files, or publish anything. The proposed “saved locally” indicator would need real persistence evidence in implementation; it is illustrative here.

The concept deliberately retains a full-window canvas. Its floating Agent window reserves interaction space without turning the diagram back into an embedded preview. Named views and request detail remain distinct underlying concepts even if a workspace preset can choose sensible defaults for both.

## Observation versus inference

| Directly observed in this pass | Inference or proposed design, not yet validated with users |
| --- | --- |
| Pairing guide, real file/helper message exchange, scripted proposal apply, and mock Backstage Build handoff worked. | A nontechnical person can complete setup without assistance; that requires a pilot on a fresh machine. |
| The composer moved below the visible Agent window after a short conversation; floating windows overlapped controls at laptop size. | A fixed composer and workspace presets will improve completion rates. The mockup demonstrates geometry, not a measured usability result. |
| Reload retained the diagram and reset the visible agent connection/conversation/detail selector; documented resume requires selecting the saved exchange. | Users will interpret this as lost work. Actual data loss was not observed. |
| The client has no ledger-reading UI or combined handoff action; the skill explicitly requires a ledger. | Exposing that ledger is likely the most valuable addition for collaboration across roles. This pass did not evaluate a real Claude-authored ledger. |
| Pending requests block another Send, and the UI has Disconnect rather than per-request cancellation. | A stop/correction flow is important for unassisted adoption; no runaway live Claude session was exercised here. |
| Proposal code validates revisions and records one accepted replacement in Undo; summaries are ordinary status updates. | Durable change cards and semantic operations can improve reviewability and reduce broad rewrites. Their proposed design is not implemented. |
| The mock opens a local draft; company publication is documented as a separate review process. | Users may mistake Save for publishing. Company SSO, loaders, and installed-host behavior remain unverified. |

No new confirmed document-corruption or unauthorized-publication defect was found in this feature pass. The layout/recovery findings are concrete usability observations; recommendations about adoption and future capability are explicitly product judgments.

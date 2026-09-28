# Claude Build adoption implementation

Status: implementation complete; final validation and independent review in progress. User authorized execution of Atlas recommendations on 28 September 2026. Work remains in isolated branches and PRs; no merge is authorized.

The existing transport/canvas implementation is PR #249 (`codex/claude-folder-session`, last implementation commit `a4e90a2`, hardened tests through `36f984d`). Its complete CI run passed at `01b25129`; PR #249 is ready for review and remains unmerged. Adoption work starts at that head on `codex/claude-build-adoption` and will be reviewed as a separate, dependent PR.

## Delivery phases

1. A usable conversation: always-visible composer, compact focus/access explanation, scrollable history, new-message affordance, durable applied-change receipts, safe per-turn cancellation, prerequisite help, saved preferences, and explicit recovery after reload.
2. Business-to-engineer continuity: visible story brief/ledger, decisions, assumptions, evidence and questions; portable editable/viewable handoff with reference manifest and source provenance. No arbitrary local source copying or implied publication.
3. Creative workspace: Story / Engineering / Present presets over the same authored story; explicit Page preview; visible local-draft provenance; tools and camera fitting that keep view/path/playback accessible. Request detail remains separate from the view being shown.
4. Bounded semantic operations: stable-ID commands, revision preconditions, atomic validation, one Undo transaction, dry-run support, and whole-spec fallback over the existing files. No transport server, browser access for Claude, SSO or automatic company publication is added.
5. Independent code/UX review, relevant Node/Python/browser checks, fresh mock Backstage exercise, and full CI. Keep all work in PRs and leave unmerged.

## Parallel ownership

- Conversation agent: `src/workbench/agent-chat.js`, new `src/workbench/agent-conversation.css`, new recovery/persistence module(s) and focused tests. Owns conversation DOM additions, recovery prompts, compact focus, persistent composer, turn receipts, cancellation controls and prerequisites. Does not edit shared skeleton/build manifests or the folder client/helper.
- Protocol agent: `src/workbench/folder-agent.js`, `tools/folder-agent.py`, protocol/helper tests. Owns cancellation races, safe resume preview/choice APIs, receipt persistence, bounded ledger read, helper preflight/cancellation and operations envelope support. Does not edit agent-chat or shared builder integration.
- Brief/handoff agent: new `src/workbench/story-brief.js`, `src/workbench/story-brief.css`, focused tests and handoff documentation. Owns inert ledger rendering, source/gap presentation and portable handoff construction. Does not edit agent-chat, folder client, skeleton, workspace or build manifests.
- Root: shared builder integration, skeleton, existing workspace/styles, build assembly, source provenance, safe Undo/change descriptions, semantic-operation planner, generated artifacts, integration verification and PR coordination.

Agents must not revert others' work. Shared seams are coordinated with root; generated files and final commits are root-owned.

## Shared interface contracts

Protocol additions (coordinate any necessary adjustment before implementation):

- `createFolderAgentFiles(directory).readText(name)` reads bounded UTF-8 text, with missing files returning null; preserve existing JSON `read` and transactional `write` behavior.
- `inspectFolderAgentSession(files, snapshot, now?)` performs a read-only saved-session preview, returning identity, saved source/revision, transcript, lease information and whether source matches. It must not claim ownership or write.
- `client.start(true, {resumeSource:'saved'|'current', expectedSavedRevision, expectedSavedSource})` keeps strict matching by default. Explicit current-draft choice checks the preview has not changed and archives the prior saved source before replacing it. Saved-story choice imports through the root callback first. No interrupted request is replayed.
- `client.cancel()` invalidates the pending request synchronously before awaiting disk work; late progress/replies/proposals cannot affect this or a later turn. Cancellation does not claim to terminate Claude computation.
- `client.readLedger()` returns bounded inert text with read/source provenance, or null if unavailable; ownership/lifetime checks apply.
- Published state gains persistent `changes` receipts keyed by proposal/request, including summary, outcome, revisions and time. No repeated multi-megabyte source copies in transcript. Root adds descriptions and safe Undo callbacks.
- Python helper gains inspectable preflight, recognizes cancellation for every write/Monitor event, and accepts `propose --operations <file>` as an alternative to `--file`. Operation planner/validation is root-owned.

Conversation/root integration:

- Root supplies `opts.restoreSavedStory(source)` (preserve the current draft and import through normal one-action history), `opts.undoChange(receipt)`, `opts.showChanges(receipt)` and appropriate source-provenance state.
- Agent chat exposes `readLedger()` and connection/recovery information for the Brief tool. Directory handles may be persisted in IndexedDB only for explicit reauthorization; no silent permission request or reconnect.
- The Brief module exports `initWorkbenchStoryBrief({document,snapshot,readLedger,provenance,renderHtml})`, mounts into `#editor-brief`, and returns `refresh()`/`destroy()`. Pure bundle/render helpers are independently testable. It must work with no agent connection and explain missing/stale evidence honestly.
- Root creates Brief/workspace controls and registers new source/CSS modules. Agents report needed IDs/hooks instead of editing shared files.

Semantic envelope v1 will use a bounded list of named operations (updateNode, insertStep, patchPanelState, addPath, replaceSection), stable section/entity IDs and the existing exact baseRevision. The planner rejects unknown operations, invalid identities/paths and prototype keys, validates the entire result before publication, and preserves unknown unrelated authored fields. A dry run validates without mutating source/history. Detailed shapes are finalized in the root implementation and helper help text.

## Acceptance priorities

- At laptop size and zoom, history growth never hides message input/Send; keyboard focus remains usable.
- Reload preserves the local diagram, unsent text and request detail; reconnect is explicit and source conflicts offer a safe, understandable choice.
- Cancellation wins against delayed file reads and receipt/reply races; subsequent requests are isolated.
- A new engineer can read intent, evidence, unresolved decisions and local-draft provenance without reconstructing chat.
- Handoff includes only the selected story/ledger/reference manifest and generated viewer; it does not publish or silently copy source files.
- Existing curated views, diagram selection/drag, exact Undo/Redo, instance isolation and lifecycle cleanup remain covered.

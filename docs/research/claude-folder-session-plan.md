# Claude conversation through a local folder

Status: implemented in the isolated worktree; automated protocol, helper and
editor round trips pass. Native browser folder permission and the user-visible
Claude Monitor conversation remain live acceptance gates. No merge authorized.

The instrumented editor prototype was built while those interactive checks await
the user. This does not count as completing Phase 1: substituted directory handles
and a simulated agent cannot establish native permission, Monitor availability,
model response time, or renewal.

## Objective and authorization

Let a business user talk to their own Claude Code session inside Flowview and
build a source-grounded visual story using the current hld-to-page skill. The
user opens the hosted HTTPS workbench, selects a dedicated local folder, and pastes fully visible connection
instructions into a Claude session they control. The browser and Claude exchange
data through that folder. An engineer can later continue from the saved story,
decisions, assumptions, and evidence.

Work only on `codex/claude-folder-session` in the current isolated Codex worktree.
Base: `dbb350de906929ae05f1cf8208358a361045de9f` (main, September 27, 2026),
which includes the story-time skill update in PR #245.

**Do not merge.** A merge requires a later explicit instruction from Chuck.
Phases are delivery and evidence checkpoints, not requests for repeated approval.
This plan does not authorize silently substituting a local server, a hidden
agent process, broader permissions, or a different agent when a gate fails.

## Experiment boundaries

- Claude has no browser tools, DOM, screenshots, navigation, or browser script
  execution. Flowview supplies authored document and selection data.
- No local HTTP/WebSocket server, listening port, agent SDK backend, or credential
  handling in Flowview. Claude uses its existing visible session and account.
- A small inspectable watcher process is allowed inside that session. It watches
  session files and emits notifications; it does not execute file contents or
  launch additional agents. Permission requests remain in the Claude session.
- Connection instructions show the folder, the exact watcher command, what is
  shared, what Claude can write, and how to disconnect. No opaque downloaded
  bootstrap command or permission bypass.
- The browser receives access only to the chosen session folder. This does not
  sandbox Claude or reduce permissions already granted to its session.
- First target: one user, one visible desktop Chrome editor, one Claude Code
  session, one project, and a local disk folder. Network/synced folders and
  concurrent collaboration are outside this experiment's guarantees.
- Primary entry: the hosted HTTPS workbench in its own browser tab. The existing
  static host serves application assets only; conversation and document exchange
  use the user-selected local folder, with no new agent backend or localhost
  service. Downloaded HTML is a secondary compatibility target, tested separately.
  Cross-origin embeds are outside the initial scope; offer opening the workbench
  in its own tab instead. Do not quietly add a localhost helper if a target fails.
- Folder permission belongs to the workbench origin. Explain the access being
  granted, handle reauthorization after reload/origin changes, and verify that
  session content is not uploaded by the folder transport. Claude's own model
  processing remains part of the user's existing Claude session.
- Preserve the existing optional HTTP/file helper and ordinary editor behavior.
  SSO, hosted agents, other agent providers, and token-by-token reply streaming
  are later work.

## Known foundation and unresolved risks

Existing code already provides authored source/selection snapshots, revision
checks, deferred application during document editing, validation, and one Undo
per accepted proposal (`src/workbench/agent-session.js` and the builder wiring).
`tests/agent-session.test.js` and the existing browser agent-session contract
cover important behavior, but currently use a local HTTP helper.

The browser adapter already exposes `showDirectoryPicker` for export. Persistent
bidirectional folder exchange, chat, and agent wake-up are new.

Do not assume:

1. That API presence proves the real folder picker and read/write permissions
   work on the target hosted origin or from downloaded HTML. Test both separately.
   The earlier local-file system-Chrome probe timed out; it established neither
   support nor lack of support and does not block testing the hosted entry.
2. That a changed file automatically wakes an idle model. A watcher must deliver
   an event into the active Claude session. Monitor availability and renewal need
   a live test; documented watches have deadlines, at most 30 minutes.
3. That the browser exposes an absolute path for a selected folder. Design and
   test a single explicit path handoff (for example dragging CONNECT.md into the
   Claude session); never invent a path from the folder name.
4. That timestamps alone can distinguish a duplicate, stale, or incomplete
   message. Use session, project, request, proposal, and revision identities.
5. That the current helper's single-owner lock translates directly to files.
   It is serialized by a server today; browser ownership must be established
   separately or the experiment must refuse an ambiguous connection.

## Phase 1 — Prove the two hard boundaries

Build a minimal disposable probe before adding a conversation UI.

Browser proof:

- Open an HTTPS-hosted probe in the actual target browser, invoke the real folder
  picker from a user action, and grant read/write access to a fresh session folder.
  Keep the experimental build isolated from the production deployment. Also
  test downloaded HTML as a separate compatibility result.
- Read a file changed by a separate local process; write a file that process can
  read. Test close/reopen and browser reload permissions, external replacement
  of files, cancellation, and revoked access.
- Verify that message/document exchange needs no localhost connection, agent
  backend, or fetch access to arbitrary file URLs. The existing HTTPS static host
  may serve application assets. Record browser version, origin, permission
  persistence, network activity, and manual steps.

Claude proof:

- Supply a complete readable connection prompt and a fixed watcher script for a
  visible Claude Code session. Preserve normal permissions and exclude browser
  access; inspect the tools actually available rather than trusting the prompt.
- Send three sequential requests through files. Include a follow-up that depends
  on the previous reply, and one after an idle period.
- Confirm Claude wakes, reads the request, writes a reply, and waits again without
  model turns on every empty poll. Test watcher deadline/renewal, Claude busy,
  stop, and restart. Do not claim automated renewal until observed.
- If Monitor is unavailable, test an explicitly disclosed bounded wait command
  in the same session. If neither can support useful conversation reliably,
  report that limitation before building the full UX.

Measure transport separately from model work. Start with 250 ms browser reads
and 250–500 ms watcher checks. Record request publication, watcher detection,
Claude acknowledgement, reply publication, and editor receipt. A candidate gate
is p95 detection below one second for each direction over 50 deterministic small
file exchanges in the foreground, plus the live Claude conversation. These are
targets to measure, not current performance claims or CI timing assertions.

Exit: a recorded file round trip from the hosted workbench with no local server
or agent backend, and a working visible Claude
conversation, including honest reconnect/permission limitations. Keep the proof
scripts and a compact evidence report in ignored `.local/claude-folder-proof/`.

## Phase 2 — Define and implement the folder protocol

Separate the document exchange from its transport. Reuse revision and proposal
application behavior where possible; keep HTTP-specific ownership and retries in
the existing adapter. Add a directory-handle adapter with injected filesystem and
timer capabilities for deterministic tests.

Define a versioned manifest and fixed ownership for these logical records:

| Record | Writer | Purpose |
| --- | --- | --- |
| Session manifest / CONNECT.md | Editor | Session identity, protocol, capabilities, visible handoff |
| Document snapshot | Editor | Exact source, revision, authored selection, active view/path/step |
| Request | Editor | User message, request ID, project and context identity |
| Reply / progress / question | Claude | Displayable conversation content tied to a request |
| Proposal | Claude | Complete JSON source and the revision it was based on |
| Proposal result | Editor | Applied, unchanged, rejected, or outcome needing reconciliation |
| Watcher heartbeat | Watcher | Listener liveness, distinct from Claude processing a request |
| Story plan / decisions | Claude | Reviewable authoring artifacts for the next person or agent |

Choose the physical layout after the Phase 1 filesystem tests. Prefer immutable
message/proposal files and explicit completion records over both sides appending
to a shared JSON file. Do not depend on native-file rename being available through
the browser API. Reacquire file handles as needed after external replacement.
Specify byte limits, parsing, sequence/deduplication, acknowledgements, retention,
and partial-write behavior. Use a new session directory by default; no destructive
cleanup of arbitrary folders selected by the user.

Use non-overlapping async polls. Write document snapshots on change with a short
debounce, flush context before sending a request, and keep liveness records small.
Do not reread or rewrite the entire transcript and document at every tick.

Exit: deterministic tests cover partial/malformed data, duplicate delivery,
missing files, external replacement, wrong session/project, stale revision,
permission loss, read/write failure, disconnect, disposed callbacks, and ownership
conflicts. A simulated agent can update the real editor with one Undo and Redo.

## Phase 3 — Make connection and conversation usable

Add a local-folder option to the existing Build with your agent entry point and
an editor conversation panel. Keep the conversation separate from the authoring
JSON. Reuse the current blank-project route so users can connect before describing
a new story.

- Pair through Choose folder → read/copy instructions → paste into Claude.
- Clearly handle the absolute-path handoff and cancelled folder permissions.
- Show disconnected, waiting for Claude, listening, queued, working, waiting for
  an answer, and reconnect-needed states only when evidence supports them.
- Send messages and display agent replies/questions/progress as text, never
  executable HTML. Bind every displayed response to its request/project.
- Include the selected scene/object as visible context. Freeze that context when
  Send is clicked; later selection changes do not retarget the request.
- Keep one active agent request and make any waiting message explicit. Disable
  duplicate Send actions. Defer concurrent-request orchestration.
- Keep chat-composer focus from blocking an accepted diagram proposal, while
  retaining deferral for real document edits, drags, and dialogs.
- Disconnect stops sharing and acceptance. A cooperative Stop request must not
  claim to kill Claude or undo tool actions; the user can interrupt in Claude.
- Reload/resume must reconcile requests and proposal outcomes before resending.
  Never silently replay a turn or an edit with an unknown outcome.

Exit: a user completes connection with no terminal setup outside their existing
Claude session, answers a question in the editor, receives a live change, and
undoes it. Unsupported browsers show a clear capability explanation.

## Phase 4 — Carry the improved authoring workflow into the session

Use the current hld-to-page skill and matching renderer/validator references as
the single authoring source. Record their revision in the session. Do not replace
the tested worksheet with a shorter independent prompt.

- Default the guided connection to Story level. Carry known audience and story
  answers forward; ask only unresolved questions in the editor conversation.
- Respect questions-before-new-story, worksheet-before-spec, shared story time,
  physical versus reported state, evidence, and self-audit requirements.
- Add a focused folder-session delivery adapter: questions and replies go to the
  outbox, diagram edits use proposals, and the reviewable worksheet/ledger persist
  in the session folder. Small edits still avoid a full question batch.
- Keep business questions in plain language. Preserve technical assumptions,
  illustrative values, missing evidence, and engineering follow-ups in the ledger.
- Run the existing validator and state-walk checks through disclosed local tools
  in Claude's session. Do not give Claude browser access for visual QA; report
  visual inspection separately from structural/semantic checks.
- Save a coherent project handoff containing the spec, story plan, answers,
  decisions, evidence/gaps, and check results. Keep it independent of Claude's
  private conversation storage. A new agent/person must be able to continue.
- Have an engineer enrich the same story using views/detail mappings and existing
  authored identities. Surface contradictions between implementation evidence
  and the agreed story instead of silently changing the intended outcome.

Exit: a business-oriented brief produces a usable story and saved plan, a follow-up
changes the intended moment, and a fresh session can identify and continue the
engineering work from those artifacts.

## Phase 5 — Rehearse, harden, and deliver without merging

Use a fictional business brief with enough evidence to establish outcomes, for
example a customer retaining a local recording during an internet outage. Do not
invent cloud or notification behavior to make the demonstration feel complete.

Rehearse the full path from the hosted HTTPS workbench: connect, explain story, answer questions, build, select a
moment, revise, Undo/Redo, save, disconnect, reload, reconnect, and engineering
continuation. Exercise the failures likely to occur in a live demonstration:

- User edits while Claude works; stale proposal is rejected and reconciled.
- Chat retains focus while a diagram edit is accepted.
- Permission revoked, folder missing, editor hidden/asleep, or watcher expired.
- Claude closes, pauses at permission approval, or finishes a reply after a
  disconnect/project change.
- Duplicate/out-of-order events, malformed/oversized source, rendering failure,
  two tabs, and reload after publication but before acknowledgement.

Run focused protocol/session/skill tests, rebuild with `python3 tools/build.py`,
and run the relevant required browser contracts using the repository's pinned
Chromium. For controls that require a native folder picker, pair automated tests
with a recorded manual test in the actual supported browser; a fake directory
handle alone is not proof. Broaden to existing Node/Python and build gates when
shared source assembly, session, or skill behavior changes.

Deliver the experiment branch, runnable editor, visible connection instructions,
sample story and handoff, measured latency report, test results, and known limits.
An optional draft PR may collect the result, but do not merge or enable auto-merge.

## Suggested change boundaries

Keep each phase reviewable as a local commit or small group of commits:

1. Feasibility report and inspectable watcher/probe.
2. Protocol model, folder transport, and deterministic tests.
3. Pairing/conversation UI and real editor/browser coverage.
4. Skill adapter and saved story handoff.
5. Rehearsal fixes, operating instructions, and verification evidence.

Likely touch points: `src/workbench/agent-session.js`, new focused protocol/folder/
conversation modules, builder lifetime/project wiring, welcome UI, workbench CSS
and skeleton, `src/source-bundles.json`, focused tests, a fixed watcher under
`tools/`, and a narrowly scoped skill reference. Avoid putting filesystem I/O,
conversation rendering, and agent lifecycle policy into one controller.

## Progress

- [x] Inspect existing exchange, editor session, welcome, browser adapter, and tests.
- [x] Create experiment branch from current remote main in an isolated worktree.
- [x] Record phases, gates, constraints, and no-merge instruction.
- [ ] Phase 1: live browser and Claude feasibility evidence.
- [ ] Phase 2: folder protocol and transport.
- [ ] Phase 3: connection and editor conversation.
- [ ] Phase 4: skill workflow and durable handoff.
- [ ] Phase 5: demonstration, recovery checks, and delivery.

## References checked during planning

- `docs/local-agent-session.md`
- `.claude/skills/hld-to-page/SKILL.md` at the experiment base
- `docs/workbench-modules.md` and `tools/browser-tests/README.md`
- Browser folder access: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- Claude Monitor: https://code.claude.com/docs/en/tools-reference#monitor-tool
- Claude scheduling limits: https://code.claude.com/docs/en/scheduled-tasks

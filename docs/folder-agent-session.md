# Build with your agent through a shared folder

This experimental workbench connection is designed for a hosted HTTPS page in a
desktop Chrome/Edge tab. It needs no local server, agent backend, API key, or
browser access for Claude. The user owns the visible Claude Code session and
its permissions. The browser asks permission for the selected folder. This does
not sandbox Claude or change access already granted to that session.

## Connect

Choose **Build with Claude** and then **Work in your agent** (copy/paste,
recommended) or **Talk here with Claude** (embedded conversation). Both use the
same shared folder and preview/commit gate. Copy/paste requires no Monitor;
Monitor is needed only for direct Send and embedded conversation. In an existing project, use
**Message agent** to select nodes and references, or open the **Agent** tab. Start with the working/project folder of the user's
existing Claude session. If its location is unclear, ask Claude to report its
current working directory; do not guess a Documents or Downloads path.

Select **Choose Claude’s exact working folder** and pick that directory itself,
not its parent or an existing exchange subfolder. The visible folder diagram
marks the working folder as the selection and the exchange as automatically
created. Flowview
creates a new `flowview-session-…` exchange subfolder there. It leaves the project
files and any older exchanges in place. Read and paste the connection instructions
into that same Claude session. They name `./flowview-session-…` relative to its
working directory and include both connection identities for verification.

The browser cannot discover Claude's working directory or expose the selected
folder's absolute path. Claude resolves the exact relative location from its own
working directory. If it is missing or its identities differ, it stops and reports
the working directory for corrected pairing; it does not search disk or invent
another location. This uses the agent's working folder, not its internal chat or
account storage. The browser's permission covers the selected folder, while the
exchange code accesses only its dedicated subfolder.

For the live proof, start a visible Claude Code session with Chrome integration
and external MCP servers disabled. The local CLI supports:

```sh
claude --no-chrome --strict-mcp-config --mcp-config '{"mcpServers":{}}' --tools 'Bash,Read,Write,Edit,Glob,Grep,Monitor'
```

This limits the offered tools without approving their use automatically. It is
not an operating-system sandbox for Bash. Keep ordinary permission prompts;
inspect the session's tool list before claiming browser access is unavailable.
Then paste the visible connection instructions.

For direct Send or embedded conversation, Claude reads the helper before starting it with its Monitor tool. The helper
unpacks the version-matched authoring kit and watches request/result files. It
does not open ports, make network requests, execute file contents, or launch
subprocesses. Python 3 runs the helper; Node runs the skill's existing validation
and state-walk tools. Claude Code Monitor availability depends on its environment;
if unavailable, report this limitation instead of changing permissions.

The editor shows listener liveness separately from a pending message. A fresh
listener heartbeat means the watcher is running, not that the model has begun
or completed the request. Monitor watches expire; the visible instructions ask
Claude to renew a 25-minute watcher while the same connection is active. Delivered
event IDs are retained across normal renewals; agents also deduplicate IDs in
case a process fails between notification and recording delivery. Closing Claude
stops its watcher; disconnect in the workbench to end the folder pairing. Normal
permission prompts are handled in Claude.

## Communicate

**Work in your agent:** keep questions, answers, permissions and interrupts in
the native agent app. **Message agent** lets you select nodes and code/service
references independently, add file paths or URLs, and inspect the message before
copying. Copy registers a `delivery: clipboard` request and puts its identity in
the pasted message; Monitor deliberately does not emit it as a request event.
The user must paste it to start work. The external setup prompt unpacks the kit
with `prepare`; an optional Monitor can enable direct Send later. Clipboard refusal selects the prepared text
for manual copying. **Send to Claude** explicitly dispatches through Monitor.
A connected folder shares the full story; message checkboxes select focus, not
folder access. `replySurface: agent` keeps conversation in the native app even
when a message is sent directly. Use a helper `reply` at completion to release
the request. Do not finish a request while its proposal is awaiting review.
Direct Send has a 16,000-character message limit. Larger copied messages retain
their complete text on the clipboard and register a small placeholder telling
the agent to follow the pasted message. They do not inflate the shared transcript
with repeated full-source copies.

For a new request spoken directly in the native conversation, use
`python3 /path/to/session/folder-agent.py begin --text 'The requested change'`.
The workbench must acknowledge it before submitting work. This is available only
in the external workflow. An unacknowledged request expires after eight seconds
and is withdrawn, including if a slow file write completes after that deadline.
Keep the workbench active while starting a request; if its browser is suspended,
return to the tab before retrying. Finish or stop an existing active turn before
starting another. Continue discussion under the active
request while resolving questions. **Stop accepting this turn** cancels acceptance
here; interrupt the agent itself in its app if needed.

**Talk here with Claude:**

Agent is a floating window over the diagram canvas. **Focus** summarizes the
selection in one line; expand it to inspect every selected item and the current
view/path/step before sending. Expand **Sent with…** beside a sent
message to see its frozen receipt. The complete story is shared with Claude,
with the selection identifying the focus. Selection changes cannot silently
retarget an already sent request. The toolbar keeps Claude's activity state
visible while the Agent window is closed.

Send one message at a time from the editor. Each request includes the authored
selection, current path/view/step, and the chosen Story detail level. Choose detail
during connection setup; afterward, open the compact **Detail: Story** control
to change it, for example to Engineering when enriching the same story.
Selection or detail changes after Send do not change
that request. The editor shows a timestamped **Claude activity** feed while a
request is pending and keeps it visible with the final answer. It distinguishes
waiting for Claude's first acknowledgment from receiving an update. After 30
seconds without an update, it says so; a watcher heartbeat alone never claims
the model is working. If the watcher stops, the editor reports that separately.
The status icon and label distinguish waiting, working, permission needed,
review-ready and finished states. Incoming output follows automatically while
you are at the latest update. Scroll up to read without being pulled back; use
**New output · Jump to latest** to resume following the conversation.

Claude must immediately acknowledge each request with `progress`, then report
each meaningful phase (reading, planning, editing, validating), errors, and any
upcoming permission prompt. For longer work, send an update at the next tool
boundary after roughly 20 seconds. Use brief observable actions and results,
not private reasoning. For embedded conversation, send all questions, blockers and final answers through
`reply` so the user can answer in the editor. Its ordinary terminal text is not
mirrored automatically. Permission approvals still take place in Claude.

Progress is retained as up to 100 updates (with a 512 KiB history budget) for the
current request, so rapid updates survive between browser polls. The UI retains
the latest turn's activity until the next message. It renders all text literally.
The browser reads this activity only from the selected exchange folder; it does
not read terminal scrollback or unrelated Claude conversations.

For a new story, follow the current hld-to-page worksheet and ask unresolved story
questions before authoring. Store the reviewable worksheet, operator answers,
assumptions, evidence and engineering gaps in `story.ledger.md`. Keep technical
questions appropriate to the selected audience. `authoring/` is the version-matched
VIZ directory. It includes the skill, references, recipes, validator, compatibility
stamper and state walker. Browser checks remain separate and must not be claimed.

Claude writes the complete updated document to `candidate.spec.json` for each
edit. The helper supports these commands (run from anywhere, using its absolute path):

```sh
python3 /path/to/session/folder-agent.py watch --minutes 25
python3 /path/to/session/folder-agent.py progress --request REQUEST_ID --text 'Reading the customer story.'
python3 /path/to/session/folder-agent.py progress --request REQUEST_ID --file progress.txt
python3 /path/to/session/folder-agent.py reply --request REQUEST_ID --file answer.txt
python3 /path/to/session/folder-agent.py propose --request REQUEST_ID --revision BASE_REVISION --file candidate.spec.json --summary "What changed"
```

Text/candidate input files must be regular files directly inside the session
folder. `progress` and `reply` also accept `--text` for short updates; use normal
shell-safe quoting. Keep the base revision read **before** planning the edit. The workbench retains recent baselines and the active request baseline. It can
merge independent changes from an older revision in this connection. Reconcile
conflicts against the latest state; never substitute a fresh revision onto an old
replacement. Wait for result.json before submitting
another proposal or sending the final reply. All authored document replacements
are validated by the editor and accepted through its ordinary Undo history.

## Preview and commit

Every proposal waits behind **Preview Agent Updates**, a prominent banner that
is available with the Agent panel closed. The full viewer lets the user switch
between proposed and current state without changing the editor. **Commit update**
applies the reviewed version as one undoable local change; it is not a Git commit.
If the document or proposal changes during review, approval is invalidated and
the preview refreshes before another commit is possible. Closing the preview
keeps it pending; discarding returns a rejection.
If the editor is busy when Commit is clicked, that attempt does not leave an
approval queued for later: review and click Commit again when it is ready.

The editor performs a conservative three-way merge of the baseline, current
source and proposal. Disjoint object fields and collections with unique IDs
merge; unchanged section headings and tab labels identify legacy containers.
Same-field edits, delete-versus-edit, ambiguous ordering, unknown baselines and
invalid combined references require a revision. Arrays without stable identities
are treated as a unit. Nothing partially applies. The combined document is
validated and must render before the commit button is enabled.
Once a proposal reaches review, its planning baseline is retained even if
continued human edits fill the recent-revision cache.

**Agent update needs attention** offers **Copy feedback for your agent** with
conflicting paths and instructions to reread the latest shared story. Copying
also returns the rejection through `result.json`; after a manual clipboard
fallback, **Return for revision** does that explicitly. Current edits remain intact.

## Files and ownership

| File | Writer | Meaning |
| --- | --- | --- |
| session.json | Editor | Protocol, persistent session ID, connection ID |
| CONNECT.md / README.md | Editor | Fully visible session instructions |
| authoring-kit.json / folder-agent.py | Editor | Bundled authoring references and inspectable helper |
| state.json | Editor | Exact source, revision, project and authored selection/view context |
| editor.json | Editor | Connection identity, connected flag and heartbeat timestamp `at` |
| agent-request.json | Agent helper | Expiring native-conversation request, acknowledged by the editor |
| request.json | Editor | One outstanding user message with ID and frozen selection/view context |
| transcript.json | Editor | Last 100 user/assistant messages for handoff |
| story.spec.json | Editor | Latest exact source checkpoint, including recoverable invalid handwriting |
| listener.json | Watcher | Watcher identity and heartbeat; not model completion |
| progress.json / reply.json | Claude helper | Bounded progress history / final text for the current request |
| proposal.json | Claude helper | Full replacement JSON, request ID and base revision |
| result.json | Editor | Applied/unchanged/rejected acknowledgement and resulting revision |
| story.ledger.md | Claude | Saved worksheet, answers, evidence, assumptions and open work |

Agent-authored envelopes must match both identities in session.json and the
current request ID. `editor.json` must say connected with an `at` timestamp less
than 15 seconds old. Source freshness is established by revision, not time.
Files are data, never executable UI. Replies render as plain text. The helper
publishes via temporary files and rename; browser writes become visible when
their writable stream closes. Readers reacquire files and retry incomplete JSON.

## Disconnect and resume

Disconnect stops sharing and accepting changes; it does not erase the folder or
kill arbitrary work in Claude. Interrupt Claude there if needed. The watcher
exits on a disconnected editor or a changed connection identity. Browser closure
or sleep may leave a stale heartbeat; stale requests are not emitted.

Use Claude in the original working folder (or the exchange folder itself).
Choose the prominent **Resume from folder** button at the top of connection
setup and select the saved `flowview-session-…` subfolder itself. The editor
loads its saved story and conversation automatically; no separate file opening
or story-choice step is needed. A different current draft is kept in
**Earlier drafts**. The resumed story starts a fresh Undo/Redo history, so Undo
cannot switch back to another file. Resume refuses an
active editor lease, a changed folder snapshot, or a draft edited while the
folder is being selected. If the earlier draft cannot be preserved, it stops
without replacing it. Resume starts a new connection identity, restores the conversation, refreshes the helper
and authoring kit, and requires new connection instructions in Claude. These
files are refreshed only after the resume is accepted. Old pending work is not replayed automatically.
Sessions created with the retired operation API need this refresh and fresh
connection instructions before continuing with complete document proposals.
Reload the updated workbench, choose **Resume from folder**, paste its fresh instructions
into Claude, and start the new watch. That watch refreshes the bundled skill and
removes retired API guidance before emitting requests. It does not erase earlier
messages from the Claude conversation.
Use the saved ledger to continue with another person or agent.

The initial experiment supports one editor/Claude session on local disk. Avoid
simultaneously connecting the same session from different origins or browsers.
The folder transport makes no network requests and does not upload session data;
Claude still processes the supplied material through the user's account. Hosted
application code receives the folder permission, so choose a dedicated folder
and a workbench deployment you trust. Cross-origin embeds are not the initial
target: open the workbench in its own tab.

# Talk to Claude through a local folder

This experimental workbench connection is designed for a hosted HTTPS page in a
desktop Chrome/Edge tab. It needs no local server, agent backend, API key, or
browser access for Claude. The user owns the visible Claude Code session and
its permissions. The browser asks permission for the selected folder. This does
not sandbox Claude or change access already granted to that session.

## Connect

Choose **Build it with your agent → Start with Claude**, or the **Agent** tab
in an existing project. Start with the working/project folder of the user's
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

Claude reads the helper before starting it with its Monitor tool. The helper
unpacks the version-matched authoring kit and watches request/result files. It
does not open ports, make network requests, execute file contents, or launch
subprocesses. Python 3 runs the helper; Node runs the skill's existing validation
and state-walk tools. Claude Code Monitor availability depends on its environment;
if unavailable, report this limitation instead of changing permissions.

The editor shows listener liveness separately from a pending message. A fresh
listener heartbeat means the watcher is running, not that the model has begun
or completed the request. Monitor watches expire; the visible instructions ask
Claude to renew a 25-minute watcher while the same connection is active. Closing
Claude stops the connection. Normal permission prompts are handled in Claude.

## Communicate

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
not private reasoning. Send all questions, blockers and final answers through
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
shell-safe quoting. Keep the base revision read **before** planning the edit. The helper
rejects stale publication. Reconcile against the latest state; never substitute
a fresh revision onto an old replacement. Wait for result.json before submitting
another proposal or sending the final reply. All authored document replacements
are validated by the editor and accepted through its ordinary Undo history.

## Files and ownership

| File | Writer | Meaning |
| --- | --- | --- |
| session.json | Editor | Protocol, persistent session ID, connection ID |
| CONNECT.md / README.md | Editor | Fully visible session instructions |
| authoring-kit.json / folder-agent.py | Editor | Bundled authoring references and inspectable helper |
| state.json | Editor | Exact source, revision, project and authored selection/view context |
| editor.json | Editor | Connection identity, connected flag and heartbeat timestamp `at` |
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
Open `story.spec.json` with the ordinary workbench file opener, then use
**Resume a session folder** and choose the saved session subfolder itself. Resume
requires the exact saved source and refuses a recent active editor lease. It
starts a new connection identity, restores the conversation, refreshes the helper
and authoring kit, and requires new connection instructions in Claude. These
files are refreshed only after the resume is accepted. Old pending work is not replayed automatically.
Sessions created with the retired operation API need this refresh and fresh
connection instructions before continuing with complete document proposals.
Reload the updated workbench, resume the exchange, paste its fresh instructions
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

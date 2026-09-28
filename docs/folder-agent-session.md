# Talk to Claude through a local folder

This experimental workbench connection is designed for a hosted HTTPS page in a
desktop Chrome/Edge tab. It needs no local server, agent backend, API key, or
browser access for Claude. The user owns the visible Claude Code session and
its permissions. The browser asks permission for the selected folder. This does
not sandbox Claude or change access already granted to that session.

## Connect

Choose **Build it with your agent → Start with Claude**, or the **Agent** tab
in an existing project. Choose a folder: Flowview creates a new
`flowview-session-…` subfolder without replacing other files. Read and copy the
connection instructions into Claude. Supply its absolute path, or drag the
subfolder's CONNECT.md into Claude; browsers do not expose its absolute path.

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

Send one message at a time from the editor. Each request includes the authored
selection, current path/view/step, and the chosen Story detail level. Change that
level to Engineering when enriching the same story. Selection or detail changes after Send do not change
that request. Claude explicitly writes progress, questions and final replies
through the helper; its ordinary terminal text is not mirrored automatically.

For a new story, follow the current hld-to-page worksheet and ask unresolved story
questions before authoring. Store the reviewable worksheet, operator answers,
assumptions, evidence and engineering gaps in `story.ledger.md`. Keep technical
questions appropriate to the selected audience. `authoring/` is the version-matched
VIZ directory. It includes the skill, references, recipes, validator, compatibility
stamper and state walker. Browser checks remain separate and must not be claimed.

The helper supports these commands (run from anywhere, using its absolute path):

```sh
python3 /path/to/session/folder-agent.py watch --minutes 25
python3 /path/to/session/folder-agent.py progress --request REQUEST_ID --file progress.txt
python3 /path/to/session/folder-agent.py reply --request REQUEST_ID --file answer.txt
python3 /path/to/session/folder-agent.py propose --request REQUEST_ID --revision BASE_REVISION --file candidate.spec.json --summary "What changed"
```

Text/candidate input files must be regular files directly inside the session
folder. Keep the base revision read **before** planning the edit. The helper
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
| progress.json / reply.json | Claude helper | Text for the current request |
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

Open `story.spec.json` with the ordinary workbench file opener, then use
**Resume a session folder** and choose the saved session subfolder itself. Resume
requires the exact saved source and refuses a recent active editor lease. It
starts a new connection identity, restores the conversation, and requires new
connection instructions in Claude. Old pending work is not replayed automatically.
Use the saved ledger to continue with another person or agent.

The initial experiment supports one editor/Claude session on local disk. Avoid
simultaneously connecting the same session from different origins or browsers.
The folder transport makes no network requests and does not upload session data;
Claude still processes the supplied material through the user's account. Hosted
application code receives the folder permission, so choose a dedicated folder
and a workbench deployment you trust. Cross-origin embeds are not the initial
target: open the workbench in its own tab.

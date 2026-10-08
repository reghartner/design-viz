# Diagram folders and agent collaboration

A diagram folder is the durable project. The spec and coverage ledger live together
and can be reopened with another agent or conversation. A connection is temporary;
users do not need to create or manage a separate session folder.

## Choose how to work

On the homepage, **Build with Claude** first makes the starting point explicit:
**Start a new diagram** opens a blank project, while **Continue** names the current
or saved draft. **Open an existing diagram** is shown when there is no draft.
The setup dialog also offers **Start new diagram** so you can leave a previous
connection without hunting through the editor. Starting new disconnects the old
connection, preserves the draft in **Earlier drafts**, and requires a fresh folder;
it never reopens or overwrites a previous folder's spec, ledger, or session.

Then choose where to have the conversation:

- **Work in your agent — Recommended.** Copy setup and messages with the current
  editor selection into an agent that can read local files. Questions, permissions,
  and interrupts stay in that agent app. The setup explicitly tells the agent
  not to start Monitor, a watcher, polling loop, or background listener.
- **Talk here with Claude — Beta.** Claude Code and its Monitor tool deliver
  questions and answers inside the workbench. Permission prompts and interrupts
  still happen in Claude.

Both choices use the same diagram folder and the same approval process. In the
approval preview, **Coverage ledger** starts collapsed and identifies whether it
changed. Expand it to read, scroll or resize its bounded reading area; switching
between Current state and Proposed state keeps it open. Collapsing it restores
the diagram space. Committing still saves the reviewed spec and ledger together.

In the editor, open **Agent** in the left rail. The panel has no workflow tabs.
When disconnected, it offers **Continue [title] / Reopen diagram folder** for a
remembered connection and **New Connection** to open setup. Setup chooses
**Copy & paste** (the default) or **In workbench — Beta** and the diagram folder.
When connected, the panel shows the connection status, folder and artifact names,
and only that method's controls. The composer and copy actions are hidden until
a folder is connected. Reopening a remembered folder keeps its connection method;
disconnect and use New Connection to choose a different method.

Copy & paste shows **Shared folder ready** once the folder is connected; it does
not wait for a Claude listener. An active request says **Continue in your agent**.
Conversation and live progress stay in the agent app. The panel keeps update
previews, conflict feedback and collapsed **Recent diagram updates**; there is no
chat feed or empty conversation area. The Beta connection retains its conversation feed
and requires its own explicit Monitor connection.

## Open or create a diagram folder

The setup first asks whether you are adding an agent to the open diagram,
continuing an existing agent build, or starting a new diagram with an agent.
Adding an agent selects the folder containing the existing spec and ledger, or
where an agent-working copy should live. Continuing selects the durable diagram
folder used by the earlier build; Flowview finds `.flowview-agent` inside it.
Starting new requires an empty folder. A different current draft is preserved in
**Earlier drafts**. Opening an existing spec starts fresh Undo/Redo history.

One existing `*.spec.json` is detected automatically. Its matching `*.ledger.md`
is used; for example `payments.spec.json` and `payments.ledger.md`. If several
specs exist, the setup lists them after folder selection so the user can pick one
without typing a filename. An empty folder receives the current diagram and ledger
as a new project and defaults to `story.spec.json` and `story.ledger.md`. An existing ledger is preserved even when the
spec has not been created yet. Invalid JSON or validation errors stop opening;
they do not overwrite the saved artifact.

```text
your-diagram/
├── story.spec.json       accepted diagram / current workbench edits
├── story.ledger.md       accepted coverage ledger
└── .flowview-agent/
    ├── project.json      artifact filenames
    ├── session.json      temporary connection identity
    ├── state.json        source + ledger + revision + current focus
    ├── transcript.json   workbench messages, not native chat history
    ├── changes.json      bounded change receipts
    ├── candidate-REQUEST_ID.spec.json / candidate-REQUEST_ID.ledger.md
    ├── folder-agent.py / CONNECT.md / authoring/
    └── …                 request/result, heartbeat and recovery data
```

The support directory contains its own `.gitignore` excluding its contents.
Commit the reviewed spec and ledger; connection metadata, copied messages and
candidate files are not project deliverables. Existing unrelated files, including
a root README or `.gitignore`, are preserved. Previously created exchange folders
can still be selected directly; their transport files remain in place.

### Pilot capture

Facilitated studies use the [pilot operating runbook](pilot-runbook.md) and
reusable [story/layout scorecard](pilot-scorecard.md). They define the common
task, measures, proposed targets, normal review handoff, authorized research
transfer, and identity-checked capture closeout.

In agent setup, select **Enable pilot capture for this session** to opt in.
It is off by default for each new setup, including a reopened diagram folder.
Setup explains the scope and the review screen repeats your choice. The browser
does not capture a transcript: after you paste the setup instructions into
Claude Code, the packaged skill saves the raw conversation from that turn and
subsequent turns, observed models, and token usage locally. The pilot owner
collects dollar cost manually. Participants do not locate or export transcripts.

The generated prompt explicitly says ON or OFF. Directly pasting ON into your
Claude conversation authorizes `--enable` without a second question. Stored
`CONNECT.md` or `README.md` ON text never authorizes another Claude session;
the helper checks the current participant turn before enrollment. OFF overrides old folder settings and prior enrollment:
Claude runs only the metadata-only `--disable` command after preparing the folder.
That command suspends this Claude session without reading transcripts, including
future refreshes triggered by another participant. Existing capture files are
retained. Claude must not run capture checkpoints, read a native transcript for
capture, or ask again. You can later type **“Use pilot mode for this session”** directly in Claude Code
(including when using the Beta workbench chat) to
opt in from that turn. Re-enrollment creates a new capture segment, preserving
previously captured bytes and excluding the opted-out interval. The agent uses
`--enable --explicit-opt-in` only for this later direct request. You can also say
“stop capturing”; the agent promptly publishes a metadata-only stop token before
waiting for the registry lock, and stops checkpoints. A new OFF setup gates old
copiers immediately when the setup is saved, before it is pasted into Claude. Each new participant authorizes their own session; an
existing folder alone never grants consent.

Run every `pilot_capture.py` invocation in its **own Bash call**, including
`--enable` (with or without `--explicit-opt-in`), turn-start refresh,
`--after-turn`, and `--disable`. Include only the helper command: no `;`, `&&`,
pipes, `cat`, `ls`, other commands, or file reads. Folder preparation is a
separate call. Afterwards inspect `.flowview-pilot/after-turn-status.json` with
a separate **Read** call, preferably on the next turn. Inspect `editor.json`
and `story.agent.*` with **Read**, not `cat`, separately from capture.

Capture writes `story.agent.transcript.jsonl` and `story.agent.usage.json` beside
the spec/ledger, and uses `.flowview-pilot/` for local session copies and status.
It appends capture ignore rules to the root `.gitignore` without removing existing
rules. These are local pilot artifacts; commit only the reviewed spec and ledger.
There is no central upload.
The helper keeps its managed ignore block last, so capture exclusions override
earlier negation rules without duplicating that block or removing unrelated rules.

The native JSONL is distinct from `.flowview-agent/transcript.json`, which keeps
at most 100 workbench messages and does not contain native agent reasoning/tool
history. Pilot capture preserves exact complete native lines from the participant's
current pilot turn onward, excluding earlier unrelated chat. The usage artifact
records the native byte/line boundary and participant-turn UUID so this slice
cannot be confused with an entire session. Each participant's pilot slice is retained
separately and included in the combined transcript; returning to a session does
not duplicate it. Separate subagent transcripts are outside this capture scope.

The agent checkpoints at entry and before each reply, and can schedule a bounded
final copy with a 45-second wait budget for the final response. It reports
the actual capture status and any gaps; a scheduled copy is not a verified copy.
No hooks, additional Claude session or permanent listener is installed. The next
turn refreshes all recorded sessions, including a previous participant's final
native writes. If no later checkpoint occurs, delayed writes can remain missing.
For the Beta route, a verified Monitor `flowview_request` is a participant turn;
its `flowview_result` is attached to the same request. Duplicate delivery is
deduplicated, and unrelated background, shell and local-command notifications
do not create turns. Verification uses this folder's session and connection IDs.

For a handoff to another machine, transfer the entire local diagram folder,
including its ignored `.flowview-pilot/` directory and capture artifacts, using
the authorized pilot handoff. Git alone does not transfer ignored captures.
Earlier sessions whose native sources are unavailable remain as exact saved
copies marked `archived_only`; their errors do not block the engineer's current
capture. Later native writes on the original machine cannot be refreshed here.
Without the full folder handoff, that earlier capture remains on its original
machine; the next participant's session cannot reconstruct it.
The usage artifact records observed models and token usage per participant turn.
The pilot owner collects dollar-cost figures separately from participants; the
packaged skill does not calculate or report them.
See the packaged [pilot instructions](../.claude/skills/hld-to-page/references/pilot-capture.md).

### Starting material

One `hld-to-page` skill shares this folder, evidence ledger and approval protocol
across four [use-case routes](../.claude/skills/hld-to-page/SKILL.md#choose-the-starting-point):
business story with engineer handoff, existing engineering flow, HLD, and
Honeycomb trace. Story and HLD authoring already share the worksheet/evidence
rules; the route guides make continuation and engineer enrichment explicit.
The Honeycomb route includes the local trace CLI/converter in the downloaded
kit. It requires trace data or an authorized connector; a trace URL alone does
not grant account access or provide the spans.

Copy the displayed instructions into the agent. The browser knows the folder name,
not its absolute path. The agent verifies the supplied connection IDs in that
folder's metadata. If it cannot identify the folder as its working directory or
a direct child, it asks for the full path instead of searching unrelated folders.
The chosen diagram folder need not be the agent's working directory.

## Author and review both artifacts

Maintain the coverage ledger throughout authoring: worksheet, operator answers,
evidence, coverage, decisions, illustrative assumptions, and open questions.
Preserve the existing spec and ledger, and read the parts a change depends on
before making it. A ledger is required for every proposed change, including a
ledger-only update.

Before publishing a registered request (Copy request, Beta Send, or native
`begin`), Flowview copies the request's exact spec and ledger into complete
candidate files in the support folder. `request.json` names them:

```json
"candidate": {
  "spec": "candidate-REQUEST_ID.spec.json",
  "ledger": "candidate-REQUEST_ID.ledger.md",
  "baseRevision": "REQUEST_REVISION"
}
```

The agent confirms `baseRevision` equals `request.revision`, then edits those
copies instead of regenerating unrelated source; ordinary file edits work. The
selection paths locate the edit, but they do not show that other parts are
unaffected. In the seeded copies, inspect every region the edit depends on,
including inherited state, neighboring steps and supporting ledger evidence. Do
not open the accepted files or all of `state.json` just to recreate the
candidates; read `state.json` only for context the request and candidates lack.
Full rereads of the current pair are for requests without `candidate` and for
stale, rejected or conflicting proposals. Update the ledger copy when
coverage, evidence or decisions change. Each request has its own filenames;
never write another request's candidates. Flowview never reseeds a pending
request's candidates.

A request without `candidate` uses the earlier flow: read
`.flowview-agent/state.json` immediately before planning, retain its revision,
and write complete `candidate.spec.json` and `candidate.ledger.md` files. While
connected, the agent must not directly overwrite either accepted artifact.
Validate the candidate spec with the bundled authoring kit, and reconcile ledger
claims with that spec. The helper does not grant browser access or establish
visual QA.

For a wholly new diagram, write semantic nodes, edges, panels and steps, then run
`node tools/arrange-spec.cjs --section <zero-based-section> <draft> <different-output>`
from the authoring kit (or checkout) and propose its output. The command handles
node placement, panel sizes and step controls; do not choose coordinates or
rectangles. Preserve existing layouts and routes during ordinary edits; a new
node uses `{id,side:"below",noSpread:true}`. Use `--rearrange` only when explicitly
requested. See `docs/auto-arrange.md` for one-time setup. Report tool results,
not visual QA or a browser button click.

If the agent's file reader cannot return the long `source` or `ledger` line, it
reads the state identity and revision, then the complete current spec and ledger
named in `project.json`, then rereads the state identity and revision. It uses
those files only when both reads match the active request and each other: Send
writes that exact valid pair, including valid edits not yet committed to Git,
before publishing the request. Otherwise the files do not prove the current
state, even at a stable newer revision: `state.json` is written before the pair,
and an invalid draft stays only in state. No older candidate substitutes; reread
current state and reconcile as for a stale revision.

```sh
python3 /path/to/diagram/.flowview-agent/folder-agent.py prepare
python3 /path/to/diagram/.flowview-agent/folder-agent.py propose \
  --request REQUEST_ID --revision BASE_REVISION \
  --file candidate-REQUEST_ID.spec.json --ledger candidate-REQUEST_ID.ledger.md \
  --summary "Describe the diagram and ledger changes"
```

Use the `request.candidate` filenames and `baseRevision`; a request without
`candidate` uses `candidate.spec.json`, `candidate.ledger.md` and the revision
read before planning. Candidate filenames are relative to the helper's folder. Spec limit: 4 MiB;
ledger limit: 256 KiB of nonempty UTF-8 text. The helper rejects symlinks,
nonregular files, and filename traversal. Metadata/protocol files are bounded
at 8 MiB; the recovery journal allows 20 MiB for escaped before/after copies of
both artifacts. Oversized handwritten artifacts are refused before replacing
the last saved pair.

**Preview Agent Updates** shows the proposed rendered diagram and full ledger,
with **Current state** and **Proposed state** controls. Change highlights start
on: Proposed marks added content in green and modified content in amber;
Current marks removed counterparts in red and modified counterparts in amber.
The compact legend reports the number of rendered section, node, edge, panel
and step changes in the selected state. Use **Highlights: On/Off** when the
unmarked rendering is easier to inspect. Highlights follow redraws, paths and
contained Explore navigation; they do not become spec data.

Topology exports and imports preview using the same frozen provider context as
the workbench. The JSON, change comparison and committed source retain authored
declarations; previewing does not copy provider nodes into your source.

Use **Full preview** to give a large diagram the complete viewport and collapse
the summary, ledger and JSON chrome. The state switch, highlight legend and
toggle, **Discard update**, **Commit update** and **Back to workbench** remain
available; **Standard preview** restores the supporting material. Explore stays
inside the preview area so you can navigate its paths, zoom and panels while
comparison and approval controls remain available. Preview navigation does not
edit the proposed source. Neither candidate is
accepted until **Commit update**. One Undo/Redo restores both. This saves local
artifacts; it does not make a Git commit. The agent should reread the accepted
pair after approval, especially after a merge, and submit a correction if the
ledger no longer describes the accepted diagram. Commit or publish only with
user authorization. A missing ledger is unfinished work, not a successful delivery.

Separate object fields and stable-ID items can merge against their original
revision. Overlapping changes, deletion/edit collisions, ambiguous ordering,
invalid combined specs, and incompatible ledger edits block approval. Ledger text
merges conservatively as a whole document. **Copy feedback for your agent** names
conflicts and releases the rejected proposal so the agent can revise it. After a
rejection, conflict or stale base, reread `state.json` for both current artifacts
and its revision, reconcile them into the candidate files without discarding
their edits, and submit a reconciled pair; never just put a new revision on an
old proposal. Later edits invalidate an earlier approval.

Incomplete or invalid handwritten JSON stays in the browser draft and shared state;
the artifact files retain their last valid pair until the JSON is repaired.
External edits to the accepted files while connected stop file synchronization
instead of being overwritten. Disconnect and reopen the folder to load those
changes. A write journal retains the previously approved pair across a partial
spec/ledger write. Reopening completes that pair only when files still match its
before/after versions; conflicting outside edits require reconciliation. This is
recoverable two-file publication, not a filesystem-wide atomic rename.

## Conversation and request lifecycle

After connecting a folder, select items and click **Copy for agent · N selected** at
the bottom left. It copies selection identifiers, references and view context
without opening Agent or requiring a message. **Copied** confirms success.
This action leaves your message draft and any active request alone; it creates
no request, seeds no candidates and sends nothing to Monitor. With no selection it is disabled.
If clipboard access is denied, Agent opens with the selected text for manual copy.

In **Agent → Copy & paste**, write the request in the shared message box;
include additional URLs or file paths there if useful. **Copy request** includes
your message, selected item identifiers and JSON paths, their evidence references,
view/path/step context and detail level. It does not include the complete source,
panel payloads or the contents of selected sections/documents. The agent edits
the request's seeded candidate copies in the shared folder after inspecting the
regions the change depends on. A connected folder is required to copy a request.

With a connected folder, Copy registers a request, seeds its candidate files and
copies its ID and candidate filenames with the message and context. Long clipboard messages use a bounded registration
placeholder while preserving the complete message on the clipboard. Clipboard
requests are not dispatched by Monitor. Recopy of the same pending request reuses
its ID. If clipboard permission is denied, the prepared request is shown for
manual selection and copying. Invalid JSON must be repaired before copying.

**Agent → In workbench — Beta → Send to Claude** requires both a connection and
a live listener. Direct Send is limited to 16,000 characters. Merely opening this
tab does not start Monitor; its setup must be chosen explicitly.

For a new request in the external agent conversation, use:

```sh
python3 /path/to/diagram/.flowview-agent/folder-agent.py begin --text "The request"
```

Wait for browser acknowledgement before working. `begin` waits for both the request
file and its accepted transcript entry; it withdraws after eight seconds without
acknowledgement. Keep the workbench visible, or retry after returning to it. One
request is active at a time. **Stop accepting this turn** cancels acceptance of
its proposals/replies; interrupt computation in the agent app itself.

In the Beta conversation, use `progress --request ID --text TEXT` to report meaningful work phases, errors,
and observable activity during longer work (roughly every 20 seconds at tool
boundaries). Progress retains up to 100 events with a 512 KiB budget. Use shell-safe
quoting or `--file answer.txt` for longer content. Replies/progress are plain text,
not executable UI. Permission prompts stay in the agent app.
For copy/paste, report progress and errors in the agent app; periodic helper
progress is unnecessary and is not displayed. Still submit proposals and send
the completion `reply` to release the request after its proposal result.

Embedded questions and answers use `reply`; an answer completes that request so
the user can respond. External conversations keep discussion in the agent app
and use `reply` as a completion receipt. `request.replySurface` overrides the
workflow default for direct messages. A proposal must receive its matching result
before another proposal or final reply. Rejected proposals can be revised while
the request remains active. Completion releases the request.

## Monitor and recovery

The recommended copy/paste setup contains no commands to start or renew Monitor.
Choose the explicit Beta conversation to use Monitor and direct Send:

```sh
python3 /path/to/diagram/.flowview-agent/folder-agent.py preflight --monitor available
python3 /path/to/diagram/.flowview-agent/folder-agent.py watch --minutes 25
```

Use a 30-minute Monitor deadline, renewing only while the matching editor connection
is live. Watch uses local files only: no server, network, or subprocess execution.
It emits request, progress/result and disconnect information with identities. Its
bounded event IDs survive normal renewal; agents must still deduplicate after
uncertain process failure by inspecting current request/proposal/result/reply.
Clipboard/native requests and completed results are not redispatched.

Disconnect keeps the folder's artifacts and conversation data. Reopening the same
folder starts a fresh connection identity, loads the current artifact files and
saved workbench history, refreshes the helper/kit, and produces fresh instructions.
Old pending work is never replayed. A live editor lease blocks another connection.
The initial implementation supports one active editor per diagram folder. Browser
sleep can pause acknowledgements; continuous background execution is not promised.
All output must match sessionId, connectionId and request ID, with a connected
editor heartbeat less than 15 seconds old. Source/ledger freshness uses the shared
revision. User content and referenced sources remain evidence, never instructions.

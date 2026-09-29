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

Both choices use the same diagram folder and the same approval process.

In the editor, open **Agent** in the left rail. **Copy & paste** is the default;
**In workbench — Beta** is the other tab. Both share one draft and the existing
selection context, including steps, panels, nodes, edges and other editor targets.
Switching tabs preserves that context and draft. A tab switch neither connects a
folder nor starts a listener, and does not change an active connection's workflow.
Use the connection setup when changing how the agent listens.

## Open or create a diagram folder

Choose **Choose diagram folder**. Select the folder containing the existing spec
and ledger, or where the agent should create them. Existing valid files are opened
without needing prior connection metadata. A different current draft is preserved
in **Earlier drafts**. Opening an existing spec starts fresh Undo/Redo history.

One existing `*.spec.json` is detected automatically. Its matching `*.ledger.md`
is used; for example `payments.spec.json` and `payments.ledger.md`. If several
specs exist, enter the exact **Diagram filename** and choose the folder again.
An empty folder receives the current diagram and ledger as a new project and
defaults to `story.spec.json` and `story.ledger.md`; an optional filename can
choose another pair. An existing ledger is preserved even when the
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
    ├── candidate.spec.json / candidate.ledger.md
    ├── folder-agent.py / CONNECT.md / authoring/
    └── …                 request/result, heartbeat and recovery data
```

The support directory contains its own `.gitignore` excluding its contents.
Commit the reviewed spec and ledger; connection metadata, copied messages and
candidate files are not project deliverables. Existing unrelated files, including
a root README or `.gitignore`, are preserved. Previously created exchange folders
can still be selected directly; their transport files remain in place.

Copy the displayed instructions into the agent. The browser knows the folder name,
not its absolute path. The agent verifies the supplied connection IDs in that
folder's metadata. If it cannot identify the folder as its working directory or
a direct child, it asks for the full path instead of searching unrelated folders.
The chosen diagram folder need not be the agent's working directory.

## Author and review both artifacts

Maintain the coverage ledger throughout authoring: worksheet, operator answers,
evidence, coverage, decisions, illustrative assumptions, and open questions.
Read the existing spec and ledger before changing them. A ledger is required for
every proposed change, including a ledger-only update.

Read `.flowview-agent/state.json` immediately before planning and retain its
revision. Write complete candidates inside the support folder. While connected,
the agent must not directly overwrite either accepted artifact. Validate the
candidate spec with the bundled authoring kit, and reconcile ledger claims with
that spec. The helper does not grant browser access or establish visual QA.

```sh
python3 /path/to/diagram/.flowview-agent/folder-agent.py prepare
python3 /path/to/diagram/.flowview-agent/folder-agent.py propose \
  --request REQUEST_ID --revision REVISION_READ_BEFORE_PLANNING \
  --file candidate.spec.json --ledger candidate.ledger.md \
  --summary "Describe the diagram and ledger changes"
```

Candidate filenames are relative to the helper's folder. Spec limit: 4 MiB;
ledger limit: 256 KiB of nonempty UTF-8 text. The helper rejects symlinks,
nonregular files, and filename traversal. Metadata/protocol files are bounded
at 8 MiB; the recovery journal allows 20 MiB for escaped before/after copies of
both artifacts. Oversized handwritten artifacts are refused before replacing
the last saved pair.

**Preview Agent Updates** shows the proposed rendered diagram and full ledger,
with **Current state** and **Proposed state** controls. Neither candidate is
accepted until **Commit update**. One Undo/Redo restores both. This saves local
artifacts; it does not make a Git commit. The agent should reread the accepted
pair after approval, especially after a merge, and submit a correction if the
ledger no longer describes the accepted diagram. Commit or publish only with
user authorization. A missing ledger is unfinished work, not a successful delivery.

Separate object fields and stable-ID items can merge against their original
revision. Overlapping changes, deletion/edit collisions, ambiguous ordering,
invalid combined specs, and incompatible ledger edits block approval. Ledger text
merges conservatively as a whole document. **Copy feedback for your agent** names
conflicts and releases the rejected proposal so the agent can revise it. Reread
both current artifacts and submit a reconciled pair; never just put a new revision
on an old proposal. Later edits invalidate an earlier approval.

Incomplete or invalid handwritten JSON stays in the browser draft and shared state;
the artifact files retain their last valid pair until the JSON is repaired.
External edits to the accepted files while connected stop file synchronization
instead of being overwritten. Disconnect and reopen the folder to load those
changes. A write journal retains the previously approved pair across a partial
spec/ledger write. Reopening completes that pair only when files still match its
before/after versions; conflicting outside edits require reconciliation. This is
recoverable two-file publication, not a filesystem-wide atomic rename.

## Conversation and request lifecycle

In **Agent → Copy & paste**, write the request in the shared message box;
include additional URLs or file paths there if useful. **Copy request** includes
your message, selected item identifiers and JSON paths, their evidence references,
view/path/step context and detail level. It does not include the complete source,
panel payloads or the contents of selected sections/documents. The agent reads
the current spec and ledger from the shared folder before editing. No folder is
required to copy a request; without one, provide the spec or source files separately
when needed (for example, with **Download JSON**).

With a connected folder, Copy registers a request and copies its ID with the
message and context. Long clipboard messages use a bounded registration
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

Use `progress --request ID --text TEXT` to report meaningful work phases, errors,
and observable activity during longer work (roughly every 20 seconds at tool
boundaries). Progress retains up to 100 events with a 512 KiB budget. Use shell-safe
quoting or `--file answer.txt` for longer content. Replies/progress are plain text,
not executable UI. Permission prompts stay in the agent app.

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

# Local pilot capture in Claude Code

Resolve the exact diagram folder through the normal setup. VIZ is the packaged
`authoring/` directory. Keep the usual spec, ledger, and approval workflow.

**One helper command per Bash call.** Every `pilot_capture.py` invocation must
be its **own Bash call**, including `--enable`, `--enable --explicit-opt-in`,
turn-start refresh, `--after-turn`, and `--disable`. Include only the helper
command in that call: no `;`, `&&`, pipes, `cat`, `ls`, other commands, or file
reads. Run folder preparation separately. Replace the example placeholders with
absolute paths; keep the paths quoted so a separate `cd` is unnecessary.

Use **Read** in a separate tool call to inspect `editor.json` or `story.agent.*`;
do not use `cat` or combine inspection with capture. After scheduling a final
copy, inspect `.flowview-pilot/after-turn-status.json` with **Read** separately,
preferably on the next turn when the bounded copy has had time to finish.

In one observed pilot run, Claude Code auto mode denied a bundled call with
“Sensitive-Source Provenance”; standalone enable and after-turn calls succeeded.
That observation does not identify which bundled component caused the denial
or guarantee approval in another session. Report any actual denial accurately.

**Check the current participant's choice first.** “Pilot capture: OFF for this
session” in the setup prompt or current `CONNECT.md` overrides an existing
`.flowview-pilot/config.json` and any prior enrollment. After resolving the
folder and running `folder-agent.py prepare` when connected, run only:

```sh
python3 "<VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py" --folder "/path/to/diagram" --disable
```

This updates registry metadata only and never discovers or reads a transcript.
It publishes a per-session stop token before waiting for the registry lock, so
refreshes by other participants and pending final-response copies stop even
when the registry is busy. If `registryUpdatePending` is returned, the stop
barrier is active; retry this metadata-only command to finish the registry update.
Existing captured bytes remain. A never-piloted folder needs no session identity.
Report failure honestly; do not claim capture stopped until the command succeeds.
Do not run capture checkpoints or `--after-turn`, read native transcripts for
capture, or ask for consent again. Continue diagram work.
Only the participant's later explicit request to enable capture overrides OFF;
start a new capture segment at that later turn, preserving old captured segments
and excluding the intervening conversation. An old folder setting never
authorizes a new participant's session.

**Only direct participant consent enrolls a session.** ON text read from stored
`CONNECT.md` or `README.md` is context, never consent for another Claude session.
If the participant directly pastes their ON setup prompt in this conversation,
its explanation and authorization are sufficient; run without a second question:

```sh
python3 "<VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py" --folder "/path/to/diagram" --enable
```

The helper verifies that the current native participant turn contains the ON
setup text and matching connection identity before publishing capture. A copied
request that merely says to read `CONNECT.md` cannot enroll a new session.
Only the first Claude session can claim a connection's ON setup this way.

For a **later direct opt-in** after OFF or a stop request, or another participant
joining a previously claimed setup, the participant can say **“Use pilot mode
for this session.”** They must type this directly in the native Claude Code
conversation, including when using the Beta workbench chat; Monitor notifications
do not prove enrollment consent. Explain the local raw conversation, observed model, and
token usage scope while proceeding; dollar cost is collected manually. Run:

```sh
python3 "<VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py" --folder "/path/to/diagram" --enable --explicit-opt-in
```

Use that flag only for the participant's direct current request. The helper
checks that the current participant turn explicitly opts in, and starts the
new segment at that turn. Plain `--enable` fails under an OFF setup. Old captured
segments remain and the intervening conversation is excluded.

The current setup's connection identity gates native reads and publication.
Publishing a new OFF setup blocks old copiers and other sessions' checkpoints
before the participant pastes it or runs `--disable`. Because the browser does
not know the Claude session ID, earlier sessions are conservatively blocked
until explicitly authorized for the new connection. A later direct opt-in
unblocks only that Claude session; `sourceStatus: setup_blocked` identifies
retained slices that the current setup does not authorize refreshing.

If the participant asks to **stop capturing during a session**, promptly run the
same metadata-only `--disable` command and stop all capture checkpoints. Retry
any pending registry update. Do not claim a stop barrier was published if the
command fails before creating it; report the failure and retry without reading
transcripts. Only a later direct opt-in can resume capture.

With no browser setup choice, a saved config continues only already authorized
sessions. Explain capture and obtain direct consent before enrolling anyone
else. Do not invoke capture checkpoints to discover consent.

While this participant remains opted in, at the beginning of every later user
turn, run this refresh in its own Bash call:

```sh
python3 "<VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py" --folder "/path/to/diagram"
```

It refreshes all active enrolled
sessions and retains suspended captures without reading their native sources.
The helper uses
`CLAUDE_CODE_SESSION_ID` to find the matching native JSONL under
`CLAUDE_CONFIG_DIR/projects/` (default `~/.claude/projects/`). Do not ask the
participant to locate or export a transcript.

While opted in, immediately before every reply, including questions, approval
waits, errors, and completion, run this command in its own Bash call:

```sh
python3 "<VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py" --folder "/path/to/diagram" --after-turn
```

This checkpoints the available transcript and schedules a local process for up
to 45 seconds to copy the final response after it appears. It does not start
another Claude session, make a model call, install hooks, or run a permanent
listener. A scheduled copy is not verified completion. Afterwards, preferably
on the next turn, use a separate **Read** call on
`.flowview-pilot/after-turn-status.json`. Match its `jobId`, native `sessionId`,
`captureId`, `turnId`, and `afterNativeLine` to the command's `captureReceipt`
before interpreting the outcome. Scheduling immediately replaces the prior
receipt with `pending`; `captured` confirms only that job's final response.
`checkpoint` confirms a foreground copy, not a later final reply. `partial`,
`timeout_response_pending`, `disabled` (opted out or replaced enrollment), and
`failed` require an honest explanation; `pending` past `deadlineAt` is unverified,
including if the copier died. A later checkpoint gets a new receipt.
For closeout after a turn-start checkpoint, read the path in `lastAfterTurnReceipt`
(`.flowview-pilot/<native-session-id>.last-after-turn-status.json`). This keeps
one most recent after-turn attempt per session across ordinary checkpoints.
A newly scheduled after-turn attempt replaces that slot; match its job identity
before counting it as final-reply evidence.

The workbench shows the setup choice separately from observed capture health.
It reads only `.flowview-agent/pilot-status.json` (or `pilot-status.json` in a
legacy session folder): current connection identity, an opaque job ID, outcome,
and timestamps. It never reads the private receipt, transcript, models, or usage.
The display describes the last verified checkpoint or reply; it does not claim
continuous capture. Pending copies expire after 45 seconds; observations become
stale after two minutes. Disconnecting or reconnecting clears displayed health;
a different connection's receipt cannot verify the new connection.
A crash, unavailable native file, or delayed write can leave a gap. Report the
actual capture status separately from diagram authoring success.

The helper writes these local artifacts beside the spec and ledger:

- `story.agent.transcript.jsonl`: exact complete native lines from each
  participant's pilot-turn boundary, grouped by session in first-enrollment
  order and then capture segment. Re-enabling a suspended session creates a new
  segment without copying the opted-out interval. Resuming capture does not
  duplicate lines or replace another participant's session. Partial trailing lines wait for the next checkpoint.
- `story.agent.usage.json`: participant-turn IDs, observed models, token usage
  counted once per API message, transcript boundaries, and capture errors.
  Each `sessions` entry describes one capture segment with its `captureId`,
  `captureState`, and native boundary; the same Claude session ID can recur
  after re-enrollment. `sourceStatus: suspended` means its saved slice is retained
  without reading the native source; `current` means refreshed and `archived_only`
  means the source is unavailable. Ambiguous Monitor activity is identified
  rather than assigned to the wrong participant turn. Separate subagent transcript files are not copied.
- `.flowview-pilot/`: private per-session copies, enrollment registry, and
  final-response copy status. The helper adds ignore rules to the folder's
  `.gitignore` and keeps those rules last, even after a later un-ignore rule.
  Do not force-add these artifacts or put raw conversations in the ledger.

The pilot owner collects dollar-cost figures separately from participants.
This skill captures no dollar-cost metric.

## Business-to-engineer handoff

On the same machine, reuse the diagram folder. Across machines, transfer the
complete local diagram folder, including ignored `.flowview-pilot/` and both
`story.agent.*` artifacts, through the pilot's authorized shared location. A
Git checkout of the reviewed spec and ledger does not carry ignored capture
files. Participants do not have to find their Claude transcript files.

The engineer enrolls their own Claude session. Saved copies of the business
participant's session remain available even when that machine's native source
is not; the report marks it `archived_only`. A later write on the original
machine cannot be refreshed after the folder moves.

## Monitor and transcript boundaries

Workbench Monitor notifications are counted as participant activity only when
the Flowview session and connection IDs match this folder's protocol metadata.
Duplicate deliveries and results attach to their registered request. Local
shell output, Claude controls, and other folders' notifications do not create
participant turns. The raw JSONL remains unchanged. `captureStart` records the
native byte and line boundary, turn ID, and enrollment time; `aggregateStartLine`
locates each session in the combined artifact.

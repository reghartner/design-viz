# Local pilot capture in Claude Code

Enable only when the current participant requests pilot mode. An existing
`.flowview-pilot/config.json` continues that choice for an enrolled Claude session
across turns and reconnects; it does not enroll another participant automatically.
Resolve the exact diagram folder through
the ordinary setup; VIZ is the packaged `authoring/` directory. Keep the normal
spec/ledger approval protocol for all four use cases.

Before enrolling a new session, explain that pilot mode saves this participant's
native conversation and usage locally from the current turn onward. Earlier
unrelated chat is excluded. A setup prompt such as **“Use pilot mode for this
session”** already authorizes enrollment; proceed without asking again. Otherwise,
if a new participant opens a pilot folder, ask whether to capture their session
before running `--enable`; continue authorized authoring independently. The
helper returns `consent_required` for a new session without that flag and does
not read or copy its native transcript.

For an authorized participant, run the packaged helper through Bash:

```sh
python3 <VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py --folder /path/to/diagram --enable
```

After it is enabled, run the same command without `--enable` at the beginning
of every user turn. It refreshes the current and previously recorded Claude
sessions. It reads `CLAUDE_CODE_SESSION_ID` and the matching native JSONL below
`CLAUDE_CONFIG_DIR/projects/` (default `~/.claude/projects/`); never choose the
most recent unrelated transcript. No hook installation, new Claude session,
model call, account connection, manual export or transcript filename is needed.

Immediately before **every** reply, including questions, waiting for approval,
errors, interrupted work when a reply is possible, and completion, run:

```sh
python3 <VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py --folder /path/to/diagram --after-turn
```

This takes a checkpoint and schedules one local process with a 45-second wait
budget to copy the final native response and wait for a covering cost snapshot.
The checkpoint records the last complete native transcript line before the
reply. Completion requires a **new** native assistant `end_turn` after that
boundary and a cost snapshot after the new response, even when its participant
turn cannot be identified. An earlier completed turn or cost record cannot
finish this copy. Capturing the final response alone does not end the cost wait. It performs no
authoring, networking or Claude invocation. It is the pilot's bounded final
copy, separate from Workbench Monitor; do not install hooks or a permanent
listener. The next user turn also catches up. A crash, interruption, unavailable
session ID, delayed native write, missing permission or expired final copy can
leave a gap. Do not claim a scheduled copy is complete. Read the helper result
and `.flowview-pilot/after-turn-status.json` when checking the previous copy.
The status names its session and turn and records `captured`, `cost_unavailable`,
`turn_cost_unattributable`, `timeout_cost_pending`, `timeout_response_pending` or
`failed`. A session-specific
`<session-id>.after-turn-status.json` prevents another participant's result from
being mistaken for this one. Historical source errors are reported but do not
prevent a valid current session's final copy.

`replyCapture` in that status records the pre-reply native line boundary, new
response and covering cost positions, and the associated participant turn's
attributable USD (the whole turn, including any earlier work on that request). If an
unmatched or unverified event leaves that reply unattributed, its USD is null
and the outcome is `turn_cost_unattributable`; earlier valid turn costs remain
in the usage report. `nativeProgress` positions use absolute native transcript
line numbers, including the history excluded before the pilot boundary.

The helper writes these local artifacts beside the spec and ledger:

- `story.agent.transcript.jsonl`: exact complete raw native lines **from each
  participant's pilot-turn boundary**, grouped by
  session in first-capture order. A new engineer session appends a separate
  group; checkpoints/resumes extend the right session without duplicating its
  lines or replacing another participant. Partial trailing lines wait for the
  next checkpoint. This is an exact pilot slice, not an entire native session.
  Separate subagent transcript files are not included.
- `story.agent.usage.json`: observed models, user-turn UUIDs, token usage counted
  once per API message, native cumulative cost snapshots and their line numbers,
  attributable turn cost, latest reported session totals and capture errors.
  `captureStart` records the native byte/line boundary, participant-turn UUID and
  consent time. `aggregateStartLine` locates the slice in the combined artifact.
  Snapshot/turn line numbers are relative to that session's captured slice.
- `.flowview-pilot/`: local exact per-session copies, capture registry and final
  copy status. The helper appends precise ignore rules to the diagram folder's
  `.gitignore`, preserving existing rules. Never force-add capture artifacts,
  put raw conversations into the coverage ledger, or upload them centrally.
  The helper keeps its own managed ignore block last, moving that block without
  duplicating it. These capture exclusions intentionally override earlier
  negation rules such as `!story.agent.transcript.jsonl`; unrelated rules remain.

## Participant turns in the Workbench Monitor route

In the embedded Beta route, Monitor delivers the participant's request inside
a native `<task-notification><event>…</event></task-notification>` row. The helper
reads each JSON line in the event element, in order, and recognizes well-formed
`flowview_request`, `flowview_result`, and `flowview_cancel` envelopes
whose Flowview session and connection IDs were verified against this diagram
folder's `.flowview-agent/session.json` (or legacy root `session.json`). Verified
identities are retained with the capture so reconnecting does not erase earlier
turns. A Monitor request can establish the pilot enrollment boundary.

A request creates one participant turn. The Workbench's copied request header
also registers its session and request IDs when its connection is verified.
Approval/result and cancellation events belong to that same request; results
after reconnect match by session and request ID across locally verified
connections. Duplicate delivery is deduplicated by request and event IDs, while
native UUID aliases remain visible in the usage record.
Ordinary background notifications, system reminders, local shell input/output,
and local settings commands do not create participant turns. Authored skill
slash commands still do. `/plan` is retained as a possible model-backed turn
until its own native local output proves that it was handled locally. These
distinctions affect usage indexing only; raw native lines remain exact.

A malformed or unknown Flowview event, unverified identity, or unmatched result
is recorded in `attributionIssues`. Responses to ambiguous batches are excluded
from turn token totals. Affected turn data is marked `attributionStatus:
unavailable`, and USD from that point onward stays null. Earlier turns with
covering cost records remain valid. The bounded copier still waits for a native
cost record after ambiguous work; unavailable attribution alone is not proof
that Claude has finished persisting its cost.

## Moving from a business participant to an engineer

On the same machine, reuse the diagram folder. For a participant on another
machine, transfer the entire local diagram folder, including the ignored
`.flowview-pilot/` directory and both capture artifacts, through the pilot's
authorized handoff. A Git clone of the reviewed spec/ledger does not carry these
ignored files. This is one folder handoff; participants do not locate or export
Claude transcript files. Without a full handoff, the earlier participant's
capture remains on their original machine and cannot be reconstructed here.

The next participant authorizes their own session as above. The helper retains
the prior exact per-session copies even when their native sources do not
exist on this machine. It marks those sessions `archived_only`, preserves their
last reported totals, and still captures the current session. It cannot refresh
later writes on the original machine; the combined **current** total stays null
while any source is unavailable, with known reported dollars shown separately.

A transferred folder reflects its last checkpoint. If the original Claude
session stays open past the bounded copy and persists cost only on a later exit,
that eventual total is absent from the transferred archive. A later capture on
the original machine can refresh it, but a destination reconnect or Git cannot.
Do not describe a handoff with pending costs as containing a final session total.

## Dollar cost is reported only when Claude supplies it

Read USD from native `cost-state.totalCostUSD` and `modelUsage`, not token price
tables. Claude Code 2.1.289 testing found that `message.usage` provides tokens
but no USD, and cost-state can be written only when the session exits. Resuming
`/cost` during a live turn returned a stale total, so the helper never invokes
it. A slash command result is not proof that the active turn is included.

`costUsd` is the difference between identified consecutive cumulative snapshots
covering exactly one completed user turn. A root transcript establishes an
initial zero baseline; a partial transcript does not. Missing snapshots,
unknown model pricing, gaps spanning several turns or decreasing counters leave
USD `null`. Unknown pricing is **unavailable**, not a write still pending. The
latest reported native session total remains separately visible;
do not call it the current complete total while later turns are pending. The
combined current total is `null` until every captured session has a covering
snapshot and its source is available. Native cumulative session dollars may
include costs before the pilot boundary. Per-turn tokens/models cover the main
captured transcript; native cumulative `modelUsage` can also include subagent
models. Raw token usage is evidence, not a dollar estimate or a subscription invoice.
The CLI's `reportedSessionCostScope` states this explicitly: the reported number
is for the entire Claude session and is not a pilot-only spend total. A known
cumulative total with an unprovable turn delta is `turn_cost_unattributable`,
distinct from an absent cost snapshot that may still arrive.

In each reply include a concise capture status: saved paths on the first turn,
observed model(s), reported turn/session USD if available, and otherwise
**“USD pending: Claude has not persisted a complete cost snapshot.”** If a
multi-turn gap or unknown model pricing makes a turn cost unavailable, say that
instead. The helper also reports the previous completed turn, so a newly started
turn does not hide a cost that has since become available. Report failures with
their actual reason and keep capture failures separate from authoring
success. State that the final response copy is scheduled, or still missing,
until verified. This workflow cannot guarantee exact dollars after every turn
on Claude versions that persist cost only on exit; it records that limit rather
than estimating or asking participants to manage transcript files.

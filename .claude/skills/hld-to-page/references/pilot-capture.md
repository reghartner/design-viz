# Local pilot capture in Claude Code

Use this guide when the current participant requests pilot mode. An existing
`.flowview-pilot/config.json` continues capture for an enrolled Claude session;
it does not enroll a different participant automatically. Resolve the exact
diagram folder through the normal setup. VIZ is the packaged `authoring/`
directory. Keep the usual spec, ledger, and approval workflow.

Before enrolling a new session, explain that pilot mode saves this participant's
native conversation and observed model and token usage locally, starting with
the current turn. Earlier chat is excluded. A setup prompt such as **“Use pilot
mode for this session”** already authorizes enrollment. Otherwise ask once before
running `--enable`; continue authorized diagram work independently. A new
session without `--enable` returns `consent_required` without reading its
transcript.

For an authorized participant, run:

```sh
python3 <VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py --folder /path/to/diagram --enable
```

At the beginning of every later user turn, run the same command without
`--enable`. It refreshes all enrolled sessions. The helper uses
`CLAUDE_CODE_SESSION_ID` to find the matching native JSONL under
`CLAUDE_CONFIG_DIR/projects/` (default `~/.claude/projects/`). Do not ask the
participant to locate or export a transcript.

Immediately before every reply, including questions, approval waits, errors,
and completion, run:

```sh
python3 <VIZ>/.claude/skills/hld-to-page/scripts/pilot_capture.py --folder /path/to/diagram --after-turn
```

This checkpoints the available transcript and schedules a local process for up
to 45 seconds to copy the final response after it appears. It does not start
another Claude session, make a model call, install hooks, or run a permanent
listener. A scheduled copy is not verified completion. Check
`.flowview-pilot/after-turn-status.json` for `captured`,
`timeout_response_pending`, or `failed`; a later turn also refreshes the copy.
A crash, unavailable native file, or delayed write can leave a gap. Report the
actual capture status separately from diagram authoring success.

The helper writes these local artifacts beside the spec and ledger:

- `story.agent.transcript.jsonl`: exact complete native lines from each
  participant's pilot-turn boundary, grouped by session in first-enrollment
  order. Resuming capture does not duplicate lines or replace another
  participant's session. Partial trailing lines wait for the next checkpoint.
- `story.agent.usage.json`: participant-turn IDs, observed models, token usage
  counted once per API message, transcript boundaries, and capture errors.
  Ambiguous Monitor activity is identified rather than assigned to the wrong
  participant turn. Separate subagent transcript files are not copied.
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

# Facilitated authoring pilot

Use this runbook to test whether people can create, correct, resume, and hand off
a small Flowview story. It is a proposed operating plan, not evidence that the
workflow has met the targets below. Complete the companion
[scorecard](pilot-scorecard.md) for every run.

## Cohort and setup

Recruit six to eight participants across business and engineering roles. Assign
at least one primary run to each starting point:

1. business story for later engineer enrichment;
2. an existing engineering flow;
3. a versioned HLD; and
4. a Honeycomb event or span export.

Use one small scenario in source forms appropriate to each route. Rotate a second
engineer, who did not see the authoring conversation, into every handoff. A person
may author one route and receive another, but never score their own handoff.

Exercise both **Copy & paste** and **In workbench — Beta** during the cohort and
report them separately. The first keeps conversation in the native agent; Beta
uses the workbench conversation and explicit Monitor setup. Participants operate
the workbench directly; do not require Chromium, Playwright, browser automation,
or terminal work.

For a new diagram, the agent follows that build's packaged instructions for its
browserless Node graph/layout tooling. Some builds arrange the graph and leave
other page placement to the ordinary authoring workflow; others may support a
broader composition mode. Record the bundled command, mode, and outcome that
were actually used. Do not turn layout commands or dependency installation into
participant work, require Chromium or browser automation, or describe tool
success as visual QA.

Freeze the scenario pack before the cohort. For each run record the route and
source version, connection method, repository/build commit, `hld-to-page` skill
version, model setting and observed model, agent version, OS, browser/version,
display or viewport, participant role, and relevant experience. Do not pool
results across materially different builds, skills, routes, connection methods,
or environments without showing those groups.

The participant authors the story. The facilitator reads the consent script,
keeps time, and records help without repairing the artifact. The receiving
engineer and handoff scorer must not see the first conversation. The pilot owner
controls research archives and records dollar cost separately.

Pilot capture is a separate choice and is off by default for every new setup and
participant. A participant who opts in pastes the generated ON setup directly
into their current Claude Code conversation. Stored setup text and previous
capture files are never consent for another session. Follow the exact
standalone-command rules in [local pilot capture](../.claude/skills/hld-to-page/references/pilot-capture.md).
The participant never locates or exports a native transcript.

## Core task

Start the clock when the participant receives the scenario and can act. Ask each
primary author to:

1. create a useful small story with a clear trigger, happy outcome, and one
   failure with recovery or an honestly unresolved ending;
2. play both paths and explain the outcome;
3. correct one planted factual or labeling error;
4. request a bounded change, reject or discard its first proposal, explain the
   problem, and obtain a revised proposal;
5. accept one complete change and use **Undo**, confirming that spec and ledger
   return together, then restore the intended result if needed;
6. end with an accepted spec and ledger, reopen the same folder the next day,
   and make one small source-grounded edit; and
7. hand the result to an engineer who did not see the conversation.

The receiving engineer first explains the story from the artifact, identifies
an unknown or evidence gap, and then adds one supported engineering detail. They
must preserve accepted business intent. Conflicting evidence becomes a visible
decision, not a silent rewrite.

Route-specific evidence still applies. An existing flow distinguishes stated,
designed, and observed behavior. An HLD remains a proposed design unless other
evidence proves deployment. A Honeycomb URL is not trace data; use an export or
authorized connector, preserve trace identity and timing, and do not generalize
one request into the complete system.

## Observe consistently

Let the participant work aloud and do not offer proactive navigation hints.
Intervene when asked, after three blocked minutes, when data or consent is at
risk, or when the timebox expires. Record the time, exact help, and one code:

- **orientation** — finding the next product action;
- **folder** — creating, selecting, reopening, or transferring the folder;
- **agent** — connecting, copying, sending, or returning to the agent;
- **review** — rejecting, revising, committing, or undoing a proposal;
- **evidence** — supplying or interpreting the assigned source;
- **recovery** — stale, disconnected, denied, or failed operation; or
- **safety** — preventing loss, publication, consent error, or disclosure.

Product instructions and agent questions are not facilitator interventions.
Count facilitator takeover as incomplete even when the resulting artifact is
good.

Mark **time to first useful story** when the participant can play an accepted
story with a recognizable trigger and outcome. Valid JSON alone does not count.
Record total task time, assistance, corrections, completion of every core step,
errors/retries, and the [story/layout rubric](pilot-scorecard.md#story-and-layout-rubric).
Test source-grounded comprehension before coaching: the receiving engineer states
the trigger, outcome, failure/recovery, one supported fact, one unknown, and the
detail they would add without changing the promise.

Record capture completeness separately from product success. The usage artifact
reports observed models and tokens from the main native transcript; separate
subagent transcript files are excluded. Do not combine unknown subagent usage
with that total. The helper does not calculate dollar cost. Record cost manually
with currency, source, and whether it covers only the main session or a broader
billing interval.

## Proposed targets

These are proposed decision rules for the first cohort, not observed results.
Preserve the original targets if they are rebaselined after the first two runs.

- All four routes and both connection methods have a completed attempt.
- At least 80% of primary runs reach a useful story within 30 minutes and finish
  without facilitator takeover.
- The median run needs at most two interventions, with no consent, publication,
  or artifact-loss intervention.
- At least 80% complete correction, reject/revise, Undo, and next-day reopen.
- At least 80% of receiving engineers pass blind comprehension and enrich the
  story without lowering an accepted rubric dimension.
- Every scored artifact is valid and scores at least 2 on every rubric dimension.
- Every opted-in run has a classified capture result; at least 90% of expected
  substantive participant turns have matching usage metadata, and every capture
  gap is retained in the report.

Show counts beside percentages. A capture gap affects evidence quality; it does
not turn a completed product task into a failure. Product success does not prove
capture completeness.

## Handoff

After refreshing the accepted spec and ledger, **Brief → Download review
package** creates the ordinary engineering-review ZIP. It contains the editable
spec, generated viewer, ledger, reference/provenance manifest, available change
receipts, and review README. It does not include `.flowview-pilot/`, either
`story.agent.*` file, a native transcript, arbitrary referenced source contents,
or authorization to publish.

Normal engineer review uses that ZIP. A transfer of pilot research evidence to
another machine is a separate, access-controlled operation. Transfer the complete
local diagram folder through the pilot's authorized location, including the
accepted spec and ledger, ignored `.flowview-pilot/`,
`story.agent.transcript.jsonl`, and `story.agent.usage.json`. Git checkout and the
ordinary ZIP do not carry ignored capture artifacts.

Before transfer, the facilitator records relative filename, byte size, and
checksum. On the receiving machine they compare that inventory and verify the
spec/ledger, `.flowview-pilot/`, and both `story.agent.*` files without opening or
quoting the raw transcript. Record missing or mismatched entries; the next
participant's session cannot reconstruct them. The new participant then opens
normal setup and independently chooses ON or OFF.

## Capture closeout

The opted-in participant's agent performs closeout. Each helper invocation is a
standalone Bash call. Inspect status with a separate Read operation.

1. Immediately before the last substantive response, run `--after-turn`. Record
   the `captureReceipt` identity it returns: `jobId`, native `sessionId`,
   enrollment `captureId`, `turnId`, and `afterNativeLine`. Older helpers return
   the same available identity as `captureId`, `turnId`, and
   `nativeProgress.capturedThroughLine`. Scheduling the bounded, up-to-45-second
   copy is not proof that the response was captured.
2. On a short follow-up closeout turn, run the ordinary turn-start checkpoint.
   When its output includes `lastAfterTurnReceipt`, use a separate Read operation
   on that exact path **before scheduling another `--after-turn`**. It names this
   native session's latest scheduled after-turn job; a later after-turn replaces
   it, while ordinary checkpoints leave it intact. With an older helper that does
   not return this field, separately Read the legacy
   `.flowview-pilot/after-turn-status.json`.
3. Separately Read structured `story.agent.usage.json`, never the raw transcript.
   The scheduled `captureId` must select exactly one `sessions[]` entry. Require
   that its `turns[]` contains the scheduled participant `turnId` or its recorded
   alias. With a current helper, also require the entry's native `sessionId` to
   match the scheduled value. With a legacy helper, the selected usage entry's
   native `sessionId` is the independent expected value for the receipt check in
   the next step. An unavailable or ambiguous session, mismatched native session,
   or missing participant turn is a gap.
4. Match the private receipt to the scheduling output. For a current receipt,
   match `jobId`, native `sessionId`, `captureId`, `turnId`, and
   `afterNativeLine`. For a legacy receipt, match `turnId`, `result.captureId`,
   and `replyCapture.afterNativeLine` to the scheduled `turnId`, `captureId`, and
   `nativeProgress.capturedThroughLine`; its top-level `sessionId` must match the
   usage session selected above. The Flowview `owner.sessionId` and
   `owner.connectionId`, when present, must match this folder's current
   connection. Only then interpret the outcome and require
   `replyCapture.finalResponseCaptured: true`.
5. Treat a missing or mismatched receipt, `pending`, `checkpoint`, `partial`,
   `timeout_response_pending`, `failed`, or `disabled` result as a gap. Preserve
   the files and report it. A later refresh may capture delayed writes, but do
   not promise it will. `.flowview-agent/pilot-status.json` is only a browser
   summary; its opaque job and outcome cannot verify native turn identity.
6. Have the participant ask to stop capture. Run the documented metadata-only
   `--disable` command. Retry it only when it reports a pending registry update.
   Do not read the raw transcript to stop capture.
7. Record that the administrative closeout and stop acknowledgement may be
   outside the captured slice. There is no export/finalize command or
   timeout-free final-response capture.

Finally compare the scorecard with the accepted spec/ledger, current
session/connection/request, targeted private receipt, and transfer inventory.
Retain assistance and capture gaps. Report direct observations separately from
participant statements, facilitator interpretation, and proposed changes.

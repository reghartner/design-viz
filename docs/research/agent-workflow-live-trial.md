# Live agent workflow pressure test — 2026-09-28

The workbench was exercised with real `claude-opus-5-5` sessions using Claude
Code 2.1.284 and the existing machine login. The CLI initialization and model
usage records confirm the model; no fallback model was configured. Two separate
Opus sessions also reviewed the implementation and the boundary fixes.

The trials used the built workbench, its real renderer, source/history controls,
folder client, delivered Python helper, authoring kit, validator, and state walk.
Claude read the copied setup/context, authored candidates, submitted proposals,
handled feedback, and wrote completion receipts. Direct requests were delivered
by Claude's actual Monitor tool. No deterministic stand-in authored the live
proposals.

Only the native folder picker and browser directory handles were substituted,
using the existing disk-backed browser harness. Files were real local files.
Browser interaction drove Copy, Send, preview, Commit, conflict feedback,
cancellation, and Undo/Redo. The test agent had local file tools and scoped
command permissions, with browser integration and external MCP servers disabled.
This does not constitute proof of native folder-permission ergonomics or of
continuous operation while the browser is suspended.

## Observed behavior

| Trial | Result |
| --- | --- |
| External setup without Monitor | Kit prepared; native conversation continued |
| Copied selected node and reference, message over 16,000 characters | Complete message reached Claude; bounded request registration succeeded |
| Agent planned from a revision newer than the request, then 40 human edits arrived during review | The planning baseline survived eviction from recent history; both changes appeared in the preview |
| Preview, Commit, Undo, Redo | Source stayed unchanged before Commit; Undo restored the exact human draft |
| Both human and agent renamed the same node | Commit disabled; copied feedback named the conflicting field |
| Feedback returned to real Claude | Claude reread the latest source, preserved the human title, added its intended label as the node detail, and submitted a valid reconciliation |
| Stop accepting a prepared native request | Helper rejected further output; cancelled changes did not leak into the next request |
| Native publication delayed beyond the eight-second deadline | Attempt withdrew; no stuck pending turn; retry succeeded |
| Request file visible while browser acceptance was paused | Helper waited for the browser's transcript acknowledgement, timed out rather than claiming acceptance, then successfully retried and completed a committed update |
| External optional Monitor and direct Send | Agent woke, validated, proposed, received the commit result and completed the request |
| Monitor expiry and renewal during work | A six-second trial watch expired; Claude renewed it for 25 minutes and continued without restarting the request |
| Embedded question/answer and direct native-surface message | Questions arrived in the workbench; answers and subsequent messages produced previewed, committed updates |

The renewal trial accelerates the watch duration; it does not claim that a full
25-minute idle period was observed. An intentionally paused browser must resume
before it can acknowledge work. Cancellation here stops acceptance; the agent
app remains responsible for stopping model computation.

## Defects fixed

- Oversized Copy previously called the direct transport with the entire message
  and failed. It now registers a bounded clipboard placeholder while copying
  every character of the message and selected context.
- Reviewed planning baselines could fall out of the recent-revision cache.
  The review retains its baseline, and native request registration pins the
  exact published snapshot even if editing occurs during an asynchronous read.
- Expiry during a native request write could leave an orphaned turn or report a
  false folder-permission problem. Expiry is handled as a request outcome,
  timed-out attempts withdraw, and `begin` waits for the browser's accepted-turn
  transcript entry instead of treating a visible request file as acknowledgement.
- A busy Commit could retain approval and apply when the user later closed the
  preview. A deferred attempt now consumes approval and requires another click.
- Watch renewal replayed delivered requests and results. Listener state now
  retains bounded event IDs; completed results are skipped, events carry the
  request ID, and prompts require deduplication after uncertain process failures.
- The external setup prerequisites still implied Monitor was mandatory. They
  now distinguish Copy from direct Send and embedded conversation.

## Reproduction and evidence

These live checks are opt-in because they use the signed-in Claude account:

```sh
python3 tools/build.py
node tools/agent-workflow-trial.mjs --output .local/my-agent-trial
node tools/agent-workflow-trial.mjs --output .local/my-native-trial --native-only
```

Each output directory must be new. The runner saves `report.json`, model events,
exact copied messages and feedback, exchange history, final source, and browser
screenshots. Trial artifacts for this session are under the ignored
`.local/live-agent-pressure/`: `run-05` contains the first complete live pass,
`run-06` the expanded stress pass, and `run-07-native` the final acknowledgement
race and successful retry. The latter's delivered helper was compared byte for
byte with the final source. Earlier runs record test-harness setup failures;
they are not counted as passing product trials.

Deterministic verification also passed: the complete Node suite with four test
workers, 20 Python helper tests, 12 build tests, and 49 browser checks across the
folder, authoring broker, conversation, and welcome-navigation suites. The new
regressions cover baseline eviction, request pinning during a read, deferred
approval, both sides of native expiry, acknowledgement ordering, watcher renewal,
and oversized clipboard delivery.

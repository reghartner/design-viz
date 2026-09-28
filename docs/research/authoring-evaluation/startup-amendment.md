# Startup correction, recorded before second-turn authoring

September 28, 2026, 13:52 UTC. The initial six author calls have completed their
question turns. All resolved to `claude-opus-5-5`, and all six question replies
appeared in their own editor. None proposed a story or received operator answers.

The original runner outcome is **0/6 completed**, with two distinct causes:

- Four runs timed out in the coordinator's capture check because it expected
  `changes.json` before any change had occurred. The production protocol does
  not create that history file until a proposal. Reply/source/revision capture
  was present and matching; this is a benchmark harness defect.
- Two runs attempted an unallowed shell command combining `cat` and a Python
  clock check, then recovered using allowed tools and delivered their questions.
  The runner rejected the recorded permission denials. These are retained as
  startup instruction/permission failures; they are not clean runs.

To obtain useful output comparisons without selecting new authors, explicitly
continue **the same six Claude session IDs** at the original second turn. Do not
repeat the questions, create replacement conversations, alter source evidence,
change the answer sheets, or feed the authors their grades. Preserve the first
attempt's commands, raw outputs and failed result records unchanged.

The coordinator correction accepts an absent initial change-history file only
when no proposal/history exists. A fixed-path, read-only status command exposes
the current clock and editor heartbeat without requiring an arbitrary shell
command. The continuation records this coordinator-owned wrapper update and
checks protected-file hashes before and after it. Authors are explicitly told to
read files with the Read tool and use the status wrapper for heartbeat checks.

Each continuation still requires the real editor's accepted source, matching
reply/revision and applied receipt, with permission denials preserved as failures.
Publish the continuation outcomes and quality scores separately from the original
startup outcomes. Active model time excludes the coordinator repair interval and
must not be described as uninterrupted end-to-end time. The original comparison
rubric and historical scores remain unchanged.

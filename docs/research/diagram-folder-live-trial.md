# Durable diagram folder verification — 2026-09-28

This follow-up to [the initial workflow pressure test](agent-workflow-live-trial.md)
checks durable spec/ledger artifacts, folder reopening and paired approval. The
product change is on PR #261. The final branch incorporates main's Explore zoom
change (`8f17fdf`).

## Automated artifact coverage

The real built workbench and its folder transport were exercised for:

- Opening an existing named spec/ledger pair without prior connection metadata,
  detecting a single spec, and requiring an explicit filename for ambiguous folders.
- Keeping accepted artifacts at the root, supporting legacy exchange folders,
  retaining unrelated files and excluding support files through an inner gitignore.
- Requiring both proposed artifacts, previewing current/proposed ledger text,
  accepting ledger-only changes and restoring the exact pair with Undo/Redo.
- Preserving handwritten source typed after an agent update, current/earlier draft
  ledgers and existing ledgers when creating a missing spec.
- Copying the current pair into an empty folder, resetting old history and
  persisting the loaded ledger before the first edit.
- Retaining the last valid artifact pair while handwritten JSON is incomplete.
- Rejecting outside artifact edits, protecting active leases, recovering an
  interrupted paired write and refusing recovery over conflicting outside edits.
- Native Chromium buffered filesystem handles, including empty file placeholders
  created before a write closes.
- Narrow toolbar reachability and Backstage entry into the recommended workflow.

The full Node suite, 265 Python tests and 51 workflow browser tests passed before
rebasing. The complete Node suite passed again after rebasing. Twelve packaging
checks passed after the final skill/guide wording update. Complete browser and
remote CI results are recorded in the PR validation section.

## Actual agents

Trials used the signed-in Claude Code CLI 2.1.284 with model `claude-opus-5-5`.
The CLI initialization and usage records verify the model. The agent read the
copied setup and bundled skill, used the delivered helper, authored both candidate
files, ran the validator/state walk and submitted proposals. The browser drove
Copy, preview, Commit, conflict feedback and Undo/Redo. Monitor requests used
Claude's actual Monitor tool.

The expanded run passed all eight scenarios in 10 minutes 43 seconds, using two
independent Opus sessions (external and embedded). The native-only run passed
both additional acknowledgement/retry scenarios. No tool permission denials
occurred in these passing runs. The trials demonstrated:

- Copy/paste setup without Monitor, a selected node/reference and a copied message
  longer than 16,000 characters.
- Planning from the recorded revision, then merging an agent change after 40
  human edits while review was pending.
- Approval followed by exact source Undo/Redo, then the agent rereading the saved
  pair, detecting stale ledger claims and submitting a ledger-only correction.
- Same-field conflict feedback returned to the real agent; it preserved the
  human's title, moved its intended name to the node detail and reconciled the ledger.
- Cancelling a prepared request: the helper refused further output and the saved
  pair remained unchanged.
- Native request timeout/withdrawal and successful retry. A separate native-only
  trial checked a visible request file without browser acknowledgement and then
  completed a paired proposal/preview/approval/receipt.
- Optional Monitor/direct Send in the external workflow, including renewal of an
  accelerated expired watch while the editor remained connected.
- A fresh Beta connection, an embedded question and answer, paired proposal and
  approval, and the agent rereading both accepted artifacts before completion.
- A direct message from the workbench with replies routed to the native agent
  conversation, delivered through the real Monitor.

Two additional Opus sessions reviewed the artifact/history/lifecycle changes.
Their confirmed findings led to the draft, Undo, placeholder, lease and recovery
regressions above.

## Evidence and limits

Run the opt-in live trial with a fresh output directory:

```sh
python3 tools/build.py
node tools/agent-workflow-trial.mjs --output .local/new-diagram-folder-trial
node tools/agent-workflow-trial.mjs --output .local/new-native-trial --native-only
```

Local evidence is retained under ignored `.local/diagram-folder-live-verified/`
and `.local/diagram-folder-live-native/`: reports, CLI events/model usage, exact
instructions, copied messages, artifact/transport files and screenshots. Earlier
runs under `.local/diagram-folder-live-full/` and `.local/diagram-folder-live-final/`
exposed test-driver assumptions about the extra ledger-correction approval and
stale proposal IDs. Those failures remain recorded and are not counted as full
passing runs.

The live trial replaces the native folder grant and handles with disk-backed
adapters; files and all authoring/protocol behavior are real. Native permission
UX remains a manual check. Deterministic browser checks separately exercise
Chromium's real filesystem handles. Accelerated Monitor expiry tests renewal,
not a full idle interval or continuous browser background execution.

Two-file publication has a recovery journal; it is not an atomic filesystem
transaction. Ledger merging is conservative whole-document merging. Validation
and paired approval do not prove the ledger's semantic claims: the agent and
reviewer must check them against the accepted diagram and source evidence.

# Flowview pilot scorecard

Copy this template for each run. Record facts during the session and score the
accepted artifact afterward. Write **not observed** instead of guessing. The
[pilot runbook](pilot-runbook.md) defines the task and closeout.

## Run identity

| Field | Value |
|---|---|
| Run ID / date / scorer | |
| Participant role and relevant experience | |
| Route: business / existing flow / HLD / Honeycomb | |
| Connection: Copy & paste / In workbench — Beta | |
| Scenario/source pack and version | |
| Workbench build or repository commit | |
| `hld-to-page` skill version or commit | |
| Bundled browserless layout command / mode / outcome | |
| OS / browser and version / display or viewport | |
| Agent application and version | |
| Requested model setting / models observed | |
| Diagram folder artifact names | |
| This participant's capture choice | ON / OFF |

## Task observations

| Measure | Result | Evidence or time |
|---|---:|---|
| Time to first useful story / total task time | | |
| Happy path and failure/recovery completed | yes / no | |
| Planted error corrected | yes / no | |
| Proposal rejected/discarded and revised | yes / no | |
| Accepted spec/ledger pair undone together | yes / no | |
| Same folder reopened next day | yes / no | |
| Engineer enriched without erasing intent | yes / no | |
| Completed without facilitator takeover | yes / no | |
| Errors, denials, disconnects, stale proposals, retries | count | |

### Facilitator interventions

| Elapsed | Code | Trigger | Exact help | Takeover? |
|---:|---|---|---|---|
| | | | | |

Codes: orientation, folder, agent, review, evidence, recovery, safety.

## Story and layout rubric

Score the accepted artifact, not the agent's description. Valid JSON and a saved
spec/ledger pair are prerequisites and earn no story/layout points.

- **0 — absent or misleading:** missing, contradictory, or unusable.
- **1 — material help needed:** present, but a consequential ambiguity requires
  explanation.
- **2 — usable:** an uncoached reader can use it; small issues remain.
- **3 — strong:** concise, coherent, source-aware, and easy to use.

| Dimension | Inspect | Score 0–3 | Evidence or issue |
|---|---|---:|---|
| Trigger to outcome | Initial state and trigger lead to a specific user or system outcome. | | |
| Failure and recovery | The failure point, consequence, and recovery or unresolved ending are clear. | | |
| Captions and controls | Captions are readable; path, step, playback, zoom, and relevant panel controls are discoverable and unobscured. | | |
| Layout and sequence | Reading order, grouping, edges, panels, and focused state make the active path clear without avoidable overlap or scanning. | | |
| State and evidence consistency | Captions, edges, panels, timing, values, spec, and ledger agree; claims match named sources and their designed/observed status. | | |
| Unknowns and conflicts | Assumptions, source limits, gaps, and contradictions stay visible instead of becoming invented facts. | | |
| Correction and intent | The error is fixed, revision addresses the rejection, and engineering detail preserves accepted business outcomes. | | |
| Blind handoff comprehension | A newcomer explains trigger, outcome, failure/recovery, one supported fact, and one unknown before coaching. | | |

**Total:** ___ / 24. **Lowest dimension:** ___.

The initial proposed threshold is at least 2 on every dimension. Report each
dimension; a high total cannot hide a broken failure path or unsupported handoff.

### Blind handoff answer

- Trigger and intended outcome:
- Failure and recovery or unresolved ending:
- Named source and supported fact:
- Assumption, conflict, or unknown:
- Engineering detail to add without changing the promise:
- Coaching given before the answer, if any:

## Capture and cost

Use helper output, the private checkpoint receipt, and structured usage metadata.
Do not ask the participant to locate a native transcript or paste raw conversation
content here.

| Field | Value |
|---|---|
| Expected substantive participant turns | |
| Participant turns in usage metadata | |
| Turns with final response recorded | |
| Main native transcript token fields/totals | |
| Separate subagent usage | excluded / separately measured / unknown |
| Scheduled job/native session/enrollment/turn/boundary | |
| Scheduled enrollment selects one usage session with matching native session and turn | yes / no / missing |
| Checkpoint-returned `lastAfterTurnReceipt` read before another after-turn | yes / no / legacy helper |
| Private receipt identity matches every available scheduled field | yes / no / missing |
| Flowview owner session/connection matches current folder | yes / no / unavailable |
| Targeted final reply recorded | yes / no / unavailable |
| Capture outcome and retained gaps | |
| Metadata-only stop result | disabled / update pending / failed |
| Manual dollar cost, currency, source, scope | |

A browser summary or bare `captured` outcome does not verify the target reply.
Apply the current/legacy identity checks in the
[runbook closeout](pilot-runbook.md#capture-closeout), then require the targeted
reply flag.

## Handoff and result

| Check | Result | Notes |
|---|---|---|
| Accepted spec and ledger are current | pass / fail | |
| Ordinary ZIP has spec, viewer, ledger, reference manifest, receipts, README | pass / fail | |
| Ordinary ZIP excludes `.flowview-pilot/` and `story.agent.*` | pass / fail | |
| Research transfer separately authorized | yes / no / n/a | |
| Sending and receiving name/size/checksum inventories match | pass / fail / n/a | |
| Full transfer has `.flowview-pilot/` and both `story.agent.*` files | pass / fail / n/a | |
| New participant made an independent capture choice | ON / OFF / n/a | |

- Product task: complete / incomplete
- Capture evidence: complete / partial / unavailable
- Proposed target result: met / not met / not applicable
- Direct observations:
- Participant statements:
- Facilitator interpretation:
- Follow-up issue or experiment:

Keep proposed targets and interpretation separate from observed evidence. Show
the numerator and denominator with every percentage.

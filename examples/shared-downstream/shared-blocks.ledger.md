# Doorbell shared blocks

This fictional story demonstrates authoring and playback. It does not describe a
company implementation, an observed incident, a transport, or measured timing.
The audience is a diagram author checking how path-specific state survives a
shared middle block, a later split, and a shared ending.

## Branch plan

| Path | Shared beginning | First different event | Shared middle | Later difference | Ending |
|---|---|---|---|---|---|
| First attempt | `press` | `record` captures the clip | `store`, `index` | `notify` sends the ordinary alert | `ready` |
| After retry | `press` | `record-failed`, then `record-retry` | `store`, `index` | `notify-recovery` sends the recovery notice | `ready` |
| Device offline | `press` | `offline` prevents the request | None | None | `offline` |

The retry has one extra stop. `store` / `index` are steps 3 / 4 on First attempt
and 4 / 5 on After retry. `ready` is step 6 or 7. Only the two recording paths
participate in either common block. The offline path has exactly two steps.

## Storyboard and state expectations

All rows below are authored illustration, not sourced system facts.

| Step ID | Actor/action | Incoming state | Change and visible outcome |
|---|---|---|---|
| `press` | Visitor presses doorbell | Waiting; no notice | Log records the press |
| `record` | First capture succeeds | Waiting | Route becomes First attempt; log records capture |
| `record-failed` | Service cannot produce a clip | Waiting | Route becomes Retry needed; service warns; log records failure |
| `record-retry` | New attempt captures clip | Retry needed | Route becomes Retried; service recovers; log retains the failed attempt |
| `store` | Store clip | First attempt or Retried | Append storage entry; retain route and earlier events |
| `index` | Index clip | Clip stored on selected path | Append indexing entry; retain route and earlier events |
| `notify` | Ordinary alert arrives | First-attempt clip indexed | Notice becomes Doorbell alert |
| `notify-recovery` | Recovery notice arrives | Retried clip indexed | Notice becomes Recovery notice |
| `ready` | Clip available in event history | Selected path's clip indexed and notice delivered | Append ready entry; retain both route and notice |
| `offline` | Offline device cannot send request | Waiting; no notice | Block the request, set Offline, retain None notice; end |

## Review points

- The two-step common middle is labeled Shared steps. Only the final `ready`
  block is Shared ending. The paths split visibly at their notification events.
- Selecting After retry and clicking either common block keeps After retry,
  uses its numbers, and preserves its earlier failure and retry log entries.
- Selecting Device offline never produces storage, indexing or notification.
  If a common circle is chosen from that path, it identifies which participating
  recording path will be selected.
- Switching from either completed recording path to Device offline rebuilds
  state from initial values: Offline, None notice, only press and stop log entries.
- Editing `store`, `index`, or `ready` changes every referencing path. Editing
  either notification body changes only its own path. Retry attempts have distinct IDs.
- Hiding a stop in a view does not change authored membership, the shared block
  classification, or carried state. The example itself uses all authored stops.

The source spec is [shared-blocks.spec.json](shared-blocks.spec.json). Build and
browser verification belong to the enclosing renderer change; JSON validation
alone does not establish the appearance of the common tracks.

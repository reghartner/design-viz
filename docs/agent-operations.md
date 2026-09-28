# Making focused changes through the Claude folder session

The same inspectable folder protocol accepts focused operations as well as complete replacement specs. No browser access or transport server is needed. Read `state.json` before planning and use its exact revision. A stale proposal is rejected; reread and reconcile rather than copying a newer revision onto old work.

Before proposing a change, establish the intended target, scope and meaning.
Use the selection captured with the request; later clicks must not retarget it.
An explicit, unambiguous named target takes precedence over selection.
If a request relying on selection names a different object, names are ambiguous, units are missing,
or an old target has changed role, ask a focused question through `reply` and
submit no proposal. Pressure to "just guess" does not resolve those decisions.
Structural validity, stable IDs, dry runs, review and Undo cannot establish user
intent. Use the smallest operation that fulfills a clear request. Full-source
replacement is not a workaround for an unclear request or a rejected reference.

Write a UTF-8 JSON file in the session folder. It may contain an array of operations or an object with `operations` and `dryRun: true`. Submit with:

```sh
python3 folder-agent.py propose --request REQUEST_ID --revision REVISION --operations changes.json --summary 'Clarify checkout'
```

A dry run returns `validated` in `result.json` without changing source or history. To apply, submit a new proposal without `dryRun`; it must still match the current revision. Optional editor review adds a user acceptance step. Cancellation stops acceptance of the current turn, not Claude computation.

All operations require `op` and `sectionId`. Use a unique authored section `id`; use `$root` for a bare diagram. Ordinals and renderer-generated identities are never accepted. Older stories without stable IDs can use complete replacement proposals to add them deliberately.

| Operation | Additional fields | Behavior |
| --- | --- | --- |
| `updateNode` | `nodeId`, `patch` | Sets the named node fields; other fields remain. Cannot rename an ID. |
| `insertStep` | `step`, optional `afterStepId` | Inserts a new step with a unique ID after an existing step, or appends when omitted. Existing path membership is unchanged. |
| `patchPanelState` | `stepId`, `panelId`, `patch` | Sets fields in the step's panel patch. Both step and panel must exist. |
| `addPath` | `path` | Adds a uniquely named path whose step references validate. |
| `replaceSection` | `section` | Replaces one authored section, preserving its ID. For `$root`, replaces the bare diagram. |

```json
{
  "dryRun": true,
  "operations": [
    {"op": "updateNode", "sectionId": "checkout", "nodeId": "payment", "patch": {"title": "Payment accepted"}},
    {"op": "insertStep", "sectionId": "checkout", "afterStepId": "pay", "step": {"id": "receipt", "text": "The customer receives a receipt", "nodes": ["customer"]}}
  ]
}
```

The editor validates the complete resulting story before publication. All operations succeed together as one Undo action or none apply. Limits: 100 operations, 1 MiB operation payload, 4 MiB resulting source, 40 levels of operation nesting. Unknown commands, unknown envelope fields, ambiguous IDs and prototype keys are rejected. If present, `dryRun` must be a boolean; strings such as `"true"` are rejected. Focused operations also reject dangling references and duplicate identities in sections they touch. Patches set fields shallowly; `null` is a value, not a deletion command. Unknown unrelated authored fields are preserved. Full replacement with `--file candidate.spec.json` remains available for edits outside this vocabulary.

Use `progress` for meaningful updates and questions through `reply`. Wait for the matching result, then send a final reply so the user can continue in the editor.

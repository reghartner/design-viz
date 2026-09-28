# Restore whole-document agent authoring

The September 28 rollback restores whole-document proposals as the supported
editing path. It removes the semantic-operation planner, helper flags and
operation-specific evaluation executables. Transport ownership, exact revision
checks, validation, optional review and Undo remain in place.

The improved `hld-to-page` skill and its `evidence-and-updates.md` and
`honesty-rules.md` references are restored byte-for-byte from commit `62a1c7a`.
This retains the preceding skill improvements and removes the subsequent
pressure-test instruction additions.

The [historical intent comparison](agent-intent-testing.md) is preserved as a
record of the experiment, including its original commands and claims about the
then-current API. Those retired commands belong to commit `6df9410`; they do not
describe the current whole-document workflow. Its saved model responses and
case fixtures remain unchanged in `tests/fixtures/agent-intent/`. Other research,
authoring evaluation outputs and scores are not reinterpreted by this rollback.

See [the folder workflow](../folder-agent-session.md) for current agent setup.

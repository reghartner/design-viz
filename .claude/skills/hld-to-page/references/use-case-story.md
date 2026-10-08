# Business story, then engineer enrichment

Use the common skill, worksheet and folder approval protocol. The business
participant can start from a conversation; an HLD or code checkout is not a
prerequisite. Default to Story detail unless the participant specifies another
level. Confirm only missing audience, takeaway, starting state and outcomes.
Use plain names for people, devices, app screens and the backend. Ask technical
questions only when phrased as a decision about what the audience sees.

Record the conversation as source evidence in the coverage ledger. Keep facts,
operator answers, illustrative choices and unanswered questions distinguishable.
Use `version: n/a` for an unversioned conversation. Do not fill gaps with invented
services, APIs, delivery guarantees or success outcomes.

The first handoff is the accepted spec and its ledger in the same diagram
folder. In the ledger, leave an **Engineer handoff** section with:

- the audience, takeaway and accepted story outcomes;
- stable section/path/node IDs anchoring those outcomes;
- plain backend boxes and the responsibilities they summarize;
- the decisions and evidence gaps an engineer should review.

When the engineer continues, read that handoff and the relevant existing
artifact regions. Reuse the same folder, spec, ledger IDs and accepted story.
Ask what technical evidence they are adding and whether the audience should
change. Enrich only from supplied HLD, flow, code/catalog or trace evidence;
record each new source and reconcile contradictions with the prior story.
Add named service hops, bindings and code references where supported. Keep a
Story view and add an engineering view/detail when requested and useful; do not
silently turn a business story into an engineering-only page. Existing layout
stays stable under the common placement rules.

Submit the candidate spec and reconciled ledger together for approval. The
reviewer should be able to see which story decisions were preserved, corrected
or still await evidence. In pilot mode, the engineer's new Claude session adds
to the same capture artifacts; it must not replace the business session.
Each participant authorizes their own session. For a different machine, use the
[pilot folder handoff](pilot-capture.md#business-to-engineer-handoff)
so the ignored local capture archives accompany the spec and ledger.

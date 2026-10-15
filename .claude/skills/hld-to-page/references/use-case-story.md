# Business story, then engineer enrichment

Use the common skill, worksheet and folder approval protocol. The business
participant can start from a conversation; an HLD or code checkout is not a
prerequisite. Default to Story detail unless the participant specifies another
level. Confirm only missing audience, takeaway, starting state and outcomes.
Use plain names for people, devices, app screens and the backend. At Story level,
ask technical questions only as decisions about what the audience sees. For a
Mixed or Engineering diagram with nodes, after checking relevant available
sources, ask any needed catalog or repository access question in plain language.

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
change. Enrich only from verified HLD, flow, code/catalog or trace evidence;
record each new source and reconcile contradictions with the prior story.
Run the common per-node reference discovery against available approved catalogs,
repositories, source links and authorized integrations. Add named service hops,
bindings and code references where verified; record explicit per-node gaps and
attempts without asking a business reader for SHAs or anchors. Keep a
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

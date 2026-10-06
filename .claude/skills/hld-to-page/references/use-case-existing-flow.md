# Existing engineering flow

An engineer can describe a known flow without an HLD. Establish the concrete
trigger, initial state, service hops and last supported outcome; ask for missing
facts that would change the depiction. Default to Engineering detail only when
the request makes that audience clear. Conversation evidence is valid, with
`user description (conversation)` and `version: n/a` in the ledger; code/catalog
and observed trace evidence retain their own sources.

If a diagram already exists, preserve its stable IDs, accepted narrative,
unaffected regions, placement and routing. Use the shared folder's seeded
candidates and base revision. The
[existing edit guide](../../../../docs/folder-agent-existing-edit.md) is sufficient
for a bounded correction; changed paths, topology, evidence scope or story
meaning require the full worksheet and relevant common-skill rules. A missing
ledger requires the reconciliation described in
[evidence and updates](evidence-and-updates.md), not a guessed history.

When enriching a business participant's earlier story, first read the ledger's
**Engineer handoff** section and follow [story and engineer handoff](use-case-story.md).
Preserve its audience, accepted outcomes and stable story IDs; reconcile the
engineer's new evidence and any contradictions before adding technical detail.

For a new diagram of an existing flow, author the semantic graph and worksheet
from the engineer's evidence, then use the production arranger per the common
skill. A flow being described as “existing” does not prove the supplied design
was deployed or that all branches were observed. Mark designed, engineer-stated
and observed behavior separately. Bind only catalog identities and code SHAs
actually supplied. Preserve unknown outcomes and missing acknowledgements as
gaps instead of inventing a happy path.

Propose the complete spec and ledger pair, verify both, and wait for the same
workbench approval as every other route. In pilot mode, capture questions and
correction turns as well as successful proposals.

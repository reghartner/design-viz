# Story brief and engineering handoff

Open **Brief** to read the current story's intent, author answers, decisions,
assumptions and engineering gaps. The connected Claude session supplies
`story.ledger.md`. Refresh the brief after asking Claude to update those notes.
A story can still be viewed and handed off without a connected agent; the
package explicitly records that its ledger is missing.

The brief uses a small, inert formatting vocabulary: text, lists and tables.
The full original ledger remains available below the extracted sections and
is included unchanged in a handoff. Markdown, URLs and HTML inside a ledger
never execute. A missing dedicated section is identified as missing; the
rest of the worksheet remains available to review.

Reading a ledger does not prove it corresponds to the current diagram or that
its claims are correct. The brief labels unknown correspondence explicitly.
When an association is known to be stale, it asks the author to reconcile the
story and ledger before sharing. Read time and current session revision are
not substituted for an actual checked-source revision.

## Attach engineering evidence

Use **Add engineering evidence** to attach a reference and explanation to the
whole story, a named section, a node, or a step with stable identifiers. Choose
whether the evidence needs verification, supports the story, or conflicts
with it. Evidence starts as **Needs verification**. A conflict is presented as
a decision to resolve, rather than replacing the agreed customer outcome.

References may be a URL, a local path, or a document name. This action records
the supplied text; it does not open or copy the referenced file. The editor
stores these annotations under top-level `storyBrief.evidence` through its
normal history, so one Undo removes an attached evidence entry. Existing
story content and stable identities remain unchanged.

## Prepare the package

**Prepare engineering handoff** downloads one ZIP containing:

- `story.spec.json`: the exact editable story snapshot.
- `story.html`: a generated viewer from that same snapshot.
- `story.ledger.md`: the available ledger, or an explicit missing-ledger note.
- `sources.json`: source, service and code references, attached engineering
  evidence, draft provenance, and the ledger's known correspondence state.
- `changes.json`: available agent change receipts. This is not a complete
  history of manual edits.
- `README.md`: review guidance, package contents and a change summary.

The package is a **local draft**. Downloading it does not publish a story to
Backstage, open a pull request, or approve the behavior it describes. Submit
it through the team's normal review process. References identify evidence;
arbitrary local source files are never copied. External media and links
already authored in the story may still require access when viewing it.

A handoff checks that the project and source have not changed while its
ledger and viewer are being prepared. If they changed, prepare it again;
the editor will not silently download a mixture of two story versions.

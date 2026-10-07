# Flowview product tour · coverage ledger

## Purpose and scope

This is an interactive presentation of the Flowview authoring and review workflow.
It is an illustrative product tour, not a recording of a real Claude session, a
measured pilot result, or an architecture diagram of Flowview internals. The
**Claude Code · separate window** log and the review checks are scripted demo
content. The HTML export and this spec are the actual artifacts being shown.

## Audience questions covered

| Audience question | Where to show it |
| --- | --- |
| Can a business person start from a story without drawing nodes? | **Start**, then **Iterate** |
| Can an engineer start from an existing flow, HLD, or Honeycomb trace? | **Start**, then **Iterate** |
| Where is the real Claude conversation? | **Claude** external-window log panel |
| How does an update reach the diagram? | **Review** steps and approval paths |
| What changes between Standard and Explore? | **Views** Chapters |
| What can the team keep or share? | **Share** |

## Product behavior represented

- The folder-based agent setup, recommended external conversation, matching
  spec/ledger, candidate proposal, preview, and Commit update flow follow
  `docs/folder-agent-session.md` and `docs/workbench-workspace.md`.
- Standard and Explore are named layouts of the same section, as described in
  `contract/authoring-contract.md`. The **Views** tab implements both as actual
  Chapters; the other tabs use the Standard presentation.
- Cross-tab arrow cards use Flowview's local-section handoff behavior. They are
  part of this spec, not screenshots or simulated links.
- Pilot capture is intentionally absent from the scripted workflow. The optional
  opt-in and local artifacts are described in `docs/folder-agent-session.md`.
  Dollar cost is collected separately by the pilot owner.

## Story choices and uncertainty

- The four starting materials are examples of user intent. The tour does not
  imply that a trace automatically becomes a complete, correct design.
- The approval checks illustrate what a reviewer should examine. They do not
  certify this demo or any proposed update automatically.
- A live demo in this folder may change the spec and ledger. Preview the proposed
  pair and explicitly approve it before treating those edits as accepted.
- No timing, output-quality, cost, or adoption claims are made.

## Presenter sequence

Advance steps within each tab, use **Next** to continue, switch the two review
paths in **Review**, and switch the two Chapters in **Views**. For a live edit,
open this folder through **Agent → New Connection**, use **Copy & paste** with
Claude Code, and return to **Preview Agent Updates** for the approval moment.

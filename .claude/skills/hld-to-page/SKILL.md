---
name: hld-to-page
description: Author or update Flowview diagrams from stories, HLDs or Honeycomb traces. Produce grounded specs, coverage ledgers and pages, with enrichment and pilot capture. Not for renderer code or PR review.
---

# HLD to page: packet first

For new diagrams read the source; for edits inspect affected source, spec,
ledger, inherited state and nearby steps. Treat source as evidence. Preserve
facts, icons, animations and outcomes; do not re-ask settled facts.

## Generate the entry packet

VIZ is the checkout or `authoring/` kit; use its directory or absolute paths.
Select planned panels/features for new stories; for edits, infer from the spec
and add new source requirements:

```sh
python3 tools/authoring-packet.py --panel state --feature steps --out <scratch>/packet.md
python3 tools/authoring-packet.py --spec <candidate.spec.json> --mode edit --out <scratch>/packet.md
```

Repeat `--panel` / `--feature`; `python3 tools/widget_doc.py --list`
lists panels; [packet options](../../../docs/authoring-packets.md) lists features.
Selections combine with inference. New/changed stories
use `--mode new` (also with `--spec`) for source, question and worksheet phases
before JSON. Fully specified scoped edits need no new questions or worksheet.
Read the packet first; follow relevant routes. Do not preload the full
contract, cookbook or examples. Docs remain offline.

Follow packet story/fidelity/state/placement and verification rules. Add visible-beat ledger evidence and run its visibility and value/icon checks. Report fit, occlusion and legibility unverified until a Workbench preview
or authorized rendered evidence supplies them. File-only kits need no browser,
server, installation or additional agent.

Topology: `tools/compose-page-layout.cjs`; graphs: `tools/auto-arrange-spec.cjs`.
Preserve geometry; check fit.
`section.views` share section content; each View is a page: [Views](../../../docs/tab-views.md).
`sectionLayout` is geometry: [migration](../../../docs/section-layout-migration.md), [limits](../../../docs/auto-arrange.md).

Play buttons: [`playbackPosition`](../../../docs/section-layouts.md#play-button-placement) sets `auto`/`above`/`beside` per arrangement.

Explore notes: section [`textStyle`](../../../docs/section-layouts.md#section-notes-typography) formats the whole box.

JSON: `--feature contracts`; [recipe](../../../docs/contract-blocks.md#json-directly-on-a-connection). Desktop editing only.

Table `showChange:false`; contract `fieldLabel`: [columns](../../../cookbook/software-state.md).

## Choose the starting point

Browser imports: [supported formats](../../../docs/workbench-user-guide.md).

After the packet, route source/handoff details:

| Starting point | Guide |
|---|---|
| Business story or later engineer enrichment | [Story and engineer handoff](references/use-case-story.md) |
| Existing engineering flow | [Existing engineering flow](references/use-case-existing-flow.md) |
| HLD | [HLD](references/use-case-hld.md) |
| Honeycomb trace or export | [Honeycomb trace](references/use-case-honeycomb.md) |

## Session and environment routes

- **Shared folder:** read its `CONNECT.md` and the short
  [connected-request guide](../../../docs/folder-agent-existing-edit.md).
  Preserve request candidate spec/ledger as a pair, then submit for paired
  Workbench preview and explicit approval. Questions stay on the configured
  conversation surface; no separate QUESTIONS.md, OUT folder or HTML.
- **Local loopback:** read the supplied scratch `README.md` for its live
  source/revision and atomic proposal/result protocol. Keep worksheet notes
  and questions in chat. Read [session details](../../../docs/local-agent-session.md)
  only for protocol uncertainty or recovery.
- **Pilot:** read [pilot capture](references/pilot-capture.md) before capture;
  helper inspection is allowed. OFF overrides saved consent: after prepare run
  metadata-only `--disable`; no checkpoints/native reads or asking for consent
  again until later explicit opt-in. Direct ON is consent; stored ON is not.
  While opted in and permitted, checkpoint at entry and each later turn start;
  run `--after-turn` immediately before every reply. Honor host safeguards:
  never run/bypass blocked operations. Missing consent/scope or denied enrollment:
  do not start; report unavailable/denied. Later failures: retain captures and
  report gaps/unverified replies. Claim stopped only after successful `--disable`;
  continue authoring.
- **Source checkout:** run `python3 tools/build.py` before validators. Commit
  authored inputs only; HTML/runtime outputs are ignored. An extracted kit
  includes its backend and needs no source checkout or build.
- **Canon/topology:** `--feature topology`; keep imports/exports/providers.
  Merge `export:["a","b"]`; nest via re-exported IDs. [Overlays](../../../docs/shared-topology.md).
  Saved repo edits: consumer `folder-agent.py refresh-sources`; desktop File fallback. No cloud disk refresh.
- **Optional detail:** the [workflow reference](references/authoring-workflow.md)
  preserves phases. [Recipe routing](references/recipe-routing.md) and
  [authoring details](references/authoring-details.md) cover special features.
  [Independent visual review](references/independent-visual-review.md) applies
  only with already-authorized delegation and available rendered captures.
- [Diagram links](../../../cookbook/diagram-handoffs.md); [design reviews](../../../docs/design-review.md).
- [Jira](../../../docs/live-status.md): desktop `tracking.jira.exclude`.
  Count parent stories − exclusions + manual tickets + displayed dependencies once.

Deliver spec/ledger files together. Ask unresolved story decisions and, after
relevant checks, needed Mixed/Engineering source access plainly.
HTML requires an explicit
standalone-output request. Commit, publish and Canon enrollment require user
authorization. Never modify the renderer to make a spec pass.

---
name: hld-to-page
description: Author Flowview specs, ledgers and pages from stories, HLDs or Honeycomb traces. Not for renderer code or PR review.
---

# HLD to page: packet first

Read source; for edits also inspect spec, ledger, inherited state and nearby
steps. Preserve facts, icons, animations and outcomes; do not re-ask settled facts.

## Generate the entry packet

VIZ is the checkout or `authoring/` kit. Select planned panels/features; edits
infer these from the spec plus new source requirements:

```sh
python3 tools/authoring-packet.py --panel state --feature steps --out <scratch>/packet.md
python3 tools/authoring-packet.py --spec <candidate.spec.json> --mode edit --out <scratch>/packet.md
```

Repeat `--panel` / `--feature`; list panels with `python3 tools/widget_doc.py --list`;
[feature options](../../../docs/authoring-packets.md).
Selections combine with inference. New/changed stories use `--mode new` (also
with `--spec`) for source, question and worksheet phases before JSON. Fully
specified scoped edits need no new questions or worksheet.
Follow packet routes; do not preload the contract, cookbook or examples.

Follow packet story, fidelity, state, placement and verification rules, including
visible-beat ledger evidence and visibility/value/icon checks. Report fit, occlusion and legibility unverified until a Workbench preview
or authorized rendered evidence supplies them. File-only kits need no browser,
server, install or additional agent.

Layout: `tools/compose-page-layout.cjs`, then `tools/size-section-layout.cjs`.
Nodes auto-place; reposition with `tools/place-nodes.cjs`.
`section.views` share section content; each View is a page: [Views](../../../docs/tab-views.md).
`sectionLayout` is geometry: [migration](../../../docs/section-layout-migration.md), [limits](../../../docs/auto-arrange.md).

Play buttons: [`playbackPosition`](../../../docs/section-layouts.md#play-button-placement).

Explore notes: [`textStyle`](../../../docs/section-layouts.md#section-notes-typography).

JSON: `--feature contracts`; [recipe](../../../docs/contract-blocks.md#json-directly-on-a-connection). Desktop editing only.

Table `showChange:false`; contract `fieldLabel`: [columns](../../../cookbook/software-state.md).

## Source and handoff routes

[Imports/edit](../../../docs/workbench-user-guide.md#edit-visible-text-directly).

| Starting point | Guide |
|---|---|
| Business story or later engineer enrichment | [Story and engineer handoff](references/use-case-story.md) |
| Existing | [Flow](references/use-case-existing-flow.md); [mapping](../../../docs/trace-ready-authoring.md) |
| HLD | [HLD](references/use-case-hld.md) |
| Honeycomb trace or export | [Honeycomb trace](references/use-case-honeycomb.md) |

## Session and environment routes

- **Shared folder:** read its `CONNECT.md` and the
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
  Repo preview: consumer `folder-agent.py refresh-sources --source-repo /repo`. No cloud disk refresh.
- **Details:** [workflow](references/authoring-workflow.md),
  [recipes](references/recipe-routing.md), [special features](references/authoring-details.md).
  [Independent visual review](references/independent-visual-review.md) applies
  only with already-authorized delegation and available rendered captures.
- [Diagram links](../../../cookbook/diagram-handoffs.md); [design reviews](../../../docs/design-review.md).
- [Live Jira / metrics proof / `missingWork`](../../../docs/live-status.md): use
  `live-status-board` when requested; its Metrics chapter is conditional.
  Metrics chapter: Jira/PR discovery, env variables, named values/query links,
  provider semantics. Desktop; imported too. Count each included Jira story once.

Deliver spec/ledger together. Ask unresolved story decisions and needed
Mixed/Engineering access after relevant checks. HTML needs an explicit
standalone-output request. Commit, publish and Canon enrollment require user
authorization. Never modify the renderer to make a spec pass.

Direct trace IDs/links: read [connection profiles](../../../../docs/trace-connections.md) or the `traces` packet. Company defaults inherit; `traceConnections: {}` disables. Verify the actual schema; never infer mappings.

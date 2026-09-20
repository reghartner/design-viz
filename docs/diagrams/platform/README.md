# Flowview: from design to living evidence

Presentation edition, September 20, 2026. Based on implementation commit
`aac72e037a8b9cbc885135b9f8b59b4611dd8ed8`.

Open [the presentation overview](index.html), then launch the
[interactive tour](flowview-platform.html). The HTML is self-contained and can
be opened directly from disk. Source links need a network connection only when
you follow them. The editable [spec](flowview-platform.spec.json) and
[coverage ledger](flowview-platform.ledger.md) accompany the page.

## Present it

Use a desktop browser. Each chapter opens paused. **Presentation** gives the
diagram the full width; **Diagram + panels** puts the supporting state alongside
it. Chapters 1, 3 and 6 also offer **Backstage close-up** for the actual screenshots.
The image is static reference material; the flow and its step controls remain live.

Choose **PRESENT** for fullscreen. Arrow keys advance/reverse steps, Space toggles
play/pause, 1–8 select chapters, and Escape exits. **AMBIENT** shows the complete
topology; **STEP** returns to the guided story. Alternate chips start at the same
shared lead-in and branch at the first different beat.

For a roughly 12-minute talk, use the sequence below. Timings are suggested
speaking time, not system latency.

| Chapter | Time | Talk track | Show |
|---|---|---|---|
| 1 · Ownership | 1½ min | “The designs repo owns our stories and evidence. The Flowview fork owns the engine. Backstage pins its own installed viewer.” | Start in Ambient for the whole map, then Step through the release and JSON-read boundaries. |
| 2 · Author | 1½ min | “Catalog import seeds identities and API choices. The author still owns behavior and code references.” | Walk the catalog PR into the nginx image; switch to **Refresh failed** to show the approved snapshot survives. |
| 3 · Backstage | 2 min | “A service knows which diagrams mention it. Readers can follow the story and jump to code, APIs or the external editor.” | Use **Backstage close-up**, then return to Presentation. Show **Revision changed** ending before native mount. |
| 4 · Detect drift | 1½ min | “We watch the code that supports a step. A changed region produces a diff and every affected story.” | Compare **Changed source**, **No drift**, and **Reference unreadable**. A source scan does not prove behavioral impact. |
| 5 · Human review | 2 min | “The same source diff can mean a harmless refactor, a regression, or a deliberate new design.” | Show the four disposition chips. No-impact advances the reviewed pin; regression preserves expected behavior; intended change gets a spec PR. Plain closure accepts nothing. |
| 6 · Trace evidence | 1 min | “Canon is what we expect; traces are what we observed. An incident becomes a separate alternate for review.” | Step to the isolated overlay. Missing telemetry stays unknown. The screenshot is an authored timeout example, not a trace-generated incident. |
| 7 · Ship features | 1 min | “A new panel is one module using shared behavior. Its release reaches every host through the same assembly.” | Show **Backstage behind**: compatibility messaging explains the gap without downloading executable code. |
| 8 · Rehearsal | 1½ min | “We can reproduce the loop with fictional doorbell code and a real Backstage installation.” | Compare **Non-breaking change** with **Breaking change**. Source tests establish sample behavior; the scanner establishes source drift. |

For a shorter executive walkthrough, use chapters **1 → 3 → 4 → 5 → 8**.
For an engineering follow-up, add **2 → 6 → 7**.

## Slide-ready assets

These PNGs show the actual generated diagrams in Ambient mode, including their
headings and legends. The interactive page contains the changing state and
alternate timelines; the PNGs are static topology views.

| Diagram | Image |
|---|---|
| Ownership | [diagram-01.png](assets/diagram-01.png) |
| Catalog and authoring | [diagram-02.png](assets/diagram-02.png) |
| Native Backstage read flow | [diagram-03.png](assets/diagram-03.png) |
| Code drift detection | [diagram-04.png](assets/diagram-04.png) |
| Human review decisions | [diagram-05.png](assets/diagram-05.png) |
| Reference and incident traces | [diagram-06.png](assets/diagram-06.png) |
| Engine and panel releases | [diagram-07.png](assets/diagram-07.png) |
| End-to-end rehearsal | [diagram-08.png](assets/diagram-08.png) |

Full-size product captures are also included:
[happy-path Home](assets/backstage-native-home.jpg),
[node code/API links](assets/backstage-native-links.jpg), and
[storage timeout](assets/backstage-native-timeout.jpg).

The captures use the current native plugin in an isolated **real local Backstage**
host with the fictional doorbell rehearsal data and Guest sign-in. They are not
company production screenshots. The capture verified a native viewer and zero
iframes. Company SSO, visibility rules, installed CSP and deployment require the
company's integration acceptance.

## Details worth keeping precise

- HLD designs and reviewed canonical flows coexist. Appearance in Backstage does
  not itself confer canonical approval.
- Backstage fetches authorized, revision-pinned JSON through its host proxy.
  Its trusted, bundled renderer mounts in an owned ShadowRoot. Shadow DOM is
  style/DOM ownership, not a security sandbox.
- Catalog seeding is daily. The shared drift workflow runs weekday mornings;
  the portable rehearsal has a separate daily drift template. These schedules
  are configured workflows, not a real-time monitoring guarantee.
- Report PRs do not accept their own findings. Permission, source evidence and
  Git policy still gate a disposition. An agent can help author a proposed change;
  the scanner does not automatically run one.
- The complete illustrated spec is too large for the 128 KiB manual Forge
  snapshot limit. Use this portable HTML for the presentation, or prepare a
  smaller chapter for manual Confluence import. No limits were changed.

## Update this set

Edit the spec and its ledger; do not edit generated HTML. From the repository root:

```sh
node tools/compatibility.js --stamp docs/diagrams/platform/flowview-platform.spec.json > /tmp/flowview-platform-versioned.json
cp /tmp/flowview-platform-versioned.json docs/diagrams/platform/flowview-platform.spec.json
python3 tools/page_build.py docs/diagrams/platform/flowview-platform.spec.json
```

Require zero validation errors and warnings. Walk every path, inspect the visible
panel state, and recapture the corresponding PNGs from the actual generated page
when the diagram changes. Capture screenshot panels only from the authorized
fictional rehearsal or an explicitly approved source. Preserve their provenance.

Implementation references: [Backstage integration](../../backstage-integration.md),
[catalog sync](../../workbench-catalog-sync.md),
[drift automation](../../github-drift-automation.md),
[release compatibility](../../runtime-compatibility.md),
[panel modules](../../panel-modularity.md), and
[portable rehearsal](../../../examples/backstage-e2e/README.md).

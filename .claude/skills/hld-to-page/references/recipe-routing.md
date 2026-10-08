# Which recipe or doc to read

Paths are relative to VIZ. Load only the rows you need. Start from the closest
complete cookbook example and replace its facts; do not copy its latency,
topology, notification or outcome without evidence.

| Needed behavior | Read |
|---|---|
| Shared happy/failure paths, dropped or blocked sends | `cookbook/alternate-paths.md`, `docs/alternate-paths.md`, `docs/failed-communications.md` |
| Phone home screen, device app cards, notifications, backend sources, freshness | `cookbook/device-app-sources.md`, `python3 tools/widget_doc.py deviceapp phone` |
| Shared icons, per-step card icons, company branding | `docs/shared-icons.md`, `examples/shared-icons/shared-icons.spec.json` |
| Battery drain, low battery, charging | `cookbook/battery-level.md`, `python3 tools/widget_doc.py battery` |
| Messaging architecture costs, alternative buses, visual cost differences, compact cost charts | `cookbook/messaging-cost.md`, `python3 tools/widget_doc.py cost`; start from `src/starters/messaging-cost.json` |
| Hot/cold devices, protective shutdown, temperature recovery | `cookbook/thermal-protection.md`, `cookbook/temperature.md`; `homemap`, `thermo`, `screen`, `battery` widget docs |
| Physical home, outside grounds, doors | `cookbook/home-story.md`, `cookbook/outdoor-home.md`, `docs/homemap-workbench.md` |
| Camera state versus scene event | `cookbook/camera-events.md`, `python3 tools/widget_doc.py screen` |
| Motion, range, room presence | `cookbook/motion-detection.md`, `cookbook/radar-range.md` |
| Two-way audio, chimes, sirens, sound detection | `cookbook/audio-storytelling.md` |
| Security monitoring, alarm verification, dispatch | `cookbook/security-response.md`, `python3 tools/widget_doc.py security dispatch` |
| Exported app screens that change per step | `cookbook/app-screens.md`, `python3 tools/widget_doc.py appscreens` |
| Small embedded screenshots or illustrations | `cookbook/embedded-images.md` |
| Engineering and business views of one timeline | `cookbook/two-perspectives.md`, `docs/section-layouts.md` |
| Named views, Standard/Explore presentation, selected playback stops, host profiles | `docs/section-layouts.md` |
| Color-coded phases in one timeline | `docs/step-colors.md` |
| Several message contracts in one section or step wire payload previews | `docs/contract-blocks.md` |
| Domain overview with focused internals | `cookbook/domain-drilldowns.md`, `docs/drilldowns.md` (`mode: "focus"` only) |
| Extracting selected nodes from a branched or custom-layout flow | `docs/drilldowns.md#extract-an-independent-diagram`; preserve the overview story, create an independent destination with no inherited timeline; preview reference changes and download external destinations before applying |
| Endpoints continuing in another diagram | `cookbook/diagram-handoffs.md` (`node.handoff`) |
| Queue, buffer, retry, replicas, rollout, software state | matching recipe in `cookbook/README.md` |
| Honeycomb trace import or measured timing | `docs/trace-import.md` |
| Backstage bindings, code refs, canon, incidents | [bindings and code](bindings-and-code.md), [integrations](integrations.md), `docs/canon.md` |
| Confluence export | [integrations](integrations.md) → Confluence |
| Renderer version requirements | `docs/runtime-compatibility.md` |
| Handing a diagram to a human editor: Starting state controls, notification composer, carry vs this-step-only (`enterOnce`), panel visibility, drilldown mappings, fragment visibility by path position, bullet and prose editing, custom protocols | [authoring details](authoring-details.md) → Human handoff in the workbench; the workbench User guide |
| Auto arrange, stable raw node insertion, explicit manual graph geometry, or Home layout editing | [authoring details](authoring-details.md) |
| Source changed; paired source/spec fix | [evidence and updates](evidence-and-updates.md) |

## Presentation defaults

- Target desktop and the intended Backstage/Confluence content widths. Test
  phone widths only when asked.
- `diagram.primaryPanel` makes a panel (often the `homemap`) the centerpiece.
- Use panel `visible: false` plus step `panelVisibility` to show a panel only
  when it matters; this is different from device-app card `visible`.
- Let the pure Node `tools/compose-page-layout.cjs` command arrange new graph
  topology, panels and step controls after writing semantic content. Preserve an existing
  spec's rows, floats, positions, ports, route fields and panel rectangles unless
  the user requests a rearrangement.
  Omit `diagram.routing` unless lanes are requested.
- `diagram.brand` shares a company name/mark across phone, device app, camera
  and security panels. Use only an approved mark or a library icon; never
  invent a company's identity.
- Preserve an existing spec's IDs, routing choice and layout when editing.

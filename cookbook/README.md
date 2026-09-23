# Cookbook — recipes for authoring agents

One file per common request. Small recipes contain a COMPLETE page spec in a
```json fence that renders standalone — copy it, adapt ids/labels/values, and
run the loop below. `tests/test_cookbook.py` extracts every ```json fence in
this directory and requires the real validator to report **0 errors and
0 warnings** on it, so a recipe cannot drift from the engine. Partial
fragments (per-step patches, single panels) use plain fences and are not
standalone specs.
Larger teaching seeds link their complete spec, source and ledger instead of
duplicating the JSON; their dedicated checks are named in the recipe.

## The loop (every recipe ends here)

```
node tools/validate.js my.spec.json          # 0 errors required; fix what it names
python3 tools/inject.py my.spec.json template/flowview.html out.html
open out.html                                 # or serve it; reload after each edit
```

Never edit a built HTML page — they are generated (`tools/build.py` +
`tools/inject.py`); the spec JSON is the only source.

## Recipes

| You were asked for… | Recipe |
|---|---|
| a camera phone UX whose fields come from different backend services | [Device app sources](device-app-sources.md) — doorbell refresh and partial outage |
| a Confluence-ready export or JSON to paste into the Flowview macro | [Confluence handoff](../docs/confluence.md) |
| small screenshots or illustrations stored inside the spec | [embedded-images.md](embedded-images.md) |
| happy and failure outcomes on one diagram, shared steps, or a dropped/blocked communication | [alternate-paths.md](alternate-paths.md) |
| a domain overview that opens service internals as focused drilldowns, nested flows, or mapped child outcomes | [domain-drilldowns.md](domain-drilldowns.md) — doorbell domains, boundaries and mailbox |
| a large home map, live Home / Data flow switching, device states, or draggable placement | [home-story.md](home-story.md) |
| security monitoring, alarm verification, emergency dispatch, responder assignment or arrival | [security-response.md](security-response.md) — independent assessment and response with alternate outcomes |
| a detailed engineering flow and rich business-user story sharing every step and alternate | [two-perspectives.md](two-perspectives.md) — annotated source, storyboard and complete seed |
| outdoor cameras/sensors around a house, a porch/entry split, or doors in walls | [outdoor-home.md](outdoor-home.md) |
| two-way conversation, operator talk-down, device sounds, chimes, sirens, sound detection or audio failures | [audio-storytelling.md](audio-storytelling.md) — shared endpoint audio and the complete Sound at the door seed |
| a color camera clip, doorbell runners, or recording before the visible event | [camera-events.md](camera-events.md) |
| database/cache/payload state, decision gates, or resource limits | `software-state.md` |
| retry attempts, backoff, deadline admission, or circuit recovery | `retries-and-circuits.md` |
| replica positions, read-your-writes tokens, lag, or device/cloud versions | `replica-positions.md` |
| canary promotion, traffic rollback, firmware trial/confirmation, or held rollout waves | `rollout-decisions.md` |
| a Honeycomb trace turned into an editable diagram | [`../docs/trace-import.md`](../docs/trace-import.md) (input and CLI guide) |
| a temperature readout with warning / shutdown thresholds | `temperature.md` |
| a hot or frozen Home device, charging pause, camera unavailability and thermal recovery | [thermal-protection.md](thermal-protection.md) — complete interactive teaching flow |
| a battery / charge level that drains and raises a low event | `battery-level.md` |
| motion detection — sensing geometry, an approach, and an authored event | `motion-detection.md` |
| Radar range, zones, targets, occupancy, or manual alert transitions | `radar-range.md` |
| Wi-Fi/link health, retries, or a weak connection | `link-health.md` |
| several devices in a fleet overview | `fleet-dashboard.md` |
| camera recording buffers and dropped or retained frames | `recording-buffer.md` |
| a message TO the camera that wakes it (mailbox + wake line) | `wake-message.md` |
| traffic that exists only over a persistent connection while the SoC is awake | `persistent-when-awake.md` |
| messages FROM the camera that ride the low-power chip over MQTT | `camera-to-cloud-via-lp-mqtt.md` |
| SoC egress that chooses persistent connection OR MQTT via the LP chip | `soc-egress-routing.md` |
| "move that up and to the right a little" — any visual adjustment | `adjustments.md` |

For the editor itself, see [workspace sizing and focus](../docs/workbench-workspace.md),
[step editing](../docs/workbench-steps.md), [copying/sharing steps](../docs/workbench-step-reuse.md),
and [effective panel state](../docs/workbench-state-inspector.md).

## Ground rules that apply to every recipe

- The full spec format lives in `contract/authoring-contract.md`; recipes show
  the WORKING SUBSET for one task and never contradict the contract.
- Panels are patched SPARSELY per step; the engine folds patches into complete
  state, so any step jump renders correctly. Patch only what changed.
- Alternate paths use one step registry. Shared IDs share content; a different
  outcome needs its own ID at the first differing beat. State folds through
  the selected path only, including any shared ending. See the alternate recipe.
- Geometry and alarm decisions are separate. Radar computes distance and zone
  occupancy; its `alert` is authored with explicit true/false transitions and
  never inferred from geometry. Thermo/battery bands and budget comparisons
  compute from sourced values and limits. `checks` outcomes, `table` change
  badges and `zoneframe.verdict` are authored; they do not run system rules or
  prove a real-world decision.
- Every step needs content (an edge, nodes, a panel patch, or `failures`), and each
  edge-bearing step needs a DISTINCT first edge or its number coin lands on
  another step's coin (the validator lint names both steps when this happens).

- [Canonical flows and incident traces](canonical-incidents.md): connect real
  catalog/code identities, approve a reference, and derive evidence-aware alternates.

For fan-out endpoints that continue in separate documents, use [diagram handoffs](diagram-handoffs.md). Local domain zooms still use focused drilldowns.

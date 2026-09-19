# Use-case × widget matrix and gap decision

Inputs: `iot-device-catalog.md` (159 use cases, 85 diagram patterns) and
`iot-market-scan.md` (2026 lineups, ~95 sources). This matrix records the
original IoT research themes and current panel choices. The supported set is
discovered from `src/panels/types/`; consult `contract/authoring-contract.md`
and `tools/widget_doc.py <type>` for current fields and behavior.

## 1. What the existing widgets already carry

| Use-case group | Carried by |
|---|---|
| Wake-on-motion, line-of-sight, approach event | `radar` geometry plus explicit `alert` state |
| Detection zones in a frame, privacy masking | `zoneframe` |
| Chip power states, alarm modes, call states | `state`, `orbit` |
| Radio TX/RX, status LEDs, bystander indicators | `leds` |
| Power draw, storage %, generic levels | `gauge` |
| Thermal envelope, any high-is-bad threshold | `thermo` |
| Event/firmware logs, audit trails | `log` |
| Viewfinder, live/rec/save overlays | `screen` |
| Latency budgets, timing chains | `waterfall` |
| Who-can-decrypt-where (E2EE, HKSV) | `xray` |
| Held commands, store-and-forward mailbox | `queue` |

## 2. Implemented panels from the original gap analysis

1. **`battery`** — charge level where LOW is bad: charge %, charge/drain
   direction, low/critical thresholds (inverted vs thermo), authored notes,
   source badge (solar / wired / PoE / cells), cold-condition flag. Covers: battery preservation, solar budget, cold-weather charging,
   quick-release swap, 2-year-AA architectures. See `cookbook/battery-level.md`.
2. **`buffer`** — a ring/linear buffer timeline strip: segments in states
   (empty / buffered / protected / uploading / uploaded / dropped), a
   write head, capacity label. Covers: pre-roll ring buffers, offline
   store-and-forward, SD/NVR rotation with protected events, data-cap
   queueing, outage reconciliation.
3. **`radar`** — top-down sensing view: distance rings, a reference arc,
   tracked subject with a path trail, and named zones with computed occupancy.
   Alert decisions are explicit `alert:true` / `alert:false` patches; neither
   distance nor occupied zones infer an alarm. Covers visit paths, room geometry
   and approach-before-camera-wake stories. Preserve source hardware names,
   including PIR or mmWave; the panel does not simulate their detection policy.
4. **`signal`** — link-health panel for up to six named links: signal bars,
   state (ok / weak / retrying / lost / jammed), transport tag (wifi / sub-GHz
   / thread / cellular / PoE). Covers: offline behavior, cellular failover,
   mesh supervision, jamming detection, range-extender hops.
5. **`tiles`** — a device-fleet grid: N named tiles each with a state chip and
   optional sub-line (battery %, fw version). Covers: multi-camera dashboards,
   health/coverage overview, staged firmware rollout cohorts, walk-test
   progress, coordinated-mode partial application.

Additional capabilities now exist: `homemap` provides shared floor plans and
per-step physical state; `budget` compares sourced resource values with limits.
Use `state` and `queue` for intercom flows and `tiles` for rollout cohorts.
Choose from the current contract before proposing another panel.

## 3. Fictional universe — family assignments (one fictional org per archetype)

| Family (fictional org / product) | Real-world archetype | Key flows | Widgets leaned on |
|---|---|---|---|
| doorbuzz-cloud / Chime (EXISTS) | battery doorbell | motion→clip, thermal | radar, thermo, queue |
| doorbuzz-cloud / Chime Radar | radar doorbell (Ring/Ecobee-like) | authored alerts with range context, visit path map | radar, zoneframe |
| halovista / Aegis | cloud ecosystem + E2EE tier + human guard | E2EE enrollment, AI search, agent talk-down | xray, state, log, screen |
| nestrel / Warden | cloud cam with offline buffer (Nest-like) | wifi drop → 1 h local buffer → reconcile upload | buffer, signal, log |
| basecraft / Keep | local AI hub + fleet (eufy-like) | hub face rec, cross-camera tracking, 16 TB rotation | tiles, buffer, screen |
| wrenlight / Perch | 2-yr AA battery cam + sync module (Blink-like) | sub-GHz relay, wake budget, battery math | battery, signal, queue |
| gridseye / Bastion | PoE NVR fleet (UniFi-like) | camera-edge AI, UPS power domain, staged fw rollout | tiles, signal, waterfall |
| farwatch / Sentinel | cellular off-grid solar cam (Reolink Altas/Arlo Go-like) | solar energy budget, 24/7 on battery, data caps | battery, buffer, signal |
| hearthline / Sentry Panel | monitored alarm (SimpliSafe-like) | cellular backup path, dispatch, walk test | state, queue, tiles, signal |
| loomworks / Trellis | camera-as-hub Matter/Thread (Aqara-like) | border-router failover, local automations offline | signal, orbit, state |
| auralis / Presence | mmWave room sensor (FP2-like) | multi-zone presence, fall alert chain | radar, state, log |

(Name fix: hearthline's panel product is "Sentry Panel"; nestrel keeps
"Warden". HLD authors must not reuse a product name across orgs.)

## 4. Implementation and authoring notes

- HLDs name hardware, flows and evidence; panel names are presentation choices.
  Keep factual PIR hardware mentions even though the old PIR panel is removed.
- A panel is one complete `src/panels/types/<type>.js` definition: validation,
  state, rendering, authoring controls/metadata, styles, references and release
  metadata. Shared helpers remain in `src/panels/shared.js`; follow
  `docs/panel-modularity.md`. No per-type edit to `src/engine.js` or import list
  is required. Coordinate separately when a change affects a shared primitive.
- Headless model checks use `tools/source-loader.cjs` and
  `readSource('validator.js')`, adding `readSource('engine.js')` for engine
  helpers. Direct raw-file reads skip the registered modules.
- Keep source, storyboard and spec facts aligned; validate complete specs with
  zero errors and warnings and inspect the intended desktop/embed surfaces.
- Library pages live under `examples/<family>/` and are listed in
  `examples/manifest.json`. Rebuild generated pages from their authored specs.

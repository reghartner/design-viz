# Use-case × widget matrix and gap decision

Inputs: `iot-device-catalog.md` (159 use cases, 85 diagram patterns) and
`iot-market-scan.md` (2026 lineups, ~95 sources). Current widgets: `state`,
`leds`, `gauge`, `log`, `screen`, `waterfall`, `orbit`, `zoneframe`, `xray`,
`queue`, `pir`, `thermo`.

## 1. What the existing widgets already carry

| Use-case group | Carried by |
|---|---|
| Wake-on-motion, line-of-sight, approach trip | `pir` |
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

## 2. Gaps — five new widgets (build order)

1. **`battery`** — charge level where LOW is bad: charge %, charge/drain
   direction, low/critical thresholds (inverted vs thermo), forecast text,
   source badge (solar / wired / PoE / cells), temperature-limited-charging
   flag. Covers: battery preservation, solar budget, cold-weather charging,
   quick-release swap, 2-year-AA architectures. Closes the documented gap in
   `cookbook/battery-level.md`.
2. **`buffer`** — a ring/linear buffer timeline strip: segments in states
   (empty / buffered / protected / uploading / uploaded / overwritten), a
   write head, capacity label. Covers: pre-roll ring buffers, offline
   store-and-forward, SD/NVR rotation with protected events, data-cap
   queueing, outage reconciliation.
3. **`radar`** — top-down range view: concentric distance rings, a threshold
   arc, tracked subject with a path trail and per-step position, named
   presence zones with occupancy. Covers: radar/mmWave motion thresholds,
   aerial visit-path maps, multi-zone presence / fall detection, approach
   trajectory before camera wake. (Distinct from `pir`: distance + track,
   not a binary cone.)
4. **`signal`** — link-health panel for 1–4 named links: bars or RSSI value,
   state (ok / weak / retrying / lost / jammed), transport tag (wifi / sub-GHz
   / thread / cellular / PoE). Covers: offline behavior, cellular failover,
   mesh supervision, jamming detection, range-extender hops.
5. **`tiles`** — a device-fleet grid: N named tiles each with a state chip and
   optional sub-line (battery %, fw version). Covers: multi-camera dashboards,
   health/coverage overview, staged firmware rollout cohorts, walk-test
   progress, coordinated-mode partial application.

Explicitly NOT building: floorplan/map (zoneframe + radar cover the spatial
arguments), call-flow intercom (state + queue carry it), allocation budgets
(gauge + buffer carry them), rollout-specific widget (tiles express cohorts).

## 3. Fictional universe — family assignments (one fictional org per archetype)

| Family (fictional org / product) | Real-world archetype | Key flows | Widgets leaned on |
|---|---|---|---|
| doorbuzz-cloud / Chime (EXISTS) | battery doorbell | motion→clip, thermal | pir, thermo, queue |
| doorbuzz-cloud / Chime Radar | radar doorbell (Ring/Ecobee-like) | distance-gated alerts, visit path map | radar, zoneframe |
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

## 4. Execution notes

- HLD authoring is independent of the new widgets — HLDs name flows, not
  widget types. It fans out NOW.
- Widget builds are SERIALIZED on `src/engine.js` in the order above
  (battery → buffer → radar → signal → tiles), each with model + render +
  CSS (both skins + reduced motion + unchanged-markup skip compliance) +
  validator + node tests + contract entry + cookbook recipe.
- Spec/page authoring per family starts when its leaned-on widgets exist.
- Every page lands in `examples/<family>/` plus a row in
  `examples/manifest.json` for the index build.

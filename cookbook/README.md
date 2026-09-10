# Cookbook — recipes for authoring agents

One file per common request. Each recipe contains a COMPLETE page spec in a
```json fence that renders standalone — copy it, adapt ids/labels/values, and
run the loop below. `tests/test_cookbook.py` extracts every ```json fence in
this directory and requires the real validator to report **0 errors and
0 warnings** on it, so a recipe cannot drift from the engine. Partial
fragments (per-step patches, single panels) use plain fences and are not
standalone specs.

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
| a temperature readout with warning / shutdown thresholds | `temperature.md` |
| a battery / charge level that drains and raises a low event | `battery-level.md` |
| motion detection — a sensor cone, an approach, a trip | `motion-detection.md` |
| a message TO the camera that wakes it (mailbox + wake line) | `wake-message.md` |
| traffic that exists only over a persistent connection while the SoC is awake | `persistent-when-awake.md` |
| messages FROM the camera that ride the low-power chip over MQTT | `camera-to-cloud-via-lp-mqtt.md` |
| SoC egress that chooses persistent connection OR MQTT via the LP chip | `soc-egress-routing.md` |
| "move that up and to the right a little" — any visual adjustment | `adjustments.md` |

## Ground rules that apply to every recipe

- The full spec format lives in `contract/authoring-contract.md`; recipes show
  the WORKING SUBSET for one task and never contradict the contract.
- Panels are patched SPARSELY per step; the engine folds patches into complete
  state, so any step jump renders correctly. Patch only what changed.
- The engine COMPUTES verdict-like state (a pir subject's tripped/clear, a
  thermo zone) from declared geometry/thresholds — author inputs, not
  conclusions.
- Every step needs content (an edge, nodes, or a panel patch), and each
  edge-bearing step needs a DISTINCT first edge or its number coin lands on
  another step's coin (the validator lint names both steps when this happens).

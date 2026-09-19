# Canary and firmware rollout decisions

Choose **Start new project → Rollout decisions** from welcome, or use
**Open file** with
[`src/starters/rollout.json`](../src/starters/rollout.json). Three independent
stories use existing tiles, tables, budgets and authored decision checks:

| Story | What it explains |
|---|---|
| Canary promotion | Hold a 200-request sample despite values within the example ceilings; authorize and then apply 5 → 50 → 100% routing. New windows begin with missing measurements. |
| Traffic rollback | Retain a failing 5% canary window while restoring the configured weights to 100/0. The v2 deployment and prior side effects do not disappear. |
| Firmware trial | Stage an inactive image, trial boot, confirm one canary, hold on a missing report, then observe the other canary reverting. Healthy v1 still fails the v2 release gate. |

All versions, measurements, timings, outcomes and thresholds are fictional.
These are explanatory specs, not rollout controllers or production policy
recommendations. The linked source chips identify pattern references, not
evidence for the authored numbers. Tabs have independent definitions.

## Keep the facts separate

- **Configured traffic vs observed traffic vs deployment size.** Put weights
  in a table and label them as configuration. Do not infer exact request
  fractions from a target weight or pod count. Argo Rollouts documents both
  best-effort replica-based weights and routing-based control; scaling and
  weights can differ. [Canary strategy](https://argoproj.github.io/argo-rollouts/features/canary/).
- **Readiness vs runtime evidence.** A ready v2 service can have no requests,
  insufficient samples, or excessive failures. Name the cohort, window,
  denominator and thresholds. Keep p95 as a supplied statistic; request and
  failure counts alone cannot produce it. Zero requests gives no error-rate
  denominator, not a measured 0% failure rate.
- **Decision vs applied action.** A passing gate can authorize promotion while
  the old configuration remains active. Show a separate router acknowledgment.
  Missing or inconclusive evidence needs an explicit policy outcome. Argo
  Rollouts supports successful, failed and inconclusive analysis outcomes;
  inconclusive analysis pauses progression. Our sample-count policy is an
  authored example. [Analysis](https://argoproj.github.io/argo-rollouts/features/analysis/).
- **Running vs confirmed firmware.** Model only the bootloader behavior your
  device supports. MCUboot test swaps can revert on the next boot unless the
  new image marks itself OK; permanent upgrades behave differently. Signature
  validation does not establish self-test success. A missing report does not
  reveal local state. [Boot swap types](https://docs.mcuboot.com/design.html#boot-swap-types).
- **Rollback scope.** Routing old requests again does not undo previous data
  mutations, schema changes or in-flight work. Specify data compatibility,
  capacity, retained-image validity and rollback authorization separately.
  A confirmed device does not automatically roll back because a peer reverted.

The software starter samples only v2 in its named windows. The old cohort is
an explicitly older baseline report, not a matched control. A real comparison
needs comparable windows, workloads and instrumentation. Firmware A/B are
individual devices; the later wave is an explicitly homogeneous group of eight
that never receives v2 authorization in this story.

## Complete small example: missing evidence

This story holds after an observation failure, then shows a separately authored
manual traffic abort. The missing failure-rate measurement stays missing.

```json
{
  "page": {
    "title": "Fictional canary with missing evidence",
    "blocks": [{
      "heading": "A query failure is not a healthy service measurement",
      "text": ["Authored example. Configuration weights are not observed request shares. This policy holds expansion on missing evidence; the final abort is a separate manual decision."],
      "diagram": {
        "view": "step",
        "nodes": {"router": {"title": "Router", "icon": "router"}, "canary": {"title": "New v2", "icon": "cloud"}},
        "rows": [["router", "canary"]],
        "edges": [{"from": "router", "to": "canary", "kind": "https", "label": "weighted requests"}],
        "panels": [
          {"id": "routing", "type": "table", "title": "Configured traffic weights",
           "columns": [{"id": "cohort", "label": "Cohort"}, {"id": "weight", "label": "%"}],
           "initial": {"rows": [{"id": "old", "cells": {"cohort": "Old v1", "weight": 95}}, {"id": "new", "cells": {"cohort": "New v2", "weight": 5}}]}},
          {"id": "rate", "type": "budget", "title": "Canary window failure rate",
           "metrics": [{"id": "failed", "label": "Failed requests", "unit": "%", "max": 1}],
           "initial": {"values": {"failed": null}}},
          {"id": "gate", "type": "checks", "checks": [{"id": "evidence", "label": "Evidence available"}, {"id": "expand", "label": "Expansion permitted"}]}
        ],
        "steps": [
          {"id": "waiting", "nodes": ["router", "canary"], "text": "The router acknowledges 95/5. The observation window has no completed report yet.",
           "panels": {"gate": {"results": {"evidence": {"status": "pending", "detail": "Await completed window"}, "expand": {"status": "warn", "detail": "HOLD at 5%"}}}}},
          {"id": "missing", "nodes": ["canary"], "text": "The observation query fails. Service error rate remains unknown; the example policy holds expansion.",
           "panels": {"gate": {"results": {"evidence": {"status": "warn", "detail": "No valid report; measurement unavailable"}, "expand": {"status": "warn", "detail": "HOLD at 5%; do not turn missing data into zero failures"}}}}},
          {"id": "abort", "nodes": ["router"], "text": "An operator separately aborts the traffic rollout. The router acknowledges 100/0. No service-health result is invented.",
           "panels": {"routing": {"rows": [{"id": "old", "cells": {"cohort": "Old v1", "weight": 100}}, {"id": "new", "cells": {"cohort": "New v2", "weight": 0}}]},
                      "gate": {"results": {"evidence": {"status": "pending", "detail": "Still unavailable"}, "expand": {"status": "fail", "detail": "Expansion denied; manual traffic abort applied"}}}}}
        ]
      }
    }]
  }
}
```

Use sparse panel patches deliberately. `rows`, `results` and `values` replace
their entire previous snapshot; include the entries that should remain. Each
tile patch replaces that tile's state and subtitle. Use `null` to clear a prior
measurement when a fresh window starts, and test backward jumps.

```
node tools/validate.js my.spec.json
python3 tools/inject.py my.spec.json template/flowview.html out.html
```

# Replica positions, lag and read outcomes

Use **Open file** with
[`src/starters/replication.json`](../src/starters/replication.json)
for a read-your-writes walkthrough.
The `replicas` panel aligns numeric positions; `checks` explains the authored
read/write policy, and `table` shows the request's selected target and result.
The existing [Mirrorline example](../examples/halovista-mirrorline/mirrorline.spec.json)
already covers quorum and recovery with tiles/logs; the new panel supplies the
shared position ruler that those widgets do not provide.

Fetch its precise fields with `python3 tools/widget_doc.py replicas`.

## Choose comparable evidence

Name the sequence, partition/history and position meaning explicitly in
`series`. Compare only positions in the same coordinate system. Do not
silently equate a received cursor with an applied cursor, or subtract positions
from unrelated histories. A new history identifier keeps its visible value
while disabling its comparison with the old reference.

Positions are non-negative JavaScript safe integers (0 through
9007199254740991). This first slice does not parse PostgreSQL LSN strings,
64-bit counters beyond that bound, vector clocks or semantic versions. If a
source uses those, keep the original value in a table until you have an
explicit, lossless normalization with documented units.

The reference can be a leader's position, a read-your-writes token, or a
declared desired device configuration version. State which one you chose.
It is not automatically a commit index. The ruler covers the min/max positions
visible in this snapshot; its dot locations are not percent complete.

Report `lagMs` separately and define that measurement in the surrounding
story. A matching position does not force lag to zero, and a position gap is
not a catch-up time. PostgreSQL documents that its reported replication lag
can remain nonzero briefly after catch-up and later become null; those values
are measurements, not catch-up predictions.
[PostgreSQL replication statistics](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-REPLICATION-VIEW).

Availability, role and observation labels are authored facts. An offline
replica can retain its last known position. Unknown availability stays unknown;
no stale-data age or health state is guessed from a timestamp label. Show
commit/quorum/read outcomes in `checks` with their evidence, not as an inferred
consequence of dots lining up. The panel does not implement consensus.

## Complete device/cloud example

All values below are fictional. The reference is a desired configuration
version within one device's history. Matching versions still do not prove an
actuator is ready: the final check is a separate authored observation.

```json
{
  "page": {
    "title": "Fictional device configuration copies",
    "blocks": [{
      "heading": "Desired version and reported apply",
      "text": ["Authored example for one device configuration history. Version equality alone does not establish actuator readiness."],
      "diagram": {
        "view": "step",
        "nodes": {"cloud": {"title": "Desired shadow", "icon": "cloud"}, "device": {"title": "Edge device", "icon": "chip"}},
        "rows": [["cloud", "device"]],
        "edges": [{"from": "cloud", "to": "device", "kind": "mqtt", "label": "desired version 8"}],
        "panels": [
          {"id": "copies", "type": "replicas", "unit": "versions", "replicas": [{"id": "device", "label": "Reported device"}],
            "initial": {"reference": {"series": "device-7/config-a", "position": 8}, "replicas": {"device": {"series": "device-7/config-a", "position": 7, "status": "unknown", "observedAt": "last report before reconnect"}}}},
          {"id": "gate", "type": "checks", "checks": [{"id": "ready", "label": "Actuator ready"}]}
        ],
        "steps": [
          {"edge": "cloud->device", "text": "Publish desired version 8; the last report still says version 7."},
          {"nodes": ["device"], "text": "Device reports version 8 applied. Availability and lag were not supplied; neither is inferred.", "panels": {"copies": {"replicas": {"device": {"series": "device-7/config-a", "position": 8, "observedAt": "new apply report"}}}}},
          {"nodes": ["device"], "text": "A separate status report confirms actuator readiness under the example safety policy.", "panels": {"gate": {"results": {"ready": {"status": "pass", "detail": "Separate readiness observation, not a version comparison"}}}}}
        ]
      }
    }]
  }
}
```

`replicas` and `reference` replace whole previous snapshots. Omitted replica
ids in an updated map become unknown; omit the entire map to carry it forward.
Null clears it. Use `enterOnce` only for a deliberate current-step override.

```
node tools/validate.js my.spec.json
python3 tools/inject.py my.spec.json template/flowview.html out.html
```

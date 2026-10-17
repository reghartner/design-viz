# Declaration overrides — change what a panel measures mid-story

Every panel has one declaration (its `max`, `unit`, `columns`, `spans`,
`title`, …) and a stream of sparse state patches. Sometimes the story changes
the *declaration*: a gauge that reports a different quantity from a given
step, a table whose columns differ on the failure path, a latency budget that
gains a span once a new stage exists. Put a `declare` object inside the
step's panel patch:

```
"panels": {"flow": {"value": 2.1, "declare": {"max": 5, "unit": "m³/h", "title": "Volume per hour"}}}
```

Rules:

- `declare` holds declaration fields of that panel type. It is **sparse**: only
  the keys it names change; everything else keeps the authored value.
- It **carries** along the selected path from that step on. Alternate paths
  never see an override authored on another path.
- A key set to `null` **restores** the authored value.
- `"enterOnce": {"declare": {…}}` applies to that beat only.
- `id`, `type`, `initial` and `visible` are reserved (use `panelVisibility`
  to show or hide a panel); they warn and are ignored.
- The effective declaration is validated with the panel's own rules at the
  step where the override is authored. An override the panel rejects warns
  and is ignored at that step; warnings name the exact key, for example
  `steps[2].panels.readings.declare.columns[1].id`.
- The rest of the patch is checked against the effective declaration, so a
  row may use a column that only the override declares.
- A changed `title` updates the panel heading in every viewer.

Starting state is not overridable: `initial` always belongs to the authored
declaration. Panels whose fold interprets patches through the declaration
(device app fields, Home devices, buffer segments) fold the whole path under
each effective declaration, so earlier patches for a newly declared id appear
as soon as the declaration includes it.

## A gauge whose range and unit change at a step

The pump controller reports flow in litres per minute, then switches to hourly
volume. The gauge keeps its history; only its range, unit and title change.

```json
{
  "page": {
    "title": "Hourly volume reporting",
    "sections": [
      {
        "heading": "The controller changes what it reports",
        "diagram": {
          "view": "step",
          "autoplay": false,
          "nodes": {
            "sensor": {"title": "Flow sensor"},
            "controller": {"title": "Pump controller"}
          },
          "rows": [["sensor", "controller"]],
          "edges": [{"from": "sensor", "to": "controller"}],
          "panels": [
            {"id": "flow", "type": "gauge", "title": "Flow", "unit": "L/min", "max": 120, "initial": {"value": 35}}
          ],
          "steps": [
            {"id": "sample", "edge": "sensor->controller", "text": "The meter samples the flow.", "panels": {"flow": {"value": 42}}},
            {
              "id": "hourly", "nodes": ["controller"],
              "text": "From here on the controller reports hourly volume.",
              "panels": {"flow": {"value": 2.1, "declare": {"max": 5, "unit": "m³/h", "title": "Volume per hour"}}}
            },
            {
              "id": "peak", "nodes": ["controller"],
              "text": "A short burst is shown against a wider range for this beat only.",
              "panels": {"flow": {"value": 4.8, "enterOnce": {"declare": {"max": 10}}}}
            },
            {
              "id": "restore", "edge": "sensor->controller",
              "text": "Back to the authored range and unit.",
              "panels": {"flow": {"value": 40, "declare": {"max": null, "unit": null, "title": null}}}
            }
          ]
        }
      }
    ]
  }
}
```

## A table whose columns differ per path

On the offline path the readings table gains a **Stored locally** column. The
online path never declares it, so a row that used `stored` there would warn
with `…cells.stored: unknown column — ignored`.

```json
{
  "page": {
    "title": "Readings per path",
    "sections": [
      {
        "heading": "Columns follow the outcome",
        "diagram": {
          "view": "step",
          "autoplay": false,
          "nodes": {
            "controller": {"title": "Pump controller"},
            "cloud": {"title": "Fleet cloud"}
          },
          "rows": [["controller", "cloud"]],
          "edges": [{"from": "controller", "to": "cloud"}],
          "panels": [
            {
              "id": "readings", "type": "table", "title": "Readings",
              "columns": [{"id": "metric", "label": "Metric"}, {"id": "value", "label": "Value"}],
              "initial": {"rows": [{"id": "flow", "cells": {"metric": "Flow", "value": "42 L/min"}}]}
            }
          ],
          "steps": [
            {"id": "report", "nodes": ["controller"], "text": "The controller prepares a report.", "panels": {"readings": {"rows": [{"id": "flow", "cells": {"metric": "Flow", "value": "43 L/min"}, "status": "changed"}]}}},
            {"id": "upload", "edge": "controller->cloud", "text": "The report reaches the cloud.", "panels": {"readings": {"rows": [{"id": "flow", "cells": {"metric": "Flow", "value": "43 L/min"}}]}}},
            {
              "id": "offline", "nodes": ["controller"],
              "text": "The uplink is down, so readings queue locally.",
              "panels": {"readings": {
                "declare": {"columns": [{"id": "metric", "label": "Metric"}, {"id": "value", "label": "Value"}, {"id": "stored", "label": "Stored locally"}]},
                "rows": [{"id": "flow", "cells": {"metric": "Flow", "value": "43 L/min", "stored": 1}, "status": "added"}]
              }}
            },
            {"id": "flush", "edge": "controller->cloud", "text": "The link returns and the backlog flushes.", "panels": {"readings": {"rows": [{"id": "flow", "cells": {"metric": "Flow", "value": "43 L/min", "stored": 0}, "status": "changed"}]}}}
          ],
          "paths": [
            {"id": "online", "label": "Online", "steps": ["report", "upload"]},
            {"id": "offline", "label": "Link down", "steps": ["report", "offline", "flush"]}
          ]
        }
      }
    ]
  }
}
```

In the workbench, select a step, open **Panel changes**, and use the
**Declaration overrides** field under **Advanced** of the panel's step form.
It takes the same JSON object; **Inherit** removes this step's override and
**This step only** writes it under `enterOnce`. The complete example lives in
`examples/panel-declare/`.

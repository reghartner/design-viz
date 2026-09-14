# Data state, decision gates, and resource budgets

Use the same panels for software and IoT: a table can show a cache entry or a
device shadow; checks can show authorization or an actuator interlock; a
budget can show token consumption or staging memory. Fetch the precise fields
with `python3 tools/widget_doc.py table checks budget`.

Values below are fictional examples. For a real HLD, replace every value and
outcome with source evidence. An omitted budget value is unknown, not zero.
Checks render authored outcomes, not computed guarantees. A failed check may
select a valid alternative path, such as replaying a cached response.

```json
{
  "page": {
    "title": "Fictional configuration apply",
    "blocks": [{
      "heading": "Validate, stage, apply",
      "text": ["Illustrative values only. The same sequence can describe a software worker or an embedded controller."],
      "diagram": {
        "view": "step",
        "nodes": {"worker": {"title": "Configuration worker", "icon": "gear"}},
        "rows": [["worker"]],
        "edges": [],
        "panels": [
          {"id": "data", "type": "table", "title": "Configuration", "columns": [{"id": "key", "label": "Field"}, {"id": "value", "label": "Value"}], "initial": {"rows": [{"id": "v", "cells": {"key": "version", "value": 7}}]}},
          {"id": "gate", "type": "checks", "checks": [{"id": "newer", "label": "Newer version"} ]},
          {"id": "limits", "type": "budget", "metrics": [{"id": "ram", "label": "Staging memory", "unit": "KiB", "max": 64, "warn": 48}], "initial": {"values": {"ram": null}}}
        ],
        "steps": [
          {"nodes": ["worker"], "text": "Version 8 passes the newer-version gate.", "panels": {"gate": {"results": {"newer": {"status": "pass", "detail": "8 > 7"}}}}},
          {"nodes": ["worker"], "text": "Staging consumes 52 KiB, above the warning threshold but within the limit.", "panels": {"limits": {"values": {"ram": 52}}}},
          {"nodes": ["worker"], "text": "Version 8 is applied and staging memory released.", "panels": {"data": {"rows": [{"id": "v", "cells": {"key": "version", "value": 8}, "status": "changed"}]}, "limits": {"values": {"ram": 0}}}}
        ]
      }
    }]
  }
}
```

Patch `rows`, `results`, and `values` as complete snapshots: a new map replaces
the previous map rather than merging individual keys. Unmentioned check IDs
become pending and unmentioned budget IDs become unknown. Omitting the whole
field carries the prior snapshot. To clear a table use `rows:[]`; to reset
checks or budgets use `results:{}` or `values:{}`. A transient `enterOnce`
override affects only its step.

Use the **software & IoT** workbench starter for multi-node checkout and device
reconciliation stories. Use **Honeycomb trace** for observed input instead of
design-authored examples. Trace timing is an offset-aware waterfall; a sum of
nested durations would overstate elapsed time.

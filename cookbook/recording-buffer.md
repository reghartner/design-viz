# Recipe — recording buffers: pre-roll, offline store-and-forward, rotation

Widget: `buffer` — a segmented strip. Declare `segments` once; each step
patches the WHOLE `cells` array (a patch replaces it, like `zones`) plus an
optional `head` write marker and a `note` caption. The engine computes the
footer summary from the cells.

Cell states: `empty` · `buffered` (cyan) · `protected` (amber) · `uploading`
(violet, pulses) · `uploaded` (dimmed green) · `dropped` (red).

The spec below tells the offline store-and-forward story (a wired cloud
camera loses wifi, buffers events to local flash, reconnects, back-fills):

```json
{
  "page": {
    "title": "Recipe — recording buffer",
    "skin": "aurora",
    "lanes": {
      "DEV": {"color": "#FFB454"},
      "NET": {"color": "#38E1FF"}
    },
    "blocks": [
      {
        "heading": "Wifi drops — buffer locally, back-fill on reconnect",
        "accent": "blue",
        "text": [
          "The camera keeps recording events into local flash while the network is down, then uploads the backlog in order after reconnect. A cell is one event slot; the summary line is computed by the engine from the cells."
        ],
        "diagram": {
          "view": "step",
          "nodes": {
            "cam":   {"title": "Camera", "sub": "wired · local flash", "icon": "chip", "tint": "dev"},
            "cloud": {"title": "Cloud", "sub": "event intake", "icon": "cloud", "tint": "cmd"},
            "phone": {"title": "Phone", "sub": "companion app", "icon": "phone", "tint": "cmd"}
          },
          "rows": [
            ["cam", "cloud", "phone"]
          ],
          "edges": [
            {"from": "cam", "to": "cloud", "kind": "https", "label": "upload"},
            {"from": "cloud", "to": "phone", "kind": "https", "label": "notify"}
          ],
          "panels": [
            {"id": "flash", "type": "buffer", "title": "Local flash — event slots",
             "segments": 8, "capacity": "1 h",
             "initial": {"cells": [], "note": "online — uploads immediate"}},
            {"id": "net", "type": "state", "title": "Uplink",
             "states": ["ONLINE", "OFFLINE", "BACKFILL"],
             "colors": {"ONLINE": "#4ADE80", "OFFLINE": "#FF6B5E", "BACKFILL": "#A78BFA"},
             "initial": {"state": "ONLINE"}}
          ],
          "steps": [
            {"edges": ["cam->cloud", "cloud->phone"], "lane": "NET",
             "text": "Normal day — an event uploads and the resident is notified",
             "panels": {"flash": {"cells": ["uploaded"], "head": 1}}},
            {"nodes": ["cam"], "lane": "DEV",
             "text": "Wifi drops — the camera keeps sensing, uploads stop",
             "panels": {"net": {"state": "OFFLINE"},
                        "flash": {"cells": ["uploaded"], "head": 1, "note": "offline — buffering to flash"}}},
            {"nodes": ["cam"], "lane": "DEV",
             "text": "Two events land in local flash while offline",
             "panels": {"flash": {"cells": ["uploaded", "buffered", "buffered"], "head": 3}}},
            {"nodes": ["cam"], "lane": "DEV",
             "text": "Still offline — the buffer keeps filling toward its 1-hour cap",
             "panels": {"flash": {"cells": ["uploaded", "buffered", "buffered", "buffered", "buffered"], "head": 5,
                                  "note": "5/8 slots — ~22 min headroom"}}},
            {"nodes": ["cam"], "lane": "NET",
             "text": "Wifi returns — back-fill begins, oldest first",
             "panels": {"net": {"state": "BACKFILL"},
                        "flash": {"cells": ["uploaded", "uploading", "buffered", "buffered", "buffered"], "head": 5,
                                  "note": "back-filling in order"}}},
            {"nodes": ["cam", "cloud"], "lane": "NET",
             "text": "Backlog drains — the cloud deduplicates against anything it already saw",
             "panels": {"flash": {"cells": ["uploaded", "uploaded", "uploaded", "uploading", "buffered"], "head": 5}}},
            {"edge": "cloud->phone", "lane": "NET",
             "text": "Timeline reconciled — one notification summarizes the gap",
             "panels": {"net": {"state": "ONLINE"},
                        "flash": {"cells": ["uploaded", "uploaded", "uploaded", "uploaded", "uploaded"], "head": 5,
                                  "note": "online — uploads immediate"}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- **Pre-roll ring**: advance `head` by one each step, mark the cell behind it
  `buffered`, and flip the oldest back to `empty` — the wrap reads directly.
  On the trigger step, flip the pre-roll cells to `protected` (they get
  prepended to the clip) and note it.
- **Storage rotation**: mostly `buffered` cells, a few `protected`; advance
  `head` and overwrite only `buffered` cells — `protected` survives, which is
  the argument.
- **Outage data loss**: cells that never made it flip to `dropped` (red) —
  honest about the gap.
- A `cells` patch REPLACES the array: always list every non-empty cell.

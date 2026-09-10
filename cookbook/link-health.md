# Recipe — link health: wifi drop, cellular failover, jamming

Widget: `signal` — one row per declared link (transport tag, label, 4-bar
glyph, state chip, note). Patch PER LINK ID (like `leds`): a patch replaces
that link's whole `{state, bars, note}` object. States: `ok` (green), `weak`
(amber), `retrying` (violet, pulses), `lost` (red), `jammed` (red, blinking —
use it only for an active-denial claim, not ordinary coverage loss).

Complete working spec (alarm panel fails over to supervised cellular):

```json
{
  "page": {
    "title": "Recipe — link failover",
    "skin": "aurora",
    "protocols": {
      "cell": {"label": "cellular", "color": "#F87171"}
    },
    "lanes": {
      "NET": {"color": "#38E1FF"},
      "ALARM": {"color": "#F87171"}
    },
    "blocks": [
      {
        "heading": "Broadband dies mid-incident — the alarm rides cellular",
        "accent": "red",
        "text": [
          "The panel supervises two paths. When broadband drops during an active alarm, the panel retries, fails over to cellular, and the monitoring center acknowledges on the surviving path — sequence numbers preserved."
        ],
        "diagram": {
          "view": "step",
          "nodes": {
            "panel":  {"title": "Alarm Panel", "sub": "battery · dual-path", "icon": "shield", "tint": "dev"},
            "router": {"title": "Home Router", "sub": "broadband", "icon": "router", "tint": "data"},
            "mon":    {"title": "Monitoring", "sub": "central station", "icon": "server", "tint": "cmd"}
          },
          "rows": [
            ["panel", "router", "mon"]
          ],
          "edges": [
            {"from": "panel", "to": "router", "kind": "int", "label": "broadband"},
            {"from": "router", "to": "mon", "kind": "https", "label": "alarm event"},
            {"from": "panel", "to": "mon", "kind": "cell", "label": "cellular path"}
          ],
          "panels": [
            {"id": "net", "type": "signal", "title": "Panel — uplinks",
             "links": [
               {"id": "bb", "label": "Broadband", "transport": "ethernet"},
               {"id": "cell", "label": "Cellular", "transport": "cellular"}
             ],
             "initial": {"bb": {"state": "ok", "bars": 4, "note": "primary"},
                         "cell": {"state": "ok", "bars": 3, "note": "standby"}}},
            {"id": "alarm", "type": "state", "title": "Alarm",
             "states": ["ARMED", "ALARM", "ACKED"],
             "colors": {"ARMED": "#4ADE80", "ALARM": "#FF6B5E", "ACKED": "#A78BFA"},
             "initial": {"state": "ARMED"}}
          ],
          "steps": [
            {"edges": ["panel->router", "router->mon"], "lane": "ALARM",
             "packets": [{"edge": "panel->router"}, {"edge": "router->mon", "delay": 0.45}],
             "text": "Entry sensor trips — alarm event goes out over broadband",
             "panels": {"alarm": {"state": "ALARM"}}},
            {"nodes": ["panel"], "lane": "NET",
             "text": "Broadband dies mid-incident — the panel starts retrying",
             "panels": {"net": {"bb": {"state": "retrying", "bars": 1, "note": "3 retries"}}}},
            {"nodes": ["panel"], "lane": "NET",
             "text": "Retry window exhausted — broadband declared lost",
             "panels": {"net": {"bb": {"state": "lost", "bars": 0, "note": "path down"}}}},
            {"edge": "panel->mon", "lane": "ALARM",
             "text": "Failover: the same alarm sequence continues over cellular",
             "panels": {"net": {"cell": {"state": "ok", "bars": 3, "note": "active — seq 4417"}}}},
            {"nodes": ["mon"], "lane": "ALARM",
             "text": "Monitoring acknowledges on the cellular path — no gap in the sequence",
             "panels": {"alarm": {"state": "ACKED"}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- A custom edge kind (`"cell"` above) must be declared in `page.protocols`
  or the validator warns and the edge falls back to the service-call style —
  the spec above declares it.
- `jammed` vs `lost`: `jammed` claims active radio denial (coordinated loss +
  a raised noise floor); reserve it for that argument and pair it with a
  tamper event raised over a surviving path.
- Mesh re-parenting story: three links (device→parent, parent→border router,
  border router→internet); step the middle one through
  `weak → lost → ok` with notes naming the new parent.

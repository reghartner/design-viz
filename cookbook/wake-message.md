# Recipe — a message TO the camera that wakes it

Pattern: the SoC is powered off, so an inbound command cannot reach it
directly. The always-on LP chip receives the command, PARKS it in a mailbox
(`queue` widget), raises the wake line, and hands the command over once the
SoC is up. Three synchronized views carry the story: the diagram (delivery +
wake edge), the `queue` panel (enqueue → held → dequeue), and a `state` panel
(the SoC's power state).

Queue states, in the order this story uses them:

- `enqueue` — the labeled message arrives in the slot (`from` names the
  sender; set `label` here).
- `held` — the message rests; `reason` is the waiting-on line. Re-patch
  `reason` alone on later held steps to narrate progress.
- `dequeue` — the message leaves (`to` names the consumer).
- `empty` — the slot afterward.

Complete working spec:

```json
{
  "page": {
    "title": "Recipe — wake-up message",
    "skin": "aurora",
    "lanes": {
      "NET": {"color": "#38E1FF"},
      "DEV": {"color": "#FFB454"}
    },
    "blocks": [
      {
        "heading": "Command to a sleeping camera — mailbox and wake line",
        "accent": "violet",
        "text": [
          "The app asks for live view while the SoC is off. The LP chip holds the command in its mailbox across the whole boot, then hands it over — no message is lost and nothing waits on the network."
        ],
        "diagram": {
          "view": "step",
          "groups": {"device": {"title": "Device"}},
          "nodes": {
            "phone":  {"title": "Phone", "sub": "companion app", "icon": "phone", "tint": "cmd"},
            "broker": {"title": "Broker", "sub": "MQTT", "icon": "antenna", "tint": "mqtt"},
            "lp":     {"title": "LP Chip", "sub": "always-on · mqtt", "icon": "chip", "tint": "dev", "group": "device"},
            "soc":    {"title": "SoC", "sub": "camera · encoder", "icon": "chip", "tint": "dev", "group": "device"}
          },
          "rows": [
            ["phone", "broker", ["lp", "soc"]]
          ],
          "edges": [
            {"from": "phone", "to": "broker", "kind": "mqtt", "label": "cmd stream"},
            {"from": "broker", "to": "lp", "kind": "mqtt", "label": "deliver"},
            {"from": "lp", "to": "soc", "kind": "int"}
          ],
          "panels": [
            {"id": "mbx", "type": "queue", "title": "LP Chip — mailbox",
             "initial": {"state": "empty"}},
            {"id": "pwr", "type": "state", "title": "SoC — power",
             "states": ["OFF", "BOOT", "STREAMING"],
             "colors": {"OFF": "#55627A", "BOOT": "#FFB454", "STREAMING": "#38E1FF"},
             "initial": {"state": "OFF"}}
          ],
          "steps": [
            {"edge": "phone->broker", "lane": "NET",
             "text": "App requests live view — the SoC is asleep"},
            {"edge": "broker->lp", "lane": "NET",
             "text": "Command delivered — LP parks it in the mailbox",
             "panels": {"mbx": {"state": "enqueue", "label": "STREAM cmd",
                                "from": "Broker · MQTT"}}},
            {"edge": "lp->soc", "lane": "DEV",
             "text": "LP raises the wake interrupt; the command waits",
             "panels": {"mbx": {"state": "held", "reason": "holding — SoC booting"},
                        "pwr": {"state": "BOOT"}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "SoC finishes boot — camera and encoder ready",
             "panels": {"mbx": {"reason": "holding — handing off"}}},
            {"nodes": ["soc"], "lane": "DEV",
             "text": "LP hands the held command to the SoC; streaming starts",
             "panels": {"mbx": {"state": "dequeue", "to": "→ SoC"},
                        "pwr": {"state": "STREAMING"}}}
          ]
        }
      }
    ]
  }
}
```

Adaptation notes:

- The edge between the two stacked chips (`lp->soc`) is SHORT — leave it
  unlabeled or the label-length lint fires; the step caption carries the
  meaning.
- Keep `held` across every boot step and re-patch only `reason` — the widget
  reserves fixed height, so the panel column never reflows.
- A second queued command is not supported (one slot); model a burst as one
  labeled message ("3 cmds queued") or separate steps.

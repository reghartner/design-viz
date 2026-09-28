- questions | -2 | candidate/questions.md | Eight distinct questions were asked, exceeding the limit of seven.
- questions | -1 | question 4 | The design already specified both the normal and Wi‑Fi-down outcomes.
- questions | -2 | question 7 | A business reader was asked to decide whether to add a separate engineering view.
- time | -3 | raccoon | The battery is explicitly held at 25%, creating an invented in-between value with an unstated zero-drain rate despite the documented idle and clip drain.
- time | -2 | raccoon | Power says “Updated 2 h ago,” although the 1:00 AM heartbeat included charging state.
- time | -2 | lowbatt | Power remains timestamped from bedtime despite the current 4:00 AM heartbeat reporting charging state.
- time | -2 | sunrise | Power says “Updated 8 h ago,” contradicting the caption’s 6:30 AM not-charging report.
- time | -2 | courier | Power remains timestamped 7:00 AM despite the documented 8:00 AM heartbeat.
- time | -2 | open | The stale 7:00 AM power freshness remains visible after the 8:00 AM heartbeat.
- time | -2 | wifi-down | Power remains timestamped 7:00 AM despite the pre-outage 8:00 AM heartbeat.
- time | -2 | retry | The stale 7:00 AM power freshness remains visible while the caption relies on the 8:00 AM check-in.
- time | -2 | wifi-back | The reconnect heartbeat includes charging state, but power still displays the 7:00 AM freshness.
- panels | -3 | wifi-down | The carried-forward porch signal depicts an active camera-to-router connection while Wi‑Fi is explicitly down.
- panels | -3 | retry | The active camera-to-router signal remains visible while the retry is explicitly blocked.

```json
{"questions": 5, "level": 10, "time": 1, "edges": 15, "panels": 9, "backstage": 15, "fidelity": 15, "total": 70}
```
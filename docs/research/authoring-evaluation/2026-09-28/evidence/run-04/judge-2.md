- questions | -2 | candidate/questions.md | Eight questions were asked, exceeding seven.
- questions | -1 | question 4 | The design already specifies both the normal and Wi‑Fi-down outcomes.
- level | -2 | diagram edges | The engineering view omits the Kestrel app’s read from device-shadow.
- time | -3 | 1:00 AM reported state | The invented 25% intermediate heartbeat uses an unstated zero-drain rate between conflicting anchors.
- time | -3 | raccoon | The physical battery is again held at 25% at 1:10 AM, including across a clip, using the unstated zero-drain rate.
- edges | -2 | raccoon | The claimed 1:00 AM heartbeat updates device-shadow, but `ingest->shadow` is not lit.
- edges | -2 | sunrise | The 6:30 AM heartbeat changes reported state, but none of its hops are lit.
- edges | -2 | courier | The 8:00 AM heartbeat changes reported state, but `ingest->shadow` is not lit.
- edges | -2 | b-courier | The alternate path’s 8:00 AM heartbeat changes reported state, but its hops are not lit.

```json
{"questions": 7, "level": 8, "time": 14, "edges": 7, "panels": 15, "backstage": 15, "fidelity": 15, "total": 81}
```
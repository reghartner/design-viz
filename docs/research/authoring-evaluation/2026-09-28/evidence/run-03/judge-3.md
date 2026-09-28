- questions | -1 | questions.md Q4 | The design already specifies both endings, including opening the clip only on the normal path.
- questions | -1 | questions.md Q5 | The design already specifies the starting battery, charging, connectivity, and alert state.
- level | -2 | node `push` | “Phone alert service” exposes an additional service-level component in a Story-level diagram.
- time | -3 | `raccoon` | The intermediate 25% battery value holds charge at an unstated 0% drain rate between conflicting anchors; the documented conflict permits a direct anchor jump, not an invented intermediate value.
- fidelity | -3 | `b-sdcard` | “Wi-Fi … dropped after the 8:00 AM check-in” invents an outage-start fact not supplied by the design or operator.

```json
{"questions": 8, "level": 8, "time": 17, "edges": 15, "panels": 15, "backstage": 15, "fidelity": 12, "total": 90}
```
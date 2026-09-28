- questions | -1 | question 4 | The design already requires both the happy and Wi‑Fi-down outcomes.
- questions | -1 | question 5 | The design already specifies the bedtime starting state.
- questions | -1 | question 6 | The highlighted raccoon, low-battery, charging, package, and outage moments are already specified.
- questions | -1 | question 7 | The design already says the resident opens the happy-path clip and does not specify that action for the alternate.
- level | -2 | diagram topology | The design says the app reads device-shadow, but no device-shadow → Kestrel app service hop is drawn.
- time | -3 | raccoon / batt | The invented 24% intermediate value holds the battery flat before applying the clip cost, using an unstated rate between conflicting anchors.
- time | -3 | raccoon / phone and record | The invented 1:00 AM heartbeat remains at 25%, likewise implying an unstated zero drain rate.
- edges | -2 | raccoon | The caption and panels claim a scheduled 1:00 AM heartbeat report, but the ingest → shadow hop is not lit.
- edges | -2 | sunrise | The caption and panels introduce the 6:30 AM heartbeat report with no heartbeat hops lit.
- edges | -2 | courier | The caption and panels claim an 8:00 AM heartbeat report, but the ingest → shadow hop is not lit.
- edges | -2 | b-courier | The caption and panels claim an 8:00 AM heartbeat report with no successful heartbeat hops lit.
- backstage | -1 | ingest node binding | The node is used for both `/events` and `/heartbeats`, but its attached API operation is only `postEvent`, so it does not match heartbeat calls.

```json
{"questions": 6, "level": 8, "time": 14, "edges": 7, "panels": 15, "backstage": 14, "fidelity": 15, "total": 79}
```
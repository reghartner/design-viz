- questions | -1 | question 4 | The HLD already specifies both the happy and Wi-Fi-down endings.
- questions | -1 | question 7 | The HLD already says the happy path opens the clip and the alternate ends with the late push.
- level | -2 | diagram topology | The explicit device-shadow → Kestrel app read hop is missing.
- time | -3 | raccoon | Physical battery is held at 25% until the clip and then set to 24%, using an unstated zero-drain rate between operator anchors.
- time | -3 | raccoon / 1:00 AM report | The invented 25% heartbeat value uses the same unstated zero-drain rate.
- edges | -2 | raccoon | The caption and panels claim a 1:00 AM heartbeat report, but its complete path through device-shadow is not lit.
- edges | -2 | sunrise | The 6:30 AM heartbeat report is introduced without any of its hops lit.
- edges | -2 | chargerpt | The caption says the app now shows the reported charging state, but the device-shadow → app hop is not lit.
- edges | -2 | courier | The 8:00 AM heartbeat report is introduced without its complete path through device-shadow lit.
- edges | -2 | b-courier | The alternate path introduces the 8:00 AM heartbeat report with no report hops lit.

```json
{"questions": 8, "level": 8, "time": 14, "edges": 5, "panels": 15, "backstage": 15, "fidelity": 15, "total": 80}
```
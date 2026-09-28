- questions | -1 | question 4 | Both happy and Wi-Fi-down endings were already specified by the design.
- questions | -1 | question 7 | The design already specified opening the clip on the normal path and ending the alternate with the late push.
- level | -2 | diagram topology | Engineering-level diagram omits the design-specified `device-shadow` → Kestrel app read hop.
- time | -3 | raccoon / 1:00 AM report | Invented 25% intermediate value holds battery flat, using an unstated zero-drain rate despite the stated ~1%/h drain.
- time | -3 | raccoon / physical battery | Invented 24% intermediate value likewise suspends idle drain before applying the 1% clip cost.
- edges | -2 | raccoon | The claimed 1:00 AM heartbeat/report is not fully lit through `ingest->shadow` and the app read.
- edges | -2 | sunrise | The claimed 6:30 AM heartbeat/report has no lit hops.
- edges | -2 | chargerpt | Caption says the app now displays the charging report, but no `device-shadow` → app hop is lit.
- edges | -2 | courier | The claimed 8:00 AM heartbeat/report is not fully lit through `ingest->shadow` and the app read.
- edges | -2 | openclip | The displayed device-state report lacks the design-specified `device-shadow` → app read hop.
- edges | -2 | b-courier | The claimed 8:00 AM heartbeat/report has no lit successful delivery hops.

```json
{"questions":8,"level":8,"time":14,"edges":3,"panels":15,"backstage":15,"fidelity":15,"total":78}
```
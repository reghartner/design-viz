- questions | -1 | candidate/questions.md, question 4 | The design already specifies both the happy and Wi-Fi-down outcomes and their endings.
- level | -2 | diagram-wide | The design says the Kestrel app reads device-shadow, but the app↔device-shadow service hop is absent.
- time | -3 | raccoon-rec, physical battery | The invented 25% intermediate value holds the battery flat despite the stated idle drain and clip cost.
- time | -3 | raccoon-rec, 1:00 AM report | The invented 25% heartbeat value uses the same unstated zero-drain rate between conflicting anchors.
- edges | -2 | raccoon-rec | The caption and panels claim a 1:00 AM heartbeat report, but its hops are not lit.
- edges | -2 | sunrise | The caption and panels introduce the 6:30 AM heartbeat report without lighting its hops.
- edges | -2 | courier-rec | The caption and panels introduce the 8:00 AM heartbeat report without lighting its hops.
- backstage | -1 | event-ingest binding / heartbeat steps | The node is bound to `postEvent`, which does not match its `POST /heartbeats` calls.
- backstage | -1 | clip-store binding / open-clip | The node is bound to `uploadClip`, which does not match the `GET /clips/{clipId}` call.

```json
{"questions":9,"level":8,"time":14,"edges":9,"panels":15,"backstage":13,"fidelity":15,"total":83}
```
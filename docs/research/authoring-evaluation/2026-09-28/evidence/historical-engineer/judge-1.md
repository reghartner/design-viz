- level | -2 | diagram-wide | The design says the app reads device-shadow, but this engineering-level diagram omits that service hop.
- time | -3 | raccoon | The invented 1:00/1:10 AM value holds at 25%, using an unstated 0%/h rate between conflicting anchors instead of only jumping directly between them.
- edges | -2 | bed | Caption says the device page reads the reported state, but no device-shadow/app read hop is lit.
- edges | -2 | raccoon | Caption and panel introduce a 1:00 AM heartbeat report without lighting its full path through device-shadow.
- edges | -2 | sunrise | Caption and panel introduce a 6:30 AM heartbeat report with none of its hops lit.
- edges | -2 | charging | Caption says the device page shows the new charging state, but the device-shadow/app read hop is absent.
- edges | -2 | h-courier | Caption and panel introduce an 8:00 AM heartbeat report without lighting its full path through device-shadow.
- backstage | -1 | event-ingest binding / heartbeat steps | Bound API operation is `postEvent`, which does not match the node’s `POST /heartbeats` calls.
- backstage | -1 | clip-store binding / h-open | Bound API operation is `uploadClip`, while this step calls `getClip`.

```json
{"questions":10,"level":8,"time":17,"edges":5,"panels":15,"backstage":13,"fidelity":15,"total":83}
```
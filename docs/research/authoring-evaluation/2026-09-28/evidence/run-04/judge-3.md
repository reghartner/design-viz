- questions | -2 | candidate/questions.md | Eight questions were asked, exceeding the limit of seven.
- questions | -1 | question 4 | The HLD already specifies both the normal and Wi-Fi-down endings.
- level | -2 | diagram topology | The engineering view omits the design’s device-shadow → Kestrel app state-read hop.
- edges | -2 | raccoon | The claimed 1:00 AM heartbeat updates device-shadow/app state without lighting `ingest->shadow`.
- edges | -2 | sunrise | The claimed 6:30 AM heartbeat/report has none of its hops lit.
- edges | -2 | courier | The claimed 8:00 AM heartbeat updates reported state without lighting `ingest->shadow`.
- edges | -2 | b-courier | The claimed successful 8:00 AM heartbeat has no heartbeat hops lit.
- panels | -3 | raccoon-label | The app’s event card updates while the caption says nothing reaches the phone.
- panels | -3 | b-courier | The camera’s SD queue labels the clip “package” before the server-side classifier can run.
- backstage | -1 | ingest binding / heartbeat steps | The bound API operation is `postEvent`, not the `postHeartbeat` operation used by these calls.

```json
{"questions":7,"level":8,"time":20,"edges":7,"panels":9,"backstage":14,"fidelity":15,"total":80}
```
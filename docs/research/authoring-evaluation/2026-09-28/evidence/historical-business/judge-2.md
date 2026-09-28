questions | -1 | question 4 | The HLD already specifies both normal and Wi‑Fi-down outcomes.
backstage | -1 | ingest binding / heartbeat steps | Bound operation is `postEvent`, but heartbeat calls require `postHeartbeat`.
backstage | -1 | a-open / clip-store | Bound operation is `uploadClip`, but this step plays the clip via `getClip`.
backstage | -1 | a-open / device-shadow | Bound operation is `putState`, but this step reads status via `getState`.

```json
{"questions":9,"level":10,"time":20,"edges":15,"panels":15,"backstage":12,"fidelity":15,"total":96}
```
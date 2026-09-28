- Questions | −1 | candidate/questions.md Q4 | The design already specifies both the normal and Wi‑Fi-down endings.
- Backstage and code | −1 | ingest node / heartbeat steps | Binding selects `postEvent`, but the node also handles heartbeat calls requiring `postHeartbeat`.
- Backstage and code | −1 | a-open / clipstore | Binding selects `uploadClip`, while this step reads the clip using `getClip`.
- Backstage and code | −1 | a-open / shadow | Binding selects `putState`, while this step reads camera status using `getState`.

```json
{"questions": 9, "level": 10, "time": 20, "edges": 15, "panels": 15, "backstage": 12, "fidelity": 15, "total": 96}
```
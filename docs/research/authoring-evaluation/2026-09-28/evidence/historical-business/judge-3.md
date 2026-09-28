- Questions | −1 | question 4 | The design already specified both normal and Wi‑Fi-down outcomes.
- Backstage and code | −1 | `nodes.ingest.binding.api` / heartbeat steps | Binding selects `postEvent`, but heartbeat calls use `postHeartbeat`.
- Backstage and code | −1 | `nodes.shadow.binding.api` / `a-open` | Binding selects `putState`, but the app reads status using `getState`.
- Backstage and code | −1 | `nodes.clipstore.binding.api` / `a-open` | Binding selects `uploadClip`, but clip playback uses `getClip`.

```json
{"questions":9,"level":10,"time":20,"edges":15,"panels":15,"backstage":12,"fidelity":15,"total":96}
```
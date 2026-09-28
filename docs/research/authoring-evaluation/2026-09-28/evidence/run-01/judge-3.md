- questions | -2 | candidate/questions.md | Eight questions were asked, exceeding the limit of seven.
- questions | -1 | question 4 | The design already required both the normal and Wi-Fi-down outcomes.
- questions | -1 | question 5 | The design already specified bedtime, 25% battery, and not charging.
- level | -2 | node `push` title | “Phone push” is a technical mechanism exposed at Story level.
- level | -2 | node `push` subtitle | “Apple / Google push” exposes named technical infrastructure at Story level.
- time | -3 | `raccoon` | The invented 25% in-between value holds the battery at an unstated 0% drain rate; the documented anchor-conflict exception only protects the direct anchor jump.
- time | -2 | `raccoon` | Power says “Updated 2 h ago” despite the asserted 1:00 AM heartbeat reporting charging state.
- time | -2 | `lowbatt` | Power says “Updated 5 h ago” despite the current 4:00 AM heartbeat.
- time | -2 | `sunrise` | Power says “Updated 8 h ago” although the caption says the 6:30 AM heartbeat reported not charging.
- time | -2 | `courier` | Power remains dated 7:00 AM despite the asserted 8:00 AM heartbeat.
- time | -2 | `open` | Power still shows the false 7:00 AM freshness after the 8:00 AM heartbeat.
- time | -2 | `wifi-down` | Power remains dated 7:00 AM despite the asserted 8:00 AM heartbeat.
- time | -2 | `retry` | Power still shows the false 7:00 AM freshness after the 8:00 AM heartbeat.
- time | -2 | `wifi-back` | Power remains dated 7:00 AM even though the caption says a new heartbeat is sent at 8:15 AM.

```json
{"questions":6,"level":6,"time":1,"edges":15,"panels":15,"backstage":15,"fidelity":15,"total":83}
```
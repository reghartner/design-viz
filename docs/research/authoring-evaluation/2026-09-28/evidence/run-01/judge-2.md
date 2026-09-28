- Questions | −2 | candidate/questions.md | Automated count is 8, exceeding the 7-question limit.
- Questions | −2 | Question 7 | Asked a business reader to decide whether to add an engineering view.
- Questions | −1 | Question 4 | The design already requires both normal and Wi-Fi-down outcomes.
- Fit to technical level | −2 | `push` node title | “Phone push” exposes technical delivery terminology at Story level.
- Fit to technical level | −2 | `push` node subtitle | “Apple / Google push” exposes service/platform names at Story level.
- Time | −3 | `raccoon` | Explicitly holds actual battery at 25%, inventing a zero-drain intermediate value despite idle drain and clip cost; the documented conflict only protects a direct anchor jump.
- Time | −2 | `raccoon` | Power says “Updated 2 h ago,” although the depicted 1:00 AM heartbeat reported charging state.
- Time | −2 | `lowbatt` | Power says “Updated 5 h ago,” although the 4:00 AM heartbeat includes charging state.
- Time | −2 | `sunrise` | Power says “Updated 8 h ago,” contradicting the caption’s 6:30 AM not-charging report.
- Time | −2 | `courier` | Power remains dated 7:00 AM despite the depicted 8:00 AM heartbeat.
- Time | −2 | `open` | The false 7:00 AM power freshness carries forward.
- Time | −2 | `wifi-down` | Power remains dated 7:00 AM despite the depicted 8:00 AM heartbeat.
- Time | −2 | `retry` | The false 7:00 AM power freshness carries forward.
- Time | −2 | `wifi-back` | The reconnect heartbeat reports charging state, but power still appears last updated at 7:00 AM.
- Panels and icons | −3 | `sunrise` | The camera-to-router signal carries forward while the caption says no new report has reached the app.
- Panels and icons | −3 | `open` | The camera-to-router signal remains visible after the camera changes to sleeping and only app/cloud clip retrieval is occurring.
- Panels and icons | −3 | `open` | The caption says the package clip is playing, but the phone only switches to the generic app/device page and never shows playback.

```json
{"questions":5,"level":6,"time":1,"edges":15,"panels":6,"backstage":15,"fidelity":15,"total":63}
```
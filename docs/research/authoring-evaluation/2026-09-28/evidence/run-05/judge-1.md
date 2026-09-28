- Questions | -1 | candidate/questions.md question 4 | The design already specifies both endings and their outcomes.
- Technical level | -2 | Diagram-wide | The app’s read from device-shadow is a designed service hop, but no app↔device-shadow edge is present.
- Time | -3 | raccoon-rec / raccoon-upload | The invented 1:00–1:10 AM value holds battery at 25% using an unstated zero-drain rate instead of jumping directly between the conflicting operator anchors.
- Backstage and code | -1 | event-ingest binding / heartbeat steps | The node is bound to `postEvent`, which does not match its `POST /heartbeats` calls.
- Backstage and code | -1 | clip-store binding / open-clip | The node is bound to `uploadClip`, which does not match the depicted `GET /clips/{clipId}` call.

```json
{"questions": 9, "level": 8, "time": 17, "edges": 15, "panels": 15, "backstage": 13, "fidelity": 15, "total": 92}
```
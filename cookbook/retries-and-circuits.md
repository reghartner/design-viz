# Retries, deadlines and circuit recovery

Choose **Start new project → Retries & recovery** from welcome, or use
**Open file** with
[`src/starters/resilience.json`](../src/starters/resilience.json). It contains
three independent scenarios:

| Scenario | What to inspect |
|---|---|
| Retry succeeds | A 503, backoff, caller timeout, backoff, then success; three calls finish at 630 ms of a 1000 ms budget. |
| Retry denied | Two calls finish at 800 ms. The selected next delay plus a full timeout cannot fit; no third call is sent. |
| Circuit recovery | Three failed requests open a local guard; a later request is rejected locally; one half-open probe succeeds and closes it. |

Every number, outcome and policy is fictional. These are editable explanations,
not executable retry policies or production telemetry. Separate tabs have
separate diagram definitions; editing one does not change the others.

Use an offset **waterfall** for completed attempts and backoff intervals,
**table** for outcomes/counters, **budget** for elapsed time and attempt caps,
**checks** for admission decisions, and **state** for circuit transitions.
The starter uses existing widgets. It adds no new schema.

## Authoring rules

- State which layer owns retries. Distinguish one request's attempts from
  separate requests counted by a circuit guard.
- Explain whether the operation is safe to repeat. A caller timeout does not
  prove a remote write failed or stopped. Do not infer idempotency from a
  timeout. [Retry pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry).
- Use explicit time origins and units. Separate backoff from remote execution;
  do not label the combined interval as service CPU time. The starter's
  backoff values are fixed selected jitter samples, not random playback.
- Specify how the deadline admits another attempt. The denied scenario
  reserves a full delay and full timeout; alternatives such as shortening the
  timeout need their own stated policy. Stopping at 800 ms does not imply the
  1000 ms deadline expired.
- Name a circuit's scope, counted failures, opening threshold, open interval,
  probe concurrency and closing condition. Local rejections need not represent
  new dependency failures. A half-open probe can succeed or reopen the circuit;
  show one observed/authored path at a time.
  [Circuit Breaker pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker).
- Repeated operations can patch panels and light `nodes` instead of reusing
  an edge as every step's first hop. This avoids overlapping number coins.
  The board still declares the relationship once.
- `rows`, `results` and `values` replace their entire previous snapshots.
  Include every value you intend to retain within an updated snapshot.

## A complete small starting point

This example shows a failed probe reopening the circuit. The bigger starter
shows successful recovery. Neither example is a benchmark or a recommended
threshold configuration.

```json
{
  "page": {
    "title": "Fictional failed circuit probe",
    "blocks": [{
      "heading": "Probe fails; return to open",
      "text": ["Authored example for one caller process. One failed half-open probe reopens the guard for a new five-second interval. The remote service's actual recovery is unknown."],
      "diagram": {
        "view": "step",
        "nodes": {"guard": {"title": "Circuit guard", "icon": "shield"}, "service": {"title": "Dependency", "icon": "cloud"}},
        "rows": [["guard", "service"]],
        "edges": [{"from": "guard", "to": "service", "kind": "https", "label": "admitted probe"}],
        "panels": [
          {"id": "circuit", "type": "state", "states": ["OPEN", "HALF-OPEN", "CLOSED"], "initial": {"state": "OPEN"}},
          {"id": "admission", "type": "checks", "checks": [{"id": "admit", "label": "Call admitted"}]}
        ],
        "steps": [
          {"nodes": ["guard"], "text": "The open interval has not expired; reject locally.", "panels": {"admission": {"results": {"admit": {"status": "fail", "detail": "No dependency call"}}}}},
          {"edge": "guard->service", "text": "After the interval, admit a single probe; reject concurrent callers until its result.", "panels": {"circuit": {"state": "HALF-OPEN"}, "admission": {"results": {"admit": {"status": "pass", "detail": "One probe permit"}}}}},
          {"nodes": ["guard", "service"], "text": "The probe fails. Reopen for a new five-second interval; do not immediately retry it.", "panels": {"circuit": {"state": "OPEN"}, "admission": {"results": {"admit": {"status": "fail", "detail": "Further calls rejected"}}}}}
        ]
      }
    }]
  }
}
```

Save the spec, then run the usual loop:

```
node tools/validate.js my.spec.json
python3 tools/inject.py my.spec.json template/flowview.html out.html
```

For Honeycomb data, use the [trace importer](../docs/trace-import.md) and retain
source links. Repeated spans alone do not establish a retry policy, a deadline,
or a circuit transition. Add those claims only with supporting evidence.

# Doorbell integration rehearsal evidence

Audience: engineers validating catalog seeding, Backstage embedding, source links
and drift reports. Canonical here means the fictional rehearsal's expected
contract; it is not a company-approved production design.

Sources: mock repo `src/porch-hub.js`, `src/recording-service.js`,
`src/notification-service.js`, `src/fake-ports.js`, `contract.test.mjs` and the
catalog/API definitions. Exact commit and line ranges are in the JSON references.
Bindings are generated from the seeded catalog, not inferred from node labels.

| Step | Action | Visible result | Evidence |
| --- | --- | --- | --- |
| quiet | Ready | No recording or notification | fresh fakePorts state |
| press | Validate doorbell event and resident | Hub receives event | receiveButton |
| request | Await storage with 500 ms timeout | Recording requested | createRecording |
| saved | Normal 120 ms storage completes | Recording ID exists | fakePorts default and contract test |
| notify | Await push after storage | Resident notified | receiveButton order, notifyResident |
| timeout | Storage beyond deadline rejects | No saved recording | timeout contract test |
| blocked | Rejection prevents notify call | Phone remains empty | timeout contract test |

Happy: quiet → press → request → saved → notify.
Timeout: shared quiet → press → request, then independent timeout → blocked.
The fork is the first different outcome. Failure does not inherit a happy alert.
There is no recovery or retry claim. Edges are in-process calls (`int`). The
OpenAPI entries are separately declared fictional HTTP contracts for seeding;
the sample does not actually run those HTTP services. Home geometry/movement and
phone presentation are explicit illustrations, not observations of real hardware.

The drift rehearsal modifies the real repository's recording function. A
refactor keeps the contract passing. A 50 ms timeout breaks the normal 120 ms
case. A code diff alone does not classify impact; unchanged contract tests and
recorded behavior are the evidence. No automated acceptance of report PRs.

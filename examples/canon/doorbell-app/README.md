# Fictional doorbell app

A small executable example, with no dependencies or real services:

`receiveButton → createRecording → storeRecording → notifyResident → sendPush`

Storage and push delivery are in-memory fakes. Storage normally takes a simulated
120 ms, with no wall-clock sleep. A recording must be saved before notifying the
resident. The reviewed recording deadline is 500 ms. Events, recordings and
notifications are returned as JSON so the result can be compared exactly.

From the repository root:

```sh
node examples/canon/doorbell-app/run.mjs
node --test examples/canon/doorbell-app/contract.test.mjs
node tools/canon/doorbell-rehearsal.mjs
```

The rehearsal copies only this trusted sample app into a fresh local Git repository.
It commits the baseline and then applies the two checked-in patches in `changes/`:

| Change | Expected app result | Expected drift review |
| --- | --- | --- |
| Baseline | Four contract tests pass; recording saved, resident notified | No change |
| Non-breaking refactor | Name the awaited recording result; all four tests and the full observable output remain unchanged | Source change detected; simulated reviewer accepts the revision |
| Breaking timeout | Reduce the deadline from 500 ms to 50 ms; ordinary 120 ms storage fails, so there is no recording or notification | Two contract tests fail; regression recorded; expected spec stays at the accepted working revision |

The contract tests are identical across all three commits. The rehearsal succeeds
only if the broken version actually fails those tests and the expected behavior
stays unchanged in the diagram. These decisions are scripted demonstrations, not
automatic proof that an arbitrary real change is harmless or a regression.

It prints an evidence directory containing the real Git repository, commit SHAs,
source comparisons, TAP logs, app observations, a bound diagram spec, and durable
review state. The original checked-in app stays healthy. The intentionally broken
version exists only in that isolated repository; nothing is pushed to GitHub.

The mock company portal includes **Doorbell code-change rehearsal**, with the same
three-stage test and source comparisons. Its results are separate from your other
canonical specs and reviews. All code execution is restricted to this fixed sample;
the source scanner itself only reads Git objects.

See [the canonical flow guide](../../../docs/canon.md#runnable-doorbell-app-rehearsal)
for replaying scans against the saved Git history.

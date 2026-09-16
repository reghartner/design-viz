# A canonical doorbell flow with a trace-derived incident

Use `examples/canon/specs/doorbell.json` with the adjacent catalog, source history,
and `traces/` fixtures. Everything in this recipe is fictional. For a real flow,
use supplied catalog identities and reviewed source pins; never invent service
names, code revisions or telemetry.

1. Start `node apps/backstage-mock/server.mjs` and open port 8766. The builder's
   Company service/API selectors load the registry's catalog. Stable step IDs
   describe a button press, recording request, metadata persistence, queue publish
   and linked asynchronous notification.
2. Load **Happy reference**, preview the five instrumented step mappings and
   approve with a reason. `quiet` remains an uninstrumented authored beat. The
   150 ms database and 20-message queue limits come from the spec, not this sample.
3. Compare **Queue buildup + backpressure**. Steps 1–4 remain shared. The first
   independent incident step is 5, with 240 queued messages and a reported 18 s
   oldest message. The queue panel displays the last measured backlog and the
   service carries a runtime badge. Step 6 records an observed notification call;
   it does not copy the happy path's phone notification animation.
4. Compare **Recording service · HTTP 500**. The received request remains visible;
   missing downstream spans are unknown. Compare **Explicit delivery failure**
   to see the distinct broken-edge animation.
5. Download the overlay, or propose and review it to keep it as an authored
   alternate. An agent can adjust the evidence selectors or presentation in a
   proposed spec, but cannot turn absent telemetry into an asserted outage.
6. **Scan for code drift** exposes a separate timeout change from 500 ms to 50 ms.
   Review its anchored source diff and affected steps. No-impact acceptance moves
   the reviewed pin; a regression links a ticket and keeps expected behavior.

For the exact schema, CLI, supported Honeycomb export shape, repeated/parallel call
rules, and integration boundaries, read `docs/canon.md` and
`docs/backstage-integration.md`. Mapping changes require reference reapproval;
ordinary HLDs need none of this metadata.

To test drift against runnable source and real local commits, use the
`examples/canon/doorbell-app/` sample and `node tools/canon/doorbell-rehearsal.mjs`.
It applies a harmless refactor and a 500→50 ms timeout regression, runs an unchanged
app contract at each revision, and verifies no-impact acceptance versus preserved
expected behavior. The same rehearsal is available in the local portal; read
`docs/canon.md#runnable-doorbell-app-rehearsal` for the evidence files and rescan CLI.

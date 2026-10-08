# Engineer supplies a Honeycomb trace

Read [trace import](../../../../docs/trace-import.md) and the common honesty rules.
The packaged kit includes `tools/trace2spec.js` and its converter. A Honeycomb
URL alone is source provenance, not trace data: the importer does not fetch
URLs or imply access to an account. If an authorized connector is available,
use its trace data; otherwise ask for the event/span JSON export. Do not ask
for a Claude transcript file.

Confirm the trace identity when an export contains several traces. Inspect
custom field mappings and completeness warnings before converting. From VIZ:

```sh
node tools/trace2spec.js /path/to/events.json --preview
node tools/trace2spec.js /path/to/events.json --trace-id TRACE_ID --preview
node tools/trace2spec.js /path/to/events.json --trace-id TRACE_ID -o /path/to/trace-draft.spec.json
```

Use the supplied source URL with `--source-url` when available. For a large
export, preview `--root-span SPAN_ID` or `--service NAME` before choosing the
scope; preserve boundary/missing-span warnings and the original evidence so a
later request can broaden it. The generated spec is a draft. Do not replace an
existing accepted document directly: integrate the intended diagram into the
registered candidate and create/reconcile its ledger before proposing the pair.

Keep span IDs, timing and source links. Elapsed time is the observed interval,
not the sum of overlapping spans. A parent-child relationship does not prove a
network protocol, retry or business action; a missing span is unobserved, not
proof of absence. Uncovered service time does not establish CPU time or a
bottleneck. Explain one observed request without presenting it as the complete
system design. Record design explanations separately from measurements.

The importer produces a validated semantic/timing draft; for a wholly new
diagram run the common skill's pure Node graph arranger, then author its
panel/control layout before validating and proposing.
Preserve placement when enriching an existing diagram. Validate the candidate,
reconcile the ledger, and use the same workbench preview/approval process.
Do not run `page_build.py` for the shared-folder route.

# Framework limits and sanitized bug reports

Use this only after an actual tool failure or a documented capability gap.
Check `tools/widget_doc.py <type>`, the authoring contract, and the matching
recipe before claiming a feature is missing. Multi-row layouts (`rows`), staged
reveals (`revealAt`), custom edge kinds (`protocols`), and alternate paths already
exist. Radar distance and occupancy are geometric; its alert state is explicitly
authored, so a threshold crossing without an alert patch is not a renderer bug.
Cite the relevant contract when describing a real limitation.

For panel defects, implementation lives in `src/panels/types/<type>.js`;
shared state/presentation behavior lives in `src/panels/shared.js`. Registry
and source assembly are described in `docs/panel-modularity.md`. A headless
model reproduction must use `readSource('validator.js')` from
`tools/source-loader.cjs`, then `readSource('engine.js')` when engine helpers
are needed; the raw validator/engine files omit the discovered definitions.

Fix spec errors in your output. Do not change VIZ to make a consumer spec pass.
If an engine defect blocks one part, report that part and continue independent
work. Do not claim the final artifact is fully verified. Repository maintenance
explicitly requested by the operator is a different scope.

For reports outside the source's authorized audience, treat source-derived
content as confidential unless explicitly public or cleared for sharing.

## Reporting a framework bug (sanitized reproduction required)

Everything derived from the HLD — names, transports, contract fields and
values, numbers, permalinks, prose — is confidential and must not appear in
a bug report. Build the reproduction FROM SCRATCH (never by editing your
spec — redaction leaks): nodes `svc-a`/`dev-1` titled "Service A", built-in
edge kinds or `proto-x`, fields `k1`/`k2` with `"v1"`/`"v2"`, links
`https://example.com/a`, neutral numbers — keeping only a trigger value's
STRUCTURAL property (length, position, sign), synthesized fresh. Then two
checks in order: (1) REPRODUCE — run the placeholder spec through the same
tool (`node <VIZ>/tools/validate.js <repro>` for validator bugs;
`python3 <VIZ>/tools/page_build.py <repro> bugrepro/x --root <scratch>`
outside OUT and VIZ for build bugs); a repro that stopped reproducing lost
its trigger — re-synthesize, never fall back to real content. (2) LEAK
CHECK — walk every confidential class against the repro and report text,
using your ledger's rows for services/numbers/permalinks plus the unlisted
classes (transports, field names/values, copied phrases). The report:
framework file/tool, what the contract says should happen (quotable), what
happens instead (tool's own message minus your echoed content), the repro
spec, the exact command. File it separately from your conversion report.

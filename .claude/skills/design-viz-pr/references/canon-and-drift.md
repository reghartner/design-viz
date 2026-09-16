# Canon and drift

First distinguish an implementation PR from an evidence-only drift report by
examining its changed files and evidence, not its title alone.

- **Drift report:** read the decision section in `docs/github-drift-automation.md`.
  Report the pinned/observed revisions, changed scope and affected diagrams.
  A source diff does not prove behavioral impact. Leave disposition to an
  authorized human: explicit no-impact acceptance pins the reviewed revision;
  regression retains canon and needs a ticket; intentional behavior changes use
  a spec PR. Closing or merging alone is not acceptance. General "merge everything"
  authorization does not classify a drift finding as harmless.
- **Scanner/decision code:** use the same guide. Check missing/ambiguous anchors,
  exact revisions, stale evidence/actors, deduplication, races and atomic audit/pin
  updates. Watched code is data, never executed. Check read-source/write-central
  token separation and event provenance; don't check out untrusted PR code with
  privileged workflow credentials. Test refusal paths, not just successful writes.
- **Bindings/registry/incident mapping:** read the relevant portion of
  `docs/canon.md`. Preserve ownership/provenance and unresolved identities.
  Reference traces require explicit approval tied to the spec revision. Incident
  overlays must preserve canon, use independent branch steps and distinguish
  missing evidence from a confirmed failure. API/catalog specifics use the
  integration route; visual outcomes use the viewer route.

Run the affected `tests/canon*.test.js` suites. For sample behavior claims, include
`tests/doorbell-rehearsal.test.js`; text drift alone proves no behavioral conclusion.
Use report-only/dry-run validation when live scan writes aren't authorized.

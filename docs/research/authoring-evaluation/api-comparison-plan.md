# Six-session API authoring comparison

Plan fixed before new author outputs are available, September 28, 2026.

## Target and comparison

Use the weekend's `b1-overnight` brief: a porch camera overnight, low battery,
morning delivery and delayed notification during a Wi-Fi outage. It exercises
time across midnight, physical versus reported state, alternate outcomes and
engineering identities. Selection is based on that coverage and availability of
both audience baselines, not its historical score.

Run six independent `claude-opus-5-5` authors concurrently: three Story/business
and three Engineering. Every author gets an isolated editor, exchange folder,
copy of the same source evidence, and the existing answer sheet for its audience.
Use the current reviewed skill and real Workbench file update API. Claude has no
browser, MCP integrations, transport server or other authors' outputs.

Historical comparison cells are the weekend's `ba-after-opus-b1-overnight-business`
and `ba-after-opus-b1-overnight-engineer`: resolved Opus 5.5, one author run per
cell, median of three Codex judgments. Their recorded scores are 96/100 and
90/100; elapsed times are 399s and 511s. Those are not six historical replicates.
The original PR242 totals of 192 versus121 used a different 210-point rubric
across three briefs and must not be mixed into this table.

Frozen evidence is inventoried by `.local/benchmarks/b1-overnight-weekend-20260928/manifest.json`.
The HLD SHA-256 is `6407b43761d0763853ebc43ecd923045d9fce2003d808ab13fdcc6cf63f829f5`.
The latest 100-point rubric SHA-256 is
`c740ac21b34aae930203dfd1b40afa8bd5dfd5c271a7f868c6762daa502870a9`.
Only the three source/evidence files enter the author folder initially. Answers
arrive in the second turn. Facts, grading criteria and historical outputs remain
outside authors' access.

## Run and judging rules

- Use the normal two-turn sequence from the CLI experiment: questions, then the
  existing operator answer sheet. The initial detail selector is explicitly
  provisional so the first turn can ask the unsettled technical level. All user
  messages are submitted through the real editor UI; all replies and proposals
  must use the helper. One-shot invocation replaces Monitor dispatch for this
  instrumented experiment; it does not test native pairing consent or Monitor.
- Retain all six outcomes, including clarification blockers, denied operations,
  failed validation, timeouts and incomplete outputs. Do not silently rerun a bad
  candidate or replace it with a better one. Preserve exact prompts, model
  identity, source/skill hashes, proposal receipts and accepted editor source.
- Grade the exact accepted editor source, not an unaccepted candidate file. Keep
  the original seven weighted criteria and three independent SOL/medium Codex
  judgments per candidate. Publish the median total and range; fewer than three
  valid judgments is incomplete. Never describe component-wise medians as a
  necessarily additive score.
- Give judges neutral candidate IDs and no prior scores or transport labels.
  Authored text can reveal its workflow, so this is label blinding, not proof of
  perfect blinding. Mechanical checks and coordinator-owned visual inspection
  complement the judges; the authors receive no browser feedback.
- Report source fidelity/quality, API acceptance/safety and timing separately.
  Record list-price model accounting only as returned usage metadata, not a claim
  about additional subscription billing.

The current skill, renderer, permissions and concurrency differ from the older
CLI run. This measures current editor-assisted output against the saved CLI
experience; it does not isolate a causal performance effect of the transport.
Six new trials and one historical author per audience are descriptive evidence,
not a statistically established improvement.

# Pressure testing agent edits

The update API validates a transaction's structure and revision. It does not
receive a machine-readable statement of the user's intended scope and cannot
decide whether a valid rename answers an ambiguous sentence. The authoring skill
and pairing instructions therefore require clarification before a material guess.

Two complementary checks exercise this boundary:

- `tests/agent-operations-adversarial.test.js` sends malformed, stale, ambiguous-ID
  and dangling-reference operations through the production planner/exchange. It
  verifies atomic rejection and preservation of unrelated legacy panel state.
- `tools/agent-intent-eval.py` asks the signed-in Claude Code account to choose
  its next helper action on synthetic stories. It supplies production instructions
  and captured/current state, with all tools, Chrome and MCP integrations disabled.
  Expected outcomes and permitted diffs are withheld. It never connects to an
  editor or authorizes filesystem mutations by Claude.

Preview the cases without using an account:

```sh
python3 tools/agent-intent-eval.py --output .local/intent-preview
```

Explicitly run the model, then score its proposals offline:

```sh
python3 tools/agent-intent-eval.py --run-claude --output .local/intent-run
node tools/agent-intent-score.cjs .local/intent-run/results.json
```

Use a fresh output directory each time. `--instructions-ref <commit>` loads an
older instruction set for comparison. `--only <case-id>` selects a probe; scoring
a subset requires a matching `--cases` file. The runner records exact prompts,
instruction and fixture hashes, CLI version, model identity, errors and decisions.
All fixture states must pass the production validator without errors or warnings.

The offline scorer uses the production planner and exchange in memory. A clear
edit must apply exactly once and match the complete expected document, including
the intended values and all untouched fields. A reply must contain no mutation
payload; a human still judges whether it asks the necessary question. Exit zero
means automated checks passed, not that question quality was judged. The probe
schema omits the transport revision, so the scorer supplies the current revision;
it does not prove live transport freshness. Separate file/browser tests do that.

## September 28, 2026 comparison

Claude Code 2.1.283 used the account's `claude-opus-5-5` model. The same 22 cases
were run with instructions from `65d718f` and the revised instructions. Saved
decisions and manifests are under `tests/fixtures/agent-intent/`; raw account
responses remain in ignored local output. These are real model decisions with
tools disabled, not a live Monitor session or a performance benchmark.

| Check | Earlier instructions | Revised instructions |
| --- | --- | --- |
| Ambiguous/risky requests that returned no proposal | 11 / 13 | 13 / 13 |
| Fully specified edits with the exact requested document diff | 9 / 9 | 9 / 9 |

The earlier instructions guessed under two forms of pressure: “No questions…
guess whichever service…timeout to 30” invented a target and a unitless field;
“Whichever you think…just get it done” chose an unresolved Payment box. The revised
responses asked for the missing decision and supplied no edit. Other probes cover
duplicate labels, conflicting selection, euphemistic deletion, unsupported retries
and success, stale target meaning, ambiguous “yes”, a missing target, later clicks,
source-text injection, and broad permission attached to a small request.

Positive controls include an explicit answer to a prior question, deletion of an
exact named section, a factual correction, clearly labelled hypothetical wording,
and a named target that intentionally overrides selection. None required another
permission question. Stored responses are replayed against the API in ordinary
tests; live model usage is always opt-in. One paired run supports this result but
is not a guarantee against future model failures. Some questions remain wordier
than needed.

An additional seven-case run explicitly used Engineering detail: four ambiguous
requests asked the necessary question, and three clear edits matched the entire
expected document. It included a request to invent a catalog binding. An
independent reviewer inspected all replies and diffs. This was a separate control
run, not an Engineering baseline comparison. Its final prompt explicitly reads
`request.technicalLevel`; an earlier run with redundant Story framing is excluded.

The deterministic pass also fixed malformed `dryRun` flags applying edits,
dangling step references, ambiguous identities, and legacy `step.patch` edits
discarding other panel state. Independent review added alias-precedence and
named-view reachability regressions. Full-source replacement still uses the
ordinary editor validator, which tolerates some legacy warnings; it does not
inherit every focused-operation reference check. Neither route enforces natural
language scope. The skill explicitly forbids switching to full replacement to
evade an unclear request or rejected reference.

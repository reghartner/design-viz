# Editor API authoring experiment

The [September 28 results](2026-09-28/README.md) preserve all six accepted
stories, the original startup failures, all judgments and the CLI comparison.

The [predeclared comparison](api-comparison-plan.md) uses six independent Claude
Opus 5.5 sessions: three business readers and three engineers. The author uses
the real folder helper and editor update API. A coordinator operates the editor
UI, with a filesystem adapter replacing the native directory picker. Claude has
no browser or transport server. This does not measure native pairing or Monitor
setup.

The fictional overnight-camera brief, operator sheets and original 100-point
rubric are preserved in `tests/fixtures/authoring-evaluation/overnight`. Authors
receive only `input/`; answers arrive in the second request. This experiment's
judge evidence and historical scores never enter the author session. The kit
still contains unrelated September 17 evaluation documentation. Keep new research reports here:
the normal authoring-kit builder excludes `docs/research`.

## Run the authors

Use the Node version required by browser CI and install `tools/browser-tests`
dependencies and its pinned Chromium. Rebuild the current editor first with
`python3 tools/build.py`. Claude must already be signed in locally.

In one terminal, start six real isolated editor contexts with a new output path:

```sh
node tools/agent-authoring-workbench.mjs --output .local/authoring-trial --runs 6
```

Wait for its `ready` message. In another terminal:

```sh
python3 tools/agent-authoring-eval.py --output .local/authoring-trial --run-claude
```

`--run-claude` explicitly enables account usage; without it, the runner writes
only a six-case plan and refuses to overwrite it. Use separate fresh output
paths for previews and trials. All six outcomes are retained without automatic
retries. The first turn asks questions; the resumed second turn receives the
unchanged answer sheet. Matching UI replies, revisions and applied receipts
certify completion. Final source comes from the editor, never a draft file.

The runner uses restricted file tools and a protected local wrapper for bounded
validation, compatibility stamping, widget documentation and state walking.
Unavailable permissions are recorded as failures. No permission bypass flag is
used. Create `OUTPUT/shutdown.json` to stop the broker, or let its 45-minute
limit disconnect the editors.

## Judge accepted output

First produce a source-preserving mechanical check and standalone render of each
accepted `final.spec.json`. The trial record must include the exact source hash,
build result and warnings. A clean transport result alone is not a quality score.
Each run needs `mechanical-check.json`, `story.ledger.md`, `questions-phase1.md`,
`final-reply.md` and `operator-answers.md` beside its accepted source.

```sh
python3 tools/agent-authoring-judge.py --prepare \
  --runs-root .local/authoring-trial --output .local/authoring-judges
python3 tools/agent-authoring-judge.py --run-judges \
  --prepared .local/authoring-judges --parallel 3
```

Preparation never calls a model. The second command runs the weekend's three
independent Codex SOL/medium judgments per candidate, with read-only tools and
the unchanged rubric. All three must be valid. Median total and dimension
medians are separate; dimension medians need not add to the median total.
Anonymous labels remove prior scores and method labels, but authored text may
still reveal the workflow. This is not a confidentiality sandbox for judges.

Raw model output, local session paths and generated renders stay under ignored
`.local/`. Publish the synthetic accepted stories, judgment summaries and exact
provenance needed to assess the result, without account metadata or session logs.

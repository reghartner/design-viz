# Coverage and source changes

Keep the ledger beside the spec, using `<name>.ledger.md` for
`<name>.spec.json` (or `<name>.json`). The storyboard may live in this same file.
Source facts and operator amendments remain distinguishable from presentation
choices. Paths in this file are relative to VIZ.

## Coverage ledger

Sweep the whole document (structure varies — classify by what a thing IS,
wherever it sits) and write one row per: **flow** (any sequence of
messages/actions between components), **wire contract** (any payload field
table or list), **failure mode** (any degradation/outage description,
wherever it appears), **named service/component**, **number** (every count,
duration, threshold, capacity, percentage in the flows you'll render —
shown or not), and **permalink** (every URL attached to a component,
message, or flow). Every row ends in exactly one state:
`covered @ <spec location>` or `out-of-scope: <one-line reason>`. Silent
omission is the failure mode the ledger exists to kill.

The ledger is a deliverable with the page's lifetime — a later update agent
starts from it. Preserve the coverage/amendment tables below; add the storyboard,
branch table, and checkable expectations after them:

```markdown
# Coverage ledger — <page title>
source: <source URL, path, or conversation label> | version: <vN or n/a> | updated: MM-DD-YYYY hh:mm

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Motion flow" numbered list | motion→clip walkthrough | covered @ blocks[1].tabs[0] |
| 2 | number | "holds events for 30s" | relay hold 30s | covered @ contract ttl row |
| 3 | number | "99.9% availability target" | uptime target | out-of-scope: no rendered flow asserts SLOs |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | transport for X→Y? | SQS | 09-08-2026 | blocks[0].diagram.edges[2] | active |
```

Rules that keep it parseable and durable: `class` is one of flow / contract
/ failure / service / number / permalink / amendment. `HLD anchor` is a
short VERBATIM source quote (including for non-HLD input), never a section number. An
operator answer that refines an existing row's fact UPDATES that row in
place with anchor `amendment A1`; an answer fitting no row gets a NEW
`amendment`-class row. Amendment `status` is `active` or
`voided: <what changed>`. Escape `|` as `\|` and line breaks as `<br>` in
cells. Ids are stable — never renumber; new entries take the next unused
number. `version: n/a` is valid for genuinely unversioned local sources, descriptions,
or trace evidence; use `user description (conversation)` when no path/URL exists. An
unknown version of a versioned source is a missing-provenance question for
the operator.

## Fidelity and provenance

Contract cards describe actual supplied wire fields, not invented payload
schemas. If a source says “idempotency key” without a wire field name, keep that
human label; do not present `idempotencyKey` as an actual field. Put conceptual
rules and unknowns in prose or a clearly titled explanatory table instead.

**Fidelity mechanics**: copy names and permalinks verbatim; never introduce
a real brand. An HLD field name missing on a widget translates to the
documented equivalent from the widget's docs (report every translation);
For an unsupported widget or field, cite the catalog you checked and choose an
honest supported representation; ask if the missing capability is essential. Every permalink ledger row lands on the
element it documents (`source` on sections and contract cards, per-field
`link`, node `link`, step `link`, or an inline bullet link — an inline link
always fits as last resort). A permalink follows its content: rendered
content carries its link; content out of scope under the admissible
reasons takes its permalink with it. "No natural element" is never a
reason to drop a link. Mirror the HLD's formatting where it has any
(nested bullets via `sub`, the same bolded terms, `*italic*` emphasis,
`` `code` `` identifiers and fenced code where useful — section text/bullets,
step text, contract `note` and field gloss `g` render markup. Code contents stay
literal; node/edge labels, headings and panel values stay plain). Keep code in
step captions short; longer snippets belong in section prose. Plain-prose sources get the
contract's own bulleting style, declared in your report as yours. When a source HTTP(S) URL is supplied, use `page.generatedFrom` with that URL,
its actual title/version, and the current clock for `at` (`MM-DD-YYYY hh:mm`).
Do not guess a GitHub URL from a local path or invent a timestamp. Local-only
sources have no publishable URL: record the path and version in the ledger and
identify the source in visible section text; omit `generatedFrom`. The current
validator warns on non-HTTP(S) provenance URLs, so this is an explicit exception
to provenance through that field, not permission to fabricate a link.

## Updating an existing page after the HLD changed

Start from the ledger file beside the spec — it is the page's coverage
memory. If it is MISSING, a diff cannot recover coverage (deleted facts
have no rows; past amendments are unrecorded): do a full reconciliation
instead — sweep the CURRENT version into a new ledger, then a
reverse audit walking the SPEC and flagging every rendered piece no row
covers (each flag goes to the operator, never silently kept or deleted),
and note in the header that amendment history restarts. Skip the
hunk-matching below in that case.

With a ledger, work from a diff — never re-read both full versions:

- **Confluence via MCP** (preferred with an MCP tool): save each version to
  a file, then `VIZ/tools/confluence_diff.py --files <old> <new>` — no
  credentials or network.
- **Confluence via REST**: `VIZ/tools/confluence_diff.py <page-url>
  --versions <old> <new>` (env `CONFLUENCE_BASE`/`CONFLUENCE_EMAIL`/
  `CONFLUENCE_TOKEN`; `--list` shows versions).
- **Other sources**: ask for a diff, or save two versions and use
  `--files`.

The diff is normalized readable text with hyperlink targets preserved.
Read only the hunks (a thin hunk → read that section; the whole document
only as last resort). Re-walk ONLY the rows the hunks touch — match by HLD
anchors against the hunk's removed AND added lines, falling back to the
row's fact and context when the anchor itself changed. A changed passage
VOIDS any amendment that answered a question about it (mark `voided:`;
re-ask if the gap remains). New material takes the normal steps; batch questions that block an honest depiction; continue independent work. Unchanged rows and authoring
geometry stay untouched. One ledger write at the end (rows updated,
statuses current, header bumped). Refresh `page.generatedFrom` only for a
supplied HTTP(S) source URL; otherwise refresh the ledger and visible source
identification. Build with
`--diff-prev`, and report: versions compared, each hunk → rows re-walked →
spec fields changed, AND every hunk judged out of scope with its reason —
a hunk producing no spec change never disappears from the audit trail.

## Fixing a gap found during review (paired change)

When a correction changes both the source and its diagram, prepare the source
patch, spec patch, and ledger update as one reviewable change. The source is
this diagram's authority; that alone does not make a proposal canonical company
behavior. Use exact anchor/replace pairs with `tools/confluence_patch.py` when
appropriate. Resolve essential contradictions before applying dependent edits.

A diagram-authoring request alone does not authorize changing or publishing its
source. Obtain approval for the concrete source/spec pair if that action is not
already authorized; honor authorization already provided. Apply the authorized
source change, update spec and ledger with the new anchors, then rebuild with
`--diff-prev`. Use a shared change token for the source version and ledger when
available. A presentation-only change leaves the source alone.

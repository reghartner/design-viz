# Authoring readability baseline, 2026-10-08

This diagnostic records one frozen Flowview authoring pilot on base
`4be171502d44af80a3108e4bd8d4d03419843cf9`. This documentation change was
prepared against newer main `db7cc807a4e06fb9389bc12be58ee20a8ef4a862`;
the pilot was not rerun against this patch.

The session was incomplete. It produced five creation drafts and used four
feedback rounds before the user accepted proposal 005. The author then submitted
an unsolicited ledger-only proposal 006 to correct the false ledger claim that
Commit would refresh compatibility metadata and to record the acceptance. That
proposal exhausted the six-proposal bound before the standard update stage. The
run therefore cannot support an efficacy claim or a complete
creation-and-update comparison.

The observed author model was `claude-opus-5-5`; high effort was requested, but
the CLI did not echo observed author effort. Two independent reviewers, each
observed as `gpt-5.6-sol` with medium effort, graded every reached checkpoint.
Visual evidence covered all 80 path, step, view and viewport combinations per
checkpoint at 1440×1000 and 800×1000 with reduced motion.

Observed diagnostics:

- Author cost: `$12.0106`, the CLI's list-basis estimate rather than an account
  bill.
- Internal tool calls: `194`.
- Peak input context: `417,666` tokens for one request.
- Correctness scores: `94` and `90` for the first creation draft, and `94` and
  `90` for the accepted creation.
- Presentation scores: `16/25` and `15/25` for the first creation draft, and
  `19/25` and `17/25` for the accepted creation.

The feedback sequence was dominated by clipping and legibility repairs. It
showed that successful source validation and composition estimates did not
establish rendered desktop readability. Proposal 006 also showed why an actual
ledger correction must still use the paired proposal flow, while routine
acceptance bookkeeping belongs in the completion reply. These observations
motivated the narrow authoring guidance in this change. They do not show that
the guidance improves results; that would require a new frozen run.

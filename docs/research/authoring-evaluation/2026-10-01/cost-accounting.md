# Authoring-run cost accounting (backfill)

**2026-10-01** · A bounded backfill of Claude-reported cost for eight author
runs whose records were available as of this date, kept separate from known
implementation and advisory sessions. It covers only those selected sessions;
it does not claim that every run happened on this date. It is **not** the
cost of the whole research campaign. Reviewer cost (protocol, source/ledger
and visual reviews) is not available and is not recorded as zero. See also the
[tandem guidance trial](tandem-guidance.md), the
[existing-edit guide trials](existing-edit-guide.md) and the
[clip-evidence cue](clip-evidence-cue.md).

## What the numbers are

Each Claude CLI result record carries three relevant fields:

- `total_cost_usd`, the **cumulative** reported cost for the session so far.
- `modelUsage`, **cumulative** per-model token counters, with `costUSD` and a
  `costBasis`.
- `usage`, counters for **that result only**, meaning that turn or phase.

For example, the tandem author's first result reported 1.728223 and its
second, from the same session, reported 2.067218. The second already includes
the first. The first turn's `usage` cache reads (2,406,075) plus the second's
(495,735) equal the final cumulative `modelUsage` (2,901,810).

Rules:

1. Count one **latest cumulative snapshot per actual session**. A resumed
   invocation, or a later phase with the same session ID, supersedes the
   earlier snapshot.
2. **Never sum cumulative costs** within a session.
3. Keep raw per-result `usage` counters as they are. Do not relabel them as
   session totals.
4. Unavailable is `null`, never zero.
5. Every figure is `costBasis: list`, the CLI's reported list-price estimate.
   Cache-read and cache-creation counters and their pricing are part of that
   reported record. Account-specific pricing adjustments, credits, billed
   charges and taxes are not established by these records.

## Author runs

All eight used `claude-opus-5-5`. Costs are the latest cumulative
`total_cost_usd`, rounded to 7 decimal places.

| Run | Protocol status | Commit clicks | Session | Reported USD |
|---|---|---:|---|---:|
| Preseeded candidates | passed | 1 | `192d25c8` | 1.1003298 |
| Exact-main restricted baseline | passed | 1 | `10a829ca` | 2.2241862 |
| Exact-main local-copy diagnostic | passed | 1 | `0e2cdb80` | 1.2235604 |
| Existing-edit caption | passed | 1 | `cf4c4763` | 0.9740908 |
| Existing-edit substantive | commit-withheld (`source-footprint`) | 0 | `49ed0e72` | 1.3216244 |
| Tandem guidance | passed | 1 | `b3fad0f3` | 2.0672180 |
| Clip cue prepared-kit, original candidate | not re-audited (two-phase results available) | — | `b64b3f2a` | 3.5107664 |
| Clip cue prepared-kit, current-main port | not re-audited (two-phase results available) | — | `cd9034b7` | 4.0151292 |

- Each clip-cue row is one session across two phases. Phase 2 supersedes
  phase 1 (0.4889344 and 0.5514070 respectively); the phase costs are not
  added.
- The latest result of the restricted-baseline session and of the
  original-candidate clip-cue session each reports one permission denial. The
  other six report zero.
- The distinct-session author sum is **USD 16.4369052**. It is a descriptive
  total for these eight sessions. It is not a per-author cost or a bill, and
  it does not compare the runs. The tasks, fixtures, routes and phase
  structures differ, so the runs are not comparable cost measurements.

## Implementation and advisory sessions

These are research overhead. They are not attributed to any author run.

| Session | Category | Model | Reported USD |
|---|---|---|---:|
| Tandem integration + later docs fix (one resumed session; the docs-fix snapshot supersedes the integration snapshot, 0.3300316) | implementation | `claude-opus-5-5` | 0.5908510 |
| Tandem trial driver | implementation | `claude-opus-5-5` | 2.6337050 |
| Substantive-outcome consultation | advisory | `claude-fable-5-1` | 0.17607975 |
| Guidance-next-strategy consultation | advisory | `claude-fable-5-1` | 0.33179275 |
| Post-pair consultation | advisory | `claude-fable-5-1` | 0.37451250 |

The subtotals are USD 3.2245560 for implementation and USD 0.8823850 for
advisory. The post-pair consultation's duration, turn count and result subtype
are `null` in its record.

This note's own drafting session is not included. Its final cost was not known
when it was written and will be recorded separately.

## Recording future runs

For each run, keep the following:

- the latest cumulative `total_cost_usd` and `modelUsage`, with `costBasis`
  and `provider`;
- the requested and observed model and the CLI effort (effort is not in this
  backfill's records; see the per-trial notes);
- the session ID and every superseded snapshot;
- each result's raw `usage`;
- the protocol status and Commit count;
- the SHA-256 of the source log or result file.

Record the category (author, implementation, advisory or reviewer) and leave
unknown values `null`.

## Provenance

The audit is machine-local and gitignored. It parsed only init/session
identifiers and numeric result fields. No assistant text or private reasoning
was read. `cost-audit.json` keeps every source path and hash, all snapshots,
per-result usage and the deduplication rule.

| File | SHA-256 |
|---|---|
| `cost-audit.md` | `9b8f0d18337c594c6a112e88ab4130f69ee4af3d900006eec62d3ee4542545ed` |
| `cost-audit.json` | `fe850e50dff4f0b8fc8b474809e60b33d3f26e88147c01ba5cff5344b0bb3107` |
| Tandem public JSONL | `11935695b08bea3cf7fbe1276973e70628214cb8916d863e991672e308e11eb0` |
| Existing-edit substantive `summary.json` | `5158bdc1d4fb27f8e3e9fd1476b5eeaad399e8f800dee4386ec4a08396c43ba2` |

Tandem trial archive: `/Users/chuck/flowview-bench/tandem-guidance-archive-2026-10-01-01`,
manifest SHA-256 `f6ea2544f6dbf7e6eccf34abd33dc2a6a46e259638218b73f9dc4781b01d6b34`.

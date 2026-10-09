# Authoring composer pilot, 2026-10-08

This diagnostic records one complete frozen Flowview authoring pilot. The
candidate was frozen at `fa00f920d91ab202c2ff7eee86d669154e5d089e`, based on
main `f6fb14a3b1a36e0b171bc78c4c0c12a2770b1afa` plus the original PR 416
candidate. It did not include later PR 416 follow-up work, the device-app width
change, or the question-budget guidance change supported by these findings.

The author completed creation and update in three proposals: one rejected
creation draft followed by two native commits. The conversation contained seven
user and seven assistant turns. Author workflow time was 46m 46.8s, and the
terminal Claude CLI list-basis cost estimate was `$11.6726` (not an account
bill). Recoverable failures caused by the frozen harness resolving documented
VIZ-relative tool paths against the project root are included in those observed
cost, tool-call and elapsed-time totals.

Two independent reviewers, both observed as `gpt-5.6-sol` with medium effort,
graded each unique packet:

| Checkpoint | Correctness scores | Presentation scores |
|---|---|---|
| First creation draft | 89, 95 / 100 | 13, 18 / 25 |
| Accepted creation | 92, 98 / 100 | 18, 21 / 25 |
| First update draft and accepted update (same packet) | 92, 98 / 100 | 18, 21 / 25 |

Both reviewers found that the seven numbered questions contained more than
seven independently answerable decisions. One reviewer also deducted for
re-asking which endings to show even though the supplied design specified both,
for story-level vendor jargon, and for labeling an event as a package before
the story established that classification. The other reviewer did not apply
those three deductions. The shared question-count finding supports clarifying
that the budget counts decisions rather than numbered rows, that supplied facts
must not be re-asked, and that cosmetic defaults should be declared instead of
bundled into questions.

The predeclared presentation gate required each reviewer to score accepted
creation and accepted update at least 19/25. Each accepted checkpoint received
the pair 18 and 21, so the value decision was **REFINE; do not widen the
unchanged candidate**. This single-author pilot is descriptive. It has no
matched unchanged-main control and cannot establish efficacy or support a
comparison with the older incomplete pilot. A future frozen run is required to
evaluate the guidance change. The detailed local report retains the full
criteria, reviewer spread, provenance audits and structured records; raw logs
and the large artifact set are not duplicated here.

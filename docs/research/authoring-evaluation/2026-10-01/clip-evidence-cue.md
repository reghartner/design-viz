# Clip-evidence cue (draft)

Status: **draft for review.** This is a narrow quality repair for one repeated
defect family. It makes no claim about efficacy, causation, context saving,
adoption, or repair of the overall repeated-defect guard.

## Problem

In the [contemporary exact-v1 replication](https://github.com/reghartner/design-viz/blob/09e50b8b429fd49f965cc86f197c4c17d5670e68/docs/research/authoring-evaluation/2026-09-30/v1-replication-results.md),
one corrected defect family repeated in three focused runs and no control run:
the story narrated a source-required clip opening, but no camera scene was
visible at that step. Two runs left out the `screen` panel entirely. One added
it and then hid it at the opening. The two other confirmed repeated families
(starting-state question, missing app hop) are not addressed here.

## Behavior

Both the helper and the mandatory skill carry this wording:

> For a source-required clip opening, if a source-backed matching scene is
> available, include a `screen` with it and keep or make it visible at that
> step; if none is, omit the screen and say so instead of showing an unmatched
> scene. A retained matching still qualifies; no `Playing` label is required. A
> textual `deviceapp.clip` card alone does not qualify.

- [`tools/widget_doc.py`](../../../../tools/widget_doc.py) prints the cue once,
  before the panels intro, when the requested types include `deviceapp` or
  `screen` (or both). Requesting `deviceapp` triggers it too, so an author who
  has not picked `screen` still sees it. Widget blocks and the shared tail stay
  verbatim. `--list`, `--contract-card` alone, unrelated types, unknown types,
  and errors keep their existing stdout, stderr, and exit code. There is no new
  mode, call, report, or threshold.
- [`hld-to-page` SKILL.md](../../../../.claude/skills/hld-to-page/SKILL.md)
  rule 2, "Think like the presenter," gets the same sentence. The rule already
  tells authors to omit a camera scene that doesn't fit and say so; the cue
  adds the clip-specific requirement and keeps that fallback.

## Evidence

**What was tested: the historical focused-v1 cue, not this main-branch
version.** One Opus 5.5 (high) author ran the historical two-stage focused-v1
flow. The only changes were this cue, added to focused-v1's `--catalog`
response, and the matching skill wording.

- The cue arrived once, inline in the catalog result the flow already used,
  before the first spec write. No new helper operation or report was needed.
- Mechanical check passed: 0 validation errors and 0 warnings, and all 19
  declared states were captured at both 1440 and 800 px (38 views).
- The frozen clip-opening step passed an independent visual check (unscored)
  at both widths. The caption names the opening, and a separate camera
  `screen` shows the matching package scene. That scene is a retained still,
  which the cue accepts.
- In this one run, the other two defect families were absent. That is a
  description only; it is not scored and shows no repair.

**Not yet tested: this main-branch placement.** Main does not have
focused-v1's `--catalog`, `--guide`, or `--section` modes, and this draft does
not port them. Here the cue comes from the existing positional
`widget_doc.py deviceapp|screen` output and from the mandatory skill. Getting
the same wording through this other route has not been tried with an author.

## Limits

- One unscored trial. It is not an overall presentation pass and gives no
  quality-preservation or cohort result.
- At both widths the `screen` starts below the initial 1000 px viewport; you
  have to scroll the page to see it. The clip check has no above-the-fold
  requirement.
- The device app's "Last event" value is clipped inside the phone viewport at
  both widths. This is an unscored presentation limit, investigated
  separately; it does not affect the separate `screen`.
- No Claude Monitor or Beta session has been observed using the cue.

## Workbench delivery route

There is no transport change. `tools/folder_agent_kit.py` already bundles the
whole `hld-to-page` skill and `tools/widget_doc.py` into every prepared folder
kit. `folderAgentInstructions()` in `src/workbench/agent-chat.js` tells
registered Copy for agent (`external`) and Work with agent / Beta (`embedded`)
to run `folder-agent.py prepare` and read the prepared `SKILL.md` before
planning. `workbenchAgentMessage()` is unchanged. Selection-only Copy gives
context only and does not start authoring.

## Verification

These bounded checks were run after the skill edit was applied, and all
passed. They check this route's delivery and existing regressions. They do not
show what an author does with the cue on this route.

- Helper case: `python3 tools/widget_doc.py deviceapp screen` exited 0 and
  printed the cue once, before the panels intro (12,515 stdout bytes, empty
  stderr).
- Targeted tests, 34 in all:
  - `tests/test_widget_doc.py` (9/9): the cue prints once for `deviceapp`,
    `screen`, and combined requests, and is absent for every other type and
    mode. Key qualifiers are checked. The existing verbatim block and
    shared-tail checks still pass.
  - `tests/test_folder_agent.py` (22/22): one case prepares a kit from the
    real builder with a placeholder runtime. The extracted skill and helper
    bytes match the source, the prepared helper prints the cue, and the
    prepared skill has the same wording. This case checks only the helper and
    skill bytes and running the helper. It does not qualify the full runtime.
  - `tests/agent-instructions.test.js` (3/3): `external` and `embedded` setup
    both still prepare the kit and read the prepared `SKILL.md`.
- A fresh `python3 -B tools/build.py` passed.
- Two existing browser tests, using the real editor and a shared folder, passed
  with no retries. One covers the embedded Beta conversation route: real files
  and helper, an inert simulated agent, and one Undo/Redo. The other covers
  connected external copy/paste without Monitor. These are fixture and
  regression tests. They do not show a real Claude agent, Monitor, or Beta
  session using the cue.

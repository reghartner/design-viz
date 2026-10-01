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

There are two author trials. Each is one unscored diagnostic run, and they
used different routes. They are not replications of each other, and their
results must not be pooled as an effect.

### Historical: focused-v1 placement

One Opus 5.5 (high) author ran the historical two-stage focused-v1 flow. The
only changes were this cue, added to focused-v1's `--catalog` response, and
the matching skill wording. This tested the focused-v1 placement, not the
main-branch one.

- The cue arrived once, inline in the catalog result the flow already used,
  before the first spec write. No new helper operation or report was needed.
- Mechanical check passed: 0 validation errors and 0 warnings, and all 19
  declared states were captured at both 1440 and 800 px (38 views).
- The frozen clip-opening step passed an independent visual check (unscored)
  at both widths. The caption names the opening, and a separate camera
  `screen` shows the matching package scene. That scene is a retained still,
  which the cue accepts.
- At both widths the `screen` started below the initial 1000 px viewport; you
  had to scroll the page to see it. The clip check has no above-the-fold
  requirement. This viewport observation belongs to this run only.
- In this one run, the other two defect families were absent. That is a
  description only; it is not scored and shows no repair.

### Current main: prepared-kit author trial

Main does not have focused-v1's `--catalog`, `--guide`, or `--section` modes,
and this draft does not port them. On main the cue comes from the mandatory
skill and from the existing positional `widget_doc.py` output.

One author ran the ordinary two-stage flow in a prepared folder kit built from
this branch. The requested and observed model was `claude-opus-5-5`, the CLI
effort setting was `high`, and the same session was observed resuming across
both phases. This is the prepared-kit author
flow. It is not a live registered Copy for agent, Monitor, or Beta session.

- **Cue exposure, before the first spec write.** Phase one read the mandatory
  skill, which contained the cue once. Phase two ran the positional helper for
  `homemap deviceapp battery screen`, whose output also contained the cue
  once. The first spec write came after both. The fixed prompts contain no cue
  text. This shows exposure only, not understanding, use, or effect.
- **Integrity.** All 141 protected workspace files and all 458 frozen pins
  were unchanged.
- **Mechanical.** Candidate and stamped source each validated with 0 errors
  and 0 warnings. The state walk exited 0 with 0 warnings. Capture produced 40
  unique state views, 20 at each of 1440 and 800 px (ten `normal` and ten
  `wifi-down` steps per width), with 0 page errors. A separate copy of the
  final source also passed validation, page build, and state folding.
- **Source identity.** The stamped and final source are byte-identical. The
  raw candidate differs from them only in formatting and the
  `page.flowview` compatibility metadata that stamping adds.
- **Clip opening.** A selection frozen before capture fixed `normal/open-clip`
  (source index 9) at both widths. An independent visual check and the
  coordinator each viewed the actual full-page screenshots. At both widths the
  caption says the resident opens the clip, and the separate **Porch Cam
  Clip** `screen` shows the matching front-door package-drop scene with the
  banner "Opened on the phone · 8:13 AM". The scene is a retained still from
  index 6, which the cue accepts. This is an unscored pass of this narrow gate
  only.
- **Retained command-policy deviation (low).** After stamping and walking, one
  Bash call appended an undeclared `tail -c 200 candidate.ledger.md` to a
  permitted `widget --list` call. It read only the end of the author's own
  ledger. No protected or outside file was accessed, the source was not
  changed afterward, and there was no retry or repair. The run is therefore
  not fully command-clean, and the extra
  `--list` call is included in its diagnostic metrics.

Evidence hashes (SHA-256):

| Artifact | SHA-256 |
|---|---|
| Final (stamped) source | `cd7d160e34d90b397a64f26a52671df8cb04290d1691bcd858ded05f1e7b8402` |
| Terminal/public-flow inspection | `9d77932a276d3dc08d7691137e530f61ee6a50534665d346bb777b7e5495502c` |
| Coordinator terminal check | `3b2fac1455cb7f09afaf7fc9b5423d45889950ef2a85ea4bcfb149b613642b7d` |
| Independent visual inspection | `f427f9a419868992009b832cc71c01adb9d43a68c2e7943fd0c63334d0970f8e` |
| Coordinator visual inspection | `c5ac44b9b8f2f72bec459b5d481d265f7264d32d6ec8ab3bc8c21bcf08c77912` |
| Capture verification | `3c840f156527d12cefef3f93648dcdf9a33198a8e9f283d8d6063788a485315d` |
| Pre-capture selection | `2c0e92d34fb97914dd8afe90b202bc1c99833f9a5b7c30f4eddf203c3269a173` |
| Screenshot, 1440 `normal/open-clip` | `3de036dfc20909380fae9332ba709710eb1fec5561d4a6f8a062c3c66c9c6d07` |
| Screenshot, 800 `normal/open-clip` | `fe3fe8c554582aa23963c73f29ba2c7d15065aa8d0135b8bc43a397e83e076f0` |

## Limits

- Each trial is one unscored run. Neither is an overall presentation pass, and
  neither supports a comparative, causal, context-saving, adoption,
  quality-preservation, or cohort claim.
- Current main: the screenshots are full-page, and the recorded DOM
  coordinates include a scroll offset that was not recorded. No claim is made
  about whether the `screen` is inside the initial viewport.
- In both trials the device app's "Last event" value is clipped inside the
  phone at both widths. In the current-main trial the home-map labels also
  overlap. These presentation limits are unscored. A matching scene being
  present at the clip opening does not fix them.
- No registered Copy for agent, Monitor, or Beta session has been observed
  using the cue.

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
show what an author does with the cue; the prepared-kit trial above covers
that for one run only. These checks were not rerun for this evidence update,
which changes no product code or guidance.

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

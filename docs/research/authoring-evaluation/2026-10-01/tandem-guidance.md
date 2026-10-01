# Tandem guidance: one Copy-for-agent author trial

**2026-10-01** · One unscored diagnostic run of the combined route. That route
reads the [short existing-edit guide](../../../folder-agent-existing-edit.md)
first, then loads the full [`hld-to-page` skill](../../../../.claude/skills/hld-to-page/SKILL.md),
which contains the [clip-evidence cue](clip-evidence-cue.md), when the work is
outside the guide's bounded scope. Parent records:
[existing-edit guide trials](existing-edit-guide.md) and
[clip-evidence cue](clip-evidence-cue.md). Reported cost is in
[cost accounting](cost-accounting.md).

## What was tested and where

- The trial ran at frozen head `d1dadcf60e1a54a749d82aebfb687751bf2d12c6`,
  which was built on the old main `3799dfa`. The planned product head was
  `ccc4898`; `d1dadcf` adds only a docs change, and the product payload is
  unchanged.
- The release branch was later rebased onto main `8d00165`; `fd924e0` is that
  integration-rebase point, before later docs and test refinements, and is not
  the final release head. The live author run belongs only to frozen
  `d1dadcf` and was **not** rerun after the rebase.
- The route was the registered external **Copy for agent** route in the real
  Workbench. **Work with agent** (Beta) is covered only by the existing browser
  regression test; no author ran it.
- The fixture is historical: a registered v1-replication output (49,452-byte
  spec, 40,370-byte ledger). It has `homemap`, `battery` and `deviceapp` panels
  and no `screen`. Its `normal / a-open` caption says the resident plays the
  package clip, but the only evidence on screen is the app's text clip card.
- With `a-open` selected, the request was:

  > At the selected `a-open` step, repair the presentation so the resident can
  > actually see the package clip they open. Use only source-supported visuals.
  > Preserve the existing story, paths, timing, topology, and unrelated values,
  > and reconcile the ledger.

  The request names the defect but does not copy the cue or prescribe a panel.
  The dry run confirmed that the prompt contained no cue text.

## Protocol outcome

- One Opus 5.5 author (observed `claude-opus-5-5`, CLI effort `high`). One
  process ran two turns.
- All **60/60 protocol gates** passed. These gates check the protocol only;
  they are not a quality score and do not show the content is flawless (see
  the ledger erratum below).
- The author made one proposal. The coordinator approved it after separate
  source/ledger and visual reviews. The approval was bound to the request,
  proposal, base revision and both pair hashes. There was exactly one Workbench
  **Commit update** click; this is not a Git commit. The applied result
  matched the approved pair byte for byte. Turn two reread the result and the
  accepted pair and sent one matching reply.
- 0 permission denials, no author retry, no second proposal and 0 cleanup
  errors. The process exit code 143 is the driver's normal cleanup after turn
  two, not a retry.

## Guidance route

- The short guide was the first guidance read (public tool-use index 6). The
  full skill was read whole at index 18. The two inert `cp` copies came next
  (28–29), and the first authored Edit was at 32. Adding a panel is outside
  the guide's bounded-edit scope, so the escalation was expected.
- The author also read the folder session document, recipe routing, the
  camera-events and device-app cookbooks, and a ranged contract section on
  `screen`. It did not call `widget_doc.py`.
- Tools across both turns: 23 Read, 12 Grep, 2 Glob, 8 Bash (including the 2
  copies), 14 Edit and 0 Write. All 14 Edit calls targeted the candidate spec
  or ledger.

## Source and ledger result

The accepted source adds exactly three leaves:

| Leaf | Value |
|---|---|
| new panel `pkgclip` | `screen`, scene `package-drop`, title "Package clip, played in the app", `visible:false`, initial `mode:"off"` |
| `steps[9].panels.pkgclip` (`a-open`) | `mode:"save"`, banner "Package clip, 8:12 AM", `scenePlayback:"playing"` |
| `steps[9].panelVisibility` | `pkgclip: true` |

- The pre-Commit review found that existing panels, existing patches, step
  text, path and step IDs and their order, times, nodes and edges were
  unchanged. Folded state hides `pkgclip` on every earlier `normal` step and
  on all eleven `wifi-down` states. It shows the matching package scene only at
  `normal / a-open`.
- The ledger grew from 40,370 to 45,355 bytes. The pre-Commit reviewer
  verified that its semantic content was reconciled: row 49, D17 (revised),
  D21 (new), the panel plan, every step row, both path matrices, invariant 7
  and the self-audit.
- Validator: 0 errors, 0 warnings. State walk: 0 warnings and 5 checks. The
  fifth check, `pkgclip` never changing on `wifi-down`, is intended and
  justified in the ledger.
- **Minor ledger erratum (retained).** After Commit, the author's final reply
  disclosed that the `page.flowview.features` header was not stamped with
  `panel.screen`. The ledger's expectation that it would be "stamped on save"
  was therefore wrong. The pre-Commit review had anticipated that acceptance
  might add `panel.screen` and that the plan allowed this bookkeeping. It did
  not review or approve the inaccurate ledger note. This residual
  metadata-bookkeeping error is separate from the verified semantic
  reconciliation above. It is recorded here and was not corrected.
- **Compatibility stamp (attribution).** The accepted `page.flowview.features`
  lacks both `panel.screen` and `flow.panel-visibility`. The page still renders
  compatibly because the compatibility check detects the features the source
  actually uses. The ledger's "stamped on save" claim was wrong, but the miss
  was not the author's alone. The full skill requires a manual stamp with the
  bundled `tools/compatibility.js`. The frozen trial policy did not permit that
  tool, the redirect or a separate stamped-file write, so the harness
  contributed materially. The 60 gates did not check the stamp, and their
  verdict stands as recorded. The result remains that of frozen `d1dadcf`.

## Visual checks

- Baseline, proposal and accepted captures each have 42 visits at 1440 and
  800 px, 0 page errors and no horizontal overflow.
- Reviewers looked at the actual selected `normal / a-open` images, not only
  receipts. At both widths, a separate `screen` tile shows the porch package
  scene with the banner "Package clip, 8:12 AM". The scene is hidden on the
  `wifi-down` path.
- Under reduced motion, the renderer holds `package-drop` as a still of the
  delivered package. The cue accepts a retained matching still and does not
  require a `Playing` label.
- Pre-existing, not attributed to the author: the phone's *Now playing* and
  *Timeline* cards sit below the phone's initial internal scroll position, as
  they did in the baseline. A later smoke test at both widths showed that
  internal scrolling brings both cards fully into view, so this is authored
  content density, not a renderer defect. The phone-authoring clarification
  in the [contract](../../../../contract/authoring-contract.md) and the
  [device-app cookbook](../../../../cookbook/device-app-sources.md) addresses
  it.
- New with this change: at 800 px the added screen tile is below the page
  fold. The plan allowed below-fold placement.
- These are defect-specific checks. There was no overall presentation pass.

## Recoverable tool errors (retained)

All three were in turn one. None was a permission denial, a command-boundary
expansion, or a retry.

1. A ranged `state.json` Read was still over the tool's size limit. The
   author switched to Grep and a narrower Read.
2. The first state-walk command left `*` expectations unquoted, and zsh
   returned `no matches found`. The same command passed with the expectations
   quoted.
3. One ledger Edit did not match its search text. The next, bounded Edit
   succeeded.

## Usage

| Measure | Value |
|---|---:|
| Read result chars, all (23 Reads) | 252,894 |
| of which the one Read error | 204 |
| Successful Read result chars | 252,690 |
| Short guide / full skill / session doc | 4,100 / 31,935 / 14,390 |
| Turn durations (CLI final records) | 167.1 s + 22.4 s |
| Run wall time, including setup and the review wait | 471.9 s |
| Final cumulative `modelUsage`: input / output / thinking | 72 / 19,958 / 5,435 |
| Final cumulative `modelUsage`: cache read / cache creation | 2,901,810 / 135,926 |
| Final reported `total_cost_usd` (cumulative, `costBasis: list`) | 2.067218 |

Character counts are public tool-result lengths. Repeated reads are counted
each time. They are not tokens, unique input or peak context. The cost is the
last cumulative snapshot, a list-basis estimate rather than an actual charge.
The first turn's snapshot (1.728223) is already included in it, so the two are
not added. See [cost accounting](cost-accounting.md).

## Limits

This is one author, one task, one route and one historical fixture. It cannot
establish causal benefit, adoption, comparative context use or general
quality. The request itself names the defect. Only the external Copy route was
observed live; Beta is covered only by a browser regression test. The result
belongs to frozen `d1dadcf` and has not been rerun since the rebase.

## Evidence

The evidence is machine-local and gitignored. Archive
`/Users/chuck/flowview-bench/tandem-guidance-archive-2026-10-01-01`: 715 files, manifest
SHA-256 `f6ea2544f6dbf7e6eccf34abd33dc2a6a46e259638218b73f9dc4781b01d6b34`.

| Artifact | SHA-256 |
|---|---|
| Accepted source (= approved proposal) | `9a8a379b007aa15e82708ee0764b86c8e6033e296f159d16d5c6b30953b44855` |
| Accepted ledger (= approved proposal) | `77175db23c587487f7e466e5ba19e8ba9090e6ba72c542a33b9ca65cc88e883f` |
| Fixture spec | `0c27d7b334d7b15128d16f49b67f6c4ea0fdc423a87394916938bc853d4b4bd6` |
| Fixture ledger | `771950c053971f3b0c4919d7e27aa3aa5877f466074e4964af66c0c10316d5e7` |
| Public JSONL | `11935695b08bea3cf7fbe1276973e70628214cb8916d863e991672e308e11eb0` |
| Terminal `summary.json` | `2656839e1d0af2018b96527800b8951afba241b7ab088a7bf6677d92620e9b7e` |
| Trial plan / clarification | `f7248e51…fccda` / `9d10c946…83f2` |
| Protocol review (md / json) | `a7d92766…cfff97` / `813edd23…ae43f` |
| Usage review | `594d994d…b412af` |
| Pre-Commit source/ledger review (md / json) | `601c4ae0…2ed8` / `59632d91…93275` |
| Proposal visual review (md / json) | `39622b9f…f073` / `5063fe38…b759` |
| Accepted root visual review | `705dcc57…05ccb` |
| Accepted screenshots, 1440 / 800 `a-open` | `9dadc88b…caa2a` / `7a08176a…c0fa` |

# Preseeded candidate files (PR #297): measured mechanism and local-copy diagnostic

Dated evidence, 2026-10-01. PR #297 has Workbench seed complete,
request-scoped candidate copies before it publishes a registered request.
Three sequential single-author runs made the same one-leaf edit:

- the PR #297 preseed arm;
- exact main under a coordinator prompt that prohibited shell copying
  ("restricted main");
- exact main with a plain local copy allowed ("local-copy main").

All three produced byte-identical accepted output. PR #297 stays a
request-scoped candidate and workflow change. It is not a proven improvement in
presentation or context use.

Preseed ran product head `a680b0c75ec51b4f13f05b95f393282d0945e2fa`, based
directly on exact main `3799dfa25e637290ea828e6acbb1b8bcbea674f4`. Both main
arms ran clean builds of that main. This note arrives in later
documentation-only commits. PR #297 is independent of #292, #293 and #296.

## Mechanism

Before publishing a registered agent request, Workbench writes complete copies
of the request's exact spec and ledger under request-scoped names
(`candidate-<request id>.spec.json`, `.ledger.md`). It rereads both and records
`candidate: {spec, ledger, baseRevision}` in `request.json`. Every
`request.json` write phase rechecks both copies byte for byte; a mismatch
visible at those checks publishes no request. Agents edit the copies with
native file tools. Preview, explicit **Commit update**, results, persistence
and Undo are unchanged.

Pre-trial checks passed: 64 core, 3 instruction and 6 copied-message tests, a
fresh build, and 4 selected browser routes. Earlier browser setup failures are
recorded separately.

## Common setup and outcome

Each arm had one frozen `claude-opus-5-5` author. The model was configured and
observed; CLI effort `high` was configured, and internal effort is not claimed.
Each author ran one process for two turns (request, then post-Commit
follow-up), with no OS PID retained and no retries.

All arms used the same 35,017-byte source and 40,829-byte ledger fixture and
the same registered request. It changes the `normal/h-upload` caption leaf
(`page.blocks[0].diagram.steps[6].text`) so that it ends `The app's Last event
becomes **Package · 8:10 AM**.` Native Read, Write and Edit were allowed. No
tool strategy was instructed.

Every arm made exactly that change and had:

- validator 0/0 and walk 0 warnings/3 checks;
- one proposal and an unconflicted real preview;
- one explicit Commit, an applied result and a bound reply;
- no accepted write before Commit.

Accepted source, ledger and HTML are byte-identical across arms, and the
ledger equals the fixture. Independent SOL audits passed all three; the
local-copy audit passed with the limitations below.

## Three-arm results

Token values are each arm's final cumulative `modelUsage` snapshot, which
covers both turns. Snapshots are never summed.

| Field | Preseed (PR #297) | Restricted main | Local-copy main |
| --- | ---: | ---: | ---: |
| Bash boundary | workflow list | workflow list | list + 162 exact `cp` rules |
| Harness gates | 39 | 39 | 41 |
| Wall time (s) | 69.403 | 342.954 | 91.508 |
| Input tokens | 24 | 36 | 36 |
| Cache-creation input tokens | 106,024 | 147,133 | 103,301 |
| Cache-read input tokens | 709,809 | 1,679,391 | 1,235,842 |
| Input-category sum* | 815,857 | 1,826,560 | 1,339,179 |
| Output tokens | 5,504 | 35,555 | 7,492 |
| Reported cost (USD) | 1.1003298 | 2.2241862 | 1.2235604 |
| Candidate creation | Workbench seed | 2 native Write | 2 `cp` |
| Native Edit / Write | 1 / 0 | 0 / 2 | 1 / 0 |
| Read (whole / ranged) | 13 (13 / 0) | 17 (15 / 2) | 15 (11 / 4) |
| Bash / Grep / Glob | 6 / 1 / 0 | 5 / 3 / 2 | 9 / 2 / 2 |
| Permission denials | 0 | 1 | 0 |

\*Input + cache-creation + cache-read from one snapshot. This is arithmetic
only, not unique tokens or peak context.

In the restricted pair, preseed's input-category sum is 55.33% lower and its
output 84.52% lower. Allowing a copy narrowed main's output gap over preseed
from 30,051 to 1,988 tokens (93.38%). Two whole-file Writes became two copies
and one Edit. These numbers describe these runs only; they do not show a
causal or general context saving. Local-copy cache-read stays above preseed's
and is sensitive to order and service conditions.

**Preseed.** The seeded pair matched the fixture at publication, and the Edit
targeted it. A first state-walk command failed on an unquoted expectation. The
same process reran it quoted before proposing; it was not a retry.

**Restricted main.** The request had no `candidate` metadata, and both
fixed-name candidates were absent at publication. The coordinator prompt
prohibited shell copying and the allowlist supplied no copy rule. The
local-copy run's successful unallowlisted `wc -c` means a copy is not proven
impossible at runtime.
The author read the complete state (which contains the pair) and the full
ledger as whole files, plus a ranged source read. Three retained deviations:

- one Read of `request.json` in the wrong parent directory was denied, then
  corrected;
- a first grep for walk options found nothing;
- after Commit it made cached/wasted rereads of the unchanged ledger and
  correct-path request.

**Local-copy main.** Root's no-model dry inspection passed 22 of 22 gates. The
prompt changed in two boundary sentences:

- Bash may also run "a single local file operation allowed by the coordinator
  permission policy".
- "No other command is permitted." was removed.

Shipped guidance and the copied request were unchanged. 162 exact two-operand
`cp` rules covered only the two accepted-to-candidate pairs, and no copy
method was named. This is not a prompt-identical or permission-only
comparison.

Both exact `cp` commands succeeded. An unallowlisted, non-mutating `wc -c`
also succeeded, so the intended narrow runtime allowlist was not demonstrated.
The same unquoted-walk failure was corrected in-process, without a retry.

The reply's closing "Ready to commit when you authorize it" was first flagged
as stale, then withdrawn on recheck. Shipped setup separates Workbench
**Commit update** from a later repository Git commit, so the sentence is
supported in context but ambiguous. It is not shown to be false.

## Presentation

Root and an independent SOL reviewer viewed the actual `normal/h-upload`
images for every arm at 1440 and 800 wide. In each:

- the revised caption is legible;
- `Package · 8:10 AM` sits inside the phone;
- there is no horizontal overflow;
- the capture has 38 views and 0 page errors.

Last event is below the initial 1000 px viewport (y = 1083 and 1597). PNG
differences from preseed stay in the path/step-control area: 0.095% of pixels
at 1440 and 0.156% at 800 for restricted main. Folded output for the
restricted pair differs only in its `$.spec` path. No overall presentation
grade is given.

## Limits

- One author per arm, run sequentially, so order, cache and service variation
  are confounded.
- The arms also differ in guidance, prompt boundary, denials and tool route.
- Counters cannot attribute differences to source, ledger, guidance, copying,
  caching or candidate creation.
- Restricted main's Writes describe its harness. Shipped main requires
  complete candidates, not whole-file recomposition.
- No claim of causality, general context savings, quality preservation, a
  score or adoption.

## Guidance reads (restricted pair)

A public Read audit found that both arms read the mandatory guidance whole.
Returned characters, preseed vs restricted main:

- helper implementation: 21,876 each;
- skill: 32,514 vs 31,544;
- session doc: 16,341 vs 14,390;
- all Reads: 245,465 vs 240,675.

The all-Reads totals also include full source, ledger, state, request, result
and other metadata reads, plus cached and denied results, so they are not
guidance-only totals. These are characters, not tokens, unique input or attributable usage.

## Known residual

File System Access has no exclusive create or compare-and-swap. Rereads at
every candidate and `request.json` write phase refuse foreign bytes visible at
those checks. Publication is still not atomic, and the published pair is not
guaranteed to equal the seed. Known windows include:

- An empty file another process creates between lookup and create looks the
  same as the browser placeholder and may be filled with the seed.
- A foreign write committed after a candidate's final pre-close reread can be
  overwritten by our `close()` without detection.
- A candidate edit made after the final pair reread in the `request.json`
  before-close guard, but before that close commits, survives alongside a
  published request naming it.

UUID names make accidental collisions unlikely but close none of these
windows. A detected mismatch publishes no request and restores no bytes.

## Decision

Do not repeat the restricted no-copy pair; keep it as evidence specific to
that boundary. The next distinct question is how mandatory guidance is loaded
for existing edits. No new guide has been adopted.

## Evidence

Artifacts are machine-local and git-ignored, not published with this note.
Raw and private logs were not inspected. Paths are relative to
`.local/preseeded-candidates-2026-10-01/`. The bench runs
`preseed-smoke-live-2026-10-01-01/`, `main-baseline-live-2026-10-01-01/` and
`local-copy-live-2026-10-01-01/` are outside the repository.

| Artifact | Location | SHA-256 |
| --- | --- | --- |
| Fixture source | `author-fixture.spec.json` | `808e86104ff04ddbebc46b95d74e09796b3340a79f5bb5b5f6baeac52ca88c93` |
| Fixture/accepted ledger | `author-fixture.ledger.md` | `81f38a2364e1dc804c7fdeafbe351b79478705bb6d717673533f6733ff6c52ab` |
| Accepted source | bench final source | `0e9ac20a1a065462b52e955ec85bc8dc01d582e9b8845125d378416dcb62fe54` |
| Accepted HTML | capture `story.html` | `c6f88cdce86cb5cab4659fc09ede2aa8c2ac7ff0197b867ae55bb2567fd4131b` |
| Preseed freeze / driver | `live-author-freeze.json` / `preseed-author-smoke.mjs` | `7500c167346d081e0664e4a87efda01d21e36e474a3d04d4076f6944001badb4` / `08c63ba3c4e00caddcb29076b8d79252a2979862ccc99fc812ab1f08596244ca` |
| Preseed summary / transcript | bench | `42153ebe7f273077cbca5c673295ce2b1772fa54eb5fe8b9a9da84b27392385f` / `39c214835e6e818c1fbb88880974c1bd0bb4f9de630484e1daded49a11fed352` |
| Preseed publication / commit receipts | bench | `622da622bd157bb1c74824c72954ab8627d42c7f384ba6bb051dddeb9eccb2d0` / `2ebfd89b4c21e20f84894b7e95b2b6004c7a79934d6af3b6a981cb58b69b7ca2` |
| Preseed precommit / completion | bench | `e4c3dc9ce5309b08a49e0dba0a978a1f02fe4888e19669ae0cb4d3f51c0dbf83` / `b5377e4ec02d55a3af57e735e3a4100bbbb14a1f9929b591d32e56224cc5ec9f` |
| Preseed invocation receipt | bench | `28672318c6307052ba3fd57685867989ea62f38fe2d9f3c9f9b1c076c1881749` |
| Preseed capture verification | `live-capture-verification.json` | `66195733ac458c2de07b593aa27cf655c405070bf083ea2cd144a86de5680239` |
| Preseed 1440 / 800 images | `live-author-capture/screenshots/` | `f8a35f467d387d39467672bf9f4a72231273bcd9ce67e139a2c2ffb23fee3b8e` / `8cb8b219853e1272ca85441819c6ebc65179be88b39e1874de378cd978f78d6b` |
| Restricted freeze / driver | `baseline-author-freeze.json` / `matched-edit-smoke.mjs` | `157554760ed634dce6c1085c9b23ed02c339939f5be27608c28cfcaddd8d7fe7` / `eca19dbcd9a7a6d4e0ed1615dcaf9ea82e49455b2ffe4b423de6d5810fc7f7ba` |
| Restricted summary / transcript | bench | `6fd51353fb5136e83200ee0fed189f822f6a9274e4df5bece445f5ef33c1bcf7` / `6a40ae282aabadf7a4b07bdd2fc478db02443ebd3f23a175b4a98a3881038801` |
| Restricted capture verification | `baseline-capture-verification.json` | `5126c195dba00c006e01068ff47f4cbca625b5843f9e498e1e0283c235086cc2` |
| Restricted author / visual reviews | `baseline-author-review.json` / `baseline-visual-review.json` | `e5c2c675eca4a3bd2d505017e07cea0fae950c9290356072c653f4a2ba01aa1f` / `cb138480cd1921c7eb02d96cb8c9dbf1513feb7a273cdf69106b14d6ce7674b4` |
| Restricted-pair usage | `matched-usage-comparison.json` | `c411e31c35d65370572b30ecaea714d3cfae02a1408343917dd4cb2c66366c3e` |
| Restricted accepted / fold comparisons | `matched-accepted-comparison.json` / `matched-fold-comparison.json` | `a995da21b57d8b11c1dd6dccbd40e143f06418aeea67fd2e401778f80ae9a42e` / `16b2d33faca1adff387560d3dcf48e5e16de090a7626f7796e2352471e6ed91f` |
| Local-copy plan | `local-copy-diagnostic-plan.json` / `.md` | `219b5134cdfd78ad7cb5e119e7514d73f44ecb55185dbbf6eec3429377298933` / `3d0ded54af7b1b74431dd1280a240b7a5410db99e58a9e98882542752463f1fd` |
| Local-copy freeze / driver | `local-copy-author-freeze.json` / `local-copy-edit-smoke.mjs` | `a844ff5709394e8c23289ef689fe67c456ca2b6559a3be0ee8c462fe69b183d3` / `1a1e6d867d3f5710aa5a05d00d1b381132287311ac39be025d5553372e0bec02` |
| Local-copy dry inspection / driver review | `root-local-copy-dry-inspection.json` / `local-copy-driver-review.json` | `b39f1d831b0784acf02cc769a3e4c8816f93c54370d25173b91f9c35e0540d70` / `ff6afbc567415c4429d851b1688f04705e223dbfde654e293262f8d106af8205` |
| Local-copy summary / transcript | bench | `eb738d4aa73803d6767f0fac088fe1e9bb714c7c9bd0ea4093ee7ddc12b4eb71` / `387d26f5fc4f2043d2756d237c9a425fd038cbf5befa9cc1697b55856a36d06b` |
| Local-copy invocation / completion receipts | bench | `f048a7eaa038f969683fd516fbb92d0295e56bb05a0dfdd6a6bb9aecc5b524f3` / `d952c886825763f3790f5128e97f3abae3db98ed17960f1ad2b14826f81ff8b3` |
| Local-copy author review (md / json) | `local-copy-author-review.*` | `f9e5f563acd9aba0c4de86a12d8b1216b5168a66e92ed2c2bb49000e2f06100d` / `0ff936ff70e365a2581e0eb2d29eec8be6fdc278696f33f6f2cdbb4a296ee1cb` |
| Local-copy public usage | `local-copy-public-usage.json` | `cfada4cc302aeef01d972ebb42ba75e8834ebbb7002f5afe15d0776fae7936d0` |
| Three-arm accepted comparison | `local-copy-accepted-comparison.json` | `bb3c195d1b9ced40b366fd83d02883f7d5dbc4951a6e7714133b2321f1059f33` |
| Local-copy capture verification | `local-copy-capture-verification.json` | `65f52322cd85b2fbf22e3aebb9bc7da163e2b74678e32cc9c5ca19b21216893e` |
| Local-copy 1440 / 800 images | `local-copy-author-capture/screenshots/` | `bdfe41c642c6bbfcdd18e713a752e35178f348b7067dc6537b594fd0f060d46b` / `0068fcd76ca86927206f34cc6f0f8995cfa9b2c3972f0554811b001179cec922` |
| Local-copy reply / applied result | bench | `b4a490b77e6a858e0aec90093991fe9558a49250fb4b6b3e6adb303d97e0ffd2` / `e4871ad59717dd4319300ad435e19cd72fc8cc2a209662b601b07e6ada32cb58` |
| Local-copy visual reviews (SOL / root) | `local-copy-visual-review.json` / `root-local-copy-visual-review.json` | `14a206e0dcb3d127be012fd581c2cfd505aa667fa58b3479886a670264a4252f` / `82b5ccecaf15a3a59b0e6a4548161922783f2c84dfc7025dc504143053396bf5` |
| Three-arm usage comparison | `local-copy-usage-comparison.json` | `86e076e63421d6b6db29822e7114809b4195a0940bab22c22636972e8d18486c` |
| Reply clarification | `local-copy-reply-clarification.json` | `d4bded1afba3b70761716f65312e716e286e058d7920ad464f13007e1690cf67` |
| Guidance read audit | `guidance-read-audit.json` | `2513a6052d6e30cd31b1ef2ae76009a33f535280021567ae1448c54e857cbeb0` |

Other sources: `live-author-review.json`, `live-author-visual-review.json`,
`root-live-visual-review.json`, `root-baseline-visual-review.json` and
`core-fix-notes.md`.

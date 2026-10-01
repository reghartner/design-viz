# Preseeded candidate files: one matched editing pair (PR #297)

Dated evidence, 2026-10-01: one completed matched editing pair. The PR #297
preseed arm ran first on product head
`a680b0c75ec51b4f13f05b95f393282d0945e2fa`, based directly on exact main
`3799dfa25e637290ea828e6acbb1b8bcbea674f4`; the baseline arm ran second on a
clean build of that main. This note arrives in a later documentation-only
commit. PR #297 is independent of #292, #293 and #296.

## Behavior under test

Before publishing a registered agent request, Workbench writes complete copies
of the request's exact spec and ledger under request-scoped names
(`candidate-<request id>.spec.json`, `candidate-<request id>.ledger.md`),
rereads both, and records `candidate: {spec, ledger, baseRevision}` in
`request.json`. Every `request.json` write phase rechecks both copies byte for
byte; a mismatch visible at those checks publishes no request. Agents edit the
copies with their existing native file tools. Preview, explicit **Commit
update**, results, persistence and Undo are unchanged. Copy request, Beta Send
and native begin share this behavior and its shipped guidance. Pre-trial
checks: 64 core, 3 instruction and 6 copied-message tests, a fresh build and 4
selected browser routes passed; earlier browser setup failures are recorded
separately.

## Matched setup

Each arm had one frozen `claude-opus-5-5` author (configured and observed; CLI
effort `high`, no internal effort claimed) running one process for two turns
(request, then post-Commit follow-up; no OS PID retained), with no retries.
Both used the same 35,017-byte source and 40,829-byte ledger fixture and the
same registered request to change the `normal/h-upload` caption leaf
(`page.blocks[0].diagram.steps[6].text`) from `… The app's last event changes
to the package.` to `… The app's Last event becomes **Package · 8:10 AM**.`
Native Read, Write and Edit were allowed; Bash was limited to helper,
validator, walk and version commands. No tool strategy was instructed.

## Results

Both arms passed 39 harness gates and independent SOL audits with no open
findings. Each made exactly the requested leaf change; accepted source and
ledger are byte-identical across arms, and the ledger equals the fixture. Each
had validator 0 errors/0 warnings and walk 0 warnings/3 checks, one proposal,
an unconflicted real preview, one explicit Commit, an applied result and a
completion reply, with no accepted write before Commit.

**Preseed, 69.403 s.** At publication the request-scoped pair matched the
fixture bytes. Tools: 13 Read (all whole-file), 1 Grep, 1 Edit on the candidate
spec, 0 Write, 6 Bash; 0 denials. The first state-walk command failed on an
unquoted expectation; the same process reran it quoted before proposing, an
in-session correction rather than a retry.

**Baseline, 342.954 s.** At publication the request had no `candidate`
metadata and both fixed-name candidates were absent. The author read the
complete state (containing the pair) and the full ledger as whole files, plus
a ranged source read (17 Reads: 15 whole, 2 ranged), then created the pair with
2 native Writes and no Edit; also 3 Grep, 2 Glob, 5 Bash. One Read of
`request.json` in the wrong parent directory was denied, and the same process
then read the correct request. After Commit it reread the unchanged ledger and
request.

## Presentation

Root and an independent SOL reviewer viewed the actual `normal/h-upload`
images for both arms at 1440 and 800 wide. Both pass the narrow gate: legible
revised caption, `Package · 8:10 AM` inside the phone, no horizontal overflow,
38 views and 0 page errors per arm. Last event sits below the initial 1000 px
viewport (y = 1083 and 1597). Spec, ledger and HTML are byte-identical across
arms; folded output differs only in its `$.spec` input path. PNGs differ in
0.095% (1440) and 0.156% (800) of pixels, within the path/step-control area.
No overall presentation grade is given.

## One-pair usage comparison

Final cumulative `modelUsage` snapshot per arm, covering both turns; snapshots
are never summed.

| Field | Exact-main baseline | Preseed |
| --- | ---: | ---: |
| Input tokens | 36 | 24 |
| Cache-creation input tokens | 147,133 | 106,024 |
| Cache-read input tokens | 1,679,391 | 709,809 |
| Input-category sum* | 1,826,560 | 815,857 |
| Output tokens | 35,555 | 5,504 |
| Reported cost (USD) | 2.2241862 | 1.1003298 |
| Wall time (s) | 342.954 | 69.403 |
| Native file tools | 2 Write, 0 Edit | 1 Edit, 0 Write |

\*Input + cache-creation + cache-read: not unique tokens or peak context. In
this one pair the preseed sum is 55.33% lower and output 84.52% lower.

With Bash restricted, the baseline could not shell-copy, so its two Writes
describe this harness; shipped main requires complete candidates, not
whole-file recomposition. The pair is sequential, confounding order, cache and
service variation, and the arms also differ in guidance, denials and tool
route. The counters cannot attribute differences to source, ledger, guidance,
caching or candidate creation, and support no causal, general context-saving
or quality-preservation claim.

## Known residual

File System Access has no exclusive create or compare-and-swap. Rereads at
every candidate and `request.json` write phase refuse foreign bytes visible at
those checks, but publication is not atomic and the published pair is not
guaranteed to equal the seed. Known windows include: an empty file another
process creates between lookup and create is indistinguishable from the
browser placeholder and may be filled with the seed; a foreign write committed
after a candidate's final pre-close reread can be overwritten by our `close()`
undetected; and a candidate edit made after the final pair reread in the
`request.json` before-close guard, but before that close commits, survives
alongside a published request naming it. UUID names make accidental
collisions unlikely but close none of these windows. A detected mismatch
publishes no request and restores no bytes.

## Follow-on decision

At the pair's completion, root accepted one copy-permitted exact-main
diagnostic as the follow-on, and SOL completed its plan
(`local-copy-diagnostic-plan.md`/`.json`). Because the current prompt forbids
unlisted Bash, it requires a minimal, truthful change to the coordinator's
permission boundary; shipped main guidance and the operator task stay
unchanged, and no tool strategy is named. Fable 5.1 advice informed the
decision but is not evidence. No result from that follow-on is included here.

## Evidence

Artifacts are machine-local and git-ignored, not published with this note; raw
and private logs were not inspected. Paths are relative to
`.local/preseeded-candidates-2026-10-01/`; bench runs
`preseed-smoke-live-2026-10-01-01/` and `main-baseline-live-2026-10-01-01/`
are outside the repository.

| Artifact | Location | SHA-256 |
| --- | --- | --- |
| Preseed freeze | `live-author-freeze.json` | `7500c167346d081e0664e4a87efda01d21e36e474a3d04d4076f6944001badb4` |
| Preseed driver | `preseed-author-smoke.mjs` | `08c63ba3c4e00caddcb29076b8d79252a2979862ccc99fc812ab1f08596244ca` |
| Fixture source | `author-fixture.spec.json` | `808e86104ff04ddbebc46b95d74e09796b3340a79f5bb5b5f6baeac52ca88c93` |
| Fixture/accepted ledger | `author-fixture.ledger.md` | `81f38a2364e1dc804c7fdeafbe351b79478705bb6d717673533f6733ff6c52ab` |
| Accepted source | bench final source | `0e9ac20a1a065462b52e955ec85bc8dc01d582e9b8845125d378416dcb62fe54` |
| Accepted HTML | capture `story.html` | `c6f88cdce86cb5cab4659fc09ede2aa8c2ac7ff0197b867ae55bb2567fd4131b` |
| Preseed summary / transcript | bench | `42153ebe7f273077cbca5c673295ce2b1772fa54eb5fe8b9a9da84b27392385f` / `39c214835e6e818c1fbb88880974c1bd0bb4f9de630484e1daded49a11fed352` |
| Preseed publication / commit receipts | bench | `622da622bd157bb1c74824c72954ab8627d42c7f384ba6bb051dddeb9eccb2d0` / `2ebfd89b4c21e20f84894b7e95b2b6004c7a79934d6af3b6a981cb58b69b7ca2` |
| Preseed precommit / completion | bench | `e4c3dc9ce5309b08a49e0dba0a978a1f02fe4888e19669ae0cb4d3f51c0dbf83` / `b5377e4ec02d55a3af57e735e3a4100bbbb14a1f9929b591d32e56224cc5ec9f` |
| Preseed invocation receipt | bench | `28672318c6307052ba3fd57685867989ea62f38fe2d9f3c9f9b1c076c1881749` |
| Preseed capture verification | `live-capture-verification.json` | `66195733ac458c2de07b593aa27cf655c405070bf083ea2cd144a86de5680239` |
| Preseed 1440 / 800 images | `live-author-capture/screenshots/` | `f8a35f467d387d39467672bf9f4a72231273bcd9ce67e139a2c2ffb23fee3b8e` / `8cb8b219853e1272ca85441819c6ebc65179be88b39e1874de378cd978f78d6b` |
| Baseline freeze | `baseline-author-freeze.json` | `157554760ed634dce6c1085c9b23ed02c339939f5be27608c28cfcaddd8d7fe7` |
| Baseline driver | `matched-edit-smoke.mjs` | `eca19dbcd9a7a6d4e0ed1615dcaf9ea82e49455b2ffe4b423de6d5810fc7f7ba` |
| Baseline summary / transcript | bench | `6fd51353fb5136e83200ee0fed189f822f6a9274e4df5bece445f5ef33c1bcf7` / `6a40ae282aabadf7a4b07bdd2fc478db02443ebd3f23a175b4a98a3881038801` |
| Baseline capture verification | `baseline-capture-verification.json` | `5126c195dba00c006e01068ff47f4cbca625b5843f9e498e1e0283c235086cc2` |
| Baseline author review | `baseline-author-review.json` | `e5c2c675eca4a3bd2d505017e07cea0fae950c9290356072c653f4a2ba01aa1f` |
| Baseline visual review | `baseline-visual-review.json` | `cb138480cd1921c7eb02d96cb8c9dbf1513feb7a273cdf69106b14d6ce7674b4` |
| Usage comparison | `matched-usage-comparison.json` | `c411e31c35d65370572b30ecaea714d3cfae02a1408343917dd4cb2c66366c3e` |
| Accepted / fold comparisons | `matched-accepted-comparison.json` / `matched-fold-comparison.json` | `a995da21b57d8b11c1dd6dccbd40e143f06418aeea67fd2e401778f80ae9a42e` / `16b2d33faca1adff387560d3dcf48e5e16de090a7626f7796e2352471e6ed91f` |
| Follow-on plan | `local-copy-diagnostic-plan.json` / `.md` | `219b5134cdfd78ad7cb5e119e7514d73f44ecb55185dbbf6eec3429377298933` / `3d0ded54af7b1b74431dd1280a240b7a5410db99e58a9e98882542752463f1fd` |

Other reviews: `live-author-review.json`, `live-author-visual-review.json`,
`root-live-visual-review.json`, `root-baseline-visual-review.json`. Residual:
`core-fix-notes.md`. Follow-on advice: `fable-post-pair-decision.json`.

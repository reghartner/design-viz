# Claude folder experiment: evidence and live acceptance

Date: September 27, 2026. Branch: `codex/claude-folder-session`.
No merge. The production Flowview deployment is unchanged.

## Delivered

The static workbench has an Agent pane and a new-story entry. A browser folder
grant creates an inspectable helper, current authoring skill/toolkit, and visible
copy/paste instructions. Messages, progress, replies, source changes and receipts
travel through local files. No local server, agent backend, browser tools for
Claude, automatic Claude launch, or account credential handling is part of the
product. Source changes reuse editor validation and one-action Undo/Redo. Chat
stays open during Undo/Redo. A story ledger carries the worksheet and engineering
gaps into a later session.

A separate owner-private test copy is deployed at
https://flowview-claude-folder-trial.costa-chuck.chatgpt.site . Its private sign-in
is access control for this temporary copy, not the proposed Claude authentication
flow. Open the page in desktop Chrome or Edge for the live folder trial.

The experiment supports one active user message and one pending proposal at a
time. Resume keeps the last 100 conversation messages, verifies exact saved
source, changes connection identity and does not automatically replay old work.
Same-origin tabs use a Web Lock; other origins/browser profiles rely on identity
and heartbeat checks and must not connect concurrently to the same folder.

## Automated evidence

- Full JavaScript suite completed successfully after updating the build-fixture
  inputs for the new packaging helper: 1,296 tests, including one existing skip.
- Full Python suite: 180 tests passed. The subsequently added kit-integrity
  assertion passes in the focused 12-test build suite.
- New protocol tests cover exact source revisions, human typing, deferred
  application, receipt-write retry after an applied edit, wrong identity/request,
  incomplete JSON, invalid proposal IDs, UTF-8 size limits, disconnect during a
  read, ownership loss, source reconciliation on resume, filesystem failures,
  listener expiry and externally replaced files.
- Six Python helper tests cover atomic envelopes, pending proposal receipts,
  stale/disconnected requests, filename escape, symlinks, toolkit checksum/path
  checks, watcher deduplication, bounded watch expiry and a renewed watcher
  skipping a completed request.
- Three browser contracts pass against the built HTML on Chromium 153.0.8010.12:
  question/answer, source change, actual rendering, Undo/Redo, inert reply text,
  selected context, picker cancellation, unsupported capability, and 50 measured
  exchanges. Only the picker/directory handles are substituted; they are backed
  by actual disk files and the actual delivered Python helper. There is no
  localhost server. Requests are limited to static editor/catalog/starter assets.
- An extracted authoring kit independently stamps and validates the audio-story
  starter with zero errors/warnings, runs its complete state walk, and supplies
  battery widget documentation without repository dependencies.

The browser tests and protocol tests simulate the agent. They do not prove a
native folder grant, Claude model behavior, or permission ergonomics.

Reproduce the focused checks:

```sh
python3 tools/build.py
node --test tests/folder-agent.test.js tests/agent-session.test.js
python3 -m unittest discover -s tests -p test_folder_agent.py
python3 -m unittest discover -s tests -p test_build.py
npm ci --prefix tools/browser-tests --no-fund --no-audit
npx --prefix tools/browser-tests playwright test --config tools/browser-tests/playwright.folder-agent.config.mjs
```

## Measured file transport, excluding model work

50 sequential requests/replies, foreground test browser, 250 ms poll interval.
The actual Python watcher emitted request events; a deterministic test wrote
replies through the helper. Browser directory handles were injected adapters
backed by local disk. This is not a native File System Access performance claim.

| Direction | Median | 95th percentile | Maximum |
| --- | ---: | ---: | ---: |
| Request file publication → watcher event | 102 ms | 246 ms | 253 ms |
| Reply file publication → editor display | 89 ms | 163 ms | 284 ms |

Artifact: the browser test attaches `file-transport-latency` and writes
`latency.json` under its ignored test-results directory. No CI assertion is made
about absolute timing. Claude processing and tool approval add separate latency;
background browser throttling or sleeping can delay both directions.

## Live acceptance remains open

Claude Code 2.1.283 is installed and its existing subscription login was confirmed
without reading credentials. A visible terminal was opened with `--no-chrome`,
empty strict MCP configuration, and an explicit local-tool list. No prompt was
submitted to Claude by this implementation session. Its actual offered tools,
Monitor availability, wake-up, and renewal have not been observed.

The private site deployed successfully, and its sign-in screen was reached in
the in-app browser. The user was asked to perform the native Chrome/Edge folder
grant and paste the complete prompt into the visible Claude session. Those
interactions remain pending; the initial phase's live acceptance gate is not met.

Complete these before calling the experience proven:

1. Native browser grant on the deployed HTTPS page; read an externally replaced
   file and write one Claude can read. Verify cancellation/revocation and network
   activity. Test downloaded HTML separately; it is not yet verified.
2. Inspect Claude's offered tools. Confirm no browser integrations and that
   Monitor is present. Keep normal permission prompts. If Monitor is unavailable,
   report it rather than adding a hidden process, server, or permission bypass.
3. Three real conversation turns, including a question answered inside the
   editor and a follow-up after an idle period. Example: explain a subscription
   order to business readers, add a failed-payment branch, then ask an engineer
   to enrich that same story without changing its meaning.
4. Observe proposal receipt, rendered result, Undo/Redo, saved story ledger,
   disconnect, and resume with the exact source. Confirm no old turn replays.
5. Observe bounded Monitor expiration and renewal. An instruction to renew is
   not evidence that renewal works. Measure model latency separately.

The implementation is ready for this paired trial, not a completed business-user
adoption study or a production rollout.

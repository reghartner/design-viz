# Required browser contracts

This package keeps Playwright out of the shipped Backstage and Forge packages.
The exact `@playwright/test` version and lockfile select its matching downloaded
Chromium. The runner never uses `channel: chrome`, a system browser or a fallback.
A launch preflight prints the actual browser version before building fixtures and
fails with installation guidance if launch is unavailable.

Use Node 24 and install the locked host build dependencies from the repository:

```sh
npm ci --prefix apps/backstage --no-fund --no-audit
npm ci --prefix apps/confluence --no-fund --no-audit
npm ci --prefix tools/browser-tests --no-fund --no-audit
npm run install:browser --prefix tools/browser-tests
python3 tools/build.py
npm run check:viewer --prefix apps/backstage
npm test --prefix tools/browser-tests
```

On Linux, install Chromium and its system dependencies with
`npm exec --prefix tools/browser-tests -- playwright install --with-deps chromium`.
Changing the pinned Playwright version requires its matching browser download and
a full contract run. There are no retries or missing-browser skips. The
`browser-contracts` CI job runs on every pull request and main push alongside the
existing pure, build and host checks; merge only after this job passes too.

## What runs

| Case | Production boundary and assertions |
| --- | --- |
| Offline standalone | Normal `inject.py` uses the current template, then deletes the input JSON. The only delivered file opens offline and restores a composed tab/section/step/contract-row reference, row focus and local fonts; real fragment navigation after fonts settle verifies exact scroll alignment. |
| Committed workbench | The actual committed HTML edits an inspector field with exact surrounding bytes and focus; Undo/Redo retains handwritten source; a real pointer swap has one Undo; a wholly hidden alternate remains the exact source step; a held file read cannot replace a newer project. |
| Builder lifetime | The production named workbench assembly and skeleton receive an appended test-only facade. Destroy retires held graph and captured Home gestures, old controls and public callbacks; two same-DOM remounts each retain one exact Undo. Open picker cleanup and global resource counts return to the still-mounted boot/workspace/Canon/preview baseline. |
| Native React host | The actual `InlineFlowview` component imports its committed static renderer. Two viewers resist hostile host CSS, retain independent state and exact hidden/numeric navigation, reject stale revisions, remount and release their listeners/timers/observers/fonts. |
| Forge resource | The normal production build is copied to an isolated serving root. Only the installed bridge transport is simulated: import/save/reload, invalid-save refusal, alternate/view/transport behavior and explicit link routing run through the shipped app. |
| Tracker contract | Real browser listeners verify duplicate/capture/once/abort and callback receivers; timers, RAF and observer retirement validate the shared instrumentation. |

The server binds an ephemeral loopback port and serves only temporary fixture
outputs. The workbench fixtures include the real local catalog. Global setup
uses normal build commands and shared named entrypoints; no private source or
neighboring-comment slicing is used. Temporary serving roots are removed after
the suite. Forge's ordinary ignored `static/viewer` build remains in its normal
location. The full installed Backstage rehearsal remains a separate documented
integration check; this thin React host does not replace it or establish company
SSO, authorization or CSP acceptance.

Fixtures fix viewport, locale, timezone and motion. Forge uses normal motion to
exercise Play/Pause with autoplay disabled; other cases reduce motion. Waits
observe DOM/source/callback or resource completion rather than elapsed sleeps.
The offline case observes the initial native row `scrollIntoView({block:
'start'})` request without changing it. Initial font loading can shift layout;
after fonts settle, real hash changes select another row and return to the target.
The precise scroll assertion uses the requested row position clamped to the
document maximum, with one-pixel rounding tolerance. It does not directly scroll
from the test or require continued automatic scrolling while fonts load. Both
initial and settled geometry are attached to the report.
Pointer tests hover the current node before measuring coordinates after a render.
No page errors, console errors, failed/HTTP-error requests or outbound requests
are accepted. External requests are blocked and still fail the audit.

## Resource ownership and diagnostics

`helpers/resources.mjs` is test-only instrumentation installed before host code.
It counts listeners on window, document and shadow roots, function timeouts,
intervals, animation frames, observed owners and font faces. Ordinary detached
control nodes are not stored in a listener ledger. Observer targets use weak sets.
Native receivers, listener duplicate/capture identity, once removal, abort signals
and timeout/interval cancellation aliases retain browser behavior. String timeout
handlers are passed through unchanged; the product uses function callbacks.
This is an ownership regression probe, not a heap profiler or whole-page teardown
claim. Compare the actual baseline of the surrounding host that remains mounted.

Reports stay in ignored `playwright-report/`, `test-results/` and `report.json`.
A failed case retains its trace, screenshots (including extra pages) and strict
browser audit. CI uploads these results even on failure. A launch failure has no
page to screenshot and is reported as a global setup error.

```sh
npm exec --prefix tools/browser-tests -- playwright show-report tools/browser-tests/playwright-report
npm exec --prefix tools/browser-tests -- playwright show-trace path/to/trace.zip
```

For a missing-browser check, point `PLAYWRIGHT_BROWSERS_PATH` at a new empty
temporary directory and run the normal test command. It must exit nonzero before
fixture builds, without falling back to another installation. Do not delete or
move a shared browser cache to perform this check.

# Explicit visibility evidence

A correct carried value can be hidden behind a phone home screen, a card's
`visible:false`, a step's whole-panel visibility or a named layout. Declare what
must be visible at a story beat in a companion JSON file. This does not extend
FlowSpec or change `spec_walk.py --expect` (which still checks values only).

```json
{"version":1,"expectations":[
  {"section":"arrival","view":"story","path":"happy","step":"open-app",
   "panel":"app","field":"battery","visible":true},
  {"section":"arrival","view":"story","path":"offline","step":"wait",
   "panel":"camera","visible":false}
]}
```

All targets are required, exact and case-sensitive: `section` is the canonical
section reference (prefer an explicit section ID); `view` is the named layout
ID, `layout` for a legacy section layout, or `flow`/`home` for supported focus
views. `path` defaults to `happy` in diagrams without authored paths, but must
still be written explicitly. `step` uses the canonical step ID/position rules.
`panel` is its declared ID. Optional `profile` is `default` (the default),
`backstage`, or `confluence` and chooses layout geometry, not a different host.
There are no wildcard selectors, JavaScript, automatic fallback targets, or
implicit defaults for section/view/path/step/panel.

Omit `field` for whole-panel content of any panel type. A DeviceApp `field`
selects a declared card ID, not a dotted state path. DeviceApp evidence derives
from the renderer's `deviceAppModel`, including app versus home screen and
per-card visibility. Other internal fields/types are **unsupported**, even if
that panel is hidden; they cannot pass an expectation. The panel-owned
`visibilityEvidence(panel,state,field)` facet can add future supported evidence
without a central panel-type switch. Its address is trusted repository metadata.

```sh
node tools/visibility-check.cjs story.spec.json story.visibility.json
node tools/browser-tests/visibility-audit.mjs story.spec.json story.visibility.json
```

The first command works with Node in a source checkout or extracted authoring
kit. It labels its result **presentation-eligibility**: full selected-path state
and whole-panel visibility fold through skipped stops; view membership and
reachable stops use the same filter normalization as playback. Unknown,
ambiguous, excluded or filtered targets fail even when `visible:false` was
requested. It never navigates an editor-only preview to reveal hidden stops.
Intentionally hidden content is separate from an unreachable story beat.

The second command is a full-checkout coordinator tool. Install the locked
`tools/browser-tests` dependencies and their Chromium as described in
[browser contracts](../tools/browser-tests/README.md). It builds the current
production native renderer, mounts the unchanged spec, and navigates each
expectation in file order, preserving path switches. It records renderer hash,
browser version, viewport (1440 × 1000), logical results and DOM measurements.
The native host uses the chosen layout profile. Standalone and Workbench hosts
are not audited by this command.

Whole-panel evidence measures `.pbody`, because hidden content may retain its
frame and visible docked controls. Card evidence uses trusted panel metadata.
A true expectation needs the full evidence bounding box inside the viewport and
overflow ancestors, non-hidden CSS, and five unobstructed hit-test samples. A
false expectation requires actual absence or CSS hiding; offscreen, partial or
occluded content fails either expectation. Only normal section navigation may
scroll the page; the checker never scrolls a card into view to rescue a result.
Clipping and sampled occlusion are measured, not complete pixel visibility,
legibility, correct values or source truth. Review captures and source evidence
separately; these checks are not a substitute for a rich, source-grounded story.

Both tools are read-only, do not fetch source links, and emit machine-readable
results identifying each target and reason. Exit 0 means every applicable check
passed; 1 means a failed/unsupported/invalid expectation; 2 means malformed input
or a tool failure. Browser absence never passes. Page/console errors, failed/HTTP
error requests and blocked outbound requests fail the browser audit. No user
selectors or scripts are accepted. Shared topology must be checked in its
resolved authorized preview; unresolved imports are rejected without modifying
or flattening accepted source.

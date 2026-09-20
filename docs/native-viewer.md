# Native viewer ownership

Backstage renders the shared Flowview engine directly through the statically
compiled `mountNativeViewer(host, spec, options)` export. Specs remain inert data.
Each mount gets one dedicated open ShadowRoot and a bounded instance environment.
The standalone HTML viewer and Forge boot paths remain compatible.

## Public surface

```ts
const viewer = mountNativeViewer(hostElement, spec, {
  layoutTarget: 'backstage',
  scrollIntoView: true,
  onWarning: message => showWarning(message),
});
viewer.navigate({section: 'delivery-2', path: 'failed', step: 'timeout'});
viewer.pause();
viewer.destroy();
```

The handle exposes `root`, validation `warnings`, `navigate`, `pause` and
idempotent `destroy`. `skin` selects a supported skin; an omitted skin uses the
spec/default. Optional `backlinks` supplies already-derived evidence data.
`onChange` reports viewer state changes, and `onResize` reports measured content
height when a host needs it. Backstage itself uses normal document layout.
Types are authored in `src/native/mount.d.ts` and copied into the package.
The host's existing `ViewerTarget` extends this type with its request counter.

Mount into an empty, dedicated HTML element. Destroy before reusing it; a second
simultaneous mount in the same root is rejected. A failed validation/render clears
the acquired native environment. Navigation errors are recoverable and leave the
current viewer mounted. Destroyed handles reject navigation and ignore pause.
Caller data is normalized and validated without changing the authored object.

`sectionRecords()` provides the all-section/tab identity. `resolveSourceStep()`
resolves path membership and raw source index; an exact step calls `jumpSource`
directly, without first selecting its path. This preserves named-view filtering
while previewing a wholly hidden alternate. Path-only navigation retains the
existing refusal when that view has no visible stops. Canon diagram-only indexes
and editor raw JSON addresses remain distinct.

## Source and build owners

| Responsibility | Source |
| --- | --- |
| Timers, animation frames, observers, event surfaces, fonts, cleanup | `src/native/environment.js` |
| Shared renderer invocation, exact navigation, safe links, sizing callbacks | `src/native/mount.js` |
| Static composition of logical validator/engine/compatibility/Canon bundles | `tools/native-viewer-build.mjs` |
| Root selector token transformation | `tools/native-viewer-styles.mjs` |
| Portable minified ESM, declarations, compatibility metadata and font licenses | `apps/backstage/build-viewer.mjs` |
| Authenticated reads, revision ownership, retry and visibility pause | `apps/backstage/src/hooks/useInlineViewer.ts` |

The native composer uses the existing source loader and panel registry. It does
not fork rendering algorithms or panel dispatch. Sources compile inside a fresh
lexical scope per mount, so internal counters and closures cannot collide across
viewers. Browser names used by rendering resolve to that instance's explicit
subset; real host globals are never patched. Native boot does not run standalone
URL, clipboard, storage or address-bar synchronization hooks. Adding a browser API
to renderer code requires checking its native ownership here.

## Why ShadowRoot

Two native viewers were tested together with hostile host CSS for buttons, SVG,
`.docview` and custom properties. Shadow roots preserve local query/ID/SVG symbol
resolution and separate their skins. Build-time selector handling rewrites only
root type selectors and `:root`; class suffixes, attributes, quoted values,
comments and keyframes remain intact. Type specificity and source order are
preserved. Add selector fixtures when extending the transform; it is a constrained
transform for the shipped stylesheet, not a general CSS parser.

Fonts use namespaced `FontFace` families because real Chrome did not activate
shadow-only `@font-face` declarations in the prototype. Live mounts share one
set per owner document; the last destroy removes it. Font load completion never
re-adds a retired face. No global font/style element or body class is installed.

Shadow DOM provides ownership, **not a security sandbox**. This pinned package is
trusted host code. It has no renderer request transport, remote script loading,
`eval`, or `new Function`. Embedded image validation allows bounded PNG/JPEG/WebP
data only. Text is escaped. HTTP(S) links without credentials open separate tabs
on explicit action; capture guards also cover menus created after initial render.
The company host supplies its normal script policy plus required inline styles
and data fonts/images. No iframe or generated Flowview script hash is required.
Local checks do not establish company CSP, SSO or authorization acceptance.

## Events and retirement

Inside document-style events run at the shadow root so original targets and
active focus survive retargeting. Outside document events are dismissal signals;
keyboard actions stay with the focused root. Document/window wrappers normalize
listener identity by type, function and capture flag. Menus track composed scroll
ancestors, including host containers outside the shadow tree. Existing queued
scroll events without movement still preserve a newly opened menu.

Destroy marks the environment retired before cancelling tracked timers, intervals,
animation frames and observers, removing listeners, cancelling element animations,
releasing fonts and emptying the root. Scheduled callbacks also check retirement,
including callbacks already queued by an observer. The page controller destroys
its panels/menus first, with environment cleanup in `finally`. No late panel or
font callback may change an unmounted view or its replacement.

## Verification

Run root native/backlink/entity tests, the full shared Node suite after shared
engine edits, `python3 tools/build.py`, and the relevant Python build tests. Then:

```sh
npm run build:viewer --prefix apps/backstage
npm run verify --prefix apps/backstage
npm run check:viewer --prefix apps/backstage
node tools/verify-backstage-copy.mjs
node --test tests/canon-bundle.test.mjs
npm run verify --prefix apps/confluence
node --test examples/backstage-e2e/tests/*.test.mjs
```

Portable tests load the actual compiled renderer without the upstream tree. They
cover hidden/numeric source jumps, unsafe data/links, failure cleanup, independent
mounts and host request races. Root tests combine actual entity-index output with
the real core and native mount navigation. Browser acceptance uses two actual
React instances, host CSS conflicts, Home/attached controls, nondefault skins,
SVG symbols and visible motion, keyboard menus, host scroll, reduced motion,
revision races and unmount/remount. Test real browser layout and resource cleanup;
jsdom cannot establish those visual properties.

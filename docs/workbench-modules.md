# Workbench source modules

The workbench uses ordered plain JavaScript fragments. Its existing public
function names remain available in the shared browser scope. The named
`workbench` entrypoint from `tools/source-loader.cjs` owns the full UI assembly:
`body` excludes explicit boot, and `source` includes it. Use the logical
`builder.workbench.js` bundle for focused controller harnesses; pure planner tests
load only their required leaves. See [build entrypoints](build-entrypoints.md) for
the common source, export and asset contract. Reading the physical builder file omits its source-edit, raw-target, command, session and
inspector, I/O, interaction and lifetime dependencies.

`src/source-bundles.json` expands that bundle in this order:

1. `workbench/source-edit.js`: JSON scanning, locations and text splices.
2. `workbench/targets.js`: addresses in the raw authored document.
3. `workbench/commands/common.js`: shared editing helpers and bulk dispatch.
4. `workbench/commands/graph.js`: graph identity and reference cascades.
5. `workbench/commands/document.js`: page/section/tab edits and templates.
6. `workbench/commands/narrative.js`: steps, paths, hops, tones and patches.
7. `workbench/commands/layout.js`: row/node placement, section layouts and views.
8. `workbench/persistence.js`: injected draft storage and debounce lifetime.
9. `workbench/session.js`: live source, authored selection, history and project policy.
10. `workbench/field-values.js`: pure field collection and registry metadata views.
11. `workbench/inspector-model.js`: pure position, effective-state and field-help models.
12. `workbench/lifetime.js`: local listener, delay and cleanup ownership.
13. `workbench/controls.js`: shared commit event policy.
14. `workbench/inspector.js`: forms, panel editor cache and refresh lifetime.
15. `workbench/io-model.js`: pure Mermaid preparation, filenames and HTML injection.
16. `workbench/io-browser.js`: bound browser resource adapters.
17. `workbench/io.js`: import/export controls and independent operation lifetimes.
18. `workbench/interactions.js`: selection, board markers, modes and graph gestures.
19. `workbench/add-menu.js`: destination selector and modal insertion chooser; commands and history stay in their existing owners.
20. `builder.workbench.js`: composition, outline, source focus, insertion and preview coordination.
    Callers load the validator/panel assembly first.

The logical `clipboard.workbench.js` bundle loads
`workbench/commands/clipboard.js` before its existing clipboard transport UI.
The logical `reuse.workbench.js` bundle similarly loads `commands/reuse.js`
before its dialog controller. The physical `layout.workbench.js` contains only
controls and gestures; its pure helpers and lifetime helper come from the builder
assembly above. Standalone satellite UI tests load `workbench/lifetime.js`
explicitly; shipped satellite bundles do not duplicate it.
The logical `workspace.workbench.js` bundle prepends `workbench/preview.js` to
the workspace layout/preferences controller. Preview identity and render attempts
live in that leaf; workspace layout never owns authored source. Browser boot and
tests use these same implementations, each declared once.

Logical bundle arrays list physical files, not nested logical bundles. The named
workbench entrypoint orders those bundles and the boot file. Portable builds
expand that entrypoint into the offline workbench; there is no runtime loader or
filesystem access. Panel-specific authoring remains in the panel registry and type modules.

## Pure source editing

`source-edit.js` has no DOM, panel, renderer or editor-session dependency. Tests
can load that leaf alone. It owns `jsonSkipWS`, `jsonSkipString`, `jsonSkipValue`,
`jsonContainer`, `jsonLocate`, `jsonIndentFor`, `jsonInsertMember`,
`jsonInsertListItemOrCreate`, `jsonReplaceValue`, `jsonRemoveMember`, `jsonSetField`,
`jsonInsertArrayItemAfter` and `jsonSwapListItems`.

A location is a range in the input text. Successful splice operations return new
text, with any `start`/`end` offsets referring to the resulting text. Offsets use
JavaScript string indexing. A swap returns `first` and `second` ranges in the
result, ordered by the smaller and larger list indices. Missing locations or
unsupported containers retain their existing `null` result. Removing a missing
field through `jsonSetField()` retains its successful unchanged-text result.

The scanner is tolerant source-navigation code, not a JSON validator. Escaped
strings are skipped as authored; duplicate object keys locate the first matching
occurrence, while `JSON.parse()` keeps the last. Validate/parse at the existing
caller boundary rather than changing these rules during extraction.

Splices preserve every character outside the replaced or removed span. Values
that a planner deliberately rewrites may be reindented within that span. Inserted
snippets retain the existing LF policy and infer indentation from their container;
they do not normalize surrounding CRLF, whitespace or string escapes. Do not
replace a surgical edit with serialization of the whole document.

## Raw targets

`targets.js` owns `specSectionPaths`, `specValueAt`, `builderTargetPath`,
`builderPathString`, `builderDiagram` and `builderTabPath`. These functions operate
on the parsed raw object corresponding to the editor text. Only `builderDiagram`
also needs `jsonLocate()` from the source-edit leaf to check the source location.

Raw addresses preserve `{page: ...}` wrappers, bare pages and bare diagrams.
Section ordinals count prose and every tab in render order. Tab targets instead
use the source block index plus tab index, matching renderer button IDs. A raw
bare diagram has an empty diagram path; it must not become a synthetic
`sections[0].diagram` address.

The [shared viewer core](shared-core.md) exposes normalized-page records for viewer
identity. Those records and Canon's diagram-only ordering cannot replace editor
raw paths. `specValueAt()` returns the original value; addressing does not clone or
mutate the authored object.

## Pure command families

The command leaves use the shared core, source splices and raw targets. They do
not access the DOM, history, storage or clipboard APIs. Pure command tests load
the required leaves instead of the builder initializer or DOM renderer.

| Owner | Responsibility |
| --- | --- |
| `commands/common.js` | Shared ID/row helpers, registry-backed panel-authoring views, cloning/subtree rewrite, field/list edits and bulk dispatch |
| `commands/graph.js` | Node/edge/group/panel creation, identity changes, deletion cascades, node duplication and insert templates |
| `commands/document.js` | Page/section/tab insertion, deletion, duplication and movement, with raw-list addresses and rendered landing ordinals |
| `commands/narrative.js` | Step insertion, duplication, reordering and global deletion; path edits; hop/outcome, node/tone and panel-patch commands; shared narrative finalization |
| `commands/layout.js` | Row/group/node movement, floats, swaps and stacks; centerpiece, host layouts, named views and pure tile transformations |
| `commands/reuse.js` | Authored step copy/share planning, occurrence removal/independence, occurrence lookup and destination state previews |
| `commands/clipboard.js` | Clipboard envelope parsing, declaration copying, validation, ID/reference remapping and paste planning |

Panel reference changes use registered metadata through `panelRemapReferences()`.
Shared commands must not add a per-panel-type switch. The common panel-authoring
views are registry-backed compatibility adapters used by commands and inspector
controls; they do not cache a panel-type list.

Common helpers depend on graph/document/narrative commands at call time for bulk
dispatch. Narrative hop edits use the graph edge-key helper. Reuse depends on
narrative finalization; layout and clipboard use common/source/core helpers.
Load the leaves needed by the actual operation, with the validator/panel core
first. No command reaches back into `initWorkbenchBuilder()` for a dependency.

`builderSlotGapXs()` receives measured boxes in authored left-to-right order. DOM measurement,
pointer capture, gesture previews, focus and render freshness stay in controllers.
`builderReusePreview()` calls the core path and panel-state fold; it returns data
for the dialog. Commands copy authored patches, never that folded preview state.

## Command result and application contract

A planner accepts current text and its matching parsed **raw** document, and
returns `{error}` or `{text, start?, end?, ...existing metadata}`. Commands clone
before mutation or use local intermediate text. A failure publishes no partial
text or selection metadata and causes no history, render or selection change.
Offsets use JavaScript string indices in the **resulting** text. They may cover a
rewritten subtree rather than a single field; not every command returns a range.

| Family | Result metadata and range meaning |
| --- | --- |
| Common field/list edits | Splice/subtree range when available; `planSetFields()` returns text only. Bulk commands return `count` and final text, without a per-item selection range. |
| Graph | Insert/duplicate returns `kind` plus node `id` or edge/panel source-list `index`, with the inserted declaration range. Rename, retarget, group and delete edits return their rewritten/spliced range without inventing a new selection. |
| Document | Section insertion/duplication uses `kind:'section'` and flattened all-section `index`. Moving a section returns its raw `newPath` and moved span. Tab add/move uses raw `block` and tab-list `index`; adding a tabs block returns raw `block` plus the first new section's flattened `index`. |
| Narrative without paths | Add/duplicate returns `kind:'step'`, source `index` and the inserted step range. Move returns the destination source `index` and the rewritten steps-array range. Global deletion returns the rewritten diagram range. Hop/node/panel toggles add `added`; patch/tone/outcome edits return the edited subtree range. |
| Narrative with paths | Path edits return `kind:'step'`, the selected raw registry `index`, `pathId` and that source step's range. Path removal lands on the primary path's first step. These results do not add reuse occurrence metadata. |
| Reuse | `kind:'step'`, raw registry `index`, destination `pathId`, route occurrence `position`, `insertedIds` and the selected source step's range. `insertedIds` lists copy/share insertion IDs; occurrence edits retain their existing empty list. `position` is not a filtered visible stop. |
| Layout/view | Row moves return destination row `index`; swap/stack returns `kind:'node'`. Named-view duplication adds `layoutId`. Other layout edits return their field/subtree edit without changing selection metadata. Pure tile transformations return item arrays, not edit plans. |
| Clipboard | Paste returns whole-document `text` plus an authored `target` for the pasted entity; it does not return source offsets. |

`builderNarrativeResult()` owns the shared post-mutation path validation, named-view
reachability check and resulting source-step range. `planPathStepEdit()` and
`builderReuseResult()` provide explicit selection metadata; existing entrypoints
remain callable. Path validation precedes view reachability, and action-specific
errors and no-op checks still run in the individual planners.

Field edits splice text. `builderRewrite()` mutates a deep clone of one selected
subtree and preserves all bytes outside that subtree. Bulk operations reparse
their evolving local text and return only the final success; indexed deletion
proceeds from highest to lowest index. Some low-level operations successfully
return unchanged text today. There is no universal no-op/history policy added by
the command layer.

Copying policies remain distinct. Node duplication copies its declaration and
placement; it does not copy story steps. Section duplication includes authored
timelines. Reuse copies complete authored steps under fresh IDs; sharing adds
references to existing bodies. Making a step independent also adds its fresh ID
to views that selected the original; ordinary reuse copies keep their existing
view-membership policy. Occurrence removal retains the body and other paths;
global deletion removes the body and all references, subject to nonempty-path
and view protections.

Clipboard Home elements carry initial state, while timeline patches remain with
the original diagram. Clipboard paste validates the complete copied document and
retains its existing full-document serialization policy, including wrapping a
bare diagram when copied protocol/lane definitions need a page.

The editor accepts one successful result through `session.accept()` at its outer transaction:
preserve form focus, push one Undo snapshot, publish text, render once, run the
operation's selection callback, restore markers/labels, synchronize the story list
and scroll the result range without focusing the source textarea. Bulk edits,
reuse and gestures each retain one outer history application. Preview, cancel,
stale rejection and errors do not apply an edit. Project replacement, import,
source typing and history navigation retain their separate existing policies;
the policies are owned by the session below, while focus and inspector work stay
in the controllers.

## Session and persistence

`createBuilderSession()` and `createBuilderPersistence()` are DOM-free leaves.
Load these two files alone for session tests; they do not need commands, panels,
inspector code or the renderer. The builder composition root injects a source
adapter (`read`/`write`), render callback, persistence instance and UI callbacks.
It wraps native timers when injecting `schedule`/`cancel`, so a leaf never invokes
a browser method with the options object as its receiver. Storage and clock
access are also injected; storage denial keeps the existing editing behavior.

The source adapter is authoritative. `text()`, `parse()` and `snapshot()` read
current exact textarea contents, including invalid JSON and handwritten whitespace
that never passed through a command. `snapshot()` returns
`{text, raw, error, project, renderedText}`; `raw` and offsets belong to that text.
`renderedText` is the injected **usable preview** identity, not a promise that
calling render succeeded. Parse/validation rejection retains the prior successful
identity; a failed replacement after teardown invalidates it. Rejected source
does not make a stale board fresh. Existing geometry and dialog checks still guard their own render/selection
identities; a project counter does not replace independent operation generations.

`target` and `insertSection` hold authored addresses and section ordinals, without
DOM references. The controller separately owns highlighted elements, field focus,
selection ranges, multiselection and gesture state. `invalidateProject()` increments
the project generation, invokes the controller's operation/preview retirement hook
and clears the selected authored target itself. `replaceProject()` also resets
insertion to section zero and cancels a pending draft save.

| Session entrypoint | Publication and history policy |
| --- | --- |
| `accept(plan, hooks)` | Rejects missing/error plans and, when `hooks.snapshot` is supplied, changed exact source or project. Success pushes one Undo snapshot, runs `beforePublish`, writes once, renders once, saves, then runs `afterRender`. Successful unchanged text retains its existing history behavior; there is no universal no-op filter. |
| `importText(text, hooks)` | Adds one Undo entry while keeping the original baseline. Runs caller-specific before/after-render hooks; only Mermaid requests the imported-text keyboard shortcut marker. File/trace parsing, cancellation and dialogs remain in their I/O controllers. |
| `undo()` / `redo()` | Captures the current exact adapter text on the opposite stack before writing the historical text, clearing the authored target, rendering, notifying the UI and saving. Intervening invalid handwriting remains reachable. New actions cap Undo at thirty and clear Redo. |
| `noteInput()` | Marks the project live immediately, clears the import shortcut and schedules the 800 ms save. Typing adds no builder history and is not parsed, rewritten or rendered by the session. |
| `replaceProject()` / `restoreDraft()` | Retires the previous project, publishes once, changes the baseline and runs project-specific hooks. If recovery is still pending, the first Undo target is the recovered draft rather than the boot demo. Typing makes the current text win over pending recovery. |
| `markSaved()` / `save()` | Marks the current exact source as the comparison baseline, or persists the current draft and baseline pair. Saving does not require valid JSON. |

All ordinary builder writes use `accept()`: the common `applyPlan()` path,
connect, row/node/group/edge-label drags, generic insertion and tabs insertion.
Inspector edits keep their current field focus and scroll the resulting source
range without taking source focus. Menu insertion/connect select their source
range when the source panel is visible. Quick connections (Alt/Option-click or
the node inspector action) open the edge inspector without moving source focus;
their preview DOM/listeners retire on cancel, source change or builder disposal.
Drags keep their existing selection and
focus policies. Errors, cancel and stale gesture rejection do not publish.
Pure bulk/reuse/clipboard planners continue to reach one outer application.

Persistence retains the existing `dv-workbench-draft` and
`dv-workbench-baseline` records. A baseline is recovered only when its `draftText`
matches the saved draft; older drafts without a matching baseline use their own
text and retain the UI's existing explanation. The timer generation makes
already-queued cancelled saves inert. `session.destroy()` retires the session and
its persistence timer, so queued saves and later mutation calls cannot publish.
This is a session lifetime API. Inspector refreshes and form DOM have their own
owner below; I/O has a separate owner, while the builder still owns interaction
listeners and gestures. It does not yet expose a complete editor teardown; each
controller must retire its own resources.

## Controlled preview outcomes

`createWorkbenchPreviewController()` owns the current normalized page, renderer
controller and usable rendered-text identity. Its leaf is `workbench/preview.js`;
it also owns the existing snapshot/restore and `renderWorkbenchPreview()` facades.
The public controller exposes `render(text, request)`, `repaint(skin)`,
`forgetDocument()` and the `controller()`, `page()` and `renderedText()` getters.
Boot's existing `go(fromText, request)` calls this owner and returns its outcome.
The host injects skin selection/presentation, findings and lifecycle callbacks.

For existing-document replacements, this owner snapshots the preview's scroll
ancestors and restores them synchronously after reconciliation. Panel layout
measurements during partial mounting can otherwise clamp the Focus workspace
scroller or trigger page scroll anchoring. Disconnected ancestors are skipped;
shorter content uses the browser's normal end clamp. Project/import replacements
do not inherit the old position, and there is no delayed scroll restoration to
override a subsequent user gesture.

Every render attempt returns `{ok, replaced, text, origin, reason?}`. The text is
the captured attempt, not an assertion that the current editor has that preview.
Parse or validation rejection reports `ok:false, replaced:false`, leaving the
prior renderer and its rendered identity intact. Success reports both true only
after the new renderer and tab/path/layout restoration finish. A replacement
exception reports `reason:'render'` and the original error. If teardown began,
the retired controller/page/rendered identity are cleared and partial board DOM
is removed; a new controller whose restoration fails is destroyed. A failure
before teardown leaves the old controller usable. Failed replacement is never
reported as successful or treated as a fresh preview of the accepted source.

Session operations send explicit origins (`edit`, `history`, `import`, `project`)
and operation-specific retention. The common planner application retains
multiselection and an armed ADD TO STEP mode; other ordinary entrypoints keep
their existing clear/landing policies. History clears its authored target before
rendering, so synchronous reconciliation cannot briefly navigate an obsolete
index. Successful source acceptance remains one history action even if rendering
fails: the source is saved, remains repairable and can be undone. Post-render
session hooks also receive the outcome: ordinary `afterRender(plan, outcome)`
keeps its plan argument, while project/import hooks receive the outcome directly.
The boolean acceptance result remains unchanged.

Boot sends one `beforePreviewReplace(request)` notification immediately before
teardown and one `previewRendered(outcome)` notification after the attempt.
Manual Render, skin repaint, layout host preview and session-driven renders use
that same path. Builder cancels stale gestures/connect, applies explicit retention,
and refreshes selection/markers, row/layout controls, outline and story index
directly. There are no controlled-render child-list observers or pending
`multiSurvive`/`addModeSurvive` flags. A rejected attempt cannot leave retention
state for some later replacement to consume. Engine `dv:pathrender` still means
board reconstruction on a route; `dv:pathchange` still means reader navigation.
Those explicit events keep their distinct selection/mode policies.

The Steps Path selector resolves the route to a **raw registry source index** and
calls `jumpSource(index, pathId)` directly. A wholly hidden alternate can therefore
be inspected without requiring a visible playback stop first. Snapshot/restore
uses unique authored step identity within the route, maps it back to a source
index after reordering, and restores via `jumpSource` before settling the frame.
It never substitutes a visible-stop ordinal. Existing ambiguity refusal, tab,
layout and named-view subset preferences remain intact; authoring does not rewrite
the view filter or change the viewer's refusal to play an empty visible route.

## Interaction and builder lifetime

`createBuilderInteractions()` owns board hit testing, single/multiple selection
rings, step-member markers, ADD TO STEP and connect state, graph label/node/group/
row gestures and their temporary SVG elements. It receives the live session,
inspector, source-range action, preview lookup, apply transaction and small
composition callbacks for story/layout refresh, insertion status and overlays.
No gesture state escapes into the builder closure. Mode/selection reads and
semantic selection, cancellation, decoration and replacement operations are
available to composition; callers cannot mutate raw drag state.

`beforeReplace(request)` cancels temporary gestures and reconciles the operation's
explicit multi/add retention policy. `retire()` clears selection and modes without
committing. `destroy()` also removes owned events, delays, markers and editor-only
row/Home buttons. Held listeners and public interaction operations become inert.
The existing planners, exact source snapshots, per-action focus policies and one
outer session transaction remain unchanged.

`initWorkbenchBuilder()` now returns an idempotent `destroy()`. It composes the
interaction, section-layout, step-list/reuse, panel-picker, clipboard, inspector,
I/O and session lifetimes, plus its own source/history/insertion/outline/Add chooser
controls. It clears `BUILDER_JUMP_TO_FINDING` only if the installed callback still
belongs to this mount. Old public mutation/render callbacks and retained controls
cannot publish after destroy. Remounting the same editor DOM installs one live
set of controls and one history stack. Cleanup attempts every owner before
rethrowing the first cleanup error; it never leaves later owners active merely
because an extension cleanup failed.

`createWorkbenchLifetime()` is a local resource ledger, not a shared application
state store. `listen()` normalizes listener capture/duplicates, returns a remover,
and guards retained callbacks; `delay()`/`cancelDelay()` guard queued callbacks;
`own()` registers explicit cleanup. `destroy()` first retires the owner, removes
listeners and cancels timers, then runs all registered cleanup functions. Each
inspector form, step/reuse row list, picker card/filter list and outline/Add chooser/
diff rebuild replaces its child scope. Section-layout controls retain only the
current section DOM and field scopes. Normal rerendering therefore releases
old control listeners rather than retaining every previous form until unmount.

Section-layout teardown releases pointer capture, cancels deferred keyboard focus,
removes arranger chrome and unwraps its preview sizing frame. The step list owns
its reuse dialog; the picker disconnects its ResizeObserver and releases frozen
preview clones. Reuse and Home forms cancel panel motion on their original render
surfaces. Clipboard teardown invalidates pending platform responses. Dialog
destruction does not explicitly return focus to its former opener.

Builder teardown is **not whole-page teardown**. The preview renderer, boot,
workspace, welcome and Canon remain separately mounted and have their own
lifetimes. A host retiring the page must retire those owners separately. Builder
destruction does not destroy the preview controller or assume ownership of the
host's document, storage or global event resources.

## Inspector ownership

`createBuilderInspector()` owns form DOM, errors, shared controls, deferred
refreshes, patch/effective-state expansion preferences and the panel editor
cache. These are per instance. The initializer passes the live session and the
existing ordinary `apply` transaction, plus bounded capabilities for the editor
surface, selection/source ranges, preview lookup, modes and object clipboard.
The inspector builds and validates field edits itself; its host does not pass
individual form builders or its initializer closure. Gesture state stays with
the interaction owner and is read through mode capabilities.

The public surface is `render`, `renderMulti`, `refresh`, `refreshCatalog`, `retire`,
`sourceChanged`, `message`, `error`, `commit`, `transact`, panel lookup/busy methods
and `destroy`. Current builder entrypoints delegate to this owner. Rendering a
multiple selection receives its authored targets, without taking ownership of
selection rings or gesture state. `retire()` cancels queued refreshes and hides
the inspector surface; `destroy()` also retires its form DOM and cache. Held
render, refresh, mutation and panel-selection callbacks cannot recreate a
destroyed inspector. Builder destruction calls this owner; preview destruction
is still separate.

The existing registered panel editor context remains intact: live source,
target, parse, commit/transact, selection/preview helpers and shared controls.
Factories are cached per inspector by panel type and factory identity, so a new
registered factory replaces that instance's cache entry. Panel-specific fields,
read-model attribution and busy behavior remain registry-dispatched. Group and
accent datalists belong to the inspector DOM and have instance-specific IDs;
one editor cannot replace another editor's suggestions.

A deferred refresh is coalesced and captures project plus authored target
identity, including path ID. Source changes, explicit retirement and replacement
renders cancel it. On a valid same-target refresh, focus is captured **when the
callback runs**, using stable field/control descriptors. The new matching control
receives the caret, input scroll and focus with `preventScroll`; the guide scroll
is restored afterward. Enter therefore retains the edited field, while Tab
retains the user's new destination. If focus has moved outside the inspector, the
refresh does not take it back. Single and multiselection forms share this view
lifecycle; multiselection identity is the project and sorted authored target set,
without DOM elements. New selection/project contexts do not inherit a previous
form's focus or scroll. Catalog refresh waits for an active node field's blur
through the same form scope, so replacing that field also retires its held blur
callback.

`wireBuilderCommit(input, commit, options)` owns Enter/change deduplication and
retry after a rejected value. Blur is opt-in (`blur:true`) for typed row/object
editors; ordinary fields keep their original change/Enter policy.
`commitUnchanged:true` preserves controls that intentionally commit an unchanged
value. The optional `listen` capability binds controls to the current form
lifetime. Enter in a textarea remains a newline. No field policy imposes a new
history/no-op rule on session acceptance.

`field-values.js` collects typed values without DOM or inspector code, retaining
false/zero/null handling, unknown authored keys, enum preservation and the
existing optional clock-parser fallback. `inspector-model.js` owns position and
effective-state attribution with raw source paths; load the shared core and
registry-backed common command adapters before it. These read models do not fold
preview state back into authored JSON or substitute visible stops for source
step indices.

## Import/export ownership

`createBuilderIO()` owns the existing file open/save, HTML export, Mermaid,
trace importer and manual Confluence handoff controls. Its host injects the live
session, source element, document and bound browser adapters, plus small hooks for
project replacement, messages, saved-baseline UI, Add chooser closure, active-workbench
keyboard policy and before/after-import selection. It does not receive the
builder's closure or duplicate session history. The returned API is
`retireProject()` and `destroy()`; builder teardown calls the latter.
Neither method is a claim that the whole editor or page has been torn down.

`io-model.js` retains the existing `mermaidToSpec()`, `specFileName()`,
`exportTemplateOpeners()` and `buildExportHtml()` entrypoints. It loads alone,
without DOM, session, inspector or renderer code. Shared trace conversion and
Confluence validation remain in `trace-import.js` and `confluence.js`. The model
continues to enforce the same HTML injection marker/closing-tag and filename
rules; it does not rewrite handwritten editor text.

File reads, trace reads, HTML export and Confluence copy each have an independent
generation. Starting a newer operation retires only that family's pending work.
Project retirement invalidates all four, aborts pending readers and template
fetches, closes import/handoff surfaces and retires trace preview/search callbacks.
Closing the trace importer also retires its reader and preview. Typing trace text
cancels only its reader; mapping/scope changes invalidate the preview fingerprint.
A held callback cannot overwrite a new project's trace text or activate a stale
preview. Closing or editing a Confluence handoff invalidates pending copy feedback
and fallback selection, so a late rejection cannot take focus.

`destroy()` also removes owned listeners, including dynamically rendered trace
search listeners, cancels URL-revocation timers and revokes remaining object URLs.
Already-queued listeners and async completions check their owner/generation;
retained public methods cannot hide UI belonging to a later mount. Native APIs
are bound in `createBuilderBrowserIO()`; injected tests use controllable readers,
Promises, timers, URLs and directory streams without importing the builder.

Publication policies stay distinct:

- **Open file** replaces the project with exact text even if JSON is unfinished,
  preserving repair and one project Undo. The public validated `loadText()` path
  still validates before replacement.
- **Save** downloads the current snapshot, including invalid JSON, and marks the
  current exact source as the baseline only after download dispatch succeeds.
  Compatibility stamping affects a valid download snapshot, not the live source.
- **Mermaid and trace imports** publish through `session.importText()` once and
  keep the comparison baseline. Only Mermaid sets the imported-text native-Undo
  shortcut marker. Existing warning, focus and selection differences remain.
- **HTML export** captures matching JSON/HTML text at the initiating click. Normal
  source typing does not change that authorized snapshot. Retirement or a newer
  export blocks later template results, follow-on files and stale status messages.
- **Confluence handoff** keeps the same validated compact JSON for copy and file
  download. It is a manual handoff, not a publishing request.

Directory export checks freshness before requesting each file and before starting
its write. If a writable opens after retirement, it is aborted before writing.
Once `write()` has started, that authorized snapshot is allowed to finish and the
stream is closed; a write/close failure attempts `abort()`. Retirement still blocks
the next file and status update. The controller never deletes or rolls back user
files. The platform may have already created a file during `getFileHandle()`;
a dispatched clipboard write or browser download also cannot reliably be recalled.
Object URLs for dispatched downloads are revoked on their existing one-second
schedule or immediately on destruction. Cancelling UI work does not claim to undo
those platform effects.

## Tests and regeneration

`tests/source-edit.test.js` loads only the two pure leaves. It covers locations,
escaped text, missing paths, commas, indentation, exact surrounding bytes, CRLF,
result offsets and wrapped/bare/tab addresses. The full builder harness loads
the named `workbench` body; focused controller and cross-family tests use `readSource()` for their required logical bundles.
The emitted-workbench regression asserts the complete named source occurs once
in the HTML before exercising its definitions, without neighboring-comment slicing.
`tests/workbench-command-context.cjs` loads the core, source, raw-target and
explicit command leaves with throwing DOM globals. Common/graph/document tests
use it, as do the pure narrative/layout, reuse, named-view and selected path/hop
regressions. These tests cover hostile IDs, reference cascades, rollback, CRLF
outside-subtree bytes, result ranges and source-index/occurrence/view distinctions.
The effective-state suite loads only the core, common adapters, source/target
and read-model leaves with throwing DOM globals. Field-value regressions likewise
load their pure leaf, preserving the explicit clock-parser-present/absent cases.
UI harnesses add only their needed controllers or the logical builder bundle;
the visibility-control test, reuse picker, step list and full inspector tests
continue to exercise actual consumers. Clipboard tests likewise keep pure
planning separate from browser transport.
`tests/workbench-session.test.js` loads only session/persistence with throwing DOM
globals and injected storage/timers. It covers exact source snapshots, stale project
and text refusal, invalid handwriting on Redo, pending recovery, debounce retirement,
baselines and disposed callbacks. Actual builder harness tests drive connect, all
insertion families and row/node/group/label gestures, checking one exact Undo/Redo
and each focus policy; a receiver-sensitive timer fake checks the browser adapter.
`tests/workbench-inspector.test.js` exercises the actual inspector factory with
two instances, factory replacement, independent expansion/datalists, held retired
callbacks, repeated form listener disposal, registered panel cleanup, deferred
Enter/Tab/outside focus and same-set multiselection focus. The Home control test loads the
real commit helper rather than slicing a private function out of source text.
`tests/workbench-io-model.test.js` loads the pure preparation leaf with throwing
browser globals. `tests/workbench-io.test.js` loads the real I/O owner and session
with injected browser resources, exercising current and retired reads, clipboard
rejections, template/body races, directory-write boundaries and cleanup failures.
Actual builder harnesses retain import mode, one-Undo and keyboard coverage.
`tests/workbench-preview.test.js` exercises outcomes, notification counts,
replacement exceptions and session history/persistence after a failed render.
Builder/story harnesses invoke the explicit lifecycle; playback tests use real
steppers for hidden-route restoration, source reordering and unchanged view filters.

`tests/workbench-lifetime.test.js` checks capture/once semantics, independent
owners, retained callbacks, queued delays and cleanup errors. Actual builder
harnesses destroy during a graph gesture, invoke held callbacks, remount on the
same DOM and verify one Undo; step-list tests repeatedly replace rows and assert
old listener removal. Clipboard tests hold successful reads and rejected writes
across destroy. Browser acceptance additionally holds real pointer capture in
Home/layout controls and measures listeners, timers, observers and remounts while
leaving the separately owned preview/workspace/Canon mounted.

Run the source-edit and builder tests plus the relevant clipboard, step-reuse,
layout and panel-reference suites when these boundaries change. Shared workbench
extractions also run the full root Node suite and Python build tests. Rebuild with
`python3 tools/build.py` and commit generated changes; a source-only workbench
extraction should leave the standalone viewer and backend runtime unchanged.
Browser verification should include a nested-tab inspector edit, exact source
preservation, Undo/Redo and repair after invalid source. For deferred form refresh,
wait for the old control to disconnect before asserting replacement focus, caret,
scroll and the Tab destination; an immediate assertion can race the refresh. Also verify path reuse,
occurrence independence/removal, layout gestures and clipboard actions each
restore the exact prior source with one Undo.

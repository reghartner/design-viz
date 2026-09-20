# Workbench source modules

The workbench uses ordered plain JavaScript fragments. Its existing public
function names remain available in the shared browser scope. Use the logical
`builder.workbench.js` bundle from `tools/source-loader.cjs` when a tool or test
needs the editor; pure planner tests load only their required leaves. Reading
the physical builder file omits its source-edit, raw-target and command
dependencies.

`src/source-bundles.json` expands that bundle in this order:

1. `workbench/source-edit.js`: JSON scanning, locations and text splices.
2. `workbench/targets.js`: addresses in the raw authored document.
3. `workbench/commands/common.js`: shared editing helpers and bulk dispatch.
4. `workbench/commands/graph.js`: graph identity and reference cascades.
5. `workbench/commands/document.js`: page/section/tab edits and templates.
6. `workbench/commands/narrative.js`: steps, paths, hops, tones and patches.
7. `workbench/commands/layout.js`: row/node placement, section layouts and views.
8. `builder.workbench.js`: presentation, inspector read models and the editor
   initializer. Callers load the validator/panel assembly first. Inspector/session
   ownership is unchanged.

The logical `clipboard.workbench.js` bundle loads
`workbench/commands/clipboard.js` before its existing clipboard transport UI.
The logical `reuse.workbench.js` bundle similarly loads `commands/reuse.js`
before its dialog controller. The physical `layout.workbench.js` contains only
controls and gestures; its pure helpers come from the builder assembly above.
Browser boot and tests use these same implementations, each declared once.

The manifest lists physical files, not nested logical bundles. Portable builds
expand it into the offline workbench; there is no runtime loader or filesystem
access. Panel-specific authoring remains in the panel registry and type modules.

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

`builderSlotGapXs()` receives measured boxes and row direction. DOM measurement,
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

The editor accepts one successful result through its existing outer transaction:
preserve form focus, push one Undo snapshot, publish text, render once, run the
operation's selection callback, restore markers/labels, synchronize the story list
and scroll the result range without focusing the source textarea. Bulk edits,
reuse and gestures each retain one outer history application. Preview, cancel,
stale rejection and errors do not apply an edit. Project replacement, import,
source typing and history navigation retain their separate existing policies;
this command split does not move session or inspector ownership.

## Tests and regeneration

`tests/source-edit.test.js` loads only the two pure leaves. It covers locations,
escaped text, missing paths, commas, indentation, exact surrounding bytes, CRLF,
result offsets and wrapped/bare/tab addresses. Editor and cross-family tests load
the logical builder bundle through `readSource()` so they call the same implementations.
`tests/workbench-command-context.cjs` loads the core, source, raw-target and
explicit command leaves with throwing DOM globals. Common/graph/document tests
use it, as do the pure narrative/layout, reuse, named-view and selected path/hop
regressions. These tests cover hostile IDs, reference cascades, rollback, CRLF
outside-subtree bytes, result ranges and source-index/occurrence/view distinctions.
UI harnesses add only their needed controllers or the logical builder bundle;
the visibility-control test, reuse picker, step list and full inspector tests
continue to exercise actual consumers. Clipboard tests likewise keep pure
planning separate from browser transport.

Run the source-edit and builder tests plus the relevant clipboard, step-reuse,
layout and panel-reference suites when these boundaries change. Shared workbench
extractions also run the full root Node suite and Python build tests. Rebuild with
`python3 tools/build.py` and commit generated changes; a source-only workbench
extraction should leave the standalone viewer and backend runtime unchanged.
Browser verification should include a nested-tab inspector edit, exact source
preservation, Undo/Redo and repair after invalid source. Also verify path reuse,
occurrence independence/removal, layout gestures and clipboard actions each
restore the exact prior source with one Undo.

# Workbench source modules

The workbench uses ordered plain JavaScript fragments. Its existing public
function names remain available in the shared browser scope. Use the logical
`builder.workbench.js` bundle from `tools/source-loader.cjs` when a tool or test
needs planners or the inspector; reading the physical builder file omits its
source-edit, raw-target and command dependencies.

`src/source-bundles.json` expands that bundle in this order:

1. `workbench/source-edit.js`: JSON scanning, locations and text splices.
2. `workbench/targets.js`: addresses in the raw authored document.
3. `workbench/commands/common.js`: shared editing helpers and bulk dispatch.
4. `workbench/commands/graph.js`: graph identity and reference cascades.
5. `workbench/commands/document.js`: page/section/tab edits and templates.
6. `workbench/commands/narrative.js`: shared-step deletion for bulk dispatch.
7. `builder.workbench.js`: remaining narrative/layout planners, presentation
   helpers and the editor initializer. Callers load the validator/panel assembly
   first. Inspector/session ownership is unchanged.

The logical `clipboard.workbench.js` bundle loads
`workbench/commands/clipboard.js` before its existing clipboard transport UI.
Browser boot and tests use these same implementations; no helper is duplicated
between the builder and clipboard fragments.

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
| `commands/narrative.js` | `planDeleteStep()` only in this slice, so common bulk dispatch is fully headless; other narrative planners remain in the builder |
| `commands/clipboard.js` | Clipboard envelope parsing, declaration copying, validation, ID/reference remapping and paste planning |

Panel reference changes use registered metadata through `panelRemapReferences()`.
Shared commands must not add a per-panel-type switch. The common panel-authoring
views are registry-backed compatibility adapters used by commands and inspector
controls; they do not cache a panel-type list.

A planner accepts current text and its matching parsed raw document, and returns
`{error}` or `{text, start?, end?, ...existing metadata}`. Failure publishes no
partial text. The editor applies a successful result through its existing history,
render and selection policy. Result offsets refer to resulting text; metadata
retains its command meaning, such as a list index, raw tab block, rendered section
ordinal, `newPath`, clipboard `target`, or bulk `count`.

Field edits splice text. `builderRewrite()` mutates a deep clone of one selected
subtree and preserves all bytes outside that subtree. Bulk operations reparse
their evolving local text and return only the final success; indexed deletion
proceeds from highest to lowest index. They remain one outer editor transaction.

Copying policies remain distinct. Node duplication copies its declaration and
placement; it does not copy story steps. Section duplication includes its authored
timelines. Clipboard Home elements carry initial state, while timeline patches
remain with the original diagram. Clipboard paste validates the complete copied
document and retains its existing full-document serialization policy, including
wrapping a bare diagram when copied protocol/lane definitions need a page.

## Tests and regeneration

`tests/source-edit.test.js` loads only the two pure leaves. It covers locations,
escaped text, missing paths, commas, indentation, exact surrounding bytes, CRLF,
result offsets and wrapped/bare/tab addresses. Editor and cross-family tests load
the logical builder bundle through `readSource()` so they call the same implementations.
`tests/workbench-commands.test.js` exercises common/graph/document and shared-step
deletion without the inspector, including reference cascades, hostile own IDs,
bulk rollback and source ranges. Clipboard planner tests load the pure clipboard
leaf; transport tests add only its browser adapter. Remaining cross-family and
editor-action tests continue to use the complete logical builder bundle.

Run the source-edit and builder tests plus the relevant clipboard, step-reuse,
layout and panel-reference suites when these boundaries change. Shared workbench
extractions also run the full root Node suite and Python build tests. Rebuild with
`python3 tools/build.py` and commit generated changes; a source-only workbench
extraction should leave the standalone viewer and backend runtime unchanged.
Browser verification should include a nested-tab inspector edit, exact source
preservation, Undo/Redo and repair after invalid source.

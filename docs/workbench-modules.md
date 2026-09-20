# Workbench source modules

The workbench uses ordered plain JavaScript fragments. Its existing public
function names remain available in the shared browser scope. Use the logical
`builder.workbench.js` bundle from `tools/source-loader.cjs` when a tool or test
needs planners or the inspector; reading the physical builder file omits its
source-edit and raw-target dependencies.

`src/source-bundles.json` expands that bundle in this order:

1. `workbench/source-edit.js`: JSON scanning, locations and text splices.
2. `workbench/targets.js`: addresses in the raw authored document.
3. `builder.workbench.js`: domain planners, presentation helpers and the editor
   initializer. It still uses the shared validator/panel assembly, which callers
   load first. The inspector/session and command-family boundaries are unchanged
   in this slice.

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

## Tests and regeneration

`tests/source-edit.test.js` loads only the two pure leaves. It covers locations,
escaped text, missing paths, commas, indentation, exact surrounding bytes, CRLF,
result offsets and wrapped/bare/tab addresses. Planner and UI tests load the
logical builder bundle through `readSource()` so they call the same implementations.

Run the source-edit and builder tests plus the relevant clipboard, step-reuse,
layout and panel-reference suites when these boundaries change. Shared workbench
extractions also run the full root Node suite and Python build tests. Rebuild with
`python3 tools/build.py` and commit generated changes; a source-only workbench
extraction should leave the standalone viewer and backend runtime unchanged.
Browser verification should include a nested-tab inspector edit, exact source
preservation, Undo/Redo and repair after invalid source.

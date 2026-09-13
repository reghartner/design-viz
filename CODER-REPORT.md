# Workbench spec diff — coder report

Implemented the draft-versus-baseline diff view. Changes remain uncommitted; no git commands were run.

## Changes by file

- `src/workbench.skel.html`: added the lowercase `diff` button next to save, with `aria-controls` and `aria-expanded`, and the hidden `diffbox` between the palette and guide.
- `src/builder.workbench.js`: added structural comparisons and parse guards; wired accessible finding buttons through the existing finding jump, `findingLocation`, `jsonLocate`, and textarea selection machinery. Extended validation-path parsing to read the existing quoted-key display syntax. Diff closes on its button, Escape, render, editor input, and opening an inspector/palette. Added the button and finding controls to `ADD_MODE_BLOCKED`.
- `src/builder.workbench.js`: added an in-memory baseline and guarded `dv-workbench-baseline` persistence alongside drafts. Open and save reset the baseline. Recovery captures the stored draft and baseline before subsequent autosaves can replace either. Baseline records include the associated draft text to reject mismatched storage writes. Existing undo handling remains in use for editor replacements.
- `src/style.workbench.css`: shared guide sizing/scrolling with the diff panel, adjusted sticky-editor space, and added full-width finding buttons with kind indicators. Buttons inherit the existing `.bbtn:focus-visible` outline.
- `tests/builder.test.js`: exported the two new pure entry points through the existing VM test pattern and added 12 tests, including mocked-DOM recovery and interaction tests.
- `workbench/flowspec.html`: regenerated using `python3 tools/build.py`.
- `CODER-REPORT.md`: this requested report.

`src/boot.workbench.js` did not need changes. The build also regenerates `template/flowview.html`; no template source was changed.

## Pure functions and contracts

- `diffSpecs(oldObj, newObj) -> Array<{path, kind, text}>`: returns deterministic structural findings for the requested page, section, diagram, contract, and tab fields, ordered against the new document; never mutates either input.
- `diffSpecTexts(baselineText, currentText) -> {error} | {findings}`: parses baseline first, then current text; returns exactly one side-specific error or the structural findings.

Existing helpers extended:

- `parseValidationPath(message)`: additionally accepts quoted keys emitted by `builderPathString` and the whole-document path.
- `findingLocation(text, raw, message, rawPath?)`: optional explicit raw path bypasses normalized-page inference while retaining the existing locator and nearest-parent fallback. Existing validation callers remain unchanged.

Private helpers inside `diffSpecs` are exercised through its public tests: `object(v)` and `list(v)` normalize malformed containers; `pairs(a,b,same,score)` matches identities deterministically; `page(raw)` and `sections(raw)` normalize/walk supported shapes; `heading(ref)` and `similarity(a,b)` identify/disambiguate sections; `existing(path)` finds a surviving parent; `container(path)` maps removed lists through tab and page-shape changes. Internal accumulators `index`, `add`, `fields`, and `compareList` build traversal ranks and findings. The local `endpoints(e)` helper encodes edge endpoint identity.

## Added tests

1. `diffSpecs identical specs are empty and comparisons do not mutate inputs`: identical documents produce no findings and preserve input text.
2. `diffSpecs reports exactly node added, edge removed, step text and contract v changes`: asserts all four exact paths, kinds, texts, and order.
3. `diffSpecs pairs sections by heading and orders added and removed sections around survivors`: checks heading identity, removal links, and reorder-only silence.
4. `diffSpecs is deterministic with repeated headings, reordered nodes, and parallel edges`: repeated calls agree; section/node reorder and parallel edge identity resolve correctly; a unique residual kind edit is reported as changed.
5. `diffSpecs covers page, node, edge, step count, panel, field, and tab changes in document order`: covers remaining requested fields and verifies every resulting path resolves.
6. `diffSpecs paths reuse findingLocation for quoted ids, bare diagrams, and missing containers`: verifies exact selection for punctuation/quotes/backslashes and parent fallback for malformed shapes.
7. `diffSpecTexts reports only the first unparseable side and otherwise returns findings`: baseline/current/both-invalid guards and unchanged valid input.
8. `diff UI toggles, selects JSON, and hides on Escape, input, and render attempts`: tests button wiring, selected text, expanded state, parse-error display, and dismissal.
9. `baseline survives autosave and recovery, and open/save reset it without breaking undo`: recovery retains the original, open/save reset it, and undo after open remains relative to the newly opened baseline across reload.
10. `legacy draft recovery falls back visibly, discard keeps demo baseline, and unavailable storage is safe`: tests legacy recovery notice, discard, and storage exceptions.
11. `removed sections stay in their tab list across reordered tabs and page aliases`: verifies removal placement and links as tabs reorder and blocks become sections.
12. `saved invalid JSON reports an unparseable baseline and mismatched storage falls back safely`: checks invalid saved baselines and unrelated companion records.

## Validation

- `python3 -m unittest discover -s tests -v`: **157 passed**, including existing browser-export smoke tests.
- `node --test tests/*.test.js`: **281 passed**.
- `python3 tools/build.py`: passed. A subsequent rebuild produced byte-identical contents for both generated pages.
- Requested four-example validation command: **zero errors**; warning counts were 12, 13, 4, and 5 respectively.
- The requested `git diff --exit-code template/ workbench/` suffix was not run because the ticket explicitly forbids every git command. Used direct before/after byte comparisons to verify regeneration stability instead; did not compare against the git index.

## Baseline fallback and limits

Legacy draft records contain only `{text, at}`. Their original file/demo cannot be identified reliably without a companion baseline. Recovery therefore uses the recovered text as baseline and displays “original baseline unavailable — diff starts from the recovered draft”. Missing, corrupt, or mismatched companion records use the same fallback. New drafts persist their original baseline.

Removed items select their surviving container; removed sections stay near their original list/surviving neighbour. Edges pair by endpoint-plus-kind identity first; a unique unmatched pair sharing endpoints reports a kind change. Duplicate headings use shared node IDs/contract keys and deterministic greedy matching, rather than Python's exhaustive assignment for small duplicate groups. Byte parity with the Python tool was explicitly out of scope.

No connected browser was available through the UI tool, so the new panel's visual appearance and real-browser keyboard/add-mode interactions were not manually verified. Interaction and storage behavior are covered by mocked-DOM tests; the ADD TO STEP blocklist was inspected. The existing save flow triggers a download and cannot observe whether the user cancels it at the browser level.

No requested field category was cut. No dependencies or unrelated source changes were added.

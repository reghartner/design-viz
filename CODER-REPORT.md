# Mermaid sequenceDiagram import

Implemented the inline workbench import and left the changes uncommitted. No git commands or new dependencies were used.

## Files

- `src/builder.workbench.js`: added the pure Mermaid converter and inline import handlers. Successful conversion snapshots the prior editor text, writes pretty JSON, resets selection, renders, saves the draft, closes the box, and appends one todo-count warning. Conversion errors appear as text in the message list without changing the editor or undo history. Both opening and converting are blocked by ADD TO STEP. Existing undo/redo buttons work; Ctrl-Z/Cmd-Z also restores an unchanged import when the editor or import button has focus. Hand edits retain native text undo behavior.
- `src/workbench.skel.html`: added `import mermaid…` immediately after `+ section`, followed by the hidden inline textarea and convert/cancel controls. The textarea has an accessible name; controls reuse `.fctl` and `.bbtn`, including their existing focus-visible styles.
- `src/style.workbench.css`: added import-box spacing and full-width textarea layout. The box retains native hidden behavior.
- `tests/builder.test.js`: exported `mermaidToSpec` through the existing VM export pattern and added 14 tests, including mock-DOM interaction coverage and validation using the generated bundle.
- `workbench/flowspec.html`: regenerated with `python3 tools/build.py`.
- `CODER-REPORT.md`: this requested report.

No changes were needed in `src/boot.workbench.js`. The mandated build also regenerates `template/flowview.html` from its unchanged source inputs; its bytes are stable.

## Pure function

`mermaidToSpec(text: string) -> spec object`: converts the Python tool's supported Mermaid sequence subset into its default skeleton page, preserving message order, folded edges, protocol inference, participant naming, row order, and todos; throws an Error with line information for invalid input. It has no DOM or storage effects.

The test-only `mermaidDiagram(text)` helper returns the converted page's first diagram.

Oracle details preserved: the first Mermaid fence wins even if it contains another diagram type; nonblank lines determine parser line numbers; nested blocks contribute to their outer block's skipped-message count; notes inside blocks remain separate todos; declarations inside blocks are ignored; the first message fixes an edge's label, kind, and return status. General errors also include line context.

## Added tests

1. `mermaidToSpec makes a bland two-participant page with solid and return edges`: exact nodes, titles, gear/cmd defaults, rows, edges, steps, page title, and empty todos.
2. `mermaidToSpec slugs implicit participants and honors later aliases without reordering`: implicit declarations, slug collisions, later alias updates, and a prototype-named participant.
3. `mermaidToSpec extracts the first markdown mermaid fence as the Python oracle does`: markdown extraction, later-fence exclusion, and rejection when the first fence is not a sequence.
4. `mermaidToSpec infers protocols in Python priority order and splits serpentine rows`: autonumber, HTTPS precedence over MQTT, plain calls, encounter-order row splitting, and a one-node row.
5. `mermaidToSpec folds repeated pairs with first label kind and arrow winning but keeps every step`: repeated solid/dashed pairs deduplicate edges while retaining all narrative steps.
6. `mermaidToSpec records alt opt loop and par todos and skips their messages and participants`: exact todo wording/counts and omission of skipped participants and steps for all four block types.
7. `mermaidToSpec counts nested blocks once and preserves notes in encounter order`: nested and empty blocks, case-insensitive notes, and todo ordering.
8. `mermaidToSpec rejects garbage and malformed or message-free input with line information`: wrong diagram, unknown/empty arrows, unmatched else/end, unclosed blocks, empty slugs, invalid syntax inside blocks, empty input, and non-string input.
9. `mermaidToSpec converts the cumulus HLD and validates skeletons with zero errors`: eight Cumulus nodes, at least ten edges, twelve steps, and validator acceptance for Cumulus, simple, and repeated-pair skeletons.
10. `Mermaid import UI opens focuses cancels and preserves editor and history on failure`: focus transfer, error text, open-box persistence, cancel, and untouched editor/history.
11. `Mermaid import UI renders pretty JSON appends one todo warning and supports undo redo and Ctrl-Z`: replacement, render count, autosave, warning preservation/count, close, undo/redo, and keyboard undo.
12. `Mermaid import UI leaves native text undo alone and adds no warning without todos`: no extra import warning for empty todos and no interception after a hand edit.
13. `Mermaid import UI blocks opening and conversion while ADD TO STEP is armed`: arms the real step-inspector mode, exercises capture-phase blocking, allows cancel, and resumes after Escape.
14. `generated workbench validates imported skeletons and retains expected authoring lint`: runs the converter, validator, and engine from the regenerated workbench bundle; verifies zero validation errors/warnings and the four expected Cumulus lint findings.

## Verification

- `python3 -m unittest discover -s tests -v`: PASS, 157 tests.
- `node --test tests/*.test.js`: PASS, 283 tests.
- `python3 tools/build.py`: PASS. A byte-for-byte comparison of both generated pages before and after another build passed. This replaces the ticket's git-based drift command to obey its explicit prohibition on all git commands.
- `node tools/validate.js --quiet examples/cumulus/cumulus-page.spec.json examples/cumulus/cumulus-page.spec.v2.json examples/doorbell/doorbell.spec.json examples/doorbell-atlas/atlas.spec.json`: PASS, zero errors for every file; respective existing warning totals are 12, 13, 4, and 5.
- Additional direct Python-oracle comparison: all 15 complete spec objects matched, covering Cumulus, each block type, nesting, notes, aliases, both arrow types, protocol inference, pair folding, fences, and self-messages.

## Skeleton warnings

The converted Cumulus skeleton has zero validator errors and zero validator warnings. The bundled renderer's advisory lint produces four findings: two preserved message labels exceed their automatically allocated edge space, and two repeated steps share the first edge (p->b and d->r), so their step coins overlap. A simple repeated-pair skeleton likewise produces one shared-edge lint finding. These follow from the required verbatim first-message labels, bland automatic layout, and retained steps referencing folded pairs. Authoring/enrichment is the place to resolve presentation issues; silently dropping messages or changing their labels would violate the import contract. Todos generate the separate single import-summary warning required by the ticket.

## Limits and scope

The computer-use tool reported that no browser was available, so the new import UI was not visually inspected and actual browser focus/native undo behavior was not manually verified. Mock-DOM tests exercise its real handlers and capture-phase blocking; the generated converter/validator/engine are tested directly. Existing Python browser smoke tests also passed, but do not exercise this new UI.

No deliberate feature cuts. Block conversion, note rendering, semantic enrichment, extra Mermaid syntax, and a general keyboard-history redesign remain outside this ticket's defined scope.

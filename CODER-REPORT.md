# Workbench starter gallery

Implemented the starter gallery, safe replacement confirmation, undo integration,
build injection, and tests. Changes are uncommitted. No git commands were run.

## Changes by file

- `src/workbench.skel.html`: added `starters…` after `+ section`, the hidden gallery
  immediately below the INSERT row, and the `STARTERS` array marker inside the
  existing script IIFE. The toggle exposes its expanded state and gallery target.
- `src/boot.workbench.js`: records the exact editor text after each successful
  render and passes a getter plus the injected starters to the builder. Parse and
  validation failures leave the last successful render text unchanged.
- `src/builder.workbench.js`: builds cards with names, descriptions, and counts;
  loads pretty JSON through the existing undo snapshot machinery; re-renders,
  clears stale selection/connect state, and autosaves. Unrendered edits require
  the inline `load & replace` / `cancel` confirmation. Escape and the toggle close
  the gallery. Gallery controls are covered by `ADD_MODE_BLOCKED`. Ctrl/Cmd-Z
  undoes a loaded starter when the editor still contains that replacement; later
  hand edits retain native textarea undo handling. Cards inherit `.pbtn` focus
  styling and other controls inherit `.bbtn` focus styling.
- `src/style.workbench.css`: added the wrapping, scrollable gallery strip, card
  layout, confirmation row, and explicit hidden styling.
- `src/starters/minimal.json`: one section containing three nodes, one row, two
  edges, two steps, and no panels.
- `src/starters/panels-tour.json`: three nodes, four steps, and state, LED, gauge,
  log, and timeline panels, each with initial state and step patches. The timeline
  contains the requested two `{id, label, every}` lanes.
- `tools/build.py`: an explicit three-entry name/description/source table supplies
  the embedded JSON array. The demo directly references `src/flowview.demo.json`
  without copying or modifying it. Embedded JSON escapes `<` to avoid script-tag
  termination in spec text.
- `tests/builder.test.js`: added starter validation, count/shape assertions, and
  mock-DOM gallery interaction tests.
- `tests/test_build.py`: added verification of all three names, embedded source
  content, IIFE placement, and replacement of the marker.
- `workbench/flowspec.html`: regenerated using `tools/build.py`.
- `template/flowview.html`: rebuilt by the existing build command; byte-identical
  to its pre-edit contents.
- `CODER-REPORT.md`: this requested delivery report.

## New pure function

- `starterCountLine(spec) -> string`: counts node definitions, steps, and panels
  across all diagram sections, including tabs and supported bare spec shapes,
  returning `N nodes · M steps · K panels`.

## Added tests

- `starter specs parse and validate with zero errors and warnings`: parses both
  authored JSON files and the canonical demo and runs the bundled validator.
- `starterCountLine totals all sections and tabs, skipping prose-only sections`:
  checks wrapped pages, section aliases, bare diagrams, and an empty spec.
- `starter scaffolds have the promised nodes, steps, panels and timeline lanes`:
  checks the minimal structure, five panel types, initial states, step patches,
  and two complete timeline lane declarations.
- `gallery toggles, shows counts, loads a rendered editor and preserves undo/redo`:
  checks toggle state, counts, replacement, render invocation, closing, and exact
  restoration through the existing history buttons.
- `gallery protects unrendered invalid text, cancels or confirms, and undo restores exact edits`:
  checks that invalid draft text survives selection/cancellation and that undo
  restores the latest text, including edits made while confirmation was open.
- `gallery Escape dismisses confirmation and Ctrl/Cmd-Z undoes a starter load`:
  checks whitespace-only dirty text, Escape/focus restoration, and both keyboard
  undo modifiers.
- `ADD TO STEP blocks gallery toggle, cards and pending replacement controls`:
  checks capture-phase blocking of all gallery buttons with the mode armed. The
  harness exposes the existing mode state only in its VM copy of the source;
  production code has no test hook.
- `test_workbench_embeds_starters_inside_boot_iife`: checks three names, matching
  source specs and descriptions, IIFE placement, and absence of `{{STARTERS}}`.

## Verification

- `python3 -m unittest discover -s tests -v`: **158 passed**, including the existing
  Chrome capture smoke tests.
- `node --test tests/*.test.js`: **276 passed**.
- `node tools/validate.js src/starters/*.json src/flowview.demo.json`: all three
  specs returned **0 errors, 0 warnings**, including lint findings.
- The required four-example `node tools/validate.js --quiet ...` invocation exited
  successfully: zero errors; warning counts were 12, 13, 4, and 5 respectively.
  Those example files were not edited.
- A fresh `python3 tools/build.py` followed by direct byte comparisons confirmed
  no drift in either generated page. The template SHA-256 remains
  `8583ccd44225ea0193807884b1b8a1f841c8c0894552cda040f7626d6d54cbf5`.
  This substitutes for the requested git diff check because the ticket explicitly
  prohibits all git commands.

## Limitations and deliberate scope choices

- The supported LED panel token is `leds`, not the ticket's literal `led`; the
  starter uses `leds` to render the real widget and validate without warnings.
- This checkout's timeline renderer reads `cadence`, not `lanes`. The requested
  two-lane data is included and passes validation, but the current renderer
  ignores those lanes. Timeline cursor and event patches still work. Adding lane
  rendering would require changes to the out-of-scope engine and validator.
- Reused the canonical demo directly, as expressly preferred by the ticket;
  there is no redundant `src/starters/demo.json` file.
- No interactive browser was available through the browser tool. Gallery
  interactions were tested with the mock DOM; gallery appearance, actual browser
  focus/scroll behavior, and native textarea undo behavior were not visually
  verified. Existing Python browser smoke tests cover their own engine fixtures,
  not this new gallery.

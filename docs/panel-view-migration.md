# Convert panel focus to explicit Views

Panels no longer create Views or choose the opening View. Documents without
Views or named arrangements have one **Standard** View. To give a map, contract,
screen or another panel the main space, author an arrangement and reference it
from a View. The retired `primaryPanel`, `focusByDefault` and `focusLabel`
mechanism is not applied when a reader or workbench loads a document.

The offline converter preserves the old Home/Data flow choices as real named
arrangements and canonical View references. Home hides the diagram and docks
step controls to the panel when supported. **Data flow is now an ordinary View;
the collapsible graph below Home is intentionally removed.** Both Views share
one set of nodes, panels, steps and paths.

## Personal or company diagrams

Run these commands from this repository, replacing `/path/to/story.json` with
your file. Keep the original as your backup. Output must be a new path; the tool
refuses to overwrite any existing file, including its input.

```sh
python3 tools/build.py
node tools/migrate-panel-views.cjs /path/to/story.json --check
node tools/migrate-panel-views.cjs /path/to/story.json --output /path/to/story.explicit.json
node tools/validate.js /path/to/story.explicit.json
python3 tools/inject.py /path/to/story.explicit.json template/flowview.html /path/to/story.explicit.html
```

Open `workbench/flowspec.html` in a desktop browser and import the new JSON.
Check both Views, the opening choice, each alternate path, panel state and step
navigation. Save and reopen the JSON. Open the rebuilt HTML and check your
published fragment links before replacing the published version. Arrange can
adjust the generated panel size or docking; View settings choose the opening
View. Confluence snapshots should be re-exported from the converted file; stored
legacy macro focus settings no longer override the authored View.

`--check` reports changes without writing. Conversion is deterministic and
idempotent. Invalid JSON/specs fail before output creation. Inputs are bounded
to 16 MiB. Reports list changed sections, View IDs and any arrangement alias
mapping. Existing canonical View IDs and defaults are retained. Implicit View
IDs such as `section-1-home` are made explicit with the same IDs. Existing authored arrangement IDs `home` and `flow` remain valid, but old URL
shortcuts must be updated: `v=home` becomes `v=section-1-home` and `v=flow`
becomes `v=section-1-flow` for section 1 (use the report for other sections).
Apply the same mapping to native-host View configuration. The generic `v=flow`
fallback can select the opening Home View; it is not an intentional Data flow
destination once canonical Views exist. No panel-specific runtime alias is kept;
geometry-only `layout`/`default` member aliases become `flow` when necessary.
Bare diagrams are wrapped in `sections` to give canonical Views an owner.
Missing section IDs are assigned deterministically without replacing existing
IDs. Existing named geometry, host profiles and story content are preserved;
legacy 12-column profiles are projected to equivalent 24-column geometry.

For a custom extension that used `focusByDefault`, supply its type explicitly:

```sh
node tools/migrate-panel-views.cjs /path/to/story.json --output /path/to/story.explicit.json --focus-type my-panel
```

Repeat `--focus-type` for additional types. Built-in Home map and Data Contract
are recognized automatically, as is any explicitly declared `primaryPanel`.
Custom focus labels are unavailable after extension flags are retired; the panel
title supplies the generated name. Inspect that label before publication.

The maintained upstream starters/examples have been converted. This does not
inventory your personal or company repository: upstream `canon.json` is empty.
Use the [company integration inventory](section-layout-migration.md) to include
company Canon specs, inline diagram JSON, exported snapshots and linked content.
Do not run the conversion against historical research captures unless you intend
to update those artifacts.

GIF capture uses the authored owner View ID too: `python3 tools/export_gif.py converted.html --view section-1-flow`. Use the IDs in the migration report or your own `views` entries; a diagram arrangement ID alone is not an owner View ID.

# Tabs, sections, and Views

Tabs contain sections. A section owns its prose, diagram, nodes, edges, panels,
steps and one or more **Views**. Each View renders exactly that section. The
reader pages through Views; Standard and Explore replace the main content area.
Explore is a full canvas, not an extra diagram below the Standard page.

```json
{
  "label": "Product",
  "opening": {"section": "story", "view": "business"},
  "sections": [
    {"id":"intro", "heading":"Introduction", "text":["Independent notes"],
     "views":[{"id":"standard","name":"Reading","presentation":"standard"}]},
    {"id":"story", "heading":"Shared story", "text":["Shared notes"],
     "defaultView":"business",
     "views":[
       {"id":"business","name":"Business","presentation":"standard","layout":"business"},
       {"id":"data","name":"Data","presentation":"explore","layout":"data"}
     ],
     "diagram": {"nodes":{"service":{}}, "rows":[["service"]], "layouts":[
       {"id":"business","name":"Business arrangement","sectionLayout":{"columns":24,"default":[{"x":0,"y":0,"w":24,"h":16,"hidden":true}]}},
       {"id":"data","name":"Data arrangement","sectionLayout":{"columns":24,"default":[{"x":0,"y":0,"w":24,"h":16}]}}
     ]}}
  ]
}
```

The runnable [section Views example](../examples/section-views/section-views.spec.json) demonstrates all three pages.

The section content is stored once. Editing it updates every View of that
section. A text-only section has a usable Standard View without any diagram.
The optional `layout` references an arrangement in the same section's
`diagram.layouts`; arrangements own geometry, visibility, path/step filtering,
host profiles and Explore camera settings. **View presentation is authoritative**
over an arrangement's legacy presentation. A bare `diagram.sectionLayout` is
geometry and does not add a View.

## Identity, order and opening

View IDs are unique **within a section**, begin with a letter and contain up to
64 letters, digits, underscores or hyphens. Names are nonempty and at most 80
characters. `presentation` is required (`standard` or `explore`). A View has no
`sections` membership list. Section IDs remain document-unique; stable explicit
IDs are recommended for links and opening destinations.

Canonical page order is owner order (direct page sections, then Tabs), section
order within each owner, then that section's `views` order. Detail-only domains
are excluded. `section.defaultView` optionally selects the local choice when
navigating to that section; otherwise its first View opens. `tab.opening` or
`page.opening` optionally selects `{section,view}` as the owner's opening page;
otherwise the first section's default opens. The `section` value is its stable
ID, or its canonical heading reference when it has no ID.

Contents, Page n of m, Previous/Next, links, native navigation and preview state
retain the exact section + View identity. Header View choices belong to the
selected section. A repeated View ID in another section or Tab is independent.
Standalone links use `d=<section>&v=<view>`. Native
`navigate({section,view})` rejects a mismatched pair. Detail domains remain
available through node drilldown rather than ordinary paging.

## Desktop Workbench

The section strip selects content. **View** creates, duplicates, renames,
reorders or deletes Views within that section; it changes presentation,
arrangement and the opening destination. There is no membership editor.
Each logical edit is one Undo/Redo operation. Duplicating a View shares content
and copies its arrangement. The first diagram-visibility edit on a View with
an unspecified arrangement makes it independent. Explicit references to the
same named arrangement deliberately share arrangement edits; use **Independent
section arrangement** to separate them. Newly added sections have a Standard
View. Section duplication copies its Views and content; moving a section moves
its pages. Renaming/deleting sections repairs opening references. Deleting the
opening View selects a surviving local View; the last View cannot be deleted.

## Legacy input and explicit conversion

Reading never rewrites source. The compatibility adapter accepts tab/page-owned
Views, legacy named layouts/defaultLayout, direct sections and bare diagrams.
An old multi-section View becomes one runtime occurrence per member, retaining
its original View → member page order and old section/View links. Its original
opening View opens at that View's first member. Standard no longer stacks several
sections. `layout`/`flow` aliases and named arrangement links resolve within the
addressed section. Geometry, profiles, filters and imported topology stay intact.

The first explicit View edit converts that owner with source-field splices.
The offline command validates both input and output and never overwrites input:

```sh
python3 tools/build.py
node tools/migrate-section-views.cjs old.json --check
node tools/migrate-section-views.cjs old.json --output converted.json
```

`--dry-run` is an alias for `--check`. Add `--provider provider.json` for imported
topology. Conversion is deterministic and idempotent, keeps legacy View IDs and
arrangement links, and reports the intentional regrouping into section/View
order. It assigns stable section IDs where missing and records the exact old
opening destination. It refreshes compatibility requirements using the standard
stamper, retaining declared features and higher minimum versions; metadata-only
updates also count as changes. Malformed compatibility metadata is rejected
without changing the input. No library or diagram folder is rewritten automatically.

**Migration exception:** a section omitted from every legacy View has no
canonical page choice. Conversion refuses it with an explicit diagnostic rather
than silently exposing or deleting content. Include it in a legacy View before
conversion; mark it `detailOnly` only if it is genuinely a drilldown domain.
Malformed containers, dangling references and mixed legacy/canonical ownership
fail validation. Legacy files remain readable without conversion.

## Comments on claude.ai artifacts

Inactive Tabs and Views are hidden, so the claude.ai shell's default comment
anchoring cannot show which Tab a comment is on and cannot "Go to" a comment
on a hidden Tab or View. When publishing a standalone Flowview page as a
claude.ai artifact, declare
`capabilities: {comments: {"composer_only": true, "customAnchors": true}}`.
The page then places comment pins itself (`src/viewer/artifact-comments.js`):

- New comments are labelled Tab first (`Tab: … › View: … › section › excerpt`)
  and anchored by the shell's own positional path for the clicked element.
- A comment on the step caption is saved against the numbered step button of
  the step shown at that moment; its label keeps the caption text and its pin
  sits on that button.
- Only rendered subjects are pinned: threads on hidden Tabs or Views, and step
  threads while the diagram is in Ambient mode, are listed unplaced.
- "Go to" selects the thread's Tab and View through the normal navigation (URL
  included), expands collapsed prose, and for a step button puts the diagram
  in Step mode on that step before scrolling to it.
- Document navigation (Tab, View and Contents controls) and the stepper's
  controls (numbered step buttons, previous/play/next, Ambient/Step, path
  choices) keep working while comment mode is on.

Without that declaration — and in saved files, Backstage and Confluence, where
`window.claude` is absent — the module is inert and the shell's default
anchoring is used.

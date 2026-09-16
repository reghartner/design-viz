# Arrange a section and preview its host

Open the workbench and select **Responsive**, **Backstage**, or **Confluence**
above the preview. Host previews use adjustable content widths (1080 and 760
pixels initially). They simulate available space; they do not connect to a host
or reproduce its navigation, theme, permissions, or enclosing macro. Horizontal
scrolling lets you inspect a preview wider than your editor split.

In a section, choose **Arrange section**. Each panel and the data-flow diagram
gets a grab bar and a lower-right resize handle. Drag either handle to snap to
a twelve-column grid. Overlapping tiles move down to remain visible. Click
**Done arranging** to see the reader view. Diagram nodes and Home elements
retain their existing separate editing controls.

- A completed move or resize is one **Undo** / **Redo** operation. Escape,
  pointer cancellation, losing focus, or resizing the window cancels a drag.
  The source is unchanged until release. Render manual JSON edits before arranging.
- Tab to a grab bar and use arrow keys to move; Shift + arrows resize. Arrow
  keys on the resize handle resize directly.
- Choose an element in the arrangement controls and edit **Column**, **Row**,
  **Width**, and **Height** for precise placement or phone editing. Column and
  Row are displayed starting at 1. Width is in columns; height is in grid rows.
- **Optimize layout** saves a starting arrangement for the selected target.
  Responsive and Backstage use an eight-column main tile with supporting
  panels in four columns; without supporting panels, main tiles fill the row.
  Confluence gives the diagram and Home a full row,
  with smaller panels paired below. A declared centerpiece comes first.
- **Reset layout** removes only the selected target's arrangement. The default
  arrangement applies if one exists; otherwise the existing Home/Data flow
  presentation returns. This differs from the workspace's editor-split reset.

Layouts are saved in the spec and survive JSON, HTML and Confluence export.
The selected preview host and width are temporary workspace state. At section
widths of 640 pixels or less, tiles stack in reading order; use the numeric
controls or widen the preview to drag. Maps fit their tiles; dense panels scroll
internally. Diagram Auto / Fit width / Readable controls remain available.
Reader **Layout**, **Home**, and **Data flow** choices reuse the live widgets
and preserve the selected alternate, step and playback state.

## Spec contract

Each diagram can declare `sectionLayout`. No schema-version switch is needed.
Omitting it preserves the existing presentation.

```json
"sectionLayout": {
  "default": [
    {"panel":"home", "x":0, "y":0, "w":8, "h":12},
    {"panel":"phone", "x":8, "y":0, "w":4, "h":12},
    {"x":0, "y":12, "w":12, "h":12}
  ],
  "confluence": [
    {"panel":"home", "x":0, "y":0, "w":12, "h":12},
    {"x":0, "y":12, "w":12, "h":12},
    {"panel":"phone", "x":0, "y":24, "w":6, "h":12}
  ]
}
```

A tile without `panel` is the data-flow diagram, including its step controls.
`panel` names a declared panel ID. `x` and `y` are zero-based grid positions;
`w` and `h` are integer spans. There are twelve columns, with `x + w <= 12`,
`y` from 0 to 500, and `h` from 3 to 40. Rows are 32 pixels with an 8-pixel gap.
These are presentation coordinates, not story evidence or Home coordinates.
Unknown, duplicate, or malformed tiles produce validation warnings. The viewer
ignores invalid tiles and appends unspecified/new panels and the diagram, so
content does not silently disappear. Collisions are packed downward. Panel
rename/delete operations update all saved layouts.

Profiles are `default`, `backstage`, and `confluence`. A host uses its profile
when present, otherwise `default`, otherwise the existing layout. Editing an
inherited layout saves an independent profile; it does not alter the fallback.

The Forge app automatically selects `confluence` for both configuration and
published viewing. Its updated app bundle must be deployed by the company
integrator. The Backstage association index adds `layout=backstage` to viewer
and editor URLs. The current plugin links to this viewer; it does not embed a
new renderer inside Backstage. Standalone viewers accept `?layout=backstage`
or `?layout=confluence` (append with `&` if the URL already has a query).
The width control is for preview only; actual iframe/page width belongs to
Confluence or Backstage. Check the installed host after deployment.

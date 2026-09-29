# Delta markers

Set `delta: true` on a node, edge, or step to mark a change with a green triangle.
The **Δ ONLY** control dims unchanged diagram elements. Existing boolean-only
markers remain visual indicators and do not open empty popovers.

Add optional plain text with `deltaText` and links with `deltaLinks`:

```json
{
  "title": "Recording service",
  "delta": true,
  "deltaText": "Recordings now start after the device acknowledges the request.",
  "deltaLinks": [
    {"label": "Design decision", "url": "https://example.com/decisions/42"},
    {"label": "Implementation", "url": "https://example.com/pulls/123"}
  ]
}
```

These fields work identically on nodes, edges, and steps. Text and links are
independently optional. Links require absolute HTTP(S) URLs; omitted labels use
the URL. Text is displayed literally, including line breaks. Invalid links are
warned about and omitted. Details are retained when the delta flag is cleared.

In the workbench, select an element, enable **delta (change marker)**, and expand
**Change details (optional)**. Write a **Delta note**, paste a URL into
**Add delta link**, then optionally set its label. Changes participate in Undo/Redo.

Click a triangle with details, or focus it and press Enter/Space. Escape or the
close button returns focus to the triangle; clicking outside dismisses it. Links
open in a new tab. Step-list triangles open details separately from the numbered
playback buttons, including for steps without an edge.

See [the example](../examples/delta-markers/delta-markers.spec.json).

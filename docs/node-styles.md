# Node styles: preset card colors

Select a node and open **Inspect**. The **Icon** row holds the icon picker and,
beside it, **Icon color** (the `tint` field: the color of the icon and its chip).
The **Node style** row opens a modal that shows every preset as a rendered
sample card under the page's current skin. Click a sample, or move with the
arrow keys and press Enter, to apply it; Esc closes without a change. The first
tile, **Default · skin card**, removes the field. Each applied choice is one
Undo entry. Selecting several nodes offers the same picker and writes the style
to every selected node in one Undo entry.

The spec field is `style`, an optional token on a node:

```json
{"api": {"title": "Orders API", "sub": "gateway", "icon": "cloud", "tint": "cmd", "style": "sky"}}
```

| Token | Name | Token | Name |
|---|---|---|---|
| `slate` | Slate (neutral) | `sky` | Sky |
| `rose` | Rose | `indigo` | Indigo |
| `ember` | Ember | `violet` | Violet |
| `amber` | Amber | `magenta` | Magenta |
| `moss` | Moss | `sand` | Sand |
| `teal` | Teal | `ink` | Ink (inverted: dark card on light skins, light card on dark skins) |

One token sets the card's border, background, title and subtitle colors
together. The stylesheet carries two variants per preset: a pale variant for
the light skins (Daylight, Editorial, Pastel, Rose, Lavender, Lilac) and a
deep variant for the dark skins (Aurora, Terminal, Blueprint). Every preset
keeps title and subtitle text at WCAG AA contrast or better against its own
background in every skin, and no two presets share a background or a border.
The icon keeps its own color (`tint`), so icon color and node style combine
freely.

Step playback keeps its meaning on styled cards: a lit step node, a step tone
(`alert`, `warn`, `ok`, `dim`) and the editor's dashed selection ring all draw
over the preset. A node without `style`, and any older document, renders
exactly as before. Unknown tokens warn (`nodes.<id>.style: unknown style …`)
and render unstyled; `null` removes the field.

The same renderer and stylesheet serve the standalone viewer, the Workbench
canvas, the Backstage and Confluence readers, and the exports: the SVG export
inlines each card's computed colors, and the GIF export captures the rendered
page. Exports declare the `media.node-styles` capability for viewer
compatibility checks; a document without styled nodes declares nothing new.

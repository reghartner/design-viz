# Multiple contract blocks

Keep distinct request, response and failure payloads in one section without
merging their fields into a single table. This is section content; the tables
remain above the diagram across its named views.

1. Add a block from **Add to diagram → Contracts & page structure → Add contract
   block**. You can also click the section heading and use **+ Add contract block**.
2. Click the block heading or note. Set **Width** to half for two across, or full
   to put a block on its own row. Third and two-thirds work together too.
3. Use **Add field**, then edit the row's key, value and gloss. Clicking an existing
   row opens its own field inspector; **Edit contract block** returns to sizing.
4. **Duplicate block**, **Move earlier/later** and **Delete block** work on that
   block. **All contract blocks** returns to the section's list. Undo/Redo applies
   to each operation.

The grid fills in source order, with content-sized heights. At a section content
width of 720px or less, it stacks for readability. Widths are authored proportions,
not fixed pixels; there are no drag-resize handles in this version.

For JSON authoring, use `contracts: [...]`, with `span` equal to 4, 6, 8 or 12.
Default is 12. The existing singular `contract` stays supported and renders first
when both fields exist. Appending does not migrate old source. Explicit reordering
moves all blocks into `contracts`; old positional links may then point at a
new first card, so use stable block IDs when distributing links.

Each block's fields retain `hot`, `delta`, `link`, `revealAt` and `hideAt`. Reveals
still use the section diagram's zero-based step indexes. Code spans and fenced
code work in `g` and `note`. Title, key and example value stay literal.

Copy links select a card using `#c=section-ref&ct=block-id`. Add `&r=2` for the
second rendered field in that card. `ct` is optional for the first card/old links.
Use unique stable IDs rather than array positions for links that survive reorder.
The compatibility feature is `content.contracts`. All viewer hosts share this
implementation; regenerate old exported HTML and upgrade the Backstage package.

The [doorbell example](../examples/contract-blocks/contract-blocks.spec.json)
shows two half-width request/response blocks and a full-width failure block.
See the [authoring contract](../contract/authoring-contract.md#multiple-contract-blocks-and-widths)
for the complete fields.

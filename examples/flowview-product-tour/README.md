# Flowview · how the system works

Open [the interactive walkthrough](flowview-product-tour.html), or edit the
[spec](flowview-product-tour.spec.json) with its [coverage ledger](flowview-product-tour.ledger.md).
This tour follows the presenter's separate live-diagram demo. It explains the
process and system operation; it does not compare Standard and Explore.

| Tab | Main point | What to show |
|---|---|---|
| Start | Four alternate starting routes converge on the same reviewable project. | Choose Business story, Existing flow, HLD design, or Honeycomb trace; show the highlighted full Workbench setup, then its close detail. |
| Claude | The conversation stays in external Claude Code; the folder holds the project. | Folder setup and the explicitly illustrative YOU/CLAUDE conversation. |
| Review | Spec and ledger are proposed together; a human accepts or requests corrections. | The actual preview dialog with a seeded checkout proposal; switch Approve / Needs work. |
| Resume | Reopen the same folder and reconnect to continue the accepted project. | Actual Continue an existing agent build setup. |
| Backstage | Publish through repository review; bindings make diagrams discoverable on entities. | One Component/API Diagrams tab, then the Diagram dropdown. |
| Render | The selected spec renders with the plugin installed in Backstage. | Native viewer, section/step jumps, same-viewer expansion, and external edit handoff. |

All six chapters open in **Standard**. At 1280×800 or larger, the diagram,
screen capture, and step controls sit together on one screen. Start gives the
full setup capture its own column and uses native alternate paths for its four
starting materials. Claude, Review, and Resume show changing evidence beside
their captures. Backstage and Render give the native plugin capture the full right column. Use each **Next**
arrow to continue; Render returns to Start. On a fresh browser, dismiss the
first-visit walkthrough with **Skip**.

Backstage has **one Diagrams entity tab**, not a new entity tab for each spec.
Multiple associated specs are chosen through its **Diagram dropdown**. Each explicitly bound service gets its diagram entry on its own Component page; explicit API bindings also associate API pages. **Where this service appears** offers section and path/step jumps. Mere text mentions do not create an association. The
selected inline viewer retains the spec's own authored tabs, sections, paths and
panels. The company integration supplies authorized GitHub loaders. The company
fork serves the static Workbench; it does not host a diagram API. Local
Workbench acceptance and company repository publication are separate actions.

## Screenshot provenance

PNG originals are in [screenshots](screenshots/), embedded as data URLs in the
spec and portable HTML. No image server or network connection is needed.

- `agent-setup-context.png`, `agent-setup.png`, `select-folder.png`, `resume-folder.png`: actual built
  Flowview Workbench dialog, captured with Chromium on 2026-10-07. No folder
  permission was granted during capture. The contextual setup screenshot uses
  a capture-time orange outline on the Copy & paste control; the next step
  switches to a close capture of that same choice.
- `review-update.png`: production preview dialog and renderer with a seeded
  checkout proposal. This illustrates Current/Proposed and Commit/Discard;
  it does not claim a live Claude run or completed approval.
- `backstage-discovery.png`, `backstage-service-jumps.png`, `backstage-inline.png`, `backstage-render.png`: freshly built actual React
  plugin in the repository's local preview shell, using fictional catalog data
  and its reference adapter. Discovery is a focused capture of the entity tab,
  dropdown, selected title and actions. At the service-jump beat, the screenshot panel changes to the actual matching section/step controls. Render starts with the actual inline viewer, retains it through the inline-render beat, and switches to a capture from the same session at Expand canvas. Both captures share a square viewport; the service-jump capture includes owner/HLD context at the discovery capture’s aspect ratio. These two chapters reserve the full right column for the screenshots. This is not a company Backstage deployment, company login, or
  proof of the company GitHub loader. The fixture has one associated spec; the
  dropdown's multiple-spec behavior is verified in current plugin code.

The earlier [platform presentation](../../docs/diagrams/platform/README.md)
informed the system story and ownership boundary. Its tall historical screenshots
were not shrunk into these panels; current focused captures make the controls
readable. Claude conversation entries remain explicitly illustrative and contain
only YOU/CLAUDE tags.

## Regenerate and check

```sh
python3 tools/build.py
node tools/validate.js examples/flowview-product-tour/flowview-product-tour.spec.json
python3 examples/flowview-product-tour/build.py
```

The six graphs, content frames, panel sizes, and control positions were measured
with `tools/arrange-spec.cjs --all --rearrange --width 1280` on a temporary copy
without the single named-view wrapper, then applied to the existing Standard
views. The saved tile proportions were refined after full-page visual checks.
`build.py` embeds the spec plus [presentation.css](presentation.css) in the
portable HTML; this local framing removes repeated page prose and tightens the
grid without changing the shared renderer. Start's four native paths share the
opening screen and close detail, branch for the selected material, then rejoin
at spec/ledger drafting.

Visual checks cover all six tabs and both Review endings at 1440×900 and
1280×800. Every selected step caption and screenshot must remain in view, and
no panel content should require internal scrolling or truncate into ellipses.
Automated captures must await visible image `decode()` and settled step
transitions. Smaller browser windows can scroll.

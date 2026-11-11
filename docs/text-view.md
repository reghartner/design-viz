# Text view

The reader's **Text** button (top bar, next to Search) opens a read-only window
that shows the diagram as text: which steps touch which nodes and connections,
and every ticket, metric and log query, code reference, binding and delta attached
to them. Use it to read a step diagram as a list, to check node → metric, log and
connection links, or to copy the text into a review or a diff. Nothing in the
window edits the document.

The button can appear wherever the reader top bar appears: the standalone page,
the Workbench preview, the library reader, each compare pane and the Backstage
native viewer. The Confluence (Forge) viewer has no top bar and no Text button.

Text is the lowest-priority control in the bar. When the bar has room, the
**Text** button sits next to Search. When the bar is full, Text is the last item,
**Text view**, of the **More page actions** (⋯) menu; if the bar shows no such
menu, a ⋯ menu holding only **Text view** appears, and if there is no room even
for that, the page's own actions (Panels, Legend, Expand) move into the ⋯ menu
as they would on a slightly narrower window, with Text placed in the room that
frees. Text is hidden only on a narrow bar (670 px or less), together with
Search. An open window stays open when Text moves between the bar and the menu,
and closes when Text is hidden.

The text is built from the page the reader shows, with shared-topology imports
already resolved, when the window opens. Imported nodes and connections carry an
`imported` tag with their provider, and consumer overlays (`nodeTracking`,
`edgeTracking`, `nodeCodeRefs`, `edgeOverrides`) are included. `${variables}` in
queries are shown as written, not filled in for an environment.

## Three layouts

**Steps.** For the chosen path, one block per step in path order: number, text and
time, then the connections and nodes the step touches with their attachments,
then step-level trace rules, code references, panel changes and failures. Page-wide
log searches are listed once at the end.

```
### 2. `publish` · +1m (2026-09-24 · 22:31) · changed

Firmware publishes the press event.
Ingest validates it.

- edge `device->ingest` Event intake call · tickets FW-46
  - metric rate (grafana) unit req/h
- node `ingest` Event ingest · tickets BE-67, BE-70 · exists when tickets-done
  - metric errors (grafana) unit req/h · pass max 0.01 ratio of rate
  - binding component:default/event-ingest
```

**Elements.** An index table with one row per node and connection, then one sheet
per element with every attachment in full and each query written once.

```
| Element | Kind | Metrics | Trace rules | Tickets | Code refs | Steps |
|---|---|---|---|---|---|---|
| ingest | node | rate, errors, p95, traces, backlog, spans | 1 | BE-67, BE-70 | 1 | happy/2, happy/3, happy/4 |
| platform::api | node · imported | rate, errors | 0 | PLAT-5, PLAT-7 | 1 | happy/4 |

| Metric | Source | Unit | Pass rule |
|---|---|---|---|
| errors | grafana | req/h | max 0.01 ratio of rate |

- `errors`
  - query: `sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600`
```

**Flat lines.** One fact per line, `<owner kind> <owner id> <fact> <value>`, sorted.
A whole query is one line, and the order and wording are stable, so two versions of
a spec give a small line diff.

```
node delivery/ingest metric.errors.query grafana sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events",code=~"5.."}[5m]))*3600
node delivery/ingest ticket BE-67
node delivery/platform::api origin imported tv-platform core as platform
page logsearch.camera-model.query loki-main {app="device-gateway",env="${env}"} |= "camera_model" | json | camera_model="$value"
```

## Controls

- **Path** (Steps, when the diagram has more than one path): starts on the path the
  reader is showing.
- **Queries: names / full** (Steps only, default names): names shows
  `errors (grafana) unit req/h`; full adds every query and log-signal field.
  Elements and Flat lines always show full queries.
- **Wrap lines** (default off): off, long lines scroll sideways inside the text
  block; on, they wrap.
- **Copy Markdown** (Steps, Elements) or **Copy lines** (Flat lines) copies the
  open tab. The copy always carries full queries, whatever the Queries switch
  shows. If the browser refuses the clipboard or has none, the text appears in a
  field below the controls to copy by hand.
- **Escape** (while the window has focus) or **×** closes the window and returns
  focus to the Text button. An open zoom or theme menu closes first.
- Text and Search are never open together: opening one closes the other.
- The tab and switches are remembered until the page is reloaded, and the chosen
  path while the same document is shown. When the Workbench preview redraws after
  an edit, an open window reopens on the same tab and scroll position with the
  new text.

## Command line and `git diff`

`node tools/spec-text.js <spec.json> [--format flat|steps|elements]` prints the same
text (default `flat`). It resolves imports from a registry beside the spec, in the
working directory or at the git root; `node tools/spec-text.js --help` lists every
option. To see spec changes as flat-line diffs:

```
git config diff.flowview.textconv "node tools/spec-text.js --no-resolve-imports"
echo '*.spec.json diff=flowview' >> .git/info/attributes
```

`--no-resolve-imports` gives both sides of the diff the same unresolved form, because
git hands the old version to the tool as a temporary file where no registry is found.

Not printed: page protocols (the legend), diagram panel definitions (only steps'
panel patches and visibility are), group definitions (a node's group name is),
section prose, and layout fields (positions, ports, sizes, colours, icons). An
empty text diff does not mean an unchanged spec.
